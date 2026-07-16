package com.aliados.backend.service;

import com.aliados.backend.entity.ActorTipo;
import com.aliados.backend.entity.EstadoPago;
import com.aliados.backend.entity.Oficio;
import com.aliados.backend.entity.TipoEvento;
import com.aliados.backend.entity.Trabajo;
import com.aliados.backend.entity.TrabajoEstado;
import com.aliados.backend.entity.User;
import com.aliados.backend.entity.UserRole;
import com.aliados.backend.repository.CalificacionRepository;
import com.aliados.backend.repository.ConversacionRepository;
import com.aliados.backend.repository.OficioRepository;
import com.aliados.backend.repository.TrabajoOfertaRepository;
import com.aliados.backend.repository.TrabajoRepository;
import com.aliados.backend.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InOrder;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Eventos del tramo de cierre. Lo central acá es el ACTOR: la misma transición
 * a COMPLETADO o CANCELADO la ejecutan personas distintas (o el sistema) según
 * el camino — exactamente la información que la tabla viene a capturar.
 */
@ExtendWith(MockitoExtension.class)
class TrabajoEventoCierreTest {

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
    @Mock ConversacionService conversacionService;
    @Mock ConversacionRepository conversacionRepository;
    @Mock EventoService eventoService;

    @InjectMocks TrabajoService trabajoService;

    private User user(long id, String uid, UserRole role) {
        User u = new User();
        u.setId(id); u.setFirebaseUid(uid); u.setRole(role); u.setNombre("user-" + id);
        return u;
    }

    private Trabajo trabajo(long id, User cliente, User prov, TrabajoEstado estado) {
        Oficio of = new Oficio(); of.setId(1L); of.setNombre("Electricista");
        Trabajo t = new Trabajo();
        t.setId(id); t.setCliente(cliente); t.setProveedor(prov); t.setOficio(of); t.setEstado(estado);
        return t;
    }

    @Test
    void presupuestar_registraProveedorComoActor() {
        User cliente = user(1L, "cli", UserRole.CLIENT);
        User prov = user(2L, "prov", UserRole.PROVIDER);
        Trabajo t = trabajo(10L, cliente, prov, TrabajoEstado.EN_CURSO);
        when(userRepository.findByFirebaseUid("prov")).thenReturn(Optional.of(prov));
        when(trabajoRepository.findById(10L)).thenReturn(Optional.of(t));
        when(trabajoRepository.save(any(Trabajo.class))).thenAnswer(i -> i.getArgument(0));

        trabajoService.presupuestarTrabajo(10L, "prov", new BigDecimal("90000"), "cambio de térmica");

        // Verifica que se emiten DOS eventos en orden: CAMBIO_ESTADO (EN_CURSO→PRESUPUESTADO)
        // seguido de CAMBIO_ESTADO_PAGO (∅→PENDIENTE_PAGO), que inaugura el eje de pago.
        InOrder orden = inOrder(eventoService);
        orden.verify(eventoService).registrarTrabajo(any(Trabajo.class), eq(TipoEvento.CAMBIO_ESTADO),
                eq("EN_CURSO"), eq("PRESUPUESTADO"), eq(ActorTipo.PROVEEDOR), eq(prov), isNull());
        orden.verify(eventoService).registrarTrabajo(any(Trabajo.class), eq(TipoEvento.CAMBIO_ESTADO_PAGO),
                isNull(), eq("PENDIENTE_PAGO"), eq(ActorTipo.PROVEEDOR), eq(prov), isNull());
    }

    @Test
    void responderPresupuesto_emitePagoYCierreEnOrden() {
        User cliente = user(1L, "cli", UserRole.CLIENT);
        User prov = user(2L, "prov", UserRole.PROVIDER);
        Trabajo t = trabajo(10L, cliente, prov, TrabajoEstado.PRESUPUESTADO);
        t.setTarifaVisita(new BigDecimal("15000"));
        t.setMontoPresupuesto(new BigDecimal("90000"));
        t.setEstadoPago(EstadoPago.PENDIENTE_PAGO);
        when(userRepository.findByFirebaseUid("cli")).thenReturn(Optional.of(cliente));
        when(trabajoRepository.findById(10L)).thenReturn(Optional.of(t));
        when(trabajoRepository.findTrabajosEnCola(anyLong())).thenReturn(List.of());
        when(trabajoRepository.save(any(Trabajo.class))).thenAnswer(i -> i.getArgument(0));

        trabajoService.responderPresupuesto(10L, "cli", true);

        InOrder orden = inOrder(eventoService);
        orden.verify(eventoService).registrarTrabajo(any(Trabajo.class), eq(TipoEvento.CAMBIO_ESTADO_PAGO),
                eq("PENDIENTE_PAGO"), eq("PAGADO"), eq(ActorTipo.CLIENTE), eq(cliente), any());
        orden.verify(eventoService).registrarTrabajo(any(Trabajo.class), eq(TipoEvento.CAMBIO_ESTADO),
                eq("PRESUPUESTADO"), eq("COMPLETADO"), eq(ActorTipo.CLIENTE), eq(cliente), isNull());
    }

