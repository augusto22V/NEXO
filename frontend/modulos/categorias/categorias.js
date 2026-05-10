const API = "/api/categorias";

/* ===== ELEMENTOS ===== */
const form = document.getElementById("formCategoria");
const lista = document.getElementById("listaCategorias");
const buscador = document.getElementById("buscador");
const categoriaId = document.getElementById("categoriaId");
const codigoCategoria = document.getElementById("codigoCategoria");
const nombreCategoria = document.getElementById("nombreCategoria");
const btnNuevo = document.getElementById("btnNuevo");
const btnGuardar = document.getElementById("btnGuardar");
const btnEliminar = document.getElementById("btnEliminar");
const btnCancelar = document.getElementById("btnCancelar");
const ordenPantalla = document.getElementById("ordenPantalla");
const imagenCategoria = document.getElementById("imagenCategoria");
const previewImagen = document.getElementById("previewImagen");
const activoCategoria = document.getElementById("activoCategoria");
const mostrarVentaMedioCategoria = document.getElementById("mostrarVentaMedioCategoria");
const mostrarMenuDigitalCategoria = document.getElementById("mostrarMenuDigitalCategoria");

/* ===== ESTADO ===== */
let categoriaSeleccionada = null;
let categoriaBackup = null;

let sortField = "id";
let sortDir = "desc";
let permitirSalida = false;

const categoriaQueryParams = new URLSearchParams(window.location.search);
const categoriaFrom = categoriaQueryParams.get("from");
const categoriaModo = String(categoriaQueryParams.get("modo") || "").toLowerCase();
const categoriaVolver = categoriaQueryParams.get("volver");
const CATEGORIA_STORAGE_KEY = "categoriaSeleccionada";
const isCategoriaSelectFromProducto = categoriaFrom === "producto";
const isCategoriaSelectFromConsulta = categoriaFrom === "consulta_productos" || categoriaVolver === "consulta_productos";
const isCategoriaModoSeleccion = categoriaModo === "seleccion";
const isCategoriaSelectMode = isCategoriaModoSeleccion || isCategoriaSelectFromProducto || isCategoriaSelectFromConsulta;


soloNumeros(codigoCategoria);
soloNumeros(ordenPantalla);

/* ===== MAYUSCULAS AUTOMATICAS ===== */
nombreCategoria.addEventListener("input", () => {
  nombreCategoria.value = nombreCategoria.value.toUpperCase();
});
function marcarErrorOrden() {
  ordenPantalla.style.border = "2px solid #e74c3c";
  ordenPantalla.style.backgroundColor = "#ffe6e6";
}

function quitarErrorOrden() {
  ordenPantalla.style.border = "";
  ordenPantalla.style.backgroundColor = "";
}

/* ===== FORM STATES ===== */
function bloquearForm() {
  nombreCategoria.disabled = true;
  imagenCategoria.disabled = true;
}

function habilitarForm() {
  nombreCategoria.disabled = false;
  imagenCategoria.disabled = false;
}

/* ===== ESTADO INICIAL ===== */
function estadoInicial() {
  form.reset();
  codigoCategoria.value = "";
  if (previewURLCategoria) {
  URL.revokeObjectURL(previewURLCategoria);
  previewURLCategoria = null;
}

previewImagen.src = "";
  bloquearForm();
  btnGuardar.disabled = true;
  btnEliminar.disabled = true;
  btnCancelar.disabled = true;
  categoriaSeleccionada = null;
  categoriaBackup = null;
  activoCategoria.checked = true;
  mostrarVentaMedioCategoria.checked = false;
  mostrarMenuDigitalCategoria.checked = false;
}

/* ===== OBTENER PROXIMO ID ===== */
async function obtenerProximoId() {
  const res = await fetch(API);
  const data = await res.json();
  if (!data.length) return 1;
  const maxId = Math.max(...data.map(c => c.id));
  return maxId + 1;
}

function hayCambiosSinGuardar() {

  if (btnGuardar.disabled) return false;

  if (!categoriaSeleccionada &&
      !nombreCategoria.value.trim()) {
    return false;
  }

  return true;
}

function volverSeguro() {

  if (hayCambiosSinGuardar()) {

    baseModalOpenConfirmGeneric({
      titulo: "Salir",
      mensaje: "Hay cambios sin guardar. ¿Desea salir?",
      onConfirm: () => {
        history.back();
      }
    });

  } else {
    history.back();
  }
}

