const repo = require("../repositories/compra.repository");

const ESTADO_MAP = {
  1: "PENDIENTE",
  2: "CONCLUIDO",
  3: "EFECTIVADO",
  PENDIENTE: "PENDIENTE",
  CONCLUIDO: "CONCLUIDO",
  EFECTIVADO: "EFECTIVADO"
};

const {
  MONEDA_IDS,
  buildPrecioMonedaPayload,
  ensureMonedaSchema,
  getCotizacionActiva,
  resolveMonedaId
} = require("./moneda.schema.service");

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function toBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "t", "si", "s", "yes", "y", "on"].includes(normalized)) return true;
    if (["0", "false", "f", "no", "n", "off"].includes(normalized)) return false;
  }
  return fallback;
}

function normalizeEstado(value) {
  const key = typeof value === "string" ? value.trim().toUpperCase() : value;
  const estado = ESTADO_MAP[key];
  if (!estado) throw new Error("Estado invÃ¡lido");
  return estado;
}

function estadoAplicaStock(estado) {
  return estado === "CONCLUIDO" || estado === "EFECTIVADO";
}

function normalizeText(value) {
  const text = String(value || "").trim();
  return text.length ? text : null;
}

function normalizeNumeroCompra(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  if (!/^\d+$/.test(text)) {
    throw new Error("numero_compra debe contener solo dÃ­gitos");
  }
  return text;
}

async function resolveEmpresaId(input, req) {
  const empresaId = toNumber(input.empresa_id || req?.usuario?.empresa_id || req?.body?.empresa_id);
  if (!empresaId) throw new Error("empresa_id requerido");
  return empresaId;
}

async function resolveEmpresaConfig(client, empresaId) {
  const empresaRes = await repo.findEmpresaById(client, empresaId);
  if (!empresaRes.rowCount) throw new Error("Empresa no encontrada");
  const empresa = empresaRes.rows[0];
  return {
    id: toNumber(empresa.id),
    controlar_lote: toBoolean(empresa.controlar_lote, false),
    agrupar_item: toBoolean(empresa.agrupar_item, false)
  };
}

async function resolveProveedor(client, payload) {
  if (toNumber(payload.proveedor_id) > 0) {
    const proveedor = await repo.findProveedorById(client, toNumber(payload.proveedor_id));
    if (!proveedor.rowCount) throw new Error("Proveedor no encontrado");
    return proveedor.rows[0];
  }

  if (!payload.proveedor || !normalizeText(payload.proveedor.nombre)) {
    throw new Error("Proveedor requerido");
  }

  const created = await repo.createProveedor(client, {
    nombre: normalizeText(payload.proveedor.nombre),
    ruc: normalizeText(payload.proveedor.ruc),
    telefono: normalizeText(payload.proveedor.telefono),
    direccion: normalizeText(payload.proveedor.direccion),
    email: normalizeText(payload.proveedor.email),
    razon_social: normalizeText(payload.proveedor.razon_social)
  });

  return created.rows[0];
}

async function resolveProducto(client, payload) {
  if (toNumber(payload.producto_id) > 0) {
    const producto = await repo.findProductoById(client, toNumber(payload.producto_id));
    if (!producto.rowCount) throw new Error("Producto no encontrado");
    return producto.rows[0];
  }

  if (payload.codigo) {
    const found = await repo.findProductoByCodigo(client, String(payload.codigo).trim());
    if (found.rowCount) return found.rows[0];
  }

  if (!payload.producto || !normalizeText(payload.producto.nombre)) {
    throw new Error("Producto requerido");
  }

  const created = await repo.createProducto(client, {
    nombre: normalizeText(payload.producto.nombre),
    descripcion: normalizeText(payload.producto.descripcion),
    iva_tipo: toNumber(payload.producto.iva_tipo, 10),
    categoria_id: toNumber(payload.producto.categoria_id) || null,
    codigo_barra: normalizeText(payload.producto.codigo_barra || payload.codigo),
    unidad_medida: normalizeText(payload.producto.unidad_medida)
  });

  return created.rows[0];
}

