const API = "/api/productos/consulta";
const API_DETALLE = "/api/productos/consulta/detalle";
const API_PERMISOS_ME = "/api/permisos/me";
const STORAGE_KEY = "consulta_productos_filtros_v4";
const STORAGE_COLOR_KEY = "consulta_productos_colores_v1";
const CATEGORY_SESSION_KEY = "consultaProductosCategoriaSeleccionada";
const VENTA_PRODUCTO_SESSION_KEY = "ventaProductoSeleccionado";
const COMPRA_PRODUCTO_STORAGE_KEY = "softsysProductoSeleccionado";

const consultaQueryParams = new URLSearchParams(window.location.search);
const modoSeleccion = consultaQueryParams.get("modo") === "seleccion";
const fromSeleccion = String(consultaQueryParams.get("from") || "").trim().toLowerCase();
const isSelectFromVenta = modoSeleccion && fromSeleccion === "venta";
const isSelectFromCompra = modoSeleccion && fromSeleccion === "compra";
const initialBuscar = String(consultaQueryParams.get("buscar") || "").trim();
const SORTABLE_KEYS = new Set(["id", "nombre", "stock"]);

const refs = {
  fEmpresa: document.getElementById("fEmpresa"),
  fBusquedaRapida: document.getElementById("fBusquedaRapida"),
  fCodigoProducto: document.getElementById("fCodigoProducto"),
  fCodigoBarra: document.getElementById("fCodigoBarra"),
  fCategoriaDisplay: document.getElementById("fCategoriaDisplay"),
  fCategoriaId: document.getElementById("fCategoriaId"),
  btnCategoriaBuscar: document.getElementById("btnCategoriaBuscar"),
  fTipoSaldo: document.getElementById("fTipoSaldo"),
  fTipoValor: document.getElementById("fTipoValor"),
  fMonedaCompra: document.getElementById("fMonedaCompra"),
  fEsInsumo: document.getElementById("fEsInsumo"),
  fFacturacionDirecta: document.getElementById("fFacturacionDirecta"),
  fLimit: document.getElementById("fLimit"),
  fMostrarInactivos: document.getElementById("fMostrarInactivos"),
  fColorPositivo: document.getElementById("fColorPositivo"),
  fColorNegativo: document.getElementById("fColorNegativo"),
  btnColorReset: document.getElementById("btnColorReset"),
  btnBuscar: document.getElementById("btnBuscar"),
  btnLimpiar: document.getElementById("btnLimpiar"),
  cpTablaBody: document.getElementById("cpTablaBody"),
  cpInfo: document.getElementById("cpInfo"),
  cpSeleccion: document.getElementById("cpSeleccion"),
  dFechaUltCompra: document.getElementById("dFechaUltCompra"),
  dUltProveedor: document.getElementById("dUltProveedor"),
  dUltMovto: document.getElementById("dUltMovto"),
  dUltCompra: document.getElementById("dUltCompra"),
  dCostoFinal: document.getElementById("dCostoFinal"),
  dMoneda: document.getElementById("dMoneda"),
  dLocalizacion: document.getElementById("dLocalizacion"),
  sortHeaders: Array.from(document.querySelectorAll(".cp-sortable[data-sort-key]"))
};

let selectedId = null;
let currentRows = [];
let currentRowsById = new Map();
let debounceTimer = null;
let sortState = { key: "id", dir: "asc" };
let detalleRequestSeq = 0;
const detalleCache = new Map();

const MONEDA_IDS = Object.freeze({
  PYG: 1,
  BRL: 2,
  USD: 3
});

const MONEDA_SUFFIX = Object.freeze({
  1: "Gs",
  2: "R$",
  3: "US$"
});

const MONEDA_NOMBRE_CORTO = Object.freeze({
  1: "GUARANI",
  2: "REAL",
  3: "DOLAR"
});

const COLOR_DEFAULTS = Object.freeze({
  positivo: "#1f6a36",
  negativo: "#9b1c1c"
});

function normalizarMonedaId(value) {
  const id = Number(value || 0);
  if (id === MONEDA_IDS.PYG || id === MONEDA_IDS.BRL || id === MONEDA_IDS.USD) return id;
  return MONEDA_IDS.PYG;
}

