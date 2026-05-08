const fs = require("fs");
const path = require("path");
const { Client } = require("pg");
const db = require("../db");
const { ensureComisionSchema } = require("../services/comision.service");
const { ensureMesaSchema } = require("../services/mesa.service");
const { ensureAuditoriaSchema } = require("../services/auditoria.service");
const { ensureProgramasSchema } = require("../services/programas.service");
const { ensureCajaSchema } = require("../services/caja.service");
const { ensurePermisosSchema } = require("../services/permisos.service");
const { ensureLoteSchema } = require("../services/lote.schema.service");
const { ensureMonedaSchema } = require("../services/moneda.schema.service");
const { ensureOperacionCatalogSchema } = require("../services/operacion.catalog.service");

const SQL_FILES = [
  "sysstoptop_manual_patch.sql",
  "venta_medio_visibilidad_y_orden.sql",
  "producto_es_insumo.sql",
  "vendedor_comisiones.sql",
  "parametros_softsys.sql",
  "compra_optimizacion.sql",
  "optimizacion_softsys.sql",
  "produccion_module.sql",
  "programas_usuario_programa.sql",
  "permisos_venta_rapida.sql",
  "permisos_feature_scope.sql",
  "lote_empresa_stock_lote.sql",
  "caja_terminal_sesiones_upgrade.sql",
  "ia_memoria_reportes.sql",
  "venta_flex_flow_patch.sql"
];

async function runSqlFile(filename) {
  const fullPath = path.join(__dirname, "..", "sql", filename);
  const sql = fs
    .readFileSync(fullPath, "utf8")
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
  console.log(`SQL: ${filename}`);
  await db.query(sql);
}

async function verifyCurrentDatabase() {
  const currentDb = await db.query("SELECT current_database() AS db");
  const dbName = currentDb.rows[0]?.db;
  if (dbName !== "SysStoptop") {
    throw new Error(`La conexion activa apunta a ${dbName}, no a SysStoptop.`);
  }
}

async function runEnsure(label, fn) {
  console.log(`ENSURE: ${label}`);
  await fn();
}

async function loadSchema(database) {
  const client = new Client({
    user: "postgres",
    host: "localhost",
    database,
    password: "1234",
    port: 5432
  });

  await client.connect();
  try {
    const tablesRes = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    const colsRes = await client.query(`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
      ORDER BY table_name, column_name
    `);

    const tables = new Set(tablesRes.rows.map((row) => row.table_name));
    const columns = new Map();

    for (const row of colsRes.rows) {
      if (!columns.has(row.table_name)) columns.set(row.table_name, new Set());
      columns.get(row.table_name).add(row.column_name);
    }

    return { tables, columns };
  } finally {
    await client.end();
  }
}

async function compareWithSys() {
  try {
    const source = await loadSchema("Sys");
    const target = await loadSchema("SysStoptop");

    const missingTables = [...source.tables]
      .filter((table) => !target.tables.has(table))
      .sort();

    const missingColumns = [];
    for (const table of [...source.tables].sort()) {
      if (!target.tables.has(table)) continue;
      const sourceCols = source.columns.get(table) || new Set();
      const targetCols = target.columns.get(table) || new Set();

      for (const column of [...sourceCols].sort()) {
        if (!targetCols.has(column)) {
          missingColumns.push(`${table}.${column}`);
        }
      }
    }

    console.log("VERIFY: missing tables vs Sys =", missingTables.length);
    if (missingTables.length) {
      console.log(missingTables.join("\n"));
    }

    console.log("VERIFY: missing columns vs Sys =", missingColumns.length);
    if (missingColumns.length) {
      console.log(missingColumns.join("\n"));
    }
  } catch (error) {
    console.log(`VERIFY: no se pudo comparar contra Sys: ${error.message}`);
  }
}

async function main() {
  await verifyCurrentDatabase();

  for (const file of SQL_FILES) {
    await runSqlFile(file);
  }

  await runEnsure("comision", ensureComisionSchema);
  await runEnsure("programas", ensureProgramasSchema);
  await runEnsure("caja", ensureCajaSchema);
  await runEnsure("permisos", ensurePermisosSchema);
  await runEnsure("lote", ensureLoteSchema);
  await runEnsure("moneda", ensureMonedaSchema);
  await runEnsure("operacion", ensureOperacionCatalogSchema);
  await runEnsure("mesa", ensureMesaSchema);
  await runEnsure("auditoria", ensureAuditoriaSchema);

  await compareWithSys();
}

main()
  .then(async () => {
    console.log("SYNC_OK");
    await db.end();
  })
  .catch(async (error) => {
    console.error("SYNC_ERROR");
    console.error(error);
    await db.end().catch(() => {});
    process.exit(1);
  });