async function resolveCondicionPago(client, payload) {
  const condicionPagoId = toNumber(payload.condicion_pago_id);
  if (!condicionPagoId) throw new Error("condicion_pago_id requerido");
  const condicion = await repo.findCondicionPagoById(client, condicionPagoId);
  if (!condicion.rowCount) throw new Error("CondiciÃ³n de pago no encontrada");
  return condicion.rows[0];
}

async function resolveMoneda(client, payload) {
  const monedaId = toNumber(payload.moneda_id);
  if (!monedaId) throw new Error("moneda_id requerido");
  const moneda = await repo.findMonedaById(client, monedaId);
  if (!moneda.rowCount) throw new Error("Moneda no encontrada");
  return moneda.rows[0];
}

async function resolveTipoOperacion(client, payload) {
  const tipoOperacionId = toNumber(payload.tipo_operacion_id);
  if (!tipoOperacionId) throw new Error("tipo_operacion_id requerido");
  const tipoOperacion = await repo.findTipoOperacionById(client, tipoOperacionId);
  if (!tipoOperacion.rowCount) throw new Error("Tipo de operaciÃ³n no encontrado");
  const row = tipoOperacion.rows[0];
  const tipo = String(row.tipo || "").trim().toUpperCase();
  if (!["E", "S"].includes(tipo)) throw new Error("Tipo de operaciÃƒÂ³n invÃƒÂ¡lido");
  if (row.activo === false) throw new Error("La operaciÃ³n seleccionada estÃ¡ inactiva");
  if (tipo !== "E") throw new Error("La operaciÃ³n de compra debe ser de tipo E");
  return {
    id: row.id,
    codigo: row.codigo,
    descripcion: row.descripcion,
    tipo,
    signo: tipo === "S" ? -1 : 1,
    permite_credito: toBoolean(row.permite_credito, false),
    requiere_credito: toBoolean(row.requiere_credito, false),
    genera_financiero: toBoolean(row.genera_financiero, false)
  };
}

function isCondicionCredito(condicion) {
  const cuotas = toNumber(condicion?.cuotas ?? condicion?.cantidad_cuotas, 1);
  if (cuotas > 1) return true;
  const diasIntervalo = toNumber(condicion?.dias_intervalo, 0);
  if (diasIntervalo > 0) return true;
  const text = String(condicion?.descripcion || "").trim().toLowerCase();
  return text.includes("credito") || text.includes("crédito");
}

function validarOperacionConCondicionPago(tipoOperacion, condicionPago) {
  const condicionEsCredito = isCondicionCredito(condicionPago);
  if (!toBoolean(tipoOperacion?.permite_credito, false) && condicionEsCredito) {
    throw new Error("La operaciÃ³n seleccionada no permite forma de pago a crÃ©dito");
  }
  if (toBoolean(tipoOperacion?.requiere_credito, false) && !condicionEsCredito) {
    throw new Error("La operaciÃ³n seleccionada requiere forma de pago a crÃ©dito");
  }
}

function normalizeItemPayload(payload, options = {}) {
  const cantidad = toNumber(payload.cantidad);
  const precioUnitario = toNumber(payload.precio_unitario ?? payload.costo);
  const subtotal = Math.round(cantidad * precioUnitario * 100) / 100;
  const controlarLote = toBoolean(options.controlar_lote, false);
  if (cantidad <= 0) throw new Error("Cantidad invÃ¡lida");
  if (precioUnitario < 0) throw new Error("Precio unitario invÃ¡lido");
  return {
    cantidad,
    precio_unitario: precioUnitario,
    subtotal,
    lote: controlarLote ? normalizeText(payload.lote) : null,
    fecha_vencimiento: controlarLote ? (payload.fecha_vencimiento || null) : null
  };
}

async function recalculateCompra(client, compraId) {
  const updated = await repo.updateCompraTotal(client, compraId);
  return toNumber(updated.rows[0]?.total);
}

function roundAmount(value, precision = 4) {
  const factor = Math.pow(10, precision);
  return Math.round((toNumber(value, 0) + Number.EPSILON) * factor) / factor;
}

