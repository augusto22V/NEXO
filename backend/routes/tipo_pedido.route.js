const express = require("express");
const router = express.Router();
const pool = require("../db");
const authMiddleware = require("../Auth.middleware");

router.use(authMiddleware);

function toBool(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  if (typeof value === "number") return value === 1;
  return fallback;
}

function toPositiveInt(value, fallback = null) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.trunc(n);
}

function normalizeText(value) {
  return String(value || "").trim();
}

async function existsDuplicateTipoPedido({ nombre, codigo, excludeId = null }) {
  const nombreNorm = normalizeText(nombre).toLowerCase();
  const codigoNorm = toPositiveInt(codigo, 0);
  const excludeNorm = toPositiveInt(excludeId, 0);

  const result = await pool.query(
    `
      SELECT 1
      FROM tipo_pedido
      WHERE (LOWER(nombre) = $1 OR ($2 > 0 AND id_tipo_pedido = $2))
        AND ($3 = 0 OR id_tipo_pedido <> $3)
      LIMIT 1
    `,
    [nombreNorm, codigoNorm, excludeNorm]
  );

  return result.rowCount > 0;
}

async function syncTipoPedidoSequence() {
  await pool.query(`
    SELECT setval(
      'public.tipo_pedido_id_tipo_pedido_seq',
      COALESCE((SELECT MAX(id_tipo_pedido) FROM tipo_pedido), 0) + 1,
      false
    )
  `);
}

// =======================================
// GET TODOS
// =======================================
router.get("/", async (_req, res) => {
  try {
    const r = await pool.query(`
      SELECT
        id_tipo_pedido,
        nombre,
        descripcion,
        estado
      FROM tipo_pedido
      ORDER BY id_tipo_pedido ASC
    `);

    res.json(r.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al listar tipos de pedido" });
  }
});

// =======================================
// GET PROXIMO ID
// =======================================
router.get("/next-id", async (_req, res) => {
  try {
    const r = await pool.query(`
      SELECT COALESCE(MAX(id_tipo_pedido), 0) + 1 AS next_id
      FROM tipo_pedido
    `);
    res.json({ next_id: Number(r.rows[0]?.next_id || 1) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error obteniendo codigo" });
  }
});

// =======================================
// GET POR ID
// =======================================
router.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "ID invalido" });

  try {
    const r = await pool.query(
      `
        SELECT
          id_tipo_pedido,
          nombre,
          descripcion,
          estado
        FROM tipo_pedido
        WHERE id_tipo_pedido = $1
      `,
      [id]
    );

    if (!r.rowCount) return res.status(404).json({ error: "Tipo pedido no encontrado" });
    res.json(r.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al buscar tipo pedido" });
  }
});

// =======================================
// GUARDAR (UPSERT)
// =======================================
router.post("/", async (req, res) => {
  const nombre = normalizeText(req.body?.nombre);
  const descripcion = normalizeText(req.body?.descripcion) || null;
  const estado = toBool(req.body?.estado, true);
  const idTipoPedido = toPositiveInt(req.body?.id_tipo_pedido);
  const codigo = toPositiveInt(req.body?.codigo);
  const codigoEfectivo = idTipoPedido || codigo || null;

  if (!nombre) {
    return res.status(400).json({ error: "Nombre requerido" });
  }

  try {
    const current = codigoEfectivo
      ? await pool.query(
          `SELECT id_tipo_pedido FROM tipo_pedido WHERE id_tipo_pedido = $1 LIMIT 1`,
          [codigoEfectivo]
        )
      : { rowCount: 0, rows: [] };

    const isEdit = current.rowCount > 0;
    const currentId = isEdit ? Number(current.rows[0].id_tipo_pedido) : null;

    const duplicate = await existsDuplicateTipoPedido({
      nombre,
      codigo: codigoEfectivo,
      excludeId: currentId
    });

    if (duplicate) {
      return res.status(400).json({ error: "Ya existe otro tipo con ese nombre o codigo" });
    }

    if (isEdit) {
      const updated = await pool.query(
        `
          UPDATE tipo_pedido
          SET nombre = $1,
              descripcion = $2,
              estado = $3
          WHERE id_tipo_pedido = $4
          RETURNING id_tipo_pedido, nombre, descripcion, estado
        `,
        [nombre, descripcion, estado, currentId]
      );

      return res.json(updated.rows[0]);
    }

    await syncTipoPedidoSequence();

    const created = await pool.query(
      `
        INSERT INTO tipo_pedido (nombre, descripcion, estado)
        VALUES ($1, $2, $3)
        RETURNING id_tipo_pedido, nombre, descripcion, estado
      `,
      [nombre, descripcion, estado]
    );

    res.json(created.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al guardar tipo pedido" });
  }
});

// =======================================
// ACTUALIZAR (COMPATIBILIDAD)
// =======================================
router.put("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const nombre = normalizeText(req.body?.nombre);
  const descripcion = normalizeText(req.body?.descripcion) || null;
  const estado = req.body?.estado;
  const codigo = toPositiveInt(req.body?.codigo) || id;

  if (!id) return res.status(400).json({ error: "ID invalido" });
  if (!nombre) return res.status(400).json({ error: "Nombre requerido" });

  try {
    const duplicate = await existsDuplicateTipoPedido({
      nombre,
      codigo,
      excludeId: id
    });

    if (duplicate) {
      return res.status(400).json({ error: "Ya existe otro tipo con ese nombre o codigo" });
    }

    const updated = await pool.query(
      `
        UPDATE tipo_pedido
        SET nombre = $1,
            descripcion = $2,
            estado = $3
        WHERE id_tipo_pedido = $4
        RETURNING id_tipo_pedido, nombre, descripcion, estado
      `,
      [nombre, descripcion, toBool(estado, true), id]
    );

    if (!updated.rowCount) return res.status(404).json({ error: "Tipo pedido no encontrado" });
    res.json(updated.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al actualizar" });
  }
});

// =======================================
// ELIMINAR
// =======================================
router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);

  if (!id) return res.status(400).json({ error: "ID invalido" });

  try {
    const enUso = await pool.query(
      `
        SELECT 1 FROM venta WHERE tipo_pedido_id = $1 LIMIT 1
      `,
      [id]
    );

    if (enUso.rowCount > 0) {
      return res.status(400).json({
        error: "No se puede eliminar, esta en uso en ventas"
      });
    }

    await pool.query(
      `
        DELETE FROM tipo_pedido
        WHERE id_tipo_pedido = $1
      `,
      [id]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al eliminar" });
  }
});

module.exports = router;
