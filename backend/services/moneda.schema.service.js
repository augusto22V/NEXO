const db = require("../db");

const MONEDA_IDS = Object.freeze({
  PYG: 1,
  BRL: 2,
  USD: 3
});

const MONEDA_BASE_ROWS = Object.freeze([
  { id: MONEDA_IDS.PYG, code: "PYG", nombre: "Guaraní", simbolo: "₲" },
  { id: MONEDA_IDS.BRL, code: "BRL", nombre: "Real", simbolo: "R$" },
  { id: MONEDA_IDS.USD, code: "USD", nombre: "Dólar", simbolo: "$" }
]);

let schemaPromise = null;

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function roundAmount(value, decimals = 6) {
  const factor = 10 ** decimals;
  return Math.round((toNumber(value, 0) + Number.EPSILON) * factor) / factor;
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
}

function normalizeMonedaCode(value) {
  const txt = normalizeText(value);

  if (["PYG", "GUARANI", "GS", "GUA", "GUARANIES"].includes(txt)) return "PYG";
  if (["BRL", "REAL", "REALES", "REAIS", "R$"].includes(txt)) return "BRL";
  if (["USD", "DOLAR", "DOLARES", "US$"].includes(txt)) return "USD";

  return null;
}

function resolveMonedaCodeById(monedaId) {
  const id = toNumber(monedaId, 0);
  if (id === MONEDA_IDS.PYG) return "PYG";
  if (id === MONEDA_IDS.BRL) return "BRL";
  if (id === MONEDA_IDS.USD) return "USD";
  return null;
}

function resolveMonedaId(monedaId, fallback = MONEDA_IDS.PYG) {
  const id = toNumber(monedaId, 0);
  if (id === MONEDA_IDS.PYG || id === MONEDA_IDS.BRL || id === MONEDA_IDS.USD) return id;
  return fallback;
}

function inferMonedaCodeFromRow(row) {
  const byName = normalizeMonedaCode(row?.nombre);
  if (byName) return byName;

  const bySymbol = normalizeMonedaCode(row?.simbolo);
  if (bySymbol) return bySymbol;

  const byId = resolveMonedaCodeById(row?.id);
  if (byId) return byId;

  return null;
}

async function ensureMonedaBaseRows(client) {
  const currentRows = await client.query(
    `
      SELECT id, nombre, simbolo
      FROM moneda
      WHERE id IN ($1, $2, $3)
      ORDER BY id
      FOR UPDATE
    `,
    [MONEDA_IDS.PYG, MONEDA_IDS.BRL, MONEDA_IDS.USD]
  );

  const currentById = new Map(currentRows.rows.map((row) => [Number(row.id), row]));
  const code2 = inferMonedaCodeFromRow(currentById.get(MONEDA_IDS.BRL));
  const code3 = inferMonedaCodeFromRow(currentById.get(MONEDA_IDS.USD));

  // Compatibilidad: si historicamente id=2 era Dolar e id=3 era Real, invertimos referencias.
  if (code2 === "USD" && code3 === "BRL") {
    await client.query(`
      UPDATE compra
      SET moneda_id = CASE
        WHEN moneda_id = 2 THEN 3
        WHEN moneda_id = 3 THEN 2
        ELSE moneda_id
      END
      WHERE moneda_id IN (2, 3)
    `);
  }

  for (const row of MONEDA_BASE_ROWS) {
    await client.query(
      `
        INSERT INTO moneda (id, nombre, simbolo)
        VALUES ($1, $2, $3)
        ON CONFLICT (id) DO UPDATE
        SET nombre = EXCLUDED.nombre,
            simbolo = EXCLUDED.simbolo
      `,
      [row.id, row.nombre, row.simbolo]
    );
  }

  await client.query(`
    SELECT setval(
      pg_get_serial_sequence('moneda', 'id'),
      GREATEST((SELECT COALESCE(MAX(id), 1) FROM moneda), 1),
      true
    )
  `);
}