/* ===== IMAGEN ===== */
let previewURLCategoria = null;

imagenCategoria.addEventListener("change", () => {

  const file = imagenCategoria.files[0];
  if (!file) return;

  // liberar anterior
  if (previewURLCategoria) {
    URL.revokeObjectURL(previewURLCategoria);
  }

  previewURLCategoria = URL.createObjectURL(file);

  previewImagen.src = previewURLCategoria;
});

function devolverCategoriaSeleccion(c) {
  if (isCategoriaModoSeleccion) {
    const categoriaSeleccionada = {
      id: c.id,
      nombre: c.nombre || ""
    };

    if (window.opener && !window.opener.closed && typeof window.opener.recibirCategoria === "function") {
      try {
        window.opener.recibirCategoria(categoriaSeleccionada);
      } catch {
        localStorage.setItem(CATEGORIA_STORAGE_KEY, JSON.stringify(categoriaSeleccionada));
      }
    } else {
      localStorage.setItem(CATEGORIA_STORAGE_KEY, JSON.stringify(categoriaSeleccionada));
    }

    window.close();
    return true;
  }

  if (isCategoriaSelectFromProducto) {
    sessionStorage.setItem("categoriaSeleccionadaId", c.id);
    location.href = "../productos/productos.html?refreshCategorias=1";
    return true;
  }

  if (isCategoriaSelectFromConsulta) {
    sessionStorage.setItem("consultaProductosCategoriaSeleccionada", JSON.stringify({
      id: c.id,
      nombre: c.nombre || ""
    }));
    location.href = "../consultas/consulta_productos.html";
    return true;
  }

  return false;
}
/* ===== LISTAR ===== */
async function cargarCategorias() {
  const res = await fetch(API);
  let data = await res.json();

  const texto = buscador.value.toLowerCase();
  if (texto) {
    data = data.filter(c => c.nombre.toLowerCase().includes(texto));
  }

  data.sort((a, b) => {
    const av = a[sortField];
    const bv = b[sortField];
    return sortDir === "asc" ? av - bv : bv - av;
  });

  lista.innerHTML = "";

  data.forEach(c => {
    const row = document.createElement("div");
    row.className = "tabla-row";

    if (categoriaSeleccionada === c.id) {
      row.classList.add("activo");
    }

   row.innerHTML = `
  <span>${c.id}</span>
  <span>${c.nombre}</span>
  <span>${c.orden_pantalla ?? 0}</span>
  <span class="${c.activo ? 'estado-activo' : 'estado-inactivo'}">
    ${c.activo ? 'Activo' : 'Inactivo'}
  </span>
  `;
    row.onclick = () => {
      if (isCategoriaModoSeleccion || isCategoriaSelectFromConsulta) {
        devolverCategoriaSeleccion(c);
        return;
      }
      seleccionarCategoria(c);
    };

    row.ondblclick = () => {
      if (isCategoriaSelectMode) {
        devolverCategoriaSeleccion(c);
      }
    };

    lista.appendChild(row);
  });
}

let _warnListener = null;
let _warnFocusEl = null;

function mostrarAdvertencia(texto, focusEl = codigoCategoria) {

  const modal = document.getElementById('modalAdvertencia');
  const txt = document.getElementById('modalAdvertenciaTexto');
  const btn = modal?.querySelector('.btn-aceptar');

  if (!modal || !txt || !btn) return;

  txt.textContent = texto;
  _warnFocusEl = focusEl || codigoCategoria;

  modal.classList.remove('hidden');

  setTimeout(() => btn.focus(), 30);

  if (_warnListener) document.removeEventListener('keydown', _warnListener);

  _warnListener = function (e) {

    if (e.key === 'Enter' || e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      cerrarAdvertencia(true);
    }
  };

  document.addEventListener('keydown', _warnListener);
}

function cerrarAdvertencia(refocus = false) {

  const modal = document.getElementById('modalAdvertencia');
  if (modal) modal.classList.add('hidden');

  if (_warnListener) {
    document.removeEventListener('keydown', _warnListener);
    _warnListener = null;
  }

  if (refocus && _warnFocusEl) {
    setTimeout(() => {
      _warnFocusEl.focus();
      _warnFocusEl.select?.();
    }, 40);
  }
}

