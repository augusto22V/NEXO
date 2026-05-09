let pedidoActual = {
  id: null,
  numero: null,
  items: [],
  estado: "PENDIENTE"
};

let ventaActual = pedidoActual;
let cotizacion = { brl: 0, usd: 0 };
let procesando = false;

let categorias = [];
let productos = [];
let productosFiltrados = [];
let categoriaActual = null;
let itemEditando = null;
let ventaBloqueada = false;
let imprimiendoCocina = false;
let sabores = [];
let saboresSeleccionados = [];
let productoActualSabores = null;
let productoArrastrado = null;
let timerLongPress = null;
let longPressActivo = false;
let modoMoverProductos = false;
let tempCounter = -1;
/** Evita doble linea al sumar producto (touchend sintetiza click en algunos navegadores). */
let ultimoTouchAgregarProductoMs = 0;
let colsProductos = 6;
let colsCategorias = 6;
let permisos = {};
let tipoPedidoPOSConfig = {
  items: [],
  defaultId: 0,
  visible: true
};
const PERMISOS_VENTA_RAPIDA_DEFAULT = Object.freeze({
  venta_rapida_ver: true,
  venta_rapida_nueva: true,
  venta_rapida_cancelar: true,
  venta_rapida_imprimir_preparo: true,
  venta_rapida_efectivizar: true,
  venta_rapida_imprimir_venta: true
});
let cargandoPedido = false;
let mesaActivaId = null;
let mesasSimple = [];
let mesaSimpleSeleccionadaId = null;
let mesaSimpleConfirmando = false;
let persistenciasDetallePendientes = 0;
let cocinaPendienteLocalVentaId = null;
let reintentandoEnviosCocina = false;
let intervaloReintentoCocina = null;
let modoCobroSolicitado = "detallado";
/** Ventas guardadas en espera en esta sesión (sin localStorage). */
let ventasEnEspera = [];

/** Id real de venta en servidor (entero > 0). Evita NaN y la cadena "undefined" en URLs. */
function ventaPosIdValido(raw) {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0;
}

let ventaModoFactura = false;
const PRODUCTO_SELECCIONADO_CONSULTA_KEY = "ventaProductoSeleccionado";
const COCINA_QUEUE_KEY = "ventaRapidaCocinaQueue";
const COCINA_TIMEOUT_MS = 3500;
const COCINA_VALIDACION_TIMEOUT_MS = 1500;
const COCINA_REINTENTOS_MAX = 3;
const COCINA_RETRY_DELAYS_MS = [1500, 3500, 7000];
const COCINA_REINTENTO_INTERVAL_MS = 12000;
/** Alineado con backend/config/pos.mode.js vía window.__POS_MODE en HTML */
const POS_SIN_COCINA = typeof window !== "undefined" && window.__POS_MODE?.sinCocina === false
  ? false
  : true;
const POS_SIN_TIPO_PEDIDO = typeof window !== "undefined" && window.__POS_MODE?.sinTipoPedido === false
  ? false
  : true;

const gridProductos = document.getElementById("productos");
const gridCategorias = document.getElementById("categorias");

function tienePermisoVentaRapida(clave) {
  if (!clave) return false;

  const fromMap = permisos?.permisos_venta_rapida?.[clave];
  if (typeof fromMap === "boolean") return fromMap;

  const fromRoot = permisos?.[clave];
  if (typeof fromRoot === "boolean") return fromRoot;

  return Boolean(PERMISOS_VENTA_RAPIDA_DEFAULT[clave]);
}

function validarPermisoVentaRapida(clave, mensaje) {
  if (tienePermisoVentaRapida(clave)) return true;
  mostrarMensaje(mensaje || "No tiene permiso para esta accion", "error");
  return false;
}

function configurarBotonPermiso(selector, permitido, ocultar = true) {
  const btn = document.querySelector(selector);
  if (!btn) return;
  btn.disabled = !permitido;

  if (ocultar) {
    btn.style.display = permitido ? "" : "none";
  } else {
    btn.classList.toggle("permiso-denegado", !permitido);
    btn.style.opacity = permitido ? "" : "0.55";
    btn.style.pointerEvents = permitido ? "" : "none";
  }
}

function aplicarPermisosVentaRapidaUI() {
  const puedeVer = tienePermisoVentaRapida("venta_rapida_ver");
  const puedeNueva = tienePermisoVentaRapida("venta_rapida_nueva");
  const puedeCancelar = tienePermisoVentaRapida("venta_rapida_cancelar");
  const puedePreparo = POS_SIN_COCINA
    ? false
    : tienePermisoVentaRapida("venta_rapida_imprimir_preparo");
  const puedeEfectivizar = tienePermisoVentaRapida("venta_rapida_efectivizar");
  const puedeImprimirVenta = tienePermisoVentaRapida("venta_rapida_imprimir_venta");

  configurarBotonPermiso(".btn-preparo", puedePreparo, true);
  configurarBotonPermiso(".btn-efectivizar", puedeEfectivizar, true);
  configurarBotonPermiso(".btn-venta", puedeImprimirVenta, true);

  configurarBotonPermiso('button[onclick="nuevoPedido()"]', puedeNueva, false);
  configurarBotonPermiso('button[onclick="cancelarPedido()"]', puedeCancelar, false);

  if (!puedeVer) {
    mostrarMensaje("Sin permiso para usar VentaRapida", "error");
    setTimeout(() => {
      window.location.href = "/home.html";
    }, 800);
  }
}

function generarTempId() {
  return tempCounter--;
}

let cambio = {
  usd: 0,
  brl: 0
};

const ESTADOS_VISUALES_BLOQUEANTES = new Set(["CONCLUIDO", "EFECTIVADO", "CANCELADO", "FACTURADO"]);


const $ = (id) => document.getElementById(id);

function tipoPedidoVisiblePOS() {
  if (POS_SIN_TIPO_PEDIDO) return false;
  return tipoPedidoPOSConfig.visible !== false;
}

function actualizarVisibilidadTipoPedidoPOS() {
  const box = document.getElementById("tipoPedidoBox");
  const select = document.getElementById("tipoPedido");
  const visible = tipoPedidoVisiblePOS();

  if (box) {
    box.style.display = visible ? "" : "none";
  }

  if (select) {
    if (!visible) {
      select.value = "";
    }
    select.disabled = !visible;
  }

  if (!visible) {
    localStorage.removeItem("tipoPedidoPOS");
  }
}

function resolverEstadoVisualPedido(estadoBase = null) {
  const estadoActual = String(estadoBase ?? pedidoActual?.estado ?? "PENDIENTE")
    .trim()
    .toUpperCase() || "PENDIENTE";

  const hayItems = Array.isArray(pedidoActual?.items) && pedidoActual.items.length > 0;
  if (hayItems && !ESTADOS_VISUALES_BLOQUEANTES.has(estadoActual)) {
    return "PENDIENTE";
  }

  return estadoActual;
}

function sincronizarEstadoVisualPedido(estadoBase = null) {
  const estadoVisual = resolverEstadoVisualPedido(estadoBase);
  pedidoActual.estado = estadoVisual;
  aplicarEstadoVenta(estadoVisual);
  return estadoVisual;
}

function getTipoPedidoDefaultPOS() {
  if (!tipoPedidoVisiblePOS()) return 0;

  const shared = window.TipoPedidoVenta;
  const fromConfig = shared?.toPositiveInt?.(tipoPedidoPOSConfig.defaultId, 0) || 0;
  if (fromConfig > 0) return fromConfig;

  const select = document.getElementById("tipoPedido");
  const fromSelect = shared?.ensureSelectedId?.(select, 0) || 0;
  return fromSelect > 0 ? fromSelect : 0;
}

function getTipoPedidoSeleccionadoPOS() {
  if (!tipoPedidoVisiblePOS()) return 0;

  const select = document.getElementById("tipoPedido");
  const shared = window.TipoPedidoVenta;
  if (!shared?.ensureSelectedId) {
    return Number(select?.value || 0) > 0 ? Number(select.value) : 0;
  }

  return shared.ensureSelectedId(select, getTipoPedidoDefaultPOS());
}

function aplicarTipoPedidoEnSelectPOS(tipoPedidoId) {
  if (!tipoPedidoVisiblePOS()) {
    const select = document.getElementById("tipoPedido");
    if (select) select.value = "";
    return 0;
  }

  const shared = window.TipoPedidoVenta;
  const select = document.getElementById("tipoPedido");
  if (!select) return 0;

  const requestedId = shared?.toPositiveInt?.(tipoPedidoId, 0) || 0;
  if (requestedId > 0) {
    const exists = Array.from(select.options || []).some((opt) => Number(opt.value) === requestedId);
    if (exists) {
      select.value = String(requestedId);
      return requestedId;
    }
  }

  return getTipoPedidoSeleccionadoPOS();
}

async function cargarTiposPedidoPOS(selectedId = null) {
  const shared = window.TipoPedidoVenta;
  const select = document.getElementById("tipoPedido");
  if (!tipoPedidoVisiblePOS()) {
    tipoPedidoPOSConfig = {
      items: [],
      defaultId: 0,
      visible: false
    };
    actualizarVisibilidadTipoPedidoPOS();
    return 0;
  }
  if (!shared?.loadTiposPedido || !select) {
    throw new Error("No se encontro el loader de Tipo Pedido");
  }

  const preferredId = shared.toPositiveInt(selectedId, 0);
  const loaded = await shared.loadTiposPedido(select, { selectedId: preferredId });
  tipoPedidoPOSConfig = {
    items: loaded.items || [],
    defaultId: shared.toPositiveInt(loaded.defaultId, 0),
    visible: true
  };

  return shared.ensureSelectedId(select, tipoPedidoPOSConfig.defaultId);
}

function valor(id) {
  return $(id)?.value ?? "";
}

function setValor(id, v) {
  const el = $(id);
  if (el) el.value = v ?? "";
}

function parseGs(texto) {
  return parseFloat(String(texto || "").replace(/\./g, "").replace(/,/g, ".")) || 0;
}

function precioBaseProducto(prod) {
  return Number(prod?.precioOriginal || prod?.precio || 0);
}

function calcularPrecioSabores(prodBase, listaSabores) {
  const base = precioBaseProducto(prodBase);
  const precios = (listaSabores || []).map(s => Number(s?.precio) || 0);
  return precios.length ? Math.max(base, ...precios) : base;
}

function descripcionBaseItem(item) {
  return String(item?.descripcion || "").split("(")[0].trim();
}

function ventaEstaBloqueada() {
  if (ventaBloqueada) {
    mostrarMensaje("No se puede modificar una venta cobrada", "error");
    return true;
  }
  if (ventaTieneEnvioCocinaBloqueado()) {
    return true;
  }
  return false;
}

function pedidoRequiereCocina() {
  if (POS_SIN_COCINA) return false;
  return pedidoActual.items.some(item =>
    item.destino_impresion
  );
}

