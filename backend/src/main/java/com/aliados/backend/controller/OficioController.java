package com.aliados.backend.controller;

import com.aliados.backend.entity.Oficio;
import com.aliados.backend.repository.OficioRepository;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/api/oficios")
public class OficioController {

    private final OficioRepository oficioRepository;

    public OficioController(OficioRepository oficioRepository) {
        this.oficioRepository = oficioRepository;
    }

    @GetMapping
    public ResponseEntity<List<Oficio>> getOficios() {
        return ResponseEntity.ok(oficioRepository.findByActivoTrue());
    }
}