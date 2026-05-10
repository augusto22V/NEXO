const PERMISOS_DEFAULT = Object.freeze({
  venta_rapida_ver: true,
  venta_rapida_nueva: true,
  venta_rapida_cancelar: true,
  venta_rapida_imprimir_preparo: true,
  venta_rapida_efectivizar: true,
  venta_rapida_imprimir_venta: true
});

const STORAGE_KEYS = Object.freeze({
  vendedor: "vendedorSeleccionado",
  cliente: "clienteSeleccionado",
  movimientoVentaMedio: "ventaMedioMovimientoSeleccionado",
  operacion: "ventaMedioOperacionSeleccionada",
  formaPago: "ventaMedioFormaPagoSeleccionada",
  operacionLookup: "ventaMedioOperacionLookupSeleccionada",
  ordenCategorias: "ventaMedioOrdenCategorias",
  ordenProductosPrefix: "ventaMedioOrdenProductos_",
  postCobroFlag: "postCobroVentaMedio",
  postCobroVentaId: "postCobroVentaMedioId"
});

const OPERACION_CODIGO_CORTO_VENTA = Object.freeze([
  { short: "1", aliases: ["1", "3", "18"], internal: [2101], tokens: ["venta", "contado"] },
  { short: "2", aliases: ["2", "4", "19"], internal: [2102], tokens: ["venta", "credito"] },
  { short: "12", aliases: ["12", "13"], internal: [2103], tokens: ["presupuesto"] },
  { short: "16", aliases: ["16"], internal: [2106], tokens: ["transferencia"] },
  { short: "30", aliases: ["30"], internal: [2109], tokens: ["faltante"] },
  { short: "45", aliases: ["45"], internal: [2107], tokens: ["brindis", "cliente"] }
]);

const MONEDA_IDS = Object.freeze({
  PYG: 1,
  BRL: 2,
  USD: 3
});
const POS_SIN_TIPO_PEDIDO =
  typeof window !== "undefined" && window.__POS_MODE?.sinTipoPedido === false ? false : true;

const state = {
  pedido: {
    id: null,
    numero: null,
    estado: "PENDIENTE",
    tipo_pedido_id: 0,
    vendedor_id: 1,
    vendedor_nombre: "",
    cliente_id: 1,
    cliente_nombre: "Ocasional",
    items: []
  },
  permisos: {},
  metodoPago: "EFECTIVO",
  cotizacion: { brl: 0, usd: 0 },
  operaciones: [],
  formasPago: [],
  operacionSeleccionada: null,
  operacionSeleccionadaId: null,
  formaPagoSeleccionadaId: null,
  categorias: [],
  productosPorCategoria: new Map(),
  catalogo: new Map(),
  categoriaActivaId: null,
  categoriaActivaNombre: "",
  showCategorias: true,
  showProductos: false,
  itemSeleccionadoId: null,
  itemEditandoId: null,
  cargandoCategorias: false,
  cargandoProductos: false,
  cobrando: false,
  secuenciaBusqueda: 0,
  sugerenciaActivaIndex: -1,
  ventaBloqueada: false,
  postCobroPendiente: false
};

const refs = {
  buscarInput: document.getElementById("vmBuscarInput"),
  volverBtn: document.getElementById("vmVolverBtn"),
  sugerencias: document.getElementById("vmSugerencias"),
  pedidoNumero: document.getElementById("vmPedidoNumero"),
  buscarPedidoBtn: document.getElementById("vmBuscarPedidoBtn"),
  vendedorCodigo: document.getElementById("vmVendedorCodigo"),
  vendedorNombre: document.getElementById("vmVendedorNombre"),
  buscarVendedorBtn: document.getElementById("vmBuscarVendedorBtn"),
  clienteCodigo: document.getElementById("vmClienteCodigo"),
  clienteNombre: document.getElementById("vmClienteNombre"),
  buscarClienteBtn: document.getElementById("vmBuscarClienteBtn"),
  operacionCodigo: document.getElementById("vmOperacionCodigo"),
  operacionNombre: document.getElementById("vmOperacionNombre"),
  buscarOperacionBtn: document.getElementById("vmBuscarOperacionBtn"),
  formaPago: document.getElementById("vmFormaPago"),
  tipoPedido: document.getElementById("vmTipoPedido"),
  tipoPedidoBox: document.getElementById("vmTipoPedidoBox"),
  operacionSelect: document.getElementById("vmOperacionSelect"),
  pedidoEstado: document.getElementById("vmPedidoEstado"),
  pedidoBody: document.getElementById("vmPedidoBody"),
  rapidosGrid: document.getElementById("vmRapidosGrid"),
  categoriaActiva: document.getElementById("vmCategoriaActiva"),
  backCategoriaBtn: document.getElementById("vmBackCategoriaBtn"),
  showCategorias: document.getElementById("vmShowCategorias"),
  showProductos: document.getElementById("vmShowProductos"),
  totalGs: document.getElementById("vmTotalGs"),
  totalBrl: document.getElementById("vmTotalBrl"),
  totalUsd: document.getElementById("vmTotalUsd"),
  eliminarBtn: document.getElementById("vmEliminarBtn"),
  cancelarBtn: document.getElementById("vmCancelarBtn"),
  enEsperaBtn: document.getElementById("vmEnEsperaBtn"),
  cobroRapidoBtn: document.getElementById("vmCobroRapidoBtn"),
  cobroRapidoTicketBtn: document.getElementById("vmCobroRapidoTicketBtn"),
  cobrarBtn: document.getElementById("vmCobrarBtn"),
  metodos: Array.from(document.querySelectorAll(".vm-btn-pay")),
  mensaje: document.getElementById("vmMensaje"),

  modalEditarItem: document.getElementById("vmModalEditarItem"),
  editItemNombre: document.getElementById("vmEditItemNombre"),
  editCantidad: document.getElementById("vmEditCantidad"),
  editPrecio: document.getElementById("vmEditPrecio"),
  editObservacion: document.getElementById("vmEditObservacion"),
  editGuardarBtn: document.getElementById("vmEditGuardarBtn"),
  editCerrarBtn: document.getElementById("vmEditCerrarBtn"),

  modalConfirmFactura: document.getElementById("vmModalConfirmFactura"),
  confirmFacturaSi: document.getElementById("vmConfirmFacturaSi"),
  confirmFacturaNo: document.getElementById("vmConfirmFacturaNo"),

  modalFactura: document.getElementById("vmModalFactura"),
  clienteCodigoFactura: document.getElementById("vmClienteCodigoFactura"),
  btnBuscarClienteFactura: document.getElementById("vmBtnBuscarClienteFactura"),
  rucFacturaInput: document.getElementById("vmRucFacturaInput"),
  nombreFacturaInput: document.getElementById("vmNombreFacturaInput"),
  direccionFacturaInput: document.getElementById("vmDireccionFacturaInput"),
  ciudadFacturaInput: document.getElementById("vmCiudadFacturaInput"),
  numeroFacturaPreview: document.getElementById("vmNumeroFacturaPreview"),
  totalFacturaPreview: document.getElementById("vmTotalFacturaPreview"),
  cerrarModalFacturaBtn: document.getElementById("vmCerrarModalFacturaBtn"),
  confirmarFacturaBtn: document.getElementById("vmConfirmarFacturaBtn")
};

const drag = {
  kind: "",
  sourceId: 0,
  targetId: 0,
  touch: null,
  sourceTile: null,
  targetTile: null,
  blockClickUntil: 0
};

let mensajeTimer = null;
let debounceBusqueda = null;
const tipoPedidoCatalog = {
  items: [],
  defaultId: 0,
  visible: true
};

function toNumber(v, f = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : f;
}

function toInt(v, f = 0) {
  const n = Number.parseInt(String(v || ""), 10);
  return Number.isFinite(n) ? n : f;
}

function tipoPedidoVisibleVenta() {
  if (POS_SIN_TIPO_PEDIDO) return false;
  return tipoPedidoCatalog.visible !== false;
}

function actualizarVisibilidadTipoPedidoVenta() {
  const visible = tipoPedidoVisibleVenta();

  if (refs.tipoPedidoBox) {
    refs.tipoPedidoBox.style.display = visible ? "" : "none";
  }

  if (refs.tipoPedido) {
    if (!visible) {
      refs.tipoPedido.value = "";
    }
    refs.tipoPedido.disabled = !visible;
  }
}

function getTipoPedidoDefaultVenta() {
  if (!tipoPedidoVisibleVenta()) return 0;

  const configured = toInt(tipoPedidoCatalog.defaultId, 0);
  if (configured > 0) return configured;

  const shared = window.TipoPedidoVenta;
  const fromSelect = shared?.ensureSelectedId?.(refs.tipoPedido, 0) || 0;
  if (fromSelect > 0) return fromSelect;

  return toInt(refs.tipoPedido?.options?.[0]?.value, 0);
}

function getTipoPedidoSeleccionadoVenta() {
  if (!tipoPedidoVisibleVenta()) return 0;

  const shared = window.TipoPedidoVenta;
  if (!shared?.ensureSelectedId) return toInt(refs.tipoPedido?.value, 0);
  return shared.ensureSelectedId(refs.tipoPedido, getTipoPedidoDefaultVenta());
}

function aplicarTipoPedidoEnSelectVenta(tipoPedidoId) {
  if (!tipoPedidoVisibleVenta()) {
    if (refs.tipoPedido) refs.tipoPedido.value = "";
    return 0;
  }

  const shared = window.TipoPedidoVenta;
  const requested = shared?.toPositiveInt?.(tipoPedidoId, 0) || 0;

  if (requested > 0 && refs.tipoPedido) {
    const exists = Array.from(refs.tipoPedido.options || []).some((opt) => toInt(opt.value, 0) === requested);
    if (exists) {
      refs.tipoPedido.value = String(requested);
      return requested;
    }
  }

  return getTipoPedidoSeleccionadoVenta();
}

async function cargarTiposPedidoVenta(selectedId = 0) {
  const shared = window.TipoPedidoVenta;
  if (!tipoPedidoVisibleVenta()) {
    tipoPedidoCatalog.items = [];
    tipoPedidoCatalog.defaultId = 0;
    state.pedido.tipo_pedido_id = 0;
    actualizarVisibilidadTipoPedidoVenta();
    return 0;
  }
  if (!shared?.loadTiposPedido || !refs.tipoPedido) {
    throw new Error("No se encontro el loader de Tipo Pedido");
  }

  const loaded = await shared.loadTiposPedido(refs.tipoPedido, {
    selectedId: shared.toPositiveInt(selectedId, 0)
  });

  tipoPedidoCatalog.items = loaded.items || [];
  tipoPedidoCatalog.defaultId = shared.toPositiveInt(loaded.defaultId, 0);

  const selected = shared.ensureSelectedId(refs.tipoPedido, tipoPedidoCatalog.defaultId);
  state.pedido.tipo_pedido_id = selected || getTipoPedidoDefaultVenta();
  return state.pedido.tipo_pedido_id;
}

function toBool(v) {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v === 1;
  const txt = String(v || "").trim().toLowerCase();
  return txt === "1" || txt === "true" || txt === "t" || txt === "si";
}

function normalizarMonedaId(value, fallback = MONEDA_IDS.PYG) {
  const id = toInt(value, 0);
  if (id === MONEDA_IDS.PYG || id === MONEDA_IDS.BRL || id === MONEDA_IDS.USD) return id;
  return fallback;
}

function roundMoney(v, d = 6) {
  const factor = 10 ** d;
  return Math.round((toNumber(v, 0) + Number.EPSILON) * factor) / factor;
}

