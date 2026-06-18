package com.aliados.backend.event;

import com.aliados.backend.dto.NotificacionResponseDTO;
import com.aliados.backend.entity.User;

public record NotificacionCreatedEvent(
        String firebaseUid,
        NotificacionResponseDTO dto,
        User usuario,
        String titulo,
        String mensaje,
        String actionUrl
) {}
