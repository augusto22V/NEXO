const express = require("express");
const router = express.Router();
const pool = require("../db");
const authMiddleware = require("../Auth.middleware");

const MONEDA_BASE = Object.freeze({
  PYG: 1,
  BRL: 2,
  USD: 3
});

const MONEDA_CODE_TO_DB = Object.freeze({
  BRL: "REAL",
  USD: "DOLAR"
});

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeMonedaBaseId(value, fallback = MONEDA_BASE.PYG) {
  const id = Number(value);
  if (id === MONEDA_BASE.PYG || id === MONEDA_BASE.BRL || id === MONEDA_BASE.USD) return id;
  return fallback;
}

function normalizeMonedaText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9$]/gi, "")
    .toUpperCase();
}

function resolveCotizacionCode(moneda) {
  const txt = normalizeMonedaText(moneda);
  if (!txt) return null;
  if (["REAL", "BRL", "R$"].includes(txt)) return "BRL";
  if (["DOLAR", "DOLARES", "USD", "US$", "U$S"].includes(txt)) return "USD";
  return null;
}

function monedaBaseNombre(monedaBaseId) {
  const id = normalizeMonedaBaseId(monedaBaseId, MONEDA_BASE.PYG);
  if (id === MONEDA_BASE.BRL) return "Real";
  if (id === MONEDA_BASE.USD) return "Dolar";
  return "Guarani";
}

async function getLastCotizacionId(client = pool) {
  const result = await client.query(`
    WITH last_audit AS (
      SELECT a.registro_id
      FROM auditoria a
      WHERE a.tabla = 'cotizacion'
        AND a.accion IN ('INSERT', 'UPDATE')
        AND a.registro_id ~ '^[0-9]+$'
      ORDER BY a.fecha DESC, a.id DESC
      LIMIT 1
    ),
    last_row AS (
      SELECT c.id
      FROM cotizacion c
      ORDER BY c.id DESC
      LIMIT 1
    )
    SELECT COALESCE(
      (SELECT registro_id::bigint FROM last_audit),
      (SELECT id FROM last_row)
    ) AS last_id
  `);

  return Number(result.rows[0]?.last_id) || null;
}

async function resolveEmpresaContext(client, req = {}) {
  const empresaIdRaw = req?.query?.empresa_id || req?.body?.empresa_id || req?.usuario?.empresa_id;
  const empresaId = Number(empresaIdRaw || 0);

  if (empresaId > 0) {
    const byId = await client.query(
      `
        SELECT id, nombre, COALESCE(moneda_base_id, 1) AS moneda_base_id
        FROM empresa
        WHERE id = $1
        LIMIT 1
      `,
      [empresaId]
    );

    if (byId.rowCount) {
      const row = byId.rows[0];
      return {
        empresa_id: Number(row.id),
        empresa_nombre: row.nombre || "",
        moneda_base_id: normalizeMonedaBaseId(row.moneda_base_id, MONEDA_BASE.PYG)
      };
    }
  }

  const fallback = await client.query(
    `
      SELECT id, nombre, COALESCE(moneda_base_id, 1) AS moneda_base_id
      FROM empresa
      WHERE activa = true
      ORDER BY id ASC
      LIMIT 1
    `
  );

  if (!fallback.rowCount) {
    return {
      empresa_id: null,
      empresa_nombre: "",
      moneda_base_id: MONEDA_BASE.PYG
    };
  }

  const row = fallback.rows[0];
  return {
    empresa_id: Number(row.id),
    empresa_nombre: row.nombre || "",
    moneda_base_id: normalizeMonedaBaseId(row.moneda_base_id, MONEDA_BASE.PYG)
  };
}

async function readCotizacionActiva(client = pool) {
  const result = await client.query(`
    SELECT id, moneda, valor_indice
    FROM cotizacion
    WHERE activa = true
    ORDER BY id DESC
  `);

  const snapshot = {
    brl: 0,
    usd: 0,
    lastCotizacionId: null
  };

  for (const row of result.rows) {
    const code = resolveCotizacionCode(row.moneda);
    if (code === "BRL" && snapshot.brl <= 0) {
      snapshot.brl = toNumber(row.valor_indice, 0);
      if (!snapshot.lastCotizacionId) snapshot.lastCotizacionId = Number(row.id) || null;
    }
    if (code === "USD" && snapshot.usd <= 0) {
      snapshot.usd = toNumber(row.valor_indice, 0);
      if (!snapshot.lastCotizacionId) snapshot.lastCotizacionId = Number(row.id) || null;
    }
  }

  if (!snapshot.lastCotizacionId) {
    snapshot.lastCotizacionId = await getLastCotizacionId(client);
  }

  return snapshot;
}

