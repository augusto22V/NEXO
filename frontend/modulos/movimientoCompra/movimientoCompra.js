const API = "/api/compra/movimientos";
const STORAGE_KEY = "softsysCompraSeleccionada";

const params = new URLSearchParams(window.location.search);
const modoSeleccion = params.get("modo") === "seleccion";

const state = {
  empresaId: Number(params.get("empresa_id") || 0),
  rows: [],
  selectedId: 0
};

const refs = {
  titulo: document.getElementById("mcTitulo"),
  empresaInfo: document.getElementById("mcEmpresaInfo"),
  fechaDesde: document.getElementById("mcFechaDesde"),
  fechaHasta: document.getElementById("mcFechaHasta"),
  estado: document.getElementById("mcEstado"),
  numero: document.getElementById("mcNumero"),
  proveedor: document.getElementById("mcProveedor"),
  body: document.getElementById("mcBody"),
  contador: document.getElementById("mcContador"),
  btnBuscar: document.getElementById("btnBuscar"),
  btnLimpiar: document.getElementById("btnLimpiar"),
  btnVolver: document.getElementById("btnVolver"),
  btnAbrir: document.getElementById("btnAbrir"),
  btnSeleccionar: document.getElementById("btnSeleccionar")
};

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function toText(value) {
  return String(value || "").trim();
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function firstDayOfMonth() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toLocaleDateString("es-PY");
}

function formatNumber(value) {
  return new Intl.NumberFormat("es-PY", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(toNumber(value, 0));
}

function selectedRow() {
  return state.rows.find((row) => Number(row.id) === Number(state.selectedId)) || null;
}

function updateFooter() {
  const row = selectedRow();
  refs.contador.textContent = row
    ? `Seleccionado: #${row.id} - ${row.numero_compra || row.id}`
    : `${state.rows.length} registros`;
  refs.btnAbrir.disabled = !row;
  refs.btnSeleccionar.disabled = !row;
}

function setLoading(message) {
  refs.body.innerHTML = `<tr><td colspan="7" class="mc-empty">${message}</td></tr>`;
}

function setError(message) {
  refs.body.innerHTML = `<tr><td colspan="7" class="mc-empty">${message}</td></tr>`;
}

function renderRows(rows = []) {
  state.rows = Array.isArray(rows) ? rows : [];
  state.selectedId = 0;

  if (!state.rows.length) {
    setLoading("Sin movimientos para los filtros seleccionados.");
    updateFooter();
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const row of state.rows) {
    const tr = document.createElement("tr");
    tr.dataset.id = String(row.id);
    tr.innerHTML = `
      <td>${row.id ?? ""}</td>
      <td>${row.numero_compra || row.id || ""}</td>
      <td>${formatDate(row.fecha)}</td>
      <td>${row.proveedor_nombre || "-"}</td>
      <td>${row.moneda_nombre || "-"}</td>
      <td>${row.estado || "-"}</td>
      <td class="text-right">${formatNumber(row.total)}</td>
    `;
    fragment.appendChild(tr);
  }

  refs.body.innerHTML = "";
  refs.body.appendChild(fragment);
  updateFooter();
}

function aplicarSeleccionEnTabla() {
  const trs = refs.body.querySelectorAll("tr[data-id]");
  trs.forEach((tr) => tr.classList.toggle("mc-activa", Number(tr.dataset.id) === Number(state.selectedId)));
  updateFooter();
}

function seleccionarCompra(row) {
  const id = toNumber(row?.id, 0);
  if (!id) return false;
  const payload = {
    id,
    numero: toNumber(row?.numero_compra || row?.id, 0) || null,
    numero_compra: row?.numero_compra || row?.id || null,
    fecha: row?.fecha || null,
    proveedor_nombre: row?.proveedor_nombre || "",
    estado: row?.estado || ""
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));

  if (window.opener && !window.opener.closed) {
    try {
      if (typeof window.opener.recibirCompra === "function") {
        window.opener.recibirCompra(payload);
      }
      window.opener.focus();
    } catch {
      // noop
    }
    window.close();
    return true;
  }

  window.location.href = `/modulos/compra/compra.html?id=${id}`;
  return true;
}

function abrirCompraSeleccionada() {
  const row = selectedRow();
  if (!row) return;
  if (modoSeleccion) {
    seleccionarCompra(row);
    return;
  }
  window.location.href = `/modulos/compra/compra.html?id=${encodeURIComponent(row.id)}`;
}

