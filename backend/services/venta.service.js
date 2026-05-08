const {
  ensureComisionSchema,
  recalculateVentaCommission
} = require("./comision.service");
const {
  MONEDA_IDS,
  buildPrecioMonedaPayload,
  ensureMonedaSchema,
  getCotizacionActiva,
  resolveMonedaId
} = require("./moneda.schema.service");
const { ventaTieneFactura } = require("./factura_venta.service");

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function toNullableNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function getPrecioCanonicoGs({ precio, conversion, fallback = 0 }) {
  if (conversion?.monto_gs != null) return toNumber(conversion.monto_gs);
  if (conversion?.moneda_id === MONEDA_IDS.PYG && conversion?.monto_origen != null) {
    return toNumber(conversion.monto_origen);
  }

  const precioIngresado = Number(precio);
  if (Number.isFinite(precioIngresado) && precioIngresado >= 0) return precioIngresado;

  return toNumber(fallback);
}

async function resolveEmpresaIdForMovimiento(client, empresaIdInput) {
  const empresaId = Math.trunc(toNumber(empresaIdInput));
  if (empresaId > 0) return empresaId;

  const res = await client.query("SELECT id FROM empresa ORDER BY id LIMIT 1");
  if (!res.rowCount) throw new Error("No se encontro empresa para registrar stock");
  return Math.trunc(toNumber(res.rows[0].id));
}

