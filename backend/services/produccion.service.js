const repo = require("../repositories/produccion.repository");
const {
  formatCantidad,
  normalizeText,
  toNumber
} = require("./unidades.helper");

function currentLocalDate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function normalizeDate(value) {
  if (!value) return currentLocalDate();
  const raw = String(value).trim();
  if (!raw) return currentLocalDate();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) throw new Error("Fecha invalida");

  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function normalizePositive(value, fieldName) {
  const n = toNumber(value);
  if (n <= 0) throw new Error(`${fieldName} debe ser mayor a 0`);
  return n;
}

function normalizeId(value, fieldName) {
  const n = Math.trunc(toNumber(value));
  if (n <= 0) throw new Error(`${fieldName} invalido`);
  return n;
}

function resolveEmpresaId(payload = {}, req = {}) {
  const empresaId = Math.trunc(toNumber(payload.empresa_id || req?.usuario?.empresa_id));
  if (empresaId <= 0) throw new Error("empresa_id requerido");
  return empresaId;
}

function resolveUsuarioId(payload = {}, req = {}) {
  const usuarioId = Math.trunc(toNumber(req?.usuario?.id || payload.usuario_id));
  return usuarioId > 0 ? usuarioId : null;
}

function calcularConsumos(detalles, cantidadProducida) {
  return detalles.map((item) => {
    const cantidadBase = normalizePositive(item.cantidad, "cantidad de receta");
    const unidadProducto = String(item.unidad_medida_producto || "unidad").trim() || "unidad";

    const cantidadUsada = cantidadBase * cantidadProducida;

    return {
      producto_insumo_id: item.producto_insumo_id,
      producto_insumo: item.producto_insumo,
      unidad_receta: unidadProducto,
      unidad_producto: unidadProducto,
      no_control_stock: item.no_control_stock === true,
      es_insumo: item.es_insumo === true,
      stock_actual: toNumber(item.stock_actual),
      cantidad_base_receta: formatCantidad(cantidadBase),
      cantidad_usada: formatCantidad(cantidadUsada)
    };
  });
}

async function getRecetaContext(client, recetaId, { forUpdate = false } = {}) {
  const recetaRes = await repo.findRecetaById(client, recetaId, { forUpdate });
  if (!recetaRes.rowCount) throw new Error("Receta no encontrada");

  const receta = recetaRes.rows[0];
  if (receta.activo !== true) throw new Error("La receta esta inactiva");
  if (receta.producto_final_es_insumo === true) {
    throw new Error("La receta es invalida: producto final marcado como insumo");
  }

  const detalleRes = await repo.listRecetaDetalle(client, recetaId, { forUpdate });
  if (!detalleRes.rowCount) throw new Error("La receta no tiene insumos");

  for (const row of detalleRes.rows) {
    if (row.es_insumo !== true) {
      throw new Error(`La receta contiene un producto no insumo: ${row.producto_insumo}`);
    }
  }

  return {
    receta,
    detalleRows: detalleRes.rows
  };
}

function evaluarStockConsumos(consumos) {
  const faltantes = [];

  for (const consumo of consumos) {
    if (!consumo.no_control_stock && consumo.stock_actual < consumo.cantidad_usada) {
      faltantes.push({
        producto_insumo_id: consumo.producto_insumo_id,
        producto_insumo: consumo.producto_insumo,
        stock_actual: formatCantidad(consumo.stock_actual),
        cantidad_requerida: formatCantidad(consumo.cantidad_usada),
        unidad: consumo.unidad_producto,
        faltante: formatCantidad(consumo.cantidad_usada - consumo.stock_actual)
      });
    }
  }

  return {
    ok: faltantes.length === 0,
    faltantes
  };
}

async function previewProduccion(client, payload = {}) {
  const recetaId = normalizeId(payload.receta_id, "receta_id");
  const cantidadProducida = normalizePositive(payload.cantidad_producida, "cantidad_producida");

  const { receta, detalleRows } = await getRecetaContext(client, recetaId, { forUpdate: false });
  const consumos = calcularConsumos(detalleRows, cantidadProducida);
  const stockCheck = evaluarStockConsumos(consumos);

  return {
    receta: {
      id: receta.id,
      nombre: receta.nombre,
      producto_id: receta.producto_id,
      producto_final: receta.producto_final,
      unidad_producto_final: receta.producto_final_unidad
    },
    cantidad_producida: formatCantidad(cantidadProducida),
    insumos: consumos,
    stock: stockCheck
  };
}

