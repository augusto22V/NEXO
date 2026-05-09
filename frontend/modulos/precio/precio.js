const API_PRECIO = "/api/productos-precio";
const API_PRODUCTOS = "/api/productos";
const API_VALOR_CANTIDAD = "/api/productos-precio/producto";

const MONEDA_IDS = Object.freeze({
  PYG: 1,
  BRL: 2,
  USD: 3
});

const MONEDA_LABELS = Object.freeze({
  1: "Guaraní",
  2: "Real",
  3: "Dólar"
});

const params = new URLSearchParams(window.location.search);
const modoConsulta = params.get("modo") === "consulta";
const origen = String(params.get("from") || "").trim().toLowerCase();

const refs = {
  topbarTitulo: document.querySelector(".topbar .titulo span"),
  btnVolver: document.getElementById("btnVolverPrecio"),
  btnBuscarProducto: document.getElementById("btnBuscarProductoPrecio"),
  btnGuardar: document.getElementById("btnGuardarPrecio"),
  btnValorPorCantidad: document.getElementById("btnValorPorCantidad"),

  inputBuscarProducto: document.getElementById("inputBuscarProductoPrecio"),
  nombreProducto: document.getElementById("nombreProducto"),
  descripcionProducto: document.getElementById("descripcionProducto"),
  productoId: document.getElementById("producto_id"),

  form: document.getElementById("formPrecio"),
  monedaBaseEmpresa: document.getElementById("monedaBaseEmpresa"),
  monedaCompraProducto: document.getElementById("monedaCompraProducto"),
  badgeMonedaProducto: document.getElementById("badgeMonedaProducto"),
  labelPrecioCompra: document.getElementById("labelPrecioCompra"),
  precioCompra: document.getElementById("precioCompra"),
  costoMedioActual: document.getElementById("costoMedioActual"),

  auditPrecio: document.getElementById("auditPrecio"),
  modalValorCantidad: document.getElementById("modalValorCantidad"),
  vpBody: document.getElementById("vpBody"),
  btnCerrarValorCantidad: document.getElementById("btnCerrarValorCantidad"),
  btnCancelarValorCantidad: document.getElementById("btnCancelarValorCantidad"),
  btnGuardarValorCantidad: document.getElementById("btnGuardarValorCantidad")
};

const filas = {
  minorista: document.querySelector('.tabla tbody tr[data-tipo="minorista"]'),
  mayorista: document.querySelector('.tabla tbody tr[data-tipo="mayorista"]'),
  minimo: document.querySelector('.tabla tbody tr[data-tipo="minimo"]'),
  promocional: document.querySelector('.tabla tbody tr[data-tipo="promocional"]')
};

const state = {
  ultimoMargen: null,
  precioActual: null,
  monedas: new Map(),
  cotizacion: {
    brl: 0,
    usd: 0
  },
  empresa: {
    id: null,
    nombre: "",
    monedaBaseId: MONEDA_IDS.PYG
  },
  productoActual: null,
  costoTransporteValor: 0,
  monedaCompraProductoId: MONEDA_IDS.PYG,
  navOrigen: "home"
};

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function isFiniteNumber(value) {
  return Number.isFinite(Number(value));
}

function normalizeMonedaName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]/gi, "")
    .toUpperCase();
}

function normalizarMonedaId(value, fallback = MONEDA_IDS.PYG) {
  const id = Number(value);
  if (id === MONEDA_IDS.PYG || id === MONEDA_IDS.BRL || id === MONEDA_IDS.USD) {
    return id;
  }
  return fallback;
}

function labelMoneda(monedaId) {
  const id = normalizarMonedaId(monedaId, MONEDA_IDS.PYG);
  const fromApi = state.monedas.get(id);
  if (fromApi?.nombre) return fromApi.nombre;
  return MONEDA_LABELS[id] || MONEDA_LABELS[MONEDA_IDS.PYG];
}

function formatearGs(valor) {
  if (!isFiniteNumber(valor)) return "";
  return Math.max(0, Math.round(Number(valor))).toLocaleString("es-PY", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  });
}

function formatearDecimal(valor, decimales = 4) {
  if (!isFiniteNumber(valor)) return "";
  return Number(valor).toLocaleString("es-PY", {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales
  });
}

function formatearMontoPorMoneda(monedaId, valor) {
  const id = normalizarMonedaId(monedaId, MONEDA_IDS.PYG);
  if (!isFiniteNumber(valor)) return "";
  if (id === MONEDA_IDS.PYG) return formatearGs(valor);
  return formatearDecimal(valor, 2);
}

