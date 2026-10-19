package com.example.auto_git_be.service;

import com.example.auto_git_be.dto.assignment.AssignmentTaskCreateRequest;
import com.example.auto_git_be.dto.assignment.JoinAssignmentResponse;
import com.example.auto_git_be.dto.execute.TestCaseDTO;
import com.example.auto_git_be.entity.*;
import com.example.auto_git_be.repository.*;
import lombok.RequiredArgsConstructor;
import org.kohsuke.github.GHRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

@Service
@RequiredArgsConstructor
public class AssignmentService {

    private final AssignmentRepository assignmentRepository;
    private final AssignmentTaskRepository assignmentTaskRepository;
    private final TestCaseRepository testCaseRepository;
    private final StudentRepository studentRepository;
    private final StudentAssignmentRepository studentAssignmentRepository;
    private final TeacherAssignmentRepository teacherAssignmentRepository;
    private final CommentRepository commentRepository;
    private final GitHubService gitHubService;
    private final R2CodeStorageService r2CodeStorageService;
    private static final String CHARACTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    private static final int CODE_LENGTH = 8;
    private static final SecureRandom random = new SecureRandom();

    @Transactional
    public Assignment createAssignment(
            ClassRoom classRoom,
            String title,
            String description,
            LocalDateTime deadline,
            List<AssignmentTaskCreateRequest> tasks
    ) {
        try {
            String assignmentCode = generateUniqueAssignmentCode();

            String repoName = sanitizeRepoName(title + "-" + assignmentCode);
            String repoDescription = "Assignment: " + title + " for class " + classRoom.getName();

                      // Tạo folder trên R2 thay vì GitHub repo
            r2CodeStorageService.createAssignmentFolder(assignmentCode, title);
            r2CodeStorageService.createTaskFiles(assignmentCode, tasks);


                        String r2FolderPath = "assignments/" + assignmentCode;

            Assignment assignment = Assignment.builder()
                    .classRoom(classRoom)
                    .title(title)
                    .description(description)
                    .assignmentCode(assignmentCode)
                    .repoUrl("r2://" + r2FolderPath)          // Đánh dấu là R2
                    .repoName(r2FolderPath)                    // Tên folder
                    .githubRepoId(null)                        // Không dùng GitHub
                    .isActive(true)
                    .deadline(deadline)
                    .build();

            Assignment savedAssignment = assignmentRepository.save(assignment);

            List<AssignmentTask> taskEntities = buildTaskEntities(savedAssignment, tasks);

            if (!taskEntities.isEmpty()) {
                List<AssignmentTask> savedTasks = assignmentTaskRepository.saveAll(taskEntities);

                List<TestCase> testCaseEntities = new ArrayList<>();
                if (!tasks.isEmpty()) {
                    for (int i = 0; i < tasks.size(); i++) {
                        AssignmentTaskCreateRequest taskDTO = tasks.get(i);
                        AssignmentTask savedTask = savedTasks.get(i);

                        if (taskDTO.getSampleTestCases() != null && !taskDTO.getSampleTestCases().isEmpty()) {
                            List<TestCase> testCasesForThisTask = buildTestCases(savedTask, taskDTO);
                            testCaseEntities.addAll(testCasesForThisTask);
                        }
                    }
                    if (!testCaseEntities.isEmpty()) {
                        testCaseRepository.saveAll(testCaseEntities);
                    }
                }
            }
            return savedAssignment;

        } catch (Exception e) {
            throw new RuntimeException("Failed to create assignment: " + e.getMessage(), e);
        }
    }

    private List<AssignmentTask> buildTaskEntities(
            Assignment assignment,
            List<AssignmentTaskCreateRequest> tasks
    ) {
        List<AssignmentTask> taskEntities = new ArrayList<>();

        if (tasks == null || tasks.isEmpty()) {
            return taskEntities;
        }

        for (int i = 0; i < tasks.size(); i++) {
            AssignmentTaskCreateRequest task = tasks.get(i);
            String fallbackName = "Task " + (i + 1);
            int orderNo = task.getOrderNo() != null ? task.getOrderNo() : (i + 1);

            taskEntities.add(AssignmentTask.builder()
                    .assignment(assignment)
                    .taskName(task.getTaskName() == null || task.getTaskName().isBlank() ? fallbackName : task.getTaskName())
                    .description(task.getDescription())
                    .orderNo(orderNo)
                    .build());
        }

        return taskEntities;
    }

    private List<TestCase> buildTestCases(
            AssignmentTask assignmentTask,
            AssignmentTaskCreateRequest task)
    {
        List<TestCase> testCases = new ArrayList<>();
        for (TestCaseDTO testCaseDTO : task.getSampleTestCases()) {
            TestCase testCase = new TestCase();
            testCase.setOrdinal(testCaseDTO.getOrdinal());
            testCase.setInputContent(testCaseDTO.getInput());
            testCase.setOutputContent(testCaseDTO.getOutput());
            testCase.setSample(true);
            testCase.setAssignmentTask(assignmentTask);
            testCases.add(testCase);
        }
        return testCases;
    }

    public Assignment getAssignmentByCode(String assignmentCode) {
        return assignmentRepository.findByAssignmentCode(assignmentCode)
                .orElseThrow(() -> new RuntimeException("Assignment not found"));
    }
    public Assignment getAssignmentById(Long id) {
    return assignmentRepository.findById(id)
            .orElseThrow(() -> new RuntimeException("Assignment not found: " + id));
}
    public List<Assignment> getAssignmentsByClassroom(ClassRoom classRoom) {
        return assignmentRepository.findByClassRoomAndIsActive(classRoom, true);
    }