async function createProduccion(client, payload = {}, req = {}) {
  const recetaId = normalizeId(payload.receta_id, "receta_id");
  const cantidadProducida = normalizePositive(payload.cantidad_producida, "cantidad_producida");
  const fecha = normalizeDate(payload.fecha);
  const empresaId = resolveEmpresaId(payload, req);
  const usuarioId = resolveUsuarioId(payload, req);

  const { receta, detalleRows } = await getRecetaContext(client, recetaId, { forUpdate: true });
  const consumos = calcularConsumos(detalleRows, cantidadProducida);
  const stockCheck = evaluarStockConsumos(consumos);

  if (!stockCheck.ok) {
    const faltante = stockCheck.faltantes[0];
    throw new Error(`Stock insuficiente para ${faltante.producto_insumo}`);
  }

  const produccionRes = await repo.insertProduccion(client, {
    receta_id: recetaId,
    cantidad_producida: cantidadProducida,
    fecha,
    usuario_id: usuarioId
  });

  const produccion = produccionRes.rows[0];

  for (const consumo of consumos) {
    await repo.insertProduccionConsumo(client, {
      produccion_id: produccion.id,
      producto_insumo_id: consumo.producto_insumo_id,
      cantidad_usada: consumo.cantidad_usada
    });

    await repo.insertStockMovimiento(client, {
      producto_id: consumo.producto_insumo_id,
      empresa_id: empresaId,
      tipo: "SALIDA",
      cantidad: consumo.cantidad_usada,
      costo: 0,
      referencia_id: produccion.id,
      referencia_tipo: "PRODUCCION",
      lote: null,
      fecha_vencimiento: null
    });
  }

  await repo.insertStockMovimiento(client, {
    producto_id: receta.producto_id,
    empresa_id: empresaId,
    tipo: "ENTRADA",
    cantidad: cantidadProducida,
    costo: 0,
    referencia_id: produccion.id,
    referencia_tipo: "PRODUCCION",
    lote: null,
    fecha_vencimiento: null
  });

  const detalleOut = await repo.listProduccionConsumo(client, produccion.id);

  return {
    produccion: {
      ...produccion,
      receta_nombre: receta.nombre,
      producto_id: receta.producto_id,
      producto_final: receta.producto_final
    },
    consumos: detalleOut.rows
  };
}

async function listProduccion(client, query = {}) {
  const filters = {
    receta_id: Math.trunc(toNumber(query.receta_id)) || null,
    desde: normalizeText(query.desde),
    hasta: normalizeText(query.hasta)
  };

  const res = await repo.listProduccion(client, filters);
  return res.rows;
}

async function getProduccionById(client, produccionId) {
  const id = normalizeId(produccionId, "ID");

  const cabecera = await repo.getProduccionById(client, id);
  if (!cabecera.rowCount) throw new Error("Produccion no encontrada");

  const detalle = await repo.listProduccionConsumo(client, id);

  return {
    ...cabecera.rows[0],
    insumos: detalle.rows
  };
}

async function getReporteProduccion(client, query = {}) {
  const filters = {
    desde: normalizeText(query.desde),
    hasta: normalizeText(query.hasta)
  };

  const data = await repo.getReporteProduccion(client, filters);

  return {
    filtros: filters,
    resumen: {
      lotes: data.porFecha.reduce((a, r) => a + toNumber(r.lotes), 0),
      cantidad_producida: data.porFecha.reduce((a, r) => a + toNumber(r.cantidad_total), 0),
      producto_mas_producido: data.topProducto || null
    },
    por_fecha: data.porFecha,
    consumo: data.consumoResumen,
    detalle: data.detalle
  };
}

module.exports = {
  createProduccion,
  getProduccionById,
  getReporteProduccion,
  listProduccion,
  previewProduccion
};

