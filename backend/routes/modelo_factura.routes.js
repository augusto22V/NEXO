const express = require("express");
const router = express.Router();
const db = require("../db");

/* =========================
   GET (OBTENER CONFIG)
========================= */
router.get("/", async (req, res) => {
  try {

    const r = await db.query(`
      SELECT * FROM modelo_factura
      ORDER BY id DESC
      LIMIT 1
    `);

    res.json(r.rows[0] || {});

  } catch (err) {
    console.error("ERROR GET MODELO FACTURA:", err);
    res.status(500).json({ error: "Error obteniendo modelo factura" });
  }
});


/* =========================
   POST (GUARDAR / REEMPLAZAR)
========================= */
router.post("/", async (req, res) => {

  const {
  descripcion,
  punto_establecimiento,
  punto_expedicion, 
  timbrado,
  fecha_inicio,
  fecha_vencimiento,
  actividad,
  moneda,
  ticket_fiscal,
  numeracion_automatica
} = req.body;

  try {

    // 🔥 SOLO 1 CONFIG → BORRAMOS ANTERIOR
    await db.query("DELETE FROM modelo_factura");

    const r = await db.query(
    `INSERT INTO modelo_factura
    (descripcion, punto_establecimiento, punto_expedicion, timbrado,
    fecha_inicio, fecha_vencimiento,
    actividad, moneda,
    ticket_fiscal, numeracion_automatica)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
   RETURNING *`,
   [
     descripcion || null,
     punto_establecimiento || null,
     punto_expedicion || null, 
     timbrado || null,
      fecha_inicio || null,
      fecha_vencimiento || null,
      actividad || null,
      moneda || "PYG",
      ticket_fiscal || false,
     numeracion_automatica || false
    ]
  );

    res.json(r.rows[0]);

  } catch (err) {

    console.error("ERROR POST MODELO FACTURA:", err);
    res.status(500).json({ error: "Error guardando modelo factura" });

  }

});

module.exports = router;