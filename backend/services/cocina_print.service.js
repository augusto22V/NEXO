const db = require("../db");

let schemaPromise = null;

async function ensureKitchenPrintSchema() {
  if (schemaPromise) return schemaPromise;

  schemaPromise = (async () => {
    await db.query(`
      CREATE TABLE IF NOT EXISTS venta_cocina_envio (
        id BIGSERIAL PRIMARY KEY,
        request_uuid VARCHAR(80) NOT NULL UNIQUE,
        empresa_id BIGINT,
        terminal_id BIGINT,
        venta_id BIGINT NOT NULL REFERENCES venta(id) ON DELETE CASCADE,
        reimprimir BOOLEAN NOT NULL DEFAULT FALSE,
        cliente_nombre TEXT,
        estado VARCHAR(20) NOT NULL DEFAULT 'RECIBIDO',
        intentos INTEGER NOT NULL DEFAULT 0,
        ultimo_error TEXT,
        ultimo_resultado JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        procesando_desde TIMESTAMPTZ,
        completado_en TIMESTAMPTZ
      )
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_venta_cocina_envio_venta
      ON venta_cocina_envio(venta_id, created_at DESC)
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_venta_cocina_envio_estado
      ON venta_cocina_envio(estado, updated_at DESC)
    `);
  })().catch((error) => {
    schemaPromise = null;
    throw error;
  });

  return schemaPromise;
}

module.exports = {
  ensureKitchenPrintSchema
};