function parseNumeroFlexible(valor) {
  if (valor === null || valor === undefined) return 0;
  const raw = String(valor).trim();
  if (!raw) return 0;

  let normalized = raw.replace(/\s+/g, "");
  const hasDot = normalized.includes(".");
  const hasComma = normalized.includes(",");

  if (hasDot && hasComma) {
    const lastDot = normalized.lastIndexOf(".");
    const lastComma = normalized.lastIndexOf(",");
    if (lastComma > lastDot) {
      normalized = normalized.replace(/\./g, "").replace(",", ".");
    } else {
      normalized = normalized.replace(/,/g, "");
    }
  } else if (hasComma) {
    const commaCount = (normalized.match(/,/g) || []).length;
    const parts = normalized.split(",");
    const decPart = parts[parts.length - 1] || "";
    const commasAsThousands = commaCount > 1 || (commaCount === 1 && decPart.length === 3);
    normalized = commasAsThousands ? normalized.replace(/,/g, "") : normalized.replace(",", ".");
  } else if (hasDot) {
    const dotCount = (normalized.match(/\./g) || []).length;
    const parts = normalized.split(".");
    const decPart = parts[parts.length - 1] || "";
    const dotsAsThousands = dotCount > 1 || (dotCount === 1 && decPart.length === 3);
    if (dotsAsThousands) normalized = normalized.replace(/\./g, "");
  }

  normalized = normalized.replace(/[^\d.-]/g, "");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

function limpiarNumeroGs(valor) {
  const raw = String(valor ?? "").replace(/[^\d]/g, "");
  if (!raw) return 0;
  return Math.max(0, Number(raw));
}

function parseMontoMoneda(valor, monedaId) {
  const id = normalizarMonedaId(monedaId, MONEDA_IDS.PYG);
  if (id === MONEDA_IDS.PYG) return limpiarNumeroGs(valor);
  return Math.max(0, parseNumeroFlexible(valor));
}

function parseUsuarioSesion() {
  try {
    const raw = localStorage.getItem("usuario");
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function resolveNavigationOrigin() {
  if (origen) return origen;

  const ref = String(document.referrer || "").toLowerCase();
  if (ref.includes("/modulos/productos/productos.html")) return "productos";
  if (ref.includes("/home.html")) return "home";
  if (ref.includes("/modulos/compra/compra.html")) return "compra";

  const productoIdQuery = Number(params.get("producto") || 0);
  if (productoIdQuery > 0) return "productos";
  return "home";
}

function inputMargen(tipo) {
  return filas[tipo]?.querySelector(".margen") || null;
}

function inputPrecio(tipo) {
  return filas[tipo]?.querySelector(".precio") || null;
}

function monedaCompraActual() {
  return normalizarMonedaId(
    refs.monedaCompraProducto?.value || state.monedaCompraProductoId,
    state.monedaCompraProductoId
  );
}

function convertirOrigenAGs(montoOrigen, monedaId) {
  const origenMonto = Math.max(0, toNumber(montoOrigen, 0));
  const id = normalizarMonedaId(monedaId, MONEDA_IDS.PYG);

  if (origenMonto === 0) return 0;
  if (id === MONEDA_IDS.PYG) return origenMonto;

  if (id === MONEDA_IDS.BRL) {
    const rate = toNumber(state.cotizacion.brl, 0);
    return rate > 0 ? origenMonto * rate : NaN;
  }

  if (id === MONEDA_IDS.USD) {
    const rate = toNumber(state.cotizacion.usd, 0);
    return rate > 0 ? origenMonto * rate : NaN;
  }

  return origenMonto;
}

function convertirGsAOrigen(montoGs, monedaId) {
  const gs = Math.max(0, toNumber(montoGs, 0));
  const id = normalizarMonedaId(monedaId, MONEDA_IDS.PYG);

  if (id === MONEDA_IDS.PYG) return gs;

  if (id === MONEDA_IDS.BRL) {
    const rate = toNumber(state.cotizacion.brl, 0);
    return rate > 0 ? gs / rate : NaN;
  }

  if (id === MONEDA_IDS.USD) {
    const rate = toNumber(state.cotizacion.usd, 0);
    return rate > 0 ? gs / rate : NaN;
  }

  return gs;
}

function compraOrigenActual() {
  return parseMontoMoneda(refs.precioCompra?.value, monedaCompraActual());
}

function costoTransporteActual() {
  return Math.max(0, toNumber(state.costoTransporteValor, 0));
}

function costoTotalActual() {
  return compraOrigenActual() + costoTransporteActual();
}

function costoBaseParaMargen() {
  const manual = parseMontoMoneda(refs.costoMedioActual?.value, monedaCompraActual());
  if (manual > 0) return manual;
  return costoTotalActual();
}

function actualizarCostoMedioDesdeInputs() {
  if (!refs.costoMedioActual) return;
  const monedaId = monedaCompraActual();
  const costoMedio = costoTotalActual();
  refs.costoMedioActual.value = costoMedio > 0 ? formatearMontoPorMoneda(monedaId, costoMedio) : "";
}

function aplicarEdicionManualCostoMedio() {
  if (!refs.costoMedioActual) return;
  const monedaId = monedaCompraActual();
  const costoMedioManual = parseMontoMoneda(refs.costoMedioActual.value, monedaId);
  refs.costoMedioActual.value = costoMedioManual > 0
    ? formatearMontoPorMoneda(monedaId, costoMedioManual)
    : "";

  if (costoMedioManual > 0) {
    const compra = compraOrigenActual();
    state.costoTransporteValor = Math.max(0, costoMedioManual - compra);
  }

  actualizarMargenesDesdePrecios();
}

function calcularMargen(precioVentaGs) {
  const costo = costoBaseParaMargen();
  if (!costo || costo <= 0) return 0;
  return ((precioVentaGs - costo) / costo) * 100;
}

function aplicarColorPrecio(input) {
  if (!input) return;
  const valor = parseMontoMoneda(input.value, monedaCompraActual());
  const costo = costoBaseParaMargen();
  input.style.color = valor > 0 && costo > 0 && valor < costo ? "#b42318" : "";
}

function renderMonedaBaseEmpresa() {
  if (!refs.monedaBaseEmpresa) return;
  const id = normalizarMonedaId(state.empresa.monedaBaseId, MONEDA_IDS.PYG);
  refs.monedaBaseEmpresa.value = `${id} - ${labelMoneda(id)}`;
}

function renderMonedaCompraProducto() {
  const id = normalizarMonedaId(state.monedaCompraProductoId, MONEDA_IDS.PYG);

  if (refs.monedaCompraProducto) refs.monedaCompraProducto.value = String(id);
  if (refs.labelPrecioCompra) refs.labelPrecioCompra.textContent = `Costo Compra (${labelMoneda(id)})`;
  if (refs.badgeMonedaProducto) refs.badgeMonedaProducto.textContent = `${id} - ${labelMoneda(id)}`;

  document.body.classList.remove("moneda-producto-1", "moneda-producto-2", "moneda-producto-3");
  document.body.classList.add(`moneda-producto-${id}`);
}

function recalcularVistasCostos() {
  actualizarMargenesDesdePrecios();
}

function setMonedaCompraProducto(monedaId) {
  const monedaNueva = normalizarMonedaId(monedaId, MONEDA_IDS.PYG);
  if (state.monedaCompraProductoId === monedaNueva) {
    renderMonedaCompraProducto();
    return;
  }

  state.monedaCompraProductoId = monedaNueva;
  renderMonedaCompraProducto();
}

function actualizarMargenesDesdePrecios() {
  Object.keys(filas).forEach((tipo) => {
    const margenInput = inputMargen(tipo);
    const precioInput = inputPrecio(tipo);
    if (!margenInput || !precioInput) return;

    const precio = parseMontoMoneda(precioInput.value, monedaCompraActual());
    if (precio <= 0) {
      if (!modoConsulta) margenInput.value = "";
      aplicarColorPrecio(precioInput);
      return;
    }

    const margen = calcularMargen(precio);
    margenInput.value = Number(margen).toFixed(2);
    state.ultimoMargen = Number(margenInput.value);
    aplicarColorPrecio(precioInput);
  });
}

function limpiarFilasPrecio() {
  Object.keys(filas).forEach((tipo) => {
    const margenInput = inputMargen(tipo);
    const precioInput = inputPrecio(tipo);
    if (margenInput) margenInput.value = "";
    if (precioInput) {
      precioInput.value = "";
      precioInput.style.color = "";
    }
  });
}

function limpiarPantallaProducto({ preservarBusqueda = false } = {}) {
  state.productoActual = null;
  state.precioActual = null;

  if (!preservarBusqueda && refs.inputBuscarProducto) refs.inputBuscarProducto.value = "";
  if (refs.productoId) refs.productoId.value = "";
  if (refs.descripcionProducto) refs.descripcionProducto.value = "";
  if (refs.nombreProducto) refs.nombreProducto.textContent = "Sin producto seleccionado";

  if (refs.precioCompra) refs.precioCompra.value = "";
  if (refs.costoMedioActual) refs.costoMedioActual.value = "";
  state.costoTransporteValor = 0;

  limpiarFilasPrecio();
  setMonedaCompraProducto(state.empresa.monedaBaseId);
}

function renderProductoActual(producto) {
  const nombre = String(producto?.nombre || "").trim();
  const descripcion = String(producto?.descripcion || "").trim();

  if (refs.productoId) refs.productoId.value = producto?.id ? String(producto.id) : "";
  if (refs.inputBuscarProducto) refs.inputBuscarProducto.value = producto?.id ? String(producto.id) : "";
  if (refs.descripcionProducto) refs.descripcionProducto.value = descripcion || nombre || "";
  if (refs.nombreProducto) refs.nombreProducto.textContent = nombre || descripcion || "Producto sin nombre";
}

function pickProductoExacto(lista, termino) {
  const needle = String(termino || "").trim().toLowerCase();
  if (!needle) return null;

  const exact = lista.find((row) => {
    const id = String(row?.id ?? "").trim().toLowerCase();
    const codigoBarra = String(row?.codigo_barra ?? "").trim().toLowerCase();
    const codigo = String(row?.codigo ?? row?.codigo_producto ?? "").trim().toLowerCase();
    const nombre = String(row?.nombre ?? "").trim().toLowerCase();
    return needle === id || needle === codigoBarra || needle === codigo || needle === nombre;
  });

  return exact || null;
}

async function buscarProductoPorCodigo(codigoRaw) {
  const codigo = String(codigoRaw || "").trim();
  if (!codigo) return null;

  const asId = Number(codigo);
  if (Number.isFinite(asId) && asId > 0 && String(asId) === codigo) {
    try {
      const res = await fetch(`${API_PRODUCTOS}/${asId}`, { credentials: "include" });
      if (res.ok) {
        return await res.json();
      }
    } catch {
      // fallback to list search
    }
  }

  const res = await fetch(`${API_PRODUCTOS}?buscar=${encodeURIComponent(codigo)}&page=1&limit=30`, {
    credentials: "include"
  });

  if (!res.ok) {
    return null;
  }

  const data = await res.json().catch(() => []);
  const lista = Array.isArray(data) ? data : [];
  if (!lista.length) return null;

  const exact = pickProductoExacto(lista, codigo);
  if (exact) return exact;

  if (lista.length === 1) return lista[0];
  return null;
}

async function cargarProductoPorId(id) {
  const res = await fetch(`${API_PRODUCTOS}/${id}`, { credentials: "include" });
  if (!res.ok) {
    throw new Error("No se pudo cargar el producto");
  }
  return res.json();
}

async function cargarPrecioProducto(idProducto) {
  const res = await fetch(`${API_PRECIO}/producto/${idProducto}`, { credentials: "include" });

  if (!res.ok) {
    state.precioActual = null;
    if (refs.precioCompra) refs.precioCompra.value = "";
    if (refs.costoMedioActual) refs.costoMedioActual.value = "";
    state.costoTransporteValor = 0;

    limpiarFilasPrecio();
    setMonedaCompraProducto(state.empresa.monedaBaseId);
    return;
  }

  const precio = await res.json().catch(() => null);
  if (!precio || typeof precio !== "object") {
    state.precioActual = null;
    if (refs.precioCompra) refs.precioCompra.value = "";
    if (refs.costoMedioActual) refs.costoMedioActual.value = "";
    state.costoTransporteValor = 0;

    limpiarFilasPrecio();
    setMonedaCompraProducto(state.empresa.monedaBaseId);
    return;
  }

  state.precioActual = precio;

  const monedaId = normalizarMonedaId(precio.precio_compra_moneda_id, state.empresa.monedaBaseId);
  state.monedaCompraProductoId = monedaId;
  renderMonedaCompraProducto();

  const compraOrigen = Math.max(0, toNumber(precio.precio_compra_origen ?? precio.precio_compra, 0));
  const transporte = Math.max(0, toNumber(precio.costo_transporte, 0));
  const costoMedio = Math.max(0, toNumber(precio.costo_medio ?? (compraOrigen + transporte), 0));
  state.costoTransporteValor = transporte;

  if (refs.precioCompra) refs.precioCompra.value = formatearMontoPorMoneda(monedaId, compraOrigen);
  if (refs.costoMedioActual) refs.costoMedioActual.value = costoMedio > 0 ? formatearMontoPorMoneda(monedaId, costoMedio) : "";

  const minoristaPrecio = toNumber(precio.precio_venta, 0);
  const minimoPrecio = toNumber(precio.precio_minimo, 0);
  const promocionalPrecio = toNumber(precio.precio_promocional, 0);

  const inMinorista = inputPrecio("minorista");
  const inMayorista = inputPrecio("mayorista");
  const inMinimo = inputPrecio("minimo");
  const inPromocional = inputPrecio("promocional");

  if (inMinorista) inMinorista.value = minoristaPrecio > 0 ? formatearMontoPorMoneda(monedaId, minoristaPrecio) : "";
  if (inMayorista) inMayorista.value = minoristaPrecio > 0 ? formatearMontoPorMoneda(monedaId, minoristaPrecio) : "";
  if (inMinimo) inMinimo.value = minimoPrecio > 0 ? formatearMontoPorMoneda(monedaId, minimoPrecio) : "";
  if (inPromocional) inPromocional.value = promocionalPrecio > 0 ? formatearMontoPorMoneda(monedaId, promocionalPrecio) : "";

  actualizarMargenesDesdePrecios();
}

async function cargarProductoCompleto(productoId, { focusEdicion = true } = {}) {
  const id = Number(productoId || 0);
  if (!id) throw new Error("Producto invalido");

  const producto = await cargarProductoPorId(id);
  state.productoActual = producto;
  renderProductoActual(producto);

  await cargarPrecioProducto(id);

  if (!modoConsulta && focusEdicion) {
    setTimeout(() => {
      refs.precioCompra?.focus();
      refs.precioCompra?.select?.();
    }, 80);
  }
}

async function ejecutarBusqueda() {
  if (modoConsulta) return;

  const codigo = String(refs.inputBuscarProducto?.value || "").trim();
  if (!codigo) {
    abrirSelector();
    return;
  }

  const btn = refs.btnBuscarProducto;
  const originalDisabled = btn?.disabled;
  if (btn) btn.disabled = true;

  try {
    const producto = await buscarProductoPorCodigo(codigo);
    if (!producto?.id) {
      alert("No se encontro un producto exacto con ese codigo. Use la lupa para seleccionar.");
      return;
    }

    await cargarProductoCompleto(producto.id, { focusEdicion: true });
  } catch (error) {
    console.error(error);
    alert("No se pudo completar la busqueda del producto.");
  } finally {
    if (btn) btn.disabled = Boolean(originalDisabled);
  }
}

function registrarEventosFilas() {
  Object.keys(filas).forEach((tipo) => {
    const margenInput = inputMargen(tipo);
    const precioInput = inputPrecio(tipo);
    if (!margenInput || !precioInput) return;

    margenInput.addEventListener("input", () => {
      const porcentaje = Number(String(margenInput.value).replace(",", "."));
      if (!Number.isFinite(porcentaje)) return;

      state.ultimoMargen = porcentaje;
      const costo = costoBaseParaMargen();
      const precio = costo + (costo * porcentaje / 100);
      precioInput.value = formatearMontoPorMoneda(monedaCompraActual(), precio);
      aplicarColorPrecio(precioInput);
    });

    precioInput.addEventListener("input", () => {
      const precio = parseMontoMoneda(precioInput.value, monedaCompraActual());
      if (precio <= 0) {
        margenInput.value = "";
        aplicarColorPrecio(precioInput);
        return;
      }

      const margen = calcularMargen(precio);
      margenInput.value = Number(margen).toFixed(2);
      state.ultimoMargen = Number(margenInput.value);
      aplicarColorPrecio(precioInput);
    });

    precioInput.addEventListener("blur", () => {
      const precio = parseMontoMoneda(precioInput.value, monedaCompraActual());
      precioInput.value = precio > 0 ? formatearMontoPorMoneda(monedaCompraActual(), precio) : "";
      aplicarColorPrecio(precioInput);
    });
  });
}

function registrarEventosCostos() {
  const recalcularCostoTotalYMargenes = () => {
    actualizarCostoMedioDesdeInputs();
    actualizarMargenesDesdePrecios();
  };

  refs.precioCompra?.addEventListener("input", recalcularCostoTotalYMargenes);

  refs.precioCompra?.addEventListener("blur", () => {
    const monedaId = monedaCompraActual();
    const valor = parseMontoMoneda(refs.precioCompra.value, monedaId);
    refs.precioCompra.value = valor > 0 ? formatearMontoPorMoneda(monedaId, valor) : "";
    recalcularCostoTotalYMargenes();
  });

  refs.costoMedioActual?.addEventListener("blur", () => {
    aplicarEdicionManualCostoMedio();
  });

  refs.monedaCompraProducto?.addEventListener("change", (event) => {
    setMonedaCompraProducto(event.target.value);
  });
}

function obtenerInputsNavegables() {
  const all = Array.from(refs.form?.querySelectorAll("input:not([type=hidden]), select") || []);
  return all.filter((el) => !el.disabled && !el.readOnly && el.offsetParent !== null);
}

function obtenerOrdenEnterPrecio() {
  const ordered = [
    refs.monedaCompraProducto,
    refs.precioCompra,
    refs.costoMedioActual,
    inputMargen("minorista"),
    inputPrecio("minorista"),
    inputMargen("mayorista"),
    inputPrecio("mayorista"),
    inputMargen("minimo"),
    inputPrecio("minimo"),
    inputMargen("promocional"),
    inputPrecio("promocional")
  ];

  return ordered.filter((el) => el && !el.disabled && !el.readOnly && el.offsetParent !== null);
}

const ORDEN_PRECIOS = ["minorista", "mayorista", "minimo", "promocional"];

function autoCompletarPreciosHaciaAbajo(actual) {
  const valorTexto = String(actual?.value || "").trim();
  if (!valorTexto) return;

  const index = ORDEN_PRECIOS.findIndex((tipo) => inputPrecio(tipo) === actual);
  if (index < 0) return;

  for (let i = index + 1; i < ORDEN_PRECIOS.length; i += 1) {
    const target = inputPrecio(ORDEN_PRECIOS[i]);
    if (!target || target.disabled || target.readOnly) continue;
    if (String(target.value || "").trim()) break;
    target.value = valorTexto;
    target.dispatchEvent(new Event("input"));
  }
}

function manejarEnterComoTab(event) {
  if (modoConsulta) return;
  if (event.key !== "Enter" || event.shiftKey) return;

  if (document.activeElement === refs.inputBuscarProducto) {
    event.preventDefault();
    ejecutarBusqueda();
    return;
  }

  if (!refs.form?.contains(document.activeElement)) return;

  const navegables = obtenerOrdenEnterPrecio();
  let idx = navegables.indexOf(document.activeElement);
  if (idx < 0) {
    const fallback = obtenerInputsNavegables();
    idx = fallback.indexOf(document.activeElement);
    if (idx < 0) return;
    event.preventDefault();
    const nextFallback = fallback[idx + 1];
    if (nextFallback) {
      nextFallback.focus();
      nextFallback.select?.();
      return;
    }
    refs.form?.requestSubmit();
    return;
  }

  event.preventDefault();

  if (document.activeElement.classList.contains("precio")) {
    autoCompletarPreciosHaciaAbajo(document.activeElement);
  }

  const next = navegables[idx + 1];
  if (next) {
    next.focus();
    next.select?.();
    return;
  }

  refs.form?.requestSubmit();
}

function parseVentaInputs() {
  const monedaId = monedaCompraActual();
  const minorista = parseMontoMoneda(inputPrecio("minorista")?.value, monedaId);
  const minimo = parseMontoMoneda(inputPrecio("minimo")?.value, monedaId);
  const promocional = parseMontoMoneda(inputPrecio("promocional")?.value, monedaId);

  return {
    minorista,
    minimo,
    promocional
  };
}

function precioBaseValorCantidad() {
  return parseMontoMoneda(inputPrecio("minorista")?.value, monedaCompraActual());
}

function parseValorCantidadInput(value) {
  return parseMontoMoneda(value, monedaCompraActual());
}

function formatValorCantidadInput(value) {
  return formatearMontoPorMoneda(monedaCompraActual(), value);
}

function formatearPorcentajeInput(value) {
  if (!isFiniteNumber(value) || Number(value) <= 0) return "";
  return Number(value).toFixed(2);
}

function recalcularFilaValorCantidad(tr, origen, opciones = {}) {
  if (!tr) return;

  const {
    preservePorcentaje = false,
    preserveValor = false
  } = opciones || {};

  const porcentajeInput = tr.querySelector(".vp-porcentaje");
  const valorInput = tr.querySelector(".vp-valor");
  if (!(porcentajeInput instanceof HTMLInputElement) || !(valorInput instanceof HTMLInputElement)) return;

  const base = precioBaseValorCantidad();
  const porcentaje = Math.max(0, parseNumeroFlexible(porcentajeInput.value));
  const valor = Math.max(0, parseValorCantidadInput(valorInput.value));

  const setPorcentaje = (n) => {
    if (preservePorcentaje) return;
    porcentajeInput.value = n > 0 ? formatearPorcentajeInput(n) : "";
  };

  const setValor = (n) => {
    if (preserveValor) return;
    valorInput.value = n > 0 ? formatValorCantidadInput(n) : "";
  };

  if (base <= 0) {
    setValor(valor);
    setPorcentaje(porcentaje);
    return;
  }

  if (origen === "porcentaje") {
    const calculado = porcentaje > 0 ? (base * porcentaje / 100) : 0;
    setValor(calculado);
    setPorcentaje(porcentaje);
    return;
  }

  if (origen === "valor") {
    const calculado = valor > 0 ? (valor / base) * 100 : 0;
    setValor(valor);
    setPorcentaje(calculado);
    return;
  }

  if (porcentaje > 0 && valor <= 0) {
    const calculado = base * porcentaje / 100;
    setValor(calculado);
    setPorcentaje(porcentaje);
    return;
  }

  if (valor > 0 && porcentaje <= 0) {
    const calculado = (valor / base) * 100;
    setValor(valor);
    setPorcentaje(calculado);
    return;
  }

  setValor(valor);
  setPorcentaje(porcentaje);
}

function normalizarFilasValorCantidadAntesDeGuardar() {
  const trList = Array.from(refs.vpBody?.querySelectorAll("tr[data-orden]") || []);
  trList.forEach((tr) => {
    recalcularFilaValorCantidad(tr, "auto");
  });
}

function manejarEnterValorCantidad(event) {
  if (event.key !== "Enter") return;
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  if (!refs.modalValorCantidad || refs.modalValorCantidad.hasAttribute("hidden")) return;
  if (!target.closest("#vpBody")) return;

  event.preventDefault();

  const tr = target.closest("tr[data-orden]");
  if (!tr) return;

  if (target.classList.contains("vp-porcentaje")) {
    recalcularFilaValorCantidad(tr, "porcentaje");
  } else if (target.classList.contains("vp-valor")) {
    recalcularFilaValorCantidad(tr, "valor");
  } else {
    recalcularFilaValorCantidad(tr, "auto");
  }

  const campos = Array.from(
    refs.vpBody?.querySelectorAll("input.vp-cantidad, input.vp-porcentaje, input.vp-valor") || []
  ).filter((el) => el instanceof HTMLInputElement && !el.disabled && !el.readOnly);

  const idx = campos.indexOf(target);
  const next = idx >= 0 ? campos[idx + 1] : null;
  if (next instanceof HTMLInputElement) {
    next.focus();
    next.select?.();
    return;
  }

  refs.btnGuardarValorCantidad?.focus();
}

function buildValorCantidadRow(orden, data = null) {
  const cantidad = toNumber(data?.cantidad, 0);
  const porcentaje = toNumber(data?.porcentaje_valor, 0);
  const valor = toNumber(data?.valor, 0);

  return `
    <tr data-orden="${orden}">
      <td>${orden}</td>
      <td><input type="number" class="vp-cantidad" min="0" step="0.01" value="${cantidad > 0 ? cantidad : ""}"></td>
      <td><input type="number" class="vp-porcentaje" min="0" step="0.01" value="${porcentaje > 0 ? Number(porcentaje).toFixed(2) : ""}"></td>
      <td><input type="text" class="vp-valor" inputmode="numeric" value="${valor > 0 ? formatValorCantidadInput(valor) : ""}"></td>
    </tr>
  `;
}

function renderValorCantidadRows(rows = []) {
  if (!refs.vpBody) return;

  const byOrder = new Map(
    (Array.isArray(rows) ? rows : []).map((row) => [Number(row?.orden || 0), row])
  );

  let html = "";
  for (let orden = 1; orden <= 4; orden += 1) {
    html += buildValorCantidadRow(orden, byOrder.get(orden));
  }
  refs.vpBody.innerHTML = html;
}

function collectValorCantidadRows() {
  const rows = [];
  const trList = Array.from(refs.vpBody?.querySelectorAll("tr[data-orden]") || []);

  trList.forEach((tr) => {
    const orden = Number(tr.getAttribute("data-orden") || 0);
    const cantidad = Math.max(0, parseNumeroFlexible(tr.querySelector(".vp-cantidad")?.value));
    const porcentaje = Math.max(0, parseNumeroFlexible(tr.querySelector(".vp-porcentaje")?.value));
    const valor = Math.max(0, parseValorCantidadInput(tr.querySelector(".vp-valor")?.value));

    rows.push({
      orden,
      cantidad,
      porcentaje_valor: porcentaje,
      valor
    });
  });

  return rows;
}

function formatValorCantidadRowInputs() {
  const trList = Array.from(refs.vpBody?.querySelectorAll("tr[data-orden]") || []);
  trList.forEach((tr) => {
    const valorInput = tr.querySelector(".vp-valor");
    const porcentajeInput = tr.querySelector(".vp-porcentaje");
    if (!valorInput) return;
    const val = parseValorCantidadInput(valorInput.value);
    valorInput.value = val > 0 ? formatValorCantidadInput(val) : "";

    if (porcentajeInput instanceof HTMLInputElement) {
      const porcentaje = Math.max(0, parseNumeroFlexible(porcentajeInput.value));
      porcentajeInput.value = porcentaje > 0 ? formatearPorcentajeInput(porcentaje) : "";
    }
  });
}

function abrirModalValorCantidad() {
  refs.modalValorCantidad?.removeAttribute("hidden");
}

function cerrarModalValorCantidad() {
  refs.modalValorCantidad?.setAttribute("hidden", "hidden");
}

async function cargarValorCantidadProducto(productoId) {
  const res = await fetch(`${API_VALOR_CANTIDAD}/${productoId}/valor-cantidad`, {
    credentials: "include"
  });
  if (!res.ok) {
    throw new Error("No se pudo cargar valor por cantidad");
  }
  const data = await res.json().catch(() => ({}));
  return Array.isArray(data?.rows) ? data.rows : [];
}

async function guardarValorCantidadProducto(productoId, rows) {
  const res = await fetch(`${API_VALOR_CANTIDAD}/${productoId}/valor-cantidad`, {
    method: "PUT",
    credentials: "include",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ rows })
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || "No se pudo guardar valor por cantidad");
  }
  return Array.isArray(data?.rows) ? data.rows : [];
}

async function onClickValorPorCantidad() {
  if (modoConsulta) return;

  const productoId = Number(refs.productoId?.value || 0);
  if (!productoId) {
    alert("Seleccione un producto primero.");
    refs.inputBuscarProducto?.focus();
    return;
  }

  try {
    const rows = await cargarValorCantidadProducto(productoId);
    renderValorCantidadRows(rows);
    formatValorCantidadRowInputs();
    abrirModalValorCantidad();
  } catch (error) {
    console.error(error);
    alert(error.message || "No se pudo cargar valor por cantidad");
  }
}

async function onGuardarValorCantidad() {
  const productoId = Number(refs.productoId?.value || 0);
  if (!productoId) {
    alert("Producto invalido.");
    return;
  }

  normalizarFilasValorCantidadAntesDeGuardar();
  const rows = collectValorCantidadRows();

  const btn = refs.btnGuardarValorCantidad;
  const oldText = btn?.textContent || "Guardar";
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Guardando...";
  }

  try {
    const updated = await guardarValorCantidadProducto(productoId, rows);
    renderValorCantidadRows(updated);
    formatValorCantidadRowInputs();
    cerrarModalValorCantidad();
  } catch (error) {
    console.error(error);
    alert(error.message || "No se pudo guardar valor por cantidad");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = oldText;
    }
  }
}

