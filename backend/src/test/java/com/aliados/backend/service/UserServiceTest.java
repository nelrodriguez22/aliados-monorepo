package com.aliados.backend.service;

import com.aliados.backend.dto.RegisterDTO;
import com.aliados.backend.dto.UserResponseDTO;
import com.aliados.backend.entity.User;
import com.aliados.backend.entity.UserRole;
import com.aliados.backend.exception.ForbiddenException;
import com.aliados.backend.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class UserServiceTest {

    @Mock UserRepository userRepository;
    @InjectMocks UserService service;

    private User cliente(String uid) {
        User u = new User();
        u.setId(1L);
        u.setFirebaseUid(uid);
        u.setRole(UserRole.CLIENT);
        u.setEmail("ana@test.local");
        u.setNombre("Ana");
        return u;
    }

    @Test
    void findUserByFirebaseUid_existe_devuelvePresenteConRegisteredTrue() {
        when(userRepository.findByFirebaseUid("uid-1")).thenReturn(Optional.of(cliente("uid-1")));

        Optional<UserResponseDTO> result = service.findUserByFirebaseUid("uid-1");

        assertThat(result).isPresent();
        assertThat(result.get().getRegistered()).isTrue();
        assertThat(result.get().getNombre()).isEqualTo("Ana");
    }

    @Test
    void findUserByFirebaseUid_noExiste_devuelveEmpty() {
        when(userRepository.findByFirebaseUid("desconocido")).thenReturn(Optional.empty());

        Optional<UserResponseDTO> result = service.findUserByFirebaseUid("desconocido");

        assertThat(result).isEmpty();
    }

    // SEC-1: nadie puede auto-asignarse el rol ADMIN vía el registro público.
    @Test
    void registerUser_conRoleAdmin_lanzaForbiddenYNoPersiste() {
        RegisterDTO dto = new RegisterDTO();
        dto.setFirebaseUid("uid-attacker");
        dto.setEmail("attacker@test.local");
        dto.setNombre("Mallory");
        dto.setRole(UserRole.ADMIN);

        assertThatThrownBy(() -> service.registerUser(dto))
                .isInstanceOf(ForbiddenException.class);

        verify(userRepository, never()).save(org.mockito.ArgumentMatchers.any());
    }
}
