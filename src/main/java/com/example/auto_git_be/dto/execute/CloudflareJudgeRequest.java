package com.example.auto_git_be.dto.execute;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CloudflareJudgeRequest {
    private String language;
    private String sourceCode;
    private String input;
}