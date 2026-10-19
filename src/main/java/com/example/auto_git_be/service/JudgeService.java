package com.example.auto_git_be.service;

import com.example.auto_git_be.dto.execute.*;
import com.example.auto_git_be.entity.*;
import com.example.auto_git_be.repository.*;
import com.example.auto_git_be.utils.Language;
import java.nio.file.Paths;
import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.WebClientResponseException;

import java.io.IOException;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import java.util.stream.IntStream;

@Service
@RequiredArgsConstructor
@Slf4j
public class JudgeService {

    private static final long POLLING_INTERVAL_MS = 300;

    private final WebClient judgeWebClient;
    private final AssignmentRepository assignmentRepository;
    private final AssignmentTaskRepository assignmentTaskRepository;
    private final TestCaseRepository testCaseRepository;
    private final LocalCacheService localCacheService;
    private final StudentAssignmentRepository studentAssignmentRepository;
    private final StudentTaskResultRepository studentTaskResultRepository;
    private final GitHubService gitHubService;
    private final R2CodeStorageService r2CodeStorageService;
    private final CloudflareJudgeService cloudflareJudgeService;

    @Value("${judge.provider:judge0}")
    private String judgeProvider;

    @Value("${judge0.polling.max-wait-ms:60000}")
    private long judge0MaxWaitMs;

