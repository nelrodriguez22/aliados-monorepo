package com.aliados.backend.repository;

import com.aliados.backend.entity.FavoritoProveedor;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface FavoritoProveedorRepository extends JpaRepository<FavoritoProveedor, Long> {

    boolean existsByCliente_IdAndProveedor_Id(Long clienteId, Long proveedorId);

    List<FavoritoProveedor> findByCliente_IdOrderByCreatedAtDesc(Long clienteId);

    void deleteByCliente_IdAndProveedor_Id(Long clienteId, Long proveedorId);

    List<FavoritoProveedor> findByCliente_IdAndProveedor_Oficio_Id(Long clienteId, Long oficioId);

    // Un trabajo COMPLETADO entre este cliente y proveedor habilita favoritearlo.
    @Query("SELECT COUNT(t) > 0 FROM Trabajo t " +
           "WHERE t.cliente.id = :clienteId AND t.proveedor.id = :proveedorId " +
           "AND t.estado = com.aliados.backend.entity.TrabajoEstado.COMPLETADO")
    boolean existeTrabajoCompletado(@Param("clienteId") Long clienteId, @Param("proveedorId") Long proveedorId);

    // Ids de los clientes que tienen a este proveedor como favorito (para destacar sus pedidos).
    @Query("SELECT f.cliente.id FROM FavoritoProveedor f WHERE f.proveedor.id = :proveedorId")
    List<Long> clientesIdsQueFavoritan(@Param("proveedorId") Long proveedorId);
}
