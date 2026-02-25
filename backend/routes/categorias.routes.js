const express = require('express');
const router = express.Router();
const pool = require('../db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

/* CONFIGURAR MULTER PARA SUBIDA DE IMAGENES */
const storage = multer.diskStorage({

  /* DEFINIR CARPETA DESTINO */
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../uploads/categorias');

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    cb(null, dir);
  },

  /* GENERAR NOMBRE UNICO */
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const nombre = Date.now() + '-' + Math.round(Math.random() * 1e9) + ext;
    cb(null, nombre);
  }
});

const upload = multer({ storage });

/* LISTAR TODAS LAS CATEGORIAS */
router.get('/', async (req, res) => {
  try {

    const r = await pool.query(`
      SELECT id, nombre, imagen, orden_pantalla, activo
    FROM categoria
      ORDER BY orden_pantalla ASC, nombre ASC
    `);

    res.json(r.rows);

  } catch (e) {
    console.error('ERROR LISTAR CATEGORIAS', e);
    res.status(500).json({ error: 'Error al listar categorías' });
  }
});

/* CREAR NUEVA CATEGORIA */
router.post('/', upload.single('imagen'), async (req, res) => {
  try {
    const { nombre, orden_pantalla, activo } = req.body;

    if (!nombre || !nombre.trim()) {
      return res.status(400).json({ mensaje: 'Nombre requerido' });
    }

    const imagen = req.file ? `/uploads/categorias/${req.file.filename}` : null;

    const activoBool = (String(activo).toLowerCase() === "true");

    const r = await pool.query(`
      INSERT INTO categoria (nombre, imagen, orden_pantalla, activo)
      VALUES ($1,$2,$3,$4)
      RETURNING *
    `, [
      nombre.trim(),
      imagen,
      orden_pantalla || 0,
      activoBool
    ]);

    res.json(r.rows[0]);

  } catch (e) {
    console.error('ERROR CREAR CATEGORIA', e);
    res.status(500).json({ error: 'Error al crear categoría' });
  }
});

/* ACTUALIZAR CATEGORIA */
router.put('/:id', upload.single('imagen'), async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, orden_pantalla, activo } = req.body;

    if (!nombre || !nombre.trim()) {
      return res.status(400).json({ mensaje: 'Nombre requerido' });
    }

    const actual = await pool.query(
      'SELECT imagen FROM categoria WHERE id = $1',
      [id]
    );

    if (actual.rowCount === 0) {
      return res.status(404).json({ mensaje: 'Categoría no existe' });
    }

    let imagen = actual.rows[0].imagen;

    if (req.file) {
      if (imagen) {
        const rutaVieja = path.join(__dirname, '..', imagen);
        if (fs.existsSync(rutaVieja)) fs.unlinkSync(rutaVieja);
      }
      imagen = `/uploads/categorias/${req.file.filename}`;
    }

    const activoBool = (String(activo).toLowerCase() === "true");

    const r = await pool.query(`
      UPDATE categoria
      SET nombre = $1,
          imagen = $2,
          orden_pantalla = $3,
          activo = $4
      WHERE id = $5
      RETURNING *
    `, [
      nombre.trim(),
      imagen,
      orden_pantalla || 0,
      activoBool,
      id
    ]);

    res.json(r.rows[0]);

  } catch (e) {
    console.error('ERROR ACTUALIZAR CATEGORIA', e);
    res.status(500).json({ error: 'Error al actualizar categoría' });
  }
});

/* ELIMINAR CATEGORIA CON VALIDACION DE USO */
router.delete('/:id', async (req, res) => {

  const id = req.params.id;

  try {

    /* VERIFICAR SI ESTA EN USO */
    const uso = await pool.query(`
      SELECT COUNT(*)::int AS total
      FROM producto
      WHERE categoria_id = $1 AND activo = true
    `, [id]);

    if (uso.rows[0].total > 0) {

      const ejemplos = await pool.query(`
        SELECT id, nombre
        FROM producto
        WHERE categoria_id = $1 AND activo = true
        ORDER BY id DESC
        LIMIT 5
      `, [id]);

      return res.status(409).json({
        idCategoria: Number(id),
        total: uso.rows[0].total,
        mensaje: `No se puede eliminar la categoría ${id}: está en uso por ${uso.rows[0].total} producto(s).`,
        productos: ejemplos.rows
      });
    }

    /* OBTENER IMAGEN PARA BORRAR */
    const actual = await pool.query(
      'SELECT imagen FROM categoria WHERE id = $1',
      [id]
    );

    if (actual.rowCount > 0 && actual.rows[0].imagen) {
      const ruta = path.join(__dirname, '..', actual.rows[0].imagen);
      if (fs.existsSync(ruta)) {
        fs.unlinkSync(ruta);
      }
    }

    await pool.query('DELETE FROM categoria WHERE id = $1', [id]);

    res.json({ mensaje: 'Categoría eliminada' });

  } catch (e) {
    console.error('ERROR ELIMINAR CATEGORIA', e);
    res.status(500).json({ error: 'Error al eliminar categoría' });
  }
});

module.exports = router;