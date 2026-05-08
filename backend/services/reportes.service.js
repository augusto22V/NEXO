const repo = require("../repositories/reportes.repository");
const db = require("../db");
const { ensureComisionSchema } = require("./comision.service");

const COMPRAS_TIPOS = new Set(["detallado", "por_producto", "por_proveedor", "por_fecha"]);
const VENTAS_TIPOS = new Set(["detallado", "por_producto", "por_cliente", "por_fecha", "por_vendedor"]);
const CAJA_TIPOS = new Set(["movimientos", "resumen_por_dia", "resumen_metodo_pago"]);
const IA_INTENTIONS = new Set(["total", "listado", "comparacion", "ranking", "tendencia", "detalle"]);
const REPORT_TYPE_CONFIG = Object.freeze({
  compras: { types: COMPRAS_TIPOS, defaultType: "detallado" },
  ventas: { types: VENTAS_TIPOS, defaultType: "detallado" },
  caja: { types: CAJA_TIPOS, defaultType: "movimientos" }
});
const MONTH_ALIASES = Object.freeze({
  enero: 1,
  janeiro: 1,
  febrero: 2,
  fevereiro: 2,
  marzo: 3,
  marco: 3,
  abril: 4,
  mayo: 5,
  maio: 5,
  junio: 6,
  junho: 6,
  julio: 7,
  julho: 7,
  agosto: 8,
  septiembre: 9,
  setiembre: 9,
  setembro: 9,
  octubre: 10,
  outubro: 10,
  noviembre: 11,
  novembro: 11,
  diciembre: 12,
  dezembro: 12
});
const MONTH_WORD_PATTERN = Object.keys(MONTH_ALIASES).sort((a, b) => b.length - a.length).join("|");
const GENERIC_ENTITY_TOKENS = new Set([
  "cantidad",
  "cantidades",
  "cliente",
  "clientes",
  "compra",
  "compras",
  "comprador",
  "compradores",
  "monto",
  "montos",
  "precio",
  "precios",
  "producto",
  "productos",
  "proveedor",
  "proveedores",
  "suma",
  "sumas",
  "total",
  "totales",
  "usuario",
  "usuarios",
  "vendedor",
  "vendedores",
  "venta",
  "ventas"
]);
const TEMPORAL_ENTITY_TOKENS = new Set([
  "al",
  "ano",
  "anterior",
  "ayer",
  "de",
  "del",
  "desde",
  "dia",
  "dias",
  "durante",
  "e",
  "el",
  "en",
  "esta",
  "este",
  "estas",
  "estos",
  "fecha",
  "fechas",
  "hacia",
  "hasta",
  "historico",
  "historial",
  "hoy",
  "la",
  "las",
  "los",
  "lunes",
  "martes",
  "miercoles",
  "jueves",
  "viernes",
  "sabado",
  "domingo",
  "mes",
  "meses",
  "pasada",
  "pasado",
  "semana",
  "semanas",
  "tiempo",
  "todo",
  "todos",
  "ultima",
  "ultimo",
  "y",
  ...Object.keys(MONTH_ALIASES)
]);
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const HISTORY_RETENTION_DAYS = 180;
const HISTORY_MAX_ROWS_PER_USER = 1200;
let memorySchemaPromise = null;

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function stripAccents(value = "") {
  return String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeForMatch(value = "") {
  return stripAccents(String(value).toLowerCase()).replace(/\s+/g, " ").trim();
}

function atStartOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date, days) {
  return new Date(atStartOfDay(date).getTime() + days * MS_PER_DAY);
}

function toDateString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getMonthRange(year, month) {
  return {
    desde: new Date(year, month - 1, 1),
    hasta: new Date(year, month, 0)
  };
}

function buildValidatedDate(year, month, day) {
  const d = new Date(year, month - 1, day);
  if (Number.isNaN(d.getTime())) return null;
  if (d.getFullYear() !== year || d.getMonth() + 1 !== month || d.getDate() !== day) return null;
  return atStartOfDay(d);
}

function parseDateValue(value) {
  if (value == null) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : atStartOfDay(value);
  }

  const raw = String(value).trim();
  if (!raw) return null;

  const iso = raw.match(/^(\d{4})[-/](\d{2})[-/](\d{2})$/);
  if (iso) {
    return buildValidatedDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  }

  const dmy = raw.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
  if (dmy) {
    return buildValidatedDate(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]));
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : atStartOfDay(parsed);
}

function normalizeDate(value) {
  if (!value) return null;
  const d = parseDateValue(value);
  if (!d) throw new Error("Fecha invalida");
  return toDateString(d);
}

function normalizeText(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s || null;
}

function normalizeId(value) {
  const n = Math.trunc(toNumber(value, 0));
  return n > 0 ? n : null;
}


function resolveIaUserId(req = {}) {
  const candidates = [
    req?.usuario?.id,
    req?.user?.id,
    req?.auth?.id,
    req?.usuario_id,
    req?.user_id
  ];

  for (const raw of candidates) {
    const parsed = normalizeId(raw);
    if (parsed) return parsed;
  }
  return null;
}

function normalizeMemoryModulo(value) {
  const v = normalizeForMatch(value || "");
  if (v === "ventas") return "ventas";
  if (v === "compras") return "compras";
  if (v === "todos") return "todos";
  return null;
}

function normalizeMemoryTipoConsulta(value) {
  const v = normalizeForMatch(value || "");
  if (v === "venta" || v === "ventas") return "venta";
  if (v === "compra" || v === "compras") return "compra";
  return null;
}

function sanitizeMemoryString(value, max = 160) {
  const normalized = normalizeText(value);
  if (!normalized) return null;
  return normalized.slice(0, max);
}

function sanitizeMemoryPayload(memory = {}) {
  return {
    ultimo_modulo: normalizeMemoryModulo(memory?.ultimo_modulo),
    ultimo_cliente: sanitizeMemoryString(memory?.ultimo_cliente),
    ultimo_vendedor: sanitizeMemoryString(memory?.ultimo_vendedor),
    ultimo_tipo_consulta: normalizeMemoryTipoConsulta(memory?.ultimo_tipo_consulta)
  };
}

async function ensureIaMemorySchema() {
  if (memorySchemaPromise) return memorySchemaPromise;

  memorySchemaPromise = (async () => {
    await db.query([
      "CREATE TABLE IF NOT EXISTS ia_user_memory (",
      "user_id BIGINT PRIMARY KEY,",
      "ultimo_modulo VARCHAR(20),",
      "ultimo_cliente VARCHAR(160),",
      "ultimo_vendedor VARCHAR(160),",
      "ultimo_tipo_consulta VARCHAR(20),",
      "updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()",
      ")"
    ].join(" "));

    await db.query([
      "CREATE TABLE IF NOT EXISTS ia_user_query_history (",
      "id BIGSERIAL PRIMARY KEY,",
      "user_id BIGINT NOT NULL,",
      "consulta_texto TEXT NOT NULL,",
      "consulta_expandida TEXT,",
      "interpretacion JSONB NOT NULL DEFAULT '{}'::jsonb,",
      "contexto_selector VARCHAR(20),",
      "modulo_aplicado VARCHAR(20),",
      "tipo_consulta VARCHAR(20),",
      "created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()",
      ")"
    ].join(" "));

    await db.query([
      "CREATE INDEX IF NOT EXISTS idx_ia_user_query_history_user_created",
      "ON ia_user_query_history (user_id, created_at DESC, id DESC)"
    ].join(" "));

    await db.query([
      "CREATE INDEX IF NOT EXISTS idx_ia_user_query_history_modulo",
      "ON ia_user_query_history (modulo_aplicado, created_at DESC)"
    ].join(" "));
  })();

  try {
    await memorySchemaPromise;
  } catch (err) {
    memorySchemaPromise = null;
    throw err;
  }
}

async function getIaUserMemory(userId) {
  if (!userId) return null;

  const res = await db.query(
    "SELECT user_id, ultimo_modulo, ultimo_cliente, ultimo_vendedor, ultimo_tipo_consulta, updated_at " +
      "FROM ia_user_memory WHERE user_id = $1 LIMIT 1",
    [userId]
  );

  if (!res.rowCount) return null;
  return sanitizeMemoryPayload(res.rows[0]);
}

async function saveIaUserMemory(userId, memory = {}) {
  if (!userId) return null;
  const payload = sanitizeMemoryPayload(memory);

  await db.query(
    "INSERT INTO ia_user_memory (user_id, ultimo_modulo, ultimo_cliente, ultimo_vendedor, ultimo_tipo_consulta, updated_at) " +
      "VALUES ($1, $2, $3, $4, $5, NOW()) " +
      "ON CONFLICT (user_id) DO UPDATE SET " +
      "ultimo_modulo = EXCLUDED.ultimo_modulo, " +
      "ultimo_cliente = EXCLUDED.ultimo_cliente, " +
      "ultimo_vendedor = EXCLUDED.ultimo_vendedor, " +
      "ultimo_tipo_consulta = EXCLUDED.ultimo_tipo_consulta, " +
      "updated_at = NOW()",
    [
      userId,
      payload.ultimo_modulo,
      payload.ultimo_cliente,
      payload.ultimo_vendedor,
      payload.ultimo_tipo_consulta
    ]
  );

  return payload;
}