function escapeHtml(v) {
  return String(v || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizarTexto(v) {
  return String(v || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

function matchReglaCodigoCortoVenta(op) {
  const codigoInterno = toInt(op?.codigo, 0);
  const descripcion = normalizarTexto(op?.descripcion);

  for (const regla of OPERACION_CODIGO_CORTO_VENTA) {
    if (regla.internal.includes(codigoInterno)) return regla;
    if (descripcion && regla.tokens.every((token) => descripcion.includes(token))) return regla;
  }

  return null;
}

function getOperacionCodigoVisibleVenta(op) {
  const regla = matchReglaCodigoCortoVenta(op);
  if (regla?.short) return String(regla.short);
  return String(op?.codigo || op?.id || "");
}

function getOperacionCodigosBusquedaVenta(op) {
  const codigos = new Set();
  codigos.add(String(op?.codigo || op?.id || "").trim());
  const regla = matchReglaCodigoCortoVenta(op);
  if (regla?.short) codigos.add(String(regla.short));
  for (const alias of regla?.aliases || []) codigos.add(String(alias));
  return Array.from(codigos).filter(Boolean);
}

function formaPagoEsCredito(row) {
  const cuotas = Math.max(1, toInt(row?.cuotas ?? row?.cantidad_cuotas, 1));
  const dias = Math.max(0, toInt(row?.dias_intervalo, 0));
  return cuotas > 1 || dias > 0;
}

function getFormaPagoSeleccionada() {
  const id = toInt(state.formaPagoSeleccionadaId, 0);
  if (!id) return null;
  return state.formasPago.find((row) => toInt(row?.id, 0) === id) || null;
}

function formaPagoSeleccionadaEsCredito() {
  return formaPagoEsCredito(getFormaPagoSeleccionada());
}

function metodoPagoEsCredito() {
  return formaPagoSeleccionadaEsCredito();
}

function prioridadOperacionVenta(codigoInterno) {
  switch (toInt(codigoInterno, 0)) {
    case 2101: return 10;
    case 2102: return 20;
    case 2103: return 30;
    case 2106: return 40;
    case 2109: return 50;
    case 2107: return 60;
    default: return 99;
  }
}

function getOperacionPorCodigoVenta(codigoInput) {
  const codigo = String(codigoInput || "").trim();
  if (!codigo) return null;

  const catalogo = (state.operaciones || []).filter((op) => op?.activo !== false && String(op?.tipo || "").toUpperCase() === "S");

  const exactoInterno = catalogo.find((op) => String(op?.codigo || "").trim() === codigo);
  if (exactoInterno) return exactoInterno;

  const candidatos = catalogo.filter((op) => getOperacionCodigosBusquedaVenta(op).includes(codigo));
  if (!candidatos.length) return null;
  if (candidatos.length === 1) return candidatos[0];

  candidatos.sort((a, b) => {
    const pa = prioridadOperacionVenta(a?.codigo);
    const pb = prioridadOperacionVenta(b?.codigo);
    if (pa !== pb) return pa - pb;
    return toInt(a?.id, 0) - toInt(b?.id, 0);
  });
  return candidatos[0];
}

function operacionDefaultPorMetodoPagoVenta() {
  const codigoObjetivo = metodoPagoEsCredito() ? "2" : "1";
  return getOperacionPorCodigoVenta(codigoObjetivo);
}

function limpiarOperacionSeleccionadaVenta() {
  state.operacionSeleccionadaId = null;
  state.operacionSeleccionada = null;
  if (refs.operacionSelect) refs.operacionSelect.value = "";
  refs.operacionNombre.value = "";
}

function formatearGs(v) {
  return new Intl.NumberFormat("es-PY", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(toNumber(v, 0));
}

function formatearDecimal(v) {
  return new Intl.NumberFormat("es-PY", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(toNumber(v, 0));
}

function buildPrecioMultimoneda(precioInput, monedaId = MONEDA_IDS.PYG) {
  const monto = Math.max(0, toNumber(precioInput, 0));
  const id = normalizarMonedaId(monedaId, MONEDA_IDS.PYG);
  const brlRate = toNumber(state.cotizacion.brl, 0);
  const usdRate = toNumber(state.cotizacion.usd, 0);

  let gs = null;
  if (id === MONEDA_IDS.PYG) gs = monto;
  if (id === MONEDA_IDS.BRL) gs = brlRate > 0 ? monto * brlRate : null;
  if (id === MONEDA_IDS.USD) gs = usdRate > 0 ? monto * usdRate : null;

  const gsSafe = gs == null ? null : roundMoney(gs, 6);
  const brl = gsSafe == null
    ? (id === MONEDA_IDS.BRL ? monto : null)
    : (brlRate > 0 ? roundMoney(gsSafe / brlRate, 6) : null);
  const usd = gsSafe == null
    ? (id === MONEDA_IDS.USD ? monto : null)
    : (usdRate > 0 ? roundMoney(gsSafe / usdRate, 6) : null);

  return {
    precio_moneda_id: id,
    precio_moneda_origen: roundMoney(monto, 6),
    precio_gs: gsSafe,
    precio_brl: brl,
    precio_usd: usd,
    cotizacion_brl: brlRate > 0 ? brlRate : null,
    cotizacion_usd: usdRate > 0 ? usdRate : null
  };
}

function parseVentaIds(raw) {
  if (Array.isArray(raw)) return raw.map((n) => toInt(n, 0)).filter((n) => n > 0);
  return String(raw || "").split(",").map((n) => toInt(n, 0)).filter((n) => n > 0);
}

function safeJson(res, fallback = {}) {
  return res.json().catch(() => fallback);
}

function mostrarMensaje(texto, tipo = "info") {
  refs.mensaje.hidden = false;
  refs.mensaje.className = `vm-mensaje ${tipo}`;
  refs.mensaje.textContent = texto;
  clearTimeout(mensajeTimer);
  mensajeTimer = setTimeout(() => { refs.mensaje.hidden = true; }, 2600);
}

function getStorageJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const data = JSON.parse(raw);
    return data ?? fallback;
  } catch {
    return fallback;
  }
}

function setStorageJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* noop */ }
}

function abrirModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add("show");
  document.body.style.overflow = "hidden";
}

function cerrarModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove("show");
  if (!document.querySelector(".modal.show")) document.body.style.overflow = "";
}

function tienePermiso(clave) {
  const fromMap = state.permisos?.permisos_venta_rapida?.[clave];
  if (typeof fromMap === "boolean") return fromMap;
  const fromRoot = state.permisos?.[clave];
  if (typeof fromRoot === "boolean") return fromRoot;
  return Boolean(PERMISOS_DEFAULT[clave]);
}

function mapProducto(raw, categoriaId = null) {
  return {
    id: toInt(raw.id, 0),
    nombre: String(raw.nombre || "").trim(),
    codigo_barra: String(raw.codigo_barra || "").trim(),
    precio: toNumber(raw.precio ?? raw.precio_venta, 0),
    stock: toNumber(raw.stock, 0),
    no_control_stock: toBool(raw.no_control_stock),
    es_insumo: toBool(raw.es_insumo),
    es_servicio: toBool(raw.es_servicio),
    categoria_id: toInt(raw.categoria_id || categoriaId, 0) || null,
    orden_venta_medio: toInt(raw.orden_venta_medio, 0)
  };
}

function mapItem(raw) {
  const cantidad = Math.max(1, toNumber(raw.cantidad, 1));
  const precioGs = Math.max(0, toNumber(raw.precio_gs, toNumber(raw.precio, toNumber(raw.subtotal, 0) / Math.max(1, cantidad))));
  const monedaId = normalizarMonedaId(raw.precio_moneda_id, MONEDA_IDS.PYG);
  const precioOrigenFallback = monedaId === MONEDA_IDS.PYG ? precioGs : 0;
  const precioMonedaOrigen = raw.precio_moneda_origen == null
    ? precioOrigenFallback
    : Math.max(0, toNumber(raw.precio_moneda_origen, precioOrigenFallback));
  const precioBrl = raw.precio_brl == null ? null : Math.max(0, toNumber(raw.precio_brl, 0));
  const precioUsd = raw.precio_usd == null ? null : Math.max(0, toNumber(raw.precio_usd, 0));
  return {
    id: toInt(raw.id, 0),
    producto_id: toInt(raw.producto_id, 0) || null,
    descripcion: String(raw.descripcion || raw.producto_nombre || "Producto"),
    cantidad,
    precio: precioGs,
    precio_moneda_id: monedaId,
    precio_moneda_origen: precioMonedaOrigen,
    precio_gs: precioGs,
    precio_brl: precioBrl,
    precio_usd: precioUsd,
    observacion: String(raw.observacion || "")
  };
}

function mergeCatalogo(productos = []) {
  for (const p of productos) {
    if (!p?.id || p.es_insumo) continue;
    state.catalogo.set(p.id, { ...(state.catalogo.get(p.id) || {}), ...p });
  }
}

function calcularTotalPedido() {
  return state.pedido.items.reduce((acc, it) => acc + toNumber(it.cantidad) * toNumber(it.precio), 0);
}

function actualizarTotales() {
  const subtotalInternoGs = calcularTotalPedido();
  const totalGs = subtotalInternoGs;
  const totalBrl = state.cotizacion.brl > 0 ? totalGs / state.cotizacion.brl : 0;
  const totalUsd = state.cotizacion.usd > 0 ? totalGs / state.cotizacion.usd : 0;
  refs.totalGs.textContent = `Gs ${formatearGs(totalGs)}`;
  refs.totalBrl.textContent = `R$ ${formatearDecimal(totalBrl)}`;
  refs.totalUsd.textContent = `US$ ${formatearDecimal(totalUsd)}`;
}

function setCabeceraFromPedido() {
  refs.pedidoNumero.value = state.pedido.numero ? String(state.pedido.numero) : "";
  refs.vendedorCodigo.value = String(state.pedido.vendedor_id || 1);
  refs.vendedorNombre.value = state.pedido.vendedor_nombre || "";
  refs.clienteCodigo.value = String(state.pedido.cliente_id || 1);
  refs.clienteNombre.value = state.pedido.cliente_nombre || "";
  if (state.formaPagoSeleccionadaId && refs.formaPago) {
    refs.formaPago.value = String(state.formaPagoSeleccionadaId);
  }
  if (tipoPedidoVisibleVenta()) {
    state.pedido.tipo_pedido_id = aplicarTipoPedidoEnSelectVenta(state.pedido.tipo_pedido_id || getTipoPedidoDefaultVenta());
  } else {
    state.pedido.tipo_pedido_id = 0;
  }
  if (state.operacionSeleccionadaId) refs.operacionSelect.value = String(state.operacionSeleccionadaId);
  syncOperacionUI();
}

function syncPedidoDesdeCabecera() {
  state.pedido.vendedor_id = Math.max(1, toInt(refs.vendedorCodigo.value, 1));
  state.pedido.vendedor_nombre = String(refs.vendedorNombre.value || "").trim();
  state.pedido.cliente_id = Math.max(1, toInt(refs.clienteCodigo.value, 1));
  state.pedido.cliente_nombre = String(refs.clienteNombre.value || "").trim() || "Ocasional";
  state.pedido.tipo_pedido_id = tipoPedidoVisibleVenta()
    ? (getTipoPedidoSeleccionadoVenta() || getTipoPedidoDefaultVenta())
    : 0;
  const formaPagoId = toInt(refs.formaPago?.value, 0);
  if (formaPagoId > 0) {
    state.formaPagoSeleccionadaId = formaPagoId;
  }
  state.operacionSeleccionadaId = toInt(refs.operacionSelect?.value, 0) || null;
  state.operacionSeleccionada = state.operaciones.find((op) => toInt(op.id, 0) === state.operacionSeleccionadaId) || null;
  if (state.operacionSeleccionadaId) localStorage.setItem(STORAGE_KEYS.operacion, String(state.operacionSeleccionadaId));
  if (state.formaPagoSeleccionadaId) localStorage.setItem(STORAGE_KEYS.formaPago, String(state.formaPagoSeleccionadaId));
  syncOperacionUI();
}

function actualizarEstadoPedido() {
  if (!state.pedido.id) {
    refs.pedidoEstado.textContent = "Sin pedido";
    return;
  }
  const nro = state.pedido.numero || state.pedido.id;
  refs.pedidoEstado.textContent = `Pedido #${nro} (${state.pedido.estado || "PENDIENTE"})`;
}

function actualizarEstadoAcciones() {
  const hayItems = state.pedido.items.length > 0;
  refs.eliminarBtn.disabled = !hayItems || state.ventaBloqueada;
  refs.cancelarBtn.disabled = !state.pedido.id || !tienePermiso("venta_rapida_cancelar") || state.ventaBloqueada;
  refs.cobrarBtn.disabled = !hayItems || !tienePermiso("venta_rapida_efectivizar") || state.ventaBloqueada;
}

function abrirEditorItem(itemId) {
  const item = state.pedido.items.find((it) => toInt(it.id, 0) === toInt(itemId, 0));
  if (!item) return;
  state.itemEditandoId = item.id;
  refs.editItemNombre.textContent = item.descripcion;
  refs.editCantidad.value = String(Math.max(1, toInt(item.cantidad, 1)));
  refs.editPrecio.value = String(Math.max(0, toNumber(item.precio, 0)));
  refs.editObservacion.value = String(item.observacion || "");
  abrirModal("vmModalEditarItem");
}

function cerrarEditorItem() {
  state.itemEditandoId = null;
  cerrarModal("vmModalEditarItem");
}

function renderPedido() {
  refs.pedidoBody.innerHTML = "";
  if (!state.pedido.items.length) {
    refs.pedidoBody.innerHTML = `<tr><td colspan="5" class="vm-empty">Sin productos agregados</td></tr>`;
    cerrarEditorItem();
    actualizarTotales();
    actualizarEstadoAcciones();
    actualizarEstadoPedido();
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const item of state.pedido.items) {
    const tr = document.createElement("tr");
    tr.dataset.itemId = String(item.id);
    if (toInt(state.itemSeleccionadoId, 0) === toInt(item.id, 0)) tr.classList.add("vm-selected");
    const obs = String(item.observacion || "").trim();
    const subtotal = Math.max(0, toNumber(item.cantidad, 0) * toNumber(item.precio, 0));
    tr.innerHTML = `
      <td>${toNumber(item.cantidad)}</td>
      <td>
        <div>${escapeHtml(item.descripcion)}</div>
        ${obs ? `<div class="vm-item-obs">${escapeHtml(obs)}</div>` : ""}
      </td>
      <td class="vm-money">${formatearGs(item.precio)}</td>
      <td class="vm-money">${formatearGs(subtotal)}</td>
      <td>
        <button type="button" class="vm-del-row" data-action="remove" title="Eliminar item">
          <i class="fa-solid fa-trash"></i>
        </button>
      </td>
    `;
    fragment.appendChild(tr);
  }
  refs.pedidoBody.appendChild(fragment);
  actualizarTotales();
  actualizarEstadoAcciones();
  actualizarEstadoPedido();
}

function setVistaCategoriasProductos(showCategorias, showProductos) {
  state.showCategorias = Boolean(showCategorias);
  state.showProductos = Boolean(showProductos);
  refs.showCategorias.checked = state.showCategorias;
  refs.showProductos.checked = state.showProductos;
}

function actualizarEtiquetaCategoriaActiva() {
  if (!state.categoriaActivaId) {
    refs.categoriaActiva.textContent = "Categorias";
    refs.backCategoriaBtn.disabled = true;
    return;
  }
  refs.categoriaActiva.textContent = `Categoria: ${state.categoriaActivaNombre}`;
  refs.backCategoriaBtn.disabled = false;
}

function crearTituloGrid(txt) {
  const div = document.createElement("div");
  div.className = "vm-grid-title";
  div.textContent = txt;
  return div;
}

