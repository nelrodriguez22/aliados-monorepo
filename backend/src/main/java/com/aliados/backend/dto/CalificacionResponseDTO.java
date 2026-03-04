package com.aliados.backend.dto;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class CalificacionResponseDTO {
    private Long id;
    private Long trabajoId;
    private String clienteNombre;
    private Integer estrellas;
    private String comentario;
    private String oficioNombre;
    private LocalDateTime createdAt;
}