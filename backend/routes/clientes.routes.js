const express = require("express");
const router = express.Router();
const db = require("../db");

/* =========================
   CREAR CLIENTE
========================= */
router.post("/", async (req, res) => {
  const { nombre, razon_social, ruc, telefono, direccion, email } = req.body;

  if (!nombre || !nombre.trim()) {
    return res.status(400).json({ error: "Nombre obligatorio" });
  }

  try {
    const result = await db.query(
      `INSERT INTO cliente (nombre, razon_social, ruc, telefono, direccion, email)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING *`,
      [
        nombre.trim(),
        razon_social || null,
        ruc || null,
        telefono || null,
        direccion || null,
        email || null
      ]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error("ERROR POST CLIENTE:", err);
    res.status(500).json({ error: "Error al guardar cliente" });
  }
});

/* =========================
   LISTAR CLIENTES (TODOS)
   GET /api/clientes
========================= */
router.get("/", async (req, res) => {
  try {
    const r = await db.query(
      `SELECT id, nombre, razon_social, ruc, telefono, direccion, email
       FROM cliente
       ORDER BY id DESC`
    );
    res.json(r.rows);
  } catch (err) {
    console.error("ERROR GET CLIENTES:", err);
    res.status(500).json({ error: "Error al listar clientes" });
  }
});

/* =========================
   OBTENER CLIENTE POR ID
   GET /api/clientes/:id
========================= */
router.get("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const r = await db.query(
      `SELECT id, nombre, razon_social, ruc, telefono, direccion, email
       FROM cliente
       WHERE id = $1`,
      [id]
    );

    if (r.rowCount === 0) return res.status(404).json({ mensaje: "Cliente no existe" });
    res.json(r.rows[0]);
  } catch (err) {
    console.error("ERROR GET CLIENTE:", err);
    res.status(500).json({ mensaje: "Error al leer cliente" });
  }
});

/* =========================
   MODIFICAR CLIENTE
========================= */
router.put("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { nombre, razon_social, ruc, telefono, direccion, email } = req.body;

  if (!nombre || !nombre.trim()) {
    return res.status(400).json({ error: "Nombre obligatorio" });
  }

  try {
    const r = await db.query(
      `UPDATE cliente SET
        nombre = $1,
        razon_social = $2,
        ruc = $3,
        telefono = $4,
        direccion = $5,
        email = $6
       WHERE id = $7
       RETURNING *`,
      [
        nombre.trim(),
        razon_social || null,
        ruc || null,
        telefono || null,
        direccion || null,
        email || null,
        id
      ]
    );

    if (r.rowCount === 0) return res.status(404).json({ error: "Cliente no existe" });
    res.json(r.rows[0]);
  } catch (err) {
    console.error("ERROR PUT CLIENTE:", err);
    res.status(500).json({ error: "Error al modificar cliente" });
  }
});

/* =========================
   ELIMINAR CLIENTE
========================= */
router.delete("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.query("DELETE FROM cliente WHERE id = $1", [id]);
    res.sendStatus(200);
  } catch (err) {
    console.error("ERROR DELETE CLIENTE:", err);
    res.status(500).json({ error: "Error al eliminar cliente" });
  }
});

module.exports = router;
