package com.aliados.backend.repository;

import com.aliados.backend.entity.LecturaConversacion;
import com.aliados.backend.entity.LecturaConversacionId;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface LecturaConversacionRepository
        extends JpaRepository<LecturaConversacion, LecturaConversacionId> {

    Optional<LecturaConversacion> findByConversacionIdAndUsuarioId(Long conversacionId, Long usuarioId);
}
