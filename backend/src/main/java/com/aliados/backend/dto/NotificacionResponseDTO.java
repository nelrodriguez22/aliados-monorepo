package com.aliados.backend.dto;

import com.aliados.backend.entity.TipoNotificacion;
import lombok.Data;

import java.time.LocalDateTime;

@Data
public class NotificacionResponseDTO {
    private Long id;
    private TipoNotificacion tipo;
    private String titulo;
    private String mensaje;
    private Long trabajoId;
    private String actionUrl;
    private Boolean leida;
    private LocalDateTime createdAt;
}
