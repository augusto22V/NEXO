const API = `${window.location.origin}/api`;

const state = {
  compraId: null,
  detalleEditandoId: null,
  items: [],
  lotesEditor: [],
  lotesModalDraft: [],
  usuario: null,
  empresas: [],
  catalogos: {
    monedas: [],
    condiciones: [],
    tiposOperacion: []
  },
  allowUnload: false,
  popupTimer: null,
  popupRef: null
};

const ENTER_ORDER_HEADER = [
  "empresaId",
  "fechaCompra",
  "numeroCompra",
  "tipoOperacionCodigo",
  "proveedorCodigo",
  "compradorCodigo",
  "condicionPago",
  "monedaId",
  "nroComprobante",
  "timbradoCompra",
  "fechaEmision",
  "itemCantidad"
];

const ENTER_ORDER_DETALLE_BASE = [
  "itemCantidad",
  "productoCodigo",
  "productoNombre",
  "itemPrecio",
  "btnAgregarItem"
];

const SELECTOR_KEYS = {
  compra: "softsysCompraSeleccionada",
  proveedor: "softsysProveedorSeleccionado",
  comprador: "softsysCompradorSeleccionado",
  producto: "softsysProductoSeleccionado",
  operacion: "softsysOperacionSeleccionada"
};

const OPERACION_CODIGO_CORTO_COMPRA = Object.freeze([
  { short: "9", aliases: ["9"], internal: [1101], tokens: ["compra", "contado"] },
  { short: "10", aliases: ["10"], internal: [1102], tokens: ["compra", "credito"] },
  { short: "15", aliases: ["15"], internal: [1108, 1104], tokens: ["entrada", "mercaderia"] },
  { short: "17", aliases: ["17"], internal: [1105], tokens: ["entrada", "transferencia"] },
  { short: "31", aliases: ["31"], internal: [1103], tokens: ["devolucion", "venta"] },
  { short: "36", aliases: ["36"], internal: [1106], tokens: ["mercaderia", "sobrante"] },
  { short: "44", aliases: ["44"], internal: [1107], tokens: ["importacion"] }
]);

const DRAFT_KEY = "softsysCompraDraft";

const $ = (id) => document.getElementById(id);

function today() {
  return new Date().toISOString().slice(0, 10);
}

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function toText(value) {
  return String(value || "").trim();
}

function normalizeSearchText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
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

function formatDateShort(value) {
  if (!value) return "";
  return String(value).slice(0, 10);
}

function getEmpresaId() {
  return toNumber($("empresaId")?.value || state.usuario?.empresa_id);
}

function getEmpresaSeleccionada() {
  const empresaId = String(getEmpresaId() || "");
  if (!empresaId) return null;
  return state.empresas.find((row) => String(row?.id || "") === empresaId) || null;
}

function empresaUsaControlLote() {
  const empresa = getEmpresaSeleccionada();
  if (empresa) return toBoolean(empresa.controlar_lote, false);
  return toBoolean(state.usuario?.empresa_controlar_lote, false);
}

function enterOrderCabeceraActual() {
  return [...ENTER_ORDER_HEADER];
}

function enterOrderDetalleActual() {
  const order = ["itemCantidad", "productoCodigo", "productoNombre", "itemPrecio"];
  if (empresaUsaControlLote()) order.push("btnGestionarLotes");
  order.push("btnAgregarItem");
  return order;
}

function normalizeOperacionTipo(value) {
  const tipo = String(value || "").trim().toUpperCase();
  return tipo === "S" ? "S" : "E";
}

function getOperacionesCompraActivas() {
  return (state.catalogos.tiposOperacion || []).filter((row) => {
    const tipo = normalizeOperacionTipo(row?.tipo);
    return tipo === "E" && row?.activo !== false;
  });
}

function getOperacionById(operacionId) {
  const id = toNumber(operacionId, 0);
  if (!id) return null;
  return (state.catalogos.tiposOperacion || []).find((row) => toNumber(row?.id, 0) === id) || null;
}

function matchReglaCodigoCortoCompra(operacion) {
  const codigoInterno = toNumber(operacion?.codigo, 0);
  const descripcion = normalizeSearchText(operacion?.descripcion);

  for (const regla of OPERACION_CODIGO_CORTO_COMPRA) {
    if (regla.internal.includes(codigoInterno)) return regla;
    if (descripcion && regla.tokens.every((token) => descripcion.includes(token))) return regla;
  }

  return null;
}

function getOperacionCodigoVisibleCompra(operacion) {
  const regla = matchReglaCodigoCortoCompra(operacion);
  if (regla?.short) return String(regla.short);
  return String(operacion?.codigo || operacion?.id || "");
}

function getOperacionCodigosBusquedaCompra(operacion) {
  const codes = new Set();
  codes.add(String(operacion?.codigo || operacion?.id || ""));
  const regla = matchReglaCodigoCortoCompra(operacion);
  if (regla?.short) codes.add(String(regla.short));
  for (const alias of regla?.aliases || []) codes.add(String(alias));
  return Array.from(codes).filter(Boolean);
}

function getOperacionByCodigo(codigoInput) {
  const codigo = String(codigoInput || "").trim();
  if (!codigo) return null;

  const catalogo = getOperacionesCompraActivas();

  const exactoInterno = catalogo.find((row) => String(row?.codigo || "").trim() === codigo);
  if (exactoInterno) return exactoInterno;

  const candidatos = catalogo.filter((row) => getOperacionCodigosBusquedaCompra(row).includes(codigo));
  if (!candidatos.length) return null;
  if (candidatos.length === 1) return candidatos[0];

  const ordenPreferencia = [1108, 1101, 1102, 1105, 1103, 1106, 1107, 1104];
  candidatos.sort((a, b) => {
    const ia = ordenPreferencia.indexOf(toNumber(a?.codigo, 0));
    const ib = ordenPreferencia.indexOf(toNumber(b?.codigo, 0));
    const va = ia === -1 ? Number.MAX_SAFE_INTEGER : ia;
    const vb = ib === -1 ? Number.MAX_SAFE_INTEGER : ib;
    if (va !== vb) return va - vb;
    return toNumber(a?.id, 0) - toNumber(b?.id, 0);
  });
  return candidatos[0];
}

function getOperacionSeleccionada() {
  return getOperacionById($("tipoOperacion")?.value);
}

function condicionPagoEsCredito(condicionId) {
  const id = toNumber(condicionId, 0);
  if (!id) return false;
  const condicion = state.catalogos.condiciones.find((row) => toNumber(row?.id, 0) === id);
  if (!condicion) return false;
  const cuotas = toNumber(condicion?.cuotas ?? condicion?.cantidad_cuotas, 1);
  if (cuotas > 1) return true;
  const diasIntervalo = toNumber(condicion?.dias_intervalo, 0);
  if (diasIntervalo > 0) return true;
  const text = String(condicion?.descripcion || "").trim().toLowerCase();
  return text.includes("credito") || text.includes("crédito");
}

function firstCondicionByCredito(esCredito) {
  const condicion = state.catalogos.condiciones.find((row) => {
    if (row?.activo === false) return false;
    return condicionPagoEsCredito(row?.id) === esCredito;
  });
  return condicion ? toNumber(condicion.id, 0) : null;
}

function validarReglaOperacionFormaPago() {
  const operacion = getOperacionSeleccionada();
  if (!operacion) return;

  const condicionId = toNumber($("condicionPago")?.value, 0);
  if (!condicionId) return;

  const condicionEsCredito = condicionPagoEsCredito(condicionId);
  const codigoVisible = getOperacionCodigoVisibleCompra(operacion);

  if (codigoVisible === "10" && !condicionEsCredito) {
    throw new Error("Compra a credito requiere forma de pago a credito");
  }
  if (codigoVisible === "9" && condicionEsCredito) {
    throw new Error("Compra a vista requiere forma de pago contado");
  }

  if (toBoolean(operacion.requiere_credito, false) && !condicionEsCredito) {
    throw new Error("La operación seleccionada requiere forma de pago a crédito");
  }
  if (!toBoolean(operacion.permite_credito, false) && condicionEsCredito) {
    throw new Error("La operación seleccionada no permite forma de pago a crédito");
  }
}

function alinearCondicionPagoConOperacion() {
  const operacion = getOperacionSeleccionada();
  if (!operacion) return;

  const condicionId = toNumber($("condicionPago")?.value, 0);
  const condicionEsCredito = condicionPagoEsCredito(condicionId);
  const codigoVisible = getOperacionCodigoVisibleCompra(operacion);
  const requiereCredito = toBoolean(operacion.requiere_credito, false);
  const permiteCredito = toBoolean(operacion.permite_credito, false);

  if (codigoVisible === "10" && !condicionEsCredito) {
    const fallbackCredito = firstCondicionByCredito(true);
    if (fallbackCredito) $("condicionPago").value = String(fallbackCredito);
  } else if (codigoVisible === "9" && condicionEsCredito) {
    const fallbackContado = firstCondicionByCredito(false);
    if (fallbackContado) $("condicionPago").value = String(fallbackContado);
  } else if (requiereCredito && !condicionEsCredito) {
    const fallbackCredito = firstCondicionByCredito(true);
    if (fallbackCredito) $("condicionPago").value = String(fallbackCredito);
  } else if (!permiteCredito && condicionEsCredito) {
    const fallbackContado = firstCondicionByCredito(false);
    if (fallbackContado) $("condicionPago").value = String(fallbackContado);
  }
}

