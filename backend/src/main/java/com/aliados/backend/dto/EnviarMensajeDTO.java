package com.aliados.backend.dto;

import com.aliados.backend.entity.TipoMensaje;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class EnviarMensajeDTO {
    @NotNull(message = "El tipo de mensaje es obligatorio")
    private TipoMensaje tipo;

    @Size(max = 2000, message = "El mensaje no puede superar los 2000 caracteres")
    private String contenido;

    private String imagenUrl;
}
