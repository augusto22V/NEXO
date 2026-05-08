async function findCompraById(client, compraId, empresaId) {
  return client.query(
    `
      SELECT c.*
      FROM compra c
      WHERE c.id = $1
        AND c.empresa_id = $2
      FOR UPDATE
    `,
    [compraId, empresaId]
  );
}

async function findEmpresaById(client, empresaId) {
  return client.query(
    `
      SELECT
        e.id,
        e.nombre,
        COALESCE(e.controlar_lote, false) AS controlar_lote,
        COALESCE((
          SELECT ef.enabled
          FROM empresa_feature_config ef
          WHERE ef.empresa_id = e.id
            AND ef.feature_key = 'agrupar_item'
          LIMIT 1
        ), false) AS agrupar_item
      FROM empresa e
      WHERE e.id = $1
      LIMIT 1
    `,
    [empresaId]
  );
}

async function findCompraDetalleById(client, detalleId, empresaId) {
  return client.query(
    `
      SELECT
        cd.*,
        c.id AS compra_id,
        c.empresa_id,
        c.estado,
        c.tipo_operacion_id,
        c.moneda_id
      FROM compra_detalle cd
      JOIN compra c ON c.id = cd.compra_id
      WHERE cd.id = $1
        AND c.empresa_id = $2
      FOR UPDATE
    `,
    [detalleId, empresaId]
  );
}

async function listCompraDetalles(client, compraId) {
  return client.query(
    `
      SELECT *
      FROM compra_detalle
      WHERE compra_id = $1
      ORDER BY id
    `,
    [compraId]
  );
}

async function findCompraDetalleAgrupable(client, payload) {
  return client.query(
    `
      SELECT *
      FROM compra_detalle
      WHERE compra_id = $1
        AND producto_id = $2
        AND COALESCE(lote, '') = COALESCE($3, '')
        AND fecha_vencimiento IS NOT DISTINCT FROM $4
        AND COALESCE(moneda_id, 1) = COALESCE($5, 1)
      ORDER BY id
      LIMIT 1
      FOR UPDATE
    `,
    [
      payload.compra_id,
      payload.producto_id,
      payload.lote || null,
      payload.fecha_vencimiento || null,
      payload.moneda_id || null
    ]
  );
}

async function insertCompra(client, payload) {
  return client.query(
    `
      INSERT INTO compra
        (
          empresa_id,
          fecha,
          proveedor_id,
          comprador_id,
          condicion_pago_id,
          moneda_id,
          estado,
          total,
          movimiento,
          tipo_operacion_id,
          numero_compra,
          usuario_id,
          fecha_emision
        )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'COMPRA',$9,$10,$11,$12)
      RETURNING *
    `,
    [
      payload.empresa_id,
      payload.fecha,
      payload.proveedor_id,
      payload.comprador_id,
      payload.condicion_pago_id,
      payload.moneda_id,
      payload.estado,
      payload.total,
      payload.tipo_operacion_id,
      payload.numero_compra,
      payload.usuario_id,
      payload.fecha_emision
    ]
  );
}

async function updateCompra(client, compraId, empresaId, payload) {
  return client.query(
    `
      UPDATE compra
      SET fecha = $1,
          proveedor_id = $2,
          comprador_id = $3,
          condicion_pago_id = $4,
          moneda_id = $5,
          estado = $6,
          tipo_operacion_id = $7,
          numero_compra = $8,
          nro_comprobante = $9,
          timbrado = $10,
          fecha_emision = $11,
          actualizado_en = CURRENT_TIMESTAMP
      WHERE id = $12
        AND empresa_id = $13
      RETURNING *
    `,
    [
      payload.fecha,
      payload.proveedor_id,
      payload.comprador_id,
      payload.condicion_pago_id,
      payload.moneda_id,
      payload.estado,
      payload.tipo_operacion_id,
      payload.numero_compra,
      payload.nro_comprobante,
      payload.timbrado,
      payload.fecha_emision,
      compraId,
      empresaId
    ]
  );
}

async function updateCompraTotal(client, compraId) {
  return client.query(
    `
      UPDATE compra
      SET total = COALESCE((
            SELECT SUM(total)
            FROM compra_detalle
            WHERE compra_id = $1
          ), 0),
          actualizado_en = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING total
    `,
    [compraId]
  );
}

async function insertCompraDetalle(client, payload) {
  return client.query(
    `
      INSERT INTO compra_detalle
        (
          compra_id,
          producto_id,
          cantidad,
          costo,
          total,
          lote,
          fecha_vencimiento,
          costo_original,
          moneda_id,
          costo_moneda_origen,
          costo_gs,
          costo_brl,
          costo_usd,
          cotizacion_id
        )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      RETURNING *
    `,
    [
      payload.compra_id,
      payload.producto_id,
      payload.cantidad,
      payload.costo,
      payload.total,
      payload.lote,
      payload.fecha_vencimiento,
      payload.costo_original,
      payload.moneda_id || null,
      payload.costo_moneda_origen ?? null,
      payload.costo_gs ?? null,
      payload.costo_brl ?? null,
      payload.costo_usd ?? null,
      payload.cotizacion_id || null
    ]
  );
}

