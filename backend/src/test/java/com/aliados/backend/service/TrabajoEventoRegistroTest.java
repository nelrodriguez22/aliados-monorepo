package com.aliados.backend.service;

import com.aliados.backend.dto.CrearTrabajoDTO;
import com.aliados.backend.entity.ActorTipo;
import com.aliados.backend.entity.Oficio;
import com.aliados.backend.entity.ResultadoOferta;
import com.aliados.backend.entity.TipoEvento;
import com.aliados.backend.entity.Trabajo;
import com.aliados.backend.entity.TrabajoEstado;
import com.aliados.backend.entity.TrabajoOferta;
import com.aliados.backend.entity.User;
import com.aliados.backend.entity.UserRole;
import com.aliados.backend.repository.ConversacionRepository;
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

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Verifica que cada transición de estado del flujo de matching registre su evento
 * con valor anterior/nuevo y actor correctos. El detalle de qué persiste el evento
 * lo cubre EventoServiceTest; acá solo importa QUE se llame y CON QUÉ.
 */
@ExtendWith(MockitoExtension.class)
class TrabajoEventoRegistroTest {

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

    private Oficio oficio() {
        Oficio of = new Oficio(); of.setId(1L); of.setNombre("Electricista");
        return of;
    }

    private Trabajo trabajo(long id, User cliente, TrabajoEstado estado) {
        Trabajo t = new Trabajo();
        t.setId(id); t.setCliente(cliente); t.setOficio(oficio()); t.setEstado(estado);
        return t;
    }

    @Test
    void crearTrabajo_registraCreacionConAnteriorNull() {
        User cliente = user(1L, "cli", UserRole.CLIENT);
        when(userRepository.findByFirebaseUid("cli")).thenReturn(Optional.of(cliente));
        when(oficioRepository.findById(1L)).thenReturn(Optional.of(oficio()));
        when(trabajoRepository.save(any(Trabajo.class))).thenAnswer(i -> i.getArgument(0));

        CrearTrabajoDTO dto = new CrearTrabajoDTO();
        dto.setOficioId(1L);
        dto.setDescripcion("no anda la luz");
        dto.setDireccion("Mitre 100");
        // Coordenadas dentro de Rosario (RegionRosario.contiene debe dar true)
        dto.setLatitudCliente(-32.95);
        dto.setLongitudCliente(-60.65);

        trabajoService.crearTrabajo("cli", dto);

        verify(eventoService).registrarTrabajo(any(Trabajo.class), eq(TipoEvento.CAMBIO_ESTADO),
                isNull(), eq("PENDIENTE"), eq(ActorTipo.CLIENTE), eq(cliente), isNull());
    }

    @Test
    void proponerTrabajo_registraSoloSiGanaElFlipAtomico() {
        User prov = user(2L, "prov", UserRole.PROVIDER);
        User cliente = user(1L, "cli", UserRole.CLIENT);
        Trabajo t = trabajo(10L, cliente, TrabajoEstado.PROPUESTO);
        t.setProveedor(prov);
        TrabajoOferta oferta = new TrabajoOferta();
        oferta.setResultado(ResultadoOferta.OFRECIDA);
        when(userRepository.findByFirebaseUid("prov")).thenReturn(Optional.of(prov));
        when(trabajoRepository.findById(10L)).thenReturn(Optional.of(t));
        when(trabajoOfertaRepository.findByTrabajoIdAndProveedorId(10L, 2L)).thenReturn(Optional.of(oferta));
        when(trabajoRepository.tomarTrabajoSiPendiente(10L)).thenReturn(1); // ganó
        when(trabajoRepository.save(any(Trabajo.class))).thenAnswer(i -> i.getArgument(0));

        trabajoService.proponerTrabajo(10L, "prov", 30, null, null, new BigDecimal("15000"));

        verify(eventoService).registrarTrabajo(any(Trabajo.class), eq(TipoEvento.CAMBIO_ESTADO),
                eq("PENDIENTE"), eq("PROPUESTO"), eq(ActorTipo.PROVEEDOR), eq(prov), isNull());
    }

