package com.aliados.backend.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class CrearBugReportDTO {

    @NotNull(message = "La categoría es requerida")
    private String categoria;

    @NotBlank(message = "El título es requerido")
    @Size(max = 120, message = "El título no puede superar 120 caracteres")
    private String titulo;

    @NotBlank(message = "La descripción es requerida")
    @Size(max = 1000, message = "La descripción no puede superar 1000 caracteres")
    private String descripcion;

    @Size(max = 500)
    private String url;
}