async function updateCompraDetalle(client, detalleId, payload) {
  return client.query(
    `
      UPDATE compra_detalle
      SET producto_id = $1,
          cantidad = $2,
          costo = $3,
          total = $4,
          lote = $5,
          fecha_vencimiento = $6,
          costo_original = $7,
          moneda_id = $8,
          costo_moneda_origen = $9,
          costo_gs = $10,
          costo_brl = $11,
          costo_usd = $12,
          cotizacion_id = $13
      WHERE id = $14
      RETURNING *
    `,
    [
      payload.producto_id,
      payload.cantidad,
      payload.costo,
      payload.total,
      payload.lote,
      payload.fecha_vencimiento,
      payload.costo_original,
      payload.moneda_id || null,
      payload.costo_moneda_origen ?? null,
      payload.costo_gs ?? null,
      payload.costo_brl ?? null,
      payload.costo_usd ?? null,
      payload.cotizacion_id || null,
      detalleId
    ]
  );
}

async function deleteCompraDetalle(client, detalleId) {
  return client.query(
    `DELETE FROM compra_detalle WHERE id = $1 RETURNING *`,
    [detalleId]
  );
}

async function deleteCompra(client, compraId, empresaId) {
  return client.query(
    `
      DELETE FROM compra
      WHERE id = $1
        AND empresa_id = $2
      RETURNING id
    `,
    [compraId, empresaId]
  );
}

async function findProveedorById(client, proveedorId) {
  return client.query(`SELECT * FROM proveedor WHERE id = $1`, [proveedorId]);
}

async function createProveedor(client, payload) {
  return client.query(
    `
      INSERT INTO proveedor (nombre, ruc, telefono, direccion, email, razon_social, activo)
      VALUES ($1,$2,$3,$4,$5,$6,true)
      RETURNING *
    `,
    [
      payload.nombre,
      payload.ruc,
      payload.telefono,
      payload.direccion,
      payload.email,
      payload.razon_social
    ]
  );
}

async function findProductoById(client, productoId) {
  return client.query(`SELECT * FROM producto WHERE id = $1 FOR UPDATE`, [productoId]);
}

async function findProductoByCodigo(client, codigo) {
  return client.query(
    `
      SELECT *
      FROM producto
      WHERE CAST(id AS text) = $1
         OR codigo_barra = $1
      ORDER BY id
      LIMIT 1
    `,
    [codigo]
  );
}

async function createProducto(client, payload) {
  return client.query(
    `
      INSERT INTO producto
        (
          nombre,
          descripcion,
          stock,
          iva_tipo,
          categoria_id,
          activo,
          codigo_barra,
          unidad_medida
        )
      VALUES ($1,$2,0,$3,$4,true,$5,$6)
      RETURNING *
    `,
    [
      payload.nombre,
      payload.descripcion,
      payload.iva_tipo,
      payload.categoria_id,
      payload.codigo_barra,
      payload.unidad_medida
    ]
  );
}

async function updateProductoStock(client, productoId, deltaStock) {
  return client.query(
    `
      UPDATE producto
      SET stock = stock + $1
      WHERE id = $2
      RETURNING stock
    `,
    [deltaStock, productoId]
  );
}

async function findCondicionPagoById(client, condicionPagoId) {
  return client.query(`SELECT * FROM condicion_pago WHERE id = $1`, [condicionPagoId]);
}

async function findMonedaById(client, monedaId) {
  return client.query(`SELECT * FROM moneda WHERE id = $1`, [monedaId]);
}

