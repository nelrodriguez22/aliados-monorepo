-- Marca los trabajos que están en su ventana exclusiva de favorito (grupo 0).
-- Al escalar, se usa para "foldear" al favorito en el pool normal en vez de excluirlo.
ALTER TABLE trabajos ADD COLUMN esperando_favorito BOOLEAN NOT NULL DEFAULT false;
