package com.aliados.backend.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

import java.time.LocalDate;

@Data
public class ContrapropuestaMudanzaDTO {

    // Todos opcionales excepto motivo — puede ser cambio de tier, fecha, o ambos
    private Long tierSugeridoId;

    private LocalDate fechaSugerida;

    @NotBlank(message = "El motivo es requerido")
    private String motivo;
}
