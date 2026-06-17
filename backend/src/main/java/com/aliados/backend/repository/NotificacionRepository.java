package com.aliados.backend.repository;

import com.aliados.backend.entity.Notificacion;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface NotificacionRepository extends JpaRepository<Notificacion, Long> {
    List<Notificacion> findByUsuarioIdOrderByCreatedAtDesc(Long userId);
    Long countByUsuarioIdAndLeidaFalse(Long userId);

    // Marca como leídas en un solo UPDATE, en vez de traer + setear + saveAll.
    @Modifying
    @Query("UPDATE Notificacion n SET n.leida = true WHERE n.usuario.id = :userId AND n.leida = false")
    int marcarTodasComoLeidas(@Param("userId") Long userId);
}
