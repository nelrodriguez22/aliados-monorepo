package com.aliados.backend.controller;

import com.aliados.backend.dto.MaintenanceStateDto;
import com.aliados.backend.dto.UpdateMaintenanceRequest;
import com.aliados.backend.service.MaintenanceService;
import com.aliados.backend.service.MaintenanceService.MaintenanceState;
import com.google.firebase.remoteconfig.FirebaseRemoteConfigException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

// Autorización: bajo /api/admin/** → gateado por .hasRole("ADMIN") en SecurityConfig
// (patrón centralizado, igual que AdminController). No se usa @PreAuthorize por método.
@RestController
@RequestMapping("/api/admin/maintenance")
public class MaintenanceAdminController {

    private final MaintenanceService maintenanceService;

    public MaintenanceAdminController(MaintenanceService maintenanceService) {
        this.maintenanceService = maintenanceService;
    }

    @GetMapping
    public ResponseEntity<MaintenanceStateDto> get() {
        try {
            return ResponseEntity.ok(toDto(maintenanceService.get()));
        } catch (FirebaseRemoteConfigException e) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,
                    "No se pudo leer Remote Config: " + e.getMessage());
        }
    }

    @PutMapping
    public ResponseEntity<MaintenanceStateDto> update(
            @RequestBody UpdateMaintenanceRequest body,
            Authentication authentication) {
        try {
            MaintenanceState s = maintenanceService.update(
                    body.level(), body.title(), body.message(), body.schedule(), body.duration(), authentication.getName());
            return ResponseEntity.ok(toDto(s));
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, e.getMessage());
        } catch (FirebaseRemoteConfigException e) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,
                    "No se pudo publicar Remote Config: " + e.getMessage());
        }
    }

    private static MaintenanceStateDto toDto(MaintenanceState s) {
        return new MaintenanceStateDto(s.level(), s.title(), s.message(), s.schedule(), s.duration());
    }
}
