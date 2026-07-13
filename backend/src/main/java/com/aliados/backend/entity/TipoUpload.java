package com.aliados.backend.entity;

public enum TipoUpload {
    TRABAJO,
    MUDANZA,
    AVATAR,
    // Una foto del chat es una foto del chat: va a su propia carpeta, sin importar si la
    // conversación cuelga de un trabajo o de una mudanza (ChatPanel no conoce esa distinción).
    CHAT
}
