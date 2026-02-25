const express = require('express');
const router = express.Router();
const pool = require('../db');

/* ================= OBTENER PRECIO ACTIVO ================= */
router.get('/producto/:productoId', async (req, res) => {
  try {
    const { productoId } = req.params;

    const result = await pool.query(
      `
      SELECT *
      FROM producto_precio
      WHERE producto_id = $1
        AND activo = true
      ORDER BY fecha DESC
      LIMIT 1
      `,
      [productoId]
    );

    res.json(result.rows[0] || null);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/* ================= CREAR / CAMBIAR PRECIO ================= */
router.post('/', async (req, res) => {
  try {
    const {
      producto_id,
      precio_compra,
      costo_transporte,
      precio_venta,
      precio_minimo,
      precio_promocional,
      iva_tipo
    } = req.body;

    // 1. Desactivar precio anterior
    await pool.query(
      `UPDATE producto_precio
       SET activo = false
       WHERE producto_id = $1`,
      [producto_id]
    );

    // 2. Insertar nuevo precio
    const result = await pool.query(
      `
      INSERT INTO producto_precio
      (producto_id, precio_compra, costo_transporte,
       precio_venta, precio_minimo, precio_promocional, iva_tipo)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING *
      `,
      [
        producto_id,
        precio_compra,
        costo_transporte || 0,
        precio_venta,
        precio_minimo || null,
        precio_promocional || null,
        iva_tipo || 10
      ]
    );

    res.json(result.rows[0]);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
