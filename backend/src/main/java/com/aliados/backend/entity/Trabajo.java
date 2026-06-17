package com.aliados.backend.entity;

import jakarta.persistence.*;
import lombok.Data;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.UpdateTimestamp;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "trabajos")
@Data
public class Trabajo {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "cliente_id", nullable = false)
    private User cliente;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "proveedor_id")
    private User proveedor;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "oficio_id", nullable = false)
    private Oficio oficio;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private TrabajoEstado estado = TrabajoEstado.PENDIENTE;

    @Column(nullable = false, length = 1000)
    private String descripcion;

    @Column(nullable = false)
    private String direccion;

    @Column(nullable = false)
    private Double latitudCliente;

    @Column(nullable = false)
    private Double longitudCliente;

    private Double latitudProveedor;
    private Double longitudProveedor;

    // Destino (opcional, usado por Flete)
    private String direccionDestino;
    private Double latitudDestino;
    private Double longitudDestino;

    private Integer tiempoEstimadoMinutos;

    @Column(precision = 12, scale = 2)
    private BigDecimal precioEstimado;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private String fotos; // JSON array de URLs

    @Column
    private LocalDateTime notificadoAt;

    @Column
    private Long proveedorNotificadoId;

    @CreationTimestamp
    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt;

    private LocalDateTime acceptedAt;
    private LocalDateTime completedAt;

    private LocalDateTime propuestoAt;

    @UpdateTimestamp
    @Column(nullable = false)
    private LocalDateTime updatedAt;

    @Column
    private String motivoCancelacion;

    @Column(precision = 12, scale = 2)
    private BigDecimal tarifaVisita;
}