const express = require("express");
const router = express.Router();
const db = require("../db");

/* =========================
   CREAR COMPRADOR
========================= */
router.post("/", async (req, res) => {
  const { nombre } = req.body;

  if (!nombre || !nombre.trim()) {
    return res.status(400).json({ error: "Nombre obligatorio" });
  }

  try {
    const result = await db.query(
      `INSERT INTO comprador (nombre, activo)
       VALUES ($1, true)
       RETURNING *`,
      [nombre.trim()]
    );

    res.json(result.rows[0]);

  } catch (err) {
    console.error("ERROR POST COMPRADOR:", err);
    res.status(500).json({ error: "Error al guardar comprador" });
  }
});


/* =========================
   LISTAR COMPRADORES ACTIVOS
   GET /api/comprador
========================= */
router.get("/", async (req, res) => {
  try {
    const r = await db.query(
      `SELECT id, nombre
       FROM comprador
       WHERE activo = true
       ORDER BY id DESC`
    );

    res.json(r.rows);

  } catch (err) {
    console.error("ERROR GET COMPRADORES:", err);
    res.status(500).json({ error: "Error al listar compradores" });
  }
});


/* =========================
   OBTENER POR ID
========================= */
router.get("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);

    const r = await db.query(
      `SELECT id, nombre
       FROM comprador
       WHERE id = $1 AND activo = true`,
      [id]
    );

    if (r.rowCount === 0) {
      return res.status(404).json({ error: "Comprador no existe" });
    }

    res.json(r.rows[0]);

  } catch (err) {
    console.error("ERROR GET COMPRADOR:", err);
    res.status(500).json({ error: "Error al leer comprador" });
  }
});


/* =========================
   MODIFICAR COMPRADOR
========================= */
router.put("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { nombre } = req.body;

  if (!nombre || !nombre.trim()) {
    return res.status(400).json({ error: "Nombre obligatorio" });
  }

  try {
    const r = await db.query(
      `UPDATE comprador
       SET nombre = $1
       WHERE id = $2 AND activo = true
       RETURNING *`,
      [nombre.trim(), id]
    );

    if (r.rowCount === 0) {
      return res.status(404).json({ error: "Comprador no existe" });
    }

    res.json(r.rows[0]);

  } catch (err) {
    console.error("ERROR PUT COMPRADOR:", err);
    res.status(500).json({ error: "Error al modificar comprador" });
  }
});


/* =========================
   ELIMINAR (BORRADO LÓGICO)
========================= */
router.delete("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);

    await db.query(
      `UPDATE comprador
       SET activo = false
       WHERE id = $1`,
      [id]
    );

    res.sendStatus(200);

  } catch (err) {
    console.error("ERROR DELETE COMPRADOR:", err);
    res.status(500).json({ error: "Error al eliminar comprador" });
  }
});


module.exports = router;