/**
 * Catalogo online publico (productos por categoria + servicios + pedidos/consultas).
 *
 * Importante: los pedidos que llegan desde el catalogo NO descuentan stock.
 * Solo quedan guardados como "pendientes" para que el negocio los revise y,
 * si corresponde, los cargue como venta normal.
 */
const path = require("path");
const fs = require("fs");
const db = require("../db");

const CATALOGO_UPLOAD_DIR = path.join(__dirname, "../uploads/catalogo");
const ESTADOS_PEDIDO = new Set(["PENDIENTE", "ATENDIDO", "CANCELADO"]);
const TIPOS_PEDIDO = new Set(["PEDIDO", "CONSULTA"]);
const POCAS_UNIDADES = 3;

let schemaPromise = null;

function ensureCatalogoUploadDir() {
  if (!fs.existsSync(CATALOGO_UPLOAD_DIR)) {
    fs.mkdirSync(CATALOGO_UPLOAD_DIR, { recursive: true });
  }
}

function toId(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.trunc(number) : 0;
}

function toText(value, fallback = "", maxLength = 0) {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return maxLength > 0 ? text.slice(0, maxLength) : text;
}

function toBool(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "t", "si", "s", "yes", "on"].includes(normalized)) return true;
    if (["0", "false", "f", "no", "n", "off"].includes(normalized)) return false;
  }
  return fallback;
}

function toMoneyOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const normalized = String(value).replace(/[^\d.,-]/g, "").replace(/\./g, "").replace(",", ".");
  const number = Number(normalized);
  if (!Number.isFinite(number) || number < 0) return null;
  return Math.round(number * 100) / 100;
}

function toOrder(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return fallback;
  return Math.trunc(number);
}

function normalizeColor(value, fallback) {
  const text = toText(value, fallback);
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(text) ? text : fallback;
}