function isHistoryInterpretationValid(interpretacion = {}) {
  if (!interpretacion || typeof interpretacion !== "object") return false;

  const moduloRaw = normalizeForMatch(interpretacion.modulo_aplicado || interpretacion.modulo_inicial || "");
  const modulo = moduloRaw === "ventas" || moduloRaw === "compras" || moduloRaw === "caja"
    ? moduloRaw
    : null;
  const tipo = normalizeText(interpretacion.tipo_aplicado);

  if (!modulo) return false;
  if (!tipo) return false;
  if (!interpretacion.filtros_aplicados || typeof interpretacion.filtros_aplicados !== "object") return false;
  return true;
}

function shouldPersistIaHistory(history = {}) {
  const interpretacion = history.interpretacion && typeof history.interpretacion === "object"
    ? history.interpretacion
    : null;

  const consultaValida = history.consulta_valida !== false
    && history.consulta_valida !== 0
    && history.consulta_valida !== "0"
    && history.consulta_valida !== "false";

  const totalRows = Math.max(0, Math.trunc(toNumber(history.resultado_rows, 0)));
  const totalMonto = toNumber(history.resultado_total_monto, 0);
  const fallback = interpretacion?.fallback || {};
  const fallbackFailed = Boolean(fallback?.habilitado && fallback?.intentado && !fallback?.aplicado);
  const interpretacionValida = isHistoryInterpretationValid(interpretacion);

  if (!consultaValida) return false;
  if (!interpretacionValida) return false;
  if (totalRows <= 0) return false;
  if (totalMonto <= 0) return false;
  if (fallbackFailed) return false;
  return true;
}

async function saveIaQueryHistory(userId, history = {}) {
  if (!userId) return false;
  if (!shouldPersistIaHistory(history)) return false;

  const consultaTexto = sanitizeMemoryString(history.consulta_texto || history.prompt_original, 2000);
  if (!consultaTexto) return false;

  const consultaExpandida = sanitizeMemoryString(history.consulta_expandida || history.prompt_final, 2000);
  const interpretacion = history.interpretacion && typeof history.interpretacion === "object"
    ? history.interpretacion
    : {};

  await db.query(
    "INSERT INTO ia_user_query_history (" +
      "user_id, consulta_texto, consulta_expandida, interpretacion, contexto_selector, modulo_aplicado, tipo_consulta" +
      ") VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7)",
    [
      userId,
      consultaTexto,
      consultaExpandida,
      JSON.stringify(interpretacion),
      sanitizeMemoryString(history.contexto_selector, 20),
      sanitizeMemoryString(history.modulo_aplicado, 20),
      normalizeMemoryTipoConsulta(history.tipo_consulta)
    ]
  );

  return true;
}

async function cleanupIaQueryHistory(userId) {
  if (!userId) return;

  await db.query(
    "DELETE FROM ia_user_query_history " +
      "WHERE user_id = $1 " +
      "AND created_at < NOW() - make_interval(days => $2::int)",
    [userId, HISTORY_RETENTION_DAYS]
  );

  await db.query(
    "DELETE FROM ia_user_query_history " +
      "WHERE user_id = $1 " +
      "AND id IN (" +
      "SELECT id FROM ia_user_query_history WHERE user_id = $1 ORDER BY created_at DESC, id DESC OFFSET $2" +
      ")",
    [userId, HISTORY_MAX_ROWS_PER_USER]
  );
}

function detectPromptTipo(prompt = "") {
  const text = normalizeForMatch(prompt);
  if (/\bcompra\b|\bcompras\b/.test(text)) return "compra";
  if (/\bventa\b|\bventas\b/.test(text)) return "venta";
  return null;
}

function isPromptAmbiguousOrIncomplete(prompt = "") {
  const text = normalizeForMatch(prompt);
  if (!text) return true;

  const hasNames = extractEntityNamesFromPrompt(prompt).length > 0;
  const hasModuloKeyword = Boolean(detectKeywordModulo(prompt));
  const hasRoleKeyword = /\b(vendedor|cliente|proveedor)\b/.test(text);
  const hasWeekday = Boolean(extractWeekdayFromPrompt(prompt));
  const hasDateRange = Boolean(resolvePromptDateRange(prompt, new Date())?.source);
  const looksLikeContinuation = /^(y|tambien|ahora|entonces|luego|igual|lo mismo|ese|esa|esto)\b/.test(text);
  const tokens = text.split(/\s+/).filter(Boolean).length;

  if (!hasNames && !hasModuloKeyword && !hasRoleKeyword && (hasDateRange || hasWeekday)) return true;
  if (!hasNames && !hasModuloKeyword && !hasRoleKeyword && looksLikeContinuation) return true;
  if (!hasNames && !hasModuloKeyword && !hasRoleKeyword && tokens <= 2) return true;
  return false;
}

function hydratePromptWithMemory({ prompt = "", contextoSelector = "todos", memory = null } = {}) {
  const basePrompt = normalizeText(prompt) || "";
  return { prompt: basePrompt, applied: null };
}

function buildMemoryPatch({
  previousMemory = null,
  moduloAplicado = null,
  roleDetected = null,
  entityNames = [],
  promptFinal = ""
} = {}) {
  const previous = sanitizeMemoryPayload(previousMemory || {});
  const merged = {
    ...previous,
    ultimo_modulo: normalizeMemoryModulo(moduloAplicado) || previous.ultimo_modulo
  };

  const firstEntity = Array.isArray(entityNames) && entityNames.length ? sanitizeMemoryString(entityNames[0]) : null;

  if (moduloAplicado === "compras") {
    merged.ultimo_tipo_consulta = "compra";
  }

  if (moduloAplicado === "ventas") {
    if (roleDetected === "vendedor") {
      merged.ultimo_tipo_consulta = "venta";
      if (firstEntity) merged.ultimo_vendedor = firstEntity;
    } else if (roleDetected === "cliente") {
      merged.ultimo_tipo_consulta = "compra";
      if (firstEntity) merged.ultimo_cliente = firstEntity;
    } else {
      const tipoPrompt = detectPromptTipo(promptFinal);
      if (tipoPrompt === "venta") merged.ultimo_tipo_consulta = "venta";
      if (tipoPrompt === "compra") merged.ultimo_tipo_consulta = "compra";
      if (firstEntity && merged.ultimo_tipo_consulta === "venta") merged.ultimo_vendedor = firstEntity;
      if (firstEntity && merged.ultimo_tipo_consulta === "compra") merged.ultimo_cliente = firstEntity;
    }
  }

  return sanitizeMemoryPayload(merged);
}


function normalizeLimit(value, fallback = 1000, max = 5000) {
  const n = Math.trunc(toNumber(value, fallback));
  if (n <= 0) return fallback;
  return Math.min(n, max);
}

function normalizeCommonFilters(query = {}, req = {}) {
  const desde = normalizeDate(query.desde);
  const hasta = normalizeDate(query.hasta);

  if (desde && hasta && new Date(desde) > new Date(hasta)) {
    throw new Error("'desde' no puede ser mayor a 'hasta'");
  }

  return {
    desde,
    hasta,
    limit: normalizeLimit(query.limit),
    estado: normalizeText(query.estado),
    empresa_id: normalizeId(query.empresa_id) || normalizeId(req?.usuario?.empresa_id)
  };
}

function buildSummaryFromRows(rows, keys = {}) {
  const cantidadKey = keys.cantidadKey || "cantidad";
  const montoKey = keys.montoKey || "monto";

  const totalCantidad = rows.reduce((acc, row) => acc + toNumber(row[cantidadKey]), 0);
  const totalMonto = rows.reduce((acc, row) => acc + toNumber(row[montoKey]), 0);

  return {
    rows: rows.length,
    total_cantidad: totalCantidad,
    total_monto: totalMonto
  };
}

function buildMeta(modulo, tipo, filters) {
  return {
    modulo,
    tipo,
    desde: filters.desde || null,
    hasta: filters.hasta || null,
    filters
  };
}

function getReportTypeConfig(modulo = "") {
  return REPORT_TYPE_CONFIG[normalizeForMatch(modulo)] || null;
}

function isValidTipoForModulo(modulo = "", tipo = "") {
  const config = getReportTypeConfig(modulo);
  return Boolean(config && config.types.has(tipo));
}

function getDefaultTipoForModulo(modulo = "") {
  return getReportTypeConfig(modulo)?.defaultType || "detallado";
}

function buildReportSummary(modulo, tipo, rows = []) {
  if (modulo === "caja") {
    return {
      rows: rows.length,
      total_monto: rows.reduce((a, r) => a + getRowAmountValue(r), 0),
      total_cantidad: rows.reduce((a, r) => a + getRowQuantityValue(r), 0)
    };
  }

  const montoKey = tipo === "detallado" ? "subtotal" : "monto";
  const summary = buildSummaryFromRows(rows, { cantidadKey: "cantidad", montoKey });

  if (modulo === "ventas") {
    summary.total_comision = rows.reduce((acc, row) => acc + getRowCommissionValue(row), 0);
    if (tipo === "por_vendedor") {
      summary.total_movimientos = rows.reduce((acc, row) => acc + toNumber(row.movimientos), 0);
    }
  }

  return summary;
}

async function getComprasReport(query, req) {
  const tipo = normalizeText(query.tipo) || "detallado";
  if (!COMPRAS_TIPOS.has(tipo)) throw new Error("Tipo de reporte de compras invalido");

  const filters = {
    ...normalizeCommonFilters(query, req),
    proveedor_id: normalizeId(query.proveedor_id),
    producto_id: normalizeId(query.producto_id),
    moneda_id: normalizeId(query.moneda_id),
    proveedor: normalizeText(query.proveedor),
    producto: normalizeText(query.producto)
  };

  let rows = [];

  if (tipo === "detallado") rows = await repo.getComprasDetallado(filters);
  if (tipo === "por_producto") rows = await repo.getComprasPorProducto(filters);
  if (tipo === "por_proveedor") rows = await repo.getComprasPorProveedor(filters);
  if (tipo === "por_fecha") rows = await repo.getComprasPorFecha(filters);

  const summary = buildReportSummary("compras", tipo, rows);

  return {
    meta: buildMeta("compras", tipo, filters),
    summary,
    rows
  };
}

