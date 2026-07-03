package com.aliados.backend.repository;

import com.aliados.backend.entity.ResultadoOferta;
import com.aliados.backend.entity.TrabajoOferta;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface TrabajoOfertaRepository extends JpaRepository<TrabajoOferta, Long> {

    long countByProveedorIdAndResultado(Long proveedorId, ResultadoOferta resultado);

    List<TrabajoOferta> findByTrabajoId(Long trabajoId);

    Optional<TrabajoOferta> findByTrabajoIdAndProveedorId(Long trabajoId, Long proveedorId);
}
