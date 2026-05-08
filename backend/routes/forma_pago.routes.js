const express = require("express");
const router = express.Router();
const db = require("../db");
const authMiddleware = require("../Auth.middleware");

router.use(authMiddleware);

const SELECT_FIELDS = `
  id,
  codigo,
  descripcion,
  cuotas,
  cuotas AS cantidad_cuotas,
  dias_intervalo,
  activo
`;

let schemaReadyPromise = null;

async function ensureCondicionPagoSchema() {
  if (schemaReadyPromise) return schemaReadyPromise;

  schemaReadyPromise = (async () => {
    await db.query(`
      ALTER TABLE condicion_pago
        ADD COLUMN IF NOT EXISTS codigo integer,
        ADD COLUMN IF NOT EXISTS descripcion varchar(120),
        ADD COLUMN IF NOT EXISTS cuotas integer DEFAULT 1,
        ADD COLUMN IF NOT EXISTS dias_intervalo integer DEFAULT 0,
        ADD COLUMN IF NOT EXISTS activo boolean DEFAULT true
    `);

    await db.query(`
      UPDATE condicion_pago
      SET codigo = id
      WHERE codigo IS NULL
    `);

    await db.query(`
      UPDATE condicion_pago
      SET descripcion = CONCAT('CONDICION ', id)
      WHERE descripcion IS NULL OR BTRIM(descripcion) = ''
    `);

    await db.query(`
      UPDATE condicion_pago
      SET cuotas = 1
      WHERE cuotas IS NULL OR cuotas < 1
    `);

    await db.query(`
      UPDATE condicion_pago
      SET dias_intervalo = 0
      WHERE dias_intervalo IS NULL OR dias_intervalo < 0
    `);

    await db.query(`
      UPDATE condicion_pago
      SET activo = true
      WHERE activo IS NULL
    `);

  })();

  try {
    await schemaReadyPromise;
  } catch (err) {
    schemaReadyPromise = null;
    throw err;
  }
}

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

function toNumberOrNull(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n;
}

function toPositiveInt(value, fallback = null) {
  const n = toNumberOrNull(value);
  if (n === null) return fallback;
  if (n <= 0) return null;
  return Math.trunc(n);
}

function normalizeDescripcion(value) {
  return String(value || "").trim();
}

function parseCodigo(body) {
  return toPositiveInt(body?.codigo);
}

function parseCuotas(body) {
  const raw = body?.cuotas ?? body?.cantidad_cuotas ?? 1;
  return toPositiveInt(raw, 1);
}

function parseDiasIntervalo(body) {
  const raw = body?.dias_intervalo ?? body?.intervalo_dias ?? body?.diasIntervalo ?? 0;
  const n = toNumberOrNull(raw);
  if (n === null) return 0;
  if (n < 0) return null;
  return Math.trunc(n);
}

async function existsDuplicate({ codigo, descripcion, excludeId = null }) {
  const result = await db.query(
    `
      SELECT 1
      FROM condicion_pago
      WHERE (codigo = $1 OR LOWER(BTRIM(descripcion)) = LOWER(BTRIM($2)))
        AND ($3::integer IS NULL OR id <> $3)
      LIMIT 1
    `,
    [codigo, descripcion, excludeId]
  );
  return result.rowCount > 0;
}

