package com.aliados.backend.dto;

import java.util.List;

/**
 * Respuesta paginada para listas de trabajos que crecen sin límite (historial).
 * `hasNext` indica si hay más páginas (para el botón "Cargar más").
 * `sinCalificar` es el total de completados sin calificación del cliente (badge);
 * 0 cuando no aplica (ej. historial del proveedor).
 */
public record PagedTrabajosResponse(
        List<TrabajoResponseDTO> content,
        boolean hasNext,
        long sinCalificar
) {}