async function guardarPrecio(event) {
  event.preventDefault();
  if (modoConsulta) return;

  const productoId = Number(refs.productoId?.value || 0);
  if (!productoId) {
    alert("Debe seleccionar un producto.");
    refs.inputBuscarProducto?.focus();
    return;
  }

  const { minorista, minimo, promocional } = parseVentaInputs();
  if (!minorista || minorista <= 0) {
    alert("Debe ingresar el precio minorista.");
    inputPrecio("minorista")?.focus();
    return;
  }

  const monedaId = monedaCompraActual();
  const compraOrigen = compraOrigenActual();

  const payload = {
    producto_id: productoId,
    precio_compra: compraOrigen,
    precio_compra_moneda_id: monedaId,
    precio_compra_origen: compraOrigen,
    costo_transporte: costoTransporteActual(),
    precio_venta: minorista
  };

  if (minimo > 0) payload.precio_minimo = minimo;
  if (promocional > 0) payload.precio_promocional = promocional;

  const btn = refs.btnGuardar;
  const labelOriginal = btn?.textContent || "Guardar Precio";
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Guardando...";
  }

  try {
    const resp = await fetch(API_PRECIO, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      throw new Error(data?.error || "No se pudo guardar el precio");
    }

    state.precioActual = data;
    await cargarPrecioProducto(productoId);
    volver();
  } catch (error) {
    console.error(error);
    alert(error.message || "Error al guardar precio");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = labelOriginal;
    }
  }
}