function operacionDefaultPorCondicionPagoCompra() {
  const esCredito = condicionPagoEsCredito($("condicionPago")?.value);
  const codigoObjetivo = esCredito ? "10" : "9";
  return getOperacionByCodigo(codigoObjetivo);
}

function operacionDefaultInicialCompra() {
  return getOperacionByCodigo("9") || getOperacionesCompraActivas()[0] || null;
}

function aplicarOperacionDefaultInicialCompra({ persistir = false } = {}) {
  const operacion = operacionDefaultInicialCompra();
  if (!operacion?.id) {
    $("tipoOperacion").value = "";
    $("tipoOperacionCodigo").value = "";
    $("tipoOperacionDescripcion").value = "";
    return false;
  }

  return aplicarOperacionSeleccionada(operacion, { ajustarCondicion: true, persistir });
}

function sincronizarOperacionVisualDesdeId() {
  const operacion = getOperacionById($("tipoOperacion")?.value);
  if (!operacion) {
    $("tipoOperacionCodigo").value = "";
    $("tipoOperacionDescripcion").value = "";
    return;
  }

  $("tipoOperacionCodigo").value = getOperacionCodigoVisibleCompra(operacion);
  $("tipoOperacionDescripcion").value = String(operacion.descripcion || "");
}

function aplicarOperacionSeleccionada(row, { ajustarCondicion = true, persistir = true } = {}) {
  if (!row?.id) return false;
  $("tipoOperacion").value = String(row.id);
  $("tipoOperacionCodigo").value = getOperacionCodigoVisibleCompra(row);
  $("tipoOperacionDescripcion").value = String(row.descripcion || "");

  if (ajustarCondicion) alinearCondicionPagoConOperacion();
  if (persistir) persistCompraDraft();
  return true;
}

function loadCompraDraft() {
  const raw = localStorage.getItem(DRAFT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function persistCompraDraft() {
  const draft = {
    compraId: state.compraId,
    empresaId: $("empresaId")?.value || "",
    fechaCompra: $("fechaCompra")?.value || "",
    numeroCompra: $("numeroCompra")?.value || "",
    tipoOperacion: $("tipoOperacion")?.value || "",
    tipoOperacionCodigo: $("tipoOperacionCodigo")?.value || "",
    tipoOperacionDescripcion: $("tipoOperacionDescripcion")?.value || "",
    proveedorId: $("proveedorId")?.value || "",
    proveedorCodigo: $("proveedorCodigo")?.value || "",
    proveedorNombre: $("proveedorNombre")?.value || "",
    compradorId: $("compradorId")?.value || "",
    compradorCodigo: $("compradorCodigo")?.value || "",
    compradorNombre: $("compradorNombre")?.value || "",
    condicionPago: $("condicionPago")?.value || "",
    monedaId: $("monedaId")?.value || "",
    nroComprobante: $("nroComprobante")?.value || "",
    timbradoCompra: $("timbradoCompra")?.value || "",
    fechaEmision: $("fechaEmision")?.value || "",
    itemCantidad: $("itemCantidad")?.value || "1",
    productoId: $("productoId")?.value || "",
    productoCodigo: $("productoCodigo")?.value || "",
    productoCodigoBarra: $("productoCodigoBarra")?.value || "",
    productoNombre: $("productoNombre")?.value || "",
    itemCostoMedio: $("itemCostoMedio")?.value || "",
    itemPrecio: $("itemPrecio")?.value || "",
    itemLote: $("itemLote")?.value || "",
    itemVencimiento: $("itemVencimiento")?.value || "",
    itemLotesResumen: $("itemLotesResumen")?.value || "",
    lotesEditor: Array.isArray(state.lotesEditor) ? state.lotesEditor : [],
    items: state.items
  };
  localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
}

function clearCompraDraft() {
  localStorage.removeItem(DRAFT_KEY);
}

function applyCompraDraft(draft) {
  if (!draft) return;
  if (draft.empresaId) $("empresaId").value = draft.empresaId;
  if (draft.fechaCompra) $("fechaCompra").value = draft.fechaCompra;
  if (draft.numeroCompra) $("numeroCompra").value = draft.numeroCompra;
  if (draft.tipoOperacion) $("tipoOperacion").value = draft.tipoOperacion;
  if (draft.tipoOperacionCodigo) $("tipoOperacionCodigo").value = draft.tipoOperacionCodigo;
  if (draft.tipoOperacionDescripcion) $("tipoOperacionDescripcion").value = draft.tipoOperacionDescripcion;
  if (draft.proveedorId) $("proveedorId").value = draft.proveedorId;
  if (draft.proveedorCodigo) $("proveedorCodigo").value = draft.proveedorCodigo;
  if (draft.proveedorNombre) $("proveedorNombre").value = draft.proveedorNombre;
  if (draft.compradorId) $("compradorId").value = draft.compradorId;
  if (draft.compradorCodigo) $("compradorCodigo").value = draft.compradorCodigo;
  if (draft.compradorNombre) $("compradorNombre").value = draft.compradorNombre;
  if (draft.condicionPago) $("condicionPago").value = draft.condicionPago;
  if (draft.monedaId) $("monedaId").value = draft.monedaId;
  if (draft.nroComprobante) $("nroComprobante").value = draft.nroComprobante;
  if (draft.timbradoCompra) $("timbradoCompra").value = draft.timbradoCompra;
  if (draft.fechaEmision) $("fechaEmision").value = draft.fechaEmision;
  if (draft.itemCantidad) $("itemCantidad").value = draft.itemCantidad;
  if (draft.productoId) $("productoId").value = draft.productoId;
  if (draft.productoCodigo) $("productoCodigo").value = draft.productoCodigo;
  if (draft.productoCodigoBarra) $("productoCodigoBarra").value = draft.productoCodigoBarra;
  if (draft.productoNombre) $("productoNombre").value = draft.productoNombre;
  if (draft.itemCostoMedio) $("itemCostoMedio").value = draft.itemCostoMedio;
  if (draft.itemPrecio) $("itemPrecio").value = draft.itemPrecio;
  if (draft.itemLote) $("itemLote").value = draft.itemLote;
  if (draft.itemVencimiento) $("itemVencimiento").value = draft.itemVencimiento;
  sincronizarOperacionVisualDesdeId();
  if (Array.isArray(draft.lotesEditor)) {
    state.lotesEditor = draft.lotesEditor
      .map((row) => ({
        cantidad: toNumber(row?.cantidad, 0),
        lote: toText(row?.lote),
        fecha_vencimiento: formatDateShort(row?.fecha_vencimiento)
      }))
      .filter((row) => row.cantidad > 0);
  } else if (draft.itemLote || draft.itemVencimiento) {
    state.lotesEditor = [{
      cantidad: toNumber(draft.itemCantidad, 0) || 1,
      lote: toText(draft.itemLote),
      fecha_vencimiento: formatDateShort(draft.itemVencimiento) || null
    }];
  } else {
    state.lotesEditor = [];
  }
  aplicarModoControlLote({
    limpiarLotes: !empresaUsaControlLote(),
    rerender: false
  });
  actualizarResumenLotes();
  if (Array.isArray(draft.items)) {
    state.items = draft.items;
    renderDetalle();
    renderResumen();
  }
}

function isCompraEditable() {
  return toNumber($("estadoCompra").value) !== 3;
}

function aplicarModoControlLote({ limpiarLotes = false, rerender = true } = {}) {
  const usaLote = empresaUsaControlLote();
  document.body.classList.toggle("cp-no-lote", !usaLote);

  const bloqueLotes = document.querySelector(".campo-detalle-lotes");
  if (bloqueLotes) bloqueLotes.hidden = !usaLote;

  document.querySelectorAll("[data-col-lote]").forEach((cell) => {
    cell.hidden = !usaLote;
  });

  if (!usaLote && limpiarLotes) {
    state.lotesEditor = [];
    state.lotesModalDraft = [];
    $("itemLote").value = "";
    $("itemVencimiento").value = "";
  }

  actualizarResumenLotes();

  if (rerender) {
    renderDetalle();
  }
}

function applyEstadoMode() {
  const editable = isCompraEditable();
  const toggleFields = [
    "empresaId",
    "fechaCompra",
    "numeroCompra",
    "tipoOperacion",
    "tipoOperacionCodigo",
    "tipoOperacionDescripcion",
    "proveedorCodigo",
    "compradorCodigo",
    "condicionPago",
    "monedaId",
    "fechaEmision",
    "nroComprobante",
    "timbradoCompra",
    "itemCantidad",
    "productoCodigo",
    "productoCodigoBarra",
    "itemCostoMedio",
    "itemPrecio",
    "itemLotesResumen",
    "itemLote",
    "itemVencimiento"
  ];

  toggleFields.forEach((id) => {
    const el = $(id);
    if (!el) return;
    el.disabled = !editable;
  });

  ["btnGuardarCompra", "btnConcluirCompra", "btnEfectivizarCompra", "btnAgregarItem", "btnLimpiarItem", "btnBuscarTipoOperacion", "btnBuscarProveedor", "btnBuscarComprador", "btnBuscarProducto", "btnGestionarLotes"].forEach((id) => {
    const button = $(id);
    if (!button) return;
    if (id === "btnGestionarLotes") {
      button.disabled = !editable || !empresaUsaControlLote();
      button.hidden = !empresaUsaControlLote();
      return;
    }
    button.disabled = !editable;
  });

  renderDetalle();
}

function monedaDecimales() {
  const monedaId = String($("monedaId")?.value || "");
  const item = state.catalogos.monedas.find((row) => String(row.id) === monedaId);
  const nombre = String(item?.nombre || "").toUpperCase();
  return nombre === "PYG" || nombre === "GUARANI" ? 0 : 2;
}

function formatearNumero(value) {
  const dec = monedaDecimales();
  return new Intl.NumberFormat("es-PY", {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec
  }).format(toNumber(value));
}

function estadoTexto(value) {
  const map = {
    1: "PENDIENTE",
    2: "CONCLUIDO",
    3: "EFECTIVADO",
    PENDIENTE: "PENDIENTE",
    CONCLUIDO: "CONCLUIDO",
    EFECTIVADO: "EFECTIVADO"
  };
  return map[value] || "PENDIENTE";
}

function showError(message) {
  if (window.baseModalOpenInfo) {
    baseModalOpenInfo({ titulo: "Atencion", mensaje: message });
    return;
  }
  alert(message);
}

function showConfirm({ title, message, onConfirm }) {
  if (window.baseModalOpenConfirmGeneric) {
    baseModalOpenConfirmGeneric({
      titulo: title,
      mensaje: message,
      onConfirm
    });
    return;
  }
  if (confirm(message)) onConfirm();
}

function tieneItemsEnDetalle() {
  if (!Array.isArray(state.items) || !state.items.length) return false;
  return state.items.some((item) => toNumber(item?.cantidad, 0) > 0);
}

function habilitarSalidaPagina() {
  state.allowUnload = true;
}

function prevenirSalidaConItems(event) {
  if (state.allowUnload) return;
  if (!tieneItemsEnDetalle()) return;
  event.preventDefault();
  event.returnValue = "";
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });

  const type = response.headers.get("content-type") || "";
  const body = type.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    throw new Error(body?.error || body || "Error de comunicacion");
  }

  return body;
}