function asignarShortcutTile(btn, shortcut) {
  const n = toInt(shortcut, 0);
  if (n >= 1 && n <= 9) {
    btn.dataset.shortcut = String(n);
    return `<span class="vm-tile-shortcut">${n}</span>`;
  }
  delete btn.dataset.shortcut;
  return "";
}

function formatearStock(v) {
  const n = toNumber(v, 0);
  if (Number.isInteger(n)) return String(n);
  return new Intl.NumberFormat("es-PY", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n);
}

function crearTileCategoria(cat, shortcut = 0) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "vm-tile vm-tile-cat";
  btn.dataset.kind = "categoria";
  btn.dataset.id = String(cat.id);
  btn.draggable = true;
  const badge = asignarShortcutTile(btn, shortcut);
  btn.innerHTML = `
    ${badge}
    <span class="vm-tile-name">${escapeHtml(cat.nombre)}</span>
  `;
  return btn;
}

function crearTileProducto(prod, shortcut = 0) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "vm-tile vm-tile-prod";
  btn.dataset.kind = "producto";
  btn.dataset.id = String(prod.id);
  btn.draggable = true;
  const badge = asignarShortcutTile(btn, shortcut);
  const stockInfo = prod.no_control_stock ? "S/stock" : "";
  btn.innerHTML = `
    ${badge}
    <span class="vm-tile-name">${escapeHtml(prod.nombre)}</span>
    <span class="vm-tile-meta">
      <span class="vm-tile-price">Gs. ${formatearGs(prod.precio)}</span>
      ${stockInfo ? `<span class="vm-tile-stock">${stockInfo}</span>` : ""}
    </span>
  `;
  return btn;
}

function renderAccesosRapidos() {
  refs.rapidosGrid.innerHTML = "";
  actualizarEtiquetaCategoriaActiva();
  if (state.cargandoCategorias) {
    refs.rapidosGrid.innerHTML = `<div class="vm-empty">Cargando categorias...</div>`;
    return;
  }
  const term = normalizarTexto(refs.buscarInput.value);
  if (!state.showCategorias && !state.showProductos) {
    refs.rapidosGrid.innerHTML = `<div class="vm-empty">Active categorias o productos</div>`;
    return;
  }

  const usarAtajosCategorias = state.showCategorias && !state.showProductos;
  const usarAtajosProductos = state.showProductos && Boolean(state.categoriaActivaId);

  if (state.showCategorias) {
    refs.rapidosGrid.appendChild(crearTituloGrid("Categorias"));
    const data = state.categorias.filter((cat) => !term || normalizarTexto(cat.nombre).includes(term));
    if (!data.length) {
      const empty = document.createElement("div");
      empty.className = "vm-empty";
      empty.textContent = "No hay categorias para mostrar";
      refs.rapidosGrid.appendChild(empty);
    } else {
      data.forEach((cat, idx) => refs.rapidosGrid.appendChild(crearTileCategoria(cat, usarAtajosCategorias && idx < 9 ? (idx + 1) : 0)));
    }
  }

  if (state.showProductos) {
    refs.rapidosGrid.appendChild(crearTituloGrid("Productos"));
    if (!state.categoriaActivaId) {
      const empty = document.createElement("div");
      empty.className = "vm-empty";
      empty.textContent = "Seleccione una categoria para ver productos";
      refs.rapidosGrid.appendChild(empty);
      return;
    }
    if (state.cargandoProductos) {
      const empty = document.createElement("div");
      empty.className = "vm-empty";
      empty.textContent = "Cargando productos...";
      refs.rapidosGrid.appendChild(empty);
      return;
    }
    const base = state.productosPorCategoria.get(state.categoriaActivaId) || [];
    const data = base.filter((p) => {
      if (p.es_insumo) return false;
      if (!term) return true;
      const n = normalizarTexto(p.nombre);
      const c = normalizarTexto(p.codigo_barra || "");
      return n.includes(term) || c.includes(term) || String(p.id).startsWith(term);
    });
    if (!data.length) {
      const empty = document.createElement("div");
      empty.className = "vm-empty";
      empty.textContent = "No hay productos para mostrar";
      refs.rapidosGrid.appendChild(empty);
    } else {
      data.forEach((p, idx) => refs.rapidosGrid.appendChild(crearTileProducto(p, usarAtajosProductos && idx < 9 ? (idx + 1) : 0)));
    }
  }
}/*  */

function construirListaCoincidencias(texto, max = 10) {
  const term = normalizarTexto(texto);
  if (!term) return [];
  const result = [];
  for (const p of state.catalogo.values()) {
    if (p.es_insumo) continue;
    const id = String(p.id || "");
    const code = normalizarTexto(p.codigo_barra || "");
    const name = normalizarTexto(p.nombre || "");
    let score = 99;
    if (id === term || code === term) score = 0;
    else if (name === term) score = 1;
    else if (id.startsWith(term) || code.startsWith(term) || name.startsWith(term)) score = 2;
    else if (name.includes(term)) score = 3;
    else if (code.includes(term)) score = 4;
    if (score < 99) result.push({ p, score });
  }
  result.sort((a, b) => (a.score - b.score) || String(a.p.nombre).localeCompare(String(b.p.nombre), "es"));
  return result.slice(0, max).map((r) => r.p);
}

