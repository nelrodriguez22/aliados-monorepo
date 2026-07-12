package com.aliados.backend.dto;

import com.aliados.backend.entity.EstadoPago;
import com.aliados.backend.entity.TrabajoEstado;
import lombok.Data;
import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
public class TrabajoResponseDTO {
    private Long id;
    private Long clienteId;
    private String clienteNombre;
    private Long proveedorId;
    private String proveedorNombre;
    private OficioResponseDTO oficio;
    private TrabajoEstado estado;
    private String descripcion;
    private String direccion;
    private Double latitudCliente;
    private Double longitudCliente;
    private String direccionDestino;
    private Double latitudDestino;
    private Double longitudDestino;
    private Integer tiempoEstimadoMinutos;
    private BigDecimal precioEstimado;
    private String fotos;
    private LocalDateTime createdAt;
    private LocalDateTime acceptedAt;
    private LocalDateTime completedAt;
    private Boolean calificado;
    private Double proveedorPromedioCalificacion;
    private Integer calificacionEstrellas;
    private BigDecimal tarifaVisita;
    private BigDecimal montoPresupuesto;
    private String notaResumen;
    private Boolean presupuestoAceptado;
    private BigDecimal montoPagado;
    private EstadoPago estadoPago;
    private LocalDateTime pagadoAt;
    private String codigoProveedor;
}