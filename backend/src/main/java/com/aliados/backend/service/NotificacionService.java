package com.aliados.backend.service;

import com.aliados.backend.dto.NotificacionDTO;
import com.aliados.backend.dto.NotificacionResponseDTO;
import com.aliados.backend.entity.Notificacion;
import com.aliados.backend.entity.User;
import com.aliados.backend.repository.NotificacionRepository;
import com.aliados.backend.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.stream.Collectors;

@Service
public class NotificacionService {

    @Autowired
    private NotificacionRepository notificacionRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private SimpMessagingTemplate messagingTemplate;

    private static final Logger logger = LoggerFactory.getLogger(NotificacionService.class);


    @Transactional
    public void enviarNotificacion(String firebaseUid, String tipo, String titulo, String mensaje, Long trabajoId, String actionUrl) {
        // Guardar en DB
        User usuario = userRepository.findByFirebaseUid(firebaseUid)
                .orElseThrow(() -> new RuntimeException("Usuario no encontrado"));

        Notificacion notificacion = new Notificacion();
        notificacion.setUsuario(usuario);
        notificacion.setTipo(tipo);
        notificacion.setTitulo(titulo);
        notificacion.setMensaje(mensaje);
        notificacion.setTrabajoId(trabajoId);
        notificacion.setActionUrl(actionUrl);
        notificacion.setLeida(false);
        notificacionRepository.save(notificacion);

        // Enviar por WebSocket
        NotificacionResponseDTO dto = mapToDTO(notificacion);
        messagingTemplate.convertAndSendToUser(firebaseUid, "/queue/notifications", dto);

        // Enviar push notification
        enviarPush(usuario, titulo, mensaje, actionUrl);
    }

    private void enviarPush(User usuario, String titulo, String mensaje, String actionUrl) {
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
    public List<NotificacionResponseDTO> getNotificaciones(String firebaseUid) {
        User usuario = userRepository.findByFirebaseUid(firebaseUid)
                .orElseThrow(() -> new RuntimeException("Usuario no encontrado"));

        return notificacionRepository.findByUsuarioIdOrderByCreatedAtDesc(usuario.getId())
                .stream()
                .map(this::mapToDTO)
                .collect(Collectors.toList());
    }

    public Long getUnreadCount(String firebaseUid) {
        User usuario = userRepository.findByFirebaseUid(firebaseUid)
                .orElseThrow(() -> new RuntimeException("Usuario no encontrado"));

        return notificacionRepository.countByUsuarioIdAndLeidaFalse(usuario.getId());
    }

    @Transactional
    public void marcarComoLeida(Long notificacionId, String firebaseUid) {
        Notificacion notificacion = notificacionRepository.findById(notificacionId)
                .orElseThrow(() -> new RuntimeException("Notificación no encontrada"));

        if (!notificacion.getUsuario().getFirebaseUid().equals(firebaseUid)) {
            throw new RuntimeException("No autorizado");
        }

        notificacion.setLeida(true);
        notificacionRepository.save(notificacion);
    }

    @Transactional
    public void marcarTodasComoLeidas(String firebaseUid) {
        User usuario = userRepository.findByFirebaseUid(firebaseUid)
                .orElseThrow(() -> new RuntimeException("Usuario no encontrado"));

        List<Notificacion> noLeidas = notificacionRepository.findByUsuarioIdOrderByCreatedAtDesc(usuario.getId())
                .stream()
                .filter(n -> !n.getLeida())
                .collect(Collectors.toList());

        noLeidas.forEach(n -> n.setLeida(true));
        notificacionRepository.saveAll(noLeidas);
    }

    private NotificacionResponseDTO mapToDTO(Notificacion n) {
        NotificacionResponseDTO dto = new NotificacionResponseDTO();
        dto.setId(n.getId());
        dto.setTipo(n.getTipo());
        dto.setTitulo(n.getTitulo());
        dto.setMensaje(n.getMensaje());
        dto.setTrabajoId(n.getTrabajoId());
        dto.setActionUrl(n.getActionUrl());
        dto.setLeida(n.getLeida());
        dto.setCreatedAt(n.getCreatedAt());
        return dto;
    }
}