function renderSugerencias(lista = []) {
  refs.sugerencias.innerHTML = "";
  if (!lista.length) {
    ocultarSugerencias();
    return;
  }
  const frag = document.createDocumentFragment();
  for (const p of lista) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "vm-sug-item";
    btn.dataset.id = String(p.id);
    btn.innerHTML = `
      <span class="vm-sug-name">${escapeHtml(p.nombre)}</span>
      <span class="vm-sug-meta">${p.codigo_barra ? `#${escapeHtml(p.codigo_barra)}` : `ID ${p.id}`} | Gs ${formatearGs(p.precio)}</span>
    `;
    frag.appendChild(btn);
  }
  refs.sugerencias.appendChild(frag);
  refs.sugerencias.hidden = false;
  setSugerenciaActiva(0, { scroll: false });
}

function getSugerenciasItems() {
  return Array.from(refs.sugerencias.querySelectorAll(".vm-sug-item"));
}

function ocultarSugerencias() {
  refs.sugerencias.hidden = true;
  state.sugerenciaActivaIndex = -1;
}

function limpiarBusquedaDespuesDeAgregar() {
  refs.buscarInput.value = "";
  ocultarSugerencias();
  renderAccesosRapidos();
}

function setSugerenciaActiva(index, { scroll = true } = {}) {
  const items = getSugerenciasItems();
  if (!items.length) {
    state.sugerenciaActivaIndex = -1;
    return false;
  }
  const total = items.length;
  const pos = ((toInt(index, 0) % total) + total) % total;
  items.forEach((item, i) => item.classList.toggle("activo", i === pos));
  state.sugerenciaActivaIndex = pos;
  if (scroll) items[pos].scrollIntoView({ block: "nearest" });
  return true;
}

function moverSugerenciaActiva(paso) {
  const items = getSugerenciasItems();
  if (!items.length) return false;
  const base = state.sugerenciaActivaIndex >= 0 ? state.sugerenciaActivaIndex : (paso > 0 ? -1 : 0);
  return setSugerenciaActiva(base + (paso > 0 ? 1 : -1));
}

async function seleccionarSugerenciaBtn(btn) {
  if (!btn) return false;
  const p = getProductoById(btn.dataset.id);
  if (!p) return false;
  await agregarProductoAlPedido(p);
  limpiarBusquedaDespuesDeAgregar();
  return true;
}

async function seleccionarSugerenciaActiva() {
  const items = getSugerenciasItems();
  if (!items.length) return false;
  const idx = state.sugerenciaActivaIndex >= 0 ? state.sugerenciaActivaIndex : 0;
  return seleccionarSugerenciaBtn(items[idx] || items[0]);
}

async function buscarProductosRemoto(texto, limit = 20) {
  const term = String(texto || "").trim();
  if (!term) return [];
  const url = `/api/productos/venta-medio?buscar=${encodeURIComponent(term)}&limit=${limit}`;
  const res = await fetch(url);
  const data = await safeJson(res, []);
  if (!res.ok || !Array.isArray(data)) return [];
  const mapped = data.map((r) => mapProducto(r)).filter((r) => r.id && r.nombre && !r.es_insumo);
  mergeCatalogo(mapped);
  return mapped;
}

async function actualizarSugerenciasInput() {
  const txt = refs.buscarInput.value.trim();
  if (!txt) {
    ocultarSugerencias();
    renderAccesosRapidos();
    return;
  }
  renderAccesosRapidos();
  const local = construirListaCoincidencias(txt, 8);
  renderSugerencias(local);
  if (txt.length < 2 || local.length >= 8) return;
  const seq = ++state.secuenciaBusqueda;
  const rem = await buscarProductosRemoto(txt, 20).catch(() => []);
  if (seq !== state.secuenciaBusqueda) return;
  const seen = new Set();
  const merge = [];
  for (const p of [...local, ...rem]) {
    if (!p?.id || seen.has(p.id)) continue;
    seen.add(p.id);
    merge.push(p);
  }
  renderSugerencias(merge.slice(0, 10));
}

function getProductoById(id) {
  return state.catalogo.get(toInt(id, 0)) || null;
}

function aplicarOrdenLocal(items, ordenIds = []) {
  if (!Array.isArray(ordenIds) || !ordenIds.length) return [...items];
  const map = new Map();
  ordenIds.forEach((id, idx) => { const n = toInt(id, 0); if (n > 0 && !map.has(n)) map.set(n, idx); });
  return [...items].sort((a, b) => {
    const ai = map.has(a.id) ? map.get(a.id) : Number.MAX_SAFE_INTEGER;
    const bi = map.has(b.id) ? map.get(b.id) : Number.MAX_SAFE_INTEGER;
    if (ai !== bi) return ai - bi;
    return toInt(a.orden_venta_medio, 0) - toInt(b.orden_venta_medio, 0) || String(a.nombre).localeCompare(String(b.nombre), "es");
  });
}

function keyOrdenProductos(catId) {
  return `${STORAGE_KEYS.ordenProductosPrefix}${toInt(catId, 0)}`;
}

async function cargarPermisos() {
  try {
    const res = await fetch("/api/permisos/me", {
      credentials: "include",
      cache: "no-store",
      headers: { "Cache-Control": "no-cache" }
    });
    const data = await safeJson(res, {});
    if (!res.ok) throw new Error(data.error || "No se pudo cargar permisos");
    state.permisos = data || {};
  } catch (err) {
    state.permisos = { ...PERMISOS_DEFAULT };
    console.warn("Permisos fallback:", err?.message || err);
  }

  tipoPedidoCatalog.visible = POS_SIN_TIPO_PEDIDO
    ? false
    : state.permisos?.permisos_terminal?.mostrar_tipo_pedido !== false;
  actualizarVisibilidadTipoPedidoVenta();
}

async function cargarCotizacion() {
  try {
    const res = await fetch("/api/cotizacion/hoy");
    const data = await safeJson(res, {});
    if (!res.ok) throw new Error(data.error || "No se pudo cargar cotizacion");
    state.cotizacion.brl = toNumber(data.brl, 0);
    state.cotizacion.usd = toNumber(data.usd, 0);
  } catch {
    state.cotizacion.brl = 0;
    state.cotizacion.usd = 0;
  } finally {
    actualizarTotales();
  }
}

function aplicarPermisosUI() {
  if (!tienePermiso("venta_rapida_ver")) {
    mostrarMensaje("Sin permiso para usar VentaMedio", "error");
    setTimeout(() => { window.location.href = "/home.html"; }, 900);
    return false;
  }
  const puedeNueva = tienePermiso("venta_rapida_nueva");
  refs.buscarInput.disabled = !puedeNueva;
  refs.rapidosGrid.style.pointerEvents = puedeNueva ? "" : "none";
  refs.rapidosGrid.style.opacity = puedeNueva ? "" : "0.75";
  refs.cancelarBtn.disabled = !tienePermiso("venta_rapida_cancelar");
  refs.cobrarBtn.disabled = !tienePermiso("venta_rapida_efectivizar");
  return true;
}

function getOperacionSeleccionada() {
  if (!state.operacionSeleccionadaId) return null;
  return state.operaciones.find((op) => toInt(op.id, 0) === toInt(state.operacionSeleccionadaId, 0)) || null;
}

function syncOperacionUI() {
  const op = getOperacionSeleccionada();
  refs.operacionCodigo.value = op ? getOperacionCodigoVisibleVenta(op) : "";
  refs.operacionNombre.value = op ? String(op.descripcion || "") : "";
}

function formaPagoDefaultId() {
  const activas = (state.formasPago || []).filter((row) => row?.activo !== false);
  if (!activas.length) return 0;
  const contado = activas.find((row) => !formaPagoEsCredito(row));
  return toInt((contado || activas[0])?.id, 0);
}

function setFormaPagoSeleccionadaId(formaPagoId, { persist = true, syncPedido = true } = {}) {
  const id = toInt(formaPagoId, 0);
  const fp = state.formasPago.find((row) => toInt(row?.id, 0) === id) || null;
  if (!fp) return false;

  state.formaPagoSeleccionadaId = id;
  if (refs.formaPago) refs.formaPago.value = String(id);
  if (persist) localStorage.setItem(STORAGE_KEYS.formaPago, String(id));

  if (syncPedido) {
    const actual = getOperacionSeleccionada();
    if (actual?.id && !operacionCompatibleConVentaMedio(actual, { showMessage: true })) {
      const porForma = operacionDefaultPorMetodoPagoVenta();
      const compat = state.operaciones.find((op) => operacionCompatibleConVentaMedio(op, { showMessage: false }));
      const objetivo = porForma?.id || compat?.id || 0;
      if (objetivo > 0) {
        setOperacionSeleccionadaId(objetivo, { persist: true, syncPedido: true, showIncompatibilityMessage: false });
      }
    } else {
      syncPedidoDesdeCabecera();
    }
  }

  return true;
}

function renderFormasPagoSelect() {
  if (!refs.formaPago) return;
  refs.formaPago.innerHTML = "";

  const activas = (state.formasPago || []).filter((row) => row?.activo !== false);
  if (!activas.length) {
    refs.formaPago.innerHTML = `<option value="">Sin formas de pago</option>`;
    state.formaPagoSeleccionadaId = null;
    return;
  }

  for (const fp of activas) {
    const opt = document.createElement("option");
    opt.value = String(fp.id);
    const cuotas = Math.max(1, toInt(fp.cuotas ?? fp.cantidad_cuotas, 1));
    const dias = Math.max(0, toInt(fp.dias_intervalo, 0));
    const detalle = cuotas > 1
      ? `${cuotas} cuotas / ${dias} dias`
      : (dias > 0 ? `1 cuota / ${dias} dias` : "Contado");
    opt.textContent = `${fp.descripcion} (${detalle})`;
    refs.formaPago.appendChild(opt);
  }

  const saved = toInt(localStorage.getItem(STORAGE_KEYS.formaPago), 0);
  const defaultId = formaPagoDefaultId();
  const selected = saved > 0 ? saved : defaultId;
  if (!setFormaPagoSeleccionadaId(selected, { persist: false, syncPedido: false })) {
    setFormaPagoSeleccionadaId(defaultId, { persist: false, syncPedido: false });
  }
}

async function cargarFormasPago() {
  try {
    const res = await fetch("/api/forma-pago", { credentials: "include" });
    const data = await safeJson(res, []);
    if (!res.ok || !Array.isArray(data)) throw new Error("No se pudieron cargar formas de pago");

    state.formasPago = data.map((row) => ({
      id: toInt(row.id, 0),
      codigo: toInt(row.codigo, 0),
      descripcion: String(row.descripcion || "").trim(),
      cuotas: Math.max(1, toInt(row.cuotas ?? row.cantidad_cuotas, 1)),
      dias_intervalo: Math.max(0, toInt(row.dias_intervalo, 0)),
      activo: row.activo !== false
    })).filter((row) => row.id > 0 && row.descripcion);
  } catch (err) {
    console.warn("Formas pago fallback:", err?.message || err);
    state.formasPago = [{
      id: 1,
      codigo: 1,
      descripcion: "CONTADO",
      cuotas: 1,
      dias_intervalo: 0,
      activo: true
    }];
  } finally {
    renderFormasPagoSelect();
  }
}

function operacionCompatibleConVentaMedio(op, { showMessage = true } = {}) {
  if (!op?.id) return false;
  const pagoEsCredito = formaPagoSeleccionadaEsCredito();
  if (!pagoEsCredito && op.requiere_credito === true) {
    if (showMessage) {
      mostrarMensaje("La operacion seleccionada requiere credito y no es compatible con la forma de pago actual", "error");
    }
    return false;
  }
  if (pagoEsCredito && op.permite_credito === false) {
    if (showMessage) {
      mostrarMensaje("La operacion seleccionada no permite una forma de pago a credito", "error");
    }
    return false;
  }
  return true;
}

function formaPagoCompatibleConOperacion(op, fp) {
  if (!op?.id || !fp?.id) return false;
  const esCredito = formaPagoEsCredito(fp);
  if (op.requiere_credito === true && !esCredito) return false;
  if (op.permite_credito === false && esCredito) return false;
  return true;
}

function obtenerFormaPagoCompatibleParaOperacion(op) {
  const activas = (state.formasPago || []).filter((row) => row?.activo !== false);
  if (!activas.length) return null;

  const actual = getFormaPagoSeleccionada();
  if (formaPagoCompatibleConOperacion(op, actual)) return actual;

  if (op?.requiere_credito === true) {
    return activas.find((row) => formaPagoEsCredito(row)) || null;
  }
  if (op?.permite_credito === false) {
    return activas.find((row) => !formaPagoEsCredito(row)) || null;
  }
  return activas[0] || null;
}

function setOperacionSeleccionadaId(
  operacionId,
  {
    persist = true,
    syncPedido = true,
    allowIncompatible = false,
    showIncompatibilityMessage = true,
    adjustFormaPago = true
  } = {}
) {
  const id = toInt(operacionId, 0);
  const op = state.operaciones.find((row) => toInt(row.id, 0) === id) || null;
  if (!op) return false;
  if (!allowIncompatible && !operacionCompatibleConVentaMedio(op, { showMessage: false })) {
    if (adjustFormaPago) {
      const sugerida = obtenerFormaPagoCompatibleParaOperacion(op);
      const sugeridaId = toInt(sugerida?.id, 0);
      if (sugeridaId > 0 && sugeridaId !== toInt(state.formaPagoSeleccionadaId, 0)) {
        setFormaPagoSeleccionadaId(sugeridaId, { persist: true, syncPedido: false });
      }
    }
    if (!operacionCompatibleConVentaMedio(op, { showMessage: false })) {
      if (showIncompatibilityMessage) {
        if (op.requiere_credito === true) {
          mostrarMensaje("Operacion a credito: cambie Forma de Pago a una opcion con dias/cuotas", "info");
        } else if (op.permite_credito === false) {
          mostrarMensaje("Operacion de contado: seleccione una Forma de Pago contado", "info");
        } else {
          mostrarMensaje("Operacion no compatible con la Forma de Pago seleccionada", "info");
        }
      }
      refs.formaPago?.focus();
      return false;
    }
  }

  state.operacionSeleccionadaId = id;
  state.operacionSeleccionada = op;
  refs.operacionSelect.value = String(id);
  if (persist) localStorage.setItem(STORAGE_KEYS.operacion, String(id));
  syncOperacionUI();
  if (syncPedido) syncPedidoDesdeCabecera();
  return true;
}

function renderOperacionesSelect() {
  refs.operacionSelect.innerHTML = "";
  const ops = state.operaciones.length ? state.operaciones : [{ id: 1, descripcion: "VENTA" }];
  ops.forEach((op) => {
    const o = document.createElement("option");
    o.value = String(op.id);
    o.textContent = `${getOperacionCodigoVisibleVenta(op)} - ${op.descripcion}`;
    refs.operacionSelect.appendChild(o);
  });
  const guardada = toInt(localStorage.getItem(STORAGE_KEYS.operacion), 0);
  const defaultPorMetodo = operacionDefaultPorMetodoPagoVenta();
  const defaultCompat = ops.find((op) => operacionCompatibleConVentaMedio(op, { showMessage: false }));
  const selected = guardada > 0 ? guardada : toInt(defaultPorMetodo?.id || defaultCompat?.id || ops[0]?.id, 1);
  if (!setOperacionSeleccionadaId(selected, { persist: false, syncPedido: false })) {
    if (defaultPorMetodo?.id) {
      setOperacionSeleccionadaId(defaultPorMetodo.id, { persist: false, syncPedido: false });
    } else if (defaultCompat?.id) {
      setOperacionSeleccionadaId(defaultCompat.id, { persist: false, syncPedido: false });
    } else {
      limpiarOperacionSeleccionadaVenta();
      syncOperacionUI();
    }
  }
}

async function cargarOperaciones() {
  try {
    const res = await fetch("/api/operacion", { credentials: "include" });
    const data = await safeJson(res, []);
    if (!res.ok || !Array.isArray(data)) throw new Error("No se pudieron cargar operaciones");
    const activos = data.filter((op) => op?.activo !== false);
    const ventas = activos.filter((op) => String(op?.tipo || "").toUpperCase() === "S");
    const base = (ventas.length ? ventas : activos)
      .map((op) => ({
        id: toInt(op.id, 0),
        codigo: toInt(op.codigo, 0),
        descripcion: String(op.descripcion || op.codigo || `Operacion ${op.id}`),
        tipo: String(op.tipo || "").toUpperCase(),
        afecta_stock: toBool(op.afecta_stock),
        requiere_confirmacion: toBool(op.requiere_confirmacion),
        permite_credito: toBool(op.permite_credito),
        requiere_credito: toBool(op.requiere_credito),
        genera_financiero: toBool(op.genera_financiero),
        activo: op.activo !== false
      }))
      .filter((op) => op.id > 0);
    state.operaciones = base;
  } catch {
    state.operaciones = [{
      id: 1,
      codigo: 1,
      descripcion: "VENTA",
      tipo: "S",
      afecta_stock: true,
      requiere_confirmacion: false,
      permite_credito: false,
      requiere_credito: false,
      genera_financiero: true,
      activo: true
    }];
  } finally {
    renderOperacionesSelect();
  }
}

async function cargarCategorias() {
  state.cargandoCategorias = true;
  renderAccesosRapidos();
  try {
    const res = await fetch("/api/categorias/venta-medio");
    const data = await safeJson(res, []);
    if (!res.ok || !Array.isArray(data)) throw new Error("No se pudieron cargar categorias");
    const base = data.map((r) => ({ id: toInt(r.id, 0), nombre: String(r.nombre || "").trim(), orden_venta_medio: toInt(r.orden_venta_medio, 0) })).filter((c) => c.id && c.nombre);
    state.categorias = aplicarOrdenLocal(base, getStorageJson(STORAGE_KEYS.ordenCategorias, []));
  } catch (err) {
    state.categorias = [];
    mostrarMensaje("No se pudieron cargar categorias", "error");
    console.error(err);
  } finally {
    state.cargandoCategorias = false;
    renderAccesosRapidos();
  }
}

async function cargarProductosCategoria(categoriaId, force = false) {
  const id = toInt(categoriaId, 0);
  if (!id) return [];
  if (!force && state.productosPorCategoria.has(id)) return state.productosPorCategoria.get(id);
  state.cargandoProductos = true;
  renderAccesosRapidos();
  try {
    const res = await fetch(`/api/productos/venta-medio/${id}`);
    const data = await safeJson(res, []);
    if (!res.ok || !Array.isArray(data)) throw new Error("No se pudieron cargar productos");
    const base = data.map((r) => mapProducto(r, id)).filter((p) => p.id && p.nombre && !p.es_insumo);
    const productos = aplicarOrdenLocal(base, getStorageJson(keyOrdenProductos(id), []));
    state.productosPorCategoria.set(id, productos);
    mergeCatalogo(productos);
    return productos;
  } catch (err) {
    state.productosPorCategoria.set(id, []);
    mostrarMensaje("No se pudieron cargar productos", "error");
    console.error(err);
    return [];
  } finally {
    state.cargandoProductos = false;
    renderAccesosRapidos();
  }
}

async function abrirCategoria(categoriaId) {
  const id = toInt(categoriaId, 0);
  if (!id) return;
  const cat = state.categorias.find((c) => c.id === id);
  state.categoriaActivaId = id;
  state.categoriaActivaNombre = cat?.nombre || `ID ${id}`;
  await cargarProductosCategoria(id);
  setVistaCategoriasProductos(false, true);
  renderAccesosRapidos();
}

function volverACategorias() {
  state.categoriaActivaId = null;
  state.categoriaActivaNombre = "";
  setVistaCategoriasProductos(true, false);
  renderAccesosRapidos();
}

function validarMostrar(e) {
  if (!refs.showCategorias.checked && !refs.showProductos.checked) {
    if (e?.target === refs.showCategorias) refs.showProductos.checked = true;
    else refs.showCategorias.checked = true;
  }
  if (!refs.showCategorias.checked && refs.showProductos.checked && !state.categoriaActivaId) {
    refs.showCategorias.checked = true;
    mostrarMensaje("Seleccione una categoria para ver productos", "info");
  }
  state.showCategorias = refs.showCategorias.checked;
  state.showProductos = refs.showProductos.checked;
  renderAccesosRapidos();
}

function limpiarDragVisual() {
  if (drag.sourceTile) drag.sourceTile.classList.remove("vm-dragging");
  if (drag.targetTile) drag.targetTile.classList.remove("vm-drop-target");
  drag.kind = "";
  drag.sourceId = 0;
  drag.targetId = 0;
  drag.sourceTile = null;
  drag.targetTile = null;
}

function setDropTarget(tile) {
  if (drag.targetTile && drag.targetTile !== tile) drag.targetTile.classList.remove("vm-drop-target");
  drag.targetTile = tile;
  if (tile) {
    tile.classList.add("vm-drop-target");
    drag.targetId = toInt(tile.dataset.id, 0);
  } else {
    drag.targetId = 0;
  }
}

function puedeReordenar(kind) {
  if (normalizarTexto(refs.buscarInput.value)) {
    mostrarMensaje("Limpie la busqueda para ordenar", "info");
    return false;
  }
  if (kind === "producto" && !state.categoriaActivaId) {
    mostrarMensaje("Seleccione una categoria para ordenar productos", "info");
    return false;
  }
  return kind === "categoria" || kind === "producto";
}

function moverEnLista(lista, sourceId, targetId) {
  const from = lista.findIndex((x) => toInt(x.id, 0) === toInt(sourceId, 0));
  const to = lista.findIndex((x) => toInt(x.id, 0) === toInt(targetId, 0));
  if (from < 0 || to < 0 || from === to) return false;
  const [m] = lista.splice(from, 1);
  lista.splice(to, 0, m);
  return true;
}

async function persistirOrdenCategorias() {
  const payload = state.categorias.map((c, i) => ({ id: c.id, orden: i + 1 }));
  try {
    const res = await fetch("/api/categorias/venta-medio/orden", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (!res.ok) throw new Error("No se pudo guardar");
    localStorage.removeItem(STORAGE_KEYS.ordenCategorias);
  } catch {
    setStorageJson(STORAGE_KEYS.ordenCategorias, state.categorias.map((c) => c.id));
    mostrarMensaje("Orden guardado localmente", "info");
  }
}

async function persistirOrdenProductos(catId) {
  const id = toInt(catId, 0);
  if (!id) return;
  const lista = state.productosPorCategoria.get(id) || [];
  const payload = { categoria_id: id, orden: lista.map((p, i) => ({ id: p.id, orden: i + 1 })) };
  try {
    const res = await fetch("/api/productos/venta-medio/orden", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (!res.ok) throw new Error("No se pudo guardar");
    localStorage.removeItem(keyOrdenProductos(id));
  } catch {
    setStorageJson(keyOrdenProductos(id), lista.map((p) => p.id));
    mostrarMensaje("Orden guardado localmente", "info");
  }
}

async function aplicarReorden(kind, sourceId, targetId) {
  if (!sourceId || !targetId || sourceId === targetId) return;
  if (kind === "categoria") {
    if (!moverEnLista(state.categorias, sourceId, targetId)) return;
    renderAccesosRapidos();
    await persistirOrdenCategorias();
    return;
  }
  const cat = toInt(state.categoriaActivaId, 0);
  if (!cat) return;
  const lista = state.productosPorCategoria.get(cat) || [];
  if (!moverEnLista(lista, sourceId, targetId)) return;
  state.productosPorCategoria.set(cat, lista);
  renderAccesosRapidos();
  await persistirOrdenProductos(cat);
}

function setMetodoPago(metodo) {
  state.metodoPago = metodo;
  refs.metodos.forEach((btn) => btn.classList.toggle("activo", btn.dataset.method === metodo));

  const actual = getOperacionSeleccionada();
  if (actual?.id && !operacionCompatibleConVentaMedio(actual, { showMessage: true })) {
    const porMetodo = operacionDefaultPorMetodoPagoVenta();
    if (porMetodo?.id) {
      setOperacionSeleccionadaId(porMetodo.id, { persist: true, syncPedido: true });
    } else {
      limpiarOperacionSeleccionadaVenta();
      syncOperacionUI();
    }
  }
}

async function cargarVendedorPorCodigo() {
  const codigo = toInt(refs.vendedorCodigo.value, 0);
  if (!codigo) return;
  const res = await fetch(`/api/venta/vendedores/${codigo}`);
  const data = await safeJson(res, {});
  if (!res.ok || !data?.id) throw new Error(data?.error || "No se encontro vendedor");
  state.pedido.vendedor_id = toInt(data.id, 1);
  state.pedido.vendedor_nombre = String(data.nombre || "").trim();
  refs.vendedorCodigo.value = String(state.pedido.vendedor_id);
  refs.vendedorNombre.value = state.pedido.vendedor_nombre;
}

async function cargarClientePorCodigo() {
  const codigo = toInt(refs.clienteCodigo.value, 0);
  if (!codigo) return;
  const res = await fetch(`/api/venta/clientes/${codigo}`);
  const data = await safeJson(res, {});
  if (!res.ok || !data?.id) throw new Error(data?.error || "No se encontro cliente");
  state.pedido.cliente_id = toInt(data.id, 1);
  state.pedido.cliente_nombre = String(data.nombre || "Ocasional").trim();
  refs.clienteCodigo.value = String(state.pedido.cliente_id);
  refs.clienteNombre.value = state.pedido.cliente_nombre;
}

async function cargarDefaultsCabecera() {
  try {
    const rv = await fetch("/api/venta/vendedores/1");
    const vendedor = await safeJson(rv, {});
    if (rv.ok && vendedor?.id) {
      state.pedido.vendedor_id = toInt(vendedor.id, 1);
      state.pedido.vendedor_nombre = String(vendedor.nombre || "").trim();
    }
  } catch { /* noop */ }
  try {
    const rc = await fetch("/api/venta/clientes/1");
    const cliente = await safeJson(rc, {});
    if (rc.ok && cliente?.id) {
      state.pedido.cliente_id = toInt(cliente.id, 1);
      state.pedido.cliente_nombre = String(cliente.nombre || "Ocasional").trim();
    }
  } catch { /* noop */ }
  setCabeceraFromPedido();
}

async function guardarCabeceraEnVentaActual() {
  if (!state.pedido.id) return;
  syncPedidoDesdeCabecera();
  const baseHeaders = { "Content-Type": "application/json" };
  const requests = [
    fetch("/api/venta/vendedor", { method: "POST", headers: baseHeaders, body: JSON.stringify({ venta_id: state.pedido.id, vendedor_id: state.pedido.vendedor_id, vendedor_nombre: state.pedido.vendedor_nombre }) }),
    fetch("/api/venta/cliente", { method: "POST", headers: baseHeaders, body: JSON.stringify({ venta_id: state.pedido.id, cliente_id: state.pedido.cliente_id, cliente_nombre: state.pedido.cliente_nombre }) }),
    fetch("/api/venta/operacion", { method: "POST", headers: baseHeaders, body: JSON.stringify({ venta_id: state.pedido.id, tipo_operacion_id: state.operacionSeleccionadaId }) })
  ];

  if (tipoPedidoVisibleVenta()) {
    requests.push(
      fetch("/api/venta/tipo-pedido", { method: "POST", headers: baseHeaders, body: JSON.stringify({ venta_id: state.pedido.id, tipo_pedido_id: state.pedido.tipo_pedido_id }) })
    );
  }

  await Promise.allSettled(requests);
}

async function asegurarPedidoAbierto() {
  if (state.pedido.id) return true;
  if (!tienePermiso("venta_rapida_nueva")) {
    mostrarMensaje("No tiene permiso para crear pedidos", "error");
    return false;
  }
  syncPedidoDesdeCabecera();
  state.pedido.tipo_pedido_id = tipoPedidoVisibleVenta()
    ? (getTipoPedidoSeleccionadoVenta() || getTipoPedidoDefaultVenta())
    : 0;
  if (tipoPedidoVisibleVenta() && !state.pedido.tipo_pedido_id) {
    throw new Error("No hay tipo de pedido activo disponible");
  }
  const payload = {
    vendedor_id: state.pedido.vendedor_id || 1,
    tipo_operacion_id: state.operacionSeleccionadaId || null
  };
  if (tipoPedidoVisibleVenta()) {
    payload.tipo_pedido_id = state.pedido.tipo_pedido_id;
  }
  const res = await fetch("/api/venta/nuevo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  const data = await safeJson(res, {});
  if (!res.ok || !data?.id) throw new Error(data?.error || "No se pudo crear pedido");
  state.pedido.id = toInt(data.id, 0);
  state.pedido.numero = toInt(data.numero, state.pedido.id);
  state.pedido.estado = "PENDIENTE";
  setCabeceraFromPedido();
  await guardarCabeceraEnVentaActual();
  return true;
}

async function incrementarItemExistente(item) {
  const cantidad = Math.max(1, toInt(item.cantidad, 1) + 1);
  const conversion = buildPrecioMultimoneda(
    Math.max(0, toNumber(item.precio_moneda_origen, toNumber(item.precio, 0))),
    normalizarMonedaId(item.precio_moneda_id, MONEDA_IDS.PYG)
  );
  const precioGs = conversion.precio_gs != null
    ? conversion.precio_gs
    : Math.max(0, toNumber(item.precio, 0));
  const res = await fetch(`/api/venta/editar-item/${item.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      cantidad,
      precio: precioGs,
      observacion: item.observacion || "",
      ...conversion
    })
  });
  const data = await safeJson(res, {});
  if (!res.ok) throw new Error(data?.error || "No se pudo actualizar item");
  item.cantidad = cantidad;
  item.precio = precioGs;
  item.precio_moneda_id = conversion.precio_moneda_id;
  item.precio_moneda_origen = conversion.precio_moneda_origen;
  item.precio_gs = conversion.precio_gs;
  item.precio_brl = conversion.precio_brl;
  item.precio_usd = conversion.precio_usd;
}

