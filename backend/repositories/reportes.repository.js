const db = require("../db");

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toPositiveInt(value, fallback) {
  const n = Math.trunc(toNumber(value, fallback));
  return n > 0 ? n : fallback;
}

function buildComprasWhere(filters = {}) {
  const params = [];
  const where = ["c.movimiento = 'COMPRA'"];

  if (toPositiveInt(filters.empresa_id, 0) > 0) {
    params.push(toPositiveInt(filters.empresa_id, 0));
    where.push(`c.empresa_id = $${params.length}`);
  }

  if (filters.desde) {
    params.push(filters.desde);
    where.push(`c.fecha::date >= $${params.length}`);
  }

  if (filters.hasta) {
    params.push(filters.hasta);
    where.push(`c.fecha::date <= $${params.length}`);
  }

  if (filters.estado) {
    params.push(String(filters.estado).trim().toUpperCase());
    where.push(`c.estado = $${params.length}`);
  }

  if (toPositiveInt(filters.proveedor_id, 0) > 0) {
    params.push(toPositiveInt(filters.proveedor_id, 0));
    where.push(`c.proveedor_id = $${params.length}`);
  }

  if (filters.proveedor) {
    params.push(`%${String(filters.proveedor).trim()}%`);
    where.push(`p.nombre ILIKE $${params.length}`);
  }

  if (toPositiveInt(filters.moneda_id, 0) > 0) {
    params.push(toPositiveInt(filters.moneda_id, 0));
    where.push(`c.moneda_id = $${params.length}`);
  }

  if (toPositiveInt(filters.producto_id, 0) > 0) {
    params.push(toPositiveInt(filters.producto_id, 0));
    where.push(`EXISTS (
      SELECT 1 FROM compra_detalle cd2
      WHERE cd2.compra_id = c.id
        AND cd2.producto_id = $${params.length}
    )`);
  }

  if (filters.producto) {
    params.push(`%${String(filters.producto).trim()}%`);
    where.push(`EXISTS (
      SELECT 1
      FROM compra_detalle cd2
      JOIN producto p2 ON p2.id = cd2.producto_id
      WHERE cd2.compra_id = c.id
        AND p2.nombre ILIKE $${params.length}
    )`);
  }

  return { params, whereSql: where.length ? `WHERE ${where.join(" AND ")}` : "" };
}

async function getComprasDetallado(filters = {}) {
  const { params, whereSql } = buildComprasWhere(filters);
  const limit = toPositiveInt(filters.limit, 1000);
  params.push(limit);

  const result = await db.query(
    `
      SELECT
        c.id,
        c.fecha,
        COALESCE(c.numero_compra, CAST(c.id AS text)) AS numero_movimiento,
        c.estado,
        c.empresa_id,
        c.moneda_id,
        m.nombre AS moneda,
        p.id AS proveedor_id,
        p.nombre AS proveedor,
        co.id AS comprador_id,
        co.nombre AS comprador,
        pr.id AS producto_id,
        pr.nombre AS producto,
        cd.cantidad,
        cd.costo AS precio_unitario,
        cd.total AS subtotal
      FROM compra c
      JOIN compra_detalle cd ON cd.compra_id = c.id
      JOIN proveedor p ON p.id = c.proveedor_id
      LEFT JOIN comprador co ON co.id = c.comprador_id
      JOIN producto pr ON pr.id = cd.producto_id
      LEFT JOIN moneda m ON m.id = c.moneda_id
      ${whereSql}
      ORDER BY c.fecha DESC, c.id DESC, cd.id DESC
      LIMIT $${params.length}
    `,
    params
  );

  return result.rows;
}

async function getComprasPorProducto(filters = {}) {
  const { params, whereSql } = buildComprasWhere(filters);
  const result = await db.query(
    `
      SELECT
        pr.id AS producto_id,
        pr.nombre AS producto,
        SUM(cd.cantidad) AS cantidad,
        SUM(cd.total) AS monto,
        COUNT(DISTINCT c.id) AS movimientos
      FROM compra c
      JOIN compra_detalle cd ON cd.compra_id = c.id
      JOIN producto pr ON pr.id = cd.producto_id
      JOIN proveedor p ON p.id = c.proveedor_id
      ${whereSql}
      GROUP BY pr.id, pr.nombre
      ORDER BY monto DESC, pr.nombre ASC
    `,
    params
  );

  return result.rows;
}