function mergeUnitCostByQty(currentValue, currentQty, incomingValue, incomingQty, fallback = null) {
  const qtyCurrent = toNumber(currentQty, 0);
  const qtyIncoming = toNumber(incomingQty, 0);
  const currentValid = Number.isFinite(Number(currentValue));
  const incomingValid = Number.isFinite(Number(incomingValue));

  if (currentValid && incomingValid && qtyCurrent + qtyIncoming > 0) {
    const weighted = ((toNumber(currentValue) * qtyCurrent) + (toNumber(incomingValue) * qtyIncoming)) / (qtyCurrent + qtyIncoming);
    return roundAmount(weighted, 6);
  }

  if (incomingValid) return roundAmount(toNumber(incomingValue), 6);
  if (currentValid) return roundAmount(toNumber(currentValue), 6);

  if (fallback == null) return null;
  const fallbackNumber = toNumber(fallback, NaN);
  return Number.isFinite(fallbackNumber) ? roundAmount(fallbackNumber, 6) : null;
}

async function buildCompraDetalleMonedaData(client, {
  precioUnitario,
  monedaId,
  cotizacionSnapshot = null
}) {
  const baseMonedaId = resolveMonedaId(monedaId, MONEDA_IDS.PYG);
  const cotizacion = cotizacionSnapshot || await getCotizacionActiva(client);
  const converted = buildPrecioMonedaPayload({
    monto: precioUnitario,
    monedaId: baseMonedaId,
    cotizacion
  });

  return {
    moneda_id: converted.moneda_id,
    costo_moneda_origen: converted.monto_origen,
    costo_gs: converted.monto_gs,
    costo_brl: converted.monto_brl,
    costo_usd: converted.monto_usd,
    cotizacion_id: converted.cotizacion_id
  };
}

async function ajustarStockLotePorDelta(client, {
  empresaId,
  productoId,
  lote,
  fechaVencimiento,
  deltaCantidad,
  costoUnitario
}) {
  const delta = toNumber(deltaCantidad, 0);
  if (!delta) return;

  const loteNormalizado = normalizeText(lote);
  const fechaNormalizada = fechaVencimiento || null;

  // Si se habilita control por empresa, solo se sincronizan registros con lote o vencimiento informado.
  if (!loteNormalizado && !fechaNormalizada) return;

  const actualRes = await repo.findStockLote(client, {
    empresa_id: empresaId,
    producto_id: productoId,
    lote: loteNormalizado,
    fecha_vencimiento: fechaNormalizada
  });

  if (!actualRes.rowCount) {
    if (delta < 0) {
      throw new Error("Stock por lote insuficiente para la operacion");
    }

    await repo.insertStockLote(client, {
      empresa_id: empresaId,
      producto_id: productoId,
      lote: loteNormalizado,
      fecha_vencimiento: fechaNormalizada,
      cantidad: roundAmount(delta, 3),
      costo_promedio: roundAmount(costoUnitario, 4)
    });
    return;
  }

  const actual = actualRes.rows[0];
  const cantidadActual = toNumber(actual.cantidad, 0);
  const cantidadNueva = roundAmount(cantidadActual + delta, 3);

  if (cantidadNueva < -0.0001) {
    throw new Error("Stock por lote insuficiente para la operacion");
  }

  const costoActual = toNumber(actual.costo_promedio, 0);
  let costoPromedio = costoActual;

  if (delta > 0) {
    const cantidadBase = cantidadActual + delta;
    if (cantidadBase > 0) {
      const totalCostoActual = cantidadActual * costoActual;
      const totalCostoNuevo = delta * toNumber(costoUnitario, 0);
      costoPromedio = roundAmount((totalCostoActual + totalCostoNuevo) / cantidadBase, 4);
    }
  }

  await repo.updateStockLote(client, actual.id, {
    cantidad: Math.max(0, cantidadNueva),
    costo_promedio: costoPromedio
  });
}

async function getCompraContextForMutation(client, compraId, empresaId) {
  const compraRes = await repo.findCompraById(client, compraId, empresaId);
  if (!compraRes.rowCount) throw new Error("Compra no encontrada");
  const compra = compraRes.rows[0];
  if (!toNumber(compra.tipo_operacion_id)) {
    throw new Error("La compra no tiene tipo_operacion_id configurado");
  }
  const tipoOperacion = await resolveTipoOperacion(client, { tipo_operacion_id: compra.tipo_operacion_id });
  const empresa = await resolveEmpresaConfig(client, empresaId);
  return { compra, tipoOperacion, empresa };
}

