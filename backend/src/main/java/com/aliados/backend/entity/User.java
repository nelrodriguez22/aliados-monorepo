package com.aliados.backend.entity;

import jakarta.persistence.*;
import lombok.Data;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;

@Entity
@Table(name = "users")
@Data
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true)
    private String firebaseUid;

    @Column(nullable = false, unique = true)
    private String email;

    @Column(nullable = false)
    @Enumerated(EnumType.STRING)
    private UserRole role;

    @Column(nullable = false)
    private String nombre;

    private String telefono;

    private String fotoPerfil;

    @Column(nullable = false)
    private Boolean activo = true;

    @CreationTimestamp
    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(nullable = false)
    private LocalDateTime updatedAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "oficio_id")
    private Oficio oficio;

    @Column
    private String matricula;

    @Column
    private String localidad;
    // NUEVO: Reemplaza 'online' y 'ocupado' con un solo enum
    @Column(nullable = false)
    @Enumerated(EnumType.STRING)
    private UserStatus status = UserStatus.OFFLINE;

    // NUEVO: Para saber cuándo fue la última vez que estuvo activo
    private LocalDateTime lastSeenAt;

    @Column(name = "fcm_token")
    private String fcmToken;

    // Denormalizado (#8): se recalcula al crear una calificación (CalificacionService).
    @Column(name = "promedio_calificacion", nullable = false)
    private Double promedioCalificacion = 0.0;

    @Column(name = "cantidad_calificaciones", nullable = false)
    private Long cantidadCalificaciones = 0L;

}