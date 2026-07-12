package com.aliados.backend.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.math.BigDecimal;

/** Body de PATCH /api/trabajos/{id}/presupuestar (proveedor). */
@Data
public class PresupuestarTrabajoDTO {

    @NotNull(message = "El monto del presupuesto es requerido")
    @Positive(message = "El monto del presupuesto debe ser positivo")
    private BigDecimal montoPresupuesto;

    // Nota opcional del proveedor sobre el trabajo a realizar.
    @Size(max = 1000, message = "La nota no puede superar 1000 caracteres")
    private String notaResumen;
}
