const express = require("express");
const router = express.Router();
const pool = require("../db");
const { ensureProgramasSchema } = require("../services/programas.service");

function normalizeCode(value) {
  return String(value || "").trim().toUpperCase();
}

function normalizeCodes(codes) {
  const unique = new Set();
  for (const code of Array.isArray(codes) ? codes : []) {
    const normalized = normalizeCode(code);
    if (normalized) unique.add(normalized);
  }
  return Array.from(unique);
}

async function getAssignment(userId) {
  const r = await pool.query(
    `
    SELECT
      up.usuario_id,
      BOOL_OR(up.programa_id IS NULL) AS manual_marker,
      MAX(up.rol_snapshot) AS role,
      MAX(up.updated_at) AS updated_at,
      COALESCE(
        ARRAY_AGG(DISTINCT p.codigo) FILTER (WHERE p.codigo IS NOT NULL),
        ARRAY[]::text[]
      ) AS codes
    FROM usuario_programa up
    LEFT JOIN programas p ON p.id = up.programa_id
    WHERE up.usuario_id = $1
    GROUP BY up.usuario_id
    `,
    [Number(userId)]
  );

  if (!r.rows.length) return null;

  const row = r.rows[0];
  return {
    user_id: Number(row.usuario_id),
    manual: Boolean(row.manual_marker) || (Array.isArray(row.codes) && row.codes.length > 0),
    role: row.role || null,
    updated_at: row.updated_at || null,
    codes: Array.isArray(row.codes) ? row.codes.map((c) => normalizeCode(c)).filter(Boolean) : []
  };
}

router.get("/catalogo", async (_req, res) => {
  try {
    await ensureProgramasSchema();

    const r = await pool.query(
      `
      SELECT
        id, codigo, nombre, ruta, zona, categoria, icono,
        visible_home, visible_admin, activo, orden_menu
      FROM programas
      ORDER BY zona, orden_menu, codigo
      `
    );
    res.json(r.rows);
  } catch (error) {
    console.error("GET /api/programas/catalogo", error);
    res.status(500).json({ error: "No se pudo cargar catalogo de programas" });
  }
});

router.post("/catalogo", async (req, res) => {
  try {
    await ensureProgramasSchema();

    const id = Number(req.body?.id || 0);
    const codigo = normalizeCode(req.body?.codigo);
    const nombre = String(req.body?.nombre || "").trim();
    const ruta = String(req.body?.ruta || "").trim();
    const zona = String(req.body?.zona || "operativo").trim().toLowerCase() === "admin" ? "admin" : "operativo";
    const categoria = String(req.body?.categoria || "General").trim();
    const icono = String(req.body?.icono || "fa-circle").trim();
    const visible_home = Boolean(req.body?.visible_home);
    const visible_admin = Boolean(req.body?.visible_admin);
    const activo = req.body?.activo !== false;
    const orden_menu = Number(req.body?.orden_menu || 0);

    if (!codigo || !nombre || !ruta) {
      return res.status(400).json({ error: "codigo, nombre y ruta son requeridos" });
    }

    let query;
    let params;

    if (id > 0) {
      query = `
        UPDATE programas
        SET codigo = $1,
            nombre = $2,
            ruta = $3,
            zona = $4,
            categoria = $5,
            icono = $6,
            visible_home = $7,
            visible_admin = $8,
            activo = $9,
            orden_menu = $10,
            updated_at = NOW()
        WHERE id = $11
        RETURNING id, codigo, nombre, ruta, zona, categoria, icono, visible_home, visible_admin, activo, orden_menu
      `;
      params = [codigo, nombre, ruta, zona, categoria, icono, visible_home, visible_admin, activo, orden_menu, id];
    } else {
      query = `
        INSERT INTO programas (
          codigo, nombre, ruta, zona, categoria, icono, visible_home, visible_admin, activo, orden_menu
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
        )
        RETURNING id, codigo, nombre, ruta, zona, categoria, icono, visible_home, visible_admin, activo, orden_menu
      `;
      params = [codigo, nombre, ruta, zona, categoria, icono, visible_home, visible_admin, activo, orden_menu];
    }

    const r = await pool.query(query, params);
    if (!r.rows.length) return res.status(404).json({ error: "Programa no encontrado" });
    res.json(r.rows[0]);
  } catch (error) {
    console.error("POST /api/programas/catalogo", error);
    res.status(500).json({ error: "No se pudo guardar programa" });
  }
});

router.delete("/catalogo/:id", async (req, res) => {
  try {
    await ensureProgramasSchema();

    const id = Number(req.params.id || 0);
    if (!id) return res.status(400).json({ error: "ID invalido" });

    await pool.query(
      `
      UPDATE programas
      SET activo = false, updated_at = NOW()
      WHERE id = $1
      `,
      [id]
    );

    res.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/programas/catalogo/:id", error);
    res.status(500).json({ error: "No se pudo desactivar programa" });
  }
});