/* ===== SELECCIONAR ===== */
function seleccionarCategoria(c) {
  codigoCategoria.value = c.id;
  categoriaSeleccionada = c.id;
  categoriaBackup = { ...c };
  categoriaId.value = c.id;
  nombreCategoria.value = c.nombre;
  ordenPantalla.value = c.orden_pantalla || 0;
 // liberar preview si existía
if (previewURLCategoria) {
  URL.revokeObjectURL(previewURLCategoria);
  previewURLCategoria = null;
}

previewImagen.src = c.imagen ? c.imagen : "";
 activoCategoria.checked = c.activo === true;
 mostrarVentaMedioCategoria.checked = c.mostrar_venta_medio === true;
 mostrarMenuDigitalCategoria.checked = c.mostrar_menu_digital === true;
  habilitarForm()
  btnEliminar.disabled = false;
  btnCancelar.disabled = false;
  btnGuardar.disabled = false;
  cargarCategorias();
}

/* ===== BUSCAR POR CODIGO ENTER ===== */
codigoCategoria.addEventListener("keydown", async (e) => {

  if (e.key !== "Enter") return;

  const valor = codigoCategoria.value.trim();

  if (!valor) {
    e.preventDefault();
    await nuevo();
    return;
  }

  const id = Number(valor);

  const data = await (await fetch(API)).json();
  const encontrada = data.find(c => Number(c.id) === id);

  if (encontrada) {
    e.preventDefault();
    seleccionarCategoria(encontrada);
    return;
  }

  //  Si no existe â†’ cortar propagación
  e.preventDefault();
  e.stopImmediatePropagation();

mostrarAdvertencia(`No existe categoría con código ${id}`, codigoCategoria);
});


/* ===== NUEVO ===== */
async function nuevo() {
  form.reset();
  if (previewURLCategoria) {
  URL.revokeObjectURL(previewURLCategoria);
  previewURLCategoria = null;
}

previewImagen.src = "";
  previewImagen.src = "";
  habilitarForm();
  activoCategoria.checked = true;
  mostrarVentaMedioCategoria.checked = false;
  mostrarMenuDigitalCategoria.checked = false;
  categoriaSeleccionada = null;
  categoriaBackup = null;
  btnGuardar.disabled = false;
  btnEliminar.disabled = true;
  btnCancelar.disabled = false;
  const nextId = await obtenerProximoId();
  codigoCategoria.value = nextId;
  setTimeout(() => nombreCategoria.focus(), 50);
  obtenerProximoOrden().then(n => ordenPantalla.value = n);
}

/* ===== PROXIMO ORDEN ===== */
async function obtenerProximoOrden() {
  const data = await (await fetch(API)).json();
  if (!data.length) return 1;
  const maxOrden = Math.max(...data.map(c => c.orden_pantalla || 0));
  return maxOrden + 1;
}

/* ===== CANCELAR ===== */
function cancelar() {
  estadoInicial();
  cargarCategorias();
}

/* ===== GUARDAR ===== */
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const formData = new FormData();
  formData.append("activo", activoCategoria.checked);
  formData.append("mostrar_venta_medio", mostrarVentaMedioCategoria.checked);
  formData.append("mostrar_menu_digital", mostrarMenuDigitalCategoria.checked);

  formData.append("nombre", nombreCategoria.value.trim());
  formData.append("orden_pantalla", ordenPantalla.value || 0);

  const ordenVentaMedio =
    categoriaSeleccionada && categoriaBackup
      ? Number(categoriaBackup.orden_venta_medio ?? 0)
      : Number(ordenPantalla.value || 0);

  if (Number.isFinite(ordenVentaMedio)) {
    formData.append("orden_venta_medio", ordenVentaMedio);
  }

  if (imagenCategoria.files[0]) {
    formData.append("imagen", imagenCategoria.files[0]);
  }

  const url = categoriaSeleccionada
    ? `${API}/${categoriaSeleccionada}`
    : API;

  const method = categoriaSeleccionada ? "PUT" : "POST";

  const res = await fetch(url, {
    method,
    body: formData
  });

  if (!res.ok) {
    mostrarAdvertencia("Error al guardar la categoría");
    return;
  }

  estadoInicial();
  cargarCategorias();

setTimeout(() => {
  codigoCategoria.focus();
  codigoCategoria.select();
}, 80);
});


/* ===== ELIMINAR ===== */
let categoriaAEliminar = null;

