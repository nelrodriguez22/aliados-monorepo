package com.aliados.backend.controller;

import com.aliados.backend.dto.OficioAdminDto;
import com.aliados.backend.dto.UpdateOficioRequest;
import com.aliados.backend.entity.Oficio;
import com.aliados.backend.repository.OficioRepository;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

// Autorización: /api/admin/** ya gateado por .hasRole("ADMIN") en SecurityConfig
// (patrón centralizado, igual que el resto de controllers admin).
@RestController
@RequestMapping("/api/admin/oficios")
public class OficioAdminController {

    private final OficioRepository oficioRepository;

    public OficioAdminController(OficioRepository oficioRepository) {
        this.oficioRepository = oficioRepository;
    }

    @GetMapping
    public ResponseEntity<List<OficioAdminDto>> list() {
        List<OficioAdminDto> oficios = oficioRepository.findAll(Sort.by("nombre")).stream()
                .map(OficioAdminDto::from)
                .toList();
        return ResponseEntity.ok(oficios);
    }

    @PatchMapping("/{id}")
    public ResponseEntity<OficioAdminDto> update(@PathVariable Long id, @RequestBody UpdateOficioRequest body) {
        Oficio o = oficioRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Oficio no encontrado"));
        o.setActivo(body.activo());
        oficioRepository.save(o);
        return ResponseEntity.ok(OficioAdminDto.from(o));
    }
}
