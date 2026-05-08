const db = require("../db");

let schemaPromise = null;

async function ensureLoteSchema() {
  if (schemaPromise) return schemaPromise;

  schemaPromise = (async () => {
    await db.query(`
      ALTER TABLE empresa
      ADD COLUMN IF NOT EXISTS controlar_lote BOOLEAN DEFAULT false
    `);
    await db.query(`
      UPDATE empresa
      SET controlar_lote = COALESCE(controlar_lote, false)
      WHERE controlar_lote IS NULL
    `);
    await db.query(`
      ALTER TABLE empresa
      ALTER COLUMN controlar_lote SET DEFAULT false
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS stock_lote (
        id SERIAL PRIMARY KEY,
        empresa_id INTEGER NOT NULL REFERENCES empresa(id),
        producto_id INTEGER NOT NULL REFERENCES producto(id),
        lote VARCHAR(120),
        fecha_vencimiento DATE,
        cantidad NUMERIC(14,3) NOT NULL DEFAULT 0,
        costo_promedio NUMERIC(14,4) NOT NULL DEFAULT 0,
        creado_en TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        actualizado_en TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT chk_stock_lote_cantidad_non_negative CHECK (cantidad >= 0)
      )
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_stock_lote_empresa_producto
      ON stock_lote(empresa_id, producto_id)
    `);
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_stock_lote_producto_vencimiento
      ON stock_lote(producto_id, fecha_vencimiento)
    `);
    await db.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_lote_unique_key
      ON stock_lote (
        empresa_id,
        producto_id,
        COALESCE(lote, ''),
        COALESCE(fecha_vencimiento, DATE '1900-01-01')
      )
    `);
  })();

  try {
    await schemaPromise;
  } catch (error) {
    schemaPromise = null;
    throw error;
  }
}

module.exports = {
  ensureLoteSchema
};

