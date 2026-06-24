package com.aliados.backend.controller;

import com.aliados.backend.dto.FeatureFlagDto;
import com.aliados.backend.dto.UpdateFeatureFlagRequest;
import com.aliados.backend.service.FeatureFlagService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.NoSuchElementException;

// Autorización: estos endpoints están bajo /api/admin/** y los gatea SecurityConfig
// con .requestMatchers("/api/admin/**").hasRole("ADMIN") (mismo patrón centralizado
// que AdminController). No se usa @PreAuthorize por método para no habilitar
// @EnableMethodSecurity global.
@RestController
@RequestMapping("/api/admin/feature-flags")
public class FeatureFlagAdminController {

    private final FeatureFlagService featureFlagService;

    public FeatureFlagAdminController(FeatureFlagService featureFlagService) {
        this.featureFlagService = featureFlagService;
    }

    @GetMapping
    public ResponseEntity<List<FeatureFlagDto>> list() {
        List<FeatureFlagDto> flags = featureFlagService.getAll().stream()
                .map(FeatureFlagDto::from)
                .toList();
        return ResponseEntity.ok(flags);
    }

    @PutMapping("/{key}")
    public ResponseEntity<FeatureFlagDto> update(
            @PathVariable String key,
            @RequestBody UpdateFeatureFlagRequest body,
            Authentication authentication) {
        String adminUid = authentication.getName();
        try {
            FeatureFlagDto dto = FeatureFlagDto.from(
                    featureFlagService.update(key, body.enabled(), body.value(), adminUid));
            return ResponseEntity.ok(dto);
        } catch (NoSuchElementException e) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, e.getMessage());
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, e.getMessage());
        }
    }
}
