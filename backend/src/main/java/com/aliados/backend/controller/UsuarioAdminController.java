package com.aliados.backend.controller;

import com.aliados.backend.dto.SuspenderRequest;
import com.aliados.backend.dto.UsuarioAdminDto;
import com.aliados.backend.entity.UserRole;
import com.aliados.backend.service.UsuarioAdminService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.NoSuchElementException;

// Autorización: /api/admin/** ya gateado por .hasRole("ADMIN") en SecurityConfig.
@RestController
@RequestMapping("/api/admin/usuarios")
public class UsuarioAdminController {

    private final UsuarioAdminService usuarioAdminService;

    public UsuarioAdminController(UsuarioAdminService usuarioAdminService) {
        this.usuarioAdminService = usuarioAdminService;
    }

    @GetMapping
    public ResponseEntity<List<UsuarioAdminDto>> buscar(
            @RequestParam(required = false) String q,
            @RequestParam(required = false) String role) {
        UserRole rol = null;
        if (role != null && !role.isBlank()) {
            try {
                rol = UserRole.valueOf(role);
            } catch (IllegalArgumentException e) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Rol inválido");
            }
        }
        List<UsuarioAdminDto> usuarios = usuarioAdminService.buscar(q, rol).stream()
                .map(UsuarioAdminDto::from)
                .toList();
        return ResponseEntity.ok(usuarios);
    }

    @PatchMapping("/{id}")
    public ResponseEntity<UsuarioAdminDto> actualizar(
            @PathVariable Long id, @RequestBody SuspenderRequest body) {
        try {
            return ResponseEntity.ok(
                    UsuarioAdminDto.from(usuarioAdminService.actualizarActivo(id, body.activo())));
        } catch (NoSuchElementException e) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, e.getMessage());
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, e.getMessage());
        }
    }
}
