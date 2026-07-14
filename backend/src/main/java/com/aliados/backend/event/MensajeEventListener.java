package com.aliados.backend.event;

import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * Le avisa al destinatario de un mensaje por WebSocket SÓLO después de que la transacción de
 * {@code ChatService#enviarMensaje} hizo commit. Antes, el socket se publicaba dentro de la
 * transacción: si algo después del publish tiraba (o el commit mismo fallaba, algo que Neon hace
 * sin necesidad de ningún bug de código, por ser serverless), el destinatario ya había visto un
 * mensaje que la base nunca terminó de guardar — un mensaje fantasma, inaceptable en un log que
 * es evidencia legal. Con AFTER_COMMIT el único modo de falla posible es "mensaje demorado": si
 * este listener falla, el mensaje ya está en la base y aparece al recargar. Eso es estrictamente
 * mejor que un mensaje fantasma.
 *
 * <p><b>Por qué acá SÓLO vive el socket</b> (presencia, throttle y push volvieron a
 * {@code ChatService#enviarMensaje}, ver el comentario largo ahí): el socket es el único de los
 * dos avisos que entrega de forma INMEDIATA e IRREVOCABLE — por eso, y sólo por eso, tiene que
 * esperar al commit. El push no tiene ese problema: {@code NotificacionService#enviarNotificacion}
 * ya publica su propio {@code NotificacionCreatedEvent} AFTER_COMMIT, así que su entrega real
 * (WS + FCM) también queda post-commit sin necesidad de vivir en ESTE listener.
 *
 * <p><b>ADVERTENCIA — no mover {@code enviarNotificacion} para acá de nuevo.</b> Ya se hizo una
 * vez (commit 67bfc25) y rompió el push en producción de forma silenciosa. El motivo:
 * {@code enviarNotificacion} es {@code @Transactional(REQUIRED)} y hace su propio
 * {@code notificacionRepository.save(...)}. Un listener {@code AFTER_COMMIT} corre en
 * {@code afterCompletion(STATUS_COMMITTED)}, DESPUÉS de que la transacción ya hizo commit pero
 * ANTES de que Spring haga {@code doCleanupAfterCompletion()} — en esa ventana el
 * {@code EntityManagerHolder} sigue bindeado al hilo, así que {@code isExistingTransaction()}
 * devuelve {@code true} y el {@code @Transactional(REQUIRED)} anidado "participa" de la
 * transacción YA COMMITEADA en vez de abrir una nueva: no hay {@code BEGIN} ni {@code COMMIT}
 * nuevos, así que el {@code save} de la {@code Notificacion} nunca persiste. Encadenado: el
 * {@code NotificacionCreatedEvent} que dispara ese save queda registrado como synchronization en
 * lugar de ejecutarse, y cuando por fin se invoca lo hace con {@code STATUS_UNKNOWN} (no
 * {@code STATUS_COMMITTED}), así que {@code NotificacionEventListener} tampoco corre nunca. Todo
 * esto pasa EN SILENCIO porque Spring traga las excepciones que tiran los listeners
 * {@code AFTER_COMMIT}. Resultado con un destinatario desconectado: ni fila en
 * {@code notificaciones}, ni WebSocket a {@code /queue/notifications}, ni push FCM — y encima el
 * throttle de 5 minutos igual se consume, así que ni se autorrepara con el próximo mensaje.
 */
@Component
public class MensajeEventListener {

    private final SimpMessagingTemplate messagingTemplate;

    public MensajeEventListener(SimpMessagingTemplate messagingTemplate) {
        this.messagingTemplate = messagingTemplate;
    }

    // fallbackExecution=true es obligatorio: sin eso, los tests unitarios (que corren sin
    // transacción real) dejarían de publicar y la suite dejaría de probar este camino.
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
    public void onMensajeCreated(MensajeCreatedEvent e) {
        messagingTemplate.convertAndSendToUser(
                e.destinatario().getFirebaseUid(), "/queue/chat", e.dto());
    }
}
