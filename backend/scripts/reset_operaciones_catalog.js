const db = require("../db");
const {
  OPERACIONES_BASE,
  ensureOperacionCatalogSchema
} = require("../services/operacion.catalog.service");

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function resolveCodigoDestino(op, codigosDestino) {
  if (!op) return null;

  const codigo = Number(op.codigo);
  if (Number.isFinite(codigo) && codigosDestino.has(codigo)) return codigo;

  const tipo = String(op.tipo || "").trim().toUpperCase();
  const text = normalizeText(op.descripcion);

  const byCodigo = {
    1101: 9,
    1102: 10,
    1103: 31,
    1104: 15,
    1105: 17,
    1106: 36,
    1107: 44,
    1108: 15,
    2101: 1,
    2102: 2,
    2103: 12,
    2104: 39,
    2105: 14,
    2106: 16,
    2107: 45,
    2108: 34,
    2109: 30
  };
  if (Number.isFinite(codigo) && byCodigo[codigo]) return byCodigo[codigo];

  if (tipo === "E") {
    if (text.includes("compra") && text.includes("credito")) return 10;
    if (text.includes("compra") && (text.includes("vista") || text.includes("contado"))) return 9;
    if (text.includes("devolucion") && text.includes("venta")) return 31;
    if (text.includes("transfer")) return 17;
    if (text.includes("import")) return 44;
    if (text.includes("sobr")) return 36;
    if (text.includes("acerto")) return 15;
    if (text.includes("entrada")) return 11;
    return 9;
  }

  if (text.includes("pre-venda") && text.includes("credito")) return 19;
  if (text.includes("pre-venda") && text.includes("contado")) return 18;
  if (text.includes("pre-venda")) return 13;
  if (text.includes("presupuesto - vm")) return 22;
  if (text.includes("presupuesto - vn")) return 23;
  if (text.includes("presupuesto")) return 12;
  if ((text.includes("devolucao") || text.includes("devolucion")) && text.includes("compra")) return 39;
  if (text.includes("transfer")) return 16;
  if (text.includes("brindis")) return 45;
  if (text.includes("remision")) return 43;
  if (text.includes("condicional") && text.includes("venda")) return 6;
  if (text.includes("condicional")) return 5;
  if (text.includes("uso") || text.includes("personal")) return 34;
  if (text.includes("faltante")) return 30;
  if (text.includes("credito")) return 2;
  if (text.includes("vista") || text.includes("contado")) return 1;
  if (text.includes("venda")) return 1;
  return 1;
}

async function run() {
  await ensureOperacionCatalogSchema();

  await db.query("BEGIN");
  try {
    const oldOpsRes = await db.query(`
      SELECT id, codigo, descripcion, UPPER(TRIM(tipo::text)) AS tipo
      FROM tipo_operacion
    `);
    const oldOps = oldOpsRes.rows || [];
    const oldOpById = new Map(oldOps.map((row) => [Number(row.id), row]));

    const compraRows = (await db.query(`
      SELECT id, tipo_operacion_id
      FROM compra
      WHERE tipo_operacion_id IS NOT NULL
    `)).rows;
    const ventaRows = (await db.query(`
      SELECT id, tipo_operacion_id
      FROM venta
      WHERE tipo_operacion_id IS NOT NULL
    `)).rows;

    await db.query(`UPDATE compra SET tipo_operacion_id = NULL WHERE tipo_operacion_id IS NOT NULL`);
    await db.query(`UPDATE venta SET tipo_operacion_id = NULL WHERE tipo_operacion_id IS NOT NULL`);

    await db.query(`DELETE FROM tipo_operacion`);
    await db.query(`SELECT setval(pg_get_serial_sequence('tipo_operacion','id'), 1, false)`);

    const insertSql = `
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
      RETURNING id, codigo
    `;

    const codigosDestino = new Set(OPERACIONES_BASE.map((row) => Number(row.codigo)));
    const newByCodigo = new Map();

    for (const item of OPERACIONES_BASE) {
      const requiereCredito = Boolean(item.requiere_credito);
      const r = await db.query(insertSql, [
        Number(item.codigo),
        String(item.descripcion || "").trim(),
        String(item.tipo || "E").trim().toUpperCase() === "S" ? "S" : "E",
        Boolean(item.afecta_stock),
        Boolean(item.requiere_confirmacion),
        Boolean(item.genera_financiero),
        requiereCredito,
        requiereCredito,
        item.activo !== false
      ]);
      const row = r.rows[0];
      newByCodigo.set(Number(row.codigo), Number(row.id));
    }

    const defaultEId = newByCodigo.get(9) || null;
    const defaultSId = newByCodigo.get(1) || null;

    let compraReasignadas = 0;
    for (const row of compraRows) {
      const oldOp = oldOpById.get(Number(row.tipo_operacion_id));
      const codigoDestino = resolveCodigoDestino(oldOp, codigosDestino);
      const newId = newByCodigo.get(codigoDestino) || defaultEId;
      if (!newId) continue;
      await db.query(
        `UPDATE compra SET tipo_operacion_id = $1 WHERE id = $2`,
        [newId, Number(row.id)]
      );
      compraReasignadas += 1;
    }

    let ventaReasignadas = 0;
    for (const row of ventaRows) {
      const oldOp = oldOpById.get(Number(row.tipo_operacion_id));
      const codigoDestino = resolveCodigoDestino(oldOp, codigosDestino);
      const newId = newByCodigo.get(codigoDestino) || defaultSId;
      if (!newId) continue;
      await db.query(
        `UPDATE venta SET tipo_operacion_id = $1 WHERE id = $2`,
        [newId, Number(row.id)]
      );
      ventaReasignadas += 1;
    }

    await db.query("COMMIT");

    const total = await db.query(`SELECT COUNT(*)::int AS c FROM tipo_operacion`);
    const activos = await db.query(`SELECT COUNT(*)::int AS c FROM tipo_operacion WHERE activo = true`);
    const tipoE = await db.query(`SELECT COUNT(*)::int AS c FROM tipo_operacion WHERE UPPER(TRIM(tipo::text))='E'`);
    const tipoS = await db.query(`SELECT COUNT(*)::int AS c FROM tipo_operacion WHERE UPPER(TRIM(tipo::text))='S'`);

    console.log("Reset de tipo_operacion completado");
    console.log(` - Catalogo total: ${total.rows[0].c}`);
    console.log(` - Activos: ${activos.rows[0].c}`);
    console.log(` - Tipo E: ${tipoE.rows[0].c}`);
    console.log(` - Tipo S: ${tipoS.rows[0].c}`);
    console.log(` - Compra reasignadas: ${compraReasignadas}`);
    console.log(` - Venta reasignadas: ${ventaReasignadas}`);
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  } finally {
    await db.end();
  }
}

run().catch((error) => {
  console.error("Error reseteando catalogo de operaciones:", error);
  process.exit(1);
});

