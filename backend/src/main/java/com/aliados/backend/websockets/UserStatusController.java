package com.aliados.backend.websockets;

import com.aliados.backend.dto.UserStatusDTO;
import com.aliados.backend.entity.User;
import com.aliados.backend.entity.UserRole;
import com.aliados.backend.entity.UserStatus;
import com.aliados.backend.repository.TrabajoRepository;
import com.aliados.backend.repository.UserRepository;
import com.aliados.backend.exception.NotFoundException;
import com.aliados.backend.service.UserService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.stereotype.Controller;

import java.security.Principal;

@Controller
public class UserStatusController {

    private static final Logger logger = LoggerFactory.getLogger(UserStatusController.class);

    @Autowired
    private UserService userService;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private TrabajoRepository trabajoRepository;

    // El UID se toma SIEMPRE del Principal establecido (y verificado contra Firebase) en el
    // frame CONNECT por WebSocketAuthInterceptor. Antes cada mensaje re-verificaba el token
    // (verifyIdToken en cada heartbeat, c/30s por usuario); ahora no. (#13 del informe)

    // Heartbeat: el frontend lo envía cada 30 segundos para confirmar que sigue activo.
    @MessageMapping("/heartbeat")
    public void heartbeat(Principal principal) {
        if (principal != null) {
            logger.debug("Heartbeat recibido de usuario {}", principal.getName());
        }
    }

    // Cambio manual de estado (ej: proveedor acepta job → BUSY).
    @MessageMapping("/status")
    public void updateStatus(@Payload UserStatusDTO statusDTO, Principal principal) {
        if (principal != null && principal.getName().equals(statusDTO.getFirebaseUid())) {
            userService.updateUserStatus(principal.getName(), statusDTO.getStatus());
            logger.debug("Usuario {} cambió estado a {}", principal.getName(), statusDTO.getStatus());
        }
    }

    @MessageMapping("/authenticate")
    public void authenticate(Principal principal) {
        if (principal == null) {
            logger.warn("❌ Autenticación WS rechazada: sin principal autenticado en el CONNECT");
            return;
        }

        String firebaseUid = principal.getName();
        logger.debug("✅ Autenticación recibida para UID: {}", firebaseUid);

        User user = userRepository.findByFirebaseUid(firebaseUid)
                .orElseThrow(() -> new NotFoundException("Usuario no encontrado"));

        if (user.getRole() == UserRole.PROVIDER) {
            int trabajosActivos = trabajoRepository.countTrabajosActivosYCola(user.getId());

            if (trabajosActivos > 0) {
                userService.updateUserStatus(firebaseUid, UserStatus.BUSY);
                logger.debug("✅ Usuario {} marcado como BUSY ({} trabajos activos/en cola)", firebaseUid, trabajosActivos);
            } else {
                logger.debug("✅ Usuario {} conectó WebSocket - Status actual: {}", firebaseUid, user.getStatus());
            }
        } else {
            userService.updateUserStatus(firebaseUid, UserStatus.ONLINE);
            logger.debug("✅ Cliente {} marcado como ONLINE", firebaseUid);
        }
    }
}
