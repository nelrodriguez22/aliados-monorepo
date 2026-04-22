package com.aliados.backend.repository;

import com.aliados.backend.entity.Mudanza;
import com.aliados.backend.entity.MudanzaEstado;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface MudanzaRepository extends JpaRepository<Mudanza, Long> {

    List<Mudanza> findByClienteFirebaseUidOrderByCreatedAtDesc(String firebaseUid);

    List<Mudanza> findByProveedorIdAndEstadoOrderByCompletedAtDesc(Long proveedorId, MudanzaEstado estado);

    @Query("SELECT m FROM Mudanza m WHERE m.proveedor.id = :proveedorId AND m.estado = 'EN_CURSO'")
    Mudanza findMudanzaEnCursoByProveedorId(@Param("proveedorId") Long proveedorId);

    @Query("SELECT m FROM Mudanza m WHERE m.estado = :estado ORDER BY m.createdAt ASC")
    List<Mudanza> findByEstadoOrderByCreatedAtAsc(@Param("estado") MudanzaEstado estado);

    long countByEstado(MudanzaEstado estado);
}