function setDefaults() {
  $("fechaCompra").value = today();
  $("fechaEmision").value = today();
  $("estadoCompra").value = "1";
  actualizarEstadoVisual();
}

async function init() {
  registrarCallbacksSelectores();
  bindEvents();
  setDefaults();
  await cargarSesion();
  await cargarEmpresas();
  aplicarModoControlLote({ limpiarLotes: true, rerender: false });
  await cargarCatalogos();
  nuevaCompra();
  await cargarCompraDesdeUrl();
  consumirSeleccionesPendientes();
}

async function cargarSesion() {
  try {
    const data = await api(`${API}/auth/verify`);
    state.usuario = data.usuario || null;
  } catch (_) {
    state.usuario = null;
  }
}

async function cargarEmpresas() {
  const rows = await api(`${API}/empresa`);
  state.empresas = Array.isArray(rows)
    ? rows.map((row) => ({
      ...row,
      controlar_lote: toBoolean(row?.controlar_lote, false)
    }))
    : [];
  $("empresaId").innerHTML = state.empresas
    .map((row) => `<option value="${row.id}">${row.nombre || row.descripcion || `Empresa ${row.id}`}</option>`)
    .join("");

  if (state.usuario?.empresa_id) {
    $("empresaId").value = String(state.usuario.empresa_id);
  }
  aplicarModoControlLote({ limpiarLotes: true });
}

async function cargarCatalogos() {
  const data = await api(`${API}/compra/catalogos`);
  state.catalogos.monedas = data.monedas || [];
  state.catalogos.condiciones = (data.condiciones_pago || []).map((row) => ({
    ...row,
    cuotas: toNumber(row?.cuotas ?? row?.cantidad_cuotas, 1),
    dias_intervalo: toNumber(row?.dias_intervalo, 0),
    activo: row?.activo !== false
  }));
  state.catalogos.tiposOperacion = (data.tipos_operacion || []).map((row) => ({
    ...row,
    tipo: normalizeOperacionTipo(row?.tipo),
    activo: row?.activo !== false,
    afecta_stock: toBoolean(row?.afecta_stock, false),
    requiere_confirmacion: toBoolean(row?.requiere_confirmacion, false),
    permite_credito: toBoolean(row?.permite_credito, false),
    requiere_credito: toBoolean(row?.requiere_credito, false),
    genera_financiero: toBoolean(row?.genera_financiero, false)
  }));

  $("tipoOperacion").innerHTML = getOperacionesCompraActivas()
    .map((row) => `<option value="${row.id}">${row.descripcion || row.nombre || `Operacion ${row.id}`}</option>`)
    .join("");

  $("condicionPago").innerHTML = state.catalogos.condiciones
    .filter((row) => row?.activo !== false)
    .map((row) => `<option value="${row.id}">${row.descripcion || row.nombre}</option>`)
    .join("");

  $("monedaId").innerHTML = state.catalogos.monedas
    .map((row) => `<option value="${row.id}">${row.nombre || row.descripcion}</option>`)
    .join("");

  aplicarOperacionDefaultInicialCompra({ persistir: false });
}

async function cargarCompraDesdeUrl() {
  const params = new URLSearchParams(window.location.search);
  const compraId = toNumber(params.get("id"));
  if (compraId > 0) {
    await cargarCompra(compraId);
    return;
  }

  const draft = loadCompraDraft();
  if (draft?.compraId) {
    try {
      await cargarCompra(draft.compraId);
      return;
    } catch {
      clearCompraDraft();
    }
  }

  if (draft) {
    applyCompraDraft(draft);
    renderResumen();
  }

  focusField("proveedorCodigo");
}

