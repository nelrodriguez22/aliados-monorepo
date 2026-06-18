package com.aliados.backend.event;

import com.aliados.backend.service.PushNotificationService;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

@Component
public class NotificacionEventListener {

    private final SimpMessagingTemplate messagingTemplate;
    private final PushNotificationService pushNotificationService;

    public NotificacionEventListener(SimpMessagingTemplate messagingTemplate,
                                     PushNotificationService pushNotificationService) {
        this.messagingTemplate = messagingTemplate;
        this.pushNotificationService = pushNotificationService;
    }

    // Se ejecuta solo si la tx del caller commitea (fallbackExecution=true: si no hay tx,
    // se ejecuta igual de inmediato). Evita notificaciones "fantasma" en rollback.
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
    public void onNotificacionCreated(NotificacionCreatedEvent e) {
        messagingTemplate.convertAndSendToUser(e.firebaseUid(), "/queue/notifications", e.dto());
        pushNotificationService.enviarPush(e.usuario(), e.titulo(), e.mensaje(), e.actionUrl());
    }
}
