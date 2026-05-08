const express = require('express');
const router = express.Router();
const pool = require('../db');
const authMiddleware = require("../Auth.middleware");
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sharp = require("sharp");
const {
  ensureMenuDigitalSchema,
  getScopeFromReq,
  getOrCreateMenuConfig,
  syncCategoryFromSource
} = require("../services/menu_digital.service");

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

async function syncCategoriaMenuDigital(req, categoriaId) {
  const id = Number(categoriaId || 0);
  if (!id) return;

  const scope = getScopeFromReq(req);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const config = await getOrCreateMenuConfig(client, scope);
    await syncCategoryFromSource(client, config.id, id);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("SYNC CATEGORIA MENU DIGITAL:", error);
  } finally {
    client.release();
  }
}

/* LISTAR TODAS LAS CATEGORIAS */
router.get('/', async (req, res) => {
  try {

    const r = await pool.query(`
      SELECT id, nombre, imagen, orden_pantalla, orden_venta_medio, activo, mostrar_venta_medio, mostrar_menu_digital
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
router.post('/', authMiddleware, upload.single('imagen'), async (req, res) => {
  try {
    await ensureMenuDigitalSchema();

    const { nombre, orden_pantalla, activo, mostrar_venta_medio, mostrar_menu_digital, orden_venta_medio } = req.body;

    if (!nombre || !nombre.trim()) {
      return res.status(400).json({ mensaje: 'Nombre requerido' });
    }

    let imagen = null;

    if (req.file) {

      const nombreWebp = Date.now() + ".webp";
      const rutaFinal = path.join(__dirname, '../uploads/categorias', nombreWebp);

      await sharp(req.file.path)
        .resize(800)
        .webp({ quality: 75 })
        .toFile(rutaFinal);

      // borrar original
      fs.unlinkSync(req.file.path);

      imagen = `/uploads/categorias/${nombreWebp}`;
    }

    const activoBool = (String(activo).toLowerCase() === "true");
    const mostrarVentaMedioBool = toBool(mostrar_venta_medio, false);
    const mostrarMenuDigitalBool = toBool(mostrar_menu_digital, false);
    const ordenVentaMedio = Number(orden_venta_medio) > 0
      ? Number(orden_venta_medio)
      : Number(orden_pantalla || 0);

    const r = await pool.query(`
      INSERT INTO categoria (nombre, imagen, orden_pantalla, activo, mostrar_venta_medio, mostrar_menu_digital, orden_venta_medio)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING *
    `, [
      nombre.trim(),
      imagen,
      orden_pantalla || 0,
      activoBool,
      mostrarVentaMedioBool,
      mostrarMenuDigitalBool,
      ordenVentaMedio
    ]);

    await syncCategoriaMenuDigital(req, r.rows[0].id);
    res.json(r.rows[0]);

  } catch (e) {
    console.error('ERROR CREAR CATEGORIA', e);
    res.status(500).json({ error: 'Error al crear categoría' });
  }
});

/* ACTUALIZAR CATEGORIA */
router.put('/:id', authMiddleware, upload.single('imagen'), async (req, res) => {
  try {
    await ensureMenuDigitalSchema();
    const { id } = req.params;
    const { nombre, orden_pantalla, activo, mostrar_venta_medio, mostrar_menu_digital, orden_venta_medio } = req.body;

    if (!nombre || !nombre.trim()) {
      return res.status(400).json({ mensaje: 'Nombre requerido' });
    }

    const actual = await pool.query(
      'SELECT imagen, orden_pantalla, activo, mostrar_venta_medio, mostrar_menu_digital, orden_venta_medio FROM categoria WHERE id = $1',
      [id]
    );

    if (actual.rowCount === 0) {
      return res.status(404).json({ mensaje: 'Categoría no existe' });
    }

    let imagen = actual.rows[0].imagen;

 if (req.file) {

  // borrar imagen anterior
if (imagen) {
  const rutaVieja = path.join(__dirname, '..', imagen);

  if (fs.existsSync(rutaVieja)) {
    setTimeout(() => {
      fs.unlink(rutaVieja, (err) => {
        if (err) {
          console.warn("No se pudo borrar imagen:", err.message);
        } else {
          console.log("Imagen anterior eliminada");
        }
      });
    }, 800); // 🔥 clave
  }
}
  const nombreWebp = Date.now() + ".webp";
  const rutaFinal = path.join(__dirname, '../uploads/categorias', nombreWebp);

  await sharp(req.file.path)
    .resize(800)
    .webp({ quality: 75 })
    .toFile(rutaFinal);

  // borrar original
  fs.unlink(req.file.path, () => {});

  imagen = `/uploads/categorias/${nombreWebp}`;
}

    const activoBool = req.body.activo === undefined
      ? Boolean(actual.rows[0].activo)
      : (String(activo).toLowerCase() === "true");

    const mostrarVentaMedioBool =
      mostrar_venta_medio === undefined || mostrar_venta_medio === null || String(mostrar_venta_medio).trim() === ""
        ? Boolean(actual.rows[0].mostrar_venta_medio)
        : toBool(mostrar_venta_medio, false);

    const mostrarMenuDigitalBool =
      mostrar_menu_digital === undefined || mostrar_menu_digital === null || String(mostrar_menu_digital).trim() === ""
        ? Boolean(actual.rows[0].mostrar_menu_digital)
        : toBool(mostrar_menu_digital, false);

    const ordenVentaMedio =
      orden_venta_medio === undefined || orden_venta_medio === null || String(orden_venta_medio).trim() === ""
        ? Number(actual.rows[0].orden_venta_medio || 0)
        : Math.max(0, Number(orden_venta_medio) || 0);

    const ordenPantallaFinal =
      orden_pantalla === undefined || orden_pantalla === null || String(orden_pantalla).trim() === ""
        ? Number(actual.rows[0].orden_pantalla || 0)
        : Math.max(0, Number(orden_pantalla) || 0);

    const r = await pool.query(`
      UPDATE categoria
      SET nombre = $1,
          imagen = $2,
          orden_pantalla = $3,
          activo = $4,
          mostrar_venta_medio = $5,
          mostrar_menu_digital = $6,
          orden_venta_medio = $7
      WHERE id = $8
      RETURNING *
    `, [
      nombre.trim(),
      imagen,
      ordenPantallaFinal,
      activoBool,
      mostrarVentaMedioBool,
      mostrarMenuDigitalBool,
      ordenVentaMedio,
      id
    ]);

    await syncCategoriaMenuDigital(req, id);
    res.json(r.rows[0]);

  } catch (e) {
    console.error('ERROR ACTUALIZAR CATEGORIA', e);
    res.status(500).json({ error: 'Error al actualizar categoría' });
  }
});

/* ELIMINAR CATEGORIA CON VALIDACION DE USO */
router.delete('/:id', authMiddleware, async (req, res) => {

  const id = req.params.id;

  try {
    await ensureMenuDigitalSchema();

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

    try {
      const scope = getScopeFromReq(req);
      const config = await getOrCreateMenuConfig(pool, scope);
      await pool.query(
        `
        UPDATE menu_digital_categoria
        SET activo = false,
            visible_publico = false,
            updated_at = NOW()
        WHERE menu_id = $1
          AND origen_categoria_id = $2
        `,
        [config.id, id]
      );
    } catch (syncError) {
      console.warn("No se pudo ocultar categoria sincronizada en menu digital:", syncError.message);
    }

    /* OBTENER IMAGEN PARA BORRAR */
    const actual = await pool.query(
      'SELECT imagen FROM categoria WHERE id = $1',
      [id]
    );

    if (actual.rowCount > 0 && actual.rows[0].imagen) {
      const ruta = path.join(__dirname, '..', actual.rows[0].imagen);
      if (fs.existsSync(ruta)) {
        const fs = require("fs");

if (fs.existsSync(ruta)) {
  try {
    fs.unlinkSync(ruta);
  } catch (err) {
    console.warn("Archivo ocupado, se omite borrado");
  }
}
      }
    }

    await pool.query('DELETE FROM categoria WHERE id = $1', [id]);

    res.json({ mensaje: 'Categoría eliminada' });

  } catch (e) {
    console.error('ERROR ELIMINAR CATEGORIA', e);
    res.status(500).json({ error: 'Error al eliminar categoría' });
  }
});


//Parte de Pos en venta 
/* ================= POS - CATEGORIAS ================= */
router.get('/pos', async (req, res) => {
  try {

    const r = await pool.query(`
      SELECT 
        id,
        nombre,
        imagen,
        orden_pantalla
      FROM categoria
      WHERE activo = true
      ORDER BY COALESCE(orden_pantalla, 999999) ASC, nombre ASC
    `);

    res.json(r.rows);

  } catch (e) {
    console.error('ERROR CATEGORIAS POS', e);
    res.status(500).json({ error: 'Error al cargar categorías POS' });
  }
});

/* ================= VentaMedio - CATEGORIAS ================= */
router.get('/venta-medio', async (_req, res) => {
  try {
    const r = await pool.query(`
      SELECT
        id,
        nombre,
        imagen,
        orden_venta_medio,
        mostrar_venta_medio
      FROM categoria
      WHERE activo = true
        AND mostrar_venta_medio = true
      ORDER BY orden_venta_medio ASC, nombre ASC
    `);

    res.json(r.rows);
  } catch (e) {
    console.error('ERROR CATEGORIAS VENTA MEDIO', e);
    res.status(500).json({ error: 'Error al cargar categorias de VentaMedio' });
  }
});

router.put('/venta-medio/orden', authMiddleware, async (req, res) => {
  const orden = req.body;

  if (!Array.isArray(orden)) {
    return res.status(400).json({ error: 'Formato invalido' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const item of orden) {
      const id = Number(item?.id || 0);
      const posicion = Number(item?.orden || 0);
      if (!id || !posicion) continue;

      await client.query(
        `UPDATE categoria SET orden_venta_medio = $1 WHERE id = $2`,
        [posicion, id]
      );
    }

    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('ERROR ORDEN CATEGORIA VENTA MEDIO', err);
    res.status(500).json({ error: 'No se pudo guardar orden de categorias' });
  } finally {
    client.release();
  }
});

module.exports = router;