function volver() {
  if (modoSeleccion && window.opener && !window.opener.closed) {
    try {
      window.opener.focus();
    } catch {
      // noop
    }
    window.close();
    return;
  }
  window.location.href = "/home.html";
}

function buildQuery() {
  const paramsQuery = new URLSearchParams();
  paramsQuery.set("empresa_id", String(state.empresaId || 0));
  if (toText(refs.fechaDesde.value)) paramsQuery.set("desde", refs.fechaDesde.value);
  if (toText(refs.fechaHasta.value)) paramsQuery.set("hasta", refs.fechaHasta.value);
  if (toText(refs.estado.value)) paramsQuery.set("estado", refs.estado.value);
  if (toText(refs.numero.value)) paramsQuery.set("numero_movimiento", refs.numero.value.trim());
  if (toText(refs.proveedor.value)) paramsQuery.set("proveedor", refs.proveedor.value.trim());
  return paramsQuery.toString();
}

async function buscarMovimientos() {
  refs.btnBuscar.disabled = true;
  setLoading("Buscando movimientos...");
  try {
    const response = await fetch(`${API}?${buildQuery()}`, {
      credentials: "include"
    });
    if (!response.ok) throw new Error("No se pudo consultar movimientos");
    const data = await response.json();
    renderRows(Array.isArray(data) ? data : []);
  } catch (error) {
    setError(error.message || "Error consultando movimientos");
  } finally {
    refs.btnBuscar.disabled = false;
  }
}

function limpiarFiltros() {
  refs.fechaDesde.value = firstDayOfMonth();
  refs.fechaHasta.value = today();
  refs.estado.value = "";
  refs.numero.value = "";
  refs.proveedor.value = "";
  buscarMovimientos();
}

function bindEvents() {
  refs.btnVolver.addEventListener("click", volver);
  refs.btnBuscar.addEventListener("click", buscarMovimientos);
  refs.btnLimpiar.addEventListener("click", limpiarFiltros);
  refs.btnAbrir.addEventListener("click", abrirCompraSeleccionada);
  refs.btnSeleccionar.addEventListener("click", () => {
    const row = selectedRow();
    if (!row) return;
    seleccionarCompra(row);
  });

  refs.body.addEventListener("click", (event) => {
    const tr = event.target.closest("tr[data-id]");
    if (!tr) return;
    state.selectedId = Number(tr.dataset.id);
    aplicarSeleccionEnTabla();
  });

  refs.body.addEventListener("dblclick", (event) => {
    const tr = event.target.closest("tr[data-id]");
    if (!tr) return;
    const row = state.rows.find((item) => Number(item.id) === Number(tr.dataset.id));
    if (!row) return;
    if (modoSeleccion) {
      seleccionarCompra(row);
      return;
    }
    window.location.href = `/modulos/compra/compra.html?id=${encodeURIComponent(row.id)}`;
  });

  [refs.numero, refs.proveedor, refs.fechaDesde, refs.fechaHasta].forEach((el) => {
    el.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      buscarMovimientos();
    });
  });
}

function setModo() {
  refs.titulo.textContent = modoSeleccion ? "Seleccionar Compra" : "Movimiento Compra";
  refs.btnSeleccionar.style.display = modoSeleccion ? "inline-flex" : "none";
  refs.btnAbrir.textContent = modoSeleccion ? "Seleccionar y Volver" : "Abrir Compra";
  refs.empresaInfo.textContent = state.empresaId ? `Empresa ${state.empresaId}` : "";
  refs.btnAbrir.disabled = true;
  refs.btnSeleccionar.disabled = true;
}

function setDefaults() {
  refs.fechaDesde.value = firstDayOfMonth();
  refs.fechaHasta.value = today();
  refs.estado.value = "";
  refs.numero.value = toText(params.get("numero"));
  refs.proveedor.value = toText(params.get("proveedor"));
}

async function asegurarEmpresaId() {
  if (state.empresaId > 0) return;
  try {
    const response = await fetch("/api/auth/verify", { credentials: "include" });
    if (!response.ok) return;
    const data = await response.json();
    const empresa = Number(data?.usuario?.empresa_id || 0);
    if (empresa > 0) state.empresaId = empresa;
  } catch {
    // noop
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  await asegurarEmpresaId();
  setModo();
  setDefaults();
  bindEvents();
  buscarMovimientos();
});
