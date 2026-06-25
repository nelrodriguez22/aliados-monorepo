ALTER TABLE trabajos ADD COLUMN reintentos INTEGER NOT NULL DEFAULT 0;

-- Umbrales de escalado como feature flags (NUMBER). Seed en valores de testing (3/3);
-- en launch se suben a 30/15 desde el panel admin. Idempotente: no pisa cambios de runtime.
INSERT INTO feature_flags (key, enabled, value, value_type, description) VALUES
  ('trabajo_oferta_timeout1_min', true, '3', 'NUMBER',
   'Minutos de espera de la 1a oferta antes de re-ofrecer al siguiente proveedor (launch: 30).'),
  ('trabajo_oferta_timeout2_min', true, '3', 'NUMBER',
   'Minutos de espera del reintento antes de cancelar el trabajo (launch: 15).')
ON CONFLICT (key) DO NOTHING;
