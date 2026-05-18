const API = "/api/productos";

/* ===== ELEMENTOS ===== */
const form = document.getElementById("formProducto");
const lista = document.getElementById("listaProductos");
const buscador = document.getElementById("buscadorProductos");
const codigoInput = document.getElementById("codigoProducto");
const nombreInput = document.getElementById("nombreProducto");
const descripcionInput = document.getElementById("descripcionProducto");
const ivaInput = document.getElementById("ivaProducto");
const categoriaSelect = document.getElementById("categoriaSelect");
const categoriaIdInput = document.getElementById("categoriaIdInput");
const precioVentaInput = document.getElementById("precioVenta");
const thId = document.getElementById("thId");
const imagenInput = document.getElementById("imagenProducto");
const previewImagen = document.getElementById("previewImagen");
const previewPlaceholder = document.getElementById("previewPlaceholder");
const permiteMultiSaborInput = document.getElementById("permiteMultiSabor");
const maxSaboresInput = document.getElementById("maxSabores");
const unidadInput = document.getElementById("unidadProducto");
const tiempoPreparacionInput = document.getElementById("tiempoPreparacion");
const codigoBarraInput = document.getElementById("codigoBarra");
const destinoInput = document.getElementById("destinoProducto");
const facturacionDirectaInput = document.getElementById("facturacionDirecta");
const mostrarVentaMedioInput = document.getElementById("mostrarVentaMedioProducto");
const mostrarMenuDigitalInput = document.getElementById("mostrarMenuDigitalProducto");
const esInsumoInput = document.getElementById("esInsumo");
const esServicioInput = document.getElementById("esServicio");
const filtroCategoriaInput = document.getElementById("filtroCategoria");
const filtroCategoriaNombreInput = document.getElementById("filtroCategoriaNombre");
const btnBuscarFiltroCategoria = document.getElementById("btnBuscarFiltroCategoria");
const btnLimpiarFiltroCategoria = document.getElementById("btnLimpiarFiltroCategoria");
const filtroDestinoInput = document.getElementById("filtroDestino");
const filtroMonedaInput = document.getElementById("filtroMoneda");
const filtroEsInsumoInput = document.getElementById("filtroEsInsumo");
const btnGuardar = document.getElementById("btnGuardar");
const btnEliminar = document.getElementById("btnEliminar");
const btnCancelar = document.getElementById("btnCancelar");
const btnAjustarStock = document.getElementById("btnAjustarStock");
const CATEGORIA_STORAGE_KEY = "categoriaSeleccionada";

// Roles que pueden ajustar stock manualmente
// Para agregar ADMIN: añadí "ADMIN" y "ADM" a este Set
const ROLES_AJUSTE_STOCK = new Set(["SUPER", "SUP", "SIS", "SISTEMA", "SUPER_SISTEMA"]);

function rolPuedeAjustarStock() {
  try {
    // Intenta leer de múltiples fuentes
    const raw = localStorage.getItem("usuario")
      || localStorage.getItem("softsys_usuario")
      || sessionStorage.getItem("usuario");
    if (!raw) return false;
    const user = JSON.parse(raw);
    const rol = String(user?.rol || "").trim().toUpperCase();
    return ROLES_AJUSTE_STOCK.has(rol);
  } catch {
    return false;
  }
}

function aplicarVisibilidadBtnStock() {
  if (!btnAjustarStock) return;
  if (rolPuedeAjustarStock()) {
    btnAjustarStock.style.display = "";
  } else {
    btnAjustarStock.style.display = "none";
  }
}
const urlParamsProductos = new URLSearchParams(window.location.search);
let page = 1;
let limit = 30;
let cargando = false;
let fin = false;



let productoSeleccionado = null;
let categoriasMap = {};
let sortField = "id";
let sortDir = "desc";
let estadoOriginal = null;
let _stockActual = 0;



window.productoSeleccionado = null;

function toggleSabores() {
  if (permiteMultiSaborInput.checked) {
    maxSaboresInput.disabled = false;
    if (Number(maxSaboresInput.value || 0) < 2) {
      maxSaboresInput.value = 2;
    }
  } else {
    maxSaboresInput.disabled = true;
    maxSaboresInput.value = 1;
  }
}
/* ===== UTIL ===== */
function formatoGs(valor) {
  if (!valor) return "";
  return Number(valor).toLocaleString("es-PY");
}

const MONEDA_LABEL = Object.freeze({
  1: "Gs",
  2: "R$",
  3: "USD"
});

function normalizarMonedaId(valor) {
  const id = Number(valor || 0);
  if (id === 1 || id === 2 || id === 3) return id;
  return 1;
}

function formatearMontoMoneda(monedaId, monto) {
  const n = Number(monto || 0);
  if (!Number.isFinite(n) || n <= 0) return "";

  if (normalizarMonedaId(monedaId) === 1) {
    return Math.round(n).toLocaleString("es-PY", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    });
  }

  return n.toLocaleString("es-PY", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });
}

function textoMoneda(monedaId, monto) {
  const id = normalizarMonedaId(monedaId);
  const valor = formatearMontoMoneda(id, monto);
  if (!valor) return "-";
  return `${valor} ${MONEDA_LABEL[id] || MONEDA_LABEL[1]}`;
}

