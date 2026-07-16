package com.aliados.backend.repository;

import com.aliados.backend.entity.TrabajoEvento;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface TrabajoEventoRepository extends JpaRepository<TrabajoEvento, Long> {
    List<TrabajoEvento> findByTrabajoIdOrderByIdAsc(Long trabajoId);
}
