package com.aliados.backend.dto;

import com.aliados.backend.entity.MudanzaTurno;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class AceptarMudanzaDTO {

    @NotNull(message = "El turno es requerido")
    private MudanzaTurno turno;
}
