const express = require('express');
const router = express.Router();
const pool = require('../db');

/*
  TABLA:
  sorteo_participante
  -------------------
  id
  nombre
  fecha_registro
*/

/* =========================
   OBTENER PARTICIPANTES
   GET /sorteo/participantes
========================= */
router.get('/participantes', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, nombre FROM sorteo_participante ORDER BY id ASC'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error al obtener participantes:', error);
    res.status(500).json({ error: 'Error al obtener participantes' });
  }
});

/* =========================
   AGREGAR PARTICIPANTE
   POST /sorteo/participantes
   body: { nombre }
========================= */
router.post('/participantes', async (req, res) => {
  const { nombre } = req.body;

  if (!nombre || nombre.trim() === '') {
    return res.status(400).json({ error: 'Nombre requerido' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO sorteo_participante (nombre, fecha_registro)
       VALUES ($1, NOW())
       RETURNING id, nombre`,
      [nombre.trim()]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error al agregar participante:', error);
    res.status(500).json({ error: 'Error al agregar participante' });
  }
});

/* =========================
   ELIMINAR UN PARTICIPANTE
   DELETE /sorteo/participantes/:id
========================= */
router.delete('/participantes/:id', async (req, res) => {
  const { id } = req.params;

  try {
    await pool.query(
      'DELETE FROM sorteo_participante WHERE id = $1',
      [id]
    );
    res.json({ ok: true });
  } catch (error) {
    console.error('Error al eliminar participante:', error);
    res.status(500).json({ error: 'Error al eliminar participante' });
  }
});

/* =========================
   NUEVO SORTEO (BORRAR TODO)
   DELETE /sorteo/participantes
========================= */
router.delete('/participantes', async (req, res) => {
  try {
    await pool.query('DELETE FROM sorteo_participante');
    res.json({ ok: true });
  } catch (error) {
    console.error('Error al borrar participantes:', error);
    res.status(500).json({ error: 'Error al borrar participantes' });
  }
});

module.exports = router;