function cerrarVentanaConsulta() {
  if (window.opener && !window.opener.closed) {
    window.close();
    return true;
  }
  return false;
}

function volver() {
  if (modoConsulta) {
    if (cerrarVentanaConsulta()) return;
    if (origen === "compra") {
      window.history.back();
      return;
    }
  }

  const productoId = Number(refs.productoId?.value || params.get("producto") || 0);

  if (state.navOrigen === "productos") {
    if (productoId > 0) {
      window.location.href = `../productos/productos.html?from=precio&producto=${productoId}`;
      return;
    }
    window.location.href = "../productos/productos.html";
    return;
  }

  if (state.navOrigen === "home") {
    window.location.href = "/home.html";
    return;
  }

  if (state.navOrigen === "compra") {
    window.history.back();
    return;
  }

  window.history.back();
}

function abrirSelector() {
  if (modoConsulta) return;

  const buscar = String(refs.inputBuscarProducto?.value || "").trim();
  const origenActual = String(state.navOrigen || origen || "home").trim().toLowerCase();
  const origenValido = ["home", "productos", "compra"].includes(origenActual)
    ? origenActual
    : "home";
  const query = new URLSearchParams({
    modo: "seleccion",
    volver: "precio",
    from: origenValido
  });

  if (buscar) query.set("buscar", buscar);
  window.location.href = `../productos/productos.html?${query.toString()}`;
}

