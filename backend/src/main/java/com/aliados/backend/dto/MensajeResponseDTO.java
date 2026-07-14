package com.aliados.backend.dto;

import com.aliados.backend.entity.TipoMensaje;
import lombok.Data;

import java.time.LocalDateTime;

@Data
public class MensajeResponseDTO {
    private Long id;
    private Long conversacionId;
    private Long emisorId;
    private String emisorNombre;
    // Puede ser null: subir foto de perfil es opcional. El frontend cae a las iniciales.
    private String emisorFotoPerfil;
    private TipoMensaje tipo;
    private String contenido;
    private String imagenUrl;
    private LocalDateTime creadoAt;
    // contieneContacto NO se expone al frontend: es una señal interna para el panel de admin.
    // Mostrarla le enseñaría al usuario a evadir la detección.
}
