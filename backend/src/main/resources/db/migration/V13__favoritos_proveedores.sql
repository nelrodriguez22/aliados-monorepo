CREATE TABLE favoritos_proveedores (
    id           BIGSERIAL PRIMARY KEY,
    cliente_id   BIGINT NOT NULL REFERENCES users(id),
    proveedor_id BIGINT NOT NULL REFERENCES users(id),
    created_at   TIMESTAMP NOT NULL DEFAULT now(),
    CONSTRAINT uq_favorito_cliente_proveedor UNIQUE (cliente_id, proveedor_id)
);

CREATE INDEX idx_favorito_cliente ON favoritos_proveedores (cliente_id);
