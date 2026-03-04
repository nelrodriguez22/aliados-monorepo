package com.aliados.backend.dto;

import com.aliados.backend.entity.UserRole;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class RegisterDTO {

    @NotBlank(message = "Firebase UID es requerido")
    private String firebaseUid;

    @NotBlank(message = "Email es requerido")
    @Email(message = "Email debe ser válido")
    private String email;

    @NotNull(message = "Rol es requerido")
    private UserRole role;

    @NotBlank(message = "Nombre es requerido")
    private String nombre;

    private String telefono;

    private Long oficioId;

    private String matricula;

    private String localidad;
}