router.get("/asignaciones/:usuarioId", async (req, res) => {
  try {
    await ensureProgramasSchema();

    const usuarioId = Number(req.params.usuarioId || 0);
    if (!usuarioId) return res.status(400).json({ error: "usuarioId invalido" });

    const assignment = await getAssignment(usuarioId);
    res.json(assignment);
  } catch (error) {
    console.error("GET /api/programas/asignaciones/:usuarioId", error);
    res.status(500).json({ error: "No se pudo obtener asignacion" });
  }
});

router.post("/asignaciones/lote", async (req, res) => {
  try {
    await ensureProgramasSchema();

    const idsRaw = Array.isArray(req.body?.usuarioIds) ? req.body.usuarioIds : [];
    const userIds = Array.from(new Set(idsRaw.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0)));
    if (!userIds.length) return res.json({});

    const r = await pool.query(
      `
      SELECT
        up.usuario_id,
        BOOL_OR(up.programa_id IS NULL) AS manual_marker,
        MAX(up.rol_snapshot) AS role,
        MAX(up.updated_at) AS updated_at,
        COALESCE(
          ARRAY_AGG(DISTINCT p.codigo) FILTER (WHERE p.codigo IS NOT NULL),
          ARRAY[]::text[]
        ) AS codes
      FROM usuario_programa up
      LEFT JOIN programas p ON p.id = up.programa_id
      WHERE up.usuario_id = ANY($1::int[])
      GROUP BY up.usuario_id
      `,
      [userIds]
    );

    const map = {};
    for (const row of r.rows) {
      const key = String(row.usuario_id);
      map[key] = {
        user_id: Number(row.usuario_id),
        manual: Boolean(row.manual_marker) || (Array.isArray(row.codes) && row.codes.length > 0),
        role: row.role || null,
        updated_at: row.updated_at || null,
        codes: Array.isArray(row.codes) ? row.codes.map((c) => normalizeCode(c)).filter(Boolean) : []
      };
    }

    res.json(map);
  } catch (error) {
    console.error("POST /api/programas/asignaciones/lote", error);
    res.status(500).json({ error: "No se pudo cargar asignaciones" });
  }
});

router.post("/asignaciones/:usuarioId", async (req, res) => {
  const client = await pool.connect();
  try {
    await ensureProgramasSchema();

    const usuarioId = Number(req.params.usuarioId || 0);
    if (!usuarioId) return res.status(400).json({ error: "usuarioId invalido" });

    const manual = req.body?.manual !== false;
    const role = String(req.body?.role || "").trim().toUpperCase() || null;
    const codes = normalizeCodes(req.body?.codes);

    await client.query("BEGIN");
    await client.query("DELETE FROM usuario_programa WHERE usuario_id = $1", [usuarioId]);

    if (manual) {
      await client.query(
        `
        INSERT INTO usuario_programa (usuario_id, programa_id, rol_snapshot, updated_at)
        VALUES ($1, NULL, $2, NOW())
        `,
        [usuarioId, role]
      );

      if (codes.length) {
        const catalogo = await client.query(
          `
          SELECT id, codigo
          FROM programas
          WHERE codigo = ANY($1::text[])
          `,
          [codes]
        );

        const byCode = new Map(catalogo.rows.map((row) => [normalizeCode(row.codigo), Number(row.id)]));
        for (const code of codes) {
          const programId = byCode.get(code);
          if (!programId) continue;
          await client.query(
            `
            INSERT INTO usuario_programa (usuario_id, programa_id, rol_snapshot, updated_at)
            VALUES ($1, $2, $3, NOW())
            ON CONFLICT (usuario_id, programa_id) WHERE programa_id IS NOT NULL
            DO UPDATE SET rol_snapshot = EXCLUDED.rol_snapshot, updated_at = NOW()
            `,
            [usuarioId, programId, role]
          );
        }
      }
    }

    await client.query("COMMIT");
    const assignment = await getAssignment(usuarioId);
    res.json(assignment);
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("POST /api/programas/asignaciones/:usuarioId", error);
    res.status(500).json({ error: "No se pudo guardar asignacion de usuario" });
  } finally {
    client.release();
  }
});

router.delete("/asignaciones/:usuarioId", async (req, res) => {
  try {
    await ensureProgramasSchema();

    const usuarioId = Number(req.params.usuarioId || 0);
    if (!usuarioId) return res.status(400).json({ error: "usuarioId invalido" });

    await pool.query("DELETE FROM usuario_programa WHERE usuario_id = $1", [usuarioId]);
    res.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/programas/asignaciones/:usuarioId", error);
    res.status(500).json({ error: "No se pudo limpiar asignacion" });
  }
});

module.exports = router;
