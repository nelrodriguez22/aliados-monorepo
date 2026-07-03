package com.aliados.backend.entity;

import jakarta.persistence.*;
import lombok.Data;
import org.hibernate.annotations.CreationTimestamp;
import java.time.LocalDateTime;

@Entity
@Table(name = "trabajo_oferta",
       uniqueConstraints = @UniqueConstraint(name = "uq_trabajo_oferta_trabajo_proveedor",
               columnNames = {"trabajo_id", "proveedor_id"}))
@Data
public class TrabajoOferta {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "trabajo_id", nullable = false)
    private Trabajo trabajo;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "proveedor_id", nullable = false)
    private User proveedor;

    @Column(nullable = false)
    private Integer grupo;

    @CreationTimestamp
    @Column(name = "ofrecido_at", nullable = false, updatable = false)
    private LocalDateTime ofrecidoAt;

    @Column(name = "respondio_at")
    private LocalDateTime respondioAt;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private ResultadoOferta resultado = ResultadoOferta.OFRECIDA;
}
