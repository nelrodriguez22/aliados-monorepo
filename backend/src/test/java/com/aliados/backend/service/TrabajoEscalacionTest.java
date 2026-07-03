package com.aliados.backend.service;

import com.aliados.backend.entity.Oficio;
import com.aliados.backend.entity.ResultadoOferta;
import com.aliados.backend.entity.TipoNotificacion;
import com.aliados.backend.entity.Trabajo;
import com.aliados.backend.entity.TrabajoEstado;
import com.aliados.backend.entity.TrabajoOferta;
import com.aliados.backend.entity.User;
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

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class TrabajoEscalacionTest {

    @Mock TrabajoRepository trabajoRepository;
    @Mock UserRepository userRepository;
    @Mock OficioRepository oficioRepository;
    @Mock UserService userService;
    @Mock CalificacionRepository calificacionRepository;
    @Mock NotificacionService notificacionService;
    @Mock ProviderScoreService providerScoreService;
    @Mock CloudinaryService cloudinaryService;
    @Mock com.aliados.backend.service.FeatureFlagService featureFlagService;
    @Mock TrabajoOfertaRepository trabajoOfertaRepository;

    @InjectMocks TrabajoService trabajoService;

    private Trabajo pendiente(int reintentos, LocalDateTime notificadoAt) {
        Oficio oficio = new Oficio();
        oficio.setId(1L);
        oficio.setNombre("Plomería");
        User cliente = new User();
        cliente.setFirebaseUid("cliente-uid");
        cliente.setLocalidad("Rosario");
        Trabajo t = new Trabajo();
        t.setId(100L);
        t.setEstado(TrabajoEstado.PENDIENTE);
        t.setReintentos(reintentos);
        t.setCreatedAt(notificadoAt != null ? notificadoAt : LocalDateTime.now().minusHours(1));
        t.setCliente(cliente);
        t.setOficio(oficio);
        return t;
    }

    private User proveedor(Long id) {
        User u = new User();
        u.setId(id);
        u.setFirebaseUid("prov-" + id);
        return u;
    }

    private TrabajoOferta ofrecida(Trabajo t, User p) {
        TrabajoOferta o = new TrabajoOferta();
        o.setTrabajo(t);
        o.setProveedor(p);
        o.setGrupo(1);
        o.setResultado(ResultadoOferta.OFRECIDA);
        o.setOfrecidoAt(LocalDateTime.now().minusMinutes(6));
        return o;
    }

    // ── Tests nuevos (Task 6) ────────────────────────────────────────────────

    @Test
    void escalar_grupoDurmio_marcaDurmioYAvanza() {
        Trabajo t = pendiente(0, LocalDateTime.now().minusMinutes(6));
        when(trabajoRepository.findById(t.getId())).thenReturn(Optional.of(t));
        TrabajoOferta o1 = ofrecida(t, proveedor(10L)), o2 = ofrecida(t, proveedor(11L));
        when(trabajoOfertaRepository.findByTrabajoIdAndResultado(t.getId(), ResultadoOferta.OFRECIDA))
                .thenReturn(List.of(o1, o2));
        // hay grupo siguiente
        when(userRepository.findProveedoresDisponibles(anyString(), anyLong(), anyInt()))
                .thenReturn(new java.util.ArrayList<>(List.of(proveedor(12L))));
        when(providerScoreService.ordenarPorScore(anyList())).thenAnswer(inv -> inv.getArgument(0));
        when(trabajoOfertaRepository.findByTrabajoId(t.getId())).thenReturn(List.of(o1, o2));
        when(featureFlagService.getNumber(anyString(), anyDouble())).thenReturn(10.0);

        trabajoService.escalarUnTrabajo(t.getId(), 5);

        // El UPDATE atómico condicional se emitió (sustituye el loop).
        verify(trabajoOfertaRepository).marcarGrupoDurmioSiPendiente(t.getId());
        // Avanzó de grupo → avisa al cliente que seguimos buscando (efecto del path if(ofrecio)).
        verify(notificacionService).enviarNotificacion(eq(t.getCliente().getFirebaseUid()),
                eq(TipoNotificacion.TRABAJO_BUSCANDO_PROVEEDOR), anyString(), anyString(), any(), any());
    }

    @Test
    void escalar_sinMasProveedores_cancela() {
        Trabajo t = pendiente(0, LocalDateTime.now().minusMinutes(6));
        when(trabajoRepository.findById(t.getId())).thenReturn(Optional.of(t));
        when(trabajoOfertaRepository.findByTrabajoIdAndResultado(t.getId(), ResultadoOferta.OFRECIDA))
                .thenReturn(List.of(ofrecida(t, proveedor(10L))));
        when(trabajoOfertaRepository.findByTrabajoId(t.getId())).thenReturn(List.of(ofrecida(t, proveedor(10L))));
        when(userRepository.findProveedoresDisponibles(anyString(), anyLong(), anyInt()))
                .thenReturn(new java.util.ArrayList<>()); // nadie nuevo
        when(featureFlagService.getNumber(anyString(), anyDouble())).thenReturn(10.0);

        trabajoService.escalarUnTrabajo(t.getId(), 5);

        assertThat(t.getEstado()).isEqualTo(TrabajoEstado.CANCELADO);
        verify(notificacionService).enviarNotificacion(eq(t.getCliente().getFirebaseUid()), eq(TipoNotificacion.TRABAJO_CANCELADO_SIN_PROVEEDOR), anyString(), anyString(), anyLong(), any());
    }

    // ── Tests adaptados al nuevo modelo (firma (id, intervalo)) ─────────────

    @Test
    void ventana_vencida_sin_grupo_activo_avanza_y_notifica_cliente() {
        Trabajo t = pendiente(0, LocalDateTime.now().minusMinutes(10));
        when(trabajoRepository.findById(100L)).thenReturn(Optional.of(t));
        when(trabajoOfertaRepository.findByTrabajoIdAndResultado(100L, ResultadoOferta.OFRECIDA))
                .thenReturn(List.of()); // sin grupo activo → ref = createdAt (10 min ago)
        when(trabajoOfertaRepository.findByTrabajoId(100L)).thenReturn(List.of());
        when(userRepository.findProveedoresDisponibles(eq("Rosario"), eq(1L), anyInt()))
                .thenReturn(new java.util.ArrayList<>(List.of(proveedor(12L))));
        when(providerScoreService.ordenarPorScore(anyList())).thenAnswer(inv -> inv.getArgument(0));
        when(featureFlagService.getNumber(anyString(), anyDouble())).thenReturn(10.0);

        trabajoService.escalarUnTrabajo(100L, 3);

        verify(userRepository).findProveedoresDisponibles(eq("Rosario"), eq(1L), anyInt());
        verify(notificacionService).enviarNotificacion(eq("cliente-uid"),
                eq(TipoNotificacion.TRABAJO_BUSCANDO_PROVEEDOR), anyString(), anyString(), eq(100L), isNull());
    }

    @Test
    void ventana_vencida_sin_mas_proveedores_cancela_y_notifica_cliente() {
        Trabajo t = pendiente(0, LocalDateTime.now().minusMinutes(10));
        when(trabajoRepository.findById(100L)).thenReturn(Optional.of(t));
        TrabajoOferta o = ofrecida(t, proveedor(10L));
        when(trabajoOfertaRepository.findByTrabajoIdAndResultado(100L, ResultadoOferta.OFRECIDA))
                .thenReturn(List.of(o));
        when(trabajoOfertaRepository.findByTrabajoId(100L)).thenReturn(List.of(o));
        when(userRepository.findProveedoresDisponibles(eq("Rosario"), eq(1L), anyInt()))
                .thenReturn(new java.util.ArrayList<>());
        when(featureFlagService.getNumber(anyString(), anyDouble())).thenReturn(10.0);

        trabajoService.escalarUnTrabajo(100L, 3);

        assertThat(t.getEstado()).isEqualTo(TrabajoEstado.CANCELADO);
        assertThat(t.getMotivoCancelacion()).isEqualTo("No encontramos un profesional disponible");
        verify(cloudinaryService).borrarFotos(any());
        verify(notificacionService).enviarNotificacion(eq("cliente-uid"),
                eq(TipoNotificacion.TRABAJO_CANCELADO_SIN_PROVEEDOR), anyString(), anyString(), eq(100L), isNull());
    }

    @Test
    void dentro_de_la_ventana_no_hace_nada() {
        Trabajo t = pendiente(0, LocalDateTime.now().minusMinutes(1));
        TrabajoOferta o = new TrabajoOferta();
        o.setTrabajo(t);
        o.setProveedor(proveedor(10L));
        o.setGrupo(1);
        o.setResultado(ResultadoOferta.OFRECIDA);
        o.setOfrecidoAt(LocalDateTime.now().minusMinutes(1)); // 1 min ago, ventana abierta con intervalo=3
        when(trabajoRepository.findById(100L)).thenReturn(Optional.of(t));
        when(trabajoOfertaRepository.findByTrabajoIdAndResultado(100L, ResultadoOferta.OFRECIDA))
                .thenReturn(List.of(o));

        trabajoService.escalarUnTrabajo(100L, 3);

        assertThat(t.getReintentos()).isEqualTo(0);
        assertThat(t.getEstado()).isEqualTo(TrabajoEstado.PENDIENTE);
        verifyNoInteractions(notificacionService);
        verify(cloudinaryService, never()).borrarFotos(any());
    }

    @Test
    void ref_grupo_vacio_usa_createdAt_como_referencia() {
        Trabajo t = pendiente(0, null); // notificadoAt null → ref = createdAt (now-1h, viejo)
        when(trabajoRepository.findById(100L)).thenReturn(Optional.of(t));
        when(trabajoOfertaRepository.findByTrabajoIdAndResultado(100L, ResultadoOferta.OFRECIDA))
                .thenReturn(List.of()); // sin grupo activo → ref = createdAt (1h ago)
        when(trabajoOfertaRepository.findByTrabajoId(100L)).thenReturn(List.of());
        when(userRepository.findProveedoresDisponibles(eq("Rosario"), eq(1L), anyInt()))
                .thenReturn(new java.util.ArrayList<>(List.of(proveedor(12L))));
        when(providerScoreService.ordenarPorScore(anyList())).thenAnswer(inv -> inv.getArgument(0));
        when(featureFlagService.getNumber(anyString(), anyDouble())).thenReturn(10.0);

        trabajoService.escalarUnTrabajo(100L, 3);

        // createdAt viejo → ventana vence → avanza al siguiente grupo
        verify(notificacionService).enviarNotificacion(eq("cliente-uid"),
                eq(TipoNotificacion.TRABAJO_BUSCANDO_PROVEEDOR), anyString(), anyString(), eq(100L), isNull());
    }

    @Test
    void proveedores_ya_ofertados_son_excluidos_del_grupo_siguiente() {
        Trabajo t = pendiente(0, LocalDateTime.now().minusMinutes(10));
        User actual = new User();
        actual.setId(5L);
        actual.setFirebaseUid("prov-5");
        User siguiente = proveedor(12L);
        when(trabajoRepository.findById(100L)).thenReturn(Optional.of(t));
        when(trabajoOfertaRepository.findByTrabajoIdAndResultado(100L, ResultadoOferta.OFRECIDA))
                .thenReturn(List.of()); // sin grupo activo → ref = createdAt (10 min ago)
        when(trabajoOfertaRepository.findByTrabajoId(100L)).thenReturn(List.of(ofrecida(t, actual)));
        when(userRepository.findProveedoresDisponibles(eq("Rosario"), eq(1L), anyInt()))
                .thenReturn(new java.util.ArrayList<>(List.of(actual, siguiente)));
        when(providerScoreService.ordenarPorScore(anyList())).thenAnswer(inv -> inv.getArgument(0));
        when(featureFlagService.getNumber(anyString(), anyDouble())).thenReturn(10.0);

        trabajoService.escalarUnTrabajo(100L, 3);

        // El proveedor(5) ya fue ofertado → NO recibe nueva oferta:
        verify(notificacionService, never()).enviarNotificacion(eq("prov-5"), any(), any(), any(), any(), any());
        // El cliente sí es notificado:
        verify(notificacionService).enviarNotificacion(eq("cliente-uid"),
                eq(TipoNotificacion.TRABAJO_BUSCANDO_PROVEEDOR), anyString(), anyString(), eq(100L), isNull());
    }

    @Test
    void trabajo_ya_no_pendiente_no_hace_nada() {
        Trabajo t = pendiente(0, LocalDateTime.now().minusMinutes(10));
        t.setEstado(TrabajoEstado.CANCELADO); // tomado/cancelado entre la query y el procesamiento
        when(trabajoRepository.findById(100L)).thenReturn(Optional.of(t));

        trabajoService.escalarUnTrabajo(100L, 3);

        verifyNoInteractions(notificacionService);
        verify(trabajoRepository, never()).save(any());
    }

    // ── Test de carrera scheduler-vs-propose ────────────────────────────────

    @Test
    void escalar_perdioLaCarreraContraPropose_noAvanza() {
        // Arrange: primer findById → PENDIENTE; re-lectura → ya PROPUESTO
        Trabajo pendienteT = pendiente(0, LocalDateTime.now().minusMinutes(6));
        Trabajo propuestoT = pendiente(0, LocalDateTime.now().minusMinutes(6));
        propuestoT.setEstado(TrabajoEstado.PROPUESTO);

        when(trabajoRepository.findById(100L))
                .thenReturn(Optional.of(pendienteT), Optional.of(propuestoT));

        // La oferta OFRECIDA tiene ofrecidoAt de hace 6 min → ventana (intervalo=5) vencida
        TrabajoOferta o = ofrecida(pendienteT, proveedor(10L));
        when(trabajoOfertaRepository.findByTrabajoIdAndResultado(100L, ResultadoOferta.OFRECIDA))
                .thenReturn(List.of(o));

        trabajoService.escalarUnTrabajo(100L, 5);

        // El UPDATE condicional se llamó (el DB decidirá si afecta filas)
        verify(trabajoOfertaRepository).marcarGrupoDurmioSiPendiente(100L);
        // Pero el flujo NO avanzó: ni busca proveedores ni notifica al cliente
        verify(userRepository, never()).findProveedoresDisponibles(any(), any(), anyInt());
        verify(notificacionService, never()).enviarNotificacion(
                any(), eq(TipoNotificacion.TRABAJO_BUSCANDO_PROVEEDOR), any(), any(), any(), any());
        verify(notificacionService, never()).enviarNotificacion(
                any(), eq(TipoNotificacion.TRABAJO_CANCELADO_SIN_PROVEEDOR), any(), any(), any(), any());
    }

    @Test
    void getLimiteTrabajos_flete_usaFlagFlete() {
        Oficio flete = new Oficio();
        flete.setNombre("Flete");
        when(featureFlagService.getNumber("limite_trabajos_flete", 8.0)).thenReturn(8.0);
        assertThat(trabajoService.getLimiteTrabajos(flete)).isEqualTo(8);
    }

    @Test
    void getLimiteTrabajos_otroOficio_usaFlagDefault() {
        Oficio plomeria = new Oficio();
        plomeria.setNombre("Plomería");
        when(featureFlagService.getNumber("limite_trabajos_default", 3.0)).thenReturn(3.0);
        assertThat(trabajoService.getLimiteTrabajos(plomeria)).isEqualTo(3);
    }
}
