package com.example.auto_git_be.controller;

import com.example.auto_git_be.dto.execute.ExecuteRequest;
import com.example.auto_git_be.dto.execute.ExecuteResponse;
import com.example.auto_git_be.dto.execute.SubmitRequest;
import com.example.auto_git_be.dto.execute.SubmitResponse;
import com.example.auto_git_be.entity.Assignment;
import com.example.auto_git_be.entity.ClassRoom;
import com.example.auto_git_be.entity.Student;
import com.example.auto_git_be.entity.User;
import com.example.auto_git_be.repository.AssignmentRepository;
import com.example.auto_git_be.repository.StudentRepository;
import com.example.auto_git_be.service.AuthService;
import com.example.auto_git_be.service.JudgeService;
import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;

@RestController
@RequestMapping("api/judge")
@RequiredArgsConstructor
public class JudgeController {

    private final AuthService authService;
    private final JudgeService judgeService;
    private final StudentRepository studentRepository;
    private final AssignmentRepository assignmentRepository;

   @PostMapping("/run")
public ResponseEntity<ExecuteResponse> runCode(
        @RequestBody ExecuteRequest request,
        @RequestHeader("Authorization") String authHeader) {
    String token = authHeader.substring(7);
    User user = authService.getUserFromToken(token);

    // Check user có quyền với assignment không
    Assignment assignment = assignmentRepository
            .findByAssignmentCode(request.getAssignmentCode())
            .orElseThrow(() -> new EntityNotFoundException("Assignment not found"));

    ClassRoom classRoom = assignment.getClassRoom();
    boolean hasAccess = false;

    if (user.getRole() == User.UserRole.TEACHER) {
        hasAccess = classRoom.getTeacher().getId().equals(user.getId());
    } else if (user.getRole() == User.UserRole.STUDENT) {
        hasAccess = studentRepository.findByUserAndClassRoom(user, classRoom).isPresent();
    }

    if (!hasAccess) {
        return ResponseEntity.status(403).build();
    }

    ExecuteResponse response = judgeService.runTests(request);
    return ResponseEntity.ok(response);
}

    @PostMapping("/submit")
    public ResponseEntity<SubmitResponse> submitCode(
            @RequestBody SubmitRequest request,
            @RequestHeader("Authorization" ) String authHeader
    ) throws IOException {
        String token = authHeader.substring(7);
        User user = authService.getUserFromToken(token);

        Assignment assignment = assignmentRepository.findByAssignmentCode(request.getAssignmentCode())
                .orElseThrow(() -> new EntityNotFoundException("Assignment not found"));

        ClassRoom classRoom = assignment.getClassRoom();

        if("STUDENT".equals(user.getRole().name())){
            Student student = studentRepository.findByUserAndClassRoom(user, classRoom)
                    .orElseThrow(() -> new EntityNotFoundException("Student not found"));
            return ResponseEntity.ok(judgeService.submitCodeForStudent(student, request));
        }

        if ("TEACHER".equals(user.getRole().name())) {
            if (!classRoom.getTeacher().getId().equals(user.getId())) {
                return ResponseEntity.status(403).build();
            }
            return ResponseEntity.ok(judgeService.submitCodeForTeacher(request));
        }

        return ResponseEntity.status(403).build();
    }
}