function bindEvents() {
  $("btnVolver").addEventListener("click", salir);
  $("btnSalirCompra").addEventListener("click", salir);
  $("btnGuardarCompra").addEventListener("click", guardarCompra);
  $("btnConcluirCompra").addEventListener("click", () => cambiarEstadoCompra(2));
  $("btnEfectivizarCompra").addEventListener("click", efectivizarCompra);
  $("btnCancelarCompra").addEventListener("click", cancelarCompra);

  $("btnBuscarCompra").addEventListener("click", () => abrirBuscadorCompra());
  $("btnBuscarTipoOperacion").addEventListener("click", () => abrirBuscadorOperacion());
  $("btnBuscarProveedor").addEventListener("click", () => abrirBuscadorProveedor());
  $("btnBuscarComprador").addEventListener("click", () => abrirBuscadorComprador());
  $("btnBuscarProducto").addEventListener("click", () => abrirBuscadorProducto());
  $("btnGestionarLotes").addEventListener("click", abrirModalLotes);
  $("btnNuevaCompra").addEventListener("click", nuevaCompra);

  $("btnAgregarItem").addEventListener("click", guardarItem);
  $("btnLimpiarItem").addEventListener("click", limpiarEditorItem);

  $("btnCerrarModalLotes").addEventListener("click", cerrarModalLotes);
  $("btnCancelarLotesModal").addEventListener("click", cerrarModalLotes);
  $("btnAgregarLoteModal").addEventListener("click", agregarLoteDesdeModal);
  $("btnAplicarLotesModal").addEventListener("click", aplicarLotesDesdeModal);
  $("modalLotesItem").addEventListener("click", (event) => {
    if (event.target?.hasAttribute?.("data-close-lotes")) cerrarModalLotes();
  });
  $("mlBody").addEventListener("click", (event) => {
    const btn = event.target.closest("button[data-del-lote]");
    if (!btn) return;
    const idx = toNumber(btn.dataset.delLote, -1);
    if (idx < 0) return;
    state.lotesModalDraft.splice(idx, 1);
    renderLotesModal();
  });
  $("mlVence").addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    agregarLoteDesdeModal();
  });

  $("itemCantidad").addEventListener("input", () => {
    recalcularSubtotalItem();
    persistCompraDraft();
  });
  $("tipoOperacionCodigo").addEventListener("input", () => {
    const codigoIngresado = $("tipoOperacionCodigo").value.trim();
    if (!codigoIngresado) {
      $("tipoOperacion").value = "";
      $("tipoOperacionDescripcion").value = "";
      persistCompraDraft();
      return;
    }

    const operacion = getOperacionByCodigo(codigoIngresado);
    if (operacion?.id) {
      aplicarOperacionSeleccionada(operacion, { ajustarCondicion: true, persistir: true });
      return;
    }

    $("tipoOperacion").value = "";
    $("tipoOperacionDescripcion").value = "";
    persistCompraDraft();
  });
  $("tipoOperacionCodigo").addEventListener("blur", () => {
    const codigo = $("tipoOperacionCodigo").value.trim();
    if (!codigo) return;
    manejarCodigoOperacion({ key: "Enter", preventDefault() {} }, { abrirLookupSiNoExiste: false, focusNextField: false });
  });
  $("itemPrecio").addEventListener("input", () => {
    recalcularSubtotalItem();
    persistCompraDraft();
  });
  $("monedaId").addEventListener("change", () => {
    recalcularSubtotalItem();
    renderDetalle();
    renderResumen();
    persistCompraDraft();
  });
  $("condicionPago").addEventListener("change", () => {
    try {
      validarReglaOperacionFormaPago();
      persistCompraDraft();
    } catch (error) {
      showError(error.message);
      alinearCondicionPagoConOperacion();
      persistCompraDraft();
    }
  });
  $("empresaId").addEventListener("change", () => {
    aplicarModoControlLote({ limpiarLotes: true });
    applyEstadoMode();
    persistCompraDraft();
  });
  $("estadoCompra").addEventListener("change", actualizarEstadoVisual);

  const campoPersistentes = [
    "empresaId",
    "fechaCompra",
    "numeroCompra",
    "tipoOperacion",
    "tipoOperacionCodigo",
    "proveedorCodigo",
    "compradorCodigo",
    "condicionPago",
    "monedaId",
    "fechaEmision",
    "nroComprobante",
    "timbradoCompra",
    "productoCodigo"
  ];

  campoPersistentes.forEach((id) => {
    const el = $(id);
    if (!el) return;
    el.addEventListener("change", persistCompraDraft);
    el.addEventListener("input", persistCompraDraft);
  });

  $("numeroCompra").addEventListener("keydown", manejarBusquedaNumeroCompra);
  $("tipoOperacionCodigo").addEventListener("keydown", manejarCodigoOperacion);
  $("proveedorCodigo").addEventListener("keydown", manejarCodigoProveedor);
  $("compradorCodigo").addEventListener("keydown", manejarCodigoComprador);
  $("productoCodigo").addEventListener("keydown", manejarCodigoProducto);
  $("tipoOperacionDescripcion").addEventListener("keydown", manejarNombreOperacion);
  $("proveedorNombre").addEventListener("keydown", manejarNombreProveedor);
  $("compradorNombre").addEventListener("keydown", manejarNombreComprador);
  $("productoNombre").addEventListener("keydown", manejarNombreProducto);

  // Proveedor/Comprador se mantienen por selector; producto permite texto para buscar por nombre.
  const readonlyFields = ["tipoOperacionDescripcion", "proveedorNombre", "compradorNombre"];
  readonlyFields.forEach((id) => {
    const el = $(id);
    if (!el) return;
    el.readOnly = true;
  });

  $("detalleBody").addEventListener("input", manejarDetalleInlineInput);
  $("detalleBody").addEventListener("change", manejarDetalleInlineChange);
  $("detalleBody").addEventListener("click", manejarDetalleInlineAction);

  document.addEventListener("keydown", manejarAtajosGlobales);
  window.addEventListener("focus", consumirSeleccionesPendientes);
  window.addEventListener("beforeunload", prevenirSalidaConItems);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) consumirSeleccionesPendientes();
  });

  Array.from(new Set([...ENTER_ORDER_HEADER, ...ENTER_ORDER_DETALLE_BASE, "btnGestionarLotes"])).forEach((id) => {
    const el = $(id);
    if (!el) return;
    el.addEventListener("keydown", manejarEnter);
    el.addEventListener("focus", () => {
      if (typeof el.select === "function" && !["date", "select-one"].includes(el.type)) {
        el.select();
      }
    });
  });
}

function manejarAtajosGlobales(event) {
  if (event.key === "F2") {
    event.preventDefault();
    nuevaCompra();
  }
  if (event.key === "F3") {
    event.preventDefault();
    guardarCompra();
  }
  if (event.key === "F4") {
    event.preventDefault();
    cambiarEstadoCompra(2);
  }
  if (event.key === "F5") {
    event.preventDefault();
    efectivizarCompra();
  }
  if (event.key === "Escape") {
    if (!$("modalLotesItem")?.hidden) {
      event.preventDefault();
      cerrarModalLotes();
      return;
    }
    event.preventDefault();
    cancelarCompra();
  }
}

function esCampoTextoExtendido(target) {
  const tag = String(target?.tagName || "").toUpperCase();
  return tag === "TEXTAREA" || Boolean(target?.isContentEditable);
}

function manejarEnter(event) {
  if (event.key !== "Enter") return;
  if (event.shiftKey) return;
  if (esCampoTextoExtendido(event.target)) return;

  const targetId = event.target.id;
  if (!targetId) return;

  if (targetId === "numeroCompra") return;
  if (targetId === "tipoOperacionCodigo") return;
  if (targetId === "tipoOperacionDescripcion") return;
  if (targetId === "productoCodigo") return;
  if (targetId === "productoNombre") return;
  if (targetId === "proveedorCodigo") return;
  if (targetId === "proveedorNombre") return;
  if (targetId === "compradorCodigo") return;
  if (targetId === "compradorNombre") return;

  if (targetId === "itemPrecio") {
    event.preventDefault();
    if (!toNumber($("productoId").value, 0)) {
      focusField("productoCodigo");
      return;
    }
    if (empresaUsaControlLote()) {
      focusField("btnGestionarLotes");
      return;
    }
    focusField("btnAgregarItem");
    return;
  }

  if (targetId === "btnAgregarItem") {
    event.preventDefault();
    if (isCompraEditable()) guardarItem();
    return;
  }

  if (targetId === "btnGestionarLotes") {
    event.preventDefault();
    if (!empresaUsaControlLote()) {
      focusField("btnAgregarItem");
      return;
    }
    abrirModalLotes();
    return;
  }

  event.preventDefault();
  focusNext(targetId);
}

function focusField(id) {
  const el = $(id);
  if (!el) return;
  setTimeout(() => {
    el.focus();
    if (typeof el.select === "function" && !["date", "select-one"].includes(el.type)) {
      el.select();
    }
  }, 30);
}

function focusNext(currentId) {
  const orderDetalle = enterOrderDetalleActual();
  const order = orderDetalle.includes(currentId)
    ? orderDetalle
    : enterOrderCabeceraActual();
  const idx = order.indexOf(currentId);
  if (idx < 0) return;
  const nextIdx = (idx + 1) % order.length;
  focusField(order[nextIdx]);
}

function actualizarEstadoVisual() {
  const estado = estadoTexto(toNumber($("estadoCompra").value));
  const target = $("estadoVisual");
  target.textContent = estado;
  target.className = "estado";
  if (estado === "PENDIENTE") target.classList.add("estado-pendiente");
  if (estado === "CONCLUIDO") target.classList.add("estado-concluido");
  if (estado === "EFECTIVADO") target.classList.add("estado-efectivado");
  applyEstadoMode();
}

function payloadCabecera(override = {}) {
  return {
    empresa_id: getEmpresaId(),
    fecha: $("fechaCompra").value,
    numero_compra: String($("numeroCompra").value).trim() || null,
    tipo_operacion_id: toNumber($("tipoOperacion").value),
    proveedor_id: toNumber($("proveedorId").value),
    comprador_id: toNumber($("compradorId").value) || null,
    condicion_pago_id: toNumber($("condicionPago").value),
    moneda_id: toNumber($("monedaId").value),
    estado: toNumber($("estadoCompra").value),
    nro_comprobante: $("nroComprobante").value.trim(),
    timbrado: $("timbradoCompra").value.trim(),
    fecha_emision: $("fechaEmision").value,
    ...override
  };
}

function validarCabecera() {
  if (!getEmpresaId()) throw new Error("Empresa requerida");
  if (!$("fechaCompra").value) throw new Error("Fecha requerida");
  if (!toNumber($("tipoOperacion").value)) throw new Error("Operacion requerida");
  if (!toNumber($("proveedorId").value)) throw new Error("Proveedor requerido");
  if (!toNumber($("condicionPago").value)) throw new Error("Forma de pago requerida");
  validarReglaOperacionFormaPago();
  if (!toNumber($("monedaId").value)) throw new Error("Moneda requerida");
  const numeroCompra = String($("numeroCompra").value || "").trim();
  if (numeroCompra && !/^\d+$/.test(numeroCompra)) {
    throw new Error("Nro Compra debe contener solo números");
  }
}

async function asegurarCompraGuardada() {
  if (state.compraId) return state.compraId;
  await guardarCompra();
  if (!state.compraId) {
    throw new Error("No se pudo guardar la compra");
  }
  return state.compraId;
}

async function guardarCompra() {
  try {
    validarCabecera();
    const payload = payloadCabecera();
    if (state.compraId) {
      await api(`${API}/compra/${state.compraId}`, {
        method: "PUT",
        body: JSON.stringify(payload)
      });
    } else {
      const result = await api(`${API}/compra`, {
        method: "POST",
        body: JSON.stringify(payload)
      });
      state.compraId = result.compra_id;
      $("compraId").value = state.compraId || "";
      if (result.numero_compra) {
        $("numeroCompra").value = result.numero_compra;
      }
    }
    persistCompraDraft();
    return state.compraId;
  } catch (error) {
    showError(error.message);
    return null;
  }
}

