package com.aliados.backend.event;

import com.aliados.backend.dto.MensajeResponseDTO;
import com.aliados.backend.entity.Conversacion;
import com.aliados.backend.entity.Mensaje;
import com.aliados.backend.entity.User;

/**
 * Todo lo que el {@link MensajeEventListener} necesita para avisarle al destinatario (socket +
 * push) UNA VEZ que la transacción de {@code enviarMensaje} ya hizo commit. Llevar las entidades
 * completas (y no sólo ids) evita que el listener tenga que volver a resolver conversación/
 * usuarios contra la base.
 */
public record MensajeCreatedEvent(
        Conversacion conversacion,
        User emisor,
        User destinatario,
        Mensaje mensaje,
        MensajeResponseDTO dto
) {}
