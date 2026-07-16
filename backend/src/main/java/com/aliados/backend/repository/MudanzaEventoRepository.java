package com.aliados.backend.repository;

import com.aliados.backend.entity.MudanzaEvento;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface MudanzaEventoRepository extends JpaRepository<MudanzaEvento, Long> {
    List<MudanzaEvento> findByMudanzaIdOrderByIdAsc(Long mudanzaId);
}
