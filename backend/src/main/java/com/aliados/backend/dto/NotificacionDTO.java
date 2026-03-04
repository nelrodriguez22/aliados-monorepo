package com.aliados.backend.dto;

import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class NotificacionDTO {
    private String tipo; // PROVEEDOR_ASIGNADO, TRABAJO_COMPLETADO, NUEVO_TRABAJO
    private Long trabajoId;
    private String mensaje;
    private Object data; // datos adicionales opcionales
}