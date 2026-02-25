const express = require('express');
const router = express.Router();
const pool = require('../db');
const multer = require('multer');
const path = require('path');

// ==========================
// CONFIGURAR MULTER
// ==========================
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../uploads/categorias'));
  },
  filename: (req, file, cb) => {
    const nombre = Date.now() + path.extname(file.originalname);
    cb(null, nombre);
  }
});

const upload = multer({ storage });

// ==========================
// LISTAR CATEGORIAS
// ==========================
router.get('/', async (req, res) => {
  try {
    const r = await pool.query('SELECT id, nombre, imagen FROM categoria ORDER BY nombre');
    res.json(r.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ==========================
// CREAR CATEGORIA CON IMAGEN
// ==========================
router.post('/', upload.single('imagen'), async (req, res) => {
  const { nombre } = req.body;
  const imagen = req.file ? `/uploads/categorias/${req.file.filename}` : null;

  if (!nombre) return res.status(400).json({ mensaje: 'Nombre requerido' });

  try {
    const r = await pool.query(
      'INSERT INTO categoria (nombre, imagen) VALUES ($1, $2) RETURNING *',
      [nombre, imagen]
    );
    res.json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ==========================
// ELIMINAR CATEGORIA
// ==========================
router.delete('/:id', async (req, res) => {
  const id = req.params.id;

  try {
    const uso = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM producto
       WHERE categoria_id = $1 AND activo = true`,
      [id]
    );

    if (uso.rows[0].total > 0) {
      const ejemplos = await pool.query(
        `SELECT id, nombre
         FROM producto
         WHERE categoria_id = $1 AND activo = true
         ORDER BY id DESC
         LIMIT 5`,
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