function buildEquivalencias(brlGs, usdGs) {
  const brl = Math.max(toNumber(brlGs, 0), 0);
  const usd = Math.max(toNumber(usdGs, 0), 0);

  return {
    pyg: {
      real: brl,
      dolar: usd
    },
    brl: {
      guarani: brl > 0 ? 1 / brl : 0,
      dolar: brl > 0 ? usd / brl : 0
    },
    usd: {
      guarani: usd > 0 ? 1 / usd : 0,
      real: usd > 0 ? brl / usd : 0
    }
  };
}

function buildResumen(monedaBaseId, equivalencias) {
  const baseId = normalizeMonedaBaseId(monedaBaseId, MONEDA_BASE.PYG);

  if (baseId === MONEDA_BASE.BRL) {
    return {
      linea1: {
        label: "1 Guarani =",
        valor: toNumber(equivalencias?.brl?.guarani, 0),
        sufijo: "Real"
      },
      linea2: {
        label: "1 Dolar =",
        valor: toNumber(equivalencias?.brl?.dolar, 0),
        sufijo: "Real"
      }
    };
  }

  if (baseId === MONEDA_BASE.USD) {
    return {
      linea1: {
        label: "1 Guarani =",
        valor: toNumber(equivalencias?.usd?.guarani, 0),
        sufijo: "Dolar"
      },
      linea2: {
        label: "1 Real =",
        valor: toNumber(equivalencias?.usd?.real, 0),
        sufijo: "Dolar"
      }
    };
  }

  return {
    linea1: {
      label: "1 Real =",
      valor: toNumber(equivalencias?.pyg?.real, 0),
      sufijo: "Guarani"
    },
    linea2: {
      label: "1 Dolar =",
      valor: toNumber(equivalencias?.pyg?.dolar, 0),
      sufijo: "Guarani"
    }
  };
}

function parseCotizacionesInput(payload = {}) {
  const entries = Array.isArray(payload?.cotizaciones) ? payload.cotizaciones : [];
  const parsed = { BRL: null, USD: null };

  for (const row of entries) {
    const code = resolveCotizacionCode(row?.moneda || row?.codigo || row?.code);
    if (!code) continue;

    const value = toNumber(row?.valor_indice ?? row?.valor ?? row?.valorIndice, NaN);
    if (!Number.isFinite(value) || value <= 0) continue;
    parsed[code] = value;
  }

  return parsed;
}

async function deactivateCotizacionCode(client, code) {
  const active = await client.query(`
    SELECT id, moneda
    FROM cotizacion
    WHERE activa = true
  `);

  const ids = active.rows
    .filter((row) => resolveCotizacionCode(row.moneda) === code)
    .map((row) => Number(row.id))
    .filter((id) => Number.isFinite(id) && id > 0);

  if (!ids.length) return;

  await client.query(
    `
      UPDATE cotizacion
      SET activa = false
      WHERE id = ANY($1::bigint[])
    `,
    [ids]
  );
}

async function deactivateUnsupportedActiveCotizaciones(client) {
  const active = await client.query(`
    SELECT id, moneda
    FROM cotizacion
    WHERE activa = true
  `);

  const unsupportedIds = active.rows
    .filter((row) => !resolveCotizacionCode(row.moneda))
    .map((row) => Number(row.id))
    .filter((id) => Number.isFinite(id) && id > 0);

  if (!unsupportedIds.length) return;

  await client.query(
    `
      UPDATE cotizacion
      SET activa = false
      WHERE id = ANY($1::bigint[])
    `,
    [unsupportedIds]
  );
}

async function saveCotizacionCode(client, code, value) {
  await deactivateCotizacionCode(client, code);

  const moneda = MONEDA_CODE_TO_DB[code];
  const insert = await client.query(
    `
      INSERT INTO cotizacion (moneda, valor_indice, activa)
      VALUES ($1, $2, true)
      RETURNING id
    `,
    [moneda, value]
  );

  return Number(insert.rows[0]?.id) || null;
}

