package com.aliados.backend.repository;

import com.aliados.backend.entity.ResultadoOferta;
import com.aliados.backend.entity.TrabajoOferta;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;
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

    /**
     * Marca como DURMIO, de forma atómica, todas las ofertas OFRECIDA de un trabajo,
     * pero SOLO si el trabajo sigue en estado PENDIENTE. El EXISTS garantiza que nunca
     * pisamos un PROPUSO que llegó justo antes que el scheduler (race condition).
     *
     * @return número de filas actualizadas (0 si el trabajo ya no es PENDIENTE)
     */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Transactional
    @Query("""
        UPDATE TrabajoOferta o SET o.resultado = com.aliados.backend.entity.ResultadoOferta.DURMIO
        WHERE o.trabajo.id = :trabajoId
          AND o.resultado = com.aliados.backend.entity.ResultadoOferta.OFRECIDA
          AND EXISTS (SELECT t FROM Trabajo t WHERE t.id = :trabajoId
                      AND t.estado = com.aliados.backend.entity.TrabajoEstado.PENDIENTE)
        """)
    int marcarGrupoDurmioSiPendiente(@Param("trabajoId") Long trabajoId);
}
