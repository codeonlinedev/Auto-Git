package com.example.auto_git_be.controller;

import com.example.auto_git_be.dto.auth.GoogleAuthCodeRequest;
import com.example.auto_git_be.dto.auth.GoogleAuthUrlResponse;
import com.example.auto_git_be.dto.auth.LoginResponse;
import com.example.auto_git_be.dto.auth.OTPLoginRequest;
import com.example.auto_git_be.dto.auth.OTPResponse;
import com.example.auto_git_be.dto.auth.OTPVerifyRequest;
import com.example.auto_git_be.service.AuthService;
import com.example.auto_git_be.service.EmailService;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.Map;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService authService;
    private final EmailService emailService;

    @GetMapping("/google/url")
    public ResponseEntity<GoogleAuthUrlResponse> getGoogleAuthUrl() {
        return ResponseEntity.ok(authService.getGoogleAuthUrl());
    }

   @PostMapping("/google/callback")
public ResponseEntity<LoginResponse> handleGoogleCallback(
        @RequestBody Map<String, String> body) {
    String code = body.get("code");
    String role = body.getOrDefault("role", "STUDENT");
    LoginResponse response = authService.handleGoogleCallback(code, role);
    return ResponseEntity.ok(response);
}

    @PostMapping("/otp/request")
    public ResponseEntity<OTPResponse> requestOTP(@RequestBody OTPLoginRequest request) {
        String email = request.getEmail();

        if (email == null || !email.matches("^[A-Za-z0-9+_.-]+@(.+)$")) {
            return ResponseEntity.badRequest()
                    .body(OTPResponse.builder()
                            .success(false)
                            .message("Invalid email format")
                            .build());
        }

        emailService.generateAndSendOTP(email);

        return ResponseEntity.ok(OTPResponse.builder()
                .success(true)
                .message("Mã OTP đã được gửi đến " + email + ". Vui lòng kiểm tra hộp thư.")
                .build());
    }

    @PostMapping("/otp/verify")
    public ResponseEntity<LoginResponse> verifyOTP(@RequestBody OTPVerifyRequest request) {
        String email = request.getEmail();
        String otp = request.getOtp();
        String role = request.getRole() != null ? request.getRole() : "STUDENT";

        boolean isValid = emailService.verifyOTP(email, otp);

        if (!isValid) {
            return ResponseEntity.status(401).build();
        }

        LoginResponse response = authService.loginWithEmail(email, role);
        return ResponseEntity.ok(response);

    }
}
