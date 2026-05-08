const MONEDA_BASE_IDS = Object.freeze({
  PYG: 1,
  BRL: 2,
  USD: 3
});

const MONEDA_BASE_LABELS = Object.freeze({
  1: "Guarani",
  2: "Real",
  3: "Dolar"
});

const state = {
  empresaId: null,
  empresaNombre: "",
  monedaBaseId: MONEDA_BASE_IDS.PYG,
  brlGs: 0,
  usdGs: 0,
  lastCotizacionId: ""
};

function byId(id) {
  return document.getElementById(id);
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeMonedaBaseId(value, fallback = MONEDA_BASE_IDS.PYG) {
  const id = Number(value);
  if (id === MONEDA_BASE_IDS.PYG || id === MONEDA_BASE_IDS.BRL || id === MONEDA_BASE_IDS.USD) return id;
  return fallback;
}

function round(value, decimals = 6) {
  const factor = 10 ** decimals;
  return Math.round((toNumber(value, 0) + Number.EPSILON) * factor) / factor;
}

function parseInputNumber(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return NaN;

  const normalized = raw
    .replace(/\s+/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");

  const number = Number(normalized);
  return Number.isFinite(number) ? number : NaN;
}

function formatRate(value) {
  const n = toNumber(value, 0);
  const abs = Math.abs(n);
  const digits = abs > 0 && abs < 1 ? 6 : 2;
  return new Intl.NumberFormat("es-PY", {
    minimumFractionDigits: abs > 0 && abs < 1 ? 4 : 0,
    maximumFractionDigits: digits
  }).format(n);
}

function monedaBaseName(monedaBaseId) {
  const id = normalizeMonedaBaseId(monedaBaseId, MONEDA_BASE_IDS.PYG);
  return MONEDA_BASE_LABELS[id] || "Guarani";
}

function setStatus(message, type = "") {
  const box = byId("estadoCotizacion");
  if (!box) return;
  box.textContent = message || "";
  box.classList.remove("is-ok", "is-error");
  if (type === "ok") box.classList.add("is-ok");
  if (type === "error") box.classList.add("is-error");
}

function setAuditId(id) {
  const input = byId("cotizacionIdActual");
  if (!input) return;
  input.value = id ? String(id) : "";
}

function refreshAuditoria() {
  if (typeof window.refrescarAuditoriaPantalla === "function") {
    window.refrescarAuditoriaPantalla();
  }
}

function currentViewModel() {
  const baseId = normalizeMonedaBaseId(state.monedaBaseId, MONEDA_BASE_IDS.PYG);
  const brlGs = Math.max(toNumber(state.brlGs, 0), 0);
  const usdGs = Math.max(toNumber(state.usdGs, 0), 0);

  if (baseId === MONEDA_BASE_IDS.BRL) {
    const guaraniEnBrl = brlGs > 0 ? 1 / brlGs : 0;
    const dolarEnBrl = brlGs > 0 ? usdGs / brlGs : 0;

    return {
      hint: "Base Real: cargue cuanto vale 1 Guarani y 1 Dolar en Real.",
      fieldA: {
        label: "1 Guarani equivale a (Real)",
        value: guaraniEnBrl
      },
      fieldB: {
        label: "1 Dolar equivale a (Real)",
        value: dolarEnBrl
      },
      resumen: [
        { label: "Moneda base actual", value: "Real" },
        { label: "1 Guarani =", value: `${formatRate(guaraniEnBrl)} Real` },
        { label: "1 Dolar =", value: `${formatRate(dolarEnBrl)} Real` }
      ]
    };
  }

  if (baseId === MONEDA_BASE_IDS.USD) {
    const guaraniEnUsd = usdGs > 0 ? 1 / usdGs : 0;
    const realEnUsd = usdGs > 0 ? brlGs / usdGs : 0;

    return {
      hint: "Base Dolar: cargue cuanto vale 1 Guarani y 1 Real en Dolar.",
      fieldA: {
        label: "1 Guarani equivale a (Dolar)",
        value: guaraniEnUsd
      },
      fieldB: {
        label: "1 Real equivale a (Dolar)",
        value: realEnUsd
      },
      resumen: [
        { label: "Moneda base actual", value: "Dolar" },
        { label: "1 Guarani =", value: `${formatRate(guaraniEnUsd)} Dolar` },
        { label: "1 Real =", value: `${formatRate(realEnUsd)} Dolar` }
      ]
    };
  }

  return {
    hint: "Base Guarani: cargue cuanto vale 1 Real y 1 Dolar en Guarani.",
    fieldA: {
      label: "1 Real equivale a (Gs)",
      value: brlGs
    },
    fieldB: {
      label: "1 Dolar equivale a (Gs)",
      value: usdGs
    },
    resumen: [
      { label: "Moneda base actual", value: "Guarani" },
      { label: "1 Real =", value: `Gs ${formatRate(brlGs)}` },
      { label: "1 Dolar =", value: `Gs ${formatRate(usdGs)}` }
    ]
  };
}

function setInputValue(input, value) {
  if (!input) return;
  const n = toNumber(value, 0);
  input.value = n > 0 ? String(round(n, 6)) : "";
}

function renderView() {
  const model = currentViewModel();

  const empresaTxt = state.empresaNombre || (state.empresaId ? `Empresa ${state.empresaId}` : "Empresa no definida");
  byId("empresaActual").textContent = empresaTxt;

  const baseId = normalizeMonedaBaseId(state.monedaBaseId, MONEDA_BASE_IDS.PYG);
  byId("monedaBaseSelect").value = String(baseId);
  byId("monedaBaseActual").textContent = `${baseId} - ${monedaBaseName(baseId)}`;

  byId("hintEdicion").textContent = model.hint;
  byId("labelCampoA").textContent = model.fieldA.label;
  byId("labelCampoB").textContent = model.fieldB.label;
  setInputValue(byId("campoA"), model.fieldA.value);
  setInputValue(byId("campoB"), model.fieldB.value);

  const resumen = byId("resumenCotizacion");
  resumen.innerHTML = model.resumen
    .map((linea) => `
      <li>
        <span class="resumen-label">${linea.label}</span>
        <span class="resumen-valor">${linea.value}</span>
      </li>
    `)
    .join("");
}

function buildCanonicalRatesFromInput(monedaBaseId, valueA, valueB) {
  const baseId = normalizeMonedaBaseId(monedaBaseId, MONEDA_BASE_IDS.PYG);
  const a = toNumber(valueA, NaN);
  const b = toNumber(valueB, NaN);

  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) return null;

  if (baseId === MONEDA_BASE_IDS.BRL) {
    const brlGs = 1 / a;
    const usdGs = b * brlGs;
    if (!Number.isFinite(brlGs) || !Number.isFinite(usdGs) || brlGs <= 0 || usdGs <= 0) return null;
    return {
      brlGs: round(brlGs, 6),
      usdGs: round(usdGs, 6)
    };
  }

  if (baseId === MONEDA_BASE_IDS.USD) {
    const usdGs = 1 / a;
    const brlGs = b * usdGs;
    if (!Number.isFinite(brlGs) || !Number.isFinite(usdGs) || brlGs <= 0 || usdGs <= 0) return null;
    return {
      brlGs: round(brlGs, 6),
      usdGs: round(usdGs, 6)
    };
  }

  return {
    brlGs: round(a, 6),
    usdGs: round(b, 6)
  };
}

async function cargarCotizacionActual() {
  const res = await fetch("/api/cotizacion/hoy", {
    credentials: "include"
  });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error || "No se pudo cargar cotizacion");
  }

  state.brlGs = toNumber(data.brl, 0);
  state.usdGs = toNumber(data.usd, 0);
  state.empresaId = Number(data.empresa_id || 0) || null;
  state.empresaNombre = String(data.empresa_nombre || "").trim();
  state.monedaBaseId = normalizeMonedaBaseId(data.moneda_base_id, MONEDA_BASE_IDS.PYG);
  state.lastCotizacionId = data.lastCotizacionId ? String(data.lastCotizacionId) : "";

  setAuditId(state.lastCotizacionId);
  refreshAuditoria();
  renderView();
}

