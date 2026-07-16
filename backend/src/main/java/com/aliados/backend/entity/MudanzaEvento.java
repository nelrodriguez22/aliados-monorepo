package com.aliados.backend.entity;

import jakarta.persistence.*;
import lombok.Data;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

/** Gemela de TrabajoEvento para Mudanza. Ver la doc de esa clase. */
@Entity
@Table(name = "mudanza_evento")
@Data
public class MudanzaEvento {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "mudanza_id", nullable = false)
    private Mudanza mudanza;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private TipoEvento tipo;

    @Column(name = "valor_anterior", length = 30)
    private String valorAnterior;

    @Column(name = "valor_nuevo", nullable = false, length = 30)
    private String valorNuevo;

    @Enumerated(EnumType.STRING)
    @Column(name = "actor_tipo", nullable = false, length = 20)
    private ActorTipo actorTipo;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "actor_id")
    private User actor;

    @Column(length = 500)
    private String detalle;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;
}
