const express = require("express");
const router = express.Router();
const db = require("../db");
const {
  ensureComisionSchema,
  normalizeVendedorCommission,
  toBoolean
} = require("../services/comision.service");

function buildVendedorCommissionPayload(payload = {}) {
  const config = normalizeVendedorCommission(payload);
  return {
    tipo_calculo_comision: config.tipo_calculo_comision,
    tipo_comision: config.tipo_comision,
    porcentaje_ventas: config.porcentaje_ventas,
    porcentaje_servicios: config.porcentaje_servicios,
    comision_por_cantidad: config.comision_por_cantidad
  };
}

function mapVendedorRow(row = {}) {
  const config = normalizeVendedorCommission(row);
  return {
    id: row.id,
    nombre: row.nombre,
    activo: row.activo !== false,
    ...config
  };
}

/* =========================
   CREAR VENDEDOR
========================= */
router.post("/", async (req, res) => {
  const { nombre, activo } = req.body;

  if (!nombre || !nombre.trim()) {
    return res.status(400).json({ error: "Nombre obligatorio" });
  }

  try {
    await ensureComisionSchema();
    const config = buildVendedorCommissionPayload(req.body);
    const result = await db.query(
      `INSERT INTO vendedor (
         nombre,
         activo,
         tipo_calculo_comision,
         tipo_comision,
         porcentaje_ventas,
         porcentaje_servicios,
         comision_por_cantidad
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        nombre.trim(),
        activo === undefined ? true : toBoolean(activo, true),
        config.tipo_calculo_comision,
        config.tipo_comision,
        config.porcentaje_ventas,
        config.porcentaje_servicios,
        config.comision_por_cantidad
      ]
    );

    res.json(mapVendedorRow(result.rows[0]));

  } catch (err) {
    console.error("ERROR POST VENDEDOR:", err);
    res.status(500).json({ error: "Error al guardar vendedor" });
  }
});


/* =========================
   LISTAR VENDEDOR ACTIVOS
   GET /api/vendedor
========================= */
  router.get("/", async (req, res) => {
  try {
    await ensureComisionSchema();
    const r = await db.query(
      `SELECT
         id,
         nombre,
         activo,
         tipo_calculo_comision,
         tipo_comision,
         porcentaje_ventas,
         porcentaje_servicios,
         comision_por_cantidad
       FROM vendedor
       ORDER BY id DESC`
    );

    res.json(r.rows.map(mapVendedorRow));

  } catch (err) {
    console.error("ERROR GET VENDEDORES:", err);
    res.status(500).json({ error: "Error al listar vendedores" });
  }
});


/* =========================
   OBTENER POR ID
========================= */
router.get("/:id", async (req, res) => {
  try {
    await ensureComisionSchema();
    const id = Number(req.params.id);

    const r = await db.query(
      `SELECT
         id,
         nombre,
         activo,
         tipo_calculo_comision,
         tipo_comision,
         porcentaje_ventas,
         porcentaje_servicios,
         comision_por_cantidad
       FROM vendedor
       WHERE id = $1`,
      [id]
    );

    if (r.rowCount === 0) {
      return res.status(404).json({ error: "Vendedor no existe" });
    }

    res.json(mapVendedorRow(r.rows[0]));
  } catch (err) {
    console.error("ERROR GET VENDEDOR:", err);
    res.status(500).json({ error: "Error al leer vendedor" });
  }
});


/* =========================
   MODIFICAR VENDEDOR
========================= */
router.put("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { nombre, activo } = req.body;

  if (!nombre || !nombre.trim()) {
    return res.status(400).json({ error: "Nombre obligatorio" });
  }

  try {
    await ensureComisionSchema();
    const config = buildVendedorCommissionPayload(req.body);
    const r = await db.query(
      `UPDATE vendedor
       SET nombre = $1,
           activo = $2,
           tipo_calculo_comision = $3,
           tipo_comision = $4,
           porcentaje_ventas = $5,
           porcentaje_servicios = $6,
           comision_por_cantidad = $7
       WHERE id = $8
       RETURNING *`,
      [
        nombre.trim(),
        toBoolean(activo, true),
        config.tipo_calculo_comision,
        config.tipo_comision,
        config.porcentaje_ventas,
        config.porcentaje_servicios,
        config.comision_por_cantidad,
        id
      ]
    );

    if (r.rowCount === 0) {
      return res.status(404).json({ error: "Vendedor no existe" });
    }

    res.json(mapVendedorRow(r.rows[0]));

  } catch (err) {
    console.error("ERROR PUT VENDEDOR:", err);
    res.status(500).json({ error: "Error al modificar vendedor" });
  }
});


/* =========================
   ELIMINAR (BORRADO FÍSICO)
========================= */
router.delete("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);

    const r = await db.query(
      `DELETE FROM vendedor
       WHERE id = $1
       RETURNING id`,
      [id]
    );

    if (r.rowCount === 0) {
      return res.status(404).json({ error: "Vendedor no existe" });
    }

    res.sendStatus(200);

  } catch (err) {
    console.error("ERROR DELETE VENDEDOR:", err);
    res.status(500).json({ error: "Error al eliminar vendedor" });
  }
});


module.exports = router;
