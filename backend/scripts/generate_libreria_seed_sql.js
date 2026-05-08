/**
 * Genera backend/sql/libreria_sys_datos_prueba.sql desde sql/seeds/libreria_catalog.tsv
 * Uso: node scripts/generate_libreria_seed_sql.js
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const TSV = path.join(ROOT, "sql", "seeds", "libreria_catalog.tsv");
const OUT = path.join(ROOT, "sql", "libreria_sys_datos_prueba.sql");

/** Tabla compra_detalle: en dumps viejos puede no existir; el seed la crea si falta. */
const ENSURE_COMPRA_DETALLE = `
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

`;

/** Tabla proveedor: bases sin esta tabla fallan en DELETE/INSERT del seed. */
const ENSURE_PROVEEDOR = `
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

`;

/** Tabla comprador: compras referencian comprador_id. */
const ENSURE_COMPRADOR = `
-- ---------------------------------------------------------------------------
-- Si tu base no tiene comprador (error 42P01 en DELETE/INSERT de este seed).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS comprador (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(200) NOT NULL,
  activo BOOLEAN NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_comprador_activo ON comprador(activo);

`;

const CAT_MAP = {
  U: "Útiles escolares",
  O: "Papelería de oficina",
  A: "Arte y manualidades",
  G: "Organización y otros"
};

const CATALOG_IMG = "/recursos/img/catalog";

const CAT_IMAGE = {
  "Útiles escolares": `${CATALOG_IMG}/cat_utiles.svg`,
  "Papelería de oficina": `${CATALOG_IMG}/cat_oficina.svg`,
  "Arte y manualidades": `${CATALOG_IMG}/cat_arte.svg`,
  "Organización y otros": `${CATALOG_IMG}/cat_org.svg`
};

/**
 * Placeholders SVG por palabras clave (orden = primera coincidencia gana).
 */
const PRODUCT_IMAGE_RULES = [
  [/diccionario/i, "prod_libro.svg"],
  [/set\s+maped\s+color|\d+\s+col\.?\s|col\.\s*h-tone|acuarelado|maped\s+color|\bpeps\b/i, "prod_lapices_color.svg"],
  [/l[aá]piz/i, "prod_lapiz.svg"],
  [/bol[ií]grafo|schneider|roller\s+paint/i, "prod_boligrafo.svg"],
  [/portamina|\bmina\s+mospas/i, "prod_portamina.svg"],
  [/borrador/i, "prod_borrador.svg"],
  [/tijera/i, "prod_tijera.svg"],
  [/cutter/i, "prod_cutter.svg"],
  [/regla|escuadra|transportador|comp[aá]s|geometr[ií]a/i, "prod_geometria.svg"],
  [/cartuchera|estuche\s+escolar/i, "prod_cartuchera.svg"],
  [/marcador/i, "prod_marcador.svg"],
  [/cuad\.|univ\.|libretita/i, "prod_cuaderno.svg"],
  [/resma|folio\s+a4|contac|papel\s+obra/i, "prod_papel.svg"],
  [/carpeta|bibliorato/i, "prod_carpeta.svg"],
  [/tempera|acuarela|tinta\s+china|purpurina/i, "prod_pintura.svg"],
  [/plastilina/i, "prod_plastilina.svg"],
  [/pincel/i, "prod_pincel.svg"],
  [/cartulina|glac[eé]|goma\s+eva|artist\s+board/i, "prod_cartulina.svg"],
  [/pegamento|multicolage|super\s+pegamento|silicona|goma\s+arabiga/i, "prod_plastilina.svg"],
  [
    /cinta|corrector|clips|presilladora|plasticola|pegamento\s+en\s+barra|tiza|se[nñ]alador|banderita|nota\s+adhesiva|sobre|pizarra|fluo/i,
    "prod_oficina.svg"
  ],
  [/papel\s+de\s+regalo|caja\s+organizadora|calculadora/i, "prod_varios.svg"]
];

function imageForProduct(nombre) {
  const n = String(nombre || "");
  for (const [re, file] of PRODUCT_IMAGE_RULES) {
    if (re.test(n)) return `${CATALOG_IMG}/${file}`;
  }
  return `${CATALOG_IMG}/prod_generico.svg`;
}

