const express = require('express');
const router = express.Router();
const pool = require('../db');
const authMiddleware = require("../Auth.middleware");
const multer = require('multer');
const path = require('path');
const fs = require("fs");
const sharp = require("sharp");
const productosConsultaService = require("../services/productos.consulta.service");
const { ensureComisionSchema } = require("../services/comision.service");
const { ensureMonedaSchema } = require("../services/moneda.schema.service");
const {
  ensureMenuDigitalSchema,
  getScopeFromReq,
  getOrCreateMenuConfig,
  syncItemFromSource
} = require("../services/menu_digital.service");
const { POS_SIN_COCINA } = require("../config/pos.mode");

/* ================= MULTER ================= */
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../uploads/productos'));
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const safeName = Date.now() + '-' + Math.round(Math.random() * 1e9) + ext;
    cb(null, safeName);
  }
});

const upload = multer({ storage });

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

async function syncProductoMenuDigital(req, productoId) {
  const id = Number(productoId || 0);
  if (!id) return;

  const scope = getScopeFromReq(req);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const config = await getOrCreateMenuConfig(client, scope);
    await syncItemFromSource(client, config.id, id);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("SYNC PRODUCTO MENU DIGITAL:", error);
  } finally {
    client.release();
  }
}

/* ================= POS - BUSQUEDA GLOBAL ================= */
router.get('/pos/buscar', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.json([]);

  try {
    await ensureComisionSchema();
    const result = await pool.query(`
      SELECT
        p.id,
        p.nombre,
        p.imagen,
        p.efectivacion_directa,
        p.no_control_stock,
        p.permite_multi_sabor,
        p.max_sabores,
        p.destino_impresion,
        p.facturacion_directa,
        p.es_insumo,
        p.es_servicio,
        p.codigo_barra,
        COALESCE(pp.precio_venta, 0) AS precio
      FROM producto p
      LEFT JOIN producto_precio pp
        ON pp.producto_id = p.id
        AND pp.activo = true
      WHERE p.activo = true
        AND (
          p.nombre ILIKE $1
          OR p.codigo_barra ILIKE $1
        )
      ORDER BY p.nombre ASC
      LIMIT 80
    `, [`%${q}%`]);

    const rows = POS_SIN_COCINA
      ? result.rows.map((r) => ({ ...r, destino_impresion: null }))
      : result.rows;

    res.json(rows);
  } catch (error) {
    console.error('ERROR BUSCAR GLOBAL POS', error);
    res.status(500).json({ error: error.message });
  }
});

/* ================= POS - PRODUCTOS POR CATEGORIA ================= */
router.get('/pos/:categoria_id', async (req, res) => {
  const categoria_id = Number(req.params.categoria_id);

  if (!categoria_id) {
    return res.status(400).json({ error: 'Categoria invalida' });
  }

  try {
    await ensureComisionSchema();
    const result = await pool.query(`
     SELECT
    p.id,
    p.nombre,
    p.imagen,
    p.efectivacion_directa,
    p.no_control_stock,
    p.permite_multi_sabor,
    p.max_sabores,
    p.destino_impresion,
    p.facturacion_directa,
    p.es_insumo,
    p.es_servicio,
    COALESCE(pp.precio_venta, 0) AS precio
      FROM producto p
      LEFT JOIN producto_precio pp
        ON pp.producto_id = p.id
        AND pp.activo = true
      WHERE p.categoria_id = $1
        AND p.activo = true
      ORDER BY p.orden_pos ASC, p.nombre ASC
    `, [categoria_id]);

    const rows = POS_SIN_COCINA
      ? result.rows.map((r) => ({
          ...r,
          destino_impresion: null
        }))
      : result.rows;

    res.json(rows);

  } catch (error) {
    console.error('ERROR PRODUCTOS POS', error);
    res.status(500).json({ error: error.message });
  }
});

