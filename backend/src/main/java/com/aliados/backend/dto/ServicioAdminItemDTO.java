package com.aliados.backend.dto;

import com.aliados.backend.entity.Mudanza;
import com.aliados.backend.entity.Trabajo;

import java.math.BigDecimal;
import java.time.LocalDateTime;

public record ServicioAdminItemDTO(
        String tipo,
        Long id,
        String oficio,
        String estado,
        String clienteNombre,
        String proveedorNombre,
        String direccion,
        LocalDateTime createdAt,
        LocalDateTime acceptedAt,
        LocalDateTime completedAt,
        BigDecimal precio,
        String motivoCancelacion) {

    public static ServicioAdminItemDTO from(Trabajo t) {
        return new ServicioAdminItemDTO(
                "TRABAJO",
                t.getId(),
                t.getOficio().getNombre(),
                t.getEstado().name(),
                t.getCliente().getNombre(),
                t.getProveedor() != null ? t.getProveedor().getNombre() : null,
                t.getDireccion(),
                t.getCreatedAt(),
                t.getAcceptedAt(),
                t.getCompletedAt(),
                t.getPrecioEstimado(),
                t.getMotivoCancelacion());
    }

    public static ServicioAdminItemDTO from(Mudanza m) {
        return new ServicioAdminItemDTO(
                "MUDANZA",
                m.getId(),
                "Mudanza",
                m.getEstado().name(),
                m.getCliente().getNombre(),
                m.getProveedor() != null ? m.getProveedor().getNombre() : null,
                m.getDireccionOrigen(),
                m.getCreatedAt(),
                m.getAcceptedAt(),
                m.getCompletedAt(),
                m.getMontoBase(),
                m.getMotivoCancelacion());
    }
}
