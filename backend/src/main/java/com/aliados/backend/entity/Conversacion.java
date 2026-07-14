package com.aliados.backend.entity;

import jakarta.persistence.*;
import lombok.Data;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

@Entity
@Table(name = "conversacion")
@Data
public class Conversacion {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // Exactamente uno de trabajo/mudanza está seteado (garantizado por CHECK en la base).
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "trabajo_id")
    private Trabajo trabajo;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "mudanza_id")
    private Mudanza mudanza;

    // Denormalizados a propósito: la autorización se resuelve con esta fila, sin joins al padre.
    // Es seguro porque el par cliente-proveedor es inmutable una vez asignado el proveedor.
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "cliente_id", nullable = false)
    private User cliente;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "proveedor_id", nullable = false)
    private User proveedor;

    @CreationTimestamp
    @Column(name = "creado_at", nullable = false, updatable = false)
    private LocalDateTime creadoAt;
}
