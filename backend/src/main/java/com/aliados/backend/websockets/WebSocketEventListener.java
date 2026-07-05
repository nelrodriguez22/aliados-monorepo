package com.aliados.backend.websockets;

import com.aliados.backend.entity.UserStatus;
import com.aliados.backend.service.UserService;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.messaging.SessionConnectedEvent;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;

import java.security.Principal;
import java.time.LocalDateTime;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

@Component
public class WebSocketEventListener {

    private static final Logger logger = LoggerFactory.getLogger(WebSocketEventListener.class);

    // Pool con thread daemon (no bloquea el shutdown de la JVM) y nombre para logs/profiling.
    private final ScheduledExecutorService scheduler = Executors.newScheduledThreadPool(1, r -> {
        Thread t = new Thread(r, "ws-offline-scheduler");
        t.setDaemon(true);
        return t;
    });

    @Autowired
    private UserService userService;

    @PreDestroy
    public void shutdown() {
        scheduler.shutdown();
        try {
            if (!scheduler.awaitTermination(2, TimeUnit.SECONDS)) {
                scheduler.shutdownNow();
            }
        } catch (InterruptedException e) {
            scheduler.shutdownNow();
            Thread.currentThread().interrupt();
        }
    }

    @EventListener
    public void handleWebSocketConnectListener(SessionConnectedEvent event) {
        Principal user = event.getUser();

        if (user != null) {
            String firebaseUid = user.getName();
            var userEntity = userService.getUserEntityByFirebaseUid(firebaseUid);

            if (userEntity != null && userEntity.getStatus() == UserStatus.BUSY) {
                logger.debug("✅ Usuario {} conectado - Mantiene status: BUSY", firebaseUid);
            } else {
                userService.updateUserStatus(firebaseUid, UserStatus.ONLINE);
                logger.debug("✅ Usuario {} conectado - Status: ONLINE", firebaseUid);
            }
        }
    }

    @EventListener
    public void handleWebSocketDisconnectListener(SessionDisconnectEvent event) {
        Principal user = event.getUser();

        if (user != null) {
            String firebaseUid = user.getName();
            // Momento del disconnect: si el usuario vuelve a verse (reconexión → updateUserStatus
            // refresca lastSeenAt) después de este instante, NO lo marcamos offline.
            LocalDateTime disconnectAt = LocalDateTime.now();
            logger.debug("🔌 Usuario {} desconectado, verificando en 5s...", firebaseUid);

            scheduler.schedule(() -> {
                try {
                    var userEntity = userService.getUserEntityByFirebaseUid(firebaseUid);
                    if (userEntity == null) return;

                    // Si está BUSY no tocar — tiene trabajos en curso.
                    if (userEntity.getStatus() == UserStatus.BUSY) {
                        logger.debug("⏳ Usuario {} está BUSY, no se marca offline", firebaseUid);
                        return;
                    }

                    // Anti-flapping: si hubo actividad (reconexión) después del disconnect, el
                    // usuario sigue conectado → no lo marcamos offline.
                    LocalDateTime lastSeen = userEntity.getLastSeenAt();
                    if (lastSeen != null && lastSeen.isAfter(disconnectAt)) {
                        logger.debug("🔄 Usuario {} se reconectó dentro de la ventana, sigue online", firebaseUid);
                        return;
                    }

                    userService.updateUserStatus(firebaseUid, UserStatus.OFFLINE);
                    logger.debug("✅ Usuario {} marcado OFFLINE", firebaseUid);
                } catch (Exception e) {
                    logger.error("Error en disconnect handler: {}", e.getMessage());
                }
            }, 5, TimeUnit.SECONDS);
        }
    }
}