function normalizarMonedaFiltro(value) {
  const id = Number(value || 0);
  if (id === 1 || id === 2 || id === 3) return id;
  return "";
}

function costoTotalProducto(producto) {
  const compraOrigen = Number(producto?.precio_compra_origen ?? producto?.precio_compra ?? 0) || 0;
  const costoTransporte = Number(producto?.costo_transporte ?? 0) || 0;
  const costoTotal = Number(producto?.costo_total ?? (compraOrigen + costoTransporte)) || 0;
  return costoTotal;
}

function textoCostoProducto(producto) {
  const monedaId = normalizarMonedaId(producto?.precio_compra_moneda_id);
  return textoMoneda(monedaId, costoTotalProducto(producto));
}

function textoVentaProducto(producto) {
  const monedaId = normalizarMonedaId(producto?.precio_compra_moneda_id);
  const precio = Number(producto?.precio_venta ?? producto?.precio ?? 0) || 0;
  return textoMoneda(monedaId, precio);
}

function formatearStock(valor) {
  const n = Number(valor ?? 0);
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString("es-PY", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3
  });
}

function toBoolUi(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  const normalized = String(value ?? "").trim().toLowerCase();
  return ["1", "true", "t", "si", "s", "yes", "y", "on"].includes(normalized);
}

/* ===== ESTADO INICIAL ===== */
function estadoInicial() {

  form.reset();
  productoSeleccionado = null;

  previewImagen.style.display = "none";
  previewPlaceholder.style.display = "block";

  btnGuardar.disabled = true;
  btnEliminar.disabled = true;
  btnCancelar.disabled = true;
  if (btnAjustarStock) btnAjustarStock.disabled = true;

  nombreInput.disabled = true;
  descripcionInput.disabled = true;
  ivaInput.disabled = true;
  categoriaSelect.disabled = true;
  categoriaIdInput.disabled = true;
  precioVentaInput.disabled = true;
  facturacionDirectaInput.checked = false;
  facturacionDirectaInput.disabled = true;
  mostrarVentaMedioInput.checked = false;
  mostrarVentaMedioInput.disabled = true;
  mostrarMenuDigitalInput.checked = false;
  mostrarMenuDigitalInput.disabled = true;
  esInsumoInput.checked = false;
  esServicioInput.checked = false;
  esInsumoInput.disabled = true;
  esServicioInput.disabled = true;

  if (previewURL) {
    URL.revokeObjectURL(previewURL);
    previewURL = null;
  }
  imagenInput.disabled = true;

  codigoInput.disabled = false;
  codigoInput.value = "";
  codigoInput.placeholder = "Ingrese código o Enter";

  permiteMultiSaborInput.checked = false;
  maxSaboresInput.value = 1;
  maxSaboresInput.disabled = true;
  unidadInput.disabled = true;
  tiempoPreparacionInput.disabled = true;
  codigoBarraInput.disabled = true;
  destinoInput.disabled = true;
  unidadInput.value = "unidad";
  tiempoPreparacionInput.value = "";
  codigoBarraInput.value = "";
  destinoInput.value = "cocina";

  setTimeout(() => {
    codigoInput.focus();
  }, 80);
}


// ===== FORZAR MAYUSCULAS EN TIEMPO REAL =====
function forzarMayusculas(input) {
  input.addEventListener("input", () => {
    input.value = input.value.toUpperCase();
  });
}

forzarMayusculas(nombreInput);
forzarMayusculas(descripcionInput);



/* ===== LISTAR ===== */
async function cargarProductos() {

  const texto = buscador.value.trim();
  const categoriaFiltro = String(filtroCategoriaInput?.value || "").trim();
  const destinoFiltro = String(filtroDestinoInput?.value || "").trim();
  const monedaFiltro = normalizarMonedaFiltro(filtroMonedaInput?.value);
  const esInsumoFiltro = String(filtroEsInsumoInput?.value || "").trim();

  try {

    if (cargando || fin) return;
    cargando = true;

    const query = new URLSearchParams({
      page: String(page),
      limit: String(limit),
      buscar: texto,
      orden: sortDir,
      categoria_id: categoriaFiltro,
      destino: destinoFiltro,
      es_insumo: esInsumoFiltro,
      moneda_id: monedaFiltro ? String(monedaFiltro) : ""
    });

    const res = await fetch(`${API}?${query.toString()}`);

    const data = await res.json();

    if (page === 1) {
      lista.innerHTML = "";
    }

    if (!data.length && page === 1) {
      lista.innerHTML = "<div style='padding:10px;color:#999'>Sin productos</div>";
      cargando = false;
      return;
    }

    if (data.length < limit) {
      fin = true;
    }

    const fragment = document.createDocumentFragment();

    for (const p of data) {

      const row = document.createElement("div");
      row.className = "tabla-row";
      row.dataset.id = p.id;

      const imgCell = p.imagen
        ? `<span><img class="img-thumb" src="${p.imagen}" alt="" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><span class="img-thumb-vacia" style="display:none">📦</span></span>`
        : `<span><span class="img-thumb-vacia">📦</span></span>`;

      row.innerHTML = `
        <span>${p.id ?? ""}</span>
        <span>${p.nombre ?? ""}</span>
        <span>${textoCostoProducto(p)}</span>
        <span>${textoVentaProducto(p)}</span>
        <span>${formatearStock(p.stock)}</span>
        <span>${p.destino_impresion ?? "-"}</span>
        <span>${categoriasMap[String(p.categoria_id)] ?? "-"}</span>
        <span>${p.es_insumo ? "SI" : "NO"}</span>
        ${imgCell}
      `;

      row.onclick = () => seleccionarProducto(p.id);

      fragment.appendChild(row);
    }

    lista.appendChild(fragment);

    cargando = false;

  } catch (err) {
    console.error("Error cargando productos", err);
    lista.innerHTML = "<div style='padding:10px;color:red'>Error cargando productos</div>";
    cargando = false;
  }
}

