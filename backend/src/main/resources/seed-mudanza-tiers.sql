-- ═══════════════════════════════════════════
-- Seed: Mudanza Tiers
-- Ejecutar una vez en la base de datos Neon
-- ═══════════════════════════════════════════

INSERT INTO mudanza_tiers (nombre, emoji, precio_base, minutos_incluidos, precio_bloque30_min, descripcion, descripcion_completa, activo, orden)
VALUES
(
    'DIAMANTE',
    '💎',
    450000,
    180, -- 3 horas
    75000, -- $75.000 por bloque de 30 min extra
    'Servicio Llave en Mano. Nosotros embalamos todo.',
    'Incluye: Embalaje completo, carga, traslado, descarga, desembalaje y armado. Envío previo de 10 cajas y 5 cajones (hasta 3 días antes). Chat directo para coordinación.',
    true,
    1
),
(
    'ORO',
    '🥇',
    420000,
    180, -- 3 horas
    70000, -- $70.000 por bloque de 30 min extra
    'Premium sin envío de cajas previas.',
    'Incluye: Embalaje completo, carga, traslado, descarga, desembalaje y armado. No incluye envío previo de cajas.',
    true,
    2
),
(
    'PLATA',
    '🥈',
    180000,
    120, -- 2 horas
    45000, -- $45.000 por bloque de 30 min extra
    'Estándar. Ideal si ya tenés todo embalado en cajas.',
    'Incluye: Carga, traslado y descarga. No incluye embalaje ni armado de muebles. El cliente debe tener todo embalado.',
    true,
    3
),
(
    'BRONCE',
    '🥉',
    120000,
    120, -- 2 horas
    30000, -- $30.000 por bloque de 30 min extra
    'Solo flete. Vos te encargas de la carga y descarga.',
    'Incluye: Solo traslado del punto A al punto B. El cliente se encarga de cargar y descargar. Ideal para pocos muebles o cosas livianas.',
    true,
    4
);

-- ═══════════════════════════════════════════
-- Seed: Oficio "Mudanzas" (si no existe)
-- ═══════════════════════════════════════════

INSERT INTO oficios (nombre, icono, activo)
SELECT 'Mudanzas', '🚚', true
WHERE NOT EXISTS (SELECT 1 FROM oficios WHERE nombre = 'Mudanzas');
