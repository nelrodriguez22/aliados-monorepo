package com.aliados.backend.service;

import com.aliados.backend.dto.EnviarMensajeDTO;
import com.aliados.backend.entity.*;
import com.aliados.backend.event.MensajeCreatedEvent;
import com.aliados.backend.exception.ChatCerradoException;
import com.aliados.backend.exception.NotFoundException;
import com.aliados.backend.repository.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;

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
    @Mock ApplicationEventPublisher eventPublisher;
    @Mock PresenciaService presenciaService;
    @Mock PushThrottle pushThrottle;
    @Mock NotificacionService notificacionService;

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
                .isInstanceOf(ChatCerradoException.class);

        verify(mensajeRepository, never()).save(any());
    }

    // Antes este test se llamaba "servicioCerrado_permiteLeer" pero nunca stubeaba resolverModo
    // a LECTURA: en los hechos sólo probaba que listarMensajes llama al repo. La razón por la que
    // no se stubeaba es la pista real: con Mockito en modo strict, stubear algo que no se usa
    // rompe el test con UnnecessaryStubbingException. Eso demuestra POSITIVAMENTE que
    // listarMensajes nunca consulta el modo del chat, que es la garantía correcta: un chat
    // cerrado (sólo lectura) tiene que seguir siendo legible.
    @Test
    void listarMensajes_nuncaConsultaModoChat_porEsoUnChatCerradoSigueSiendoLegible() {
        when(conversacionRepository.findById(10L)).thenReturn(Optional.of(conversacion));
        when(userRepository.findByFirebaseUid("uid-cliente")).thenReturn(Optional.of(cliente));
        when(mensajeRepository.findByConversacionIdOrderByIdDesc(eq(10L), any()))
                .thenReturn(org.springframework.data.domain.Page.empty());

        chatService.listarMensajes(10L, "uid-cliente",
                org.springframework.data.domain.PageRequest.of(0, 20));

        verify(mensajeRepository).findByConversacionIdOrderByIdDesc(eq(10L), any());
        verify(conversacionService, never()).resolverModo(any());
    }

    // --- ENVÍO FELIZ Y RUTEO DEL DESTINATARIO ---

    @Test
    void clienteEnvia_persisteYPublicaEventoAlProveedor() {
        when(conversacionRepository.findById(10L)).thenReturn(Optional.of(conversacion));
        when(userRepository.findByFirebaseUid("uid-cliente")).thenReturn(Optional.of(cliente));
        when(conversacionService.resolverModo(conversacion)).thenReturn(ModoChat.ESCRITURA);
        when(detectorContacto.contieneContacto("el portón está abierto")).thenReturn(false);
        when(mensajeRepository.save(any(Mensaje.class))).thenAnswer(inv -> {
            Mensaje m = inv.getArgument(0);
            m.setId(100L);
            return m;
        });

        chatService.enviarMensaje(10L, "uid-cliente", dtoTexto("el portón está abierto"));

        // Persiste ANTES de publicar el evento: el socket y el push sólo se disparan AFTER_COMMIT
        // (ver MensajeEventListener), así que ni siquiera acá hay garantía de entrega antes del
        // commit real — pero el orden save-antes-que-publish sigue siendo la base de esa garantía.
        var orden = inOrder(mensajeRepository, eventPublisher);
        orden.verify(mensajeRepository).save(any(Mensaje.class));
        orden.verify(eventPublisher).publishEvent(any(MensajeCreatedEvent.class));

        ArgumentCaptor<MensajeCreatedEvent> captor = ArgumentCaptor.forClass(MensajeCreatedEvent.class);
        verify(eventPublisher).publishEvent(captor.capture());
        MensajeCreatedEvent evento = captor.getValue();

        assertThat(evento.destinatario().getFirebaseUid()).isEqualTo("uid-proveedor");
        assertThat(evento.emisor().getFirebaseUid()).isEqualTo("uid-cliente");
        assertThat(evento.dto().getContenido()).isEqualTo("el portón está abierto");
    }

    // Un mutante que hace que destinatarioDe() siempre devuelva c.getProveedor() rompe el chat
    // entero (el proveedor se haría eco a sí mismo y el cliente jamás recibiría nada) pero la
    // suite anterior pasaba en verde porque los 12 tests originales sólo enviaban como cliente.
    // Este test cierra ese hueco enviando como PROVEEDOR.
    @Test
    void proveedorEnvia_publicaEventoAlCliente() {
        when(conversacionRepository.findById(10L)).thenReturn(Optional.of(conversacion));
        when(userRepository.findByFirebaseUid("uid-proveedor")).thenReturn(Optional.of(proveedor));
        when(conversacionService.resolverModo(conversacion)).thenReturn(ModoChat.ESCRITURA);
        when(detectorContacto.contieneContacto("ya llego")).thenReturn(false);
        when(mensajeRepository.save(any(Mensaje.class))).thenAnswer(inv -> {
            Mensaje m = inv.getArgument(0);
            m.setId(101L);
            return m;
        });

        chatService.enviarMensaje(10L, "uid-proveedor", dtoTexto("ya llego"));

        ArgumentCaptor<MensajeCreatedEvent> captor = ArgumentCaptor.forClass(MensajeCreatedEvent.class);
        verify(eventPublisher).publishEvent(captor.capture());
        MensajeCreatedEvent evento = captor.getValue();

        // El mensaje del proveedor tiene que publicarse hacia el CLIENTE, no hacia sí mismo.
        assertThat(evento.destinatario().getFirebaseUid()).isEqualTo("uid-cliente");
        assertThat(evento.emisor().getFirebaseUid()).isEqualTo("uid-proveedor");
        // Y todo lo que el listener necesita para evaluar presencia/throttle contra el
        // destinatario correcto (el cliente, id 1) también viaja en el evento.
        assertThat(evento.destinatario().getId()).isEqualTo(1L);
        assertThat(evento.conversacion().getCliente().getId()).isEqualTo(1L);
    }

    // --- PUSH (presencia + throttle + notificacionService) ---
    //
    // Vive acá y no en MensajeEventListenerTest porque el bloque de push corre DENTRO de
    // ChatService#enviarMensaje (ver el comentario largo ahí sobre por qué NO puede vivir en el
    // listener AFTER_COMMIT: enviarNotificacion() es @Transactional(REQUIRED) y desde ese
    // callback participaría en una transacción ya commiteada, sin persistir nunca la fila).

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
        // MINOR: si el destinatario está conectado, el throttle NI SIQUIERA se consulta. Esto lo
        // garantiza el corto-circuito de "desconectado && deboNotificar(...)" en ese orden: si
        // alguien invirtiera el && (o cambiara el orden de los operandos), este assert es el
        // único que lo detecta — sin él, la ventana de 5 minutos se quemaría con el usuario
        // todavía conectado y su primera push genuina, al desconectarse, quedaría suprimida.
        verifyNoInteractions(pushThrottle);
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
    // mensajes no puede ser una ráfaga de vibraciones. El mensaje en sí SIEMPRE se persiste y se
    // publica por socket (eso lo prueba MensajeEventListenerTest); el throttle sólo silencia la
    // vibración.
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
        verify(mensajeRepository).save(any(Mensaje.class));
    }

    @Test
    void destinatarioEsCliente_presenciaYThrottleSeEvaluanContraElCliente() {
        // Mensaje del proveedor: el destinatario ahora es el cliente (id 1), no el proveedor.
        when(conversacionRepository.findById(10L)).thenReturn(Optional.of(conversacion));
        when(userRepository.findByFirebaseUid("uid-proveedor")).thenReturn(Optional.of(proveedor));
        when(conversacionService.resolverModo(conversacion)).thenReturn(ModoChat.ESCRITURA);
        when(mensajeRepository.save(any(Mensaje.class))).thenAnswer(inv -> {
            Mensaje m = inv.getArgument(0);
            m.setId(101L);
            return m;
        });
        when(presenciaService.estaConectado("uid-cliente")).thenReturn(false);
        when(pushThrottle.deboNotificar(10L, 1L)).thenReturn(true);
        when(conversacionService.entidadIdDe(conversacion)).thenReturn(456L);
        when(conversacionService.deepLinkChat(conversacion, true))
                .thenReturn("/cliente/trabajo-activo/456");

        chatService.enviarMensaje(10L, "uid-proveedor", dtoTexto("ya llego"));

        verify(pushThrottle).deboNotificar(10L, 1L);
        verify(notificacionService).enviarNotificacion(
                eq("uid-cliente"),
                eq(TipoNotificacion.MENSAJE_CHAT),
                anyString(),
                anyString(),
                eq(456L),
                eq("/cliente/trabajo-activo/456"));
    }

    // --- MINOR: resumen() del push (mensajes.mensaje es VARCHAR(255); el truncado a 80 es lo
    // único que evita un desborde, y antes de este test no tenía NINGUNA aserción — título y
    // mensaje se verificaban con anyString()). ---

    @Test
    void mensajeImagen_resumenDelPushEsIconoFoto() {
        EnviarMensajeDTO dto = new EnviarMensajeDTO();
        dto.setTipo(TipoMensaje.IMAGEN);
        dto.setImagenUrl("https://ejemplo.com/foto.jpg");

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
        when(conversacionService.entidadIdDe(conversacion)).thenReturn(123L);
        when(conversacionService.deepLinkChat(conversacion, false)).thenReturn("/x");

        chatService.enviarMensaje(10L, "uid-cliente", dto);

        ArgumentCaptor<String> resumenCaptor = ArgumentCaptor.forClass(String.class);
        verify(notificacionService).enviarNotificacion(
                eq("uid-proveedor"), eq(TipoNotificacion.MENSAJE_CHAT), anyString(),
                resumenCaptor.capture(), eq(123L), anyString());

        assertThat(resumenCaptor.getValue()).isEqualTo("📷 Foto");
    }

    @Test
    void mensajeTextoLargo_resumenDelPushSeTruncaA80ConSufijo() {
        String textoLargo = "a".repeat(120);

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
        when(conversacionService.entidadIdDe(conversacion)).thenReturn(123L);
        when(conversacionService.deepLinkChat(conversacion, false)).thenReturn("/x");

        chatService.enviarMensaje(10L, "uid-cliente", dtoTexto(textoLargo));

        ArgumentCaptor<String> resumenCaptor = ArgumentCaptor.forClass(String.class);
        verify(notificacionService).enviarNotificacion(
                eq("uid-proveedor"), eq(TipoNotificacion.MENSAJE_CHAT), anyString(),
                resumenCaptor.capture(), eq(123L), anyString());

        String resumen = resumenCaptor.getValue();
        assertThat(resumen).hasSize(80);
        assertThat(resumen).endsWith("...");
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

        chatService.enviarMensaje(10L, "uid-cliente", dtoTexto("llamame al 1155554444"));

        var captor = org.mockito.ArgumentCaptor.forClass(Mensaje.class);
        verify(mensajeRepository).save(captor.capture());
        Mensaje guardado = captor.getValue();

        assertThat(guardado.getContieneContacto()).isTrue();
        // SIN CENSURAR: marcar y censurar son incompatibles. Censurar destruye la evidencia.
        assertThat(guardado.getContenido()).isEqualTo("llamame al 1155554444");
    }

    // --- PUNTERO DE LECTURA (contarNoLeidos) ---

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

    @Test
    void contarNoLeidos_tercero_lanzaSecurityException() {
        when(conversacionRepository.findById(10L)).thenReturn(Optional.of(conversacion));
        when(userRepository.findByFirebaseUid("uid-tercero")).thenReturn(Optional.of(tercero));

        assertThatThrownBy(() -> chatService.contarNoLeidos(10L, "uid-tercero"))
                .isInstanceOf(SecurityException.class);

        verifyNoInteractions(lecturaRepository);
    }

    // --- marcarLeido: nadie lo probaba. La regla de oro ("el puntero sólo avanza") no la
    // protegía ningún test: alguien podía "simplificar" el if a un set incondicional y la suite
    // seguía en verde. Tampoco estaban cubiertas ni la autorización ni la validación de
    // pertenencia a la conversación. ---

    @Test
    void marcarLeido_tercero_lanzaSecurityException() {
        when(conversacionRepository.findById(10L)).thenReturn(Optional.of(conversacion));
        when(userRepository.findByFirebaseUid("uid-tercero")).thenReturn(Optional.of(tercero));

        assertThatThrownBy(() -> chatService.marcarLeido(10L, "uid-tercero", 5L))
                .isInstanceOf(SecurityException.class);

        verifyNoInteractions(lecturaRepository);
    }

    @Test
    void marcarLeido_idMenorAlPuntero_noRetrocede() {
        LecturaConversacion lectura = new LecturaConversacion();
        lectura.setConversacionId(10L);
        lectura.setUsuarioId(1L);
        lectura.setUltimoMensajeLeidoId(20L);

        when(conversacionRepository.findById(10L)).thenReturn(Optional.of(conversacion));
        when(userRepository.findByFirebaseUid("uid-cliente")).thenReturn(Optional.of(cliente));
        when(lecturaRepository.findByConversacionIdAndUsuarioId(10L, 1L))
                .thenReturn(Optional.of(lectura));

        chatService.marcarLeido(10L, "uid-cliente", 5L);

        assertThat(lectura.getUltimoMensajeLeidoId()).isEqualTo(20L);
        verify(lecturaRepository, never()).save(any());
        // Como no avanza, ni siquiera hace falta validar que el mensaje pertenezca a la
        // conversación.
        verifyNoInteractions(mensajeRepository);
    }

    @Test
    void marcarLeido_idMayorAlPuntero_avanzaYGuarda() {
        LecturaConversacion lectura = new LecturaConversacion();
        lectura.setConversacionId(10L);
        lectura.setUsuarioId(1L);
        lectura.setUltimoMensajeLeidoId(5L);

        when(conversacionRepository.findById(10L)).thenReturn(Optional.of(conversacion));
        when(userRepository.findByFirebaseUid("uid-cliente")).thenReturn(Optional.of(cliente));
        when(lecturaRepository.findByConversacionIdAndUsuarioId(10L, 1L))
                .thenReturn(Optional.of(lectura));
        when(mensajeRepository.existsByIdAndConversacionId(20L, 10L)).thenReturn(true);

        chatService.marcarLeido(10L, "uid-cliente", 20L);

        assertThat(lectura.getUltimoMensajeLeidoId()).isEqualTo(20L);
        verify(lecturaRepository).save(lectura);
    }

    @Test
    void marcarLeido_sinPunteroPrevio_avanzaYGuarda() {
        when(conversacionRepository.findById(10L)).thenReturn(Optional.of(conversacion));
        when(userRepository.findByFirebaseUid("uid-cliente")).thenReturn(Optional.of(cliente));
        when(lecturaRepository.findByConversacionIdAndUsuarioId(10L, 1L))
                .thenReturn(Optional.empty());
        when(mensajeRepository.existsByIdAndConversacionId(3L, 10L)).thenReturn(true);

        chatService.marcarLeido(10L, "uid-cliente", 3L);

        var captor = org.mockito.ArgumentCaptor.forClass(LecturaConversacion.class);
        verify(lecturaRepository).save(captor.capture());
        assertThat(captor.getValue().getUltimoMensajeLeidoId()).isEqualTo(3L);
    }

    // --- MINOR: marcarLeido con un mensaje que no es de esta conversación ---

    @Test
    void marcarLeido_mensajeDeOtraConversacion_lanzaIllegalArgumentException() {
        when(conversacionRepository.findById(10L)).thenReturn(Optional.of(conversacion));
        when(userRepository.findByFirebaseUid("uid-cliente")).thenReturn(Optional.of(cliente));
        when(lecturaRepository.findByConversacionIdAndUsuarioId(10L, 1L))
                .thenReturn(Optional.empty());
        // Long.MAX_VALUE es el ejemplo canónico: si esto no se validara, el puntero quedaría ahí
        // para siempre (sólo avanza) y contarNoLeidos devolvería 0 de forma irrecuperable.
        when(mensajeRepository.existsByIdAndConversacionId(Long.MAX_VALUE, 10L)).thenReturn(false);

        assertThatThrownBy(() -> chatService.marcarLeido(10L, "uid-cliente", Long.MAX_VALUE))
                .isInstanceOf(IllegalArgumentException.class);

        verify(lecturaRepository, never()).save(any());
    }

    // --- MINOR: hastaMensajeId nulo no debe romper por NPE ---

    @Test
    void marcarLeido_hastaMensajeIdNulo_esNoOp() {
        when(conversacionRepository.findById(10L)).thenReturn(Optional.of(conversacion));
        when(userRepository.findByFirebaseUid("uid-cliente")).thenReturn(Optional.of(cliente));
        when(lecturaRepository.findByConversacionIdAndUsuarioId(10L, 1L))
                .thenReturn(Optional.empty());

        chatService.marcarLeido(10L, "uid-cliente", null);

        verify(lecturaRepository, never()).save(any());
        verifyNoInteractions(mensajeRepository);
    }
}
