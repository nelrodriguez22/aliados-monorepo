package com.aliados.backend.service;

import com.aliados.backend.entity.TipoNotificacion;
import com.aliados.backend.entity.User;
import com.aliados.backend.entity.UserRole;
import com.aliados.backend.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class BroadcastService {

    private static final Logger log = LoggerFactory.getLogger(BroadcastService.class);

    private final UserRepository userRepository;
    private final NotificacionService notificacionService;

    public BroadcastService(UserRepository userRepository, NotificacionService notificacionService) {
        this.userRepository = userRepository;
        this.notificacionService = notificacionService;
    }

    /** Usuarios activos del segmento. ADMIN nunca recibe. */
    public List<User> resolverDestinatarios(String segmento) {
        List<UserRole> roles = switch (segmento == null ? "" : segmento) {
            case "TODOS" -> List.of(UserRole.CLIENT, UserRole.PROVIDER);
            case "CLIENTES" -> List.of(UserRole.CLIENT);
            case "PROVEEDORES" -> List.of(UserRole.PROVIDER);
            default -> throw new IllegalArgumentException("Segmento inválido: " + segmento);
        };
        return userRepository.findByRoleInAndActivoTrue(roles);
    }

    /** Envío asíncrono: una notificación (campanita + push) por usuario. Tolera fallos. */
    @Async
    public void enviarAsync(List<String> firebaseUids, String titulo, String mensaje, String adminUid) {
        log.info("Broadcast a {} usuarios por admin={}", firebaseUids.size(), adminUid);
        for (String uid : firebaseUids) {
            try {
                notificacionService.enviarNotificacion(uid, TipoNotificacion.ANUNCIO, titulo, mensaje, null, null);
            } catch (Exception e) {
                log.error("Error enviando broadcast a {}: {}", uid, e.getMessage());
            }
        }
        log.info("Broadcast completado para admin={}", adminUid);
    }
}
