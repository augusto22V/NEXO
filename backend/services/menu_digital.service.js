const path = require("path");
const fs = require("fs");
const os = require("os");
const db = require("../db");

const MENU_STATES = new Set(["BORRADOR", "PUBLICADO", "OCULTO"]);
const LAYOUT_OPTIONS = new Set(["tabs", "botones", "lista"]);
let schemaPromise = null;

const MENU_UPLOAD_DIR = path.join(__dirname, "../uploads/menu_digital");
const BACKEND_ROOT_DIR = path.join(__dirname, "..");
const FRONTEND_ROOT_DIR = path.join(__dirname, "../../frontend");
const FRONTEND_IMG_DIR = path.join(FRONTEND_ROOT_DIR, "recursos", "img");
const DEFAULT_MENU_PRIMARY = "#147696";
const DEFAULT_MENU_SECONDARY = "#E6F1F4";
const DEFAULT_MENU_BACKGROUND = "linear-gradient(135deg, #f5f7f9 0%, #edf2f5 48%, #e2ebf0 100%)";
const LEGACY_MENU_PRIMARY = "#B43C2F";
const LEGACY_MENU_SECONDARY = "#F6EBD9";
const LEGACY_MENU_BACKGROUND = "linear-gradient(135deg, #fff8ef 0%, #f6ead5 45%, #edd6bf 100%)";

function ensureMenuUploadDir() {
  if (!fs.existsSync(MENU_UPLOAD_DIR)) {
    fs.mkdirSync(MENU_UPLOAD_DIR, { recursive: true });
  }
}

function toId(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.trunc(number) : 0;
}

function toText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  return String(value).trim();
}

function toUpperSafe(value, fallback = "") {
  const text = toText(value, fallback);
  return text ? text.toUpperCase() : "";
}

function toBool(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "t", "si", "s", "yes", "y", "on"].includes(normalized)) return true;
    if (["0", "false", "f", "no", "n", "off"].includes(normalized)) return false;
  }
  return fallback;
}

function toMoney(value, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  const normalized = String(value).replace(/[^\d.,-]/g, "").replace(",", ".");
  const number = Number(normalized);
  if (!Number.isFinite(number)) return fallback;
  return Math.round(number * 100) / 100;
}

function toOrder(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return fallback;
  return Math.trunc(number);
}

function normalizeMenuState(value, fallback = "BORRADOR") {
  const normalized = toText(value, fallback).toUpperCase();
  return MENU_STATES.has(normalized) ? normalized : fallback;
}

function normalizeLayout(value, fallback = "tabs") {
  const normalized = toText(value, fallback).toLowerCase();
  return LAYOUT_OPTIONS.has(normalized) ? normalized : fallback;
}

function normalizeColor(value, fallback) {
  const normalized = toText(value, fallback);
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(normalized) ? normalized : fallback;
}

function normalizeThemeColor(value, fallback) {
  const normalized = normalizeColor(value, fallback).toUpperCase();
  const fallbackNormalized = String(fallback || "").toUpperCase();

  if (normalized === LEGACY_MENU_PRIMARY && fallbackNormalized === DEFAULT_MENU_PRIMARY) {
    return DEFAULT_MENU_PRIMARY;
  }

  if (normalized === LEGACY_MENU_SECONDARY && fallbackNormalized === DEFAULT_MENU_SECONDARY) {
    return DEFAULT_MENU_SECONDARY;
  }

  return normalized;
}

function normalizeBackgroundValue(value, fallback = DEFAULT_MENU_BACKGROUND) {
  const normalized = toText(value, fallback);
  if (!normalized || normalized === LEGACY_MENU_BACKGROUND) {
    return fallback;
  }
  return normalized;
}

function buildStableSlug(empresaId, terminalId) {
  return `menu-${empresaId}-${terminalId}`;
}

function sanitizeBaseUrl(value) {
  const raw = toText(value);
  if (!raw) return "";
  return raw.replace(/\/+$/, "");
}

function normalizePublicBaseUrl(value, fallback = "") {
  const raw = sanitizeBaseUrl(value);
  if (!raw) return fallback;

  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `http://${raw}`;

  try {
    const parsed = new URL(candidate);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return fallback;
    }

    const pathname = parsed.pathname && parsed.pathname !== "/"
      ? parsed.pathname.replace(/\/+$/, "")
      : "";

    return `${parsed.protocol}//${parsed.host}${pathname}`;
  } catch {
    return fallback;
  }
}

function getConfiguredPublicBaseUrl() {
  return normalizePublicBaseUrl(
    process.env.PUBLIC_BASE_URL
    || process.env.APP_PUBLIC_URL
    || process.env.MENU_PUBLIC_BASE_URL
  );
}

function isLocalHostname(hostname) {
  const normalized = String(hostname || "").trim().toLowerCase();
  return !normalized || ["localhost", "127.0.0.1", "::1", "[::1]"].includes(normalized);
}

function isPrivateLanIp(ip) {
  return /^10\./.test(ip)
    || /^192\.168\./.test(ip)
    || /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip);
}

function isTunnelOrVirtualIp(ip) {
  return /^100\./.test(ip)
    || /^26\./.test(ip)
    || /^169\.254\./.test(ip);
}

