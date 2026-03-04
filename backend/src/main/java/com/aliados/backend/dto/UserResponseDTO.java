package com.aliados.backend.dto;

import com.aliados.backend.entity.Oficio;
import com.aliados.backend.entity.UserRole;
import com.aliados.backend.entity.UserStatus;
import lombok.Data;

import java.time.LocalDateTime;

@Data
public class UserResponseDTO {

    private Long id;
    private String firebaseUid;
    private String email;
    private UserRole role;
    private String nombre;
    private String telefono;
    private String fotoPerfil;
    private Boolean activo;
    private String localidad;

    // Nuevos campos para WebSocket
    private UserStatus status;
    private LocalDateTime lastSeenAt;

    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    private Double promedioCalificacion;
    private Long cantidadCalificaciones;
    private Long totalTrabajosCompletados;

    private Oficio oficio;
}