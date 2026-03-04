package com.aliados.backend.repository;

import com.aliados.backend.entity.Trabajo;
import com.aliados.backend.entity.TrabajoEstado;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface TrabajoRepository extends JpaRepository<Trabajo, Long> {

    List<Trabajo> findByClienteFirebaseUidOrderByCreatedAtDesc(String firebaseUid);

    List<Trabajo> findByEstadoAndOficioId(TrabajoEstado estado, Long oficioId);

    List<Trabajo> findByProveedorIdAndEstadoOrderByCompletedAtDesc(Long proveedorId, TrabajoEstado estado);

    @Query("SELECT t FROM Trabajo t WHERE t.proveedor.id = :proveedorId AND t.estado = 'EN_CURSO'")
    Trabajo findTrabajoEnCursoByProveedorId(@Param("proveedorId") Long proveedorId);

    @Query("SELECT t FROM Trabajo t WHERE t.estado = 'PENDIENTE' AND t.proveedorNotificadoId IS NULL AND t.oficio.id = :oficioId")
    List<Trabajo> findTrabajosPendientesSinAsignar(@Param("oficioId") Long oficioId);

    Long countByProveedorIdAndEstado(Long proveedorId, TrabajoEstado estado);

    @Query("SELECT COUNT(t) FROM Trabajo t WHERE t.proveedor.id = :proveedorId AND t.estado IN ('EN_CURSO', 'EN_COLA')")
    int countTrabajosActivosYCola(@Param("proveedorId") Long proveedorId);

    @Query("SELECT t FROM Trabajo t WHERE t.proveedor.id = :proveedorId AND t.estado = 'EN_COLA' ORDER BY t.acceptedAt ASC")
    List<Trabajo> findTrabajosEnCola(@Param("proveedorId") Long proveedorId);

    // Scoring: propuestas enviadas por un proveedor
    @Query("SELECT COUNT(t) FROM Trabajo t WHERE t.proveedor.id = :proveedorId AND t.estado IN ('PROPUESTO', 'EN_CURSO', 'EN_COLA', 'COMPLETADO', 'CANCELADO')")
    long countPropuestasEnviadasByProveedorId(@Param("proveedorId") Long proveedorId);

    // Scoring: propuestas aceptadas por el cliente
    @Query("SELECT COUNT(t) FROM Trabajo t WHERE t.proveedor.id = :proveedorId AND t.estado IN ('EN_CURSO', 'EN_COLA', 'COMPLETADO')")
    long countPropuestasAceptadasByProveedorId(@Param("proveedorId") Long proveedorId);

    // Scoring: tiempo promedio de respuesta en minutos (entre notificadoAt y propuestoAt)
    @Query(value = "SELECT AVG(EXTRACT(EPOCH FROM (propuesto_at - notificado_at)) / 60) FROM trabajos WHERE proveedor_id = :proveedorId AND propuesto_at IS NOT NULL AND notificado_at IS NOT NULL", nativeQuery = true)
    Double getPromedioTiempoRespuestaMinutosByProveedorId(@Param("proveedorId") Long proveedorId);

    long countByEstado(TrabajoEstado estado);

    @Query("SELECT t.oficio.nombre, t.oficio.icono, COUNT(t) FROM Trabajo t GROUP BY t.oficio.nombre, t.oficio.icono ORDER BY COUNT(t) DESC")
    List<Object[]> countTrabajosGroupByOficio();
}
