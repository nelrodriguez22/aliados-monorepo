-- V7__ofertas_por_grupos.sql
-- Modelo de ofertas por grupos: reemplaza el único proveedor_notificado_id por N ofertas
-- por trabajo, y guarda el historial (PROPUSO/DURMIO) que alimenta el score.
CREATE TABLE trabajo_oferta (
    id            BIGSERIAL PRIMARY KEY,
    trabajo_id    BIGINT      NOT NULL REFERENCES trabajos(id),
    proveedor_id  BIGINT      NOT NULL REFERENCES users(id),
    grupo         INT         NOT NULL,
    ofrecido_at   TIMESTAMP   NOT NULL DEFAULT now(),
    respondio_at  TIMESTAMP,
    resultado     VARCHAR(20) NOT NULL DEFAULT 'OFRECIDA',
    CONSTRAINT uq_trabajo_oferta_trabajo_proveedor UNIQUE (trabajo_id, proveedor_id)
);
CREATE INDEX idx_trabajo_oferta_trabajo   ON trabajo_oferta (trabajo_id);
CREATE INDEX idx_trabajo_oferta_prov_res  ON trabajo_oferta (proveedor_id, resultado);

-- Backfill: cada trabajo PENDIENTE ya ofertado a un proveedor pasa a una fila OFRECIDA (grupo 1).
INSERT INTO trabajo_oferta (trabajo_id, proveedor_id, grupo, ofrecido_at, resultado)
SELECT id, proveedor_notificado_id, 1, COALESCE(notificado_at, now()), 'OFRECIDA'
FROM trabajos
WHERE estado = 'PENDIENTE' AND proveedor_notificado_id IS NOT NULL;

-- Config nueva (feature flags). Seed idempotente.
INSERT INTO feature_flags (key, enabled, value, value_type, description) VALUES
  ('trabajo_oferta_grupo_tamano', true, '10', 'NUMBER',
   'Cantidad de proveedores por grupo al ofrecer un trabajo.'),
  ('trabajo_oferta_grupo_intervalo_min', true, '5', 'NUMBER',
   'Minutos de espera por grupo antes de pasar al siguiente.'),
  ('score_peso_respuesta_ofertas', true, '0.20', 'NUMBER',
   'Peso de la tasa de respuesta a ofertas en el score (se normaliza).')
ON CONFLICT (key) DO NOTHING;
