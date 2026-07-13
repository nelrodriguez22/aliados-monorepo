package com.aliados.backend.event;

import com.aliados.backend.dto.MensajeResponseDTO;
import com.aliados.backend.entity.Conversacion;
import com.aliados.backend.entity.Mensaje;
import com.aliados.backend.entity.TipoMensaje;
import com.aliados.backend.entity.User;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.messaging.simp.SimpMessagingTemplate;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;

/**
 * Cubre el lado "avisarle al destinatario por socket" que corre AFTER_COMMIT (ver
 * MensajeEventListener). Presencia, throttle y push viven de nuevo en ChatServiceTest: ver el
 * comentario en MensajeEventListener sobre por qué esa parte NO puede vivir en este listener.
 */
@ExtendWith(MockitoExtension.class)
class MensajeEventListenerTest {

    @Mock SimpMessagingTemplate messagingTemplate;

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
        MensajeCreatedEvent evento = new MensajeCreatedEvent(conversacion, cliente, proveedor, mensaje, dto);
        listener.onMensajeCreated(evento);

        verify(messagingTemplate).convertAndSendToUser(eq("uid-proveedor"), eq("/queue/chat"), eq(dto));
    }

    @Test
    void destinatarioEsCliente_publicaAlCliente() {
        // Mensaje del proveedor: el destinatario ahora es el cliente, no el proveedor.
        MensajeCreatedEvent evento = new MensajeCreatedEvent(conversacion, proveedor, cliente, mensaje, dto);
        listener.onMensajeCreated(evento);

        verify(messagingTemplate).convertAndSendToUser(eq("uid-cliente"), eq("/queue/chat"), eq(dto));
    }
}