async function ensureCompraDetalleMonedaColumns(client) {
  await client.query(`
    ALTER TABLE compra_detalle
    ADD COLUMN IF NOT EXISTS moneda_id INTEGER,
    ADD COLUMN IF NOT EXISTS costo_moneda_origen NUMERIC(18,6),
    ADD COLUMN IF NOT EXISTS costo_gs NUMERIC(18,6),
    ADD COLUMN IF NOT EXISTS costo_brl NUMERIC(18,6),
    ADD COLUMN IF NOT EXISTS costo_usd NUMERIC(18,6),
    ADD COLUMN IF NOT EXISTS cotizacion_id INTEGER
  `);

  await client.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_compra_detalle_moneda'
      ) THEN
        ALTER TABLE compra_detalle
        ADD CONSTRAINT fk_compra_detalle_moneda
        FOREIGN KEY (moneda_id) REFERENCES moneda(id);
      END IF;

      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_compra_detalle_cotizacion'
      ) THEN
        ALTER TABLE compra_detalle
        ADD CONSTRAINT fk_compra_detalle_cotizacion
        FOREIGN KEY (cotizacion_id) REFERENCES cotizacion(id);
      END IF;
    END $$;
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_compra_detalle_moneda
    ON compra_detalle(moneda_id)
  `);

  await client.query(`
    UPDATE compra_detalle cd
    SET moneda_id = c.moneda_id
    FROM compra c
    WHERE c.id = cd.compra_id
      AND cd.moneda_id IS NULL
  `);

  await client.query(`
    UPDATE compra_detalle
    SET
      costo_moneda_origen = COALESCE(costo_moneda_origen, costo),
      costo_gs = COALESCE(costo_gs, CASE WHEN moneda_id = 1 THEN costo ELSE NULL END),
      costo_brl = COALESCE(costo_brl, CASE WHEN moneda_id = 2 THEN COALESCE(costo_moneda_origen, costo) ELSE NULL END),
      costo_usd = COALESCE(costo_usd, CASE WHEN moneda_id = 3 THEN COALESCE(costo_moneda_origen, costo) ELSE NULL END)
  `);
}

async function ensureProductoPrecioMonedaColumns(client) {
  await client.query(`
    ALTER TABLE producto_precio
    ADD COLUMN IF NOT EXISTS precio_compra_moneda_id INTEGER,
    ADD COLUMN IF NOT EXISTS precio_compra_origen NUMERIC(18,6),
    ADD COLUMN IF NOT EXISTS precio_compra_gs NUMERIC(18,6),
    ADD COLUMN IF NOT EXISTS precio_compra_brl NUMERIC(18,6),
    ADD COLUMN IF NOT EXISTS precio_compra_usd NUMERIC(18,6),
    ADD COLUMN IF NOT EXISTS cotizacion_id INTEGER,
    ADD COLUMN IF NOT EXISTS cotizacion_brl NUMERIC(18,6),
    ADD COLUMN IF NOT EXISTS cotizacion_usd NUMERIC(18,6)
  `);

  await client.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_producto_precio_moneda'
      ) THEN
        ALTER TABLE producto_precio
        ADD CONSTRAINT fk_producto_precio_moneda
        FOREIGN KEY (precio_compra_moneda_id) REFERENCES moneda(id);
      END IF;

      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_producto_precio_cotizacion'
      ) THEN
        ALTER TABLE producto_precio
        ADD CONSTRAINT fk_producto_precio_cotizacion
        FOREIGN KEY (cotizacion_id) REFERENCES cotizacion(id);
      END IF;
    END $$;
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_producto_precio_moneda
    ON producto_precio(precio_compra_moneda_id)
  `);

  await client.query(`
    UPDATE producto_precio
    SET
      precio_compra_moneda_id = COALESCE(precio_compra_moneda_id, 1),
      precio_compra_origen = COALESCE(precio_compra_origen, precio_compra),
      precio_compra_gs = COALESCE(precio_compra_gs, precio_compra),
      precio_compra_brl = COALESCE(
        precio_compra_brl,
        CASE WHEN COALESCE(precio_compra_moneda_id, 1) = 2 THEN COALESCE(precio_compra_origen, precio_compra) ELSE NULL END
      ),
      precio_compra_usd = COALESCE(
        precio_compra_usd,
        CASE WHEN COALESCE(precio_compra_moneda_id, 1) = 3 THEN COALESCE(precio_compra_origen, precio_compra) ELSE NULL END
      )
  `);
}