function slugify(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** Deja solo digitos del numero de WhatsApp (formato internacional, ej. 595981123456). */
function normalizeWhatsapp(value) {
  let digits = String(value || "").replace(/\D/g, "");
  // Numero local paraguayo (0981...) -> internacional (595981...)
  if (digits.startsWith("0")) digits = `595${digits.slice(1)}`;
  return digits.slice(0, 20);
}

async function ensureCatalogoSchema() {
  if (schemaPromise) return schemaPromise;

  schemaPromise = (async () => {
    ensureCatalogoUploadDir();

    await db.query(`
      CREATE TABLE IF NOT EXISTS catalogo_config (
        id BIGSERIAL PRIMARY KEY,
        empresa_id INTEGER NOT NULL UNIQUE REFERENCES empresa(id) ON DELETE CASCADE,
        slug VARCHAR(80) NOT NULL UNIQUE,
        publicado BOOLEAN NOT NULL DEFAULT true,
        nombre_publico VARCHAR(180) NOT NULL,
        mensaje TEXT NULL,
        whatsapp VARCHAR(30) NULL,
        direccion TEXT NULL,
        horario VARCHAR(180) NULL,
        color VARCHAR(20) NOT NULL DEFAULT '#7B6BAD',
        mostrar_sin_stock BOOLEAN NOT NULL DEFAULT true,
        mostrar_precios BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS catalogo_servicio (
        id BIGSERIAL PRIMARY KEY,
        empresa_id INTEGER NOT NULL REFERENCES empresa(id) ON DELETE CASCADE,
        nombre VARCHAR(180) NOT NULL,
        descripcion TEXT NULL,
        precio NUMERIC(14,2) NULL,
        precio_texto VARCHAR(80) NULL,
        imagen_url TEXT NULL,
        orden INTEGER NOT NULL DEFAULT 0,
        activo BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS catalogo_pedido (
        id BIGSERIAL PRIMARY KEY,
        empresa_id INTEGER NOT NULL REFERENCES empresa(id) ON DELETE CASCADE,
        tipo VARCHAR(20) NOT NULL DEFAULT 'PEDIDO',
        cliente_nombre VARCHAR(160) NOT NULL,
        cliente_telefono VARCHAR(40) NOT NULL,
        cliente_nota TEXT NULL,
        items JSONB NOT NULL DEFAULT '[]'::jsonb,
        total_estimado NUMERIC(14,2) NOT NULL DEFAULT 0,
        estado VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
        observacion_interna TEXT NULL,
        atendido_at TIMESTAMPTZ NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_catalogo_servicio_empresa
      ON catalogo_servicio(empresa_id, orden, id)
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_catalogo_pedido_empresa_estado
      ON catalogo_pedido(empresa_id, estado, created_at DESC)
    `);

    // Columnas de producto que usa el catalogo (por si la base es antigua).
    await db.query(`
      ALTER TABLE producto
        ADD COLUMN IF NOT EXISTS es_insumo BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS es_servicio BOOLEAN DEFAULT false,
        ADD COLUMN IF NOT EXISTS no_control_stock BOOLEAN DEFAULT false,
        ADD COLUMN IF NOT EXISTS ocultar_catalogo BOOLEAN NOT NULL DEFAULT false
    `);
  })().catch((error) => {
    schemaPromise = null;
    throw error;
  });

  return schemaPromise;
}

function mapConfig(row = {}) {
  return {
    id: toId(row.id),
    empresa_id: toId(row.empresa_id),
    slug: toText(row.slug),
    publicado: row.publicado !== false,
    nombre_publico: toText(row.nombre_publico) || toText(row.empresa_nombre) || "Catálogo",
    mensaje: toText(row.mensaje),
    whatsapp: normalizeWhatsapp(row.whatsapp),
    direccion: toText(row.direccion),
    horario: toText(row.horario),
    color: normalizeColor(row.color, "#7B6BAD"),
    mostrar_sin_stock: row.mostrar_sin_stock !== false,
    mostrar_precios: row.mostrar_precios !== false,
    empresa_nombre: toText(row.empresa_nombre),
    empresa_logo: toText(row.empresa_logo)
  };
}

function mapServicio(row = {}) {
  return {
    id: toId(row.id),
    nombre: toText(row.nombre),
    descripcion: toText(row.descripcion),
    precio: row.precio === null || row.precio === undefined ? null : Number(row.precio),
    precio_texto: toText(row.precio_texto),
    imagen_url: toText(row.imagen_url),
    orden: toOrder(row.orden, 0),
    activo: row.activo !== false
  };
}

function mapPedido(row = {}) {
  return {
    id: toId(row.id),
    tipo: toText(row.tipo, "PEDIDO"),
    cliente_nombre: toText(row.cliente_nombre),
    cliente_telefono: toText(row.cliente_telefono),
    cliente_nota: toText(row.cliente_nota),
    items: Array.isArray(row.items) ? row.items : [],
    total_estimado: Number(row.total_estimado || 0),
    estado: toText(row.estado, "PENDIENTE"),
    observacion_interna: toText(row.observacion_interna),
    atendido_at: row.atendido_at || null,
    created_at: row.created_at || null
  };
}

const CONFIG_SELECT = `
  SELECT c.*, e.nombre AS empresa_nombre, e.logo AS empresa_logo
  FROM catalogo_config c
  JOIN empresa e ON e.id = c.empresa_id
`;

async function buildUniqueSlug(queryable, base, ignoreId = 0) {
  const root = slugify(base) || "catalogo";
  let candidate = root;
  for (let i = 2; i < 500; i += 1) {
    const exists = await queryable.query(
      `SELECT 1 FROM catalogo_config WHERE slug = $1 AND id <> $2 LIMIT 1`,
      [candidate, ignoreId]
    );
    if (!exists.rows.length) return candidate;
    candidate = `${root}-${i}`;
  }
  return `${root}-${Date.now()}`;
}

async function getOrCreateConfig(queryable, empresaId) {
  await ensureCatalogoSchema();
  const id = toId(empresaId);
  if (!id) throw new Error("No se pudo determinar la empresa del usuario");

  const existing = await queryable.query(`${CONFIG_SELECT} WHERE c.empresa_id = $1 LIMIT 1`, [id]);
  if (existing.rows.length) return mapConfig(existing.rows[0]);

  const empresa = await queryable.query(
    `SELECT id, nombre, telefono, direccion FROM empresa WHERE id = $1 LIMIT 1`,
    [id]
  );
  if (!empresa.rows.length) throw new Error("Empresa no encontrada");
  const emp = empresa.rows[0];

  const slug = await buildUniqueSlug(queryable, emp.nombre || `catalogo-${id}`);
  await queryable.query(
    `
    INSERT INTO catalogo_config (empresa_id, slug, nombre_publico, mensaje, whatsapp, direccion)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (empresa_id) DO NOTHING
    `,
    [
      id,
      slug,
      toText(emp.nombre, "Catálogo"),
      "Mirá nuestros productos y servicios. Hacé tu pedido o consultá disponibilidad.",
      normalizeWhatsapp(emp.telefono),
      toText(emp.direccion)
    ]
  );

  const created = await queryable.query(`${CONFIG_SELECT} WHERE c.empresa_id = $1 LIMIT 1`, [id]);
  return mapConfig(created.rows[0]);
}

async function getConfigBySlug(queryable, slug) {
  await ensureCatalogoSchema();
  const result = await queryable.query(`${CONFIG_SELECT} WHERE c.slug = $1 LIMIT 1`, [toText(slug).toLowerCase()]);
  return result.rows.length ? mapConfig(result.rows[0]) : null;
}

async function getDefaultPublishedSlug(queryable) {
  await ensureCatalogoSchema();
  const result = await queryable.query(
    `SELECT slug FROM catalogo_config WHERE publicado = true ORDER BY empresa_id ASC LIMIT 1`
  );
  return result.rows[0]?.slug || "";
}

async function updateConfig(queryable, empresaId, payload = {}) {
  const current = await getOrCreateConfig(queryable, empresaId);

  let slug = current.slug;
  if (payload.slug !== undefined && slugify(payload.slug) && slugify(payload.slug) !== current.slug) {
    slug = await buildUniqueSlug(queryable, payload.slug, current.id);
  }

  await queryable.query(
    `
    UPDATE catalogo_config SET
      slug = $2,
      publicado = $3,
      nombre_publico = $4,
      mensaje = $5,
      whatsapp = $6,
      direccion = $7,
      horario = $8,
      color = $9,
      mostrar_sin_stock = $10,
      mostrar_precios = $11,
      updated_at = NOW()
    WHERE id = $1
    `,
    [
      current.id,
      slug,
      toBool(payload.publicado, current.publicado),
      toText(payload.nombre_publico, current.nombre_publico, 180) || current.nombre_publico,
      payload.mensaje === undefined ? current.mensaje : toText(payload.mensaje, "", 600),
      payload.whatsapp === undefined ? current.whatsapp : normalizeWhatsapp(payload.whatsapp),
      payload.direccion === undefined ? current.direccion : toText(payload.direccion, "", 300),
      payload.horario === undefined ? current.horario : toText(payload.horario, "", 180),
      normalizeColor(payload.color, current.color),
      toBool(payload.mostrar_sin_stock, current.mostrar_sin_stock),
      toBool(payload.mostrar_precios, current.mostrar_precios)
    ]
  );

  return getOrCreateConfig(queryable, empresaId);
}

function disponibilidadDe(row) {
  if (row.no_control_stock === true) return "DISPONIBLE";
  const stock = Number(row.stock || 0);
  if (stock <= 0) return "SIN_STOCK";
  if (stock <= POCAS_UNIDADES) return "POCAS_UNIDADES";
  return "DISPONIBLE";
}

/** Productos activos y visibles en el catalogo (no insumos, no servicios, no ocultos). */
async function listProductosPublicos(queryable, options = {}) {
  const result = await queryable.query(
    `
    SELECT
      p.id,
      p.nombre,
      p.descripcion,
      p.imagen,
      p.stock,
      p.no_control_stock,
      p.unidad_medida,
      p.codigo_barra,
      COALESCE(p.es_servicio, false) AS es_servicio,
      c.id AS categoria_id,
      c.nombre AS categoria_nombre,
      c.imagen AS categoria_imagen,
      COALESCE(pp.precio_venta, 0) AS precio
    FROM producto p
    LEFT JOIN categoria c ON c.id = p.categoria_id
    LEFT JOIN LATERAL (
      SELECT precio_venta
      FROM producto_precio
      WHERE producto_id = p.id AND activo = true
      ORDER BY id DESC
      LIMIT 1
    ) pp ON true
    WHERE p.activo = true
      AND COALESCE(c.activo, true) = true
      AND COALESCE(p.es_insumo, false) = false
      AND COALESCE(p.ocultar_catalogo, false) = false
    ORDER BY c.nombre ASC NULLS LAST, p.nombre ASC
    `
  );

  const mostrarSinStock = options.mostrarSinStock !== false;
  return result.rows
    .map((row) => ({
      id: toId(row.id),
      nombre: toText(row.nombre),
      descripcion: toText(row.descripcion),
      imagen: toText(row.imagen),
      unidad_medida: toText(row.unidad_medida),
      codigo: toText(row.codigo_barra),
      categoria_id: row.categoria_id == null ? 0 : toId(row.categoria_id),
      categoria_nombre: toText(row.categoria_nombre) || "Otros",
      categoria_imagen: toText(row.categoria_imagen),
      precio: Number(row.precio || 0),
      es_servicio: row.es_servicio === true,
      // Los servicios no dependen del stock.
      disponibilidad: row.es_servicio === true ? "DISPONIBLE" : disponibilidadDe(row)
    }))
    .filter((p) => mostrarSinStock || p.disponibilidad !== "SIN_STOCK");
}

async function listServicios(queryable, empresaId, includeInactive = false) {
  await ensureCatalogoSchema();
  const result = await queryable.query(
    `
    SELECT * FROM catalogo_servicio
    WHERE empresa_id = $1 AND ($2::boolean = true OR activo = true)
    ORDER BY orden ASC, nombre ASC, id ASC
    `,
    [toId(empresaId), includeInactive]
  );
  return result.rows.map(mapServicio);
}

async function buildPublicPayload(queryable, config) {
  const todos = await listProductosPublicos(queryable, { mostrarSinStock: config.mostrar_sin_stock });
  const productos = todos.filter((p) => !p.es_servicio);
  // Servicios: los cargados en el catalogo + los productos marcados como "Es servicio".
  const servicios = [
    ...(await listServicios(queryable, config.empresa_id, false)).map((s) => ({ ...s, clase: "servicio" })),
    ...todos.filter((p) => p.es_servicio).map((p) => ({
      id: p.id,
      clase: "producto",
      nombre: p.nombre,
      descripcion: p.descripcion,
      precio: p.precio > 0 ? p.precio : null,
      precio_texto: "",
      imagen_url: p.imagen
    }))
  ];

  if (!config.mostrar_precios) {
    productos.forEach((p) => { p.precio = null; });
    servicios.forEach((s) => { s.precio = null; });
  }

  const categoriasMap = new Map();
  productos.forEach((p) => {
    const key = p.categoria_id || 0;
    if (!categoriasMap.has(key)) {
      categoriasMap.set(key, { id: key, nombre: p.categoria_nombre, imagen: p.categoria_imagen, total: 0 });
    }
    categoriasMap.get(key).total += 1;
  });

  return {
    config: {
      slug: config.slug,
      nombre_publico: config.nombre_publico,
      mensaje: config.mensaje,
      whatsapp: config.whatsapp,
      direccion: config.direccion,
      horario: config.horario,
      color: config.color,
      mostrar_precios: config.mostrar_precios,
      logo: config.empresa_logo
        ? (config.empresa_logo.startsWith("/") ? config.empresa_logo : `/recursos/img/${config.empresa_logo}`)
        : ""
    },
    categorias: Array.from(categoriasMap.values()),
    productos,
    servicios,
    generado: new Date().toISOString()
  };
}

/**
 * Guarda un pedido o consulta del catalogo. Los precios se recalculan desde la base
 * (no se confia en lo que manda el navegador). NO toca el stock.
 */
async function crearPedido(queryable, config, payload = {}) {
  const tipo = TIPOS_PEDIDO.has(toText(payload.tipo).toUpperCase()) ? toText(payload.tipo).toUpperCase() : "PEDIDO";
  const nombre = toText(payload.nombre, "", 160);
  const telefono = toText(payload.telefono, "", 40);
  const nota = toText(payload.nota, "", 1000);

  if (!nombre) throw Object.assign(new Error("Escribí tu nombre"), { status: 400 });
  if (!telefono || telefono.replace(/\D/g, "").length < 6) {
    throw Object.assign(new Error("Escribí un teléfono válido para poder responderte"), { status: 400 });
  }

  const rawItems = Array.isArray(payload.items) ? payload.items.slice(0, 100) : [];
  const productoIds = [];
  const servicioIds = [];
  const cantidades = new Map();

  rawItems.forEach((item) => {
    const id = toId(item?.id);
    if (!id) return;
    const clase = item?.clase === "servicio" ? "servicio" : "producto";
    const cantidad = Math.min(9999, Math.max(1, Math.trunc(Number(item?.cantidad) || 1)));
    const key = `${clase}:${id}`;
    cantidades.set(key, (cantidades.get(key) || 0) + cantidad);
    if (clase === "servicio") servicioIds.push(id);
    else productoIds.push(id);
  });

  const items = [];

  if (productoIds.length) {
    const visibles = await listProductosPublicos(queryable, { mostrarSinStock: true });
    const porId = new Map(visibles.map((p) => [p.id, p]));
    [...new Set(productoIds)].forEach((id) => {
      const p = porId.get(id);
      if (!p) return;
      const cantidad = cantidades.get(`producto:${id}`) || 1;
      items.push({
        clase: "producto",
        id,
        nombre: p.nombre,
        categoria: p.categoria_nombre,
        cantidad,
        precio: p.precio,
        subtotal: Math.round(p.precio * cantidad * 100) / 100,
        disponibilidad: p.disponibilidad
      });
    });
  }

  if (servicioIds.length) {
    const servicios = await listServicios(queryable, config.empresa_id, false);
    const porId = new Map(servicios.map((s) => [s.id, s]));
    [...new Set(servicioIds)].forEach((id) => {
      const s = porId.get(id);
      if (!s) return;
      const cantidad = cantidades.get(`servicio:${id}`) || 1;
      const precio = s.precio == null ? 0 : s.precio;
      items.push({
        clase: "servicio",
        id,
        nombre: s.nombre,
        categoria: "Servicios",
        cantidad,
        precio,
        precio_texto: s.precio_texto,
        subtotal: Math.round(precio * cantidad * 100) / 100
      });
    });
  }

  if (!items.length && !nota) {
    throw Object.assign(new Error("Agregá al menos un producto o escribí tu consulta"), { status: 400 });
  }

  const total = items.reduce((acc, item) => acc + Number(item.subtotal || 0), 0);

  const result = await queryable.query(
    `
    INSERT INTO catalogo_pedido
      (empresa_id, tipo, cliente_nombre, cliente_telefono, cliente_nota, items, total_estimado)
    VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
    RETURNING *
    `,
    [config.empresa_id, tipo, nombre, telefono, nota || null, JSON.stringify(items), total]
  );

  return mapPedido(result.rows[0]);
}

function formatGs(value) {
  const amount = Number(value || 0);
  return `Gs ${amount.toLocaleString("es-PY", { maximumFractionDigits: 0 })}`;
}

/** Arma el texto que se manda por WhatsApp al negocio. */
function buildWhatsappText(config, pedido) {
  const lines = [];
  lines.push(pedido.tipo === "CONSULTA"
    ? `Hola ${config.nombre_publico}! Quiero consultar disponibilidad (consulta #${pedido.id}):`
    : `Hola ${config.nombre_publico}! Quiero hacer un pedido (pedido #${pedido.id}):`);
  lines.push("");
  pedido.items.forEach((item) => {
    const precio = config.mostrar_precios && item.precio > 0 ? ` - ${formatGs(item.subtotal)}` : "";
    lines.push(`• ${item.cantidad} x ${item.nombre}${precio}`);
  });
  if (pedido.items.length && config.mostrar_precios && pedido.total_estimado > 0) {
    lines.push("");
    lines.push(`Total estimado: ${formatGs(pedido.total_estimado)}`);
  }
  if (pedido.cliente_nota) {
    lines.push("");
    lines.push(`Nota: ${pedido.cliente_nota}`);
  }
  lines.push("");
  lines.push(`Nombre: ${pedido.cliente_nombre}`);
  lines.push(`Teléfono: ${pedido.cliente_telefono}`);
  return lines.join("\n");
}

function buildWhatsappUrl(config, pedido) {
  if (!config.whatsapp) return "";
  return `https://wa.me/${config.whatsapp}?text=${encodeURIComponent(buildWhatsappText(config, pedido))}`;
}

async function listPedidos(queryable, empresaId, options = {}) {
  await ensureCatalogoSchema();
  const estado = ESTADOS_PEDIDO.has(toText(options.estado).toUpperCase()) ? toText(options.estado).toUpperCase() : "";
  const limit = Math.max(1, Math.min(300, Number(options.limit) || 100));
  const result = await queryable.query(
    `
    SELECT * FROM catalogo_pedido
    WHERE empresa_id = $1 AND ($2::varchar = '' OR estado = $2::varchar)
    ORDER BY created_at DESC, id DESC
    LIMIT $3
    `,
    [toId(empresaId), estado, limit]
  );
  return result.rows.map(mapPedido);
}

async function contarPendientes(queryable, empresaId) {
  const result = await queryable.query(
    `SELECT COUNT(*)::int AS total FROM catalogo_pedido WHERE empresa_id = $1 AND estado = 'PENDIENTE'`,
    [toId(empresaId)]
  );
  return result.rows[0]?.total || 0;
}

async function actualizarPedido(queryable, empresaId, pedidoId, payload = {}) {
  const estado = toText(payload.estado).toUpperCase();
  if (!ESTADOS_PEDIDO.has(estado)) {
    throw Object.assign(new Error("Estado inválido"), { status: 400 });
  }
  const result = await queryable.query(
    `
    UPDATE catalogo_pedido SET
      estado = $3::varchar,
      observacion_interna = COALESCE($4::text, observacion_interna),
      atendido_at = CASE WHEN $3::varchar = 'PENDIENTE' THEN NULL ELSE COALESCE(atendido_at, NOW()) END
    WHERE empresa_id = $1 AND id = $2
    RETURNING *
    `,
    [
      toId(empresaId),
      toId(pedidoId),
      estado,
      payload.observacion_interna === undefined ? null : toText(payload.observacion_interna, "", 1000)
    ]
  );
  if (!result.rows.length) throw Object.assign(new Error("Pedido no encontrado"), { status: 404 });
  return mapPedido(result.rows[0]);
}

module.exports = {
  CATALOGO_UPLOAD_DIR,
  ensureCatalogoUploadDir,
  ensureCatalogoSchema,
  getOrCreateConfig,
  getConfigBySlug,
  getDefaultPublishedSlug,
  updateConfig,
  listServicios,
  buildPublicPayload,
  crearPedido,
  buildWhatsappUrl,
  listPedidos,
  contarPendientes,
  actualizarPedido,
  mapServicio,
  toId,
  toText,
  toBool,
  toMoneyOrNull,
  toOrder
};
