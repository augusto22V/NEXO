async function findRecetaById(client, recetaId, options = {}) {
  const lock = options.forUpdate ? " FOR UPDATE" : "";
  return client.query(
    `
      SELECT
        r.id,
        r.producto_id,
        r.nombre,
        r.activo,
        r.created_at,
        p.nombre AS producto_final,
        p.stock AS producto_final_stock,
        p.unidad_medida AS producto_final_unidad,
        p.no_control_stock AS producto_final_no_control_stock,
        p.es_insumo AS producto_final_es_insumo
      FROM receta r
      JOIN producto p ON p.id = r.producto_id
      WHERE r.id = $1
      ${lock}
    `,
    [recetaId]
  );
}

async function listRecetaDetalle(client, recetaId, options = {}) {
  const lock = options.forUpdate ? " FOR UPDATE OF p" : "";
  return client.query(
    `
      SELECT
        rd.id,
        rd.receta_id,
        rd.producto_insumo_id,
        rd.cantidad,
        p.nombre AS producto_insumo,
        p.stock AS stock_actual,
        p.unidad_medida AS unidad_medida_producto,
        p.unidad_medida AS unidad,
        p.no_control_stock,
        p.es_insumo
      FROM receta_detalle rd
      JOIN producto p ON p.id = rd.producto_insumo_id
      WHERE rd.receta_id = $1
      ORDER BY rd.id
      ${lock}
    `,
    [recetaId]
  );
}

async function insertProduccion(client, payload) {
  return client.query(
    `
      INSERT INTO produccion
        (
          receta_id,
          cantidad_producida,
          fecha,
          usuario_id
        )
      VALUES ($1,$2,$3,$4)
      RETURNING *
    `,
    [
      payload.receta_id,
      payload.cantidad_producida,
      payload.fecha,
      payload.usuario_id
    ]
  );
}

async function insertProduccionConsumo(client, payload) {
  return client.query(
    `
      INSERT INTO produccion_consumo
        (
          produccion_id,
          producto_insumo_id,
          cantidad_usada
        )
      VALUES ($1,$2,$3)
      RETURNING *
    `,
    [
      payload.produccion_id,
      payload.producto_insumo_id,
      payload.cantidad_usada
    ]
  );
}

async function insertStockMovimiento(client, payload) {
  return client.query(
    `
      INSERT INTO stock_movimiento
        (
          producto_id,
          empresa_id,
          tipo,
          cantidad,
          costo,
          referencia_id,
          referencia_tipo,
          lote,
          fecha_vencimiento
        )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING id
    `,
    [
      payload.producto_id,
      payload.empresa_id,
      payload.tipo,
      payload.cantidad,
      payload.costo,
      payload.referencia_id,
      payload.referencia_tipo,
      payload.lote,
      payload.fecha_vencimiento
    ]
  );
}

async function listProduccion(client, filters = {}) {
  const params = [];
  const where = ["1=1"];

  if (filters.receta_id) {
    params.push(filters.receta_id);
    where.push(`pr.receta_id = $${params.length}`);
  }

  if (filters.desde) {
    params.push(filters.desde);
    where.push(`pr.fecha::date >= $${params.length}::date`);
  }

  if (filters.hasta) {
    params.push(filters.hasta);
    where.push(`pr.fecha::date <= $${params.length}::date`);
  }

  return client.query(
    `
      SELECT
        pr.id,
        pr.receta_id,
        r.nombre AS receta_nombre,
        r.producto_id,
        p.nombre AS producto_final,
        pr.cantidad_producida,
        pr.fecha,
        pr.usuario_id,
        u.nombre AS usuario_nombre
      FROM produccion pr
      JOIN receta r ON r.id = pr.receta_id
      JOIN producto p ON p.id = r.producto_id
      LEFT JOIN usuario u ON u.id = pr.usuario_id
      WHERE ${where.join(" AND ")}
      ORDER BY pr.fecha DESC, pr.id DESC
    `,
    params
  );
}

