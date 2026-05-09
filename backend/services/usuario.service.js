const db = require("../db");

let schemaPromise = null;

/**
 * Asegura la tabla `usuario` y todas las columnas que las rutas usan.
 * Se ejecuta como middleware antes de cualquier request a /api/usuarios.
 */
async function ensureUsuarioSchema() {
  if (schemaPromise) return schemaPromise;

  schemaPromise = (async () => {
    // Tabla base — si ya existe, NO se sobrescribe.
    await db.query(`
      CREATE TABLE IF NOT EXISTS usuario (
        id          BIGSERIAL PRIMARY KEY,
        usuario     VARCHAR(100) UNIQUE,
        password    VARCHAR(200),
        nombre      VARCHAR(200),
        rol         VARCHAR(40),
        activo      BOOLEAN DEFAULT TRUE,
        empresa_id  BIGINT  DEFAULT 1,
        terminal_id BIGINT,
        created_at  TIMESTAMPTZ DEFAULT NOW(),
        updated_at  TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Garantizamos columnas que el código usa, por si la tabla ya existía
    // con estructura distinta (BD migrada/legacy).
    await db.query(`ALTER TABLE usuario ADD COLUMN IF NOT EXISTS usuario           VARCHAR(100)`);
    await db.query(`ALTER TABLE usuario ADD COLUMN IF NOT EXISTS password          VARCHAR(200)`);
    await db.query(`ALTER TABLE usuario ADD COLUMN IF NOT EXISTS nombre            VARCHAR(200)`);
    await db.query(`ALTER TABLE usuario ADD COLUMN IF NOT EXISTS rol               VARCHAR(40)`);
    await db.query(`ALTER TABLE usuario ADD COLUMN IF NOT EXISTS activo            BOOLEAN DEFAULT TRUE`);
    await db.query(`ALTER TABLE usuario ADD COLUMN IF NOT EXISTS empresa_id        BIGINT  DEFAULT 1`);
    await db.query(`ALTER TABLE usuario ADD COLUMN IF NOT EXISTS terminal_id       BIGINT`);
    await db.query(`ALTER TABLE usuario ADD COLUMN IF NOT EXISTS modo_factura      VARCHAR(30) DEFAULT 'PREGUNTAR'`);
    await db.query(`ALTER TABLE usuario ADD COLUMN IF NOT EXISTS modo_impresion    VARCHAR(30) DEFAULT 'AUTO'`);
    await db.query(`ALTER TABLE usuario ADD COLUMN IF NOT EXISTS modo_confirmacion BOOLEAN DEFAULT FALSE`);
    await db.query(`ALTER TABLE usuario ADD COLUMN IF NOT EXISTS created_at        TIMESTAMPTZ DEFAULT NOW()`);
    await db.query(`ALTER TABLE usuario ADD COLUMN IF NOT EXISTS updated_at        TIMESTAMPTZ DEFAULT NOW()`);

    // Index único sobre usuario (case-insensitive friendly)
    try {
      await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_usuario_usuario ON usuario(UPPER(usuario))`);
    } catch (e) { /* puede fallar si hay duplicados — no rompemos */ }
  })().catch(err => {
    schemaPromise = null;
    throw err;
  });

  return schemaPromise;
}

module.exports = { ensureUsuarioSchema };