async function ajustarStockPorDelta(client, {
  empresaId,
  compraId,
  compraDetalleId,
  productoId,
  deltaCantidad,
  precioUnitario,
  lote,
  fechaVencimiento,
  tipoOperacion,
  controlarLote
}) {
  if (!deltaCantidad) return;

  const productoRes = await repo.findProductoById(client, productoId);
  if (!productoRes.rowCount) throw new Error("Producto no encontrado");

  const producto = productoRes.rows[0];
  const deltaStock = tipoOperacion.signo * deltaCantidad;

  if (deltaStock < 0 && toNumber(producto.stock) < Math.abs(deltaStock)) {
    throw new Error(`Stock insuficiente para salida del producto ${producto.nombre}`);
  }

  await repo.updateProductoStock(client, productoId, deltaStock);
  await repo.insertStockMovimiento(client, {
    producto_id: productoId,
    empresa_id: empresaId,
    tipo: tipoOperacion.signo > 0 ? "ENTRADA" : "SALIDA",
    cantidad: Math.abs(deltaCantidad),
    costo: precioUnitario,
    referencia_id: compraDetalleId || compraId,
    referencia_tipo: compraDetalleId ? "COMPRA_DETALLE" : "COMPRA",
    lote,
    fecha_vencimiento: fechaVencimiento
  });

  const shouldSyncLote = toBoolean(controlarLote, false) || Boolean(normalizeText(lote) || fechaVencimiento);
  if (shouldSyncLote) {
    await ajustarStockLotePorDelta(client, {
      empresaId,
      productoId,
      lote,
      fechaVencimiento,
      deltaCantidad: deltaCantidad * tipoOperacion.signo,
      costoUnitario: precioUnitario
    });
  }
}

async function createCompra(client, payload, req) {
  await ensureMonedaSchema();

  const empresaId = await resolveEmpresaId(payload, req);
  const empresa = await resolveEmpresaConfig(client, empresaId);
  const proveedor = await resolveProveedor(client, payload);
  const condicionPago = await resolveCondicionPago(client, payload);
  const moneda = await resolveMoneda(client, payload);
  const tipoOperacion = await resolveTipoOperacion(client, payload);
  validarOperacionConCondicionPago(tipoOperacion, condicionPago);
  const estado = normalizeEstado(payload.estado || 1);

  const compraRes = await repo.insertCompra(client, {
    empresa_id: empresaId,
    fecha: payload.fecha,
    proveedor_id: proveedor.id,
    comprador_id: toNumber(payload.comprador_id) || null,
    condicion_pago_id: condicionPago.id,
    moneda_id: moneda.id,
    estado,
    total: 0,
    tipo_operacion_id: tipoOperacion.id,
    numero_compra: normalizeNumeroCompra(payload.numero_compra),
    usuario_id: toNumber(req?.usuario?.id) || null,
    fecha_emision: payload.fecha_emision || payload.fecha
  });

  const compra = compraRes.rows[0];
  const items = Array.isArray(payload.items || payload.carrito) ? (payload.items || payload.carrito) : [];
  const cotizacionSnapshot = await getCotizacionActiva(client);

  for (const item of items) {
    await agregarItemCompra(client, compra.id, empresaId, item, {
      empresa,
      cotizacionSnapshot
    });
  }

  const numeroCompra = compra.numero_compra || String(compra.id);
  if (!compra.numero_compra) {
    await repo.updateCompra(client, compra.id, empresaId, {
      fecha: compra.fecha,
      proveedor_id: compra.proveedor_id,
      comprador_id: compra.comprador_id,
      condicion_pago_id: compra.condicion_pago_id,
      moneda_id: compra.moneda_id,
      estado: compra.estado,
      tipo_operacion_id: compra.tipo_operacion_id,
      numero_compra: numeroCompra,
      nro_comprobante: compra.nro_comprobante,
      timbrado: compra.timbrado,
      fecha_emision: compra.fecha_emision || compra.fecha
    });
  }

  const total = await recalculateCompra(client, compra.id);
  return { compra_id: compra.id, numero_compra: numeroCompra, total };
}

