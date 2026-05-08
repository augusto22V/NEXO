const repo = require("../repositories/receta.repository");
const {
  formatCantidad,
  normalizeText,
  toNumber
} = require("./unidades.helper");

function normalizeId(value, fieldName) {
  const n = Math.trunc(toNumber(value));
  if (n <= 0) throw new Error(`${fieldName} invalido`);
  return n;
}

function normalizeBoolean(value, fallback = true) {
  if (value === undefined || value === null) return fallback;
  if (typeof value === "boolean") return value;
  const raw = String(value).trim().toLowerCase();
  if (["true", "1", "si", "yes"].includes(raw)) return true;
  if (["false", "0", "no"].includes(raw)) return false;
  return fallback;
}

function normalizeCantidadPositiva(value, fieldName) {
  const n = toNumber(value);
  if (n <= 0) throw new Error(`${fieldName} debe ser mayor a 0`);
  return n;
}

async function resolveProducto(client, productoId, fieldName = "producto") {
  const id = normalizeId(productoId, fieldName);
  const res = await repo.findProductoById(client, id);
  if (!res.rowCount) throw new Error(`${fieldName} no encontrado`);
  const row = res.rows[0];
  if (row.activo !== true) throw new Error(`${fieldName} inactivo`);
  return row;
}

function normalizeRecetaNombre(payload = {}, productoFinal = null) {
  const nombre = normalizeText(payload.nombre);
  if (nombre) return nombre;
  if (productoFinal?.nombre) return `Receta ${productoFinal.nombre}`;
  return "Receta";
}

function normalizeDetallesInput(detallesRaw) {
  const detalles = Array.isArray(detallesRaw) ? detallesRaw : [];
  if (!detalles.length) throw new Error("No se puede guardar receta vacia");
  return detalles;
}

async function createReceta(client, payload = {}) {
  const productoFinal = await resolveProducto(client, payload.producto_id, "Producto final");

  if (productoFinal.es_insumo === true) {
    throw new Error("El producto final no puede estar marcado como insumo");
  }

  const nombre = normalizeRecetaNombre(payload, productoFinal);
  const activo = normalizeBoolean(payload.activo, true);
  const detalles = normalizeDetallesInput(payload.detalles);

  const recetaRes = await repo.insertReceta(client, {
    producto_id: productoFinal.id,
    nombre,
    activo
  });

  const receta = recetaRes.rows[0];
  const unique = new Set();

  for (const item of detalles) {
    const insumoId = normalizeId(item.producto_insumo_id, "Insumo");
    if (insumoId === productoFinal.id) {
      throw new Error("El producto final no puede ser insumo de su propia receta");
    }
    if (unique.has(insumoId)) {
      throw new Error("No se permiten insumos repetidos en la misma receta");
    }
    unique.add(insumoId);

    const insumo = await resolveProducto(client, insumoId, "Insumo");

    if (insumo.es_insumo !== true) {
      throw new Error(`El producto ${insumo.nombre} no esta marcado como insumo`);
    }

    const cantidad = normalizeCantidadPositiva(item.cantidad, "cantidad");

    await repo.insertRecetaDetalle(client, {
      receta_id: receta.id,
      producto_insumo_id: insumo.id,
      cantidad: formatCantidad(cantidad)
    });
  }

  return getRecetaById(client, receta.id);
}

async function listRecetas(client, query = {}) {
  const buscar = normalizeText(query.buscar);
  const activo = query.activo === undefined ? true : normalizeBoolean(query.activo, true);
  const limit = Math.min(Math.max(Math.trunc(toNumber(query.limit, 20)), 1), 100);

  const res = await repo.listRecetas(client, { buscar, activo, limit });
  return res.rows;
}

async function getRecetaById(client, recetaId) {
  const id = normalizeId(recetaId, "ID receta");

  const cabeceraRes = await repo.getRecetaById(client, id);
  if (!cabeceraRes.rowCount) throw new Error("Receta no encontrada");

  const cabecera = cabeceraRes.rows[0];
  const detalleRes = await repo.listRecetaDetalle(client, id);

  const detalles = detalleRes.rows.map((row) => ({
    id: row.id,
    producto_insumo_id: row.producto_insumo_id,
    producto_insumo: row.producto_insumo,
    cantidad: formatCantidad(row.cantidad),
    unidad: row.unidad_medida_producto,
    unidad_medida_producto: row.unidad_medida_producto,
    es_insumo: row.es_insumo === true
  }));

  return {
    ...cabecera,
    detalles
  };
}

module.exports = {
  createReceta,
  getRecetaById,
  listRecetas
};