    @Test
    void proponerTrabajo_perdedorDelFlipNoRegistraEvento() {
        User prov = user(2L, "prov", UserRole.PROVIDER);
        User cliente = user(1L, "cli", UserRole.CLIENT);
        Trabajo t = trabajo(10L, cliente, TrabajoEstado.PENDIENTE);
        TrabajoOferta oferta = new TrabajoOferta();
        oferta.setResultado(ResultadoOferta.OFRECIDA);
        when(userRepository.findByFirebaseUid("prov")).thenReturn(Optional.of(prov));
        when(trabajoRepository.findById(10L)).thenReturn(Optional.of(t));
        when(trabajoOfertaRepository.findByTrabajoIdAndProveedorId(10L, 2L)).thenReturn(Optional.of(oferta));
        when(trabajoRepository.tomarTrabajoSiPendiente(10L)).thenReturn(0); // perdió

        assertThatThrownBy(() -> trabajoService.proponerTrabajo(10L, "prov", 30, null, null, null))
                .isInstanceOf(RuntimeException.class);

        verify(eventoService, never()).registrarTrabajo(any(), any(), any(), any(), any(), any(), any());
    }

    @Test
    void aceptarPropuesta_registraElEstadoResultante() {
        User cliente = user(1L, "cli", UserRole.CLIENT);
        User prov = user(2L, "prov", UserRole.PROVIDER);
        Trabajo t = trabajo(10L, cliente, TrabajoEstado.PROPUESTO);
        t.setProveedor(prov);
        when(userRepository.findByFirebaseUid("cli")).thenReturn(Optional.of(cliente));
        when(trabajoRepository.findById(10L)).thenReturn(Optional.of(t));
        when(trabajoRepository.countTrabajosActivosYCola(2L)).thenReturn(0);
        when(featureFlagService.getNumber(eq("limite_trabajos_default"), any(Double.class))).thenReturn(3.0);
        when(trabajoRepository.findTrabajoEnCursoByProveedorId(2L)).thenReturn(null); // sin cola → EN_CURSO
        when(trabajoRepository.save(any(Trabajo.class))).thenAnswer(i -> i.getArgument(0));
        when(trabajoOfertaRepository.findByTrabajoIdAndResultado(anyLong(), any())).thenReturn(List.of());

        trabajoService.aceptarPropuesta(10L, "cli");

        verify(eventoService).registrarTrabajo(any(Trabajo.class), eq(TipoEvento.CAMBIO_ESTADO),
                eq("PROPUESTO"), eq("EN_CURSO"), eq(ActorTipo.CLIENTE), eq(cliente), isNull());
    }

    @Test
    void rechazarPropuesta_registraVueltaAPendiente() {
        User cliente = user(1L, "cli", UserRole.CLIENT);
        User prov = user(2L, "prov", UserRole.PROVIDER);
        Trabajo t = trabajo(10L, cliente, TrabajoEstado.PROPUESTO);
        t.setProveedor(prov);
        when(userRepository.findByFirebaseUid("cli")).thenReturn(Optional.of(cliente));
        when(trabajoRepository.findById(10L)).thenReturn(Optional.of(t));
        when(trabajoOfertaRepository.findByTrabajoIdAndProveedorId(10L, 2L)).thenReturn(Optional.empty());
        when(trabajoRepository.save(any(Trabajo.class))).thenAnswer(i -> i.getArgument(0));

        trabajoService.rechazarPropuesta(10L, "cli");

        verify(eventoService).registrarTrabajo(any(Trabajo.class), eq(TipoEvento.CAMBIO_ESTADO),
                eq("PROPUESTO"), eq("PENDIENTE"), eq(ActorTipo.CLIENTE), eq(cliente), isNull());
    }
}