function aplicarFiltroCategoria(categoria) {
  if (!categoria || !categoria.id) return;

  filtroCategoriaInput.value = String(categoria.id);
  if (filtroCategoriaNombreInput) {
    filtroCategoriaNombreInput.value = String(categoria.nombre || categoriasMap[String(categoria.id)] || "");
    filtroCategoriaNombreInput.dataset.categoriaId = String(categoria.id);
  }

  page = 1;
  fin = false;
  cargarProductos();
}

function limpiarFiltroCategoria() {
  if (filtroCategoriaInput) filtroCategoriaInput.value = "";
  if (filtroCategoriaNombreInput) {
    filtroCategoriaNombreInput.value = "";
    filtroCategoriaNombreInput.dataset.categoriaId = "";
  }
  localStorage.removeItem(CATEGORIA_STORAGE_KEY);
  page = 1;
  fin = false;
  cargarProductos();
}

function consumirCategoriaDesdeStorage() {
  const raw = localStorage.getItem(CATEGORIA_STORAGE_KEY);
  if (!raw) return;

  localStorage.removeItem(CATEGORIA_STORAGE_KEY);

  try {
    const categoria = JSON.parse(raw);
    aplicarFiltroCategoria(categoria);
  } catch {
    // noop
  }
}

window.recibirCategoria = function recibirCategoria(categoria) {
  aplicarFiltroCategoria(categoria);
};

function abrirSelectorCategoriaFiltro() {
  const popup = window.open(
    "/modulos/categorias/categorias.html?modo=seleccion",
    "seleccionarCategoria",
    "width=1100,height=760"
  );

  if (!popup) {
    baseModalOpenInfo({
      titulo: "Categoría",
      mensaje: "Permita ventanas emergentes para seleccionar la categoría"
    });
    return;
  }

  setTimeout(consumirCategoriaDesdeStorage, 400);
}

function hayCambiosSinGuardar() {

  if (!estadoOriginal) return false;

  const actual = obtenerEstadoActual();

  return JSON.stringify(actual) !== JSON.stringify(estadoOriginal);
}

function volverSeguro() {

  if (hayCambiosSinGuardar()) {

    baseModalOpenConfirmGeneric({
      titulo: "Salir",
      mensaje: "Hay cambios sin guardar. ¿Desea salir?",
      onConfirm: () => {
        window.location.href = "../../home.html";
      }
    });

  } else {
    window.location.href = "../../home.html";
  }
}

let _warnListener = null;
let _warnFocusEl = null;

function mostrarAdvertencia(texto, focusEl = codigoInput) {

  const modal = document.getElementById('modalAdvertencia');
  const txt = document.getElementById('modalAdvertenciaTexto');
  const btn = modal.querySelector('.btn-aceptar');

  txt.textContent = texto;
  _warnFocusEl = focusEl;

  modal.classList.remove('hidden');

  setTimeout(() => btn.focus(), 30);

  if (_warnListener)
    document.removeEventListener('keydown', _warnListener);

  _warnListener = function (e) {

    if (e.key === 'Enter' || e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      cerrarAdvertencia(true);
    }
  };

  document.addEventListener('keydown', _warnListener);
}

function cerrarAdvertencia(refocus = false) {

  const modal = document.getElementById('modalAdvertencia');
  modal.classList.add('hidden');

  if (_warnListener) {
    document.removeEventListener('keydown', _warnListener);
    _warnListener = null;
  }

  if (refocus && _warnFocusEl) {
    setTimeout(() => {
      _warnFocusEl.focus();
      _warnFocusEl.select();
    }, 40);
  }
}

permiteMultiSaborInput.addEventListener("change", toggleSabores);