router.get("/hoy", async (req, res) => {
  try {
    const [empresa, snapshot] = await Promise.all([
      resolveEmpresaContext(pool, req),
      readCotizacionActiva(pool)
    ]);

    const equivalencias = buildEquivalencias(snapshot.brl, snapshot.usd);

    res.json({
      brl: snapshot.brl,
      usd: snapshot.usd,
      lastCotizacionId: snapshot.lastCotizacionId,
      empresa_id: empresa.empresa_id,
      empresa_nombre: empresa.empresa_nombre,
      moneda_base_id: empresa.moneda_base_id,
      moneda_base_nombre: monedaBaseNombre(empresa.moneda_base_id),
      equivalencias,
      resumen: buildResumen(empresa.moneda_base_id, equivalencias),
      monedas_activas: {
        1: "Guarani",
        2: "Real",
        3: "Dolar"
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error obteniendo cotizacion" });
  }
});

router.get("/ultima-id", async (_req, res) => {
  try {
    const lastCotizacionId = await getLastCotizacionId(pool);
    res.json({ lastCotizacionId });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error obteniendo ultima cotizacion" });
  }
});

router.get("/base-moneda", async (req, res) => {
  try {
    const empresa = await resolveEmpresaContext(pool, req);
    res.json({
      empresa_id: empresa.empresa_id,
      empresa_nombre: empresa.empresa_nombre,
      moneda_base_id: empresa.moneda_base_id,
      moneda_base_nombre: monedaBaseNombre(empresa.moneda_base_id),
      monedas_activas: {
        1: "Guarani",
        2: "Real",
        3: "Dolar"
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "No se pudo obtener moneda base" });
  }
});

router.put("/base-moneda", authMiddleware, async (req, res) => {
  try {
    const empresa = await resolveEmpresaContext(pool, req);
    if (!empresa.empresa_id) {
      return res.status(400).json({ error: "Empresa no encontrada para actualizar moneda base" });
    }

    const hasValue = Object.prototype.hasOwnProperty.call(req.body || {}, "moneda_base_id");
    if (!hasValue) {
      return res.status(400).json({ error: "moneda_base_id requerido" });
    }

    const monedaBaseId = normalizeMonedaBaseId(req.body.moneda_base_id, NaN);
    if (!Number.isFinite(monedaBaseId)) {
      return res.status(400).json({ error: "moneda_base_id invalido (use 1, 2 o 3)" });
    }

    const update = await pool.query(
      `
        UPDATE empresa
        SET moneda_base_id = $1
        WHERE id = $2
        RETURNING id, nombre, moneda_base_id
      `,
      [monedaBaseId, empresa.empresa_id]
    );

    if (!update.rowCount) {
      return res.status(404).json({ error: "Empresa no encontrada" });
    }

    const row = update.rows[0];
    const normalized = normalizeMonedaBaseId(row.moneda_base_id, MONEDA_BASE.PYG);
    res.json({
      ok: true,
      empresa_id: Number(row.id),
      empresa_nombre: row.nombre || "",
      moneda_base_id: normalized,
      moneda_base_nombre: monedaBaseNombre(normalized),
      monedas_activas: {
        1: "Guarani",
        2: "Real",
        3: "Dolar"
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "No se pudo actualizar moneda base" });
  }
});

router.post("/guardar", async (req, res) => {
  const parsed = parseCotizacionesInput(req.body || {});

  if (!Number.isFinite(parsed.BRL) || parsed.BRL <= 0 || !Number.isFinite(parsed.USD) || parsed.USD <= 0) {
    return res.status(400).json({
      error: "Debe informar cotizacion valida para Real y Dolar"
    });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await deactivateUnsupportedActiveCotizaciones(client);

    let lastCotizacionId = await saveCotizacionCode(client, "BRL", parsed.BRL);
    const lastUsdId = await saveCotizacionCode(client, "USD", parsed.USD);
    if (lastUsdId) lastCotizacionId = lastUsdId;

    if (!lastCotizacionId) {
      lastCotizacionId = await getLastCotizacionId(client);
    }

    await client.query("COMMIT");
    res.json({
      ok: true,
      lastCotizacionId,
      brl: parsed.BRL,
      usd: parsed.USD
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(error);
    res.status(500).json({ error: "Error guardando cotizacion" });
  } finally {
    client.release();
  }
});

module.exports = router;