async function agregarItemCompra(client, compraId, empresaId, payload, options = {}) {
  await ensureMonedaSchema();

  const context = await getCompraContextForMutation(client, compraId, empresaId);
  const compra = context.compra;
  const tipoOperacion = context.tipoOperacion;
  const empresa = options.empresa || context.empresa;
  const producto = await resolveProducto(client, payload);
  const item = normalizeItemPayload(payload, empresa);
  const cotizacionSnapshot = options.cotizacionSnapshot || await getCotizacionActiva(client);
  const monedaDetalle = await buildCompraDetalleMonedaData(client, {
    precioUnitario: item.precio_unitario,
    monedaId: compra.moneda_id,
    cotizacionSnapshot
  });

  if (toBoolean(empresa.agrupar_item, false)) {
    const existingRes = await repo.findCompraDetalleAgrupable(client, {
      compra_id: compraId,
      producto_id: producto.id,
      lote: item.lote,
      fecha_vencimiento: item.fecha_vencimiento,
      moneda_id: monedaDetalle.moneda_id
    });

    if (existingRes.rowCount) {
      const existing = existingRes.rows[0];
      const cantidadActual = toNumber(existing.cantidad, 0);
      const subtotalActual = toNumber(existing.total, cantidadActual * toNumber(existing.costo, 0));
      const cantidadNueva = roundAmount(cantidadActual + item.cantidad, 6);
      const subtotalNuevo = roundAmount(subtotalActual + item.subtotal, 6);
      const precioUnitarioNuevo = cantidadNueva > 0
        ? roundAmount(subtotalNuevo / cantidadNueva, 6)
        : item.precio_unitario;

      const updated = await repo.updateCompraDetalle(client, existing.id, {
        producto_id: existing.producto_id,
        cantidad: cantidadNueva,
        costo: precioUnitarioNuevo,
        total: subtotalNuevo,
        lote: existing.lote,
        fecha_vencimiento: existing.fecha_vencimiento,
        costo_original: mergeUnitCostByQty(
          existing.costo_original,
          cantidadActual,
          item.precio_unitario,
          item.cantidad,
          precioUnitarioNuevo
        ),
        moneda_id: monedaDetalle.moneda_id,
        costo_moneda_origen: mergeUnitCostByQty(
          existing.costo_moneda_origen ?? existing.costo,
          cantidadActual,
          monedaDetalle.costo_moneda_origen,
          item.cantidad,
          precioUnitarioNuevo
        ),
        costo_gs: mergeUnitCostByQty(
          existing.costo_gs,
          cantidadActual,
          monedaDetalle.costo_gs,
          item.cantidad,
          null
        ),
        costo_brl: mergeUnitCostByQty(
          existing.costo_brl,
          cantidadActual,
          monedaDetalle.costo_brl,
          item.cantidad,
          null
        ),
        costo_usd: mergeUnitCostByQty(
          existing.costo_usd,
          cantidadActual,
          monedaDetalle.costo_usd,
          item.cantidad,
          null
        ),
        cotizacion_id: monedaDetalle.cotizacion_id
      });

      if (estadoAplicaStock(compra.estado)) {
        await ajustarStockPorDelta(client, {
          empresaId,
          compraId,
          compraDetalleId: existing.id,
          productoId: producto.id,
          deltaCantidad: item.cantidad,
          precioUnitario: item.precio_unitario,
          lote: item.lote,
          fechaVencimiento: item.fecha_vencimiento,
          tipoOperacion,
          controlarLote: empresa.controlar_lote
        });
      }

      const total = await recalculateCompra(client, compraId);
      return { detalle: updated.rows[0], total, agrupado: true };
    }
  }

  const detalleRes = await repo.insertCompraDetalle(client, {
    compra_id: compraId,
    producto_id: producto.id,
    cantidad: item.cantidad,
    costo: item.precio_unitario,
    total: item.subtotal,
    lote: item.lote,
    fecha_vencimiento: item.fecha_vencimiento,
    costo_original: item.precio_unitario,
    moneda_id: monedaDetalle.moneda_id,
    costo_moneda_origen: monedaDetalle.costo_moneda_origen,
    costo_gs: monedaDetalle.costo_gs,
    costo_brl: monedaDetalle.costo_brl,
    costo_usd: monedaDetalle.costo_usd,
    cotizacion_id: monedaDetalle.cotizacion_id
  });

  const detalle = detalleRes.rows[0];

  if (estadoAplicaStock(compra.estado)) {
    await ajustarStockPorDelta(client, {
      empresaId,
      compraId,
      compraDetalleId: detalle.id,
      productoId: producto.id,
      deltaCantidad: item.cantidad,
      precioUnitario: item.precio_unitario,
      lote: item.lote,
      fechaVencimiento: item.fecha_vencimiento,
      tipoOperacion,
      controlarLote: empresa.controlar_lote
    });
  }

  const total = await recalculateCompra(client, compraId);
  return { detalle, total };
}

