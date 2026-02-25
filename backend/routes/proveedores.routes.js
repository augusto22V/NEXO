const express = require("express");
const router = express.Router();
const pool = require("../db");

/* =========================
   NEXT ID (PG REAL)
========================= */
router.get("/next-id", async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT COALESCE(MAX(id),0) + 1 AS next_id FROM proveedor
    `);
    res.json({ next_id: Number(r.rows[0].next_id) });
  } catch (error) {
    console.error("ERROR NEXT-ID PROVEEDOR:", error);
    res.status(500).json({ error: error.message });
  }
});

/* =========================
   GET TODOS ACTIVOS
========================= */
router.get("/", async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT id, nombre, razon_social, ruc, telefono, direccion, email, activo
      FROM proveedor
      ORDER BY id DESC
    `);
    res.json(r.rows);
  } catch (error) {
    console.error("ERROR GET PROVEEDORES:", error);
    res.status(500).json({ error: error.message });
  }
});

/* =========================
   GET TODOS (ADMIN)
========================= */
router.get("/all/list", async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT id, nombre, razon_social, ruc, telefono, direccion, email, activo
      FROM proveedor
      ORDER BY id DESC
    `);
    res.json(r.rows);
  } catch (error) {
    console.error("ERROR GET ALL PROVEEDORES:", error);
    res.status(500).json({ error: error.message });
  }
});

/* =========================
   GET POR ID
========================= */
router.get("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);

    const r = await pool.query(`
      SELECT id, nombre, razon_social, ruc, telefono, direccion, email, activo
      FROM proveedor
      WHERE id = $1
    `, [id]);

    if (r.rowCount === 0) {
      return res.status(404).json({ mensaje: "Proveedor no existe" });
    }

    res.json(r.rows[0]);

  } catch (error) {
    console.error("ERROR GET PROVEEDOR:", error);
    res.status(500).json({ error: error.message });
  }
});

/* =========================
   POST
========================= */
router.post("/", async (req, res) => {

  const { nombre, razon_social, ruc, telefono, direccion, email, activo } = req.body;

  if (!nombre || !nombre.trim()) {
    return res.status(400).json({ error: "Nombre obligatorio" });
  }

  try {

    const result = await pool.query(`
      INSERT INTO proveedor
      (nombre, razon_social, ruc, telefono, direccion, email, activo, creado_en)
      VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
      RETURNING *
    `, [
      nombre.trim(),
      razon_social || null,
      ruc || null,
      telefono || null,
      direccion || null,
      email || null,
      activo !== false
    ]);

    res.json(result.rows[0]);

  } catch (error) {
    console.error("ERROR POST PROVEEDOR:", error);
    res.status(500).json({ error: "Error al guardar proveedor" });
  }
});

/* =========================
   PUT (EDITAR + CAMBIAR ACTIVO)
========================= */
router.put("/:id", async (req, res) => {

  const id = Number(req.params.id);
  const { nombre, razon_social, ruc, telefono, direccion, email, activo } = req.body;

  if (!nombre || !nombre.trim()) {
    return res.status(400).json({ error: "Nombre obligatorio" });
  }

  try {

    const r = await pool.query(`
      UPDATE proveedor SET
        nombre = $1,
        razon_social = $2,
        ruc = $3,
        telefono = $4,
        direccion = $5,
        email = $6,
        activo = $7
      WHERE id = $8
      RETURNING *
    `, [
      nombre.trim(),
      razon_social || null,
      ruc || null,
      telefono || null,
      direccion || null,
      email || null,
      activo !== false,
      id
    ]);

    if (r.rowCount === 0) {
      return res.status(404).json({ error: "Proveedor no existe" });
    }

    res.json(r.rows[0]);

  } catch (error) {
    console.error("ERROR PUT PROVEEDOR:", error);
    res.status(500).json({ error: "Error al modificar proveedor" });
  }
});

/* =========================
   DELETE (SOFT)
========================= */
router.delete("/:id", async (req, res) => {
  try {

    const id = Number(req.params.id);

    await pool.query(`
      UPDATE proveedor SET activo = false WHERE id = $1
    `, [id]);

    res.json({ mensaje: "Proveedor desactivado" });

  } catch (error) {
    console.error("ERROR DELETE PROVEEDOR:", error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;