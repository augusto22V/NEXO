const express = require("express");
const router = express.Router();
const { POS_SIN_COCINA } = require("../config/pos.mode");
const pool = require("../db");
const {
  insertarDetallePago,
  normalizarPagos,
  prorratearPagos,
  resumirPagos,
  toNumber
} = require("../services/cajaPago.service");
const { clearMesaByVentaId } = require("../services/mesa.service");
const { ensureCajaSchema, registrarHistorialCaja } = require("../services/caja.service");
const { requirePermisoVentaRapida } = require("../services/permisos.service");

const ESTADO_ABIERTA = "ABIERTA";
const ESTADO_CERRADA = "CERRADA";
const MONEDA_IDS = Object.freeze({
  PYG: 1,
  BRL: 2,
  USD: 3
});

router.use(async (_req, res, next) => {
  try {
    await ensureCajaSchema();
    next();
  } catch (error) {
    console.error("No se pudo preparar esquema de caja:", error);
    res.status(500).json({ error: "No se pudo preparar esquema de caja" });
  }
});

function toId(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

function getEmpresaIdFromReq(req) {
  return toId(req?.usuario?.empresa_id || req?.user?.empresa_id);
}

function getTerminalIdFromReq(req) {
  return toId(req?.usuario?.terminal_id || req?.user?.terminal_id || req?.body?.terminal_id);
}

function getUsuarioIdFromReq(req) {
  const candidates = [
    req?.usuario?.id,
    req?.user?.id,
    req?.body?.usuario_id
  ];

  for (const candidate of candidates) {
    const id = toId(candidate);
    if (id) return id;
  }

  return null;
}

function getMesaScopeFromReq(req) {
  const empresaId = getEmpresaIdFromReq(req);
  const terminalId = getTerminalIdFromReq(req);

  if (!empresaId || !terminalId) return null;
  return { empresa_id: empresaId, terminal_id: terminalId };
}

function round(value) {
  return Math.round(Number(value) || 0);
}

function toBool(value, fallback = false) {
  if (value === true || value === false) return value;
  if (value == null) return fallback;
  const txt = String(value).trim().toLowerCase();
  if (["1", "true", "t", "si", "s", "yes", "y", "on"].includes(txt)) return true;
  if (["0", "false", "f", "no", "n", "off"].includes(txt)) return false;
  return fallback;
}

function normalizeNaturaleza(value, fallback = "ENTRADA") {
  const txt = String(value || "").trim().toUpperCase();
  if (txt === "SALIDA" || txt === "EGRESO" || txt === "OUT") return "SALIDA";
  if (txt === "ENTRADA" || txt === "INGRESO" || txt === "IN") return "ENTRADA";
  return fallback;
}

function normalizeMonedaId(value, fallback = MONEDA_IDS.PYG) {
  const raw = String(value ?? "").trim().toUpperCase();
  if (raw === "1" || raw === "PYG" || raw === "GS" || raw === "GUARANI") return MONEDA_IDS.PYG;
  if (raw === "2" || raw === "BRL" || raw === "REAL") return MONEDA_IDS.BRL;
  if (raw === "3" || raw === "USD" || raw === "DOLAR" || raw === "US$") return MONEDA_IDS.USD;
  return fallback;
}

function calcMontoGsByMoneda({ monedaId, monto, cotizacion }) {
  const amount = Number(monto) || 0;
  if (monedaId === MONEDA_IDS.PYG) return amount;
  if (monedaId === MONEDA_IDS.BRL) return amount * (Number(cotizacion?.brl) || 0);
  if (monedaId === MONEDA_IDS.USD) return amount * (Number(cotizacion?.usd) || 0);
  return amount;
}

function getMontosInicialesCaja(caja = null) {
  return {
    gs: Number(caja?.monto_inicial || 0),
    brl: Number(caja?.monto_inicial_real || 0),
    usd: Number(caja?.monto_inicial_dolar || 0)
  };
}

function monedaHistorialById(monedaId) {
  const id = Number(monedaId || 0);
  if (id === MONEDA_IDS.BRL) return "R$";
  if (id === MONEDA_IDS.USD) return "US$";
  return "GS";
}

function pushHistorialEntry(target, entry, { includeZero = false } = {}) {
  const amount = Number(entry?.monto ?? 0);
  if (!Number.isFinite(amount)) return;
  if (!includeZero && amount === 0) return;
  target.push({
    ...entry,
    monto: amount
  });
}

function roundMontoByMoneda(moneda, monto) {
  const amount = Number(monto) || 0;
  if (String(moneda || "PYG").toUpperCase() === "PYG") return round(amount);
  return Math.round(amount * 100) / 100;
}

function convertirGsAMoneda(moneda, montoGs, cotizacion) {
  const codigo = String(moneda || "PYG").trim().toUpperCase();
  const amountGs = Number(montoGs) || 0;

  if (codigo === "PYG") return roundMontoByMoneda(codigo, amountGs);
  if (codigo === "BRL") {
    const cot = Number(cotizacion?.brl) || 0;
    return cot > 0 ? roundMontoByMoneda(codigo, amountGs / cot) : 0;
  }
  if (codigo === "USD") {
    const cot = Number(cotizacion?.usd) || 0;
    return cot > 0 ? roundMontoByMoneda(codigo, amountGs / cot) : 0;
  }

  return roundMontoByMoneda("PYG", amountGs);
}

function monedaHistorialByCodigo(moneda) {
  const codigo = String(moneda || "PYG").trim().toUpperCase();
  if (codigo === "BRL") return "R$";
  if (codigo === "USD") return "US$";
  return "GS";
}

function resolverVueltoMoneda(pagos, totalGeneral, cotizacion) {
  const totalVentaGs = Number(totalGeneral) || 0;
  const vueltoGs = Math.max(
    0,
    round((Array.isArray(pagos) ? pagos : []).reduce((acc, pago) => acc + toNumber(pago?.monto_gs), 0) - totalVentaGs)
  );

  if (vueltoGs <= 0) {
    return {
      gs: 0,
      brl: 0,
      usd: 0,
      moneda: "PYG",
      montoMoneda: 0,
      historialMoneda: "GS"
    };
  }

  const pagosValidos = (Array.isArray(pagos) ? pagos : []).filter((pago) => toNumber(pago?.monto_gs) > 0);
  const pagosEfectivo = pagosValidos.filter(
    (pago) => String(pago?.metodo || "EFECTIVO").trim().toUpperCase() === "EFECTIVO"
  );

  let monedaVuelto = String(pagosEfectivo[0]?.moneda || "PYG").trim().toUpperCase();
  let acumuladoGs = 0;

  for (const pago of pagosValidos) {
    acumuladoGs += toNumber(pago?.monto_gs);
    if (acumuladoGs < totalVentaGs) continue;

    if (String(pago?.metodo || "EFECTIVO").trim().toUpperCase() === "EFECTIVO") {
      monedaVuelto = String(pago?.moneda || "PYG").trim().toUpperCase();
      break;
    }
  }

  const montoMoneda = convertirGsAMoneda(monedaVuelto, vueltoGs, cotizacion);

  return {
    gs: vueltoGs,
    brl: monedaVuelto === "BRL" ? montoMoneda : 0,
    usd: monedaVuelto === "USD" ? montoMoneda : 0,
    moneda: monedaVuelto,
    montoMoneda: monedaVuelto === "PYG" ? vueltoGs : montoMoneda,
    historialMoneda: monedaHistorialByCodigo(monedaVuelto)
  };
}

function parseDateFilterStart(value) {
  const txt = String(value || "").trim();
  if (!txt) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(txt)) return `${txt} 00:00:00`;
  return txt.replace("T", " ");
}

function parseDateFilterEnd(value) {
  const txt = String(value || "").trim();
  if (!txt) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(txt)) return `${txt} 23:59:59`;
  return txt.replace("T", " ");
}

function parseCsvValues(value) {
  return String(value || "")
    .split(",")
    .map((txt) => txt.trim())
    .filter(Boolean);
}

function normalizeHistorialOperacionFiltro(value) {
  const txt = String(value || "").trim().toUpperCase();
  if (txt === "DEBITO" || txt === "DÉBITO") return "DEBITO";
  if (txt === "REFERENCIA" || txt === "REF") return "REFERENCIA";
  if (txt === "CREDITO" || txt === "CRÉDITO") return "CREDITO";
  return null;
}

function normalizeHistorialMonedaFiltro(value) {
  const txt = String(value || "").trim().toUpperCase();
  if (!txt) return null;
  if (txt === "GS" || txt === "PYG" || txt === "GUARANI" || txt === "₲") return "GS";
  if (txt === "R$" || txt === "BRL" || txt === "REAL") return "R$";
  if (txt === "US$" || txt === "USD" || txt === "DOLAR" || txt === "DÓLAR") return "US$";
  return txt.slice(0, 10);
}

function addInWhere(where, params, columnSql, values) {
  const filtered = values.filter((v) => v != null && `${v}`.trim() !== "");
  if (!filtered.length) return;
  const slots = filtered.map((value) => {
    params.push(value);
    return `$${params.length}`;
  });
  where.push(`${columnSql} IN (${slots.join(",")})`);
}

function buildWhereHistorialFormal(req) {
  const where = [];
  const params = [];
  const empresaReq = toId(req.query?.empresa_id || req.query?.empresa);
  const terminalReq = toId(req.query?.terminal_id || req.query?.terminal);
  const cajaReq = toId(req.query?.caja_id || req.query?.caja);
  const usuarioReq = toId(req.query?.usuario_id || req.query?.usuario);

  if (empresaReq) {
    params.push(empresaReq);
    where.push(`(h.empresa_id = $${params.length} OR h.empresa_id IS NULL)`);
  }

  if (terminalReq) {
    params.push(terminalReq);
    where.push(`(h.terminal_id = $${params.length} OR h.terminal_id IS NULL)`);
  }

  if (cajaReq) {
    params.push(cajaReq);
    where.push(`h.caja_id = $${params.length}`);
  }

  if (usuarioReq) {
    params.push(usuarioReq);
    where.push(`h.usuario_id = $${params.length}`);
  }

  const fechaDesde = parseDateFilterStart(req.query?.fecha_desde || req.query?.desde);
  if (fechaDesde) {
    params.push(fechaDesde);
    where.push(`h.fecha >= $${params.length}::timestamp`);
  }

  const fechaHasta = parseDateFilterEnd(req.query?.fecha_hasta || req.query?.hasta);
  if (fechaHasta) {
    params.push(fechaHasta);
    where.push(`h.fecha <= $${params.length}::timestamp`);
  }

  const origenes = parseCsvValues(req.query?.origen).map((value) => String(value).toUpperCase().slice(0, 30));
  addInWhere(where, params, "UPPER(h.origen)", origenes);

  const operaciones = parseCsvValues(req.query?.operacion)
    .map((value) => normalizeHistorialOperacionFiltro(value))
    .filter(Boolean);
  addInWhere(where, params, "UPPER(h.operacion)", operaciones);

  const monedas = parseCsvValues(req.query?.moneda)
    .map((value) => normalizeHistorialMonedaFiltro(value))
    .filter(Boolean);
  addInWhere(where, params, "h.moneda", monedas);

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  return { whereSql, params };
}

