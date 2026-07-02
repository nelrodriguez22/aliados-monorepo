package com.aliados.backend.entity;

public enum ResultadoOferta {
    OFRECIDA, // oferta viva, ventana en curso, sin desenlace
    PROPUSO,  // el proveedor propuso (respondió)
    DURMIO    // ofertado y el trabajo se resolvió/avanzó sin su propuesta
}
