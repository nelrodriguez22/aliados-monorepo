-- Los flags de timeout del modelo de asignación 1:1 quedaron sin uso al pasar al
-- modelo de ofertas por grupos (V7): el scheduler ahora lee 'trabajo_oferta_grupo_intervalo_min',
-- no estos. Se eliminan para que no confundan en el panel admin (aparecían sin efecto).
DELETE FROM feature_flags WHERE key IN ('trabajo_oferta_timeout1_min', 'trabajo_oferta_timeout2_min');
