package com.aliados.backend.entity;

// El estado del chat es TERNARIO. El tercer caso —"no existe conversación"— se representa por
// la AUSENCIA de fila en `conversacion`, no por un valor de este enum. Modelarlo con un booleano
// obliga a inventar un cuarto caso implícito, y ahí nace el bug del chat vacío en un servicio
// que todavía no tiene proveedor con quien hablar.
public enum ModoChat {
    ESCRITURA,
    LECTURA
}
