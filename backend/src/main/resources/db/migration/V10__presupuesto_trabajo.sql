-- Presupuesto post-visita + pago del trabajo.
-- Nuevo estado PRESUPUESTADO (entre EN_CURSO y COMPLETADO) y capa de pago ortogonal.
ALTER TABLE trabajos
    ADD COLUMN monto_presupuesto     NUMERIC(12, 2),
    ADD COLUMN nota_resumen          VARCHAR(1000),
    ADD COLUMN presupuesto_aceptado  BOOLEAN,
    ADD COLUMN monto_pagado          NUMERIC(12, 2),
    ADD COLUMN estado_pago           VARCHAR(255),
    ADD COLUMN pagado_at             TIMESTAMP(6);
