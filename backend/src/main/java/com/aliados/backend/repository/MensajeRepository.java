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

    // Guarda contra mover el puntero de lectura a un id de otra conversación: si eso pasara,
    // contarNoLeidos quedaría en 0 para siempre (el puntero sólo avanza, nunca se corrige solo).
    boolean existsByIdAndConversacionId(Long id, Long conversacionId);
}
