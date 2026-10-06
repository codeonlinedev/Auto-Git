package com.example.auto_git_be.service;

import com.example.auto_git_be.dto.assignment.AssignmentTaskCreateRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class R2CodeStorageService {

    private final R2StorageService r2StorageService;

    private static final String ROOT_PREFIX = "assignments";

    /**
     * Tạo folder cho assignment (tương đương createRepository)
     * R2 không có khái niệm folder thật, nên chỉ cần upload 1 file placeholder
     */
    public String createAssignmentFolder(String assignmentCode, String title) {
        String folderPath = ROOT_PREFIX + "/" + assignmentCode;
        String placeholderKey = folderPath + "/.keep";
        String content = "Assignment: " + title + "\nCreated at: " + System.currentTimeMillis();
        r2StorageService.uploadFile(placeholderKey, content.getBytes(StandardCharsets.UTF_8), "text/plain");
        log.info("Created R2 assignment folder: {}", folderPath);
        return folderPath;
    }

    /**
     * Tạo các file task trong folder teacher
     * (tương đương createMultipleFilesInRepo)
     */
    public void createTaskFiles(String assignmentCode, List<AssignmentTaskCreateRequest> tasks) {
        String teacherPrefix = ROOT_PREFIX + "/" + assignmentCode + "/teacher/";

        for (int i = 0; i < tasks.size(); i++) {
            AssignmentTaskCreateRequest task = tasks.get(i);
            int orderNo = task.getOrderNo() != null ? task.getOrderNo() : (i + 1);
            String fileName = "task" + orderNo + ".cpp";

            String template = "#include <iostream>\n" +
                    "using namespace std;\n\n" +
                    "int main() {\n" +
                    "    // Your code here for task " + orderNo + "\n" +
                    "    return 0;\n" +
                    "}\n";

            r2StorageService.uploadFile(
                    teacherPrefix + fileName,
                    template.getBytes(StandardCharsets.UTF_8),
                    "text/x-c++src"
            );
            log.info("Uploaded task file: {}{}", teacherPrefix, fileName);
        }
    }

    /**
     * Tạo folder cho sinh viên
     * (tương đương createBranch cho student)
     */
    public String createStudentFolder(String assignmentCode, Long studentId) {
        String studentPrefix = ROOT_PREFIX + "/" + assignmentCode + "/students/" + studentId + "/";
        String placeholderKey = studentPrefix + ".keep";
        r2StorageService.uploadFile(
                placeholderKey,
                "Student folder".getBytes(StandardCharsets.UTF_8),
                "text/plain"
        );
        log.info("Created R2 student folder: {}", studentPrefix);
        return studentPrefix;
    }

    /**
     * Upload code sinh viên
     * (tương đương pushStudentCode)
     */
    public String uploadStudentCode(String assignmentCode, Long studentId, String fileName, String code) {
        String key = ROOT_PREFIX + "/" + assignmentCode + "/students/" + studentId + "/" + fileName;
        r2StorageService.uploadFile(key, code.getBytes(StandardCharsets.UTF_8), "text/x-c++src");
        log.info("Uploaded student code: {}", key);
        return key;
    }

    /**
     * Download code sinh viên
     */
    public String downloadCode(String key) {
        byte[] content = r2StorageService.downloadFile(key);
        return new String(content, StandardCharsets.UTF_8);
    }

    /**
     * Liệt kê file của sinh viên
     */
    public List<String> listStudentFiles(String assignmentCode, Long studentId) {
        String prefix = ROOT_PREFIX + "/" + assignmentCode + "/students/" + studentId + "/";
        return r2StorageService.listFiles(prefix);
    }

    /**
     * Liệt kê file đề bài (teacher)
     */
    public List<String> listTeacherFiles(String assignmentCode) {
        String prefix = ROOT_PREFIX + "/" + assignmentCode + "/teacher/";
        return r2StorageService.listFiles(prefix);
    }

    /**
     * Xóa folder assignment
     * (tương đương deleteRepository)
     */
    public void deleteAssignmentFolder(String assignmentCode) {
        String prefix = ROOT_PREFIX + "/" + assignmentCode + "/";
        List<String> files = r2StorageService.listFiles(prefix);

        for (String key : files) {
            try {
                r2StorageService.deleteFile(key);
            } catch (Exception e) {
                log.warn("Failed to delete file {}: {}", key, e.getMessage());
            }
        }
        log.info("Deleted R2 assignment folder: {} ({} files)", prefix, files.size());
    }

    /**
     * Đếm số file sinh viên đã nộp
     * (tương đương getCommitCount)
     */
    public int countStudentFiles(String assignmentCode, Long studentId) {
        return listStudentFiles(assignmentCode, studentId).size();
    }

    /**
     * Trả về token giả (để tương thích DTO cũ)
     * R2 không cần token trả cho frontend vì backend proxy
     */
    public String getToken() {
        return "";
    }
}