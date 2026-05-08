const express = require("express");
const router = express.Router();
const pool = require("../db");
const authMiddleware = require("../Auth.middleware");
const {
  assignVentaToMesaByNumero,
  actualizarMesa,
  actualizarPosicionMesa,
  clearMesaByVentaId,
  crearMesa,
  eliminarMesa,
  ensureMesaSchema,
  liberarMesaById,
  listarMesas,
  seleccionarMesa
} = require("../services/mesa.service");

router.use(authMiddleware);

function getMesaScopeFromReq(req) {
  const empresaId = Number(req?.usuario?.empresa_id || 0);
  const terminalId = Number(req?.usuario?.terminal_id || 0);

  if (!Number.isFinite(empresaId) || empresaId <= 0) return null;
  if (!Number.isFinite(terminalId) || terminalId <= 0) return null;

  return {
    empresa_id: Math.trunc(empresaId),
    terminal_id: Math.trunc(terminalId)
  };
}

function requireMesaScope(req, res) {
  const scope = getMesaScopeFromReq(req);
  if (scope) return scope;

  res.status(400).json({ error: "Contexto de empresa/terminal no disponible" });
  return null;
}

router.get("/", async (req, res) => {
  const scope = requireMesaScope(req, res);
  if (!scope) return;

  try {
    await ensureMesaSchema();
    const ventaRapidaRaw = String(req.query?.venta_rapida ?? req.query?.solo_venta_rapida ?? "")
      .trim()
      .toLowerCase();
    const onlyVentaRapida = ["1", "true", "si", "yes"].includes(ventaRapidaRaw);

    const mesas = await listarMesas(pool, scope, { onlyVentaRapida });
    res.json(mesas);
  } catch (err) {
    res.status(500).json({ error: err.message || "No se pudo listar mesas" });
  }
});

router.post("/", async (req, res) => {
  const scope = requireMesaScope(req, res);
  if (!scope) return;

  const client = await pool.connect();
  try {
    await ensureMesaSchema();
    await client.query("BEGIN");
    const mesa = await crearMesa(client, req.body || {}, scope);
    await client.query("COMMIT");
    res.json(mesa);
  } catch (err) {
    await client.query("ROLLBACK");
    const status = err.code === "23505" ? 400 : 500;
    res.status(status).json({ error: err.message || "No se pudo crear mesa" });
  } finally {
    client.release();
  }
});

router.post("/seleccionar/:id", async (req, res) => {
  const scope = requireMesaScope(req, res);
  if (!scope) return;

  const client = await pool.connect();
  try {
    await ensureMesaSchema();
    await client.query("BEGIN");

    const data = await seleccionarMesa(client, req.params.id, req.body || {}, scope);

    await client.query("COMMIT");
    res.json(data);
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(400).json({ error: err.message || "No se pudo seleccionar mesa" });
  } finally {
    client.release();
  }
});

router.post("/asignar-venta", async (req, res) => {
  const scope = requireMesaScope(req, res);
  if (!scope) return;

  const ventaId = Number(req.body?.venta_id || 0);
  const mesaNumero = req.body?.mesa;

  if (!ventaId) {
    return res.status(400).json({ error: "venta_id requerido" });
  }

  const client = await pool.connect();
  try {
    await ensureMesaSchema();
    await client.query("BEGIN");

    const mesa = await assignVentaToMesaByNumero(client, ventaId, mesaNumero, scope);

    await client.query("COMMIT");
    res.json({ ok: true, mesa });
  } catch (err) {
    await client.query("ROLLBACK");
    const status = err.code === "23505" ? 400 : 500;
    res.status(status).json({ error: err.message || "No se pudo asignar mesa" });
  } finally {
    client.release();
  }
});

router.post("/liberar-venta", async (req, res) => {
  const scope = requireMesaScope(req, res);
  if (!scope) return;

  const ventaId = Number(req.body?.venta_id || 0);

  if (!ventaId) {
    return res.status(400).json({ error: "venta_id requerido" });
  }

  const client = await pool.connect();
  try {
    await ensureMesaSchema();
    await client.query("BEGIN");

    const mesas = await clearMesaByVentaId(client, ventaId, scope);

    await client.query("COMMIT");
    res.json({ ok: true, mesas: mesas || [] });
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: err.message || "No se pudo liberar mesa" });
  } finally {
    client.release();
  }
});

router.put("/:id/posicion", async (req, res) => {
  const scope = requireMesaScope(req, res);
  if (!scope) return;

  const client = await pool.connect();
  try {
    await ensureMesaSchema();
    await client.query("BEGIN");

    const mesa = await actualizarPosicionMesa(client, req.params.id, req.body || {}, scope);

    await client.query("COMMIT");
    res.json(mesa);
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(400).json({ error: err.message || "No se pudo actualizar posicion" });
  } finally {
    client.release();
  }
});

router.put("/:id", async (req, res) => {
  const scope = requireMesaScope(req, res);
  if (!scope) return;

  const client = await pool.connect();
  try {
    await ensureMesaSchema();
    await client.query("BEGIN");

    const mesa = await actualizarMesa(client, req.params.id, req.body || {}, scope);

    await client.query("COMMIT");
    res.json(mesa);
  } catch (err) {
    await client.query("ROLLBACK");
    const status = err.code === "23505" ? 400 : 500;
    res.status(status).json({ error: err.message || "No se pudo actualizar mesa" });
  } finally {
    client.release();
  }
});

router.post("/:id/liberar", async (req, res) => {
  const scope = requireMesaScope(req, res);
  if (!scope) return;

  const client = await pool.connect();
  try {
    await ensureMesaSchema();
    await client.query("BEGIN");

    const mesa = await liberarMesaById(client, req.params.id, scope);

    await client.query("COMMIT");
    res.json({ ok: true, mesa });
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(400).json({ error: err.message || "No se pudo liberar mesa" });
  } finally {
    client.release();
  }
});

router.delete("/:id", async (req, res) => {
  const scope = requireMesaScope(req, res);
  if (!scope) return;

  const client = await pool.connect();
  try {
    await ensureMesaSchema();
    await client.query("BEGIN");

    await eliminarMesa(client, req.params.id, scope);

    await client.query("COMMIT");
    res.json({ ok: true });
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(400).json({ error: err.message || "No se pudo eliminar mesa" });
  } finally {
    client.release();
  }
});

module.exports = router;