/* ================= VentaMedio - PRODUCTOS POR CATEGORIA ================= */
router.get('/venta-medio/:categoria_id', async (req, res) => {
  const categoria_id = Number(req.params.categoria_id || 0);

  if (!categoria_id) {
    return res.status(400).json({ error: "Categoria invalida" });
  }

  try {
    await ensureComisionSchema();
    const result = await pool.query(`
      SELECT
        p.id,
        p.nombre,
        p.imagen,
        p.stock,
        p.codigo_barra,
        p.categoria_id,
        p.efectivacion_directa,
        p.no_control_stock,
        p.permite_multi_sabor,
        p.max_sabores,
        p.destino_impresion,
        p.facturacion_directa,
        p.es_insumo,
        p.es_servicio,
        p.orden_venta_medio,
        p.mostrar_venta_medio,
        COALESCE(pp.precio_venta, 0) AS precio
      FROM producto p
      JOIN categoria c ON c.id = p.categoria_id
      LEFT JOIN producto_precio pp
        ON pp.producto_id = p.id
       AND pp.activo = true
      WHERE p.categoria_id = $1
        AND p.activo = true
        AND c.activo = true
        AND c.mostrar_venta_medio = true
        AND p.mostrar_venta_medio = true
        AND COALESCE(p.es_insumo, false) = false
      ORDER BY p.orden_venta_medio ASC, p.nombre ASC
    `, [categoria_id]);

    res.json(result.rows);
  } catch (error) {
    console.error("ERROR PRODUCTOS VENTA MEDIO", error);
    res.status(500).json({ error: error.message });
  }
});

/* ================= VentaMedio - BUSQUEDA PRODUCTOS ================= */
router.get('/venta-medio', async (req, res) => {
  try {
    await ensureComisionSchema();

    const limit = Math.max(1, Math.min(100, Number(req.query.limit || 30)));
    const busqueda = String(req.query.buscar || "").trim();
    const busquedaLike = `%${busqueda}%`;
    const categoriaId = Number(req.query.categoria_id || 0) || null;

    const result = await pool.query(`
      SELECT
        p.id,
        p.nombre,
        p.imagen,
        p.stock,
        p.codigo_barra,
        p.categoria_id,
        p.no_control_stock,
        p.es_insumo,
        p.es_servicio,
        p.orden_venta_medio,
        p.mostrar_venta_medio,
        COALESCE(pp.precio_venta, 0) AS precio
      FROM producto p
      JOIN categoria c ON c.id = p.categoria_id
      LEFT JOIN producto_precio pp
        ON pp.producto_id = p.id
       AND pp.activo = true
      WHERE p.activo = true
        AND c.activo = true
        AND COALESCE(p.es_insumo, false) = false
        AND (
          $2 = ''
          OR LOWER(p.nombre) LIKE LOWER($3)
          OR CAST(p.id AS TEXT) = $2
          OR CAST(p.id AS TEXT) LIKE $3
          OR COALESCE(p.codigo_barra, '') LIKE $3
        )
        AND ($4::int IS NULL OR p.categoria_id = $4)
      ORDER BY
        CASE
          WHEN $2 <> '' AND CAST(p.id AS TEXT) = $2 THEN 0
          WHEN $2 <> '' AND COALESCE(p.codigo_barra, '') = $2 THEN 1
          WHEN $2 <> '' AND LOWER(p.nombre) = LOWER($2) THEN 2
          ELSE 3
        END,
        p.orden_venta_medio ASC,
        p.nombre ASC
      LIMIT $1
    `, [limit, busqueda, busquedaLike, categoriaId]);

    res.json(result.rows);
  } catch (error) {
    console.error("ERROR BUSQUEDA PRODUCTOS VENTA MEDIO:", error);
    res.status(500).json({ error: error.message });
  }
});