async function editarItemCompra(client, detalleId, empresaId, payload) {
  await ensureMonedaSchema();

  const detalleRes = await repo.findCompraDetalleById(client, detalleId, empresaId);
  if (!detalleRes.rowCount) throw new Error("Ãtem no encontrado");

  const actual = detalleRes.rows[0];
  const empresa = await resolveEmpresaConfig(client, empresaId);
  if (!toNumber(actual.tipo_operacion_id)) {
    throw new Error("La compra no tiene tipo_operacion_id configurado");
  }
  const tipoOperacion = await resolveTipoOperacion(client, { tipo_operacion_id: actual.tipo_operacion_id });

  const producto = payload.producto_id || payload.codigo || payload.producto
    ? await resolveProducto(client, payload)
    : await repo.findProductoById(client, actual.producto_id).then(r => r.rows[0]);

  const item = normalizeItemPayload({
    cantidad: payload.cantidad ?? actual.cantidad,
    precio_unitario: payload.precio_unitario ?? payload.costo ?? actual.costo,
    lote: payload.lote ?? actual.lote,
    fecha_vencimiento: payload.fecha_vencimiento ?? actual.fecha_vencimiento
  }, empresa);
  const cotizacionSnapshot = await getCotizacionActiva(client);
  const monedaDetalle = await buildCompraDetalleMonedaData(client, {
    precioUnitario: item.precio_unitario,
    monedaId: actual.moneda_id,
    cotizacionSnapshot
  });

  if (estadoAplicaStock(actual.estado)) {
    await ajustarStockPorDelta(client, {
      empresaId,
      compraId: actual.compra_id,
      compraDetalleId: actual.id,
      productoId: actual.producto_id,
      deltaCantidad: -toNumber(actual.cantidad),
      precioUnitario: toNumber(actual.costo),
      lote: actual.lote,
      fechaVencimiento: actual.fecha_vencimiento,
      tipoOperacion,
      controlarLote: empresa.controlar_lote
    });
  }

  const updated = await repo.updateCompraDetalle(client, detalleId, {
    producto_id: producto.id,
    cantidad: item.cantidad,
    costo: item.precio_unitario,
    total: item.subtotal,
    lote: item.lote,
    fecha_vencimiento: item.fecha_vencimiento,
    costo_original: item.precio_unitario,
    moneda_id: monedaDetalle.moneda_id,
    costo_moneda_origen: monedaDetalle.costo_moneda_origen,
    costo_gs: monedaDetalle.costo_gs,
    costo_brl: monedaDetalle.costo_brl,
    costo_usd: monedaDetalle.costo_usd,
    cotizacion_id: monedaDetalle.cotizacion_id
  });

  if (estadoAplicaStock(actual.estado)) {
    await ajustarStockPorDelta(client, {
      empresaId,
      compraId: actual.compra_id,
      compraDetalleId: actual.id,
      productoId: producto.id,
      deltaCantidad: item.cantidad,
      precioUnitario: item.precio_unitario,
      lote: item.lote,
      fechaVencimiento: item.fecha_vencimiento,
      tipoOperacion,
      controlarLote: empresa.controlar_lote
    });
  }

  const total = await recalculateCompra(client, actual.compra_id);
  return { detalle: updated.rows[0], total };
}

