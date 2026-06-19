package com.aliados.backend.controller;

import com.aliados.backend.dto.SignatureResponse;
import com.aliados.backend.entity.TipoUpload;
import com.aliados.backend.service.CloudinaryService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/uploads")
public class UploadController {

    private final CloudinaryService cloudinaryService;

    public UploadController(CloudinaryService cloudinaryService) {
        this.cloudinaryService = cloudinaryService;
    }

    @PostMapping("/signature")
    public ResponseEntity<SignatureResponse> firmar(@RequestBody Map<String, String> body) {
        // valueOf lanza IllegalArgumentException si el tipo es inválido → 400 (GlobalExceptionHandler)
        TipoUpload tipo = TipoUpload.valueOf(body.get("tipo"));
        return ResponseEntity.ok(cloudinaryService.firmar(tipo));
    }
}
