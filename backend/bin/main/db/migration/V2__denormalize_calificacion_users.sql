-- #8: Denormalizar promedio/cantidad de calificaciones en `users`.
-- Evita recalcular AVG/COUNT en cada lectura (DTOs, scoring); se actualiza al crear
-- una calificación (recompute-on-write, ver CalificacionService). Las calificaciones
-- son inmutables (solo alta), así que no hay paths de update/delete que mantener.

ALTER TABLE users ADD COLUMN promedio_calificacion   DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN cantidad_calificaciones BIGINT           NOT NULL DEFAULT 0;

-- Backfill desde las calificaciones existentes.
UPDATE users u SET
    cantidad_calificaciones = sub.cnt,
    promedio_calificacion   = sub.prom
FROM (
    SELECT proveedor_id, COUNT(*) AS cnt, AVG(estrellas) AS prom
    FROM calificaciones
    GROUP BY proveedor_id
) sub
WHERE u.id = sub.proveedor_id;
