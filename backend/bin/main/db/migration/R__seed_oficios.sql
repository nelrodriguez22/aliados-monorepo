-- Seed de oficios (idempotente). Reemplaza al antiguo DataInitializer.
INSERT INTO oficios (nombre, icono, activo, exclusivo) VALUES
    ('Electricista',                  '⚡',  true, false),
    ('Plomero',                       '🔧', true, false),
    ('Cerrajero',                     '🔑', true, false),
    ('Gasista',                       '🔥', true, false),
    ('Pintor',                        '🎨', true, false),
    ('Aire acondicionado',            '❄️', true, false),
    ('Fumigador',                     '🪲', true, false),
    ('Técnico de electrodomésticos',  '🔌', true, false),
    ('Mudanzas',                      '🚚', true, false)
ON CONFLICT (nombre) DO NOTHING;