async function getComprasPorProveedor(filters = {}) {
  const { params, whereSql } = buildComprasWhere(filters);
  const result = await db.query(
    `
      SELECT
        p.id AS proveedor_id,
        p.nombre AS proveedor,
        SUM(cd.cantidad) AS cantidad,
        SUM(cd.total) AS monto,
        COUNT(DISTINCT c.id) AS movimientos
      FROM compra c
      JOIN compra_detalle cd ON cd.compra_id = c.id
      JOIN proveedor p ON p.id = c.proveedor_id
      ${whereSql}
      GROUP BY p.id, p.nombre
      ORDER BY monto DESC, p.nombre ASC
    `,
    params
  );

  return result.rows;
}

async function getComprasPorFecha(filters = {}) {
  const { params, whereSql } = buildComprasWhere(filters);
  const result = await db.query(
    `
      SELECT
        c.fecha::date AS fecha,
        SUM(cd.cantidad) AS cantidad,
        SUM(cd.total) AS monto,
        COUNT(DISTINCT c.id) AS movimientos
      FROM compra c
      JOIN compra_detalle cd ON cd.compra_id = c.id
      JOIN proveedor p ON p.id = c.proveedor_id
      ${whereSql}
      GROUP BY c.fecha::date
      ORDER BY c.fecha::date DESC
    `,
    params
  );

  return result.rows;
}

function buildVentasWhere(filters = {}) {
  const params = [];
  const where = ["1=1"];

  if (filters.desde) {
    params.push(filters.desde);
    where.push(`v.fecha::date >= $${params.length}`);
  }

  if (filters.hasta) {
    params.push(filters.hasta);
    where.push(`v.fecha::date <= $${params.length}`);
  }

  if (filters.estado) {
    params.push(String(filters.estado).trim().toUpperCase());
    where.push(`v.estado = $${params.length}`);
  } else {
    where.push("v.estado = 'EFECTIVADO'");
  }

  if (toPositiveInt(filters.cliente_id, 0) > 0) {
    params.push(toPositiveInt(filters.cliente_id, 0));
    where.push(`v.cliente_id = $${params.length}`);
  }

  if (toPositiveInt(filters.vendedor_id, 0) > 0) {
    params.push(toPositiveInt(filters.vendedor_id, 0));
    where.push(`v.vendedor_id = $${params.length}`);
  }

  if (filters.cliente) {
    params.push(`%${String(filters.cliente).trim()}%`);
    where.push(`LOWER(COALESCE(c.nombre, v.cliente_nombre, '')) LIKE LOWER($${params.length})`);
  }

  if (toPositiveInt(filters.producto_id, 0) > 0) {
    params.push(toPositiveInt(filters.producto_id, 0));
    where.push(`vd.producto_id = $${params.length}`);
  }

  if (filters.producto) {
    params.push(`%${String(filters.producto).trim()}%`);
    where.push(`p.nombre ILIKE $${params.length}`);
  }

  return { params, whereSql: where.length ? `WHERE ${where.join(" AND ")}` : "" };
}

function buildVentasCommissionExpr() {
  return `
    CASE
      WHEN COALESCE(v.total, 0) > 0
        THEN COALESCE(v.comision, 0) * (COALESCE(vd.subtotal, 0) / NULLIF(v.total, 0))
      ELSE 0
    END
  `;
}

async function getVentasDetallado(filters = {}) {
  const { params, whereSql } = buildVentasWhere(filters);
  const limit = toPositiveInt(filters.limit, 1000);
  params.push(limit);
  const comisionExpr = buildVentasCommissionExpr();

  const result = await db.query(
    `
      SELECT
        v.id,
        v.fecha,
        v.numero,
        v.estado,
        COALESCE(c.id, 0) AS cliente_id,
        COALESCE(c.nombre, v.cliente_nombre, '-') AS cliente,
        ve.id AS vendedor_id,
        ve.nombre AS vendedor,
        p.id AS producto_id,
        p.nombre AS producto,
        vd.cantidad,
        vd.precio AS precio_unitario,
        vd.subtotal,
        ${comisionExpr} AS comision
      FROM venta_detalle vd
      JOIN venta v ON v.id = vd.venta_id
      JOIN producto p ON p.id = vd.producto_id
      LEFT JOIN cliente c ON c.id = v.cliente_id
      LEFT JOIN vendedor ve ON ve.id = v.vendedor_id
      ${whereSql}
      ORDER BY v.fecha DESC, v.id DESC, vd.id DESC
      LIMIT $${params.length}
    `,
    params
  );

  return result.rows;
}

