package com.aliados.backend.controller;

import com.aliados.backend.dto.*;
import com.aliados.backend.service.MudanzaService;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/mudanzas")
public class MudanzaController {

    @Autowired
    private MudanzaService mudanzaService;

    // ── Tiers ──

    @GetMapping("/tiers")
    public ResponseEntity<List<MudanzaTierResponseDTO>> getTiers() {
        return ResponseEntity.ok(mudanzaService.getTiers());
    }

    // ── Fase 1: Crear solicitud (Cliente) ──

    @PostMapping
    public ResponseEntity<MudanzaResponseDTO> crearMudanza(
            @Valid @RequestBody CrearMudanzaDTO dto,
            Authentication authentication) {
        String uid = authentication.getName();
        MudanzaResponseDTO mudanza = mudanzaService.crearMudanza(uid, dto);
        return ResponseEntity.status(HttpStatus.CREATED).body(mudanza);
    }

    // ── Fase 2: Reservar / "Pagar" (Cliente) ──

    @PatchMapping("/{id}/reservar")
    public ResponseEntity<MudanzaResponseDTO> reservarMudanza(
            @PathVariable Long id,
            Authentication authentication) {
        String uid = authentication.getName();
        return ResponseEntity.ok(mudanzaService.reservarMudanza(id, uid));
    }

    // ── Proveedor: Aceptar ──

    @PatchMapping("/{id}/aceptar")
    public ResponseEntity<MudanzaResponseDTO> aceptarMudanza(
            @PathVariable Long id,
            Authentication authentication) {
        String uid = authentication.getName();
        return ResponseEntity.ok(mudanzaService.aceptarMudanza(id, uid));
    }

    // ── Proveedor: Contraproponer tier ──

    @PatchMapping("/{id}/contraproponer")
    public ResponseEntity<MudanzaResponseDTO> contraproponer(
            @PathVariable Long id,
            @Valid @RequestBody ContrapropuestaMudanzaDTO dto,
            Authentication authentication) {
        String uid = authentication.getName();
        return ResponseEntity.ok(mudanzaService.contraproponer(id, uid, dto));
    }

    // ── Cliente: Aceptar contrapropuesta ──

    @PatchMapping("/{id}/aceptar-contrapropuesta")
    public ResponseEntity<MudanzaResponseDTO> aceptarContrapropuesta(
            @PathVariable Long id,
            Authentication authentication) {
        String uid = authentication.getName();
        return ResponseEntity.ok(mudanzaService.aceptarContrapropuesta(id, uid));
    }

    // ── Cliente: Rechazar contrapropuesta ──

    @PatchMapping("/{id}/rechazar-contrapropuesta")
    public ResponseEntity<MudanzaResponseDTO> rechazarContrapropuesta(
            @PathVariable Long id,
            Authentication authentication) {
        String uid = authentication.getName();
        return ResponseEntity.ok(mudanzaService.rechazarContrapropuesta(id, uid));
    }

    // ── Fase 3: Iniciar trabajo (Proveedor) ──

    @PatchMapping("/{id}/iniciar")
    public ResponseEntity<MudanzaResponseDTO> iniciarMudanza(
            @PathVariable Long id,
            Authentication authentication) {
        String uid = authentication.getName();
        return ResponseEntity.ok(mudanzaService.iniciarMudanza(id, uid));
    }

    // ── Fase 3: Finalizar trabajo (Proveedor) ──

    @PatchMapping("/{id}/finalizar")
    public ResponseEntity<MudanzaResponseDTO> finalizarMudanza(
            @PathVariable Long id,
            Authentication authentication) {
        String uid = authentication.getName();
        return ResponseEntity.ok(mudanzaService.finalizarMudanza(id, uid));
    }

    // ── Fase 4: Pagar extra (Cliente) ──

    @PatchMapping("/{id}/pagar-extra")
    public ResponseEntity<MudanzaResponseDTO> pagarExtra(
            @PathVariable Long id,
            Authentication authentication) {
        String uid = authentication.getName();
        return ResponseEntity.ok(mudanzaService.pagarExtra(id, uid));
    }

    // ── Fase 4: Completar / cerrar (Cliente) ──

    @PatchMapping("/{id}/completar")
    public ResponseEntity<MudanzaResponseDTO> completarMudanza(
            @PathVariable Long id,
            Authentication authentication) {
        String uid = authentication.getName();
        return ResponseEntity.ok(mudanzaService.completarMudanza(id, uid));
    }

    // ── Cancelar (Cliente) ──

    @PatchMapping("/{id}/cancelar")
    public ResponseEntity<MudanzaResponseDTO> cancelarMudanza(
            @PathVariable Long id,
            @RequestBody Map<String, String> body,
            Authentication authentication) {
        String uid = authentication.getName();
        String motivo = body.getOrDefault("motivo", "Sin motivo especificado");
        return ResponseEntity.ok(mudanzaService.cancelarMudanza(id, uid, motivo));
    }

    // ── Queries ──

    @GetMapping("/{id}")
    public ResponseEntity<MudanzaResponseDTO> getMudanzaById(@PathVariable Long id) {
        return ResponseEntity.ok(mudanzaService.getMudanzaById(id));
    }

    @GetMapping("/cliente")
    public ResponseEntity<List<MudanzaResponseDTO>> getMudanzasByCliente(Authentication authentication) {
        String uid = authentication.getName();
        return ResponseEntity.ok(mudanzaService.getMudanzasByCliente(uid));
    }

    @GetMapping("/proveedor/pendientes")
    public ResponseEntity<List<MudanzaResponseDTO>> getMudanzasPendientesProveedor() {
        return ResponseEntity.ok(mudanzaService.getMudanzasPendientesProveedor());
    }

    @GetMapping("/proveedor/activa")
    public ResponseEntity<?> getMudanzaActivaProveedor(Authentication authentication) {
        String uid = authentication.getName();
        MudanzaResponseDTO mudanza = mudanzaService.getMudanzaActivaProveedor(uid);
        if (mudanza == null) {
            return ResponseEntity.ok().build();
        }
        return ResponseEntity.ok(mudanza);
    }

    @GetMapping("/proveedor/completadas")
    public ResponseEntity<List<MudanzaResponseDTO>> getMudanzasCompletadasProveedor(Authentication authentication) {
        String uid = authentication.getName();
        return ResponseEntity.ok(mudanzaService.getMudanzasCompletadasProveedor(uid));
    }
}
