const express = require('express');
const router = express.Router();
const pool = require('../db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

/* =========================
   CONFIGURAR MULTER
========================= */
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../uploads/categorias');

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    cb(null, dir);
  },

  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const nombre = Date.now() + '-' + Math.round(Math.random() * 1e9) + ext;
    cb(null, nombre);
  }
});

const upload = multer({ storage });

/* =========================
   LISTAR CATEGORIAS
========================= */
router.get('/', async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT id, nombre, imagen, orden_pantalla
      FROM categoria
      ORDER BY orden_pantalla, nombre
    `);

    res.json(r.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* =========================
   CREAR CATEGORIA
========================= */
router.post('/', upload.single('imagen'), async (req, res) => {
  try {
    const { nombre, orden_pantalla } = req.body;

    if (!nombre) {
      return res.status(400).json({ mensaje: 'Nombre requerido' });
    }

    const imagen = req.file ? `/uploads/categorias/${req.file.filename}` : null;

    const r = await pool.query(
      `
      INSERT INTO categoria (nombre, imagen, orden_pantalla)
      VALUES ($1,$2,$3)
      RETURNING *
      `,
      [nombre, imagen, orden_pantalla || 0]
    );

    res.json(r.rows[0]);

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* =========================
   ACTUALIZAR CATEGORIA
========================= */
router.put('/:id', upload.single('imagen'), async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, orden_pantalla } = req.body;

    let query = `
      UPDATE categoria
      SET nombre = $1,
          orden_pantalla = $2
    `;

    const values = [nombre, orden_pantalla || 0];

    if (req.file) {
      query += `, imagen = $3 WHERE id = $4 RETURNING *`;
      values.push(`/uploads/categorias/${req.file.filename}`, id);
    } else {
      query += ` WHERE id = $3 RETURNING *`;
      values.push(id);
    }

    const r = await pool.query(query, values);

    res.json(r.rows[0]);

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* =========================
   ELIMINAR CATEGORIA
   (bloquear si está en uso)
========================= */
router.delete('/:id', async (req, res) => {
  const id = req.params.id;

  try {
    const uso = await pool.query(
      `
      SELECT COUNT(*)::int AS total
      FROM producto
      WHERE categoria_id = $1 AND activo = true
      `,
      [id]
    );

    if (uso.rows[0].total > 0) {

      const ejemplos = await pool.query(
        `
        SELECT id, nombre
        FROM producto
        WHERE categoria_id = $1 AND activo = true
        ORDER BY id DESC
        LIMIT 5
        `,
        [id]
      );

      return res.status(409).json({
        idCategoria: Number(id),
        total: uso.rows[0].total,
        mensaje: `No se puede eliminar la categoría ${id}: está en uso por ${uso.rows[0].total} producto(s).`,
        productos: ejemplos.rows
      });
    }

    await pool.query('DELETE FROM categoria WHERE id = $1', [id]);

    res.json({ mensaje: 'Categoría eliminada' });

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;