function generarUuidCocina() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }

  return `cocina-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function leerColaEnviosCocina() {
  try {
    const raw = localStorage.getItem(COCINA_QUEUE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function escribirColaEnviosCocina(cola = []) {
  try {
    localStorage.setItem(COCINA_QUEUE_KEY, JSON.stringify(cola));
  } catch {
    // noop
  }
}

function guardarEnCola(envio = {}, cambios = {}) {
  const cola = leerColaEnviosCocina();
  const uuid = String(envio.uuid || cambios.uuid || "").trim();
  if (!uuid) return null;

  const base = {
    uuid,
    ventaId: Number(envio.ventaId || cambios.ventaId || 0),
    numeroPedido: Number(envio.numeroPedido || cambios.numeroPedido || 0),
    clienteNombre: String(envio.clienteNombre || cambios.clienteNombre || "Ocasional"),
    reimprimir: !!(envio.reimprimir || cambios.reimprimir),
    estado: "pendiente",
    reintentos: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    nextAttemptAt: Date.now()
  };

  const indice = cola.findIndex((item) => item.uuid === uuid);
  const actual = indice >= 0 ? cola[indice] : base;
  const actualizado = {
    ...actual,
    ...envio,
    ...cambios,
    uuid,
    ventaId: Number(cambios.ventaId ?? envio.ventaId ?? actual.ventaId ?? 0),
    numeroPedido: Number(cambios.numeroPedido ?? envio.numeroPedido ?? actual.numeroPedido ?? 0),
    clienteNombre: String(cambios.clienteNombre ?? envio.clienteNombre ?? actual.clienteNombre ?? "Ocasional"),
    reimprimir: !!(cambios.reimprimir ?? envio.reimprimir ?? actual.reimprimir),
    updatedAt: Date.now()
  };

  if (indice >= 0) {
    cola[indice] = actualizado;
  } else {
    cola.push(actualizado);
  }

  escribirColaEnviosCocina(cola);
  return actualizado;
}

function quitarDeCola(uuid) {
  const normalized = String(uuid || "").trim();
  if (!normalized) return;
  const cola = leerColaEnviosCocina().filter((item) => item.uuid !== normalized);
  escribirColaEnviosCocina(cola);
}

function obtenerEnvioPendientePorVenta(ventaId) {
  const objetivo = Number(ventaId || 0);
  if (!objetivo) return null;

  return leerColaEnviosCocina().find((item) =>
    Number(item.ventaId) === objetivo && item.estado !== "enviado"
  ) || null;
}

function hayEnvioCocinaPendienteActual() {
  if (POS_SIN_COCINA) return false;
  return Number(pedidoActual?.id || 0) > 0
    && Number(cocinaPendienteLocalVentaId || 0) === Number(pedidoActual.id)
    && Boolean(obtenerEnvioPendientePorVenta(pedidoActual.id));
}

function envioCocinaAgotado(envio) {
  if (!envio) return false;
  if (String(envio.estado || "").toLowerCase() === "sin_conexion") return true;
  return Number(envio.reintentos || 0) >= COCINA_REINTENTOS_MAX;
}

function programarSiguienteReintento(envio, incremento = 0) {
  const reintentosBase = Number(envio?.reintentos || 0);
  const reintentos = Math.max(0, reintentosBase + incremento);
  const delay = COCINA_RETRY_DELAYS_MS[Math.min(reintentos, COCINA_RETRY_DELAYS_MS.length - 1)] || COCINA_RETRY_DELAYS_MS[COCINA_RETRY_DELAYS_MS.length - 1];

  return guardarEnCola(envio, {
    estado: "pendiente",
    reintentos,
    nextAttemptAt: Date.now() + delay
  });
}

function actualizarEstadoPreparoUI(estado = "idle", texto = "") {
  const badge = document.getElementById("estadoPreparo");
  const btn = document.querySelector(".btn-preparo");
  if (!badge || !btn) return;

  const estadoNormalizado = String(estado || "idle").toLowerCase();
  const config = {
    idle: { clase: "estado-preparo-idle", texto: "Sin envio", loading: false },
    procesando: { clase: "estado-preparo-procesando", texto: "Procesando", loading: true },
    pendiente: { clase: "estado-preparo-pendiente", texto: "Pendiente", loading: false },
    enviado: { clase: "estado-preparo-enviado", texto: "Enviado", loading: false }
  };

  const actual = config[estadoNormalizado] || config.idle;

  badge.textContent = texto || actual.texto;
  badge.className = `estado-preparo ${actual.clase}`;
  btn.classList.toggle("btn-procesando", actual.loading);
}

function sincronizarEstadoPreparoActual() {
  if (!pedidoActual?.id) {
    cocinaPendienteLocalVentaId = null;
    actualizarEstadoPreparoUI("idle");
    return;
  }

  const envioPendiente = obtenerEnvioPendientePorVenta(pedidoActual.id);

  if (envioPendiente) {
    cocinaPendienteLocalVentaId = Number(pedidoActual.id);
    if (envioCocinaAgotado(envioPendiente)) {
      actualizarEstadoPreparoUI("pendiente", "Sin conexion impresora");
      return;
    }
    actualizarEstadoPreparoUI(
      envioPendiente.estado === "procesando" ? "procesando" : "pendiente"
    );
    return;
  }

  cocinaPendienteLocalVentaId = null;

  if (pedidoActual.estado === "CONCLUIDO") {
    actualizarEstadoPreparoUI("enviado");
    return;
  }

  actualizarEstadoPreparoUI(pedidoRequiereCocina() ? "pendiente" : "idle");
}

function crearErrorEnvioCocina(message, code = "ERROR", extra = {}) {
  const error = new Error(message || "Error de cocina");
  error.code = code;
  Object.assign(error, extra);
  return error;
}

function ventaTieneEnvioCocinaBloqueado() {
  if (POS_SIN_COCINA) return false;
  if (!hayEnvioCocinaPendienteActual()) return false;
  const envioPendiente = obtenerEnvioPendientePorVenta(pedidoActual.id);
  if (envioCocinaAgotado(envioPendiente)) {
    mostrarMensaje("Sin conexion con la impresora de cocina. Puede reintentar desde Imprimir Preparo", "aviso");
    return true;
  }
  mostrarMensaje("Esta venta sigue pendiente de cocina. Se reintentará automáticamente", "aviso");
  return true;
}

function cerrarModalFactura() {
  limpiarFormularioFactura();
  cerrarModal("modalFactura");
  if (ventaBloqueada) {
    vaciarPOS();
  }
}


function mostrarHintFullscreen() {
  const btn = document.getElementById("btnLock");
  if (!btn) return;

  const hint = document.createElement("div");
  hint.id = "hintFullscreen";
  hint.className = "hint-fullscreen";
  hint.innerText = " Toca para pantalla completa";

  document.body.appendChild(hint);

  // posicionar EXACTO sobre el botï¿½n
  const rect = btn.getBoundingClientRect();

  hint.style.top = (rect.bottom + 8) + "px";
  hint.style.left = rect.left + "px";

  // ocultar solo
  setTimeout(() => {
    hint.remove();
  }, 3000);

  // si toca el boton ocultar
  btn.addEventListener("click", () => hint.remove(), { once: true });
}

// mostrar al iniciar
window.addEventListener("load", () => {
  setTimeout(mostrarHintFullscreen, 800);
});


function abrirModal(id) {
  const el = document.getElementById(id);
  if (!el) return;

  document.body.style.overflow = "hidden";
  el.classList.add("show");
}

function cerrarModal(id) {
  const el = document.getElementById(id);
  if (!el) return;

  el.classList.remove("show");
  document.body.style.overflow = "";
}

document.getElementById("clienteCodigo").addEventListener("focus", function () {
  this.select();
});

document.getElementById("clienteNombre").addEventListener("focus", function () {
  this.select();
});
/* =========================
  CATEGORIAS
========================= */

async function cargarCotizacionPOS() {

  try {

    const res = await fetch("/api/cotizacion/hoy");
    const data = await res.json();

    cotizacion.brl = Number(data.brl) || 0;
    cotizacion.usd = Number(data.usd) || 0;
    cambio.usd = cotizacion.usd;
    cambio.brl = cotizacion.brl;

  } catch (err) {

    console.log("No se pudo cargar cotizaciÃ³n");

  }

}

async function cargarCategorias() {
  try {
    const res = await fetch("/api/categorias/pos");
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      mostrarMensaje(data?.error || "No se pudieron cargar las categorias del POS", "error");
      categorias = [];
      renderCategorias();
      return;
    }
    categorias = Array.isArray(data) ? data : [];
    if (!categorias.length) {
      mostrarMensaje(
        "No hay categorias activas. Cargue datos de prueba o cree categorias en el sistema.",
        "error"
      );
    }
    renderCategorias();
  } catch (error) {
    mostrarMensaje("No se pudieron cargar las categorias", "error");
    categorias = [];
    renderCategorias();
  }
}

function renderCategorias() {
  const cont = document.getElementById("categorias");
  cont.innerHTML = "";

  categorias.forEach(cat => {
    const div = document.createElement("div");
    div.className = "card-categoria";

    // Android: distinguir toque de scroll para no bloquear el deslizamiento
    let touchMovido = false;
    div.addEventListener("touchstart", () => { touchMovido = false; }, { passive: true });
    div.addEventListener("touchmove", () => { touchMovido = true; }, { passive: true });
    div.addEventListener("touchend", (e) => {
      if (!touchMovido) { e.preventDefault(); cargarProductos(cat.id); }
    }, { passive: false });
    div.addEventListener("click", () => cargarProductos(cat.id));

    div.innerHTML = `
          <div class="img-wrapper">
            ${cat.imagen
        ? `<img src="${cat.imagen}" onerror="this.onerror=null;this.src='/recursos/img/default.png'">`
        : `<span style="font-size:40px;">ðŸ”</span>`}
          </div>
          <div class="nombre-categoria">${cat.nombre}</div>
        `;

    cont.appendChild(div);
  });
}

/* =========================
  PRODUCTOS
========================= */

async function cargarProductos(categoriaId) {
  categoriaActual = categoriaId;
  productosFiltrados = [];
  const buscador = document.getElementById("busquedaRapidaPOS");
  if (buscador) buscador.value = "";

  localStorage.setItem("categoriaPOS", categoriaId);

  document.getElementById("categorias").style.display = "none";
  document.getElementById("productos").style.display = "grid";

  const btn = document.getElementById("btnNav");
  btn.innerText = " Categoria";

  try {
    const res = await fetch(`/api/productos/pos/${categoriaId}`);
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      mostrarMensaje(data?.error || "No se pudieron cargar los productos", "error");
      productos = [];
      renderProductos();
      return;
    }
    productos = Array.isArray(data) ? data : [];
    renderProductos();
  } catch (error) {
    mostrarMensaje("No se pudieron cargar los productos", "error");
    productos = [];
    renderProductos();
  }
}

function volverCategorias() {
  document.getElementById("productos").style.display = "none";
  document.getElementById("categorias").style.display = "grid";
  productosFiltrados = [];

  localStorage.removeItem("categoriaPOS");
  const btn = document.getElementById("btnNav");
  btn.innerText = "Salir";
}

function renderProductos() {
  const cont = document.getElementById("productos");
  cont.innerHTML = "";

  const lista = Array.isArray(productosFiltrados) && productosFiltrados.length
    ? productosFiltrados
    : productos;

  lista.forEach(prod => {
    const div = document.createElement("div");
    div.className = "card-producto";


    div.draggable = true;

    /* =========================
      LONG PRESS (600ms)
    ========================= */

    div.addEventListener("mousedown", () => {

      timerLongPress = setTimeout(() => {
        longPressActivo = true;
        div.classList.add("drag-activo");
        if (!modoMoverProductos) {
          const cantidadTxt = window.prompt(`Cantidad para "${prod.nombre}"`, "1");
          const cantidad = Number(cantidadTxt);
          div.classList.remove("drag-activo");
          /* Si el prompt roba foco, mouseup puede no llegar al div y longPressActivo quedaba en true:
             el siguiente click se tragaba en silencio (if longPressActivo return). */
          longPressActivo = false;
          if (Number.isFinite(cantidad) && cantidad > 0) {
            agregarProducto(prod, Math.floor(cantidad));
          }
        }

      }, 450);

    });

    div.addEventListener("mouseup", () => {
      clearTimeout(timerLongPress);
      longPressActivo = false;
      div.classList.remove("drag-activo");
    });

    /* =========================
      DRAG START
    ========================= */

    div.addEventListener("dragstart", (e) => {

      if (!longPressActivo || !modoMoverProductos) {
        e.preventDefault();
        return;
      }

      productoArrastrado = prod;
      div.classList.add("dragging");

    });

    /* =========================
      DRAG OVER
    ========================= */

    div.addEventListener("dragover", (e) => {
      e.preventDefault();
    });

    /* =========================
      DROP
    ========================= */

    div.addEventListener("drop", async () => {

      if (!productoArrastrado) return;

      const indexA = productos.findIndex(p => p.id === productoArrastrado.id);
      const indexB = productos.findIndex(p => p.id === prod.id);

      if (indexA === -1 || indexB === -1) return;

      const movido = productos.splice(indexA, 1)[0];
      productos.splice(indexB, 0, movido);

      longPressActivo = false;

      guardarOrdenProductos();

      renderProductos();

    });


    div.addEventListener("touchstart", () => {

      timerLongPress = setTimeout(() => {

        longPressActivo = true;
        div.classList.add("drag-activo");
        if (!modoMoverProductos) {
          const cantidadTxt = window.prompt(`Cantidad para "${prod.nombre}"`, "1");
          const cantidad = Number(cantidadTxt);
          div.classList.remove("drag-activo");
          longPressActivo = false;
          if (Number.isFinite(cantidad) && cantidad > 0) {
            agregarProducto(prod, Math.floor(cantidad));
          }
        }

      }, 450);

    }, { passive: true });

    div.addEventListener("touchend", () => {
      clearTimeout(timerLongPress);
      longPressActivo = false;
      div.classList.remove("drag-activo");
    });


    // Android: distinguir toque de scroll para no bloquear el deslizamiento
    let touchMovido = false;
    div.addEventListener("touchstart", () => { touchMovido = false; }, { passive: true });
    div.addEventListener("touchmove", () => { touchMovido = true; }, { passive: true });
    div.addEventListener("touchend", (e) => {
      if (!touchMovido && !longPressActivo) {
        e.preventDefault();
        ultimoTouchAgregarProductoMs = Date.now();
        agregarProducto(prod);
      }
    }, { passive: false });


    div.addEventListener("click", (e) => {
      if (longPressActivo) {
        longPressActivo = false;
        div.classList.remove("drag-activo");
        return;
      }

      if (Date.now() - ultimoTouchAgregarProductoMs < 650) {
        return;
      }

      e.preventDefault();
      e.stopPropagation();

      agregarProducto(prod);
    });

    div.innerHTML = `
      <div class="img-wrapper">
        ${prod.imagen
        ? `<img 
              loading="eager"
              decoding="async"
              src="${prod.imagen}"
              width="120"
              height="120"
              style="object-fit: cover;"
              onerror="this.onerror=null;this.src='/recursos/img/default.png'">`
        : `<span style="font-size:40px;">ðŸ½ï¸</span>`}
      </div>

    <div class="info-producto">
      <div class="nombre-producto">${prod.nombre}</div>

      ${prod.descripcion
        ? `<div class="descripcion-producto">${prod.descripcion}</div>`
        : ""}

      <div class="precio-producto">Gs ${formatearGs(prod.precio)}</div>
    </div>
    `;

    cont.appendChild(div);
  });
}

async function cargarSabores() {
  const res = await fetch("/api/productos/sabores");
  sabores = await res.json();
}

async function guardarOrdenProductos() {

  const orden = productos.map((p, i) => ({
    id: p.id,
    orden: i + 1
  }));

  try {

    await fetch("/api/venta/productos/orden", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(orden)
    });

  } catch (err) {

    console.log("No se pudo guardar orden");

  }

}

function actualizarPreviewPrecioPizza() {
  const inputPrecio = $("editPrecioPizza");
  if (!inputPrecio || !productoActualSabores) return;

  const precioCalculado = calcularPrecioSabores(productoActualSabores, saboresSeleccionados);
  const valorActual = parseGs(inputPrecio.value);

  const base = precioBaseProducto(productoActualSabores);
  const precioAnteriorCalculado = calcularPrecioSabores(
    productoActualSabores,
    saboresSeleccionados
  );

  const fueManual = valorActual > 0 && valorActual !== base && valorActual !== precioAnteriorCalculado;

  if (!fueManual) {
    inputPrecio.value = formatearGs(precioCalculado);
  }
}

function renderSeleccionados() {
  const cont = $("saboresSeleccionadosUI");
  cont.innerHTML = "";

  saboresSeleccionados.forEach(s => {
    const chip = document.createElement("div");
    chip.className = "chip-sabor";
    chip.innerText = s.nombre;

    chip.onclick = () => {
      saboresSeleccionados = saboresSeleccionados.filter(x => x.id !== s.id);
      renderSabores(valor("buscarSabor"));

      $("contadorSabores").innerText =
        `${saboresSeleccionados.length} / ${productoActualSabores?.max_sabores || 4}`;

      actualizarPreviewPrecioPizza();
      renderSeleccionados();
    };

    cont.appendChild(chip);
  });
}

document.addEventListener("dragend", () => {
  modoMoverProductos = false;
  productoArrastrado = null;
});

function formatearGs(valor) {
  return new Intl.NumberFormat("es-PY", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(valor || 0);
}

function normalizarBusqueda(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[áàâä]/g, "a")
    .replace(/[éèêë]/g, "e")
    .replace(/[íìîï]/g, "i")
    .replace(/[óòôö]/g, "o")
    .replace(/[úùûü]/g, "u")
    .replace(/ñ/g, "n")
    .replace(/ç/g, "c")
    .trim();
}

function filtrarProductosRapido(valor) {
  const txt = normalizarBusqueda(valor);
  if (!txt) {
    productosFiltrados = [];
    renderProductos();
    return;
  }

  productosFiltrados = productos.filter((p) => {
    const nombre = normalizarBusqueda(p?.nombre);
    const codigo = String(p?.codigo_barra || "");
    const id = String(p?.id || "");
    return nombre.includes(txt) || codigo.includes(txt) || id === txt;
  });

  renderProductos();
}

window.ajustarCantidadEdit = function (delta) {
  const input = document.getElementById("editCantidad");
  if (!input) return;
  const actual = parseFloat(input.value) || 0;
  const paso = parseFloat(input.step) || 1;
  const nuevo = Math.max(0, actual + (delta * paso));
  input.value = Number.isInteger(nuevo) ? String(nuevo) : nuevo.toFixed(2).replace(/\.?0+$/, "");
  input.focus();
  input.dispatchEvent(new Event("input", { bubbles: true }));
};

/* =========================
  PEDIDO - CREAR / CARGAR
========================= */

document.getElementById("tipoPedido").addEventListener("change", async function () {

  if (cargandoPedido) return;
  if (!tipoPedidoVisiblePOS()) return;

  if (!ventaPosIdValido(pedidoActual.id)) return;

  if (ventaTieneEnvioCocinaBloqueado()) {
    aplicarTipoPedidoEnSelectPOS(localStorage.getItem("tipoPedidoPOS"));
    return;
  }

  const tipoPedidoId = getTipoPedidoSeleccionadoPOS();
  if (!tipoPedidoId) {
    mostrarMensaje("Seleccione un tipo de pedido valido", "error");
    return;
  }

  try {
    await fetch("/api/venta/tipo-pedido", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        venta_id: pedidoActual.id,
        tipo_pedido_id: tipoPedidoId
      })
    });

    console.log("Tipo pedido actualizado:", tipoPedidoId);

  } catch (err) {
    console.log("No se pudo actualizar tipo pedido");
  }

});

async function crearNuevoPedido() {
  if (!validarPermisoVentaRapida("venta_rapida_nueva", "No tiene permiso para crear pedidos nuevos")) {
    return;
  }

  const tipoPedido = getTipoPedidoSeleccionadoPOS();
  if (tipoPedidoVisiblePOS() && !tipoPedido) {
    mostrarMensaje("No hay tipo de pedido activo disponible", "error");
    return;
  }
  const vendedorId = Number(document.getElementById("vendedorCodigo").value || 0) || 1;
  const payload = {
    vendedor_id: vendedorId
  };

  if (tipoPedidoVisiblePOS()) {
    payload.tipo_pedido_id = tipoPedido;
  }

  const res = await fetch("/api/venta/nuevo", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok || data?.error) {
    mostrarMensaje(data?.error || "No se pudo crear la venta (revisar consola del servidor)", "error");
    return;
  }
  const nuevaId = Number(data.id);
  if (!ventaPosIdValido(nuevaId)) {
    mostrarMensaje("Respuesta invalida al crear venta", "error");
    return;
  }

  pedidoActual.id = nuevaId;
  pedidoActual.numero = data.numero != null ? data.numero : null;

  const nroInput = document.getElementById("pedidoNumero");
  if (nroInput) {
    nroInput.value = data.numero != null && data.numero !== undefined ? String(data.numero) : "";
  }



  /*  GUARDAR CLIENTE SI YA ESTA CARGADO */
  const clienteId = document.getElementById("clienteCodigo").value || 1;
  const clienteNombre = document.getElementById("clienteNombre").value || "Ocasional";

  try {
    await fetch("/api/venta/cliente", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        venta_id: pedidoActual.id,
        cliente_id: clienteId,
        cliente_nombre: clienteNombre
      })
    });
  } catch (err) {
    console.log("No se pudo guardar cliente");
  }

}

async function guardarVendedorEnVentaActual() {

  if (!ventaPosIdValido(pedidoActual.id)) return;

  const vendedorId = Number(document.getElementById("vendedorCodigo").value || 0) || 1;
  const vendedorNombre = document.getElementById("vendedorNombre").value || "";

  await fetch("/api/venta/vendedor", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      venta_id: pedidoActual.id,
      vendedor_id: vendedorId,
      vendedor_nombre: vendedorNombre
    })
  });
}

async function cargarVendedorPorDefecto() {
  try {
    const res = await fetch("/api/venta/vendedores/1");
    const data = await res.json();
    document.getElementById("vendedorCodigo").value = data.id;
    document.getElementById("vendedorNombre").value = data.nombre;
  } catch (err) {
    mostrarMensaje("No se pudo cargar el vendedor por defecto", "error");
  }
}

async function cargarClientePorDefecto() {
  if (ventaPosIdValido(pedidoActual.id)) return;
  try {
    const res = await fetch("/api/venta/clientes/1");
    const data = await res.json();
    document.getElementById("clienteCodigo").value = data.id;
    document.getElementById("clienteNombre").value = data.nombre;
  } catch (err) {
    mostrarMensaje("No se pudo cargar el cliente por defecto", "error");
  }
}

/* =========================
  modal de PEDIDO DE PIZZA VARIOS SABORES OJO
========================= */
function renderSabores(filtro = "") {

  const lista = document.getElementById("listaSabores");
  lista.innerHTML = "";

  const texto = filtro.toLowerCase().trim();

  sabores.forEach(sabor => {

    if (productoActualSabores && sabor.id === productoActualSabores.id) {
      return;
    }

    if (texto && !String(sabor.nombre || "").toLowerCase().includes(texto)) {
      return;
    }

    const div = document.createElement("div");
    div.className = "sabor-item";

    if (saboresSeleccionados.some(s => s.id === sabor.id)) {
      div.classList.add("activo");
    }

    div.innerHTML = `
          <div class="sabor-card">
            <img src="${sabor.imagen || '/recursos/img/default.png'}" />
            <div class="sabor-info">
              <div class="sabor-nombre">${sabor.nombre}</div>
              <div class="sabor-precio">Gs ${formatearGs(sabor.precio)}</div>
            </div>
          </div>
        `;

    div.onclick = () => seleccionarSabor(sabor);

    lista.appendChild(div);
  });
}

function abrirModalSabores(prod) {

  productoActualSabores = prod;
  saboresSeleccionados = [];

  const input = document.getElementById("buscarSabor");

  input.value = "";

  //  BUSCADOR EN TIEMPO REAL
  input.oninput = (e) => {
    renderSabores(e.target.value);
  };

  //  CONTADOR
  document.getElementById("contadorSabores").innerText =
    "0 / " + (prod.max_sabores || 4);

  //  MOSTRAR MODAL
  abrirModal("modalSabores");

  //  RENDER INICIAL
  renderSabores();
  renderSeleccionados();
}

function seleccionarSabor(sabor) {
  const max = productoActualSabores?.max_sabores || 4;

  const yaExiste = saboresSeleccionados.some(s => s.id === sabor.id);

  if (yaExiste) {
    saboresSeleccionados = saboresSeleccionados.filter(s => s.id !== sabor.id);
  } else {
    if (saboresSeleccionados.length >= max) {
      mostrarMensaje("MÃ¡ximo " + max + " sabores", "aviso");
      return;
    }
    saboresSeleccionados.push(sabor);
  }

  $("contadorSabores").innerText = `${saboresSeleccionados.length} / ${max}`;

  renderSabores(valor("buscarSabor"));
  actualizarPreviewPrecioPizza();
  renderSeleccionados();
}

async function confirmarSabores() {
  const item = pedidoActual.items[itemEditando];
  if (!item) return;

  const precioCalculado = calcularPrecioSabores(productoActualSabores, saboresSeleccionados);

  item.cantidad = parseInt(valor("editCantidadPizza")) || 1;
  item.sabores = [...saboresSeleccionados];

  const baseDescripcion = descripcionBaseItem(item);
  item.descripcion = saboresSeleccionados.length
    ? `${baseDescripcion} (${saboresSeleccionados.map(s => s.nombre).join(" / ")})`
    : baseDescripcion;

  const precioInput = parseGs(valor("editPrecioPizza"));
  item.precioManual = precioInput > 0 ? precioInput : precioCalculado;

  const saboresTexto = saboresSeleccionados.map(s => s.nombre).join(" / ");
  const obsManual = valor("editObsPizza");

  item.observacion = saboresTexto
    ? saboresTexto + (obsManual ? " | " + obsManual : "")
    : obsManual;

  iniciarPersistenciaDetalle();
  try {
    const res = await fetch(`/api/venta/editar-item/${item.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cantidad: item.cantidad,
        precio: item.precioManual,
        observacion: item.observacion
      })
    });

    if (!res.ok) {
      throw new Error("No se pudo guardar la edición del producto");
    }
  } catch (err) {
    console.log("Error guardando item:", err);
  } finally {
    finalizarPersistenciaDetalle();
  }

  cerrarModalSabores();
  renderPedido();
}

