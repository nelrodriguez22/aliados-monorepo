package com.aliados.backend.repository;

import com.aliados.backend.entity.ResultadoOferta;
import com.aliados.backend.entity.TrabajoOferta;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TrabajoOfertaRepository extends JpaRepository<TrabajoOferta, Long> {

    long countByProveedorIdAndResultado(Long proveedorId, ResultadoOferta resultado);
}