async function getVentasReport(query, req) {
  await ensureComisionSchema();
  const tipo = normalizeText(query.tipo) || "detallado";
  if (!VENTAS_TIPOS.has(tipo)) throw new Error("Tipo de reporte de ventas invalido");

  const filters = {
    ...normalizeCommonFilters(query, req),
    cliente_id: normalizeId(query.cliente_id),
    vendedor_id: normalizeId(query.vendedor_id),
    producto_id: normalizeId(query.producto_id),
    cliente: normalizeText(query.cliente),
    producto: normalizeText(query.producto),
    estado: normalizeText(query.estado) || "EFECTIVADO"
  };

  let rows = [];

  if (tipo === "detallado") rows = await repo.getVentasDetallado(filters);
  if (tipo === "por_producto") rows = await repo.getVentasPorProducto(filters);
  if (tipo === "por_cliente") rows = await repo.getVentasPorCliente(filters);
  if (tipo === "por_fecha") rows = await repo.getVentasPorFecha(filters);
  if (tipo === "por_vendedor") rows = await repo.getVentasPorVendedor(filters);

  const summary = buildReportSummary("ventas", tipo, rows);

  return {
    meta: buildMeta("ventas", tipo, filters),
    summary,
    rows
  };
}

function summarizeCajaMovimientos(rows) {
  return {
    rows: rows.length,
    total_ventas: rows.reduce((a, r) => a + toNumber(r.total_venta), 0),
    efectivo_gs: rows.reduce((a, r) => a + toNumber(r.pago_efectivo), 0),
    tarjeta: rows.reduce((a, r) => a + toNumber(r.pago_tarjeta), 0),
    transferencia: rows.reduce((a, r) => a + toNumber(r.pago_transferencia), 0),
    pix: rows.reduce((a, r) => a + toNumber(r.pago_pix), 0),
    vuelto_total: rows.reduce((a, r) => a + toNumber(r.vuelto), 0)
  };
}

async function getCajaReport(query, req) {
  const tipo = normalizeText(query.tipo) || "movimientos";
  if (!CAJA_TIPOS.has(tipo)) throw new Error("Tipo de reporte de caja invalido");

  const filters = {
    ...normalizeCommonFilters(query, req),
    caja_id: normalizeId(query.caja_id),
    venta_id: normalizeId(query.venta_id),
    vendedor_id: normalizeId(query.vendedor_id)
  };

  let rows = [];
  let summary = {};

  if (tipo === "movimientos") {
    rows = await repo.getCajaMovimientos(filters);
    summary = summarizeCajaMovimientos(rows);
  }

  if (tipo === "resumen_por_dia") {
    rows = await repo.getCajaResumenPorDia(filters);
    summary = {
      rows: rows.length,
      total_ventas: rows.reduce((a, r) => a + toNumber(r.total_venta), 0),
      total_movimientos: rows.reduce((a, r) => a + toNumber(r.movimientos), 0),
      vuelto_total: rows.reduce((a, r) => a + toNumber(r.vuelto_total), 0)
    };
  }

  if (tipo === "resumen_metodo_pago") {
    rows = await repo.getCajaResumenMetodoPago(filters);
    const map = rows.reduce((acc, row) => {
      acc[row.metodo] = toNumber(row.monto);
      return acc;
    }, {});

    summary = {
      rows: rows.length,
      total_pagado_gs: toNumber(map.TOTAL_PAGADO_GS),
      efectivo_gs: toNumber(map.EFECTIVO_GS),
      tarjeta: toNumber(map.TARJETA),
      transferencia: toNumber(map.TRANSFERENCIA),
      pix: toNumber(map.PIX)
    };
  }

  return {
    meta: buildMeta("caja", tipo, filters),
    summary,
    rows
  };
}

function extractJsonBlock(text) {
  if (!text) return null;
  const trimmed = String(text).trim();
  if (trimmed.startsWith("{")) return trimmed;

  const fenced = trimmed.match(/```json\s*([\s\S]*?)```/i);
  if (fenced && fenced[1]) return fenced[1].trim();

  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first >= 0 && last > first) return trimmed.slice(first, last + 1);

  return null;
}

function validateIaPlan(plan) {
  const modulo = normalizeText(plan.modulo)?.toLowerCase();
  const tipo = normalizeText(plan.tipo)?.toLowerCase();
  const intencionRaw = normalizeText(plan.intencion)?.toLowerCase() || null;
  const filtros = plan.filtros && typeof plan.filtros === "object" ? plan.filtros : {};

  if (!modulo || !getReportTypeConfig(modulo)) {
    throw new Error("Gemini no devolvio modulo valido");
  }

  if (!tipo) {
    throw new Error("Gemini no devolvio tipo valido");
  }

  if (!isValidTipoForModulo(modulo, tipo)) {
    throw new Error(`Tipo invalido para ${modulo}`);
  }

  return {
    modulo,
    tipo,
    intencion: intencionRaw && IA_INTENTIONS.has(intencionRaw) ? intencionRaw : null,
    filtros
  };
}

async function fetchGeminiModelCandidates(apiKey) {
  const preferred = [
    process.env.GEMINI_MODEL,
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
    "gemini-1.5-flash",
    "gemini-1.5-pro"
  ].filter(Boolean);

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    if (!res.ok) return preferred;

    const data = await res.json();
    const available = (data?.models || [])
      .filter((m) => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes("generateContent"))
      .map((m) => String(m.name || "").replace(/^models\//, ""))
      .filter(Boolean);

    const merged = [...preferred, ...available];
    return Array.from(new Set(merged));
  } catch {
    return preferred;
  }
}

async function askGeminiForPlan(prompt) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error("Falta configurar GEMINI_API_KEY en el backend");

  const today = toDateString(atStartOfDay(new Date()));
  const instruction = [
    "Sos un traductor de lenguaje natural a plan de reporte para un sistema POS.",
    "Devolve SOLO JSON valido, sin texto extra.",
    "Formato: {\"modulo\":\"compras|ventas|caja\",\"intencion\":\"total|listado|comparacion|ranking|tendencia|detalle\",\"tipo\":\"...\",\"filtros\":{...}}",
    `Fecha actual de referencia: ${today}`,
    "Reglas obligatorias de fechas:",
    "- hoy => fecha actual",
    "- ayer => fecha actual - 1 dia",
    "- esta semana => desde lunes hasta hoy",
    "- este mes => desde el dia 1 hasta hoy",
    "- si el usuario menciona un mes como abril, usa SIEMPRE el mes completo",
    "- si el usuario menciona varios meses como marzo y abril, usa el rango completo que cubre ambos meses",
    "- nunca conviertas un mes nombrado en ultimos 30 dias",
    "Regla critica de filtros:",
    "- NO agregues cliente, producto, vendedor o proveedor si el usuario no lo menciono explicitamente",
    "- Solo 'mis ventas' autoriza usar vendedor = usuario actual",
    "Tipos compras: detallado, por_producto, por_proveedor, por_fecha",
    "Tipos ventas: detallado, por_producto, por_cliente, por_fecha, por_vendedor",
    "Tipos caja: movimientos, resumen_por_dia, resumen_metodo_pago",
    "Filtros permitidos: desde, hasta, proveedor, producto, cliente, vendedor, estado, vendedor_id, proveedor_id, producto_id, cliente_id, caja_id, venta_id",
    "Nunca inventes ids ni campos fuera de la lista."
  ].join("\n");

  const bodyPayload = {
    contents: [
      {
        role: "user",
        parts: [{ text: `${instruction}\n\nConsulta usuario: ${prompt}` }]
      }
    ],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: "application/json"
    }
  };

  const modelCandidates = await fetchGeminiModelCandidates(apiKey);

  let lastError = "";
  let data = null;

  for (const model of modelCandidates) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bodyPayload)
    });

    if (response.ok) {
      data = await response.json();
      break;
    }

    const errText = await response.text();
    lastError = `Gemini error (${model}): ${response.status} ${errText}`;

    if (response.status === 404) continue;
    throw new Error(lastError);
  }

  if (!data) {
    throw new Error(lastError || "Gemini no respondio con un modelo compatible");
  }

  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  const jsonText = extractJsonBlock(text);
  if (!jsonText) throw new Error("Gemini no devolvio JSON interpretable");

  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error("Gemini devolvio JSON invalido");
  }

  return validateIaPlan(parsed);
}

function detectPromptLanguage(prompt = "") {
  const normalized = normalizeForMatch(prompt);
  const portugueseHints = [
    "hoje",
    "ontem",
    "esta semana",
    "essa semana",
    "nesta semana",
    "este mes",
    "esse mes",
    "neste mes",
    "vendas",
    "relatorio",
    "produto mais vendido",
    "lucro",
    "faturamento"
  ];

  return portugueseHints.some((word) => normalized.includes(word)) ? "pt" : "es";
}

function isSingleDayRange(range = null) {
  return Boolean(range?.desde && range?.hasta && range.desde === range.hasta);
}

