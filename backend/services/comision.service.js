const db = require("../db");

const TIPOS_CALCULO_COMISION = new Set(["productos", "servicios", "ambos"]);
const TIPOS_COMISION = new Set(["total_bruto", "total_neto", "cantidad"]);
let schemaPromise = null;

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function toBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1") return true;
    if (normalized === "false" || normalized === "0") return false;
  }
  return fallback;
}

function roundAmount(value) {
  return Math.round((toNumber(value) + Number.EPSILON) * 100) / 100;
}

function normalizeTipoCalculoComision(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return TIPOS_CALCULO_COMISION.has(normalized) ? normalized : "productos";
}

function normalizeTipoComision(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return TIPOS_COMISION.has(normalized) ? normalized : "total_bruto";
}

function normalizeNullablePercentage(value) {
  return roundAmount(Math.max(0, toNumber(value, 0)));
}

function normalizeVendedorCommission(vendedor = {}) {
  const tipoComision = normalizeTipoComision(vendedor.tipo_comision);
  const comisionPorCantidad = tipoComision === "cantidad" || toBoolean(vendedor.comision_por_cantidad, false);

  return {
    tipo_calculo_comision: normalizeTipoCalculoComision(vendedor.tipo_calculo_comision),
    tipo_comision: tipoComision,
    porcentaje_ventas: normalizeNullablePercentage(vendedor.porcentaje_ventas),
    porcentaje_servicios: normalizeNullablePercentage(vendedor.porcentaje_servicios),
    comision_por_cantidad: comisionPorCantidad
  };
}

function getIvaAmountFromSubtotal(subtotal, ivaTipo) {
  const gross = toNumber(subtotal, 0);
  const iva = Math.trunc(toNumber(ivaTipo, 0));

  if (gross <= 0) return 0;
  if (iva === 10) return gross / 11;
  if (iva === 5) return gross / 21;
  return 0;
}

function calcularComision(vendedor = {}, venta = {}) {
  const config = normalizeVendedorCommission(vendedor);
  const resumen = {
    total_productos_bruto: toNumber(venta.total_productos_bruto, 0),
    total_servicios_bruto: toNumber(venta.total_servicios_bruto, 0),
    total_productos_neto: toNumber(venta.total_productos_neto, 0),
    total_servicios_neto: toNumber(venta.total_servicios_neto, 0),
    cantidad_productos: toNumber(venta.cantidad_productos, 0),
    cantidad_servicios: toNumber(venta.cantidad_servicios, 0)
  };

  const usaCantidad = config.tipo_comision === "cantidad" || config.comision_por_cantidad;
  const baseProductos = usaCantidad
    ? resumen.cantidad_productos
    : config.tipo_comision === "total_neto"
      ? resumen.total_productos_neto
      : resumen.total_productos_bruto;
  const baseServicios = usaCantidad
    ? resumen.cantidad_servicios
    : config.tipo_comision === "total_neto"
      ? resumen.total_servicios_neto
      : resumen.total_servicios_bruto;

  let total = 0;

  if (config.tipo_calculo_comision === "productos" || config.tipo_calculo_comision === "ambos") {
    total += baseProductos * (config.porcentaje_ventas / 100);
  }

  if (config.tipo_calculo_comision === "servicios" || config.tipo_calculo_comision === "ambos") {
    total += baseServicios * (config.porcentaje_servicios / 100);
  }

  return roundAmount(total);
}