function eliminar() {

  if (!categoriaSeleccionada) return;

  categoriaAEliminar = categoriaSeleccionada;

  document.getElementById('modalNombreCategoria').textContent =
    nombreCategoria.value;

  document.getElementById('modalEliminar')
    .classList.remove('hidden');
}

function cerrarModalEliminar() {
  categoriaAEliminar = null;
  document.getElementById('modalEliminar')
    .classList.add('hidden');
}

async function confirmarEliminar() {

  if (!categoriaAEliminar) return;

  await fetch(`${API}/${categoriaAEliminar}`, {
    method: 'DELETE'
  });

  cerrarModalEliminar();
  estadoInicial();
  cargarCategorias();
}

/* ===== INDICADOR ORDEN ===== */
function actualizarIndicadorOrden() {
  const thId = document.getElementById("thId");
  if (!thId) return;
  thId.textContent = sortDir === "asc" ? "ID â–²" : "ID â–¼";
}


/* ===== ENTER NAVEGACION ===== */
form.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  if (document.activeElement.id === "codigoCategoria") return;
  e.preventDefault();

  const focusables = [nombreCategoria, ordenPantalla, imagenCategoria];
  const index = focusables.indexOf(document.activeElement);

  if (index < focusables.length - 1) {
    focusables[index + 1].focus();
  } else {
    btnGuardar.click();
  }
});


/* ===== ATAJOS ===== */
document.addEventListener("keydown", (e) => {
  if (isCategoriaModoSeleccion) {
    if (e.key === "Escape") {
      e.preventDefault();
      window.close();
    }
    return;
  }

  if (e.key === "F2") { e.preventDefault(); if (!btnNuevo.disabled) nuevo(); }
  if (e.key === "F3") { e.preventDefault(); if (!btnGuardar.disabled) btnGuardar.click(); }
  if (e.key === "F4") { e.preventDefault(); if (!btnCancelar.disabled) cancelar(); }
  if (e.key === "Delete") { e.preventDefault(); if (!btnEliminar.disabled) eliminar(); }
if (e.key === "Escape") {
  // si el modalAdvertencia está abierto, no hacemos volverSeguro
  const abierto = !document.getElementById("modalAdvertencia")?.classList.contains("hidden");
  if (abierto) return;

  e.preventDefault();
  volverSeguro();
}
});

function soloNumeros(input) {
  input.addEventListener("input", () => {
    input.value = input.value.replace(/[^0-9]/g, "");
  });
}

/* ===== VALIDAR ORDEN DUPLICADO ===== */
/* ===== VALIDAR ORDEN DUPLICADO (SOLO AVISA) ===== */
async function validarOrdenDuplicado() {

  const orden = Number(ordenPantalla.value);

  if (!orden) {
    quitarErrorOrden();
    return true;
  }

  const data = await (await fetch(API)).json();

  const duplicado = data.find(c =>
    Number(c.orden_pantalla) === orden &&
    Number(c.id) !== Number(categoriaSeleccionada)
  );

  if (duplicado) {
    marcarErrorOrden();

    mostrarAdvertencia(
      `Ya existe una categoría con orden ${orden}. 
      Puede guardar igual o cambiar el orden.`,
      ordenPantalla
    );

    return true; 
  }

  quitarErrorOrden();
  return true;
}
ordenPantalla.addEventListener("blur", validarOrdenDuplicado);

/* ===== INIT ===== */
document.addEventListener("DOMContentLoaded", () => {
  if (isCategoriaModoSeleccion) {
    const panelForm = document.querySelector(".panel-form");
    const contenedor = document.querySelector(".admin-container");
    const titulo = document.getElementById("moduloTitulo");
    const btnVolver = document.querySelector(".btn-volver");

    if (panelForm) panelForm.style.display = "none";
    if (contenedor) contenedor.classList.add("modo-seleccion");
    if (titulo) titulo.innerText = "Seleccionar Categoría";
    if (btnVolver) btnVolver.onclick = () => window.close();
  }

  estadoInicial();

  baseModalEnableExitProtection({
  hayCambios: hayCambiosSinGuardar
});

  const thId = document.getElementById("thId");
  if (thId) {
    thId.addEventListener("click", () => {
      sortDir = sortDir === "asc" ? "desc" : "asc";
      actualizarIndicadorOrden();
      cargarCategorias();
    });
  }

  actualizarIndicadorOrden();
  cargarCategorias();

  setTimeout(() => {
    codigoCategoria.focus();
    codigoCategoria.select();
  }, 120);
});






