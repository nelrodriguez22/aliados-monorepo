package com.aliados.backend.entity;

public enum TipoMensaje {
    TEXTO,
    IMAGEN
    // SISTEMA: reservado a futuro (mensajes automáticos). Agregarlo NO requiere migración de
    // esquema, sólo ampliar este enum y el CHECK chk_mensaje_contenido.
}