async function cambiarEstadoCompra(estado) {
  try {
    await asegurarCompraGuardada();
    const payload = payloadCabecera({ estado });
    await api(`${API}/compra/${state.compraId}/estado`, {
      method: "PUT",
      body: JSON.stringify(payload)
    });
    $("estadoCompra").value = String(estado);
    actualizarEstadoVisual();
    await cargarCompra(state.compraId);
    if (estado === 3) {
      nuevaCompra();
    }
  } catch (error) {
    showError(error.message);
  }
}

async function efectivizarCompra() {
  try {
    await asegurarCompraGuardada();
    const payload = payloadCabecera({ estado: 3 });
    await api(`${API}/compra/efectivar/${state.compraId}`, {
      method: "PUT",
      body: JSON.stringify(payload)
    });
    $("estadoCompra").value = "3";
    actualizarEstadoVisual();
    await cargarCompra(state.compraId);
    nuevaCompra();
  } catch (error) {
    showError(error.message);
  }
}

function cancelarCompra() {
  showConfirm({
    title: "Cancelar",
    message: "Se limpiara el formulario actual. Desea continuar?",
    onConfirm: () => {
      clearCompraDraft();
      nuevaCompra();
    }
  });
}

function nuevaCompra() {
  clearCompraDraft();
  state.compraId = null;
  state.detalleEditandoId = null;
  state.items = [];
  state.lotesEditor = [];
  state.lotesModalDraft = [];
  $("compraId").value = "";

  $("fechaCompra").value = today();
  $("fechaEmision").value = today();
  $("numeroCompra").value = "";
  $("estadoCompra").value = "1";
  $("nroComprobante").value = "";
  $("timbradoCompra").value = "";
  $("proveedorId").value = "";
  $("proveedorCodigo").value = "";
  $("proveedorNombre").value = "";
  $("compradorId").value = "";
  $("compradorCodigo").value = "";
  $("compradorNombre").value = "";
  $("detalleId").value = "";
  $("productoId").value = "";

  if (state.usuario?.empresa_id) {
    $("empresaId").value = String(state.usuario.empresa_id);
  }
  if (state.catalogos.condiciones[0]) {
    const primeraCondicionActiva = state.catalogos.condiciones.find((row) => row?.activo !== false);
    if (primeraCondicionActiva?.id) {
      $("condicionPago").value = String(primeraCondicionActiva.id);
    }
  }
  if (state.catalogos.monedas[0]) {
    $("monedaId").value = String(state.catalogos.monedas[0].id);
  }

  aplicarOperacionDefaultInicialCompra({ persistir: false });
  aplicarModoControlLote({ limpiarLotes: true });
  actualizarEstadoVisual();
  limpiarEditorItem();
  renderDetalle();
  renderResumen();
  actualizarResumenLotes();
  focusField("proveedorCodigo");
}

