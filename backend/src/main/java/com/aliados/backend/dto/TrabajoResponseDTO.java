package com.aliados.backend.dto;

import com.aliados.backend.entity.Oficio;
import com.aliados.backend.entity.TrabajoEstado;
import lombok.Data;
import java.time.LocalDateTime;

@Data
public class TrabajoResponseDTO {
    private Long id;
    private Long clienteId;
    private String clienteNombre;
    private Long proveedorId;
    private String proveedorNombre;
    private Oficio oficio;
    private TrabajoEstado estado;
    private String descripcion;
    private String direccion;
    private Double latitudCliente;
    private Double longitudCliente;
    private Integer tiempoEstimadoMinutos;
    private Double precioEstimado;
    private String fotos;
    private LocalDateTime createdAt;
    private LocalDateTime acceptedAt;
    private LocalDateTime completedAt;
    private Boolean calificado;
    private Double proveedorPromedioCalificacion;
    private Integer calificacionEstrellas;
    private Double tarifaVisita;
}