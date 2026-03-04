package com.aliados.backend.repository;

import com.aliados.backend.entity.Oficio;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
public interface OficioRepository extends JpaRepository<Oficio, Long> {
    List<Oficio> findByActivoTrue();
}