async function ensureVentaDetalleMonedaColumns(client) {
  await client.query(`
    ALTER TABLE venta_detalle
    ADD COLUMN IF NOT EXISTS precio_moneda_id INTEGER,
    ADD COLUMN IF NOT EXISTS precio_moneda_origen NUMERIC(18,6),
    ADD COLUMN IF NOT EXISTS precio_gs NUMERIC(18,6),
    ADD COLUMN IF NOT EXISTS precio_brl NUMERIC(18,6),
    ADD COLUMN IF NOT EXISTS precio_usd NUMERIC(18,6),
    ADD COLUMN IF NOT EXISTS cotizacion_id INTEGER,
    ADD COLUMN IF NOT EXISTS cotizacion_brl NUMERIC(18,6),
    ADD COLUMN IF NOT EXISTS cotizacion_usd NUMERIC(18,6)
  `);

  await client.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_venta_detalle_moneda'
      ) THEN
        ALTER TABLE venta_detalle
        ADD CONSTRAINT fk_venta_detalle_moneda
        FOREIGN KEY (precio_moneda_id) REFERENCES moneda(id);
      END IF;

      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_venta_detalle_cotizacion'
      ) THEN
        ALTER TABLE venta_detalle
        ADD CONSTRAINT fk_venta_detalle_cotizacion
        FOREIGN KEY (cotizacion_id) REFERENCES cotizacion(id);
      END IF;
    END $$;
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_venta_detalle_moneda
    ON venta_detalle(precio_moneda_id)
  `);

  await client.query(`
    UPDATE venta_detalle
    SET
      precio_moneda_id = COALESCE(precio_moneda_id, 1),
      precio_moneda_origen = COALESCE(precio_moneda_origen, precio),
      precio_gs = COALESCE(precio_gs, precio),
      precio_brl = COALESCE(
        precio_brl,
        CASE WHEN COALESCE(precio_moneda_id, 1) = 2 THEN COALESCE(precio_moneda_origen, precio) ELSE NULL END
      ),
      precio_usd = COALESCE(
        precio_usd,
        CASE WHEN COALESCE(precio_moneda_id, 1) = 3 THEN COALESCE(precio_moneda_origen, precio) ELSE NULL END
      )
  `);
}

async function ensureMonedaSchema() {
  if (schemaPromise) return schemaPromise;

  schemaPromise = (async () => {
    const client = await db.connect();

    try {
      await client.query("BEGIN");
      await ensureMonedaBaseRows(client);
      await ensureCompraDetalleMonedaColumns(client);
      await ensureProductoPrecioMonedaColumns(client);
      await ensureVentaDetalleMonedaColumns(client);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  })();

  try {
    await schemaPromise;
  } catch (error) {
    schemaPromise = null;
    throw error;
  }
}

async function getCotizacionActiva(client = db) {
  const result = await client.query(`
    SELECT id, moneda, valor_indice
    FROM cotizacion
    WHERE activa = true
    ORDER BY id DESC
  `);

  const snapshot = {
    id: null,
    brl: 0,
    usd: 0
  };

  for (const row of result.rows) {
    const code = normalizeMonedaCode(row.moneda);
    if (code === "BRL" && snapshot.brl <= 0) snapshot.brl = toNumber(row.valor_indice, 0);
    if (code === "USD" && snapshot.usd <= 0) snapshot.usd = toNumber(row.valor_indice, 0);
    if (!snapshot.id) snapshot.id = toNumber(row.id, 0) || null;
  }

  return snapshot;
}

function convertMonedaAmount({ monto, monedaId, cotizacion }) {
  const value = roundAmount(monto, 6);
  const id = resolveMonedaId(monedaId, MONEDA_IDS.PYG);
  const brlRate = toNumber(cotizacion?.brl, 0);
  const usdRate = toNumber(cotizacion?.usd, 0);

  let gs = null;
  if (id === MONEDA_IDS.PYG) gs = value;
  if (id === MONEDA_IDS.BRL) gs = brlRate > 0 ? value * brlRate : null;
  if (id === MONEDA_IDS.USD) gs = usdRate > 0 ? value * usdRate : null;

  const gsSafe = gs == null ? null : roundAmount(gs, 6);
  const brl = gsSafe == null
    ? (id === MONEDA_IDS.BRL ? value : null)
    : (brlRate > 0 ? roundAmount(gsSafe / brlRate, 6) : null);
  const usd = gsSafe == null
    ? (id === MONEDA_IDS.USD ? value : null)
    : (usdRate > 0 ? roundAmount(gsSafe / usdRate, 6) : null);

  return {
    moneda_id: id,
    monto_origen: value,
    gs: gsSafe,
    brl,
    usd
  };
}

function buildPrecioMonedaPayload({ monto, monedaId, cotizacion }) {
  const conversion = convertMonedaAmount({
    monto,
    monedaId,
    cotizacion
  });

  return {
    moneda_id: conversion.moneda_id,
    monto_origen: conversion.monto_origen,
    monto_gs: conversion.gs,
    monto_brl: conversion.brl,
    monto_usd: conversion.usd,
    cotizacion_id: toNumber(cotizacion?.id, 0) || null,
    cotizacion_brl: toNumber(cotizacion?.brl, 0) || null,
    cotizacion_usd: toNumber(cotizacion?.usd, 0) || null
  };
}

module.exports = {
  MONEDA_IDS,
  buildPrecioMonedaPayload,
  convertMonedaAmount,
  ensureMonedaSchema,
  getCotizacionActiva,
  resolveMonedaCodeById,
  resolveMonedaId,
  roundAmount,
  toNumber
};
