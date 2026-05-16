-- ============================================================
-- LIMPIAR TODAS LAS VENTAS Y RESTAURAR STOCK
-- LibreriaSys — ejecutar en pgAdmin o psql
-- ============================================================
-- INSTRUCCIONES:
--   1. Ejecutar el BLOQUE DE PREVIEW (sin modificar nada).
--   2. Revisar los resultados. Si todo se ve correcto, recién
--      ejecutar el BLOQUE DE ACCIÓN.
--   3. Si algo no cuadra, NO ejecutar la acción y consultar.
-- ============================================================


-- ============================================================
-- BLOQUE 1: PREVIEW — solo consultas, no modifica nada
-- ============================================================

-- ¿Cuántas ventas hay y en qué estado?
SELECT
  COALESCE(estado, 'SIN ESTADO') AS estado,
  COUNT(*)                        AS cantidad
FROM venta
GROUP BY estado
ORDER BY estado;

-- ¿Qué productos van a recuperar stock?
SELECT
  p.id,
  p.nombre,
  ROUND(p.stock::numeric, 2)                          AS stock_actual,
  ROUND(SUM(vd.cantidad)::numeric, 2)                 AS cantidad_a_devolver,
  ROUND((p.stock + SUM(vd.cantidad))::numeric, 2)     AS stock_resultante
FROM venta_detalle vd
JOIN producto p ON p.id = vd.producto_id
WHERE COALESCE(p.no_control_stock, false) = false
GROUP BY p.id, p.nombre, p.stock
ORDER BY p.nombre;

-- ¿Cuántos registros hay en cada tabla dependiente?
SELECT 'venta'                  AS tabla, COUNT(*) AS registros FROM venta
UNION ALL
SELECT 'venta_detalle',                  COUNT(*) FROM venta_detalle
UNION ALL
SELECT 'caja_movimiento (ventas)',        COUNT(*) FROM caja_movimiento          WHERE venta_id IS NOT NULL
UNION ALL
SELECT 'factura_venta',                  COUNT(*) FROM factura_venta
UNION ALL
SELECT 'factura_detalle',                COUNT(*) FROM factura_detalle
UNION ALL
SELECT 'vendedor_comision_pago',         COUNT(*) FROM vendedor_comision_pago   WHERE venta_id IS NOT NULL
UNION ALL
SELECT 'stock_movimiento (VENTA)',        COUNT(*) FROM stock_movimiento          WHERE referencia_tipo = 'VENTA';


-- ============================================================
-- BLOQUE 2: ACCIÓN — ejecutar SOLO si el preview fue correcto
-- ============================================================
-- IMPORTANTE: todo va dentro de una transacción.
-- Si algo falla, PostgreSQL hace ROLLBACK automático.
-- ============================================================

BEGIN;

-- -----------------------------------------------------------
-- 2.1  RESTAURAR STOCK
--      Suma la cantidad vendida a cada producto que controla
--      stock. Solo afecta productos con no_control_stock=false.
-- -----------------------------------------------------------
UPDATE producto p
SET    stock = p.stock + sub.total_vendido
FROM (
  SELECT
    vd.producto_id,
    SUM(vd.cantidad) AS total_vendido
  FROM venta_detalle vd
  JOIN producto pr ON pr.id = vd.producto_id
  WHERE COALESCE(pr.no_control_stock, false) = false
  GROUP BY vd.producto_id
) sub
WHERE p.id = sub.producto_id;

-- Confirmar cuántos productos se actualizaron
-- (solo para ver en el log de pgAdmin)
SELECT
  p.id,
  p.nombre,
  ROUND(p.stock::numeric, 2) AS stock_nuevo
FROM producto p
WHERE EXISTS (
  SELECT 1 FROM venta_detalle vd
  JOIN producto pr ON pr.id = vd.producto_id
  WHERE vd.producto_id = p.id
    AND COALESCE(pr.no_control_stock, false) = false
)
ORDER BY p.nombre;

-- -----------------------------------------------------------
-- 2.2  ELIMINAR MOVIMIENTOS DE CAJA LIGADOS A VENTAS
-- -----------------------------------------------------------
DELETE FROM caja_movimiento WHERE venta_id IS NOT NULL;

-- -----------------------------------------------------------
-- 2.3  ELIMINAR FACTURAS VINCULADAS A VENTAS
-- -----------------------------------------------------------
DELETE FROM factura_detalle
WHERE factura_id IN (
  SELECT factura_id FROM factura_venta
);

DELETE FROM factura
WHERE id IN (
  SELECT factura_id FROM factura_venta
);

DELETE FROM factura_venta;

-- -----------------------------------------------------------
-- 2.4  ELIMINAR COMISIONES DE VENDEDORES
-- -----------------------------------------------------------
DELETE FROM vendedor_comision_pago WHERE venta_id IS NOT NULL;

-- -----------------------------------------------------------
-- 2.5  ELIMINAR MOVIMIENTOS DE STOCK DE TIPO VENTA
-- -----------------------------------------------------------
DELETE FROM stock_movimiento WHERE referencia_tipo = 'VENTA';

-- -----------------------------------------------------------
-- 2.6  ELIMINAR DETALLES DE VENTAS
-- -----------------------------------------------------------
DELETE FROM venta_detalle;

-- -----------------------------------------------------------
-- 2.7  ELIMINAR LAS VENTAS
-- -----------------------------------------------------------
DELETE FROM venta;

-- -----------------------------------------------------------
-- 2.8  REINICIAR SECUENCIAS (para que la próx. venta sea #1)
-- -----------------------------------------------------------
SELECT setval(pg_get_serial_sequence('venta',         'id'), 1, false);
SELECT setval(pg_get_serial_sequence('venta_detalle', 'id'), 1, false);

-- -----------------------------------------------------------
-- 2.9  VERIFICACIÓN FINAL
-- -----------------------------------------------------------
SELECT 'venta'                AS tabla, COUNT(*) AS restantes FROM venta
UNION ALL
SELECT 'venta_detalle',                COUNT(*) FROM venta_detalle
UNION ALL
SELECT 'caja_movimiento(ventas)',       COUNT(*) FROM caja_movimiento   WHERE venta_id IS NOT NULL
UNION ALL
SELECT 'stock_movimiento(VENTA)',       COUNT(*) FROM stock_movimiento  WHERE referencia_tipo = 'VENTA';

-- -----------------------------------------------------------
-- Si todo muestra 0 → confirmar
-- -----------------------------------------------------------
COMMIT;

-- ============================================================
-- FIN DEL SCRIPT
-- ============================================================
