package com.aliados.backend.service;

import com.aliados.backend.dto.TrabajoResponseDTO;
import com.aliados.backend.entity.EstadoPago;
import com.aliados.backend.entity.Oficio;
import com.aliados.backend.entity.Trabajo;
import com.aliados.backend.entity.TrabajoEstado;
import com.aliados.backend.entity.TipoNotificacion;
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
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PresupuestoTrabajoTest {

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

    private Trabajo enCurso(User cliente, User proveedor) {
        Oficio of = new Oficio(); of.setId(1L); of.setNombre("Electricista");
        Trabajo t = new Trabajo();
        t.setId(10L); t.setCliente(cliente); t.setProveedor(proveedor);
        t.setOficio(of); t.setEstado(TrabajoEstado.EN_CURSO);
        t.setTarifaVisita(new BigDecimal("15000"));
        return t;
    }

    @Test
    void presupuestar_pasaAPresupuestadoYSeteaCampos() {
        User cliente = user(1L, "cli", UserRole.CLIENT);
        User prov = user(2L, "prov", UserRole.PROVIDER);
        Trabajo t = enCurso(cliente, prov);
        when(userRepository.findByFirebaseUid("prov")).thenReturn(Optional.of(prov));
        when(trabajoRepository.findById(10L)).thenReturn(Optional.of(t));
        when(trabajoRepository.save(any(Trabajo.class))).thenAnswer(i -> i.getArgument(0));

        TrabajoResponseDTO dto = trabajoService.presupuestarTrabajo(10L, "prov", new BigDecimal("100000"), "Cambio de tablero");

        assertThat(t.getEstado()).isEqualTo(TrabajoEstado.PRESUPUESTADO);
        assertThat(t.getMontoPresupuesto()).isEqualByComparingTo("100000");
        assertThat(t.getNotaResumen()).isEqualTo("Cambio de tablero");
        assertThat(t.getEstadoPago()).isEqualTo(EstadoPago.PENDIENTE_PAGO);
        assertThat(dto.getEstadoPago()).isEqualTo(EstadoPago.PENDIENTE_PAGO);

        verify(notificacionService).enviarNotificacion(
                eq("cli"),
                eq(TipoNotificacion.PRESUPUESTO_RECIBIDO),
                anyString(),
                anyString(),
                eq(10L),
                eq("/cliente/seguimiento/10"));
    }

    @Test
    void presupuestar_noDuenoLanza403() {
        User cliente = user(1L, "cli", UserRole.CLIENT);
        User prov = user(2L, "prov", UserRole.PROVIDER);
        User otro = user(3L, "otro", UserRole.PROVIDER);
        Trabajo t = enCurso(cliente, prov);
        when(userRepository.findByFirebaseUid("otro")).thenReturn(Optional.of(otro));
        when(trabajoRepository.findById(10L)).thenReturn(Optional.of(t));

        assertThatThrownBy(() -> trabajoService.presupuestarTrabajo(10L, "otro", new BigDecimal("100000"), null))
                .isInstanceOf(ForbiddenException.class);

        verify(trabajoRepository, never()).save(any(Trabajo.class));
    }

    @Test
    void presupuestar_estadoInvalidoLanza() {
        User cliente = user(1L, "cli", UserRole.CLIENT);
        User prov = user(2L, "prov", UserRole.PROVIDER);
        Trabajo t = enCurso(cliente, prov);
        t.setEstado(TrabajoEstado.COMPLETADO);
        when(userRepository.findByFirebaseUid("prov")).thenReturn(Optional.of(prov));
        when(trabajoRepository.findById(10L)).thenReturn(Optional.of(t));

        assertThatThrownBy(() -> trabajoService.presupuestarTrabajo(10L, "prov", new BigDecimal("100000"), null))
                .isInstanceOf(RuntimeException.class);

        verify(trabajoRepository, never()).save(any(Trabajo.class));
    }
}
