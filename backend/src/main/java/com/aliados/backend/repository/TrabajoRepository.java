package com.aliados.backend.repository;

import com.aliados.backend.entity.Trabajo;
import com.aliados.backend.entity.TrabajoEstado;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

@Repository
public interface TrabajoRepository extends JpaRepository<Trabajo, Long> {

    // Listado admin: fetch de cliente/proveedor/oficio para evitar N+1 al mapear DTOs.
    // Sin parámetro nullable de estado (el filtro se hace en memoria en el service):
    // un ":estado IS NULL OR" acá repite el bug de tipado de Postgres documentado
    // en UsuarioAdminService#buscar.
    @Query("SELECT t FROM Trabajo t JOIN FETCH t.cliente LEFT JOIN FETCH t.proveedor " +
           "JOIN FETCH t.oficio ORDER BY t.createdAt DESC")
    List<Trabajo> findAllForAdmin();

    @Query("SELECT t FROM Trabajo t JOIN FETCH t.cliente LEFT JOIN FETCH t.proveedor " +
           "JOIN FETCH t.oficio WHERE t.id = :id")
    Optional<Trabajo> findByIdForAdmin(@Param("id") Long id);

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
    List<Trabajo> findByProveedorIdAndEstadoOrderByCompletedAtDesc(Long proveedorId, TrabajoEstado estado);

    // Historial del proveedor paginado (#20-B). El orden lo define el Pageable (completedAt DESC).
    @EntityGraph(attributePaths = {"cliente", "proveedor", "oficio"})
    Page<Trabajo> findByProveedorIdAndEstado(Long proveedorId, TrabajoEstado estado, Pageable pageable);

    // "Trabajo actual" del proveedor: EN_CURSO o PRESUPUESTADO (el proveedor sigue OCUPADO
    // en el domicilio esperando la respuesta del cliente al presupuesto — decisión 5 del
    // spec de presupuesto post-visita). A lo sumo uno de los dos existe por proveedor a la
    // vez (aceptarPropuesta empuja a EN_COLA si ya hay uno), así que el single-result es seguro.
    @EntityGraph(attributePaths = {"cliente", "proveedor", "oficio"})
    @Query("SELECT t FROM Trabajo t WHERE t.proveedor.id = :proveedorId AND t.estado IN ('EN_CURSO', 'PRESUPUESTADO')")
    Trabajo findTrabajoEnCursoByProveedorId(@Param("proveedorId") Long proveedorId);

    Long countByProveedorIdAndEstado(Long proveedorId, TrabajoEstado estado);

    // Incluye PRESUPUESTADO: el proveedor sigue ocupando su cupo mientras el cliente
    // decide sobre el presupuesto (mismo motivo que arriba).
    @Query("SELECT COUNT(t) FROM Trabajo t WHERE t.proveedor.id = :proveedorId AND t.estado IN ('EN_CURSO', 'EN_COLA', 'PRESUPUESTADO')")
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

    @Query("""
        SELECT t FROM Trabajo t
        WHERE t.estado = com.aliados.backend.entity.TrabajoEstado.PENDIENTE
          AND t.oficio.id = :oficioId
          AND NOT EXISTS (SELECT 1 FROM TrabajoOferta o WHERE o.trabajo = t AND o.proveedor.id = :proveedorId)
        """)
    List<Trabajo> findPendientesSinOfertaPara(@Param("oficioId") Long oficioId, @Param("proveedorId") Long proveedorId);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Transactional
    @Query("""
        UPDATE Trabajo t SET t.estado = com.aliados.backend.entity.TrabajoEstado.PROPUESTO
        WHERE t.id = :id AND t.estado = com.aliados.backend.entity.TrabajoEstado.PENDIENTE
        """)
    int tomarTrabajoSiPendiente(@Param("id") Long id);
}
