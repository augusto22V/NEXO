function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeText(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s || null;
}

function normalizeUnidadAlias(value) {
  const u = normalizeText(value)?.toLowerCase();
  if (!u) return null;

  const alias = {
    unidad: "unidad",
    un: "unidad",
    und: "unidad",
    unidades: "unidad",

    gramo: "gramo",
    gramos: "gramo",
    g: "gramo",

    kg: "kg",
    kilo: "kg",
    kilos: "kg",

    litro: "litro",
    litros: "litro",
    l: "litro",

    ml: "ml",
    cc: "ml",
    mililitro: "ml",
    mililitros: "ml"
  };

  return alias[u] || u;
}

function getUnidadMeta(value) {
  const unidad = normalizeUnidadAlias(value);
  const map = {
    unidad: { unidad: "unidad", family: "count", factorBase: 1 },
    gramo: { unidad: "gramo", family: "weight", factorBase: 1 },
    kg: { unidad: "kg", family: "weight", factorBase: 1000 },
    litro: { unidad: "litro", family: "volume", factorBase: 1000 },
    ml: { unidad: "ml", family: "volume", factorBase: 1 }
  };
  return map[unidad] || null;
}

function normalizeForRecipeStorage(cantidad, unidad) {
  const qty = toNumber(cantidad);
  if (qty <= 0) throw new Error("La cantidad debe ser mayor a 0");

  const meta = getUnidadMeta(unidad);
  if (!meta) throw new Error(`Unidad no soportada: ${unidad || "-"}`);

  if (meta.unidad === "kg") {
    return {
      cantidad: qty * 1000,
      unidad: "gramo"
    };
  }

  return {
    cantidad: qty,
    unidad: meta.unidad
  };
}

function convertCantidad(cantidad, unidadFrom, unidadTo) {
  const qty = toNumber(cantidad);
  const from = getUnidadMeta(unidadFrom);
  const to = getUnidadMeta(unidadTo);

  if (!from || !to) {
    throw new Error(`Unidad no soportada para conversion (${unidadFrom || "-"} -> ${unidadTo || "-"})`);
  }

  if (from.family !== to.family) {
    throw new Error(`Unidades incompatibles: ${from.unidad} y ${to.unidad}`);
  }

  const base = qty * from.factorBase;
  return base / to.factorBase;
}

function validateUnidadCompatible(unidadA, unidadB) {
  const a = getUnidadMeta(unidadA);
  const b = getUnidadMeta(unidadB);

  if (!a || !b) {
    throw new Error(`Unidad no soportada para validar (${unidadA || "-"} / ${unidadB || "-"})`);
  }

  if (a.family !== b.family) {
    throw new Error(`No se puede mezclar ${a.unidad} con ${b.unidad}`);
  }

  return true;
}

function formatCantidad(cantidad) {
  const n = toNumber(cantidad);
  return Math.round(n * 10000) / 10000;
}

module.exports = {
  convertCantidad,
  formatCantidad,
  getUnidadMeta,
  normalizeForRecipeStorage,
  normalizeText,
  normalizeUnidadAlias,
  toNumber,
  validateUnidadCompatible
};
