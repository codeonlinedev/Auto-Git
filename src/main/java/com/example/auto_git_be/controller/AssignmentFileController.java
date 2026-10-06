package com.example.auto_git_be.controller;

import com.example.auto_git_be.service.R2CodeStorageService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/assignments")
@RequiredArgsConstructor
public class AssignmentFileController {

    private final R2CodeStorageService r2CodeStorageService;

    /**
     * Lấy danh sách file đề bài (teacher)
     * GET /api/assignments/{code}/teacher/files
     */
    @GetMapping("/{code}/teacher/files")
    public ResponseEntity<Map<String, Object>> getTeacherFiles(@PathVariable String code) {
        List<String> files = r2CodeStorageService.listTeacherFiles(code);
        Map<String, Object> response = new HashMap<>();
        response.put("assignmentCode", code);
        response.put("files", files);
        return ResponseEntity.ok(response);
    }

    /**
     * Lấy danh sách file sinh viên
     * GET /api/assignments/{code}/students/{studentId}/files
     */
    @GetMapping("/{code}/students/{studentId}/files")
    public ResponseEntity<Map<String, Object>> getStudentFiles(
            @PathVariable String code,
            @PathVariable Long studentId) {
        List<String> files = r2CodeStorageService.listStudentFiles(code, studentId);
        Map<String, Object> response = new HashMap<>();
        response.put("assignmentCode", code);
        response.put("studentId", studentId);
        response.put("files", files);
        return ResponseEntity.ok(response);
    }

    /**
     * Download nội dung 1 file cụ thể
     * GET /api/assignments/files/content?key=assignments/xxx/teacher/task1.cpp
     */
    @GetMapping("/files/content")
    public ResponseEntity<Map<String, String>> getFileContent(@RequestParam("key") String key) {
        String content = r2CodeStorageService.downloadCode(key);
        Map<String, String> response = new HashMap<>();
        response.put("key", key);
        response.put("content", content);
        return ResponseEntity.ok(response);
    }

    /**
     * Nộp code sinh viên
     * POST /api/assignments/{code}/students/{studentId}/submit
     */
    @PostMapping("/{code}/students/{studentId}/submit")
    public ResponseEntity<Map<String, Object>> submitCode(
            @PathVariable String code,
            @PathVariable Long studentId,
            @RequestBody Map<String, String> body) {
        String fileName = body.getOrDefault("fileName", "task1.cpp");
        String content = body.getOrDefault("content", "");

        String key = r2CodeStorageService.uploadStudentCode(code, studentId, fileName, content);

        Map<String, Object> response = new HashMap<>();
        response.put("success", true);
        response.put("key", key);
        response.put("message", "Code submitted successfully");
        return ResponseEntity.ok(response);
    }
}