    public ExecuteResponse runTests(ExecuteRequest request) {
    // Chọn provider dựa trên config
    if ("cloudflare".equalsIgnoreCase(judgeProvider)) {
        return runTestsWithCloudflare(request);
    }
    return runTestsWithJudge0(request);
}

/**
 * Chạy test với Judge0 (local) — code cũ
 */
private ExecuteResponse runTestsWithJudge0(ExecuteRequest request) {
    int langId = Language.getIdByName(request.getLanguage());

    Assignment assignment = assignmentRepository.findByAssignmentCode(request.getAssignmentCode())
            .orElseThrow(() -> new RuntimeException("Assignment not found"));

    AssignmentTask task = assignmentTaskRepository.findByAssignmentAndOrderNo(assignment, request.getTaskOrderNo())
            .orElseThrow(() -> new RuntimeException("Assignment task not found"));

    List<TestCase> exampleTestCases = testCaseRepository.findByAssignmentTaskAndIsSampleTrue(task);
    List<Judge0IndividualDTO> submissions = exampleTestCases.stream()
            .map(tc -> new Judge0IndividualDTO(
                    request.getSourceCode(),
                    langId,
                    tc.getInputContent(),
                    tc.getOutputContent()
            )).toList();

    if (submissions.isEmpty()) {
        ExecuteResponse response = new ExecuteResponse();
        response.setResults(new ArrayList<>());
        return response;
    }

    Judge0BatchRequest payload = new Judge0BatchRequest(submissions);

    List<Judge0TokenResponse> tokenList;

    try {
        tokenList = judgeWebClient.post()
                .uri("/submissions/batch?base64_encoded=false")
                .bodyValue(payload)
                .retrieve()
                .bodyToFlux(Judge0TokenResponse.class)
                .collectList()
                .block();

    } catch (WebClientResponseException.UnprocessableEntity e) {
        System.err.println(e.getResponseBodyAsString());
        throw new RuntimeException("Lỗi gọi judge0");
    } catch (Exception e) {
        throw new RuntimeException("Lỗi gọi Judge0");
    }

    if (tokenList == null || tokenList.isEmpty()) {
        throw new RuntimeException("Lỗi: Không nhận được token từ hệ thống chấm bài.");
    }

    String tokens = tokenList.stream()
            .map(Judge0TokenResponse::getToken)
            .collect(Collectors.joining(","));

    Judge0BatchResponse resultPayload = fetchResultsWithPolling(tokens);

    if (resultPayload == null || resultPayload.getSubmissions() == null) {
        throw new RuntimeException("Lỗi: Không thể lấy kết quả từ Judge0.");
    }

    List<Judge0ResultDTO> judgeSubmissions = resultPayload.getSubmissions();

    List<TestResultDTO> finalResults = IntStream.range(0, judgeSubmissions.size())
            .mapToObj(i -> {
                Judge0ResultDTO res = judgeSubmissions.get(i);
                TestCase originalTc = exampleTestCases.get(i);

                return TestResultDTO.builder()
                        .statusId(res.getStatus() != null ? res.getStatus().getId() : 0)
                        .statusDescription(res.getStatus() != null ? res.getStatus().getDescription() : "Unknown")
                        .stdout(res.getStdout())
                        .time(res.getTime())
                        .memory(res.getMemory())
                        .stderr(res.getStderr())
                        .stdin(originalTc.getInputContent())
                        .build();
            })
            .toList();

    return new ExecuteResponse(finalResults);
}

/**
 * Chạy test với Cloudflare Worker
 */
private ExecuteResponse runTestsWithCloudflare(ExecuteRequest request) {
    Assignment assignment = assignmentRepository.findByAssignmentCode(request.getAssignmentCode())
            .orElseThrow(() -> new RuntimeException("Assignment not found"));

    AssignmentTask task = assignmentTaskRepository.findByAssignmentAndOrderNo(assignment, request.getTaskOrderNo())
            .orElseThrow(() -> new RuntimeException("Assignment task not found"));

    List<TestCase> exampleTestCases = testCaseRepository.findByAssignmentTaskAndIsSampleTrue(task);

    if (exampleTestCases.isEmpty()) {
        ExecuteResponse response = new ExecuteResponse();
        response.setResults(new ArrayList<>());
        return response;
    }

    String cfLanguage = mapToCloudflareLanguage(request.getLanguage());
    List<TestResultDTO> finalResults = new ArrayList<>();

    for (TestCase tc : exampleTestCases) {
        try {
            CloudflareJudgeResponse cfResponse = cloudflareJudgeService.execute(
                    cfLanguage,
                    request.getSourceCode(),
                    tc.getInputContent()
            );

          // Map Cloudflare response → TestResultDTO
int statusId = 3;  // Mặc định Accepted
String statusDesc = "Accepted";

// Kiểm tra TLE từ Worker (exit code 124 = timeout, 137 = SIGKILL)
if (cfResponse.getExitCode() != null 
        && (cfResponse.getExitCode() == 124 || cfResponse.getExitCode() == 137)) {
    statusId = 5;  // Time Limit Exceeded
    statusDesc = "Time Limit Exceeded";
}
else if (cfResponse.getExitCode() != null && cfResponse.getExitCode() != 0) {
    // Có lỗi compile hoặc runtime
    if (cfResponse.getStdout() == null || cfResponse.getStdout().isEmpty()) {
        statusId = 6;  // Compilation Error
        statusDesc = "Compilation Error";
    } else {
        statusId = 11;  // Runtime Error
        statusDesc = "Runtime Error";
    }
} else {
    // So sánh output
    String actual = cfResponse.getStdout() != null ? cfResponse.getStdout().trim() : "";
    String expected = tc.getOutputContent() != null ? tc.getOutputContent().trim() : "";
    if (!actual.equals(expected)) {
        statusId = 4;  // Wrong Answer
        statusDesc = "Wrong Answer";
    }
}

            finalResults.add(TestResultDTO.builder()
                    .statusId(statusId)
                    .statusDescription(statusDesc)
                    .stdout(cfResponse.getStdout())
                    .time(null)  // Cloudflare không trả time
                    .memory(null)  // Cloudflare không trả memory
                    .stderr(cfResponse.getStderr())
                    .stdin(tc.getInputContent())
                    .build());

       } catch (Exception e) {
    String msg = e.getMessage() != null ? e.getMessage() : "";
    log.error("Cloudflare runTests error: {}", msg);

    boolean isTimeout = msg.startsWith("TIMEOUT:")
            || msg.contains("timeout")
            || msg.contains("Timeout");

    finalResults.add(TestResultDTO.builder()
            .statusId(isTimeout ? 5 : 13)  // 5 = TLE, 13 = Internal Error
            .statusDescription(isTimeout ? "Time Limit Exceeded" : "Internal Error")
            .stdout(null)
            .stderr(msg)
            .stdin(tc.getInputContent())
            .build());
}
    }

    return new ExecuteResponse(finalResults);
}

