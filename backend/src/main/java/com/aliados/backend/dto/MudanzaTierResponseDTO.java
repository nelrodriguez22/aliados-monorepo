package com.aliados.backend.dto;

import lombok.Data;

import java.math.BigDecimal;

@Data
public class MudanzaTierResponseDTO {

    private Long id;
    private String nombre;
    private String emoji;
    private BigDecimal precioBase;
    private Integer minutosIncluidos;
    private BigDecimal precioBloque30Min;
    private String descripcion;
    private String descripcionCompleta;
    private Integer orden;
}
