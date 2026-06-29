package com.aliados.backend.controller;

import com.aliados.backend.service.AppVersionGateService;
import com.google.firebase.remoteconfig.FirebaseRemoteConfigException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;

// Autorización: bajo /api/admin/** → gateado por .hasRole("ADMIN") en SecurityConfig.
@RestController
@RequestMapping("/api/admin/version-gate")
public class VersionGateAdminController {

    private final AppVersionGateService service;

    public VersionGateAdminController(AppVersionGateService service) {
        this.service = service;
    }

    @GetMapping
    public ResponseEntity<Map<String, Object>> get() {
        try {
            return ResponseEntity.ok(Map.of("minVersion", service.getMinVersion()));
        } catch (FirebaseRemoteConfigException e) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,
                    "No se pudo leer Remote Config: " + e.getMessage());
        }
    }

    @PutMapping
    public ResponseEntity<Map<String, Object>> update(
            @RequestBody Map<String, Object> body,
            Authentication authentication) {
        try {
            Object raw = body.getOrDefault("minVersion", 0);
            int version = (raw instanceof Number n) ? n.intValue() : Integer.parseInt(String.valueOf(raw));
            int saved = service.setMinVersion(version, authentication.getName());
            return ResponseEntity.ok(Map.of("minVersion", saved));
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, e.getMessage());
        } catch (FirebaseRemoteConfigException e) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,
                    "No se pudo publicar Remote Config: " + e.getMessage());
        }
    }
}
