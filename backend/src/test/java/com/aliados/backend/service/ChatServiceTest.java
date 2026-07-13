package com.aliados.backend.service;

import com.aliados.backend.dto.EnviarMensajeDTO;
import com.aliados.backend.entity.*;
import com.aliados.backend.exception.NotFoundException;
import com.aliados.backend.repository.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.messaging.simp.SimpMessagingTemplate;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ChatServiceTest {

    @Mock ConversacionRepository conversacionRepository;
    @Mock MensajeRepository mensajeRepository;
    @Mock LecturaConversacionRepository lecturaRepository;
    @Mock UserRepository userRepository;
    @Mock ConversacionService conversacionService;
    @Mock DetectorContacto detectorContacto;
    @Mock PresenciaService presenciaService;
    @Mock PushThrottle pushThrottle;
    @Mock NotificacionService notificacionService;
    @Mock SimpMessagingTemplate messagingTemplate;

    @InjectMocks ChatService chatService;

    private User cliente;
    private User proveedor;
    private User tercero;
    private Conversacion conversacion;

    @BeforeEach
    void setUp() {
        cliente = new User();
        cliente.setId(1L);
        cliente.setFirebaseUid("uid-cliente");
        cliente.setNombre("Ana");

        proveedor = new User();
        proveedor.setId(2L);
        proveedor.setFirebaseUid("uid-proveedor");
        proveedor.setNombre("Beto");

        tercero = new User();
        tercero.setId(99L);
        tercero.setFirebaseUid("uid-tercero");
        tercero.setNombre("Intruso");

        conversacion = new Conversacion();
        conversacion.setId(10L);
        conversacion.setCliente(cliente);
        conversacion.setProveedor(proveedor);
    }

    private EnviarMensajeDTO dtoTexto(String texto) {
        EnviarMensajeDTO dto = new EnviarMensajeDTO();
        dto.setTipo(TipoMensaje.TEXTO);
        dto.setContenido(texto);
        return dto;
    }

    // --- AUTORIZACIÓN (donde viven los IDOR) ---

    @Test
    void tercero_noPuedeEnviar() {
        when(conversacionRepository.findById(10L)).thenReturn(Optional.of(conversacion));
        when(userRepository.findByFirebaseUid("uid-tercero")).thenReturn(Optional.of(tercero));

        assertThatThrownBy(() ->
                chatService.enviarMensaje(10L, "uid-tercero", dtoTexto("hola")))
                .isInstanceOf(SecurityException.class);

        verify(mensajeRepository, never()).save(any());
    }

    @Test
    void tercero_noPuedeLeer() {
        when(conversacionRepository.findById(10L)).thenReturn(Optional.of(conversacion));
        when(userRepository.findByFirebaseUid("uid-tercero")).thenReturn(Optional.of(tercero));

        assertThatThrownBy(() ->
                chatService.listarMensajes(10L, "uid-tercero", org.springframework.data.domain.PageRequest.of(0, 20)))
                .isInstanceOf(SecurityException.class);
    }

    @Test
    void conversacionInexistente_lanzaNotFound() {
        when(conversacionRepository.findById(404L)).thenReturn(Optional.empty());

        assertThatThrownBy(() ->
                chatService.enviarMensaje(404L, "uid-cliente", dtoTexto("hola")))
                .isInstanceOf(NotFoundException.class);
    }

    // --- LOG CONGELADO ---

    @Test
    void servicioCerrado_rechazaEnvio() {
        when(conversacionRepository.findById(10L)).thenReturn(Optional.of(conversacion));
        when(userRepository.findByFirebaseUid("uid-cliente")).thenReturn(Optional.of(cliente));
        when(conversacionService.resolverModo(conversacion)).thenReturn(ModoChat.LECTURA);

        assertThatThrownBy(() ->
                chatService.enviarMensaje(10L, "uid-cliente", dtoTexto("hola")))
                .isInstanceOf(IllegalStateException.class);

        verify(mensajeRepository, never()).save(any());
    }

    @Test
    void servicioCerrado_permiteLeer() {
        when(conversacionRepository.findById(10L)).thenReturn(Optional.of(conversacion));
        when(userRepository.findByFirebaseUid("uid-cliente")).thenReturn(Optional.of(cliente));
        when(mensajeRepository.findByConversacionIdOrderByIdDesc(eq(10L), any()))
                .thenReturn(org.springframework.data.domain.Page.empty());

        chatService.listarMensajes(10L, "uid-cliente",
                org.springframework.data.domain.PageRequest.of(0, 20));

        verify(mensajeRepository).findByConversacionIdOrderByIdDesc(eq(10L), any());
    }

    // --- ENVÍO FELIZ ---

    @Test
    void clienteEnvia_persisteYPublicaAlProveedor() {
        when(conversacionRepository.findById(10L)).thenReturn(Optional.of(conversacion));
        when(userRepository.findByFirebaseUid("uid-cliente")).thenReturn(Optional.of(cliente));
        when(conversacionService.resolverModo(conversacion)).thenReturn(ModoChat.ESCRITURA);
        when(detectorContacto.contieneContacto("el portón está abierto")).thenReturn(false);
        when(mensajeRepository.save(any(Mensaje.class))).thenAnswer(inv -> {
            Mensaje m = inv.getArgument(0);
            m.setId(100L);
            return m;
        });
        when(presenciaService.estaConectado("uid-proveedor")).thenReturn(true);

        chatService.enviarMensaje(10L, "uid-cliente", dtoTexto("el portón está abierto"));

        // Persiste ANTES de publicar: un mensaje fantasma en un log que es evidencia es peor
        // que un mensaje demorado.
        var orden = inOrder(mensajeRepository, messagingTemplate);
        orden.verify(mensajeRepository).save(any(Mensaje.class));
        orden.verify(messagingTemplate)
                .convertAndSendToUser(eq("uid-proveedor"), eq("/queue/chat"), any());
    }

    // --- REGLA DE PRESENCIA ---

    @Test
    void destinatarioConectado_noMandaPush() {
        when(conversacionRepository.findById(10L)).thenReturn(Optional.of(conversacion));
        when(userRepository.findByFirebaseUid("uid-cliente")).thenReturn(Optional.of(cliente));
        when(conversacionService.resolverModo(conversacion)).thenReturn(ModoChat.ESCRITURA);
        when(mensajeRepository.save(any(Mensaje.class))).thenAnswer(inv -> {
            Mensaje m = inv.getArgument(0);
            m.setId(100L);
            return m;
        });
        when(presenciaService.estaConectado("uid-proveedor")).thenReturn(true);

        chatService.enviarMensaje(10L, "uid-cliente", dtoTexto("hola"));

        verifyNoInteractions(notificacionService);
    }

    @Test
    void destinatarioDesconectado_mandaPush() {
        when(conversacionRepository.findById(10L)).thenReturn(Optional.of(conversacion));
        when(userRepository.findByFirebaseUid("uid-cliente")).thenReturn(Optional.of(cliente));
        when(conversacionService.resolverModo(conversacion)).thenReturn(ModoChat.ESCRITURA);
        when(mensajeRepository.save(any(Mensaje.class))).thenAnswer(inv -> {
            Mensaje m = inv.getArgument(0);
            m.setId(100L);
            return m;
        });
        when(presenciaService.estaConectado("uid-proveedor")).thenReturn(false);
        when(pushThrottle.deboNotificar(10L, 2L)).thenReturn(true);
        // El destinatario es el proveedor (no el cliente): destinatarioEsCliente = false.
        when(conversacionService.entidadIdDe(conversacion)).thenReturn(123L);
        when(conversacionService.deepLinkChat(conversacion, false))
                .thenReturn("/proveedor/trabajo-activo/123");

        chatService.enviarMensaje(10L, "uid-cliente", dtoTexto("hola"));

        verify(notificacionService).enviarNotificacion(
                eq("uid-proveedor"),
                eq(TipoNotificacion.MENSAJE_CHAT),
                anyString(),
                anyString(),
                eq(123L),
                eq("/proveedor/trabajo-activo/123"));
    }

    // Desconectado PERO ya se le notificó hace un minuto: no vibra de nuevo. Una ráfaga de
    // mensajes no puede ser una ráfaga de vibraciones.
    @Test
    void destinatarioDesconectadoPeroThrottleado_noMandaPush() {
        when(conversacionRepository.findById(10L)).thenReturn(Optional.of(conversacion));
        when(userRepository.findByFirebaseUid("uid-cliente")).thenReturn(Optional.of(cliente));
        when(conversacionService.resolverModo(conversacion)).thenReturn(ModoChat.ESCRITURA);
        when(mensajeRepository.save(any(Mensaje.class))).thenAnswer(inv -> {
            Mensaje m = inv.getArgument(0);
            m.setId(100L);
            return m;
        });
        when(presenciaService.estaConectado("uid-proveedor")).thenReturn(false);
        when(pushThrottle.deboNotificar(10L, 2L)).thenReturn(false);

        chatService.enviarMensaje(10L, "uid-cliente", dtoTexto("hola"));

        verifyNoInteractions(notificacionService);
        // Pero el mensaje SÍ se guardó y SÍ se publicó por el socket: el throttle sólo silencia
        // la vibración, nunca pierde el mensaje.
        verify(mensajeRepository).save(any(Mensaje.class));
        verify(messagingTemplate).convertAndSendToUser(eq("uid-proveedor"), eq("/queue/chat"), any());
    }

    // --- MARCADO DE CONTACTO ---

    @Test
    void mensajeConTelefono_seGuardaMarcadoYSinCensurar() {
        when(conversacionRepository.findById(10L)).thenReturn(Optional.of(conversacion));
        when(userRepository.findByFirebaseUid("uid-cliente")).thenReturn(Optional.of(cliente));
        when(conversacionService.resolverModo(conversacion)).thenReturn(ModoChat.ESCRITURA);
        when(detectorContacto.contieneContacto("llamame al 1155554444")).thenReturn(true);
        when(mensajeRepository.save(any(Mensaje.class))).thenAnswer(inv -> {
            Mensaje m = inv.getArgument(0);
            m.setId(100L);
            return m;
        });
        when(presenciaService.estaConectado(anyString())).thenReturn(true);

        chatService.enviarMensaje(10L, "uid-cliente", dtoTexto("llamame al 1155554444"));

        var captor = org.mockito.ArgumentCaptor.forClass(Mensaje.class);
        verify(mensajeRepository).save(captor.capture());
        Mensaje guardado = captor.getValue();

        assertThat(guardado.getContieneContacto()).isTrue();
        // SIN CENSURAR: marcar y censurar son incompatibles. Censurar destruye la evidencia.
        assertThat(guardado.getContenido()).isEqualTo("llamame al 1155554444");
    }

    // --- PUNTERO DE LECTURA ---

    @Test
    void sinPuntero_todosLosMensajesSonNoLeidos() {
        when(conversacionRepository.findById(10L)).thenReturn(Optional.of(conversacion));
        when(userRepository.findByFirebaseUid("uid-cliente")).thenReturn(Optional.of(cliente));
        when(lecturaRepository.findByConversacionIdAndUsuarioId(10L, 1L))
                .thenReturn(Optional.empty());
        when(mensajeRepository.countByConversacionId(10L)).thenReturn(7L);

        assertThat(chatService.contarNoLeidos(10L, "uid-cliente")).isEqualTo(7L);
    }

    @Test
    void conPuntero_cuentaSoloLosPosteriores() {
        LecturaConversacion lectura = new LecturaConversacion();
        lectura.setConversacionId(10L);
        lectura.setUsuarioId(1L);
        lectura.setUltimoMensajeLeidoId(5L);

        when(conversacionRepository.findById(10L)).thenReturn(Optional.of(conversacion));
        when(userRepository.findByFirebaseUid("uid-cliente")).thenReturn(Optional.of(cliente));
        when(lecturaRepository.findByConversacionIdAndUsuarioId(10L, 1L))
                .thenReturn(Optional.of(lectura));
        when(mensajeRepository.countByConversacionIdAndIdGreaterThan(10L, 5L)).thenReturn(2L);

        assertThat(chatService.contarNoLeidos(10L, "uid-cliente")).isEqualTo(2L);
    }
}