async function validarOperacionVentaParaCobro(client, venta) {
  const ventaId = toId(venta?.id);
  if (!ventaId) throw new Error("Venta invalida para cobro");

  const opRes = await client.query(
    `
      SELECT
        v.id AS venta_id,
        v.numero AS venta_numero,
        v.tipo_operacion_id,
        o.codigo AS operacion_codigo,
        o.descripcion AS operacion_descripcion,
        UPPER(TRIM(o.tipo::text)) AS operacion_tipo,
        COALESCE(o.activo, true) AS operacion_activa,
        COALESCE(o.genera_financiero, false) AS operacion_genera_financiero,
        COALESCE(o.requiere_credito, false) AS operacion_requiere_credito
      FROM venta v
      LEFT JOIN tipo_operacion o ON o.id = v.tipo_operacion_id
      WHERE v.id = $1
      LIMIT 1
    `,
    [ventaId]
  );

  if (!opRes.rowCount) {
    throw new Error(`Venta ${ventaId} no encontrada`);
  }

  const op = opRes.rows[0];
  const numero = op.venta_numero || venta?.numero || ventaId;
  if (!toId(op.tipo_operacion_id)) {
    const fallback = await client.query(
      `
        SELECT id
        FROM tipo_operacion
        WHERE activo = true
          AND UPPER(TRIM(tipo::text)) = 'S'
        ORDER BY
          CASE
            WHEN LOWER(descripcion) LIKE '%venta al contado%' THEN 0
            WHEN LOWER(descripcion) LIKE '%venta%' THEN 1
            ELSE 2
          END,
          codigo ASC NULLS LAST,
          id ASC
        LIMIT 1
      `
    );

    const fallbackId = toId(fallback.rows?.[0]?.id);
    if (!fallbackId) {
      throw new Error(`Venta ${numero} sin operacion configurada`);
    }

    await client.query(
      `
        UPDATE venta
        SET tipo_operacion_id = $1
        WHERE id = $2
      `,
      [fallbackId, ventaId]
    );

    return validarOperacionVentaParaCobro(client, { id: ventaId, numero });
  }
  if (op.operacion_tipo !== "S") {
    throw new Error(`Venta ${numero} con operacion invalida (debe ser tipo S)`);
  }
  if (op.operacion_activa === false) {
    throw new Error(`Venta ${numero} con operacion inactiva`);
  }
  if (op.operacion_requiere_credito === true) {
    throw new Error(`Venta ${numero} requiere credito y no puede cobrarse al contado`);
  }
  if (op.operacion_genera_financiero === false) {
    throw new Error(`Venta ${numero} usa una operacion que no genera movimiento financiero/caja`);
  }
}

async function getCotizaciones(client) {
  const fn = client || pool;
  const q = await fn.query(`
    SELECT moneda, valor_indice
    FROM cotizacion
    WHERE activa = true
  `);

  const cot = { brl: 0, usd: 0 };
  for (const row of q.rows) {
    const moneda = String(row.moneda || "").toUpperCase();
    if (moneda === "REAL") cot.brl = Number(row.valor_indice) || 0;
    if (moneda === "DOLAR") cot.usd = Number(row.valor_indice) || 0;
  }
  if (cot.brl === 0 || cot.usd === 0) {
    console.warn("[CAJA] Cotización BRL o USD en 0 — verificar tabla cotizacion");
  }
  return cot;
}

async function getCajaAbierta(client, { terminalId = null, adoptLegacy = false } = {}) {
  const fn = client || pool;

  if (terminalId) {
    const scoped = await fn.query(
      `
      SELECT *
      FROM caja
      WHERE UPPER(estado) = $1
        AND terminal_id = $2
      ORDER BY id DESC
      LIMIT 1
      `,
      [ESTADO_ABIERTA, terminalId]
    );

    if (scoped.rowCount) return scoped.rows[0];

    if (adoptLegacy) {
      const legacy = await fn.query(
        `
        SELECT *
        FROM caja
        WHERE UPPER(estado) = $1
          AND terminal_id IS NULL
        ORDER BY id DESC
        LIMIT 1
        `,
        [ESTADO_ABIERTA]
      );

      if (legacy.rowCount) {
        const legacyCaja = legacy.rows[0];
        await fn.query(`UPDATE caja SET terminal_id = $1 WHERE id = $2`, [terminalId, legacyCaja.id]);
        await fn.query(
          `UPDATE caja_sesiones SET terminal_id = $1 WHERE caja_id = $2 AND terminal_id IS NULL`,
          [terminalId, legacyCaja.id]
        );

        const adopted = await fn.query(`SELECT * FROM caja WHERE id = $1`, [legacyCaja.id]);
        return adopted.rows[0] || null;
      }
    }

    return null;
  }

  const global = await fn.query(
    `
    SELECT *
    FROM caja
    WHERE UPPER(estado) = $1
    ORDER BY id DESC
    LIMIT 1
    `,
    [ESTADO_ABIERTA]
  );
  return global.rows[0] || null;
}

async function getCajaResumen(client, cajaId) {
  const [ventasQ, manualQ] = await Promise.all([
    client.query(
      `
      SELECT
        COALESCE(SUM(pago_efectivo),0)       AS efectivo,
        COALESCE(SUM(pago_efectivo_real),0)  AS efectivo_real,
        COALESCE(SUM(pago_efectivo_dolar),0) AS efectivo_dolar,
        COALESCE(SUM(pago_tarjeta),0)        AS tarjeta,
        COALESCE(SUM(pago_transferencia),0)  AS transferencia,
        COALESCE(SUM(pago_pix),0)            AS pix,
        COALESCE(SUM(total_venta),0)         AS total,
        COUNT(*)                              AS cant_ventas
      FROM caja_movimiento
      WHERE caja_id = $1
      `,
      [cajaId]
    ),
    client.query(
      `
      SELECT
        COALESCE(SUM(CASE WHEN moneda_id = 1 AND naturaleza = 'ENTRADA' THEN monto
                          WHEN moneda_id = 1 AND naturaleza = 'SALIDA' THEN -monto
                          ELSE 0 END), 0) AS manual_gs,
        COALESCE(SUM(CASE WHEN moneda_id = 2 AND naturaleza = 'ENTRADA' THEN monto
                          WHEN moneda_id = 2 AND naturaleza = 'SALIDA' THEN -monto
                          ELSE 0 END), 0) AS manual_brl,
        COALESCE(SUM(CASE WHEN moneda_id = 3 AND naturaleza = 'ENTRADA' THEN monto
                          WHEN moneda_id = 3 AND naturaleza = 'SALIDA' THEN -monto
                          ELSE 0 END), 0) AS manual_usd,
        COALESCE(SUM(monto_gs), 0) AS manual_total_gs,
        COUNT(*) AS manual_cantidad
      FROM caja_movimiento_manual
      WHERE caja_id = $1
      `,
      [cajaId]
    )
  ]);

  const ventas = ventasQ.rows[0] || {};
  const manual = manualQ.rows[0] || {};

  const manualGs = Number(manual.manual_gs || 0);
  const manualBrl = Number(manual.manual_brl || 0);
  const manualUsd = Number(manual.manual_usd || 0);

  return {
    efectivo: Number(ventas.efectivo || 0) + manualGs,
    efectivo_real: Number(ventas.efectivo_real || 0) + manualBrl,
    efectivo_dolar: Number(ventas.efectivo_dolar || 0) + manualUsd,
    tarjeta: Number(ventas.tarjeta || 0),
    transferencia: Number(ventas.transferencia || 0),
    pix: Number(ventas.pix || 0),
    total: Number(ventas.total || 0),
    cant_ventas: Number(ventas.cant_ventas || 0),
    manual_gs: manualGs,
    manual_brl: manualBrl,
    manual_usd: manualUsd,
    manual_total_gs: Number(manual.manual_total_gs || 0),
    manual_cantidad: Number(manual.manual_cantidad || 0)
  };
}

async function getSesionAbierta(client, cajaId, terminalId = null) {
  if (!cajaId) return null;

  const q = await client.query(
    `
    SELECT *
    FROM caja_sesiones
    WHERE caja_id = $1
      AND UPPER(estado) = $2
      AND ($3::bigint IS NULL OR terminal_id = $3 OR terminal_id IS NULL)
    ORDER BY
      CASE
        WHEN terminal_id = $3 THEN 0
        WHEN terminal_id IS NULL THEN 1
        ELSE 2
      END,
      id DESC
    LIMIT 1
    `,
    [cajaId, ESTADO_ABIERTA, terminalId]
  );

  let sesion = q.rows[0] || null;
  if (sesion && terminalId && !toId(sesion.terminal_id)) {
    const updated = await client.query(
      `UPDATE caja_sesiones SET terminal_id = $1 WHERE id = $2 RETURNING *`,
      [terminalId, sesion.id]
    );
    sesion = updated.rows[0] || sesion;
  }
  return sesion;
}

async function getSnapshotEfectivo(client, cajaId) {
  const q = await client.query(
    `
    WITH ventas AS (
      SELECT
        COALESCE(SUM(pago_efectivo),0)       AS efectivo_gs,
        COALESCE(SUM(pago_efectivo_real),0)  AS efectivo_brl,
        COALESCE(SUM(pago_efectivo_dolar),0) AS efectivo_usd
      FROM caja_movimiento
      WHERE caja_id = $1
    ),
    manual AS (
      SELECT
        COALESCE(SUM(CASE WHEN moneda_id = 1 AND naturaleza = 'ENTRADA' THEN monto
                          WHEN moneda_id = 1 AND naturaleza = 'SALIDA' THEN -monto
                          ELSE 0 END), 0) AS manual_gs,
        COALESCE(SUM(CASE WHEN moneda_id = 2 AND naturaleza = 'ENTRADA' THEN monto
                          WHEN moneda_id = 2 AND naturaleza = 'SALIDA' THEN -monto
                          ELSE 0 END), 0) AS manual_brl,
        COALESCE(SUM(CASE WHEN moneda_id = 3 AND naturaleza = 'ENTRADA' THEN monto
                          WHEN moneda_id = 3 AND naturaleza = 'SALIDA' THEN -monto
                          ELSE 0 END), 0) AS manual_usd
      FROM caja_movimiento_manual
      WHERE caja_id = $1
    )
    SELECT
      (ventas.efectivo_gs + manual.manual_gs) AS efectivo_gs,
      (ventas.efectivo_brl + manual.manual_brl) AS efectivo_brl,
      (ventas.efectivo_usd + manual.manual_usd) AS efectivo_usd
    FROM ventas
    CROSS JOIN manual
    `,
    [cajaId]
  );
  return q.rows[0] || { efectivo_gs: 0, efectivo_brl: 0, efectivo_usd: 0 };
}

async function createSesion(client, payload) {
  const {
    cajaId,
    terminalId,
    usuarioId,
    fechaApertura,
    montoApertura,
    montoAperturaReal,
    montoAperturaDolar,
    cotizacion,
    observacion
  } = payload;

  const q = await client.query(
    `
    INSERT INTO caja_sesiones (
      caja_id,
      terminal_id,
      fecha_apertura,
      monto_apertura,
      monto_apertura_real,
      monto_apertura_dolar,
      cotizacion_real,
      cotizacion_dolar,
      usuario_apertura,
      estado,
      observacion
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    RETURNING *
    `,
    [
      cajaId,
      terminalId,
      fechaApertura || new Date(),
      Number(montoApertura) || 0,
      Number(montoAperturaReal) || 0,
      Number(montoAperturaDolar) || 0,
      Number(cotizacion?.brl) || 0,
      Number(cotizacion?.usd) || 0,
      usuarioId || null,
      ESTADO_ABIERTA,
      observacion || null
    ]
  );

  return q.rows[0] || null;
}

async function ensureSesionActiva(client, payload) {
  const { caja, terminalId, usuarioId, autoCrear = true } = payload;
  if (!caja?.id) return null;

  let sesion = await getSesionAbierta(client, caja.id, terminalId);

  if (!sesion && autoCrear) {
    const snap = await getSnapshotEfectivo(client, caja.id);
    const cot = await getCotizaciones(client);
    const inicial = getMontosInicialesCaja(caja);

    sesion = await createSesion(client, {
      cajaId: caja.id,
      terminalId,
      usuarioId,
      montoApertura: inicial.gs + Number(snap.efectivo_gs || 0),
      montoAperturaReal: inicial.brl + Number(snap.efectivo_brl || 0),
      montoAperturaDolar: inicial.usd + Number(snap.efectivo_usd || 0),
      cotizacion: cot,
      observacion: "Sesion creada automaticamente"
    });
  }

  if (sesion && usuarioId && !toId(sesion.usuario_apertura)) {
    const updated = await client.query(
      `UPDATE caja_sesiones SET usuario_apertura = $1 WHERE id = $2 RETURNING *`,
      [usuarioId, sesion.id]
    );
    sesion = updated.rows[0] || sesion;
  }

  return sesion;
}

