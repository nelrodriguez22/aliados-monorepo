package com.aliados.backend.dto;

import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class FavoritoResponseDTO {
    private Long proveedorId;
    private String nombre;
    private Long oficioId;
    private String oficioNombre;
    private Double promedioCalificacion;
    private Long cantidadCalificaciones;
    private String disponibilidad; // ONLINE / BUSY / OFFLINE
    private String codigoProveedor;
}
