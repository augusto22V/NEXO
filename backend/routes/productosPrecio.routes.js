const express = require("express");
const router = express.Router();
const pool = require("../db");
const {
  MONEDA_IDS,
  buildPrecioMonedaPayload,
  ensureMonedaSchema,
  getCotizacionActiva,
  resolveMonedaId,
  toNumber
} = require("../services/moneda.schema.service");

function normalizePositiveNumber(value, fallback = 0) {
  const number = toNumber(value, fallback);
  return number >= 0 ? number : fallback;
}

function normalizeOptionalPositive(value) {
  const number = toNumber(value, NaN);
  if (!Number.isFinite(number) || number <= 0) return null;
  return number;
}

let valorCantidadSchemaPromise = null;

async function ensureValorCantidadSchema() {
  if (valorCantidadSchemaPromise) return valorCantidadSchemaPromise;

  valorCantidadSchemaPromise = (async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS producto_precio_cantidad (
        id BIGSERIAL PRIMARY KEY,
        producto_id INTEGER NOT NULL REFERENCES producto(id) ON DELETE CASCADE,
        orden SMALLINT NOT NULL CHECK (orden BETWEEN 1 AND 4),
        cantidad NUMERIC(18,6),
        porcentaje_valor NUMERIC(9,4),
        valor NUMERIC(18,6),
        actualizado_en TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
        UNIQUE (producto_id, orden)
      )
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_producto_precio_cantidad_producto
      ON producto_precio_cantidad(producto_id)
    `);
  })();

  try {
    await valorCantidadSchemaPromise;
  } catch (error) {
    valorCantidadSchemaPromise = null;
    throw error;
  }
}

function normalizeValorCantidadNumber(value) {
  const number = toNumber(value, NaN);
  if (!Number.isFinite(number) || number <= 0) return null;
  return number;
}

function shapeValorCantidadRows(rows = []) {
  const byOrder = new Map();
  rows.forEach((row) => {
    const order = Number(row?.orden || 0);
    if (order < 1 || order > 4) return;
    byOrder.set(order, {
      orden: order,
      cantidad: row?.cantidad == null ? null : Number(row.cantidad),
      porcentaje_valor: row?.porcentaje_valor == null ? null : Number(row.porcentaje_valor),
      valor: row?.valor == null ? null : Number(row.valor)
    });
  });

  const result = [];
  for (let order = 1; order <= 4; order += 1) {
    if (byOrder.has(order)) {
      result.push(byOrder.get(order));
      continue;
    }
    result.push({
      orden: order,
      cantidad: null,
      porcentaje_valor: null,
      valor: null
    });
  }
  return result;
}

/* ================= OBTENER PRECIO ACTIVO ================= */
router.get("/producto/:productoId", async (req, res) => {
  try {
    await ensureMonedaSchema();

    const productoId = Number(req.params.productoId || 0);
    if (!productoId) {
      return res.status(400).json({ error: "producto_id invalido" });
    }

    const result = await pool.query(
      `
        SELECT *
        FROM producto_precio
        WHERE producto_id = $1
          AND activo = true
        ORDER BY fecha DESC
        LIMIT 1
      `,
      [productoId]
    );

    const row = result.rows[0] || null;
    if (!row) {
      res.json(null);
      return;
    }

    const precioCompraMonedaId = resolveMonedaId(row.precio_compra_moneda_id, MONEDA_IDS.PYG);
    res.json({
      ...row,
      precio_compra_moneda_id: precioCompraMonedaId,
      precio_compra_origen: row.precio_compra_origen ?? row.precio_compra ?? 0,
      precio_compra_gs: row.precio_compra_gs ?? row.precio_compra ?? 0,
      precio_compra_brl: row.precio_compra_brl ?? null,
      precio_compra_usd: row.precio_compra_usd ?? null
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/* ================= CREAR / CAMBIAR PRECIO ================= */
router.post("/", async (req, res) => {
  const client = await pool.connect();
  let inTransaction = false;
  try {
    await ensureMonedaSchema();

    const {
      producto_id,
      precio_compra,
      precio_compra_origen,
      precio_compra_moneda_id,
      moneda_id,
      costo_transporte,
      precio_venta,
      precio_minimo,
      precio_promocional
    } = req.body || {};

    const productoId = Number(producto_id || 0);
    if (!productoId) {
      return res.status(400).json({ error: "producto_id invalido" });
    }

    const monedaId = resolveMonedaId(precio_compra_moneda_id || moneda_id, MONEDA_IDS.PYG);
    const compraOrigen = normalizePositiveNumber(
      precio_compra_origen ?? precio_compra,
      0
    );
    const precioVenta = normalizePositiveNumber(precio_venta, 0);

    if (!Number.isFinite(precioVenta) || precioVenta <= 0) {
      return res.status(400).json({ error: "precio_venta invalido" });
    }

    const cotizacion = await getCotizacionActiva(client);
    const conversion = buildPrecioMonedaPayload({
      monto: compraOrigen,
      monedaId,
      cotizacion
    });

    // Compatibilidad: la columna historica precio_compra se mantiene en Gs.
    const precioCompraGsCompat = conversion.monto_gs != null
      ? conversion.monto_gs
      : conversion.monto_origen;

    await client.query("BEGIN");
    inTransaction = true;

    await client.query(
      `
        UPDATE producto_precio
        SET activo = false
        WHERE producto_id = $1
      `,
      [productoId]
    );

    const result = await client.query(
      `
        INSERT INTO producto_precio
          (
            producto_id,
            precio_compra,
            costo_transporte,
            precio_venta,
            precio_minimo,
            precio_promocional,
            activo,
            fecha,
            precio_compra_moneda_id,
            precio_compra_origen,
            precio_compra_gs,
            precio_compra_brl,
            precio_compra_usd,
            cotizacion_id,
            cotizacion_brl,
            cotizacion_usd
          )
        VALUES ($1,$2,$3,$4,$5,$6,true,NOW(),$7,$8,$9,$10,$11,$12,$13,$14)
        RETURNING *
      `,
      [
        productoId,
        precioCompraGsCompat,
        normalizePositiveNumber(costo_transporte, 0),
        precioVenta,
        normalizeOptionalPositive(precio_minimo),
        normalizeOptionalPositive(precio_promocional),
        conversion.moneda_id,
        conversion.monto_origen,
        conversion.monto_gs,
        conversion.monto_brl,
        conversion.monto_usd,
        conversion.cotizacion_id,
        conversion.cotizacion_brl,
        conversion.cotizacion_usd
      ]
    );

    await client.query("COMMIT");
    inTransaction = false;
    res.json(result.rows[0]);
  } catch (error) {
    if (inTransaction) {
      await client.query("ROLLBACK");
    }
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

router.get("/producto/:productoId/valor-cantidad", async (req, res) => {
  try {
    await ensureMonedaSchema();
    await ensureValorCantidadSchema();

    const productoId = Number(req.params.productoId || 0);
    if (!productoId) {
      return res.status(400).json({ error: "producto_id invalido" });
    }

    const result = await pool.query(
      `
        SELECT orden, cantidad, porcentaje_valor, valor
        FROM producto_precio_cantidad
        WHERE producto_id = $1
        ORDER BY orden ASC
      `,
      [productoId]
    );

    res.json({
      producto_id: productoId,
      rows: shapeValorCantidadRows(result.rows || [])
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put("/producto/:productoId/valor-cantidad", async (req, res) => {
  const client = await pool.connect();
  let inTransaction = false;
  try {
    await ensureMonedaSchema();
    await ensureValorCantidadSchema();

    const productoId = Number(req.params.productoId || 0);
    if (!productoId) {
      return res.status(400).json({ error: "producto_id invalido" });
    }

    const payloadRows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    const byOrder = new Map();

    payloadRows.forEach((row) => {
      const order = Number(row?.orden || 0);
      if (order < 1 || order > 4) return;
      byOrder.set(order, {
        cantidad: normalizeValorCantidadNumber(row?.cantidad),
        porcentaje_valor: normalizeValorCantidadNumber(row?.porcentaje_valor),
        valor: normalizeValorCantidadNumber(row?.valor)
      });
    });

    await client.query("BEGIN");
    inTransaction = true;

    for (let order = 1; order <= 4; order += 1) {
      const row = byOrder.get(order) || {
        cantidad: null,
        porcentaje_valor: null,
        valor: null
      };

      const hasData = row.cantidad != null || row.porcentaje_valor != null || row.valor != null;
      if (!hasData) {
        await client.query(
          `
            DELETE FROM producto_precio_cantidad
            WHERE producto_id = $1
              AND orden = $2
          `,
          [productoId, order]
        );
        continue;
      }

      await client.query(
        `
          INSERT INTO producto_precio_cantidad
            (producto_id, orden, cantidad, porcentaje_valor, valor, actualizado_en)
          VALUES ($1, $2, $3, $4, $5, NOW())
          ON CONFLICT (producto_id, orden)
          DO UPDATE SET
            cantidad = EXCLUDED.cantidad,
            porcentaje_valor = EXCLUDED.porcentaje_valor,
            valor = EXCLUDED.valor,
            actualizado_en = NOW()
        `,
        [productoId, order, row.cantidad, row.porcentaje_valor, row.valor]
      );
    }

    const finalResult = await client.query(
      `
        SELECT orden, cantidad, porcentaje_valor, valor
        FROM producto_precio_cantidad
        WHERE producto_id = $1
        ORDER BY orden ASC
      `,
      [productoId]
    );

    await client.query("COMMIT");
    inTransaction = false;

    res.json({
      ok: true,
      producto_id: productoId,
      rows: shapeValorCantidadRows(finalResult.rows || [])
    });
  } catch (error) {
    if (inTransaction) {
      await client.query("ROLLBACK");
    }
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

module.exports = router;