async function guardarCotizacion() {
  const valueA = parseInputNumber(byId("campoA")?.value);
  const valueB = parseInputNumber(byId("campoB")?.value);

  const canonical = buildCanonicalRatesFromInput(state.monedaBaseId, valueA, valueB);
  if (!canonical) {
    setStatus("Ingrese valores validos y mayores a cero.", "error");
    return;
  }

  const btn = byId("btnGuardarCotizacion");
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Guardando...";

  try {
    const res = await fetch("/api/cotizacion/guardar", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cotizaciones: [
          { moneda: "REAL", valor: canonical.brlGs },
          { moneda: "DOLAR", valor: canonical.usdGs }
        ]
      })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || "No se pudo guardar cotizacion");
    }

    state.brlGs = canonical.brlGs;
    state.usdGs = canonical.usdGs;
    state.lastCotizacionId = data.lastCotizacionId ? String(data.lastCotizacionId) : state.lastCotizacionId;
    setAuditId(state.lastCotizacionId);
    refreshAuditoria();
    renderView();
    setStatus("Cotizacion actualizada correctamente.", "ok");
  } catch (error) {
    setStatus(error.message || "Error guardando cotizacion.", "error");
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

async function guardarMonedaBase() {
  const selectedBase = normalizeMonedaBaseId(byId("monedaBaseSelect")?.value, state.monedaBaseId);

  const btn = byId("btnGuardarMonedaBase");
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Guardando...";

  try {
    const res = await fetch("/api/cotizacion/base-moneda", {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        empresa_id: state.empresaId,
        moneda_base_id: selectedBase
      })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || "No se pudo guardar moneda base");
    }

    state.monedaBaseId = normalizeMonedaBaseId(data.moneda_base_id, selectedBase);
    state.empresaId = Number(data.empresa_id || state.empresaId || 0) || null;
    state.empresaNombre = String(data.empresa_nombre || state.empresaNombre || "").trim();
    renderView();
    setStatus("Moneda base guardada correctamente.", "ok");
  } catch (error) {
    setStatus(error.message || "Error guardando moneda base.", "error");
    byId("monedaBaseSelect").value = String(state.monedaBaseId);
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

function initEvents() {
  byId("btnGuardarCotizacion")?.addEventListener("click", guardarCotizacion);
  byId("btnGuardarMonedaBase")?.addEventListener("click", guardarMonedaBase);

  byId("monedaBaseSelect")?.addEventListener("change", (event) => {
    state.monedaBaseId = normalizeMonedaBaseId(event.target.value, state.monedaBaseId);
    renderView();
    setStatus("Vista actualizada. Guarde Moneda Base para persistir el cambio.", "");
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      volverSeguro();
    }
  });
}

function volverSeguro() {
  history.back();
}

document.addEventListener("DOMContentLoaded", async () => {
  initEvents();
  try {
    await cargarCotizacionActual();
  } catch (error) {
    setStatus(error.message || "No se pudo cargar la cotizacion actual.", "error");
  }
});

window.volverSeguro = volverSeguro;