function detectLanIpAddress() {
  const interfaces = os.networkInterfaces();
  const candidates = [];

  for (const [name, addresses] of Object.entries(interfaces)) {
    for (const address of addresses || []) {
      if (!address || address.internal || address.family !== "IPv4") continue;
      const ip = String(address.address || "").trim();
      if (!ip) continue;

      let score = 0;
      if (isPrivateLanIp(ip)) score += 100;
      if (!isTunnelOrVirtualIp(ip)) score += 25;
      if (/wi-?fi|wlan|ethernet|eth|en/i.test(name)) score += 15;
      if (/tailscale|radmin|vpn|virtual|loopback/i.test(name)) score -= 60;
      if (isTunnelOrVirtualIp(ip)) score -= 40;

      candidates.push({ ip, score });
    }
  }

  candidates.sort((a, b) => b.score - a.score || a.ip.localeCompare(b.ip));
  return candidates[0]?.ip || "";
}

function getScopeFromReq(req) {
  const empresaId = toId(req?.usuario?.empresa_id);
  const terminalId = toId(req?.usuario?.terminal_id);

  if (!empresaId || !terminalId) {
    throw new Error("No se pudo determinar empresa/terminal del usuario");
  }

  return {
    empresa_id: empresaId,
    terminal_id: terminalId
  };
}

function buildRequestOrigin(req, options = {}) {
  const configuredBaseUrl =
    normalizePublicBaseUrl(options.publicBaseUrl)
    || getConfiguredPublicBaseUrl();
  if (configuredBaseUrl) {
    return configuredBaseUrl;
  }

  const protoRaw = req?.headers?.["x-forwarded-proto"] || req?.protocol || "http";
  const proto = String(protoRaw).split(",")[0].trim() || "http";
  const hostRaw = req?.headers?.["x-forwarded-host"] || req?.get?.("host") || "localhost:3000";
  const host = String(hostRaw).split(",")[0].trim() || "localhost:3000";
  const hostname = host.replace(/:\d+$/, "").trim();

  if (!isLocalHostname(hostname)) {
    return `${proto}://${host}`;
  }

  const portMatch = host.match(/:(\d+)$/);
  const port = portMatch?.[1] || process.env.PORT || "3000";
  const lanIp = detectLanIpAddress();

  if (lanIp) {
    return `${proto}://${lanIp}:${port}`;
  }

  return `${proto}://${host}`;
}

function buildMenuPublicUrl(req, slug, options = {}) {
  return `${buildRequestOrigin(req, options)}/menu/${encodeURIComponent(slug)}`;
}

function buildAdminQrUrl(_req, format = "png", _options = {}) {
  return `/api/menu-digital/admin/qr.${format}`;
}

function buildPublicQrUrl(req, slug, format = "png", options = {}) {
  return `${buildRequestOrigin(req, options)}/api/menu-digital/publico/${encodeURIComponent(slug)}/qr.${format}`;
}

