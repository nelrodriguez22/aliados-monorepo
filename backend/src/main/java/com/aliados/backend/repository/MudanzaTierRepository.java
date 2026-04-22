package com.aliados.backend.repository;

import com.aliados.backend.entity.MudanzaTier;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface MudanzaTierRepository extends JpaRepository<MudanzaTier, Long> {

    List<MudanzaTier> findByActivoTrueOrderByOrdenAsc();
}
