const express = require("express");
const router = express.Router();
const db = require("../db");
const authMiddleware = require("../Auth.middleware");




function toUpperSafe(valor) {
  return valor ? valor.trim().toUpperCase() : null;
}

/* =========================
   CREAR CLIENTE
========================= */
router.post("/", authMiddleware, async (req, res) => {
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
        toUpperSafe(nombre),
        toUpperSafe(razon_social),
        ruc || null,
        telefono || null,
        toUpperSafe(direccion),
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
   LISTAR CLIENTES 
   GET /api/clientes
========================= */
router.get("/", async (req, res) => {

  const limit = Number(req.query.limit) || 20;
  const offset = Number(req.query.offset) || 0;

  try {
    const r = await db.query(`
      SELECT id, nombre, razon_social, ruc, telefono, direccion, email
      FROM cliente
      ORDER BY id DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);

    res.json(r.rows);

  } catch (err) {
    console.error("ERROR GET CLIENTES:", err);
    res.status(500).json({ error: "Error al listar clientes" });
  }
});




/* =========================
   OBTENER PROXIMO ID
========================= */
router.get("/next-id", async (req, res) => {
  try {

    const r = await db.query(`
      SELECT COALESCE(MAX(id),0) + 1 AS id
      FROM cliente
    `);

    res.json({ id: r.rows[0].id });

  } catch (err) {
    console.error("ERROR NEXT ID CLIENTE:", err);
    res.status(500).json({ error: "Error obteniendo próximo ID" });
  }
});



/* =========================
   Busqueda RUC 
========================= */
const axios = require("axios");

router.get("/ruc/:ruc", async (req, res) => {

  const rucInput = req.params.ruc;
  const rucBase = rucInput.split("-")[0];

  try {

    // 1. Buscar en BD
    const local = await db.query(
      "SELECT * FROM cliente WHERE ruc LIKE $1",
      [rucBase + "%"]
    );

    if (local.rows.length > 0) {
      return res.json(local.rows[0]);
    }

    // 2. Consultar TuRuc
    const response = await axios.get(
      `https://turuc.com.py/api/contribuyente/${rucBase}`
    );

    const data = response.data?.data;

    if (!data || !data.ruc) {
      return res.json(null);
    }

    // 🔥 SOLO DEVUELVE (NO GUARDA)
    return res.json({
      ruc: data.ruc,
      razon_social: data.razonSocial,
      nombre: data.razonSocial
    });

  } catch (err) {

    console.error("ERROR RUC:", err.message);
    return res.json(null);

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
router.put("/:id", authMiddleware, async (req, res) => {
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
        toUpperSafe(nombre),
        toUpperSafe(razon_social),
        ruc || null,
        telefono || null,
        toUpperSafe(direccion),
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
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const id = Number(req.params.id);

    await db.query("DELETE FROM cliente WHERE id = $1", [id]);

    res.json({ ok: true });

  } catch (err) {

    console.error("ERROR DELETE CLIENTE:", err);

    // 🔥 ERROR CLAVE FORÁNEA (ventas relacionadas)
    if (err.code === "23503") {
      return res.status(400).json({
        ok: false,
        mensaje: "No se puede eliminar el cliente porque tiene ventas registradas."
      });
    }

    res.status(500).json({
      ok: false,
      mensaje: "Error al eliminar cliente"
    });
  }
});




/* =========================
   CREAR O BUSCAR CLIENTE (FACTURA)
========================= */
router.post("/guardar-o-buscar", authMiddleware, async (req, res) => {

  const { ruc, nombre, direccion } = req.body;

  function normalizarRuc(ruc) {
    if (!ruc) return null;
    return ruc.split("-")[0].trim();
  }

  const rucNormalizado = normalizarRuc(ruc);

  try {

    let existe = { rows: [] };

    // 🔍 BUSCAR SOLO SI HAY RUC
    if (rucNormalizado) {
      existe = await db.query(
        "SELECT * FROM cliente WHERE ruc LIKE $1",
        [rucNormalizado + "%"]
      );
    }

    // SI EXISTE → USAR
    if (existe.rows.length > 0) {
      return res.json(existe.rows[0]);
    }

    //  CREAR NUEVO CLIENTE
const nuevo = await db.query(
  `INSERT INTO cliente (nombre, razon_social, ruc, direccion)
   VALUES ($1,$2,$3,$4)
   RETURNING *`,
  [
    toUpperSafe(nombre || "OCASIONAL"),
    toUpperSafe(nombre || "OCASIONAL"),
    ruc || null,             
    toUpperSafe(direccion) || null
  ]
);

    res.json(nuevo.rows[0]);

  } catch (err) {
    console.error("ERROR guardar-o-buscar:", err);
    res.status(500).json({ error: "Error cliente" });
  }

});



module.exports = router;
