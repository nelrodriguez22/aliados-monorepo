package com.aliados.backend.service;

import com.aliados.backend.dto.ContrapropuestaMudanzaDTO;
import com.aliados.backend.dto.CrearMudanzaDTO;
import com.aliados.backend.entity.ActorTipo;
import com.aliados.backend.entity.Mudanza;
import com.aliados.backend.entity.MudanzaEstado;
import com.aliados.backend.entity.MudanzaTier;
import com.aliados.backend.entity.MudanzaTurno;
import com.aliados.backend.entity.TipoEvento;
import com.aliados.backend.entity.User;
import com.aliados.backend.entity.UserRole;
import com.aliados.backend.repository.ConversacionRepository;
import com.aliados.backend.repository.MudanzaRepository;
import com.aliados.backend.repository.MudanzaTierRepository;
import com.aliados.backend.repository.UserRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Optional;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.verify;

/**
 * Verifica que cada transición de estado del ciclo de vida de mudanzas registre su evento
 * con valor anterior/nuevo y actor correctos. El detalle de qué persiste el evento lo cubre
 * EventoServiceTest; acá solo importa QUE se llame y CON QUÉ.
 */
@ExtendWith(MockitoExtension.class)
class MudanzaEventoRegistroTest {

    @Mock MudanzaRepository mudanzaRepository;
    @Mock MudanzaTierRepository mudanzaTierRepository;
    @Mock UserRepository userRepository;
    @Mock NotificacionService notificacionService;
    @Mock CloudinaryService cloudinaryService;
    @Mock FeatureFlagService featureFlagService;
    @Mock ConversacionService conversacionService;
    @Mock ConversacionRepository conversacionRepository;
    @Mock EventoService eventoService;

    @InjectMocks MudanzaService mudanzaService;

    private User user(long id, String uid, UserRole role) {
        User u = new User();
        u.setId(id); u.setFirebaseUid(uid); u.setRole(role); u.setNombre("user-" + id);
        return u;
    }

    private MudanzaTier tier(long id, String nombre) {
        MudanzaTier t = new MudanzaTier();
        t.setId(id); t.setNombre(nombre); t.setEmoji("🥇");
        t.setPrecioBase(new BigDecimal("50000"));
        t.setMinutosIncluidos(120);
        t.setPrecioBloque30Min(new BigDecimal("5000"));
        return t;
    }

    private Mudanza mudanza(long id, User cliente, MudanzaEstado estado) {
        Mudanza m = new Mudanza();
        m.setId(id);
        m.setCliente(cliente);
        m.setTier(tier(1L, "ORO"));
        m.setEstado(estado);
        m.setMontoBase(new BigDecimal("50000"));
        m.setComisionPorcentaje(new BigDecimal("10.00"));
        m.setFechaDeseada(LocalDate.now().plusDays(1));
        return m;
    }

    @Test
    void crearMudanza_registraCreacionConAnteriorNull() {
        User cliente = user(1L, "cli", UserRole.CLIENT);
        MudanzaTier tier = tier(1L, "ORO");
        when(userRepository.findByFirebaseUid("cli")).thenReturn(Optional.of(cliente));
        when(mudanzaTierRepository.findById(1L)).thenReturn(Optional.of(tier));
        when(mudanzaRepository.save(any(Mudanza.class))).thenAnswer(i -> i.getArgument(0));

        CrearMudanzaDTO dto = new CrearMudanzaDTO();
        dto.setTierId(1L);
        dto.setDireccionOrigen("Mitre 100");
        dto.setLatitudOrigen(-32.95);
        dto.setLongitudOrigen(-60.65);
        dto.setDireccionDestino("San Martin 200");
        dto.setLatitudDestino(-32.94);
        dto.setLongitudDestino(-60.64);
        dto.setPisos(0);
        dto.setTieneAscensor(false);
        dto.setCantidadAmbientes(2);
        dto.setFechaDeseada(LocalDate.now().plusDays(1));
        dto.setFotos("[]");

        mudanzaService.crearMudanza("cli", dto);

        verify(eventoService).registrarMudanza(any(Mudanza.class), eq(TipoEvento.CAMBIO_ESTADO),
                isNull(), eq("PENDIENTE"), eq(ActorTipo.CLIENTE), eq(cliente), isNull());
    }