function aplicarModoConsulta() {
  if (!modoConsulta) return;

  document.body.classList.add("precio-consulta");
  document.title = "NEXO | Consulta de precio";

  if (refs.topbarTitulo) refs.topbarTitulo.textContent = "Consulta de Precio";
  if (refs.btnVolver) refs.btnVolver.textContent = "Cerrar";
  if (refs.btnBuscarProducto) refs.btnBuscarProducto.hidden = true;
  if (refs.btnGuardar) refs.btnGuardar.hidden = true;
  if (refs.btnValorPorCantidad) refs.btnValorPorCantidad.hidden = true;
  if (refs.auditPrecio) refs.auditPrecio.hidden = true;

  refs.inputBuscarProducto.readOnly = true;
  refs.inputBuscarProducto.tabIndex = -1;

  Array.from(refs.form?.querySelectorAll("input:not([type=hidden])") || []).forEach((input) => {
    input.readOnly = true;
    input.tabIndex = -1;
  });

  Array.from(refs.form?.querySelectorAll("select") || []).forEach((select) => {
    select.disabled = true;
    select.tabIndex = -1;
  });

  Array.from(document.querySelectorAll(".tabla th:nth-child(2), .tabla td:nth-child(2)")).forEach((el) => {
    el.hidden = true;
  });
}