async function getSesionValidaParaCobro(client, payload) {
  const { caja, terminalId, usuarioId } = payload;

  if (!terminalId) throw new Error("La terminal actual no esta asociada correctamente");
  if (!usuarioId) throw new Error("No se pudo identificar el usuario cajero");
  if (!caja?.id) throw new Error("No hay caja abierta");

  const cajaTerminalId = toId(caja.terminal_id);
  if (cajaTerminalId && cajaTerminalId !== terminalId) {
    throw new Error("La caja abierta no corresponde a la terminal actual");
  }

  let sesion = await getSesionAbierta(client, caja.id, terminalId);
  if (!sesion) {
    throw new Error("No hay sesion de cajero activa en esta terminal");
  }

  const usuarioSesion = toId(sesion.usuario_apertura);
  if (!usuarioSesion) {
    const updated = await client.query(
      `UPDATE caja_sesiones SET usuario_apertura = $1 WHERE id = $2 RETURNING *`,
      [usuarioId, sesion.id]
    );
    sesion = updated.rows[0] || sesion;
  } else if (usuarioSesion !== usuarioId) {
    throw new Error("La sesion activa pertenece a otro cajero. Realiza cambio de sesion");
  }

  return sesion;
}

async function closeSesion(client, payload) {
  const {
    sesionId,
    usuarioCierre,
    fechaCierre,
    montoContado,
    montoContadoReal,
    montoContadoDolar,
    diferencia,
    diferenciaReal,
    diferenciaDolar,
    totalVentas,
    cotizacion,
    observacion
  } = payload;

  if (!sesionId) return null;

  const q = await client.query(
    `
    UPDATE caja_sesiones SET
      fecha_cierre = $1,
      monto_contado = $2,
      monto_contado_real = $3,
      monto_contado_dolar = $4,
      diferencia = $5,
      diferencia_real = $6,
      diferencia_dolar = $7,
      total_ventas = $8,
      cotizacion_real = COALESCE($9, cotizacion_real),
      cotizacion_dolar = COALESCE($10, cotizacion_dolar),
      usuario_cierre = $11,
      observacion = $12,
      estado = $13
    WHERE id = $14
    RETURNING *
    `,
    [
      fechaCierre || new Date(),
      montoContado != null ? Number(montoContado) : null,
      montoContadoReal != null ? Number(montoContadoReal) : null,
      montoContadoDolar != null ? Number(montoContadoDolar) : null,
      diferencia != null ? Number(diferencia) : null,
      diferenciaReal != null ? Number(diferenciaReal) : null,
      diferenciaDolar != null ? Number(diferenciaDolar) : null,
      totalVentas != null ? Number(totalVentas) : null,
      cotizacion?.brl != null ? Number(cotizacion.brl) : null,
      cotizacion?.usd != null ? Number(cotizacion.usd) : null,
      usuarioCierre || null,
      observacion || null,
      ESTADO_CERRADA,
      sesionId
    ]
  );

  return q.rows[0] || null;
}

async function hydrateSesion(client, sesionId) {
  if (!sesionId) return null;

  const q = await client.query(
    `
    SELECT
      cs.*,
      ua.nombre AS usuario_nombre,
      uc.nombre AS usuario_cierre_nombre,
      t.nombre  AS terminal_nombre
    FROM caja_sesiones cs
    LEFT JOIN usuario ua ON ua.id = cs.usuario_apertura
    LEFT JOIN usuario uc ON uc.id = cs.usuario_cierre
    LEFT JOIN terminal t ON t.id = cs.terminal_id
    WHERE cs.id = $1
    LIMIT 1
    `,
    [sesionId]
  );

  return q.rows[0] || null;
}

async function switchSesionToUsuario(client, payload) {
  const {
    caja,
    terminalId,
    nuevoUsuarioId,
    usuarioCierre,
    observacionCierre,
    observacionApertura
  } = payload;

  if (!caja?.id || !nuevoUsuarioId) return null;

  const sesionActual = await getSesionAbierta(client, caja.id, terminalId);
  if (sesionActual && Number(sesionActual.usuario_apertura || 0) === Number(nuevoUsuarioId)) {
    return sesionActual;
  }

  if (sesionActual) {
    const ventasSesion = await client.query(
      `
      SELECT COALESCE(SUM(total_venta), 0) AS total_ventas
      FROM caja_movimiento
      WHERE caja_sesion_id = $1
      `,
      [sesionActual.id]
    );

    await closeSesion(client, {
      sesionId: sesionActual.id,
      usuarioCierre: usuarioCierre || nuevoUsuarioId,
      totalVentas: Number(ventasSesion.rows[0]?.total_ventas || 0),
      observacion: observacionCierre || "Cierre por cambio de sesion"
    });
  }

  const cot = await getCotizaciones(client);
  const snap = await getSnapshotEfectivo(client, caja.id);
  const inicial = getMontosInicialesCaja(caja);

  return createSesion(client, {
    cajaId: caja.id,
    terminalId,
    usuarioId: nuevoUsuarioId,
    montoApertura: inicial.gs + Number(snap.efectivo_gs || 0),
    montoAperturaReal: inicial.brl + Number(snap.efectivo_brl || 0),
    montoAperturaDolar: inicial.usd + Number(snap.efectivo_usd || 0),
    cotizacion: cot,
    observacion: observacionApertura || "Apertura por cambio de sesion"
  });
}

async function resolveTipoMovimientoManual(client, { tipoId, tipoNombre, naturaleza }) {
  const nat = normalizeNaturaleza(naturaleza, "ENTRADA");
  const id = toId(tipoId);

  if (id) {
    const byId = await client.query(
      `
      SELECT id, nombre, naturaleza, activo
      FROM caja_movimiento_tipo
      WHERE id = $1
      LIMIT 1
      `,
      [id]
    );
    if (!byId.rowCount) throw new Error("Tipo de movimiento no encontrado");
    const row = byId.rows[0];
    if (String(row.naturaleza || "").toUpperCase() !== nat) {
      throw new Error("El tipo de movimiento no coincide con la naturaleza seleccionada");
    }
    if (row.activo === false) throw new Error("El tipo de movimiento seleccionado esta inactivo");
    return {
      id: Number(row.id),
      nombre: String(row.nombre || "").trim() || `Tipo ${row.id}`,
      naturaleza: nat
    };
  }

  const nombre = String(tipoNombre || "").trim();
  if (!nombre) {
    throw new Error("Seleccione o ingrese un tipo/historial de movimiento");
  }

  const existing = await client.query(
    `
    SELECT id, nombre
    FROM caja_movimiento_tipo
    WHERE naturaleza = $1
      AND LOWER(TRIM(nombre)) = LOWER(TRIM($2))
    LIMIT 1
    `,
    [nat, nombre]
  );

  if (existing.rowCount) {
    const found = existing.rows[0];
    await client.query(
      `
      UPDATE caja_movimiento_tipo
      SET activo = true,
          updated_at = NOW()
      WHERE id = $1
      `,
      [found.id]
    );
    return {
      id: Number(found.id),
      nombre: String(found.nombre || "").trim() || nombre,
      naturaleza: nat
    };
  }

  const created = await client.query(
    `
    INSERT INTO caja_movimiento_tipo (nombre, naturaleza, activo)
    VALUES ($1, $2, true)
    RETURNING id, nombre, naturaleza
    `,
    [nombre, nat]
  );

  return {
    id: Number(created.rows[0].id),
    nombre: String(created.rows[0].nombre || "").trim() || nombre,
    naturaleza: nat
  };
}

router.get("/", async (req, res) => {
  const terminalId = getTerminalIdFromReq(req);

  try {
    let whereSql = "";
    const params = [];

    if (terminalId) {
      params.push(terminalId);
      whereSql = `
        WHERE EXISTS (
          SELECT 1
          FROM caja c
          WHERE c.id = cm.caja_id
            AND (c.terminal_id = $1 OR c.terminal_id IS NULL)
        )
      `;
    }

    const q = await pool.query(
      `
      SELECT
        cm.id,
        cm.caja_id,
        cm.caja_sesion_id,
        cm.venta_id,
        v.numero AS numero_venta,
        cm.usuario_id,
        u.nombre AS usuario_nombre,
        cm.fecha,
        cm.total_venta,
        cm.pago_efectivo,
        cm.pago_efectivo_real,
        cm.pago_efectivo_dolar,
        cm.pago_tarjeta,
        cm.pago_transferencia,
        cm.pago_pix,
        cm.vuelto,
        cm.vuelto_real,
        cm.vuelto_dolar
      FROM caja_movimiento cm
      LEFT JOIN venta v ON v.id = cm.venta_id
      LEFT JOIN usuario u ON u.id = cm.usuario_id
      ${whereSql}
      ORDER BY cm.id DESC
      LIMIT 200
      `,
      params
    );

    res.json(q.rows);
  } catch (err) {
    console.error("GET /api/caja:", err);
    res.status(500).json({ error: err.message });
  }
});