/* ================= SABORES ================= */
router.get('/sabores', async (req, res) => {
  try {
    await ensureComisionSchema();

    const excludeId = req.query.exclude;
    const categoria = req.query.categoria;

    const result = await pool.query(`
      SELECT
        p.id,
        p.nombre,
        p.imagen,
        p.es_insumo,
        p.es_servicio,
        COALESCE(pp.precio_venta, 0) AS precio
      FROM producto p
      LEFT JOIN producto_precio pp
        ON pp.producto_id = p.id
        AND pp.activo = true
      WHERE p.activo = true
      AND p.permite_multi_sabor = true
      AND ($1::int IS NULL OR p.id <> $1)
      AND ($2::int IS NULL OR p.categoria_id = $2)
      ORDER BY p.nombre
    `, [
      excludeId || null,
      categoria || null
    ]);

    res.json(result.rows);

  } catch (error) {
    console.error("ERROR SABORES:", error);
    res.status(500).json({ error: error.message });
  }
});

/* ================= CONSULTA PRODUCTOS ================= */
async function handleConsultaProductos(req, res) {
  try {
    const query = { ...(req.query || {}) };
    const empresaIdUsuario = Number(req?.usuario?.empresa_id || 0);
    if (empresaIdUsuario > 0) {
      query.empresa_base_id = String(empresaIdUsuario);
    }
    if (!query.empresa_id) {
      if (empresaIdUsuario > 0) query.empresa_id = String(empresaIdUsuario);
    }
    const data = await productosConsultaService.consultarProductosAvanzado(query);
    res.json(data);
  } catch (error) {
    console.error('ERROR CONSULTA PRODUCTOS:', error);
    res.status(500).json({ error: error.message || 'No se pudo consultar productos' });
  }
}

async function handleConsultaProductoDetalle(req, res) {
  try {
    const empresaId = Number(req.query.empresa_id || req.usuario?.empresa_id || 0) || null;
    const data = await productosConsultaService.consultarDetalleProducto(
      req.params.productoId,
      empresaId
    );
    res.json(data);
  } catch (error) {
    console.error("ERROR DETALLE CONSULTA PRODUCTO:", error);
    res.status(500).json({ error: error.message || "No se pudo consultar detalle de producto" });
  }
}

router.get('/consulta', handleConsultaProductos);
router.get('/consulta/avanzada', handleConsultaProductos);
router.get('/consulta/detalle/:productoId', handleConsultaProductoDetalle);

