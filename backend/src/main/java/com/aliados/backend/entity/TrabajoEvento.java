package com.aliados.backend.entity;

import jakarta.persistence.*;
import lombok.Data;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

/**
 * Audit log append-only del ciclo de vida de un Trabajo. Una fila por transición
 * (de estado o de estado de pago), con quién la ejecutó. Jamás se actualiza ni
 * borra: es la fuente de verdad forense que los timestamps de Trabajo no dan
 * (se pisan ante re-transiciones y no registran actor).
 */
@Entity
@Table(name = "trabajo_evento")
@Data
public class TrabajoEvento {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "trabajo_id", nullable = false)
    private Trabajo trabajo;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private TipoEvento tipo;

    // String y no enum: guarda TrabajoEstado o EstadoPago según tipo.
    @Column(name = "valor_anterior", length = 30)
    private String valorAnterior; // NULL en la creación (∅ → PENDIENTE)

    @Column(name = "valor_nuevo", nullable = false, length = 30)
    private String valorNuevo;

    @Enumerated(EnumType.STRING)
    @Column(name = "actor_tipo", nullable = false, length = 20)
    private ActorTipo actorTipo;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "actor_id")
    private User actor; // NULL cuando actorTipo = SISTEMA

    @Column(length = 500)
    private String detalle; // motivo de cancelación, etc.

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;
}
