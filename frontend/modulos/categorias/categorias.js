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

/* ===== ESTADO ===== */
let categoriaSeleccionada = null;
let categoriaBackup = null;

let sortField = "id";
let sortDir = "desc";

soloNumeros(codigoCategoria);
soloNumeros(ordenPantalla);

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
  previewImagen.src = "";
  bloquearForm();
  btnGuardar.disabled = true;
  btnEliminar.disabled = true;
  btnCancelar.disabled = true;
  categoriaSeleccionada = null;
  categoriaBackup = null;
}

/* ===== OBTENER PROXIMO ID ===== */
async function obtenerProximoId() {
  const res = await fetch(API);
  const data = await res.json();
  if (!data.length) return 1;
  const maxId = Math.max(...data.map(c => c.id));
  return maxId + 1;
}

/* ===== MODAL ===== */
const modalOverlay = document.getElementById("modalOverlay");
const modalIcon = document.getElementById("modalIcon");
const modalTitulo = document.getElementById("modalTitulo");
const modalMensaje = document.getElementById("modalMensaje");
const modalExtra = document.getElementById("modalExtra");
const modalBtnCancel = document.getElementById("modalBtnCancel");
const modalBtnOk = document.getElementById("modalBtnOk");
const modalBtnDanger = document.getElementById("modalBtnDanger");

function abrirModalInfo({ titulo, mensaje, extraHTML = "" }) {
  modalIcon.textContent = "ℹ️";
  modalTitulo.textContent = titulo;
  modalMensaje.textContent = mensaje;
  modalExtra.innerHTML = extraHTML;
  modalExtra.style.display = extraHTML ? "block" : "none";
  modalBtnOk.classList.remove("hidden");
  modalBtnCancel.classList.add("hidden");
  modalBtnDanger.classList.add("hidden");
  modalBtnOk.onclick = cerrarModal;
  modalOverlay.classList.remove("hidden");
  setTimeout(() => modalBtnOk.focus(), 10);
}

function abrirModalConfirm({ titulo, mensaje, onConfirm }) {
  modalIcon.textContent = "⚠️";
  modalTitulo.textContent = titulo;
  modalMensaje.textContent = mensaje;
  modalExtra.innerHTML = "";
  modalExtra.style.display = "none";
  modalBtnOk.classList.add("hidden");
  modalBtnCancel.classList.remove("hidden");
  modalBtnDanger.classList.remove("hidden");
  modalBtnCancel.onclick = cerrarModal;
  modalBtnDanger.onclick = async () => {
    cerrarModal();
    await onConfirm();
  };
  modalOverlay.classList.remove("hidden");
}

function cerrarModal() {
  modalOverlay.classList.add("hidden");
  setTimeout(() => {
    codigoCategoria.focus();
    codigoCategoria.select();
  }, 50);
}

document.addEventListener("keydown", (e) => {
  if (modalOverlay.classList.contains("hidden")) return;
  if (e.key === "Enter") {
    e.preventDefault();
    if (!modalBtnOk.classList.contains("hidden")) modalBtnOk.click();
    if (!modalBtnDanger.classList.contains("hidden")) modalBtnDanger.click();
  }
  if (e.key === "Escape") cerrarModal();
});

/* ===== IMAGEN ===== */
imagenCategoria.addEventListener("change", () => {
  const file = imagenCategoria.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => previewImagen.src = e.target.result;
  reader.readAsDataURL(file);
});

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
    row.onclick = () => seleccionarCategoria(c);

    row.ondblclick = () => {
      const params = new URLSearchParams(window.location.search);
      if (params.get("from") === "producto") {
        sessionStorage.setItem("categoriaSeleccionadaId", c.id);
        location.href = "../productos/productos.html?refreshCategorias=1";
      }
    };

    lista.appendChild(row);
  });
}

