package com.example.auto_git_be.service;

import com.example.auto_git_be.dto.execute.CloudflareJudgeRequest;
import com.example.auto_git_be.dto.execute.CloudflareJudgeResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;

import java.time.Duration;

@Slf4j
@Service
public class CloudflareJudgeService {

    private final WebClient webClient;

    @Value("${cloudflare.worker.timeout:10000}")
    private long timeoutMs;

    public CloudflareJudgeService(
            @Value("${cloudflare.worker.url}") String workerUrl
    ) {
        this.webClient = WebClient.builder()
                .baseUrl(workerUrl)
                .build();
        log.info("Cloudflare Judge Service initialized with URL: {}", workerUrl);
    }

    /**
     * Chạy code với Cloudflare Containers
     * Tự động phát hiện timeout (TLE) nếu code treo vô hạn
     */
    public CloudflareJudgeResponse execute(
            String language,
            String sourceCode,
            String input
    ) {
        CloudflareJudgeRequest request = CloudflareJudgeRequest.builder()
                .language(language)
                .sourceCode(sourceCode)
                .input(input)
                .build();

        try {
            CloudflareJudgeResponse response = webClient.post()
                    .uri("/run")
                    .contentType(MediaType.APPLICATION_JSON)
                    .bodyValue(request)
                    .retrieve()
                    .bodyToMono(CloudflareJudgeResponse.class)
                    .block(Duration.ofMillis(timeoutMs));

            if (response == null) {
                throw new RuntimeException("Cloudflare Worker returned null response");
            }

            log.info("Cloudflare response: stdout={}, stderr={}, exitCode={}",
                    response.getStdout(), response.getStderr(), response.getExitCode());

            return response;

        } catch (Exception e) {
            String msg = e.getMessage() != null ? e.getMessage() : "";

            // Phát hiện timeout (Reactor block timeout)
            if (msg.contains("Timeout") || msg.contains("timeout")
                    || msg.contains("blocking read")
                    || msg.contains("did not observe")) {

                log.warn("Cloudflare Worker TIMEOUT sau {} ms — code có thể bị treo vô hạn", timeoutMs);

                throw new RuntimeException(
                        "TIMEOUT: Chương trình chạy quá lâu (>"
                                + (timeoutMs / 1000)
                                + "s). Có thể bị treo vô hạn (infinite loop)."
                );
            }

            log.error("Error calling Cloudflare Worker: {}", msg, e);
            throw new RuntimeException("Lỗi gọi Cloudflare Worker: " + msg, e);
        }
    }
    public void resetContainer() {
    try {
        webClient.get()
                .uri("/debug/kill")
                .retrieve()
                .bodyToMono(String.class)
                .block(Duration.ofSeconds(5));
        log.info("Container reset OK");
    } catch (Exception e) {
        log.warn("Failed to reset container: {}", e.getMessage());
    }
}
}