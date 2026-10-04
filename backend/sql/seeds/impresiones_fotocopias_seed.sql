-- ============================================================
-- Categoría: Impresiones y Fotocopias
-- Productos:  Fotocopia (500 Gs) | Impresión (1.000 Gs)
-- Son servicios: sin control de stock
-- ============================================================

-- 1. CATEGORÍA
INSERT INTO categoria (nombre, imagen, orden_pantalla, activo, mostrar_venta_medio, mostrar_menu_digital, orden_venta_medio)
VALUES ('Impresiones y Fotocopias', NULL, 200, true, true, false, 200)
ON CONFLICT DO NOTHING;


-- 2. PRODUCTO: Fotocopia
INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'FOTOCOPIA',
  'Servicio de fotocopia por hoja',
  10,
  0,
  c.id,
  NULL,
  'unidad',
  0,
  'SVC-FOTOCOPIA',
  NULL,
  false,
  true,
  false,
  1,
  false,
  false,
  true,
  10,
  false,
  true,
  true,
  10
FROM categoria c
WHERE c.nombre = 'Impresiones y Fotocopias'
LIMIT 1;

-- Precio fotocopia: 500 Gs
INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs,
  precio_compra_brl, precio_compra_usd, cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  0, 0, 500, NULL, NULL,
  true, NOW(), 1,
  0::numeric, 0::numeric,
  NULL, NULL, NULL, NULL, NULL
FROM producto p
WHERE p.codigo_barra = 'SVC-FOTOCOPIA'
LIMIT 1;


-- 3. PRODUCTO: Impresión
INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'IMPRESION',
  'Servicio de impresión por hoja',
  10,
  0,
  c.id,
  NULL,
  'unidad',
  0,
  'SVC-IMPRESION',
  NULL,
  false,
  true,
  false,
  1,
  false,
  false,
  true,
  20,
  false,
  true,
  true,
  20
FROM categoria c
WHERE c.nombre = 'Impresiones y Fotocopias'
LIMIT 1;

-- Precio impresión: 1.000 Gs
INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs,
  precio_compra_brl, precio_compra_usd, cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  0, 0, 1000, NULL, NULL,
  true, NOW(), 1,
  0::numeric, 0::numeric,
  NULL, NULL, NULL, NULL, NULL
FROM producto p
WHERE p.codigo_barra = 'SVC-IMPRESION'
LIMIT 1;


-- VERIFICACIÓN (ejecutar después para confirmar)
-- SELECT c.nombre AS categoria, p.nombre, pp.precio_venta
-- FROM categoria c
-- JOIN producto p ON p.categoria_id = c.id
-- LEFT JOIN producto_precio pp ON pp.producto_id = p.id AND pp.activo = true
-- WHERE c.nombre = 'Impresiones y Fotocopias';
