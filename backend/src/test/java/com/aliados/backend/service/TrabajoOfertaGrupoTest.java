package com.aliados.backend.service;

import com.aliados.backend.entity.Oficio;
import com.aliados.backend.entity.TipoNotificacion;
import com.aliados.backend.entity.Trabajo;
import com.aliados.backend.entity.TrabajoEstado;
import com.aliados.backend.entity.TrabajoOferta;
import com.aliados.backend.entity.User;
import com.aliados.backend.repository.CalificacionRepository;
import com.aliados.backend.repository.ConversacionRepository;
import com.aliados.backend.repository.OficioRepository;
import com.aliados.backend.repository.TrabajoOfertaRepository;
import com.aliados.backend.repository.TrabajoRepository;
import com.aliados.backend.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.aliados.backend.dto.TrabajoResponseDTO;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import com.aliados.backend.entity.ResultadoOferta;
import com.aliados.backend.exception.ForbiddenException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class TrabajoOfertaGrupoTest {

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
    @Mock ConversacionService conversacionService;
    @Mock ConversacionRepository conversacionRepository;

    @InjectMocks TrabajoService trabajoService;

    private Trabajo pendiente(int reintentos, LocalDateTime notificadoAt) {
        Oficio oficio = new Oficio();
        oficio.setId(1L);
        oficio.setNombre("Plomería");
        User cliente = new User();
        cliente.setId(1L);
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
        Oficio oficio = new Oficio();
        oficio.setId(1L);
        oficio.setNombre("Plomería");
        User p = new User();
        p.setId(id);
        p.setOficio(oficio);
        p.setFirebaseUid("uid-" + id);
        return p;
    }

    @Test
    void getTrabajosPendientes_devuelveLosOfrecidosAlProveedor() {
        User prov = proveedor(10L);
        when(userRepository.findByFirebaseUid("uid-10")).thenReturn(Optional.of(prov));
        Trabajo t = pendiente(0, null);
        when(trabajoRepository.findPendientesOfrecidosA(10L, prov.getOficio().getId())).thenReturn(List.of(t));

        List<TrabajoResponseDTO> res = trabajoService.getTrabajosPendientes("uid-10");

        assertThat(res).hasSize(1);
    }

    @Test
    void ofrecerSiguienteGrupo_creaFilasOfrecidaYNotifica() {
        Trabajo t = pendiente(0, null); // helper como en TrabajoEscalacionTest
        when(featureFlagService.getNumber(eq("trabajo_oferta_grupo_tamano"), anyDouble())).thenReturn(2.0);
        when(featureFlagService.getNumber(eq("limite_trabajos_default"), anyDouble())).thenReturn(3.0);
        User p1 = proveedor(10L), p2 = proveedor(11L), p3 = proveedor(12L);
        when(userRepository.findProveedoresDisponibles(anyString(), anyLong(), anyInt()))
                .thenReturn(new java.util.ArrayList<>(List.of(p1, p2, p3)));
        when(providerScoreService.ordenarPorScore(anyList()))
                .thenAnswer(inv -> inv.getArgument(0)); // ya ordenado
        when(trabajoOfertaRepository.findByTrabajoId(t.getId())).thenReturn(List.of());

        trabajoService.ofrecerSiguienteGrupo(t);

        // top 2 → 2 ofertas guardadas + 2 push
        verify(trabajoOfertaRepository, times(2)).save(any(TrabajoOferta.class));
        verify(notificacionService, times(2)).enviarNotificacion(anyString(), any(), anyString(), anyString(), anyLong(), anyString());
    }

    @Test
    void proponer_ganaLaCarrera_marcaPropusoYNotificaCliente() {
        User prov = proveedor(10L);
        when(userRepository.findByFirebaseUid("uid-10")).thenReturn(Optional.of(prov));
        Trabajo t = pendiente(0, null);
        when(trabajoRepository.findById(t.getId())).thenReturn(Optional.of(t));
        TrabajoOferta oferta = new TrabajoOferta();
        oferta.setProveedor(prov); oferta.setTrabajo(t); oferta.setResultado(ResultadoOferta.OFRECIDA);
        when(trabajoOfertaRepository.findByTrabajoIdAndProveedorId(t.getId(), 10L)).thenReturn(Optional.of(oferta));
        when(trabajoRepository.tomarTrabajoSiPendiente(t.getId())).thenReturn(1);

        trabajoService.proponerTrabajo(t.getId(), "uid-10", 20, -32.9, -60.6, new java.math.BigDecimal("15000"));

        assertThat(oferta.getResultado()).isEqualTo(ResultadoOferta.PROPUSO);
        assertThat(oferta.getRespondioAt()).isNotNull();
        verify(notificacionService).enviarNotificacion(eq(t.getCliente().getFirebaseUid()), any(), anyString(), anyString(), anyLong(), anyString());
    }

    @Test
    void proponer_pierdeLaCarrera_lanza409() {
        User prov = proveedor(11L);
        when(userRepository.findByFirebaseUid("uid-11")).thenReturn(Optional.of(prov));
        Trabajo t = pendiente(0, null);
        when(trabajoRepository.findById(t.getId())).thenReturn(Optional.of(t));
        TrabajoOferta oferta = new TrabajoOferta();
        oferta.setProveedor(prov); oferta.setTrabajo(t); oferta.setResultado(ResultadoOferta.OFRECIDA);
        when(trabajoOfertaRepository.findByTrabajoIdAndProveedorId(t.getId(), 11L)).thenReturn(Optional.of(oferta));
        when(trabajoRepository.tomarTrabajoSiPendiente(t.getId())).thenReturn(0);

        assertThatThrownBy(() -> trabajoService.proponerTrabajo(t.getId(), "uid-11", 20, null, null, null))
                .hasMessageContaining("ya no está disponible");
    }

    @Test
    void proponer_sinOferta_lanzaForbidden() {
        User prov = proveedor(12L);
        when(userRepository.findByFirebaseUid("uid-12")).thenReturn(Optional.of(prov));
        Trabajo t = pendiente(0, null);
        when(trabajoRepository.findById(t.getId())).thenReturn(Optional.of(t));
        when(trabajoOfertaRepository.findByTrabajoIdAndProveedorId(t.getId(), 12L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> trabajoService.proponerTrabajo(t.getId(), "uid-12", 20, null, null, null))
                .isInstanceOf(ForbiddenException.class);
    }

    private TrabajoOferta ofrecida(Trabajo t, User p) {
        TrabajoOferta o = new TrabajoOferta();
        o.setTrabajo(t);
        o.setProveedor(p);
        o.setResultado(ResultadoOferta.OFRECIDA);
        return o;
    }

    @Test
    void aceptar_finalizaOfrecidasRestantesComoDurmio() {
        // trabajo PROPUESTO con proveedor ganador + 1 oferta OFRECIDA restante
        Trabajo t = pendiente(0, null);
        t.setEstado(TrabajoEstado.PROPUESTO);
        User ganador = proveedor(10L); t.setProveedor(ganador);
        when(userRepository.findByFirebaseUid("uid-cli")).thenReturn(Optional.of(t.getCliente()));
        when(trabajoRepository.findById(t.getId())).thenReturn(Optional.of(t));
        when(featureFlagService.getNumber(eq("limite_trabajos_default"), anyDouble())).thenReturn(3.0);
        when(trabajoRepository.countTrabajosActivosYCola(anyLong())).thenReturn(0);
        when(trabajoRepository.findTrabajoEnCursoByProveedorId(10L)).thenReturn(null);
        when(trabajoRepository.save(any(Trabajo.class))).thenAnswer(inv -> inv.getArgument(0));
        TrabajoOferta restante = ofrecida(t, proveedor(11L));
        when(trabajoOfertaRepository.findByTrabajoIdAndResultado(t.getId(), ResultadoOferta.OFRECIDA))
                .thenReturn(List.of(restante));

        trabajoService.aceptarPropuesta(t.getId(), "uid-cli");

        assertThat(restante.getResultado()).isEqualTo(ResultadoOferta.DURMIO);
    }

    @Test
    void rechazar_reabreAlRestoDelGrupo() {
        Trabajo t = pendiente(0, null);
        t.setEstado(TrabajoEstado.PROPUESTO);
        User rechazado = proveedor(10L); t.setProveedor(rechazado);
        when(userRepository.findByFirebaseUid("uid-cli")).thenReturn(Optional.of(t.getCliente()));
        when(trabajoRepository.findById(t.getId())).thenReturn(Optional.of(t));
        TrabajoOferta ofertaRechazado = new TrabajoOferta();
        ofertaRechazado.setProveedor(rechazado); ofertaRechazado.setTrabajo(t); ofertaRechazado.setResultado(ResultadoOferta.OFRECIDA);
        when(trabajoOfertaRepository.findByTrabajoIdAndProveedorId(t.getId(), 10L)).thenReturn(Optional.of(ofertaRechazado));
        TrabajoOferta restante = ofrecida(t, proveedor(11L));
        when(trabajoOfertaRepository.findByTrabajoIdAndResultado(t.getId(), ResultadoOferta.OFRECIDA))
                .thenReturn(List.of(restante));

        trabajoService.rechazarPropuesta(t.getId(), "uid-cli");

        assertThat(t.getEstado()).isEqualTo(TrabajoEstado.PENDIENTE);
        assertThat(ofertaRechazado.getResultado()).isEqualTo(ResultadoOferta.DURMIO);
        // re-notifica al restante del grupo (no baja de grupo)
        verify(notificacionService).enviarNotificacion(eq(proveedor(11L).getFirebaseUid()), any(), anyString(), anyString(), anyLong(), anyString());
        // el proveedor rechazado NO recibe re-notificación de NUEVO_TRABAJO
        verify(notificacionService, never()).enviarNotificacion(
                eq(rechazado.getFirebaseUid()), eq(TipoNotificacion.NUEVO_TRABAJO),
                anyString(), anyString(), anyLong(), anyString());
    }

    @Test
    void rechazarTrabajo_marcaOfertaDurmio() {
        User prov = proveedor(10L);
        when(userRepository.findByFirebaseUid("uid-10")).thenReturn(Optional.of(prov));
        Trabajo t = pendiente(0, null);
        when(trabajoRepository.findById(t.getId())).thenReturn(Optional.of(t));
        TrabajoOferta oferta = new TrabajoOferta();
        oferta.setProveedor(prov); oferta.setTrabajo(t); oferta.setResultado(ResultadoOferta.OFRECIDA);
        when(trabajoOfertaRepository.findByTrabajoIdAndProveedorId(t.getId(), 10L)).thenReturn(Optional.of(oferta));

        trabajoService.rechazarTrabajo(t.getId(), "uid-10");

        assertThat(oferta.getResultado()).isEqualTo(ResultadoOferta.DURMIO);
        verify(trabajoOfertaRepository).save(oferta);            // persiste el DURMIO
        verify(trabajoRepository, never()).save(any());          // no modifica el trabajo
    }

    @Test
    void proveedorSeConecta_seSumaAlGrupoDeTrabajosSinOfertarle() {
        User prov = proveedor(10L);
        prov.setLocalidad("Rosario");
        when(userRepository.findById(10L)).thenReturn(Optional.of(prov));
        when(trabajoRepository.countTrabajosActivosYCola(10L)).thenReturn(0);
        when(featureFlagService.getNumber(eq("limite_trabajos_default"), anyDouble())).thenReturn(3.0);
        Trabajo t = pendiente(0, null);
        when(trabajoRepository.findPendientesSinOfertaPara(t.getOficio().getId(), 10L)).thenReturn(List.of(t));

        trabajoService.asignarTrabajosAProveedorQueSeConecta(prov);

        verify(trabajoOfertaRepository).save(argThat(o -> o.getProveedor().getId().equals(10L)
                && o.getResultado() == ResultadoOferta.OFRECIDA
                && o.getGrupo() != null && o.getGrupo() >= 1));   // grupo NOT NULL, ≥ 1
        verify(notificacionService).enviarNotificacion(eq(prov.getFirebaseUid()), any(), anyString(), anyString(), anyLong(), anyString());
    }

    @Test
    void rechazar_sinRestoDelGrupo_ofreceGrupoSiguiente() {
        Trabajo t = pendiente(0, null);
        t.setEstado(TrabajoEstado.PROPUESTO);
        User rechazado = proveedor(10L); t.setProveedor(rechazado);
        when(userRepository.findByFirebaseUid("uid-cli")).thenReturn(Optional.of(t.getCliente()));
        when(trabajoRepository.findById(t.getId())).thenReturn(Optional.of(t));
        TrabajoOferta ofertaRechazado = ofrecida(t, rechazado);
        ofertaRechazado.setGrupo(1); // necesario para que ofrecerSiguienteGrupo pueda calcular grupo+1
        when(trabajoOfertaRepository.findByTrabajoIdAndProveedorId(t.getId(), 10L))
                .thenReturn(Optional.of(ofertaRechazado));
        // No quedan OFRECIDA → rama ofrecerSiguienteGrupo
        when(trabajoOfertaRepository.findByTrabajoIdAndResultado(t.getId(), ResultadoOferta.OFRECIDA))
                .thenReturn(List.of());
        // mocks para ofrecerSiguienteGrupo
        when(featureFlagService.getNumber(eq("trabajo_oferta_grupo_tamano"), anyDouble())).thenReturn(10.0);
        when(featureFlagService.getNumber(eq("limite_trabajos_default"), anyDouble())).thenReturn(10.0);
        User nuevo = proveedor(12L);
        when(userRepository.findProveedoresDisponibles(anyString(), anyLong(), anyInt()))
                .thenReturn(new java.util.ArrayList<>(List.of(nuevo)));
        when(providerScoreService.ordenarPorScore(anyList())).thenAnswer(inv -> inv.getArgument(0));
        when(trabajoOfertaRepository.findByTrabajoId(t.getId())).thenReturn(List.of(ofertaRechazado));

        trabajoService.rechazarPropuesta(t.getId(), "uid-cli");

        assertThat(t.getEstado()).isEqualTo(TrabajoEstado.PENDIENTE);
        // se guardó una nueva oferta OFRECIDA para el proveedor 12L
        verify(trabajoOfertaRepository).save(argThat(o ->
                o.getProveedor().getId().equals(12L) && o.getResultado() == ResultadoOferta.OFRECIDA));
        // se notificó al nuevo proveedor 12L
        verify(notificacionService).enviarNotificacion(eq("uid-12"), eq(TipoNotificacion.NUEVO_TRABAJO),
                anyString(), anyString(), anyLong(), anyString());
    }
}
