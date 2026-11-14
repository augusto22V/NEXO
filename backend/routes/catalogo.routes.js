const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const sharp = require("sharp");
const qr = require("qr-image");
const db = require("../db");
const authMiddleware = require("../Auth.middleware");
const { guardarArchivoEnBase } = require("../services/archivos_db.service");
const {
  CATALOGO_UPLOAD_DIR,
  ensureCatalogoUploadDir,
  ensureCatalogoSchema,
  getOrCreateConfig,
  getConfigBySlug,
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
} = require("../services/catalogo.service");

const router = express.Router();

ensureCatalogoUploadDir();

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, CATALOGO_UPLOAD_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || "").toLowerCase() || ".tmp";
      cb(null, `tmp-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
    }
  }),
  limits: { fileSize: 10 * 1024 * 1024 }
});

function sendError(res, error, fallbackMessage, fallbackStatus = 500) {
  const status = Number(error?.status) || fallbackStatus;
  if (status >= 500) console.error(fallbackMessage, error);
  res.status(status).json({ error: status >= 500 ? fallbackMessage : (error?.message || fallbackMessage) });
}

function empresaDe(req) {
  return toId(req?.usuario?.empresa_id);
}

function publicOrigin(req) {
  const configured = String(process.env.PUBLIC_BASE_URL || process.env.APP_PUBLIC_URL || "").trim().replace(/\/+$/, "");
  if (configured) return configured;
  const proto = String(req.headers["x-forwarded-proto"] || req.protocol || "http").split(",")[0].trim();
  const host = String(req.headers["x-forwarded-host"] || req.get("host") || "localhost:3000").split(",")[0].trim();
  return `${proto}://${host}`;
}

function publicUrl(req, slug) {
  return `${publicOrigin(req)}/catalogo/${encodeURIComponent(slug)}`;
}

async function guardarImagen(file) {
  if (!file) return null;
  const nombre = `${Date.now()}-${Math.round(Math.random() * 1e9)}.webp`;
  const destino = path.join(CATALOGO_UPLOAD_DIR, nombre);
  try {
    await sharp(file.path)
      .rotate()
      .resize({ width: 1000, height: 1000, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 })
      .toFile(destino);
  } finally {
    fs.unlink(file.path, () => {});
  }
  const rutaPublica = `/uploads/catalogo/${nombre}`;
  await guardarArchivoEnBase(rutaPublica, destino);
  return rutaPublica;
}

/* ============ Limite simple anti-spam para pedidos publicos ============ */
const intentosPorIp = new Map();
const VENTANA_MS = 10 * 60 * 1000;
const MAX_POR_VENTANA = 8;

function superaLimite(ip) {
  const ahora = Date.now();
  const lista = (intentosPorIp.get(ip) || []).filter((t) => ahora - t < VENTANA_MS);
  if (lista.length >= MAX_POR_VENTANA) {
    intentosPorIp.set(ip, lista);
    return true;
  }
  lista.push(ahora);
  intentosPorIp.set(ip, lista);
  if (intentosPorIp.size > 5000) {
    for (const [key, tiempos] of intentosPorIp) {
      if (!tiempos.some((t) => ahora - t < VENTANA_MS)) intentosPorIp.delete(key);
    }
  }
  return false;
}

/* ===================== PUBLICO (sin login) ===================== */

router.get("/publico/:slug", async (req, res) => {
  try {
    const config = await getConfigBySlug(db, req.params.slug);
    const esDueno = config && empresaDe(req) === config.empresa_id;
    if (!config || (!config.publicado && !esDueno)) {
      return res.status(404).json({ error: "Este catálogo no está disponible por ahora." });
    }
    res.json(await buildPublicPayload(db, config));
  } catch (error) {
    sendError(res, error, "No se pudo cargar el catálogo");
  }
});

router.post("/publico/:slug/pedido", async (req, res) => {
  try {
    const config = await getConfigBySlug(db, req.params.slug);
    if (!config || !config.publicado) {
      return res.status(404).json({ error: "Este catálogo no está disponible por ahora." });
    }

    // Campo trampa: si un robot lo completa, respondemos ok sin guardar.
    if (toText(req.body?.sitio_web)) {
      return res.json({ ok: true, id: 0, whatsapp_url: "" });
    }

    const ip = String(req.headers["x-forwarded-for"] || req.ip || "").split(",")[0].trim();
    if (superaLimite(ip)) {
      return res.status(429).json({ error: "Recibimos varios pedidos seguidos. Esperá unos minutos o escribinos por WhatsApp." });
    }

    const pedido = await crearPedido(db, config, req.body || {});
    res.json({
      ok: true,
      id: pedido.id,
      tipo: pedido.tipo,
      total_estimado: config.mostrar_precios ? pedido.total_estimado : null,
      whatsapp_url: buildWhatsappUrl(config, pedido)
    });
  } catch (error) {
    sendError(res, error, "No se pudo enviar el pedido");
  }
});

/* ===================== ADMIN (con login) ===================== */

router.use("/admin", authMiddleware);

