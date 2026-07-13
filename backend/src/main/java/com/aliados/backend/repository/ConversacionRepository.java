package com.aliados.backend.repository;

import com.aliados.backend.entity.Conversacion;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface ConversacionRepository extends JpaRepository<Conversacion, Long> {
    Optional<Conversacion> findByTrabajoId(Long trabajoId);
    Optional<Conversacion> findByMudanzaId(Long mudanzaId);

    // Batch: para mapear DTO de LISTAS de trabajos/mudanzas sin una query por fila (N+1).
    List<Conversacion> findByTrabajoIdIn(Collection<Long> trabajoIds);
    List<Conversacion> findByMudanzaIdIn(Collection<Long> mudanzaIds);
}