function resolveExistingLocalAssetUrl(publicUrl) {
  const raw = toText(publicUrl);
  if (!raw) return "";
  if (/^(https?:)?\/\//i.test(raw) || raw.startsWith("data:")) return raw;

  if (raw.startsWith("/uploads/")) {
    const localPath = path.join(BACKEND_ROOT_DIR, raw.replace(/^\//, "").replace(/\//g, path.sep));
    return fs.existsSync(localPath) ? raw : "";
  }

  if (raw.startsWith("/recursos/img/")) {
    const fileName = path.basename(raw);
    const localPath = path.join(FRONTEND_IMG_DIR, fileName);
    if (fs.existsSync(localPath)) return raw;

    const baseName = path.basename(fileName, path.extname(fileName));
    const extensions = [".png", ".jpg", ".jpeg", ".webp", ".svg"];
    for (const extension of extensions) {
      const candidateName = `${baseName}${extension}`;
      const candidatePath = path.join(FRONTEND_IMG_DIR, candidateName);
      if (fs.existsSync(candidatePath)) {
        return `/recursos/img/${candidateName}`;
      }
    }

    return "";
  }

  if (raw.startsWith("/")) {
    const frontendPath = path.join(FRONTEND_ROOT_DIR, raw.replace(/^\//, "").replace(/\//g, path.sep));
    return fs.existsSync(frontendPath) ? raw : "";
  }

  return raw;
}

function resolveEmpresaLogoPath(logo) {
  const raw = toText(logo);
  if (!raw) return "";
  if (raw.startsWith("/")) return resolveExistingLocalAssetUrl(raw);
  return resolveExistingLocalAssetUrl(`/recursos/img/${raw}`);
}

function mapConfigRow(row = {}) {
  const empresaLogo = resolveEmpresaLogoPath(row.empresa_logo);
  const usarLogoEmpresa = row.usar_logo_empresa !== false;
  const logoCustom = toText(row.logo_url);

  return {
    id: toId(row.id),
    empresa_id: toId(row.empresa_id),
    terminal_id: toId(row.terminal_id),
    slug: toText(row.slug),
    nombre_publico: toText(row.nombre_publico) || toText(row.empresa_nombre) || "Menu Digital",
    estado: normalizeMenuState(row.estado, "BORRADOR"),
    mensaje_principal: toText(row.mensaje_principal),
    mensaje_secundario: toText(row.mensaje_secundario),
    horario_atencion: toText(row.horario_atencion),
    datos_contacto: toText(row.datos_contacto),
    color_principal: normalizeThemeColor(row.color_principal, DEFAULT_MENU_PRIMARY),
    color_secundario: normalizeThemeColor(row.color_secundario, DEFAULT_MENU_SECONDARY),
    fondo_tipo: ["gradient", "solid", "imagen"].includes(toText(row.fondo_tipo).toLowerCase())
      ? toText(row.fondo_tipo).toLowerCase()
      : "gradient",
    fondo_valor: normalizeBackgroundValue(row.fondo_valor),
    public_base_url: normalizePublicBaseUrl(row.public_base_url),
    fondo_imagen_url: resolveExistingLocalAssetUrl(row.fondo_imagen_url),
    banner_url: resolveExistingLocalAssetUrl(row.banner_url),
    logo_url: resolveExistingLocalAssetUrl(usarLogoEmpresa ? (empresaLogo || logoCustom) : (logoCustom || empresaLogo)),
    logo_personalizado_url: logoCustom,
    usar_logo_empresa: usarLogoEmpresa,
    layout_categorias: normalizeLayout(row.layout_categorias, "tabs"),
    empresa_nombre: toText(row.empresa_nombre),
    empresa_logo: empresaLogo,
    terminal_nombre: toText(row.terminal_nombre)
  };
}

function mapCategoryRow(row = {}) {
  return {
    id: toId(row.id),
    menu_id: toId(row.menu_id),
    nombre: toText(row.nombre),
    descripcion: toText(row.descripcion),
    color: normalizeThemeColor(row.color, DEFAULT_MENU_PRIMARY),
    icono: toText(row.icono, "fa-utensils"),
    imagen_url: resolveExistingLocalAssetUrl(row.imagen_url),
    orden: toOrder(row.orden, 0),
    activo: row.activo !== false,
    visible_publico: row.visible_publico !== false,
    agotado: row.agotado === true,
    origen_tipo: toText(row.origen_tipo, "manual"),
    origen_categoria_id: row.origen_categoria_id == null ? null : toId(row.origen_categoria_id),
    sincronizado: row.sincronizado === true,
    tiene_items_publicos: row.tiene_items_publicos === true
  };
}

function mapItemRow(row = {}) {
  return {
    id: toId(row.id),
    menu_id: toId(row.menu_id),
    categoria_id: row.categoria_id == null ? null : toId(row.categoria_id),
    categoria_nombre: toText(row.categoria_nombre),
    nombre: toText(row.nombre),
    descripcion: toText(row.descripcion),
    precio: toMoney(row.precio, 0),
    imagen_url: resolveExistingLocalAssetUrl(row.imagen_url),
    disponible: row.disponible !== false,
    visible_publico: row.visible_publico !== false,
    destacado: row.destacado === true,
    agotado: row.agotado === true,
    orden: toOrder(row.orden, 0),
    origen_tipo: toText(row.origen_tipo, "manual"),
    origen_producto_id: row.origen_producto_id == null ? null : toId(row.origen_producto_id),
    origen_categoria_id: row.origen_categoria_id == null ? null : toId(row.origen_categoria_id),
    sincronizado: row.sincronizado === true
  };
}

async function ensureMenuDigitalSchema() {
  if (schemaPromise) return schemaPromise;

  schemaPromise = (async () => {
    ensureMenuUploadDir();

    await db.query(`
      CREATE TABLE IF NOT EXISTS menu_digital_config (
        id BIGSERIAL PRIMARY KEY,
        empresa_id INTEGER NOT NULL REFERENCES empresa(id) ON DELETE CASCADE,
        terminal_id INTEGER NOT NULL REFERENCES terminal(id) ON DELETE CASCADE,
        slug VARCHAR(160) NOT NULL UNIQUE,
        nombre_publico VARCHAR(180) NOT NULL,
        estado VARCHAR(20) NOT NULL DEFAULT 'BORRADOR',
        mensaje_principal TEXT NULL,
        mensaje_secundario TEXT NULL,
        horario_atencion VARCHAR(180) NULL,
        datos_contacto TEXT NULL,
        color_principal VARCHAR(20) NOT NULL DEFAULT '#147696',
        color_secundario VARCHAR(20) NOT NULL DEFAULT '#E6F1F4',
        fondo_tipo VARCHAR(20) NOT NULL DEFAULT 'gradient',
        fondo_valor TEXT NULL,
        public_base_url TEXT NULL,
        fondo_imagen_url TEXT NULL,
        banner_url TEXT NULL,
        logo_url TEXT NULL,
        usar_logo_empresa BOOLEAN NOT NULL DEFAULT true,
        layout_categorias VARCHAR(20) NOT NULL DEFAULT 'tabs',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS menu_digital_categoria (
        id BIGSERIAL PRIMARY KEY,
        menu_id BIGINT NOT NULL REFERENCES menu_digital_config(id) ON DELETE CASCADE,
        nombre VARCHAR(140) NOT NULL,
        descripcion TEXT NULL,
        color VARCHAR(20) NOT NULL DEFAULT '#147696',
        icono VARCHAR(80) NOT NULL DEFAULT 'fa-utensils',
        imagen_url TEXT NULL,
        orden INTEGER NOT NULL DEFAULT 0,
        activo BOOLEAN NOT NULL DEFAULT true,
        visible_publico BOOLEAN NOT NULL DEFAULT true,
        agotado BOOLEAN NOT NULL DEFAULT false,
        origen_tipo VARCHAR(20) NOT NULL DEFAULT 'manual',
        origen_categoria_id INTEGER NULL REFERENCES categoria(id) ON DELETE SET NULL,
        sincronizado BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS menu_digital_item (
        id BIGSERIAL PRIMARY KEY,
        menu_id BIGINT NOT NULL REFERENCES menu_digital_config(id) ON DELETE CASCADE,
        categoria_id BIGINT NULL REFERENCES menu_digital_categoria(id) ON DELETE SET NULL,
        nombre VARCHAR(180) NOT NULL,
        descripcion TEXT NULL,
        precio NUMERIC(14,2) NOT NULL DEFAULT 0,
        imagen_url TEXT NULL,
        disponible BOOLEAN NOT NULL DEFAULT true,
        visible_publico BOOLEAN NOT NULL DEFAULT true,
        destacado BOOLEAN NOT NULL DEFAULT false,
        agotado BOOLEAN NOT NULL DEFAULT false,
        orden INTEGER NOT NULL DEFAULT 0,
        origen_tipo VARCHAR(20) NOT NULL DEFAULT 'manual',
        origen_producto_id INTEGER NULL REFERENCES producto(id) ON DELETE SET NULL,
        origen_categoria_id INTEGER NULL REFERENCES categoria(id) ON DELETE SET NULL,
        sincronizado BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await db.query(`
      ALTER TABLE menu_digital_config
        ADD COLUMN IF NOT EXISTS empresa_id INTEGER,
        ADD COLUMN IF NOT EXISTS terminal_id INTEGER,
        ADD COLUMN IF NOT EXISTS slug VARCHAR(160),
        ADD COLUMN IF NOT EXISTS nombre_publico VARCHAR(180),
        ADD COLUMN IF NOT EXISTS estado VARCHAR(20) DEFAULT 'BORRADOR',
        ADD COLUMN IF NOT EXISTS mensaje_principal TEXT,
        ADD COLUMN IF NOT EXISTS mensaje_secundario TEXT,
        ADD COLUMN IF NOT EXISTS horario_atencion VARCHAR(180),
        ADD COLUMN IF NOT EXISTS datos_contacto TEXT,
        ADD COLUMN IF NOT EXISTS color_principal VARCHAR(20) DEFAULT '#147696',
        ADD COLUMN IF NOT EXISTS color_secundario VARCHAR(20) DEFAULT '#E6F1F4',
        ADD COLUMN IF NOT EXISTS fondo_tipo VARCHAR(20) DEFAULT 'gradient',
        ADD COLUMN IF NOT EXISTS fondo_valor TEXT,
        ADD COLUMN IF NOT EXISTS public_base_url TEXT,
        ADD COLUMN IF NOT EXISTS fondo_imagen_url TEXT,
        ADD COLUMN IF NOT EXISTS banner_url TEXT,
        ADD COLUMN IF NOT EXISTS logo_url TEXT,
        ADD COLUMN IF NOT EXISTS usar_logo_empresa BOOLEAN DEFAULT true,
        ADD COLUMN IF NOT EXISTS layout_categorias VARCHAR(20) DEFAULT 'tabs',
        ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()
    `);

    await db.query(`
      ALTER TABLE menu_digital_categoria
        ADD COLUMN IF NOT EXISTS menu_id BIGINT,
        ADD COLUMN IF NOT EXISTS nombre VARCHAR(140),
        ADD COLUMN IF NOT EXISTS descripcion TEXT,
        ADD COLUMN IF NOT EXISTS color VARCHAR(20) DEFAULT '#147696',
        ADD COLUMN IF NOT EXISTS icono VARCHAR(80) DEFAULT 'fa-utensils',
        ADD COLUMN IF NOT EXISTS imagen_url TEXT,
        ADD COLUMN IF NOT EXISTS orden INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS activo BOOLEAN DEFAULT true,
        ADD COLUMN IF NOT EXISTS visible_publico BOOLEAN DEFAULT true,
        ADD COLUMN IF NOT EXISTS agotado BOOLEAN DEFAULT false,
        ADD COLUMN IF NOT EXISTS origen_tipo VARCHAR(20) DEFAULT 'manual',
        ADD COLUMN IF NOT EXISTS origen_categoria_id INTEGER,
        ADD COLUMN IF NOT EXISTS sincronizado BOOLEAN DEFAULT false,
        ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()
    `);

    await db.query(`
      ALTER TABLE menu_digital_item
        ADD COLUMN IF NOT EXISTS menu_id BIGINT,
        ADD COLUMN IF NOT EXISTS categoria_id BIGINT,
        ADD COLUMN IF NOT EXISTS nombre VARCHAR(180),
        ADD COLUMN IF NOT EXISTS descripcion TEXT,
        ADD COLUMN IF NOT EXISTS precio NUMERIC(14,2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS imagen_url TEXT,
        ADD COLUMN IF NOT EXISTS disponible BOOLEAN DEFAULT true,
        ADD COLUMN IF NOT EXISTS visible_publico BOOLEAN DEFAULT true,
        ADD COLUMN IF NOT EXISTS destacado BOOLEAN DEFAULT false,
        ADD COLUMN IF NOT EXISTS agotado BOOLEAN DEFAULT false,
        ADD COLUMN IF NOT EXISTS orden INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS origen_tipo VARCHAR(20) DEFAULT 'manual',
        ADD COLUMN IF NOT EXISTS origen_producto_id INTEGER,
        ADD COLUMN IF NOT EXISTS origen_categoria_id INTEGER,
        ADD COLUMN IF NOT EXISTS sincronizado BOOLEAN DEFAULT false,
        ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()
    `);

    await db.query(`
      ALTER TABLE producto
        ADD COLUMN IF NOT EXISTS mostrar_menu_digital BOOLEAN NOT NULL DEFAULT false
    `);

    await db.query(`
      ALTER TABLE categoria
        ADD COLUMN IF NOT EXISTS mostrar_menu_digital BOOLEAN NOT NULL DEFAULT false
    `);

    await db.query(`
      ALTER TABLE menu_digital_config
        ALTER COLUMN color_principal SET DEFAULT '#147696',
        ALTER COLUMN color_secundario SET DEFAULT '#E6F1F4'
    `);

    await db.query(`
      ALTER TABLE menu_digital_categoria
        ALTER COLUMN color SET DEFAULT '#147696'
    `);

    await db.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_menu_digital_config_scope
      ON menu_digital_config(empresa_id, terminal_id)
    `);

    await db.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_menu_digital_categoria_origen
      ON menu_digital_categoria(menu_id, origen_categoria_id)
      WHERE origen_categoria_id IS NOT NULL
    `);

    await db.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_menu_digital_item_origen
      ON menu_digital_item(menu_id, origen_producto_id)
      WHERE origen_producto_id IS NOT NULL
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_menu_digital_categoria_menu_orden
      ON menu_digital_categoria(menu_id, orden, id)
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_menu_digital_item_menu_orden
      ON menu_digital_item(menu_id, orden, id)
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_producto_mostrar_menu_digital
      ON producto(mostrar_menu_digital, categoria_id, id)
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_categoria_mostrar_menu_digital
      ON categoria(mostrar_menu_digital, id)
    `);
  })().catch((error) => {
    schemaPromise = null;
    throw error;
  });

  return schemaPromise;
}

async function getEmpresaTerminalForScope(queryable, scope) {
  const result = await queryable.query(
    `
    SELECT
      e.id AS empresa_id,
      e.nombre AS empresa_nombre,
      e.logo AS empresa_logo,
      t.id AS terminal_id,
      t.nombre AS terminal_nombre
    FROM empresa e
    JOIN terminal t ON t.empresa_id = e.id
    WHERE e.id = $1 AND t.id = $2
    LIMIT 1
    `,
    [scope.empresa_id, scope.terminal_id]
  );

  if (!result.rows.length) {
    throw new Error("No se encontro empresa/terminal para menu digital");
  }

  return result.rows[0];
}

async function getOrCreateMenuConfig(queryable, scope) {
  await ensureMenuDigitalSchema();
  const info = await getEmpresaTerminalForScope(queryable, scope);

  const existing = await queryable.query(
    `
    SELECT
      m.*,
      $3::text AS empresa_nombre,
      $4::text AS empresa_logo,
      $5::text AS terminal_nombre
    FROM menu_digital_config m
    WHERE m.empresa_id = $1 AND m.terminal_id = $2
    LIMIT 1
    `,
    [scope.empresa_id, scope.terminal_id, info.empresa_nombre, info.empresa_logo, info.terminal_nombre]
  );

  if (existing.rows.length) {
    return mapConfigRow(existing.rows[0]);
  }

  const slug = buildStableSlug(scope.empresa_id, scope.terminal_id);
  const insert = await queryable.query(
    `
    INSERT INTO menu_digital_config (
      empresa_id, terminal_id, slug, nombre_publico, estado,
      mensaje_principal, mensaje_secundario, horario_atencion, datos_contacto,
      color_principal, color_secundario, fondo_tipo, fondo_valor,
      usar_logo_empresa, layout_categorias
    ) VALUES (
      $1, $2, $3, $4, 'BORRADOR',
      $5, $6, $7, $8,
      '#147696', '#E6F1F4', 'gradient', 'linear-gradient(135deg, #f5f7f9 0%, #edf2f5 48%, #e2ebf0 100%)',
      true, 'tabs'
    )
    RETURNING *
    `,
    [
      scope.empresa_id,
      scope.terminal_id,
      slug,
      info.empresa_nombre,
      `Bienvenido a ${info.empresa_nombre}`,
      "Explora nuestros destacados del dia",
      "",
      ""
    ]
  );

  return mapConfigRow({
    ...insert.rows[0],
    empresa_nombre: info.empresa_nombre,
    empresa_logo: info.empresa_logo,
    terminal_nombre: info.terminal_nombre
  });
}

async function getMenuConfigById(queryable, menuId) {
  await ensureMenuDigitalSchema();
  const result = await queryable.query(
    `
    SELECT
      m.*,
      e.nombre AS empresa_nombre,
      e.logo AS empresa_logo,
      t.nombre AS terminal_nombre
    FROM menu_digital_config m
    JOIN empresa e ON e.id = m.empresa_id
    JOIN terminal t ON t.id = m.terminal_id
    WHERE m.id = $1
    LIMIT 1
    `,
    [menuId]
  );

  if (!result.rows.length) {
    throw new Error("Menu digital no encontrado");
  }

  return mapConfigRow(result.rows[0]);
}

async function getMenuConfigBySlug(queryable, slug) {
  await ensureMenuDigitalSchema();
  const result = await queryable.query(
    `
    SELECT
      m.*,
      e.nombre AS empresa_nombre,
      e.logo AS empresa_logo,
      t.nombre AS terminal_nombre
    FROM menu_digital_config m
    JOIN empresa e ON e.id = m.empresa_id
    JOIN terminal t ON t.id = m.terminal_id
    WHERE m.slug = $1
    LIMIT 1
    `,
    [slug]
  );

  if (!result.rows.length) {
    throw new Error("Menu digital no encontrado");
  }

  return mapConfigRow(result.rows[0]);
}

async function getNextCategoryOrder(queryable, menuId) {
  const result = await queryable.query(
    `SELECT COALESCE(MAX(orden), 0) + 1 AS next_order FROM menu_digital_categoria WHERE menu_id = $1`,
    [menuId]
  );
  return toOrder(result.rows[0]?.next_order, 1);
}

async function getNextItemOrder(queryable, menuId) {
  const result = await queryable.query(
    `SELECT COALESCE(MAX(orden), 0) + 1 AS next_order FROM menu_digital_item WHERE menu_id = $1`,
    [menuId]
  );
  return toOrder(result.rows[0]?.next_order, 1);
}

async function syncCategoryFromSource(queryable, menuId, categoriaId, options = {}) {
  const categoriaSourceId = toId(categoriaId);
  if (!categoriaSourceId) return null;

  const source = await queryable.query(
    `
    SELECT id, nombre, imagen, activo, mostrar_menu_digital
    FROM categoria
    WHERE id = $1
    LIMIT 1
    `,
    [categoriaSourceId]
  );

  if (!source.rows.length) return null;
  const src = source.rows[0];
  const forceVisible = toBool(options.forceVisible, false);

  const existing = await queryable.query(
    `
    SELECT *
    FROM menu_digital_categoria
    WHERE menu_id = $1 AND origen_categoria_id = $2
    LIMIT 1
    `,
    [menuId, categoriaSourceId]
  );

  if (existing.rows.length) {
    const updated = await queryable.query(
      `
      UPDATE menu_digital_categoria
      SET
        nombre = $3,
        imagen_url = COALESCE(NULLIF(menu_digital_categoria.imagen_url, ''), $4),
        sincronizado = true,
        origen_tipo = 'categoria',
        updated_at = NOW()
      WHERE menu_id = $1 AND origen_categoria_id = $2
      RETURNING *
      `,
      [
        menuId,
        categoriaSourceId,
        src.nombre,
        src.imagen || null
      ]
    );

    return mapCategoryRow(updated.rows[0]);
  }

  const insert = await queryable.query(
    `
    INSERT INTO menu_digital_categoria (
      menu_id, nombre, imagen_url, orden,
      activo, visible_publico, agotado,
      origen_tipo, origen_categoria_id, sincronizado
    ) VALUES (
      $1, $2, $3, $4,
      $5, $6, $7,
      'categoria', $8, true
    )
    RETURNING *
    `,
    [
      menuId,
      src.nombre,
      src.imagen || null,
      await getNextCategoryOrder(queryable, menuId),
      src.activo === true,
      forceVisible || src.mostrar_menu_digital === true,
      src.activo !== true,
      categoriaSourceId
    ]
  );

  return mapCategoryRow(insert.rows[0]);
}

async function syncItemFromSource(queryable, menuId, productoId) {
  const productoSourceId = toId(productoId);
  if (!productoSourceId) return null;

  const source = await queryable.query(
    `
    SELECT
      p.id,
      p.nombre,
      p.descripcion,
      p.imagen,
      p.activo,
      p.mostrar_menu_digital,
      p.categoria_id,
      COALESCE(pp.precio_venta, 0) AS precio_venta
    FROM producto p
    LEFT JOIN producto_precio pp
      ON pp.producto_id = p.id
     AND pp.activo = true
    WHERE p.id = $1
    LIMIT 1
    `,
    [productoSourceId]
  );

  if (!source.rows.length) return null;
  const src = source.rows[0];
  const categoria = await syncCategoryFromSource(queryable, menuId, src.categoria_id, { forceVisible: true });

  const existing = await queryable.query(
    `
    SELECT *
    FROM menu_digital_item
    WHERE menu_id = $1 AND origen_producto_id = $2
    LIMIT 1
    `,
    [menuId, productoSourceId]
  );

  const visiblePublico = src.mostrar_menu_digital === true;
  const disponible = src.activo === true;

  if (existing.rows.length) {
    const updated = await queryable.query(
      `
      UPDATE menu_digital_item
      SET
        categoria_id = $3,
        nombre = $4,
        descripcion = $5,
        precio = $6,
        imagen_url = COALESCE(NULLIF(menu_digital_item.imagen_url, ''), $7),
        origen_tipo = 'producto',
        origen_categoria_id = $8,
        sincronizado = true,
        updated_at = NOW()
      WHERE menu_id = $1 AND origen_producto_id = $2
      RETURNING *
      `,
      [
        menuId,
        productoSourceId,
        categoria?.id || null,
        src.nombre,
        src.descripcion || null,
        toMoney(src.precio_venta, 0),
        src.imagen || null,
        src.categoria_id || null
      ]
    );

    return mapItemRow(updated.rows[0]);
  }

  const insert = await queryable.query(
    `
    INSERT INTO menu_digital_item (
      menu_id, categoria_id, nombre, descripcion, precio, imagen_url,
      disponible, visible_publico, destacado, agotado, orden,
      origen_tipo, origen_producto_id, origen_categoria_id, sincronizado
    ) VALUES (
      $1, $2, $3, $4, $5, $6,
      $7, $8, false, $9, $10,
      'producto', $11, $12, true
    )
    RETURNING *
    `,
    [
      menuId,
      categoria?.id || null,
      src.nombre,
      src.descripcion || null,
      toMoney(src.precio_venta, 0),
      src.imagen || null,
      disponible,
      visiblePublico,
      !disponible,
      await getNextItemOrder(queryable, menuId),
      productoSourceId,
      src.categoria_id || null
    ]
  );

  return mapItemRow(insert.rows[0]);
}

async function syncAllFromSources(queryable, menuId) {
  await ensureMenuDigitalSchema();

  const categoriaIdsRes = await queryable.query(
    `
    SELECT DISTINCT categoria_id
    FROM (
      SELECT id AS categoria_id
      FROM categoria
      WHERE mostrar_menu_digital = true
      UNION
      SELECT origen_categoria_id AS categoria_id
      FROM menu_digital_categoria
      WHERE menu_id = $1
        AND origen_categoria_id IS NOT NULL
      UNION
      SELECT origen_categoria_id AS categoria_id
      FROM menu_digital_item
      WHERE menu_id = $1
        AND origen_categoria_id IS NOT NULL
    ) q
    WHERE categoria_id IS NOT NULL
    `,
    [menuId]
  );

  for (const row of categoriaIdsRes.rows) {
    await syncCategoryFromSource(queryable, menuId, row.categoria_id);
  }

  const productoIdsRes = await queryable.query(
    `
    SELECT DISTINCT producto_id
    FROM (
      SELECT id AS producto_id
      FROM producto
      WHERE mostrar_menu_digital = true
      UNION
      SELECT origen_producto_id AS producto_id
      FROM menu_digital_item
      WHERE menu_id = $1
        AND origen_producto_id IS NOT NULL
    ) q
    WHERE producto_id IS NOT NULL
    `,
    [menuId]
  );

  for (const row of productoIdsRes.rows) {
    await syncItemFromSource(queryable, menuId, row.producto_id);
  }
}

async function updateConfig(queryable, menuId, payload = {}) {
  const data = {
    nombre_publico: toText(payload.nombre_publico) || "Menu Digital",
    estado: normalizeMenuState(payload.estado, "BORRADOR"),
    mensaje_principal: toText(payload.mensaje_principal),
    mensaje_secundario: toText(payload.mensaje_secundario),
    horario_atencion: toText(payload.horario_atencion),
    datos_contacto: toText(payload.datos_contacto),
    color_principal: normalizeThemeColor(payload.color_principal, DEFAULT_MENU_PRIMARY),
    color_secundario: normalizeThemeColor(payload.color_secundario, DEFAULT_MENU_SECONDARY),
    fondo_tipo: ["gradient", "solid", "imagen"].includes(toText(payload.fondo_tipo).toLowerCase())
      ? toText(payload.fondo_tipo).toLowerCase()
      : "gradient",
    fondo_valor: normalizeBackgroundValue(payload.fondo_valor),
    public_base_url: payload.public_base_url === undefined
      ? undefined
      : normalizePublicBaseUrl(payload.public_base_url),
    fondo_imagen_url: payload.fondo_imagen_url === undefined ? undefined : toText(payload.fondo_imagen_url),
    banner_url: payload.banner_url === undefined ? undefined : toText(payload.banner_url),
    logo_url: payload.logo_url === undefined ? undefined : toText(payload.logo_url),
    usar_logo_empresa: toBool(payload.usar_logo_empresa, true),
    layout_categorias: normalizeLayout(payload.layout_categorias, "tabs")
  };

  const current = await getMenuConfigById(queryable, menuId);
  const updated = await queryable.query(
    `
    UPDATE menu_digital_config
    SET
      nombre_publico = $2,
      estado = $3,
      mensaje_principal = $4,
      mensaje_secundario = $5,
      horario_atencion = $6,
      datos_contacto = $7,
      color_principal = $8,
      color_secundario = $9,
      fondo_tipo = $10,
      fondo_valor = $11,
      public_base_url = $12,
      fondo_imagen_url = $13,
      banner_url = $14,
      logo_url = $15,
      usar_logo_empresa = $16,
      layout_categorias = $17,
      updated_at = NOW()
    WHERE id = $1
    RETURNING *
    `,
    [
      menuId,
      data.nombre_publico,
      data.estado,
      data.mensaje_principal,
      data.mensaje_secundario,
      data.horario_atencion,
      data.datos_contacto,
      data.color_principal,
      data.color_secundario,
      data.fondo_tipo,
      data.fondo_valor,
      data.public_base_url === undefined ? current.public_base_url : data.public_base_url,
      data.fondo_imagen_url === undefined ? current.fondo_imagen_url : data.fondo_imagen_url,
      data.banner_url === undefined ? current.banner_url : data.banner_url,
      data.logo_url === undefined ? current.logo_personalizado_url : data.logo_url,
      data.usar_logo_empresa,
      data.layout_categorias
    ]
  );

  return mapConfigRow({
    ...updated.rows[0],
    empresa_nombre: current.empresa_nombre,
    empresa_logo: current.empresa_logo,
    terminal_nombre: current.terminal_nombre
  });
}

async function listCategories(queryable, menuId, includeHidden = true) {
  const result = await queryable.query(
    `
    SELECT
      c.*,
      EXISTS(
        SELECT 1
        FROM menu_digital_item i
        WHERE i.menu_id = c.menu_id
          AND i.categoria_id = c.id
          AND i.visible_publico = true
      ) AS tiene_items_publicos
    FROM menu_digital_categoria c
    WHERE c.menu_id = $1
      AND ($2::boolean = true OR c.visible_publico = true)
    ORDER BY c.orden ASC, c.id ASC
    `,
    [menuId, includeHidden]
  );

  return result.rows.map(mapCategoryRow);
}

async function listItems(queryable, menuId, includeHidden = true) {
  const result = await queryable.query(
    `
    SELECT
      i.*,
      c.nombre AS categoria_nombre
    FROM menu_digital_item i
    LEFT JOIN menu_digital_categoria c ON c.id = i.categoria_id
    WHERE i.menu_id = $1
      AND ($2::boolean = true OR i.visible_publico = true)
    ORDER BY i.destacado DESC, i.orden ASC, i.id ASC
    `,
    [menuId, includeHidden]
  );

  return result.rows.map(mapItemRow);
}

async function buildMenuPayload(queryable, menuId, options = {}) {
  const includeHidden = toBool(options.includeHidden, false);
  const allowDraftPreview = toBool(options.allowDraftPreview, false);
  const config = await getMenuConfigById(queryable, menuId);

  if (!includeHidden && !allowDraftPreview && config.estado !== "PUBLICADO") {
    throw new Error("El menu digital no esta publicado");
  }

  const categories = await listCategories(queryable, menuId, includeHidden);
  const items = await listItems(queryable, menuId, includeHidden);

  const visibleItems = includeHidden ? items : items.filter((item) => item.visible_publico);
  const visibleCategories = categories.filter((category) => {
    if (includeHidden) return true;
    if (category.visible_publico) return true;
    return visibleItems.some((item) => item.categoria_id === category.id);
  });

  return {
    config,
    categories: visibleCategories,
    items: visibleItems,
    generated_at: new Date().toISOString()
  };
}

async function buildAdminBootstrap(queryable, req) {
  const scope = getScopeFromReq(req);
  const config = await getOrCreateMenuConfig(queryable, scope);
  await syncAllFromSources(queryable, config.id);

  const freshConfig = await getMenuConfigById(queryable, config.id);
  const publicOrigin = buildRequestOrigin(req, { publicBaseUrl: freshConfig.public_base_url });
  const categories = await listCategories(queryable, config.id, true);
  const items = await listItems(queryable, config.id, true);
  const preview = await buildMenuPayload(queryable, config.id, { includeHidden: true });

  const sourceCounts = await queryable.query(
    `
    SELECT
      (SELECT COUNT(*)::int FROM categoria WHERE mostrar_menu_digital = true) AS categorias_marcadas,
      (SELECT COUNT(*)::int FROM producto WHERE mostrar_menu_digital = true) AS productos_marcados
    `
  );

  return {
    config: freshConfig,
    categories,
    items,
    preview,
    summary: {
      categorias_total: categories.length,
      categorias_visibles: categories.filter((item) => item.visible_publico).length,
      items_total: items.length,
      items_visibles: items.filter((item) => item.visible_publico).length,
      items_destacados: items.filter((item) => item.destacado).length
    },
    source_sync: sourceCounts.rows[0] || {
      categorias_marcadas: 0,
      productos_marcados: 0
    },
    publication: {
      public_url: buildMenuPublicUrl(req, freshConfig.slug, { publicBaseUrl: freshConfig.public_base_url }),
      resolved_base_url: publicOrigin,
      qr_png_url: buildAdminQrUrl(req, "png"),
      qr_jpg_url: buildAdminQrUrl(req, "jpg"),
      qr_pdf_url: buildAdminQrUrl(req, "pdf"),
      public_qr_png_url: buildPublicQrUrl(req, freshConfig.slug, "png")
    }
  };
}

module.exports = {
  MENU_UPLOAD_DIR,
  ensureMenuUploadDir,
  ensureMenuDigitalSchema,
  getScopeFromReq,
  getOrCreateMenuConfig,
  getMenuConfigById,
  getMenuConfigBySlug,
  updateConfig,
  listCategories,
  listItems,
  buildMenuPayload,
  buildAdminBootstrap,
  buildMenuPublicUrl,
  buildAdminQrUrl,
  buildPublicQrUrl,
  syncCategoryFromSource,
  syncItemFromSource,
  syncAllFromSources,
  toBool,
  toMoney,
  toOrder,
  normalizeLayout,
  normalizeMenuState,
  normalizeColor,
  toText,
  toUpperSafe,
  mapCategoryRow,
  mapItemRow
};