    @Test
    void reservarMudanza_registraClienteComoActor() {
        User cliente = user(1L, "cli", UserRole.CLIENT);
        Mudanza m = mudanza(20L, cliente, MudanzaEstado.PENDIENTE);
        when(userRepository.findByFirebaseUid("cli")).thenReturn(Optional.of(cliente));
        when(mudanzaRepository.findById(20L)).thenReturn(Optional.of(m));
        when(mudanzaRepository.save(any(Mudanza.class))).thenAnswer(i -> i.getArgument(0));

        mudanzaService.reservarMudanza(20L, "cli");

        verify(eventoService).registrarMudanza(any(Mudanza.class), eq(TipoEvento.CAMBIO_ESTADO),
                eq("PENDIENTE"), eq("RESERVADO"), eq(ActorTipo.CLIENTE), eq(cliente), isNull());
    }

    @Test
    void aceptarMudanza_registraProveedorComoActor() {
        User cliente = user(1L, "cli", UserRole.CLIENT);
        User proveedor = user(2L, "prov", UserRole.PROVIDER);
        Mudanza m = mudanza(20L, cliente, MudanzaEstado.RESERVADO);
        when(userRepository.findByFirebaseUid("prov")).thenReturn(Optional.of(proveedor));
        when(mudanzaRepository.findById(20L)).thenReturn(Optional.of(m));
        when(mudanzaRepository.existsByFechaConfirmadaAndTurnoAndEstadoNotIn(
                any(), any(), any())).thenReturn(false);
        when(mudanzaRepository.saveAndFlush(any(Mudanza.class))).thenAnswer(i -> i.getArgument(0));

        mudanzaService.aceptarMudanza(20L, "prov", MudanzaTurno.PRIMERO);

        verify(eventoService).registrarMudanza(any(Mudanza.class), eq(TipoEvento.CAMBIO_ESTADO),
                eq("RESERVADO"), eq("ACEPTADO"), eq(ActorTipo.PROVEEDOR), eq(proveedor), isNull());
    }

    @Test
    void contraproponer_registraProveedorComoActor() {
        User cliente = user(1L, "cli", UserRole.CLIENT);
        User proveedor = user(2L, "prov", UserRole.PROVIDER);
        Mudanza m = mudanza(20L, cliente, MudanzaEstado.RESERVADO);
        when(userRepository.findByFirebaseUid("prov")).thenReturn(Optional.of(proveedor));
        when(mudanzaRepository.findById(20L)).thenReturn(Optional.of(m));
        when(mudanzaRepository.save(any(Mudanza.class))).thenAnswer(i -> i.getArgument(0));

        ContrapropuestaMudanzaDTO dto = new ContrapropuestaMudanzaDTO();
        dto.setTurno(MudanzaTurno.PRIMERO);
        dto.setMotivo("Cambio de fecha");
        dto.setFechaSugerida(m.getFechaDeseada().plusDays(2));

        mudanzaService.contraproponer(20L, "prov", dto);

        verify(eventoService).registrarMudanza(any(Mudanza.class), eq(TipoEvento.CAMBIO_ESTADO),
                eq("RESERVADO"), eq("CONTRAPROPUESTO"), eq(ActorTipo.PROVEEDOR), eq(proveedor), isNull());
    }

    @Test
    void aceptarContrapropuesta_registraClienteComoActor() {
        User cliente = user(1L, "cli", UserRole.CLIENT);
        User proveedor = user(2L, "prov", UserRole.PROVIDER);
        Mudanza m = mudanza(20L, cliente, MudanzaEstado.CONTRAPROPUESTO);
        m.setProveedor(proveedor);
        m.setTurno(MudanzaTurno.PRIMERO);
        when(userRepository.findByFirebaseUid("cli")).thenReturn(Optional.of(cliente));
        when(mudanzaRepository.findById(20L)).thenReturn(Optional.of(m));
        when(mudanzaRepository.existsByFechaConfirmadaAndTurnoAndEstadoNotIn(
                any(), any(), any())).thenReturn(false);
        when(mudanzaRepository.saveAndFlush(any(Mudanza.class))).thenAnswer(i -> i.getArgument(0));

        mudanzaService.aceptarContrapropuesta(20L, "cli");

        verify(eventoService).registrarMudanza(any(Mudanza.class), eq(TipoEvento.CAMBIO_ESTADO),
                eq("CONTRAPROPUESTO"), eq("ACEPTADO"), eq(ActorTipo.CLIENTE), eq(cliente), isNull());
    }

