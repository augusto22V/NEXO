const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const sharp = require("sharp");
const PDFDocument = require("pdfkit");
const qr = require("qr-image");
const db = require("../db");
const authMiddleware = require("../Auth.middleware");
const {
  MENU_UPLOAD_DIR,
  ensureMenuUploadDir,
  ensureMenuDigitalSchema,
  getScopeFromReq,
  getOrCreateMenuConfig,
  getMenuConfigBySlug,
  getMenuConfigById,
  updateConfig,
  buildMenuPayload,
  buildAdminBootstrap,
  buildMenuPublicUrl,
  syncCategoryFromSource,
  syncItemFromSource,
  syncAllFromSources,
  toBool,
  toMoney,
  toOrder,
  normalizeColor,
  normalizeLayout,
  normalizeMenuState,
  toText,
  toUpperSafe
} = require("../services/menu_digital.service");

const router = express.Router();

ensureMenuUploadDir();

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, MENU_UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase() || ".tmp";
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  }
});

const upload = multer({ storage });

router.use("/admin", authMiddleware);

function sendError(res, status, message, error) {
  if (error) {
    console.error(message, error);
  }
  res.status(status).json({ error: message });
}

async function saveImageAsset(file, options = {}) {
  if (!file) return null;

  const width = Number(options.width || 1280);
  const height = Number(options.height || 1280);
  const fit = options.fit || "inside";
  const outputName = `${Date.now()}-${Math.round(Math.random() * 1e9)}.webp`;
  const outputPath = path.join(MENU_UPLOAD_DIR, outputName);

  try {
    await sharp(file.path)
      .resize({
        width,
        height,
        fit,
        withoutEnlargement: true
      })
      .webp({ quality: 82 })
      .toFile(outputPath);
  } finally {
    fs.unlink(file.path, () => {});
  }

  return `/uploads/menu_digital/${outputName}`;
}

async function getScopedConfig(client, req) {
  const scope = getScopeFromReq(req);
  return getOrCreateMenuConfig(client, scope);
}

function qrPngBuffer(text) {
  return qr.imageSync(text, {
    type: "png",
    ec_level: "M",
    margin: 2,
    size: 8
  });
}

