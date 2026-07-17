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
        // A2 (auditoría 2026-07-16): sin el null-check, un body sin "tipo" hacía
        // valueOf(null) → NPE, que el handler convertía en 400 PERO reportaba a Sentry
        // como bug (es subclase de RuntimeException) y con mensaje opaco. Es error del
        // cliente: IllegalArgumentException → 400 limpio, sin ruido.
        String tipoRaw = body.get("tipo");
        if (tipoRaw == null || tipoRaw.isBlank()) {
            throw new IllegalArgumentException("El campo 'tipo' es requerido");
        }
        // valueOf lanza IllegalArgumentException si el tipo es inválido → 400 (GlobalExceptionHandler)
        TipoUpload tipo = TipoUpload.valueOf(tipoRaw);
        return ResponseEntity.ok(cloudinaryService.firmar(tipo));
    }
}
