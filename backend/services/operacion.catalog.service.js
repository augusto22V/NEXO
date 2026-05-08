const db = require("../db");

const OPERACIONES_BASE = Object.freeze([
  // ENTRADAS (E)
  { codigo: 9, descripcion: "COMPRA A VISTA", tipo: "E", afecta_stock: true, requiere_confirmacion: false, genera_financiero: true, requiere_credito: false, activo: true },
  { codigo: 7, descripcion: "RETORNO ESTOQUE CONDICIONAL", tipo: "E", afecta_stock: true, requiere_confirmacion: false, genera_financiero: false, requiere_credito: false, activo: true },
  { codigo: 10, descripcion: "COMPRA A CREDITO", tipo: "E", afecta_stock: true, requiere_confirmacion: false, genera_financiero: true, requiere_credito: true, activo: true },
  { codigo: 11, descripcion: "ENTRADA DE MERCADERIA", tipo: "E", afecta_stock: true, requiere_confirmacion: false, genera_financiero: false, requiere_credito: false, activo: true },
  { codigo: 15, descripcion: "ENTRADA MERCADERIA P/ ACERTO DE ESTOQUE", tipo: "E", afecta_stock: true, requiere_confirmacion: false, genera_financiero: false, requiere_credito: false, activo: true },
  { codigo: 17, descripcion: "ENTRADA POR TRANSFERENCIA", tipo: "E", afecta_stock: true, requiere_confirmacion: false, genera_financiero: false, requiere_credito: false, activo: true },
  { codigo: 20, descripcion: "ENTRADA DE OTRO SISTEMA", tipo: "E", afecta_stock: true, requiere_confirmacion: false, genera_financiero: false, requiere_credito: false, activo: true },
  { codigo: 31, descripcion: "OPERACION DE DEVOLUCION DE VENTAS", tipo: "E", afecta_stock: true, requiere_confirmacion: false, genera_financiero: true, requiere_credito: false, activo: true },
  { codigo: 33, descripcion: "OPERACION DE ENTRADA POR TROCA MERCADERIA", tipo: "E", afecta_stock: true, requiere_confirmacion: false, genera_financiero: false, requiere_credito: false, activo: true },
  { codigo: 36, descripcion: "ENTRADA MERCADERIA SOBRANDO", tipo: "E", afecta_stock: true, requiere_confirmacion: false, genera_financiero: false, requiere_credito: false, activo: true },
  { codigo: 41, descripcion: "OPERACION DE RETORNO DE MATERIA PRIMA", tipo: "E", afecta_stock: true, requiere_confirmacion: false, genera_financiero: false, requiere_credito: false, activo: true },
  { codigo: 42, descripcion: "SALIDA POR DEVOLUCION DE VENTA", tipo: "E", afecta_stock: true, requiere_confirmacion: false, genera_financiero: true, requiere_credito: false, activo: true },
  { codigo: 44, descripcion: "OPERACION ENTRADA POR IMPORTACION", tipo: "E", afecta_stock: true, requiere_confirmacion: false, genera_financiero: false, requiere_credito: false, activo: true },

  // SALIDAS (S)
  { codigo: 1, descripcion: "VENDA A VISTA - ATACADO", tipo: "S", afecta_stock: true, requiere_confirmacion: false, genera_financiero: true, requiere_credito: false, activo: true },
  { codigo: 4, descripcion: "VENDA A CREDITO - VAREJO", tipo: "S", afecta_stock: true, requiere_confirmacion: false, genera_financiero: true, requiere_credito: true, activo: true },
  { codigo: 2, descripcion: "VENDA A CREDITO - ATACADO", tipo: "S", afecta_stock: true, requiere_confirmacion: false, genera_financiero: true, requiere_credito: true, activo: true },
  { codigo: 5, descripcion: "SAIDA POR CONDICIONAL", tipo: "S", afecta_stock: true, requiere_confirmacion: false, genera_financiero: false, requiere_credito: false, activo: true },
  { codigo: 6, descripcion: "VENDA DE CONDICIONAL", tipo: "S", afecta_stock: true, requiere_confirmacion: false, genera_financiero: true, requiere_credito: false, activo: true },
  { codigo: 8, descripcion: "SAIDA USO EMPRESA - LOJA", tipo: "S", afecta_stock: true, requiere_confirmacion: false, genera_financiero: false, requiere_credito: false, activo: true },
  { codigo: 12, descripcion: "PRESUPUESTO", tipo: "S", afecta_stock: false, requiere_confirmacion: false, genera_financiero: false, requiere_credito: false, activo: true },
  { codigo: 13, descripcion: "OPERACAO DE PRE-VENDA", tipo: "S", afecta_stock: false, requiere_confirmacion: false, genera_financiero: false, requiere_credito: false, activo: true },
  { codigo: 14, descripcion: "SAIDA MERCADORIA P/ ACERTO DE ESTOQUE", tipo: "S", afecta_stock: true, requiere_confirmacion: false, genera_financiero: false, requiere_credito: false, activo: true },
  { codigo: 16, descripcion: "SAIDA POR TRANSFERENCIA", tipo: "S", afecta_stock: true, requiere_confirmacion: false, genera_financiero: false, requiere_credito: false, activo: true },
  { codigo: 3, descripcion: "VENDA A VISTA - VAREJO", tipo: "S", afecta_stock: true, requiere_confirmacion: false, genera_financiero: true, requiere_credito: false, activo: true },
  { codigo: 21, descripcion: "PRESUPUESTO", tipo: "S", afecta_stock: false, requiere_confirmacion: false, genera_financiero: false, requiere_credito: false, activo: true },
  { codigo: 30, descripcion: "MERCADERIA FALTANTE", tipo: "S", afecta_stock: true, requiere_confirmacion: false, genera_financiero: false, requiere_credito: false, activo: true },
  { codigo: 18, descripcion: "RECEBIMENTO DE PRE-VENDA AL CONTADO", tipo: "S", afecta_stock: true, requiere_confirmacion: false, genera_financiero: true, requiere_credito: false, activo: true },
  { codigo: 19, descripcion: "RECEBIMENTO DE PRE-VENDA A CREDITO", tipo: "S", afecta_stock: true, requiere_confirmacion: false, genera_financiero: true, requiere_credito: true, activo: true },
  { codigo: 32, descripcion: "OPERACAO DE SAIDA POR TROCA MERCADERIA", tipo: "S", afecta_stock: true, requiere_confirmacion: false, genera_financiero: false, requiere_credito: false, activo: true },
  { codigo: 37, descripcion: "PRE-VENDA - ATACADO", tipo: "S", afecta_stock: false, requiere_confirmacion: false, genera_financiero: false, requiere_credito: false, activo: true },
  { codigo: 34, descripcion: "USO PERSONAL / CASA", tipo: "S", afecta_stock: true, requiere_confirmacion: false, genera_financiero: false, requiere_credito: false, activo: true },
  { codigo: 35, descripcion: "MERCADERIA FALTANTE", tipo: "S", afecta_stock: true, requiere_confirmacion: false, genera_financiero: false, requiere_credito: false, activo: true },
  { codigo: 38, descripcion: "PRE-VENDA - VM", tipo: "S", afecta_stock: false, requiere_confirmacion: false, genera_financiero: false, requiere_credito: false, activo: true },
  { codigo: 22, descripcion: "PRESUPUESTO - VM", tipo: "S", afecta_stock: false, requiere_confirmacion: false, genera_financiero: false, requiere_credito: false, activo: true },
  { codigo: 23, descripcion: "PRESUPUESTO - VN", tipo: "S", afecta_stock: false, requiere_confirmacion: false, genera_financiero: false, requiere_credito: false, activo: true },
  { codigo: 39, descripcion: "OPERACAO DE DEVOLUCAO DE COMPRA", tipo: "S", afecta_stock: true, requiere_confirmacion: false, genera_financiero: false, requiere_credito: false, activo: true },
  { codigo: 40, descripcion: "OPERACAO DE BAIXA DE MATERIA PRIMA", tipo: "S", afecta_stock: true, requiere_confirmacion: false, genera_financiero: false, requiere_credito: false, activo: true },
  { codigo: 43, descripcion: "SALIDA POR REMISION", tipo: "S", afecta_stock: true, requiere_confirmacion: false, genera_financiero: false, requiere_credito: false, activo: true },
  { codigo: 45, descripcion: "BRINDIS PARA CLIENTES", tipo: "S", afecta_stock: true, requiere_confirmacion: false, genera_financiero: false, requiere_credito: false, activo: true }
]);

