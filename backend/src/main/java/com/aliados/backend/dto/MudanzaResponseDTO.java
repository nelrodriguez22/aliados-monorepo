package com.aliados.backend.dto;

import com.aliados.backend.entity.MudanzaEstado;
import lombok.Data;

import java.time.LocalDateTime;

@Data
public class MudanzaResponseDTO {

    private Long id;

    // Cliente
    private Long clienteId;
    private String clienteNombre;

    // Proveedor
    private Long proveedorId;
    private String proveedorNombre;

    // Tier actual
    private Long tierId;
    private String tierNombre;
    private String tierEmoji;

    // Tier original (si hubo contrapropuesta)
    private Long tierOriginalId;
    private String tierOriginalNombre;

    // Estado
    private MudanzaEstado estado;

    // Ubicaciones
    private String direccionOrigen;
    private Double latitudOrigen;
    private Double longitudOrigen;
    private String direccionDestino;
    private Double latitudDestino;
    private Double longitudDestino;

    // Accesibilidad
    private Integer pisos;
    private Boolean tieneAscensor;

    // Media
    private String fotos;
    private String notasCliente;

    // Montos
    private Double montoBase;
    private Double montoFinal;
    private Double montoExtra;
    private Double comisionPorcentaje;
    private Double comisionMonto;
    private Double montoProveedor;

    // Contrapropuesta
    private String motivoContrapropuesta;

    // Cronómetro
    private LocalDateTime iniciadoAt;
    private LocalDateTime finalizadoAt;
    private Integer duracionRealMinutos;
    private Integer bloquesExtra;

    // Timestamps
    private LocalDateTime createdAt;
    private LocalDateTime reservadoAt;
    private LocalDateTime acceptedAt;
    private LocalDateTime completedAt;
    private LocalDateTime cancelledAt;
    private String motivoCancelacion;
}