function formatCantidad(value) {
  return new Intl.NumberFormat("es-PY", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(toNumber(value, 0));
}

function normalizarLoteRow(raw) {
  const cantidad = toNumber(raw?.cantidad, 0);
  if (cantidad <= 0) return null;
  return {
    cantidad,
    lote: toText(raw?.lote),
    fecha_vencimiento: formatDateShort(raw?.fecha_vencimiento) || null
  };
}

function clonarLotes(list = []) {
  return list
    .map((row) => normalizarLoteRow(row))
    .filter(Boolean);
}

function totalCantidadLotes(list = []) {
  return list.reduce((acc, row) => acc + toNumber(row?.cantidad, 0), 0);
}

function sincronizarCamposLoteOcultos() {
  const first = state.lotesEditor[0] || null;
  $("itemLote").value = first?.lote || "";
  $("itemVencimiento").value = first?.fecha_vencimiento || "";
}

function actualizarResumenLotes() {
  const input = $("itemLotesResumen");
  if (!input) return;

  if (!empresaUsaControlLote()) {
    input.value = "Control por lote desactivado";
    sincronizarCamposLoteOcultos();
    return;
  }

  const list = clonarLotes(state.lotesEditor);
  state.lotesEditor = list;
  sincronizarCamposLoteOcultos();

  if (!list.length) {
    input.value = "Sin lotes cargados";
    return;
  }

  const total = totalCantidadLotes(list);
  if (list.length === 1) {
    const one = list[0];
    const loteTxt = one.lote ? `Lote ${one.lote}` : "Sin lote";
    const venceTxt = one.fecha_vencimiento ? `Vence ${one.fecha_vencimiento}` : "Sin vencimiento";
    input.value = `${loteTxt} | ${venceTxt} | ${formatCantidad(one.cantidad)}`;
    return;
  }

  input.value = `${list.length} lotes | Total ${formatCantidad(total)}`;
}

function abrirModalLotes() {
  if (!empresaUsaControlLote()) return;
  if (!isCompraEditable()) return;
  const modal = $("modalLotesItem");
  if (!modal) return;

  state.lotesModalDraft = clonarLotes(state.lotesEditor);
  if (!state.lotesModalDraft.length) {
    const lote = toText($("itemLote").value);
    const fecha = formatDateShort($("itemVencimiento").value);
    if (lote || fecha) {
      state.lotesModalDraft.push({
        cantidad: toNumber($("itemCantidad").value, 0) || 1,
        lote,
        fecha_vencimiento: fecha || null
      });
    }
  }

  $("mlCantidad").value = toNumber($("itemCantidad").value, 0) || "";
  $("mlLote").value = "";
  $("mlVence").value = "";
  renderLotesModal();
  modal.hidden = false;
  document.body.classList.add("cp-modal-open");
  focusField("mlCantidad");
}

function cerrarModalLotes() {
  const modal = $("modalLotesItem");
  if (!modal) return;
  modal.hidden = true;
  document.body.classList.remove("cp-modal-open");
}

function renderLotesModal() {
  const body = $("mlBody");
  const resumen = $("mlResumen");
  if (!body || !resumen) return;

  const lotes = clonarLotes(state.lotesModalDraft);
  state.lotesModalDraft = lotes;

  if (!lotes.length) {
    body.innerHTML = `<tr><td colspan="4" class="cp-modal-empty">Sin lotes cargados</td></tr>`;
    resumen.textContent = "Total lotes: 0";
    return;
  }

  const total = totalCantidadLotes(lotes);
  body.innerHTML = "";
  lotes.forEach((row, idx) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="text-right">${formatCantidad(row.cantidad)}</td>
      <td>${row.lote || "-"}</td>
      <td>${row.fecha_vencimiento || "-"}</td>
      <td class="cp-modal-td-action">
        <button type="button" class="btn-modal-del" data-del-lote="${idx}" title="Eliminar lote">Quitar</button>
      </td>
    `;
    body.appendChild(tr);
  });
  resumen.textContent = `Total lotes: ${lotes.length} | Cantidad: ${formatCantidad(total)}`;
}

function agregarLoteDesdeModal() {
  const cantidad = toNumber($("mlCantidad").value, 0);
  const lote = toText($("mlLote").value);
  const fecha = formatDateShort($("mlVence").value) || null;

  if (cantidad <= 0) {
    showError("Cantidad de lote invalida");
    focusField("mlCantidad");
    return;
  }

  state.lotesModalDraft.push({
    cantidad,
    lote,
    fecha_vencimiento: fecha
  });

  $("mlCantidad").value = "";
  $("mlLote").value = "";
  $("mlVence").value = "";
  renderLotesModal();
  focusField("mlCantidad");
}

function aplicarLotesDesdeModal() {
  state.lotesEditor = clonarLotes(state.lotesModalDraft);
  const total = totalCantidadLotes(state.lotesEditor);
  if (total > 0) {
    $("itemCantidad").value = String(total);
    recalcularSubtotalItem();
  }
  actualizarResumenLotes();
  persistCompraDraft();
  cerrarModalLotes();
}

function lotesDesdeEditorActual() {
  if (!empresaUsaControlLote()) return [];

  const lotes = clonarLotes(state.lotesEditor);
  if (lotes.length) return lotes;

  const lote = toText($("itemLote").value);
  const fecha = formatDateShort($("itemVencimiento").value) || null;
  if (!lote && !fecha) return [];

  const cantidad = toNumber($("itemCantidad").value, 0);
  if (cantidad <= 0) return [];
  return [{ cantidad, lote, fecha_vencimiento: fecha }];
}

function validarLotesContraCantidad(cantidad, lotes = []) {
  if (!empresaUsaControlLote()) return;
  if (!Array.isArray(lotes) || !lotes.length) return;
  const totalLotes = totalCantidadLotes(lotes);
  if (Math.abs(totalLotes - cantidad) > 0.0001) {
    throw new Error(`Cantidad de lotes (${formatCantidad(totalLotes)}) no coincide con item (${formatCantidad(cantidad)})`);
  }
}

function payloadItem() {
  const lotes = lotesDesdeEditorActual();
  const firstLote = lotes[0] || null;
  return {
    producto_id: toNumber($("productoId").value),
    codigo: $("productoCodigo").value.trim(),
    cantidad: toNumber($("itemCantidad").value),
    precio_unitario: toNumber($("itemPrecio").value),
    lote: firstLote?.lote || null,
    fecha_vencimiento: firstLote?.fecha_vencimiento || null
  };
}

function validarItem() {
  if (!toNumber($("productoId").value)) throw new Error("Producto requerido");
  if (toNumber($("itemCantidad").value) <= 0) throw new Error("Cantidad invalida");
  if (toNumber($("itemPrecio").value) < 0) throw new Error("Precio invalido");
}

async function guardarItem() {
  try {
    await asegurarCompraGuardada();
    validarItem();
    const cantidadItem = toNumber($("itemCantidad").value);
    const precioItem = toNumber($("itemPrecio").value);
    const lotes = lotesDesdeEditorActual();

    validarLotesContraCantidad(cantidadItem, lotes);

    if (state.detalleEditandoId && lotes.length > 1) {
      throw new Error("Para multiples lotes agregue como item nuevo");
    }

    if (state.detalleEditandoId) {
      const payload = payloadItem();
      await api(`${API}/compra/items/${state.detalleEditandoId}`, {
        method: "PUT",
        body: JSON.stringify(payload)
      });
    } else if (lotes.length > 1) {
      for (const lote of lotes) {
        await api(`${API}/compra/${state.compraId}/items`, {
          method: "POST",
          body: JSON.stringify({
            producto_id: toNumber($("productoId").value),
            codigo: $("productoCodigo").value.trim(),
            cantidad: lote.cantidad,
            precio_unitario: precioItem,
            lote: lote.lote || null,
            fecha_vencimiento: lote.fecha_vencimiento || null
          })
        });
      }
    } else {
      await api(`${API}/compra/${state.compraId}/items`, {
        method: "POST",
        body: JSON.stringify({
          producto_id: toNumber($("productoId").value),
          codigo: $("productoCodigo").value.trim(),
          cantidad: cantidadItem,
          precio_unitario: precioItem,
          lote: lotes[0]?.lote || null,
          fecha_vencimiento: lotes[0]?.fecha_vencimiento || null
        })
      });
    }
    await cargarCompra(state.compraId);
    persistCompraDraft();
    limpiarEditorItem();
    focusField("itemCantidad");
  } catch (error) {
    showError(error.message);
  }
}

function limpiarEditorItem() {
  state.detalleEditandoId = null;
  state.lotesEditor = [];
  state.lotesModalDraft = [];
  $("detalleId").value = "";
  $("productoId").value = "";
  $("itemCantidad").value = "1";
  $("productoCodigo").value = "";
  $("productoCodigoBarra").value = "-";
  $("productoNombre").value = "";
  $("itemCostoMedio").value = "0";
  $("itemPrecio").value = "";
  $("itemSubtotal").value = "0";
  $("itemLote").value = "";
  $("itemVencimiento").value = "";
  actualizarResumenLotes();
}

function recalcularSubtotalItem() {
  const subtotal = toNumber($("itemCantidad").value) * toNumber($("itemPrecio").value);
  $("itemSubtotal").value = formatearNumero(subtotal);
}

async function cargarCompra(compraId) {
  const compra = await api(`${API}/compra/${compraId}?empresa_id=${getEmpresaId()}`);
  state.compraId = compra.id;
  $("compraId").value = state.compraId || "";
  state.items = Array.isArray(compra.detalle) ? compra.detalle : [];

  $("empresaId").value = String(compra.empresa_id || getEmpresaId());
  $("fechaCompra").value = String(compra.fecha || "").slice(0, 10);
  $("fechaEmision").value = String(compra.fecha_emision || compra.fecha || "").slice(0, 10);
  $("numeroCompra").value = compra.numero_compra || compra.id || "";
  $("estadoCompra").value = String(
    compra.estado === "PENDIENTE" ? 1 :
    compra.estado === "CONCLUIDO" ? 2 : 3
  );
  $("tipoOperacion").value = String(compra.tipo_operacion_id || "");
  $("condicionPago").value = String(compra.condicion_pago_id || "");
  $("monedaId").value = String(compra.moneda_id || "");
  $("proveedorId").value = compra.proveedor_id || "";
  $("proveedorCodigo").value = compra.proveedor_id || "";
  $("proveedorNombre").value = compra.proveedor_nombre || "";
  $("compradorId").value = compra.comprador_id || "";
  $("compradorCodigo").value = compra.comprador_id || "";
  $("compradorNombre").value = compra.comprador_nombre || "";
  $("nroComprobante").value = compra.nro_comprobante || "";
  $("timbradoCompra").value = compra.timbrado || "";

  aplicarModoControlLote({ limpiarLotes: !empresaUsaControlLote(), rerender: false });
  sincronizarOperacionVisualDesdeId();
  actualizarEstadoVisual();
  renderDetalle();
  renderResumen();
  limpiarEditorItem();
  if (isCompraEditable()) {
    persistCompraDraft();
  } else {
    clearCompraDraft();
  }
}

function renderDetalle() {
  const body = $("detalleBody");
  body.innerHTML = "";
  const usaLote = empresaUsaControlLote();
  const totalCols = usaLote ? 11 : 9;

  if (!state.items.length) {
    body.innerHTML = `<tr><td colspan="${totalCols}">Sin items cargados</td></tr>`;
    return;
  }

  const editable = isCompraEditable();

  state.items.forEach((item, index) => {
    const tr = document.createElement("tr");
    tr.dataset.id = item.id;
    const cantidad = toNumber(item.cantidad, 0);
    const precio = toNumber(item.precio_unitario || item.costo, 0);
    const costoMedio = toNumber(item.costo_medio ?? item.costo_original ?? item.costo, 0);
    const codigo = item.codigo || item.producto_id || "";
    const codigoBarra = item.codigo_barra || "-";
    const loteTxt = toText(item.lote) || "-";
    const venceTxt = formatDateShort(item.fecha_vencimiento) || "-";
    const lotesCells = usaLote
      ? `
      <td title="${loteTxt}">${loteTxt}</td>
      <td>${venceTxt}</td>
    `
      : "";
    const btnLotes = editable && usaLote
      ? `<button type="button" class="fila-accion" data-lotes="${item.id}" title="Editar lote">Lotes</button>`
      : "";
    const btnPrecioFila = toNumber(item.producto_id, 0) > 0
      ? `<button type="button" class="fila-accion fila-accion-precio" data-precio-item="${item.producto_id}" title="Consultar precio del producto">$</button>`
      : "";
    tr.innerHTML = `
      <td>${index + 1}</td>
      <td>${codigo}</td>
      <td>${codigoBarra}</td>
      <td>${item.producto_nombre || ""}</td>
      <td class="text-right">${editable ? `<input type="number" min="0" step="0.01" class="detalle-input" data-id="${item.id}" data-field="cantidad" value="${cantidad}">` : formatearNumero(cantidad)}</td>
      <td class="text-right">${formatearNumero(costoMedio)}</td>
      <td class="text-right">${editable ? `<input type="number" min="0" step="0.01" class="detalle-input" data-id="${item.id}" data-field="precio_unitario" value="${precio}">` : formatearNumero(precio)}</td>
      <td class="text-right detalle-subtotal">${formatearNumero(cantidad * precio)}</td>
      ${lotesCells}
      <td>
        ${btnPrecioFila}
        ${editable ? `<button type="button" class="fila-accion" data-edit="${item.id}" title="Editar item">Editar</button>` : ""}
        ${btnLotes}
        ${editable ? `<button type="button" class="fila-eliminar" data-del="${item.id}" title="Eliminar item"><img src="/recursos/img/x.png" alt="Eliminar"></button>` : ""}
      </td>
    `;
    body.appendChild(tr);
  });
}

function renderResumen() {
  const total = state.items.reduce((acc, item) => acc + toNumber(item.subtotal || item.total), 0);
  $("cantidadItems").textContent = `${state.items.length} items`;
  $("totalCompra").textContent = formatearNumero(total);
}

function manejarDetalleInlineInput(event) {
  const target = event.target;
  const detalleId = target.dataset?.id;
  const field = target.dataset?.field;
  if (!detalleId || !field) return;
  if (field !== "cantidad" && field !== "precio_unitario") return;

  const row = target.closest("tr");
  if (!row) return;
  const cantidad = toNumber(row.querySelector('[data-field="cantidad"]')?.value);
  const precio = toNumber(row.querySelector('[data-field="precio_unitario"]')?.value);
  const subtotal = cantidad * precio;
  const subtotalCell = row.querySelector(".detalle-subtotal");
  if (subtotalCell) subtotalCell.textContent = formatearNumero(subtotal);
}

function manejarDetalleInlineChange(event) {
  const target = event.target;
  const detalleId = target.dataset?.id;
  const field = target.dataset?.field;
  if (!detalleId || !field) return;

  const payload = {};

  if (field === "cantidad" || field === "precio_unitario") {
    const numericValue = toNumber(target.value);
    if (numericValue <= 0) {
      showError("Cantidad y precio deben ser mayores a cero");
      target.focus();
      return;
    }
    payload[field] = numericValue;
  } else {
    return;
  }

  guardarDetalleInline(detalleId, payload);
}

function manejarDetalleInlineAction(event) {
  const btnPrecio = event.target.closest("button[data-precio-item]");
  if (btnPrecio) {
    const productoId = toNumber(btnPrecio.dataset.precioItem, 0);
    if (productoId > 0) abrirConsultaPrecioProducto(productoId);
    return;
  }

  const btnEditar = event.target.closest("button[data-edit]");
  if (btnEditar) {
    const detalleId = btnEditar.dataset.edit;
    if (detalleId) editarItem(detalleId);
    return;
  }

  const btnLotes = event.target.closest("button[data-lotes]");
  if (btnLotes) {
    const detalleId = btnLotes.dataset.lotes;
    if (detalleId) {
      editarItem(detalleId);
      abrirModalLotes();
    }
    return;
  }

  const target = event.target.closest("button[data-del]");
  if (!target) return;
  const detalleId = target.dataset.del;
  if (!detalleId) return;
  eliminarItem(detalleId);
}

async function guardarDetalleInline(detalleId, payload) {
  try {
    await api(`${API}/compra/items/${detalleId}?empresa_id=${getEmpresaId()}`, {
      method: "PUT",
      body: JSON.stringify(payload)
    });
    await cargarCompra(state.compraId);
  } catch (error) {
    showError(error.message);
  }
}

function editarItem(detalleId) {
  const item = state.items.find((row) => String(row.id) === String(detalleId));
  if (!item) return;

  const usaLote = empresaUsaControlLote();
  state.detalleEditandoId = item.id;
  $("detalleId").value = item.id;
  $("productoId").value = item.producto_id;
  $("productoCodigo").value = item.codigo || item.codigo_barra || item.producto_id || "";
  $("productoCodigoBarra").value = item.codigo_barra || "-";
  $("productoNombre").value = item.producto_nombre || "";
  $("itemCantidad").value = item.cantidad;
  $("itemCostoMedio").value = formatearNumero(toNumber(item.costo_medio ?? item.costo_original ?? item.costo, 0));
  $("itemPrecio").value = item.precio_unitario || item.costo || 0;
  if (usaLote) {
    $("itemLote").value = item.lote || "";
    $("itemVencimiento").value = formatDateShort(item.fecha_vencimiento);
    state.lotesEditor = clonarLotes([{
      cantidad: toNumber(item.cantidad, 0),
      lote: toText(item.lote),
      fecha_vencimiento: formatDateShort(item.fecha_vencimiento) || null
    }]);
  } else {
    $("itemLote").value = "";
    $("itemVencimiento").value = "";
    state.lotesEditor = [];
  }
  actualizarResumenLotes();
  recalcularSubtotalItem();
  focusField("itemCantidad");
}

function eliminarItem(detalleId) {
  showConfirm({
    title: "Eliminar item",
    message: "Desea eliminar el item seleccionado?",
    onConfirm: async () => {
      try {
        await api(`${API}/compra/items/${detalleId}?empresa_id=${getEmpresaId()}`, {
          method: "DELETE"
        });
        await cargarCompra(state.compraId);
        limpiarEditorItem();
      } catch (error) {
        showError(error.message);
      }
    }
  });
}

async function manejarBusquedaNumeroCompra(event) {
  if (event.key !== "Enter") return;
  event.preventDefault();
  abrirBuscadorCompra($("numeroCompra").value.trim());
}

function completarOperacionDesdeCodigo(codigo) {
  const encontrada = getOperacionByCodigo(codigo);
  if (!encontrada) return false;
  return aplicarOperacionSeleccionada(encontrada, { ajustarCondicion: true, persistir: true });
}

async function manejarCodigoOperacion(event, options = {}) {
  if (event?.key && event.key !== "Enter") return;
  event?.preventDefault?.();

  const {
    abrirLookupSiNoExiste = true,
    focusNextField = true,
    autocompletarPorCondicionSiVacio = true
  } = options;

  const codigo = $("tipoOperacionCodigo").value.trim();
  if (!codigo) {
    if (!autocompletarPorCondicionSiVacio) return;
    const porCondicion = operacionDefaultPorCondicionPagoCompra();
    if (!porCondicion?.id) {
      if (abrirLookupSiNoExiste) abrirBuscadorOperacion();
      return;
    }
    aplicarOperacionSeleccionada(porCondicion, { ajustarCondicion: true, persistir: true });
    if (focusNextField) focusField("proveedorCodigo");
    return;
  }

  if (completarOperacionDesdeCodigo(codigo)) {
    if (focusNextField) focusField("proveedorCodigo");
    return;
  }

  try {
    const op = await api(`${API}/operacion/codigo/${encodeURIComponent(codigo)}?tipo=E&activo=1`);
    if (!aplicarOperacionSeleccionada(op, { ajustarCondicion: true, persistir: true })) {
      throw new Error("Operación no encontrada");
    }
    if (focusNextField) focusField("proveedorCodigo");
  } catch (_) {
    if (abrirLookupSiNoExiste) abrirBuscadorOperacion(codigo);
  }
}

function manejarNombreOperacion(event) {
  if (event.key !== "Enter") return;
  event.preventDefault();
  abrirBuscadorOperacion($("tipoOperacionDescripcion").value.trim());
}

async function manejarCodigoProveedor(event) {
  if (event.key !== "Enter") return;
  event.preventDefault();
  const rawValue = $("proveedorCodigo").value.trim();
  if (!rawValue) {
    try {
      const data = await api(`${API}/proveedores/1`);
      aplicarProveedorSeleccionado(data);
      focusField("compradorCodigo");
      return;
    } catch {
      abrirBuscadorProveedor();
      return;
    }
  }

  const id = toNumber(rawValue);
  if (!id) {
    abrirBuscadorProveedor(rawValue);
    return;
  }

  try {
    const data = await api(`${API}/proveedores/${id}`);
    aplicarProveedorSeleccionado(data);
    focusField("compradorCodigo");
  } catch (_) {
    abrirBuscadorProveedor(rawValue);
  }
}

function manejarNombreProveedor(event) {
  if (event.key !== "Enter") return;
  event.preventDefault();
  abrirBuscadorProveedor($("proveedorNombre").value.trim());
}

async function manejarCodigoComprador(event) {
  if (event.key !== "Enter") return;
  event.preventDefault();
  const rawValue = $("compradorCodigo").value.trim();
  if (!rawValue) {
    try {
      const data = await api(`${API}/comprador/1`);
      aplicarCompradorSeleccionado(data);
      focusField("condicionPago");
      return;
    } catch {
      abrirBuscadorComprador();
      return;
    }
  }

  const id = toNumber(rawValue);
  if (!id) {
    abrirBuscadorComprador(rawValue);
    return;
  }

  try {
    const data = await api(`${API}/comprador/${id}`);
    aplicarCompradorSeleccionado(data);
    focusField("condicionPago");
  } catch (_) {
    abrirBuscadorComprador(rawValue);
  }
}

function manejarNombreComprador(event) {
  if (event.key !== "Enter") return;
  event.preventDefault();
  abrirBuscadorComprador($("compradorNombre").value.trim());
}

function coincideProductoExacto(row, term) {
  const needle = String(term || "").trim().toLowerCase();
  if (!needle) return false;
  const id = String(row?.id ?? "").trim().toLowerCase();
  const codigoBarra = String(row?.codigo_barra ?? "").trim().toLowerCase();
  const codigo = String(row?.codigo ?? row?.codigo_producto ?? "").trim().toLowerCase();
  return needle === id || needle === codigoBarra || needle === codigo;
}

async function manejarCodigoProducto(event) {
  if (event.key !== "Enter") return;
  event.preventDefault();
  const codigo = $("productoCodigo").value.trim();
  if (!codigo) {
    abrirBuscadorProducto();
    return;
  }

  try {
    let match = null;
    const asId = toNumber(codigo);

    if (asId > 0 && String(asId) === codigo) {
      try {
        match = await api(`${API}/productos/${asId}`);
      } catch {
        match = null;
      }
    }

    if (!match) {
      const rows = await api(`${API}/productos?buscar=${encodeURIComponent(codigo)}`);
      if (Array.isArray(rows)) {
        const needleNombre = codigo.toLowerCase();
        match = rows.find((row) => coincideProductoExacto(row, codigo))
          || rows.find((row) => String(row?.nombre || "").trim().toLowerCase() === needleNombre)
          || null;
      }
    }

    if (!match) throw new Error("Producto no encontrado");
    aplicarProductoSeleccionado(match);
    focusField("itemPrecio");
  } catch (_) {
    abrirBuscadorProducto(codigo);
  }
}

function manejarNombreProducto(event) {
  if (event.key !== "Enter") return;
  event.preventDefault();
  if (toNumber($("productoId").value, 0) > 0) {
    focusField("itemPrecio");
    return;
  }
  abrirBuscadorProducto($("productoNombre").value.trim());
}

function aplicarProveedorSeleccionado(data) {
  $("proveedorId").value = data.id || "";
  $("proveedorCodigo").value = data.id || "";
  $("proveedorNombre").value = data.nombre || "";
  persistCompraDraft();
}

function aplicarCompradorSeleccionado(data) {
  $("compradorId").value = data.id || "";
  $("compradorCodigo").value = data.id || "";
  $("compradorNombre").value = data.nombre || "";
  persistCompraDraft();
}

function aplicarProductoSeleccionado(data) {
  const productoPrevioId = toNumber($("productoId").value, 0);
  const productoNuevoId = toNumber(data?.id, 0);
  const codigoBarra = toText(data?.codigo_barra);
  const costoMedio = toNumber(data?.costo_medio ?? data?.precio_compra ?? data?.costo ?? 0);

  $("productoId").value = data.id || "";
  $("productoCodigo").value = data.codigo || codigoBarra || data.id || "";
  $("productoCodigoBarra").value = codigoBarra || "-";
  $("productoNombre").value = data.nombre || "";
  $("itemCostoMedio").value = formatearNumero(costoMedio);

  if (productoPrevioId !== productoNuevoId) {
    state.lotesEditor = [];
    state.lotesModalDraft = [];
    $("itemLote").value = "";
    $("itemVencimiento").value = "";
    actualizarResumenLotes();
  }

  if (!$("itemPrecio").value) {
    $("itemPrecio").value = toNumber(data.precio_compra ?? data.costo ?? data.precio ?? data.precio_venta ?? 0);
  }
  recalcularSubtotalItem();
  persistCompraDraft();
}

function abrirBuscadorCompra(search = $("numeroCompra").value.trim()) {
  const params = new URLSearchParams({
    modo: "seleccion",
    from: "compra",
    empresa_id: String(getEmpresaId())
  });
  if (search) params.set("numero", search);
  const url = `/modulos/movimientoCompra/movimientoCompra.html?${params.toString()}`;
  const popup = abrirPopupSelector(url, "selectorMovimientoCompra", 1280, 820);
  if (!popup) return;
  esperarSeleccionPorStorage(SELECTOR_KEYS.compra, popup, recibirCompra);
}

function abrirBuscadorOperacion(search = $("tipoOperacionCodigo").value.trim() || $("tipoOperacionDescripcion").value.trim()) {
  const params = new URLSearchParams({
    modo: "seleccion",
    tipo: "E",
    activo: "1",
    from: "compra",
    storage_key: SELECTOR_KEYS.operacion
  });
  if (search) params.set("buscar", search);
  const url = `/modulos/parametros/operacion.html?${params.toString()}`;
  const popup = abrirPopupSelector(url, "selectorOperacionCompra", 920, 640);
  if (!popup) return;
  esperarSeleccionPorStorage(SELECTOR_KEYS.operacion, popup, (row) => {
    recibirOperacion(row);
    focusField("proveedorCodigo");
  });
}

function abrirBuscadorProveedor(search = "") {
  const params = new URLSearchParams({ modo: "seleccion" });
  if (search) params.set("search", search);
  const url = `/modulos/proveedores/proveedores.html?${params.toString()}`;
  const popup = abrirPopupSelector(url, "selectorProveedorCompra", 1160, 780);
  if (!popup) return;
  esperarSeleccionPorStorage(SELECTOR_KEYS.proveedor, popup, (row) => {
    recibirProveedor(row);
    focusField("compradorCodigo");
  });
}

function abrirBuscadorComprador(search = "") {
  const params = new URLSearchParams({ modo: "seleccion" });
  if (search) params.set("search", search);
  const url = `/modulos/comprador/comprador.html?${params.toString()}`;
  const popup = abrirPopupSelector(url, "selectorCompradorCompra", 980, 740);
  if (!popup) return;
  esperarSeleccionPorStorage(SELECTOR_KEYS.comprador, popup, (row) => {
    recibirComprador(row);
    focusField("condicionPago");
  });
}

function abrirBuscadorProducto(search = $("productoNombre").value.trim()) {
  const params = new URLSearchParams({
    modo: "seleccion",
    from: "compra"
  });
  if (search) params.set("buscar", search);
  const url = `/modulos/consultas/consulta_productos.html?${params.toString()}`;
  const popup = abrirPopupSelector(url, "selectorProductoCompra", 1280, 820);
  if (!popup) {
    showError("No se pudo abrir selector de producto");
    return;
  }
  esperarSeleccionPorStorage(SELECTOR_KEYS.producto, popup, (row) => {
    recibirProducto(row);
    focusField("itemPrecio");
  });
}

function abrirConsultaPrecioProducto(productoIdOverride = null) {
  const productoId = toNumber(productoIdOverride, 0) || toNumber($("productoId").value, 0);
  if (productoId <= 0) {
    showError("Seleccione un producto para consultar precio");
    focusField("productoCodigo");
    return;
  }

  const params = new URLSearchParams({
    producto: String(productoId),
    modo: "consulta",
    from: "compra"
  });
  const url = `/modulos/precio/precio.html?${params.toString()}`;
  const popup = abrirPopupSelector(url, "consultaPrecioCompra", 860, 720, {
    resizable: "no",
    scrollbars: "yes"
  });
  popup?.focus?.();
}

function limpiarPopupWatcher() {
  if (state.popupTimer) {
    clearInterval(state.popupTimer);
    state.popupTimer = null;
  }
  state.popupRef = null;
}

function calcularPosicionPopup(width, height) {
  const dualScreenLeft = typeof window.screenLeft === "number" ? window.screenLeft : window.screenX || 0;
  const dualScreenTop = typeof window.screenTop === "number" ? window.screenTop : window.screenY || 0;
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || screen.width;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || screen.height;

  const left = Math.max(0, Math.round(dualScreenLeft + (viewportWidth - width) / 2));
  const top = Math.max(0, Math.round(dualScreenTop + (viewportHeight - height) / 2));
  return { left, top };
}

function abrirPopupSelector(url, name, width = 1000, height = 700, options = {}) {
  const { left, top } = calcularPosicionPopup(width, height);
  const popupFeatures = [
    `width=${width}`,
    `height=${height}`,
    `left=${left}`,
    `top=${top}`,
    `resizable=${options.resizable || "yes"}`,
    `scrollbars=${options.scrollbars || "yes"}`
  ].join(",");

  const popup = window.open(
    url,
    name,
    popupFeatures
  );
  if (!popup) {
    showError("No se pudo abrir la ventana de seleccion");
    return null;
  }
  state.popupRef = popup;
  return popup;
}

function consumirSeleccionStorage(storageKey, onSelect) {
  const raw = localStorage.getItem(storageKey);
  if (!raw) return false;
  localStorage.removeItem(storageKey);
  try {
    const payload = JSON.parse(raw);
    onSelect(payload);
    return true;
  } catch {
    return false;
  }
}

function esperarSeleccionPorStorage(storageKey, popup, onSelect) {
  localStorage.removeItem(storageKey);
  limpiarPopupWatcher();
  state.popupRef = popup || null;
  state.popupTimer = setInterval(() => {
    if (consumirSeleccionStorage(storageKey, onSelect)) {
      limpiarPopupWatcher();
      return;
    }
    if (!popup || popup.closed) {
      limpiarPopupWatcher();
    }
  }, 250);
}

function recibirCompra(row) {
  localStorage.removeItem(SELECTOR_KEYS.compra);
  const id = toNumber(row?.id, 0);
  if (!id) return;
  cargarCompra(id)
    .then(() => focusField("proveedorCodigo"))
    .catch((error) => showError(error?.message || "No se pudo cargar compra"));
}

function recibirOperacion(row) {
  localStorage.removeItem(SELECTOR_KEYS.operacion);
  if (!row?.id) return;
  if (!aplicarOperacionSeleccionada(row, { ajustarCondicion: true, persistir: true })) return;
}

function recibirProveedor(row) {
  localStorage.removeItem(SELECTOR_KEYS.proveedor);
  if (!row?.id) return;
  aplicarProveedorSeleccionado(row);
}

function recibirComprador(row) {
  localStorage.removeItem(SELECTOR_KEYS.comprador);
  if (!row?.id) return;
  aplicarCompradorSeleccionado(row);
}

function recibirProducto(row) {
  localStorage.removeItem(SELECTOR_KEYS.producto);
  if (!row?.id) return;
  aplicarProductoSeleccionado(row);
}

function consumirSeleccionesPendientes() {
  consumirSeleccionStorage(SELECTOR_KEYS.compra, recibirCompra);
  consumirSeleccionStorage(SELECTOR_KEYS.operacion, recibirOperacion);
  consumirSeleccionStorage(SELECTOR_KEYS.proveedor, recibirProveedor);
  consumirSeleccionStorage(SELECTOR_KEYS.comprador, recibirComprador);
  consumirSeleccionStorage(SELECTOR_KEYS.producto, recibirProducto);
}

function registrarCallbacksSelectores() {
  window.recibirCompra = (payload) => recibirCompra(payload);
  window.recibirOperacion = (payload) => recibirOperacion(payload);
  window.recibirProveedor = (payload) => recibirProveedor(payload);
  window.recibirComprador = (payload) => recibirComprador(payload);
  window.recibirProducto = (payload) => recibirProducto(payload);
}

function salir() {
  const ejecutarSalida = () => {
    habilitarSalidaPagina();
    window.location.href = "../../home.html";
  };

  if (!tieneItemsEnDetalle()) {
    ejecutarSalida();
    return;
  }

  showConfirm({
    title: "Salir de Compra",
    message: "Hay items cargados en el detalle. Si sale, perdera esta edicion. ¿Desea continuar?",
    onConfirm: ejecutarSalida
  });
}

window.salir = salir;
window.nuevaCompra = nuevaCompra;

document.addEventListener("DOMContentLoaded", init);


