/**
 * Alinea bases PostgreSQL antiguas o parciales con lo que el backend espera hoy:
 * - tablas proveedor y comprador
 * - secuencia venta_numero_seq alineada con venta.numero
 * - columnas venta (empresa_id, terminal_id, usuario_id, …) para POST /api/venta/nuevo
 * - columnas cotizacion.moneda / valor_indice / activa
 * - columnas usuario modo_factura / modo_impresion / modo_confirmacion
 */
const db = require("../db");

let schemaPromise = null;

async function columnExists(client, table, column) {
  const r = await client.query(
    `
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
        AND column_name = $2
      LIMIT 1
    `,
    [table, column]
  );
  return Boolean(r.rowCount);
}

async function tableExists(client, table) {
  const r = await client.query(
    `
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = $1
      LIMIT 1
    `,
    [table]
  );
  return Boolean(r.rowCount);
}

async function ensureProveedorTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS proveedor (
      id SERIAL PRIMARY KEY,
      nombre VARCHAR(200) NOT NULL,
      razon_social VARCHAR(250),
      ruc VARCHAR(40),
      telefono VARCHAR(80),
      direccion VARCHAR(250),
      email VARCHAR(120),
      activo BOOLEAN NOT NULL DEFAULT true,
      creado_en TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_proveedor_activo ON proveedor(activo)
  `);
}

async function ensureCompradorTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS comprador (
      id SERIAL PRIMARY KEY,
      nombre VARCHAR(200) NOT NULL,
      activo BOOLEAN NOT NULL DEFAULT true
    )
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_comprador_activo ON comprador(activo)
  `);
}

/**
 * Sin esta secuencia, POST /api/venta/nuevo falla al llamar nextval('venta_numero_seq').
 */
async function ensureVentaNumeroSequence(client) {
  if (!(await tableExists(client, "venta"))) return;

  await client.query(`
    CREATE SEQUENCE IF NOT EXISTS venta_numero_seq
  `);

  const maxR = await client.query(`
    SELECT COALESCE(MAX(numero), 0)::bigint AS m FROM venta
  `);
  const maxNum = Number(maxR.rows[0]?.m || 0);
  if (maxNum <= 0) {
    await client.query(`
      SELECT setval('venta_numero_seq', 1, false)
    `);
  } else {
    await client.query(
      `
      SELECT setval('venta_numero_seq', $1::bigint, true)
      `,
      [maxNum]
    );
  }
}

/**
 * Columnas que muchos despliegues tienen como NOT NULL o el INSERT las exige.
 */
async function ensureVentaColumnsForInsert(client) {
  if (!(await tableExists(client, "venta"))) return;

  await client.query(`
    ALTER TABLE venta
    ADD COLUMN IF NOT EXISTS empresa_id INTEGER,
    ADD COLUMN IF NOT EXISTS terminal_id INTEGER,
    ADD COLUMN IF NOT EXISTS usuario_id INTEGER,
    ADD COLUMN IF NOT EXISTS tipo_pedido_id INTEGER,
    ADD COLUMN IF NOT EXISTS tipo_operacion_id INTEGER,
    ADD COLUMN IF NOT EXISTS cliente_nombre VARCHAR(250),
    ADD COLUMN IF NOT EXISTS comision NUMERIC(14,2) DEFAULT 0
  `);

  /* Cola de espera / flex (NOT NULL sin default en algunas BD rompe INSERT) */
  await client.query(`
    ALTER TABLE venta
    ADD COLUMN IF NOT EXISTS en_espera_desde TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS en_espera_por_usuario_id BIGINT,
    ADD COLUMN IF NOT EXISTS prioridad_espera SMALLINT NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS nota_espera TEXT
  `);

  await client.query(`
    ALTER TABLE venta
    ADD COLUMN IF NOT EXISTS efectivizado_en TIMESTAMPTZ
  `);

  await client.query(`
    ALTER TABLE venta
    ALTER COLUMN prioridad_espera SET DEFAULT 1
  `).catch(() => {});
}