router.get("/estado", async (req, res) => {
  const client = await pool.connect();
  try {
    const terminalId = getTerminalIdFromReq(req);
    const usuarioId = getUsuarioIdFromReq(req);
    const caja = await getCajaAbierta(client, { terminalId, adoptLegacy: true });

    if (!caja) {
      return res.json({
        estado: "SIN_CAJA",
        terminal_id: terminalId,
        caja: null,
        sesion: null,
        resumen: null
      });
    }

    const resumen = await getCajaResumen(client, caja.id);
    let sesion = await ensureSesionActiva(client, {
      caja,
      terminalId,
      usuarioId,
      autoCrear: true
    });
    sesion = await hydrateSesion(client, sesion?.id);
    const inicial = getMontosInicialesCaja(caja);
    const cajaPayload = {
      ...caja,
      monto_inicial: inicial.gs,
      monto_inicial_real: inicial.brl,
      monto_inicial_dolar: inicial.usd
    };

    res.json({
      estado: ESTADO_ABIERTA,
      terminal_id: terminalId || caja.terminal_id || null,
      caja: cajaPayload,
      sesion,
      resumen
    });
  } catch (err) {
    console.error("GET /api/caja/estado:", err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

router.get("/sesion-actual", async (req, res) => {
  const client = await pool.connect();
  try {
    const terminalId = getTerminalIdFromReq(req);
    const usuarioId = getUsuarioIdFromReq(req);
    const caja = await getCajaAbierta(client, { terminalId, adoptLegacy: true });

    if (!caja) {
      return res.status(404).json({ error: "No hay caja abierta" });
    }

    let sesion = await ensureSesionActiva(client, {
      caja,
      terminalId,
      usuarioId,
      autoCrear: true
    });
    sesion = await hydrateSesion(client, sesion?.id);

    res.json({
      ok: true,
      terminal_id: terminalId || caja.terminal_id || null,
      caja,
      sesion
    });
  } catch (err) {
    console.error("GET /api/caja/sesion-actual:", err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

router.get("/resumen", async (req, res) => {
  const client = await pool.connect();
  try {
    const terminalId = getTerminalIdFromReq(req);
    const usuarioId = getUsuarioIdFromReq(req);
    const caja = await getCajaAbierta(client, { terminalId, adoptLegacy: true });

    if (!caja) return res.status(404).json({ error: "No hay caja abierta" });

    let [resumen, cot, sesion] = await Promise.all([
      getCajaResumen(client, caja.id),
      getCotizaciones(client),
      ensureSesionActiva(client, {
        caja,
        terminalId,
        usuarioId,
        autoCrear: true
      })
    ]);
    sesion = await hydrateSesion(client, sesion?.id);

    res.json({
      caja_id: caja.id,
      terminal_id: terminalId || caja.terminal_id || null,
      sesion,
      monto_inicial: Number(caja.monto_inicial || 0),
      monto_inicial_real: Number(caja.monto_inicial_real || 0),
      monto_inicial_dolar: Number(caja.monto_inicial_dolar || 0),
      fecha_apertura: caja.fecha_apertura,
      cotizacion_brl: cot.brl,
      cotizacion_usd: cot.usd,
      ...resumen
    });
  } catch (err) {
    console.error("GET /api/caja/resumen:", err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

router.post("/abrir", requirePermisoVentaRapida("caja_apertura"), async (req, res) => {
  const client = await pool.connect();
  try {
    const terminalId = getTerminalIdFromReq(req);
    const usuarioId = getUsuarioIdFromReq(req);
    const empresaId = getEmpresaIdFromReq(req);
    const cajaAbierta = await getCajaAbierta(client, { terminalId, adoptLegacy: false });

    if (cajaAbierta) {
      return res.status(400).json({
        error: `Ya existe una caja abierta (ID ${cajaAbierta.id}) para esta terminal`
      });
    }

    const {
      monto_inicial = 0,
      monto_inicial_real = 0,
      monto_inicial_dolar = 0,
      observacion = ""
    } = req.body || {};

    const cot = await getCotizaciones(client);

    await client.query("BEGIN");

    const cajaRes = await client.query(
      `
      INSERT INTO caja (
        estado,
        monto_inicial,
        monto_inicial_real,
        monto_inicial_dolar,
        usuario_id,
        terminal_id,
        cotizacion_real,
        cotizacion_dolar
      )
        
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING *
      `,
      [
        ESTADO_ABIERTA,
        Number(monto_inicial) || 0,
        Number(monto_inicial_real) || 0,
        Number(monto_inicial_dolar) || 0,
        usuarioId || null,
        terminalId || null,
        Number(cot.brl) || 0,
        Number(cot.usd) || 0
      ]
    );

    const caja = cajaRes.rows[0];
    const montoAperturaGs =
      Number(monto_inicial || 0) +
      Number(monto_inicial_real || 0) * Number(cot.brl || 0) +
      Number(monto_inicial_dolar || 0) * Number(cot.usd || 0);

    const sesion = await createSesion(client, {
      cajaId: caja.id,
      terminalId: terminalId || null,
      usuarioId: usuarioId || null,
      fechaApertura: caja.fecha_apertura,
      montoApertura: montoAperturaGs,
      montoAperturaReal: Number(monto_inicial_real) || 0,
      montoAperturaDolar: Number(monto_inicial_dolar) || 0,
      cotizacion: cot,
      observacion
    });

    await registrarHistorialCaja(client, [
      {
        fecha: caja.fecha_apertura,
        caja_id: caja.id,
        sesion_id: sesion?.id || null,
        terminal_id: terminalId || caja.terminal_id || null,
        empresa_id: empresaId || null,
        usuario_id: usuarioId || null,
        origen: "APERTURA",
        operacion: "CREDITO",
        moneda: "GS",
        monto: Number(monto_inicial) || 0,
        tipo_nombre: "Apertura de caja",
        referencia_id: caja.id,
        observacion: observacion || null
      },
      {
        fecha: caja.fecha_apertura,
        caja_id: caja.id,
        sesion_id: sesion?.id || null,
        terminal_id: terminalId || caja.terminal_id || null,
        empresa_id: empresaId || null,
        usuario_id: usuarioId || null,
        origen: "APERTURA",
        operacion: "CREDITO",
        moneda: "R$",
        monto: Number(monto_inicial_real) || 0,
        tipo_nombre: "Apertura de caja",
        referencia_id: caja.id,
        observacion: observacion || null
      },
      {
        fecha: caja.fecha_apertura,
        caja_id: caja.id,
        sesion_id: sesion?.id || null,
        terminal_id: terminalId || caja.terminal_id || null,
        empresa_id: empresaId || null,
        usuario_id: usuarioId || null,
        origen: "APERTURA",
        operacion: "CREDITO",
        moneda: "US$",
        monto: Number(monto_inicial_dolar) || 0,
        tipo_nombre: "Apertura de caja",
        referencia_id: caja.id,
        observacion: observacion || null
      }
    ]);

    await client.query("COMMIT");
    res.json({ ok: true, caja, sesion, cotizacion: cot });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("POST /api/caja/abrir:", err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

router.post("/cobrar", requirePermisoVentaRapida("venta_rapida_efectivizar"), async (req, res) => {
  const client = await pool.connect();

  try {
    const ventasRaw = req.body?.ventas;
    const ventas = Array.isArray(ventasRaw)
      ? ventasRaw.map(Number).filter(n => n > 0)
      : typeof ventasRaw === "string"
        ? ventasRaw.split(",").map(Number).filter(n => n > 0)
        : typeof ventasRaw === "number" && ventasRaw > 0
          ? [ventasRaw]
          : [];
    if (!Array.isArray(ventas) || !ventas.length) {
      return res.status(400).json({ error: "No hay ventas para cobrar" });
    }

    const terminalId = getTerminalIdFromReq(req);
    const usuarioId = getUsuarioIdFromReq(req);
    const empresaId = getEmpresaIdFromReq(req);

    await client.query("BEGIN");

    const cot = await getCotizaciones(client);
    const caja = await getCajaAbierta(client, { terminalId, adoptLegacy: true });
    if (!caja) throw new Error("No hay caja abierta");

    const sesion = await getSesionValidaParaCobro(client, {
      caja,
      terminalId,
      usuarioId
    });

    let totalGeneral = 0;
    const ventasDB = [];

    for (const id of ventas) {
      const ventaRes = await client.query(
        `SELECT id, numero, total, estado FROM venta WHERE id = $1 FOR UPDATE`,
        [id]
      );

      if (!ventaRes.rowCount) {
        throw new Error(`Venta ${id} no encontrada`);
      }

      const venta = ventaRes.rows[0];
      await validarOperacionVentaParaCobro(client, venta);

      if (!POS_SIN_COCINA) {
        const preparoCheck = await client.query(
          `
          SELECT EXISTS (
            SELECT 1
            FROM venta_detalle vd
            JOIN producto p ON p.id = vd.producto_id
            WHERE vd.venta_id = $1
              AND p.destino_impresion IS NOT NULL
              AND p.efectivacion_directa = false
          ) AS tiene_preparo
          `,
          [id]
        );

        if (preparoCheck.rows[0].tiene_preparo && venta.estado !== "CONCLUIDO") {
          throw new Error(`Venta ${venta.numero} no esta concluida`);
        }
      }

      const cobrada = await client.query(
        `SELECT 1 FROM caja_movimiento WHERE venta_id = $1`,
        [id]
      );

      if (cobrada.rowCount) {
        throw new Error(`Venta ${venta.numero} ya fue cobrada`);
      }

      totalGeneral += toNumber(venta.total);
      ventasDB.push(venta);
    }

    const pagos = normalizarPagos(req.body, cot);
    const resumenPagos = resumirPagos(pagos);

    if (resumenPagos.total_pagado_gs < totalGeneral) {
      throw new Error("Monto insuficiente");
    }

    const vuelto = resolverVueltoMoneda(pagos, totalGeneral, cot);
    const acumuladoPorPago = new Map();

    for (let i = 0; i < ventasDB.length; i += 1) {
      const venta = ventasDB[i];
      const proporcion = totalGeneral > 0 ? toNumber(venta.total) / totalGeneral : 0;
      const pagosVenta = prorratearPagos(
        pagos,
        proporcion,
        i === ventasDB.length - 1,
        acumuladoPorPago
      );
      const resumenVenta = resumirPagos(pagosVenta);

      const movimientoRes = await client.query(
        `
        INSERT INTO caja_movimiento
          (caja_id, venta_id, total_venta,
           pago_efectivo, pago_efectivo_real, pago_efectivo_dolar,
           cotizacion_real, cotizacion_dolar,
           pago_tarjeta, pago_transferencia, pago_pix,
           vuelto, vuelto_real, vuelto_dolar,
           usuario_id, caja_sesion_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
        RETURNING id
        `,
        [
          caja.id,
          venta.id,
          venta.total,
          resumenVenta.pago_efectivo,
          resumenVenta.pago_efectivo_real,
          resumenVenta.pago_efectivo_dolar,
          cot.brl,
          cot.usd,
          resumenVenta.pago_tarjeta,
          resumenVenta.pago_transferencia,
          resumenVenta.pago_pix,
          i === ventasDB.length - 1 ? vuelto.gs : 0,
          i === ventasDB.length - 1 ? vuelto.brl : 0,
          i === ventasDB.length - 1 ? vuelto.usd : 0,
          usuarioId || null,
          sesion?.id || null
        ]
      );
      const movimientoId = movimientoRes.rows[0]?.id || null;

      await insertarDetallePago(client, movimientoId, pagosVenta);

      await client.query(
        `UPDATE venta SET estado = 'EFECTIVADO', estado_caja = 'COBRADO' WHERE id = $1`,
        [venta.id]
      );
      await clearMesaByVentaId(client, venta.id, getMesaScopeFromReq(req));

      const historialVenta = [];
      const documentoVenta = String(venta.numero || venta.id || "");
      const observacionVenta = `Cobro venta #${documentoVenta || venta.id}`;

      pushHistorialEntry(historialVenta, {
        fecha: new Date(),
        caja_id: caja.id,
        sesion_id: sesion?.id || null,
        terminal_id: terminalId || caja.terminal_id || null,
        empresa_id: empresaId || null,
        usuario_id: usuarioId || null,
        origen: "VENTA",
        operacion: "CREDITO",
        moneda: "GS",
        monto: Number(resumenVenta.pago_efectivo || 0),
        tipo_nombre: "Cobro efectivo venta",
        documento: documentoVenta || null,
        referencia_id: movimientoId,
        observacion: observacionVenta
      });
      pushHistorialEntry(historialVenta, {
        fecha: new Date(),
        caja_id: caja.id,
        sesion_id: sesion?.id || null,
        terminal_id: terminalId || caja.terminal_id || null,
        empresa_id: empresaId || null,
        usuario_id: usuarioId || null,
        origen: "VENTA",
        operacion: "CREDITO",
        moneda: "R$",
        monto: Number(resumenVenta.pago_efectivo_real || 0),
        tipo_nombre: "Cobro efectivo venta",
        documento: documentoVenta || null,
        referencia_id: movimientoId,
        observacion: observacionVenta
      });
      pushHistorialEntry(historialVenta, {
        fecha: new Date(),
        caja_id: caja.id,
        sesion_id: sesion?.id || null,
        terminal_id: terminalId || caja.terminal_id || null,
        empresa_id: empresaId || null,
        usuario_id: usuarioId || null,
        origen: "VENTA",
        operacion: "CREDITO",
        moneda: "US$",
        monto: Number(resumenVenta.pago_efectivo_dolar || 0),
        tipo_nombre: "Cobro efectivo venta",
        documento: documentoVenta || null,
        referencia_id: movimientoId,
        observacion: observacionVenta
      });
      pushHistorialEntry(historialVenta, {
        fecha: new Date(),
        caja_id: caja.id,
        sesion_id: sesion?.id || null,
        terminal_id: terminalId || caja.terminal_id || null,
        empresa_id: empresaId || null,
        usuario_id: usuarioId || null,
        origen: "VENTA",
        operacion: "CREDITO",
        moneda: "GS",
        monto: Number(resumenVenta.pago_tarjeta || 0),
        tipo_nombre: "Cobro tarjeta venta",
        documento: documentoVenta || null,
        referencia_id: movimientoId,
        observacion: observacionVenta
      });
      pushHistorialEntry(historialVenta, {
        fecha: new Date(),
        caja_id: caja.id,
        sesion_id: sesion?.id || null,
        terminal_id: terminalId || caja.terminal_id || null,
        empresa_id: empresaId || null,
        usuario_id: usuarioId || null,
        origen: "VENTA",
        operacion: "CREDITO",
        moneda: "GS",
        monto: Number(resumenVenta.pago_transferencia || 0),
        tipo_nombre: "Cobro transferencia venta",
        documento: documentoVenta || null,
        referencia_id: movimientoId,
        observacion: observacionVenta
      });
      pushHistorialEntry(historialVenta, {
        fecha: new Date(),
        caja_id: caja.id,
        sesion_id: sesion?.id || null,
        terminal_id: terminalId || caja.terminal_id || null,
        empresa_id: empresaId || null,
        usuario_id: usuarioId || null,
        origen: "VENTA",
        operacion: "CREDITO",
        moneda: "GS",
        monto: Number(resumenVenta.pago_pix || 0),
        tipo_nombre: "Cobro PIX venta",
        documento: documentoVenta || null,
        referencia_id: movimientoId,
        observacion: observacionVenta
      });
      pushHistorialEntry(historialVenta, {
        fecha: new Date(),
        caja_id: caja.id,
        sesion_id: sesion?.id || null,
        terminal_id: terminalId || caja.terminal_id || null,
        empresa_id: empresaId || null,
        usuario_id: usuarioId || null,
        origen: "VENTA",
        operacion: "DEBITO",
        moneda: vuelto.historialMoneda,
        monto: Number(i === ventasDB.length - 1 ? vuelto.montoMoneda : 0),
        tipo_nombre: "Vuelto venta",
        documento: documentoVenta || null,
        referencia_id: movimientoId,
        observacion: observacionVenta
      });

      if (historialVenta.length) {
        await registrarHistorialCaja(client, historialVenta);
      }
    }

    await client.query("COMMIT");

    return res.json({
      ok: true,
      caja_id: caja.id,
      sesion_id: sesion?.id || null,
      total: totalGeneral,
      total_pagado_gs: resumenPagos.total_pagado_gs,
      vuelto_gs: vuelto.gs
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("POST /api/caja/cobrar:", err);
    return res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

router.post("/cobrar-legacy", requirePermisoVentaRapida("venta_rapida_efectivizar"), async (req, res) => {
  const client = await pool.connect();

  try {
    const {
      ventas = [],
      pago_gs = 0,
      pago_brl = 0,
      pago_usd = 0,
      total_pagado_gs = 0
    } = req.body || {};

    if (!Array.isArray(ventas) || !ventas.length) {
      return res.status(400).json({ error: "No hay ventas para cobrar" });
    }

    const terminalId = getTerminalIdFromReq(req);
    const usuarioId = getUsuarioIdFromReq(req);
    const empresaId = getEmpresaIdFromReq(req);

    await client.query("BEGIN");

    const cot = await getCotizaciones(client);
    const caja = await getCajaAbierta(client, { terminalId, adoptLegacy: true });
    if (!caja) throw new Error("No hay caja abierta");

    const sesion = await getSesionValidaParaCobro(client, {
      caja,
      terminalId,
      usuarioId
    });

    let totalGeneral = 0;
    const ventasDB = [];

    for (const id of ventas) {
      const ventaRes = await client.query(
        `SELECT id, numero, total, estado FROM venta WHERE id = $1 FOR UPDATE`,
        [id]
      );

      if (!ventaRes.rowCount) throw new Error(`Venta ${id} no encontrada`);
      const venta = ventaRes.rows[0];
      await validarOperacionVentaParaCobro(client, venta);

      if (!POS_SIN_COCINA) {
        const preparoCheck = await client.query(
          `
          SELECT EXISTS (
            SELECT 1
            FROM venta_detalle vd
            JOIN producto p ON p.id = vd.producto_id
            WHERE vd.venta_id = $1
              AND p.destino_impresion IS NOT NULL
              AND p.efectivacion_directa = false
          ) AS tiene_preparo
          `,
          [id]
        );

        if (preparoCheck.rows[0].tiene_preparo && venta.estado !== "CONCLUIDO") {
          throw new Error(`Venta ${venta.numero} no esta concluida`);
        }
      }

      const cobrada = await client.query(
        `SELECT 1 FROM caja_movimiento WHERE venta_id = $1`,
        [id]
      );

      if (cobrada.rowCount) {
        throw new Error(`Venta ${venta.numero} ya fue cobrada`);
      }

      totalGeneral += Number(venta.total);
      ventasDB.push(venta);
    }

    if (Number(total_pagado_gs) < totalGeneral) {
      throw new Error("Monto insuficiente");
    }

    const pagosLegacy = [
      { metodo: "EFECTIVO", moneda: "PYG", monto: Number(pago_gs) || 0, monto_gs: Number(pago_gs) || 0 },
      {
        metodo: "EFECTIVO",
        moneda: "BRL",
        monto: Number(pago_brl) || 0,
        monto_gs: (Number(pago_brl) || 0) * (Number(cot?.brl) || 0)
      },
      {
        metodo: "EFECTIVO",
        moneda: "USD",
        monto: Number(pago_usd) || 0,
        monto_gs: (Number(pago_usd) || 0) * (Number(cot?.usd) || 0)
      }
    ].filter((pago) => toNumber(pago.monto) > 0);
    const vuelto = resolverVueltoMoneda(pagosLegacy, totalGeneral, cot);

    let acumuladoGs = 0;
    let acumuladoBrl = 0;
    let acumuladoUsd = 0;

    for (let i = 0; i < ventasDB.length; i += 1) {
      const venta = ventasDB[i];
      const proporcion = Number(venta.total) / totalGeneral;

      let pagoGsInd;
      let pagoBrlInd;
      let pagoUsdInd;

      if (i === ventasDB.length - 1) {
        pagoGsInd = Number(pago_gs) - acumuladoGs;
        pagoBrlInd = Number(pago_brl) - acumuladoBrl;
        pagoUsdInd = Number(pago_usd) - acumuladoUsd;
      } else {
        pagoGsInd = round(Number(pago_gs) * proporcion);
        pagoBrlInd = round(Number(pago_brl) * proporcion);
        pagoUsdInd = round(Number(pago_usd) * proporcion);

        acumuladoGs += pagoGsInd;
        acumuladoBrl += pagoBrlInd;
        acumuladoUsd += pagoUsdInd;
      }

      const vueltoGsInd = i === ventasDB.length - 1 ? vuelto.gs : 0;
      const vueltoBrlInd = i === ventasDB.length - 1 ? vuelto.brl : 0;
      const vueltoUsdInd = i === ventasDB.length - 1 ? vuelto.usd : 0;

      const movimientoRes = await client.query(
        `
        INSERT INTO caja_movimiento
          (caja_id, venta_id, total_venta,
           pago_efectivo, pago_efectivo_real, pago_efectivo_dolar,
           cotizacion_real, cotizacion_dolar,
           pago_tarjeta, pago_transferencia, pago_pix,
           vuelto, vuelto_real, vuelto_dolar,
           usuario_id, caja_sesion_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,0,0,0,$9,$10,$11,$12,$13)
        RETURNING id
        `,
        [
          caja.id,
          venta.id,
          venta.total,
          pagoGsInd,
          pagoBrlInd,
          pagoUsdInd,
          cot.brl,
          cot.usd,
          vueltoGsInd,
          vueltoBrlInd,
          vueltoUsdInd,
          usuarioId || null,
          sesion?.id || null
        ]
      );
      const movimientoId = movimientoRes.rows[0]?.id || null;

      await client.query(
        `UPDATE venta SET estado = 'EFECTIVADO', estado_caja = 'COBRADO' WHERE id = $1`,
        [venta.id]
      );
      await clearMesaByVentaId(client, venta.id, getMesaScopeFromReq(req));

      const historialVenta = [];
      const documentoVenta = String(venta.numero || venta.id || "");
      const observacionVenta = `Cobro venta #${documentoVenta || venta.id}`;

      pushHistorialEntry(historialVenta, {
        fecha: new Date(),
        caja_id: caja.id,
        sesion_id: sesion?.id || null,
        terminal_id: terminalId || caja.terminal_id || null,
        empresa_id: empresaId || null,
        usuario_id: usuarioId || null,
        origen: "VENTA",
        operacion: "CREDITO",
        moneda: "GS",
        monto: Number(pagoGsInd || 0),
        tipo_nombre: "Cobro efectivo venta",
        documento: documentoVenta || null,
        referencia_id: movimientoId,
        observacion: observacionVenta
      });
      pushHistorialEntry(historialVenta, {
        fecha: new Date(),
        caja_id: caja.id,
        sesion_id: sesion?.id || null,
        terminal_id: terminalId || caja.terminal_id || null,
        empresa_id: empresaId || null,
        usuario_id: usuarioId || null,
        origen: "VENTA",
        operacion: "CREDITO",
        moneda: "R$",
        monto: Number(pagoBrlInd || 0),
        tipo_nombre: "Cobro efectivo venta",
        documento: documentoVenta || null,
        referencia_id: movimientoId,
        observacion: observacionVenta
      });
      pushHistorialEntry(historialVenta, {
        fecha: new Date(),
        caja_id: caja.id,
        sesion_id: sesion?.id || null,
        terminal_id: terminalId || caja.terminal_id || null,
        empresa_id: empresaId || null,
        usuario_id: usuarioId || null,
        origen: "VENTA",
        operacion: "CREDITO",
        moneda: "US$",
        monto: Number(pagoUsdInd || 0),
        tipo_nombre: "Cobro efectivo venta",
        documento: documentoVenta || null,
        referencia_id: movimientoId,
        observacion: observacionVenta
      });
      pushHistorialEntry(historialVenta, {
        fecha: new Date(),
        caja_id: caja.id,
        sesion_id: sesion?.id || null,
        terminal_id: terminalId || caja.terminal_id || null,
        empresa_id: empresaId || null,
        usuario_id: usuarioId || null,
        origen: "VENTA",
        operacion: "DEBITO",
        moneda: vuelto.historialMoneda,
        monto: Number(i === ventasDB.length - 1 ? vuelto.montoMoneda : 0),
        tipo_nombre: "Vuelto venta",
        documento: documentoVenta || null,
        referencia_id: movimientoId,
        observacion: observacionVenta
      });

      if (historialVenta.length) {
        await registrarHistorialCaja(client, historialVenta);
      }
    }

    await client.query("COMMIT");

    res.json({
      ok: true,
      caja_id: caja.id,
      sesion_id: sesion?.id || null,
      total: totalGeneral,
      vuelto_gs: vuelto.gs
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("POST /api/caja/cobrar-legacy:", err);
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

router.post("/cambiar-sesion", requirePermisoVentaRapida("caja_conferir_cierre"), async (req, res) => {
  const client = await pool.connect();
  try {
    const terminalId = getTerminalIdFromReq(req);
    const usuarioIdActual = getUsuarioIdFromReq(req);
    const usuarioIdObjetivo = toId(req.body?.usuario_id) || usuarioIdActual;
    const empresaId = getEmpresaIdFromReq(req);

    if (!usuarioIdObjetivo) {
      return res.status(400).json({ error: "usuario_id requerido para cambio de sesion" });
    }

    await client.query("BEGIN");

    const caja = await getCajaAbierta(client, { terminalId, adoptLegacy: true });
    if (!caja) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "No hay caja abierta" });
    }

    const usuarioRes = await client.query(
      `
      SELECT id, usuario, nombre, activo, empresa_id
      FROM usuario
      WHERE id = $1
      LIMIT 1
      `,
      [usuarioIdObjetivo]
    );

    if (!usuarioRes.rowCount || !usuarioRes.rows[0].activo) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Usuario no valido para abrir sesion" });
    }

    if (empresaId && toId(usuarioRes.rows[0].empresa_id) && Number(usuarioRes.rows[0].empresa_id) !== Number(empresaId)) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "El usuario no pertenece a la empresa activa" });
    }

    let nuevaSesion = await switchSesionToUsuario(client, {
      caja,
      terminalId,
      nuevoUsuarioId: usuarioIdObjetivo,
      usuarioCierre: usuarioIdActual || usuarioIdObjetivo,
      observacionCierre: req.body?.observacion || "Cambio manual de sesion",
      observacionApertura: req.body?.observacion || "Sesion abierta por cambio manual"
    });
    nuevaSesion = await hydrateSesion(client, nuevaSesion?.id);

    await client.query("COMMIT");

    res.json({
      ok: true,
      caja_id: caja.id,
      terminal_id: terminalId || caja.terminal_id || null,
      sesion: nuevaSesion,
      usuario: usuarioRes.rows[0]
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("POST /api/caja/cambiar-sesion:", err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

router.post("/cerrar", requirePermisoVentaRapida("caja_cerrar"), async (req, res) => {
  const client = await pool.connect();
  try {
    const terminalId = getTerminalIdFromReq(req);
    const usuarioId = getUsuarioIdFromReq(req);
    const empresaId = getEmpresaIdFromReq(req);
    const caja = await getCajaAbierta(client, { terminalId, adoptLegacy: true });

    if (!caja) return res.status(400).json({ error: "No hay caja abierta" });

    const sys = await getCajaResumen(client, caja.id);
    const cot = await getCotizaciones(client);

    const {
      monto_contado = 0,
      monto_contado_real = 0,
      monto_contado_dolar = 0,
      monto_contado_tarjeta = 0,
      monto_contado_transferencia = 0,
      monto_contado_pix = 0,
      observacion = ""
    } = req.body || {};

    const inicial = getMontosInicialesCaja(caja);
    const esp_gs = inicial.gs + parseFloat(sys.efectivo || 0);
    const esp_brl = inicial.brl + parseFloat(sys.efectivo_real || 0);
    const esp_usd = inicial.usd + parseFloat(sys.efectivo_dolar || 0);
    const esp_tarjeta = parseFloat(sys.tarjeta || 0);
    const esp_transferencia = parseFloat(sys.transferencia || 0);
    const esp_pix = parseFloat(sys.pix || 0);

    const dif_gs = parseFloat(monto_contado || 0) - esp_gs;
    const dif_brl = parseFloat(monto_contado_real || 0) - esp_brl;
    const dif_usd = parseFloat(monto_contado_dolar || 0) - esp_usd;
    const dif_tarjeta = parseFloat(monto_contado_tarjeta || 0) - esp_tarjeta;
    const dif_transferencia = parseFloat(monto_contado_transferencia || 0) - esp_transferencia;
    const dif_pix = parseFloat(monto_contado_pix || 0) - esp_pix;
    const dif_total = dif_gs + dif_brl * cot.brl + dif_usd * cot.usd;

    await client.query("BEGIN");

    await client.query(
      `
      UPDATE caja
      SET estado = $1, fecha_cierre = NOW(), monto_final = $2
      WHERE id = $3
      `,
      [ESTADO_CERRADA, Number(monto_contado) || 0, caja.id]
    );

    const sesion = await getSesionAbierta(client, caja.id, terminalId);
    if (sesion) {
      await closeSesion(client, {
        sesionId: sesion.id,
        usuarioCierre: usuarioId || null,
        montoContado: Number(monto_contado) || 0,
        montoContadoReal: Number(monto_contado_real) || 0,
        montoContadoDolar: Number(monto_contado_dolar) || 0,
        diferencia: dif_total,
        diferenciaReal: dif_brl,
        diferenciaDolar: dif_usd,
        totalVentas: Number(sys.total || 0),
        cotizacion: cot,
        observacion
      });
    }

    const documentoCierre = sesion?.id ? `CIE-${sesion.id}` : `CIE-${caja.id}`;
    const observacionCierre = String(observacion || "").trim() || null;
    const historialCierre = [];

    pushHistorialEntry(historialCierre, {
      fecha: new Date(),
      caja_id: caja.id,
      sesion_id: sesion?.id || null,
      terminal_id: terminalId || caja.terminal_id || null,
      empresa_id: empresaId || null,
      usuario_id: usuarioId || null,
      origen: "CIERRE",
      operacion: "REFERENCIA",
      moneda: "GS",
      monto: Number(monto_contado || 0),
      tipo_nombre: "Cierre efectivo contado",
      documento: documentoCierre,
      referencia_id: sesion?.id || caja.id,
      observacion: observacionCierre
    }, { includeZero: true });
    pushHistorialEntry(historialCierre, {
      fecha: new Date(),
      caja_id: caja.id,
      sesion_id: sesion?.id || null,
      terminal_id: terminalId || caja.terminal_id || null,
      empresa_id: empresaId || null,
      usuario_id: usuarioId || null,
      origen: "CIERRE",
      operacion: "REFERENCIA",
      moneda: "R$",
      monto: Number(monto_contado_real || 0),
      tipo_nombre: "Cierre efectivo contado",
      documento: documentoCierre,
      referencia_id: sesion?.id || caja.id,
      observacion: observacionCierre
    }, { includeZero: true });
    pushHistorialEntry(historialCierre, {
      fecha: new Date(),
      caja_id: caja.id,
      sesion_id: sesion?.id || null,
      terminal_id: terminalId || caja.terminal_id || null,
      empresa_id: empresaId || null,
      usuario_id: usuarioId || null,
      origen: "CIERRE",
      operacion: "REFERENCIA",
      moneda: "US$",
      monto: Number(monto_contado_dolar || 0),
      tipo_nombre: "Cierre efectivo contado",
      documento: documentoCierre,
      referencia_id: sesion?.id || caja.id,
      observacion: observacionCierre
    }, { includeZero: true });
    pushHistorialEntry(historialCierre, {
      fecha: new Date(),
      caja_id: caja.id,
      sesion_id: sesion?.id || null,
      terminal_id: terminalId || caja.terminal_id || null,
      empresa_id: empresaId || null,
      usuario_id: usuarioId || null,
      origen: "CIERRE",
      operacion: "REFERENCIA",
      moneda: "GS",
      monto: Number(monto_contado_tarjeta || 0),
      tipo_nombre: "Cierre tarjeta contado",
      documento: documentoCierre,
      referencia_id: sesion?.id || caja.id,
      observacion: observacionCierre
    }, { includeZero: true });
    pushHistorialEntry(historialCierre, {
      fecha: new Date(),
      caja_id: caja.id,
      sesion_id: sesion?.id || null,
      terminal_id: terminalId || caja.terminal_id || null,
      empresa_id: empresaId || null,
      usuario_id: usuarioId || null,
      origen: "CIERRE",
      operacion: "REFERENCIA",
      moneda: "GS",
      monto: Number(monto_contado_transferencia || 0),
      tipo_nombre: "Cierre transferencia contado",
      documento: documentoCierre,
      referencia_id: sesion?.id || caja.id,
      observacion: observacionCierre
    }, { includeZero: true });
    pushHistorialEntry(historialCierre, {
      fecha: new Date(),
      caja_id: caja.id,
      sesion_id: sesion?.id || null,
      terminal_id: terminalId || caja.terminal_id || null,
      empresa_id: empresaId || null,
      usuario_id: usuarioId || null,
      origen: "CIERRE",
      operacion: "REFERENCIA",
      moneda: "GS",
      monto: Number(monto_contado_pix || 0),
      tipo_nombre: "Cierre pix contado",
      documento: documentoCierre,
      referencia_id: sesion?.id || caja.id,
      observacion: observacionCierre
    }, { includeZero: true });

    const ajustesCierre = [
      { moneda: "GS", diferencia: Number(dif_gs || 0), tipo: "Ajuste cierre efectivo Gs" },
      { moneda: "R$", diferencia: Number(dif_brl || 0), tipo: "Ajuste cierre efectivo R$" },
      { moneda: "US$", diferencia: Number(dif_usd || 0), tipo: "Ajuste cierre efectivo US$" }
    ];
    for (const ajuste of ajustesCierre) {
      if (!Number.isFinite(ajuste.diferencia) || ajuste.diferencia === 0) continue;
      pushHistorialEntry(historialCierre, {
        fecha: new Date(),
        caja_id: caja.id,
        sesion_id: sesion?.id || null,
        terminal_id: terminalId || caja.terminal_id || null,
        empresa_id: empresaId || null,
        usuario_id: usuarioId || null,
        origen: "AJUSTE",
        operacion: ajuste.diferencia > 0 ? "CREDITO" : "DEBITO",
        moneda: ajuste.moneda,
        monto: Math.abs(ajuste.diferencia),
        tipo_nombre: ajuste.tipo,
        documento: documentoCierre,
        referencia_id: sesion?.id || caja.id,
        observacion: observacionCierre
      });
    }

    if (historialCierre.length) {
      await registrarHistorialCaja(client, historialCierre);
    }

    await client.query("COMMIT");

    res.json({
      ok: true,
      resumen: {
        esp_gs,
        esp_brl,
        esp_usd,
        esp_tarjeta,
        esp_transferencia,
        esp_pix,
        dif_gs,
        dif_brl,
        dif_usd,
        dif_tarjeta,
        dif_transferencia,
        dif_pix,
        dif_total
      }
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("POST /api/caja/cerrar:", err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

router.get("/manual/tipos", requirePermisoVentaRapida("caja_lanzamiento_manual"), async (req, res) => {
  try {
    const naturaleza = normalizeNaturaleza(req.query?.naturaleza || "", "ENTRADA");
    const onlyActivos = toBool(req.query?.solo_activos, true);

    const r = await pool.query(
      `
      SELECT id, nombre, naturaleza, activo
      FROM caja_movimiento_tipo
      WHERE naturaleza = $1
        AND ($2::boolean = false OR activo = true)
      ORDER BY nombre ASC, id ASC
      `,
      [naturaleza, onlyActivos]
    );

    res.json(r.rows);
  } catch (err) {
    console.error("GET /api/caja/manual/tipos:", err);
    res.status(500).json({ error: err.message || "No se pudieron cargar tipos de movimiento" });
  }
});

router.post("/manual/tipos", requirePermisoVentaRapida("caja_lanzamiento_manual"), async (req, res) => {
  const client = await pool.connect();
  try {
    const naturaleza = normalizeNaturaleza(req.body?.naturaleza, "ENTRADA");
    const nombre = String(req.body?.nombre || "").trim();
    if (!nombre) return res.status(400).json({ error: "Nombre de tipo requerido" });

    await client.query("BEGIN");
    const tipo = await resolveTipoMovimientoManual(client, {
      tipoNombre: nombre,
      naturaleza
    });
    await client.query("COMMIT");
    res.json({ ok: true, tipo });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("POST /api/caja/manual/tipos:", err);
    res.status(400).json({ error: err.message || "No se pudo guardar tipo de movimiento" });
  } finally {
    client.release();
  }
});

router.get("/manual", requirePermisoVentaRapida("caja_lanzamiento_manual"), async (req, res) => {
  const client = await pool.connect();
  try {
    const terminalId = getTerminalIdFromReq(req);
    const cajaIdReq = toId(req.query?.caja_id);
    const limite = Math.min(Math.max(Number(req.query?.limit || req.query?.limite || 40), 1), 200);
    let cajaId = cajaIdReq;

    if (!cajaId) {
      const caja = await getCajaAbierta(client, { terminalId, adoptLegacy: true });
      cajaId = toId(caja?.id);
    }

    if (!cajaId) return res.json({ caja_id: null, movimientos: [] });

    const q = await client.query(
      `
      SELECT
        mm.id,
        mm.caja_id,
        mm.caja_sesion_id,
        mm.terminal_id,
        mm.usuario_id,
        u.nombre AS usuario_nombre,
        mm.tipo_movimiento_id,
        mm.tipo_movimiento_nombre,
        mm.naturaleza,
        mm.moneda_id,
        mm.monto,
        mm.monto_gs,
        mm.documento,
        mm.observacion,
        mm.created_at
      FROM caja_movimiento_manual mm
      LEFT JOIN usuario u ON u.id = mm.usuario_id
      WHERE mm.caja_id = $1
      ORDER BY mm.created_at DESC, mm.id DESC
      LIMIT $2
      `,
      [cajaId, limite]
    );

    res.json({
      caja_id: cajaId,
      movimientos: q.rows
    });
  } catch (err) {
    console.error("GET /api/caja/manual:", err);
    res.status(500).json({ error: err.message || "No se pudieron cargar movimientos manuales" });
  } finally {
    client.release();
  }
});

router.post("/manual", requirePermisoVentaRapida("caja_lanzamiento_manual"), async (req, res) => {
  const client = await pool.connect();
  try {
    const terminalId = getTerminalIdFromReq(req);
    const usuarioId = getUsuarioIdFromReq(req);
    const empresaId = getEmpresaIdFromReq(req);

    const montoInput = Math.abs(Number(req.body?.monto ?? req.body?.valor ?? 0));
    if (!Number.isFinite(montoInput) || montoInput <= 0) {
      return res.status(400).json({ error: "El valor del movimiento debe ser mayor a cero" });
    }

    const naturaleza = normalizeNaturaleza(req.body?.naturaleza, "ENTRADA");
    const monedaId = normalizeMonedaId(req.body?.moneda_id ?? req.body?.moneda, MONEDA_IDS.PYG);
    const signo = naturaleza === "SALIDA" ? -1 : 1;

    await client.query("BEGIN");

    const caja = await getCajaAbierta(client, { terminalId, adoptLegacy: true });
    if (!caja?.id) throw new Error("No hay caja abierta");

    const sesion = await getSesionValidaParaCobro(client, {
      caja,
      terminalId,
      usuarioId
    });

    const cot = await getCotizaciones(client);
    const montoSigned = montoInput * signo;
    const montoGs = calcMontoGsByMoneda({
      monedaId,
      monto: montoSigned,
      cotizacion: cot
    });

    const tipo = await resolveTipoMovimientoManual(client, {
      tipoId: req.body?.tipo_movimiento_id,
      tipoNombre: req.body?.tipo_movimiento_nombre || req.body?.tipo_movimiento || req.body?.historial,
      naturaleza
    });

    const insert = await client.query(
      `
      INSERT INTO caja_movimiento_manual (
        caja_id,
        caja_sesion_id,
        terminal_id,
        usuario_id,
        tipo_movimiento_id,
        tipo_movimiento_nombre,
        naturaleza,
        moneda_id,
        monto,
        monto_gs,
        cotizacion_brl,
        cotizacion_usd,
        observacion,
        documento
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      RETURNING *
      `,
      [
        caja.id,
        sesion?.id || null,
        terminalId || caja.terminal_id || null,
        usuarioId || null,
        tipo.id,
        tipo.nombre,
        naturaleza,
        monedaId,
        montoInput,
        Number(montoGs || 0),
        Number(cot.brl || 0),
        Number(cot.usd || 0),
        String(req.body?.observacion || "").trim() || null,
        String(req.body?.documento || "").trim() || null
      ]
    );
    const movimientoManual = insert.rows[0] || null;

    const origenManual = String(tipo?.nombre || "").toUpperCase().includes("AJUSTE") ? "AJUSTE" : "MANUAL";
    await registrarHistorialCaja(client, {
      fecha: movimientoManual?.created_at || new Date(),
      caja_id: caja.id,
      sesion_id: sesion?.id || null,
      terminal_id: terminalId || caja.terminal_id || null,
      empresa_id: empresaId || null,
      usuario_id: usuarioId || null,
      origen: origenManual,
      operacion: naturaleza === "SALIDA" ? "DEBITO" : "CREDITO",
      moneda: monedaHistorialById(monedaId),
      monto: Number(montoInput || 0),
      tipo_id: tipo.id,
      tipo_nombre: tipo.nombre,
      documento: String(req.body?.documento || "").trim() || null,
      referencia_id: movimientoManual?.id || null,
      observacion: String(req.body?.observacion || "").trim() || null
    });

    const resumen = await getCajaResumen(client, caja.id);

    await client.query("COMMIT");

    res.json({
      ok: true,
      caja_id: caja.id,
      sesion_id: sesion?.id || null,
      movimiento: insert.rows[0],
      resumen
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("POST /api/caja/manual:", err);
    res.status(400).json({ error: err.message || "No se pudo guardar movimiento manual" });
  } finally {
    client.release();
  }
});

router.get("/arqueo", requirePermisoVentaRapida("caja_arqueo"), async (req, res) => {
  const client = await pool.connect();
  try {
    const terminalId = getTerminalIdFromReq(req);
    const cajaIdReq = toId(req.query?.caja_id);
    const limite = Math.min(Math.max(Number(req.query?.limit || req.query?.limite || 30), 1), 200);
    let cajaId = cajaIdReq;

    if (!cajaId) {
      const caja = await getCajaAbierta(client, { terminalId, adoptLegacy: true });
      cajaId = toId(caja?.id);
    }

    if (!cajaId) return res.json({ caja_id: null, arqueos: [] });

    const q = await client.query(
      `
      SELECT
        a.*,
        u.nombre AS usuario_nombre
      FROM caja_arqueo a
      LEFT JOIN usuario u ON u.id = a.usuario_id
      WHERE a.caja_id = $1
      ORDER BY a.created_at DESC, a.id DESC
      LIMIT $2
      `,
      [cajaId, limite]
    );

    res.json({
      caja_id: cajaId,
      arqueos: q.rows
    });
  } catch (err) {
    console.error("GET /api/caja/arqueo:", err);
    res.status(500).json({ error: err.message || "No se pudo cargar arqueo" });
  } finally {
    client.release();
  }
});

router.post("/arqueo", requirePermisoVentaRapida("caja_arqueo"), async (req, res) => {
  const client = await pool.connect();
  try {
    const terminalId = getTerminalIdFromReq(req);
    const usuarioId = getUsuarioIdFromReq(req);
    const empresaId = getEmpresaIdFromReq(req);

    await client.query("BEGIN");

    const caja = await getCajaAbierta(client, { terminalId, adoptLegacy: true });
    if (!caja?.id) throw new Error("No hay caja abierta");

    const sesion = await ensureSesionActiva(client, {
      caja,
      terminalId,
      usuarioId,
      autoCrear: true
    });

    const resumen = await getCajaResumen(client, caja.id);

    const contadoGs = Number(req.body?.contado_gs || 0);
    const contadoBrl = Number(req.body?.contado_brl || 0);
    const contadoUsd = Number(req.body?.contado_usd || 0);
    const contadoTarjeta = Number(req.body?.contado_tarjeta || 0);
    const contadoTransferencia = Number(req.body?.contado_transferencia || 0);
    const contadoPix = Number(req.body?.contado_pix || 0);

    const inicial = getMontosInicialesCaja(caja);
    const esperadoGs = inicial.gs + Number(resumen.efectivo || 0);
    const esperadoBrl = inicial.brl + Number(resumen.efectivo_real || 0);
    const esperadoUsd = inicial.usd + Number(resumen.efectivo_dolar || 0);
    const esperadoTarjeta = Number(resumen.tarjeta || 0);
    const esperadoTransferencia = Number(resumen.transferencia || 0);
    const esperadoPix = Number(resumen.pix || 0);

    const insert = await client.query(
      `
      INSERT INTO caja_arqueo (
        caja_id,
        caja_sesion_id,
        terminal_id,
        usuario_id,
        contado_gs,
        contado_brl,
        contado_usd,
        contado_tarjeta,
        contado_transferencia,
        contado_pix,
        esperado_gs,
        esperado_brl,
        esperado_usd,
        esperado_tarjeta,
        esperado_transferencia,
        esperado_pix,
        diferencia_gs,
        diferencia_brl,
        diferencia_usd,
        diferencia_tarjeta,
        diferencia_transferencia,
        diferencia_pix,
        observacion
      )
      VALUES (
        $1,$2,$3,$4,
        $5,$6,$7,$8,$9,$10,
        $11,$12,$13,$14,$15,$16,
        $17,$18,$19,$20,$21,$22,$23
      )
      RETURNING *
      `,
      [
        caja.id,
        sesion?.id || null,
        terminalId || caja.terminal_id || null,
        usuarioId || null,
        contadoGs,
        contadoBrl,
        contadoUsd,
        contadoTarjeta,
        contadoTransferencia,
        contadoPix,
        esperadoGs,
        esperadoBrl,
        esperadoUsd,
        esperadoTarjeta,
        esperadoTransferencia,
        esperadoPix,
        contadoGs - esperadoGs,
        contadoBrl - esperadoBrl,
        contadoUsd - esperadoUsd,
        contadoTarjeta - esperadoTarjeta,
        contadoTransferencia - esperadoTransferencia,
        contadoPix - esperadoPix,
        String(req.body?.observacion || "").trim() || null
      ]
    );
    const arqueo = insert.rows[0] || null;
    const documentoArqueo = arqueo?.id ? `ARQ-${arqueo.id}` : null;
    const observacionArqueo = String(req.body?.observacion || "").trim() || null;
    const historialArqueo = [];

    pushHistorialEntry(historialArqueo, {
      fecha: arqueo?.created_at || new Date(),
      caja_id: caja.id,
      sesion_id: sesion?.id || null,
      terminal_id: terminalId || caja.terminal_id || null,
      empresa_id: empresaId || null,
      usuario_id: usuarioId || null,
      origen: "ARQUEO",
      operacion: "REFERENCIA",
      moneda: "GS",
      monto: contadoGs,
      tipo_nombre: "Arqueo efectivo",
      documento: documentoArqueo,
      referencia_id: arqueo?.id || null,
      observacion: observacionArqueo
    }, { includeZero: true });
    pushHistorialEntry(historialArqueo, {
      fecha: arqueo?.created_at || new Date(),
      caja_id: caja.id,
      sesion_id: sesion?.id || null,
      terminal_id: terminalId || caja.terminal_id || null,
      empresa_id: empresaId || null,
      usuario_id: usuarioId || null,
      origen: "ARQUEO",
      operacion: "REFERENCIA",
      moneda: "R$",
      monto: contadoBrl,
      tipo_nombre: "Arqueo efectivo",
      documento: documentoArqueo,
      referencia_id: arqueo?.id || null,
      observacion: observacionArqueo
    }, { includeZero: true });
    pushHistorialEntry(historialArqueo, {
      fecha: arqueo?.created_at || new Date(),
      caja_id: caja.id,
      sesion_id: sesion?.id || null,
      terminal_id: terminalId || caja.terminal_id || null,
      empresa_id: empresaId || null,
      usuario_id: usuarioId || null,
      origen: "ARQUEO",
      operacion: "REFERENCIA",
      moneda: "US$",
      monto: contadoUsd,
      tipo_nombre: "Arqueo efectivo",
      documento: documentoArqueo,
      referencia_id: arqueo?.id || null,
      observacion: observacionArqueo
    }, { includeZero: true });
    pushHistorialEntry(historialArqueo, {
      fecha: arqueo?.created_at || new Date(),
      caja_id: caja.id,
      sesion_id: sesion?.id || null,
      terminal_id: terminalId || caja.terminal_id || null,
      empresa_id: empresaId || null,
      usuario_id: usuarioId || null,
      origen: "ARQUEO",
      operacion: "REFERENCIA",
      moneda: "GS",
      monto: contadoTarjeta,
      tipo_nombre: "Arqueo tarjeta",
      documento: documentoArqueo,
      referencia_id: arqueo?.id || null,
      observacion: observacionArqueo
    }, { includeZero: true });
    pushHistorialEntry(historialArqueo, {
      fecha: arqueo?.created_at || new Date(),
      caja_id: caja.id,
      sesion_id: sesion?.id || null,
      terminal_id: terminalId || caja.terminal_id || null,
      empresa_id: empresaId || null,
      usuario_id: usuarioId || null,
      origen: "ARQUEO",
      operacion: "REFERENCIA",
      moneda: "GS",
      monto: contadoTransferencia,
      tipo_nombre: "Arqueo transferencia",
      documento: documentoArqueo,
      referencia_id: arqueo?.id || null,
      observacion: observacionArqueo
    }, { includeZero: true });
    pushHistorialEntry(historialArqueo, {
      fecha: arqueo?.created_at || new Date(),
      caja_id: caja.id,
      sesion_id: sesion?.id || null,
      terminal_id: terminalId || caja.terminal_id || null,
      empresa_id: empresaId || null,
      usuario_id: usuarioId || null,
      origen: "ARQUEO",
      operacion: "REFERENCIA",
      moneda: "GS",
      monto: contadoPix,
      tipo_nombre: "Arqueo pix",
      documento: documentoArqueo,
      referencia_id: arqueo?.id || null,
      observacion: observacionArqueo
    }, { includeZero: true });

    if (historialArqueo.length) {
      await registrarHistorialCaja(client, historialArqueo);
    }

    await client.query("COMMIT");

    res.json({
      ok: true,
      arqueo
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("POST /api/caja/arqueo:", err);
    res.status(400).json({ error: err.message || "No se pudo guardar arqueo" });
  } finally {
    client.release();
  }
});

router.get("/historial", requirePermisoVentaRapida("caja_consultas"), async (req, res) => {
  try {
    const limite = Math.min(Math.max(Number(req.query?.limit || req.query?.limite || 300), 1), 2000);
    const { whereSql, params } = buildWhereHistorialFormal(req);

    const rowsParams = [...params, limite];
    const rows = await pool.query(
      `
      SELECT
        h.id,
        h.fecha,
        h.caja_id,
        h.sesion_id,
        h.terminal_id,
        h.empresa_id,
        h.usuario_id,
        h.origen,
        h.operacion,
        h.moneda,
        h.monto,
        h.tipo_id,
        h.tipo_nombre,
        h.documento,
        h.referencia_id,
        h.observacion,
        COALESCE(e.nombre, ('#' || h.empresa_id::text)) AS empresa_nombre,
        COALESCE(t.nombre, ('#' || h.terminal_id::text)) AS terminal_nombre,
        COALESCE(u.nombre, ('#' || h.usuario_id::text)) AS usuario_nombre
      FROM caja_historial h
      LEFT JOIN empresa e ON e.id = h.empresa_id
      LEFT JOIN terminal t ON t.id = h.terminal_id
      LEFT JOIN usuario u ON u.id = h.usuario_id
      ${whereSql}
      ORDER BY h.fecha DESC, h.id DESC
      LIMIT $${rowsParams.length}
      `,
      rowsParams
    );

    const totals = await pool.query(
      `
      SELECT
        h.moneda,
        COALESCE(SUM(CASE WHEN UPPER(h.operacion) = 'CREDITO' THEN h.monto ELSE 0 END), 0) AS total_credito,
        COALESCE(SUM(CASE WHEN UPPER(h.operacion) = 'DEBITO' THEN h.monto ELSE 0 END), 0) AS total_debito,
        COALESCE(SUM(
          CASE
            WHEN UPPER(h.operacion) = 'CREDITO' THEN h.monto
            WHEN UPPER(h.operacion) = 'DEBITO' THEN -h.monto
            ELSE 0
          END
        ), 0) AS saldo
      FROM caja_historial h
      ${whereSql}
      GROUP BY h.moneda
      ORDER BY
        CASE h.moneda
          WHEN 'GS' THEN 1
          WHEN 'R$' THEN 2
          WHEN 'US$' THEN 3
          ELSE 4
        END
      `,
      params
    );

    res.json({
      movimientos: rows.rows,
      totales_moneda: totals.rows,
      total_registros: rows.rows.length
    });
  } catch (err) {
    console.error("GET /api/caja/historial:", err);
    res.status(500).json({ error: err.message || "No se pudo cargar historial formal de caja" });
  }
});

router.get("/historial/sesiones", requirePermisoVentaRapida("caja_consultas"), async (req, res) => {
  try {
    const { desde, hasta, estado } = req.query;
    const limite = Math.min(Math.max(Number(req.query?.limite || 50), 1), 500);
    const terminalId = getTerminalIdFromReq(req);

    const where = [];
    const params = [];

    if (desde) {
      params.push(`${desde} 00:00:00`);
      where.push(`cs.fecha_apertura >= $${params.length}`);
    }

    if (hasta) {
      params.push(`${hasta} 23:59:59`);
      where.push(`cs.fecha_apertura <= $${params.length}`);
    }

    if (estado) {
      params.push(String(estado).toUpperCase());
      where.push(`UPPER(cs.estado) = $${params.length}`);
    }

    if (terminalId) {
      params.push(terminalId);
      where.push(`(cs.terminal_id = $${params.length} OR cs.terminal_id IS NULL)`);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    params.push(limite);

    const r = await pool.query(
      `
      SELECT
        cs.*,
        ua.nombre AS usuario_nombre,
        uc.nombre AS usuario_cierre_nombre,
        t.nombre  AS terminal_nombre
      FROM caja_sesiones cs
      LEFT JOIN usuario ua ON ua.id = cs.usuario_apertura
      LEFT JOIN usuario uc ON uc.id = cs.usuario_cierre
      LEFT JOIN terminal t ON t.id = cs.terminal_id
      ${whereSql}
      ORDER BY cs.fecha_apertura DESC
      LIMIT $${params.length}
      `,
      params
    );

    res.json({ sesiones: r.rows });
  } catch (err) {
    console.error("GET /api/caja/historial/sesiones:", err);
    res.status(500).json({ error: err.message });
  }
});

router.get("/informe", requirePermisoVentaRapida("caja_informes"), async (req, res) => {
  try {
    const { fecha_desde, fecha_hasta } = req.query;
    const terminalId = getTerminalIdFromReq(req);

    const desde = fecha_desde ? new Date(fecha_desde) : new Date(new Date().setHours(0, 0, 0, 0));
    const hasta = fecha_hasta ? new Date(fecha_hasta) : new Date();

    if (!(desde instanceof Date) || Number.isNaN(desde.valueOf()) || !(hasta instanceof Date) || Number.isNaN(hasta.valueOf())) {
      return res.status(400).json({ error: "Fechas invalidas" });
    }

    const movParams = [desde, hasta];
    const totParams = [desde, hasta];
    const sesParams = [desde, hasta];

    let movScope = "";
    let totScope = "";
    let sesScope = "";

    if (terminalId) {
      movParams.push(terminalId);
      totParams.push(terminalId);
      sesParams.push(terminalId);
      movScope = ` AND (c.terminal_id = $3 OR c.terminal_id IS NULL)`;
      totScope = ` AND (c.terminal_id = $3 OR c.terminal_id IS NULL)`;
      sesScope = ` AND (cs.terminal_id = $3 OR cs.terminal_id IS NULL)`;
    }

    const [movq, totq, sesq, manualMovQ, manualTotQ] = await Promise.all([
      pool.query(
        `
        SELECT
          cm.id,
          cm.fecha,
          cm.venta_id,
          v.numero AS numero_venta,
          ven.nombre AS vendedor_nombre,
          cm.usuario_id,
          u.nombre AS cajero_nombre,
          cm.total_venta,
          cm.pago_efectivo,
          cm.pago_efectivo_real,
          cm.pago_efectivo_dolar,
          cm.cotizacion_real,
          cm.cotizacion_dolar,
          cm.pago_tarjeta,
          cm.pago_transferencia,
          cm.pago_pix,
          cm.vuelto,
          cm.vuelto_real,
          cm.vuelto_dolar
        FROM caja_movimiento cm
        JOIN caja c ON c.id = cm.caja_id
        LEFT JOIN venta v ON v.id = cm.venta_id
        LEFT JOIN vendedor ven ON ven.id = v.vendedor_id
        LEFT JOIN usuario u ON u.id = cm.usuario_id
        WHERE cm.fecha >= $1
          AND cm.fecha < ($2::timestamp + INTERVAL '1 minute')
          ${movScope}
        ORDER BY cm.fecha ASC
        `,
        movParams
      ),
      pool.query(
        `
        SELECT
          COUNT(*)                              AS cant_ventas,
          COALESCE(SUM(cm.total_venta),0)      AS total_ventas,
          COALESCE(SUM(cm.pago_efectivo),0)    AS efectivo_gs,
          COALESCE(SUM(cm.pago_efectivo_real),0) AS efectivo_brl,
          COALESCE(SUM(cm.pago_efectivo_dolar),0) AS efectivo_usd,
          COALESCE(SUM(cm.pago_tarjeta),0)     AS tarjeta,
          COALESCE(SUM(cm.pago_transferencia),0) AS transferencia,
          COALESCE(SUM(cm.pago_pix),0)         AS pix,
          COALESCE(SUM(cm.vuelto),0)           AS vuelto_total
        FROM caja_movimiento cm
        JOIN caja c ON c.id = cm.caja_id
        WHERE cm.fecha >= $1
          AND cm.fecha < ($2::timestamp + INTERVAL '1 minute')
          ${totScope}
        `,
        totParams
      ),
      pool.query(
        `
        SELECT
          cs.id,
          cs.terminal_id,
          cs.fecha_apertura AS fecha_apertura,
          cs.fecha_cierre   AS fecha_cierre,
          cs.monto_apertura,
          cs.monto_contado,
          cs.monto_contado_real,
          cs.monto_contado_dolar,
          cs.diferencia,
          cs.diferencia_real,
          cs.diferencia_dolar,
          cs.cotizacion_real,
          cs.cotizacion_dolar,
          cs.observacion,
          cs.estado,
          ua.nombre AS usuario_nombre,
          uc.nombre AS usuario_cierre_nombre,
          t.nombre  AS terminal_nombre
        FROM caja_sesiones cs
        LEFT JOIN usuario ua ON ua.id = cs.usuario_apertura
        LEFT JOIN usuario uc ON uc.id = cs.usuario_cierre
        LEFT JOIN terminal t ON t.id = cs.terminal_id
        WHERE (
          cs.fecha_apertura BETWEEN $1 AND $2
          OR (cs.fecha_cierre IS NOT NULL AND cs.fecha_cierre BETWEEN $1 AND $2)
          OR (UPPER(cs.estado) = 'ABIERTA' AND cs.fecha_apertura <= $2)
        )
        ${sesScope}
        ORDER BY cs.fecha_apertura DESC
        LIMIT 20
        `,
        sesParams
      ),
      pool.query(
        `
        SELECT
          mm.id,
          mm.created_at AS fecha,
          mm.tipo_movimiento_nombre,
          mm.naturaleza,
          mm.moneda_id,
          mm.monto,
          mm.monto_gs,
          mm.documento,
          mm.observacion,
          mm.usuario_id,
          u.nombre AS usuario_nombre
        FROM caja_movimiento_manual mm
        LEFT JOIN usuario u ON u.id = mm.usuario_id
        WHERE mm.created_at >= $1
          AND mm.created_at < ($2::timestamp + INTERVAL '1 minute')
          ${terminalId ? ` AND (mm.terminal_id = $3 OR mm.terminal_id IS NULL)` : ""}
        ORDER BY mm.created_at ASC, mm.id ASC
        `,
        terminalId ? [desde, hasta, terminalId] : [desde, hasta]
      ),
      pool.query(
        `
        SELECT
          COALESCE(SUM(CASE WHEN moneda_id = 1 AND naturaleza = 'ENTRADA' THEN monto
                            WHEN moneda_id = 1 AND naturaleza = 'SALIDA' THEN -monto
                            ELSE 0 END), 0) AS manual_gs,
          COALESCE(SUM(CASE WHEN moneda_id = 2 AND naturaleza = 'ENTRADA' THEN monto
                            WHEN moneda_id = 2 AND naturaleza = 'SALIDA' THEN -monto
                            ELSE 0 END), 0) AS manual_brl,
          COALESCE(SUM(CASE WHEN moneda_id = 3 AND naturaleza = 'ENTRADA' THEN monto
                            WHEN moneda_id = 3 AND naturaleza = 'SALIDA' THEN -monto
                            ELSE 0 END), 0) AS manual_usd,
          COALESCE(SUM(monto_gs), 0) AS manual_total_gs,
          COUNT(*) AS manual_cantidad
        FROM caja_movimiento_manual mm
        WHERE mm.created_at >= $1
          AND mm.created_at < ($2::timestamp + INTERVAL '1 minute')
          ${terminalId ? ` AND (mm.terminal_id = $3 OR mm.terminal_id IS NULL)` : ""}
        `,
        terminalId ? [desde, hasta, terminalId] : [desde, hasta]
      )
    ]);

    const resumenVentas = totq.rows?.[0] || {};
    const resumenManual = manualTotQ.rows?.[0] || {};
    const resumen = {
      ...resumenVentas,
      manual_gs: Number(resumenManual.manual_gs || 0),
      manual_brl: Number(resumenManual.manual_brl || 0),
      manual_usd: Number(resumenManual.manual_usd || 0),
      manual_total_gs: Number(resumenManual.manual_total_gs || 0),
      manual_cantidad: Number(resumenManual.manual_cantidad || 0)
    };

    res.json({
      periodo: { desde, hasta },
      terminal_id: terminalId || null,
      resumen,
      movimientos: movq.rows,
      manual_movimientos: manualMovQ.rows,
      sesiones: sesq.rows
    });
  } catch (err) {
    console.error("GET /api/caja/informe:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
