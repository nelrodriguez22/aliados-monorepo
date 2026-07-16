package com.aliados.backend.entity;

// ADMIN queda previsto aunque hoy ningún flujo admin mute estados:
// agregarlo después costaría una migración de datos de cero valor.
public enum ActorTipo {
    CLIENTE,
    PROVEEDOR,
    SISTEMA,
    ADMIN
}
