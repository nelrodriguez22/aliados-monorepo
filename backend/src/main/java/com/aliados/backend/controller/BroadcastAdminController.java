package com.aliados.backend.controller;

import com.aliados.backend.dto.BroadcastRequest;
import com.aliados.backend.dto.BroadcastResultDto;
import com.aliados.backend.entity.User;
import com.aliados.backend.service.BroadcastService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

// Autorización: /api/admin/** ya gateado por .hasRole("ADMIN") en SecurityConfig
// (patrón centralizado, igual que el resto de controllers admin). No se usa @PreAuthorize.
@RestController
@RequestMapping("/api/admin/broadcast")
public class BroadcastAdminController {

    private final BroadcastService broadcastService;

    public BroadcastAdminController(BroadcastService broadcastService) {
        this.broadcastService = broadcastService;
    }

    @PostMapping
    public ResponseEntity<BroadcastResultDto> broadcast(
            @RequestBody BroadcastRequest body,
            Authentication authentication) {
        if (body.segmento() == null || body.segmento().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Segmento obligatorio");
        }
        if (body.titulo() == null || body.titulo().isBlank()
                || body.mensaje() == null || body.mensaje().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Título y mensaje son obligatorios");
        }
        List<User> destinatarios;
        try {
            destinatarios = broadcastService.resolverDestinatarios(body.segmento());
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, e.getMessage());
        }
        List<String> uids = destinatarios.stream().map(User::getFirebaseUid).toList();
        broadcastService.enviarAsync(uids, body.titulo(), body.mensaje(), authentication.getName());
        return ResponseEntity.ok(new BroadcastResultDto(uids.size()));
    }
}
