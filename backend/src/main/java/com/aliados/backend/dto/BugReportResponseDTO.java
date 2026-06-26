package com.aliados.backend.dto;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class BugReportResponseDTO {
    private Long id;
    private String usuarioNombre;
    private String usuarioEmail;
    private String categoria;
    private String titulo;
    private String descripcion;
    private String url;
    private String estado;
    private LocalDateTime createdAt;
}