function cerrarModalSabores() {
  cerrarModal("modalSabores");
}

async function agregarProducto(prod, cantidadSolicitada = 1) {

  if (ventaEstaBloqueada()) return;

  if (!ventaPosIdValido(pedidoActual.id)) {
    await crearNuevoPedido();

    if (!ventaPosIdValido(pedidoActual.id)) {
      mostrarMensaje("Error creando pedido", "error");
      return;
    }
  }

  try {

    // BUSCAR SI YA EXISTE
    const itemExistente = pedidoActual.items.find(
      i => i.producto_id === prod.id
        && !i.observacion
        && !i.nota
        && !i.permite_multi_sabor
    );

    const qty = Math.max(1, Math.floor(Number(cantidadSolicitada) || 1));

    if (itemExistente) {

      //  EVITAR si aÃºn no tiene ID real
  if (itemExistente.loading) {
  mostrarMensaje("Espere un momento...", "aviso");
  return;
}

      const cantidadAnterior = itemExistente.cantidad;
      itemExistente.cantidad += qty;
      renderPedido();

      iniciarPersistenciaDetalle();
      try {
        const res = await fetch(`/api/venta/editar-item/${itemExistente.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cantidad: itemExistente.cantidad,
            precio: itemExistente.precioManual,
            observacion: ""
          })
        });

        if (!res.ok) {
          throw new Error("Error actualizando");
        }
      } catch {
        itemExistente.cantidad = cantidadAnterior;
        renderPedido();
        mostrarMensaje("Error actualizando", "error");
      } finally {
        finalizarPersistenciaDetalle();
      }

      return;
    }

    //  NUEVO ITEM (TEMPORAL)
    const nuevoItem = {
      id: generarTempId(),
      loading: true,
      producto_id: prod.id,
      destino_impresion:
        prod.destino_impresion === "Ninguno" ? null : prod.destino_impresion,
      descripcion: prod.nombre,
      precio: prod.precio,
      precioOriginal: prod.precio,
      precioManual: prod.precio,
      cantidad: qty,
      confirmado: false,
      observacion: "",
      nota: "",
      permite_multi_sabor: !!prod.permite_multi_sabor,
      tiene_preparo: !!prod.tiene_preparo,
      efectivacion_directa: !!prod.efectivacion_directa,
      no_control_stock: !!prod.no_control_stock
    };

    pedidoActual.items.push(nuevoItem);
    renderPedido();
    actualizarEstadoCocinaUI();

    //  BACKEND
    iniciarPersistenciaDetalle();
    try {
      const res = await fetch("/api/venta/agregar-item", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          venta_id: pedidoActual.id,
          producto_id: prod.id,
          cantidad: qty,
          precio: prod.precio
        })
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || data.error) {
        throw new Error(data.error || "Error guardando en servidor");
      }

      if (!data?.item_id) {
        throw new Error("Respuesta invÃ¡lida");
      }

      nuevoItem.id = Number(data.item_id);
      nuevoItem.loading = false;

      // ðŸ”¥ ACTIVAR MODO FACTURA
      if (data.requiere_factura) {
        ventaModoFactura = true;
      }
    } catch (err) {
      console.error(err);
      const idx = pedidoActual.items.indexOf(nuevoItem);
      if (idx >= 0) {
        pedidoActual.items.splice(idx, 1);
        renderPedido();
        actualizarEstadoCocinaUI();
      }
      mostrarMensaje(err.message || "Error guardando en servidor", "error");
    } finally {
      finalizarPersistenciaDetalle();
    }

  } catch (err) {
    mostrarMensaje("Error general", "error");
  }
}


/* =========================
  RENDER PEDIDO
========================= */

function renderPedido() {

  sincronizarEstadoVisualPedido();

  if (pedidoActual.estado === "PENDIENTE" && ventaPosIdValido(pedidoActual.id)) {
    const tipoPedidoPersistido = tipoPedidoVisiblePOS()
      ? (getTipoPedidoSeleccionadoPOS() || getTipoPedidoDefaultPOS() || null)
      : null;

    const limpio = {
      ...pedidoActual,
      fecha: pedidoActual.fecha,
      items: pedidoActual.items,
      tipo_pedido_id: tipoPedidoPersistido
    };

    localStorage.setItem("pedidoPOS", JSON.stringify(limpio));
  }

  const cont = document.getElementById("orderList");

  let html = "";
  let total = 0;
  let cantidadTotalItems = 0;
  const edicionBloqueadaPorCocina = hayEnvioCocinaPendienteActual();

  pedidoActual.items.forEach((item, index) => {

    const precioUsado = item.precioManual || item.precio || 0;
    const subtotal = precioUsado * item.cantidad;

    total += subtotal;
    cantidadTotalItems += item.cantidad;

    html += `
        <div class="item-mini ${item.confirmado ? 'confirmado' : ''}">

          <div class="col-cantidad" onclick="editarItem(${index})">
            ${item.cantidad}
          </div>

          <div class="col-descripcion" onclick="editarItem(${index})">
            ${item.descripcion}
            ${(item.observacion || item.nota)
        ? `<div class="observacion">ðŸ“ ${item.observacion || item.nota}</div>`
        : ""}
          </div>

          <div class="col-precio" onclick="editarItem(${index})">
            Gs ${formatearGs(subtotal)}
          </div>

          <div class="col-acciones">

            <button class="btn-eliminar"
              ${edicionBloqueadaPorCocina ? "disabled" : ""}
              onclick="event.stopPropagation(); removeItem(${index})">
              <img src="/recursos/img/x.png">
            </button>

            <button class="btn-confirmar"
              ${edicionBloqueadaPorCocina ? "disabled" : ""}
              onclick="event.stopPropagation(); confirmarItem(${index})">
              <img src="/recursos/img/confirmar.png">
            </button>

          </div>

        </div>
      `;
  });

  const fragment = document.createDocumentFragment();
  const temp = document.createElement("div");
  temp.innerHTML = html;

  while (temp.firstChild) {
    fragment.appendChild(temp.firstChild);
  }

  cont.innerHTML = "";
  cont.appendChild(fragment);

  const totalGs = total;

  const totalUsd = cambio.usd > 0 ? totalGs / cambio.usd : 0;
  const totalBrl = cambio.brl > 0 ? totalGs / cambio.brl : 0;

  document.getElementById("total").innerHTML = `
    <div class="totales-monedas">

      <div class="moneda">
        <span class="label">Gs</span>
        <span class="valor">${formatearGs(totalGs)}</span>
      </div>

        <div class="moneda">
        <span class="label">BRL</span>
        <span class="valor">${totalBrl.toFixed(2)}</span>
      </div>

      <div class="moneda">
        <span class="label">USD</span>
        <span class="valor">${totalUsd.toFixed(2)}</span>
      </div>


    </div>
    `;

  document.getElementById("cantidadItems").innerText = cantidadTotalItems;

  if (tipoPedidoVisiblePOS()) {
    localStorage.setItem("tipoPedidoPOS", document.getElementById("tipoPedido").value);
  } else {
    localStorage.removeItem("tipoPedidoPOS");
  }
  actualizarEstadoCocinaUI();
  sincronizarEstadoPreparoActual();
}

/* =========================
  ACCIONES ITEMS
========================= */

async function confirmarItem(index) {
  if (ventaEstaBloqueada()) return;

  const item = pedidoActual.items[index];

  item.confirmado = !item.confirmado;

  renderPedido();

  //  GUARDAR EN BACKEND
  try {

    await fetch(`/api/venta/confirmar-item/${item.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        confirmado: item.confirmado
      })
    });

  } catch (err) {
    console.log("Error confirmando item");
  }
}

function actualizarEstadoCocinaUI() {

  const btn = document.querySelector(".btn-efectivizar");
  if (!btn) return;

  // SOLO visual (NO bloquear)
  if (pedidoRequiereCocina() && pedidoActual.estado !== "CONCLUIDO") {
    btn.classList.add("btn-alerta-cocina");
  } else {
    btn.classList.remove("btn-alerta-cocina");
  }
}