async function eliminarItemCompra(client, detalleId, empresaId) {
  const detalleRes = await repo.findCompraDetalleById(client, detalleId, empresaId);
  if (!detalleRes.rowCount) throw new Error("Ãtem no encontrado");

  const actual = detalleRes.rows[0];
  const empresa = await resolveEmpresaConfig(client, empresaId);
  if (!toNumber(actual.tipo_operacion_id)) {
    throw new Error("La compra no tiene tipo_operacion_id configurado");
  }
  const tipoOperacion = await resolveTipoOperacion(client, { tipo_operacion_id: actual.tipo_operacion_id });

  if (estadoAplicaStock(actual.estado)) {
    await ajustarStockPorDelta(client, {
      empresaId,
      compraId: actual.compra_id,
      compraDetalleId: actual.id,
      productoId: actual.producto_id,
      deltaCantidad: -toNumber(actual.cantidad),
      precioUnitario: toNumber(actual.costo),
      lote: actual.lote,
      fechaVencimiento: actual.fecha_vencimiento,
      tipoOperacion,
      controlarLote: empresa.controlar_lote
    });
  }

  await repo.deleteCompraDetalle(client, detalleId);
  const total = await recalculateCompra(client, actual.compra_id);
  return { compra_id: actual.compra_id, total };
}

async function editarCompra(client, compraId, payload, req) {
  const empresaId = await resolveEmpresaId(payload, req);
  const empresa = await resolveEmpresaConfig(client, empresaId);
  const compraRes = await repo.findCompraById(client, compraId, empresaId);
  if (!compraRes.rowCount) throw new Error("Compra no encontrada");

  const actual = compraRes.rows[0];
  const proveedor = await resolveProveedor(client, {
    proveedor_id: payload.proveedor_id || actual.proveedor_id,
    proveedor: payload.proveedor
  });
  const condicionPago = await resolveCondicionPago(client, {
    condicion_pago_id: payload.condicion_pago_id || actual.condicion_pago_id
  });
  const moneda = await resolveMoneda(client, {
    moneda_id: payload.moneda_id || actual.moneda_id
  });
  const tipoOperacion = await resolveTipoOperacion(client, {
    tipo_operacion_id: payload.tipo_operacion_id || actual.tipo_operacion_id
  });
  validarOperacionConCondicionPago(tipoOperacion, condicionPago);
  const estadoNuevo = normalizeEstado(payload.estado || actual.estado);

  if (actual.tipo_operacion_id && toNumber(actual.tipo_operacion_id) !== tipoOperacion.id && estadoAplicaStock(actual.estado)) {
    throw new Error("No se puede cambiar tipo de operaciÃ³n en una compra con stock aplicado");
  }

  if (!estadoAplicaStock(actual.estado) && estadoAplicaStock(estadoNuevo)) {
    const detalles = await repo.listCompraDetalles(client, compraId);
    for (const detalle of detalles.rows) {
      await ajustarStockPorDelta(client, {
        empresaId,
        compraId,
        compraDetalleId: detalle.id,
        productoId: detalle.producto_id,
        deltaCantidad: toNumber(detalle.cantidad),
        precioUnitario: toNumber(detalle.costo),
        lote: detalle.lote,
        fechaVencimiento: detalle.fecha_vencimiento,
        tipoOperacion,
        controlarLote: empresa.controlar_lote
      });
    }
  }

  if (estadoAplicaStock(actual.estado) && !estadoAplicaStock(estadoNuevo)) {
    const detalles = await repo.listCompraDetalles(client, compraId);
    for (const detalle of detalles.rows) {
      await ajustarStockPorDelta(client, {
        empresaId,
        compraId,
        compraDetalleId: detalle.id,
        productoId: detalle.producto_id,
        deltaCantidad: -toNumber(detalle.cantidad),
        precioUnitario: toNumber(detalle.costo),
        lote: detalle.lote,
        fechaVencimiento: detalle.fecha_vencimiento,
        tipoOperacion,
        controlarLote: empresa.controlar_lote
      });
    }
  }

  const updatedNumeroCompra = payload.numero_compra !== undefined
    ? normalizeNumeroCompra(payload.numero_compra)
    : actual.numero_compra || String(compraId);

  const updated = await repo.updateCompra(client, compraId, empresaId, {
    fecha: payload.fecha || actual.fecha,
    proveedor_id: proveedor.id,
    comprador_id: toNumber(payload.comprador_id ?? actual.comprador_id) || null,
    condicion_pago_id: condicionPago.id,
    moneda_id: moneda.id,
    estado: estadoNuevo,
    tipo_operacion_id: tipoOperacion.id,
    numero_compra: updatedNumeroCompra,
    nro_comprobante: normalizeText(payload.nro_comprobante) || actual.nro_comprobante,
    timbrado: normalizeText(payload.timbrado) || actual.timbrado,
    fecha_emision: payload.fecha_emision || actual.fecha_emision || payload.fecha || actual.fecha
  });

  const total = await recalculateCompra(client, compraId);
  return { compra: updated.rows[0], total };
}

