package com.aliados.backend.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;
import lombok.Data;

import java.math.BigDecimal;

/**
 * SEC-8: body tipado de PATCH /api/trabajos/{id}/proponer. Reemplaza el parseo manual
 * de un Map crudo (que producía ClassCastException → 500 ante tipos inesperados) por
 * validación declarativa que devuelve 400.
 */
@Data
public class ProponerTrabajoDTO {

    @NotNull(message = "El tiempo estimado es requerido")
    @Positive(message = "El tiempo estimado debe ser positivo")
    private Integer tiempoEstimadoMinutos;

    // Ubicación del proveedor al proponer (opcional).
    private Double latitud;
    private Double longitud;

    // Tarifa de visita propuesta (opcional). Si viene, no puede ser negativa.
    @PositiveOrZero(message = "La tarifa de visita no puede ser negativa")
    private BigDecimal tarifaVisita;
}