/* ===== SELECCIONAR ===== */
async function seleccionarProducto(id) {

  const params = new URLSearchParams(window.location.search);
  const modo = params.get("modo");
  const volver = params.get("volver");

  // ===== MODO SELECCION  volver a precio =====
  if (modo === "seleccion" && volver === "precio") {
    const fromOrigen = String(params.get("from") || "productos").trim().toLowerCase();
    const origenValido = ["home", "productos", "compra"].includes(fromOrigen)
      ? fromOrigen
      : "productos";
    window.location.href = `../precio/precio.html?producto=${id}&from=${encodeURIComponent(origenValido)}`;
    return;
  }

  // ===== MODO SELECCION â†’ volver a informe =====
  if (modo === "seleccion" && volver === "informe") {

    const res = await fetch(`${API}/${id}`);
    const p = await res.json();

    window.opener.document
      .getElementById("filtroProducto")
      .value = p.nombre;


    window.close();
    return;
  }


  // activar/desactivar
  const res = await fetch(`${API}/${id}`);
  const p = await res.json();

  //  CONFIGURAR MULTI SABOR CORRECTAMENTE
  permiteMultiSaborInput.checked = toBoolUi(p.permite_multi_sabor);
  maxSaboresInput.value = p.max_sabores || 1;

  if (permiteMultiSaborInput.checked) {
    maxSaboresInput.disabled = false;
  } else {
    maxSaboresInput.disabled = true;
  }
  productoSeleccionado = id;
  window.productoSeleccionado = id;
  _stockActual = Number(p.stock || 0);
  imagenInput.value = "";
  codigoInput.value = p.id;
  nombreInput.value = p.nombre;
  descripcionInput.value = p.descripcion || "";
  ivaInput.value = p.iva_tipo;

  unidadInput.value = p.unidad_medida || "unidad_medida";
  tiempoPreparacionInput.value = p.tiempo_preparacion || "";
  codigoBarraInput.value = p.codigo_barra || "";

  if ([...destinoInput.options].some(o => o.value === p.destino_impresion)) {
    destinoInput.value = p.destino_impresion;
  } else {
    destinoInput.value = "";
  }

  document.getElementById("efectivacionDirecta").checked = toBoolUi(p.efectivacion_directa);
  document.getElementById("noControlStock").checked = toBoolUi(p.no_control_stock);
  facturacionDirectaInput.checked = toBoolUi(p.facturacion_directa);
  mostrarVentaMedioInput.checked = toBoolUi(p.mostrar_venta_medio);
  mostrarMenuDigitalInput.checked = toBoolUi(p.mostrar_menu_digital);
  esInsumoInput.checked = toBoolUi(p.es_insumo);
  esServicioInput.checked = toBoolUi(p.es_servicio);
  imagenInput.disabled = false;



  imagenInput.style.pointerEvents = "auto";
  imagenInput.style.opacity = "1";

  previewImagen.src = "";
  previewImagen.style.display = "none";
  previewPlaceholder.style.display = "block";

  categoriaIdInput.disabled = false;
  categoriaIdInput.style.pointerEvents = "auto";
  categoriaIdInput.style.opacity = "1";

  categoriaSelect.value = String(p.categoria_id);

  categoriaIdInput.value = p.categoria_id;

  try {
    const precioRes = await fetch(`/api/productos-precio/producto/${id}`);
    const precioData = await precioRes.json();
    const monedaIdPrecio = normalizarMonedaId(
      precioData?.precio_compra_moneda_id ?? p?.precio_compra_moneda_id
    );

    precioVentaInput.value = precioData
      ? formatearMontoMoneda(monedaIdPrecio, precioData.precio_venta)
      : "";
    precioVentaInput.title = `Precio en ${MONEDA_LABEL[monedaIdPrecio] || MONEDA_LABEL[1]}`;
  } catch {
    precioVentaInput.value = "";
    precioVentaInput.title = "";
  }

  // liberar preview anterior si existía
  if (previewURL) {
    URL.revokeObjectURL(previewURL);
    previewURL = null;
  }

  if (p.imagen) {
    previewImagen.src = p.imagen;
    previewImagen.style.display = "block";
    previewPlaceholder.style.display = "none";
  }

  btnGuardar.disabled = false;
  btnEliminar.disabled = false;
  btnCancelar.disabled = false;

  //  DESBLOQUEAR CAMPOS (modo edición)
  habilitarCampos();

  estadoOriginal = obtenerEstadoActual();
  nombreInput.focus({ preventScroll: true });

  scrollAProducto(id);
}

function habilitarCampos() {

  nombreInput.disabled = false;
  descripcionInput.disabled = false;
  ivaInput.disabled = false;
  categoriaSelect.disabled = false;
  categoriaIdInput.disabled = false;
  precioVentaInput.disabled = false;
  unidadInput.disabled = false;
  tiempoPreparacionInput.disabled = false;
  codigoBarraInput.disabled = false;
  destinoInput.disabled = false;
  imagenInput.disabled = false;
  btnGuardar.disabled = false;
  if (btnAjustarStock && rolPuedeAjustarStock()) btnAjustarStock.disabled = false;
  facturacionDirectaInput.disabled = false;
  mostrarVentaMedioInput.disabled = false;
  mostrarMenuDigitalInput.disabled = false;
  esInsumoInput.disabled = false;
  esServicioInput.disabled = false;

}

function obtenerEstadoActual() {
  return {
    nombre: nombreInput.value.trim(),
    descripcion: (descripcionInput.value || "").trim(),
    iva: ivaInput.value,

    categoria: categoriaSelect.value,

    //  limpiar formato visual
    precio: precioVentaInput.value.replace(/[^\d]/g, ""),

    unidad: unidadInput.value,
    tiempo: tiempoPreparacionInput.value || "0",

    codigoBarra: codigoBarraInput.value.trim(),
    destino: destinoInput.value,

    multi: permiteMultiSaborInput.checked,
    maxSabores: maxSaboresInput.value || "1",
    mostrarMenuDigital: mostrarMenuDigitalInput.checked,
    mostrarVentaMedio: mostrarVentaMedioInput.checked,
    esInsumo: esInsumoInput.checked,
    esServicio: esServicioInput.checked
  };
}