let schemaPromise = null;

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeTipo(value) {
  const tipo = String(value || "").trim().toUpperCase();
  return tipo === "S" ? "S" : "E";
}

function normalizeOperacion(item) {
  const requiereCredito = Boolean(item.requiere_credito);
  return {
    codigo: Number(item.codigo),
    descripcion: normalizeText(item.descripcion),
    tipo: normalizeTipo(item.tipo),
    afecta_stock: Boolean(item.afecta_stock),
    requiere_confirmacion: Boolean(item.requiere_confirmacion),
    genera_financiero: Boolean(item.genera_financiero),
    permite_credito: requiereCredito,
    requiere_credito: requiereCredito,
    activo: item.activo !== false
  };
}

async function ensureSchemaColumns() {
  await db.query(`
    ALTER TABLE tipo_operacion
    ADD COLUMN IF NOT EXISTS codigo INTEGER
  `);
  await db.query(`
    ALTER TABLE tipo_operacion
    ADD COLUMN IF NOT EXISTS descripcion VARCHAR(120)
  `);
  await db.query(`
    ALTER TABLE tipo_operacion
    ADD COLUMN IF NOT EXISTS tipo CHAR(1)
  `);
  await db.query(`
    ALTER TABLE tipo_operacion
    ADD COLUMN IF NOT EXISTS afecta_stock BOOLEAN DEFAULT false
  `);
  await db.query(`
    ALTER TABLE tipo_operacion
    ADD COLUMN IF NOT EXISTS requiere_confirmacion BOOLEAN DEFAULT false
  `);
  await db.query(`
    ALTER TABLE tipo_operacion
    ADD COLUMN IF NOT EXISTS genera_financiero BOOLEAN DEFAULT false
  `);
  await db.query(`
    ALTER TABLE tipo_operacion
    ADD COLUMN IF NOT EXISTS permite_credito BOOLEAN DEFAULT false
  `);
  await db.query(`
    ALTER TABLE tipo_operacion
    ADD COLUMN IF NOT EXISTS requiere_credito BOOLEAN DEFAULT false
  `);
  await db.query(`
    ALTER TABLE tipo_operacion
    ADD COLUMN IF NOT EXISTS activo BOOLEAN DEFAULT true
  `);

  await db.query(`
    UPDATE tipo_operacion
    SET tipo = 'E'
    WHERE tipo IS NULL
       OR TRIM(tipo::text) = ''
       OR UPPER(TRIM(tipo::text)) NOT IN ('E', 'S')
  `);
  await db.query(`
    UPDATE tipo_operacion
    SET afecta_stock = COALESCE(afecta_stock, false),
        requiere_confirmacion = COALESCE(requiere_confirmacion, false),
        genera_financiero = COALESCE(genera_financiero, false),
        permite_credito = COALESCE(permite_credito, false),
        requiere_credito = COALESCE(requiere_credito, false),
        activo = COALESCE(activo, true)
  `);

  await db.query(`
    ALTER TABLE compra
    ADD COLUMN IF NOT EXISTS tipo_operacion_id INTEGER
  `);
  await db.query(`
    ALTER TABLE venta
    ADD COLUMN IF NOT EXISTS tipo_operacion_id INTEGER
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_compra_tipo_operacion_id
    ON compra(tipo_operacion_id)
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_venta_tipo_operacion_id
    ON venta(tipo_operacion_id)
  `);

  await db.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_compra_tipo_operacion'
      ) THEN
        ALTER TABLE compra
        ADD CONSTRAINT fk_compra_tipo_operacion
        FOREIGN KEY (tipo_operacion_id) REFERENCES tipo_operacion(id);
      END IF;

      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_venta_tipo_operacion'
      ) THEN
        ALTER TABLE venta
        ADD CONSTRAINT fk_venta_tipo_operacion
        FOREIGN KEY (tipo_operacion_id) REFERENCES tipo_operacion(id);
      END IF;
    END $$;
  `);
}

async function upsertOperacionBase(item) {
  const op = normalizeOperacion(item);

  const byCodigo = await db.query(
    `
      SELECT id
      FROM tipo_operacion
      WHERE codigo = $1
      LIMIT 1
    `,
    [op.codigo]
  );

  if (byCodigo.rowCount) {
    await db.query(
      `
        UPDATE tipo_operacion
        SET descripcion = $1,
            tipo = $2,
            afecta_stock = $3,
            requiere_confirmacion = $4,
            genera_financiero = $5,
            permite_credito = $6,
            requiere_credito = $7,
            activo = $8
        WHERE id = $9
      `,
      [
        op.descripcion,
        op.tipo,
        op.afecta_stock,
        op.requiere_confirmacion,
        op.genera_financiero,
        op.permite_credito,
        op.requiere_credito,
        op.activo,
        byCodigo.rows[0].id
      ]
    );
    return;
  }

  await db.query(
    `
      INSERT INTO tipo_operacion
        (
          codigo,
          descripcion,
          tipo,
          afecta_stock,
          requiere_confirmacion,
          genera_financiero,
          permite_credito,
          requiere_credito,
          activo
        )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    `,
    [
      op.codigo,
      op.descripcion,
      op.tipo,
      op.afecta_stock,
      op.requiere_confirmacion,
      op.genera_financiero,
      op.permite_credito,
      op.requiere_credito,
      op.activo
    ]
  );
}

async function seedOperacionesBase() {
  for (const item of OPERACIONES_BASE) {
    await upsertOperacionBase(item);
  }
}

async function ensureOperacionCatalogSchema() {
  if (schemaPromise) return schemaPromise;

  schemaPromise = (async () => {
    await ensureSchemaColumns();
    await seedOperacionesBase();
  })();

  try {
    await schemaPromise;
  } catch (error) {
    schemaPromise = null;
    throw error;
  }
}

async function findDefaultOperacionVentaId() {
  const pref = await db.query(
    `
      SELECT id
      FROM tipo_operacion
      WHERE COALESCE(activo, true) = true
        AND UPPER(TRIM(tipo::text)) = 'S'
      ORDER BY
        CASE
          WHEN codigo = 1 THEN 0
          WHEN codigo = 3 THEN 1
          WHEN codigo = 18 THEN 2
          WHEN codigo = 2 THEN 3
          WHEN codigo = 4 THEN 4
          WHEN codigo = 19 THEN 5
          ELSE 10
        END,
        codigo ASC NULLS LAST,
        id ASC
      LIMIT 1
    `
  );
  if (pref.rowCount) return Number(pref.rows[0].id);
  return null;
}

module.exports = {
  OPERACIONES_BASE,
  ensureOperacionCatalogSchema,
  findDefaultOperacionVentaId
};
