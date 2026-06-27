package com.aliados.backend.dto;

import com.aliados.backend.entity.Oficio;
import lombok.Data;

/**
 * Vista liviana de Oficio para las respuestas (trabajos, perfil): solo los campos
 * que el cliente consume (id, nombre, icono). Evita mandar la entidad completa con
 * flags internos (`activo`, `exclusivo`) en cada item de cada lista.
 */
@Data
public class OficioResponseDTO {
    private Long id;
    private String nombre;
    private String icono;

    public static OficioResponseDTO from(Oficio oficio) {
        if (oficio == null) return null;
        OficioResponseDTO dto = new OficioResponseDTO();
        dto.setId(oficio.getId());
        dto.setNombre(oficio.getNombre());
        dto.setIcono(oficio.getIcono());
        return dto;
    }
}
