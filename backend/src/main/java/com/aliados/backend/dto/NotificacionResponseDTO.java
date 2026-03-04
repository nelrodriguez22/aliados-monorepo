package com.aliados.backend.dto;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class NotificacionResponseDTO {
    private Long id;
    private String tipo;
    private String titulo;
    private String mensaje;
    private Long trabajoId;
    private String actionUrl;
    private Boolean leida;
    private LocalDateTime createdAt;
}
