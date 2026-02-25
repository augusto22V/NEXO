const express = require('express');
const router = express.Router();
const pool = require('../db');

const multer = require('multer');
const path = require('path');

/* ================= MULTER ================= */
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/productos'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const safeName = Date.now() + '-' + Math.round(Math.random() * 1e9) + ext;
    cb(null, safeName);
  }
});

const upload = multer({ storage });

/* ================= GET TODOS ================= */
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
SELECT
  p.id,
  p.nombre,
  p.descripcion,
  p.imagen,
  p.stock,
  p.iva_tipo,
  p.categoria_id,
  p.tiene_preparo,
  p.tipo_producto,

  pp.precio_compra,
  pp.costo_transporte,
  pp.precio_venta,
  pp.precio_minimo,
  pp.precio_promocional,

  COALESCE(pp.precio_venta, 0) AS precio

FROM producto p

LEFT JOIN producto_precio pp
  ON pp.producto_id = p.id
  AND pp.activo = true

WHERE p.activo = true
ORDER BY p.id;
    `);

    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/* ================= GET POR ID ================= */
router.get('/:id', async (req, res) => {
  try {
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
  p.tiene_preparo,
  p.tipo_producto,

  pp.precio_compra,
  pp.costo_transporte,
  pp.precio_venta,
  pp.precio_minimo,
  pp.precio_promocional,

  COALESCE(pp.precio_venta, 0) AS precio

FROM producto p

LEFT JOIN producto_precio pp
  ON pp.producto_id = p.id
  AND pp.activo = true

WHERE p.id = $1
AND p.activo = true;
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/* ================= POST ================= */
router.post('/', upload.single('imagen'), async (req, res) => {
  try {
    const {
      nombre,
      descripcion,
      iva_tipo,
      stock,
      categoria_id,
      tiene_preparo,
      tipo_producto
    } = req.body;

    const imagen = req.file ? `/uploads/productos/${req.file.filename}` : null;

    const result = await pool.query(
      `
      INSERT INTO producto
      (nombre, descripcion, iva_tipo, stock, categoria_id, imagen, tiene_preparo, tipo_producto)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING *
      `,
      [
        nombre,
        descripcion,
        iva_tipo,
        stock || 0,
        categoria_id || null,
        imagen,
        tiene_preparo || false,
        tipo_producto || 'normal'
      ]
    );

    res.json(result.rows[0]);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/* ================= PUT ================= */
router.put('/:id', upload.single('imagen'), async (req, res) => {
  try {

    const { id } = req.params;

    const {
      nombre,
      descripcion,
      iva_tipo,
      categoria_id,
      tiene_preparo,
      tipo_producto
    } = req.body;

    let query = `
      UPDATE producto SET
        nombre = $1,
        descripcion = $2,
        iva_tipo = $3,
        categoria_id = $4,
        tiene_preparo = $5,
        tipo_producto = $6
    `;

    const values = [
      nombre,
      descripcion,
      iva_tipo,
      categoria_id || null,
      tiene_preparo || false,
      tipo_producto || 'normal'
    ];

    //  SOLO ACTUALIZA STOCK SI VIENE
    if (req.body.stock !== undefined) {
      query += `, stock = $7`;
      values.push(req.body.stock);
    }

    if (req.file) {
      query += `, imagen = $${values.length + 1}`;
      values.push(`/uploads/productos/${req.file.filename}`);
    }

    query += ` WHERE id = $${values.length + 1} RETURNING *`;
    values.push(id);

    const result = await pool.query(query, values);

    res.json(result.rows[0]);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/* ================= DELETE (SOFT) ================= */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    await pool.query(
      `UPDATE producto SET activo = false WHERE id = $1`,
      [id]
    );

    res.json({ mensaje: 'Producto desactivado' });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;