    @Transactional
    public SubmitResponse submitCodeForStudent(Student student, SubmitRequest request) throws IOException {
        Assignment assignment = assignmentRepository.findByAssignmentCode(request.getAssignmentCode())
                .orElseThrow(() -> new EntityNotFoundException("Không tìm thấy Assignment: " + request.getAssignmentCode()));

        rejectStudentSubmitIfDeadlinePassed(assignment);

        AssignmentTask task = assignmentTaskRepository.findByAssignmentAndOrderNo(assignment, request.getTaskOrderNo())
                .orElseThrow(() -> new EntityNotFoundException("Không tìm thấy Task số " + request.getTaskOrderNo()));

        StudentAssignment studentAssignment = studentAssignmentRepository.findByStudentAndAssignment(student, assignment)
                .orElseThrow(() -> new EntityNotFoundException("Assignment not found"));

        // Bước 1: Upload code lên R2 (thay thế GitHub)
        String fileName = request.getFilePath() != null
                ? Paths.get(request.getFilePath()).getFileName().toString()
                : "task" + request.getTaskOrderNo() + ".cpp";

        String r2Key = r2CodeStorageService.uploadStudentCode(
                assignment.getAssignmentCode(),
                student.getId(),
                fileName,
                request.getSourceCode()
        );
        log.info("Uploaded student code to R2: {}", r2Key);
        studentAssignment.setCommitCount(
        (studentAssignment.getCommitCount() != null ? studentAssignment.getCommitCount() : 0) + 1
);
studentAssignment.setLastCommitAt(LocalDateTime.now());
studentAssignmentRepository.save(studentAssignment);
log.info("Updated student assignment: commitCount={}, lastCommitAt={}",
        studentAssignment.getCommitCount(), studentAssignment.getLastCommitAt());
        

        // Bước 2: Chấm điểm bằng Judge0 (nếu có)
        int passed = 0;
        int total = 1;
        Double time = 0.0;
        int memory = 0;
        String finalStatus = "Submitted";
        String finalErrorMessage = null;
        double score = 0.0;

        try {
            EvaluationResult evalResult = executeJudge0Evaluation(task, request.getLanguage(), request.getSourceCode());
            passed = evalResult.getPassed();
            total = evalResult.getTotal();
            time = evalResult.getMaxTime();
            memory = evalResult.getMaxMemory();
            finalStatus = evalResult.getOverallStatus();
            finalErrorMessage = evalResult.getErrorMessage();
            score = (double) passed / total * 10;
        } catch (Exception e) {
            log.warn("Judge0 not available, skipping grading: {}", e.getMessage());
            finalStatus = "Pending - Judge0 not available";
            finalErrorMessage = e.getMessage();
        }

        // Bước 3: Lưu kết quả vào database
        StudentTaskResult taskResult = StudentTaskResult.builder()
                .studentAssignment(studentAssignment)
                .assignmentTask(task)
                .language(request.getLanguage())
                .score(score)
                .pass(passed)
                .total(total)
                .status(finalStatus)
                .commitHash(r2Key)  // Lưu R2 key thay vì commit hash
                .sourceCode(request.getSourceCode())
                .time(time)
                .memory(memory)
                .errorMessage(finalErrorMessage)
                .build();

        studentTaskResultRepository.save(taskResult);
        double assignmentScore = updateStudentAssignmentScore(studentAssignment, taskResult);

        return SubmitResponse.builder()
                .score(score)
                .assignmentScore(assignmentScore)
                .passedTestCases(passed)
                .totalTestCases(total)
                .status(finalStatus)
                .time(time)
                .memory(memory)
                .errorMessage(finalErrorMessage)
                .build();
    }

    public SubmitResponse submitCodeForTeacher(SubmitRequest request) throws IOException {
        Assignment assignment = assignmentRepository.findByAssignmentCode(request.getAssignmentCode())
                .orElseThrow(() -> new EntityNotFoundException("Không tìm thấy Assignment: " + request.getAssignmentCode()));

        AssignmentTask task = assignmentTaskRepository.findByAssignmentAndOrderNo(assignment, request.getTaskOrderNo())
                .orElseThrow(() -> new EntityNotFoundException("Không tìm thấy Task‘ " + request.getTaskOrderNo()));

        EvaluationResult evalResult = executeJudge0Evaluation(task, request.getLanguage(), request.getSourceCode());
        int passed = evalResult.getPassed();
        int total = evalResult.getTotal();
        Double time = evalResult.getMaxTime();
        int memory = evalResult.getMaxMemory();
        String finalStatus = evalResult.getOverallStatus();
        String finalErrorMessage = evalResult.getErrorMessage();

        double score = (double) passed / total * 10;

             String fileName = request.getFilePath() != null
                ? Paths.get(request.getFilePath()).getFileName().toString()
                : "task" + request.getTaskOrderNo() + ".cpp";

        r2CodeStorageService.uploadStudentCode(
                assignment.getAssignmentCode(),
                0L,  // Teacher folder — dùng studentId = 0
                fileName,
                request.getSourceCode()
        );

        return SubmitResponse.builder()
                .score(score)
                .assignmentScore(score)
                .passedTestCases(passed)
                .totalTestCases(total)
                .status(finalStatus)
                .time(time)
                .memory(memory)
                .errorMessage(finalErrorMessage)
                .build();
    }

