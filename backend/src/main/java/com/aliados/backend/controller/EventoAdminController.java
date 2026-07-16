package com.aliados.backend.controller;

import com.aliados.backend.dto.EventoResponseDTO;
import com.aliados.backend.service.EventoService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * Timeline de eventos de ciclo de vida, solo lectura. La protección la impone
 * SecurityConfig (/api/admin/** → hasRole ADMIN); acá no hay checks propios.
 * Sin paginación a propósito: una entidad genera ~5-15 eventos en toda su vida.
 */
@RestController
@RequestMapping("/api/admin")
public class EventoAdminController {

    private final EventoService eventoService;

    public EventoAdminController(EventoService eventoService) {
        this.eventoService = eventoService;
    }

    @GetMapping("/trabajos/{id}/eventos")
    public ResponseEntity<List<EventoResponseDTO>> eventosDeTrabajo(@PathVariable Long id) {
        return ResponseEntity.ok(eventoService.eventosDeTrabajo(id));
    }

    @GetMapping("/mudanzas/{id}/eventos")
    public ResponseEntity<List<EventoResponseDTO>> eventosDeMudanza(@PathVariable Long id) {
        return ResponseEntity.ok(eventoService.eventosDeMudanza(id));
    }
}
