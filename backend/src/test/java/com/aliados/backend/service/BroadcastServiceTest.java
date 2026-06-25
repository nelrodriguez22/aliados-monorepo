package com.aliados.backend.service;

import com.aliados.backend.entity.TipoNotificacion;
import com.aliados.backend.entity.UserRole;
import com.aliados.backend.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class BroadcastServiceTest {

    @Mock UserRepository userRepository;
    @Mock NotificacionService notificacionService;

    @InjectMocks BroadcastService broadcastService;

    @Test
    void resolverDestinatarios_todos_usaClientesYProveedores() {
        broadcastService.resolverDestinatarios("TODOS");
        verify(userRepository).findByRoleInAndActivoTrue(List.of(UserRole.CLIENT, UserRole.PROVIDER));
    }

    @Test
    void resolverDestinatarios_clientes() {
        broadcastService.resolverDestinatarios("CLIENTES");
        verify(userRepository).findByRoleInAndActivoTrue(List.of(UserRole.CLIENT));
    }

    @Test
    void resolverDestinatarios_proveedores() {
        broadcastService.resolverDestinatarios("PROVEEDORES");
        verify(userRepository).findByRoleInAndActivoTrue(List.of(UserRole.PROVIDER));
    }

    @Test
    void resolverDestinatarios_invalido_lanza() {
        assertThatThrownBy(() -> broadcastService.resolverDestinatarios("XXX"))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void enviarAsync_notificaACadaUid_conTipoAnuncio() {
        broadcastService.enviarAsync(List.of("u1", "u2"), "Titulo", "Mensaje", "admin-uid");
        verify(notificacionService).enviarNotificacion("u1", TipoNotificacion.ANUNCIO, "Titulo", "Mensaje", null, null);
        verify(notificacionService).enviarNotificacion("u2", TipoNotificacion.ANUNCIO, "Titulo", "Mensaje", null, null);
    }

    @Test
    void enviarAsync_unFalloNoCortaElResto() {
        doThrow(new RuntimeException("boom")).when(notificacionService)
                .enviarNotificacion(eq("u1"), any(), any(), any(), any(), any());
        broadcastService.enviarAsync(List.of("u1", "u2"), "Titulo", "Mensaje", "admin-uid");
        verify(notificacionService).enviarNotificacion("u2", TipoNotificacion.ANUNCIO, "Titulo", "Mensaje", null, null);
    }
}
