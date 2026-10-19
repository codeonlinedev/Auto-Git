package com.example.auto_git_be.dto.execute;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CloudflareJudgeResponse {
    private String stdout;
    private String stderr;
    private Integer exitCode;
    private String error;  // Trường hợp Worker trả lỗi
}