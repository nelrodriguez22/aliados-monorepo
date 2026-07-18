package com.aliados.backend.service;

import com.aliados.backend.entity.User;
import com.aliados.backend.repository.UserRepository;
import com.google.firebase.messaging.FirebaseMessaging;
import com.google.firebase.messaging.FirebaseMessagingException;
import com.google.firebase.messaging.Message;
import com.google.firebase.messaging.MessagingErrorCode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

@Service
public class PushNotificationService {

    private static final Logger logger = LoggerFactory.getLogger(PushNotificationService.class);

    private final UserRepository userRepository;

    public PushNotificationService(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    @Async
    public void enviarPush(User usuario, String titulo, String mensaje, String actionUrl) {
        if (usuario.getFcmToken() == null || usuario.getFcmToken().isEmpty()) return;

        try {
            // Data-only (sin `notification`): en web/PWA un mensaje con `notification` lo muestra
            // el navegador solo Y además el onBackgroundMessage del SW → notificación duplicada.
            // Mandando solo `data`, el SW es el único que la muestra (via showNotification).
            Message message = Message.builder()
                    .setToken(usuario.getFcmToken())
                    .putData("title", titulo != null ? titulo : "Aliados")
                    .putData("body", mensaje != null ? mensaje : "")
                    .putData("actionUrl", actionUrl != null ? actionUrl : "/")
                    .build();

            FirebaseMessaging.getInstance().send(message);
            logger.info("📱 Push enviada a {}", usuario.getEmail());
        } catch (FirebaseMessagingException e) {
            // Token muerto (app desinstalada / token rotado o malformado): lo limpiamos para
            // no seguir intentando en cada notificación. (#15 del informe)
            MessagingErrorCode code = e.getMessagingErrorCode();
            if (code == MessagingErrorCode.UNREGISTERED || code == MessagingErrorCode.INVALID_ARGUMENT) {
                logger.warn("🧹 Token FCM inválido ({}) para {} — limpiando", code, usuario.getEmail());
                userRepository.clearFcmToken(usuario.getId());
            } else {
                logger.error("❌ Error enviando push (FCM {}): {}", code, e.getMessage());
            }
        } catch (Exception e) {
            logger.error("❌ Error enviando push: {}", e.getMessage());
        }
    }
}
