package com.aliados.backend.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class CrearMudanzaDTO {

    @NotNull(message = "El tier es requerido")
    private Long tierId;

    @NotBlank(message = "La dirección de origen es requerida")
    private String direccionOrigen;

    @NotNull(message = "La latitud de origen es requerida")
    private Double latitudOrigen;

    @NotNull(message = "La longitud de origen es requerida")
    private Double longitudOrigen;

    @NotBlank(message = "La dirección de destino es requerida")
    private String direccionDestino;

    @NotNull(message = "La latitud de destino es requerida")
    private Double latitudDestino;

    @NotNull(message = "La longitud de destino es requerida")
    private Double longitudDestino;

    @NotNull(message = "Los pisos por escalera son requeridos")
    private Integer pisos;

    @NotNull(message = "Indicar si tiene ascensor es requerido")
    private Boolean tieneAscensor;

    @NotBlank(message = "Las fotos son requeridas")
    private String fotos; // JSON array de URLs

    private String notasCliente;
}