// GENERA CODIGO DE BARRA AA jajaja perdon
function generarCodigoBarra() {

  // base inicial (tipo empresa ficticia)
  const base = 200000000000;

  let numero = productoSeleccionado
    ? Number(productoSeleccionado)
    : Date.now().toString().slice(-6); // fallback si es nuevo

  let codigo = String(base + Number(numero));

  // asegurar 13 dígitos
  codigo = codigo.padStart(13, "0");

  codigoBarraInput.value = codigo;
}

/* ===== BUSCAR POR CODIGO ===== */
codigoInput.addEventListener("keydown", async (e) => {

  if (e.key !== "Enter") return;

  e.preventDefault();

  const valor = codigoInput.value.trim();

  // ENTER vacío â†’ próximo ID
  if (!valor) {

    try {
      const res = await fetch(API);
      const data = await res.json();

      const nextId = data.length
        ? Math.max(...data.map(p => p.id)) + 1
        : 1;

      codigoInput.value = nextId;

      productoSeleccionado = null;
      window.productoSeleccionado = null;

      habilitarCampos();
      nombreInput.focus({ preventScroll: true });

    } catch {
      mostrarAdvertencia("Error obteniendo código", codigoInput);
    }

    return;
  }

  const id = parseInt(valor);

  try {

    const res = await fetch(`${API}/${id}`);

    if (res.ok) {
      seleccionarProducto(id);
      return;
    }

    //  NO EXISTE  MOSTRAR ADVERTENCIA
    mostrarAdvertencia(`No existe producto con código ${id}`, codigoInput);

  } catch {
    mostrarAdvertencia("Error consultando servidor", codigoInput);
  }

});

buscador.addEventListener("input", () => {
  page = 1;
  fin = false;
  cargarProductos();
});

function irAPrecio() {

  if (!productoSeleccionado) {

    baseModalOpenInfo({
      titulo: "Precio",
      mensaje: "Primero debe guardar el producto"
    });

    return;
  }

  window.location.href = `../precio/precio.html?producto=${productoSeleccionado}&from=productos`;

}

/* ===== GUARDAR ===== */
form.addEventListener("submit", async (e) => {

  e.preventDefault();

  const data = new FormData(form);

  data.set("unidad_medida", unidadInput.value);
  data.set("tiempo_preparacion", tiempoPreparacionInput.value || 0);
  data.set("codigo_barra", codigoBarraInput.value);
  data.set("destino_impresion", destinoInput.value);

  data.set(
    "efectivacion_directa",
    document.getElementById("efectivacionDirecta").checked
  );

  data.set(
    "no_control_stock",
    document.getElementById("noControlStock").checked
  );

  data.set(
    "permite_multi_sabor",
    permiteMultiSaborInput.checked
  );

  data.set(
    "max_sabores",
    maxSaboresInput.value || 1
  );

  data.set(
    "facturacion_directa",
    facturacionDirectaInput.checked
  );

  data.set(
    "mostrar_menu_digital",
    mostrarMenuDigitalInput.checked
  );

  data.set(
    "mostrar_venta_medio",
    mostrarVentaMedioInput.checked
  );

  data.set(
    "es_insumo",
    esInsumoInput.checked
  );

  data.set(
    "es_servicio",
    esServicioInput.checked
  );

  //  evitar que stock se resetee
  data.delete("stock");

  // limpiar precio
  let precioLimpio = precioVentaInput.value.replace(/[^\d]/g, "");
  data.set("precio_venta", precioLimpio);

  //  IMPORTANTE â†’ enviar id en edición
  if (productoSeleccionado) {
    data.set("id", productoSeleccionado);
  }

  const url = productoSeleccionado
    ? `${API}/${productoSeleccionado}`
    : `${API}`;

  const method = productoSeleccionado ? "PUT" : "POST";

  const resGuardar = await fetch(url, { method, body: data });

  if (!resGuardar.ok) {
    alert("Error guardando producto");
    return;
  }

  const productoGuardado = await resGuardar.json();

  if (!productoSeleccionado) {
    productoSeleccionado = productoGuardado.id;
  }

  //  ACTUALIZAR PRECIO
  if (precioVentaInput.value) {

    const resPrecio = await fetch(`/api/productos-precio/producto/${productoSeleccionado}`);
    const precioActual = await resPrecio.json();

    await fetch(`/api/productos-precio`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        producto_id: productoSeleccionado,
        precio_compra: precioActual?.precio_compra || 0,
        costo_transporte: precioActual?.costo_transporte || 0,
        precio_venta: Number(precioLimpio),
        precio_minimo: precioActual?.precio_minimo || null,
        precio_promocional: precioActual?.precio_promocional || null
      })
    });

  }

  nombreInput.value = nombreInput.value.toUpperCase();
  descripcionInput.value = descripcionInput.value.toUpperCase();

  // Resetear paginación para que la lista se recargue desde el principio
  page = 1;
  fin = false;
  await cargarProductos();
  estadoInicial();

  estadoOriginal = null;

});


