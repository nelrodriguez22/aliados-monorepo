package com.aliados.backend.controller;

import com.aliados.backend.dto.FavoritoResponseDTO;
import com.aliados.backend.service.FavoritoService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/favoritos")
public class FavoritoController {

    private final FavoritoService favoritoService;

    public FavoritoController(FavoritoService favoritoService) {
        this.favoritoService = favoritoService;
    }

    @PostMapping
    public ResponseEntity<Void> agregar(@RequestBody Map<String, Long> body, Authentication auth) {
        favoritoService.agregar(auth.getName(), body.get("proveedorId"));
        return ResponseEntity.ok().build();
    }

    @DeleteMapping("/{proveedorId}")
    public ResponseEntity<Void> quitar(@PathVariable Long proveedorId, Authentication auth) {
        favoritoService.quitar(auth.getName(), proveedorId);
        return ResponseEntity.ok().build();
    }

    @GetMapping
    public ResponseEntity<List<FavoritoResponseDTO>> listar(Authentication auth) {
        return ResponseEntity.ok(favoritoService.listar(auth.getName()));
    }
}
