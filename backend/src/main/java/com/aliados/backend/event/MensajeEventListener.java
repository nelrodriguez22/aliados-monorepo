package com.aliados.backend.event;

import com.aliados.backend.entity.Conversacion;
import com.aliados.backend.entity.Mensaje;
import com.aliados.backend.entity.TipoMensaje;
import com.aliados.backend.entity.TipoNotificacion;
import com.aliados.backend.service.ConversacionService;
import com.aliados.backend.service.NotificacionService;
import com.aliados.backend.service.PresenciaService;
import com.aliados.backend.service.PushThrottle;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * Le avisa al destinatario de un mensaje (socket + push) SÓLO después de que la transacción de
 * {@code ChatService#enviarMensaje} hizo commit. Antes, el socket se publicaba dentro de la
 * transacción: si algo después del publish tiraba (o el commit mismo fallaba, algo que Neon hace
 * sin necesidad de ningún bug de código, por ser serverless), el destinatario ya había visto un
 * mensaje que la base nunca terminó de guardar — un mensaje fantasma, inaceptable en un log que
 * es evidencia legal. Con AFTER_COMMIT el único modo de falla posible es "mensaje demorado": si
 * este listener falla, el mensaje ya está en la base y aparece al recargar. Eso es estrictamente
 * mejor que un mensaje fantasma.
 */
@Component
public class MensajeEventListener {

    private final SimpMessagingTemplate messagingTemplate;
    private final PresenciaService presenciaService;
    private final PushThrottle pushThrottle;
    private final NotificacionService notificacionService;
    private final ConversacionService conversacionService;

    public MensajeEventListener(SimpMessagingTemplate messagingTemplate,
                                PresenciaService presenciaService,
                                PushThrottle pushThrottle,
                                NotificacionService notificacionService,
                                ConversacionService conversacionService) {
        this.messagingTemplate = messagingTemplate;
        this.presenciaService = presenciaService;
        this.pushThrottle = pushThrottle;
        this.notificacionService = notificacionService;
        this.conversacionService = conversacionService;
    }

    // fallbackExecution=true es obligatorio: sin eso, los tests unitarios (que corren sin
    // transacción real) dejarían de publicar y la suite dejaría de probar este camino.
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
    public void onMensajeCreated(MensajeCreatedEvent e) {
        messagingTemplate.convertAndSendToUser(
                e.destinatario().getFirebaseUid(), "/queue/chat", e.dto());

        // Push SÓLO si (a) no hay sesión WebSocket activa —si está conectado ya lo recibió
        // arriba— y (b) no se le notificó hace poco por esta conversación. El throttle sólo
        // silencia la VIBRACIÓN: el mensaje ya está persistido (commiteado) y ya salió por el
        // socket. Evaluar esto acá, después del commit, también evita gastar la ventana del
        // throttle en un envío que termina en rollback.
        Conversacion conversacion = e.conversacion();
        boolean desconectado = !presenciaService.estaConectado(e.destinatario().getFirebaseUid());
        if (desconectado
                && pushThrottle.deboNotificar(conversacion.getId(), e.destinatario().getId())) {
            boolean destinatarioEsCliente =
                    conversacion.getCliente().getId().equals(e.destinatario().getId());
            notificacionService.enviarNotificacion(
                    e.destinatario().getFirebaseUid(),
                    TipoNotificacion.MENSAJE_CHAT,
                    "Nuevo mensaje de " + e.emisor().getNombre(),
                    resumen(e.mensaje()),
                    conversacionService.entidadIdDe(conversacion),
                    conversacionService.deepLinkChat(conversacion, destinatarioEsCliente));
        }
    }

    private String resumen(Mensaje m) {
        if (m.getTipo() == TipoMensaje.IMAGEN) return "📷 Foto";
        String texto = m.getContenido();
        return texto.length() > 80 ? texto.substring(0, 77) + "..." : texto;
    }
}
