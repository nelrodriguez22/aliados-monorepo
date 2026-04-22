package com.aliados.backend.entity;

import jakarta.persistence.*;
import lombok.Data;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;

@Entity
@Table(name = "mudanzas")
@Data
public class Mudanza {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "cliente_id", nullable = false)
    private User cliente;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "proveedor_id")
    private User proveedor;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "tier_id", nullable = false)
    private MudanzaTier tier;

    @ManyToOne(fetch = FetchType.EAGER)
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

    // ── Media ──
    @Column(columnDefinition = "TEXT", nullable = false)
    private String fotos; // JSON array de URLs (obligatorio)

    @Column(length = 1000)
    private String notasCliente; // observaciones del cliente

    // ── Montos ──
    @Column(nullable = false)
    private Double montoBase; // lo que "pagó" el cliente por el tier

    private Double montoFinal; // calculado al finalizar
    private Double montoExtra; // excedente si hubo

    @Column(nullable = false)
    private Double comisionPorcentaje = 10.0; // ej: 10%

    private Double comisionMonto; // calculado
    private Double montoProveedor; // neto para el proveedor

    // ── Contrapropuesta ──
    @Column(length = 500)
    private String motivoContrapropuesta; // texto del proveedor

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