async function ensureCotizacionCompat(client) {
  const hasTable = await tableExists(client, "cotizacion");
  if (!hasTable) {
    await client.query(`
      CREATE TABLE cotizacion (
        id BIGSERIAL PRIMARY KEY,
        moneda VARCHAR(40) NOT NULL,
        valor_indice NUMERIC(18,6) NOT NULL DEFAULT 0,
        activa BOOLEAN NOT NULL DEFAULT true,
        fecha TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_cotizacion_activa ON cotizacion(activa, id DESC)
    `);
    return;
  }

  if (!(await columnExists(client, "cotizacion", "moneda"))) {
    await client.query(`ALTER TABLE cotizacion ADD COLUMN moneda VARCHAR(40)`);
  }
  if (!(await columnExists(client, "cotizacion", "valor_indice"))) {
    await client.query(
      `ALTER TABLE cotizacion ADD COLUMN valor_indice NUMERIC(18,6) NOT NULL DEFAULT 0`
    );
  }
  if (!(await columnExists(client, "cotizacion", "activa"))) {
    await client.query(
      `ALTER TABLE cotizacion ADD COLUMN activa BOOLEAN NOT NULL DEFAULT true`
    );
  }

  /* Rellenar moneda desde moneda_id si existía */
  if (await columnExists(client, "cotizacion", "moneda_id")) {
    await client.query(`
      UPDATE cotizacion c
      SET moneda = CASE COALESCE(c.moneda_id, 0)
          WHEN 2 THEN 'REAL'
          WHEN 3 THEN 'DOLAR'
          ELSE c.moneda
        END
      WHERE (c.moneda IS NULL OR TRIM(c.moneda) = '')
        AND c.moneda_id IN (2, 3)
    `);

    if (await tableExists(client, "moneda")) {
      await client.query(`
        UPDATE cotizacion c
        SET moneda = UPPER(TRIM(m.nombre))
        FROM moneda m
        WHERE c.moneda_id = m.id
          AND (c.moneda IS NULL OR TRIM(c.moneda) = '')
      `);
    }
  }

  await client.query(`
    UPDATE cotizacion
    SET activa = COALESCE(activa, true)
    WHERE activa IS NULL
  `);

  await client.query(`
    UPDATE cotizacion
    SET valor_indice = COALESCE(valor_indice, 0)
    WHERE valor_indice IS NULL
  `);

  /* Filas huérfanas sin texto de moneda: no deben quedar activas */
  await client.query(`
    UPDATE cotizacion
    SET activa = false
    WHERE activa = true
      AND (moneda IS NULL OR TRIM(moneda) = '')
  `);
}

async function ensureUsuarioModoColumns(client) {
  if (!(await tableExists(client, "usuario"))) return;

  await client.query(`
    ALTER TABLE usuario
    ADD COLUMN IF NOT EXISTS modo_factura VARCHAR(30) DEFAULT 'TICKET'
  `);
  await client.query(`
    ALTER TABLE usuario
    ADD COLUMN IF NOT EXISTS modo_impresion VARCHAR(30) DEFAULT 'NORMAL'
  `);
  await client.query(`
    ALTER TABLE usuario
    ADD COLUMN IF NOT EXISTS modo_confirmacion VARCHAR(30) DEFAULT 'SI'
  `);

  await client.query(`
    UPDATE usuario
    SET modo_factura = COALESCE(NULLIF(TRIM(modo_factura), ''), 'TICKET'),
        modo_impresion = COALESCE(NULLIF(TRIM(modo_impresion), ''), 'NORMAL'),
        modo_confirmacion = COALESCE(NULLIF(TRIM(modo_confirmacion), ''), 'SI')
  `);
}

async function ensureSchemaCompat() {
  if (schemaPromise) return schemaPromise;

  schemaPromise = (async () => {
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      await ensureProveedorTable(client);
      await ensureCompradorTable(client);
      await ensureVentaNumeroSequence(client);
      await ensureVentaColumnsForInsert(client);
      await ensureCotizacionCompat(client);
      await ensureUsuarioModoColumns(client);
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  })().catch((err) => {
    schemaPromise = null;
    throw err;
  });

  return schemaPromise;
}

module.exports = {
  ensureSchemaCompat,
  ensureVentaColumnsForInsert
};