    private void rejectStudentSubmitIfDeadlinePassed(Assignment assignment) {
        LocalDateTime deadline = assignment.getDeadline();
        if (deadline != null && LocalDateTime.now().isAfter(deadline)) {
            throw new IllegalArgumentException("Đã quá deadline, không thể nộp bài nữa.");
        }
    }

    private double updateStudentAssignmentScore(StudentAssignment studentAssignment, StudentTaskResult latestTaskResult) {
        Assignment assignment = studentAssignment.getAssignment();
        List<AssignmentTask> assignmentTasks = assignment.getTasks();
        int totalTasks = assignmentTasks == null ? 0 : assignmentTasks.size();
        if (totalTasks == 0) {
            studentAssignment.setScore(0.0);
            studentAssignmentRepository.save(studentAssignment);
            return 0.0;
        }

        List<StudentTaskResult> allResults = new ArrayList<>(studentTaskResultRepository.findByStudentAssignment(studentAssignment));
        allResults.add(latestTaskResult);

        Map<Long, Double> bestScoreByTaskId = allResults.stream()
                .filter(result -> result.getAssignmentTask() != null && result.getScore() != null)
                .collect(Collectors.groupingBy(
                        result -> result.getAssignmentTask().getId(),
                        Collectors.mapping(
                                StudentTaskResult::getScore,
                                Collectors.collectingAndThen(
                                        Collectors.maxBy(Double::compareTo),
                                        maxScore -> maxScore.orElse(0.0)
                                )
                        )
                ));

        double earnedScore = assignmentTasks.stream()
                .mapToDouble(task -> bestScoreByTaskId.getOrDefault(task.getId(), 0.0))
                .sum();
        double assignmentScore = earnedScore / totalTasks;
        studentAssignment.setScore(assignmentScore);
        studentAssignmentRepository.save(studentAssignment);
        return assignmentScore;
    }
    /**
     * Entry point chấm bài — chọn provider dựa trên config
     */
    private EvaluationResult executeJudge0Evaluation(AssignmentTask task, String language, String sourceCode) {
        if ("cloudflare".equalsIgnoreCase(judgeProvider)) {
            return executeCloudflareEvaluation(task, language, sourceCode);
        }
        return executeJudge0Internal(task, language, sourceCode);
    }

