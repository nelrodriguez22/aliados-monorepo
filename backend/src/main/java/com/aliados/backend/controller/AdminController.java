package com.aliados.backend.controller;

import com.aliados.backend.service.AdminService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/admin")
public class AdminController {

    @Autowired
    private AdminService adminService;

    @GetMapping("/stats")
    public ResponseEntity<Map<String, Object>> getStats() {
        return ResponseEntity.ok(adminService.getStats());
    }

    @GetMapping("/providers/active")
    public ResponseEntity<List<Map<String, Object>>> getProveedoresActivos() {
        return ResponseEntity.ok(adminService.getProveedoresActivos());
    }

    @PatchMapping("/providers/{id}/offline")
    public ResponseEntity<Void> forceProviderOffline(@PathVariable Long id) {
        adminService.forceProviderOffline(id);
        return ResponseEntity.ok().build();
    }

    @GetMapping("/ratings/recent")
    public ResponseEntity<Map<String, Object>> getCalificacionesRecientes() {
        return ResponseEntity.ok(adminService.getCalificacionesRecientes());
    }

    @GetMapping("/alerts")
    public ResponseEntity<Map<String, Object>> getAlertas() {
        return ResponseEntity.ok(adminService.getAlertas());
    }
}