    @Test
    void rechazarContrapropuesta_registraClienteConDetalle() {
        User cliente = user(1L, "cli", UserRole.CLIENT);
        User proveedor = user(2L, "prov", UserRole.PROVIDER);
        Mudanza m = mudanza(20L, cliente, MudanzaEstado.CONTRAPROPUESTO);
        m.setProveedor(proveedor);
        when(userRepository.findByFirebaseUid("cli")).thenReturn(Optional.of(cliente));
        when(mudanzaRepository.findById(20L)).thenReturn(Optional.of(m));
        when(mudanzaRepository.save(any(Mudanza.class))).thenAnswer(i -> i.getArgument(0));

        mudanzaService.rechazarContrapropuesta(20L, "cli");

        verify(eventoService).registrarMudanza(any(Mudanza.class), eq(TipoEvento.CAMBIO_ESTADO),
                eq("CONTRAPROPUESTO"), eq("CANCELADO"), eq(ActorTipo.CLIENTE), eq(cliente),
                eq("Contrapropuesta rechazada"));
    }

    @Test
    void iniciarMudanza_registraProveedorComoActor() {
        User cliente = user(1L, "cli", UserRole.CLIENT);
        User proveedor = user(2L, "prov", UserRole.PROVIDER);
        Mudanza m = mudanza(20L, cliente, MudanzaEstado.ACEPTADO);
        m.setProveedor(proveedor);
        when(userRepository.findByFirebaseUid("prov")).thenReturn(Optional.of(proveedor));
        when(mudanzaRepository.findById(20L)).thenReturn(Optional.of(m));
        when(mudanzaRepository.save(any(Mudanza.class))).thenAnswer(i -> i.getArgument(0));

        mudanzaService.iniciarMudanza(20L, "prov");

        verify(eventoService).registrarMudanza(any(Mudanza.class), eq(TipoEvento.CAMBIO_ESTADO),
                eq("ACEPTADO"), eq("EN_CURSO"), eq(ActorTipo.PROVEEDOR), eq(proveedor), isNull());
    }

    @Test
    void finalizarMudanza_sinExtra_registraFinalizado() {
        User cliente = user(1L, "cli", UserRole.CLIENT);
        User proveedor = user(2L, "prov", UserRole.PROVIDER);
        Mudanza m = mudanza(20L, cliente, MudanzaEstado.EN_CURSO);
        m.setProveedor(proveedor);
        m.setIniciadoAt(LocalDateTime.now().minusMinutes(30));
        when(userRepository.findByFirebaseUid("prov")).thenReturn(Optional.of(proveedor));
        when(mudanzaRepository.findById(20L)).thenReturn(Optional.of(m));
        when(featureFlagService.getNumber(eq("mudanza_ratio_tiempo"), any(Double.class))).thenReturn(1.0);
        when(mudanzaRepository.save(any(Mudanza.class))).thenAnswer(i -> i.getArgument(0));

        mudanzaService.finalizarMudanza(20L, "prov");

        verify(eventoService).registrarMudanza(any(Mudanza.class), eq(TipoEvento.CAMBIO_ESTADO),
                eq("EN_CURSO"), eq("FINALIZADO"), eq(ActorTipo.PROVEEDOR), eq(proveedor), isNull());
    }

