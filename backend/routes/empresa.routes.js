const express = require("express");
const router = express.Router();
const db = require("../db");
const authMiddleware = require("../Auth.middleware");

const multer = require("multer");
const path = require("path");
const fs = require("fs");

function toBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "t", "si", "s", "yes", "y", "on"].includes(normalized)) return true;
    if (["0", "false", "f", "no", "n", "off"].includes(normalized)) return false;
  }
  return fallback;
}

function getOptionalBoolean(payload, key) {
  if (!payload || !Object.prototype.hasOwnProperty.call(payload, key)) return undefined;
  return toBoolean(payload[key], false);
}

function normalizeMonedaBaseId(value, fallback = 1) {
  const number = Number(value);
  if (number === 1 || number === 2 || number === 3) return number;
  return fallback;
}

function getOptionalMonedaBaseId(payload, key) {
  if (!payload || !Object.prototype.hasOwnProperty.call(payload, key)) return undefined;
  return normalizeMonedaBaseId(payload[key], NaN);
}

/* ==============================
   RUTA IMG
============================== */
const rutaImg = path.resolve(__dirname, "../../frontend/recursos/img");

if (!fs.existsSync(rutaImg)) {
  fs.mkdirSync(rutaImg, { recursive: true });
}

/* ==============================
   MULTER
============================== */
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, rutaImg),
  filename: (req, file, cb) =>
    cb(null, Date.now() + path.extname(file.originalname))
});

const upload = multer({ storage });

/* ==============================
   LISTAR EMPRESAS
============================== */
router.get("/", async (req, res) => {
  try {
    const r = await db.query(`
      SELECT
        id,
        codigo,
        nombre,
        ruc,
        direccion,
        telefono,
        email,
        logo,
        activa,
        COALESCE(moneda_base_id, 1) AS moneda_base_id,
        COALESCE(controlar_lote, false) AS controlar_lote
      FROM empresa
      WHERE activa = true
      ORDER BY nombre
    `);

    res.json(r.rows);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "error al listar empresas" });
  }
});

/* ==============================
   CREAR EMPRESA
============================== */
router.post("/", authMiddleware, upload.single("logo"), async (req, res) => {
  try {

    const { codigo, nombre, ruc, direccion, telefono, email } = req.body;
    const controlarLote = getOptionalBoolean(req.body, "controlar_lote");
    const monedaBaseId = getOptionalMonedaBaseId(req.body, "moneda_base_id");

    // validar duplicado
    const existe = await db.query(
      "SELECT id FROM empresa WHERE codigo = $1",
      [codigo]
    );

    if (existe.rows.length > 0) {
      return res.status(400).json({ error: "El cÃ³digo ya existe" });
    }

    // INSERT
    const r = await db.query(`
      INSERT INTO empresa
      (codigo, nombre, ruc, direccion, telefono, email, controlar_lote, moneda_base_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING id
    `, [
      codigo,
      nombre,
      ruc,
      direccion,
      telefono,
      email,
      controlarLote === undefined ? false : controlarLote,
      Number.isFinite(monedaBaseId) ? monedaBaseId : 1
    ]);

    const id = r.rows[0].id;
    let logo = null;

    // PROCESAR LOGO
    if (req.file) {

      const ext = path.extname(req.file.originalname);
      const nombreArchivo = `logoVenta_${id}${ext}`;
      const nuevaRuta = path.join(rutaImg, nombreArchivo);

      const rutaTemp = path.join(rutaImg, req.file.filename);

      fs.renameSync(rutaTemp, nuevaRuta);

      logo = nombreArchivo;

      await db.query(
        "UPDATE empresa SET logo = $1 WHERE id = $2",
        [logo, id]
      );
    }

    res.json({ ok: true, id });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "error al guardar empresa" });
  }
});

/* ==============================
   ELIMINAR
============================== */
router.delete("/:id", authMiddleware, async (req, res) => {
  try {

    const { id } = req.params;

    await db.query(`
      UPDATE empresa SET activa = false WHERE id = $1
    `, [id]);

    res.json({ ok: true, id: Number(id) });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "error eliminando empresa" });
  }
});

/* ==============================
   EDITAR EMPRESA
============================== */
router.put("/:id", authMiddleware, upload.single("logo"), async (req, res) => {
  try {

    const { id } = req.params;
    const { codigo, nombre, ruc, direccion, telefono, email } = req.body;
    const controlarLote = getOptionalBoolean(req.body, "controlar_lote");
    const monedaBaseId = getOptionalMonedaBaseId(req.body, "moneda_base_id");

    // validar duplicado
    const existe = await db.query(
      "SELECT id FROM empresa WHERE codigo = $1 AND id <> $2",
      [codigo, id]
    );

    if (existe.rows.length > 0) {
      return res.status(400).json({
        error: "El cÃ³digo ya existe en otra empresa"
      });
    }

    let logo = null;

    // nuevo logo
    if (req.file) {

      const ext = path.extname(req.file.originalname);
      const nombreArchivo = `logoVenta_${id}${ext}`;
      const nuevaRuta = path.join(rutaImg, nombreArchivo);

      const rutaTemp = path.join(rutaImg, req.file.filename);

      // eliminar anterior
      const anterior = await db.query(
        "SELECT logo FROM empresa WHERE id = $1",
        [id]
      );

      if (anterior.rows[0]?.logo) {
        const rutaAnterior = path.join(rutaImg, anterior.rows[0].logo);
        if (fs.existsSync(rutaAnterior)) {
          fs.unlinkSync(rutaAnterior);
        }
      }

      fs.renameSync(rutaTemp, nuevaRuta);
      logo = nombreArchivo;
    }

    await db.query(`
      UPDATE empresa
      SET 
        codigo = $1,
        nombre = $2,
        ruc = $3,
        direccion = $4,
        telefono = $5,
        email = $6,
        logo = COALESCE($7, logo),
        controlar_lote = COALESCE($8, controlar_lote),
        moneda_base_id = COALESCE($9, moneda_base_id)
      WHERE id = $10
    `, [
      codigo,
      nombre,
      ruc,
      direccion,
      telefono,
      email,
      logo,
      controlarLote === undefined ? null : controlarLote,
      Number.isFinite(monedaBaseId) ? monedaBaseId : null,
      id
    ]);

    res.json({ ok: true });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "error actualizando empresa" });
  }
});

/* ==============================
   SIGUIENTE CODIGO
============================== */
router.get("/siguiente-codigo", async (req, res) => {
  try {

    const r = await db.query(`
      SELECT COALESCE(MAX(codigo::integer),0)+1 AS codigo
      FROM empresa
    `);

    res.json({ codigo: r.rows[0].codigo });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "error obteniendo codigo" });
  }
});

module.exports = router;

