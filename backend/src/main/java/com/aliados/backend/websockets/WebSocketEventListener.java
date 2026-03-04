package com.aliados.backend.websockets;

import com.aliados.backend.entity.UserStatus;
import com.aliados.backend.service.UserService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.messaging.SessionConnectedEvent;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;

import java.security.Principal;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

@Component
public class WebSocketEventListener {

    private static final Logger logger = LoggerFactory.getLogger(WebSocketEventListener.class);
    private final ScheduledExecutorService scheduler = Executors.newScheduledThreadPool(1);

    @Autowired
    private UserService userService;

    @EventListener
    public void handleWebSocketConnectListener(SessionConnectedEvent event) {
        Principal user = event.getUser();

        if (user != null) {
            String firebaseUid = user.getName();
            var userEntity = userService.getUserEntityByFirebaseUid(firebaseUid);

            if (userEntity != null && userEntity.getStatus() == UserStatus.BUSY) {
                logger.info("✅ Usuario {} conectado - Mantiene status: BUSY", firebaseUid);
            } else {
                userService.updateUserStatus(firebaseUid, UserStatus.ONLINE);
                logger.info("✅ Usuario {} conectado - Status: ONLINE", firebaseUid);
            }
        }
    }

    @EventListener
    public void handleWebSocketDisconnectListener(SessionDisconnectEvent event) {
        Principal user = event.getUser();

        if (user != null) {
            String firebaseUid = user.getName();
            logger.info("🔌 Usuario {} desconectado, verificando en 5s...", firebaseUid);

            scheduler.schedule(() -> {
                try {
                    var userEntity = userService.getUserEntityByFirebaseUid(firebaseUid);
                    if (userEntity == null) return;

                    // Si está BUSY no tocar — tiene trabajos en curso
                    if (userEntity.getStatus() == UserStatus.BUSY) {
                        logger.info("⏳ Usuario {} está BUSY, no se marca offline", firebaseUid);
                        return;
                    }

                    // Si sigue ONLINE después de 5s, se reconectó (el connect lo puso ONLINE de nuevo)
                    // Verificar si realmente se fue checkeando el lastSeenAt
                    userService.updateUserStatus(firebaseUid, UserStatus.OFFLINE);
                    logger.info("✅ Usuario {} marcado OFFLINE", firebaseUid);
                } catch (Exception e) {
                    logger.error("Error en disconnect handler: {}", e.getMessage());
                }
            }, 5, TimeUnit.SECONDS);
        }
    }
}