    /**
     * Chấm bài qua Judge0 (local)
     */
    private EvaluationResult executeJudge0Internal(AssignmentTask task, String language, String sourceCode) {
        List<TestCase> testCases = testCaseRepository.findByAssignmentTaskAndIsSampleFalse(task);
        if (testCases == null || testCases.isEmpty()) {
            throw new RuntimeException("Lỗi: Bài tập này chưa được giáo viên upload Test Case.");
        }

        int langId = Language.getIdByName(language);
        List<Judge0IndividualDTO> submissionsList = new ArrayList<>();

        for (TestCase tc : testCases) {
            String localInName = "input_" + tc.getOrdinal() + ".txt";
            String localOutName = "output_" + tc.getOrdinal() + ".txt";

            String inputContent = localCacheService.getTestcaseContent(
                    task.getId(), tc.getInputFileUrl(), localInName);

            String outputContent = localCacheService.getTestcaseContent(
                    task.getId(), tc.getOutputFileUrl(), localOutName);

            String encodedSource = Base64.getEncoder().encodeToString(sourceCode.getBytes());
            String encodedStdin = Base64.getEncoder().encodeToString(inputContent.getBytes());
            String encodedExpectedOutput = Base64.getEncoder().encodeToString(outputContent.getBytes());

            submissionsList.add(new Judge0IndividualDTO(
                    encodedSource, langId, encodedStdin, encodedExpectedOutput
            ));
        }

        Judge0BatchRequest payload = new Judge0BatchRequest(submissionsList);
        List<Judge0TokenResponse> tokenList;
        try {
            tokenList = judgeWebClient.post()
                    .uri("/submissions/batch?base64_encoded=true")
                    .bodyValue(payload)
                    .retrieve()
                    .bodyToFlux(Judge0TokenResponse.class)
                    .collectList()
                    .block();
        } catch (WebClientResponseException ex) {
            String errorBody = ex.getResponseBodyAsString();
            throw new RuntimeException("Judge0 trả về lỗi " + ex.getStatusCode() + " - Chi tiết: " + errorBody, ex);
        }

        if (tokenList == null || tokenList.isEmpty()) {
            throw new RuntimeException("Lỗi: Không nhận được token submit.");
        }

        String tokens = tokenList.stream()
                .map(Judge0TokenResponse::getToken)
                .collect(Collectors.joining(","));

        Judge0BatchResponse resultPayload = fetchResultsWithPolling(tokens);

        int passed = 0;
        double maxTime = 0.0;
        int maxMemory = 0;
        String overallStatus = "Accepted";
        String errorMessage = null;

        for (Judge0ResultDTO res : resultPayload.getSubmissions()) {
            int currentStatusId = (res.getStatus() != null) ? res.getStatus().getId() : 0;

            if (currentStatusId == 3) {
                passed++;
            } else if ("Accepted".equals(overallStatus)) {
                overallStatus = mapJudge0StatusToText(currentStatusId);

                if (currentStatusId == 6) {
                    errorMessage = res.getCompileOutput();
                } else {
                    errorMessage = res.getStderr();
                }
            }
            if (res.getTime() != null) {
                try {
                    double t = Double.parseDouble(res.getTime());
                    maxTime = Math.max(maxTime, t);
                } catch (NumberFormatException ignored) {}
            }
            if (res.getMemory() != null) {
                maxMemory = Math.max(maxMemory, res.getMemory());
            }
        }

        return EvaluationResult.builder()
                .passed(passed)
                .total(testCases.size())
                .maxTime(maxTime)
                .maxMemory(maxMemory)
                .overallStatus(overallStatus)
                .errorMessage(errorMessage)
                .build();
    }

    /**
     * Chấm bài qua Cloudflare Containers
     */
    private EvaluationResult executeCloudflareEvaluation(AssignmentTask task, String language, String sourceCode) {
        List<TestCase> testCases = testCaseRepository.findByAssignmentTaskAndIsSampleFalse(task);
        if (testCases == null || testCases.isEmpty()) {
            throw new RuntimeException("Lỗi: Bài tập này chưa được giáo viên upload Test Case.");
        }

        String cfLanguage = mapToCloudflareLanguage(language);

        int passed = 0;
        double maxTime = 0.0;
        int maxMemory = 0;
        String overallStatus = "Accepted";
        String errorMessage = null;

        long startTime = System.currentTimeMillis();

        for (TestCase tc : testCases) {
            // Reset container trước mỗi test
try {
    cloudflareJudgeService.resetContainer();
    Thread.sleep(500);
} catch (Exception e) {
    log.warn("Reset container failed: {}", e.getMessage());
}
            String localInName = "input_" + tc.getOrdinal() + ".txt";
            String localOutName = "output_" + tc.getOrdinal() + ".txt";

           String inputContent = tc.getInputContent() != null
        ? tc.getInputContent()
        : localCacheService.getTestcaseContent(task.getId(), tc.getInputFileUrl(), localInName);
String expectedOutput = tc.getOutputContent() != null
        ? tc.getOutputContent()
        : localCacheService.getTestcaseContent(task.getId(), tc.getOutputFileUrl(), localOutName);

            try {
                CloudflareJudgeResponse response = cloudflareJudgeService.execute(
                        cfLanguage, sourceCode, inputContent);
 // Kiểm tra TLE từ Worker (exit code 124 = timeout, 137 = SIGKILL)
if (response.getExitCode() != null 
        && (response.getExitCode() == 124 || response.getExitCode() == 137)) {
    overallStatus = "Time Limit Exceeded";
    errorMessage = "Chương trình chạy quá lâu (Worker timeout)";
    break;
}

                if (response.getExitCode() != null && response.getExitCode() != 0
                        && response.getStdout() != null && response.getStdout().isEmpty()) {
                    overallStatus = "Compilation Error";
                    errorMessage = response.getStderr();
                    break;
                }

                String actualOutput = response.getStdout() != null ? response.getStdout().trim() : "";
                String expectedTrimmed = expectedOutput != null ? expectedOutput.trim() : "";

                if (actualOutput.equals(expectedTrimmed)) {
                    passed++;
                } else if ("Accepted".equals(overallStatus)) {
                    overallStatus = "Wrong Answer";
                    errorMessage = "Expected: " + expectedTrimmed + "\nActual: " + actualOutput;
                }

           } catch (Exception e) {
    String msg = e.getMessage() != null ? e.getMessage() : "";
    log.error("Cloudflare evaluation error: {}", msg);

    if (msg.startsWith("TIMEOUT:") || msg.contains("timeout") || msg.contains("Timeout")) {
        overallStatus = "Time Limit Exceeded";
        errorMessage = "Chương trình chạy quá lâu, có thể bị treo vô hạn (infinite loop).";
    } else {
        overallStatus = "Runtime Error";
        errorMessage = msg;
    }
    break;
}
        }

        long durationMs = System.currentTimeMillis() - startTime;
        log.info("Cloudflare chấm xong sau {} ms, passed {}/{}", durationMs, passed, testCases.size());

        return EvaluationResult.builder()
                .passed(passed)
                .total(testCases.size())
                .maxTime(maxTime)
                .maxMemory(maxMemory)
                .overallStatus(overallStatus)
                .errorMessage(errorMessage)
                .build();
    }

