package com.aliados.backend.entity;

import jakarta.persistence.*;
import lombok.Data;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

@Entity
@Table(name = "notificaciones")
@Data
public class Notificacion {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "user_id", nullable = false)
    private User usuario;

    @Column(nullable = false)
    private String tipo; // NUEVO_TRABAJO, PROVEEDOR_ASIGNADO, TRABAJO_COMPLETADO

    @Column(nullable = false)
    private String titulo;

    @Column(nullable = false)
    private String mensaje;

    private Long trabajoId;

    private String actionUrl;

    @Column(nullable = false)
    private Boolean leida = false;

    @CreationTimestamp
    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt;
}