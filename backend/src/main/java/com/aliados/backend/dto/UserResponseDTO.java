package com.aliados.backend.dto;

import com.aliados.backend.entity.UserRole;
import com.aliados.backend.entity.UserStatus;
import lombok.Data;

import java.time.LocalDateTime;

@Data
public class UserResponseDTO {

    // true por defecto: todo DTO mapeado desde un User existente está registrado.
    // El endpoint /me construye un DTO con registered=false (sin más campos) cuando
    // el usuario está autenticado en Firebase pero aún no existe en la DB (pre-onboarding),
    // así responde 200 en vez de 404 y no ensucia la consola del navegador.
    private Boolean registered = true;

    private Long id;
    private String email;
    private UserRole role;
    private String nombre;
    private String telefono;
    private String fotoPerfil;
    private Boolean activo;
    private String localidad;

    // Estado de presencia (WebSocket).
    private UserStatus status;
    private LocalDateTime lastSeenAt;

    private Double promedioCalificacion;
    private Long cantidadCalificaciones;
    private Long totalTrabajosCompletados;

    private OficioResponseDTO oficio;
}