async function getVentasPorProducto(filters = {}) {
  const { params, whereSql } = buildVentasWhere(filters);
  const comisionExpr = buildVentasCommissionExpr();
  const result = await db.query(
    `
      SELECT
        p.id AS producto_id,
        p.nombre AS producto,
        SUM(vd.cantidad) AS cantidad,
        SUM(vd.subtotal) AS monto,
        SUM(${comisionExpr}) AS comision_total,
        COUNT(DISTINCT v.id) AS movimientos
      FROM venta_detalle vd
      JOIN venta v ON v.id = vd.venta_id
      JOIN producto p ON p.id = vd.producto_id
      LEFT JOIN cliente c ON c.id = v.cliente_id
      ${whereSql}
      GROUP BY p.id, p.nombre
      ORDER BY monto DESC, p.nombre ASC
    `,
    params
  );

  return result.rows;
}

async function getVentasPorCliente(filters = {}) {
  const { params, whereSql } = buildVentasWhere(filters);
  const comisionExpr = buildVentasCommissionExpr();
  const result = await db.query(
    `
      SELECT
        COALESCE(c.id, 0) AS cliente_id,
        COALESCE(c.nombre, v.cliente_nombre, 'Sin cliente') AS cliente,
        SUM(vd.cantidad) AS cantidad,
        SUM(vd.subtotal) AS monto,
        SUM(${comisionExpr}) AS comision_total,
        COUNT(DISTINCT v.id) AS movimientos
      FROM venta_detalle vd
      JOIN venta v ON v.id = vd.venta_id
      JOIN producto p ON p.id = vd.producto_id
      LEFT JOIN cliente c ON c.id = v.cliente_id
      ${whereSql}
      GROUP BY COALESCE(c.id, 0), COALESCE(c.nombre, v.cliente_nombre, 'Sin cliente')
      ORDER BY monto DESC, cliente ASC
    `,
    params
  );

  return result.rows;
}

async function getVentasPorFecha(filters = {}) {
  const { params, whereSql } = buildVentasWhere(filters);
  const comisionExpr = buildVentasCommissionExpr();
  const result = await db.query(
    `
      SELECT
        v.fecha::date AS fecha,
        SUM(vd.cantidad) AS cantidad,
        SUM(vd.subtotal) AS monto,
        SUM(${comisionExpr}) AS comision_total,
        COUNT(DISTINCT v.id) AS movimientos
      FROM venta_detalle vd
      JOIN venta v ON v.id = vd.venta_id
      JOIN producto p ON p.id = vd.producto_id
      LEFT JOIN cliente c ON c.id = v.cliente_id
      ${whereSql}
      GROUP BY v.fecha::date
      ORDER BY v.fecha::date DESC
    `,
    params
  );

  return result.rows;
}

async function getVentasPorVendedor(filters = {}) {
  const { params, whereSql } = buildVentasWhere(filters);
  const comisionExpr = buildVentasCommissionExpr();
  const result = await db.query(
    `
      SELECT
        COALESCE(ve.id, 0) AS vendedor_id,
        COALESCE(ve.nombre, 'Sin vendedor') AS vendedor,
        SUM(vd.cantidad) AS cantidad,
        SUM(vd.subtotal) AS monto,
        SUM(${comisionExpr}) AS comision_total,
        COUNT(DISTINCT v.id) AS movimientos
      FROM venta_detalle vd
      JOIN venta v ON v.id = vd.venta_id
      JOIN producto p ON p.id = vd.producto_id
      LEFT JOIN cliente c ON c.id = v.cliente_id
      LEFT JOIN vendedor ve ON ve.id = v.vendedor_id
      ${whereSql}
      GROUP BY COALESCE(ve.id, 0), COALESCE(ve.nombre, 'Sin vendedor')
      ORDER BY comision_total DESC, vendedor ASC
    `,
    params
  );

  return result.rows;
}

function buildCajaWhere(filters = {}) {
  const params = [];
  const where = ["1=1"];

  if (filters.desde) {
    params.push(filters.desde);
    where.push(`cm.fecha >= $${params.length}`);
  }

  if (filters.hasta) {
    params.push(filters.hasta);
    where.push(`cm.fecha <= $${params.length}`);
  }

  if (toPositiveInt(filters.caja_id, 0) > 0) {
    params.push(toPositiveInt(filters.caja_id, 0));
    where.push(`cm.caja_id = $${params.length}`);
  }

  if (toPositiveInt(filters.venta_id, 0) > 0) {
    params.push(toPositiveInt(filters.venta_id, 0));
    where.push(`cm.venta_id = $${params.length}`);
  }

  if (toPositiveInt(filters.vendedor_id, 0) > 0) {
    params.push(toPositiveInt(filters.vendedor_id, 0));
    where.push(`v.vendedor_id = $${params.length}`);
  }

  return { params, whereSql: where.length ? `WHERE ${where.join(" AND ")}` : "" };
}

