package com.aliados.backend.service;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.messaging.simp.user.SimpUser;
import org.springframework.messaging.simp.user.SimpUserRegistry;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PresenciaServiceTest {

    @Mock SimpUserRegistry simpUserRegistry;
    @Mock SimpUser simpUser;

    @InjectMocks PresenciaService presenciaService;

    @Test
    void conSesionStompActiva_estaConectado() {
        when(simpUserRegistry.getUser("uid-123")).thenReturn(simpUser);
        assertThat(presenciaService.estaConectado("uid-123")).isTrue();
    }

    @Test
    void sinSesionStomp_noEstaConectado() {
        when(simpUserRegistry.getUser("uid-123")).thenReturn(null);
        assertThat(presenciaService.estaConectado("uid-123")).isFalse();
    }

    @Test
    void uidNull_noEstaConectado() {
        assertThat(presenciaService.estaConectado(null)).isFalse();
    }
}