async function removeItem(i) {

  if (ventaEstaBloqueada()) return;

  const item = pedidoActual.items[i];

  // Si el item tiene id de DB, borrarlo del backend tambiÃ©n
  if (item && item.id > 0) {
    iniciarPersistenciaDetalle();
    try {
      const res = await fetch(`/api/venta/detalle/${item.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        mostrarMensaje(data.error || "No se pudo eliminar el producto", "error");
        return;
      }
    } catch (err) {
      mostrarMensaje("Sin conexiÃ³n. VerificÃ¡ que el sistema estÃ© activo", "error");
      return;
    } finally {
      finalizarPersistenciaDetalle();
    }
  }

  pedidoActual.items.splice(i, 1);

  if (!pedidoRequiereCocina()) {
    console.log("Ya no requiere cocina");
  }

  if (pedidoActual.items.length === 0) {
    pedidoActual.items = [];
    document.getElementById("pedidoNumero").value = pedidoActual.numero || "";
    localStorage.removeItem("pedidoPOS");
  }

  renderPedido();
  actualizarEstadoCocinaUI();

}

function editarItem(index) {

  if (ventaEstaBloqueada()) return;

  const item = pedidoActual.items[index];

  //  BLOQUEO CRÃTICO
if (!item || item.loading) {
  mostrarMensaje("Espere un momento...", "aviso");
  return;
}

  itemEditando = index;

  const obsPizza = $("editObsPizza");
  if (obsPizza) {
    obsPizza.style.height = "auto";
    obsPizza.style.height = obsPizza.scrollHeight + "px";
    obsPizza.oninput = function () {
      this.style.height = "auto";
      this.style.height = this.scrollHeight + "px";
    };
  }

  if (item.permite_multi_sabor) {
    productoActualSabores = {
      ...item,
      precio: item.precioOriginal || item.precio
    };

    saboresSeleccionados = item.sabores ? [...item.sabores] : [];

    setValor("editCantidadPizza", item.cantidad);
    setValor("editPrecioPizza", formatearGs(item.precioManual || item.precioOriginal || item.precio));
    setValor("editObsPizza", item.observacion || "");

    $("contadorSabores").innerText =
      `${saboresSeleccionados.length} / ${item.max_sabores || productoActualSabores.max_sabores || 4}`;

    abrirModal("modalSabores");

    renderSabores(valor("buscarSabor"));
    renderSeleccionados();
    return;
  }

  setValor("editCantidad", item.cantidad);
  setValor("editPrecio", formatearGs(item.precioManual || item.precio || 0));
  setValor("editObservacion", item.observacion || "");

  abrirModal("modalEditarItem");
}

function cerrarModalEditar() {
  cerrarModal("modalEditarItem");
}

async function guardarEdicion() {
  if (ventaEstaBloqueada()) return;

  const item = pedidoActual.items[itemEditando];

  const cantidad = parseInt(document.getElementById("editCantidad").value);
  let precioTexto = document.getElementById("editPrecio").value;
  precioTexto = precioTexto.replace(/\./g, "");
  const precio = parseFloat(precioTexto);
  const observacion = document.getElementById("editObservacion").value;

  iniciarPersistenciaDetalle();
  try {
    const res = await fetch(`/api/venta/editar-item/${item.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cantidad, precio, observacion })
    });

    if (!res.ok) {
      let detalle = `HTTP ${res.status}`;
      try {
        const errData = await res.json();
        detalle = errData?.error || errData?.detalle || detalle;
        console.error("[EDITAR ITEM] backend:", errData);
      } catch (_) {}
      throw new Error(detalle);
    }

    item.cantidad = cantidad;
    item.precioManual = precio;
    item.observacion = observacion;
    item.nota = observacion;

    cerrarModalEditar();
    renderPedido();

  } catch (err) {
    mostrarMensaje(`No se pudo guardar: ${err.message}`, "error");
  } finally {
    finalizarPersistenciaDetalle();
  }
}

/* =========================
  GESTION MESA
========================= */

function setMesaActivaEnUI(mesa = null) {
  mesaActivaId = mesa && Number(mesa.id) > 0 ? Number(mesa.id) : null;
  document.getElementById("mesa").value = mesa?.numero || "";
}

function iniciarPersistenciaDetalle() {
  persistenciasDetallePendientes += 1;
}

function finalizarPersistenciaDetalle() {
  persistenciasDetallePendientes = Math.max(0, persistenciasDetallePendientes - 1);
}

function hayPersistenciaDetallePendiente() {
  if (persistenciasDetallePendientes > 0) return true;

  return pedidoActual.items.some((item) => {
    const idNumerico = Number(item?.id || 0);
    return item?.loading === true || idNumerico <= 0;
  });
}

function validarPersistenciaAntesDeImprimir() {
  if (!hayPersistenciaDetallePendiente()) return true;
  mostrarMensaje("Aguarda unos segundos, hay productos pendientes de guardar", "aviso");
  return false;
}

function obtenerPayloadSeleccionMesaPOS(mesa = null) {
  const tipoPedido = tipoPedidoVisiblePOS()
    ? (getTipoPedidoSeleccionadoPOS() || getTipoPedidoDefaultPOS())
    : null;
  const vendedorId = Number(document.getElementById("vendedorCodigo").value || 0) || 1;

  return {
    tipo_pedido_id: tipoPedido,
    vendedor_id: vendedorId,
    venta_id: mesa?.venta_id ? null : (pedidoActual.id || null)
  };
}

function obtenerMesaSimpleSeleccionada() {
  return mesasSimple.find((mesa) => Number(mesa.id) === Number(mesaSimpleSeleccionadaId)) || null;
}

function renderMesasSimple() {
  const lista = document.getElementById("mesaSimpleLista");
  if (!lista) return;

  const filtro = String(document.getElementById("mesaSimpleFiltro")?.value || "")
    .trim()
    .toLowerCase();

  const filtradas = mesasSimple.filter((mesa) => {
    if (!filtro) return true;
    const numero = String(mesa.numero || "").toLowerCase();
    const estado = String(mesa.estado || "").toLowerCase();
    return numero.includes(filtro) || estado.includes(filtro);
  });

  lista.innerHTML = "";

  if (!filtradas.length) {
    lista.innerHTML = '<div class="mesa-simple-empty">No hay mesas disponibles</div>';
    return;
  }

  filtradas.forEach((mesa) => {
    const item = document.createElement("button");
    item.type = "button";

    const esSeleccionada = Number(mesa.id) === Number(mesaSimpleSeleccionadaId);
    const esActiva = Number(mesa.id) === Number(mesaActivaId);
    const estadoMesa = String(mesa.estado || "LIBRE").toUpperCase();

    item.className = "mesa-simple-item";
    if (esSeleccionada) item.classList.add("selected");
    if (esActiva) item.classList.add("active");
    item.classList.add(`estado-${estadoMesa.toLowerCase()}`);

    item.innerHTML = `
      <span class="mesa-simple-numero">${mesa.numero || "-"}</span>
      <span class="mesa-simple-meta">${mesa.venta_numero ? `Pedido ${mesa.venta_numero}` : estadoMesa}</span>
    `;

    item.addEventListener("click", (event) => {
      if (event.detail > 1) return;
      seleccionarMesaSimple(mesa.id);
    });

    item.addEventListener("dblclick", async (event) => {
      event.preventDefault();
      seleccionarMesaSimple(mesa.id);
      await confirmarMesaSimple();
    });

    let ultimaPulsacionTouch = 0;
    item.addEventListener(
      "touchend",
      async (event) => {
        event.preventDefault();

        const ahora = Date.now();
        if (ahora - ultimaPulsacionTouch <= 320) {
          ultimaPulsacionTouch = 0;
          seleccionarMesaSimple(mesa.id);
          await confirmarMesaSimple();
          return;
        }

        ultimaPulsacionTouch = ahora;
        seleccionarMesaSimple(mesa.id);
      },
      { passive: false }
    );

    lista.appendChild(item);
  });
}

async function recargarMesasSimple() {
  try {
    const res = await fetch("/api/mesa?venta_rapida=1");
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || "No se pudieron cargar mesas");
    }

    mesasSimple = Array.isArray(data) ? data : [];

    if (!mesaSimpleSeleccionadaId && mesaActivaId) {
      mesaSimpleSeleccionadaId = mesaActivaId;
    }

    if (
      mesaSimpleSeleccionadaId &&
      !mesasSimple.some((mesa) => Number(mesa.id) === Number(mesaSimpleSeleccionadaId))
    ) {
      mesaSimpleSeleccionadaId = mesaActivaId || null;
    }

    renderMesasSimple();
  } catch (err) {
    mostrarMensaje(err.message || "No se pudieron cargar mesas", "error");
  }
}

function seleccionarMesaSimple(mesaId) {
  mesaSimpleSeleccionadaId = Number(mesaId) || null;
  renderMesasSimple();
}

async function confirmarMesaSimple() {
  if (mesaSimpleConfirmando) {
    return;
  }

  const mesa = obtenerMesaSimpleSeleccionada();

  if (!mesa) {
    mostrarMensaje("Selecciona una mesa", "aviso");
    return;
  }

  mesaSimpleConfirmando = true;
  try {
    let data = null;
    const mesaTieneOtraVentaActiva =
      Number(mesa?.venta_id || 0) > 0 &&
      Number(mesa?.venta_id || 0) !== Number(pedidoActual.id || 0);

    if (ventaPosIdValido(pedidoActual.id) && !mesaTieneOtraVentaActiva) {
      const resAsignar = await fetch("/api/mesa/asignar-venta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          venta_id: pedidoActual.id,
          mesa: mesa.numero
        })
      });

      const asignacion = await resAsignar.json();
      if (!resAsignar.ok) {
        throw new Error(asignacion.error || "No se pudo asignar la mesa");
      }

      data = {
        mesa: asignacion?.mesa || null,
        venta: { id: pedidoActual.id }
      };
    } else {
      const payload = obtenerPayloadSeleccionMesaPOS(mesa);
      const res = await fetch(`/api/mesa/seleccionar/${mesa.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "No se pudo abrir la mesa");
      }
    }

    cerrarModal("modalMesaSimple");

    const ventaId = Number(data?.venta?.id || 0);
    if (ventaId) {
      await cargarVentaPorId(ventaId);
    }

    if (data?.mesa) {
      setMesaActivaEnUI(data.mesa);
    }
  } catch (err) {
    mostrarMensaje(err.message || "No se pudo abrir la mesa", "error");
  } finally {
    mesaSimpleConfirmando = false;
  }
}

async function abrirTecladoMesa() {
  abrirModal("modalMesaSimple");
  mesaSimpleSeleccionadaId = mesaActivaId || mesaSimpleSeleccionadaId;
  await recargarMesasSimple();
}


/* =========================
  TECLADO PEDIDO
========================= */

function abrirTecladoPedido() {
  document.getElementById("pedidoTemp").value = "";
  abrirModal("modalPedido");
}

function agregarNumeroPedido(n) {
  document.getElementById("pedidoTemp").value += n;
}

function borrarNumeroPedido() {
  const input = document.getElementById("pedidoTemp");
  input.value = input.value.slice(0, -1);
}

function confirmarPedido() {
  const numero = document.getElementById("pedidoTemp").value;
  document.getElementById("pedidoNumero").value = numero;
  cerrarModal("modalPedido");
  buscarPedidoPorNumero();
}


/* =========================
  BLOQUEAR VENTA
========================= */

function bloquearVenta() {

  document.getElementById("clienteCodigo").disabled = true;
  document.getElementById("clienteNombre").disabled = true;
  document.getElementById("vendedorCodigo").disabled = true;
  document.getElementById("vendedorNombre").disabled = true;
  document.getElementById("mesa").disabled = true;
  document.getElementById("tipoPedido").disabled = true;
  document.querySelector('button[onclick="abrirModuloCliente()"]').disabled = true;
  document.querySelector('button[onclick="abrirModuloVendedor()"]').disabled = true;

}

/* =========================
  VACIAR POS (usado internamente)
========================= */

function vaciarPOS() {

  ventaBloqueada = false;
  ventaModoFactura = false;
  cocinaPendienteLocalVentaId = null;
  pedidoActual = { id: null, numero: null, items: [], estado: "PENDIENTE" };
  ventaActual = pedidoActual;

  localStorage.removeItem("pedidoPOS");
  aplicarTipoPedidoEnSelectPOS(getTipoPedidoDefaultPOS());

  desbloquearVenta();
  actualizarVisibilidadTipoPedidoPOS();

  // REACTIVAR BOTÃ“N EFECTIVIZAR
  const btn = document.querySelector(".btn-efectivizar");
  if (btn) {
    const permitido = tienePermisoVentaRapida("venta_rapida_efectivizar");
    btn.disabled = !permitido;
    btn.classList.toggle("btn-efectivizar-desactivado", !permitido);
  }

  document.getElementById("pedidoNumero").value = "";

  sincronizarEstadoVisualPedido("PENDIENTE");

  setMesaActivaEnUI(null);
  mesaSimpleSeleccionadaId = null;

  document.getElementById("clienteCodigo").value = 1;
  document.getElementById("clienteNombre").value = "Ocasional";

  renderPedido();
  aplicarPermisosVentaRapidaUI();
  actualizarEstadoPreparoUI("idle");
}

function desbloquearVenta() {

  document.getElementById("clienteCodigo").disabled = false;
  document.getElementById("clienteNombre").disabled = false;
  document.getElementById("vendedorCodigo").disabled = false;
  document.getElementById("vendedorNombre").disabled = false;
  document.getElementById("mesa").disabled = false;
  document.getElementById("tipoPedido").disabled = !tipoPedidoVisiblePOS();

}


/* =========================
  EFECTIVIZAR
========================= */
function mostrarToast(msg, tipo = "info") {
  if (!document.getElementById("posToastKeyframes")) {
    const s = document.createElement("style");
    s.id = "posToastKeyframes";
    s.textContent =
      "@keyframes posToastFadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}";
    document.head.appendChild(s);
  }
  const colores = {
    success: "#2e7d32",
    error: "#c62828",
    info: "#1565c0"
  };
  const div = document.createElement("div");
  div.textContent = msg;
  div.style.cssText = `
    position:fixed; bottom:24px; right:24px; z-index:9999;
    background:${colores[tipo] || colores.info}; color:#fff;
    padding:12px 20px; border-radius:8px; font-size:15px;
    box-shadow:0 4px 12px rgba(0,0,0,0.3); max-width:320px;
    animation: posToastFadeIn 0.2s ease;
  `;
  document.body.appendChild(div);
  setTimeout(() => div.remove(), 3500);
}

let panelVentasEsperaFlotante = null;
let _labelBtnEsperaOriginal = null;

function cerrarPanelVentasEspera() {
  if (panelVentasEsperaFlotante && panelVentasEsperaFlotante.parentNode) {
    panelVentasEsperaFlotante.remove();
    panelVentasEsperaFlotante = null;
  }
  cerrarModal("modalVentasEsperaPOS");
}

function actualizarBadgeEspera() {
  const btn =
    document.getElementById("btnPedidoEnEsperaPOS") ||
    document.querySelector('button[onclick="ponerVentaEnEspera()"]');
  if (!btn) return;
  if (_labelBtnEsperaOriginal === null) {
    _labelBtnEsperaOriginal = (btn.textContent || "")
      .replace(/\s*\(\d+\)\s*$/, "")
      .trim() || "En espera";
  }
  const n = ventasEnEspera.length;
  if (n > 0) {
    btn.textContent = `${_labelBtnEsperaOriginal} (${n})`;
  } else {
    btn.textContent = _labelBtnEsperaOriginal;
  }
}

async function mostrarPanelEspera() {
  cerrarPanelVentasEspera();

  const wrap = document.createElement("div");
  wrap.id = "panelVentasEsperaPOS";
  wrap.style.cssText =
    "position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:10050;display:flex;align-items:center;justify-content:center;padding:16px;";
  const box = document.createElement("div");
  box.style.cssText =
    "background:#fff;border-radius:10px;max-width:440px;width:100%;max-height:70vh;overflow:auto;padding:16px;box-shadow:0 8px 24px rgba(0,0,0,.25);";
  box.innerHTML = `
    <h3 style="margin:0 0 12px">Ventas en espera</h3>
    <div id="listaPanelEsperaInner" style="min-height:48px">Cargando...</div>
    <div style="margin-top:12px">
      <button type="button" id="btnCerrarPanelEspera" class="btn-neutral">Cerrar</button>
    </div>`;

  wrap.appendChild(box);
  wrap.addEventListener("click", (e) => { if (e.target === wrap) cerrarPanelVentasEspera(); });
  box.querySelector("#btnCerrarPanelEspera").addEventListener("click", cerrarPanelVentasEspera);
  document.body.appendChild(wrap);
  panelVentasEsperaFlotante = wrap;

  try {
    const res = await fetch("/api/venta/en-espera?limit=50", { credentials: "include" });
    const data = await res.json();
    const lista = box.querySelector("#listaPanelEsperaInner");

    const ventas = Array.isArray(data) ? data : (data.ventas || data.data || []);

    if (!ventas.length) {
      lista.innerHTML = '<p style="color:#999;text-align:center;padding:16px 0">No hay ventas en espera</p>';
      return;
    }

    // Sincronizar array en memoria con lo que hay en la BD
    ventasEnEspera = ventas.map(v => ({ id: v.id, numero: v.numero, total: v.total }));

    lista.innerHTML = "";
    ventas.forEach((v) => {
      const totalStr  = Number(v.total || 0).toLocaleString("es-PY");
      const notaStr   = v.nota_espera ? ` — ${v.nota_espera}` : "";
      const clienteStr = v.cliente_nombre ? `<br><small style="color:#888">${v.cliente_nombre}</small>` : "";
      const row = document.createElement("div");
      row.style.cssText =
        "display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 0;border-bottom:1px solid #eee;";
      row.innerHTML = `
        <div>
          <span style="font-weight:600">Venta #${v.numero ?? v.id}</span>
          <span style="color:#555"> — Gs ${totalStr}${notaStr}</span>
          ${clienteStr}
        </div>`;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = "Reanudar";
      btn.className = "btn-success";
      btn.addEventListener("click", () => reanudarVenta(v.id));
      row.appendChild(btn);
      lista.appendChild(row);
    });
  } catch (_) {
    const lista = box.querySelector("#listaPanelEsperaInner");
    lista.innerHTML = '<p style="color:#c62828;text-align:center">Error cargando ventas en espera</p>';
  }
}

async function procesarVenta(modo = "detallado") {
  if (procesando) return;

  if (!validarPermisoVentaRapida("venta_rapida_efectivizar", "No tiene permiso para efectivizar ventas")) {
    return;
  }

  if (ventaBloqueada) {
    mostrarToast("Esta venta ya fue cobrada", "error");
    return;
  }

  if (!ventaActual || !ventaPosIdValido(ventaActual.id)) {
    mostrarToast("Agregá productos antes de cobrar", "error");
    return;
  }

  if (!ventaActual.items.length) {
    mostrarToast("Agregá productos antes de cobrar", "error");
    return;
  }

  if (ventaModoFactura) {
    abrirModalFactura();
    return;
  }

  const modoStr = String(modo || "detallado");

  if (modoStr !== "rapido" && modoStr !== "rapido_ticket") {
    procesando = true;
    try {
      modoCobroSolicitado = modoStr;
      localStorage.setItem("modoCobroPOS", modoStr);
      const url = `/modulos/caja/caja.html?venta_id=${encodeURIComponent(String(ventaActual.id))}&from=venta`;
      const esCapacitor = typeof window.Capacitor !== "undefined";
      const esPantallaVertical = window.matchMedia(
        "(max-width: 1024px) and (orientation: portrait)"
      ).matches;
      if (esCapacitor || esPantallaVertical) {
        window.location.href = url;
      } else {
        window.open(url, "_blank");
      }
    } finally {
      procesando = false;
    }
    return;
  }

  procesando = true;
  try {
    const totalPagar = calcularTotalPedido();

    const res = await fetch("/api/caja/cobrar", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ventas: [Number(ventaActual.id)],
        metodo: "EFECTIVO",
        pago_gs: totalPagar,
        pago_brl: 0,
        pago_usd: 0,
        total_pagado_gs: totalPagar
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      mostrarToast(data.error || "Error al cobrar", "error");
      return;
    }
    if (data.ok === false && data.error) {
      mostrarToast(data.error, "error");
      return;
    }

    mostrarToast("✔ Cobrado", "success");
    if (modoStr === "rapido_ticket") {
      window.open(`/api/print-preview/venta/${ventaActual.id}`, "_blank");
    }
    await new Promise((r) => setTimeout(r, 800));
    await nuevoPedido();
  } catch (e) {
    mostrarToast("Error de conexión", "error");
  } finally {
    procesando = false;
  }
}


async function ejecutarReanudarDesdeEspera(vid) {
  try {
    const res = await fetch(`/api/venta/reanudar/${vid}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      mostrarToast(data.error || "No se pudo reanudar", "error");
      return;
    }
    await cargarVentaPorId(vid);
    ventaActual = pedidoActual;
    ventasEnEspera = ventasEnEspera.filter((x) => Number(x.id) !== Number(vid));
    actualizarBadgeEspera();
    cerrarPanelVentasEspera();
    renderPedido();
    mostrarToast("Venta reanudada", "success");
  } catch (e) {
    mostrarToast("Error de conexión", "error");
  }
}

