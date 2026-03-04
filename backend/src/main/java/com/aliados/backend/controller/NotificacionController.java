package com.aliados.backend.controller;

import com.aliados.backend.dto.NotificacionResponseDTO;
import com.aliados.backend.service.NotificacionService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/notificaciones")
public class NotificacionController {

    @Autowired
    private NotificacionService notificacionService;

    @GetMapping
    public ResponseEntity<List<NotificacionResponseDTO>> getNotificaciones(Authentication authentication) {
        String uid = authentication.getName();
        return ResponseEntity.ok(notificacionService.getNotificaciones(uid));
    }

    @GetMapping("/unread-count")
    public ResponseEntity<?> getUnreadCount(Authentication authentication) {
        String uid = authentication.getName();
        return ResponseEntity.ok(Map.of("count", notificacionService.getUnreadCount(uid)));
    }

    @PatchMapping("/{id}/leer")
    public ResponseEntity<?> marcarComoLeida(@PathVariable Long id, Authentication authentication) {
        String uid = authentication.getName();
        notificacionService.marcarComoLeida(id, uid);
        return ResponseEntity.ok(Map.of("ok", true));
    }

    @PatchMapping("/leer-todas")
    public ResponseEntity<?> marcarTodasComoLeidas(Authentication authentication) {
        String uid = authentication.getName();
        notificacionService.marcarTodasComoLeidas(uid);
        return ResponseEntity.ok(Map.of("ok", true));
    }
}