function registrarAtajos() {
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      volver();
      return;
    }

    if (!modoConsulta && event.key === "F3") {
      event.preventDefault();
      refs.form?.requestSubmit();
    }
  });
}

function registrarEventosBusqueda() {
  refs.inputBuscarProducto?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    ejecutarBusqueda();
  });

  refs.btnBuscarProducto?.addEventListener("click", accionBuscarProductoManual);

  refs.btnValorPorCantidad?.addEventListener("click", onClickValorPorCantidad);
  refs.btnCerrarValorCantidad?.addEventListener("click", cerrarModalValorCantidad);
  refs.btnCancelarValorCantidad?.addEventListener("click", cerrarModalValorCantidad);
  refs.btnGuardarValorCantidad?.addEventListener("click", onGuardarValorCantidad);

  refs.modalValorCantidad?.addEventListener("click", (event) => {
    if (event.target.closest("[data-vp-close]")) {
      cerrarModalValorCantidad();
    }
  });

  refs.vpBody?.addEventListener("keydown", manejarEnterValorCantidad);

  refs.vpBody?.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    const tr = target.closest("tr[data-orden]");
    if (!tr) return;
    if (target.classList.contains("vp-porcentaje")) {
      recalcularFilaValorCantidad(tr, "porcentaje", { preservePorcentaje: true });
    }
  });

  refs.vpBody?.addEventListener("blur", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    const tr = target.closest("tr[data-orden]");
    if (!tr) return;
    if (target.classList.contains("vp-porcentaje")) {
      recalcularFilaValorCantidad(tr, "porcentaje");
      return;
    }
    if (target.classList.contains("vp-valor")) {
      recalcularFilaValorCantidad(tr, "valor");
      return;
    }
    recalcularFilaValorCantidad(tr, "auto");
  }, true);
}

