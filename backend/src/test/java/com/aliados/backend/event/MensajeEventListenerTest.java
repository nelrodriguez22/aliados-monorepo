package com.aliados.backend.event;

import com.aliados.backend.dto.MensajeResponseDTO;
import com.aliados.backend.entity.Conversacion;
import com.aliados.backend.entity.Mensaje;
import com.aliados.backend.entity.TipoMensaje;
import com.aliados.backend.entity.TipoNotificacion;
import com.aliados.backend.entity.User;
import com.aliados.backend.service.ConversacionService;
import com.aliados.backend.service.NotificacionService;
import com.aliados.backend.service.PresenciaService;
import com.aliados.backend.service.PushThrottle;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.messaging.simp.SimpMessagingTemplate;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

/**
 * Cubre el lado "avisarle al destinatario" (socket + push) que antes vivía dentro de
 * ChatService#enviarMensaje y ahora corre acá, AFTER_COMMIT (ver MensajeEventListener).
 */
@ExtendWith(MockitoExtension.class)
class MensajeEventListenerTest {

    @Mock SimpMessagingTemplate messagingTemplate;
    @Mock PresenciaService presenciaService;
    @Mock PushThrottle pushThrottle;
    @Mock NotificacionService notificacionService;
    @Mock ConversacionService conversacionService;

    @InjectMocks MensajeEventListener listener;

    private User cliente;
    private User proveedor;
    private Conversacion conversacion;
    private Mensaje mensaje;
    private MensajeResponseDTO dto;

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

        conversacion = new Conversacion();
        conversacion.setId(10L);
        conversacion.setCliente(cliente);
        conversacion.setProveedor(proveedor);

        mensaje = new Mensaje();
        mensaje.setId(100L);
        mensaje.setTipo(TipoMensaje.TEXTO);
        mensaje.setContenido("hola");

        dto = new MensajeResponseDTO();
        dto.setId(100L);
        dto.setContenido("hola");
    }

    @Test
    void publicaSiempreAlDestinatarioPorSocket() {
        when(presenciaService.estaConectado("uid-proveedor")).thenReturn(true);

        MensajeCreatedEvent evento = new MensajeCreatedEvent(conversacion, cliente, proveedor, mensaje, dto);
        listener.onMensajeCreated(evento);

        verify(messagingTemplate).convertAndSendToUser(eq("uid-proveedor"), eq("/queue/chat"), eq(dto));
    }

    @Test
    void destinatarioConectado_noMandaPush() {
        when(presenciaService.estaConectado("uid-proveedor")).thenReturn(true);

        listener.onMensajeCreated(new MensajeCreatedEvent(conversacion, cliente, proveedor, mensaje, dto));

        verifyNoInteractions(notificacionService);
    }

    @Test
    void destinatarioDesconectado_mandaPush() {
        when(presenciaService.estaConectado("uid-proveedor")).thenReturn(false);
        when(pushThrottle.deboNotificar(10L, 2L)).thenReturn(true);
        // El destinatario es el proveedor (no el cliente): destinatarioEsCliente = false.
        when(conversacionService.entidadIdDe(conversacion)).thenReturn(123L);
        when(conversacionService.deepLinkChat(conversacion, false))
                .thenReturn("/proveedor/trabajo-activo/123");

        listener.onMensajeCreated(new MensajeCreatedEvent(conversacion, cliente, proveedor, mensaje, dto));

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
        when(presenciaService.estaConectado("uid-proveedor")).thenReturn(false);
        when(pushThrottle.deboNotificar(10L, 2L)).thenReturn(false);

        listener.onMensajeCreated(new MensajeCreatedEvent(conversacion, cliente, proveedor, mensaje, dto));

        verifyNoInteractions(notificacionService);
        // Pero el mensaje SÍ se publica por el socket: el throttle sólo silencia la vibración,
        // nunca pierde el mensaje.
        verify(messagingTemplate).convertAndSendToUser(eq("uid-proveedor"), eq("/queue/chat"), any());
    }

    @Test
    void destinatarioEsCliente_presenciaYThrottleSeEvaluanContraElCliente() {
        // Mensaje del proveedor: el destinatario ahora es el cliente (id 1), no el proveedor.
        when(presenciaService.estaConectado("uid-cliente")).thenReturn(false);
        when(pushThrottle.deboNotificar(10L, 1L)).thenReturn(true);
        when(conversacionService.entidadIdDe(conversacion)).thenReturn(456L);
        when(conversacionService.deepLinkChat(conversacion, true))
                .thenReturn("/cliente/trabajo-activo/456");

        listener.onMensajeCreated(new MensajeCreatedEvent(conversacion, proveedor, cliente, mensaje, dto));

        verify(pushThrottle).deboNotificar(10L, 1L);
        verify(notificacionService).enviarNotificacion(
                eq("uid-cliente"),
                eq(TipoNotificacion.MENSAJE_CHAT),
                anyString(),
                anyString(),
                eq(456L),
                eq("/cliente/trabajo-activo/456"));
    }
}
