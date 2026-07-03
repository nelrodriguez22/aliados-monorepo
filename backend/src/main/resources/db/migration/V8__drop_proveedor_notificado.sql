-- Ya migrado a trabajo_oferta (V7 hizo el backfill de PENDIENTE en vuelo).
ALTER TABLE trabajos DROP COLUMN IF EXISTS proveedor_notificado_id;
ALTER TABLE trabajos DROP COLUMN IF EXISTS notificado_at;
