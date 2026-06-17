package com.aliados.backend.repository;

import com.aliados.backend.entity.Calificacion;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface CalificacionRepository extends JpaRepository<Calificacion, Long> {

    Optional<Calificacion> findByTrabajoId(Long trabajoId);

    List<Calificacion> findByProveedorIdOrderByCreatedAtDesc(Long proveedorId);

    boolean existsByTrabajoId(Long trabajoId);

    @Query("SELECT AVG(c.estrellas) FROM Calificacion c WHERE c.proveedor.id = :proveedorId")
    Double getPromedioByProveedorId(Long proveedorId);

    // Promedios de varios proveedores en un solo query (evita N+1 al armar listas).
    // Devuelve filas [proveedorId(Long), promedio(Double)].
    @Query("SELECT c.proveedor.id, AVG(c.estrellas) FROM Calificacion c WHERE c.proveedor.id IN :ids GROUP BY c.proveedor.id")
    List<Object[]> getPromediosByProveedorIds(@Param("ids") List<Long> ids);

    @Query("SELECT COUNT(c) FROM Calificacion c WHERE c.proveedor.id = :proveedorId")
    Long getCantidadByProveedorId(Long proveedorId);

    Long countByProveedorId(Long proveedorId);

    List<Calificacion> findByTrabajoIdIn(List<Long> trabajoIds);

    @Query("SELECT AVG(c.estrellas) FROM Calificacion c")
    Double getPromedioGlobal();

    List<Calificacion> findTop10ByOrderByCreatedAtDesc();

    @Query("SELECT c.proveedor.id, c.proveedor.nombre, c.proveedor.fotoPerfil, AVG(c.estrellas), COUNT(c) FROM Calificacion c GROUP BY c.proveedor.id, c.proveedor.nombre, c.proveedor.fotoPerfil HAVING AVG(c.estrellas) < :umbral AND COUNT(c) >= :min ORDER BY AVG(c.estrellas) ASC")
    List<Object[]> findProveedoresConCalificacionBaja(@Param("umbral") double umbral, @Param("min") long min);
}