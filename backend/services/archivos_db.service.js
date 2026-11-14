/**
 * Copia de las imagenes subidas (productos, categorias, menu digital, logos) dentro de la base de datos.
 *
 * En un servidor gratuito (Render) el disco se borra en cada reinicio, asi que las fotos
 * se guardan tambien en la tabla archivo_subido. Si la foto no esta en disco, se sirve desde la base.
 * En la PC local funciona igual: el disco sigue siendo lo primero y la base es el respaldo.
 */
const fs = require("fs");
const path = require("path");
const pool = require("../db");

const UPLOADS_DIR = path.join(__dirname, "../uploads");
const RECURSOS_IMG_DIR = path.join(__dirname, "../../frontend/recursos/img");

const MIME = {
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function mimeDe(ruta) {
  return MIME[path.extname(ruta || "").toLowerCase()] || "application/octet-stream";
}

let schemaListo = null;
function ensureArchivosSchema() {
  if (!schemaListo) {
    schemaListo = pool
      .query(`
        CREATE TABLE IF NOT EXISTS archivo_subido (
          ruta        text PRIMARY KEY,
          mime        text NOT NULL,
          datos       bytea NOT NULL,
          actualizado timestamptz NOT NULL DEFAULT now()
        )
      `)
      .catch((err) => {
        schemaListo = null;
        throw err;
      });
  }
  return schemaListo;
}

function ensureUploadDirs() {
  for (const sub of ["productos", "categorias", "menu_digital", "catalogo"]) {
    fs.mkdirSync(path.join(UPLOADS_DIR, sub), { recursive: true });
  }
}

/** Guarda en la base el archivo de disco `rutaDisco` bajo su URL publica (ej. "/uploads/productos/1.webp"). */
async function guardarArchivoEnBase(rutaPublica, rutaDisco) {
  try {
    await ensureArchivosSchema();
    const datos = await fs.promises.readFile(rutaDisco);
    await pool.query(
      `INSERT INTO archivo_subido (ruta, mime, datos, actualizado)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (ruta) DO UPDATE SET mime = EXCLUDED.mime, datos = EXCLUDED.datos, actualizado = now()`,
      [rutaPublica, mimeDe(rutaDisco), datos]
    );
  } catch (err) {
    console.error(`No se pudo guardar ${rutaPublica} en la base:`, err.message);
  }
}

async function borrarArchivoDeBase(rutaPublica) {
  try {
    await ensureArchivosSchema();
    await pool.query("DELETE FROM archivo_subido WHERE ruta = $1", [rutaPublica]);
  } catch (err) {
    console.error(`No se pudo borrar ${rutaPublica} de la base:`, err.message);
  }
}

/** Middleware: si express.static no encontro el archivo, lo busca en la base. Montar con app.use("/uploads", ...). */
function servirDesdeBase(prefijo) {
  return async (req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    let ruta;
    try {
      ruta = prefijo + decodeURIComponent(req.path);
    } catch {
      return next();
    }
    try {
      await ensureArchivosSchema();
      const { rows } = await pool.query(
        "SELECT mime, datos, actualizado FROM archivo_subido WHERE ruta = $1",
        [ruta]
      );
      if (!rows.length) return next();
      const { mime, datos, actualizado } = rows[0];
      res.setHeader("Content-Type", mime);
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.setHeader("Last-Modified", new Date(actualizado).toUTCString());
      if (req.method === "HEAD") return res.end();
      return res.end(datos);
    } catch (err) {
      return next();
    }
  };
}

module.exports = {
  UPLOADS_DIR,
  RECURSOS_IMG_DIR,
  ensureArchivosSchema,
  ensureUploadDirs,
  guardarArchivoEnBase,
  borrarArchivoDeBase,
  servirDesdeBase,
};
