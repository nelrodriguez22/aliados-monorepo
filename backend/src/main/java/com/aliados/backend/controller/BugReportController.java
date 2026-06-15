package com.aliados.backend.controller;

import com.aliados.backend.dto.BugReportResponseDTO;
import com.aliados.backend.dto.CrearBugReportDTO;
import com.aliados.backend.service.BugReportService;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/bug-reports")
public class BugReportController {

    @Autowired
    private BugReportService bugReportService;

    @PostMapping
    public ResponseEntity<BugReportResponseDTO> crear(
            @Valid @RequestBody CrearBugReportDTO dto,
            Authentication authentication) {
        String uid = authentication.getName();
        BugReportResponseDTO response = bugReportService.crear(uid, dto);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @GetMapping
    public ResponseEntity<List<BugReportResponseDTO>> listar(Authentication authentication) {
        return ResponseEntity.ok(bugReportService.listar(authentication.getName()));
    }
}
