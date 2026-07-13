package com.aliados.backend.repository;

import com.aliados.backend.entity.Conversacion;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface ConversacionRepository extends JpaRepository<Conversacion, Long> {
    Optional<Conversacion> findByTrabajoId(Long trabajoId);
    Optional<Conversacion> findByMudanzaId(Long mudanzaId);
}
