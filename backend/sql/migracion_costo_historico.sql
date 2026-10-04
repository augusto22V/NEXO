-- =============================================================
-- Migración: Costo histórico ("foto") por línea de venta
-- -------------------------------------------------------------
-- Guarda el costo unitario (precio_compra + costo_transporte) que
-- tenía el producto al momento de cada venta. Así la ganancia
-- histórica queda fija aunque después cambies el costo del producto.
--
-- NOTA: La app ya crea esta columna automáticamente al arrancar
-- (ensureComisionSchema). Este archivo es solo para referencia o
-- para correrlo manualmente en pgAdmin.
-- =============================================================

-- 1. Crear la columna (NULL = venta vieja → usa costo actual como respaldo)
ALTER TABLE venta_detalle
ADD COLUMN IF NOT EXISTS costo_unitario_gs NUMERIC(14,2);


-- =============================================================
-- 2. (OPCIONAL) Backfill — "congelar" el costo actual en las ventas viejas
-- -------------------------------------------------------------
-- Por defecto las ventas viejas (costo_unitario_gs NULL) usan el costo
-- ACTUAL del producto. Si querés que las ventas viejas queden fijas con
-- el costo que tienen HOY (para que futuros cambios no las afecten),
-- descomentá y ejecutá este UPDATE UNA sola vez:
--
-- UPDATE venta_detalle vd
-- SET costo_unitario_gs = COALESCE(pp.precio_compra, 0) + COALESCE(pp.costo_transporte, 0)
-- FROM producto_precio pp
-- WHERE pp.producto_id = vd.producto_id
--   AND pp.activo = true
--   AND vd.costo_unitario_gs IS NULL;
--
-- ⚠️ OJO: esto asume que el costo de hoy es representativo. Si los costos
-- viejos eran distintos, la ganancia histórica no será 100% exacta para
-- esas ventas anteriores (no hay forma de recuperar el costo real pasado).


-- =============================================================
-- 3. Verificación
-- =============================================================
-- SELECT
--   COUNT(*) AS total_lineas,
--   COUNT(costo_unitario_gs) AS con_costo_foto,
--   COUNT(*) - COUNT(costo_unitario_gs) AS sin_foto_usan_actual
-- FROM venta_detalle;