function detectPromptIntent(prompt = "", interpretedRange = null) {
  const text = normalizeForMatch(prompt);
  if (!text) return null;

  if (/(\bvs\b|versus|comparar|comparacion|frente a|contra)/.test(text)) return "comparacion";
  if (/(que dia|cual dia|mejor dia|dia con mas ventas|dia vende mas|dia vendo mas|tendencia|comportamiento|evolucion|variacion)/.test(text)) return "tendencia";
  if (/(ranking|\btop\b|mas vendido|menos vendido|mas comprado|menos comprado|producto estrella|mejor producto|peor producto)/.test(text)) return "ranking";
  if (/\b(detalle|detallado|detallada)\b/.test(text) || isSingleDayRange(interpretedRange)) return "detalle";
  if (/(mostrar|mostrame|mostrarme|listar|listado|lista|ver|traeme|traer|dame)/.test(text)) return "listado";
  if (/(cuanto|cuanta|cuantos|cuantas|total|monto|importe|suma|facturacion|gasto|gastado|vendi|vendido|compre|comprado)/.test(text)) return "total";
  return null;
}

function resolvePromptIntent({ prompt = "", interpretedRange = null, planIntent = null } = {}) {
  const detected = detectPromptIntent(prompt, interpretedRange);
  if (detected) return detected;

  const normalizedPlanIntent = normalizeText(planIntent)?.toLowerCase() || null;
  if (normalizedPlanIntent && IA_INTENTIONS.has(normalizedPlanIntent)) {
    return normalizedPlanIntent;
  }

  return "total";
}

function normalizeContextSelection(value = "") {
  const raw = normalizeForMatch(value);
  if (raw === "ventas") return "ventas";
  if (raw === "compras") return "compras";
  return "todos";
}

function detectKeywordModulo(prompt = "") {
  const text = normalizeForMatch(prompt);
  if (/\bcompra\b|\bcompras\b/.test(text)) return "compras";
  if (/\bventa\b|\bventas\b/.test(text)) return "ventas";
  return null;
}

function resolveModuloByPriority({ contexto = "todos", keywordModulo = null, moduloPlan = "ventas", prompt = "" } = {}) {
  if (contexto === "ventas" || contexto === "compras") return contexto;

  const text = normalizeForMatch(prompt);
  if (/\bproveedor\b|\bproveedores\b/.test(text)) return "compras";
  if (/\bcliente\b|\bclientes\b|\bvendedor\b|\bvendedores\b/.test(text)) return "ventas";
  if (keywordModulo) return keywordModulo;
  return getReportTypeConfig(moduloPlan) ? moduloPlan : "ventas";
}

function normalizeTipoForModulo(modulo = "ventas", tipo = "") {
  const t = normalizeText(tipo) || "";
  return isValidTipoForModulo(modulo, t) ? t : getDefaultTipoForModulo(modulo);
}

function hasCurrentUserSalesFilter(prompt = "") {
  const text = normalizeForMatch(prompt);
  return /\bmis ventas\b|\bventas mias\b|\bventas mías\b/.test(text);
}

function detectExplicitFilterFlags(prompt = "") {
  const text = normalizeForMatch(prompt);
  return {
    producto: /\bproducto\b|\bproductos\b/.test(text),
    cliente: /\bcliente\b|\bclientes\b|\bcomprador\b|\bcompradores\b|\busuario\b|\busuarios\b/.test(text),
    vendedor: /\bvendedor\b|\bvendedores\b/.test(text) || hasCurrentUserSalesFilter(prompt),
    proveedor: /\bproveedor\b|\bproveedores\b/.test(text)
  };
}

function pruneStructuredFilters(filters = {}) {
  return Object.fromEntries(
    Object.entries(filters)
      .map(([key, value]) => {
        if (Array.isArray(value)) {
          const sanitized = value.map((item) => sanitizeEntityCandidate(item)).filter(Boolean);
          return [key, sanitized];
        }
        return [key, sanitizeEntityCandidate(value)];
      })
      .filter(([, value]) => {
        if (value == null) return false;
        if (Array.isArray(value)) return value.length > 0;
        if (typeof value === "string") return value.trim() !== "";
        return true;
      })
  );
}

function extractExplicitNamedFilter(prompt = "", labels = []) {
  if (!Array.isArray(labels) || !labels.length) return null;

  const rawPrompt = String(prompt || "");
  const labelPattern = labels.join("|");
  const re = new RegExp(`(?:del?|de la|de los|de las|por)?\\s*(?:${labelPattern})\\s+([^,;]+)`, "i");
  const match = rawPrompt.match(re);
  if (!match || !match[1]) return null;

  const cleaned = cleanEntityName(
    String(match[1])
      .replace(new RegExp(`\\s+(?:en|durante|desde|hasta|de|del|de la|de los|de las)\\s+(?:hoy|ayer|este|esta|mes|semana|${MONTH_WORD_PATTERN})\\b.*$`, "i"), "")
      .trim()
  );

  return sanitizeEntityCandidate(cleaned);
}

function detectRoleFromPromptByPriority(prompt = "", modulo = "ventas") {
  const text = normalizeForMatch(prompt);

  if (hasCurrentUserSalesFilter(prompt)) return "vendedor";
  if (/\bvendedor\b|\bvendedores\b/.test(text)) return "vendedor";
  if (/\bcliente\b|\bclientes\b|\bcomprador\b|\bcompradores\b|\busuario\b|\busuarios\b/.test(text)) return "cliente";
  if (/\bproveedor\b|\bproveedores\b/.test(text)) return "proveedor";
  return null;
}

function extractPromptAbsoluteDates(prompt = "") {
  const found = [];
  const unique = new Set();
  const matchers = [
    /\b\d{4}[-/]\d{2}[-/]\d{2}\b/g,
    /\b\d{2}[/-]\d{2}[/-]\d{4}\b/g
  ];

  for (const re of matchers) {
    const matches = String(prompt).match(re) || [];
    for (const token of matches) {
      const d = parseDateValue(token);
      if (!d) continue;
      const key = toDateString(d);
      if (unique.has(key)) continue;
      unique.add(key);
      found.push(d);
    }
  }

  found.sort((a, b) => a.getTime() - b.getTime());
  return found;
}

function extractNamedDayDates(prompt = "", now = new Date()) {
  const text = normalizeForMatch(prompt);
  const currentYear = atStartOfDay(now).getFullYear();
  const found = [];
  const seen = new Set();
  const patterns = [
    { regex: new RegExp(`\\b(\\d{1,2})\\s+de\\s+(${MONTH_WORD_PATTERN})(?:\\s+de\\s+(\\d{4}))?\\b`, "gi"), dayIndex: 1, monthIndex: 2, yearIndex: 3 },
    { regex: new RegExp(`\\b(${MONTH_WORD_PATTERN})\\s+(\\d{1,2})(?:\\s*(?:de|,)?\\s*(\\d{4}))?\\b`, "gi"), dayIndex: 2, monthIndex: 1, yearIndex: 3 }
  ];

  for (const item of patterns) {
    let match;
    while ((match = item.regex.exec(text)) !== null) {
      const day = Number(match[item.dayIndex]);
      const month = MONTH_ALIASES[match[item.monthIndex]];
      const year = match[item.yearIndex] ? Number(match[item.yearIndex]) : currentYear;
      const built = buildValidatedDate(year, month, day);
      if (!built) continue;
      const key = toDateString(built);
      if (seen.has(key)) continue;
      seen.add(key);
      found.push(built);
    }
  }

  found.sort((a, b) => a.getTime() - b.getTime());
  return found;
}

