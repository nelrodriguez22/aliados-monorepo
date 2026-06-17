package com.aliados.backend.entity;

import jakarta.persistence.*;
import lombok.Data;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.UpdateTimestamp;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "mudanzas")
@Data
public class Mudanza {

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
    @JoinColumn(name = "tier_id", nullable = false)
    private MudanzaTier tier;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "tier_original_id")
    private MudanzaTier tierOriginal; // si hubo contrapropuesta, guarda el tier que eligió el cliente

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private MudanzaEstado estado = MudanzaEstado.PENDIENTE;

    // ── Origen ──
    @Column(nullable = false)
    private String direccionOrigen;

    @Column(nullable = false)
    private Double latitudOrigen;

    @Column(nullable = false)
    private Double longitudOrigen;

    // ── Destino ──
    @Column(nullable = false)
    private String direccionDestino;

    @Column(nullable = false)
    private Double latitudDestino;

    @Column(nullable = false)
    private Double longitudDestino;

    // ── Accesibilidad ──
    @Column(nullable = false)
    private Integer pisos = 0; // pisos por escalera

    @Column(nullable = false)
    private Boolean tieneAscensor = false;

    @Column(nullable = false)
    private Integer cantidadAmbientes; // cantidad de ambientes

    // ── Fecha y turno ──
    @Column(nullable = false)
    private LocalDate fechaDeseada; // fecha que pide el cliente

    private LocalDate fechaConfirmada; // fecha real agendada (puede diferir si hubo contrapropuesta)

    @Enumerated(EnumType.STRING)
    private MudanzaTurno turno; // PRIMERO (6:30hs) o SEGUNDO (~11hs), asignado al agendar

    // ── Media ──
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb", nullable = false)
    private String fotos; // JSON array de URLs (obligatorio)

    @Column(length = 1000)
    private String notasCliente; // observaciones del cliente

    // ── Montos ──
    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal montoBase; // lo que "pagó" el cliente por el tier

    @Column(precision = 12, scale = 2)
    private BigDecimal montoFinal; // calculado al finalizar

    @Column(precision = 12, scale = 2)
    private BigDecimal montoExtra; // excedente si hubo

    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal comisionPorcentaje = new BigDecimal("10.00"); // ej: 10%

    @Column(precision = 12, scale = 2)
    private BigDecimal comisionMonto; // calculado

    @Column(precision = 12, scale = 2)
    private BigDecimal montoProveedor; // neto para el proveedor

    // ── Contrapropuesta (puede ser de tier, fecha, o ambos) ──
    @Column(length = 500)
    private String motivoContrapropuesta;

    private LocalDate fechaOriginal; // si hubo contrapropuesta de fecha, guarda la que pidió el cliente

    // ── Cronómetro ──
    private LocalDateTime iniciadoAt; // proveedor presiona "Iniciar"
    private LocalDateTime finalizadoAt; // proveedor presiona "Finalizar"
    private Integer duracionRealMinutos; // calculado
    private Integer bloquesExtra; // bloques de 30min extra

    // ── Timestamps de flujo ──
    @CreationTimestamp
    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt;

    private LocalDateTime reservadoAt; // cliente "pagó"
    private LocalDateTime acceptedAt; // proveedor aceptó
    private LocalDateTime completedAt; // cliente calificó / cerró
    private LocalDateTime cancelledAt;

    @Column(length = 500)
    private String motivoCancelacion;

    @UpdateTimestamp
    @Column(nullable = false)
    private LocalDateTime updatedAt;
}