/* ================= GET PRODUCTOS ================= */
router.get('/', async (req, res) => {
  try {
    await ensureComisionSchema();
    await ensureMonedaSchema();
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 30;
    const offset = (page - 1) * limit;

    const busqueda = String(req.query.buscar || "").trim();
    const busquedaLike = `%${busqueda}%`;

    const categoriaId = Number(req.query.categoria_id || 0) || null;
    const destinoRaw = String(req.query.destino || "").trim();
    const destino = destinoRaw ? `%${destinoRaw}%` : null;

    const esInsumoRaw = req.query.es_insumo;
    const esInsumo = esInsumoRaw === undefined || esInsumoRaw === ""
      ? null
      : String(esInsumoRaw).toLowerCase() === "true";
    const monedaRaw = Number(req.query.moneda_id || 0);
    const monedaId = monedaRaw === 1 || monedaRaw === 2 || monedaRaw === 3
      ? monedaRaw
      : null;

    // ORDEN DINAMICO — campo y dirección
    const orden = req.query.orden === 'asc' ? 'ASC' : 'DESC';
    const CAMPOS_ORDEN_VALIDOS = {
      id:     'p.id',
      nombre: 'p.nombre',
      precio: 'COALESCE(pp.precio_venta, 0)',
      stock:  'p.stock'
    };
    const campoRaw  = String(req.query.campo || 'id').toLowerCase();
    const orderExpr = CAMPOS_ORDEN_VALIDOS[campoRaw] || 'p.id';

    const result = await pool.query(`
      SELECT
        p.id,
        p.nombre,
        p.descripcion,
        p.imagen,
        p.stock,
        p.iva_tipo,
        p.categoria_id,
        p.efectivacion_directa,
        p.no_control_stock,
        p.permite_multi_sabor,
        p.max_sabores,
        p.unidad_medida,
        p.tiempo_preparacion,
        p.codigo_barra,
        p.destino_impresion,
        p.orden_venta_medio,
        p.mostrar_venta_medio,
        p.es_insumo,
        p.es_servicio,
        pp.precio_compra,
        COALESCE(pp.precio_compra_origen, pp.precio_compra, 0) AS precio_compra_origen,
        COALESCE(pp.precio_compra_moneda_id, 1) AS precio_compra_moneda_id,
        pp.precio_minimo,
        COALESCE(pp.precio_venta, 0) AS precio_venta,
        COALESCE(pp.precio_venta, 0) AS precio_mayorista,
        pp.costo_transporte,
        p.facturacion_directa,
        COALESCE(pp.precio_venta, 0) AS precio
      FROM producto p
      LEFT JOIN producto_precio pp
        ON pp.producto_id = p.id
        AND pp.activo = true
      WHERE p.activo = true
      AND (
        $3 = ''
        OR LOWER(p.nombre) LIKE LOWER($4)
        OR CAST(p.id AS TEXT) = $3
        OR COALESCE(p.codigo_barra, '') ILIKE $4
      )
      AND ($5::int IS NULL OR p.categoria_id = $5)
      AND ($6::text IS NULL OR COALESCE(p.destino_impresion, '') ILIKE $6)
      AND ($7::boolean IS NULL OR p.es_insumo = $7)
      AND ($8::int IS NULL OR COALESCE(pp.precio_compra_moneda_id, 1) = $8)
      ORDER BY
        CASE
          WHEN $3 <> '' AND CAST(p.id AS TEXT) = $3 THEN 0
          WHEN $3 <> '' AND LOWER(COALESCE(p.codigo_barra, '')) = LOWER($3) THEN 1
          WHEN $3 <> '' AND LOWER(p.nombre) = LOWER($3) THEN 2
          ELSE 3
        END,
        ${orderExpr} ${orden},
        p.id ${orden}
      LIMIT $1 OFFSET $2
    `, [limit, offset, busqueda, busquedaLike, categoriaId, destino, esInsumo, monedaId]);

    res.json(result.rows);

  } catch (error) {
    console.error("ERROR GET PRODUCTOS:", error);
    res.status(500).json({ error: error.message });
  }
});

/* ================= POST ================= */
router.post('/', authMiddleware, upload.single('imagen'), async (req, res) => {
  try {
    await ensureComisionSchema();
    await ensureMenuDigitalSchema();
    const {
      nombre,
      descripcion,
      iva_tipo,
      stock,
      categoria_id,
      unidad_medida,
      tiempo_preparacion,
      codigo_barra,
      destino_impresion,
      efectivacion_directa,
      no_control_stock,
      permite_multi_sabor,
      max_sabores,
      facturacion_directa,
      mostrar_menu_digital,
      mostrar_venta_medio,
      orden_venta_medio,
      es_insumo,
      es_servicio
    } = req.body;

    /* VALIDAR CODIGO DE BARRA */
    if (codigo_barra) {
      const existe = await pool.query(
        `SELECT id FROM producto
         WHERE codigo_barra = $1 AND activo = true`,
        [codigo_barra]
      );

      if (existe.rows.length > 0) {
        return res.status(400).json({ error: "El codigo de barra ya existe" });
      }
    }

    /* PROCESAR IMAGEN */
    let imagenPath = null;

    if (req.file) {
      const nombreWebp = Date.now() + ".webp";
      const rutaFinal = path.join(__dirname, "../uploads/productos", nombreWebp);

      await sharp(req.file.path)
        .resize(800)
        .webp({ quality: 75 })
        .toFile(rutaFinal);

      fs.unlink(req.file.path, () => {});
      imagenPath = `/uploads/productos/${nombreWebp}`;
    }

    const result = await pool.query(
      `
      INSERT INTO producto
      (nombre, descripcion, iva_tipo, stock, categoria_id, imagen,
       unidad_medida, tiempo_preparacion, codigo_barra, destino_impresion,
       efectivacion_directa, no_control_stock,
       permite_multi_sabor, max_sabores, facturacion_directa, mostrar_menu_digital, mostrar_venta_medio, orden_venta_medio, es_insumo, es_servicio)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
      RETURNING *
      `,
      [
        nombre,
        descripcion,
        iva_tipo,
        stock || 0,
        categoria_id || null,
        imagenPath,
        unidad_medida || 'unidad',
        tiempo_preparacion || 0,
        codigo_barra || null,
        destino_impresion === "" ? null : destino_impresion,
        efectivacion_directa === 'true' || efectivacion_directa === true,
        no_control_stock === 'true' || no_control_stock === true,
        permite_multi_sabor === 'true' || permite_multi_sabor === true,
        max_sabores || 1,
        facturacion_directa === 'true' || facturacion_directa === true,
        toBool(mostrar_menu_digital, false),
        toBool(mostrar_venta_medio, false),
        Number(orden_venta_medio) || Number(req.body.orden_pos) || 0,
        es_insumo === 'true' || es_insumo === true,
        es_servicio === 'true' || es_servicio === true
      ]
    );

    await syncProductoMenuDigital(req, result.rows[0].id);
    res.json(result.rows[0]);

  } catch (error) {
    console.error("ERROR POST PRODUCTO:", error);
    res.status(500).json({ error: error.message });
  }
});