router.get("/", async (_req, res) => {
  try {
    await ensureCondicionPagoSchema();

    const r = await db.query(`
      SELECT ${SELECT_FIELDS}
      FROM condicion_pago
      ORDER BY id ASC
    `);
    res.json(r.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al listar formas de pago" });
  }
});

router.get("/next-id", async (_req, res) => {
  try {
    await ensureCondicionPagoSchema();

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
      FROM condicion_pago
    `);
    res.json({ next_id: Number(r.rows[0]?.next_id || 1) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error obteniendo codigo" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    await ensureCondicionPagoSchema();

    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "ID invalido" });

    const r = await db.query(
      `
        SELECT ${SELECT_FIELDS}
        FROM condicion_pago
        WHERE id = $1
      `,
      [id]
    );

    if (!r.rowCount) return res.status(404).json({ error: "Forma de pago no encontrada" });
    res.json(r.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al buscar forma de pago" });
  }
});

router.post("/", async (req, res) => {
  const codigo = parseCodigo(req.body);
  const descripcion = normalizeDescripcion(req.body?.descripcion);
  const cuotas = parseCuotas(req.body);
  const diasIntervalo = parseDiasIntervalo(req.body);
  const activo = toBool(req.body?.activo, true);

  if (!codigo) return res.status(400).json({ error: "Codigo invalido" });
  if (!descripcion) return res.status(400).json({ error: "Descripcion requerida" });
  if (!cuotas || cuotas < 1) return res.status(400).json({ error: "Cantidad de cuotas invalida (minimo 1)" });
  if (diasIntervalo === null || diasIntervalo < 0) {
    return res.status(400).json({ error: "Dias de intervalo invalido (minimo 0)" });
  }
  try {
    await ensureCondicionPagoSchema();

    const duplicate = await existsDuplicate({ codigo, descripcion });
    if (duplicate) {
      return res.status(400).json({ error: "Ya existe una forma de pago con ese codigo o descripcion" });
    }

    const inserted = await db.query(
      `
        INSERT INTO condicion_pago (codigo, descripcion, cuotas, dias_intervalo, activo)
        VALUES ($1,$2,$3,$4,$5)
        RETURNING ${SELECT_FIELDS}
      `,
      [codigo, descripcion, cuotas, diasIntervalo, activo]
    );

    res.json(inserted.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al crear forma de pago" });
  }
});

router.put("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const codigo = parseCodigo(req.body);
  const descripcion = normalizeDescripcion(req.body?.descripcion);
  const cuotas = parseCuotas(req.body);
  const diasIntervalo = parseDiasIntervalo(req.body);
  const activo = toBool(req.body?.activo, true);

  if (!id) return res.status(400).json({ error: "ID invalido" });
  if (!codigo) return res.status(400).json({ error: "Codigo invalido" });
  if (!descripcion) return res.status(400).json({ error: "Descripcion requerida" });
  if (!cuotas || cuotas < 1) return res.status(400).json({ error: "Cantidad de cuotas invalida (minimo 1)" });
  if (diasIntervalo === null || diasIntervalo < 0) {
    return res.status(400).json({ error: "Dias de intervalo invalido (minimo 0)" });
  }
  try {
    await ensureCondicionPagoSchema();

    const duplicate = await existsDuplicate({ codigo, descripcion, excludeId: id });
    if (duplicate) {
      return res.status(400).json({ error: "Ya existe una forma de pago con ese codigo o descripcion" });
    }

    const updated = await db.query(
      `
        UPDATE condicion_pago
        SET codigo = $1,
            descripcion = $2,
            cuotas = $3,
            dias_intervalo = $4,
            activo = $5
        WHERE id = $6
        RETURNING ${SELECT_FIELDS}
      `,
      [codigo, descripcion, cuotas, diasIntervalo, activo, id]
    );

    if (!updated.rowCount) {
      return res.status(404).json({ error: "Forma de pago no encontrada" });
    }

    res.json(updated.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al actualizar forma de pago" });
  }
});

router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "ID invalido" });

  try {
    await ensureCondicionPagoSchema();

    const enUso = await db.query(
      `
        SELECT 1
        FROM compra
        WHERE condicion_pago_id = $1
        LIMIT 1
      `,
      [id]
    );

    if (enUso.rowCount > 0) {
      return res.status(400).json({ error: "No se puede eliminar, esta en uso en compras" });
    }

    await db.query(`DELETE FROM condicion_pago WHERE id = $1`, [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al eliminar forma de pago" });
  }
});

module.exports = router;
