package com.aliados.backend.service;

import com.aliados.backend.dto.NotificacionDTO;
import com.aliados.backend.dto.NotificacionResponseDTO;
import com.aliados.backend.entity.Notificacion;
import com.aliados.backend.entity.TipoNotificacion;
import com.aliados.backend.entity.User;
import com.aliados.backend.event.NotificacionCreatedEvent;
import com.aliados.backend.exception.ForbiddenException;
import com.aliados.backend.exception.NotFoundException;
import com.aliados.backend.repository.NotificacionRepository;
import com.aliados.backend.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.stream.Collectors;

@Service
@Transactional(readOnly = true) // sesión abierta durante el mapeo a DTO (asociaciones LAZY); los writers la sobreescriben con @Transactional
public class NotificacionService {

    @Autowired
    private NotificacionRepository notificacionRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private ApplicationEventPublisher eventPublisher;

    private static final Logger logger = LoggerFactory.getLogger(NotificacionService.class);


    @Transactional
    public void enviarNotificacion(String firebaseUid, TipoNotificacion tipo, String titulo, String mensaje, Long trabajoId, String actionUrl) {
        // Guardar en DB
        User usuario = userRepository.findByFirebaseUid(firebaseUid)
                .orElseThrow(() -> new NotFoundException("Usuario no encontrado"));

        Notificacion notificacion = new Notificacion();
        notificacion.setUsuario(usuario);
        notificacion.setTipo(tipo);
        notificacion.setTitulo(titulo);
        notificacion.setMensaje(mensaje);
        notificacion.setTrabajoId(trabajoId);
        notificacion.setActionUrl(actionUrl);
        notificacion.setLeida(false);
        notificacionRepository.save(notificacion);

        // Publicar evento: WS y push se emiten AFTER_COMMIT (evita notificaciones "fantasma")
        NotificacionResponseDTO dto = mapToDTO(notificacion);
        eventPublisher.publishEvent(
                new NotificacionCreatedEvent(firebaseUid, dto, usuario, titulo, mensaje, actionUrl));
    }
    public List<NotificacionResponseDTO> getNotificaciones(String firebaseUid) {
        User usuario = userRepository.findByFirebaseUid(firebaseUid)
                .orElseThrow(() -> new NotFoundException("Usuario no encontrado"));

        return notificacionRepository.findByUsuarioIdOrderByCreatedAtDesc(usuario.getId())
                .stream()
                .map(this::mapToDTO)
                .collect(Collectors.toList());
    }

    public Long getUnreadCount(String firebaseUid) {
        User usuario = userRepository.findByFirebaseUid(firebaseUid)
                .orElseThrow(() -> new NotFoundException("Usuario no encontrado"));

        return notificacionRepository.countByUsuarioIdAndLeidaFalse(usuario.getId());
    }

    @Transactional
    public void marcarComoLeida(Long notificacionId, String firebaseUid) {
        Notificacion notificacion = notificacionRepository.findById(notificacionId)
                .orElseThrow(() -> new NotFoundException("Notificación no encontrada"));

        if (!notificacion.getUsuario().getFirebaseUid().equals(firebaseUid)) {
            throw new ForbiddenException("No autorizado");
        }

        notificacion.setLeida(true);
        notificacionRepository.save(notificacion);
    }

    @Transactional
    public void marcarTodasComoLeidas(String firebaseUid) {
        User usuario = userRepository.findByFirebaseUid(firebaseUid)
                .orElseThrow(() -> new NotFoundException("Usuario no encontrado"));

        notificacionRepository.marcarTodasComoLeidas(usuario.getId());
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
