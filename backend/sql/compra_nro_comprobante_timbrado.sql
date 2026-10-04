-- Migración: agregar columnas nro_comprobante y timbrado a la tabla compra
-- Ejecutar una sola vez en pgAdmin o psql
-- Fecha: 2026-05-25

ALTER TABLE compra
  ADD COLUMN IF NOT EXISTS nro_comprobante VARCHAR(100),
  ADD COLUMN IF NOT EXISTS timbrado        VARCHAR(50);

-- Verificar resultado
SELECT column_name, data_type, character_maximum_length
FROM information_schema.columns
WHERE table_name = 'compra'
  AND column_name IN ('nro_comprobante', 'timbrado')
ORDER BY column_name;
