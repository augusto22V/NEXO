async function findProductoById(client, productoId, options = {}) {
  const lock = options.forUpdate ? " FOR UPDATE" : "";
  return client.query(
    `
      SELECT id, nombre, stock, unidad_medida, no_control_stock, es_insumo, activo
      FROM producto
      WHERE id = $1
      ${lock}
    `,
    [productoId]
  );
}

async function insertReceta(client, payload) {
  return client.query(
    `
      INSERT INTO receta
        (
          producto_id,
          nombre,
          activo
        )
      VALUES ($1,$2,$3)
      RETURNING *
    `,
    [payload.producto_id, payload.nombre, payload.activo]
  );
}

async function insertRecetaDetalle(client, payload) {
  return client.query(
    `
      INSERT INTO receta_detalle
        (
          receta_id,
          producto_insumo_id,
          cantidad
        )
      VALUES ($1,$2,$3)
      RETURNING *
    `,
    [
      payload.receta_id,
      payload.producto_insumo_id,
      payload.cantidad
    ]
  );
}

async function listRecetas(client, filters = {}) {
  const params = [];
  const where = ["1=1"];

  if (filters.buscar) {
    params.push(`%${filters.buscar}%`);
    where.push(`(r.nombre ILIKE $${params.length} OR p.nombre ILIKE $${params.length})`);
  }

  if (filters.activo != null) {
    params.push(filters.activo === true);
    where.push(`r.activo = $${params.length}`);
  }

  params.push(filters.limit || 20);

  return client.query(
    `
      SELECT
        r.id,
        r.producto_id,
        r.nombre,
        r.activo,
        r.created_at,
        p.nombre AS producto_final,
        p.unidad_medida AS unidad_producto_final,
        p.es_insumo AS producto_final_es_insumo,
        COUNT(rd.id) AS insumos
      FROM receta r
      JOIN producto p ON p.id = r.producto_id
      LEFT JOIN receta_detalle rd ON rd.receta_id = r.id
      WHERE ${where.join(" AND ")}
      GROUP BY r.id, p.nombre, p.unidad_medida, p.es_insumo
      ORDER BY r.id DESC
      LIMIT $${params.length}
    `,
    params
  );
}

async function getRecetaById(client, recetaId) {
  return client.query(
    `
      SELECT
        r.id,
        r.producto_id,
        r.nombre,
        r.activo,
        r.created_at,
        p.nombre AS producto_final,
        p.unidad_medida AS unidad_producto_final,
        p.es_insumo AS producto_final_es_insumo
      FROM receta r
      JOIN producto p ON p.id = r.producto_id
      WHERE r.id = $1
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
        p.unidad_medida AS unidad_medida_producto,
        p.unidad_medida AS unidad,
        p.stock AS stock_actual,
        p.no_control_stock,
        p.es_insumo,
        p.activo
      FROM receta_detalle rd
      JOIN producto p ON p.id = rd.producto_insumo_id
      WHERE rd.receta_id = $1
      ORDER BY rd.id
      ${lock}
    `,
    [recetaId]
  );
}

module.exports = {
  findProductoById,
  getRecetaById,
  insertReceta,
  insertRecetaDetalle,
  listRecetaDetalle,
  listRecetas
};
