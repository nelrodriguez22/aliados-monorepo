package com.aliados.backend.service;

import com.aliados.backend.entity.User;
import com.aliados.backend.entity.UserRole;
import com.aliados.backend.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.NoSuchElementException;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class UsuarioAdminServiceTest {

    @Mock UserRepository userRepository;
    @InjectMocks UsuarioAdminService service;

    private User user(Long id, UserRole role) {
        User u = new User();
        u.setId(id);
        u.setRole(role);
        u.setActivo(true);
        return u;
    }

    @Test
    void actualizarActivo_suspendeCliente() {
        User u = user(1L, UserRole.CLIENT);
        when(userRepository.findById(1L)).thenReturn(Optional.of(u));
        when(userRepository.save(u)).thenReturn(u);

        service.actualizarActivo(1L, false);

        assertThat(u.getActivo()).isFalse();
        verify(userRepository).save(u);
    }

    @Test
    void actualizarActivo_admin_lanzaIllegalArgument() {
        User u = user(1L, UserRole.ADMIN);
        when(userRepository.findById(1L)).thenReturn(Optional.of(u));

        assertThatThrownBy(() -> service.actualizarActivo(1L, false))
                .isInstanceOf(IllegalArgumentException.class);
        verify(userRepository, never()).save(any());
    }

    @Test
    void actualizarActivo_noExiste_lanzaNoSuchElement() {
        when(userRepository.findById(99L)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.actualizarActivo(99L, false))
                .isInstanceOf(NoSuchElementException.class);
    }

    @Test
    void buscar_normalizaQEnBlancoANull() {
        service.buscar("  ", UserRole.CLIENT);
        verify(userRepository).searchUsuarios(null, UserRole.CLIENT);
    }
}
