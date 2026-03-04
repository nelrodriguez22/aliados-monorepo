package com.aliados.backend.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class CrearTrabajoDTO {

    @NotNull(message = "El oficio es requerido")
    private Long oficioId;

    @NotBlank(message = "La descripción es requerida")
    private String descripcion;

    @NotBlank(message = "La dirección es requerida")
    private String direccion;

    @NotNull(message = "La latitud es requerida")
    private Double latitudCliente;

    @NotNull(message = "La longitud es requerida")
    private Double longitudCliente;

    private String fotos; // JSON array de URLs
}