package com.aliados.backend.service;

import com.aliados.backend.entity.FavoritoProveedor;
import com.aliados.backend.entity.User;
import com.aliados.backend.repository.FavoritoProveedorRepository;
import com.aliados.backend.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class FavoritoServiceTest {

    @Mock FavoritoProveedorRepository favoritoRepository;
    @Mock UserRepository userRepository;
    @InjectMocks FavoritoService favoritoService;

    User cliente, proveedor;

    @BeforeEach
    void setup() {
        cliente = new User(); cliente.setId(1L); cliente.setFirebaseUid("cli-uid");
        proveedor = new User(); proveedor.setId(2L);
        when(userRepository.findByFirebaseUid("cli-uid")).thenReturn(Optional.of(cliente));
    }

    @Test
    void agregar_falla_si_no_hay_trabajo_completado() {
        when(favoritoRepository.existeTrabajoCompletado(1L, 2L)).thenReturn(false);
        assertThrows(RuntimeException.class, () -> favoritoService.agregar("cli-uid", 2L));
        verify(favoritoRepository, never()).save(any());
    }

    @Test
    void agregar_es_idempotente() {
        when(favoritoRepository.existeTrabajoCompletado(1L, 2L)).thenReturn(true);
        when(favoritoRepository.existsByCliente_IdAndProveedor_Id(1L, 2L)).thenReturn(true);
        favoritoService.agregar("cli-uid", 2L);
        verify(favoritoRepository, never()).save(any());
    }

    @Test
    void agregar_guarda_cuando_hay_trabajo_completado() {
        when(favoritoRepository.existeTrabajoCompletado(1L, 2L)).thenReturn(true);
        when(favoritoRepository.existsByCliente_IdAndProveedor_Id(1L, 2L)).thenReturn(false);
        when(userRepository.findById(2L)).thenReturn(Optional.of(proveedor));
        favoritoService.agregar("cli-uid", 2L);
        verify(favoritoRepository).save(any(FavoritoProveedor.class));
    }
}