async function registrarStockMovimientoVenta(client, payload = {}) {
  const cantidad = Math.abs(toNumber(payload.cantidad));
  if (cantidad <= 0) return;

  const empresaId = await resolveEmpresaIdForMovimiento(client, payload.empresaId);

  await client.query(
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
    `,
    [
      payload.productoId,
      empresaId,
      payload.tipo,
      cantidad,
      0,
      payload.referenciaId || null,
      payload.referenciaTipo || "VENTA",
      null,
      null
    ]
  );
}

async function recalcularVentaTotales(client, ventaId) {
  await ensureComisionSchema();

  const result = await recalculateVentaCommission(client, ventaId);

  return {
    totalVenta: toNumber(result.totalVenta),
    comision: toNumber(result.comision)
  };
}

async function recalcularTotalVenta(client, ventaId) {
  const result = await recalcularVentaTotales(client, ventaId);
  return result.totalVenta;
}

async function obtenerContextoDetalleEditable(client, detalleId) {
  const detalleRes = await client.query(
    `
      SELECT
        vd.id,
        vd.venta_id,
        vd.producto_id,
        vd.cantidad,
        vd.precio,
        vd.subtotal,
        vd.precio_moneda_id,
        vd.precio_moneda_origen,
        vd.precio_gs,
        vd.precio_brl,
        vd.precio_usd,
        vd.cotizacion_id,
        vd.cotizacion_brl,
        vd.cotizacion_usd,
        v.estado AS venta_estado
      FROM venta_detalle vd
      JOIN venta v ON v.id = vd.venta_id
      WHERE vd.id = $1
      FOR UPDATE
    `,
    [detalleId]
  );

  if (!detalleRes.rowCount) {
    throw new Error("Item no encontrado");
  }

  const detalle = detalleRes.rows[0];

  if (await ventaTieneFactura(client, detalle.venta_id)) {
    throw new Error("No se puede modificar una venta facturada");
  }

  if (detalle.venta_estado === "EFECTIVADO") {
    throw new Error("No se puede modificar una venta cobrada");
  }

  const productoRes = await client.query(
    `
      SELECT id, stock, no_control_stock
      FROM producto
      WHERE id = $1
      FOR UPDATE
    `,
    [detalle.producto_id]
  );

  if (!productoRes.rowCount) {
    throw new Error("Producto no encontrado");
  }

  return {
    detalle: {
      ...detalle,
      cantidad: toNumber(detalle.cantidad),
      precio: toNumber(detalle.precio),
      subtotal: toNumber(detalle.subtotal),
      precio_moneda_id: toNumber(detalle.precio_moneda_id) || MONEDA_IDS.PYG,
      precio_moneda_origen: toNullableNumber(detalle.precio_moneda_origen),
      precio_gs: toNullableNumber(detalle.precio_gs),
      precio_brl: toNullableNumber(detalle.precio_brl),
      precio_usd: toNullableNumber(detalle.precio_usd),
      cotizacion_id: toNullableNumber(detalle.cotizacion_id),
      cotizacion_brl: toNullableNumber(detalle.cotizacion_brl),
      cotizacion_usd: toNullableNumber(detalle.cotizacion_usd)
    },
    producto: {
      ...productoRes.rows[0],
      stock: toNumber(productoRes.rows[0].stock),
      no_control_stock: productoRes.rows[0].no_control_stock === true
    }
  };
}

async function actualizarDetalleVenta(client, detalleId, payload, options = {}) {
  await ensureMonedaSchema();

  const cantidadNueva = toNumber(payload.cantidad);
  const precioNuevo = toNumber(payload.precio);

  if (cantidadNueva <= 0 || precioNuevo < 0) {
    throw new Error("Datos invalidos");
  }

  const { detalle, producto } = await obtenerContextoDetalleEditable(client, detalleId);

  const controlaStock = !producto.no_control_stock;
  const diferenciaCantidad = cantidadNueva - detalle.cantidad;

  if (controlaStock && diferenciaCantidad > 0 && producto.stock < diferenciaCantidad) {
    throw new Error("Stock insuficiente");
  }

  if (controlaStock && diferenciaCantidad !== 0) {
    await client.query(
      `
        UPDATE producto
        SET stock = stock - $1
        WHERE id = $2
      `,
      [diferenciaCantidad, detalle.producto_id]
    );

    await registrarStockMovimientoVenta(client, {
      productoId: detalle.producto_id,
      empresaId: options.empresa_id,
      tipo: diferenciaCantidad > 0 ? "SALIDA" : "ENTRADA",
      cantidad: Math.abs(diferenciaCantidad),
      referenciaId: detalle.id,
      referenciaTipo: "VENTA_DETALLE_AJUSTE"
    });
  }

  const cotizacion = await getCotizacionActiva(client);
  const monedaId = resolveMonedaId(
    payload.precio_moneda_id ?? payload.moneda_id ?? detalle.precio_moneda_id,
    MONEDA_IDS.PYG
  );
  const conversion = buildPrecioMonedaPayload({
    monto: payload.precio_moneda_origen ?? payload.precio ?? detalle.precio,
    monedaId,
    cotizacion
  });
  const precioCanonicoGs = getPrecioCanonicoGs({
    precio: payload.precio,
    conversion,
    fallback: detalle.precio
  });
  const subtotalNuevo = cantidadNueva * precioCanonicoGs;

  await client.query(
    `
      UPDATE venta_detalle
      SET cantidad = $1,
          precio = $2,
          subtotal = $3,
          observacion = $4,
          precio_moneda_id = $5,
          precio_moneda_origen = $6,
          precio_gs = $7,
          precio_brl = $8,
          precio_usd = $9,
          cotizacion_id = $10,
          cotizacion_brl = $11,
          cotizacion_usd = $12
      WHERE id = $13
    `,
    [
      cantidadNueva,
      precioCanonicoGs,
      subtotalNuevo,
      payload.observacion || null,
      conversion.moneda_id,
      conversion.monto_origen,
      conversion.monto_gs,
      conversion.monto_brl,
      conversion.monto_usd,
      conversion.cotizacion_id,
      conversion.cotizacion_brl,
      conversion.cotizacion_usd,
      detalleId
    ]
  );

  const { totalVenta, comision } = await recalcularVentaTotales(client, detalle.venta_id);

  return {
    ventaId: detalle.venta_id,
    totalVenta,
    comision
  };
}

async function eliminarDetalleVenta(client, detalleId, options = {}) {
  const { detalle, producto } = await obtenerContextoDetalleEditable(client, detalleId);

  if (!producto.no_control_stock) {
    await client.query(
      `
        UPDATE producto
        SET stock = stock + $1
        WHERE id = $2
      `,
      [detalle.cantidad, detalle.producto_id]
    );

    await registrarStockMovimientoVenta(client, {
      productoId: detalle.producto_id,
      empresaId: options.empresa_id,
      tipo: "ENTRADA",
      cantidad: detalle.cantidad,
      referenciaId: detalle.id,
      referenciaTipo: "VENTA_DETALLE_ELIMINADO"
    });
  }

  await client.query(`DELETE FROM venta_detalle WHERE id = $1`, [detalleId]);

  const { totalVenta, comision } = await recalcularVentaTotales(client, detalle.venta_id);

  return {
    ventaId: detalle.venta_id,
    totalVenta,
    comision
  };
}

module.exports = {
  actualizarDetalleVenta,
  eliminarDetalleVenta,
  recalcularVentaTotales,
  recalcularTotalVenta,
  registrarStockMovimientoVenta,
  resolveEmpresaIdForMovimiento
};