router.get("/admin", async (req, res) => {
  try {
    const config = await getOrCreateConfig(db, empresaDe(req));
    const [servicios, pendientes] = await Promise.all([
      listServicios(db, config.empresa_id, true),
      contarPendientes(db, config.empresa_id)
    ]);
    res.json({
      config,
      servicios,
      pendientes,
      enlace: publicUrl(req, config.slug),
      qr_url: "/api/catalogo/admin/qr.png"
    });
  } catch (error) {
    sendError(res, error, "No se pudo cargar la configuración del catálogo");
  }
});

router.put("/admin/config", async (req, res) => {
  try {
    const config = await updateConfig(db, empresaDe(req), req.body || {});
    res.json({ config, enlace: publicUrl(req, config.slug) });
  } catch (error) {
    sendError(res, error, "No se pudo guardar la configuración del catálogo");
  }
});

router.get("/admin/qr.png", async (req, res) => {
  try {
    const config = await getOrCreateConfig(db, empresaDe(req));
    const png = qr.imageSync(publicUrl(req, config.slug), { type: "png", ec_level: "M", margin: 2, size: 8 });
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Content-Disposition", `inline; filename=catalogo-${config.slug}.png`);
    res.end(png);
  } catch (error) {
    sendError(res, error, "No se pudo generar el QR");
  }
});

/* ---- Servicios ---- */

router.get("/admin/servicios", async (req, res) => {
  try {
    res.json(await listServicios(db, empresaDe(req), true));
  } catch (error) {
    sendError(res, error, "No se pudieron cargar los servicios");
  }
});

function datosServicio(body = {}) {
  return {
    nombre: toText(body.nombre, "", 180),
    descripcion: toText(body.descripcion, "", 1500),
    precio: toMoneyOrNull(body.precio),
    precio_texto: toText(body.precio_texto, "", 80),
    orden: toOrder(body.orden, 0),
    activo: toBool(body.activo, true)
  };
}

router.post("/admin/servicios", upload.single("imagen"), async (req, res) => {
  try {
    await ensureCatalogoSchema();
    const empresaId = empresaDe(req);
    if (!empresaId) return res.status(400).json({ error: "Empresa no identificada" });
    const datos = datosServicio(req.body);
    if (!datos.nombre) return res.status(400).json({ error: "El servicio necesita un nombre" });
    const imagen = await guardarImagen(req.file);

    const result = await db.query(
      `
      INSERT INTO catalogo_servicio (empresa_id, nombre, descripcion, precio, precio_texto, imagen_url, orden, activo)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
      `,
      [empresaId, datos.nombre, datos.descripcion || null, datos.precio, datos.precio_texto || null, imagen, datos.orden, datos.activo]
    );
    res.json(mapServicio(result.rows[0]));
  } catch (error) {
    sendError(res, error, "No se pudo crear el servicio");
  }
});

router.put("/admin/servicios/:id", upload.single("imagen"), async (req, res) => {
  try {
    await ensureCatalogoSchema();
    const empresaId = empresaDe(req);
    const id = toId(req.params.id);
    const actual = await db.query(
      `SELECT * FROM catalogo_servicio WHERE empresa_id = $1 AND id = $2 LIMIT 1`,
      [empresaId, id]
    );
    if (!actual.rows.length) return res.status(404).json({ error: "Servicio no encontrado" });

    const datos = datosServicio(req.body);
    if (!datos.nombre) return res.status(400).json({ error: "El servicio necesita un nombre" });

    let imagen = actual.rows[0].imagen_url;
    if (req.file) imagen = await guardarImagen(req.file);
    else if (toBool(req.body?.quitar_imagen, false)) imagen = null;

    const result = await db.query(
      `
      UPDATE catalogo_servicio SET
        nombre = $3, descripcion = $4, precio = $5, precio_texto = $6,
        imagen_url = $7, orden = $8, activo = $9, updated_at = NOW()
      WHERE empresa_id = $1 AND id = $2
      RETURNING *
      `,
      [empresaId, id, datos.nombre, datos.descripcion || null, datos.precio, datos.precio_texto || null, imagen, datos.orden, datos.activo]
    );
    res.json(mapServicio(result.rows[0]));
  } catch (error) {
    sendError(res, error, "No se pudo guardar el servicio");
  }
});

router.delete("/admin/servicios/:id", async (req, res) => {
  try {
    await ensureCatalogoSchema();
    await db.query(
      `DELETE FROM catalogo_servicio WHERE empresa_id = $1 AND id = $2`,
      [empresaDe(req), toId(req.params.id)]
    );
    res.json({ ok: true });
  } catch (error) {
    sendError(res, error, "No se pudo eliminar el servicio");
  }
});

/* ---- Pedidos y consultas recibidos ---- */

router.get("/admin/pedidos", async (req, res) => {
  try {
    const empresaId = empresaDe(req);
    const [pedidos, pendientes] = await Promise.all([
      listPedidos(db, empresaId, { estado: req.query.estado, limit: req.query.limit }),
      contarPendientes(db, empresaId)
    ]);
    res.json({ pedidos, pendientes });
  } catch (error) {
    sendError(res, error, "No se pudieron cargar los pedidos");
  }
});

router.put("/admin/pedidos/:id", async (req, res) => {
  try {
    await ensureCatalogoSchema();
    res.json(await actualizarPedido(db, empresaDe(req), req.params.id, req.body || {}));
  } catch (error) {
    sendError(res, error, "No se pudo actualizar el pedido");
  }
});

module.exports = router;