function formatMontoMoneda(monedaId, value) {
  const monto = Number(value);
  if (!Number.isFinite(monto)) return "-";

  const id = normalizarMonedaId(monedaId);
  const abs = Math.abs(monto);
  const negative = monto < 0 ? "-" : "";

  if (id === MONEDA_IDS.PYG) {
    return `${negative}${Math.round(abs).toLocaleString("es-PY", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    })}`;
  }

  return `${negative}${abs.toLocaleString("es-PY", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  })}`;
}

function formatMontoConMoneda(monedaId, value) {
  const id = normalizarMonedaId(monedaId);
  const monto = formatMontoMoneda(id, value);
  if (monto === "-") return "-";
  return `${monto} ${MONEDA_SUFFIX[id] || MONEDA_SUFFIX[MONEDA_IDS.PYG]}`;
}

function getMonedaProductoId(row) {
  return normalizarMonedaId(row?.precio_compra_moneda_id ?? row?.moneda_id ?? MONEDA_IDS.PYG);
}

function formatCostoProducto(row) {
  const monedaId = getMonedaProductoId(row);
  return formatMontoConMoneda(monedaId, Number(row?.costo_total ?? row?.precio_compra ?? 0));
}

function formatPrecioProducto(row, value) {
  const monedaId = getMonedaProductoId(row);
  return formatMontoConMoneda(monedaId, Number(value || 0));
}

function getMonedaCompraLabel(row) {
  const id = getMonedaProductoId(row);
  return MONEDA_NOMBRE_CORTO[id] || MONEDA_NOMBRE_CORTO[MONEDA_IDS.PYG];
}

function getValueToneClass(value, { zeroAsNegative = true } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  if (n > 0) return "cp-value-positive";
  if (n < 0) return "cp-value-negative";
  if (zeroAsNegative) return "cp-value-negative";
  return "cp-value-zero";
}

