package com.aliados.backend.service;

import com.aliados.backend.entity.User;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

@Service
public class PushNotificationService {

    private static final Logger logger = LoggerFactory.getLogger(PushNotificationService.class);

    @Async
    public void enviarPush(User usuario, String titulo, String mensaje, String actionUrl) {
        if (usuario.getFcmToken() == null || usuario.getFcmToken().isEmpty()) return;

        try {
            com.google.firebase.messaging.Message message = com.google.firebase.messaging.Message.builder()
                    .setToken(usuario.getFcmToken())
                    .setNotification(com.google.firebase.messaging.Notification.builder()
                            .setTitle(titulo)
                            .setBody(mensaje)
                            .build())
                    .putData("actionUrl", actionUrl != null ? actionUrl : "/")
                    .build();

            com.google.firebase.messaging.FirebaseMessaging.getInstance().send(message);
            logger.info("📱 Push enviada a {}", usuario.getEmail());
        } catch (Exception e) {
            logger.error("❌ Error enviando push: {}", e.getMessage());
        }
    }
}