    @Test
    void finalizarMudanza_conExtra_registraPendientePagoExtra() {
        User cliente = user(1L, "cli", UserRole.CLIENT);
        User proveedor = user(2L, "prov", UserRole.PROVIDER);
        Mudanza m = mudanza(20L, cliente, MudanzaEstado.EN_CURSO);
        m.setProveedor(proveedor);
        // minutosIncluidos = 120 (ver tier()); forzamos un exceso con 200 min reales
        m.setIniciadoAt(LocalDateTime.now().minusMinutes(200));
        when(userRepository.findByFirebaseUid("prov")).thenReturn(Optional.of(proveedor));
        when(mudanzaRepository.findById(20L)).thenReturn(Optional.of(m));
        when(featureFlagService.getNumber(eq("mudanza_ratio_tiempo"), any(Double.class))).thenReturn(1.0);
        when(mudanzaRepository.save(any(Mudanza.class))).thenAnswer(i -> i.getArgument(0));

        mudanzaService.finalizarMudanza(20L, "prov");

        verify(eventoService).registrarMudanza(any(Mudanza.class), eq(TipoEvento.CAMBIO_ESTADO),
                eq("EN_CURSO"), eq("PENDIENTE_PAGO_EXTRA"), eq(ActorTipo.PROVEEDOR), eq(proveedor), isNull());
    }

    @Test
    void pagarExtra_registraClienteComoActor() {
        User cliente = user(1L, "cli", UserRole.CLIENT);
        User proveedor = user(2L, "prov", UserRole.PROVIDER);
        Mudanza m = mudanza(20L, cliente, MudanzaEstado.PENDIENTE_PAGO_EXTRA);
        m.setProveedor(proveedor);
        m.setMontoExtra(new BigDecimal("5000"));
        when(userRepository.findByFirebaseUid("cli")).thenReturn(Optional.of(cliente));
        when(mudanzaRepository.findById(20L)).thenReturn(Optional.of(m));
        when(mudanzaRepository.save(any(Mudanza.class))).thenAnswer(i -> i.getArgument(0));

        mudanzaService.pagarExtra(20L, "cli");

        verify(eventoService).registrarMudanza(any(Mudanza.class), eq(TipoEvento.CAMBIO_ESTADO),
                eq("PENDIENTE_PAGO_EXTRA"), eq("FINALIZADO"), eq(ActorTipo.CLIENTE), eq(cliente), isNull());
    }

    @Test
    void completarMudanza_registraClienteComoActor() {
        User cliente = user(1L, "cli", UserRole.CLIENT);
        User proveedor = user(2L, "prov", UserRole.PROVIDER);
        Mudanza m = mudanza(20L, cliente, MudanzaEstado.FINALIZADO);
        m.setProveedor(proveedor);
        m.setMontoFinal(new BigDecimal("50000"));
        m.setComisionMonto(new BigDecimal("5000"));
        m.setMontoProveedor(new BigDecimal("45000"));
        when(userRepository.findByFirebaseUid("cli")).thenReturn(Optional.of(cliente));
        when(mudanzaRepository.findById(20L)).thenReturn(Optional.of(m));
        when(mudanzaRepository.save(any(Mudanza.class))).thenAnswer(i -> i.getArgument(0));

        mudanzaService.completarMudanza(20L, "cli");

        verify(eventoService).registrarMudanza(any(Mudanza.class), eq(TipoEvento.CAMBIO_ESTADO),
                eq("FINALIZADO"), eq("COMPLETADO"), eq(ActorTipo.CLIENTE), eq(cliente), isNull());
    }

    @Test
    void cancelarMudanza_registraClienteConMotivoComoDetalle() {
        User cliente = user(1L, "cli", UserRole.CLIENT);
        Mudanza m = mudanza(20L, cliente, MudanzaEstado.PENDIENTE);
        when(userRepository.findByFirebaseUid("cli")).thenReturn(Optional.of(cliente));
        when(mudanzaRepository.findById(20L)).thenReturn(Optional.of(m));
        when(mudanzaRepository.save(any(Mudanza.class))).thenAnswer(i -> i.getArgument(0));

        mudanzaService.cancelarMudanza(20L, "cli", "Cambié de planes");

        verify(eventoService).registrarMudanza(any(Mudanza.class), eq(TipoEvento.CAMBIO_ESTADO),
                eq("PENDIENTE"), eq("CANCELADO"), eq(ActorTipo.CLIENTE), eq(cliente),
                eq("Cambié de planes"));
    }
}