async function getCajaMovimientos(filters = {}) {
  const { params, whereSql } = buildCajaWhere(filters);
  const limit = toPositiveInt(filters.limit, 1000);
  params.push(limit);

  const result = await db.query(
    `
      SELECT
        cm.id,
        cm.fecha,
        cm.caja_id,
        cm.venta_id,
        v.numero AS numero_venta,
        ven.id AS vendedor_id,
        ven.nombre AS vendedor,
        cm.total_venta,
        cm.pago_efectivo,
        cm.pago_efectivo_real,
        cm.pago_efectivo_dolar,
        cm.cotizacion_real,
        cm.cotizacion_dolar,
        cm.pago_tarjeta,
        cm.pago_transferencia,
        cm.pago_pix,
        cm.vuelto,
        cm.vuelto_real,
        cm.vuelto_dolar
      FROM caja_movimiento cm
      LEFT JOIN venta v ON v.id = cm.venta_id
      LEFT JOIN vendedor ven ON ven.id = v.vendedor_id
      ${whereSql}
      ORDER BY cm.fecha DESC, cm.id DESC
      LIMIT $${params.length}
    `,
    params
  );

  return result.rows;
}

async function getCajaResumenPorDia(filters = {}) {
  const { params, whereSql } = buildCajaWhere(filters);
  const result = await db.query(
    `
      SELECT
        cm.fecha::date AS fecha,
        COUNT(*) AS movimientos,
        COALESCE(SUM(cm.total_venta), 0) AS total_venta,
        COALESCE(SUM(cm.pago_efectivo), 0) AS efectivo_gs,
        COALESCE(SUM(cm.pago_tarjeta), 0) AS tarjeta,
        COALESCE(SUM(cm.pago_transferencia), 0) AS transferencia,
        COALESCE(SUM(cm.pago_pix), 0) AS pix,
        COALESCE(SUM(cm.vuelto), 0) AS vuelto_total
      FROM caja_movimiento cm
      LEFT JOIN venta v ON v.id = cm.venta_id
      ${whereSql}
      GROUP BY cm.fecha::date
      ORDER BY cm.fecha::date DESC
    `,
    params
  );

  return result.rows;
}

async function getCajaResumenMetodoPago(filters = {}) {
  const { params, whereSql } = buildCajaWhere(filters);
  const result = await db.query(
    `
      WITH base AS (
        SELECT
          cm.*, 
          (COALESCE(cm.pago_efectivo, 0)
            + COALESCE(cm.pago_tarjeta, 0)
            + COALESCE(cm.pago_transferencia, 0)
            + COALESCE(cm.pago_pix, 0)
            + COALESCE(cm.pago_efectivo_real, 0) * COALESCE(cm.cotizacion_real, 0)
            + COALESCE(cm.pago_efectivo_dolar, 0) * COALESCE(cm.cotizacion_dolar, 0)
          ) AS total_pagado_gs
        FROM caja_movimiento cm
        LEFT JOIN venta v ON v.id = cm.venta_id
        ${whereSql}
      )
      SELECT * FROM (
        SELECT 'EFECTIVO_GS' AS metodo, COALESCE(SUM(pago_efectivo), 0)::numeric AS monto
        FROM base
        UNION ALL
        SELECT 'EFECTIVO_BRL', COALESCE(SUM(pago_efectivo_real), 0)::numeric FROM base
        UNION ALL
        SELECT 'EFECTIVO_USD', COALESCE(SUM(pago_efectivo_dolar), 0)::numeric FROM base
        UNION ALL
        SELECT 'TARJETA', COALESCE(SUM(pago_tarjeta), 0)::numeric FROM base
        UNION ALL
        SELECT 'TRANSFERENCIA', COALESCE(SUM(pago_transferencia), 0)::numeric FROM base
        UNION ALL
        SELECT 'PIX', COALESCE(SUM(pago_pix), 0)::numeric FROM base
        UNION ALL
        SELECT 'TOTAL_PAGADO_GS', COALESCE(SUM(total_pagado_gs), 0)::numeric FROM base
      ) q
      ORDER BY metodo
    `,
    params
  );

  return result.rows;
}

module.exports = {
  getCajaMovimientos,
  getCajaResumenMetodoPago,
  getCajaResumenPorDia,
  getComprasDetallado,
  getComprasPorFecha,
  getComprasPorProducto,
  getComprasPorProveedor,
  getVentasDetallado,
  getVentasPorCliente,
  getVentasPorFecha,
  getVentasPorProducto,
  getVentasPorVendedor
};
