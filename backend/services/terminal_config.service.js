const pool = require("../db");

let schemaPromise = null;

function toPositiveInt(value, fallback = null) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.trunc(n);
}

function normalizeTipoPedidoDefaultId(value) {
  return toPositiveInt(value, null);
}

async function ensureTerminalConfigSchema() {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      await pool.query(`
        ALTER TABLE terminal
        ADD COLUMN IF NOT EXISTS tipo_pedido_default_id INTEGER
      `);

      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_terminal_tipo_pedido_default
        ON terminal(tipo_pedido_default_id)
      `);
    })().catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }

  return schemaPromise;
}

module.exports = {
  ensureTerminalConfigSchema,
  normalizeTipoPedidoDefaultId,
  toPositiveInt
};