async function writeQrResponse(res, publicUrl, format, filenameBase) {
  const normalized = String(format || "png").toLowerCase();

  if (normalized === "pdf") {
    const png = qrPngBuffer(publicUrl);
    const doc = new PDFDocument({
      size: [240, 320],
      margins: { top: 18, left: 18, right: 18, bottom: 18 }
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename=${filenameBase}.pdf`);
    doc.pipe(res);
    doc.fontSize(16).fillColor("#1f2937").text("Menu Digital", { align: "center" });
    doc.moveDown(0.5);
    doc.image(png, 42, 56, { width: 156, height: 156 });
    doc.moveDown(7.5);
    doc.fontSize(8).fillColor("#5b6472").text(publicUrl, {
      align: "center",
      width: 180
    });
    doc.end();
    return;
  }

  if (normalized === "jpg" || normalized === "jpeg") {
    const jpeg = await sharp(qrPngBuffer(publicUrl))
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 92 })
      .toBuffer();

    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Content-Disposition", `inline; filename=${filenameBase}.jpg`);
    res.end(jpeg);
    return;
  }

  const png = qrPngBuffer(publicUrl);
  res.setHeader("Content-Type", "image/png");
  res.setHeader("Content-Disposition", `inline; filename=${filenameBase}.png`);
  res.end(png);
}

router.get("/admin/bootstrap", async (req, res) => {
  try {
    await ensureMenuDigitalSchema();
    const bootstrap = await buildAdminBootstrap(db, req);
    res.json(bootstrap);
  } catch (error) {
    sendError(res, 500, "No se pudo cargar menu digital", error);
  }
});

router.post("/admin/sincronizar", async (req, res) => {
  const client = await db.connect();
  try {
    await ensureMenuDigitalSchema();
    await client.query("BEGIN");

    const config = await getScopedConfig(client, req);
    await syncAllFromSources(client, config.id);

    await client.query("COMMIT");
    const bootstrap = await buildAdminBootstrap(db, req);
    res.json(bootstrap);
  } catch (error) {
    await client.query("ROLLBACK");
    sendError(res, 500, "No se pudo sincronizar menu digital", error);
  } finally {
    client.release();
  }
});

router.put(
  "/admin/config",
  upload.fields([
    { name: "logo_personalizado", maxCount: 1 },
    { name: "banner", maxCount: 1 },
    { name: "fondo", maxCount: 1 }
  ]),
  async (req, res) => {
    const client = await db.connect();
    try {
      await ensureMenuDigitalSchema();
      await client.query("BEGIN");

      const config = await getScopedConfig(client, req);
      const files = req.files || {};

      const logoFile = Array.isArray(files.logo_personalizado) ? files.logo_personalizado[0] : null;
      const bannerFile = Array.isArray(files.banner) ? files.banner[0] : null;
      const fondoFile = Array.isArray(files.fondo) ? files.fondo[0] : null;

      const logoUrl = logoFile ? await saveImageAsset(logoFile, { width: 720, height: 720 }) : undefined;
      const bannerUrl = bannerFile ? await saveImageAsset(bannerFile, { width: 1800, height: 1100 }) : undefined;
      const fondoUrl = fondoFile ? await saveImageAsset(fondoFile, { width: 1900, height: 1600 }) : undefined;

      const updated = await updateConfig(client, config.id, {
        nombre_publico: req.body?.nombre_publico,
        estado: normalizeMenuState(req.body?.estado, config.estado),
        mensaje_principal: req.body?.mensaje_principal,
        mensaje_secundario: req.body?.mensaje_secundario,
        horario_atencion: req.body?.horario_atencion,
        datos_contacto: req.body?.datos_contacto,
        public_base_url: req.body?.public_base_url,
        color_principal: normalizeColor(req.body?.color_principal, config.color_principal),
        color_secundario: normalizeColor(req.body?.color_secundario, config.color_secundario),
        fondo_tipo: req.body?.fondo_tipo || config.fondo_tipo,
        fondo_valor: req.body?.fondo_valor ?? config.fondo_valor,
        fondo_imagen_url: req.body?.limpiar_fondo === "true" ? "" : (fondoUrl === undefined ? undefined : fondoUrl),
        banner_url: req.body?.limpiar_banner === "true" ? "" : (bannerUrl === undefined ? undefined : bannerUrl),
        logo_url: req.body?.limpiar_logo === "true" ? "" : (logoUrl === undefined ? undefined : logoUrl),
        usar_logo_empresa: req.body?.usar_logo_empresa,
        layout_categorias: normalizeLayout(req.body?.layout_categorias, config.layout_categorias)
      });

      await client.query("COMMIT");
      res.json(updated);
    } catch (error) {
      await client.query("ROLLBACK");
      sendError(res, 500, "No se pudo guardar configuracion del menu digital", error);
    } finally {
      client.release();
    }
  }
);

router.post("/admin/categorias", upload.single("imagen"), async (req, res) => {
  const client = await db.connect();
  try {
    await ensureMenuDigitalSchema();
    await client.query("BEGIN");

    const config = await getScopedConfig(client, req);
    const imagenUrl = req.file
      ? await saveImageAsset(req.file, { width: 1200, height: 900 })
      : null;

    const result = await client.query(
      `
      INSERT INTO menu_digital_categoria (
        menu_id, nombre, descripcion, color, icono, imagen_url, orden,
        activo, visible_publico, agotado, origen_tipo, sincronizado
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, 'manual', false
      )
      RETURNING *
      `,
      [
        config.id,
        toUpperSafe(req.body?.nombre, "NUEVA CATEGORIA"),
        toText(req.body?.descripcion),
        normalizeColor(req.body?.color, "#147696"),
        toText(req.body?.icono, "fa-utensils"),
        imagenUrl,
        toOrder(req.body?.orden, 0),
        toBool(req.body?.activo, true),
        toBool(req.body?.visible_publico, true),
        toBool(req.body?.agotado, false)
      ]
    );

    await client.query("COMMIT");
    res.json(result.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    sendError(res, 500, "No se pudo crear categoria del menu digital", error);
  } finally {
    client.release();
  }
});

router.put("/admin/categorias/orden", async (req, res) => {
  const client = await db.connect();
  try {
    await ensureMenuDigitalSchema();
    await client.query("BEGIN");

    const config = await getScopedConfig(client, req);
    const orden = Array.isArray(req.body) ? req.body : [];

    for (const item of orden) {
      const id = Number(item?.id || 0);
      if (!id) continue;
      await client.query(
        `
        UPDATE menu_digital_categoria
        SET orden = $1, updated_at = NOW()
        WHERE menu_id = $2 AND id = $3
        `,
        [toOrder(item?.orden, 0), config.id, id]
      );
    }

    await client.query("COMMIT");
    res.json({ ok: true });
  } catch (error) {
    await client.query("ROLLBACK");
    sendError(res, 500, "No se pudo guardar orden de categorias", error);
  } finally {
    client.release();
  }
});

router.put("/admin/categorias/:id", upload.single("imagen"), async (req, res) => {
  const client = await db.connect();
  try {
    await ensureMenuDigitalSchema();
    await client.query("BEGIN");

    const config = await getScopedConfig(client, req);
    const id = Number(req.params.id || 0);
    if (!id) {
      await client.query("ROLLBACK");
      return sendError(res, 400, "ID de categoria invalido");
    }

    const actual = await client.query(
      `SELECT * FROM menu_digital_categoria WHERE menu_id = $1 AND id = $2 LIMIT 1`,
      [config.id, id]
    );

    if (!actual.rows.length) {
      await client.query("ROLLBACK");
      return sendError(res, 404, "Categoria del menu digital no encontrada");
    }

    const imagenUrl = req.file
      ? await saveImageAsset(req.file, { width: 1200, height: 900 })
      : (req.body?.limpiar_imagen === "true" ? "" : actual.rows[0].imagen_url);

    const result = await client.query(
      `
      UPDATE menu_digital_categoria
      SET
        nombre = $3,
        descripcion = $4,
        color = $5,
        icono = $6,
        imagen_url = $7,
        orden = $8,
        activo = $9,
        visible_publico = $10,
        agotado = $11,
        updated_at = NOW()
      WHERE menu_id = $1 AND id = $2
      RETURNING *
      `,
      [
        config.id,
        id,
        toUpperSafe(req.body?.nombre, actual.rows[0].nombre),
        toText(req.body?.descripcion, actual.rows[0].descripcion || ""),
        normalizeColor(req.body?.color, actual.rows[0].color || "#147696"),
        toText(req.body?.icono, actual.rows[0].icono || "fa-utensils"),
        imagenUrl,
        toOrder(req.body?.orden, Number(actual.rows[0].orden || 0)),
        toBool(req.body?.activo, actual.rows[0].activo === true),
        toBool(req.body?.visible_publico, actual.rows[0].visible_publico === true),
        toBool(req.body?.agotado, actual.rows[0].agotado === true)
      ]
    );

    await client.query("COMMIT");
    res.json(result.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    sendError(res, 500, "No se pudo actualizar categoria del menu digital", error);
  } finally {
    client.release();
  }
});

router.delete("/admin/categorias/:id", async (req, res) => {
  const client = await db.connect();
  try {
    await ensureMenuDigitalSchema();
    await client.query("BEGIN");

    const config = await getScopedConfig(client, req);
    const id = Number(req.params.id || 0);

    await client.query(
      `DELETE FROM menu_digital_categoria WHERE menu_id = $1 AND id = $2`,
      [config.id, id]
    );

    await client.query("COMMIT");
    res.json({ ok: true });
  } catch (error) {
    await client.query("ROLLBACK");
    sendError(res, 500, "No se pudo eliminar categoria del menu digital", error);
  } finally {
    client.release();
  }
});

router.post("/admin/items", upload.single("imagen"), async (req, res) => {
  const client = await db.connect();
  try {
    await ensureMenuDigitalSchema();
    await client.query("BEGIN");

    const config = await getScopedConfig(client, req);
    const imagenUrl = req.file
      ? await saveImageAsset(req.file, { width: 1400, height: 1000 })
      : null;

    const result = await client.query(
      `
      INSERT INTO menu_digital_item (
        menu_id, categoria_id, nombre, descripcion, precio, imagen_url,
        disponible, visible_publico, destacado, agotado, orden,
        origen_tipo, sincronizado
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11,
        'manual', false
      )
      RETURNING *
      `,
      [
        config.id,
        toText(req.body?.categoria_id) ? Number(req.body.categoria_id) : null,
        toUpperSafe(req.body?.nombre, "NUEVO ITEM"),
        toText(req.body?.descripcion),
        toMoney(req.body?.precio, 0),
        imagenUrl,
        toBool(req.body?.disponible, true),
        toBool(req.body?.visible_publico, true),
        toBool(req.body?.destacado, false),
        toBool(req.body?.agotado, false),
        toOrder(req.body?.orden, 0)
      ]
    );

    await client.query("COMMIT");
    res.json(result.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    sendError(res, 500, "No se pudo crear item del menu digital", error);
  } finally {
    client.release();
  }
});

router.put("/admin/items/orden", async (req, res) => {
  const client = await db.connect();
  try {
    await ensureMenuDigitalSchema();
    await client.query("BEGIN");

    const config = await getScopedConfig(client, req);
    const orden = Array.isArray(req.body) ? req.body : [];

    for (const item of orden) {
      const id = Number(item?.id || 0);
      if (!id) continue;
      await client.query(
        `
        UPDATE menu_digital_item
        SET orden = $1, updated_at = NOW()
        WHERE menu_id = $2 AND id = $3
        `,
        [toOrder(item?.orden, 0), config.id, id]
      );
    }

    await client.query("COMMIT");
    res.json({ ok: true });
  } catch (error) {
    await client.query("ROLLBACK");
    sendError(res, 500, "No se pudo guardar orden de items", error);
  } finally {
    client.release();
  }
});

router.put("/admin/items/:id", upload.single("imagen"), async (req, res) => {
  const client = await db.connect();
  try {
    await ensureMenuDigitalSchema();
    await client.query("BEGIN");

    const config = await getScopedConfig(client, req);
    const id = Number(req.params.id || 0);
    if (!id) {
      await client.query("ROLLBACK");
      return sendError(res, 400, "ID de item invalido");
    }

    const actual = await client.query(
      `SELECT * FROM menu_digital_item WHERE menu_id = $1 AND id = $2 LIMIT 1`,
      [config.id, id]
    );

    if (!actual.rows.length) {
      await client.query("ROLLBACK");
      return sendError(res, 404, "Item del menu digital no encontrado");
    }

    const imagenUrl = req.file
      ? await saveImageAsset(req.file, { width: 1400, height: 1000 })
      : (req.body?.limpiar_imagen === "true" ? "" : actual.rows[0].imagen_url);

    const result = await client.query(
      `
      UPDATE menu_digital_item
      SET
        categoria_id = $3,
        nombre = $4,
        descripcion = $5,
        precio = $6,
        imagen_url = $7,
        disponible = $8,
        visible_publico = $9,
        destacado = $10,
        agotado = $11,
        orden = $12,
        updated_at = NOW()
      WHERE menu_id = $1 AND id = $2
      RETURNING *
      `,
      [
        config.id,
        id,
        toText(req.body?.categoria_id) ? Number(req.body.categoria_id) : null,
        toUpperSafe(req.body?.nombre, actual.rows[0].nombre),
        toText(req.body?.descripcion, actual.rows[0].descripcion || ""),
        toMoney(req.body?.precio, actual.rows[0].precio || 0),
        imagenUrl,
        toBool(req.body?.disponible, actual.rows[0].disponible === true),
        toBool(req.body?.visible_publico, actual.rows[0].visible_publico === true),
        toBool(req.body?.destacado, actual.rows[0].destacado === true),
        toBool(req.body?.agotado, actual.rows[0].agotado === true),
        toOrder(req.body?.orden, Number(actual.rows[0].orden || 0))
      ]
    );

    await client.query("COMMIT");
    res.json(result.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    sendError(res, 500, "No se pudo actualizar item del menu digital", error);
  } finally {
    client.release();
  }
});

router.delete("/admin/items/:id", async (req, res) => {
  const client = await db.connect();
  try {
    await ensureMenuDigitalSchema();
    await client.query("BEGIN");

    const config = await getScopedConfig(client, req);
    const id = Number(req.params.id || 0);

    await client.query(
      `DELETE FROM menu_digital_item WHERE menu_id = $1 AND id = $2`,
      [config.id, id]
    );

    await client.query("COMMIT");
    res.json({ ok: true });
  } catch (error) {
    await client.query("ROLLBACK");
    sendError(res, 500, "No se pudo eliminar item del menu digital", error);
  } finally {
    client.release();
  }
});

router.get("/admin/qr.:format", async (req, res) => {
  try {
    await ensureMenuDigitalSchema();
    const config = await getScopedConfig(db, req);
    const publicUrl = buildMenuPublicUrl(req, config.slug, { publicBaseUrl: config.public_base_url });
    await writeQrResponse(res, publicUrl, req.params.format, `menu-digital-${config.slug}`);
  } catch (error) {
    sendError(res, 500, "No se pudo generar QR del menu digital", error);
  }
});

router.get("/publico/:slug", async (req, res) => {
  try {
    await ensureMenuDigitalSchema();
    const config = await getMenuConfigBySlug(db, req.params.slug);
    await syncAllFromSources(db, config.id);
    const canPreviewDraft =
      Number(req?.usuario?.empresa_id || 0) > 0 &&
      Number(req.usuario.empresa_id) === Number(config.empresa_id || 0);

    const payload = await buildMenuPayload(db, config.id, {
      includeHidden: false,
      allowDraftPreview: canPreviewDraft
    });
    res.json(payload);
  } catch (error) {
    sendError(res, 404, "Menu digital no disponible", error);
  }
});

router.get("/publico/:slug/qr.:format", async (req, res) => {
  try {
    await ensureMenuDigitalSchema();
    const config = await getMenuConfigBySlug(db, req.params.slug);
    if (config.estado !== "PUBLICADO") {
      return sendError(res, 404, "Menu digital no disponible");
    }

    const publicUrl = buildMenuPublicUrl(req, config.slug, { publicBaseUrl: config.public_base_url });
    await writeQrResponse(res, publicUrl, req.params.format, `menu-digital-${config.slug}`);
  } catch (error) {
    sendError(res, 404, "No se pudo generar QR publico", error);
  }
});

router.post("/admin/sync/categoria/:categoriaId", async (req, res) => {
  const client = await db.connect();
  try {
    await ensureMenuDigitalSchema();
    await client.query("BEGIN");
    const config = await getScopedConfig(client, req);
    const categoria = await syncCategoryFromSource(client, config.id, req.params.categoriaId);
    await client.query("COMMIT");
    res.json(categoria || { ok: true });
  } catch (error) {
    await client.query("ROLLBACK");
    sendError(res, 500, "No se pudo sincronizar categoria del menu digital", error);
  } finally {
    client.release();
  }
});

router.post("/admin/sync/item/:productoId", async (req, res) => {
  const client = await db.connect();
  try {
    await ensureMenuDigitalSchema();
    await client.query("BEGIN");
    const config = await getScopedConfig(client, req);
    const item = await syncItemFromSource(client, config.id, req.params.productoId);
    await client.query("COMMIT");
    res.json(item || { ok: true });
  } catch (error) {
    await client.query("ROLLBACK");
    sendError(res, 500, "No se pudo sincronizar item del menu digital", error);
  } finally {
    client.release();
  }
});

module.exports = router;
