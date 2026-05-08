const express = require("express");
const router = express.Router();
const db = require("../db");

function isValidTableName(value) {
  return typeof value === "string" && /^[a-z_][a-z0-9_]*$/i.test(value);
}

router.get("/resumen/:tabla/:registroId", async (req, res) => {
  const tabla = String(req.params.tabla || "").trim().toLowerCase();
  const registroId = String(req.params.registroId || "").trim();

  if (!isValidTableName(tabla)) {
    return res.status(400).json({ error: "Tabla invalida" });
  }

  if (!registroId) {
    return res.status(400).json({ error: "Registro invalido" });
  }

  try {
    const r = await db.query(
      `
      WITH creacion AS (
        SELECT a.usuario_id, a.fecha
        FROM auditoria a
        WHERE a.tabla = $1
          AND a.registro_id = $2
          AND a.accion = 'INSERT'
        ORDER BY a.fecha ASC
        LIMIT 1
      ),
      modificacion AS (
        SELECT a.usuario_id, a.fecha
        FROM auditoria a
        WHERE a.tabla = $1
          AND a.registro_id = $2
          AND a.accion = 'UPDATE'
        ORDER BY a.fecha DESC
        LIMIT 1
      )
      SELECT
        c.usuario_id AS usuario_creacion_id,
        uc.usuario AS usuario_creacion,
        c.fecha AS fecha_creacion,
        m.usuario_id AS usuario_modificacion_id,
        um.usuario AS usuario_modificacion,
        m.fecha AS fecha_modificacion
      FROM creacion c
      FULL JOIN modificacion m ON TRUE
      LEFT JOIN usuario uc ON uc.id = c.usuario_id
      LEFT JOIN usuario um ON um.id = m.usuario_id
      `,
      [tabla, registroId]
    );

    res.json(
      r.rows[0] || {
        usuario_creacion_id: null,
        usuario_creacion: null,
        fecha_creacion: null,
        usuario_modificacion_id: null,
        usuario_modificacion: null,
        fecha_modificacion: null
      }
    );
  } catch (err) {
    console.error("ERROR AUDITORIA RESUMEN:", err);
    res.status(500).json({ error: "Error consultando auditoria" });
  }
});

module.exports = router;
