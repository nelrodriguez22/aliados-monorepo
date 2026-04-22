package com.aliados.backend.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class ContrapropuestaMudanzaDTO {

    @NotNull(message = "El tier sugerido es requerido")
    private Long tierSugeridoId;

    @NotBlank(message = "El motivo es requerido")
    private String motivo;
}