async function insertarNuevoItem(producto) {
  const conversion = buildPrecioMultimoneda(Math.max(0, toNumber(producto.precio, 0)), MONEDA_IDS.PYG);
  const precioGs = conversion.precio_gs != null ? conversion.precio_gs : Math.max(0, toNumber(producto.precio, 0));
  const res = await fetch("/api/venta/agregar-item", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      venta_id: state.pedido.id,
      producto_id: producto.id,
      cantidad: 1,
      precio: precioGs,
      ...conversion
    })
  });
  const data = await safeJson(res, {});
  if (!res.ok || data?.error) throw new Error(data?.error || "No se pudo agregar item");
  state.pedido.items.push({
    id: toInt(data.item_id, 0),
    producto_id: producto.id,
    descripcion: producto.nombre,
    cantidad: 1,
    precio: precioGs,
    precio_moneda_id: toInt(data.precio_moneda_id, 0) || conversion.precio_moneda_id,
    precio_moneda_origen: data.precio_moneda_origen == null ? conversion.precio_moneda_origen : toNumber(data.precio_moneda_origen, conversion.precio_moneda_origen),
    precio_gs: data.precio_gs == null ? conversion.precio_gs : toNumber(data.precio_gs, conversion.precio_gs),
    precio_brl: data.precio_brl == null ? conversion.precio_brl : toNumber(data.precio_brl, conversion.precio_brl || 0),
    precio_usd: data.precio_usd == null ? conversion.precio_usd : toNumber(data.precio_usd, conversion.precio_usd || 0),
    observacion: ""
  });
}

async function agregarProductoAlPedido(producto) {
  if (!producto?.id) return;
  if (state.ventaBloqueada) {
    mostrarMensaje("La venta ya fue cobrada", "error");
    return;
  }
  try {
    const ok = await asegurarPedidoAbierto();
    if (!ok) return;
    const existente = state.pedido.items.find((it) => toInt(it.producto_id, 0) === toInt(producto.id, 0));
    if (existente?.id) await incrementarItemExistente(existente);
    else await insertarNuevoItem(producto);
    state.itemSeleccionadoId = null;
    renderPedido();
  } catch (err) {
    mostrarMensaje(err.message || "No se pudo agregar producto", "error");
  }
}