function applyStockToneToRow(tr, stock) {
  if (!tr) return;

  tr.classList.remove("cp-row-stock-positive", "cp-row-stock-negative");

  if (Number(stock) <= 0) {
    tr.classList.add("cp-row-stock-negative");
    return;
  }

  tr.classList.add("cp-row-stock-positive");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getQuickDescription(row) {
  const nombre = String(row?.nombre || "").trim();
  const desc = String(row?.descripcion || "").trim();
  if (nombre && desc && desc.toLowerCase() !== nombre.toLowerCase()) {
    return `${nombre} - ${desc}`;
  }
  return nombre || desc || "-";
}

function getCategoriaLabel(row) {
  const nombre = String(row?.categoria_nombre || row?.categoria || "").trim();
  if (nombre) return nombre;
  return row?.categoria_id ?? "-";
}

function isActivo(row) {
  const raw = row?.activo;
  return raw === true || raw === 1 || raw === "1" || raw === "S" || raw === "s" || raw === "A" || raw === "a";
}

function formatStock(value) {
  const n = Number(value || 0);
  if (Number.isFinite(n)) return n.toLocaleString("es-PY", { minimumFractionDigits: 0, maximumFractionDigits: 3 });
  return String(value ?? "0");
}

function mapProductoSeleccionCompra(row) {
  const monedaId = getMonedaProductoId(row);
  return {
    id: Number(row?.id || 0),
    nombre: getQuickDescription(row),
    codigo_barra: row?.codigo_barra || "",
    precio_compra: Number(row?.precio_compra_origen ?? row?.precio_compra ?? row?.costo_total ?? 0) || 0,
    precio_compra_origen: Number(row?.precio_compra_origen ?? row?.precio_compra ?? row?.costo_total ?? 0) || 0,
    precio_compra_moneda_id: monedaId,
    moneda_id: monedaId,
    precio_venta: Number(row?.precio_venta ?? 0) || 0,
    precio_mayorista: Number(row?.precio_mayorista ?? row?.precio_venta ?? 0) || 0,
    precio_minimo: Number(row?.precio_minimo ?? 0) || 0,
    stock: Number(row?.stock ?? 0) || 0
  };
}

function devolverProductoSeleccionadoVenta(row) {
  const id = Number(row?.id || 0);
  if (!id) return;

  sessionStorage.setItem(VENTA_PRODUCTO_SESSION_KEY, JSON.stringify({
    id,
    nombre: getQuickDescription(row)
  }));

  window.location.href = "/modulos/venta/venta_rapida.html";
}

function devolverProductoSeleccionadoCompra(row) {
  const payload = mapProductoSeleccionCompra(row);
  if (!payload.id) return;

  // Guardar en localStorage como respaldo (lo consume compra al recibir foco)
  localStorage.setItem(COMPRA_PRODUCTO_STORAGE_KEY, JSON.stringify(payload));

  if (window.opener && !window.opener.closed) {
    // Llamar directo a la función del opener (más confiable que localStorage)
    try {
      if (typeof window.opener.recibirProducto === "function") {
        window.opener.recibirProducto(payload);
      }
      window.opener.focus();
    } catch (e) {
      console.error("Error transfiriendo producto al compra:", e);
    }

    window.close();

    // Fallback: si window.close() no cerró la ventana (bloqueado por Chrome),
    // redirigir la pestaña/popup para que el usuario vuelva a compra.
    setTimeout(() => {
      try { window.location.href = "/modulos/compra/compra.html"; } catch { /* noop */ }
    }, 400);
    return;
  }

  // Sin opener: navegar directamente (el init de compra leerá el localStorage)
  window.location.href = "/modulos/compra/compra.html";
}

function openCategoriaSelector() {
  window.location.href = "/modulos/categorias/categoria.html?from=consulta_productos";
}

function consumeSelectedCategoriaFromSession() {
  const raw = sessionStorage.getItem(CATEGORY_SESSION_KEY);
  if (!raw) return false;

  sessionStorage.removeItem(CATEGORY_SESSION_KEY);

  try {
    const picked = JSON.parse(raw);
    const id = Number(picked?.id || 0);
    const nombre = String(picked?.nombre || "").trim();
    if (!id) return false;

    refs.fCategoriaId.value = String(id);
    refs.fCategoriaDisplay.value = nombre ? `${id} - ${nombre}` : String(id);
    return true;
  } catch {
    return false;
  }
}

function clearCategoriaSelection() {
  refs.fCategoriaId.value = "";
  refs.fCategoriaDisplay.value = "Todas";
}

function applySortState(sortBy, sortDir) {
  if (SORTABLE_KEYS.has(sortBy)) {
    sortState.key = sortBy;
  }

  if (sortDir === "asc" || sortDir === "desc") {
    sortState.dir = sortDir;
  }

  updateSortIndicators();
}

function readFiltersFromUI() {
  return {
    empresa_id: refs.fEmpresa.value.trim(),
    codigo_producto: refs.fCodigoProducto.value.trim(),
    descripcion: refs.fBusquedaRapida.value.trim(),
    codigo_barra: refs.fCodigoBarra.value.trim(),
    categoria_id: refs.fCategoriaId.value.trim(),
    tipo_saldo: refs.fTipoSaldo.value,
    tipo_valor: refs.fTipoValor.value,
    moneda_compra_id: refs.fMonedaCompra.value,
    es_insumo: refs.fEsInsumo.value,
    facturacion_directa: refs.fFacturacionDirecta.value,
    sort_by: sortState.key,
    sort_dir: sortState.dir,
    limit: refs.fLimit.value.trim(),
    mostrar_inactivos: refs.fMostrarInactivos.checked ? "true" : "false"
  };
}

function writeFiltersToUI(filters = {}) {
  refs.fEmpresa.value = filters.empresa_id || "";
  refs.fBusquedaRapida.value = filters.busqueda_rapida || filters.descripcion || "";
  refs.fCodigoProducto.value = filters.codigo_producto || "";
  refs.fCodigoBarra.value = filters.codigo_barra || "";
  refs.fCategoriaId.value = filters.categoria_id || "";

  if (refs.fCategoriaId.value) {
    refs.fCategoriaDisplay.value = filters.categoria_display || refs.fCategoriaId.value;
  } else {
    clearCategoriaSelection();
  }

  refs.fTipoSaldo.value = filters.tipo_saldo || "todos";
  refs.fTipoValor.value = filters.tipo_valor || "todos";
  refs.fMonedaCompra.value = filters.moneda_compra_id || "";
  refs.fEsInsumo.value = filters.es_insumo || "";
  refs.fFacturacionDirecta.value = filters.facturacion_directa || "";
  refs.fLimit.value = filters.limit || "300";
  refs.fMostrarInactivos.checked = String(filters.mostrar_inactivos || "false") === "true";

  applySortState(filters.sort_by || "id", filters.sort_dir || "asc");
}

function saveFiltersState() {
  const payload = {
    ...readFiltersFromUI(),
    busqueda_rapida: refs.fBusquedaRapida.value.trim(),
    categoria_display: refs.fCategoriaDisplay.value.trim()
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function restoreFiltersState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    clearCategoriaSelection();
    applySortState("id", "asc");
    return;
  }

  try {
    const parsed = JSON.parse(raw);
    writeFiltersToUI(parsed || {});
  } catch {
    clearCategoriaSelection();
    applySortState("id", "asc");
  }
}

function readColorConfig() {
  return {
    positivo: refs.fColorPositivo?.value || COLOR_DEFAULTS.positivo,
    negativo: refs.fColorNegativo?.value || COLOR_DEFAULTS.negativo
  };
}

function applyColorConfig(colors = {}) {
  const positivo = String(colors.positivo || COLOR_DEFAULTS.positivo);
  const negativo = String(colors.negativo || COLOR_DEFAULTS.negativo);

  if (refs.fColorPositivo) refs.fColorPositivo.value = positivo;
  if (refs.fColorNegativo) refs.fColorNegativo.value = negativo;

  document.documentElement.style.setProperty("--cp-value-positive-text", positivo);
  document.documentElement.style.setProperty("--cp-value-negative-text", negativo);
}

function saveColorConfig() {
  localStorage.setItem(STORAGE_COLOR_KEY, JSON.stringify(readColorConfig()));
}

function restoreColorConfig() {
  const raw = localStorage.getItem(STORAGE_COLOR_KEY);
  if (!raw) {
    applyColorConfig(COLOR_DEFAULTS);
    return;
  }
  try {
    applyColorConfig(JSON.parse(raw) || COLOR_DEFAULTS);
  } catch {
    applyColorConfig(COLOR_DEFAULTS);
  }
}

async function cargarEmpresaDefaultUsuario() {
  if (!refs.fEmpresa) return;
  const actual = Number(refs.fEmpresa.value || 0);
  if (Number.isFinite(actual) && actual > 0) return;

  try {
    const res = await fetch(API_PERMISOS_ME, {
      credentials: "include",
      cache: "no-store",
      headers: { "Cache-Control": "no-cache" }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return;
    const empresaId = Number(data?.empresa_id || 0);
    if (Number.isFinite(empresaId) && empresaId > 0) {
      refs.fEmpresa.value = String(empresaId);
      saveFiltersState();
    }
  } catch {
    // noop
  }
}

function buildQueryString(filters) {
  const params = new URLSearchParams();

  Object.entries(filters).forEach(([key, value]) => {
    if (value === "" || value == null) return;
    params.set(key, value);
  });

  params.set("page", "1");
  return params.toString();
}

function setInfo(text) {
  refs.cpInfo.textContent = text;
}

function enfocarBusquedaRapida() {
  if (!refs.fBusquedaRapida) return;
  requestAnimationFrame(() => {
    refs.fBusquedaRapida.focus();
    refs.fBusquedaRapida.select();
  });
  setTimeout(() => {
    refs.fBusquedaRapida?.focus();
    refs.fBusquedaRapida?.select();
  }, 120);
}

function setSelectionText(row) {
  if (!row) {
    refs.cpSeleccion.textContent = "";
    return;
  }

  refs.cpSeleccion.textContent = `Seleccionado: #${row.id} ${getQuickDescription(row)}`;
}

function formatFechaCorta(value) {
  if (!value) return "-";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return "-";
  return dt.toLocaleDateString("es-PY");
}

function monedaIdFromText(value) {
  const txt = String(value || "").toUpperCase();
  if (txt.includes("REAL")) return MONEDA_IDS.BRL;
  if (txt.includes("DOLAR") || txt.includes("USD")) return MONEDA_IDS.USD;
  return MONEDA_IDS.PYG;
}

function setDetallePanel(detalle = null) {
  const monedaUltCompra = normalizarMonedaId(detalle?.moneda_id || monedaIdFromText(detalle?.moneda));
  refs.dFechaUltCompra.textContent = formatFechaCorta(detalle?.fecha_ultima_compra);
  refs.dUltProveedor.textContent = detalle?.ultimo_proveedor || "-";
  refs.dUltMovto.textContent = detalle?.numero_ultimo_movimiento || "-";
  refs.dUltCompra.textContent = detalle?.ultima_compra == null
    ? "-"
    : formatMontoConMoneda(monedaUltCompra, detalle.ultima_compra);
  refs.dCostoFinal.textContent = detalle?.costo_final == null
    ? "-"
    : formatMontoConMoneda(monedaUltCompra, detalle.costo_final);
  refs.dMoneda.textContent = String(detalle?.moneda || "-").toUpperCase();
  refs.dLocalizacion.textContent = detalle?.localizacion_producto || "";
}

function clearDetallePanel() {
  setDetallePanel(null);
}

function clearTableWithMessage(message) {
  const columnas = document.querySelectorAll(".cp-tabla thead th").length || 13;
  refs.cpTablaBody.innerHTML = `<tr><td colspan="${columnas}" class="cp-vacio">${message}</td></tr>`;
}

function updateSortIndicators() {
  refs.sortHeaders.forEach((th) => {
    th.classList.remove("is-active", "is-asc", "is-desc");
    const key = th.dataset.sortKey;
    if (key === sortState.key) {
      th.classList.add("is-active", sortState.dir === "asc" ? "is-asc" : "is-desc");
    }
  });
}

async function cargarDetalleProducto(productoId) {
  const id = Number(productoId || 0);
  if (!id || isSelectFromVenta || isSelectFromCompra) return;
  const empresaId = Number(refs.fEmpresa?.value || 0);
  const empresaQuery = Number.isFinite(empresaId) && empresaId > 0
    ? `?empresa_id=${encodeURIComponent(String(empresaId))}`
    : "";

  if (detalleCache.has(id)) {
    setDetallePanel(detalleCache.get(id));
    return;
  }

  const seq = ++detalleRequestSeq;
  refs.dFechaUltCompra.textContent = "Cargando...";

  try {
    const res = await fetch(`${API_DETALLE}/${id}${empresaQuery}`);
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error || "No se pudo cargar detalle");
    if (seq !== detalleRequestSeq) return;
    detalleCache.set(id, data || {});
    setDetallePanel(data || {});
  } catch {
    if (seq !== detalleRequestSeq) return;
    setDetallePanel(null);
  }
}

function updateSelectedRowVisual() {
  const selected = Number(selectedId || 0);
  refs.cpTablaBody.querySelectorAll("tr[data-id]").forEach((tr) => {
    const trId = Number(tr.dataset.id || 0);
    tr.classList.toggle("fila-seleccionada", selected > 0 && trId === selected);
  });
}

function seleccionarProducto(row) {
  if (!row) return;

  selectedId = Number(row.id || 0) || null;
  setSelectionText(row);
  updateSelectedRowVisual();
  cargarDetalleProducto(selectedId);
}

function renderRows(rows) {
  currentRows = Array.isArray(rows) ? rows : [];
  currentRowsById = new Map(currentRows.map((row) => [Number(row.id || 0), row]));

  if (!currentRows.length) {
    selectedId = null;
    setSelectionText(null);
    clearDetallePanel();
    clearTableWithMessage("Sin resultados para los filtros seleccionados.");
    return;
  }

  const fragment = document.createDocumentFragment();

  currentRows.forEach((row) => {
    const tr = document.createElement("tr");
    const rowId = Number(row.id || 0);
    const isSelected = rowId > 0 && rowId === Number(selectedId);
    if (isSelected) tr.classList.add("fila-seleccionada");
    tr.dataset.id = String(rowId);

    const activo = isActivo(row);
    const estado = activo ? "ACTIVO" : "INACTIVO";
    const estadoClass = activo ? "" : "cp-estado-inactivo";
    const stock = Number(row.stock || 0);
    applyStockToneToRow(tr, stock);

    tr.innerHTML = `
      <td class="col-code">${escapeHtml(row.id ?? "")}</td>
      <td class="col-desc">${escapeHtml(getQuickDescription(row))}</td>
      <td class="col-stock">${escapeHtml(formatStock(stock))}</td>
      <td class="col-barra col-tablet">${escapeHtml(row.codigo_barra || "-")}</td>
      <td class="col-categoria col-tablet">${escapeHtml(getCategoriaLabel(row))}</td>
      <td class="col-costo col-landscape">${escapeHtml(formatCostoProducto(row))}</td>
      <td class="col-minorista col-landscape">${escapeHtml(formatPrecioProducto(row, Number(row.precio_venta ?? 0)))}</td>
      <td class="col-mayorista col-landscape">${escapeHtml(formatPrecioProducto(row, Number(row.precio_mayorista ?? row.precio_venta ?? 0)))}</td>
      <td class="col-minimo col-landscape">${escapeHtml(formatPrecioProducto(row, Number(row.precio_minimo ?? 0)))}</td>
      <td class="col-promocional col-landscape">${escapeHtml(formatPrecioProducto(row, Number(row.precio_promocional ?? 0)))}</td>
      <td class="col-moneda col-landscape">${escapeHtml(getMonedaCompraLabel(row))}</td>
      <td class="col-estado col-landscape ${estadoClass}">${escapeHtml(estado)}</td>
      <td class="col-destino col-landscape">${escapeHtml(row.destino_impresion || "-")}</td>
    `;

    fragment.appendChild(tr);
  });

  refs.cpTablaBody.innerHTML = "";
  refs.cpTablaBody.appendChild(fragment);

  if (!currentRowsById.has(Number(selectedId || 0))) {
    selectedId = null;
    setSelectionText(null);
    clearDetallePanel();
  } else {
    const row = currentRowsById.get(Number(selectedId));
    setSelectionText(row);
    updateSelectedRowVisual();
    cargarDetalleProducto(selectedId);
  }
}

async function buscarProductos() {
  saveFiltersState();
  detalleCache.clear();

  const filters = readFiltersFromUI();
  const query = buildQueryString(filters);

  refs.btnBuscar.disabled = true;
  refs.btnBuscar.textContent = "Buscando...";

  try {
    const res = await fetch(`${API}?${query}`);
    if (!res.ok) throw new Error("No se pudo consultar");

    const data = await res.json();
    const rows = Array.isArray(data?.rows) ? data.rows : [];

    renderRows(rows);
    const modoTexto = (isSelectFromVenta || isSelectFromCompra)
      ? " | Toque un título para seleccionar"
      : ` | Orden: ${sortState.key} (${sortState.dir})`;
    setInfo(`Registros: ${rows.length}${modoTexto}`);
  } catch (err) {
    console.error(err);
    clearTableWithMessage("Error al consultar libros y artículos.");
    setInfo("Error de consulta");
  } finally {
    refs.btnBuscar.disabled = false;
    refs.btnBuscar.textContent = "Buscar";
  }
}

function buscarProductosDebounced() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    buscarProductos();
  }, 280);
}

