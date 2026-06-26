-- Config operativa como feature flags (NUMBER). Seed idempotente: no pisa runtime.
INSERT INTO feature_flags (key, enabled, value, value_type, description) VALUES
  ('mudanza_comision_porcentaje', true, '10', 'NUMBER',
   'Porcentaje de comisión sobre el monto de la mudanza.'),
  ('limite_trabajos_default', true, '3', 'NUMBER',
   'Máximo de trabajos simultáneos asignables a un proveedor.'),
  ('limite_trabajos_flete', true, '8', 'NUMBER',
   'Máximo de trabajos simultáneos para fletes.'),
  ('score_peso_calificacion', true, '0.40', 'NUMBER',
   'Peso de la calificación en el score de matching (se normaliza con los otros pesos).'),
  ('score_peso_aceptacion', true, '0.35', 'NUMBER',
   'Peso de la tasa de aceptación en el score (se normaliza).'),
  ('score_peso_velocidad', true, '0.25', 'NUMBER',
   'Peso de la velocidad de respuesta en el score (se normaliza).'),
  ('score_tiempo_max_respuesta_min', true, '30', 'NUMBER',
   'Minutos de referencia para normalizar la velocidad (30+ min → 0).')
ON CONFLICT (key) DO NOTHING;
