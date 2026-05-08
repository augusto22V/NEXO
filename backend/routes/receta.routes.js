const express = require("express");
const router = express.Router();
const db = require("../db");
const authMiddleware = require("../Auth.middleware");
const recetaService = require("../services/receta.service");

router.use(authMiddleware);

router.post("/", async (req, res) => {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const data = await recetaService.createReceta(client, req.body);
    await client.query("COMMIT");
    res.json({ ok: true, receta: data });
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

router.get("/", async (req, res) => {
  const client = await db.connect();
  try {
    const rows = await recetaService.listRecetas(client, req.query);
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
    const data = await recetaService.getRecetaById(client, req.params.id);
    res.json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
