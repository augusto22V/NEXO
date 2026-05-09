const express = require("express");
const router = express.Router();
const db = require("../db");
const authMiddleware = require("../Auth.middleware");
const { ensureClienteSchema, parseRuc } = require("../services/cliente.service");

// Aplica las migraciones de SIFEN antes de servir cualquier ruta
router.use(async (_req, res, next) => {
  try {
    await ensureClienteSchema();
    next();
  } catch (err) {
    console.error("No se pudo preparar esquema de cliente:", err);
    res.status(500).json({ error: "No se pudo preparar esquema de cliente" });
  }
});

function toUpperSafe(valor) {
  return valor ? valor.trim().toUpperCase() : null;
}

// Heurística para detectar si parece persona jurídica.
function detectarNaturaleza(razonSocial, nombre, dv) {
  const txt = String(razonSocial || nombre || "").toUpperCase();
  if (/(S\.?A\.?|SRL|S\.R\.L|EIRL|LTDA|LIMITADA|CIA|S\.A\.E\.C\.A|SOCIEDAD)/.test(txt)) return "JURIDICA";
  if (dv) return "JURIDICA";
  return "FISICA";
}

// Selección estándar — incluye todos los campos SIFEN.
const SELECT_CLIENTE = `
  SELECT id, nombre, razon_social, ruc, telefono, direccion, email,
         numero_documento, dv, tipo_documento, naturaleza, tipo_contribuyente,
         departamento_id, distrito_id, ciudad_id, numero_casa
`;

/* =========================
   CREAR CLIENTE
========================= */
router.post("/", authMiddleware, async (req, res) => {
  const {
    nombre, razon_social, ruc, telefono, direccion, email,
    numero_documento, dv, tipo_documento, naturaleza, tipo_contribuyente,
    departamento_id, distrito_id, ciudad_id, numero_casa
  } = req.body;

  if (!nombre || !nombre.trim()) {
    return res.status(400).json({ error: "Nombre obligatorio" });
  }

  // Si vino RUC pero no numero_documento, parsearlo automáticamente
  let nroDoc = numero_documento;
  let dvFinal = dv;
  if ((!nroDoc || !dvFinal) && ruc) {
    const parsed = parseRuc(ruc);
    nroDoc = nroDoc || parsed.numero || null;
    dvFinal = dvFinal || parsed.dv || null;
  }

  // Defaults inteligentes
  const tipoDoc = tipo_documento || (dvFinal ? "RUC" : "CI");
  const tipoContr = tipo_contribuyente || (dvFinal ? "CONTRIBUYENTE" : "NO_CONTRIBUYENTE");
  const naturalezaFinal = naturaleza || detectarNaturaleza(razon_social, nombre, dvFinal);

  try {
    const result = await db.query(
      `INSERT INTO cliente (
         nombre, razon_social, ruc, telefono, direccion, email,
         numero_documento, dv, tipo_documento, naturaleza, tipo_contribuyente,
         departamento_id, distrito_id, ciudad_id, numero_casa
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       RETURNING *`,
      [
        toUpperSafe(nombre),
        toUpperSafe(razon_social),
        ruc || null,
        telefono || null,
        toUpperSafe(direccion),
        email || null,
        nroDoc || null,
        dvFinal || null,
        tipoDoc,
        naturalezaFinal,
        tipoContr,
        departamento_id || null,
        distrito_id || null,
        ciudad_id || null,
        numero_casa || null
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
    const r = await db.query(
      `${SELECT_CLIENTE}
       FROM cliente
       ORDER BY id DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

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
  const { numero: rucBase, dv: dvInput } = parseRuc(rucInput);

  if (!rucBase) {
    return res.status(400).json({ error: "RUC/cedula vacio" });
  }

  try {

    // 1. Buscar en BD: por numero_documento exacto, o por ruc LIKE base%
    //    (cubre clientes viejos que tienen el dato solo en `ruc`)
    const local = await db.query(
      `${SELECT_CLIENTE}
       FROM cliente
       WHERE numero_documento = $1
          OR ruc LIKE $2
       ORDER BY (numero_documento = $1) DESC, id ASC
       LIMIT 1`,
      [rucBase, rucBase + "%"]
    );

    if (local.rows.length > 0) {
      return res.json(local.rows[0]);
    }

    // 2. Consultar TuRuc (solo funciona para contribuyentes, no para CI sola)
    const response = await axios.get(
      `https://turuc.com.py/api/contribuyente/${rucBase}`
    );

    const data = response.data?.data;

    if (!data || !data.ruc) {
      return res.json(null);
    }

    // Parsear el RUC devuelto en numero + dv
    const { numero: nroDoc, dv: dvApi } = parseRuc(data.ruc);
    const dvFinal = dvApi || dvInput || null;
    const naturaleza = detectarNaturaleza(data.razonSocial, data.razonSocial, dvFinal);

    // Devuelve los campos pre-rellenados para que el frontend pueda guardar
    // un cliente nuevo con datos válidos para SIFEN.
    return res.json({
      ruc: data.ruc,
      razon_social: data.razonSocial,
      nombre: data.razonSocial,
      numero_documento: nroDoc,
      dv: dvFinal,
      tipo_documento: dvFinal ? "RUC" : "CI",
      tipo_contribuyente: dvFinal ? "CONTRIBUYENTE" : "NO_CONTRIBUYENTE",
      naturaleza,
      departamento_id: null,
      distrito_id: null,
      ciudad_id: null,
      numero_casa: null,
      _origen: "turuc",
      _existe_en_bd: false
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
      `${SELECT_CLIENTE} FROM cliente WHERE id = $1`,
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
  const {
    nombre, razon_social, ruc, telefono, direccion, email,
    numero_documento, dv, tipo_documento, naturaleza, tipo_contribuyente,
    departamento_id, distrito_id, ciudad_id, numero_casa
  } = req.body;

  if (!nombre || !nombre.trim()) {
    return res.status(400).json({ error: "Nombre obligatorio" });
  }

  // Si vino RUC pero no numero_documento, parsearlo automáticamente
  let nroDoc = numero_documento;
  let dvFinal = dv;
  if ((!nroDoc || !dvFinal) && ruc) {
    const parsed = parseRuc(ruc);
    nroDoc = nroDoc || parsed.numero || null;
    dvFinal = dvFinal || parsed.dv || null;
  }

  const tipoDoc   = tipo_documento     || (dvFinal ? "RUC" : "CI");
  const tipoContr = tipo_contribuyente || (dvFinal ? "CONTRIBUYENTE" : "NO_CONTRIBUYENTE");
  const natural   = naturaleza         || detectarNaturaleza(razon_social, nombre, dvFinal);

  try {
    const r = await db.query(
      `UPDATE cliente SET
        nombre = $1,
        razon_social = $2,
        ruc = $3,
        telefono = $4,
        direccion = $5,
        email = $6,
        numero_documento = $7,
        dv = $8,
        tipo_documento = $9,
        naturaleza = $10,
        tipo_contribuyente = $11,
        departamento_id = $12,
        distrito_id = $13,
        ciudad_id = $14,
        numero_casa = $15
       WHERE id = $16
       RETURNING *`,
      [
        toUpperSafe(nombre),
        toUpperSafe(razon_social),
        ruc || null,
        telefono || null,
        toUpperSafe(direccion),
        email || null,
        nroDoc || null,
        dvFinal || null,
        tipoDoc,
        natural,
        tipoContr,
        departamento_id || null,
        distrito_id || null,
        ciudad_id || null,
        numero_casa || null,
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