/* ================= GET POR ID ================= */
router.get('/:id', async (req, res) => {
  try {
    await ensureComisionSchema();
    await ensureMonedaSchema();
    const { id } = req.params;

    const result = await pool.query(`
      SELECT
        p.id,
        p.nombre,
        p.descripcion,
        p.imagen,
        p.stock,
        p.iva_tipo,
        p.categoria_id,
        p.efectivacion_directa,
        p.no_control_stock,
        p.permite_multi_sabor,
        p.max_sabores,
        p.unidad_medida,
        p.tiempo_preparacion,
        p.codigo_barra,
        p.destino_impresion,
        p.orden_venta_medio,
        p.mostrar_menu_digital,
        p.mostrar_venta_medio,
        p.es_insumo,
        p.es_servicio,
        pp.precio_compra,
        COALESCE(pp.precio_compra_origen, pp.precio_compra, 0) AS precio_compra_origen,
        COALESCE(pp.precio_compra_moneda_id, 1) AS precio_compra_moneda_id,
        pp.precio_minimo,
        COALESCE(pp.precio_venta, 0) AS precio_venta,
        COALESCE(pp.precio_venta, 0) AS precio_mayorista,
        pp.costo_transporte,
        p.facturacion_directa,
        COALESCE(pp.precio_venta, 0) AS precio
      FROM producto p
      LEFT JOIN producto_precio pp
        ON pp.producto_id = p.id
        AND pp.activo = true
      WHERE p.id = $1
      AND p.activo = true
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Producto no encontrado" });
    }

    res.json(result.rows[0]);

  } catch (error) {
    console.error("ERROR GET PRODUCTO POR ID:", error);
    res.status(500).json({ error: error.message });
  }
});

/* ================= PUT ================= */
router.put('/:id', authMiddleware, upload.single('imagen'), async (req, res) => {
  try {
    await ensureComisionSchema();
    await ensureMenuDigitalSchema();
    const { id } = req.params;

    const productoActual = await pool.query(
      `SELECT imagen, mostrar_venta_medio, mostrar_menu_digital, orden_venta_medio FROM producto WHERE id = $1`,
      [id]
    );

    if (productoActual.rows.length === 0) {
      return res.status(404).json({ error: "Producto no encontrado" });
    }

    const imagenAnterior = productoActual.rows[0].imagen;

    const {
      nombre,
      descripcion,
      iva_tipo,
      categoria_id,
      unidad_medida,
      tiempo_preparacion,
      codigo_barra,
      destino_impresion,
      efectivacion_directa,
      no_control_stock,
      facturacion_directa,
      mostrar_menu_digital,
      mostrar_venta_medio,
      orden_venta_medio,
      es_insumo,
      es_servicio
    } = req.body;

    const mostrarMenuDigitalFinal =
      mostrar_menu_digital === undefined || mostrar_menu_digital === null || String(mostrar_menu_digital).trim() === ""
        ? Boolean(productoActual.rows[0].mostrar_menu_digital)
        : toBool(mostrar_menu_digital, false);

    const mostrarVentaMedioFinal =
      mostrar_venta_medio === undefined || mostrar_venta_medio === null || String(mostrar_venta_medio).trim() === ""
        ? Boolean(productoActual.rows[0].mostrar_venta_medio)
        : toBool(mostrar_venta_medio, false);

    const ordenVentaMedioFinal =
      orden_venta_medio === undefined || orden_venta_medio === null || String(orden_venta_medio).trim() === ""
        ? Number(productoActual.rows[0].orden_venta_medio || 0)
        : Math.max(0, Number(orden_venta_medio) || 0);

    if (codigo_barra) {
      const existe = await pool.query(
        `SELECT id FROM producto
         WHERE codigo_barra = $1
         AND id <> $2
         AND activo = true`,
        [codigo_barra, id]
      );

      if (existe.rows.length > 0) {
        return res.status(400).json({ error: "El codigo de barra ya existe" });
      }
    }

    let query = `
      UPDATE producto SET
      nombre = $1,
      descripcion = $2,
      iva_tipo = $3,
      categoria_id = $4,
      unidad_medida = $5,
      tiempo_preparacion = $6,
      codigo_barra = $7,
      destino_impresion = $8,
      efectivacion_directa = $9,
      no_control_stock = $10,
      permite_multi_sabor = $11,
      max_sabores = $12,
      facturacion_directa = $13,
      mostrar_menu_digital = $14,
      mostrar_venta_medio = $15,
      orden_venta_medio = $16,
      es_insumo = $17,
      es_servicio = $18
    `;

    const values = [
      nombre,
      descripcion,
      iva_tipo,
      categoria_id || null,
      unidad_medida || 'unidad',
      tiempo_preparacion || 0,
      codigo_barra || null,
      destino_impresion === "" ? null : destino_impresion,
      efectivacion_directa === 'true' || efectivacion_directa === true,
      no_control_stock === 'true' || no_control_stock === true,
      req.body.permite_multi_sabor === 'true' || req.body.permite_multi_sabor === true,
      req.body.max_sabores || 1,
      facturacion_directa === 'true' || facturacion_directa === true,
      mostrarMenuDigitalFinal,
      mostrarVentaMedioFinal,
      ordenVentaMedioFinal,
      es_insumo === 'true' || es_insumo === true,
      es_servicio === 'true' || es_servicio === true
    ];

    if (req.body.stock !== undefined) {
      query += `, stock = $${values.length + 1}`;
      values.push(req.body.stock);
    }

    if (req.file) {
      const nombreWebp = Date.now() + ".webp";
      const rutaFinal = path.join(__dirname, "../uploads/productos", nombreWebp);

      await sharp(req.file.path)
        .resize(800)
        .webp({ quality: 75 })
        .toFile(rutaFinal);

      fs.unlink(req.file.path, () => {});

      const nuevaImagen = `/uploads/productos/${nombreWebp}`;
      query += `, imagen = $${values.length + 1}`;
      values.push(nuevaImagen);
    }

    query += ` WHERE id = $${values.length + 1} RETURNING *`;
    values.push(id);

    const result = await pool.query(query, values);

    await syncProductoMenuDigital(req, id);

    if (req.file && imagenAnterior) {
      const rutaImagen = path.join(__dirname, "..", imagenAnterior);
      if (fs.existsSync(rutaImagen)) {
        setTimeout(() => {
          fs.unlink(rutaImagen, (err) => {
            if (err) {
              console.warn("No se pudo borrar imagen:", err.message);
            }
          });
        }, 800);
      }
    }

    res.json(result.rows[0]);

  } catch (error) {
    console.error("ERROR UPDATE PRODUCTO:", error);
    res.status(500).json({ error: error.message });
  }
});

/* ================= VentaMedio - ORDEN PRODUCTOS ================= */
router.put('/venta-medio/orden', authMiddleware, async (req, res) => {
  const categoriaId = Number(req.body?.categoria_id || 0);
  const orden = Array.isArray(req.body)
    ? req.body
    : Array.isArray(req.body?.orden)
      ? req.body.orden
      : null;

  if (!Array.isArray(orden)) {
    return res.status(400).json({ error: "Formato invalido" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    for (const item of orden) {
      const id = Number(item?.id || 0);
      const posicion = Number(item?.orden || 0);
      if (!id || !posicion) continue;

      if (categoriaId > 0) {
        await client.query(
          `
            UPDATE producto
            SET orden_venta_medio = $1
            WHERE id = $2
              AND categoria_id = $3
          `,
          [posicion, id, categoriaId]
        );
        continue;
      }

      await client.query(
        `UPDATE producto SET orden_venta_medio = $1 WHERE id = $2`,
        [posicion, id]
      );
    }

    await client.query("COMMIT");
    res.json({ ok: true });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("ERROR ORDEN PRODUCTO VENTA MEDIO:", error);
    res.status(500).json({ error: "No se pudo guardar orden de productos" });
  } finally {
    client.release();
  }
});

/* ================= AJUSTAR STOCK ================= */
// Roles autorizados para ajustar stock manualmente
const ROLES_AJUSTE_STOCK = new Set(["SUPER", "SUP", "SIS", "SISTEMA", "SUPER_SISTEMA"]);

router.post('/:id/ajustar-stock', authMiddleware, async (req, res) => {
  // Verificar que el usuario tiene rol permitido
  const rolUsuario = String(req.usuario?.rol || "").trim().toUpperCase();
  if (!ROLES_AJUSTE_STOCK.has(rolUsuario)) {
    return res.status(403).json({ error: "No tiene permiso para ajustar stock" });
  }

  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "ID inválido" });

  const stockNuevo = Number(req.body.stock_nuevo);
  if (!Number.isFinite(stockNuevo) || stockNuevo < 0) {
    return res.status(400).json({ error: "Cantidad inválida" });
  }

  const motivo = String(req.body.motivo || "Ajuste manual").trim() || "Ajuste manual";

  try {
    const check = await pool.query(
      `SELECT id, nombre, stock FROM producto WHERE id = $1 AND activo = true`,
      [id]
    );
    if (check.rows.length === 0) {
      return res.status(404).json({ error: "Producto no encontrado" });
    }

    const stockAnterior = Number(check.rows[0].stock || 0);

    const result = await pool.query(
      `UPDATE producto SET stock = $1 WHERE id = $2 RETURNING id, nombre, stock`,
      [stockNuevo, id]
    );

    console.log(
      `AJUSTE STOCK: producto=${id} (${check.rows[0].nombre}) | anterior=${stockAnterior} | nuevo=${stockNuevo} | motivo="${motivo}"`
    );

    res.json({
      ok: true,
      producto_id: id,
      stock_anterior: stockAnterior,
      stock_nuevo: stockNuevo,
      motivo,
      producto: result.rows[0]
    });
  } catch (error) {
    console.error("ERROR AJUSTAR STOCK:", error);
    res.status(500).json({ error: error.message });
  }
});

/* ================= DELETE (SOFT) ================= */
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    await ensureMenuDigitalSchema();
    const { id } = req.params;

    await pool.query(
      `UPDATE producto SET activo = false WHERE id = $1`,
      [id]
    );

    await syncProductoMenuDigital(req, id);
    res.json({ mensaje: 'Producto desactivado' });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
