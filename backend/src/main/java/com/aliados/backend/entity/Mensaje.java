package com.aliados.backend.entity;

import jakarta.persistence.*;
import lombok.Data;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

@Entity
@Table(name = "mensaje")
@Data
public class Mensaje {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "conversacion_id", nullable = false)
    private Conversacion conversacion;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "emisor_id", nullable = false)
    private User emisor;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private TipoMensaje tipo;

    @Column(columnDefinition = "TEXT")
    private String contenido;

    @Column(name = "imagen_url", length = 500)
    private String imagenUrl;

    @Column(name = "contiene_contacto", nullable = false)
    private Boolean contieneContacto = false;

    @CreationTimestamp
    @Column(name = "creado_at", nullable = false, updatable = false)
    private LocalDateTime creadoAt;
}
