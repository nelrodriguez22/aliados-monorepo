package com.aliados.backend.dto;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

/** Body de PATCH /api/trabajos/{id}/responder-presupuesto (cliente). */
@Data
public class ResponderPresupuestoDTO {

    @NotNull(message = "Debe indicar si acepta el presupuesto")
    private Boolean aceptar;
}