/* ===== CANCELAR ===== */
function cancelarProducto() {
  estadoInicial();
  estadoOriginal = null;
  page = 1;
  fin = false;
  cargarProductos();
}

/* ===== ELIMINAR ===== */
let productoAEliminar = null;

function eliminarProducto() {

  if (!productoSeleccionado) return;

  productoAEliminar = productoSeleccionado;

  document.querySelector("#modalEliminar .modal-text").textContent =
    "¿Desea eliminar el producto?";

  document.querySelector("#modalEliminar .modal-nombre").textContent =
    `#${productoSeleccionado}`;

  document.getElementById("modalEliminar").classList.remove("hidden");
}

function cerrarModalEliminar() {
  productoAEliminar = null;
  document.getElementById("modalEliminar").classList.add("hidden");
}

async function confirmarEliminar() {

  if (!productoAEliminar) return;

  const res = await fetch(`${API}/${productoAEliminar}`, {
    method: "DELETE"
  });

  if (!res.ok) {
    baseModalOpenInfo({
      titulo: "Error",
      mensaje: "No se pudo eliminar el producto"
    });
    return;
  }

  cerrarModalEliminar();
  productoSeleccionado = null;
  window.productoSeleccionado = null;

  estadoInicial();
  await cargarProductos();
}

/* ===== IMAGEN ===== */
let previewURL = null;

imagenInput.addEventListener("change", () => {

  const file = imagenInput.files[0];
  if (!file) return;

  // liberar anterior
  if (previewURL) {
    URL.revokeObjectURL(previewURL);
  }

  previewURL = URL.createObjectURL(file);

  previewImagen.src = previewURL;
  previewImagen.style.display = "block";
  previewPlaceholder.style.display = "none";

});

/* ===== CATEGORIAS ===== */
async function cargarCategorias() {
  try {

    const res = await fetch(`/api/categorias`);
    const data = await res.json();

    categoriaSelect.innerHTML = `<option value="">Seleccione categoría</option>`;
    categoriasMap = {};

    data.forEach(c => {
      categoriaSelect.innerHTML += `<option value="${c.id}">${c.nombre}</option>`;
      categoriasMap[String(c.id)] = c.nombre;
    });

  } catch (err) {
    console.error("Error cargando categorias", err);
  }
}

async function cargarDestinos() {
  try {
    const res = await fetch("/api/config/impresoras", {
      credentials: "include"
    });

    const data = await res.json();

    destinoInput.innerHTML = "";

    // opción vacío (importante)
    destinoInput.innerHTML += `<option value="">Ninguno</option>`;

    Object.keys(data).forEach(key => {

      if (["venta", "empresa_id", "terminal_id"].includes(key)) return;

      destinoInput.innerHTML += `
        <option value="${key}">${key.toUpperCase()}</option>
      `;
    });

  } catch (err) {
    console.error("Error cargando destinos", err);

    // fallback
    destinoInput.innerHTML = `
      <option value="">Ninguno</option>
      <option value="cocina">COCINA</option>
    `;
  }
}

form.addEventListener("keydown", function (e) {


  if (!document.getElementById("modalAdvertencia").classList.contains("hidden")) return;

  if (e.key !== "Enter") return;

  const activo = document.activeElement;

  //   permitir salto de línea en descripción con Shift+Enter
  if (activo === descripcionInput && e.shiftKey) return;

  //  evitar que Enter en botón haga cosas raras
  if (activo === btnGuardar) return;

  // ===== VALIDAR CATEGORIA =====
  if (activo === categoriaIdInput) {

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    const id = String(categoriaIdInput.value).trim();

    if (!id) {
      categoriaSelect.value = "";
      categoriaSelect.focus();
      return;
    }

    if (!categoriasMap[id]) {

      baseModalOpenInfo({
        titulo: "Categoría",
        mensaje: "Categoría no encontrada",
        onClose: () => {
          categoriaIdInput.value = "";
          categoriaSelect.value = "";
          categoriaIdInput.focus();
          categoriaIdInput.select();
        }
      });

      setTimeout(() => {
        categoriaIdInput.focus();
        categoriaIdInput.select();
      }, 120);

      return;
    }

    categoriaSelect.value = id;
    categoriaSelect.focus();
    return;
  }

  // ===== NAVEGACION NORMAL =====
  e.preventDefault();

  const campos = [
    nombreInput,
    descripcionInput,
    precioVentaInput,
    ivaInput,
    categoriaIdInput,
    categoriaSelect,
    imagenInput
  ];

  const index = campos.indexOf(activo);

  if (index === -1) {
    nombreInput.focus({ preventScroll: true });
    return;
  }

  // último campo â†’ guardar
  if (index === campos.length - 1) {

    if (!btnGuardar.disabled) btnGuardar.click();
    return;
  }

  campos[index + 1].focus();

});

categoriaSelect.addEventListener("change", function () {

  categoriaIdInput.value = categoriaSelect.value;
});

categoriaIdInput.addEventListener("blur", function () {

  const id = String(categoriaIdInput.value).trim();

  if (!id) {
    categoriaSelect.value = "";
    return;
  }

  if (!categoriasMap[id]) {

    baseModalOpenInfo({
      titulo: "Categoría",
      mensaje: "Categoría no encontrada",
      onClose: () => {
        categoriaIdInput.value = "";
        categoriaSelect.value = "";
        categoriaIdInput.focus();
        categoriaIdInput.select();
      }
    });

    setTimeout(() => {
      categoriaIdInput.focus();
      categoriaIdInput.select();
    }, 120);

    return;
  }

  categoriaSelect.value = id;

});

