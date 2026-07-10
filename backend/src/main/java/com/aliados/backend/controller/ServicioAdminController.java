package com.aliados.backend.controller;

import com.aliados.backend.dto.ServiciosAdminResponse;
import com.aliados.backend.service.ServicioAdminService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

// Autorización: /api/admin/** ya gateado por .hasRole("ADMIN") en SecurityConfig.
@RestController
@RequestMapping("/api/admin/servicios")
public class ServicioAdminController {

    private final ServicioAdminService servicioAdminService;

    public ServicioAdminController(ServicioAdminService servicioAdminService) {
        this.servicioAdminService = servicioAdminService;
    }

    @GetMapping
    public ResponseEntity<ServiciosAdminResponse> buscar(
            @RequestParam(required = false) String q,
            @RequestParam(required = false) String tipo,
            @RequestParam(required = false) String estado,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size) {
        return ResponseEntity.ok(servicioAdminService.buscar(q, tipo, estado, page, size));
    }
}
