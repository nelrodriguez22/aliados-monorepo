package com.aliados.backend.dto;

import com.aliados.backend.entity.User;

import java.time.LocalDateTime;

public record UsuarioAdminDto(
        Long id, String nombre, String email, String role, boolean activo,
        String telefono, String localidad, String status,
        Double promedioCalificacion, LocalDateTime createdAt) {

    public static UsuarioAdminDto from(User u) {
        return new UsuarioAdminDto(
                u.getId(), u.getNombre(), u.getEmail(),
                u.getRole() != null ? u.getRole().name() : null,
                Boolean.TRUE.equals(u.getActivo()),
                u.getTelefono(), u.getLocalidad(),
                u.getStatus() != null ? u.getStatus().name() : null,
                u.getPromedioCalificacion(), u.getCreatedAt());
    }
}