async function reanudarVenta(id) {
  const vid = Number(id);
  if (!ventaPosIdValido(vid)) return;

  const borradorTieneItems = Array.isArray(pedidoActual?.items) && pedidoActual.items.length > 0;

  if (borradorTieneItems) {
    // Abrir en nueva ventana para no perder la venta actual
    cerrarPanelVentasEspera();
    const url = `${window.location.pathname}?reanudar_id=${vid}`;
    const popup = window.open(url, `venta_espera_${vid}`, "width=1280,height=800");
    if (!popup) window.location.href = url;
    return;
  }

  await ejecutarReanudarDesdeEspera(vid);
}

async function reanudarVentaEnEspera(id) {
  return reanudarVenta(id);
}

async function ponerVentaEnEspera() {
  if (!ventaActual || !ventaPosIdValido(ventaActual.id)) {
    mostrarToast("No hay venta activa", "error");
    return;
  }
  if (!ventaActual.items.length) {
    mostrarToast("Agregá productos antes de poner en espera", "error");
    return;
  }
  try {
    const res = await fetch(`/api/venta/en-espera/${ventaActual.id}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nota_espera: "En espera desde POS", prioridad_espera: 1 })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.error) {
      mostrarToast(data?.error || "No se pudo guardar en espera", "error");
      return;
    }
    ventasEnEspera.push({
      id: ventaActual.id,
      numero: ventaActual.numero,
      total: calcularTotalPedido()
    });
    actualizarBadgeEspera();
    mostrarToast("Venta en espera", "info");
    await nuevoPedido();
  } catch (error) {
    mostrarToast(error.message || "Error de conexión", "error");
  }
}

function preguntarFacturaPostCobro() {

  const modo = (permisos.modo_factura || "PREGUNTAR")
    .toString()
    .trim()
    .toUpperCase();

  console.log("Modo factura:", modo);

  // =========================
  // 1. PREGUNTAR
  // =========================
  if (modo === "PREGUNTAR") {

    mostrarConfirmar(
      "Â¿Desea generar factura?",
      () => abrirModalFactura(),
      () => vaciarPOS()
    );

    return;
  }

  // =========================
  // 2. NUNCA
  // =========================
  if (modo === "NUNCA") {

    vaciarPOS();
    return;
  }

  // =========================
  // 3. SIEMPRE
  // =========================
  if (modo === "SIEMPRE") {

    abrirModalFactura();
    return;
  }

  // fallback
  vaciarPOS();
}

function postCobroDesdeCaja(ventaId) {

  ventaBloqueada = true;
  bloquearVenta();

  if (ventaId) {
    pedidoActual.id = Number(String(ventaId).split(",")[0]) || pedidoActual.id;
  }

  mostrarMensaje("? Venta cobrada correctamente", "ok");

  const modo = String(localStorage.getItem("modoCobroPOS") || "detallado");
  localStorage.removeItem("modoCobroPOS");

  if (modo === "rapido_ticket") {
    printVenta()
      .catch(() => null)
      .finally(() => vaciarPOS());
    return;
  }

  if (modo === "rapido") {
    vaciarPOS();
    return;
  }

  preguntarFacturaPostCobro();
}

function consumirPostCobroPendiente() {
  const params = new URLSearchParams(window.location.search);

  const flagURL = params.get("post_cobro");
  const ventaIdURL = params.get("venta_id");

  const flagLS = localStorage.getItem("postCobroDesdeCaja");
  const ventaIdLS = localStorage.getItem("postCobroVentaId");

  let ventaIdCobrada = null;

  if (flagURL === "1" && ventaIdURL) {
    ventaIdCobrada = ventaIdURL;
  } else if (flagLS === "1" && ventaIdLS) {
    ventaIdCobrada = ventaIdLS;
  }

  if (!ventaIdCobrada) return;

  localStorage.removeItem("postCobroDesdeCaja");
  localStorage.removeItem("postCobroVentaId");

  if (flagURL === "1") {
    params.delete("post_cobro");
    const nuevaURL = params.toString()
      ? `${window.location.pathname}?${params.toString()}`
      : window.location.pathname;
    history.replaceState(null, "", nuevaURL);
  }

  postCobroDesdeCaja(ventaIdCobrada);
}

function limpiarFormularioFactura() {
  document.getElementById("rucFacturaInput").value = "";
  document.getElementById("nombreFacturaInput").value = "Consumidor Final";
  document.getElementById("direccionFacturaInput").value = "";
  document.getElementById("ciudadFacturaInput").value = "";
}

function abrirModalFactura() {
  limpiarFormularioFactura();

  abrirModal("modalFactura");

  document.getElementById("totalFacturaPreview").innerText =
    formatearGs(calcularTotalPedido());

  fetch("/api/factura/preview-numero")
    .then(r => r.json())
    .then(data => {
      document.getElementById("numeroFacturaPreview").value = data.numero;
    });
}

function calcularTotalPedido() {
  return pedidoActual.items.reduce((acc, i) => {
    return acc + (i.precioManual || i.precio) * i.cantidad;
  }, 0);
}

document.getElementById("rucFacturaInput")
  .addEventListener("keydown", async function (e) {

    if (e.key !== "Enter") return;

    const ruc = this.value.trim();
    if (!ruc) return;

    try {

      const res = await fetch(`/api/clientes/ruc/${ruc}`);

      if (!res.ok) {
        mostrarMensaje("Error consultando RUC", "error");
        return;
      }

      const data = await res.json();

      if (!data) {
        const autoRes = await fetch("/api/clientes/guardar-o-buscar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ruc,
            nombre: "Cliente automático",
            razon_social: "Cliente automático",
            direccion: "Sin dirección",
            telefono: ""
          })
        });
        const autoData = await autoRes.json().catch(() => ({}));
        if (!autoRes.ok || !autoData?.id) {
          mostrarMensaje("RUC no encontrado", "aviso");
          return;
        }
        this.value = autoData.ruc || ruc;
        document.getElementById("nombreFacturaInput").value =
          autoData.nombre || autoData.razon_social || "Cliente automático";
        return;
      }

      this.value = data.ruc || ruc;

      const nombre = data.nombre || data.razon_social || "";

      document.getElementById("nombreFacturaInput").value = nombre;

    } catch (err) {
      console.error(err);
      mostrarMensaje("Error buscando RUC", "error");
    }
  });
//  SOLO NUMEROS + GUION EN RUC
document.getElementById("rucFacturaInput")
  .addEventListener("input", function () {

    let valor = this.value.replace(/[^0-9-]/g, '');

    const partes = valor.split("-");

    //  evitar mÃ¡s de un guion
    if (partes.length > 2) {
      valor = partes[0] + "-" + partes[1];
    }

    //  limitar formato
    if (partes[0]) partes[0] = partes[0].slice(0, 8);
    if (partes[1]) partes[1] = partes[1].slice(0, 1);

    this.value = partes.join("-");
  });


function normalizarRuc(ruc) {
  if (!ruc) return null;
  return ruc.split("-")[0].trim();
}

async function confirmarFactura() {

  const ventaId = pedidoActual.id;

  if (!ventaId) {
    mostrarMensaje("No hay venta activa", "error");
    return;
  }

  const rucInput = document.getElementById("rucFacturaInput").value.trim();
  const nombre = document.getElementById("nombreFacturaInput").value.trim();
  const direccion = document.getElementById("direccionFacturaInput").value.trim();

  const ruc = rucInput || null;

  try {

    // =========================
    // 1. CREAR O BUSCAR CLIENTE
    // =========================
    const resCliente = await fetch("/api/clientes/guardar-o-buscar", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        ruc,
        nombre,
        direccion
      })
    });

    let clienteData = null;

    try {
      clienteData = await resCliente.json();
    } catch {
      mostrarMensaje("Respuesta invÃ¡lida del servidor", "error");
      return;
    }

    if (!resCliente.ok || !clienteData?.id) {
      mostrarMensaje(clienteData?.error || "Error guardando cliente", "error");
      return;
    }

    // =========================
    // 2. GUARDAR CLIENTE EN VENTA
    // =========================
    const resVentaCliente = await fetch("/api/venta/cliente", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        venta_id: ventaId,
        cliente_id: clienteData.id,
        cliente_nombre: clienteData.nombre || "OCASIONAL",
      })
    });

    if (!resVentaCliente.ok) {
      mostrarMensaje("Error guardando cliente en venta", "error");
      return;
    }

    // =========================
    // 3. GENERAR FACTURA
    // =========================
    const res = await fetch(`/api/factura/generar/${ventaId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        ruc,
        nombre,
        direccion: direccion || null
      })
    });

    const data = await res.json();

    if (!res.ok) {
      mostrarMensaje(data.error || "Error generando factura", "error");
      return;
    }

    // =========================
    // 4. ABRIR FACTURA
    // =========================
  window.location.href = `/modulos/factura/factura_ticket.html?id=${data.id}`;

    mostrarMensaje("âœ” Factura generada e impresa", "ok");

    ventaBloqueada = true;
    bloquearVenta();
    desactivarBotonEfectivizar();
    cerrarModalFactura();
    // =========================
    // 5. LIMPIAR
    // =========================
    setTimeout(() => {

      const estadoDiv = document.getElementById("estadoPedido");
      estadoDiv.innerText = "EFECTIVADO";
      estadoDiv.className = "estado estado-efectivado";

      vaciarPOS();

    }, 300);

  } catch (err) {
    console.error(err);
    mostrarMensaje("Error de conexiÃ³n", "error");
  }
}

function desactivarBotonEfectivizar() {

  const btn = document.querySelector(".btn-efectivizar");

  if (!btn) return;

  btn.disabled = true;
  btn.classList.add("btn-efectivizar-desactivado");

}


function buscarClienteFactura() {

  const popup = window.open(
    "/modulos/cliente/cliente.html?modo=seleccion",
    "seleccionarCliente",
    `width=${window.innerWidth},height=${window.innerHeight}`
  );

  const interval = setInterval(() => {

    if (!popup || popup.closed) {
      clearInterval(interval);

      const clienteSel = localStorage.getItem("clienteSeleccionado");

      if (!clienteSel) return;

      const cliente = JSON.parse(clienteSel);

      document.getElementById("clienteCodigoFactura").value = cliente.id;
      document.getElementById("nombreFacturaInput").value = cliente.nombre;
      document.getElementById("rucFacturaInput").value = cliente.ruc || "";
      document.getElementById("direccionFacturaInput").value = cliente.direccion || "";

      localStorage.removeItem("clienteSeleccionado");
    }

  }, 300);
}

/* =========================
  IMPRIMIR PREPARO (COCINA)
  Flujo: /api/print/imprimir-cocina/:id (normal y reimpresiÃ³n)
========================= */

function crearEnvioCocinaDesdePedido({ reimprimir = false } = {}) {
  return {
    uuid: generarUuidCocina(),
    ventaId: Number(pedidoActual.id || 0),
    numeroPedido: Number(pedidoActual.numero || 0),
    clienteNombre: document.getElementById("clienteNombre").value || "Ocasional",
    reimprimir: !!reimprimir,
    estado: "pendiente",
    reintentos: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    nextAttemptAt: Date.now()
  };
}

