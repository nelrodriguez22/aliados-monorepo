package com.aliados.backend.entity;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "mudanza_tiers")
@Data
@NoArgsConstructor
public class MudanzaTier {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true)
    private String nombre; // BRONCE, PLATA, ORO, DIAMANTE

    @Column(nullable = false)
    private String emoji; // 🥉🥈🥇💎

    @Column(nullable = false)
    private Double precioBase;

    @Column(nullable = false)
    private Integer minutosIncluidos; // mínimo de horas en minutos

    @Column(nullable = false)
    private Double precioBloque30Min; // precio por cada bloque extra de 30 min

    @Column(nullable = false, length = 500)
    private String descripcion; // texto corto

    @Column(columnDefinition = "TEXT")
    private String descripcionCompleta; // qué incluye / qué no incluye

    @Column(nullable = false)
    private Boolean activo = true;

    @Column(nullable = false)
    private Integer orden = 0; // para ordenar en el frontend (1=Diamante, 4=Bronce)
}
