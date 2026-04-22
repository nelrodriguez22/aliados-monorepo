package com.aliados.backend.dto;

import lombok.Data;

@Data
public class MudanzaTierResponseDTO {

    private Long id;
    private String nombre;
    private String emoji;
    private Double precioBase;
    private Integer minutosIncluidos;
    private Double precioBloque30Min;
    private String descripcion;
    private String descripcionCompleta;
    private Integer orden;
}
