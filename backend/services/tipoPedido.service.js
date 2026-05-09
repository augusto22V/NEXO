const db = require("../db");

let schemaPromise = null;

/**
 * Garantiza la tabla `tipo_pedido` y sus columnas. Usado por venta.routes.js
 * y otros módulos que hacen JOIN con `tipo_pedido tp ON tp.id_tipo_pedido = ...`.
 *
 * Ejemplos típicos:
 *   1: Mostrador
 *   2: Mesa
 *   3: Para llevar
 *   4: Delivery
 */
async function ensureTipoPedidoSchema() {
  if (schemaPromise) return schemaPromise;

  schemaPromise = (async () => {
    await db.query(`
      CREATE TABLE IF NOT EXISTS tipo_pedido (
        id_tipo_pedido BIGSERIAL PRIMARY KEY,
        nombre         VARCHAR(80),
        activo         BOOLEAN DEFAULT TRUE
      )
    `);

    // Por si la tabla ya existia con otra estructura
    await db.query(`ALTER TABLE tipo_pedido ADD COLUMN IF NOT EXISTS nombre VARCHAR(80)`);
    await db.query(`ALTER TABLE tipo_pedido ADD COLUMN IF NOT EXISTS activo BOOLEAN DEFAULT TRUE`);

    // Seed de tipos por defecto si la tabla está vacía
    const { rows } = await db.query(`SELECT COUNT(*)::int AS cnt FROM tipo_pedido`);
    if (rows[0].cnt === 0) {
      await db.query(`
        INSERT INTO tipo_pedido (nombre, activo) VALUES
          ('Mostrador', TRUE),
          ('Mesa',      TRUE),
          ('Para llevar', TRUE),
          ('Delivery',  TRUE)
      `);
    }
  })().catch(err => {
    schemaPromise = null;
    throw err;
  });

  return schemaPromise;
}

module.exports = { ensureTipoPedidoSchema };