async function findTipoOperacionById(client, tipoOperacionId) {
  return client.query(`SELECT * FROM tipo_operacion WHERE id = $1`, [tipoOperacionId]);
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

async function findStockLote(client, payload) {
  return client.query(
    `
      SELECT
        id,
        empresa_id,
        producto_id,
        lote,
        fecha_vencimiento,
        cantidad,
        costo_promedio
      FROM stock_lote
      WHERE empresa_id = $1
        AND producto_id = $2
        AND COALESCE(lote, '') = COALESCE($3, '')
        AND fecha_vencimiento IS NOT DISTINCT FROM $4
      FOR UPDATE
    `,
    [
      payload.empresa_id,
      payload.producto_id,
      payload.lote,
      payload.fecha_vencimiento
    ]
  );
}

async function insertStockLote(client, payload) {
  return client.query(
    `
      INSERT INTO stock_lote
        (
          empresa_id,
          producto_id,
          lote,
          fecha_vencimiento,
          cantidad,
          costo_promedio
        )
      VALUES ($1,$2,$3,$4,$5,$6)
      RETURNING *
    `,
    [
      payload.empresa_id,
      payload.producto_id,
      payload.lote,
      payload.fecha_vencimiento,
      payload.cantidad,
      payload.costo_promedio
    ]
  );
}

async function updateStockLote(client, stockLoteId, payload) {
  return client.query(
    `
      UPDATE stock_lote
      SET cantidad = $1,
          costo_promedio = $2,
          actualizado_en = NOW()
      WHERE id = $3
      RETURNING *
    `,
    [
      payload.cantidad,
      payload.costo_promedio,
      stockLoteId
    ]
  );
}

async function searchCompras(client, { whereSql, params }) {
  return client.query(
    `
      SELECT
        c.id,
        c.empresa_id,
        c.fecha,
        c.numero_compra,
        c.nro_comprobante,
        c.estado,
        c.total,
        c.movimiento,
        c.tipo_operacion_id,
        c.condicion_pago_id,
        c.moneda_id,
        t.descripcion AS operacion,
        cp.descripcion AS forma_pago,
        p.nombre AS proveedor_nombre,
        co.nombre AS comprador_nombre,
        m.nombre AS moneda_nombre,
        cp.descripcion AS condicion_pago_nombre
      FROM compra c
      JOIN proveedor p ON p.id = c.proveedor_id
      LEFT JOIN tipo_operacion t ON t.id = c.tipo_operacion_id
      LEFT JOIN comprador co ON co.id = c.comprador_id
      LEFT JOIN moneda m ON m.id = c.moneda_id
      LEFT JOIN condicion_pago cp ON cp.id = c.condicion_pago_id
      ${whereSql}
      ORDER BY c.fecha DESC, c.id DESC
      LIMIT 500
    `,
    params
  );
}

async function getCompraCabecera(client, compraId, empresaId) {
  return client.query(
    `
      SELECT
        c.*,
        t.descripcion AS operacion,
        cp.descripcion AS forma_pago,
        p.nombre AS proveedor_nombre,
        co.nombre AS comprador_nombre,
        m.nombre AS moneda_nombre,
        cp.descripcion AS condicion_pago_nombre,
        COALESCE(e.controlar_lote, false) AS controlar_lote
      FROM compra c
      JOIN proveedor p ON p.id = c.proveedor_id
      LEFT JOIN tipo_operacion t ON t.id = c.tipo_operacion_id
      LEFT JOIN comprador co ON co.id = c.comprador_id
      LEFT JOIN moneda m ON m.id = c.moneda_id
      LEFT JOIN condicion_pago cp ON cp.id = c.condicion_pago_id
      LEFT JOIN empresa e ON e.id = c.empresa_id
      WHERE c.id = $1
        AND c.empresa_id = $2
    `,
    [compraId, empresaId]
  );
}

async function getCompraDetalle(client, compraId) {
  return client.query(
    `
      SELECT
        cd.*,
        cd.costo AS precio_unitario,
        cd.total AS subtotal,
        COALESCE(cd.moneda_id, c.moneda_id) AS moneda_id_item,
        COALESCE(cd.costo_moneda_origen, cd.costo) AS costo_moneda_origen,
        cd.costo_gs,
        cd.costo_brl,
        cd.costo_usd,
        cd.cotizacion_id,
        p.nombre AS producto_nombre,
        p.codigo_barra,
        COALESCE(pp.precio_compra, cd.costo, 0) AS costo_medio
      FROM compra_detalle cd
      JOIN compra c ON c.id = cd.compra_id
      JOIN producto p ON p.id = cd.producto_id
      LEFT JOIN LATERAL (
        SELECT px.precio_compra
        FROM producto_precio px
        WHERE px.producto_id = cd.producto_id
          AND px.activo = true
        ORDER BY px.id DESC
        LIMIT 1
      ) pp ON true
      WHERE cd.compra_id = $1
      ORDER BY cd.id
    `,
    [compraId]
  );
}

module.exports = {
  createProducto,
  createProveedor,
  deleteCompra,
  deleteCompraDetalle,
  findCompraById,
  findCompraDetalleAgrupable,
  findCompraDetalleById,
  findEmpresaById,
  findCondicionPagoById,
  findMonedaById,
  findProductoByCodigo,
  findProductoById,
  findProveedorById,
  findStockLote,
  findTipoOperacionById,
  getCompraCabecera,
  getCompraDetalle,
  insertCompra,
  insertCompraDetalle,
  insertStockLote,
  insertStockMovimiento,
  listCompraDetalles,
  searchCompras,
  updateCompra,
  updateCompraDetalle,
  updateStockLote,
  updateCompraTotal,
  updateProductoStock
};