function extractNamedMonthMentions(prompt = "", now = new Date()) {
  const text = normalizeForMatch(prompt);
  const currentYear = atStartOfDay(now).getFullYear();
  const mentions = [];
  const seen = new Set();
  const regex = new RegExp(`\\b(${MONTH_WORD_PATTERN})\\b(?:\\s+de\\s+(\\d{4}))?`, "gi");

  let match;
  while ((match = regex.exec(text)) !== null) {
    const month = MONTH_ALIASES[match[1]];
    const year = match[2] ? Number(match[2]) : currentYear;
    if (!month || !year) continue;

    const key = `${year}-${String(month).padStart(2, "0")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    mentions.push({ year, month });
  }

  mentions.sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    return a.month - b.month;
  });
  return mentions;
}

function interpretRelativeRange(prompt = "", now = new Date()) {
  const text = normalizeForMatch(prompt);
  const today = atStartOfDay(now);

  if (/(todos|todo el tiempo|historico|historial|desde siempre|all time)/.test(text)) {
    return { desde: null, hasta: null, source: "relative_all_time", clearRange: true };
  }

  if (/(mes pasado|ultimo mes calendario|mes anterior|mes passado)/.test(text)) {
    const firstThisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastPrevMonth = addDays(firstThisMonth, -1);
    const firstPrevMonth = new Date(lastPrevMonth.getFullYear(), lastPrevMonth.getMonth(), 1);
    return { desde: firstPrevMonth, hasta: lastPrevMonth, source: "relative_mes_pasado" };
  }

  if (/(ayer y hoy|hoy y ayer|ontem e hoje|hoje e ontem)/.test(text)) {
    return { desde: addDays(today, -1), hasta: today, source: "relative_ayer_hoy" };
  }

  if (/\b(ayer|ontem)\b/.test(text)) {
    const yesterday = addDays(today, -1);
    return { desde: yesterday, hasta: yesterday, source: "relative_ayer" };
  }

  if (/\b(hoy|hoje)\b/.test(text)) {
    return { desde: today, hasta: today, source: "relative_hoy" };
  }

  if (/(esta semana|essa semana|nesta semana|semana actual|semana atual)/.test(text)) {
    const day = (today.getDay() + 6) % 7;
    return { desde: addDays(today, -day), hasta: today, source: "relative_semana" };
  }

  if (/(este mes|esse mes|neste mes|mes actual|mes atual)/.test(text)) {
    return { desde: new Date(today.getFullYear(), today.getMonth(), 1), hasta: today, source: "relative_mes" };
  }

  return null;
}

function resolvePromptDateRange(prompt = "", now = new Date()) {
  const today = atStartOfDay(now);
  const absoluteDates = extractPromptAbsoluteDates(prompt);
  if (absoluteDates.length) {
    return {
      desde: toDateString(absoluteDates[0]),
      hasta: toDateString(absoluteDates[absoluteDates.length - 1]),
      source: "absolute_prompt"
    };
  }

  const namedDayDates = extractNamedDayDates(prompt, now);
  if (namedDayDates.length) {
    return {
      desde: toDateString(namedDayDates[0]),
      hasta: toDateString(namedDayDates[namedDayDates.length - 1]),
      source: "named_day_prompt"
    };
  }

  const namedMonths = extractNamedMonthMentions(prompt, now);
  if (namedMonths.length) {
    const firstRange = getMonthRange(namedMonths[0].year, namedMonths[0].month);
    const lastRange = getMonthRange(namedMonths[namedMonths.length - 1].year, namedMonths[namedMonths.length - 1].month);
    return {
      desde: toDateString(firstRange.desde),
      hasta: toDateString(lastRange.hasta),
      source: namedMonths.length > 1 ? "named_months_prompt" : "named_month_prompt"
    };
  }

  const relative = interpretRelativeRange(prompt, now);
  if (relative) {
    if (relative.clearRange) {
      return {
        desde: null,
        hasta: null,
        source: relative.source,
        clearRange: true
      };
    }

    return {
      desde: toDateString(relative.desde),
      hasta: toDateString(relative.hasta),
      source: relative.source
    };
  }

  return {
    desde: toDateString(new Date(today.getFullYear(), today.getMonth(), 1)),
    hasta: toDateString(today),
    source: "default_current_month"
  };
}

function normalizeStructuredFilters(filters = {}) {
  return {
    producto: normalizeText(filters?.producto),
    cliente: normalizeText(filters?.cliente),
    vendedor: normalizeText(filters?.vendedor),
    proveedor: normalizeText(filters?.proveedor)
  };
}

function buildStructuredFilters({
  prompt = "",
  modulo = "ventas",
  roleDetected = null,
  entityNames = [],
  geminiFilters = {},
  currentUserName = null
} = {}) {
  const explicit = detectExplicitFilterFlags(prompt);
  const normalizedGeminiRaw = normalizeStructuredFilters(geminiFilters);
  const normalizedGemini = {
    producto: sanitizeEntityCandidate(normalizedGeminiRaw.producto),
    cliente: sanitizeEntityCandidate(normalizedGeminiRaw.cliente),
    vendedor: sanitizeEntityCandidate(normalizedGeminiRaw.vendedor),
    proveedor: sanitizeEntityCandidate(normalizedGeminiRaw.proveedor)
  };
  const firstEntity = Array.isArray(entityNames) && entityNames.length === 1
    ? sanitizeEntityCandidate(entityNames[0])
    : null;

  const filters = {};

  if (explicit.producto) {
    filters.producto = normalizedGemini.producto || extractExplicitNamedFilter(prompt, ["producto", "productos"]);
  }

  if (modulo === "ventas") {
    if (hasCurrentUserSalesFilter(prompt)) {
      filters.vendedor = sanitizeMemoryString(currentUserName || "usuario actual");
    } else if (explicit.vendedor) {
      filters.vendedor = normalizedGemini.vendedor || firstEntity || extractExplicitNamedFilter(prompt, ["vendedor", "vendedores"]);
    }

    if (explicit.cliente) {
      filters.cliente = normalizedGemini.cliente || firstEntity || extractExplicitNamedFilter(prompt, ["cliente", "clientes", "comprador", "compradores", "usuario", "usuarios"]);
    }
  }

  if (modulo === "compras" && explicit.proveedor) {
    filters.proveedor = normalizedGemini.proveedor || firstEntity || extractExplicitNamedFilter(prompt, ["proveedor", "proveedores"]);
  }

  return pruneStructuredFilters(filters);
}

function resolveStructuredTipo(intencion = "total") {
  return intencion === "listado" || intencion === "detalle" ? "detallado" : "resumen";
}

function buildStructuredInterpretation({
  prompt = "",
  modulo = "ventas",
  intencion = "total",
  interpretedRange = null,
  roleDetected = null,
  entityNames = [],
  geminiFilters = {},
  currentUserName = null
} = {}) {
  return {
    modulo,
    intencion,
    tipo: resolveStructuredTipo(intencion),
    fecha_desde: interpretedRange?.clearRange ? null : interpretedRange?.desde || null,
    fecha_hasta: interpretedRange?.clearRange ? null : interpretedRange?.hasta || null,
    filtros: buildStructuredFilters({
      prompt,
      modulo,
      roleDetected,
      entityNames,
      geminiFilters,
      currentUserName
    })
  };
}

function resolveReportTypeFromInterpretation({
  modulo = "ventas",
  intencion = "total",
  structuredFilters = {},
  planTipo = "",
  entityNames = [],
  roleDetected = null
} = {}) {
  if (modulo === "caja") {
    if (intencion === "tendencia" || intencion === "comparacion") return "resumen_por_dia";
    return normalizeTipoForModulo(modulo, planTipo);
  }

  if (structuredFilters.vendedor || structuredFilters.cliente || structuredFilters.proveedor) {
    return "detallado";
  }

  if (entityNames.length && (roleDetected === "cliente" || roleDetected === "vendedor" || roleDetected === "proveedor")) {
    return "detallado";
  }

  if (intencion === "listado" || intencion === "detalle") return "detallado";
  if (intencion === "tendencia" || intencion === "comparacion") return "por_fecha";

  if (intencion === "ranking") {
    if (modulo === "compras" && structuredFilters.proveedor) return "por_proveedor";
    if (modulo === "ventas" && roleDetected === "vendedor") return "por_vendedor";
    if (modulo === "ventas" && structuredFilters.cliente) return "por_cliente";
    return "por_producto";
  }

  if (intencion === "total" && modulo === "ventas" && roleDetected === "vendedor") return "por_vendedor";
  if (intencion === "total") return "por_fecha";
  return normalizeTipoForModulo(modulo, planTipo);
}

function mergeIaFilters(geminiFilters = {}, interpretedRange = null, structuredFilters = null) {
  const merged = {};

  if (interpretedRange?.clearRange) {
    merged.desde = null;
    merged.hasta = null;
  } else if (interpretedRange?.desde && interpretedRange?.hasta) {
    merged.desde = interpretedRange.desde;
    merged.hasta = interpretedRange.hasta;
  }

  const normalizedStructured = normalizeStructuredFilters(structuredFilters || {});
  if (normalizedStructured.producto) merged.producto = normalizedStructured.producto;
  if (normalizedStructured.cliente) merged.cliente = normalizedStructured.cliente;
  if (normalizedStructured.vendedor) merged.vendedor = normalizedStructured.vendedor;
  if (normalizedStructured.proveedor) merged.proveedor = normalizedStructured.proveedor;

  return pruneStructuredFilters(merged);
}

function getRowDateValue(row = {}) {
  return row.fecha || row.dia || row.date || null;
}

function getRowAmountValue(row = {}) {
  return toNumber(
    row.monto
      ?? row.subtotal
      ?? row.total_venta
      ?? row.total_ventas
      ?? row.total_pagado_gs
      ?? row.total
      ?? 0
  );
}

function getRowQuantityValue(row = {}) {
  return toNumber(row.cantidad ?? row.movimientos ?? 0);
}

function getRowCommissionValue(row = {}) {
  return toNumber(row.comision_total ?? row.comision ?? 0);
}

function getRowProductValue(row = {}) {
  return normalizeText(row.producto ?? row.producto_nombre ?? row.descripcion);
}

function formatGs(amount, language = "es") {
  const locale = language === "pt" ? "pt-BR" : "es-PY";
  const formatted = new Intl.NumberFormat(locale).format(Math.round(toNumber(amount)));
  return `${formatted} Gs`;
}

function aggregateRowsForInsights(rows = []) {
  const byDate = new Map();
  const byProductQty = new Map();
  const byProductAmount = new Map();

  for (const row of rows) {
    const dateRaw = getRowDateValue(row);
    const dateParsed = parseDateValue(dateRaw);
    const dateKey = dateParsed ? toDateString(dateParsed) : null;
    const amount = getRowAmountValue(row);
    const quantity = getRowQuantityValue(row);
    const product = getRowProductValue(row);

    if (dateKey) byDate.set(dateKey, (byDate.get(dateKey) || 0) + amount);
    if (product) {
      byProductQty.set(product, (byProductQty.get(product) || 0) + quantity);
      byProductAmount.set(product, (byProductAmount.get(product) || 0) + amount);
    }
  }

  const topByDate = Array.from(byDate.entries()).sort((a, b) => b[1] - a[1])[0] || null;
  const topProductQty = Array.from(byProductQty.entries()).sort((a, b) => b[1] - a[1])[0] || null;
  const topProductAmount = Array.from(byProductAmount.entries()).sort((a, b) => b[1] - a[1])[0] || null;

  const trendDates = Array.from(byDate.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  let trend = "stable";
  if (trendDates.length >= 4) {
    const middle = Math.floor(trendDates.length / 2);
    const firstAvg = trendDates.slice(0, middle).reduce((acc, [, v]) => acc + v, 0) / middle;
    const secondCount = trendDates.length - middle;
    const secondAvg = secondCount
      ? trendDates.slice(middle).reduce((acc, [, v]) => acc + v, 0) / secondCount
      : firstAvg;

    if (secondAvg > firstAvg * 1.05) trend = "up";
    if (secondAvg < firstAvg * 0.95) trend = "down";
  }

  return {
    topByDate,
    topProductQty,
    topProductAmount,
    trend
  };
}

function buildSummaryText({ language, modulo, summary, rows }) {
  const isPt = language === "pt";
  const totalMonto = toNumber(summary?.total_monto ?? summary?.total_ventas ?? summary?.total_pagado_gs ?? 0);
  const totalCantidad = toNumber(summary?.total_cantidad ?? summary?.total_movimientos ?? rows.length);
  const qtyLabelEs = modulo === "caja" ? "movimientos" : "registros";
  const qtyLabelPt = modulo === "caja" ? "movimentos" : "registros";

  if (!Array.isArray(rows) || !rows.length) {
    return isPt
      ? "Nao foram encontrados dados para o periodo solicitado."
      : "No se encontraron datos para el periodo solicitado.";
  }

  if (isPt) {
    return `Foram registrados ${new Intl.NumberFormat("pt-BR").format(totalCantidad)} ${qtyLabelPt}, totalizando ${formatGs(totalMonto, "pt")}.`;
  }

  return `Se registraron ${new Intl.NumberFormat("es-PY").format(totalCantidad)} ${qtyLabelEs}, por un total de ${formatGs(totalMonto, "es")}.`;
}

function buildInsights({ language, modulo, rows }) {
  const isPt = language === "pt";
  const insights = aggregateRowsForInsights(rows);
  const out = {
    dia_con_mas_ventas: null,
    producto_mas_vendido: null,
    producto_mayor_ganancia: null,
    tendencia: null
  };

  if (insights.topByDate?.[0]) {
    const dateLabel = insights.topByDate[0];
    const amount = formatGs(insights.topByDate[1], language);
    out.dia_con_mas_ventas = isPt
      ? `${dateLabel} foi o melhor dia com ${amount}.`
      : `${dateLabel} fue el mejor dia con ${amount}.`;
  } else {
    out.dia_con_mas_ventas = isPt
      ? "Nao ha dados suficientes para identificar o melhor dia."
      : "No hay datos suficientes para identificar el mejor dia.";
  }

  if (insights.topProductQty?.[0]) {
    const product = insights.topProductQty[0];
    const qty = new Intl.NumberFormat(isPt ? "pt-BR" : "es-PY").format(toNumber(insights.topProductQty[1]));
    out.producto_mas_vendido = isPt
      ? `${product} foi o produto mais vendido (${qty}).`
      : `${product} fue el producto mas vendido (${qty}).`;
  } else {
    out.producto_mas_vendido = isPt
      ? "Nao foi possivel identificar o produto mais vendido."
      : "No fue posible identificar el producto mas vendido.";
  }

  if (insights.topProductAmount?.[0]) {
    const product = insights.topProductAmount[0];
    const amount = formatGs(insights.topProductAmount[1], language);
    out.producto_mayor_ganancia = isPt
      ? `${product} liderou em ganho estimado com ${amount}.`
      : `${product} lidero en ganancia estimada con ${amount}.`;
  } else {
    out.producto_mayor_ganancia = isPt
      ? "Nao foi possivel estimar o produto com maior ganho."
      : "No fue posible estimar el producto con mayor ganancia.";
  }

  if (insights.trend === "up") {
    out.tendencia = isPt
      ? "A tendencia geral e de crescimento."
      : "La tendencia general es de crecimiento.";
  } else if (insights.trend === "down") {
    out.tendencia = isPt
      ? "A tendencia geral e de queda."
      : "La tendencia general es de caida.";
  } else {
    out.tendencia = isPt
      ? "A tendencia geral esta estavel."
      : "La tendencia general se mantiene estable.";
  }

  if (modulo === "compras" && !isPt) {
    out.tendencia = `${out.tendencia} Basado en compras registradas.`;
  }

  if (modulo === "compras" && isPt) {
    out.tendencia = `${out.tendencia} Baseado nas compras registradas.`;
  }

  return out;
}
function getWeekdayNameEs(dateValue) {
  const d = parseDateValue(dateValue);
  if (!d) return null;
  const names = ["Domingo", "Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado"];
  return names[d.getDay()] || null;
}

function buildWeekdaySummary(rows = []) {
  const order = ["Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado", "Domingo"];
  const map = new Map(order.map((d) => [d, { dia: d, total_monto: 0, transacciones: 0 }]));

  rows.forEach((row) => {
    const dia = getWeekdayNameEs(getRowDateValue(row));
    if (!dia) return;
    const acc = map.get(dia) || { dia, total_monto: 0, transacciones: 0 };
    acc.total_monto += getRowAmountValue(row);
    acc.transacciones += 1;
    map.set(dia, acc);
  });

  return order.map((d) => map.get(d));
}

function cleanEntityName(value = "") {
  let out = String(value || "")
    .replace(/^\?+/, "")
    .replace(/\?+$/g, "")
    .replace(/^(el|la|los|las)\s+/i, "")
    .replace(/^(vendedor|cliente|proveedor)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();

  // Elimina prefijos de contexto temporal ("mes de", "de", "en", etc.)
  const leadingNoise = /^(este|esta|estos|estas|hoy|ayer|lunes|martes|miercoles|jueves|viernes|sabado|domingo|mes|semana|ano|de la|del|de|en|durante)\s+/i;
  while (leadingNoise.test(out)) {
    out = out.replace(leadingNoise, "").trim();
  }

  // Elimina cola temporal sin cortar nombres compuestos por "de".
  out = out
    .replace(/\s+(este|esta|estos|estas|hoy|ayer|lunes|martes|miercoles|jueves|viernes|sabado|domingo|mes|semana|ano|durante)\b.*$/i, "")
    .replace(/\s+(de la|del|de|en)\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();

  return out;
}

function isTemporalEntityName(value = "") {
  const normalized = normalizeForMatch(value)
    .replace(/[.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) return false;
  if (/^\d{4}[-/]\d{2}[-/]\d{2}$/.test(normalized)) return true;
  if (/^\d{2}[/-]\d{2}[/-]\d{4}$/.test(normalized)) return true;
  if (/^\d{1,2}$/.test(normalized)) return true;

  const tokens = normalized.split(/\s+/).filter(Boolean);
  return tokens.length > 0 && tokens.every((token) => TEMPORAL_ENTITY_TOKENS.has(token) || /^\d+$/.test(token));
}

function isGenericBusinessEntityName(value = "") {
  const normalized = normalizeForMatch(value)
    .replace(/[.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) return false;

  const tokens = normalized.split(/\s+/).filter(Boolean);
  return tokens.length > 0 && tokens.every((token) => {
    return GENERIC_ENTITY_TOKENS.has(token) || TEMPORAL_ENTITY_TOKENS.has(token) || /^\d+$/.test(token);
  });
}

function sanitizeEntityCandidate(value, { allowGeneric = false } = {}) {
  const normalized = normalizeText(value);
  if (!normalized) return null;
  if (isTemporalEntityName(normalized)) return null;
  if (!allowGeneric && isGenericBusinessEntityName(normalized)) return null;
  return normalized;
}

function splitMultiNames(raw = "") {
  const normalized = String(raw || "")
    .replace(/\s+(y|e)\s+/gi, ",")
    .replace(/\s+/g, " ")
    .trim();

  const seen = new Set();
  const out = [];
  for (const part of normalized.split(/[;,]/)) {
    const name = cleanEntityName(part);
    if (name.length < 2) continue;
    if (!sanitizeEntityCandidate(name)) continue;
    const key = normalizeForMatch(name);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

function extractEntityNamesFromPrompt(prompt = "") {
  const raw = String(prompt || "").trim();
  const patterns = [
    /(?:vendedor|vendedores|cliente|clientes|proveedor|proveedores|comprador|compradores|usuario|usuarios)\s+([a-z0-9Ã¡Ã©Ã­Ã³ÃºÃ±.'\- ,y e]{2,120})/i
  ];

  for (const re of patterns) {
    const m = raw.match(re);
    if (!m || !m[1]) continue;
    const names = splitMultiNames(m[1]);
    if (names.length) return names;
  }

  return [];
}

function applyStrictRoleFilter(rows = [], names = [], role = null) {
  if (!Array.isArray(rows) || !Array.isArray(names) || !names.length || !role) return rows;
  const needles = names.map((n) => normalizeForMatch(n)).filter(Boolean);
  if (!needles.length) return rows;

  const fields = role === "vendedor"
    ? ["vendedor", "vendedor_nombre"]
    : role === "cliente"
      ? ["cliente", "cliente_nombre"]
      : ["proveedor", "proveedor_nombre"];

  return rows.filter((row) => {
    const value = fields
      .map((f) => normalizeForMatch(row?.[f] || ""))
      .find((v) => v);
    if (!value) return false;
    return needles.some((needle) => value.includes(needle));
  });
}

function extractWeekdayFromPrompt(prompt = "") {
  const text = normalizeForMatch(prompt);
  const map = [
    { weekday: "Lunes", words: ["lunes"] },
    { weekday: "Martes", words: ["martes"] },
    { weekday: "Miercoles", words: ["miercoles", "miÃ©rcoles"] },
    { weekday: "Jueves", words: ["jueves"] },
    { weekday: "Viernes", words: ["viernes"] },
    { weekday: "Sabado", words: ["sabado", "sÃ¡bado"] },
    { weekday: "Domingo", words: ["domingo"] }
  ];

  for (const item of map) {
    if (item.words.some((w) => text.includes(w))) return item.weekday;
  }

  return null;
}

function applyWeekdayFilter(rows = [], weekday = null) {
  if (!weekday || !Array.isArray(rows)) return rows;
  return rows.filter((r) => getWeekdayNameEs(getRowDateValue(r)) === weekday);
}

function applyDateRangeFilter(rows = [], desde = null, hasta = null) {
  if (!Array.isArray(rows)) return [];
  if (!desde && !hasta) return rows;

  const desdeDate = desde ? parseDateValue(desde) : null;
  const hastaDate = hasta ? parseDateValue(hasta) : null;
  if (!desdeDate && !hastaDate) return rows;

  return rows.filter((r) => {
    const rowDate = parseDateValue(getRowDateValue(r));
    if (!rowDate) return false;
    if (desdeDate && rowDate < desdeDate) return false;
    if (hastaDate && rowDate > hastaDate) return false;
    return true;
  });
}

function applyPromptFilters(rows = [], { names = [], role = null, desde = null, hasta = null, weekday = null } = {}) {
  let out = Array.isArray(rows) ? rows : [];
  // Orden requerido: entidad(es) -> fecha -> dia de semana.
  if (names.length && role) out = applyStrictRoleFilter(out, names, role);
  if (desde || hasta) out = applyDateRangeFilter(out, desde, hasta);
  if (weekday) out = applyWeekdayFilter(out, weekday);
  return out;
}

function rebuildSummaryForReport(modulo, tipo, rows = []) {
  return buildReportSummary(modulo, tipo, rows);
}

function buildBusinessAnalysis(rows = [], language = "es") {
  const isPt = language === "pt";
  const week = buildWeekdaySummary(rows);

  const topDay = [...week].sort((a, b) => b.total_monto - a.total_monto)[0] || null;

  const byClient = new Map();
  const byProduct = new Map();
  rows.forEach((row) => {
    const cliente = normalizeText(row.cliente || row.cliente_nombre || row.vendedor || "") || null;
    const producto = normalizeText(row.producto || row.producto_nombre || row.descripcion || "") || null;
    const monto = getRowAmountValue(row);
    const cantidad = Math.max(1, getRowQuantityValue(row));

    if (cliente) {
      const prev = byClient.get(cliente) || { cliente, monto: 0, transacciones: 0 };
      prev.monto += monto;
      prev.transacciones += 1;
      byClient.set(cliente, prev);
    }

    if (producto) {
      const prev = byProduct.get(producto) || { producto, monto: 0, cantidad: 0 };
      prev.monto += monto;
      prev.cantidad += cantidad;
      byProduct.set(producto, prev);
    }
  });

  const bestClient = Array.from(byClient.values()).sort((a, b) => b.monto - a.monto)[0] || null;
  const products = Array.from(byProduct.values()).sort((a, b) => b.cantidad - a.cantidad);
  const topProduct = products[0] || null;
  const lowProduct = products.length ? products[products.length - 1] : null;

  const recomendaciones = [];
  if (lowProduct) {
    recomendaciones.push(
      isPt
        ? `${lowProduct.producto} tem baixa rotacao. Avalie promocao ou ajuste de mix.`
        : `${lowProduct.producto} tiene baja rotacion. Evalua promocion o ajuste de mix.`
    );
  }
  if (topProduct) {
    recomendaciones.push(
      isPt
        ? `${topProduct.producto} e o mais vendido. Considere aumentar estoque.`
        : `${topProduct.producto} es el mas vendido. Considera aumentar stock.`
    );
  }
  if (bestClient) {
    recomendaciones.push(
      isPt
        ? `${bestClient.cliente} e cliente frequente. Recomendavel estrategia de fidelizacao.`
        : `${bestClient.cliente} es cliente frecuente. Recomendable estrategia de fidelizacion.`
    );
  }

  return {
    dia_semana: week,
    mejor_dia: topDay,
    mejor_cliente: bestClient,
    producto_mas_vendido: topProduct,
    producto_menos_vendido: lowProduct,
    recomendaciones
  };
}

function buildQuickAnswer({ prompt = "", modulo = "ventas", summary = {}, rows = [], language = "es", intent = "total", analysis = {} }) {
  const isPt = language === "pt";
  if (!Array.isArray(rows) || !rows.length) {
    return isPt
      ? "Nao foram encontrados dados com os filtros interpretados. Revise periodo e entidade consultada."
      : "No se encontraron datos con los filtros interpretados. Revise fechas, modulo y entidad consultada.";
  }

  const totalMonto = toNumber(summary?.total_monto ?? summary?.total_ventas ?? summary?.total_pagado_gs ?? 0);
  const totalCantidad = toNumber(summary?.total_cantidad ?? summary?.total_movimientos ?? rows.length);
  const text = normalizeForMatch(prompt);

  if (intent === "tendencia" || /(que dia se vende mas|cual es el mejor dia de ventas|mejor dia de ventas|dia con mas ventas)/.test(text)) {
    const topDay = analysis?.mejor_dia;
    if (topDay && topDay.dia) {
      return isPt
        ? `O dia com maior volume de vendas e ${topDay.dia}, com total de ${formatGs(topDay.total_monto, "pt")}.`
        : `El dia con mayor volumen de ventas es ${topDay.dia} con un total de ${formatGs(topDay.total_monto, "es")}.`;
    }
  }

  const madeByPerson = text.match(/(?:hizo|de|del?|por|vendedor|cliente)\s+([a-z0-9ÃƒÂ¡ÃƒÂ©ÃƒÂ­ÃƒÂ³ÃƒÂºÃƒÂ±.\- ]{2,40})/i);
  if (madeByPerson && modulo === "ventas") {
    const rawName = String(madeByPerson[1] || "").trim();
    const name = rawName.replace(/\s+(en|del|de|durante)\s+.*$/i, "").trim();
    if (name.length >= 2) {
      const nameNorm = normalizeForMatch(name);
      const filtered = rows.filter((r) => {
        const candidate = normalizeForMatch(r?.cliente ?? r?.vendedor ?? r?.proveedor ?? "");
        return candidate.includes(nameNorm);
      });
      if (filtered.length) {
        const cantidad = filtered.reduce((acc, r) => acc + toNumber(r.cantidad ?? 1), 0);
        const monto = filtered.reduce((acc, r) => acc + getRowAmountValue(r), 0);
        return isPt
          ? `As vendas de ${name} somam ${new Intl.NumberFormat("pt-BR").format(cantidad)} registros por um total de ${formatGs(monto, "pt")}.`
          : `La cantidad de ventas de ${name} es ${new Intl.NumberFormat("es-PY").format(cantidad)} por un total de ${formatGs(monto, "es")}.`;
      }
    }
  }

  if (intent === "ranking") {
    const top = analysis?.producto_mas_vendido;
    if (top) {
      return isPt
        ? `O produto mais vendido foi ${top.producto}, com ${new Intl.NumberFormat("pt-BR").format(top.cantidad)} unidades e ${formatGs(top.monto, "pt")}.`
        : `El producto mas vendido fue ${top.producto}, con ${new Intl.NumberFormat("es-PY").format(top.cantidad)} unidades y ${formatGs(top.monto, "es")}.`;
    }
  }

  if (isPt) {
    return `Foram encontrados ${new Intl.NumberFormat("pt-BR").format(totalCantidad)} registros, com total de ${formatGs(totalMonto, "pt")}.`;
  }
  return `Se encontraron ${new Intl.NumberFormat("es-PY").format(totalCantidad)} registros, por un total de ${formatGs(totalMonto, "es")}.`;
}

async function getIaReport(payload, req) {
  const promptOriginal = normalizeText(payload?.prompt || payload?.texto || payload?.query);
  if (!promptOriginal) throw new Error("prompt requerido");

  const contextoSelector = normalizeContextSelection(payload?.contexto || payload?.contexto_selector || payload?.context);
  const userId = resolveIaUserId(req);

  let memoryBefore = null;
  if (userId) {
    try {
      await ensureIaMemorySchema();
      memoryBefore = await getIaUserMemory(userId);
    } catch (err) {
      console.error("IA memory load error:", err.message);
    }
  }

  const hydratedPromptInfo = hydratePromptWithMemory({
    prompt: promptOriginal,
    contextoSelector,
    memory: memoryBefore
  });

  const promptFinal = normalizeText(hydratedPromptInfo?.prompt) || promptOriginal;
  const idioma = detectPromptLanguage(promptFinal);
  const interpretedRange = resolvePromptDateRange(promptFinal, new Date());
  const plan = await askGeminiForPlan(promptFinal);
  const keywordModulo = detectKeywordModulo(promptFinal);
  const moduloInicial = resolveModuloByPriority({
    contexto: contextoSelector,
    keywordModulo,
    moduloPlan: plan.modulo,
    prompt: promptFinal
  });
  const intencion = resolvePromptIntent({
    prompt: promptFinal,
    interpretedRange,
    planIntent: plan.intencion
  });
  const entityNames = extractEntityNamesFromPrompt(promptFinal);
  const weekdayDetected = extractWeekdayFromPrompt(promptFinal);
  const hasProveedorKeyword = /\bproveedor\b|\bproveedores\b/.test(normalizeForMatch(promptFinal));
  const currentUserName = sanitizeMemoryString(req?.usuario?.nombre);

  const executeModulo = async (moduloTarget) => {
    const roleDetected = detectRoleFromPromptByPriority(promptFinal, moduloTarget);
    const consultaEstructurada = buildStructuredInterpretation({
      prompt: promptFinal,
      modulo: moduloTarget,
      intencion,
      interpretedRange,
      roleDetected,
      entityNames,
      geminiFilters: plan.filtros,
      currentUserName
    });
    let tipoAplicado = resolveReportTypeFromInterpretation({
      modulo: moduloTarget,
      intencion,
      structuredFilters: consultaEstructurada.filtros,
      planTipo: plan.tipo,
      entityNames,
      roleDetected
    });
    const filtrosAplicados = mergeIaFilters(plan.filtros, interpretedRange, consultaEstructurada.filtros);
    const query = { ...filtrosAplicados, tipo: tipoAplicado };

    if (moduloTarget === "compras" && consultaEstructurada.filtros.proveedor) {
      query.proveedor = consultaEstructurada.filtros.proveedor;
      delete query.proveedor_id;
    }

    if (moduloTarget === "ventas") {
      if (consultaEstructurada.filtros.cliente) {
        query.cliente = consultaEstructurada.filtros.cliente;
        delete query.cliente_id;
      }

      if (roleDetected === "vendedor") {
        delete query.cliente;
        delete query.cliente_id;
      }
    }

    let report;
    if (moduloTarget === "compras") report = await getComprasReport(query, req);
    if (moduloTarget === "ventas") report = await getVentasReport(query, req);
    if (moduloTarget === "caja") report = await getCajaReport(query, req);
    if (!report) throw new Error("Modulo de reporte no soportado");

    let roleForFilter = null;
    if (moduloTarget === "ventas" || moduloTarget === "compras") {
      roleForFilter = moduloTarget === "compras" ? "proveedor" : roleDetected;
      const explicitRoleValue = moduloTarget === "compras"
        ? consultaEstructurada.filtros.proveedor
        : roleDetected === "cliente"
          ? consultaEstructurada.filtros.cliente
          : roleDetected === "vendedor"
            ? consultaEstructurada.filtros.vendedor
            : null;
      const namesForRoleFilter = explicitRoleValue
        ? [explicitRoleValue]
        : entityNames;

      report.rows = applyPromptFilters(report.rows || [], {
        names: namesForRoleFilter,
        role: roleForFilter,
        desde: filtrosAplicados.desde,
        hasta: filtrosAplicados.hasta,
        weekday: weekdayDetected
      });

      report.summary = rebuildSummaryForReport(moduloTarget, tipoAplicado, report.rows || []);

      if (roleForFilter && explicitRoleValue) {
        filtrosAplicados[roleForFilter] = explicitRoleValue;
      }
      if (weekdayDetected) filtrosAplicados.dia_semana = weekdayDetected;
    }

    return {
      modulo: moduloTarget,
      tipo_aplicado: tipoAplicado,
      role_detected: roleDetected,
      role_for_filter: roleForFilter,
      filtros_aplicados: filtrosAplicados,
      consulta_estructurada: consultaEstructurada,
      report
    };
  };

  const initialExecution = await executeModulo(moduloInicial);
  let finalExecution = initialExecution;

  const fallbackInfo = {
    habilitado: contextoSelector === "todos",
    intentado: false,
    aplicado: false,
    motivo_salto: null,
    modulo_inicial: moduloInicial,
    modulo_fallback: null
  };

  if (contextoSelector === "todos" && (moduloInicial === "ventas" || moduloInicial === "compras")) {
    const initialRows = initialExecution.report?.rows?.length || 0;
    if (initialRows === 0) {
      const otherModulo = moduloInicial === "compras" ? "ventas" : "compras";
      fallbackInfo.modulo_fallback = otherModulo;

      // Si el usuario pidio "proveedor", mantenemos modulo compras y no forzamos fallback.
      if (moduloInicial === "compras" && hasProveedorKeyword) {
        fallbackInfo.motivo_salto = "proveedor_explicito";
      } else {
        fallbackInfo.intentado = true;
        const alternateExecution = await executeModulo(otherModulo);
        const alternateRows = alternateExecution.report?.rows?.length || 0;
        if (alternateRows > 0) {
          finalExecution = alternateExecution;
          fallbackInfo.aplicado = true;
        } else {
          fallbackInfo.motivo_salto = "sin_datos_en_ambos_modulos";
        }
      }
    } else {
      fallbackInfo.motivo_salto = "modulo_inicial_con_datos";
    }
  } else {
    fallbackInfo.motivo_salto = "selector_explicito";
  }

  const moduloAplicado = finalExecution.modulo;
  const tipoAplicado = finalExecution.tipo_aplicado;
  const roleDetected = finalExecution.role_detected;
  const filtrosAplicados = finalExecution.filtros_aplicados;
  const consultaEstructurada = finalExecution.consulta_estructurada;
  const report = finalExecution.report;
  const validacion = {
    rango_logico: !(consultaEstructurada?.fecha_desde && consultaEstructurada?.fecha_hasta && consultaEstructurada.fecha_desde > consultaEstructurada.fecha_hasta),
    resultado_cero: (report?.rows?.length || 0) === 0,
    posible_error_filtros: (report?.rows?.length || 0) === 0 && Boolean(
      consultaEstructurada?.fecha_desde
      || consultaEstructurada?.fecha_hasta
      || consultaEstructurada?.filtros?.producto
      || consultaEstructurada?.filtros?.cliente
      || consultaEstructurada?.filtros?.vendedor
      || consultaEstructurada?.filtros?.proveedor
    )
  };

  const analysis = buildBusinessAnalysis(report?.rows || [], idioma);

  const resumen_texto = buildSummaryText({
    language: idioma,
    modulo: moduloAplicado,
    summary: report?.summary || {},
    rows: report?.rows || []
  });

  const insights = buildInsights({
    language: idioma,
    modulo: moduloAplicado,
    rows: report?.rows || []
  });

  const respuesta_rapida = buildQuickAnswer({
    prompt: promptFinal,
    modulo: moduloAplicado,
    summary: report?.summary || {},
    rows: report?.rows || [],
    language: idioma,
    intent: intencion,
    analysis
  });

  const interpretation = {
    prompt: promptFinal,
    prompt_original: promptOriginal,
    prompt_final: promptFinal,
    idioma,
    intencion,
    contexto_selector: contextoSelector,
    modulo_plan: plan.modulo,
    modulo_inicial: moduloInicial,
    modulo_aplicado: moduloAplicado,
    rol_detectado: roleDetected,
    entidades_detectadas: entityNames,
    tipo_plan: plan.tipo,
    tipo_aplicado: tipoAplicado,
    consulta_estructurada: consultaEstructurada,
    filtros_detectados: plan.filtros,
    filtros_aplicados: filtrosAplicados,
    fecha_interpretada: interpretedRange,
    dia_semana_detectado: weekdayDetected,
    validacion,
    fallback: fallbackInfo,
    memoria_aplicada: hydratedPromptInfo?.applied || null,
    memoria_previa: memoryBefore || null
  };

  const responsePayload = {
    interpretation,
    respuesta_rapida,
    resumen_texto,
    insights,
    analisis: analysis,
    recomendaciones: analysis.recomendaciones || [],
    ...report
  };

  if (userId) {
    const memoryPatch = buildMemoryPatch({
      previousMemory: memoryBefore,
      moduloAplicado,
      roleDetected,
      entityNames,
      promptFinal
    });

    const historyInterpretation = {
      modulo_plan: plan.modulo,
      modulo_inicial: moduloInicial,
      modulo_aplicado: moduloAplicado,
      tipo_plan: plan.tipo,
      tipo_aplicado: tipoAplicado,
      intencion,
      consulta_estructurada: consultaEstructurada,
      rol_detectado: roleDetected,
      entidades_detectadas: entityNames,
      filtros_aplicados: filtrosAplicados,
      fecha_interpretada: interpretedRange,
      dia_semana_detectado: weekdayDetected,
      validacion,
      fallback: fallbackInfo,
      memoria_aplicada: hydratedPromptInfo?.applied || null
    };

    try {
      await ensureIaMemorySchema();
      await saveIaUserMemory(userId, memoryPatch);
      const historialGuardado = await saveIaQueryHistory(userId, {
        consulta_texto: promptOriginal,
        consulta_expandida: promptFinal,
        interpretacion: historyInterpretation,
        contexto_selector: contextoSelector,
        modulo_aplicado: moduloAplicado,
        tipo_consulta: memoryPatch.ultimo_tipo_consulta || detectPromptTipo(promptFinal),
        resultado_rows: Array.isArray(report?.rows) ? report.rows.length : 0,
        resultado_total_monto: toNumber(report?.summary?.total_monto, 0),
        consulta_valida: Boolean(historyInterpretation.modulo_aplicado && historyInterpretation.tipo_aplicado)
      });
      responsePayload.interpretation.historial_guardado = historialGuardado;
      await cleanupIaQueryHistory(userId);
      responsePayload.interpretation.memoria_actualizada = memoryPatch;
    } catch (err) {
      console.error("IA memory save error:", err.message);
    }
  }

  return responsePayload;
}

module.exports = {
  getCajaReport,
  getComprasReport,
  getIaReport,
  getVentasReport
};












