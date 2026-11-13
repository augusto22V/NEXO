/**
 * Copia todas las fotos de backend/uploads (productos, categorias, menu digital) a la tabla archivo_subido.
 * Asi viajan junto con la base cuando se sube a la nube (ver subir_base_a_la_nube.bat).
 *
 * Uso: node scripts/fotos_a_base.js
 *   - Sin DATABASE_URL usa la base local libreria_sys.
 *   - Con DATABASE_URL las copia directo a esa base.
 */
require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const fs = require("fs");
const path = require("path");
const pool = require("../db");
const { UPLOADS_DIR, ensureArchivosSchema, guardarArchivoEnBase } = require("../services/archivos_db.service");

function listar(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? listar(full) : [full];
  });
}

(async () => {
  await ensureArchivosSchema();
  const archivos = listar(UPLOADS_DIR).filter((f) => /\.(webp|png|jpe?g|gif|svg)$/i.test(f));
  let n = 0;
  for (const archivo of archivos) {
    const rutaPublica = "/uploads/" + path.relative(UPLOADS_DIR, archivo).split(path.sep).join("/");
    await guardarArchivoEnBase(rutaPublica, archivo);
    n++;
    if (n % 50 === 0) console.log(`  ${n} de ${archivos.length}...`);
  }
  console.log(`Fotos copiadas a la base: ${n}`);
  await pool.end();
})().catch(async (err) => {
  console.error("Error copiando fotos:", err.message);
  await pool.end().catch(() => {});
  process.exit(1);
});