function accionBuscarProductoManual() {
  if (modoConsulta) return;
  const codigo = String(refs.inputBuscarProducto?.value || "").trim();
  if (codigo) {
    ejecutarBusqueda();
    return;
  }
  abrirSelector();
}

async function cargarMonedas() {
  state.monedas.set(MONEDA_IDS.PYG, { id: MONEDA_IDS.PYG, nombre: "Guaraní", simbolo: "Gs" });
  state.monedas.set(MONEDA_IDS.BRL, { id: MONEDA_IDS.BRL, nombre: "Real", simbolo: "R$" });
  state.monedas.set(MONEDA_IDS.USD, { id: MONEDA_IDS.USD, nombre: "Dólar", simbolo: "$" });

  try {
    const res = await fetch("/api/moneda", { credentials: "include" });
    const data = await res.json().catch(() => []);
    if (!res.ok || !Array.isArray(data)) return;

    data.forEach((row) => {
      const id = Number(row?.id || 0);
      if (![MONEDA_IDS.PYG, MONEDA_IDS.BRL, MONEDA_IDS.USD].includes(id)) return;
      state.monedas.set(id, {
        id,
        nombre: String(row?.nombre || MONEDA_LABELS[id]),
        simbolo: String(row?.simbolo || "")
      });
    });
  } catch {
    // fallback local
  }
}