    @Test
    void completar_registraProveedorComoActor() {
        User cliente = user(1L, "cli", UserRole.CLIENT);
        User prov = user(2L, "prov", UserRole.PROVIDER);
        Trabajo t = trabajo(10L, cliente, prov, TrabajoEstado.EN_CURSO);
        when(userRepository.findByFirebaseUid("prov")).thenReturn(Optional.of(prov));
        when(trabajoRepository.findById(10L)).thenReturn(Optional.of(t));
        when(trabajoRepository.findTrabajosEnCola(anyLong())).thenReturn(List.of());
        when(trabajoRepository.save(any(Trabajo.class))).thenAnswer(i -> i.getArgument(0));

        trabajoService.completarTrabajo(10L, "prov");

        verify(eventoService).registrarTrabajo(any(Trabajo.class), eq(TipoEvento.CAMBIO_ESTADO),
                eq("EN_CURSO"), eq("COMPLETADO"), eq(ActorTipo.PROVEEDOR), eq(prov), isNull());
    }

    @Test
    void completar_promocionDeColaRegistraSistemaSinActor() {
        User cliente = user(1L, "cli", UserRole.CLIENT);
        User prov = user(2L, "prov", UserRole.PROVIDER);
        Trabajo t = trabajo(10L, cliente, prov, TrabajoEstado.EN_CURSO);
        User otroCliente = user(3L, "cli2", UserRole.CLIENT);
        Trabajo enCola = trabajo(11L, otroCliente, prov, TrabajoEstado.EN_COLA);
        when(userRepository.findByFirebaseUid("prov")).thenReturn(Optional.of(prov));
        when(trabajoRepository.findById(10L)).thenReturn(Optional.of(t));
        when(trabajoRepository.findTrabajosEnCola(2L)).thenReturn(List.of(enCola));
        when(trabajoRepository.save(any(Trabajo.class))).thenAnswer(i -> i.getArgument(0));

        trabajoService.completarTrabajo(10L, "prov");

        verify(eventoService).registrarTrabajo(eq(enCola), eq(TipoEvento.CAMBIO_ESTADO),
                eq("EN_COLA"), eq("EN_CURSO"), eq(ActorTipo.SISTEMA), isNull(), any());
    }

    @Test
    void cancelarPorCliente_registraClienteYMotivo() {
        User cliente = user(1L, "cli", UserRole.CLIENT);
        Trabajo t = trabajo(10L, cliente, null, TrabajoEstado.PENDIENTE);
        when(userRepository.findByFirebaseUid("cli")).thenReturn(Optional.of(cliente));
        when(trabajoRepository.findById(10L)).thenReturn(Optional.of(t));
        when(trabajoRepository.save(any(Trabajo.class))).thenAnswer(i -> i.getArgument(0));

        trabajoService.cancelarTrabajo(10L, "cli", "me arrepentí");

        verify(eventoService).registrarTrabajo(any(Trabajo.class), eq(TipoEvento.CAMBIO_ESTADO),
                eq("PENDIENTE"), eq("CANCELADO"), eq(ActorTipo.CLIENTE), eq(cliente), eq("me arrepentí"));
    }

    @Test
    void cancelarPorEscalacion_registraSistemaSinActor() {
        // Escalación agotada: PENDIENTE, sin ofertas vivas, ventana vencida, sin
        // siguiente grupo → aplicarCancelacion con actor SISTEMA. Los stubs replican
        // el arranque de escalarUnTrabajo; ajustar mirando TrabajoEscalacionTest,
        // que ya testea este camino (sin el evento).
        User cliente = user(1L, "cli", UserRole.CLIENT);
        Trabajo t = trabajo(10L, cliente, null, TrabajoEstado.PENDIENTE);
        t.setCreatedAt(java.time.LocalDateTime.now().minusHours(2));
        when(trabajoRepository.findById(10L)).thenReturn(Optional.of(t));
        when(trabajoOfertaRepository.findByTrabajoIdAndResultado(eq(10L), any())).thenReturn(List.of());
        when(trabajoRepository.save(any(Trabajo.class))).thenAnswer(i -> i.getArgument(0));

        trabajoService.escalarUnTrabajo(10L, 15);

        verify(eventoService).registrarTrabajo(any(Trabajo.class), eq(TipoEvento.CAMBIO_ESTADO),
                eq("PENDIENTE"), eq("CANCELADO"), eq(ActorTipo.SISTEMA), isNull(),
                eq("No encontramos un profesional disponible"));
    }
}
