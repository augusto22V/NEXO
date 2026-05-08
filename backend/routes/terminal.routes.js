const express = require("express");
const router = express.Router();
const db = require("../db");
const { ensurePermisosSchema } = require("../services/permisos.service");
const {
  ensureTerminalConfigSchema,
  normalizeTipoPedidoDefaultId
} = require("../services/terminal_config.service");
const { POS_SIN_TIPO_PEDIDO } = require("../config/pos.mode");

const FEATURE_KEY_MOSTRAR_TIPO_PEDIDO = "mostrar_tipo_pedido";

function toBool(value, fallback = true) {
  if (value === true || value === false) return value;
  if (value == null) return fallback;

  const txt = String(value).trim().toLowerCase();
  if (["1", "true", "t", "si", "s", "yes", "y", "on"].includes(txt)) return true;
  if (["0", "false", "f", "no", "n", "off"].includes(txt)) return false;
  return fallback;
}

async function ensureTerminalSchemas() {
  try {
    await ensurePermisosSchema();
  } catch (error) {
    console.warn("Aviso: no se pudo preparar permisos para terminal:", error.message);
  }
  try {
    await ensureTerminalConfigSchema();
  } catch (error) {
    console.warn("Aviso: no se pudo preparar config extendida de terminal:", error.message);
  }
  await db.query(`
    ALTER TABLE terminal
      ADD COLUMN IF NOT EXISTS descripcion TEXT,
      ADD COLUMN IF NOT EXISTS tipo VARCHAR(30),
      ADD COLUMN IF NOT EXISTS activo BOOLEAN DEFAULT true,
      ADD COLUMN IF NOT EXISTS tipo_pedido_default_id INTEGER
  `);
  await db.query(`
    UPDATE terminal
    SET activo = true
    WHERE activo IS NULL
  `);
}

async function resolveTipoPedidoDefaultId(client, value) {
  const id = normalizeTipoPedidoDefaultId(value);
  if (!id) return null;

  const result = await client.query(
    `
      SELECT id_tipo_pedido
      FROM tipo_pedido
      WHERE id_tipo_pedido = $1
      LIMIT 1
    `,
    [id]
  );

  if (!result.rowCount) {
    throw new Error("Tipo de pedido por defecto invalido");
  }

  return Number(result.rows[0].id_tipo_pedido);
}

async function upsertMostrarTipoPedido(client, terminalId, enabled) {
  await client.query(
    `
      INSERT INTO terminal_feature_config (terminal_id, feature_key, enabled)
      VALUES ($1, $2, $3)
      ON CONFLICT (terminal_id, feature_key)
      DO UPDATE SET
        enabled = EXCLUDED.enabled,
        updated_at = NOW()
    `,
    [terminalId, FEATURE_KEY_MOSTRAR_TIPO_PEDIDO, Boolean(enabled)]
  );
}

async function safeUpsertMostrarTipoPedido(client, terminalId, enabled) {
  try {
    await upsertMostrarTipoPedido(client, terminalId, enabled);
  } catch (error) {
    console.warn("terminal_feature_config omitido:", error.message);
  }
}

/* =================================
   LISTAR TERMINALES POR EMPRESA
   GET /api/terminal/:empresa_id
================================= */

router.get("/:empresa_id", async (req, res) => {

  const empresa_id = req.params.empresa_id;

  try {
    await ensureTerminalSchemas();

    const r = await db.query(
      `SELECT
        t.id,
        t.empresa_id,
        e.nombre AS empresa_nombre,
        t.nombre,
        t.descripcion,
        t.tipo,
        t.activo,
        t.tipo_pedido_default_id,
        ${POS_SIN_TIPO_PEDIDO ? "false" : "true"} AS mostrar_tipo_pedido
       FROM terminal t
       JOIN empresa e ON e.id = t.empresa_id
       WHERE t.empresa_id = $1
       ORDER BY t.nombre`,
      [empresa_id]
    );

    res.json(r.rows);

  } catch (err) {

    console.error(err);
    res.status(500).json({ error: "Error al listar terminales" });

  }

});