async function fetchConTimeoutJson(url, options = {}, timeoutMs = COCINA_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal
    });

    const data = await res.json().catch(() => ({}));
    return { res, data };
  } catch (err) {
    if (err?.name === "AbortError") {
      throw crearErrorEnvioCocina("Tiempo agotado en cocina", "TIMEOUT");
    }

    throw crearErrorEnvioCocina(
      "Sin conexion o red inestable hacia cocina",
      "NETWORK",
      { originalError: err }
    );
  } finally {
    clearTimeout(timer);
  }
}

async function validarImpresora(envio) {
  if (!navigator.onLine) {
    throw crearErrorEnvioCocina("Sin conexion", "OFFLINE");
  }

  const { res, data } = await fetchConTimeoutJson(
    `/api/print/imprimir-cocina/${envio.ventaId}/validar`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        request_uuid: envio.uuid,
        reimprimir: !!envio.reimprimir
      })
    },
    COCINA_VALIDACION_TIMEOUT_MS
  );

  if (!res.ok && !data?.sin_pendientes && !data?.duplicado) {
    throw crearErrorEnvioCocina(
      data.error || "No se pudo validar la impresora",
      "VALIDACION",
      { data }
    );
  }

  return data || {};
}

async function enviarPedido(envio) {
  const { res, data } = await fetchConTimeoutJson(
    `/api/print/imprimir-cocina/${envio.ventaId}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cliente_nombre: envio.clienteNombre,
        reimprimir: !!envio.reimprimir,
        request_uuid: envio.uuid
      })
    },
    COCINA_TIMEOUT_MS
  );

  if (!res.ok || !data?.ok) {
    throw crearErrorEnvioCocina(
      data.error || data.mensaje || "Error al enviar a cocina",
      "BACKEND",
      { data, status: res.status }
    );
  }

  return data;
}

async function finalizarEnvioCocinaExitoso(envio, data = {}, { desdeFondo = false } = {}) {
  quitarDeCola(envio.uuid);

  const mismaVenta = Number(pedidoActual?.id || 0) === Number(envio.ventaId || 0);
  if (mismaVenta) {
    cocinaPendienteLocalVentaId = null;
    pedidoActual.estado = "CONCLUIDO";

    const estado = document.getElementById("estadoPedido");
    if (estado) {
      estado.innerText = "CONCLUIDO";
      estado.className = "estado estado-concluido";
    }

    actualizarEstadoPreparoUI("enviado");
  }

  const numeroPedido = Number(envio.numeroPedido || pedidoActual?.numero || 0) || 0;
  const etiquetaPedido = numeroPedido > 0 ? `Pedido Nro ${numeroPedido}` : "Pedido";
  mostrarMensaje(`${etiquetaPedido} enviado a cocina`, "ok");

  if (mismaVenta) {
    await cargarClientePorDefecto();
    vaciarPOS();
  } else if (desdeFondo) {
    sincronizarEstadoPreparoActual();
  }

  return data;
}

function dejarEnvioCocinaPendiente(envio, {
  mensaje = "Reintentando envio automaticamente",
  incrementarReintento = false,
  procesando = false,
  avisar = true
} = {}) {
  let actualizado = procesando
    ? guardarEnCola(envio, {
        estado: "procesando",
        nextAttemptAt: Date.now() + 1500
      })
    : programarSiguienteReintento(envio, incrementarReintento ? 1 : 0);

  if (!procesando && envioCocinaAgotado(actualizado)) {
    return marcarEnvioCocinaSinConexion(actualizado, { avisar });
  }

  cocinaPendienteLocalVentaId = Number(envio.ventaId || 0) || cocinaPendienteLocalVentaId;

  if (Number(pedidoActual?.id || 0) === Number(envio.ventaId || 0)) {
    actualizarEstadoPreparoUI(procesando ? "procesando" : "pendiente");
  }

  if (avisar) {
    mostrarMensaje(mensaje, "aviso");
  }

  return actualizado;
}

function marcarEnvioCocinaSinConexion(envio, { avisar = false } = {}) {
  const yaNotificado = !!envio?.limiteNotificado;
  const actualizado = guardarEnCola(envio, {
    estado: "sin_conexion",
    limiteNotificado: true
  });

  if (Number(pedidoActual?.id || 0) === Number(envio?.ventaId || 0)) {
    actualizarEstadoPreparoUI("pendiente", "Sin conexion impresora");
  }

  if (avisar && !yaNotificado) {
    mostrarMensaje("Sin conexion con la impresora de cocina", "aviso");
  }

  return actualizado;
}

async function procesarEnvioCocinaPendiente(envio, { desdeFondo = false } = {}) {
  let actual = guardarEnCola(envio, {
    estado: "procesando",
    nextAttemptAt: Date.now()
  });

  if (Number(pedidoActual?.id || 0) === Number(actual.ventaId || 0)) {
    cocinaPendienteLocalVentaId = Number(actual.ventaId || 0);
    actualizarEstadoPreparoUI("procesando");
  }

  try {
    const validacion = await validarImpresora(actual);

    if (validacion?.estado === "ENVIADO" || validacion?.sin_pendientes) {
      return await finalizarEnvioCocinaExitoso(actual, validacion, { desdeFondo });
    }

    if (validacion?.estado === "PROCESANDO") {
      dejarEnvioCocinaPendiente(actual, {
        mensaje: "El pedido sigue en proceso. Reintentaremos automaticamente",
        procesando: true,
        avisar: !desdeFondo
      });
      return null;
    }

    const data = await enviarPedido(actual);

    if (String(data?.estado || "").toUpperCase() === "PROCESANDO") {
      dejarEnvioCocinaPendiente(actual, {
        mensaje: "El pedido sigue en proceso. Reintentaremos automaticamente",
        procesando: true,
        avisar: !desdeFondo
      });
      return null;
    }

    return await finalizarEnvioCocinaExitoso(actual, data, { desdeFondo });
  } catch (err) {
    const mensajeSuave = "Reintentando envio automaticamente";

    dejarEnvioCocinaPendiente(actual, {
      mensaje: mensajeSuave,
      incrementarReintento: !!desdeFondo,
      avisar: true
    });

    return null;
  }
}

async function reintentarEnvios({ forzar = false } = {}) {
  if (POS_SIN_COCINA) return;
  if (reintentandoEnviosCocina) return;
  if (!navigator.onLine) return;

  const cola = leerColaEnviosCocina()
    .filter((item) => !item.reimprimir && item.estado !== "enviado")
    .sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0));

  if (!cola.length) {
    sincronizarEstadoPreparoActual();
    return;
  }

  reintentandoEnviosCocina = true;

  try {
    const ahora = Date.now();

    for (const envio of cola) {
      const reintentos = Number(envio.reintentos || 0);
      if (reintentos >= COCINA_REINTENTOS_MAX) {
        marcarEnvioCocinaSinConexion(envio, {
          avisar: Number(pedidoActual?.id || 0) === Number(envio?.ventaId || 0)
        });
        continue;
      }
      if (!forzar && Number(envio.nextAttemptAt || 0) > ahora) continue;
      await procesarEnvioCocinaPendiente(envio, { desdeFondo: true });
    }
  } finally {
    reintentandoEnviosCocina = false;
    sincronizarEstadoPreparoActual();
  }
}

function iniciarMotorReintentosCocina() {
  if (POS_SIN_COCINA) {
    escribirColaEnviosCocina([]);
    sincronizarEstadoPreparoActual();
    return;
  }

  if (intervaloReintentoCocina) return;

  intervaloReintentoCocina = window.setInterval(() => {
    reintentarEnvios().catch(() => {});
  }, COCINA_REINTENTO_INTERVAL_MS);

  window.addEventListener("online", () => {
    reintentarEnvios({ forzar: true }).catch(() => {});
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      reintentarEnvios({ forzar: true }).catch(() => {});
    }
  });
}

async function printPreparo() {
  if (POS_SIN_COCINA) {
    mostrarMensaje("El flujo de cocina/preparo esta desactivado para libreria y servicios", "aviso");
    return;
  }

  if (!validarPermisoVentaRapida("venta_rapida_imprimir_preparo", "No tiene permiso para imprimir preparo")) {
    return;
  }

  if (pedidoActual.estado === "CANCELADO") {
    mostrarMensaje("Esta venta está cancelada y no puede enviarse a cocina", "error");
    return;
  }

  if (pedidoActual.estado === "EFECTIVADO") {
    mostrarMensaje("Esta venta ya fue cobrada y no puede enviarse a cocina", "error");
    return;
  }

  if (!ventaPosIdValido(pedidoActual.id)) {
    mostrarMensaje("Primero agrega productos al pedido", "error");
    return;
  }

  if (!validarPersistenciaAntesDeImprimir()) {
    return;
  }

  const btn = document.querySelector(".btn-preparo");

  if (pedidoActual.estado === "CONCLUIDO") {

    mostrarConfirmar(
      "Esta venta ya fue enviada a cocina.\n¿Deseas reimprimir la comanda?",
      async () => {

        if (!validarPersistenciaAntesDeImprimir()) {
          return;
        }

        if (imprimiendoCocina) {
          mostrarMensaje("La comanda ya se esta enviando a cocina...", "aviso");
          return;
        }

        imprimiendoCocina = true;
        if (btn) btn.disabled = true;
        actualizarEstadoPreparoUI("procesando");

        try {
          const data = await enviarPedido(crearEnvioCocinaDesdePedido({ reimprimir: true }));
          if (String(data?.estado || "").toUpperCase() === "ENVIADO") {
            actualizarEstadoPreparoUI("enviado");
          }
          mostrarMensaje("Comanda reimpresa", "ok");
        } catch (err) {
          mostrarMensaje(err.message || "No se pudo reimprimir la comanda", "aviso");
        } finally {
          imprimiendoCocina = false;
          if (btn) btn.disabled = false;
          sincronizarEstadoPreparoActual();
        }

      }
    );

    return;
  }
  const itemsPreparo = pedidoActual.items.filter(i =>
    i.destino_impresion
  );

  if (imprimiendoCocina) {
    mostrarMensaje("La comanda ya se esta enviando a cocina...", "aviso");
    return;
  }

  imprimiendoCocina = true;

  if (btn) btn.disabled = true;

  if (itemsPreparo.length === 0) {

    imprimiendoCocina = false;
    if (btn) btn.disabled = false;

    mostrarConfirmar(
      "Esta venta no tiene productos de preparo.\n¿Querés efectivizar directamente?",
      () => {
        if (!tienePermisoVentaRapida("venta_rapida_efectivizar")) {
          mostrarMensaje("No tiene permiso para efectivizar ventas", "error");
          return;
        }
        procesarVenta();
      }
    );

    return;
  }

  let envio = null;
  const envioPendiente = obtenerEnvioPendientePorVenta(pedidoActual.id);
  if (envioPendiente && Number(envioPendiente.reintentos || 0) < COCINA_REINTENTOS_MAX) {
    cocinaPendienteLocalVentaId = Number(pedidoActual.id || 0);
    actualizarEstadoPreparoUI("pendiente");
    mostrarMensaje("Esta venta ya está pendiente. Se reintentará automáticamente", "aviso");
    imprimiendoCocina = false;
    if (btn) btn.disabled = false;
    return;
  }

  if (envioPendiente) {
    envio = guardarEnCola(envioPendiente, {
      estado: "procesando",
      reintentos: 0,
      nextAttemptAt: Date.now()
    });
  } else {
    envio = guardarEnCola(crearEnvioCocinaDesdePedido(), {
      estado: "procesando",
      nextAttemptAt: Date.now()
    });
  }

  try {
    await procesarEnvioCocinaPendiente(envio, { desdeFondo: false });
  } finally {
    imprimiendoCocina = false;
    if (btn) btn.disabled = false;
    sincronizarEstadoPreparoActual();
  }
}

/* =========================
  IMPRIMIR VENTA (TICKET)
  FIX: imprime el ticket y luego efectiviza y vacÃ­a, sin doble apertura de caja
========================= */
async function printVenta() {
  if (!validarPermisoVentaRapida("venta_rapida_imprimir_venta", "No tiene permiso para imprimir venta")) {
    return;
  }

  if (!ventaPosIdValido(pedidoActual.id)) {
    mostrarMensaje("Primero agrega productos al pedido", "error");
    return;
  }

  if (pedidoActual.items.length === 0) {
    mostrarMensaje("El pedido esta vaciï¿½o", "error");
    return;
  }

  if (!validarPersistenciaAntesDeImprimir()) {
    return;
  }

  try {

    const res = await fetch("/api/print/venta", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        venta_id: pedidoActual.id,
        numero: pedidoActual.numero,
        fecha: document.getElementById("fechaPedido").value,
        cliente: document.getElementById("clienteNombre").value || "Ocasional"
      })
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.ok) {
      mostrarMensaje(data.error || "No se pudo imprimir el ticket", "error");
      return;
    }

    mostrarMensaje(`Ticket del pedido Nro ${pedidoActual.numero} enviado a impresora`, "ok");
    localStorage.removeItem("ticketPendienteVenta");

  } catch (err) {
    localStorage.setItem("ticketPendienteVenta", JSON.stringify({
      venta_id: pedidoActual.id,
      numero: pedidoActual.numero,
      ts: Date.now()
    }));
    mostrarMensaje("Sin conexion con la impresora", "error");
  }

}

async function reintentarTicketPendienteSiExiste() {
  const raw = localStorage.getItem("ticketPendienteVenta");
  if (!raw) return;
  try {
    const data = JSON.parse(raw);
    if (!data?.venta_id) return;
    const res = await fetch("/api/print/venta", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ venta_id: data.venta_id })
    });
    if (res.ok) {
      localStorage.removeItem("ticketPendienteVenta");
      mostrarMensaje("Ticket pendiente reintentado correctamente", "ok");
    }
  } catch {
    // noop
  }
}

/* =========================
  NUEVO PEDIDO / CANCELAR
========================= */

async function nuevoPedido() {
  if (!validarPermisoVentaRapida("venta_rapida_nueva", "No tiene permiso para crear pedidos nuevos")) {
    return;
  }

  vaciarPOS();


  const ahora = new Date();

  const fecha =
    ahora.getFullYear() + "-" +
    String(ahora.getMonth() + 1).padStart(2, '0') + "-" +
    String(ahora.getDate()).padStart(2, '0') + "T" +
    String(ahora.getHours()).padStart(2, '0') + ":" +
    String(ahora.getMinutes()).padStart(2, '0');

  if (!ventaPosIdValido(pedidoActual.id)) {
  document.getElementById("fechaPedido").value = fecha;
}

  localStorage.removeItem("cabeceraPOS");

  await cargarVendedorPorDefecto();
  await cargarClientePorDefecto();

  /* Crea la venta en servidor de inmediato (antes solo existia al agregar el primer producto). */
  await crearNuevoPedido();
}

async function cancelarPedido() {
  if (!validarPermisoVentaRapida("venta_rapida_cancelar", "No tiene permiso para cancelar pedidos")) {
    return;
  }

  if (ventaTieneEnvioCocinaBloqueado()) {
    return;
  }

  if (!ventaPosIdValido(pedidoActual.id)) {
    mostrarMensaje("No hay ningun pedido activo para cancelar", "error");
    return;
  }

  mostrarConfirmar(
    "¿Confirmas que querés cancelar esta venta?",
    async () => {
      try {
        const res = await fetch(`/api/venta/cancelar/${pedidoActual.id}`, {
          method: "POST"
        });

        const data = await res.json();

        if (!res.ok) {
          const errores = {
            "Venta ya cancelada": "Esta venta ya fue cancelada anteriormente",
            "Venta no existe": "No se encontró la venta",
          };
          const msg = errores[data.error] || "No se pudo cancelar la venta";
          mostrarMensaje(msg, "error");
          return;
        }

        vaciarPOS();
        mostrarMensaje("✓ Venta cancelada", "ok");

      } catch (err) {
        mostrarMensaje("Sin conexion. Verifica que el sistema esta activo", "error");
      }
    }
  );
}

/* =========================
  BUSCAR PEDIDO POR NÃšMERO
========================= */

function buscarMovimiento() {
  window.location.href = "/modulos/movimientoVenta/movimientoVenta.html";
}

async function buscarPedidoPorNumero() {
  if (!validarPermisoVentaRapida("venta_rapida_ver", "No tiene permiso para consultar pedidos")) {
    return;
  }

  const numero = document.getElementById("pedidoNumero").value;

  if (!numero) return;

  try {

    cargandoPedido = true;

    const res = await fetch(`/api/venta/buscar/${numero}`);
    const data = await res.json();

    if (!res.ok) {
      mostrarMensaje(data.error || "Pedido no encontrado", "error");
      return;
    }

    // =========================
    // CARGAR TODO DE UNA (MEJOR)
    // =========================
    pedidoActual = {
      id: data.id,
      numero: data.numero,
      fecha: data.fecha, // ðŸ”¥ CLAVE
      estado: data.estado,
      items: (data.items || []).map(d => ({
      id: Number(d.id) > 0 ? Number(d.id) : 0,

  producto_id: d.producto_id || null,
  descripcion: d.descripcion,

  cantidad: Number(d.cantidad),

  precio: Number(d.precio || 0),
  precioManual: Number(d.precio || 0),

  observacion: d.observacion || "",
  nota: d.nota || "",

  confirmado: d.confirmado ?? false,
  loading: false,

  permite_multi_sabor: !!d.permite_multi_sabor,
  tiene_preparo: !!d.tiene_preparo,
  efectivacion_directa: !!d.efectivacion_directa,
  no_control_stock: !!d.no_control_stock
}))
    };
    ventaActual = pedidoActual;

    document.getElementById("pedidoNumero").value = data.numero;
    setMesaActivaEnUI({ id: data.mesa_id, numero: data.mesa || "" });

    aplicarTipoPedidoEnSelectPOS(data.tipo_pedido_id);

    document.getElementById("clienteCodigo").value = data.cliente_id || 1;
    document.getElementById("clienteNombre").value = data.cliente_nombre || "Ocasional";

    document.getElementById("vendedorCodigo").value = data.vendedor_id || 1;
    document.getElementById("vendedorNombre").value = data.vendedor_nombre || "";

    // =========================
    // CONTROL SELECT
    // =========================
    const tipoSelect = document.getElementById("tipoPedido");

    if (!tipoPedidoVisiblePOS()) {
      tipoSelect.disabled = true;
    } else if (data.estado !== "PENDIENTE") {
      tipoSelect.disabled = true;
    } else {
      tipoSelect.disabled = false;
    }

    // =========================
    // ESTADO
    // =========================
    sincronizarEstadoVisualPedido(data.estado);

    renderPedido();
    sincronizarEstadoPreparoActual();

  } catch (err) {
    console.error(err);
    mostrarMensaje("Error buscando pedido", "error");
  } finally {
    cargandoPedido = false;
  }
}

/* =========================
  CLIENTES / VENDEDORES
========================= */

async function traerVendedorPorCodigo() {

  const codigo = document.getElementById("vendedorCodigo").value.trim();

  if (!codigo) {
    document.getElementById("vendedorNombre").value = "";
    return;
  }

  try {
    const res = await fetch(`/api/venta/vendedores/${codigo}`);

    if (!res.ok) {
      document.getElementById("vendedorNombre").value = "";
      mostrarMensaje("No se encontro el vendedor", "error");
      return;
    }

    const data = await res.json();
    document.getElementById("vendedorNombre").value = data.nombre;
    guardarDatosCabecera();
    await guardarVendedorEnVentaActual();

  } catch (err) {
    document.getElementById("vendedorNombre").value = "";
    mostrarMensaje("No se encontro el vendedor", "error");
  }
}

async function traerClientePorCodigo() {

  const codigo = document.getElementById("clienteCodigo").value.trim();

  if (!codigo) {
    document.getElementById("clienteNombre").value = "";
    return;
  }

  try {
    const res = await fetch(`/api/venta/clientes/${codigo}`);

    if (!res.ok) {
      document.getElementById("clienteNombre").value = "";
      mostrarMensaje("No se encontro el cliente", "error");
      return;
    }

    const data = await res.json();
    document.getElementById("clienteNombre").value = data.nombre;
    guardarDatosCabecera();

  } catch (error) {
    document.getElementById("clienteNombre").value = "";
    mostrarMensaje("No se pudo buscar el cliente", "error");
  }
}

function abrirModuloVendedor() {
  guardarDatosCabecera();

  const popup = window.open(
    "/modulos/vendedor/vendedor.html?modo=seleccion",
    "seleccionarVendedor",
    "width=900,height=600"
  );

  const interval = setInterval(() => {
    if (popup.closed) {
      clearInterval(interval);
      const vendedorSel = localStorage.getItem("vendedorSeleccionado");
      if (vendedorSel) {
        const vendedor = JSON.parse(vendedorSel);
        document.getElementById("vendedorCodigo").value = vendedor.id;
        document.getElementById("vendedorNombre").value = vendedor.nombre;
        guardarDatosCabecera();
        guardarVendedorEnVentaActual().catch(() => {});
        localStorage.removeItem("vendedorSeleccionado");
      }
    }
  }, 300);
}

function abrirModuloCliente() {
  guardarDatosCabecera();

  const popup = window.open(
    "/modulos/cliente/cliente.html?modo=seleccion",
    "seleccionarCliente",
    "width=900,height=600"
  );

  const interval = setInterval(() => {
    if (popup.closed) {
      clearInterval(interval);
      const clienteSel = localStorage.getItem("clienteSeleccionado");
      if (clienteSel) {
        const cliente = JSON.parse(clienteSel);
        document.getElementById("clienteCodigo").value = cliente.id;
        document.getElementById("clienteNombre").value = cliente.nombre;
        localStorage.removeItem("clienteSeleccionado");
      }
    }
  }, 300);
}

async function consumirProductoSeleccionadoConsulta() {
  const raw = sessionStorage.getItem(PRODUCTO_SELECCIONADO_CONSULTA_KEY);
  if (!raw) return;

  sessionStorage.removeItem(PRODUCTO_SELECCIONADO_CONSULTA_KEY);

  let payload = null;
  try {
    payload = JSON.parse(raw);
  } catch {
    return;
  }

  const productoId = Number(payload?.id || 0);
  if (!productoId) return;

  try {
    const res = await fetch(`/api/productos/${productoId}`);
    if (!res.ok) {
      throw new Error("Producto no encontrado");
    }

    const producto = await res.json();
    await agregarProducto(producto);
    mostrarMensaje(`Producto agregado: ${producto.nombre || productoId}`, "ok");
  } catch (error) {
    console.error(error);
    mostrarMensaje("No se pudo cargar el producto seleccionado", "error");
  }
}

function abrirBuscadorProductosPOS() {
  guardarDatosCabecera();

  if (pedidoActual && pedidoActual.estado === "PENDIENTE" && ventaPosIdValido(pedidoActual.id)) {
    const limpio = {
      ...pedidoActual,
      fecha: pedidoActual.fecha,
      items: pedidoActual.items
    };
    localStorage.setItem("pedidoPOS", JSON.stringify(limpio));
  }

  window.location.href = "/modulos/consultas/consulta_productos.html?modo=seleccion&from=venta";
}

function manejarAtajoBuscarProducto(e) {
  if (e.key !== "F1") return;
  e.preventDefault();
  abrirBuscadorProductosPOS();
}
/* =========================
  GUARDAR CABECERA
========================= */

function guardarDatosCabecera() {
  const datos = {
    vendedorCodigo: document.getElementById("vendedorCodigo").value,
    vendedorNombre: document.getElementById("vendedorNombre").value,
    clienteCodigo: document.getElementById("clienteCodigo").value,
    clienteNombre: document.getElementById("clienteNombre").value
  };
  localStorage.setItem("cabeceraPOS", JSON.stringify(datos));
}

/* =========================
  MENSAJES DEL SISTEMA
  tipos: "ok", "error", "aviso"
========================= */

function mostrarMensaje(texto, tipo = "error") {

  const div = document.getElementById("mensajeSistema");
  if (!div) return;

  const config = {
    ok: { icono: "ï¿½", duracion: 1000 },
    error: { icono: "", duracion: 3000 },
    aviso: { icono: "", duracion: 1000 },
  };

  const { icono, duracion } = config[tipo] || config.error;

  div.innerText = `${icono}  ${texto}`;
  div.className = "mensaje-sistema mostrar " + tipo;

  // Limpiar timer anterior si habÃ­a uno activo
  if (div._timer) clearTimeout(div._timer);

  div._timer = setTimeout(() => {
    div.classList.remove("mostrar");
  }, duracion);
}

/* =========================
  FULLSCREEN
========================= */

function toggleLock() {
  const icon = document.getElementById("iconFullscreen");
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => { });
    icon.style.opacity = "0.6";
  } else {
    document.exitFullscreen();
    icon.style.opacity = "1";
  }
}

function accionPrincipal() {
  const productosVisible =
    document.getElementById("productos").style.display === "grid";

  if (productosVisible) {
    volverCategorias();
  } else {
    salirPOS();
  }
}

function salirPOS() {
  window.location.href = "/home.html";
}

/* =========================
  MODAL CONFIRMAR TÃCTIL
  Reemplaza confirm() nativo
========================= */

function mostrarConfirmar(mensaje, onSi, onNo = null) {

  const modal = document.getElementById("modalConfirmar");
  const texto = document.getElementById("confirmarTexto");

  texto.innerText = mensaje;
  abrirModal("modalConfirmar");

  const btnSi = document.getElementById("confirmarSi");
  const btnNo = document.getElementById("confirmarNo");

  const nuevoSi = btnSi.cloneNode(true);
  const nuevoNo = btnNo.cloneNode(true);

  btnSi.parentNode.replaceChild(nuevoSi, btnSi);
  btnNo.parentNode.replaceChild(nuevoNo, btnNo);

  nuevoSi.addEventListener("click", () => {
    cerrarModal("modalConfirmar");
    if (onSi) onSi();
  });

  nuevoNo.addEventListener("click", () => {
    cerrarModal("modalConfirmar");
    if (onNo) onNo();
  });
}


function abrirCaja(ventaId, modo = "detallado") {
  if (!ventaPosIdValido(ventaId)) {
    mostrarMensaje("Venta invalida. Cree un pedido nuevo (Nuevo pedido) o recargue la pantalla.", "error");
    return;
  }
  const modoTxt = String(modo || "detallado");
  localStorage.setItem("modoCobroPOS", modoTxt);
  const urlCaja = `/modulos/caja/caja.html?venta_id=${encodeURIComponent(String(ventaId))}&from=venta&modo_cobro=${encodeURIComponent(modoTxt)}`;

  const esCapacitor = typeof window.Capacitor !== "undefined";
  const esPantallaVertical = window.matchMedia("(max-width: 1024px) and (orientation: portrait)").matches;

  if (esCapacitor || esPantallaVertical) {
    window.location.href = urlCaja;
    return;
  }

  const popup = window.open(urlCaja, "caja", "width=900,height=700");

  if (!popup) {
    window.location.href = urlCaja;
  }
}


async function cargarVentaPorId(id) {
  localStorage.removeItem("pedidoPOS");

  if (!ventaPosIdValido(id)) {
    mostrarMensaje("ID de venta invalido en la URL", "error");
    return;
  }

  try {

    const res = await fetch(`/api/venta/${id}`);
    const data = await res.json();

    console.log("Venta encontrada:", data);

    if (!res.ok) {
      mostrarMensaje(data.error || "No se pudo cargar la venta", "error");
      return;
    }

    // =========================
    // RESET CONTROLADO
    // =========================
// =========================
// RESET CONTROLADO
// =========================
pedidoActual = {
  id: data.id,
  numero: data.numero,
  fecha: data.fecha,
  estado: data.estado,
  items: (data.items || data.detalles || []).map(d => {

    const precioCalculado =
      d.precio ??
      (d.subtotal && d.cantidad ? d.subtotal / d.cantidad : 0);

    //  NORMALIZACIoN REAL 
    const descripcionBase =
      d.descripcion ||
      d.producto_nombre ||
      (d.observacion && !d.descripcion ? d.observacion : "Sin nombre");

    const observacionTexto =
      d.descripcion ? (d.observacion || "") : "";

    return {
      id: Number(d.id) > 0 ? Number(d.id) : 0,
      producto_id: d.producto_id || null,

      descripcion: descripcionBase,
      cantidad: Number(d.cantidad),

      precio: Number(precioCalculado),
      precioManual: Number(precioCalculado),

      observacion: observacionTexto,
      nota: d.nota || "",

      confirmado: d.confirmado ?? false,
      loading: false,

      permite_multi_sabor: !!d.permite_multi_sabor,
      tiene_preparo: !!d.tiene_preparo,
      efectivacion_directa: !!d.efectivacion_directa,
      no_control_stock: !!d.no_control_stock
    };
  })
};
    ventaActual = pedidoActual;

    desbloquearVenta();

    // =========================
    // CABECERA
    // =========================
    document.getElementById("pedidoNumero").value = data.numero;
    document.getElementById("clienteNombre").value = data.cliente_nombre || "Ocasional";
    document.getElementById("clienteCodigo").value = data.cliente_id || 1;
    document.getElementById("vendedorCodigo").value = data.vendedor_id || 1;
    document.getElementById("vendedorNombre").value = data.vendedor_nombre || "";
    setMesaActivaEnUI({ id: data.mesa_id, numero: data.mesa || "" });
    aplicarTipoPedidoEnSelectPOS(data.tipo_pedido_id);

   if (data.fecha) {

  const fecha = new Date(data.fecha);

  const formato =
    fecha.getFullYear() + "-" +
    String(fecha.getMonth() + 1).padStart(2, "0") + "-" +
    String(fecha.getDate()).padStart(2, "0") + "T" +
    String(fecha.getHours()).padStart(2, "0") + ":" +
    String(fecha.getMinutes()).padStart(2, "0");

  document.getElementById("fechaPedido").value = formato;
}

    // =========================
    // ESTADO
    // =========================
    sincronizarEstadoVisualPedido(data.estado);

    // =========================
    // RENDER
    // =========================
    renderPedido();
    sincronizarEstadoPreparoActual();

    mostrarMensaje(`ï¿½ Venta cargada (ID ${data.id})`, "ok");

  } catch (err) {
    console.error("Error cargando venta:", err);
    mostrarMensaje("Error cargando venta", "error");
  }
}


function enProductos() {
  return document.getElementById("productos").style.display === "grid";
}

function aplicarColumnas(valor) {
  if (enProductos()) {
    colsProductos = valor;
    document.documentElement.style.setProperty('--cols-productos', valor);
    localStorage.setItem("colsProductos", valor);
  } else {
    colsCategorias = valor;
    document.documentElement.style.setProperty('--cols-categorias', valor);
    localStorage.setItem("colsCategorias", valor);
  }
}


function activarGestos(grid) {

  let lastDistance = 0;
  let acumulado = 0;

  function getDistance(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  grid.addEventListener("touchstart", (e) => {
    if (e.touches.length === 2) {
      lastDistance = getDistance(e.touches);
      acumulado = 0;
    }
  });

  grid.addEventListener("touchmove", (e) => {

    if (e.touches.length !== 2) return;

    e.preventDefault();

    let newDistance = getDistance(e.touches);
    let diff = newDistance - lastDistance;

    acumulado += diff;

    //  CONTROL DE SENSIBILIDAD
    const UMBRAL = 60;

    if (Math.abs(acumulado) > UMBRAL) {

      let valorActual = enProductos() ? colsProductos : colsCategorias;

      if (acumulado > 0) {
        valorActual = Math.min(10, valorActual + 1);
      } else {
        valorActual = Math.max(3, valorActual - 1);
      }

      aplicarColumnas(valorActual);

      acumulado = 0; // reset
    }

    lastDistance = newDistance;

  }, { passive: false });

}


function activarControlColumnas(grid) {

  let acumulado = 0;

  grid.addEventListener("wheel", (e) => {
    if (!e.ctrlKey) {
      acumulado = 0;
      return;
    }

    e.preventDefault();

    acumulado += e.deltaY;

    const UMBRAL = 70;

    if (Math.abs(acumulado) < UMBRAL) return;

    let valorActual = enProductos() ? colsProductos : colsCategorias;

    while (Math.abs(acumulado) >= UMBRAL) {
      if (acumulado < 0) {
        valorActual = Math.min(10, valorActual + 1);
        acumulado += UMBRAL;
      } else {
        valorActual = Math.max(3, valorActual - 1);
        acumulado -= UMBRAL;
      }
    }

    aplicarColumnas(valorActual);

  }, { passive: false });

}

function aplicarEstadoVenta(estado) {

  const estadoDiv = document.getElementById("estadoPedido");

  estadoDiv.innerText = estado;
  estadoDiv.className = "estado";

  ventaBloqueada = false;

  if (estado === "CONCLUIDO") {
    estadoDiv.classList.add("estado-concluido");
  }

  if (estado === "EFECTIVADO") {
    estadoDiv.classList.add("estado-efectivado");
    ventaBloqueada = true;
  }

  if (estado === "CANCELADO") {
    estadoDiv.classList.add("estado-cancelado");
    ventaBloqueada = true;
  }

  if (estado === "PENDIENTE") {
    estadoDiv.classList.add("estado-pendiente");
  }

  if (estado === "FACTURADO") {
    estadoDiv.classList.add("estado-efectivado");
    ventaBloqueada = true;
  }

  if (ventaBloqueada) {
    bloquearVenta();
    desactivarBotonEfectivizar();
  } else {
    desbloquearVenta();
  }
}

async function cargarPermisosPOS() {
  try {
    const res = await fetch("/api/permisos/me", {
      credentials: "include",
      cache: "no-store",
      headers: { "Cache-Control": "no-cache" }
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || "No se pudo cargar permisos");
    }

    permisos = data || {};
    console.log("Permisos POS:", permisos);
  } catch (err) {
    permisos = { ...PERMISOS_VENTA_RAPIDA_DEFAULT };
    console.warn("Permisos POS fallback:", err?.message || err);
  }

  tipoPedidoPOSConfig.visible = POS_SIN_TIPO_PEDIDO
    ? false
    : permisos?.permisos_terminal?.mostrar_tipo_pedido !== false;
  actualizarVisibilidadTipoPedidoPOS();

  aplicarPermisosVentaRapidaUI();
}

document.addEventListener("DOMContentLoaded", async () => {

  /* =========================
    PARAMETROS URL 
  ========================= */

  const params = new URLSearchParams(window.location.search);

  const ventaId     = params.get("venta_id");
  const reanudarId  = params.get("reanudar_id");
  const pedidoURL   = params.get("pedido");
  const postCobroURL = params.get("post_cobro");
  const cargandoVentaExistente = Boolean(ventaId || pedidoURL || reanudarId);

  iniciarMotorReintentosCocina();

  await cargarPermisosPOS();
  try {
    await cargarTiposPedidoPOS();
  } catch (err) {
    console.error("No se pudo cargar Tipo Pedido:", err);
    mostrarMensaje("No se pudo cargar Tipo Pedido desde backend", "error");
  }

  // PRIORIDAD 0: reanudar venta en espera en nueva ventana
  if (reanudarId) {
    await ejecutarReanudarDesdeEspera(Number(reanudarId));
  }
  //  PRIORIDAD 1: ID (CORRECTO)
  else if (ventaId) {
    await cargarVentaPorId(ventaId);
  }
  //  PRIORIDAD 2: numero (legacy)
  else if (pedidoURL) {
    document.getElementById("pedidoNumero").value = pedidoURL;
    await buscarPedidoPorNumero();
  }

if (postCobroURL === "1" && !ventaId) {
  mostrarMensaje("No se encontro la venta cobrada", "error");
}
  /* =========================
    INIT NORMAL DEL POS
  ========================= */

  activarGestos(gridProductos);
  activarGestos(gridCategorias);
  activarControlColumnas(gridProductos);
  activarControlColumnas(gridCategorias);
  desbloquearVenta();

  consumirPostCobroPendiente();

  history.pushState(null, null, location.href);


  /* =========================
    FULLSCREEN (PWA)
  ========================= */

  const esStandalone = window.matchMedia("(display-mode: standalone)").matches
    || (typeof window.navigator.standalone !== "undefined" && window.navigator.standalone);

  const yaVioOverlay = sessionStorage.getItem("posOverlayFullscreen");

  if (esStandalone && !document.fullscreenElement && !yaVioOverlay) {
    const overlay = document.getElementById("overlayFullscreen");

    if (overlay) {
      overlay.style.display = "flex";

      const activarFullscreen = () => {
        document.documentElement.requestFullscreen().catch(() => { });
        overlay.style.display = "none";
        sessionStorage.setItem("posOverlayFullscreen", "1");
      };

      overlay.onclick = overlay.ontouchend = activarFullscreen;
    }
  }

  /* =========================
    CARGAS INICIALES
  ========================= */

  await cargarCotizacionPOS();
  await reintentarTicketPendienteSiExiste();
  await cargarCategorias();
  await cargarSabores();
  await cargarVendedorPorDefecto();
  if (!cargandoVentaExistente && !ventaPosIdValido(pedidoActual.id)) {
    await cargarClientePorDefecto();
  }

  const inputBuscar = document.getElementById("buscarSabor");

  if (inputBuscar) {
    inputBuscar.addEventListener("input", (e) => {
      renderSabores(e.target.value);
    });
  }

  const btnEsperaInicial = document.querySelector('button[onclick="ponerVentaEnEspera()"]');
  if (btnEsperaInicial) {
    btnEsperaInicial.id = "btnPedidoEnEsperaPOS";
    btnEsperaInicial.removeAttribute("onclick");
    btnEsperaInicial.addEventListener("click", (e) => {
      e.preventDefault();
      ponerVentaEnEspera();
    });
    if (btnEsperaInicial.parentNode && !document.getElementById("btnVerEsperaPOS")) {
      const btnVer = document.createElement("button");
      btnVer.id = "btnVerEsperaPOS";
      btnVer.type = "button";
      btnVer.textContent = "Ver en espera";
      if (btnEsperaInicial.className) btnVer.className = btnEsperaInicial.className;
      btnVer.addEventListener("click", (e) => {
        e.preventDefault();
        mostrarPanelEspera();
      });
      btnEsperaInicial.parentNode.insertBefore(btnVer, btnEsperaInicial.nextSibling);
    }
  }
  actualizarBadgeEspera();

  /* =========================
    RESTAURAR DATOS
  ========================= */

  const cabeceraGuardada = localStorage.getItem("cabeceraPOS");

  if (cabeceraGuardada) {
    const datos = JSON.parse(cabeceraGuardada);

    document.getElementById("vendedorCodigo").value = datos.vendedorCodigo || "";
    document.getElementById("vendedorNombre").value = datos.vendedorNombre || "";
    if (!cargandoVentaExistente && !ventaPosIdValido(pedidoActual.id)) {
      document.getElementById("clienteCodigo").value = datos.clienteCodigo || "";
      document.getElementById("clienteNombre").value = datos.clienteNombre || "";
    }
  }

  const vendedorSel = localStorage.getItem("vendedorSeleccionado");
  if (vendedorSel) {
    const v = JSON.parse(vendedorSel);
    document.getElementById("vendedorCodigo").value = v.id;
    document.getElementById("vendedorNombre").value = v.nombre;
    localStorage.removeItem("vendedorSeleccionado");
  }

  const clienteSel = localStorage.getItem("clienteSeleccionado");
  if (clienteSel && !cargandoVentaExistente && !ventaPosIdValido(pedidoActual.id)) {
    const c = JSON.parse(clienteSel);
    document.getElementById("clienteCodigo").value = c.id;
    document.getElementById("clienteNombre").value = c.nombre;
    localStorage.removeItem("clienteSeleccionado");
  }

  const categoriaGuardada = localStorage.getItem("categoriaPOS");
  if (categoriaGuardada) {
    await cargarProductos(categoriaGuardada);
  }

  const pedidoGuardado = localStorage.getItem("pedidoPOS");

   if (pedidoGuardado && !ventaPosIdValido(pedidoActual.id) && !ventaId && !pedidoURL) {
    const pedidoLS = JSON.parse(pedidoGuardado);

    if (pedidoLS.estado && pedidoLS.estado !== "PENDIENTE") {
      localStorage.removeItem("pedidoPOS");
    } else {


pedidoActual = pedidoLS;

if (!ventaPosIdValido(pedidoActual.id)) {
  pedidoActual.id = null;
}

pedidoActual.items = pedidoActual.items.map(item => ({
  ...item,

  id: Number(item.id) > 0 ? Number(item.id) : 0,

  // FIX CLAVE (NO PERDER OBSERVACION)
  observacion: item.observacion || item.nota || "",
  nota: item.nota || "",

  loading: false,

  permite_multi_sabor: !!item.permite_multi_sabor,
  sabores: item.sabores || [],

  precioOriginal: item.precioOriginal || item.precio
}));

ventaActual = pedidoActual;

renderPedido(); //  FALTABA ESTO

      if (pedidoActual.numero) {
        document.getElementById("pedidoNumero").value = pedidoActual.numero;
      }
      aplicarTipoPedidoEnSelectPOS(pedidoLS.tipo_pedido_id);
    }
  }

  await consumirProductoSeleccionadoConsulta();
  sincronizarEstadoPreparoActual();
  reintentarEnvios({ forzar: true }).catch(() => {});
  /* =========================
    CONFIG UI
  ========================= */

  const colsProd = localStorage.getItem("colsProductos");
  const colsCat = localStorage.getItem("colsCategorias");

  if (colsProd) {
    document.documentElement.style.setProperty('--cols-productos', colsProd);
  }

  if (colsCat) {
    document.documentElement.style.setProperty('--cols-categorias', colsCat);
  }

  const ahora = new Date();

  const fecha =
    ahora.getFullYear() + "-" +
    String(ahora.getMonth() + 1).padStart(2, '0') + "-" +
    String(ahora.getDate()).padStart(2, '0') + "T" +
    String(ahora.getHours()).padStart(2, '0') + ":" +
    String(ahora.getMinutes()).padStart(2, '0');

  if (!ventaPosIdValido(pedidoActual.id) && !pedidoActual.fecha) {
  document.getElementById("fechaPedido").value = fecha;
}


  // Eventos teclado
  document.getElementById("vendedorCodigo").addEventListener("keydown", function (e) {
    if (e.key === "Enter") { e.preventDefault(); traerVendedorPorCodigo(); }
  });

  document.getElementById("clienteCodigo").addEventListener("keydown", function (e) {
    if (e.key === "Enter") { e.preventDefault(); traerClientePorCodigo(); }
  });

  document.getElementById("pedidoNumero").addEventListener("keydown", function (e) {
    if (e.key === "Enter") { e.preventDefault(); buscarPedidoPorNumero(); }
  });

  document.addEventListener("keydown", manejarAtajoBuscarProducto);

  // Cerrar modales tocando el fondo oscuro
  document.querySelectorAll(".modal").forEach(modal => {
    modal.addEventListener("click", function (e) {

      // ðŸ”’ NO cerrar si es modal bloqueado
      if (modal.classList.contains("no-close")) return;

      // cerrar solo si toca fondo
      if (e.target.classList.contains("modal")) {
        cerrarModal(modal.id);
      }

    });
  });

  // Solo nÃºmeros en cÃ³digo
  function soloNumeros(input) {
    input.addEventListener("input", function () {
      this.value = this.value.replace(/[^0-9]/g, "");
    });
  }
  soloNumeros(document.getElementById("vendedorCodigo"));
  soloNumeros(document.getElementById("clienteCodigo"));
  soloNumeros(document.getElementById("clienteCodigoFactura"));

  document.getElementById("clienteNombre").addEventListener("input", function () {
    document.getElementById("clienteCodigo").value = 1;
    guardarDatosCabecera();

    // Actualizar nombre en BD si hay venta activa
    if (ventaPosIdValido(pedidoActual.id)) {
      const nombreLibre = this.value.trim();
      fetch("/api/venta/cliente", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          venta_id: pedidoActual.id,
          cliente_id: 1,
          cliente_nombre: nombreLibre || "Ocasional"
        })
      }).catch(() => { });
    }
  });
  document.getElementById("btnBuscarClienteFactura")
    .addEventListener("click", async function () {

      const input = document.getElementById("clienteCodigoFactura");
      const codigo = input.value.trim();

      //  SI HAY CODIGO ï¿½ BUSCAR DIRECTO
      if (codigo) {

        try {

          const res = await fetch(`/api/clientes/${codigo}`);

          if (!res.ok) {
            mostrarMensaje("Cliente no encontrado", "error");
            return;
          }

          const cliente = await res.json();

          document.getElementById("nombreFacturaInput").value = cliente.nombre || "";
          document.getElementById("rucFacturaInput").value = cliente.ruc || "";
          document.getElementById("direccionFacturaInput").value = cliente.direccion || "";

        } catch (err) {
          console.error(err);
          mostrarMensaje("Error buscando cliente", "error");
        }

        return; //  IMPORTANTE: no abrir popup
      }

      //  SI NO HAY CODIGO ï¿½ ABRIR BUSCADOR
      buscarClienteFactura();

    });

});


document.getElementById("clienteCodigoFactura")
  .addEventListener("keydown", async function (e) {

    if (e.key !== "Enter") return;

    e.preventDefault();

    const codigo = this.value.trim();

    if (!codigo) return;

    try {

      const res = await fetch(`/api/clientes/${codigo}`);

      if (!res.ok) {
        mostrarMensaje("Cliente no encontrado", "error");
        return;
      }

      const cliente = await res.json();

      document.getElementById("nombreFacturaInput").value = cliente.nombre || "";
      document.getElementById("rucFacturaInput").value = cliente.ruc || "";
      document.getElementById("direccionFacturaInput").value = cliente.direccion || "";

    } catch (err) {

      console.error(err);
      mostrarMensaje("Error buscando cliente", "error");

    }

  });

/* =========================
  HISTORIAL (boton atras)
========================= */

window.addEventListener("popstate", function () {
  const productosVisible = document.getElementById("productos").style.display === "grid";
  if (productosVisible) {
    volverCategorias();
    history.pushState(null, null, location.href);
  } else {
    salirPOS();
  }
});

document.addEventListener("keydown", function (e) {

  const modal = document.getElementById("modalPedido");

  // solo cuando el teclado esta abierto
  if (!modal.classList.contains("show")) return;

  const input = document.getElementById("pedidoTemp");

  // numeros
  if (e.key >= "0" && e.key <= "9") {
    input.value += e.key;
  }

  // borrar
  if (e.key === "Backspace") {
    input.value = input.value.slice(0, -1);
  }

  // enter = confirmar
  if (e.key === "Enter") {
    confirmarPedido();
  }

});