async function eliminarCompra(client, compraId, empresaId) {
  const compraRes = await repo.findCompraById(client, compraId, empresaId);
  if (!compraRes.rowCount) throw new Error("Compra no encontrada");
  const compra = compraRes.rows[0];
  if (estadoAplicaStock(compra.estado)) {
    throw new Error("No se puede eliminar una compra con stock aplicado");
  }
  await repo.deleteCompra(client, compraId, empresaId);
  return { ok: true };
}

async function obtenerCompra(client, compraId, empresaId) {
  const cabecera = await repo.getCompraCabecera(client, compraId, empresaId);
  if (!cabecera.rowCount) throw new Error("Compra no encontrada");
  const detalle = await repo.getCompraDetalle(client, compraId);
  return {
    ...cabecera.rows[0],
    detalle: detalle.rows
  };
}

async function buscarCompras(client, payload, req) {
  const empresaId = await resolveEmpresaId(payload, req);
  const params = [empresaId];
  const where = [`WHERE c.empresa_id = $1`, `AND c.movimiento = 'COMPRA'`];

  if (payload.desde) {
    params.push(payload.desde);
    where.push(`AND c.fecha >= $${params.length}`);
  }

  if (payload.hasta) {
    params.push(payload.hasta);
    where.push(`AND c.fecha <= $${params.length}`);
  }

  if (payload.numero_movimiento) {
    params.push(`%${String(payload.numero_movimiento).trim()}%`);
    where.push(`AND COALESCE(c.numero_compra, CAST(c.id AS text)) ILIKE $${params.length}`);
  }

  if (payload.proveedor) {
    params.push(`%${String(payload.proveedor).trim()}%`);
    where.push(`AND p.nombre ILIKE $${params.length}`);
  }

  if (toNumber(payload.moneda_id) > 0) {
    params.push(toNumber(payload.moneda_id));
    where.push(`AND c.moneda_id = $${params.length}`);
  }

  if (payload.producto) {
    params.push(`%${String(payload.producto).trim()}%`);
    where.push(`
      AND EXISTS (
        SELECT 1
        FROM compra_detalle cd2
        JOIN producto p2 ON p2.id = cd2.producto_id
        WHERE cd2.compra_id = c.id
          AND p2.nombre ILIKE $${params.length}
      )
    `);
  }

  if (payload.estado) {
    params.push(normalizeEstado(payload.estado));
    where.push(`AND c.estado = $${params.length}`);
  }

  return repo.searchCompras(client, {
    whereSql: where.join("\n"),
    params
  }).then(r => r.rows);
}

module.exports = {
  agregarItemCompra,
  buscarCompras,
  createCompra,
  editarCompra,
  editarItemCompra,
  eliminarCompra,
  eliminarItemCompra,
  estadoAplicaStock,
  getCompraContextForMutation,
  normalizeEstado,
  normalizeItemPayload,
  normalizeText,
  obtenerCompra,
  recalculateCompra,
  resolveCondicionPago,
  resolveEmpresaId,
  resolveMoneda,
  resolveProducto,
  resolveProveedor,
  resolveTipoOperacion,
  toNumber
};

