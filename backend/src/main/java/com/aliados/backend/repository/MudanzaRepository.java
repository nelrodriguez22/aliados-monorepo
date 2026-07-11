package com.aliados.backend.repository;

import com.aliados.backend.entity.Mudanza;
import com.aliados.backend.entity.MudanzaEstado;
import com.aliados.backend.entity.MudanzaTurno;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

@Repository
public interface MudanzaRepository extends JpaRepository<Mudanza, Long> {

    @Query("SELECT m FROM Mudanza m JOIN FETCH m.cliente LEFT JOIN FETCH m.proveedor " +
           "ORDER BY m.createdAt DESC")
    List<Mudanza> findAllForAdmin();

    @Query("SELECT m FROM Mudanza m JOIN FETCH m.cliente LEFT JOIN FETCH m.proveedor " +
           "WHERE m.id = :id")
    Optional<Mudanza> findByIdForAdmin(@Param("id") Long id);

    // @EntityGraph: trae las asociaciones que usa el DTO en una sola query (evita N+1).
    // Incluye "proveedor.oficio" porque mapToDTO lee m.getProveedor().getOficio().getNombre().
    @EntityGraph(attributePaths = {"cliente", "proveedor", "proveedor.oficio", "tier", "tierOriginal"})
    List<Mudanza> findByClienteFirebaseUidOrderByCreatedAtDesc(String firebaseUid);

    @EntityGraph(attributePaths = {"cliente", "proveedor", "proveedor.oficio", "tier", "tierOriginal"})
    List<Mudanza> findByProveedorIdAndEstadoOrderByCompletedAtDesc(Long proveedorId, MudanzaEstado estado);

    @EntityGraph(attributePaths = {"cliente", "proveedor", "proveedor.oficio", "tier", "tierOriginal"})
    @Query("SELECT m FROM Mudanza m WHERE m.proveedor.id = :proveedorId AND m.estado = 'EN_CURSO'")
    Mudanza findMudanzaEnCursoByProveedorId(@Param("proveedorId") Long proveedorId);

    @EntityGraph(attributePaths = {"cliente", "proveedor", "proveedor.oficio", "tier", "tierOriginal"})
    @Query("SELECT m FROM Mudanza m WHERE m.estado = :estado ORDER BY m.createdAt ASC")
    List<Mudanza> findByEstadoOrderByCreatedAtAsc(@Param("estado") MudanzaEstado estado);

    long countByEstado(MudanzaEstado estado);

    // Contar mudanzas agendadas (aceptadas o en curso) para una fecha
    @Query("SELECT COUNT(m) FROM Mudanza m WHERE m.fechaConfirmada = :fecha AND m.estado NOT IN ('CANCELADO', 'COMPLETADO', 'PENDIENTE', 'RESERVADO')")
    long countMudanzasAgendadasEnFecha(@Param("fecha") LocalDate fecha);

    boolean existsByFechaConfirmadaAndTurnoAndEstadoNotIn(LocalDate fechaConfirmada, MudanzaTurno turno, List<MudanzaEstado> estados);

    @EntityGraph(attributePaths = {"cliente", "proveedor", "proveedor.oficio", "tier", "tierOriginal"})
    List<Mudanza> findByProveedorIdAndEstadoIn(Long proveedorId, List<MudanzaEstado> estados);
}