async function ensureComisionSchema() {
  if (schemaPromise) return schemaPromise;

  schemaPromise = (async () => {
    await db.query(`
      ALTER TABLE vendedor
      ADD COLUMN IF NOT EXISTS tipo_calculo_comision VARCHAR(20) DEFAULT 'productos'
    `);
    await db.query(`
      ALTER TABLE vendedor
      ADD COLUMN IF NOT EXISTS tipo_comision VARCHAR(20) DEFAULT 'total_bruto'
    `);
    await db.query(`
      ALTER TABLE vendedor
      ADD COLUMN IF NOT EXISTS porcentaje_ventas NUMERIC(12,2) DEFAULT 0
    `);
    await db.query(`
      ALTER TABLE vendedor
      ADD COLUMN IF NOT EXISTS porcentaje_servicios NUMERIC(12,2) DEFAULT 0
    `);
    await db.query(`
      ALTER TABLE vendedor
      ADD COLUMN IF NOT EXISTS comision_por_cantidad BOOLEAN DEFAULT false
    `);
    await db.query(`
      UPDATE vendedor
      SET tipo_calculo_comision = COALESCE(NULLIF(tipo_calculo_comision, ''), 'productos'),
          tipo_comision = COALESCE(NULLIF(tipo_comision, ''), 'total_bruto'),
          porcentaje_ventas = COALESCE(porcentaje_ventas, 0),
          porcentaje_servicios = COALESCE(porcentaje_servicios, 0),
          comision_por_cantidad = COALESCE(comision_por_cantidad, false)
    `);

    await db.query(`
      ALTER TABLE venta
      ADD COLUMN IF NOT EXISTS comision NUMERIC(14,2) DEFAULT 0
    `);
    await db.query(`
      UPDATE venta
      SET comision = COALESCE(comision, 0)
      WHERE comision IS NULL
    `);

    await db.query(`
      ALTER TABLE producto
      ADD COLUMN IF NOT EXISTS es_servicio BOOLEAN DEFAULT false
    `);
    await db.query(`
      UPDATE producto
      SET es_servicio = COALESCE(es_servicio, false)
      WHERE es_servicio IS NULL
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_producto_es_servicio
      ON producto(es_servicio)
    `);
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_venta_comision_vendedor_estado
      ON venta(vendedor_id, estado, fecha)
    `);
  })();

  try {
    await schemaPromise;
  } catch (error) {
    schemaPromise = null;
    throw error;
  }
}

async function getVentaCommissionContext(client, ventaId) {
  await ensureComisionSchema();

  //  1. BLOQUEAR SOLO LA VENTA (CORRECTO)
  const ventaRes = await client.query(
    `
      SELECT
        v.id,
        v.estado,
        v.vendedor_id
      FROM venta v
      WHERE v.id = $1
      FOR UPDATE
    `,
    [ventaId]
  );

  if (!ventaRes.rowCount) {
    throw new Error("Venta no encontrada");
  }

  const venta = ventaRes.rows[0];

  //  2. TRAER CONFIG DEL VENDEDOR (SIN FOR UPDATE)
  const vendedorRes = await client.query(
    `
      SELECT
        COALESCE(tipo_calculo_comision, 'productos') AS tipo_calculo_comision,
        COALESCE(tipo_comision, 'total_bruto') AS tipo_comision,
        COALESCE(porcentaje_ventas, 0) AS porcentaje_ventas,
        COALESCE(porcentaje_servicios, 0) AS porcentaje_servicios,
        COALESCE(comision_por_cantidad, false) AS comision_por_cantidad
      FROM vendedor
      WHERE id = $1
    `,
    [venta.vendedor_id]
  );

  const vendedor = vendedorRes.rows[0] || {};

  //  3. RESUMEN DE VENTA (PRODUCTOS / SERVICIOS)
  const resumenRes = await client.query(
    `
      SELECT
        COALESCE(SUM(vd.subtotal), 0) AS total_bruto,

        COALESCE(SUM(CASE 
          WHEN COALESCE(p.es_servicio, false) THEN vd.subtotal 
          ELSE 0 
        END), 0) AS total_servicios_bruto,

        COALESCE(SUM(CASE 
          WHEN COALESCE(p.es_servicio, false) THEN 0 
          ELSE vd.subtotal 
        END), 0) AS total_productos_bruto,

        COALESCE(SUM(CASE
          WHEN COALESCE(p.es_servicio, false)
            THEN vd.subtotal
                 - CASE
                     WHEN COALESCE(p.iva_tipo, 0) = 10 THEN vd.subtotal / 11.0
                     WHEN COALESCE(p.iva_tipo, 0) = 5 THEN vd.subtotal / 21.0
                     ELSE 0
                   END
          ELSE 0
        END), 0) AS total_servicios_neto,

        COALESCE(SUM(CASE
          WHEN COALESCE(p.es_servicio, false)
            THEN 0
          ELSE vd.subtotal
               - CASE
                   WHEN COALESCE(p.iva_tipo, 0) = 10 THEN vd.subtotal / 11.0
                   WHEN COALESCE(p.iva_tipo, 0) = 5 THEN vd.subtotal / 21.0
                   ELSE 0
                 END
        END), 0) AS total_productos_neto,

        COALESCE(SUM(vd.cantidad), 0) AS cantidad_total,

        COALESCE(SUM(CASE 
          WHEN COALESCE(p.es_servicio, false) THEN vd.cantidad 
          ELSE 0 
        END), 0) AS cantidad_servicios,

        COALESCE(SUM(CASE 
          WHEN COALESCE(p.es_servicio, false) THEN 0 
          ELSE vd.cantidad 
        END), 0) AS cantidad_productos

      FROM venta_detalle vd
      JOIN producto p ON p.id = vd.producto_id
      WHERE vd.venta_id = $1
    `,
    [ventaId]
  );

  const resumen = resumenRes.rows[0] || {};

  //  4. RETORNO FINAL LIMPIO
  return {
    venta: {
      id: venta.id,
      estado: venta.estado,
      vendedor_id: venta.vendedor_id
    },

    vendedor: normalizeVendedorCommission(vendedor),

    resumen: {
      total_bruto: roundAmount(resumen.total_bruto),
      total_productos_bruto: roundAmount(resumen.total_productos_bruto),
      total_servicios_bruto: roundAmount(resumen.total_servicios_bruto),
      total_productos_neto: roundAmount(resumen.total_productos_neto),
      total_servicios_neto: roundAmount(resumen.total_servicios_neto),
      cantidad_total: toNumber(resumen.cantidad_total, 0),
      cantidad_productos: toNumber(resumen.cantidad_productos, 0),
      cantidad_servicios: toNumber(resumen.cantidad_servicios, 0)
    }
  };
}

async function recalculateVentaCommission(client, ventaId) {
  const context = await getVentaCommissionContext(client, ventaId);
  const totalVenta = roundAmount(context.resumen.total_bruto);
  const comision = context.venta.estado === "CANCELADO"
    ? 0
    : calcularComision(context.vendedor, context.resumen);

  await client.query(
    `
      UPDATE venta
      SET total = $1,
          comision = $2
      WHERE id = $3
    `,
    [totalVenta, comision, ventaId]
  );

  return {
    ventaId,
    totalVenta,
    comision,
    resumen: context.resumen,
    vendedor: context.vendedor
  };
}

module.exports = {
  calcularComision,
  ensureComisionSchema,
  getIvaAmountFromSubtotal,
  normalizeTipoCalculoComision,
  normalizeTipoComision,
  normalizeVendedorCommission,
  recalculateVentaCommission,
  roundAmount,
  toBoolean,
  toNumber
};