async function nuevoProducto() {
  if (previewURL) {
    URL.revokeObjectURL(previewURL);
    previewURL = null;
  }

  estadoInicial();

  try {

    const res = await fetch(API);
    const data = await res.json();

    const nextId = data.length
      ? Math.max(...data.map(p => p.id)) + 1
      : 1;

    codigoInput.value = nextId;

    productoSeleccionado = null;
    window.productoSeleccionado = null;

    habilitarCampos();
    estadoOriginal = obtenerEstadoActual();

    setTimeout(() => {
      nombreInput.focus({ preventScroll: true });
    }, 100);

  } catch {
    mostrarAdvertencia("Error obteniendo código", codigoInput);
  }
}

precioVentaInput.addEventListener("blur", () => {
  let valor = precioVentaInput.value.replace(/[^\d]/g, "");
  precioVentaInput.value = valor ? Number(valor).toLocaleString("es-PY") : "";
});

//SIRVE PARA COLOCAR SCROOL EN LA TABLS OK.
function scrollAProducto(id) {

  const fila = document.querySelector(`.tabla-row[data-id="${id}"]`);
  if (!fila) return;



  const contenedor = document.querySelector(".tabla-body");

  const rectFila = fila.getBoundingClientRect();
  const rectContenedor = contenedor.getBoundingClientRect();

  if (rectFila.top < rectContenedor.top || rectFila.bottom > rectContenedor.bottom) {
    fila.scrollIntoView({
      behavior: "smooth",
      block: "center"
    });
  }
}


function soloNumeros(e) {
  if (!/[0-9]|Backspace|Delete|ArrowLeft|ArrowRight|Tab/.test(e.key)) {
    e.preventDefault();
  }
}

codigoInput.addEventListener("keydown", soloNumeros);
precioVentaInput.addEventListener("keydown", soloNumeros);

// ===== ATAJOS (SIN ESC) =====
function hayModalAbierto() {
  const modalOverlay = document.getElementById("modalOverlay");      // modal nuevo (si existe)
  const modalEliminar = document.getElementById("modalEliminar");
  const modalAdvertencia = document.getElementById("modalAdvertencia");
  const modalAjustarStock = document.getElementById("modalAjustarStock");

  return (
    (modalOverlay && !modalOverlay.classList.contains("hidden")) ||
    (modalEliminar && !modalEliminar.classList.contains("hidden")) ||
    (modalAdvertencia && !modalAdvertencia.classList.contains("hidden")) ||
    (modalAjustarStock && !modalAjustarStock.classList.contains("hidden"))
  );
}

function registrarAtajosProducto() {
  // evitar duplicar listeners si recargás scripts
  if (window._productoHotkeysHandler) {
    document.removeEventListener("keydown", window._productoHotkeysHandler);
  }

  window._productoHotkeysHandler = function (e) {

    // si hay modal abierto, NO tocar nada
    if (hayModalAbierto()) return;

    // NO manejar Escape aquí (lo maneja baseModal)
    if (e.key === "Escape") return;

    // Si querés, podés evitar que se dispare mientras escribís en un textarea
    // (por ejemplo, para que F3 guarde igual sí está OK, pero esto es opcional)
    // const tag = (document.activeElement?.tagName || "").toLowerCase();
    // if (tag === "textarea") return;

    switch (e.key) {
      case "F2":
        e.preventDefault();
        nuevoProducto();
        break;

      case "F3":
        e.preventDefault();
        if (!btnGuardar.disabled) btnGuardar.click();
        break;

      case "Delete":
        e.preventDefault();
        if (!btnEliminar.disabled) eliminarProducto();
        break;

      case "F4":
        e.preventDefault();
        if (!btnCancelar.disabled) cancelarProducto();
        break;

      case "Enter":
        if (e.ctrlKey) {
          e.preventDefault();
          if (!btnGuardar.disabled) btnGuardar.click();
        }
        break;
    }
  };

  document.addEventListener("keydown", window._productoHotkeysHandler);
}

/* ===== AJUSTAR STOCK ===== */
function abrirModalAjustarStock() {
  if (!productoSeleccionado) return;

  const nombre = nombreInput.value.trim() || `Producto #${productoSeleccionado}`;
  document.getElementById("ajusteNombreProducto").textContent = nombre;
  document.getElementById("ajusteStockActual").value = formatearStock(_stockActual);
  document.getElementById("ajusteStockNuevo").value = "";
  document.getElementById("ajusteMotivo").value = "";

  document.getElementById("modalAjustarStock").classList.remove("hidden");
  setTimeout(() => document.getElementById("ajusteStockNuevo").focus(), 60);
}

function cerrarModalAjustarStock() {
  document.getElementById("modalAjustarStock").classList.add("hidden");
}

