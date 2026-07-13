package com.aliados.backend.repository;

import com.aliados.backend.entity.Mensaje;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface MensajeRepository extends JpaRepository<Mensaje, Long> {

    // Descendente: la página 0 son los mensajes MÁS RECIENTES (el chat se lee de abajo hacia
    // arriba, y el scroll infinito pide páginas hacia el pasado).
    Page<Mensaje> findByConversacionIdOrderByIdDesc(Long conversacionId, Pageable pageable);

    // No leídos = mensajes posteriores al puntero. Un COUNT, sin recorrer filas.
    long countByConversacionIdAndIdGreaterThan(Long conversacionId, Long ultimoLeidoId);

    long countByConversacionId(Long conversacionId);
}