async function guardarEdicionItem() {
  const itemId = toInt(state.itemEditandoId, 0);
  if (!itemId) return;
  const item = state.pedido.items.find((it) => toInt(it.id, 0) === itemId);
  if (!item) return;
  const cantidad = Math.max(1, toInt(refs.editCantidad.value, toInt(item.cantidad, 1)));
  const precio = Math.max(0, toNumber(refs.editPrecio.value, toNumber(item.precio, 0)));
  const observacion = String(refs.editObservacion.value || "").trim();
  const conversion = buildPrecioMultimoneda(precio, MONEDA_IDS.PYG);
  const precioGs = conversion.precio_gs != null ? conversion.precio_gs : precio;
  try {
    const res = await fetch(`/api/venta/editar-item/${itemId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cantidad,
        precio: precioGs,
        observacion,
        ...conversion
      })
    });
    const data = await safeJson(res, {});
    if (!res.ok) throw new Error(data?.error || "No se pudo editar item");
    item.cantidad = cantidad;
    item.precio = precioGs;
    item.precio_moneda_id = conversion.precio_moneda_id;
    item.precio_moneda_origen = conversion.precio_moneda_origen;
    item.precio_gs = conversion.precio_gs;
    item.precio_brl = conversion.precio_brl;
    item.precio_usd = conversion.precio_usd;
    item.observacion = observacion;
    renderPedido();
    cerrarEditorItem();
  } catch (err) {
    mostrarMensaje(err.message || "No se pudo guardar item", "error");
  }
}

async function eliminarItemPedido(itemId) {
  const id = toInt(itemId, 0);
  const idx = state.pedido.items.findIndex((it) => toInt(it.id, 0) === id);
  if (idx === -1) return;
  const item = state.pedido.items[idx];
  try {
    if (toInt(item.id, 0) > 0) {
      const res = await fetch(`/api/venta/detalle/${item.id}`, { method: "DELETE" });
      const data = await safeJson(res, {});
      if (!res.ok) throw new Error(data?.error || "No se pudo eliminar item");
    }
    state.pedido.items.splice(idx, 1);
    if (state.itemSeleccionadoId === id) state.itemSeleccionadoId = null;
    if (toInt(state.itemEditandoId, 0) === id) cerrarEditorItem();
    renderPedido();
  } catch (err) {
    mostrarMensaje(err.message || "No se pudo eliminar", "error");
  }
}

async function eliminarSeleccionado() {
  if (!state.pedido.items.length) return;
  if (!state.itemSeleccionadoId) state.itemSeleccionadoId = state.pedido.items[state.pedido.items.length - 1].id;
  await eliminarItemPedido(state.itemSeleccionadoId);
}

function resetPedidoLocal() {
  state.pedido.id = null;
  state.pedido.numero = null;
  state.pedido.estado = "PENDIENTE";
  state.pedido.items = [];
  state.itemSeleccionadoId = null;
  state.itemEditandoId = null;
  state.ventaBloqueada = false;
  state.postCobroPendiente = false;
  refs.pedidoNumero.value = "";
  renderPedido();
  cerrarEditorItem();
}

async function cancelarPedido() {
  if (!state.pedido.id) {
    resetPedidoLocal();
    return;
  }
  if (!tienePermiso("venta_rapida_cancelar")) {
    mostrarMensaje("No tiene permiso para cancelar pedidos", "error");
    return;
  }
  if (!window.confirm("Desea cancelar el pedido actual?")) return;
  try {
    const res = await fetch(`/api/venta/cancelar/${state.pedido.id}`, { method: "POST" });
    const data = await safeJson(res, {});
    if (!res.ok) throw new Error(data?.error || "No se pudo cancelar pedido");
    mostrarMensaje("Pedido cancelado", "ok");
    resetPedidoLocal();
  } catch (err) {
    mostrarMensaje(err.message || "No se pudo cancelar", "error");
  }
}

async function prepararVentaParaCobro() {
  if (!state.pedido.id) throw new Error("No hay pedido para cobrar");
  const res = await fetch(`/api/venta/concluir/${state.pedido.id}`, { method: "POST" });
  const data = await safeJson(res, {});
  if (!res.ok) throw new Error(data?.error || "No se pudo preparar la venta para cobro");
  state.pedido.estado = "CONCLUIDO";
}

function abrirCaja(ventaId) {
  const metodoCaja = normalizarTexto(state.metodoPago) === "transferencia" ? "transferencia" : "efectivo";
  const modoCobro = String(localStorage.getItem("vmModoCobro") || "detallado");
  const url = `/modulos/caja/caja.html?venta_id=${encodeURIComponent(ventaId)}&from=venta_medio&metodo=${encodeURIComponent(metodoCaja)}&modo_cobro=${encodeURIComponent(modoCobro)}`;
  const esCapacitor = typeof window.Capacitor !== "undefined";
  const esVertical = window.matchMedia("(max-width: 1024px) and (orientation: portrait)").matches;
  if (esCapacitor || esVertical) {
    window.location.href = url;
    return;
  }
  const popup = window.open(url, "caja", "width=900,height=700");
  if (!popup) window.location.href = url;
}

function finalizarPostCobroSinFactura() {
  cerrarModal("vmModalConfirmFactura");
  cerrarModal("vmModalFactura");
  state.ventaCobradaSnapshot = null;  // ya no la necesitamos
  resetPedidoLocal();
  mostrarMensaje("Venta finalizada", "ok");
}

function preguntarFacturaPostCobro({ ventaIdGuardada = null } = {}) {
  // Recordamos la venta cobrada por si el usuario decide facturar
  // (despues de resetPedidoLocal el state.pedido.id queda en null)
  if (ventaIdGuardada) state.ventaCobradaParaFacturar = ventaIdGuardada;

  const modo = (state.permisos?.modo_factura || "PREGUNTAR").toString().trim().toUpperCase();
  if (modo === "NUNCA") return;            // ya reseteamos antes — no hace falta nada
  if (modo === "SIEMPRE") { abrirModalFactura(); return; }
  abrirModal("vmModalConfirmFactura");
}

function validarOperacionAntesDeCobrar() {
  const operacion = getOperacionSeleccionada();
  if (!operacion?.id) {
    throw new Error("Seleccione una operación de venta");
  }

  if (operacion.requiere_credito === true) {
    throw new Error("La operación seleccionada es a crédito y no puede cobrarse al contado en Venta Medio");
  }

  if (operacion.genera_financiero === false) {
    throw new Error("La operación seleccionada no genera movimiento financiero/caja");
  }
}

async function cobrarPedido() {
  if (state.cobrando) return;
  if (!tienePermiso("venta_rapida_efectivizar")) {
    mostrarMensaje("No tiene permiso para efectivizar", "error");
    return;
  }
  if (!state.pedido.id || !state.pedido.items.length) {
    mostrarMensaje("Agregue productos antes de cobrar", "error");
    return;
  }
  if (calcularTotalPedido() <= 0) {
    mostrarMensaje("Total invalido para cobrar", "error");
    return;
  }
  try {
    validarOperacionAntesDeCobrar();
  } catch (error) {
    mostrarMensaje(error.message, "error");
    return;
  }
  state.cobrando = true;
  refs.cobrarBtn.disabled = true;
  const original = refs.cobrarBtn.textContent;
  refs.cobrarBtn.textContent = "Abriendo Caja...";
  try {
    // Por defecto es modo detallado. Si vino de cobroRapidoBtn / cobroRapidoTicketBtn
    // ese ya seteo "rapido" o "rapido_ticket" antes de llegar aca.
    if (!localStorage.getItem("vmModoCobro")) {
      localStorage.setItem("vmModoCobro", "detallado");
    }
    await guardarCabeceraEnVentaActual();
    await prepararVentaParaCobro();
    state.postCobroPendiente = true;
    abrirCaja(state.pedido.id);
    mostrarMensaje("Continue el cobro en Caja", "info");
  } catch (err) {
    state.postCobroPendiente = false;
    mostrarMensaje(err.message || "No se pudo abrir flujo de cobro", "error");
  } finally {
    state.cobrando = false;
    refs.cobrarBtn.textContent = original;
    actualizarEstadoAcciones();
  }
}

async function ponerPedidoEnEspera() {
  const id = toInt(state.pedido.id, 0);
  if (!id) {
    mostrarMensaje("No hay pedido activo", "error");
    return;
  }
  try {
    const res = await fetch(`/api/venta/en-espera/${id}`, {
      method: "POST",
      headers: baseHeaders,
      body: JSON.stringify({
        prioridad_espera: 1,
        nota_espera: "En espera desde Venta Medio"
      })
    });
    const data = await safeJson(res, {});
    if (!res.ok || data?.error) throw new Error(data?.error || "No se pudo poner en espera");
    mostrarMensaje("Pedido en espera", "ok");
    resetPedidoLocal();
  } catch (err) {
    mostrarMensaje(err.message || "No se pudo poner en espera", "error");
  }
}

async function cobrarPedidoModo(modo) {
  localStorage.setItem("vmModoCobro", String(modo || "detallado"));
  if (modo === "rapido") {
    await cobrarPedido();
    return;
  }
  if (modo === "rapido_ticket") {
    await cobrarPedido();
    return;
  }
  await cobrarPedido();
}

async function buscarYAgregarDesdeInput() {
  const texto = refs.buscarInput.value.trim();
  if (!texto) return;
  const remotos = await buscarProductosRemoto(texto, 20).catch(() => []);
  const producto = construirListaCoincidencias(texto, 1)[0] || remotos[0] || null;
  if (!producto) {
    mostrarMensaje("Producto no encontrado", "error");
    return;
  }
  await agregarProductoAlPedido(producto);
  limpiarBusquedaDespuesDeAgregar();
}

function obtenerAtajoNumerico(e) {
  if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return 0;
  const key = String(e.key || "");
  if (/^[1-9]$/.test(key)) return toInt(key, 0);
  if (typeof e.code === "string" && /^Numpad[1-9]$/.test(e.code)) return toInt(e.code.replace("Numpad", ""), 0);
  return 0;
}

function esElementoEditable(el) {
  if (!el) return false;
  const tag = String(el.tagName || "").toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || Boolean(el.isContentEditable);
}

async function manejarAtajoRapidos(e) {
  const n = obtenerAtajoNumerico(e);
  if (!n) return false;
  if (document.querySelector(".modal.show")) return false;
  if (esElementoEditable(document.activeElement)) return false;
  const tile = refs.rapidosGrid.querySelector(`.vm-tile[data-shortcut="${n}"]`);
  if (!tile) return false;
  e.preventDefault();
  if (Date.now() < drag.blockClickUntil) return true;
  const kind = String(tile.dataset.kind || "");
  const id = toInt(tile.dataset.id, 0);
  if (!id) return true;
  if (kind === "categoria") {
    await abrirCategoria(id);
    return true;
  }
  if (kind === "producto") {
    const p = getProductoById(id);
    if (!p || p.es_insumo) return true;
    await agregarProductoAlPedido(p);
    return true;
  }
  return false;
}

function cargarPedidoDesdePayload(data) {
  state.pedido.id = toInt(data.id, 0);
  state.pedido.numero = toInt(data.numero, state.pedido.id || 0) || null;
  state.pedido.estado = String(data.estado || "PENDIENTE");
  const tipoPedidoPayload = toInt(data.tipo_pedido_id, 0);
  state.pedido.tipo_pedido_id = aplicarTipoPedidoEnSelectVenta(
    tipoPedidoPayload || state.pedido.tipo_pedido_id || getTipoPedidoDefaultVenta()
  );
  const opId = toInt(data.tipo_operacion_id, 0);
  if (opId > 0) {
    if (!setOperacionSeleccionadaId(opId, { persist: true, syncPedido: false, allowIncompatible: true })) {
      const fallbackOperacion = {
        id: opId,
        codigo: toInt(data.operacion_codigo, opId),
        descripcion: String(data.operacion_descripcion || `Operacion ${opId}`),
        tipo: String(data.operacion_tipo || "S").toUpperCase(),
        afecta_stock: true,
        requiere_confirmacion: false,
        permite_credito: Boolean(data.operacion_permite_credito),
        requiere_credito: Boolean(data.operacion_requiere_credito),
        genera_financiero: true,
        activo: true
      };
      state.operaciones.push(fallbackOperacion);
      renderOperacionesSelect();
      setOperacionSeleccionadaId(opId, { persist: true, syncPedido: false, allowIncompatible: true });
    }
  }
  state.pedido.vendedor_id = toInt(data.vendedor_id, state.pedido.vendedor_id || 1) || 1;
  state.pedido.vendedor_nombre = String(data.vendedor_nombre || state.pedido.vendedor_nombre || "");
  state.pedido.cliente_id = toInt(data.cliente_id, state.pedido.cliente_id || 1) || 1;
  state.pedido.cliente_nombre = String(data.cliente_nombre || state.pedido.cliente_nombre || "Ocasional");
  state.pedido.items = (data.items || data.detalles || []).map(mapItem);
  setCabeceraFromPedido();
  renderPedido();
}

async function buscarPedidoPorNumero() {
  const numero = toInt(refs.pedidoNumero.value, 0);
  if (!numero) {
    mostrarMensaje("Ingrese numero de pedido", "info");
    return;
  }
  try {
    const res = await fetch(`/api/venta/buscar/${numero}`);
    const data = await safeJson(res, {});
    if (!res.ok || !data?.id) throw new Error(data?.error || "Pedido no encontrado");
    cargarPedidoDesdePayload(data);
    mostrarMensaje("Pedido cargado", "ok");
  } catch (err) {
    mostrarMensaje(err.message || "No se pudo buscar pedido", "error");
  }
}

async function cargarVentaPorId(ventaId) {
  const id = toInt(ventaId, 0);
  if (!id) return;
  try {
    const res = await fetch(`/api/venta/${id}`);
    const data = await safeJson(res, {});
    if (!res.ok || !data?.id) throw new Error(data?.error || "Venta no encontrada");
    const numero = toInt(data.numero, 0);
    if (numero > 0) {
      refs.pedidoNumero.value = String(numero);
      await buscarPedidoPorNumero();
      return;
    }
    cargarPedidoDesdePayload(data);
    mostrarMensaje("Pedido cargado", "ok");
  } catch (err) {
    mostrarMensaje(err.message || "No se pudo cargar venta", "error");
  }
}

async function consumirVendedorSeleccionado() {
  const raw = localStorage.getItem(STORAGE_KEYS.vendedor);
  if (!raw) return false;
  localStorage.removeItem(STORAGE_KEYS.vendedor);
  try {
    const vendedor = JSON.parse(raw);
    if (!vendedor?.id) return false;
    refs.vendedorCodigo.value = String(vendedor.id);
    refs.vendedorNombre.value = String(vendedor.nombre || "");
    syncPedidoDesdeCabecera();
    await guardarCabeceraEnVentaActual();
    return true;
  } catch {
    return false;
  }
}

async function consumirClienteSeleccionado() {
  const raw = localStorage.getItem(STORAGE_KEYS.cliente);
  if (!raw) return false;
  localStorage.removeItem(STORAGE_KEYS.cliente);
  try {
    const cliente = JSON.parse(raw);
    if (!cliente?.id) return false;
    refs.clienteCodigo.value = String(cliente.id);
    refs.clienteNombre.value = String(cliente.nombre || "Ocasional");
    syncPedidoDesdeCabecera();
    await guardarCabeceraEnVentaActual();
    return true;
  } catch {
    return false;
  }
}

async function consumirOperacionSeleccionada() {
  const raw = localStorage.getItem(STORAGE_KEYS.operacionLookup);
  if (!raw) return false;
  localStorage.removeItem(STORAGE_KEYS.operacionLookup);

  try {
    const operacion = JSON.parse(raw);
    const operacionId = toInt(operacion?.id, 0);
    if (!operacionId) return false;
    if (!setOperacionSeleccionadaId(operacionId, { persist: true, syncPedido: true })) return false;
    await guardarCabeceraEnVentaActual();
    return true;
  } catch {
    return false;
  }
}

async function consumirMovimientoSeleccionado() {
  const raw = localStorage.getItem(STORAGE_KEYS.movimientoVentaMedio);
  if (!raw) return false;
  localStorage.removeItem(STORAGE_KEYS.movimientoVentaMedio);
  try {
    const payload = JSON.parse(raw);
    const id = toInt(payload?.id, 0);
    const numero = toInt(payload?.numero, 0);
    if (id > 0) { await cargarVentaPorId(id); return true; }
    if (numero > 0) { refs.pedidoNumero.value = String(numero); await buscarPedidoPorNumero(); return true; }
    return false;
  } catch {
    return false;
  }
}

async function cargarOperacionPorCodigo({ autocompletarPorMetodoSiVacio = true } = {}) {
  const codigoRaw = String(refs.operacionCodigo.value || "").trim();
  if (!codigoRaw) {
    if (!autocompletarPorMetodoSiVacio) return false;
    const porMetodo = operacionDefaultPorMetodoPagoVenta();
    if (!porMetodo?.id) return false;
    if (!setOperacionSeleccionadaId(toInt(porMetodo.id, 0), { persist: true, syncPedido: true })) {
      throw new Error("No hay una operacion compatible con la forma de pago seleccionada");
    }
    await guardarCabeceraEnVentaActual();
    return true;
  }

  const local = getOperacionPorCodigoVenta(codigoRaw);
  if (local?.id) {
    if (!setOperacionSeleccionadaId(toInt(local.id, 0), { persist: true, syncPedido: true })) {
      throw new Error("Operacion no compatible con la forma de pago seleccionada");
    }
    await guardarCabeceraEnVentaActual();
    return true;
  }

  const res = await fetch(`/api/operacion/codigo/${encodeURIComponent(codigoRaw)}?tipo=S&activo=1`, { credentials: "include" });
  const data = await safeJson(res, {});
  if (!res.ok || !data?.id) throw new Error(data?.error || "Operacion no encontrada");
  if (!setOperacionSeleccionadaId(toInt(data.id, 0), { persist: true, syncPedido: true })) {
    throw new Error("Operacion no compatible con la forma de pago seleccionada");
  }
  await guardarCabeceraEnVentaActual();
  return true;
}

function vigilarSelectorPorStorage(storageKey, popup, consumerFn) {
  let enProceso = false;
  const timer = setInterval(async () => {
    if (enProceso) return;
    enProceso = true;
    try {
      const consumido = await consumerFn();
      if (consumido) {
        try { popup?.close?.(); } catch { /* noop */ }
        clearInterval(timer);
        return;
      }
      if (!popup || popup.closed) {
        clearInterval(timer);
      }
    } finally {
      enProceso = false;
    }
  }, 220);
}

function abrirSelectorOperacion() {
  localStorage.removeItem(STORAGE_KEYS.operacionLookup);
  const params = new URLSearchParams({
    modo: "seleccion",
    tipo: "S",
    activo: "1",
    from: "venta_medio",
    storage_key: STORAGE_KEYS.operacionLookup
  });
  const search = refs.operacionCodigo.value.trim() || refs.operacionNombre.value.trim();
  if (search) params.set("buscar", search);

  const url = `/modulos/parametros/operacion.html?${params.toString()}`;
  const popup = window.open(url, "seleccionarOperacionVenta", "width=920,height=640");
  if (!popup) {
    mostrarMensaje("Permita ventanas emergentes o cargue operacion por codigo", "info");
    return;
  }
  vigilarSelectorPorStorage(STORAGE_KEYS.operacionLookup, popup, consumirOperacionSeleccionada);
}

function abrirSelectorVendedor() {
  const popup = window.open("/modulos/vendedor/vendedor.html?modo=seleccion", "seleccionarVendedor", "width=1000,height=700");
  if (!popup) { mostrarMensaje("Permita ventanas emergentes o cargue vendedor por codigo", "info"); return; }
  const timer = setInterval(() => { if (!popup || popup.closed) { clearInterval(timer); consumirVendedorSeleccionado(); } }, 250);
}

function abrirSelectorCliente() {
  const popup = window.open("/modulos/cliente/cliente.html?modo=seleccion&from=venta_medio&permitir_alta=1", "seleccionarCliente", "width=1100,height=760");
  if (!popup) { mostrarMensaje("Permita ventanas emergentes o cargue cliente por codigo", "info"); return; }
  const timer = setInterval(() => { if (!popup || popup.closed) { clearInterval(timer); consumirClienteSeleccionado(); } }, 250);
}

function abrirSelectorPedidoMovimiento() {
  const url = "/modulos/movimientoVenta/movimientoVenta.html?modo=seleccion&from=venta_medio";
  const popup = window.open(url, "seleccionarMovimientoVenta", "width=1280,height=820");
  if (!popup) { window.location.href = url; return; }
  const timer = setInterval(() => { if (!popup || popup.closed) { clearInterval(timer); consumirMovimientoSeleccionado(); } }, 250);
}

function manejarCobroConfirmadoDesdeCaja(ventasRaw) {
  const ids = parseVentaIds(ventasRaw);
  if (!toInt(state.pedido.id, 0) && ids.length) {
    state.pedido.id = ids[0];
    state.pedido.numero = state.pedido.numero || ids[0];
  }
  const pedidoId = toInt(state.pedido.id, 0);
  if (!pedidoId) return;
  if (ids.length && !ids.includes(pedidoId)) return;
  state.ventaBloqueada = true;
  state.postCobroPendiente = true;
  mostrarMensaje("Venta cobrada correctamente — listo para nueva venta", "ok");
  const modo = String(localStorage.getItem("vmModoCobro") || "detallado");
  localStorage.removeItem("vmModoCobro");

  if (modo === "rapido") {
    finalizarPostCobroSinFactura();
    return;
  }
  if (modo === "rapido_ticket") {
    fetch("/api/print/venta", {
      method: "POST",
      headers: baseHeaders,
      body: JSON.stringify({ venta_id: state.pedido.id })
    }).finally(() => finalizarPostCobroSinFactura());
    return;
  }

  // Modo "detallado": guardamos un snapshot de la venta cobrada
  // (id + total) antes de resetear. Reseteamos AHORA para liberar la
  // pantalla y permitir nueva venta de inmediato — no esperamos al modal.
  state.ventaCobradaSnapshot = {
    id:    state.pedido.id,
    total: calcularTotalPedido()
  };
  preguntarFacturaPostCobro();
  resetPedidoLocal();
}

window.postCobroDesdeCaja = manejarCobroConfirmadoDesdeCaja;

function consumirPostCobroPendiente() {
  const params = new URLSearchParams(window.location.search);
  const flagURL = params.get("post_cobro");
  const ventaIdURL = params.get("venta_id");
  const flagLS = localStorage.getItem(STORAGE_KEYS.postCobroFlag);
  const ventaIdLS = localStorage.getItem(STORAGE_KEYS.postCobroVentaId);

  let ventaIdCobrada = null;

  if (flagURL === "1" && ventaIdURL) {
    ventaIdCobrada = ventaIdURL;
  } else if (flagLS === "1" && ventaIdLS) {
    ventaIdCobrada = ventaIdLS;
  }

  if (!ventaIdCobrada) return;

  localStorage.removeItem(STORAGE_KEYS.postCobroFlag);
  localStorage.removeItem(STORAGE_KEYS.postCobroVentaId);

  if (flagURL === "1") {
    params.delete("post_cobro");
    const nuevaURL = params.toString()
      ? `${window.location.pathname}?${params.toString()}`
      : window.location.pathname;
    history.replaceState(null, "", nuevaURL);
  }

  manejarCobroConfirmadoDesdeCaja(ventaIdCobrada);
}

function limpiarFormularioFactura() {
  refs.clienteCodigoFactura.value = "";
  refs.rucFacturaInput.value = "";
  refs.nombreFacturaInput.value = "Consumidor Final";
  refs.direccionFacturaInput.value = "";
  refs.ciudadFacturaInput.value = "";
  refs.numeroFacturaPreview.value = "";
}

// Devuelve el id de la venta a facturar — pedido actual O la cobrada
// hace un instante (post-cobro: state.pedido.id ya fue reseteado).
function getVentaIdParaFactura() {
  return toInt(state.pedido.id, 0) || toInt(state.ventaCobradaSnapshot?.id, 0) || 0;
}

function getTotalParaFactura() {
  const totalActual = calcularTotalPedido();
  if (totalActual > 0) return totalActual;
  return Number(state.ventaCobradaSnapshot?.total) || 0;
}

function abrirModalFactura() {
  if (!getVentaIdParaFactura()) { mostrarMensaje("No hay venta activa para facturar", "error"); return; }
  cerrarModal("vmModalConfirmFactura");
  limpiarFormularioFactura();
  refs.totalFacturaPreview.innerText = formatearGs(getTotalParaFactura());
  abrirModal("vmModalFactura");
  fetch("/api/factura/preview-numero")
    .then((r) => safeJson(r, {}))
    .then((d) => { refs.numeroFacturaPreview.value = d.numero || ""; })
    .catch(() => { refs.numeroFacturaPreview.value = ""; });
}

function cerrarModalFactura() {
  limpiarFormularioFactura();
  cerrarModal("vmModalFactura");
  if (state.postCobroPendiente) finalizarPostCobroSinFactura();
}

async function buscarClienteFacturaPorCodigo(codigo) {
  const id = toInt(codigo, 0);
  if (!id) return false;
  try {
    const res = await fetch(`/api/clientes/${id}`);
    const c = await safeJson(res, {});
    if (!res.ok || !c?.id) { mostrarMensaje("Cliente no encontrado", "error"); return false; }
    refs.clienteCodigoFactura.value = String(c.id);
    refs.nombreFacturaInput.value = String(c.nombre || "");
    refs.rucFacturaInput.value = String(c.ruc || "");
    refs.direccionFacturaInput.value = String(c.direccion || "");
    return true;
  } catch {
    mostrarMensaje("Error buscando cliente", "error");
    return false;
  }
}

function abrirBuscadorClienteFactura() {
  const popup = window.open("/modulos/cliente/cliente.html?modo=seleccion", "seleccionarClienteFactura", "width=1100,height=760");
  if (!popup) { mostrarMensaje("Permita ventanas emergentes para buscar cliente", "info"); return; }
  const timer = setInterval(() => {
    if (!popup || popup.closed) {
      clearInterval(timer);
      const raw = localStorage.getItem(STORAGE_KEYS.cliente);
      if (!raw) return;
      localStorage.removeItem(STORAGE_KEYS.cliente);
      try {
        const c = JSON.parse(raw);
        if (!c?.id) return;
        refs.clienteCodigoFactura.value = String(c.id);
        refs.nombreFacturaInput.value = String(c.nombre || "");
        refs.rucFacturaInput.value = String(c.ruc || "");
        refs.direccionFacturaInput.value = String(c.direccion || "");
      } catch { /* noop */ }
    }
  }, 250);
}

async function confirmarFactura() {
  const ventaId = getVentaIdParaFactura();
  if (!ventaId) { mostrarMensaje("No hay venta activa", "error"); return; }
  const ruc = refs.rucFacturaInput.value.trim() || null;
  const nombre = refs.nombreFacturaInput.value.trim();
  const direccion = refs.direccionFacturaInput.value.trim();
  const ciudad = refs.ciudadFacturaInput.value.trim();
  try {
    const resCliente = await fetch("/api/clientes/guardar-o-buscar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ruc, nombre, direccion, ciudad }) });
    const clienteData = await safeJson(resCliente, {});
    if (!resCliente.ok || !clienteData?.id) { mostrarMensaje(clienteData?.error || "Error guardando cliente", "error"); return; }

    const resVentaCliente = await fetch("/api/venta/cliente", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ venta_id: ventaId, cliente_id: clienteData.id, cliente_nombre: clienteData.nombre || "OCASIONAL" }) });
    if (!resVentaCliente.ok) { mostrarMensaje("Error guardando cliente en venta", "error"); return; }

    const res = await fetch(`/api/factura/generar/${ventaId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ruc, nombre, direccion: direccion || null, ciudad: ciudad || null }) });
    const data = await safeJson(res, {});
    if (!res.ok) { mostrarMensaje(data.error || "Error generando factura", "error"); return; }

    const facturaId = toInt(data.id, 0);
    state.postCobroPendiente = false;
    state.ventaBloqueada = false;
    state.ventaCobradaSnapshot = null;  // factura emitida, ya no la necesitamos
    cerrarModal("vmModalFactura");
    resetPedidoLocal();
    if (facturaId > 0) window.location.href = `/modulos/factura/factura_ticket.html?id=${facturaId}`;
    else mostrarMensaje("Factura generada", "ok");
  } catch {
    mostrarMensaje("Error de conexion", "error");
  }
}

