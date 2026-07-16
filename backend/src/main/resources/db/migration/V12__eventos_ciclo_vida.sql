-- Audit log append-only del ciclo de vida de trabajos y mudanzas.
-- Una fila por transición, con actor. Complementa (no reemplaza) los timestamps
-- de las tablas padre, que se pisan ante re-transiciones y no registran quién.
CREATE TABLE trabajo_evento (
    id             BIGSERIAL PRIMARY KEY,
    trabajo_id     BIGINT      NOT NULL REFERENCES trabajos (id),
    tipo           VARCHAR(30) NOT NULL,  -- CAMBIO_ESTADO | CAMBIO_ESTADO_PAGO
    valor_anterior VARCHAR(30),           -- NULL en la creación
    valor_nuevo    VARCHAR(30) NOT NULL,
    actor_tipo     VARCHAR(20) NOT NULL,  -- CLIENTE | PROVEEDOR | SISTEMA | ADMIN
    actor_id       BIGINT REFERENCES users (id),  -- NULL cuando SISTEMA
    detalle        VARCHAR(500),
    created_at     TIMESTAMP   NOT NULL DEFAULT NOW()
);

-- Única query prevista: timeline de una entidad (ORDER BY id = orden cronológico).
CREATE INDEX idx_trabajo_evento_trabajo_id ON trabajo_evento (trabajo_id);

CREATE TABLE mudanza_evento (
    id             BIGSERIAL PRIMARY KEY,
    mudanza_id     BIGINT      NOT NULL REFERENCES mudanzas (id),
    tipo           VARCHAR(30) NOT NULL,
    valor_anterior VARCHAR(30),
    valor_nuevo    VARCHAR(30) NOT NULL,
    actor_tipo     VARCHAR(20) NOT NULL,
    actor_id       BIGINT REFERENCES users (id),
    detalle        VARCHAR(500),
    created_at     TIMESTAMP   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_mudanza_evento_mudanza_id ON mudanza_evento (mudanza_id);
