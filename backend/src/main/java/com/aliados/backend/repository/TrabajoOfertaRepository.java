package com.aliados.backend.repository;

import com.aliados.backend.entity.ResultadoOferta;
import com.aliados.backend.entity.TrabajoOferta;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.List;
import java.util.Optional;

public interface TrabajoOfertaRepository extends JpaRepository<TrabajoOferta, Long> {

    long countByProveedorIdAndResultado(Long proveedorId, ResultadoOferta resultado);

    List<TrabajoOferta> findByTrabajoId(Long trabajoId);

    Optional<TrabajoOferta> findByTrabajoIdAndProveedorId(Long trabajoId, Long proveedorId);

    List<TrabajoOferta> findByTrabajoIdAndResultado(Long trabajoId, ResultadoOferta resultado);

    // Scoring: tiempo promedio de respuesta en minutos (entre ofrecidoAt y respondioAt)
    @Query(value = "SELECT AVG(EXTRACT(EPOCH FROM (respondio_at - ofrecido_at)) / 60) FROM trabajo_oferta WHERE proveedor_id = :proveedorId AND resultado = 'PROPUSO' AND respondio_at IS NOT NULL", nativeQuery = true)
    Double getPromedioMinutosRespuestaByProveedorId(@Param("proveedorId") Long proveedorId);
}