function bindDragAndDrop() {
  refs.rapidosGrid.addEventListener("dragstart", (e) => {
    const tile = e.target.closest(".vm-tile");
    if (!tile) return;
    const kind = String(tile.dataset.kind || "");
    const id = toInt(tile.dataset.id, 0);
    if (!id || !puedeReordenar(kind)) { e.preventDefault(); return; }
    drag.kind = kind;
    drag.sourceId = id;
    drag.sourceTile = tile;
    tile.classList.add("vm-dragging");
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", `${kind}:${id}`);
    }
  });

  refs.rapidosGrid.addEventListener("dragover", (e) => {
    if (!drag.kind || !drag.sourceId) return;
    const tile = e.target.closest(".vm-tile");
    if (!tile || String(tile.dataset.kind || "") !== drag.kind) return;
    e.preventDefault();
    setDropTarget(tile);
  });

  refs.rapidosGrid.addEventListener("drop", async (e) => {
    if (!drag.kind || !drag.sourceId) return;
    e.preventDefault();
    const tile = e.target.closest(".vm-tile");
    const targetId = tile ? toInt(tile.dataset.id, 0) : toInt(drag.targetId, 0);
    await aplicarReorden(drag.kind, drag.sourceId, targetId);
    drag.blockClickUntil = Date.now() + 350;
    limpiarDragVisual();
  });

  refs.rapidosGrid.addEventListener("dragend", () => {
    limpiarDragVisual();
  });

  refs.rapidosGrid.addEventListener("touchstart", (e) => {
    const tile = e.target.closest(".vm-tile");
    if (!tile) return;
    const kind = String(tile.dataset.kind || "");
    const id = toInt(tile.dataset.id, 0);
    if (!id || !puedeReordenar(kind)) { drag.touch = null; return; }
    const t = e.changedTouches[0];
    drag.touch = { id: t.identifier, kind, sourceId: id, startX: t.clientX, startY: t.clientY, dragging: false };
    drag.kind = kind;
    drag.sourceId = id;
    drag.sourceTile = tile;
  }, { passive: true });

  refs.rapidosGrid.addEventListener("touchmove", (e) => {
    if (!drag.touch) return;
    const touch = Array.from(e.changedTouches).find((x) => x.identifier === drag.touch.id);
    if (!touch) return;
    const dx = touch.clientX - drag.touch.startX;
    const dy = touch.clientY - drag.touch.startY;
    if (!drag.touch.dragging && Math.hypot(dx, dy) > 8) {
      drag.touch.dragging = true;
      if (drag.sourceTile) drag.sourceTile.classList.add("vm-dragging");
    }
    if (!drag.touch.dragging) return;
    e.preventDefault();
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    const tile = el?.closest?.(".vm-tile") || null;
    if (!tile || String(tile.dataset.kind || "") !== drag.touch.kind) {
      setDropTarget(null);
      return;
    }
    setDropTarget(tile);
  }, { passive: false });

  const endTouch = async (e) => {
    if (!drag.touch) return;
    const touch = Array.from(e.changedTouches).find((x) => x.identifier === drag.touch.id);
    if (!touch && e.type !== "touchcancel") return;
    if (drag.touch.dragging && drag.touch.sourceId && drag.targetId) {
      await aplicarReorden(drag.touch.kind, drag.touch.sourceId, drag.targetId);
      drag.blockClickUntil = Date.now() + 350;
    }
    drag.touch = null;
    limpiarDragVisual();
  };
  refs.rapidosGrid.addEventListener("touchend", endTouch, { passive: true });
  refs.rapidosGrid.addEventListener("touchcancel", endTouch, { passive: true });
}