    /**
     * Map language code sang tên Cloudflare Worker hỗ trợ
     */
    private String mapToCloudflareLanguage(String language) {
        if (language == null) return "cpp";
        String lower = language.toLowerCase();
        if (lower.contains("python") || lower.contains("py")) return "python";
        if (lower.contains("java")) return "java";
        return "cpp";
    }

    private Judge0BatchResponse fetchResultsWithPolling(String tokens) {
        long startTime = System.currentTimeMillis();
        long deadline = startTime + judge0MaxWaitMs;

        boolean isFinished = false;
        Judge0BatchResponse resultPayload = null;
        int pollCount = 0;

        while (System.currentTimeMillis() < deadline && !isFinished) {
            pollCount++;

            try {
                Thread.sleep(POLLING_INTERVAL_MS);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new RuntimeException("Tiến trình chờ bị gián đoạn", e);
            }

            resultPayload = judgeWebClient.get()
                    .uri(uriBuilder -> uriBuilder
                            .path("/submissions/batch")
                            .queryParam("tokens", tokens)
                            .queryParam("base64_encoded", false)
                            .queryParam("fields",
                                    "status_id,stdout,time,memory,stderr,status,compile_output")
                            .build())
                    .retrieve()
                    .onStatus(HttpStatusCode::isError, response ->
                            response.bodyToMono(String.class)
                                    .map(body -> new RuntimeException("Judge0 error: " + body))
                    )
                    .bodyToMono(Judge0BatchResponse.class)
                    .block();

            if (resultPayload != null && resultPayload.getSubmissions() != null) {
                boolean stillProcessing = resultPayload.getSubmissions().stream()
                        .anyMatch(sub -> {
                            int currentStatus = sub.getStatus() != null
                                    ? sub.getStatus().getId()
                                    : sub.getStatusId();

                            return currentStatus == 1 || currentStatus == 2;
                        });

                isFinished = !stillProcessing;
            }
        }

        long durationMs = System.currentTimeMillis() - startTime;

        if (!isFinished) {
            log.warn(
                    "Judge0 timeout sau {} ms ({} s), so lan polling: {}",
                    durationMs,
                    durationMs / 1000.0,
                    pollCount
            );

            throw new RuntimeException(
                    "Loi: Server Judge0 qua tai, cham bai mat qua "
                            + (judge0MaxWaitMs / 1000)
                            + " giay."
            );
        }

        log.info(
                "Judge0 hoan thanh sau {} ms ({} s), so lan polling: {}",
                durationMs,
                durationMs / 1000.0,
                pollCount
        );

        return resultPayload;
    }

    private String mapJudge0StatusToText(int statusId) {
        return switch (statusId) {
            case 3 -> "Accepted";
            case 4 -> "Wrong Answer";
            case 5 -> "Time Limit Exceeded";
            case 6 -> "Compilation Error";
            case 7, 8, 9, 10, 11, 12 -> "Runtime Error";
            case 13 -> "Internal Error";
            case 14 -> "Exec Format Error";
            default -> "Error";
        };
    }
}
