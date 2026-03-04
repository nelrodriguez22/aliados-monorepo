package com.aliados.backend.repository;

import com.aliados.backend.entity.Notificacion;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface NotificacionRepository extends JpaRepository<Notificacion, Long> {
    List<Notificacion> findByUsuarioIdOrderByCreatedAtDesc(Long userId);
    Long countByUsuarioIdAndLeidaFalse(Long userId);
}
