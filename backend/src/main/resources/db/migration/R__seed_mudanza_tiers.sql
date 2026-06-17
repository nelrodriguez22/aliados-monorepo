-- Seed de tiers de mudanza (idempotente y autoritativo: actualiza precios/descripciones).
INSERT INTO mudanza_tiers
    (nombre, emoji, precio_base, minutos_incluidos, precio_bloque30_min, descripcion, descripcion_completa, activo, orden)
VALUES
    ('DIAMANTE', '💎', 450000, 180, 75000,
     'Servicio Llave en Mano. Nosotros embalamos todo.',
     'Incluye: Embalaje completo, carga, traslado, descarga, desembalaje y armado. Envío previo de 10 cajas y 5 cajones (hasta 3 días antes). Chat directo para coordinación.',
     true, 1),
    ('ORO', '🥇', 420000, 180, 70000,
     'Premium sin envío de cajas previas.',
     'Incluye: Embalaje completo, carga, traslado, descarga, desembalaje y armado. No incluye envío previo de cajas.',
     true, 2),
    ('PLATA', '🥈', 180000, 120, 45000,
     'Estándar. Ideal si ya tenés todo embalado en cajas.',
     'Incluye: Carga, traslado y descarga. No incluye embalaje ni armado de muebles. El cliente debe tener todo embalado.',
     true, 3),
    ('BRONCE', '🥉', 120000, 120, 30000,
     'Solo flete. Vos te encargas de la carga y descarga.',
     'Incluye: Solo traslado del punto A al punto B. El cliente se encarga de cargar y descargar. Ideal para pocos muebles o cosas livianas.',
     true, 4)
ON CONFLICT (nombre) DO UPDATE SET
    emoji                = EXCLUDED.emoji,
    precio_base          = EXCLUDED.precio_base,
    minutos_incluidos    = EXCLUDED.minutos_incluidos,
    precio_bloque30_min  = EXCLUDED.precio_bloque30_min,
    descripcion          = EXCLUDED.descripcion,
    descripcion_completa = EXCLUDED.descripcion_completa,
    activo               = EXCLUDED.activo,
    orden                = EXCLUDED.orden;
