-- =============================================================================
-- LibreríaSys — datos de prueba (categorías, productos, precios, proveedor, compra)
-- =============================================================================
-- PREREQUISITO: base ya creada con el esquema Sys (tablas producto, categoria, moneda,
--   empresa, usuario, tipo_operacion, condicion_pago, compra, producto, etc.)
-- Si faltaban compra_detalle, proveedor o comprador, se crean al inicio de este script.
-- Ejecutá primero tus scripts habituales / restore, LUEGO este archivo en pgAdmin o psql.
--
-- Imágenes: placeholders en /recursos/img/catalog/*.svg (categoría + tipo de artículo).
--   Regenerá con: node scripts/generate_libreria_seed_sql.js  |  Fotos reales: módulo Productos.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- Si tu base no tiene compra_detalle (error 42P01), esta sección la crea.
-- Requiere que ya existan las tablas compra, producto y moneda.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS compra_detalle (
  id BIGSERIAL PRIMARY KEY,
  compra_id INTEGER NOT NULL,
  producto_id INTEGER NOT NULL,
  cantidad NUMERIC(18,6) NOT NULL DEFAULT 1,
  costo NUMERIC(18,6) NOT NULL DEFAULT 0,
  total NUMERIC(18,6) NOT NULL DEFAULT 0,
  lote VARCHAR(120),
  fecha_vencimiento DATE,
  costo_original NUMERIC(18,6),
  moneda_id INTEGER,
  costo_moneda_origen NUMERIC(18,6),
  costo_gs NUMERIC(18,6),
  costo_brl NUMERIC(18,6),
  costo_usd NUMERIC(18,6),
  cotizacion_id INTEGER
);

DO $fkcd$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_compra_detalle_compra'
  ) AND to_regclass('public.compra') IS NOT NULL THEN
    ALTER TABLE compra_detalle
      ADD CONSTRAINT fk_compra_detalle_compra
      FOREIGN KEY (compra_id) REFERENCES compra(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_compra_detalle_producto'
  ) THEN
    ALTER TABLE compra_detalle
      ADD CONSTRAINT fk_compra_detalle_producto
      FOREIGN KEY (producto_id) REFERENCES producto(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_compra_detalle_moneda'
  ) AND to_regclass('public.moneda') IS NOT NULL THEN
    ALTER TABLE compra_detalle
      ADD CONSTRAINT fk_compra_detalle_moneda
      FOREIGN KEY (moneda_id) REFERENCES moneda(id);
  END IF;
END
$fkcd$;

CREATE INDEX IF NOT EXISTS idx_compra_detalle_compra ON compra_detalle(compra_id);
CREATE INDEX IF NOT EXISTS idx_compra_detalle_producto ON compra_detalle(producto_id);
CREATE INDEX IF NOT EXISTS idx_compra_detalle_compra_producto ON compra_detalle(compra_id, producto_id);



-- ---------------------------------------------------------------------------
-- Si tu base no tiene proveedor (error 42P01 en DELETE/INSERT de este seed).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS proveedor (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(200) NOT NULL,
  razon_social VARCHAR(250),
  ruc VARCHAR(40),
  telefono VARCHAR(80),
  direccion VARCHAR(250),
  email VARCHAR(120),
  activo BOOLEAN NOT NULL DEFAULT true,
  creado_en TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_proveedor_activo ON proveedor(activo);



-- ---------------------------------------------------------------------------
-- Si tu base no tiene comprador (error 42P01 en DELETE/INSERT de este seed).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS comprador (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(200) NOT NULL,
  activo BOOLEAN NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_comprador_activo ON comprador(activo);



BEGIN;

-- Limpieza de corridas anteriores de este seed (códigos de barra LIB#########)
DELETE FROM compra_detalle WHERE compra_id IN (
  SELECT c.id FROM compra c WHERE c.numero_compra = 910001 AND c.movimiento = 'COMPRA'
);
DELETE FROM compra WHERE numero_compra = 910001 AND movimiento = 'COMPRA';

DELETE FROM producto_precio WHERE producto_id IN (
  SELECT id FROM producto WHERE codigo_barra LIKE 'LIB%'
);
DELETE FROM producto WHERE codigo_barra LIKE 'LIB%';

DELETE FROM categoria WHERE nombre IN ('Útiles escolares', 'Papelería de oficina', 'Arte y manualidades', 'Organización y otros');

DELETE FROM proveedor WHERE ruc = '800LIB01-1';
DELETE FROM comprador WHERE nombre = 'Comprador LibreríaSys Demo';



INSERT INTO categoria (nombre, imagen, orden_pantalla, activo, mostrar_venta_medio, mostrar_menu_digital, orden_venta_medio)
VALUES ('Útiles escolares', '/recursos/img/catalog/cat_utiles.svg', 10, true, true, true, 10);


INSERT INTO categoria (nombre, imagen, orden_pantalla, activo, mostrar_venta_medio, mostrar_menu_digital, orden_venta_medio)
VALUES ('Papelería de oficina', '/recursos/img/catalog/cat_oficina.svg', 20, true, true, true, 20);


INSERT INTO categoria (nombre, imagen, orden_pantalla, activo, mostrar_venta_medio, mostrar_menu_digital, orden_venta_medio)
VALUES ('Arte y manualidades', '/recursos/img/catalog/cat_arte.svg', 30, true, true, true, 30);


INSERT INTO categoria (nombre, imagen, orden_pantalla, activo, mostrar_venta_medio, mostrar_menu_digital, orden_venta_medio)
VALUES ('Organización y otros', '/recursos/img/catalog/cat_org.svg', 40, true, true, true, 40);


INSERT INTO proveedor (nombre, ruc, telefono, direccion, email, razon_social, activo)
VALUES (
  'Distribuidora Librería Demo',
  '800LIB01-1',
  '021000000',
  'Asunción',
  'demo@libreriasys.local',
  'Distribuidora Librería Demo SRL',
  true
);

INSERT INTO comprador (nombre, activo)
VALUES ('Comprador LibreríaSys Demo', true);


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Diccionario Alamo Español-Inglés',
  'Catálogo seed LibreríaSys | Útiles escolares',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_libro.svg',
  'unidad',
  0,
  'LIB00000001',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  5,
  false,
  false,
  true,
  5
FROM categoria c
WHERE c.nombre = 'Útiles escolares'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  11668,
  0,
  17950,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  11668::numeric,
  11668::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000001'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Diccionario Alamo Guaraní/Español',
  'Catálogo seed LibreríaSys | Útiles escolares',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_libro.svg',
  'unidad',
  0,
  'LIB00000002',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  10,
  false,
  false,
  true,
  10
FROM categoria c
WHERE c.nombre = 'Útiles escolares'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  8548,
  0,
  13150,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  8548::numeric,
  8548::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000002'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Diccionario Océano Práctico Español',
  'Catálogo seed LibreríaSys | Útiles escolares',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_libro.svg',
  'unidad',
  0,
  'LIB00000003',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  15,
  false,
  false,
  true,
  15
FROM categoria c
WHERE c.nombre = 'Útiles escolares'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  20963,
  0,
  32250,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  20963::numeric,
  20963::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000003'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Bolígrafo Maped Ice Clic Azul x10',
  'Catálogo seed LibreríaSys | Útiles escolares',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_boligrafo.svg',
  'unidad',
  0,
  'LIB00000004',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  20,
  false,
  false,
  true,
  20
FROM categoria c
WHERE c.nombre = 'Útiles escolares'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  18558,
  0,
  28550,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  18558::numeric,
  18558::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000004'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Set Geometría Junior Acrimet',
  'Catálogo seed LibreríaSys | Útiles escolares',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_geometria.svg',
  'unidad',
  0,
  'LIB00000005',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  25,
  false,
  false,
  true,
  25
FROM categoria c
WHERE c.nombre = 'Útiles escolares'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  10075,
  0,
  15500,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  10075::numeric,
  10075::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000005'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Regla 30cm Maped Essentials Eco',
  'Catálogo seed LibreríaSys | Útiles escolares',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_geometria.svg',
  'unidad',
  0,
  'LIB00000006',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  30,
  false,
  false,
  true,
  30
FROM categoria c
WHERE c.nombre = 'Útiles escolares'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  1983,
  0,
  3050,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  1983::numeric,
  1983::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000006'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Regla 30cm Metal H-Tone',
  'Catálogo seed LibreríaSys | Útiles escolares',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_geometria.svg',
  'unidad',
  0,
  'LIB00000007',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  35,
  false,
  false,
  true,
  35
FROM categoria c
WHERE c.nombre = 'Útiles escolares'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  2925,
  0,
  4500,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  2925::numeric,
  2925::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000007'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Cutter Chico Alamo guía plástico',
  'Catálogo seed LibreríaSys | Útiles escolares',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_cutter.svg',
  'unidad',
  0,
  'LIB00000008',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  40,
  false,
  false,
  true,
  40
FROM categoria c
WHERE c.nombre = 'Útiles escolares'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  1203,
  0,
  1850,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  1203::numeric,
  1203::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000008'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Cutter Grande Alamo guía metal',
  'Catálogo seed LibreríaSys | Útiles escolares',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_cutter.svg',
  'unidad',
  0,
  'LIB00000009',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  45,
  false,
  false,
  true,
  45
FROM categoria c
WHERE c.nombre = 'Útiles escolares'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  4063,
  0,
  6250,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  4063::numeric,
  4063::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000009'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Tijera Mediana Alamo Oficina 18cm',
  'Catálogo seed LibreríaSys | Útiles escolares',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_tijera.svg',
  'unidad',
  0,
  'LIB00000010',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  50,
  false,
  false,
  true,
  50
FROM categoria c
WHERE c.nombre = 'Útiles escolares'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  4648,
  0,
  7150,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  4648::numeric,
  4648::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000010'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Tijera Grande Alamo asimétrica 19cm',
  'Catálogo seed LibreríaSys | Útiles escolares',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_tijera.svg',
  'unidad',
  0,
  'LIB00000011',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  55,
  false,
  false,
  true,
  55
FROM categoria c
WHERE c.nombre = 'Útiles escolares'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  6013,
  0,
  9250,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  6013::numeric,
  6013::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000011'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Tijera Grande Alamo asimétrica 20cm',
  'Catálogo seed LibreríaSys | Útiles escolares',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_tijera.svg',
  'unidad',
  0,
  'LIB00000012',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  60,
  false,
  false,
  true,
  60
FROM categoria c
WHERE c.nombre = 'Útiles escolares'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  5298,
  0,
  8150,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  5298::numeric,
  5298::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000012'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Tijera Maped Essentials 13cm',
  'Catálogo seed LibreríaSys | Útiles escolares',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_tijera.svg',
  'unidad',
  0,
  'LIB00000013',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  65,
  false,
  false,
  true,
  65
FROM categoria c
WHERE c.nombre = 'Útiles escolares'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  2698,
  0,
  4150,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  2698::numeric,
  2698::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000013'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Tijera Maped Reflex 12cm',
  'Catálogo seed LibreríaSys | Útiles escolares',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_tijera.svg',
  'unidad',
  0,
  'LIB00000014',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  70,
  false,
  false,
  true,
  70
FROM categoria c
WHERE c.nombre = 'Útiles escolares'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  6923,
  0,
  10650,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  6923::numeric,
  6923::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000014'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Tijera Maped Security 13cm',
  'Catálogo seed LibreríaSys | Útiles escolares',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_tijera.svg',
  'unidad',
  0,
  'LIB00000015',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  75,
  false,
  false,
  true,
  75
FROM categoria c
WHERE c.nombre = 'Útiles escolares'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  4875,
  0,
  7500,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  4875::numeric,
  4875::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000015'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Tijera Maped Indestructible 21cm',
  'Catálogo seed LibreríaSys | Útiles escolares',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_tijera.svg',
  'unidad',
  0,
  'LIB00000016',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  80,
  false,
  false,
  true,
  80
FROM categoria c
WHERE c.nombre = 'Útiles escolares'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  34288,
  0,
  52750,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  34288::numeric,
  34288::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000016'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Tijera Maped Escolar Koopy Blister',
  'Catálogo seed LibreríaSys | Útiles escolares',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_tijera.svg',
  'unidad',
  0,
  'LIB00000017',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  85,
  false,
  false,
  true,
  85
FROM categoria c
WHERE c.nombre = 'Útiles escolares'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  11408,
  0,
  17550,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  11408::numeric,
  11408::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000017'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Lápiz HB H-Tone Flexible c/goma',
  'Catálogo seed LibreríaSys | Útiles escolares',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_lapiz.svg',
  'unidad',
  0,
  'LIB00000018',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  90,
  false,
  false,
  true,
  90
FROM categoria c
WHERE c.nombre = 'Útiles escolares'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  293,
  0,
  450,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  293::numeric,
  293::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000018'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Lápiz HB H-Tone Rojo',
  'Catálogo seed LibreríaSys | Útiles escolares',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_lapiz.svg',
  'unidad',
  0,
  'LIB00000019',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  95,
  false,
  false,
  true,
  95
FROM categoria c
WHERE c.nombre = 'Útiles escolares'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  325,
  0,
  500,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  325::numeric,
  325::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000019'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Lápiz 12 col. H-Tone Largo Flexible',
  'Catálogo seed LibreríaSys | Útiles escolares',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_lapices_color.svg',
  'unidad',
  0,
  'LIB00000020',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  100,
  false,
  false,
  true,
  100
FROM categoria c
WHERE c.nombre = 'Útiles escolares'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  4550,
  0,
  7000,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  4550::numeric,
  4550::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000020'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Lápiz 24 col. H-Tone Largo',
  'Catálogo seed LibreríaSys | Útiles escolares',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_lapices_color.svg',
  'unidad',
  0,
  'LIB00000021',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  105,
  false,
  false,
  true,
  105
FROM categoria c
WHERE c.nombre = 'Útiles escolares'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  13683,
  0,
  21050,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  13683::numeric,
  13683::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000021'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Lápiz 24 col. H-Tone Largo Flexible',
  'Catálogo seed LibreríaSys | Útiles escolares',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_lapices_color.svg',
  'unidad',
  0,
  'LIB00000022',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  110,
  false,
  false,
  true,
  110
FROM categoria c
WHERE c.nombre = 'Útiles escolares'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  8873,
  0,
  13650,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  8873::numeric,
  8873::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000022'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Lápiz 12 col. H-Tone Acuarelado',
  'Catálogo seed LibreríaSys | Útiles escolares',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_lapices_color.svg',
  'unidad',
  0,
  'LIB00000023',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  115,
  false,
  false,
  true,
  115
FROM categoria c
WHERE c.nombre = 'Útiles escolares'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  7898,
  0,
  12150,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  7898::numeric,
  7898::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000023'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Lápiz 36 col. Maped Largo',
  'Catálogo seed LibreríaSys | Útiles escolares',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_lapices_color.svg',
  'unidad',
  0,
  'LIB00000024',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  120,
  false,
  false,
  true,
  120
FROM categoria c
WHERE c.nombre = 'Útiles escolares'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  46410,
  0,
  71400,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  46410::numeric,
  46410::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000024'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Lápiz 36 col. Acrilex Largo',
  'Catálogo seed LibreríaSys | Útiles escolares',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_lapices_color.svg',
  'unidad',
  0,
  'LIB00000025',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  125,
  false,
  false,
  true,
  125
FROM categoria c
WHERE c.nombre = 'Útiles escolares'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  23400,
  0,
  36000,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  23400::numeric,
  23400::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000025'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Lápiz de papel Maped HB x72 pote',
  'Catálogo seed LibreríaSys | Útiles escolares',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_lapiz.svg',
  'unidad',
  0,
  'LIB00000026',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  130,
  false,
  false,
  true,
  130
FROM categoria c
WHERE c.nombre = 'Útiles escolares'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  99873,
  0,
  153650,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  99873::numeric,
  99873::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000026'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Set Maped Color Peps x100 pcs',
  'Catálogo seed LibreríaSys | Útiles escolares',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_lapices_color.svg',
  'unidad',
  0,
  'LIB00000027',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  135,
  false,
  false,
  true,
  135
FROM categoria c
WHERE c.nombre = 'Útiles escolares'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  118788,
  0,
  182750,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  118788::numeric,
  118788::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000027'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Estuche Escolar Maped x12 Mini Cute',
  'Catálogo seed LibreríaSys | Útiles escolares',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_cartuchera.svg',
  'unidad',
  0,
  'LIB00000028',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  140,
  false,
  false,
  true,
  140
FROM categoria c
WHERE c.nombre = 'Útiles escolares'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  64480,
  0,
  99200,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  64480::numeric,
  64480::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000028'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Borrador Maped Technic 600 c/funda',
  'Catálogo seed LibreríaSys | Útiles escolares',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_borrador.svg',
  'unidad',
  0,
  'LIB00000029',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  145,
  false,
  false,
  true,
  145
FROM categoria c
WHERE c.nombre = 'Útiles escolares'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  2308,
  0,
  3550,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  2308::numeric,
  2308::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000029'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Borrador Maped Black',
  'Catálogo seed LibreríaSys | Útiles escolares',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_borrador.svg',
  'unidad',
  0,
  'LIB00000030',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  150,
  false,
  false,
  true,
  150
FROM categoria c
WHERE c.nombre = 'Útiles escolares'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  1885,
  0,
  2900,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  1885::numeric,
  1885::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000030'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Borrador Maped Mini X-pert Técnico',
  'Catálogo seed LibreríaSys | Útiles escolares',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_borrador.svg',
  'unidad',
  0,
  'LIB00000031',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  155,
  false,
  false,
  true,
  155
FROM categoria c
WHERE c.nombre = 'Útiles escolares'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  1073,
  0,
  1650,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  1073::numeric,
  1073::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000031'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Borrador Maped Arquitectura',
  'Catálogo seed LibreríaSys | Útiles escolares',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_borrador.svg',
  'unidad',
  0,
  'LIB00000032',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  160,
  false,
  false,
  true,
  160
FROM categoria c
WHERE c.nombre = 'Útiles escolares'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  3933,
  0,
  6050,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  3933::numeric,
  3933::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000032'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Borrador H-Tone Escolar Plástico',
  'Catálogo seed LibreríaSys | Útiles escolares',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_borrador.svg',
  'unidad',
  0,
  'LIB00000033',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  165,
  false,
  false,
  true,
  165
FROM categoria c
WHERE c.nombre = 'Útiles escolares'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  585,
  0,
  900,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  585::numeric,
  585::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000033'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Borrador Alamo c/cobertor colores',
  'Catálogo seed LibreríaSys | Útiles escolares',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_borrador.svg',
  'unidad',
  0,
  'LIB00000034',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  170,
  false,
  false,
  true,
  170
FROM categoria c
WHERE c.nombre = 'Útiles escolares'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  1138,
  0,
  1750,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  1138::numeric,
  1138::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000034'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Escuadra Escolar 45° H-Tone',
  'Catálogo seed LibreríaSys | Útiles escolares',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_geometria.svg',
  'unidad',
  0,
  'LIB00000035',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  175,
  false,
  false,
  true,
  175
FROM categoria c
WHERE c.nombre = 'Útiles escolares'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  1755,
  0,
  2700,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  1755::numeric,
  1755::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000035'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Cartuchera Maped Plana Girl Mexican',
  'Catálogo seed LibreríaSys | Útiles escolares',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_cartuchera.svg',
  'unidad',
  0,
  'LIB00000036',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  180,
  false,
  false,
  true,
  180
FROM categoria c
WHERE c.nombre = 'Útiles escolares'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  27560,
  0,
  42400,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  27560::numeric,
  27560::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000036'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Cartuchera Maped Plana Boy Ethnic',
  'Catálogo seed LibreríaSys | Útiles escolares',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_cartuchera.svg',
  'unidad',
  0,
  'LIB00000037',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  185,
  false,
  false,
  true,
  185
FROM categoria c
WHERE c.nombre = 'Útiles escolares'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  27560,
  0,
  42400,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  27560::numeric,
  27560::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000037'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Cartuchera FW Organizador Book Magu',
  'Catálogo seed LibreríaSys | Útiles escolares',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_cartuchera.svg',
  'unidad',
  0,
  'LIB00000038',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  190,
  false,
  false,
  true,
  190
FROM categoria c
WHERE c.nombre = 'Útiles escolares'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  33378,
  0,
  51350,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  33378::numeric,
  33378::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000038'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Marcador Maped Punta Fina 0,4mm x10',
  'Catálogo seed LibreríaSys | Útiles escolares',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_marcador.svg',
  'unidad',
  0,
  'LIB00000039',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  195,
  false,
  false,
  true,
  195
FROM categoria c
WHERE c.nombre = 'Útiles escolares'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  33020,
  0,
  50800,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  33020::numeric,
  33020::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000039'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Bolígrafo Compactor 0,7mm Azul',
  'Catálogo seed LibreríaSys | Útiles escolares',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_boligrafo.svg',
  'unidad',
  0,
  'LIB00000040',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  200,
  false,
  false,
  true,
  200
FROM categoria c
WHERE c.nombre = 'Útiles escolares'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  780,
  0,
  1200,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  780::numeric,
  780::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000040'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Bolígrafo Compactor 0,7mm Negro',
  'Catálogo seed LibreríaSys | Útiles escolares',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_boligrafo.svg',
  'unidad',
  0,
  'LIB00000041',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  205,
  false,
  false,
  true,
  205
FROM categoria c
WHERE c.nombre = 'Útiles escolares'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  780,
  0,
  1200,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  780::numeric,
  780::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000041'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Bolígrafo Compactor 0,7mm Rojo',
  'Catálogo seed LibreríaSys | Útiles escolares',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_boligrafo.svg',
  'unidad',
  0,
  'LIB00000042',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  210,
  false,
  false,
  true,
  210
FROM categoria c
WHERE c.nombre = 'Útiles escolares'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  780,
  0,
  1200,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  780::numeric,
  780::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000042'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Bolígrafo Schneider Roller Paint-It Metal',
  'Catálogo seed LibreríaSys | Útiles escolares',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_boligrafo.svg',
  'unidad',
  0,
  'LIB00000043',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  215,
  false,
  false,
  true,
  215
FROM categoria c
WHERE c.nombre = 'Útiles escolares'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  7280,
  0,
  11200,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  7280::numeric,
  7280::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000043'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Portamina H-Tone Metal 0,5mm',
  'Catálogo seed LibreríaSys | Útiles escolares',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_portamina.svg',
  'unidad',
  0,
  'LIB00000044',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  220,
  false,
  false,
  true,
  220
FROM categoria c
WHERE c.nombre = 'Útiles escolares'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  1788,
  0,
  2750,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  1788::numeric,
  1788::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000044'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Mina Mospas 0,5mm',
  'Catálogo seed LibreríaSys | Útiles escolares',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_portamina.svg',
  'unidad',
  0,
  'LIB00000045',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  225,
  false,
  false,
  true,
  225
FROM categoria c
WHERE c.nombre = 'Útiles escolares'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  410,
  0,
  630,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  410::numeric,
  410::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000045'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Compás H-Tone con Abrazadera',
  'Catálogo seed LibreríaSys | Útiles escolares',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_geometria.svg',
  'unidad',
  0,
  'LIB00000046',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  230,
  false,
  false,
  true,
  230
FROM categoria c
WHERE c.nombre = 'Útiles escolares'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  2860,
  0,
  4400,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  2860::numeric,
  2860::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000046'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Transportador 180° H-Tone',
  'Catálogo seed LibreríaSys | Útiles escolares',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_geometria.svg',
  'unidad',
  0,
  'LIB00000047',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  235,
  false,
  false,
  true,
  235
FROM categoria c
WHERE c.nombre = 'Útiles escolares'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  1105,
  0,
  1700,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  1105::numeric,
  1105::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000047'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Cuad. Cosmos T/D c/Diseño 48H',
  'Catálogo seed LibreríaSys | Papelería de oficina',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_cuaderno.svg',
  'unidad',
  0,
  'LIB00000048',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  240,
  false,
  false,
  true,
  240
FROM categoria c
WHERE c.nombre = 'Papelería de oficina'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  2366,
  0,
  3640,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  2366::numeric,
  2366::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000048'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Cuad. Cosmos T/D c/Diseño 96H',
  'Catálogo seed LibreríaSys | Papelería de oficina',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_cuaderno.svg',
  'unidad',
  0,
  'LIB00000049',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  245,
  false,
  false,
  true,
  245
FROM categoria c
WHERE c.nombre = 'Papelería de oficina'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  3656,
  0,
  5625,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  3656::numeric,
  3656::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000049'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Univ. Alamo Neon 96H T/D 1R',
  'Catálogo seed LibreríaSys | Papelería de oficina',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_cuaderno.svg',
  'unidad',
  0,
  'LIB00000050',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  250,
  false,
  false,
  true,
  250
FROM categoria c
WHERE c.nombre = 'Papelería de oficina'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  7963,
  0,
  12250,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  7963::numeric,
  7963::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000050'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Univ. Alamo Pastel 200H T/D 1R',
  'Catálogo seed LibreríaSys | Papelería de oficina',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_cuaderno.svg',
  'unidad',
  0,
  'LIB00000051',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  255,
  false,
  false,
  true,
  255
FROM categoria c
WHERE c.nombre = 'Papelería de oficina'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  13857,
  0,
  21318,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  13857::numeric,
  13857::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000051'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Univ. Alamo T/D PVC Pastel Gofrado 96H',
  'Catálogo seed LibreríaSys | Papelería de oficina',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_cuaderno.svg',
  'unidad',
  0,
  'LIB00000052',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  260,
  false,
  false,
  true,
  260
FROM categoria c
WHERE c.nombre = 'Papelería de oficina'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  19273,
  0,
  29650,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  19273::numeric,
  19273::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000052'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Univ. Alamo Hot Wheels 48H 1R',
  'Catálogo seed LibreríaSys | Papelería de oficina',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_cuaderno.svg',
  'unidad',
  0,
  'LIB00000053',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  265,
  false,
  false,
  true,
  265
FROM categoria c
WHERE c.nombre = 'Papelería de oficina'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  4615,
  0,
  7100,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  4615::numeric,
  4615::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000053'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Libretita Alamo Nº1 96H Executive',
  'Catálogo seed LibreríaSys | Papelería de oficina',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_cuaderno.svg',
  'unidad',
  0,
  'LIB00000054',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  270,
  false,
  false,
  true,
  270
FROM categoria c
WHERE c.nombre = 'Papelería de oficina'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  4420,
  0,
  6800,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  4420::numeric,
  4420::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000054'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Cuad 2001 T/D 96H',
  'Catálogo seed LibreríaSys | Papelería de oficina',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_generico.svg',
  'unidad',
  0,
  'LIB00000055',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  275,
  false,
  false,
  true,
  275
FROM categoria c
WHERE c.nombre = 'Papelería de oficina'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  1950,
  0,
  3000,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  1950::numeric,
  1950::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000055'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Presilladora Alamo Metal chica',
  'Catálogo seed LibreríaSys | Papelería de oficina',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_oficina.svg',
  'unidad',
  0,
  'LIB00000056',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  280,
  false,
  false,
  true,
  280
FROM categoria c
WHERE c.nombre = 'Papelería de oficina'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  8255,
  0,
  12700,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  8255::numeric,
  8255::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000056'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Presilladora Alamo Metal grande',
  'Catálogo seed LibreríaSys | Papelería de oficina',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_oficina.svg',
  'unidad',
  0,
  'LIB00000057',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  285,
  false,
  false,
  true,
  285
FROM categoria c
WHERE c.nombre = 'Papelería de oficina'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  14820,
  0,
  22800,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  14820::numeric,
  14820::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000057'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Clips Alamo Nº3 28mm',
  'Catálogo seed LibreríaSys | Papelería de oficina',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_oficina.svg',
  'unidad',
  0,
  'LIB00000058',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  290,
  false,
  false,
  true,
  290
FROM categoria c
WHERE c.nombre = 'Papelería de oficina'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  1690,
  0,
  2600,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  1690::numeric,
  1690::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000058'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Clips Alamo Nº4 33mm',
  'Catálogo seed LibreríaSys | Papelería de oficina',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_oficina.svg',
  'unidad',
  0,
  'LIB00000059',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  295,
  false,
  false,
  true,
  295
FROM categoria c
WHERE c.nombre = 'Papelería de oficina'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  1755,
  0,
  2700,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  1755::numeric,
  1755::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000059'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Porta Lápiz Liggo Coral Pastel',
  'Catálogo seed LibreríaSys | Papelería de oficina',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_lapiz.svg',
  'unidad',
  0,
  'LIB00000060',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  300,
  false,
  false,
  true,
  300
FROM categoria c
WHERE c.nombre = 'Papelería de oficina'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  5759,
  0,
  8860,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  5759::numeric,
  5759::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000060'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Plasticola Maxi Cola 90g',
  'Catálogo seed LibreríaSys | Papelería de oficina',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_oficina.svg',
  'unidad',
  0,
  'LIB00000061',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  305,
  false,
  false,
  true,
  305
FROM categoria c
WHERE c.nombre = 'Papelería de oficina'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  2145,
  0,
  3300,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  2145::numeric,
  2145::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000061'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Pegamento en Barra UHU Stic 40g',
  'Catálogo seed LibreríaSys | Papelería de oficina',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_plastilina.svg',
  'unidad',
  0,
  'LIB00000062',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  310,
  false,
  false,
  true,
  310
FROM categoria c
WHERE c.nombre = 'Papelería de oficina'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  20280,
  0,
  31200,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  20280::numeric,
  20280::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000062'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Cinta Embalaje 48mmx36,5m Transp.',
  'Catálogo seed LibreríaSys | Papelería de oficina',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_oficina.svg',
  'unidad',
  0,
  'LIB00000063',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  315,
  false,
  false,
  true,
  315
FROM categoria c
WHERE c.nombre = 'Papelería de oficina'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  3575,
  0,
  5500,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  3575::numeric,
  3575::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000063'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Cinta Embalaje Racing Polo Verde',
  'Catálogo seed LibreríaSys | Papelería de oficina',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_oficina.svg',
  'unidad',
  0,
  'LIB00000064',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  320,
  false,
  false,
  true,
  320
FROM categoria c
WHERE c.nombre = 'Papelería de oficina'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  18200,
  0,
  28000,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  18200::numeric,
  18200::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000064'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Cinta Embalaje Racing Polo Blanca',
  'Catálogo seed LibreríaSys | Papelería de oficina',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_oficina.svg',
  'unidad',
  0,
  'LIB00000065',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  325,
  false,
  false,
  true,
  325
FROM categoria c
WHERE c.nombre = 'Papelería de oficina'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  18200,
  0,
  28000,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  18200::numeric,
  18200::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000065'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Cinta Adhesiva Comercial 11mmx18,2m',
  'Catálogo seed LibreríaSys | Papelería de oficina',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_oficina.svg',
  'unidad',
  0,
  'LIB00000066',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  330,
  false,
  false,
  true,
  330
FROM categoria c
WHERE c.nombre = 'Papelería de oficina'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  943,
  0,
  1450,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  943::numeric,
  943::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000066'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Cinta Doble Faz 12mmx10m AllTape',
  'Catálogo seed LibreríaSys | Papelería de oficina',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_oficina.svg',
  'unidad',
  0,
  'LIB00000067',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  335,
  false,
  false,
  true,
  335
FROM categoria c
WHERE c.nombre = 'Papelería de oficina'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  2275,
  0,
  3500,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  2275::numeric,
  2275::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000067'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Cinta Correctiva 5mm x 6m H-Tone',
  'Catálogo seed LibreríaSys | Papelería de oficina',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_oficina.svg',
  'unidad',
  0,
  'LIB00000068',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  340,
  false,
  false,
  true,
  340
FROM categoria c
WHERE c.nombre = 'Papelería de oficina'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  2828,
  0,
  4350,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  2828::numeric,
  2828::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000068'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Corrector Líquido Acrilex 18ml',
  'Catálogo seed LibreríaSys | Papelería de oficina',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_oficina.svg',
  'unidad',
  0,
  'LIB00000069',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  345,
  false,
  false,
  true,
  345
FROM categoria c
WHERE c.nombre = 'Papelería de oficina'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  4323,
  0,
  6650,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  4323::numeric,
  4323::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000069'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Corrector Lápiz 5ml H-Tone',
  'Catálogo seed LibreríaSys | Papelería de oficina',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_lapiz.svg',
  'unidad',
  0,
  'LIB00000070',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  350,
  false,
  false,
  true,
  350
FROM categoria c
WHERE c.nombre = 'Papelería de oficina'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  1723,
  0,
  2650,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  1723::numeric,
  1723::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000070'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Corrector Líquido Toque Mágico 18ml',
  'Catálogo seed LibreríaSys | Papelería de oficina',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_oficina.svg',
  'unidad',
  0,
  'LIB00000071',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  355,
  false,
  false,
  true,
  355
FROM categoria c
WHERE c.nombre = 'Papelería de oficina'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  1950,
  0,
  3000,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  1950::numeric,
  1950::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000071'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Resma Cosmos Carta x500',
  'Catálogo seed LibreríaSys | Papelería de oficina',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_papel.svg',
  'unidad',
  0,
  'LIB00000072',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  360,
  false,
  false,
  true,
  360
FROM categoria c
WHERE c.nombre = 'Papelería de oficina'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  13163,
  0,
  20250,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  13163::numeric,
  13163::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000072'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Resma Alamo Oficio x500',
  'Catálogo seed LibreríaSys | Papelería de oficina',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_papel.svg',
  'unidad',
  0,
  'LIB00000073',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  365,
  false,
  false,
  true,
  365
FROM categoria c
WHERE c.nombre = 'Papelería de oficina'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  15665,
  0,
  24100,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  15665::numeric,
  15665::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000073'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Resma Alamo A4 x500',
  'Catálogo seed LibreríaSys | Papelería de oficina',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_papel.svg',
  'unidad',
  0,
  'LIB00000074',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  370,
  false,
  false,
  true,
  370
FROM categoria c
WHERE c.nombre = 'Papelería de oficina'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  13715,
  0,
  21100,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  13715::numeric,
  13715::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000074'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Resma Cosmos Oficio Celeste x500',
  'Catálogo seed LibreríaSys | Papelería de oficina',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_papel.svg',
  'unidad',
  0,
  'LIB00000075',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  375,
  false,
  false,
  true,
  375
FROM categoria c
WHERE c.nombre = 'Papelería de oficina'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  26943,
  0,
  41450,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  26943::numeric,
  26943::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000075'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Carpeta Semitransp. 20mm Azul',
  'Catálogo seed LibreríaSys | Papelería de oficina',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_carpeta.svg',
  'unidad',
  0,
  'LIB00000076',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  380,
  false,
  false,
  true,
  380
FROM categoria c
WHERE c.nombre = 'Papelería de oficina'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  4843,
  0,
  7450,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  4843::numeric,
  4843::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000076'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Carpeta Semitransp. 55mm Cristal',
  'Catálogo seed LibreríaSys | Papelería de oficina',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_carpeta.svg',
  'unidad',
  0,
  'LIB00000077',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  385,
  false,
  false,
  true,
  385
FROM categoria c
WHERE c.nombre = 'Papelería de oficina'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  6533,
  0,
  10050,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  6533::numeric,
  6533::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000077'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Carpeta Semitransp. 40mm Humo',
  'Catálogo seed LibreríaSys | Papelería de oficina',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_carpeta.svg',
  'unidad',
  0,
  'LIB00000078',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  390,
  false,
  false,
  true,
  390
FROM categoria c
WHERE c.nombre = 'Papelería de oficina'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  6403,
  0,
  9850,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  6403::numeric,
  6403::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000078'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Carpeta Archivadora Alamo Minion',
  'Catálogo seed LibreríaSys | Papelería de oficina',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_carpeta.svg',
  'unidad',
  0,
  'LIB00000079',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  395,
  false,
  false,
  true,
  395
FROM categoria c
WHERE c.nombre = 'Papelería de oficina'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  4680,
  0,
  7200,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  4680::numeric,
  4680::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000079'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Carpeta Archivadora Azul',
  'Catálogo seed LibreríaSys | Papelería de oficina',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_carpeta.svg',
  'unidad',
  0,
  'LIB00000080',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  400,
  false,
  false,
  true,
  400
FROM categoria c
WHERE c.nombre = 'Papelería de oficina'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  1203,
  0,
  1850,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  1203::numeric,
  1203::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000080'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Carpeta Archivadora Rosa Pastel',
  'Catálogo seed LibreríaSys | Papelería de oficina',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_carpeta.svg',
  'unidad',
  0,
  'LIB00000081',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  405,
  false,
  false,
  true,
  405
FROM categoria c
WHERE c.nombre = 'Papelería de oficina'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  1203,
  0,
  1850,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  1203::numeric,
  1203::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000081'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Carpeta Archivadora Lila',
  'Catálogo seed LibreríaSys | Papelería de oficina',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_carpeta.svg',
  'unidad',
  0,
  'LIB00000082',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  410,
  false,
  false,
  true,
  410
FROM categoria c
WHERE c.nombre = 'Papelería de oficina'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  1203,
  0,
  1850,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  1203::numeric,
  1203::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000082'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Carpeta Archivadora Naranja',
  'Catálogo seed LibreríaSys | Papelería de oficina',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_carpeta.svg',
  'unidad',
  0,
  'LIB00000083',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  415,
  false,
  false,
  true,
  415
FROM categoria c
WHERE c.nombre = 'Papelería de oficina'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  1203,
  0,
  1850,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  1203::numeric,
  1203::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000083'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Carpeta Archivadora Verde',
  'Catálogo seed LibreríaSys | Papelería de oficina',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_carpeta.svg',
  'unidad',
  0,
  'LIB00000084',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  420,
  false,
  false,
  true,
  420
FROM categoria c
WHERE c.nombre = 'Papelería de oficina'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  1203,
  0,
  1850,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  1203::numeric,
  1203::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000084'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Carpeta Archivadora Bordo',
  'Catálogo seed LibreríaSys | Papelería de oficina',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_carpeta.svg',
  'unidad',
  0,
  'LIB00000085',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  425,
  false,
  false,
  true,
  425
FROM categoria c
WHERE c.nombre = 'Papelería de oficina'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  1203,
  0,
  1850,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  1203::numeric,
  1203::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000085'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Bibliorato Alamo L/A Oficio Común',
  'Catálogo seed LibreríaSys | Papelería de oficina',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_carpeta.svg',
  'unidad',
  0,
  'LIB00000086',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  430,
  false,
  false,
  true,
  430
FROM categoria c
WHERE c.nombre = 'Papelería de oficina'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  6955,
  0,
  10700,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  6955::numeric,
  6955::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000086'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Bibliorato Lomo Ancho PVC Rojo',
  'Catálogo seed LibreríaSys | Papelería de oficina',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_carpeta.svg',
  'unidad',
  0,
  'LIB00000087',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  435,
  false,
  false,
  true,
  435
FROM categoria c
WHERE c.nombre = 'Papelería de oficina'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  8320,
  0,
  12800,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  8320::numeric,
  8320::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000087'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Bibliorato Lomo Ancho PVC Gris',
  'Catálogo seed LibreríaSys | Papelería de oficina',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_carpeta.svg',
  'unidad',
  0,
  'LIB00000088',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  440,
  false,
  false,
  true,
  440
FROM categoria c
WHERE c.nombre = 'Papelería de oficina'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  8320,
  0,
  12800,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  8320::numeric,
  8320::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000088'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Sobre 12x9cm 80gr Blister x20',
  'Catálogo seed LibreríaSys | Papelería de oficina',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_oficina.svg',
  'unidad',
  0,
  'LIB00000089',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  445,
  false,
  false,
  true,
  445
FROM categoria c
WHERE c.nombre = 'Papelería de oficina'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  2730,
  0,
  4200,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  2730::numeric,
  2730::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000089'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Sobre Bolsa 25x36 Kraft 80gr',
  'Catálogo seed LibreríaSys | Papelería de oficina',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_oficina.svg',
  'unidad',
  0,
  'LIB00000090',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  450,
  false,
  false,
  true,
  450
FROM categoria c
WHERE c.nombre = 'Papelería de oficina'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  4940,
  0,
  7600,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  4940::numeric,
  4940::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000090'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Sobre Tarjetón 13,5x18,5 80gr x10',
  'Catálogo seed LibreríaSys | Papelería de oficina',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_oficina.svg',
  'unidad',
  0,
  'LIB00000091',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  455,
  false,
  false,
  true,
  455
FROM categoria c
WHERE c.nombre = 'Papelería de oficina'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  1430,
  0,
  2200,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  1430::numeric,
  1430::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000091'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Papel Contac Rapmi Transp. 10mx45cm',
  'Catálogo seed LibreríaSys | Papelería de oficina',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_papel.svg',
  'unidad',
  0,
  'LIB00000092',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  460,
  false,
  false,
  true,
  460
FROM categoria c
WHERE c.nombre = 'Papelería de oficina'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  24083,
  0,
  37050,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  24083::numeric,
  24083::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000092'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Folio A4 Proplast x10',
  'Catálogo seed LibreríaSys | Papelería de oficina',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_papel.svg',
  'unidad',
  0,
  'LIB00000093',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  465,
  false,
  false,
  true,
  465
FROM categoria c
WHERE c.nombre = 'Papelería de oficina'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  2113,
  0,
  3250,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  2113::numeric,
  2113::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000093'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Señaladores Adhes. H-Tone 4col x25h',
  'Catálogo seed LibreríaSys | Papelería de oficina',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_oficina.svg',
  'unidad',
  0,
  'LIB00000094',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  470,
  false,
  false,
  true,
  470
FROM categoria c
WHERE c.nombre = 'Papelería de oficina'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  2275,
  0,
  3500,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  2275::numeric,
  2275::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000094'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Banderita Index Stick''n 45x12 5col',
  'Catálogo seed LibreríaSys | Papelería de oficina',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_oficina.svg',
  'unidad',
  0,
  'LIB00000095',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  475,
  false,
  false,
  true,
  475
FROM categoria c
WHERE c.nombre = 'Papelería de oficina'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  3770,
  0,
  5800,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  3770::numeric,
  3770::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000095'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Nota Adhesiva Stick''n 38x51 Amarillo',
  'Catálogo seed LibreríaSys | Papelería de oficina',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_oficina.svg',
  'unidad',
  0,
  'LIB00000096',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  480,
  false,
  false,
  true,
  480
FROM categoria c
WHERE c.nombre = 'Papelería de oficina'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  16868,
  0,
  25950,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  16868::numeric,
  16868::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000096'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Banderita Index Stick''n 200h remov.',
  'Catálogo seed LibreríaSys | Papelería de oficina',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_oficina.svg',
  'unidad',
  0,
  'LIB00000097',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  485,
  false,
  false,
  true,
  485
FROM categoria c
WHERE c.nombre = 'Papelería de oficina'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  6208,
  0,
  9550,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  6208::numeric,
  6208::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000097'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Tiza Marfil x12 Blanco',
  'Catálogo seed LibreríaSys | Papelería de oficina',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_oficina.svg',
  'unidad',
  0,
  'LIB00000098',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  490,
  false,
  false,
  true,
  490
FROM categoria c
WHERE c.nombre = 'Papelería de oficina'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  3250,
  0,
  5000,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  3250::numeric,
  3250::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000098'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Tiza Marfil Color x12',
  'Catálogo seed LibreríaSys | Papelería de oficina',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_oficina.svg',
  'unidad',
  0,
  'LIB00000099',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  495,
  false,
  false,
  true,
  495
FROM categoria c
WHERE c.nombre = 'Papelería de oficina'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  4745,
  0,
  7300,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  4745::numeric,
  4745::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000099'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Marcador Compactor P/Pizarra Recargable',
  'Catálogo seed LibreríaSys | Papelería de oficina',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_marcador.svg',
  'unidad',
  0,
  'LIB00000100',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  500,
  false,
  false,
  true,
  500
FROM categoria c
WHERE c.nombre = 'Papelería de oficina'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  4160,
  0,
  6400,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  4160::numeric,
  4160::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000100'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Marcador Compactor Destaq Fluo',
  'Catálogo seed LibreríaSys | Papelería de oficina',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_marcador.svg',
  'unidad',
  0,
  'LIB00000101',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  505,
  false,
  false,
  true,
  505
FROM categoria c
WHERE c.nombre = 'Papelería de oficina'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  2535,
  0,
  3900,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  2535::numeric,
  2535::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000101'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Marcador Destaq Fluor Blist x4',
  'Catálogo seed LibreríaSys | Papelería de oficina',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_marcador.svg',
  'unidad',
  0,
  'LIB00000102',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  510,
  false,
  false,
  true,
  510
FROM categoria c
WHERE c.nombre = 'Papelería de oficina'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  12610,
  0,
  19400,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  12610::numeric,
  12610::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000102'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Tempera Acrilex 250ml Blanco',
  'Catálogo seed LibreríaSys | Arte y manualidades',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_pintura.svg',
  'unidad',
  0,
  'LIB00000103',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  515,
  false,
  false,
  true,
  515
FROM categoria c
WHERE c.nombre = 'Arte y manualidades'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  8028,
  0,
  12350,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  8028::numeric,
  8028::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000103'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Tempera Acrilex 250ml Celeste',
  'Catálogo seed LibreríaSys | Arte y manualidades',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_pintura.svg',
  'unidad',
  0,
  'LIB00000104',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  520,
  false,
  false,
  true,
  520
FROM categoria c
WHERE c.nombre = 'Arte y manualidades'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  8028,
  0,
  12350,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  8028::numeric,
  8028::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000104'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Tempera Acrilex 250ml Amarillo Oro',
  'Catálogo seed LibreríaSys | Arte y manualidades',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_pintura.svg',
  'unidad',
  0,
  'LIB00000105',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  525,
  false,
  false,
  true,
  525
FROM categoria c
WHERE c.nombre = 'Arte y manualidades'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  8028,
  0,
  12350,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  8028::numeric,
  8028::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000105'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Tempera Acrilex 250ml Negro',
  'Catálogo seed LibreríaSys | Arte y manualidades',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_pintura.svg',
  'unidad',
  0,
  'LIB00000106',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  530,
  false,
  false,
  true,
  530
FROM categoria c
WHERE c.nombre = 'Arte y manualidades'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  8028,
  0,
  12350,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  8028::numeric,
  8028::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000106'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Tempera Acrilex 250ml Verde Bandera',
  'Catálogo seed LibreríaSys | Arte y manualidades',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_pintura.svg',
  'unidad',
  0,
  'LIB00000107',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  535,
  false,
  false,
  true,
  535
FROM categoria c
WHERE c.nombre = 'Arte y manualidades'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  8028,
  0,
  12350,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  8028::numeric,
  8028::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000107'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Tempera Acrilex 15ml 6col Colgante',
  'Catálogo seed LibreríaSys | Arte y manualidades',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_pintura.svg',
  'unidad',
  0,
  'LIB00000108',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  540,
  false,
  false,
  true,
  540
FROM categoria c
WHERE c.nombre = 'Arte y manualidades'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  6013,
  0,
  9250,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  6013::numeric,
  6013::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000108'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Tempera Acrilex 18ml x6col c/pinceles',
  'Catálogo seed LibreríaSys | Arte y manualidades',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_pintura.svg',
  'unidad',
  0,
  'LIB00000109',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  545,
  false,
  false,
  true,
  545
FROM categoria c
WHERE c.nombre = 'Arte y manualidades'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  19923,
  0,
  30650,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  19923::numeric,
  19923::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000109'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Tempera Acrilex x6col Neon 15ml',
  'Catálogo seed LibreríaSys | Arte y manualidades',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_pintura.svg',
  'unidad',
  0,
  'LIB00000110',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  550,
  false,
  false,
  true,
  550
FROM categoria c
WHERE c.nombre = 'Arte y manualidades'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  11180,
  0,
  17200,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  11180::numeric,
  11180::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000110'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Plastilina Acrilex Escolar x6col 60g',
  'Catálogo seed LibreríaSys | Arte y manualidades',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_plastilina.svg',
  'unidad',
  0,
  'LIB00000111',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  555,
  false,
  false,
  true,
  555
FROM categoria c
WHERE c.nombre = 'Arte y manualidades'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  4160,
  0,
  6400,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  4160::numeric,
  4160::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000111'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Plastilina Acrilex Escolar x12col 180g',
  'Catálogo seed LibreríaSys | Arte y manualidades',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_plastilina.svg',
  'unidad',
  0,
  'LIB00000112',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  560,
  false,
  false,
  true,
  560
FROM categoria c
WHERE c.nombre = 'Arte y manualidades'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  8905,
  0,
  13700,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  8905::numeric,
  8905::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000112'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Plastilina Acrilex Soft 150g Chocolate',
  'Catálogo seed LibreríaSys | Arte y manualidades',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_plastilina.svg',
  'unidad',
  0,
  'LIB00000113',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  565,
  false,
  false,
  true,
  565
FROM categoria c
WHERE c.nombre = 'Arte y manualidades'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  6890,
  0,
  10600,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  6890::numeric,
  6890::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000113'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Plastilina Acrilex Soft 150g Rojo',
  'Catálogo seed LibreríaSys | Arte y manualidades',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_plastilina.svg',
  'unidad',
  0,
  'LIB00000114',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  570,
  false,
  false,
  true,
  570
FROM categoria c
WHERE c.nombre = 'Arte y manualidades'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  6890,
  0,
  10600,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  6890::numeric,
  6890::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000114'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Plastilina Acrilex Soft 150g Piel',
  'Catálogo seed LibreríaSys | Arte y manualidades',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_plastilina.svg',
  'unidad',
  0,
  'LIB00000115',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  575,
  false,
  false,
  true,
  575
FROM categoria c
WHERE c.nombre = 'Arte y manualidades'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  6890,
  0,
  10600,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  6890::numeric,
  6890::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000115'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Plastilina Acrilex Soft x6col Ref 7316',
  'Catálogo seed LibreríaSys | Arte y manualidades',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_plastilina.svg',
  'unidad',
  0,
  'LIB00000116',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  580,
  false,
  false,
  true,
  580
FROM categoria c
WHERE c.nombre = 'Arte y manualidades'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  3088,
  0,
  4750,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  3088::numeric,
  3088::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000116'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Plastilina Soft Pastel x6col 90g',
  'Catálogo seed LibreríaSys | Arte y manualidades',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_plastilina.svg',
  'unidad',
  0,
  'LIB00000117',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  585,
  false,
  false,
  true,
  585
FROM categoria c
WHERE c.nombre = 'Arte y manualidades'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  3088,
  0,
  4750,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  3088::numeric,
  3088::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000117'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Multicolage Textil 60g Acrilex',
  'Catálogo seed LibreríaSys | Arte y manualidades',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_plastilina.svg',
  'unidad',
  0,
  'LIB00000118',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  590,
  false,
  false,
  true,
  590
FROM categoria c
WHERE c.nombre = 'Arte y manualidades'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  11473,
  0,
  17650,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  11473::numeric,
  11473::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000118'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Pegamento Multicolage 60ml Acrilex',
  'Catálogo seed LibreríaSys | Arte y manualidades',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_plastilina.svg',
  'unidad',
  0,
  'LIB00000119',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  595,
  false,
  false,
  true,
  595
FROM categoria c
WHERE c.nombre = 'Arte y manualidades'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  9328,
  0,
  14350,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  9328::numeric,
  9328::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000119'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Super Pegamento Atelier Acrilex 100g',
  'Catálogo seed LibreríaSys | Arte y manualidades',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_plastilina.svg',
  'unidad',
  0,
  'LIB00000120',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  600,
  false,
  false,
  true,
  600
FROM categoria c
WHERE c.nombre = 'Arte y manualidades'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  11310,
  0,
  17400,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  11310::numeric,
  11310::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000120'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Tinta China Acrilex 20ml Negro',
  'Catálogo seed LibreríaSys | Arte y manualidades',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_pintura.svg',
  'unidad',
  0,
  'LIB00000121',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  605,
  false,
  false,
  true,
  605
FROM categoria c
WHERE c.nombre = 'Arte y manualidades'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  4030,
  0,
  6200,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  4030::numeric,
  4030::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000121'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Acuarela H-Tone x12 Colores',
  'Catálogo seed LibreríaSys | Arte y manualidades',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_pintura.svg',
  'unidad',
  0,
  'LIB00000122',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  610,
  false,
  false,
  true,
  610
FROM categoria c
WHERE c.nombre = 'Arte y manualidades'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  7930,
  0,
  12200,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  7930::numeric,
  7930::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000122'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Set Purpurina x6 Colores H-Tone',
  'Catálogo seed LibreríaSys | Arte y manualidades',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_pintura.svg',
  'unidad',
  0,
  'LIB00000123',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  615,
  false,
  false,
  true,
  615
FROM categoria c
WHERE c.nombre = 'Arte y manualidades'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  5493,
  0,
  8450,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  5493::numeric,
  5493::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000123'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Pincel Chato N°2 Alamo',
  'Catálogo seed LibreríaSys | Arte y manualidades',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_pincel.svg',
  'unidad',
  0,
  'LIB00000124',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  620,
  false,
  false,
  true,
  620
FROM categoria c
WHERE c.nombre = 'Arte y manualidades'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  1203,
  0,
  1850,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  1203::numeric,
  1203::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000124'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Pincel Chato N°6 Alamo',
  'Catálogo seed LibreríaSys | Arte y manualidades',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_pincel.svg',
  'unidad',
  0,
  'LIB00000125',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  625,
  false,
  false,
  true,
  625
FROM categoria c
WHERE c.nombre = 'Arte y manualidades'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  1333,
  0,
  2050,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  1333::numeric,
  1333::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000125'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Pincel Chato N°10 Alamo',
  'Catálogo seed LibreríaSys | Arte y manualidades',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_pincel.svg',
  'unidad',
  0,
  'LIB00000126',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  630,
  false,
  false,
  true,
  630
FROM categoria c
WHERE c.nombre = 'Arte y manualidades'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  1690,
  0,
  2600,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  1690::numeric,
  1690::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000126'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Pincel Chato N°14 Alamo',
  'Catálogo seed LibreríaSys | Arte y manualidades',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_pincel.svg',
  'unidad',
  0,
  'LIB00000127',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  635,
  false,
  false,
  true,
  635
FROM categoria c
WHERE c.nombre = 'Arte y manualidades'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  2210,
  0,
  3400,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  2210::numeric,
  2210::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000127'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Cartulina T/A4 Oscuro x10 Alamo',
  'Catálogo seed LibreríaSys | Arte y manualidades',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_cartulina.svg',
  'unidad',
  0,
  'LIB00000128',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  640,
  false,
  false,
  true,
  640
FROM categoria c
WHERE c.nombre = 'Arte y manualidades'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  3185,
  0,
  4900,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  3185::numeric,
  3185::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000128'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Cartulina Alamo Verde Oscuro 63x43',
  'Catálogo seed LibreríaSys | Arte y manualidades',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_cartulina.svg',
  'unidad',
  0,
  'LIB00000129',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  645,
  false,
  false,
  true,
  645
FROM categoria c
WHERE c.nombre = 'Arte y manualidades'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  878,
  0,
  1350,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  878::numeric,
  878::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000129'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Papel Glacé Alamo Metalizado x10H',
  'Catálogo seed LibreríaSys | Arte y manualidades',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_cartulina.svg',
  'unidad',
  0,
  'LIB00000130',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  650,
  false,
  false,
  true,
  650
FROM categoria c
WHERE c.nombre = 'Arte y manualidades'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  2243,
  0,
  3450,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  2243::numeric,
  2243::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000130'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Goma Eva 40x50cm Violeta Alamo',
  'Catálogo seed LibreríaSys | Arte y manualidades',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_cartulina.svg',
  'unidad',
  0,
  'LIB00000131',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  655,
  false,
  false,
  true,
  655
FROM categoria c
WHERE c.nombre = 'Arte y manualidades'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  1268,
  0,
  1950,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  1268::numeric,
  1268::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000131'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Papel Obra 1ra Cosmos A4 x50',
  'Catálogo seed LibreríaSys | Arte y manualidades',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_papel.svg',
  'unidad',
  0,
  'LIB00000132',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  660,
  false,
  false,
  true,
  660
FROM categoria c
WHERE c.nombre = 'Arte y manualidades'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  3510,
  0,
  5400,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  3510::numeric,
  3510::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000132'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Artist Board Pizarra Transp. Maped',
  'Catálogo seed LibreríaSys | Arte y manualidades',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_cartulina.svg',
  'unidad',
  0,
  'LIB00000133',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  665,
  false,
  false,
  true,
  665
FROM categoria c
WHERE c.nombre = 'Arte y manualidades'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  93925,
  0,
  144500,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  93925::numeric,
  93925::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000133'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Goma Arábiga Transparente 30g H-Tone',
  'Catálogo seed LibreríaSys | Arte y manualidades',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_generico.svg',
  'unidad',
  0,
  'LIB00000134',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  670,
  false,
  false,
  true,
  670
FROM categoria c
WHERE c.nombre = 'Arte y manualidades'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  1105,
  0,
  1700,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  1105::numeric,
  1105::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000134'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Silicona Gruesa barra Rendicolla 160g',
  'Catálogo seed LibreríaSys | Arte y manualidades',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_plastilina.svg',
  'unidad',
  0,
  'LIB00000135',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  675,
  false,
  false,
  true,
  675
FROM categoria c
WHERE c.nombre = 'Arte y manualidades'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  17908,
  0,
  27550,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  17908::numeric,
  17908::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000135'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Pinche p/Mapa x50 H-Tone',
  'Catálogo seed LibreríaSys | Arte y manualidades',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_generico.svg',
  'unidad',
  0,
  'LIB00000136',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  680,
  false,
  false,
  true,
  680
FROM categoria c
WHERE c.nombre = 'Arte y manualidades'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  2373,
  0,
  3650,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  2373::numeric,
  2373::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000136'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Papel de Regalo 60cm Bobina Gessele',
  'Catálogo seed LibreríaSys | Organización y otros',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_varios.svg',
  'unidad',
  0,
  'LIB00000137',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  685,
  false,
  false,
  true,
  685
FROM categoria c
WHERE c.nombre = 'Organización y otros'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  216125,
  0,
  332500,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  216125::numeric,
  216125::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000137'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Papel de Regalo 40cm Bobina Gessele',
  'Catálogo seed LibreríaSys | Organización y otros',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_varios.svg',
  'unidad',
  0,
  'LIB00000138',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  690,
  false,
  false,
  true,
  690
FROM categoria c
WHERE c.nombre = 'Organización y otros'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  162338,
  0,
  249750,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  162338::numeric,
  162338::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000138'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Caja Organizadora Xplast 29Lts c/Rueda',
  'Catálogo seed LibreríaSys | Organización y otros',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_varios.svg',
  'unidad',
  0,
  'LIB00000139',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  695,
  false,
  false,
  true,
  695
FROM categoria c
WHERE c.nombre = 'Organización y otros'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  28308,
  0,
  43550,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  28308::numeric,
  28308::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000139'
LIMIT 1;


INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  'Calculadora Escritorio 12D Celeste H-Tone',
  'Catálogo seed LibreríaSys | Organización y otros',
  10,
  80,
  c.id,
  '/recursos/img/catalog/prod_varios.svg',
  'unidad',
  0,
  'LIB00000140',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  700,
  false,
  false,
  true,
  700
FROM categoria c
WHERE c.nombre = 'Organización y otros'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  24993,
  0,
  38450,
  NULL,
  NULL,
  true,
  NOW(),
  1,
  24993::numeric,
  24993::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = 'LIB00000140'
LIMIT 1;


-- Compra de ingreso (número fijo 910001) — ajustá tipo_operacion_id si tu catálogo difiere
INSERT INTO compra (
  empresa_id, fecha, proveedor_id, comprador_id, condicion_pago_id, moneda_id,
  estado, total, movimiento, tipo_operacion_id, numero_compra, usuario_id, fecha_emision
)
SELECT
  e.id,
  CURRENT_DATE,
  pr.id,
  co.id,
  cp.id,
  1,
  'EFECTIVADO',
  0,
  'COMPRA',
  COALESCE(
    (SELECT t.id FROM tipo_operacion t WHERE t.activo = true ORDER BY t.id LIMIT 1),
    (SELECT MIN(t2.id) FROM tipo_operacion t2)
  ),
  910001,
  u.id,
  CURRENT_TIMESTAMP
FROM (SELECT id FROM empresa ORDER BY id LIMIT 1) e
JOIN proveedor pr ON pr.ruc = '800LIB01-1'
JOIN comprador co ON co.nombre = 'Comprador LibreríaSys Demo'
JOIN (SELECT id FROM condicion_pago ORDER BY id LIMIT 1) cp ON true
JOIN (SELECT MIN(id) AS id FROM usuario) u ON true;



-- Detalle de compra: 10 unidades por ítem al costo seed (actualiza total compra)
INSERT INTO compra_detalle (
  compra_id, producto_id, cantidad, costo, total, lote, fecha_vencimiento,
  costo_original, moneda_id, costo_moneda_origen, costo_gs, costo_brl, costo_usd, cotizacion_id
)
SELECT
  c.id,
  p.id,
  10,
  ROUND(COALESCE(pp.precio_compra, 0)::numeric, 2),
  ROUND((10 * COALESCE(pp.precio_compra, 0))::numeric, 2),
  NULL,
  NULL,
  ROUND(COALESCE(pp.precio_compra, 0)::numeric, 2),
  1,
  ROUND(COALESCE(pp.precio_compra, 0)::numeric, 2),
  ROUND(COALESCE(pp.precio_compra, 0)::numeric, 2),
  NULL,
  NULL,
  NULL
FROM compra c
JOIN producto p ON p.codigo_barra LIKE 'LIB%'
JOIN producto_precio pp ON pp.producto_id = p.id AND pp.activo = true
WHERE c.numero_compra = 910001 AND c.movimiento = 'COMPRA';

UPDATE compra c
SET total = COALESCE((
  SELECT SUM(cd.total) FROM compra_detalle cd WHERE cd.compra_id = c.id
), 0)
WHERE c.numero_compra = 910001 AND c.movimiento = 'COMPRA';

-- Stock final: lo cargado + lo “comprado” (10 c/u). Ajustá si tu lógica de stock es distinta.
UPDATE producto p
SET stock = p.stock + 10
WHERE p.codigo_barra LIKE 'LIB%';

COMMIT;

-- Verificación rápida
-- SELECT COUNT(*) FROM producto WHERE codigo_barra LIKE 'LIB%';