function bindEventos() {
  refs.buscarInput.addEventListener("keydown", async (e) => {
    if (e.key === "ArrowDown") {
      if (refs.sugerencias.hidden) return;
      e.preventDefault();
      moverSugerenciaActiva(1);
      return;
    }
    if (e.key === "ArrowUp") {
      if (refs.sugerencias.hidden) return;
      e.preventDefault();
      moverSugerenciaActiva(-1);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (!refs.sugerencias.hidden && getSugerenciasItems().length) {
        const seleccionado = await seleccionarSugerenciaActiva();
        if (seleccionado) return;
      }
      await buscarYAgregarDesdeInput();
    }
  });
  refs.buscarInput.addEventListener("input", () => {
    clearTimeout(debounceBusqueda);
    debounceBusqueda = setTimeout(actualizarSugerenciasInput, 140);
  });

  refs.sugerencias.addEventListener("click", async (e) => {
    const btn = e.target.closest(".vm-sug-item");
    if (!btn) return;
    await seleccionarSugerenciaBtn(btn);
  });

  document.addEventListener("click", (e) => {
    if (!refs.sugerencias.hidden && !refs.sugerencias.contains(e.target) && !refs.buscarInput.contains(e.target)) {
      ocultarSugerencias();
    }
  });

  refs.rapidosGrid.addEventListener("click", async (e) => {
    if (Date.now() < drag.blockClickUntil) return;
    const tile = e.target.closest(".vm-tile");
    if (!tile) return;
    const kind = tile.dataset.kind;
    const id = toInt(tile.dataset.id, 0);
    if (kind === "categoria") { await abrirCategoria(id); return; }
    if (kind === "producto") {
      const p = getProductoById(id);
      if (!p) return;
      await agregarProductoAlPedido(p);
    }
  });

  bindDragAndDrop();

  refs.pedidoBody.addEventListener("click", async (e) => {
    const row = e.target.closest("tr[data-item-id]");
    if (!row) return;
    const itemId = toInt(row.dataset.itemId, 0);
    if (!itemId) return;
    if (e.target.closest("[data-action='remove']")) { await eliminarItemPedido(itemId); return; }
    state.itemSeleccionadoId = itemId;
    renderPedido();
    abrirEditorItem(itemId);
  });

  refs.editGuardarBtn.addEventListener("click", guardarEdicionItem);
  refs.editCerrarBtn.addEventListener("click", cerrarEditorItem);
  refs.modalEditarItem.addEventListener("click", (e) => { if (e.target.classList.contains("modal")) cerrarEditorItem(); });

  refs.eliminarBtn.addEventListener("click", eliminarSeleccionado);
  refs.cancelarBtn.addEventListener("click", cancelarPedido);
  refs.cobrarBtn.addEventListener("click", cobrarPedido);
  refs.enEsperaBtn?.addEventListener("click", ponerPedidoEnEspera);
  refs.cobroRapidoBtn?.addEventListener("click", () => cobrarPedidoModo("rapido"));
  refs.cobroRapidoTicketBtn?.addEventListener("click", () => cobrarPedidoModo("rapido_ticket"));

  refs.backCategoriaBtn.addEventListener("click", volverACategorias);
  refs.showCategorias.addEventListener("change", validarMostrar);
  refs.showProductos.addEventListener("change", validarMostrar);

  refs.buscarPedidoBtn.addEventListener("click", abrirSelectorPedidoMovimiento);
  refs.pedidoNumero.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); buscarPedidoPorNumero(); } });
  refs.tipoPedido.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    refs.vendedorCodigo.focus();
    refs.vendedorCodigo.select?.();
  });
  refs.formaPago?.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    refs.buscarInput.focus();
    refs.buscarInput.select?.();
  });
  refs.buscarOperacionBtn.addEventListener("click", abrirSelectorOperacion);
  refs.buscarVendedorBtn.addEventListener("click", abrirSelectorVendedor);
  refs.buscarClienteBtn.addEventListener("click", abrirSelectorCliente);

refs.operacionCodigo.addEventListener("input", () => {
  const codigo = String(refs.operacionCodigo.value || "").trim();
  if (!codigo) {
    limpiarOperacionSeleccionadaVenta();
    return;
  }

  refs.operacionNombre.value = "";
  refs.operacionSelect.value = "";
  state.operacionSeleccionadaId = null;
  state.operacionSeleccionada = null;
});

refs.operacionCodigo.addEventListener("keydown", async (e) => {
  if (e.key !== "Enter") return;
  e.preventDefault();
  try {
    const ok = await cargarOperacionPorCodigo({ autocompletarPorMetodoSiVacio: true });
    if (ok) refs.formaPago?.focus();
  } catch (err) {
    mostrarMensaje(err.message || "No se pudo cargar operacion", "error");
  }
});

  refs.vendedorCodigo.addEventListener("keydown", async (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    try { await cargarVendedorPorCodigo(); await guardarCabeceraEnVentaActual(); } catch (err) { mostrarMensaje(err.message || "No se pudo cargar vendedor", "error"); }
  });

  refs.clienteCodigo.addEventListener("keydown", async (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    try { await cargarClientePorCodigo(); await guardarCabeceraEnVentaActual(); } catch (err) { mostrarMensaje(err.message || "No se pudo cargar cliente", "error"); }
  });
  refs.clienteNombre.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    refs.operacionCodigo.focus();
    refs.operacionCodigo.select?.();
  });

  refs.clienteNombre.addEventListener("blur", () => { syncPedidoDesdeCabecera(); guardarCabeceraEnVentaActual(); });
  refs.formaPago?.addEventListener("change", () => {
    const previousId = toInt(state.formaPagoSeleccionadaId, 0);
    const formaPagoId = toInt(refs.formaPago?.value, 0);
    if (!formaPagoId) return;
    if (!setFormaPagoSeleccionadaId(formaPagoId, { persist: true, syncPedido: true })) {
      refs.formaPago.value = previousId > 0 ? String(previousId) : "";
      return;
    }
    guardarCabeceraEnVentaActual();
  });
  refs.tipoPedido.addEventListener("change", () => { syncPedidoDesdeCabecera(); guardarCabeceraEnVentaActual(); });
  refs.operacionSelect?.addEventListener("change", () => {
    const previousId = toInt(state.operacionSeleccionadaId, 0);
    const opId = toInt(refs.operacionSelect.value, 0);
    if (!opId) return;
    if (!setOperacionSeleccionadaId(opId, { persist: true, syncPedido: true })) {
      refs.operacionSelect.value = previousId > 0 ? String(previousId) : "";
      syncOperacionUI();
      return;
    }
    guardarCabeceraEnVentaActual();
  });
  refs.volverBtn.addEventListener("click", () => { window.location.href = "/home.html"; });
  refs.metodos.forEach((btn) => btn.addEventListener("click", () => setMetodoPago(btn.dataset.method)));

  refs.confirmFacturaSi.addEventListener("click", () => { cerrarModal("vmModalConfirmFactura"); abrirModalFactura(); });
  refs.confirmFacturaNo.addEventListener("click", () => { cerrarModal("vmModalConfirmFactura"); finalizarPostCobroSinFactura(); });

  refs.btnBuscarClienteFactura.addEventListener("click", async () => {
    const codigo = refs.clienteCodigoFactura.value.trim();
    if (codigo) { await buscarClienteFacturaPorCodigo(codigo); return; }
    abrirBuscadorClienteFactura();
  });
  refs.clienteCodigoFactura.addEventListener("keydown", async (e) => { if (e.key === "Enter") { e.preventDefault(); await buscarClienteFacturaPorCodigo(refs.clienteCodigoFactura.value.trim()); } });
  refs.cerrarModalFacturaBtn.addEventListener("click", cerrarModalFactura);
  refs.confirmarFacturaBtn.addEventListener("click", confirmarFactura);

  refs.rucFacturaInput.addEventListener("keydown", async (e) => {
    if (e.key !== "Enter") return;
    const ruc = refs.rucFacturaInput.value.trim();
    if (!ruc) return;
    try {
      const res = await fetch(`/api/clientes/ruc/${encodeURIComponent(ruc)}`);
      if (!res.ok) { mostrarMensaje("Error consultando RUC", "error"); return; }
      const data = await safeJson(res, null);
      if (!data) {
        const autoPayload = {
          ruc,
          nombre: "Cliente automático",
          razon_social: "Cliente automático",
          direccion: "Sin dirección",
          telefono: ""
        };
        const autoRes = await fetch("/api/clientes/guardar-o-buscar", {
          method: "POST",
          headers: baseHeaders,
          body: JSON.stringify(autoPayload)
        });
        const autoData = await safeJson(autoRes, {});
        if (!autoRes.ok || !autoData?.id) {
          mostrarMensaje("RUC no encontrado", "info");
          return;
        }
        refs.rucFacturaInput.value = autoData.ruc || ruc;
        refs.nombreFacturaInput.value = autoData.nombre || autoData.razon_social || refs.nombreFacturaInput.value;
        refs.direccionFacturaInput.value = autoData.direccion || refs.direccionFacturaInput.value;
        return;
      }
      refs.rucFacturaInput.value = data.ruc || ruc;
      refs.nombreFacturaInput.value = data.nombre || data.razon_social || refs.nombreFacturaInput.value;
      refs.direccionFacturaInput.value = data.direccion || refs.direccionFacturaInput.value;
    } catch {
      mostrarMensaje("Error buscando RUC", "error");
    }
  });
  refs.rucFacturaInput.addEventListener("input", () => {
    let val = refs.rucFacturaInput.value.replace(/[^0-9-]/g, "");
    const parts = val.split("-");
    if (parts.length > 2) val = `${parts[0]}-${parts[1]}`;
    if (parts[0]) parts[0] = parts[0].slice(0, 8);
    if (parts[1]) parts[1] = parts[1].slice(0, 1);
    refs.rucFacturaInput.value = parts.join("-");
  });

  document.addEventListener("keydown", async (e) => {
    if (await manejarAtajoRapidos(e)) return;
    if (e.key === "F2") { e.preventDefault(); refs.buscarInput.focus(); refs.buscarInput.select(); }
    if (e.key === "F3" || e.key === "F9") { e.preventDefault(); cobrarPedido(); }
    if (e.key === "Escape" && refs.modalEditarItem.classList.contains("show")) cerrarEditorItem();
  });
}

async function init() {
  bindEventos();
  refs.buscarInput?.focus();
  renderPedido();
  setMetodoPago("EFECTIVO");
  setVistaCategoriasProductos(true, false);
  actualizarEtiquetaCategoriaActiva();

  await Promise.all([cargarPermisos(), cargarCotizacion(), cargarOperaciones(), cargarFormasPago()]);
  if (!aplicarPermisosUI()) return;

  try {
    await cargarTiposPedidoVenta();
  } catch (err) {
    console.error("No se pudo cargar Tipo Pedido:", err);
    mostrarMensaje("No se pudo cargar Tipo Pedido desde backend", "error");
  }
  syncPedidoDesdeCabecera();
  actualizarTotales();

  if (state.formaPagoSeleccionadaId) {
    setFormaPagoSeleccionadaId(state.formaPagoSeleccionadaId, { persist: false, syncPedido: true });
  }

  await cargarDefaultsCabecera();
  await cargarCategorias();
  await consumirVendedorSeleccionado();
  await consumirClienteSeleccionado();
  await consumirOperacionSeleccionada();

  const params = new URLSearchParams(window.location.search);
  const ventaId = params.get("venta_id");
  const pedidoNumero = params.get("pedido");
  const esPostCobro = params.get("post_cobro") === "1";

  // Si venimos de un post-cobro NO cargamos la venta (ya esta cobrada);
  // dejamos el form limpio y consumirPostCobroPendiente muestra el toast
  // "venta cobrada" + dispara el flujo de factura si corresponde.
  if (!esPostCobro) {
    if (ventaId) await cargarVentaPorId(ventaId);
    else if (pedidoNumero) { refs.pedidoNumero.value = String(pedidoNumero); await buscarPedidoPorNumero(); }
    else await consumirMovimientoSeleccionado();
  }

  consumirPostCobroPendiente();

  actualizarEstadoAcciones();
  refs.buscarInput?.focus();
}

document.addEventListener("DOMContentLoaded", init);