/* ===== SELECCIONAR ===== */
function seleccionarCategoria(c) {
  codigoCategoria.value = c.id;
  categoriaSeleccionada = c.id;
  categoriaBackup = { ...c };
  categoriaId.value = c.id;
  nombreCategoria.value = c.nombre;
  ordenPantalla.value = c.orden_pantalla || 0;
 previewImagen.src = c.imagen ? `${c.imagen}` : ""
 activoCategoria.checked = c.activo === true;
  habilitarForm()
  btnEliminar.disabled = false;
  btnCancelar.disabled = false;
  btnGuardar.disabled = false;
  cargarCategorias();
}

/* ===== BUSCAR POR CODIGO ENTER ===== */
codigoCategoria.addEventListener("keydown", async (e) => {
  if (e.key !== "Enter") return;
  e.preventDefault();
  const valor = codigoCategoria.value.trim();

  if (!valor) {
    await nuevo();
    return;
  }

  const id = parseInt(valor);
  const data = await (await fetch(API)).json();
  const encontrada = data.find(c => Number(c.id) === id);

  if (encontrada) {
    seleccionarCategoria(encontrada);
    return;
  }

  abrirModalInfo({
    titulo: "No encontrado",
    mensaje: `No existe categoría con código ${id}`
  });
});

/* ===== NUEVO ===== */
async function nuevo() {
  form.reset();
  previewImagen.src = "";
  habilitarForm();
  activoCategoria.checked = true;
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

  formData.append("nombre", nombreCategoria.value.trim());
  formData.append("orden_pantalla", ordenPantalla.value || 0);

  if (imagenCategoria.files[0]) {
    formData.append("imagen", imagenCategoria.files[0]);
  }

  const url = categoriaSeleccionada
    ? `${API}/${categoriaSeleccionada}`
    : API;

  const method = categoriaSeleccionada ? "PUT" : "POST";

  await fetch(url, {
    method,
    body: formData
  });

  estadoInicial();
  cargarCategorias();
});


/* ===== ELIMINAR ===== */
async function eliminar() {
  if (!categoriaSeleccionada) return;

  abrirModalConfirm({
    titulo: "Confirmar eliminación",
    mensaje: `¿Desea eliminar la categoría #${categoriaSeleccionada}?`,
    onConfirm: async () => {
      const res = await fetch(`${API}/${categoriaSeleccionada}`, { method: "DELETE" });

      if (res.ok) {
        estadoInicial();
        cargarCategorias();
        return;
      }

      let data = {};
      try { data = await res.json(); } catch (_) {}

      if (res.status === 409) {
        const productos = (data.productos || []);
        const listaProd = productos.length
          ? `<b>Productos relacionados:</b><br>` +
            productos.map(p => `• Producto #${p.id} — ${p.nombre}`).join("<br>")
          : "";

        abrirModalInfo({
          titulo: "No se puede eliminar",
          mensaje: data.mensaje || `La categoría #${categoriaSeleccionada} está en uso.`,
          extraHTML: listaProd
        });
        return;
      }

      abrirModalInfo({
        titulo: "Error",
        mensaje: data.mensaje || "No se pudo eliminar la categoría."
      });
    }
  });
}

/* ===== INDICADOR ORDEN ===== */
function actualizarIndicadorOrden() {
  const thId = document.getElementById("thId");
  if (!thId) return;
  thId.textContent = sortDir === "asc" ? "ID ▲" : "ID ▼";
}

/* ===== INIT ===== */
document.addEventListener("DOMContentLoaded", () => {
  estadoInicial();

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
  if (e.key === "F2") { e.preventDefault(); if (!btnNuevo.disabled) nuevo(); }
  if (e.key === "F3") { e.preventDefault(); if (!btnGuardar.disabled) btnGuardar.click(); }
  if (e.key === "F4") { e.preventDefault(); if (!btnCancelar.disabled) cancelar(); }
  if (e.key === "Delete") { e.preventDefault(); if (!btnEliminar.disabled) eliminar(); }
  if (e.key === "Escape") { e.preventDefault(); volver(); }
});

function soloNumeros(input) {
  input.addEventListener("input", () => {
    input.value = input.value.replace(/[^0-9]/g, "");
  });
}