async function confirmarAjusteStock() {
  const rawNuevo = document.getElementById("ajusteStockNuevo").value;
  const stockNuevo = Number(rawNuevo);
  const motivo = document.getElementById("ajusteMotivo").value.trim() || "Ajuste manual";

  if (rawNuevo === "" || !Number.isFinite(stockNuevo) || stockNuevo < 0) {
    mostrarAdvertencia("Ingrese una cantidad válida (mayor o igual a 0).");
    return;
  }

  try {
    const res = await fetch(`${API}/${productoSeleccionado}/ajustar-stock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stock_nuevo: stockNuevo, motivo })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      mostrarAdvertencia(err.error || "Error al ajustar el stock.");
      return;
    }

    const data = await res.json();
    _stockActual = data.stock_nuevo;

    cerrarModalAjustarStock();

    // Recargar producto y lista para reflejar el nuevo stock
    await seleccionarProducto(productoSeleccionado);
    await cargarProductos();

  } catch (err) {
    console.error("Error ajustando stock:", err);
    mostrarAdvertencia("Error de conexión: " + (err.message || err));
  }
}

// Cerrar modal ajuste con Escape
document.addEventListener("keydown", function (e) {
  const modal = document.getElementById("modalAjustarStock");
  if (!modal || modal.classList.contains("hidden")) return;
  if (e.key === "Escape") {
    e.preventDefault();
    cerrarModalAjustarStock();
  }
  if (e.key === "Enter") {
    const activo = document.activeElement;
    // Enter en el campo nueva cantidad o motivo confirma
    if (
      activo === document.getElementById("ajusteStockNuevo") ||
      activo === document.getElementById("ajusteMotivo")
    ) {
      e.preventDefault();
      confirmarAjusteStock();
    }
  }
}, true);

/* ===== INIT ===== */
document.addEventListener("DOMContentLoaded", async () => {

  await cargarCategorias();
  await cargarProductos();
  await cargarDestinos();

  // Mostrar botón Ajustar Stock solo para roles autorizados.
  // Se verifica 2 veces: ahora (caché) y a los 1200ms (tras seguridad.js async).
  aplicarVisibilidadBtnStock();
  setTimeout(aplicarVisibilidadBtnStock, 1200);

  estadoInicial();

  const contenedor = document.querySelector(".tabla-body");

  contenedor.addEventListener("scroll", () => {
    if (
      contenedor.scrollTop + contenedor.clientHeight >= contenedor.scrollHeight - 50
    ) {
      page++;
      cargarProductos();
    }
  });

  baseModalEnableExitProtection({
    hayCambios: hayCambiosSinGuardar,
    onExit: () => {
      window.location.href = "../../home.html";
    }
  });

  registrarAtajosProducto();

  setTimeout(() => {
    codigoInput.focus();
    codigoInput.select();
  }, 120);

  consumirCategoriaDesdeStorage();

  const productoDesdePrecio = Number(urlParamsProductos.get("producto") || 0);
  const fromPrecio = String(urlParamsProductos.get("from") || "").toLowerCase() === "precio";
  if (fromPrecio && productoDesdePrecio > 0) {
    seleccionarProducto(productoDesdePrecio).catch(() => {});
  }
});


thId.addEventListener("click", () => {

  sortDir = sortDir === "asc" ? "desc" : "asc";

  thId.textContent = sortDir === "asc" ? "ID â–²" : "ID â–¼";

  page = 1;     
  fin = false;  

  cargarProductos();
});

window.addEventListener("impresorasActualizadas", () => {
  cargarDestinos();
});

if (btnBuscarFiltroCategoria) {
  btnBuscarFiltroCategoria.addEventListener("click", abrirSelectorCategoriaFiltro);
}

if (btnLimpiarFiltroCategoria) {
  btnLimpiarFiltroCategoria.addEventListener("click", limpiarFiltroCategoria);
}

if (filtroCategoriaInput) {
  const aplicarCambioFiltroCategoria = () => {
    filtroCategoriaInput.value = String(filtroCategoriaInput.value || "").replace(/[^0-9]/g, "");

    const valorId = String(filtroCategoriaInput.value || "").trim();

    if (!valorId) {
      if (filtroCategoriaNombreInput) filtroCategoriaNombreInput.value = "";
      localStorage.removeItem(CATEGORIA_STORAGE_KEY);
    } else if (filtroCategoriaNombreInput) {
      const idActualNombre = String(filtroCategoriaNombreInput.dataset.categoriaId || "").trim();
      if (idActualNombre && idActualNombre !== valorId) {
        filtroCategoriaNombreInput.value = "";
      }
    }

    if (filtroCategoriaNombreInput) {
      filtroCategoriaNombreInput.dataset.categoriaId = valorId;
    }

    page = 1;
    fin = false;
    cargarProductos();
  };

  filtroCategoriaInput.addEventListener("input", aplicarCambioFiltroCategoria);
  filtroCategoriaInput.addEventListener("change", aplicarCambioFiltroCategoria);
}

window.addEventListener("focus", consumirCategoriaDesdeStorage);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) consumirCategoriaDesdeStorage();
});

[filtroDestinoInput, filtroMonedaInput, filtroEsInsumoInput].forEach((el) => {
  if (!el) return;
  el.addEventListener('input', () => { page = 1; fin = false; cargarProductos(); });
  el.addEventListener('change', () => { page = 1; fin = false; cargarProductos(); });
});








