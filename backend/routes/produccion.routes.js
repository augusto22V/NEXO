const express = require("express");
const router = express.Router();
const db = require("../db");
const authMiddleware = require("../Auth.middleware");
const produccionService = require("../services/produccion.service");

router.use(authMiddleware);

router.post("/preview", async (req, res) => {
  const client = await db.connect();
  try {
    const data = await produccionService.previewProduccion(client, req.body);
    res.json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

router.post("/", async (req, res) => {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const result = await produccionService.createProduccion(client, req.body, req);
    await client.query("COMMIT");
    res.json({ ok: true, ...result });
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

router.get("/reporte", async (req, res) => {
  const client = await db.connect();
  try {
    const data = await produccionService.getReporteProduccion(client, req.query);
    res.json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

router.get("/", async (req, res) => {
  const client = await db.connect();
  try {
    const rows = await produccionService.listProduccion(client, req.query);
    res.json(rows);
  } catch (err) {
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

router.get("/:id", async (req, res) => {
  const client = await db.connect();
  try {
    const data = await produccionService.getProduccionById(client, req.params.id);
    res.json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
