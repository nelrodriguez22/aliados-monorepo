package com.aliados.backend.service;

import com.aliados.backend.dto.FavoritoResponseDTO;
import com.aliados.backend.entity.FavoritoProveedor;
import com.aliados.backend.entity.User;
import com.aliados.backend.exception.NotFoundException;
import com.aliados.backend.repository.FavoritoProveedorRepository;
import com.aliados.backend.repository.UserRepository;
import com.aliados.backend.util.CodigoProveedor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class FavoritoService {

    private final FavoritoProveedorRepository favoritoRepository;
    private final UserRepository userRepository;

    public FavoritoService(FavoritoProveedorRepository favoritoRepository,
                           UserRepository userRepository) {
        this.favoritoRepository = favoritoRepository;
        this.userRepository = userRepository;
    }

    @Transactional
    public void agregar(String clienteUid, Long proveedorId) {
        User cliente = userRepository.findByFirebaseUid(clienteUid)
                .orElseThrow(() -> new NotFoundException("Cliente no encontrado"));
        if (!favoritoRepository.existeTrabajoCompletado(cliente.getId(), proveedorId)) {
            throw new RuntimeException("Solo podés favoritear a un proveedor con el que completaste un trabajo.");
        }
        if (favoritoRepository.existsByCliente_IdAndProveedor_Id(cliente.getId(), proveedorId)) {
            return; // idempotente
        }
        User proveedor = userRepository.findById(proveedorId)
                .orElseThrow(() -> new NotFoundException("Proveedor no encontrado"));
        FavoritoProveedor f = new FavoritoProveedor();
        f.setCliente(cliente);
        f.setProveedor(proveedor);
        favoritoRepository.save(f);
    }

    @Transactional
    public void quitar(String clienteUid, Long proveedorId) {
        User cliente = userRepository.findByFirebaseUid(clienteUid)
                .orElseThrow(() -> new NotFoundException("Cliente no encontrado"));
        favoritoRepository.deleteByCliente_IdAndProveedor_Id(cliente.getId(), proveedorId);
    }

    @Transactional(readOnly = true)
    public List<FavoritoResponseDTO> listar(String clienteUid) {
        User cliente = userRepository.findByFirebaseUid(clienteUid)
                .orElseThrow(() -> new NotFoundException("Cliente no encontrado"));
        return favoritoRepository.findByCliente_IdOrderByCreatedAtDesc(cliente.getId()).stream()
                .map(f -> {
                    User p = f.getProveedor();
                    String oficioNombre = p.getOficio() != null ? p.getOficio().getNombre() : null;
                    return new FavoritoResponseDTO(
                            p.getId(),
                            p.getNombre(),
                            p.getOficio() != null ? p.getOficio().getId() : null,
                            oficioNombre,
                            p.getPromedioCalificacion() != null ? p.getPromedioCalificacion() : 0.0,
                            p.getCantidadCalificaciones() != null ? p.getCantidadCalificaciones() : 0L,
                            p.getStatus() != null ? p.getStatus().name() : "OFFLINE",
                            CodigoProveedor.format(oficioNombre, p.getId()));
                })
                .toList();
    }

    @Transactional(readOnly = true)
    public List<Long> idsFavoritosPorOficio(Long clienteId, Long oficioId) {
        return favoritoRepository.findByCliente_IdAndProveedor_Oficio_Id(clienteId, oficioId).stream()
                .map(f -> f.getProveedor().getId())
                .toList();
    }

    @Transactional(readOnly = true)
    public boolean esFavorito(Long clienteId, Long proveedorId) {
        return favoritoRepository.existsByCliente_IdAndProveedor_Id(clienteId, proveedorId);
    }
}