function toggleSort(key) {
  if (!SORTABLE_KEYS.has(key)) return;

  if (sortState.key === key) {
    sortState.dir = sortState.dir === "asc" ? "desc" : "asc";
  } else {
    sortState.key = key;
    sortState.dir = "asc";
  }

  updateSortIndicators();
  buscarProductos();
}

function limpiarFiltros() {
  const empresaActual = refs.fEmpresa.value.trim();
  writeFiltersToUI({
    empresa_id: empresaActual,
    tipo_saldo: "todos",
    tipo_valor: "todos",
    moneda_compra_id: "",
    limit: "300",
    mostrar_inactivos: "false",
    busqueda_rapida: "",
    sort_by: "id",
    sort_dir: "asc"
  });
  clearCategoriaSelection();
  saveFiltersState();
  selectedId = null;
  setSelectionText(null);
  clearDetallePanel();
  setInfo("Filtros limpiados. Cargando...");
  clearTableWithMessage("Cargando...");
  buscarProductos();
}

function bindEvents() {
  refs.btnBuscar.addEventListener("click", buscarProductos);
  refs.btnLimpiar.addEventListener("click", limpiarFiltros);
  refs.btnCategoriaBuscar.addEventListener("click", openCategoriaSelector);

  refs.sortHeaders.forEach((th) => {
    th.addEventListener("click", () => {
      const key = th.dataset.sortKey;
      toggleSort(key);
    });
  });

  refs.cpTablaBody.addEventListener("click", (event) => {
    const tr = event.target.closest("tr[data-id]");
    if (!tr) return;

    const id = Number(tr.dataset.id || 0);
    if (!id) return;

    const row = currentRowsById.get(id);
    if (!row) return;

    if (isSelectFromVenta) {
      devolverProductoSeleccionadoVenta(row);
      return;
    }
    if (isSelectFromCompra) {
      devolverProductoSeleccionadoCompra(row);
      return;
    }

    seleccionarProducto(row);
  });

  const liveFields = [
    refs.fBusquedaRapida,
    refs.fCodigoProducto,
    refs.fCodigoBarra
  ];

  liveFields.forEach((el) => {
    el.addEventListener("input", () => {
      saveFiltersState();
      buscarProductosDebounced();
    });

    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        buscarProductos();
      }
    });
  });

  refs.fEmpresa?.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    saveFiltersState();
    buscarProductos();
    if (selectedId) {
      detalleCache.clear();
      cargarDetalleProducto(selectedId);
    }
  });

  const changeFields = [
    refs.fEmpresa,
    refs.fTipoSaldo,
    refs.fTipoValor,
    refs.fMonedaCompra,
    refs.fEsInsumo,
    refs.fFacturacionDirecta,
    refs.fLimit,
    refs.fMostrarInactivos
  ];

  changeFields.forEach((el) => {
    el.addEventListener("change", () => {
      saveFiltersState();
      buscarProductos();
      if (selectedId) {
        detalleCache.clear();
        cargarDetalleProducto(selectedId);
      }
    });
  });

  if (refs.fColorPositivo) {
    refs.fColorPositivo.addEventListener("input", () => {
      applyColorConfig(readColorConfig());
      saveColorConfig();
    });
  }

  if (refs.fColorNegativo) {
    refs.fColorNegativo.addEventListener("input", () => {
      applyColorConfig(readColorConfig());
      saveColorConfig();
    });
  }

  refs.btnColorReset?.addEventListener("click", () => {
    applyColorConfig(COLOR_DEFAULTS);
    saveColorConfig();
  });
}

function volverHome() {
  if (isSelectFromVenta) {
    window.location.href = "/modulos/venta/venta_rapida.html";
    return;
  }
  if (isSelectFromCompra) {
    if (window.opener && !window.opener.closed) {
      try {
        window.opener.focus();
      } catch {
        // noop
      }
      window.close();
      return;
    }
    window.location.href = "/modulos/compra/compra.html";
    return;
  }

  window.location.href = "/home.html";
}

window.volverHome = volverHome;

document.addEventListener("DOMContentLoaded", async () => {
  const titulo = document.getElementById("cpTitulo");
  if (titulo && isSelectFromVenta) titulo.textContent = "Seleccionar Producto (Venta)";
  if (titulo && isSelectFromCompra) titulo.textContent = "Seleccionar Producto (Compra)";

  restoreColorConfig();
  restoreFiltersState();
  bindEvents();
  clearDetallePanel();

  if (initialBuscar) {
    refs.fBusquedaRapida.value = initialBuscar;
  }

  if (consumeSelectedCategoriaFromSession()) {
    saveFiltersState();
  }

  enfocarBusquedaRapida();
  await cargarEmpresaDefaultUsuario();
  buscarProductos();
  enfocarBusquedaRapida();
});