    @Transactional(readOnly = true)
    public List<AssignmentTask> getTasksByAssignment(Assignment assignment) {
        return assignmentTaskRepository.findByAssignmentOrderByOrderNoAscIdAsc(assignment);
    }

    public List<StudentAssignment> getStudentsInAssignment(Assignment assignment) {
        return studentAssignmentRepository.findByAssignment(assignment);
    }

    @Transactional
    public void deleteAssignment(String assignmentCode, User teacher) {
        try {
            Assignment assignment = getAssignmentByCode(assignmentCode);

            if (!assignment.getClassRoom().getTeacher().getId().equals(teacher.getId())) {
                throw new RuntimeException("Only the teacher who created the class can delete this assignment");
            }

            // Hard delete all comments in this assignment so FK comments(student_id) cannot block cleanup.
            commentRepository.deleteByAssignment(assignment);

            List<StudentAssignment> studentAssignments = studentAssignmentRepository.findByAssignment(assignment);
            studentAssignmentRepository.deleteAll(studentAssignments);

            List<TeacherAssignment> teacherAssignments = teacherAssignmentRepository.findByAssignment(assignment);
            teacherAssignmentRepository.deleteAll(teacherAssignments);

            assignment.setIsActive(false);
            assignmentRepository.save(assignment);

            // External cleanup should not block DB cleanup.
            try {
                r2CodeStorageService.deleteAssignmentFolder(assignment.getAssignmentCode());
            } catch (Exception r2Error) {
                System.err.println("Failed to delete R2 folder for assignment "
                        + assignment.getAssignmentCode() + ": " + r2Error.getMessage());
            }

        } catch (Exception e) {
            throw new RuntimeException("Failed to delete assignment: " + e.getMessage(), e);
        }
    }

    @Transactional
    public JoinAssignmentResponse joinAssignment(
            String assignmentCode, String localPath, User user) {
        try {

            String githubToken = r2CodeStorageService.getToken();

            Assignment assignment = getAssignmentByCode(assignmentCode);

            Student student = studentRepository.findByUserAndClassRoom(user, assignment.getClassRoom())
                    .orElseThrow(() -> new RuntimeException("You must join the class before joining assignments"));

            Optional<StudentAssignment> saOptional = studentAssignmentRepository.findByStudentAndAssignment(student, assignment);

            if (saOptional.isPresent()) {
                return JoinAssignmentResponse.builder()
                        .repoUrl(assignment.getRepoUrl())
                        .branch(saOptional.get().getBranchName())
                        .token(githubToken)
                        .studentId(student.getId().toString())
                        .assignmentTitle(assignment.getTitle())
                        .deadline(assignment.getDeadline())
                        .build();
            }

            String rawName = student.getStudentName() + "-" + student.getId();
            String sanitizedName = rawName.replaceAll("[^a-zA-Z0-9_-]", "_").toLowerCase();
            String branchName = "student-" + sanitizedName;

            r2CodeStorageService.createStudentFolder(assignmentCode, student.getId());
	    r2CodeStorageService.copyTeacherFilesToStudent(assignmentCode, student.getId());
                        StudentAssignment studentAssignment = StudentAssignment.builder()
                    .student(student)
                    .assignment(assignment)
                    .branchName(branchName)
                    .localPath(localPath != null && !localPath.trim().isEmpty() ? localPath : null)
                    .commitCount(0)
                    .build();

            try {
                studentAssignmentRepository.save(studentAssignment);
            } catch (org.springframework.dao.DataIntegrityViolationException dupEx) {
                // Race condition: request khác đã insert trước → lấy bản ghi cũ
                StudentAssignment existing = studentAssignmentRepository
                        .findByStudentAndAssignment(student, assignment)
                        .orElseThrow(() -> dupEx);

                return JoinAssignmentResponse.builder()
                        .repoUrl(assignment.getRepoUrl())
                        .branch(existing.getBranchName())
                        .token(githubToken)
                        .studentId(student.getId().toString())
                        .assignmentTitle(assignment.getTitle())
                        .deadline(assignment.getDeadline())
                        .build();
            }

            return JoinAssignmentResponse.builder()
                    .repoUrl(assignment.getRepoUrl())
                    .branch(branchName)
                    .token(githubToken)
                    .studentId(student.getId().toString())
                    .assignmentTitle(assignment.getTitle())
                    .deadline(assignment.getDeadline())
                    .build();

        } catch (Exception e) {
            throw new RuntimeException("Failed to join assignment: " + e.getMessage(), e);
        }
    }

    private String generateUniqueAssignmentCode() {
        String code;
        do {
            code = generateRandomCode();
        } while (assignmentRepository.existsByAssignmentCode(code));
        return code;
    }

    private String generateRandomCode() {
        StringBuilder code = new StringBuilder(CODE_LENGTH);
        for (int i = 0; i < CODE_LENGTH; i++) {
            code.append(CHARACTERS.charAt(random.nextInt(CHARACTERS.length())));
        }
        return code.toString();
    }

    private String sanitizeRepoName(String name) {
        return name.toLowerCase()
                .replaceAll("[^a-z0-9-_]", "-")
                .replaceAll("-+", "-")
                .replaceAll("^-|-$", "");
    }
}

