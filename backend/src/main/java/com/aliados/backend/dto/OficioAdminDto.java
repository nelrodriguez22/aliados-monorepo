package com.aliados.backend.dto;

import com.aliados.backend.entity.Oficio;

public record OficioAdminDto(Long id, String nombre, String icono, boolean activo, boolean exclusivo) {
    public static OficioAdminDto from(Oficio o) {
        return new OficioAdminDto(
                o.getId(),
                o.getNombre(),
                o.getIcono(),
                Boolean.TRUE.equals(o.getActivo()),
                Boolean.TRUE.equals(o.getExclusivo()));
    }
}