async function getProduccionById(client, produccionId) {
  return client.query(
    `
      SELECT
        pr.id,
        pr.receta_id,
        r.nombre AS receta_nombre,
        r.producto_id,
        p.nombre AS producto_final,
        p.unidad_medida AS unidad_producto_final,
        pr.cantidad_producida,
        pr.fecha,
        pr.usuario_id,
        u.nombre AS usuario_nombre
      FROM produccion pr
      JOIN receta r ON r.id = pr.receta_id
      JOIN producto p ON p.id = r.producto_id
      LEFT JOIN usuario u ON u.id = pr.usuario_id
      WHERE pr.id = $1
    `,
    [produccionId]
  );
}

async function listProduccionConsumo(client, produccionId) {
  return client.query(
    `
      SELECT
        pc.id,
        pc.produccion_id,
        pc.producto_insumo_id,
        p.nombre AS producto_insumo,
        p.unidad_medida AS unidad_medida,
        pc.cantidad_usada
      FROM produccion_consumo pc
      JOIN producto p ON p.id = pc.producto_insumo_id
      WHERE pc.produccion_id = $1
      ORDER BY pc.id
    `,
    [produccionId]
  );
}

async function getReporteProduccion(client, filters = {}) {
  const params = [];
  const where = ["1=1"];

  if (filters.desde) {
    params.push(filters.desde);
    where.push(`pr.fecha::date >= $${params.length}::date`);
  }

  if (filters.hasta) {
    params.push(filters.hasta);
    where.push(`pr.fecha::date <= $${params.length}::date`);
  }

  const baseWhere = where.join(" AND ");

  const detalle = await client.query(
    `
      SELECT
        pr.id,
        pr.fecha,
        r.nombre AS receta,
        pf.nombre AS producto_final,
        pr.cantidad_producida,
        pc.producto_insumo_id,
        pi.nombre AS insumo,
        pc.cantidad_usada,
        pi.unidad_medida AS unidad_insumo
      FROM produccion pr
      JOIN receta r ON r.id = pr.receta_id
      JOIN producto pf ON pf.id = r.producto_id
      LEFT JOIN produccion_consumo pc ON pc.produccion_id = pr.id
      LEFT JOIN producto pi ON pi.id = pc.producto_insumo_id
      WHERE ${baseWhere}
      ORDER BY pr.fecha DESC, pr.id DESC, pc.id ASC
    `,
    params
  );

  const porFecha = await client.query(
    `
      SELECT
        pr.fecha::date AS fecha,
        COUNT(*) AS lotes,
        SUM(pr.cantidad_producida) AS cantidad_total
      FROM produccion pr
      WHERE ${baseWhere}
      GROUP BY pr.fecha::date
      ORDER BY pr.fecha::date DESC
    `,
    params
  );

  const topProducto = await client.query(
    `
      SELECT
        pf.id AS producto_id,
        pf.nombre AS producto,
        SUM(pr.cantidad_producida) AS cantidad_total
      FROM produccion pr
      JOIN receta r ON r.id = pr.receta_id
      JOIN producto pf ON pf.id = r.producto_id
      WHERE ${baseWhere}
      GROUP BY pf.id, pf.nombre
      ORDER BY cantidad_total DESC, pf.nombre ASC
      LIMIT 1
    `,
    params
  );

  const consumoResumen = await client.query(
    `
      SELECT
        pc.producto_insumo_id,
        pi.nombre AS insumo,
        pi.unidad_medida,
        SUM(pc.cantidad_usada) AS total_consumido
      FROM produccion pr
      JOIN produccion_consumo pc ON pc.produccion_id = pr.id
      JOIN producto pi ON pi.id = pc.producto_insumo_id
      WHERE ${baseWhere}
      GROUP BY pc.producto_insumo_id, pi.nombre, pi.unidad_medida
      ORDER BY total_consumido DESC, pi.nombre ASC
    `,
    params
  );

  return {
    detalle: detalle.rows,
    porFecha: porFecha.rows,
    topProducto: topProducto.rows[0] || null,
    consumoResumen: consumoResumen.rows
  };
}

module.exports = {
  findRecetaById,
  getProduccionById,
  getReporteProduccion,
  insertProduccion,
  insertProduccionConsumo,
  insertStockMovimiento,
  listProduccion,
  listProduccionConsumo,
  listRecetaDetalle
};
