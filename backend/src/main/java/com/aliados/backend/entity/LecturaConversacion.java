package com.aliados.backend.entity;

import jakarta.persistence.*;
import lombok.Data;

@Entity
@Table(name = "lectura_conversacion")
@IdClass(LecturaConversacionId.class)
@Data
public class LecturaConversacion {

    @Id
    @Column(name = "conversacion_id")
    private Long conversacionId;

    @Id
    @Column(name = "usuario_id")
    private Long usuarioId;

    // Puntero: "leí hasta este mensaje". Un solo UPDATE en lugar de N.
    @Column(name = "ultimo_mensaje_leido_id")
    private Long ultimoMensajeLeidoId;
}
