package com.aliados.backend.service;

import com.aliados.backend.dto.RegisterDTO;
import com.aliados.backend.dto.UserResponseDTO;
import com.aliados.backend.entity.User;
import com.aliados.backend.entity.UserRole;
import com.aliados.backend.exception.ForbiddenException;
import com.aliados.backend.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
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
    @Mock EmailService emailService;
    @InjectMocks UserService service;

    @BeforeEach
    void initFrontendUrl() {
        org.springframework.test.util.ReflectionTestUtils.setField(service, "frontendUrl", "https://app.test");
    }

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

    @Test
    void forgotPassword_emailNull_noEnviaNada() {
        service.forgotPassword(null);
        service.forgotPassword("   ");
        org.mockito.Mockito.verifyNoInteractions(emailService);
    }

    @Test
    void forgotPassword_emailInexistenteEnFirebase_silencioso() throws Exception {
        try (org.mockito.MockedStatic<com.google.firebase.auth.FirebaseAuth> fb =
                     org.mockito.Mockito.mockStatic(com.google.firebase.auth.FirebaseAuth.class)) {
            com.google.firebase.auth.FirebaseAuth fa = org.mockito.Mockito.mock(com.google.firebase.auth.FirebaseAuth.class);
            fb.when(com.google.firebase.auth.FirebaseAuth::getInstance).thenReturn(fa);
            org.mockito.Mockito.when(fa.generatePasswordResetLink("nadie@test.local"))
                    .thenThrow(new RuntimeException("no such user"));

            service.forgotPassword("nadie@test.local");

            org.mockito.Mockito.verifyNoInteractions(emailService);
        }
    }

    @Test
    void forgotPassword_emailValido_generaLinkYManda() throws Exception {
        try (org.mockito.MockedStatic<com.google.firebase.auth.FirebaseAuth> fb =
                     org.mockito.Mockito.mockStatic(com.google.firebase.auth.FirebaseAuth.class)) {
            com.google.firebase.auth.FirebaseAuth fa = org.mockito.Mockito.mock(com.google.firebase.auth.FirebaseAuth.class);
            fb.when(com.google.firebase.auth.FirebaseAuth::getInstance).thenReturn(fa);
            org.mockito.Mockito.when(fa.generatePasswordResetLink("ana@test.local"))
                    .thenReturn("https://x/__/auth/action?mode=resetPassword&oobCode=ABC&apiKey=KEY");

            User ana = new User();
            ana.setEmail("ana@test.local");
            ana.setNombre("Ana");
            when(userRepository.findByEmail("ana@test.local")).thenReturn(Optional.of(ana));

            service.forgotPassword("ana@test.local");

            org.mockito.ArgumentCaptor<String> link = org.mockito.ArgumentCaptor.forClass(String.class);
            verify(emailService).sendPasswordResetEmail(
                    org.mockito.ArgumentMatchers.eq("ana@test.local"),
                    org.mockito.ArgumentMatchers.eq("Ana"),
                    link.capture());
            assertThat(link.getValue())
                    .isEqualTo("https://app.test/restablecer-contrasena?mode=resetPassword&oobCode=ABC&apiKey=KEY");
        }
    }
}
