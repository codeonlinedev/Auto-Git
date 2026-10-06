package com.example.auto_git_be.controller;

import com.example.auto_git_be.service.R2StorageService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.List;

@RestController
@RequestMapping("/api/test/r2")
@RequiredArgsConstructor
public class TestR2Controller {

    private final R2StorageService r2StorageService;

    @PostMapping("/upload")
    public ResponseEntity<String> testUpload(@RequestParam("file") MultipartFile file) throws IOException {
        String key = "test/" + file.getOriginalFilename();
        r2StorageService.uploadFile(key, file.getInputStream(), file.getSize(), file.getContentType());
        return ResponseEntity.ok("Uploaded: " + key);
    }

    @GetMapping("/download/{filename}")
    public ResponseEntity<byte[]> testDownload(@PathVariable String filename) {
        byte[] content = r2StorageService.downloadFile("test/" + filename);
        return ResponseEntity.ok()
                .header("Content-Type", "application/octet-stream")
                .body(content);
    }

        @GetMapping("/list")
    public ResponseEntity<List<String>> testList(
            @RequestParam(value = "prefix", required = false, defaultValue = "") String prefix) {
        return ResponseEntity.ok(r2StorageService.listFiles(prefix));
    }

    @DeleteMapping("/delete/{filename}")
    public ResponseEntity<String> testDelete(@PathVariable String filename) {
        r2StorageService.deleteFile("test/" + filename);
        return ResponseEntity.ok("Deleted: test/" + filename);
    }
}