function escSql(s) {
  return String(s || "").replace(/'/g, "''");
}

function parseTsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() && !l.startsWith("cat\t"));
  const rows = [];
  for (const line of lines) {
    const parts = line.split("\t");
    if (parts.length < 3) continue;
    const [cat, nombre, pvp] = parts;
    const pvpGs = parseInt(String(pvp).replace(/\D/g, ""), 10);
    if (!nombre || !Number.isFinite(pvpGs)) continue;
    rows.push({ cat: cat.trim(), nombre: nombre.trim(), pvpGs });
  }
  return rows;
}

function main() {
  const raw = fs.readFileSync(TSV, "utf8");
  const rows = parseTsv(raw);

  const catNames = [...new Set(rows.map((r) => CAT_MAP[r.cat] || r.cat))];

  const chunks = [];

  chunks.push(`-- =============================================================================
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

${ENSURE_COMPRA_DETALLE}
${ENSURE_PROVEEDOR}
${ENSURE_COMPRADOR}

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

DELETE FROM categoria WHERE nombre IN (${catNames.map((n) => `'${escSql(n)}'`).join(", ")});

DELETE FROM proveedor WHERE ruc = '800LIB01-1';
DELETE FROM comprador WHERE nombre = 'Comprador LibreríaSys Demo';

`);

  for (let i = 0; i < catNames.length; i += 1) {
    const nm = catNames[i];
    const catImg = CAT_IMAGE[nm] || `${CATALOG_IMG}/prod_generico.svg`;
    chunks.push(`
INSERT INTO categoria (nombre, imagen, orden_pantalla, activo, mostrar_venta_medio, mostrar_menu_digital, orden_venta_medio)
VALUES ('${escSql(nm)}', '${escSql(catImg)}', ${(i + 1) * 10}, true, true, true, ${(i + 1) * 10});
`);
  }

  chunks.push(`
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
`);

  let idx = 0;
  for (const r of rows) {
    idx += 1;
    const catLabel = CAT_MAP[r.cat] || r.cat;
    const bar = `LIB${String(100000000 + idx).slice(1)}`;
    const desc = `Catálogo seed LibreríaSys | ${catLabel}`;
    const pcompra = Math.max(0, Math.round(r.pvpGs * 0.65));
    const stock = 80;
    const prodImg = imageForProduct(r.nombre);

    chunks.push(`
INSERT INTO producto (
  nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
  unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
  efectivacion_directa, no_control_stock, permite_multi_sabor, max_sabores,
  facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio,
  es_insumo, es_servicio, activo, orden_pos
)
SELECT
  '${escSql(r.nombre)}',
  '${escSql(desc)}',
  10,
  ${stock},
  c.id,
  '${escSql(prodImg)}',
  'unidad',
  0,
  '${bar}',
  NULL,
  false,
  false,
  false,
  1,
  false,
  true,
  true,
  ${idx * 5},
  false,
  false,
  true,
  ${idx * 5}
FROM categoria c
WHERE c.nombre = '${escSql(catLabel)}'
LIMIT 1;

INSERT INTO producto_precio (
  producto_id, precio_compra, costo_transporte, precio_venta, precio_minimo, precio_promocional,
  activo, fecha, precio_compra_moneda_id, precio_compra_origen, precio_compra_gs, precio_compra_brl, precio_compra_usd,
  cotizacion_id, cotizacion_brl, cotizacion_usd
)
SELECT
  p.id,
  ${pcompra},
  0,
  ${r.pvpGs},
  NULL,
  NULL,
  true,
  NOW(),
  1,
  ${pcompra}::numeric,
  ${pcompra}::numeric,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL
FROM producto p
WHERE p.codigo_barra = '${bar}'
LIMIT 1;
`);
  }

  chunks.push(`
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

`);

  chunks.push(`
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
`);

  fs.writeFileSync(OUT, chunks.join("\n"), "utf8");
  console.log(`Escrito: ${OUT} (${rows.length} productos)`);
}

main();
