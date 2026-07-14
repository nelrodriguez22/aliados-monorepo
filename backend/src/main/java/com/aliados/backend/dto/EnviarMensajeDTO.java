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

    // La columna mensaje.imagen_url es VARCHAR(500): sin este límite, una URL más larga no
    // falla acá (400 limpio) sino en el INSERT (DataIntegrityViolationException → 400 con
    // ruido en Sentry). Además de la validación de prefijo de Cloudinary en
    // ChatService#validarContenido, que es la que de verdad cierra el hueco de seguridad.
    @Size(max = 500, message = "La URL de la imagen no puede superar los 500 caracteres")
    private String imagenUrl;
}
