CREATE TABLE feature_flags (
    key         VARCHAR(100) PRIMARY KEY,
    enabled     BOOLEAN      NOT NULL DEFAULT false,
    value       TEXT,
    value_type  VARCHAR(20)  NOT NULL,
    description TEXT,
    updated_at  TIMESTAMPTZ,
    updated_by  VARCHAR(128)
);

-- Seed idempotente: no pisa cambios hechos en runtime por el admin.
INSERT INTO feature_flags (key, enabled, value, value_type, description)
VALUES (
    'mudanza_ratio_tiempo', true, '1.0', 'NUMBER',
    'Ratio de aceleración del tiempo en mudanzas (1.0 = real, 180 = testing).'
)
ON CONFLICT (key) DO NOTHING;
