const express = require("express");
const router = express.Router();
const db = require("../db");
const authMiddleware = require("../Auth.middleware");
const { ensureOperacionCatalogSchema } = require("../services/operacion.catalog.service");

router.use(authMiddleware);

function toBool(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "t", "si", "s", "yes", "y", "on"].includes(normalized)) return true;
    if (["false", "0", "f", "no", "n", "off"].includes(normalized)) return false;
  }
  if (typeof value === "number") return value === 1;
  return fallback;
}

function normalizeTipo(value) {
  const tipo = String(value || "").trim().toUpperCase();
  return ["E", "S"].includes(tipo) ? tipo : null;
}

function normalizeCodigo(value) {
  const txt = String(value || "").trim();
  if (!/^\d+$/.test(txt)) return null;
  const numero = Number(txt);
  return Number.isFinite(numero) && numero > 0 ? Math.trunc(numero) : null;
}

router.get("/", async (req, res) => {
  try {
    await ensureOperacionCatalogSchema();

    const tipo = normalizeTipo(req.query.tipo);
    const soloActivos = req.query.activo == null ? null : toBool(req.query.activo, true);
    const buscar = String(req.query.buscar || req.query.q || "").trim();

    const where = [];
    const params = [];

    if (tipo) {
      params.push(tipo);
      where.push(`UPPER(TRIM(tipo::text)) = $${params.length}`);
    }

    if (soloActivos != null) {
      params.push(Boolean(soloActivos));
      where.push(`activo = $${params.length}`);
    }

    if (buscar) {
      params.push(`%${buscar}%`);
      where.push(`(
        CAST(codigo AS text) ILIKE $${params.length}
        OR descripcion ILIKE $${params.length}
      )`);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const r = await db.query(
      `
        SELECT
          id,
          codigo,
          descripcion,
          tipo,
          afecta_stock,
          requiere_confirmacion,
          genera_financiero,
          permite_credito,
          requiere_credito,
          activo
        FROM tipo_operacion
        ${whereSql}
        ORDER BY codigo ASC NULLS LAST, id ASC
      `,
      params
    );

    res.json(r.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al listar operaciones" });
  }
});

router.get("/next-id", async (_req, res) => {
  try {
    await ensureOperacionCatalogSchema();
    const r = await db.query(`
      SELECT COALESCE(
               MAX(
                 NULLIF(
                   REGEXP_REPLACE(codigo::text, '[^0-9]', '', 'g'),
                   ''
                 )::integer
               ),
               0
             ) + 1 AS next_id
      FROM tipo_operacion
    `);
    res.json({ next_id: Number(r.rows[0]?.next_id || 1) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error obteniendo codigo" });
  }
});

router.get("/codigo/:codigo", async (req, res) => {
  try {
    await ensureOperacionCatalogSchema();

    const codigo = normalizeCodigo(req.params.codigo);
    if (!codigo) return res.status(400).json({ error: "Codigo invalido" });

    const tipo = normalizeTipo(req.query.tipo);
    const soloActivos = req.query.activo == null ? true : toBool(req.query.activo, true);
    const params = [codigo];
    const whereExtra = [];

    if (tipo) {
      params.push(tipo);
      whereExtra.push(`AND UPPER(TRIM(tipo::text)) = $${params.length}`);
    }
    if (soloActivos != null) {
      params.push(Boolean(soloActivos));
      whereExtra.push(`AND activo = $${params.length}`);
    }

    const r = await db.query(
      `
        SELECT
          id,
          codigo,
          descripcion,
          tipo,
          afecta_stock,
          requiere_confirmacion,
          genera_financiero,
          permite_credito,
          requiere_credito,
          activo
        FROM tipo_operacion
        WHERE codigo = $1
        ${whereExtra.join("\n")}
        LIMIT 1
      `,
      params
    );

    if (!r.rowCount) return res.status(404).json({ error: "Operacion no encontrada" });
    res.json(r.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al buscar operacion por codigo" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    await ensureOperacionCatalogSchema();

    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "ID invalido" });

    const r = await db.query(
      `
        SELECT
          id,
          codigo,
          descripcion,
          tipo,
          afecta_stock,
          requiere_confirmacion,
          genera_financiero,
          permite_credito,
          requiere_credito,
          activo
        FROM tipo_operacion
        WHERE id = $1
      `,
      [id]
    );

    if (!r.rowCount) return res.status(404).json({ error: "Operacion no encontrada" });
    res.json(r.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al buscar operacion" });
  }
});

router.post("/", async (req, res) => {
  const {
    codigo,
    descripcion,
    tipo,
    afecta_stock,
    requiere_confirmacion,
    genera_financiero,
    permite_credito,
    requiere_credito,
    activo
  } = req.body || {};

  if (!codigo || !descripcion || !tipo) {
    return res.status(400).json({ error: "Codigo, descripcion y tipo son requeridos" });
  }

  const codigoNormalizado = normalizeCodigo(codigo);
  if (!codigoNormalizado) return res.status(400).json({ error: "Codigo invalido" });

  const tipoNormalizado = normalizeTipo(tipo);
  if (!tipoNormalizado) {
    return res.status(400).json({ error: "Tipo invalido. Debe ser E o S" });
  }

  try {
    await ensureOperacionCatalogSchema();

    const existe = await db.query(
      `
        SELECT 1
        FROM tipo_operacion
        WHERE codigo = $1
        LIMIT 1
      `,
      [codigoNormalizado]
    );

    if (existe.rowCount > 0) {
      return res.status(400).json({ error: "Ya existe una operacion con ese codigo" });
    }

    const inserted = await db.query(
      `
        INSERT INTO tipo_operacion
          (
            codigo,
            descripcion,
            tipo,
            afecta_stock,
            requiere_confirmacion,
            genera_financiero,
            permite_credito,
            requiere_credito,
            activo
          )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        RETURNING
          id,
          codigo,
          descripcion,
          tipo,
          afecta_stock,
          requiere_confirmacion,
          genera_financiero,
          permite_credito,
          requiere_credito,
          activo
      `,
      [
        codigoNormalizado,
        String(descripcion).trim(),
        tipoNormalizado,
        toBool(afecta_stock, false),
        toBool(requiere_confirmacion, false),
        toBool(genera_financiero, false),
        toBool(permite_credito, false),
        toBool(requiere_credito, false),
        toBool(activo, true)
      ]
    );

    res.json(inserted.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al crear operacion" });
  }
});

router.put("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const {
    codigo,
    descripcion,
    tipo,
    afecta_stock,
    requiere_confirmacion,
    genera_financiero,
    permite_credito,
    requiere_credito,
    activo
  } = req.body || {};

  if (!id) return res.status(400).json({ error: "ID invalido" });
  if (!codigo || !descripcion || !tipo) {
    return res.status(400).json({ error: "Codigo, descripcion y tipo son requeridos" });
  }

  const codigoNormalizado = normalizeCodigo(codigo);
  if (!codigoNormalizado) return res.status(400).json({ error: "Codigo invalido" });

  const tipoNormalizado = normalizeTipo(tipo);
  if (!tipoNormalizado) {
    return res.status(400).json({ error: "Tipo invalido. Debe ser E o S" });
  }

  try {
    await ensureOperacionCatalogSchema();

    const existe = await db.query(
      `
        SELECT 1
        FROM tipo_operacion
        WHERE codigo = $1
          AND id <> $2
        LIMIT 1
      `,
      [codigoNormalizado, id]
    );

    if (existe.rowCount > 0) {
      return res.status(400).json({ error: "Ya existe una operacion con ese codigo" });
    }

    const updated = await db.query(
      `
        UPDATE tipo_operacion
        SET codigo = $1,
            descripcion = $2,
            tipo = $3,
            afecta_stock = $4,
            requiere_confirmacion = $5,
            genera_financiero = $6,
            permite_credito = $7,
            requiere_credito = $8,
            activo = $9
        WHERE id = $10
        RETURNING
          id,
          codigo,
          descripcion,
          tipo,
          afecta_stock,
          requiere_confirmacion,
          genera_financiero,
          permite_credito,
          requiere_credito,
          activo
      `,
      [
        codigoNormalizado,
        String(descripcion).trim(),
        tipoNormalizado,
        toBool(afecta_stock, false),
        toBool(requiere_confirmacion, false),
        toBool(genera_financiero, false),
        toBool(permite_credito, false),
        toBool(requiere_credito, false),
        toBool(activo, true),
        id
      ]
    );

    if (!updated.rowCount) {
      return res.status(404).json({ error: "Operacion no encontrada" });
    }

    res.json(updated.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al actualizar operacion" });
  }
});

router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "ID invalido" });

  try {
    await ensureOperacionCatalogSchema();

    const updated = await db.query(
      `
        UPDATE tipo_operacion
        SET activo = false
        WHERE id = $1
        RETURNING id
      `,
      [id]
    );

    if (!updated.rowCount) {
      return res.status(404).json({ error: "Operacion no encontrada" });
    }

    res.json({ ok: true, inactivada: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al inactivar operacion" });
  }
});

module.exports = router;
