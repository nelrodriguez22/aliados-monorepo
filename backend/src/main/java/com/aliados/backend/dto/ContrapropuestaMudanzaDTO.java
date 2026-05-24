package com.aliados.backend.dto;

import com.aliados.backend.entity.MudanzaTurno;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.time.LocalDate;

@Data
public class ContrapropuestaMudanzaDTO {

    // Todos opcionales excepto motivo y turno
    private Long tierSugeridoId;

    private LocalDate fechaSugerida;

    @NotNull(message = "El turno es requerido")
    private MudanzaTurno turno;

    @NotBlank(message = "El motivo es requerido")
    private String motivo;
}
