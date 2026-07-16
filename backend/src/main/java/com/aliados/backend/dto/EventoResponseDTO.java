package com.aliados.backend.dto;

import com.aliados.backend.entity.ActorTipo;
import com.aliados.backend.entity.TipoEvento;
import lombok.Data;

import java.time.LocalDateTime;

/** Un evento del timeline admin. actorNombre y nunca email/uid: sin PII de más. */
@Data
public class EventoResponseDTO {
    private Long id;
    private TipoEvento tipo;
    private String valorAnterior;
    private String valorNuevo;
    private ActorTipo actorTipo;
    private String actorNombre; // null cuando actorTipo = SISTEMA
    private String detalle;
    private LocalDateTime createdAt;
}
