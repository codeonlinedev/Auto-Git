package com.example.auto_git_be.service;

import com.example.auto_git_be.dto.auth.GoogleAuthUrlResponse;
import com.example.auto_git_be.dto.auth.LoginResponse;
import com.example.auto_git_be.entity.User;
import com.example.auto_git_be.repository.UserRepository;
import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestTemplate;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class AuthService {

    private final UserRepository userRepository;

    private final JwtService jwtService;

    @Value("${spring.security.oauth2.client.registration.google.client-id}")
    private String googleClientId;

    @Value("${spring.security.oauth2.client.registration.google.client-secret}")
    private String googleClientSecret;

    @Value("${spring.security.oauth2.client.registration.google.redirect-uri}")
    private String redirectUri;

    private final RestTemplate restTemplate = new RestTemplate();


    public GoogleAuthUrlResponse getGoogleAuthUrl() {
        String encodedRedirectUri = URLEncoder.encode("http://localhost:3000", StandardCharsets.UTF_8);
        String authUrl = "https://accounts.google.com/o/oauth2/v2/auth?" +
                "client_id=" + googleClientId +
                "&redirect_uri=" + encodedRedirectUri +
                "&response_type=code" +
                "&scope=openid%20email%20profile" +
                "&access_type=offline" +
                "&prompt=consent"; // Force consent screen to avoid cache issues
        
        return GoogleAuthUrlResponse.builder()
                .authUrl(authUrl)
                .build();
    }

    public LoginResponse handleGoogleCallback(String code, String requestedRole) {
        Map<String, Object> tokenResponse = exchangeCodeForGoogleAccessToken(code);
        String accessToken = (String) tokenResponse.get("access_token");

        Map<String, Object> userInfo = getUserInfoFromGoogle(accessToken);

        String email = (String) userInfo.get("email");
        String name = (String) userInfo.get("name");
        String googleId = (String) userInfo.get("sub");
        String picture = (String) userInfo.get("picture");

        User user = userRepository.findByGoogleId(googleId).orElse(null);
        
        if (user == null) {
            user = userRepository.findByEmail(email).orElse(null);
            
            if (user != null) {
                user.setGoogleId(googleId);
                user.setName(name);
                user.setProfilePicture(picture);

                String existingRole = user.getRole().toString();
                // Role check removed - allow login with existing role
                userRepository.save(user);
            }
        }
        
        if (user != null) {
            String existingRole = user.getRole().toString();
            // Role check removed - allow login with existing role
        } else {
            user = User.builder()
                    .email(email)
                    .name(name)
                    .googleId(googleId)
                    .profilePicture(picture)
                    .role(User.UserRole.valueOf(requestedRole))
                    .build();
            user = userRepository.save(user);
        }

        String jwtToken = jwtService.generateToken(user.getEmail(), user.getId());

        return LoginResponse.builder()
                .token(jwtToken)
                .email(user.getEmail())
                .name(user.getName())
                .userId(user.getId().toString())
                .role(user.getRole().toString())
                .profilePicture(user.getProfilePicture())
                .build();
    }

    private Map<String, Object> exchangeCodeForGoogleAccessToken(String code) {
        String tokenUrl = "https://oauth2.googleapis.com/token";

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_FORM_URLENCODED);

        String redirectUriForExchange = "http://localhost:3000";

        MultiValueMap<String, String> params = new LinkedMultiValueMap<>();
        params.add("code", code);
        params.add("client_id", googleClientId);
        params.add("client_secret", googleClientSecret);
        params.add("redirect_uri", redirectUriForExchange);
        params.add("grant_type", "authorization_code");

        HttpEntity<MultiValueMap<String, String>> request = new HttpEntity<>(params, headers);

        ResponseEntity<Map> response = restTemplate.postForEntity(tokenUrl, request, Map.class);
        return response.getBody();
    }

    private Map<String, Object> getUserInfoFromGoogle(String accessToken) {
        String userInfoUrl = "https://www.googleapis.com/oauth2/v3/userinfo";

        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(accessToken);
        HttpEntity<String> entity = new HttpEntity<>(headers);

        ResponseEntity<Map> response = restTemplate.exchange(
                userInfoUrl,
                HttpMethod.GET,
                entity,
                Map.class
        );
        return response.getBody();
    }

    public LoginResponse loginWithEmail(String email, String requestedRole) {
        User user = userRepository.findByEmail(email).orElse(null);
        
        if (user != null) {
            String existingRole = user.getRole().toString();
            // Role check removed - allow login with existing role
        } else {
            user = User.builder()
                    .email(email)
                    .name(email.split("@")[0])
                    .role(User.UserRole.valueOf(requestedRole))
                    .build();
            user = userRepository.save(user);
        }
        
        String jwtToken = jwtService.generateToken(user.getEmail(), user.getId());
        
        return LoginResponse.builder()
                .token(jwtToken)
                .email(user.getEmail())
                .name(user.getName())
                .userId(user.getId().toString())
                .role(user.getRole().toString())
                .build();
    }

    public User getUserFromToken(String token) {
        String email = jwtService.extractEmail(token);
        return userRepository.findByEmail(email)
                .orElseThrow(() -> new EntityNotFoundException("User not found"));
    }
}



