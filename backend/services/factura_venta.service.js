const db = require("../db");

let schemaPromise = null;

async function ensureFacturaVentaSchema() {
  if (schemaPromise) return schemaPromise;

  schemaPromise = (async () => {
    await db.query(`
      CREATE TABLE IF NOT EXISTS factura_venta (
        factura_id BIGINT NOT NULL,
        venta_id BIGINT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (factura_id, venta_id)
      )
    `);

    await db.query(`ALTER TABLE factura_venta ADD COLUMN IF NOT EXISTS factura_id BIGINT`);
    await db.query(`ALTER TABLE factura_venta ADD COLUMN IF NOT EXISTS venta_id BIGINT`);
    await db.query(`ALTER TABLE factura_venta ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()`);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_factura_venta_venta
      ON factura_venta(venta_id)
    `);

    await db.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'fk_factura_venta_factura'
        ) THEN
          ALTER TABLE factura_venta
            ADD CONSTRAINT fk_factura_venta_factura
            FOREIGN KEY (factura_id) REFERENCES factura(id) ON DELETE CASCADE;
        END IF;

        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'fk_factura_venta_venta'
        ) THEN
          ALTER TABLE factura_venta
            ADD CONSTRAINT fk_factura_venta_venta
            FOREIGN KEY (venta_id) REFERENCES venta(id) ON DELETE CASCADE;
        END IF;
      END $$;
    `);
  })().catch((err) => {
    schemaPromise = null;
    throw err;
  });

  return schemaPromise;
}

async function ventaTieneFactura(queryable, ventaId) {
  await ensureFacturaVentaSchema();

  const result = await queryable.query(
    `SELECT 1
     FROM factura f
     LEFT JOIN factura_venta fv ON fv.factura_id = f.id
     WHERE f.venta_id = $1 OR fv.venta_id = $1
     LIMIT 1`,
    [ventaId]
  );

  return result.rowCount > 0;
}

async function registrarFacturaVentas(queryable, facturaId, ventaIds = []) {
  await ensureFacturaVentaSchema();

  const ventasUnicas = [...new Set(
    ventaIds
      .map((ventaId) => Number(ventaId))
      .filter((ventaId) => Number.isFinite(ventaId) && ventaId > 0)
  )];

  for (const ventaId of ventasUnicas) {
    await queryable.query(
      `INSERT INTO factura_venta (factura_id, venta_id)
       VALUES ($1, $2)
       ON CONFLICT (factura_id, venta_id) DO NOTHING`,
      [facturaId, ventaId]
    );
  }
}

module.exports = {
  ensureFacturaVentaSchema,
  ventaTieneFactura,
  registrarFacturaVentas
};