/* =================================
   CREAR TERMINAL
   POST /api/terminal
================================= */

router.post("/", async (req, res) => {

  const { empresa_id, nombre, descripcion, tipo } = req.body;
  const activo = toBool(req.body?.activo, true);
  const client = await db.connect();
  let inTransaction = false;

  try {
    await ensureTerminalSchemas();
    await client.query("BEGIN");
    inTransaction = true;

    const mostrarTipoPedido = POS_SIN_TIPO_PEDIDO
      ? false
      : toBool(req.body?.mostrar_tipo_pedido, true);

    const tipoPedidoDefaultId = POS_SIN_TIPO_PEDIDO
      ? null
      : await resolveTipoPedidoDefaultId(client, req.body?.tipo_pedido_default_id);

    const r = await client.query(
      `INSERT INTO terminal
      (empresa_id,nombre,descripcion,tipo,activo,tipo_pedido_default_id)
      VALUES ($1,$2,$3,$4,$5,$6)
      RETURNING id`,
      [empresa_id, nombre, descripcion, tipo, activo, tipoPedidoDefaultId]
    );

    const terminalId = Number(r.rows?.[0]?.id || 0) || null;
    if (terminalId) {
      await safeUpsertMostrarTipoPedido(client, terminalId, mostrarTipoPedido);
    }

    await client.query("COMMIT");
    res.json({ ok: true, id: r.rows?.[0]?.id || null });

  } catch (err) {
    if (inTransaction) {
      await client.query("ROLLBACK");
    }
    console.error(err);
    if (err.message === "Tipo de pedido por defecto invalido") {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: "No se pudo crear la terminal" });

  } finally {
    client.release();
  }

});


/* =================================
   ACTUALIZAR TERMINAL
   PUT /api/terminal/:id
================================= */

router.put("/:id", async (req, res) => {

  const id = req.params.id;
  const { empresa_id, nombre, descripcion, tipo, activo } = req.body;
  const client = await db.connect();
  let inTransaction = false;

  try {
    await ensureTerminalSchemas();
    await client.query("BEGIN");
    inTransaction = true;

    const mostrarTipoPedido = POS_SIN_TIPO_PEDIDO
      ? false
      : toBool(req.body?.mostrar_tipo_pedido, true);

    const tipoPedidoDefaultId = POS_SIN_TIPO_PEDIDO
      ? null
      : await resolveTipoPedidoDefaultId(client, req.body?.tipo_pedido_default_id);

    await client.query(
      `UPDATE terminal
       SET empresa_id=$1,
           nombre=$2,
           descripcion=$3,
           tipo=$4,
           activo=$5,
           tipo_pedido_default_id=$6
       WHERE id=$7`,
      [empresa_id, nombre, descripcion, tipo, activo, tipoPedidoDefaultId, id]
    );

    await safeUpsertMostrarTipoPedido(client, id, mostrarTipoPedido);
    await client.query("COMMIT");
    res.json({ ok: true, id: Number(id) });

  } catch (err) {
    if (inTransaction) {
      await client.query("ROLLBACK");
    }
    console.error(err);
    if (err.message === "Tipo de pedido por defecto invalido") {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: "No se pudo actualizar la terminal" });

  } finally {
    client.release();
  }

});


/* =================================
   ELIMINAR TERMINAL
   DELETE /api/terminal/:id
================================= */

router.delete("/:id", async (req, res) => {

  const id = req.params.id;

  try {

    await db.query(
      `DELETE FROM terminal WHERE id=$1`,
      [id]
    );

    res.json({ ok: true });

  } catch (err) {

    console.error(err);
    res.status(500).json({ error: "No se pudo eliminar la terminal" });

  }

});

module.exports = router;
