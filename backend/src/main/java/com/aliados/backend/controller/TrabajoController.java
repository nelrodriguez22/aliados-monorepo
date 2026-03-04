package com.aliados.backend.controller;

import com.aliados.backend.dto.CancelarTrabajoDTO;
import com.aliados.backend.dto.CrearTrabajoDTO;
import com.aliados.backend.dto.TrabajoResponseDTO;
import com.aliados.backend.service.TrabajoService;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/trabajos")
public class TrabajoController {

    @Autowired
    private TrabajoService trabajoService;

    @PostMapping
    public ResponseEntity<?> crearTrabajo(
            @Valid @RequestBody CrearTrabajoDTO dto,
            Authentication authentication) {
        String uid = authentication.getName();
        TrabajoResponseDTO trabajo = trabajoService.crearTrabajo(uid, dto);
        return ResponseEntity.status(HttpStatus.CREATED).body(trabajo);
    }

    @GetMapping("/pendientes")
    public ResponseEntity<List<TrabajoResponseDTO>> getTrabajosPendientes(Authentication authentication) {
        String uid = authentication.getName();
        List<TrabajoResponseDTO> trabajos = trabajoService.getTrabajosPendientes(uid);
        return ResponseEntity.ok(trabajos);
    }

    @GetMapping("/{id}")
    public ResponseEntity<TrabajoResponseDTO> getTrabajoById(@PathVariable Long id) {
        TrabajoResponseDTO trabajo = trabajoService.getTrabajoById(id);
        return ResponseEntity.ok(trabajo);
    }

    @PatchMapping("/{id}/completar")
    public ResponseEntity<TrabajoResponseDTO> completarTrabajo(
            @PathVariable Long id,
            Authentication authentication) {
        String uid = authentication.getName();
        TrabajoResponseDTO trabajo = trabajoService.completarTrabajo(id, uid);
        return ResponseEntity.ok(trabajo);
    }

    @GetMapping("/cliente")
    public ResponseEntity<List<TrabajoResponseDTO>> getTrabajosByCliente(Authentication authentication) {
        String uid = authentication.getName();
        List<TrabajoResponseDTO> trabajos = trabajoService.getTrabajosByCliente(uid);
        return ResponseEntity.ok(trabajos);
    }

    @GetMapping("/activo")
    public ResponseEntity<?> getTrabajoActivo(Authentication authentication) {
        String uid = authentication.getName();
        TrabajoResponseDTO trabajo = trabajoService.getTrabajoActivo(uid);
        if (trabajo == null) {
            return ResponseEntity.ok().build();
        }
        return ResponseEntity.ok(trabajo);
    }

    @GetMapping("/completados")
    public ResponseEntity<List<TrabajoResponseDTO>> getTrabajosCompletados(Authentication authentication) {
        String uid = authentication.getName();
        List<TrabajoResponseDTO> trabajos = trabajoService.getTrabajosCompletados(uid);
        return ResponseEntity.ok(trabajos);
    }

    @PatchMapping("/{id}/cancelar")
    public ResponseEntity<TrabajoResponseDTO> cancelarTrabajo(
            @PathVariable Long id,
            @RequestBody CancelarTrabajoDTO dto,
            Authentication authentication) {
        String uid = authentication.getName();
        TrabajoResponseDTO trabajo = trabajoService.cancelarTrabajo(id, uid, dto.getMotivo());
        return ResponseEntity.ok(trabajo);
    }

    @PatchMapping("/{id}/proponer")
    public ResponseEntity<TrabajoResponseDTO> proponerTrabajo(
            @PathVariable Long id,
            @RequestBody Map<String, Object> body,
            Authentication authentication) {
        String uid = authentication.getName();
        Integer tiempoEstimado = (Integer) body.get("tiempoEstimadoMinutos");
        Double latitud = body.get("latitud") != null ? ((Number) body.get("latitud")).doubleValue() : null;
        Double longitud = body.get("longitud") != null ? ((Number) body.get("longitud")).doubleValue() : null;

        if (tiempoEstimado == null) {
            throw new IllegalArgumentException("Tiempo estimado es requerido");
        }

        TrabajoResponseDTO trabajo = trabajoService.proponerTrabajo(id, uid, tiempoEstimado, latitud, longitud);
        return ResponseEntity.ok(trabajo);
    }

    @PatchMapping("/{id}/aceptar-propuesta")
    public ResponseEntity<TrabajoResponseDTO> aceptarPropuesta(
            @PathVariable Long id,
            Authentication authentication) {
        String uid = authentication.getName();
        TrabajoResponseDTO trabajo = trabajoService.aceptarPropuesta(id, uid);
        return ResponseEntity.ok(trabajo);
    }

    @PatchMapping("/{id}/rechazar-propuesta")
    public ResponseEntity<?> rechazarPropuesta(
            @PathVariable Long id,
            Authentication authentication) {
        String uid = authentication.getName();
        trabajoService.rechazarPropuesta(id, uid);
        return ResponseEntity.ok(Map.of("message", "Propuesta rechazada"));
    }

    @PatchMapping("/{id}/rechazar")
    public ResponseEntity<?> rechazarTrabajo(
            @PathVariable Long id,
            Authentication authentication) {
        String uid = authentication.getName();
        trabajoService.rechazarTrabajo(id, uid);
        return ResponseEntity.ok(Map.of("message", "Trabajo rechazado"));
    }

    @GetMapping("/en-cola")
    public ResponseEntity<List<TrabajoResponseDTO>> getTrabajosEnCola(Authentication authentication) {
        String uid = authentication.getName();
        List<TrabajoResponseDTO> trabajos = trabajoService.getTrabajosEnCola(uid);
        return ResponseEntity.ok(trabajos);
    }
}
