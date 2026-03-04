package com.aliados.backend.websockets;

import com.aliados.backend.dto.UserStatusDTO;
import com.aliados.backend.entity.User;
import com.aliados.backend.entity.UserRole;
import com.aliados.backend.entity.UserStatus;
import com.aliados.backend.repository.TrabajoRepository;
import com.aliados.backend.repository.UserRepository;
import com.aliados.backend.service.UserService;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseToken;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.stereotype.Controller;

import java.time.LocalDateTime;
import java.util.Map;

@Controller
public class UserStatusController {

    private static final Logger logger = LoggerFactory.getLogger(UserStatusController.class);

    @Autowired
    private UserService userService;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private TrabajoRepository trabajoRepository;

    // Heartbeat: el frontend envía esto cada 30 segundos para confirmar que sigue activo
    @MessageMapping("/heartbeat")
    public void heartbeat(@Payload Map<String, String> payload, SimpMessageHeaderAccessor headerAccessor) {
        String firebaseUid = extractFirebaseUid(headerAccessor);

        if (firebaseUid != null) {
            // Solo actualizar lastSeenAt, no cambiar el status
            logger.debug("Heartbeat recibido de usuario {}", firebaseUid);
        }
    }

    // Cambio manual de estado (ej: proveedor acepta job → BUSY)
    @MessageMapping("/status")
    public void updateStatus(@Payload UserStatusDTO statusDTO, SimpMessageHeaderAccessor headerAccessor) {
        String firebaseUid = extractFirebaseUid(headerAccessor);

        if (firebaseUid != null && firebaseUid.equals(statusDTO.getFirebaseUid())) {
            userService.updateUserStatus(firebaseUid, statusDTO.getStatus());
            logger.info("Usuario {} cambió estado a {}", firebaseUid, statusDTO.getStatus());
        }
    }

    private String extractFirebaseUid(SimpMessageHeaderAccessor headerAccessor) {
        try {
            String authHeader = headerAccessor.getFirstNativeHeader("Authorization");

            if (authHeader != null && authHeader.startsWith("Bearer ")) {
                String token = authHeader.substring(7);
                FirebaseToken decodedToken = FirebaseAuth.getInstance().verifyIdToken(token);
                return decodedToken.getUid();
            }
        } catch (Exception e) {
            logger.error("Error al extraer Firebase UID: {}", e.getMessage());
        }

        return null;
    }

    @MessageMapping("/authenticate")
    public void authenticate(@Payload Map<String, String> payload, SimpMessageHeaderAccessor headerAccessor) {
        String firebaseUid = payload.get("firebaseUid");

        if (firebaseUid != null) {
            logger.info("✅ Autenticación recibida para UID: {}", firebaseUid);

            headerAccessor.getSessionAttributes().put("firebaseUid", firebaseUid);

            User user = userRepository.findByFirebaseUid(firebaseUid)
                    .orElseThrow(() -> new RuntimeException("Usuario no encontrado"));

            if (user.getRole() == UserRole.PROVIDER) {
                int trabajosActivos = trabajoRepository.countTrabajosActivosYCola(user.getId());

                if (trabajosActivos > 0) {
                    userService.updateUserStatus(firebaseUid, UserStatus.BUSY);
                    logger.info("✅ Usuario {} marcado como BUSY ({} trabajos activos/en cola)", firebaseUid, trabajosActivos);
                } else {
                    logger.info("✅ Usuario {} conectó WebSocket - Status actual: {}", firebaseUid, user.getStatus());
                }
            } else {
                userService.updateUserStatus(firebaseUid, UserStatus.ONLINE);
                logger.info("✅ Cliente {} marcado como ONLINE", firebaseUid);
            }

        } else {
            logger.warn("❌ Autenticación sin firebaseUid");
        }
    }
}