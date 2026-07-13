-- Chat cliente-proveedor. Una conversación por servicio (trabajo O mudanza).
-- El polimorfismo queda confinado a esta tabla: mensaje y lectura sólo conocen conversacion_id.
CREATE TABLE conversacion (
    id            BIGSERIAL PRIMARY KEY,
    trabajo_id    BIGINT REFERENCES trabajos (id),
    mudanza_id    BIGINT REFERENCES mudanzas (id),
    cliente_id    BIGINT NOT NULL REFERENCES users (id),
    proveedor_id  BIGINT NOT NULL REFERENCES users (id),
    creado_at     TIMESTAMP NOT NULL DEFAULT NOW(),

    -- Exactamente uno de los dos padres. Sin esto, el polimorfismo no está garantizado.
    CONSTRAINT chk_conversacion_un_padre CHECK (
        (trabajo_id IS NOT NULL AND mudanza_id IS NULL) OR
        (trabajo_id IS NULL AND mudanza_id IS NOT NULL)
    ),
    CONSTRAINT uq_conversacion_trabajo UNIQUE (trabajo_id),
    CONSTRAINT uq_conversacion_mudanza UNIQUE (mudanza_id)
);

CREATE TABLE mensaje (
    id                BIGSERIAL PRIMARY KEY,
    conversacion_id   BIGINT NOT NULL REFERENCES conversacion (id),
    emisor_id         BIGINT NOT NULL REFERENCES users (id),
    tipo              VARCHAR(20) NOT NULL,
    contenido         TEXT,
    imagen_url        VARCHAR(500),
    contiene_contacto BOOLEAN NOT NULL DEFAULT FALSE,
    creado_at         TIMESTAMP NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_mensaje_contenido CHECK (
        (tipo = 'TEXTO'  AND contenido  IS NOT NULL) OR
        (tipo = 'IMAGEN' AND imagen_url IS NOT NULL)
    )
);

CREATE INDEX idx_mensaje_conversacion ON mensaje (conversacion_id, id);

CREATE TABLE lectura_conversacion (
    conversacion_id         BIGINT NOT NULL REFERENCES conversacion (id),
    usuario_id              BIGINT NOT NULL REFERENCES users (id),
    ultimo_mensaje_leido_id BIGINT,
    PRIMARY KEY (conversacion_id, usuario_id)
);
