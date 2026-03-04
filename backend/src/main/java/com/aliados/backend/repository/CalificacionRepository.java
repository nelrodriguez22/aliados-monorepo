package com.aliados.backend.repository;

import com.aliados.backend.entity.Calificacion;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;

public interface CalificacionRepository extends JpaRepository<Calificacion, Long> {

    Optional<Calificacion> findByTrabajoId(Long trabajoId);

    List<Calificacion> findByProveedorIdOrderByCreatedAtDesc(Long proveedorId);

    boolean existsByTrabajoId(Long trabajoId);

    @Query("SELECT AVG(c.estrellas) FROM Calificacion c WHERE c.proveedor.id = :proveedorId")
    Double getPromedioByProveedorId(Long proveedorId);

    @Query("SELECT COUNT(c) FROM Calificacion c WHERE c.proveedor.id = :proveedorId")
    Long getCantidadByProveedorId(Long proveedorId);

    Long countByProveedorId(Long proveedorId);

    List<Calificacion> findByTrabajoIdIn(List<Long> trabajoIds);

    @Query("SELECT AVG(c.estrellas) FROM Calificacion c")
    Double getPromedioGlobal();
}