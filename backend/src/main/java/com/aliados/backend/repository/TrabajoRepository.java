package com.aliados.backend.repository;

import com.aliados.backend.entity.Trabajo;
import com.aliados.backend.entity.TrabajoEstado;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface TrabajoRepository extends JpaRepository<Trabajo, Long> {

    // @EntityGraph: trae cliente/proveedor/oficio en la misma query (evita N+1 al mapear).
    @EntityGraph(attributePaths = {"cliente", "proveedor", "oficio"})
    List<Trabajo> findByClienteFirebaseUidOrderByCreatedAtDesc(String firebaseUid);

    // Trabajos activos del cliente (lista chica, no paginada): se usa en el dashboard.
    @EntityGraph(attributePaths = {"cliente", "proveedor", "oficio"})
    List<Trabajo> findByClienteFirebaseUidAndEstadoInOrderByCreatedAtDesc(
            String firebaseUid, List<TrabajoEstado> estados);

    // Historial del cliente paginado (crece sin límite → #20-B).
    @EntityGraph(attributePaths = {"cliente", "proveedor", "oficio"})
    Page<Trabajo> findByClienteFirebaseUidAndEstado(String firebaseUid, TrabajoEstado estado, Pageable pageable);

    // Cantidad de trabajos completados del cliente que aún no tienen calificación (badge "sin calificar").
    @Query("SELECT COUNT(t) FROM Trabajo t WHERE t.cliente.firebaseUid = :uid AND t.estado = 'COMPLETADO' " +
           "AND NOT EXISTS (SELECT c FROM Calificacion c WHERE c.trabajo.id = t.id)")
    long countSinCalificarByCliente(@Param("uid") String uid);

    List<Trabajo> findByEstadoAndOficioId(TrabajoEstado estado, Long oficioId);

    @EntityGraph(attributePaths = {"cliente", "proveedor", "oficio"})
    List<Trabajo> findByEstadoAndOficioIdAndProveedorNotificadoId(
            TrabajoEstado estado, Long oficioId, Long proveedorNotificadoId);

    @EntityGraph(attributePaths = {"cliente", "proveedor", "oficio"})
    List<Trabajo> findByProveedorIdAndEstadoOrderByCompletedAtDesc(Long proveedorId, TrabajoEstado estado);

    // Historial del proveedor paginado (#20-B). El orden lo define el Pageable (completedAt DESC).
    @EntityGraph(attributePaths = {"cliente", "proveedor", "oficio"})
    Page<Trabajo> findByProveedorIdAndEstado(Long proveedorId, TrabajoEstado estado, Pageable pageable);

    @EntityGraph(attributePaths = {"cliente", "proveedor", "oficio"})
    @Query("SELECT t FROM Trabajo t WHERE t.proveedor.id = :proveedorId AND t.estado = 'EN_CURSO'")
    Trabajo findTrabajoEnCursoByProveedorId(@Param("proveedorId") Long proveedorId);

    @Query("SELECT t FROM Trabajo t WHERE t.estado = 'PENDIENTE' AND t.proveedorNotificadoId IS NULL AND t.oficio.id = :oficioId")
    List<Trabajo> findTrabajosPendientesSinAsignar(@Param("oficioId") Long oficioId);

    Long countByProveedorIdAndEstado(Long proveedorId, TrabajoEstado estado);

    @Query("SELECT COUNT(t) FROM Trabajo t WHERE t.proveedor.id = :proveedorId AND t.estado IN ('EN_CURSO', 'EN_COLA')")
    int countTrabajosActivosYCola(@Param("proveedorId") Long proveedorId);

    @EntityGraph(attributePaths = {"cliente", "proveedor", "oficio"})
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

    List<Trabajo> findByEstado(TrabajoEstado estado);

    @Query("SELECT t FROM Trabajo t WHERE t.estado = 'PENDIENTE' AND t.createdAt < :umbral ORDER BY t.createdAt ASC")
    List<Trabajo> findTrabajosVarados(@Param("umbral") java.time.LocalDateTime umbral);

    @EntityGraph(attributePaths = {"cliente", "proveedor", "oficio"})
    @Query("""
        SELECT t FROM Trabajo t
        JOIN TrabajoOferta o ON o.trabajo = t
        WHERE t.estado = com.aliados.backend.entity.TrabajoEstado.PENDIENTE
          AND t.oficio.id = :oficioId
          AND o.proveedor.id = :proveedorId
          AND o.resultado = com.aliados.backend.entity.ResultadoOferta.OFRECIDA
        """)
    List<Trabajo> findPendientesOfrecidosA(@Param("proveedorId") Long proveedorId, @Param("oficioId") Long oficioId);

    @Query("SELECT t.oficio.nombre, t.oficio.icono, COUNT(t) FROM Trabajo t GROUP BY t.oficio.nombre, t.oficio.icono ORDER BY COUNT(t) DESC")
    List<Object[]> countTrabajosGroupByOficio();
}
