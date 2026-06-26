package com.aliados.backend.controller;

import com.aliados.backend.dto.BugReportResponseDTO;
import com.aliados.backend.dto.UpdateBugEstadoRequest;
import com.aliados.backend.entity.BugEstado;
import com.aliados.backend.service.BugReportService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.NoSuchElementException;

// Autorización: /api/admin/** ya gateado por .hasRole("ADMIN") en SecurityConfig.
@RestController
@RequestMapping("/api/admin/bug-reports")
public class BugReportAdminController {

    private final BugReportService bugReportService;

    public BugReportAdminController(BugReportService bugReportService) {
        this.bugReportService = bugReportService;
    }

    @PatchMapping("/{id}")
    public ResponseEntity<BugReportResponseDTO> updateEstado(
            @PathVariable Long id, @RequestBody UpdateBugEstadoRequest body) {
        BugEstado estado;
        try {
            estado = BugEstado.valueOf(body.estado());
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Estado inválido");
        }
        try {
            return ResponseEntity.ok(bugReportService.actualizarEstado(id, estado));
        } catch (NoSuchElementException e) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, e.getMessage());
        }
    }
}
