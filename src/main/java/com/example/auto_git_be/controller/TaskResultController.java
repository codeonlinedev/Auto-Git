package com.example.auto_git_be.controller;

import com.example.auto_git_be.dto.assignment.TaskDTO;
import com.example.auto_git_be.dto.assignment.TaskResultRequest;
import com.example.auto_git_be.dto.assignment.TaskResultResponse;
import com.example.auto_git_be.entity.Assignment;
import com.example.auto_git_be.entity.ClassRoom;
import com.example.auto_git_be.entity.Student;
import com.example.auto_git_be.entity.User;
import com.example.auto_git_be.service.AssignmentService;
import com.example.auto_git_be.service.AuthService;
import com.example.auto_git_be.service.StudentService;
import com.example.auto_git_be.service.TaskResultService;
import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/result")
@RequiredArgsConstructor
public class TaskResultController {

    private final AuthService authService;
    private final AssignmentService assignmentService;
    private final StudentService studentService;
    private final TaskResultService taskResultService;
    @PostMapping("/task")
public ResponseEntity<TaskResultResponse> getTaskResult(
        @RequestBody TaskResultRequest taskResultRequest,
        @RequestHeader(value = "Authorization", required = false) String authHeader) {

    // 1. Validate auth header
    if (authHeader == null || !authHeader.startsWith("Bearer ")) {
        return ResponseEntity.status(401).build();
    }

    String token = authHeader.substring(7);
    User user;
    try {
        user = authService.getUserFromToken(token);
    } catch (Exception e) {
        return ResponseEntity.status(401).build();
    }

    // 2. Lấy assignment
    Assignment assignment;
    try {
        assignment = assignmentService.getAssignmentByCode(taskResultRequest.getAssignmentCode());
    } catch (RuntimeException e) {
        return ResponseEntity.notFound().build();
    }

    ClassRoom classRoom = assignment.getClassRoom();
    Long studentId = taskResultRequest.getStudentId();
    Student student;

    if (studentId == null) {
        // SV tự xem kết quả của mình
        student = studentService.findByUserAndClassRoom(user, classRoom)
                .orElseThrow(() -> new EntityNotFoundException(
                        "Bạn không phải sinh viên của lớp này"));
    } else {
        // Xem kết quả của SV khác — check quyền
        boolean isTeacher = classRoom.getTeacher().getId().equals(user.getId());
        boolean isSameStudent = studentService.findByUserAndClassRoom(user, classRoom)
                .map(s -> s.getId().equals(studentId))
                .orElse(false);

        if (!isTeacher && !isSameStudent) {
            return ResponseEntity.status(403).build();
        }

        student = studentService.findById(studentId);
    }

    TaskResultResponse taskResultResponse = taskResultService
            .getTaskResults(student, taskResultRequest.getAssignmentCode());
    return ResponseEntity.ok(taskResultResponse);
}
}
