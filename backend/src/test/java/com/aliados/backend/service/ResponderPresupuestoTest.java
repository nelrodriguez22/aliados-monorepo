package com.aliados.backend.service;

import com.aliados.backend.dto.TrabajoResponseDTO;
import com.aliados.backend.entity.EstadoPago;
import com.aliados.backend.entity.Oficio;
import com.aliados.backend.entity.Trabajo;
import com.aliados.backend.entity.TrabajoEstado;
import com.aliados.backend.entity.User;
import com.aliados.backend.entity.UserRole;
import com.aliados.backend.exception.ForbiddenException;
import com.aliados.backend.repository.CalificacionRepository;
import com.aliados.backend.repository.OficioRepository;
import com.aliados.backend.repository.TrabajoOfertaRepository;
import com.aliados.backend.repository.TrabajoRepository;
import com.aliados.backend.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ResponderPresupuestoTest {

    @Mock TrabajoRepository trabajoRepository;
    @Mock UserRepository userRepository;
    @Mock OficioRepository oficioRepository;
    @Mock UserService userService;
    @Mock CalificacionRepository calificacionRepository;
    @Mock NotificacionService notificacionService;
    @Mock ProviderScoreService providerScoreService;
    @Mock CloudinaryService cloudinaryService;
    @Mock FeatureFlagService featureFlagService;
    @Mock TrabajoOfertaRepository trabajoOfertaRepository;

    @InjectMocks TrabajoService trabajoService;

    private User user(long id, String uid, UserRole role) {
        User u = new User();
        u.setId(id); u.setFirebaseUid(uid); u.setRole(role); u.setNombre("user-" + id);
        return u;
    }

    private Trabajo presupuestado(User cliente, User prov) {
        Oficio of = new Oficio(); of.setId(1L); of.setNombre("Electricista");
        Trabajo t = new Trabajo();
        t.setId(10L); t.setCliente(cliente); t.setProveedor(prov); t.setOficio(of);
        t.setEstado(TrabajoEstado.PRESUPUESTADO);
        t.setTarifaVisita(new BigDecimal("15000"));
        t.setMontoPresupuesto(new BigDecimal("100000"));
        t.setEstadoPago(EstadoPago.PENDIENTE_PAGO);
        return t;
    }

    @Test
    void aceptar_completaYPagaElPresupuesto() {
        User cliente = user(1L, "cli", UserRole.CLIENT);
        User prov = user(2L, "prov", UserRole.PROVIDER);
        Trabajo t = presupuestado(cliente, prov);
        when(userRepository.findByFirebaseUid("cli")).thenReturn(Optional.of(cliente));
        when(trabajoRepository.findById(10L)).thenReturn(Optional.of(t));
        when(trabajoRepository.findTrabajosEnCola(anyLong())).thenReturn(List.of());
        when(trabajoRepository.save(any(Trabajo.class))).thenAnswer(i -> i.getArgument(0));

        TrabajoResponseDTO dto = trabajoService.responderPresupuesto(10L, "cli", true);

        assertThat(t.getEstado()).isEqualTo(TrabajoEstado.COMPLETADO);
        assertThat(t.getPresupuestoAceptado()).isTrue();
        assertThat(t.getMontoPagado()).isEqualByComparingTo("100000");
        assertThat(t.getEstadoPago()).isEqualTo(EstadoPago.PAGADO);
        assertThat(dto.getMontoPagado()).isEqualByComparingTo("100000");
    }

    @Test
    void rechazar_completaYPagaSoloLaVisita() {
        User cliente = user(1L, "cli", UserRole.CLIENT);
        User prov = user(2L, "prov", UserRole.PROVIDER);
        Trabajo t = presupuestado(cliente, prov);
        when(userRepository.findByFirebaseUid("cli")).thenReturn(Optional.of(cliente));
        when(trabajoRepository.findById(10L)).thenReturn(Optional.of(t));
        when(trabajoRepository.findTrabajosEnCola(anyLong())).thenReturn(List.of());
        when(trabajoRepository.save(any(Trabajo.class))).thenAnswer(i -> i.getArgument(0));

        trabajoService.responderPresupuesto(10L, "cli", false);

        assertThat(t.getEstado()).isEqualTo(TrabajoEstado.COMPLETADO);
        assertThat(t.getPresupuestoAceptado()).isFalse();
        assertThat(t.getMontoPagado()).isEqualByComparingTo("15000");
        assertThat(t.getEstadoPago()).isEqualTo(EstadoPago.PAGADO);
    }

    @Test
    void responder_noDuenoLanza403() {
        User cliente = user(1L, "cli", UserRole.CLIENT);
        User prov = user(2L, "prov", UserRole.PROVIDER);
        User otro = user(3L, "otro", UserRole.CLIENT);
        Trabajo t = presupuestado(cliente, prov);
        when(userRepository.findByFirebaseUid("otro")).thenReturn(Optional.of(otro));
        when(trabajoRepository.findById(10L)).thenReturn(Optional.of(t));

        assertThatThrownBy(() -> trabajoService.responderPresupuesto(10L, "otro", true))
                .isInstanceOf(ForbiddenException.class);
    }

    @Test
    void responder_estadoInvalidoLanza() {
        User cliente = user(1L, "cli", UserRole.CLIENT);
        User prov = user(2L, "prov", UserRole.PROVIDER);
        Trabajo t = presupuestado(cliente, prov);
        t.setEstado(TrabajoEstado.EN_CURSO);
        when(userRepository.findByFirebaseUid("cli")).thenReturn(Optional.of(cliente));
        when(trabajoRepository.findById(10L)).thenReturn(Optional.of(t));

        assertThatThrownBy(() -> trabajoService.responderPresupuesto(10L, "cli", true))
                .isInstanceOf(RuntimeException.class);
    }
}