async function cargarContextoEmpresaBase() {
  const usuario = parseUsuarioSesion();
  state.empresa.id = Number(usuario?.empresa_id || 0) || null;
  state.empresa.nombre = String(
    usuario?.empresa_nombre || usuario?.empresa || usuario?.nombre_empresa || ""
  ).trim();
  state.empresa.monedaBaseId = MONEDA_IDS.PYG;

  try {
    const res = await fetch("/api/permisos/me", { credentials: "include" });
    const data = await res.json().catch(() => ({}));

    if (res.ok) {
      state.empresa.monedaBaseId = normalizarMonedaId(
        data?.empresa_moneda_base_id,
        state.empresa.monedaBaseId
      );
      if (!state.empresa.id) {
        state.empresa.id = Number(data?.empresa_id || data?.usuario?.empresa_id || 0) || null;
      }
    }
  } catch {
    // fallback local
  }

  renderMonedaBaseEmpresa();
}

async function cargarCotizacionActual() {
  try {
    const res = await fetch("/api/cotizacion/hoy", { credentials: "include" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || "No se pudo cargar cotizacion");

    state.cotizacion.brl = toNumber(data?.brl, 0);
    state.cotizacion.usd = toNumber(data?.usd, 0);

    const monedaBaseApi = normalizarMonedaId(data?.moneda_base_id, NaN);
    if (Number.isFinite(monedaBaseApi)) {
      state.empresa.monedaBaseId = monedaBaseApi;
    }

    if (!state.empresa.id) {
      state.empresa.id = Number(data?.empresa_id || 0) || null;
    }

    if (!state.empresa.nombre) {
      state.empresa.nombre = String(data?.empresa_nombre || "").trim();
    }

    if (Array.isArray(data?.indices)) {
      data.indices.forEach((row) => {
        const key = normalizeMonedaName(row?.moneda || row?.codigo || "");
        const value = toNumber(row?.valor_indice ?? row?.valor, 0);
        if (key.includes("REAL") || key.includes("BRL")) state.cotizacion.brl = value;
        if (key.includes("DOLAR") || key.includes("USD")) state.cotizacion.usd = value;
      });
    }
  } catch {
    state.cotizacion.brl = 0;
    state.cotizacion.usd = 0;
  }

  renderMonedaBaseEmpresa();
  recalcularVistasCostos();
}

function iniciarModoEdicion() {
  if (modoConsulta) return;

  registrarEventosFilas();
  registrarEventosCostos();
  document.addEventListener("keydown", manejarEnterComoTab);
}

async function init() {
  state.navOrigen = resolveNavigationOrigin();

  aplicarModoConsulta();
  registrarAtajos();
  registrarEventosBusqueda();

  refs.form?.addEventListener("submit", guardarPrecio);
  iniciarModoEdicion();

  await Promise.allSettled([
    cargarMonedas(),
    cargarContextoEmpresaBase(),
    cargarCotizacionActual()
  ]);

  setMonedaCompraProducto(state.empresa.monedaBaseId);

  const productoQueryId = Number(params.get("producto") || 0);
  if (productoQueryId > 0) {
    try {
      await cargarProductoCompleto(productoQueryId, { focusEdicion: !modoConsulta });
    } catch (error) {
      console.error(error);
      alert("No se pudo cargar el producto seleccionado.");
      limpiarPantallaProducto({ preservarBusqueda: true });
    }
  } else if (!modoConsulta) {
    refs.inputBuscarProducto?.focus();
    refs.inputBuscarProducto?.select?.();
  }
}

window.volver = volver;
window.abrirSelector = abrirSelector;
window.ejecutarBusqueda = ejecutarBusqueda;
window.accionBuscarProductoManual = accionBuscarProductoManual;

document.addEventListener("DOMContentLoaded", init);
