const API = "/api/comprador";

let compradores = [];
let sortField = "id";
let sortDir = "desc";

// ===== DOM =====
const compradorId = document.getElementById("compradorId");
const codigoComprador = document.getElementById("codigoComprador");
const nombre = document.getElementById("nombre");
const buscar = document.getElementById("buscarComprador");

const btnNuevo = document.getElementById("btnNuevo");
const btnGuardar = document.getElementById("btnGuardar");
const btnEliminar = document.getElementById("btnEliminar");
const btnCancelar = document.getElementById("btnCancelar");

const tablaCompradores = document.getElementById("tablaCompradores");

// ===== LOAD =====
async function cargar() {
  try {
    const res = await fetch(API);
    if (!res.ok) throw new Error();

    compradores = await res.json();
    render(compradores);

  } catch {
    tablaCompradores.innerHTML =
      "<div style='padding:10px;color:red'>Error cargando datos</div>";
  }
}

// ===== RENDER =====
function render(data) {

  data = [...data].sort((a, b) => {
    const av = a[sortField] ?? 0;
    const bv = b[sortField] ?? 0;
    return sortDir === "asc" ? av - bv : bv - av;
  });

  tablaCompradores.innerHTML = "";

  if (!data.length) {
    tablaCompradores.innerHTML =
      '<div style="padding:15px;color:#999">Sin compradores</div>';
    return;
  }

  data.forEach(c => {

    const row = document.createElement("div");
    row.className = "tabla-row";

    row.innerHTML = `
      <span>${c.id}</span>
      <span>${c.nombre}</span>
    `;

    row.onclick = () => {
      document.querySelectorAll(".tabla-row")
        .forEach(r => r.classList.remove("activo"));

      row.classList.add("activo");
      seleccionar(c);
    };

    tablaCompradores.appendChild(row);
  });
}

// ===== SELECT =====
function seleccionar(c) {

  compradorId.value = c.id;
  codigoComprador.value = c.id;
  nombre.value = c.nombre;

  habilitarFormulario();

  btnGuardar.disabled = false;
  btnEliminar.disabled = false;
  btnCancelar.disabled = false;
}

// ===== BLOQUEAR / HABILITAR =====
function bloquearFormulario() {
  nombre.disabled = true;
}

function habilitarFormulario() {
  nombre.disabled = false;
}

// ===== NUEVO =====
async function nuevo() {

  compradorId.value = "";
  nombre.value = "";

  const nextId = await obtenerProximoId();
  codigoComprador.value = nextId;

  habilitarFormulario();

  btnGuardar.disabled = false;
  btnEliminar.disabled = true;
  btnCancelar.disabled = false;

  setTimeout(() => nombre.focus(), 50);
}

// ===== CANCELAR =====
function cancelar() {

  compradorId.value = "";
  codigoComprador.value = "";
  nombre.value = "";

  document.querySelectorAll(".tabla-row")
    .forEach(r => r.classList.remove("activo"));

  btnGuardar.disabled = true;
  btnEliminar.disabled = true;
  btnCancelar.disabled = true;

  bloquearFormulario();

  codigoComprador.focus();
}

// ===== GUARDAR =====
async function guardar() {

  if (!nombre.value.trim()) {
    mostrarAdvertencia("Ingrese nombre");
    nombre.focus();
    return;
  }

  const payload = {
    nombre: nombre.value.trim()
  };

  try {

    if (!compradorId.value) {
      // NUEVO
      await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
    } else {
      // EDITAR
      await fetch(`${API}/${compradorId.value}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
    }

    cancelar();
    cargar();

  } catch {
    mostrarAdvertencia("Error al guardar");
  }
}

// ===== ELIMINAR =====
let compradorAEliminar = null;

function eliminar() {
  if (!compradorId.value) return;

  compradorAEliminar = compradorId.value;
  document.getElementById("modalNombreComprador").textContent = nombre.value;
  document.getElementById("modalEliminar").classList.remove("hidden");
}

function cerrarModalEliminar() {
  compradorAEliminar = null;
  document.getElementById("modalEliminar").classList.add("hidden");
}

async function confirmarEliminar() {

  if (!compradorAEliminar) return;

  await fetch(`${API}/${compradorAEliminar}`, {
    method: "DELETE"
  });

  cerrarModalEliminar();
  cancelar();
  cargar();
}

// ===== FILTRO =====
function filtrar() {
  const t = buscar.value.toLowerCase().trim();

  render(
    compradores.filter(c =>
      (c.nombre || "").toLowerCase().includes(t)
    )
  );
}

// ===== PROXIMO ID =====
async function obtenerProximoId() {
  const res = await fetch(API);
  const data = await res.json();

  if (!data.length) return 1;

  const maxId = Math.max(...data.map(c => c.id));
  return maxId + 1;
}

// ===== MODAL ADVERTENCIA =====
function mostrarAdvertencia(texto) {
  document.getElementById("modalAdvertenciaTexto").textContent = texto;
  document.getElementById("modalAdvertencia").classList.remove("hidden");
}

function cerrarAdvertencia() {
  document.getElementById("modalAdvertencia").classList.add("hidden");
}

// ===== ATAJOS =====
document.addEventListener("keydown", e => {

  if (e.key === "F2") {
    e.preventDefault();
    nuevo();
  }

  if (e.key === "F3") {
    e.preventDefault();
    guardar();
  }

  if (e.key === "Delete") {
    e.preventDefault();
    if (!btnEliminar.disabled) eliminar();
  }

  if (e.key === "Escape") {
    e.preventDefault();
    volver();
  }
});

// ===== INIT =====
window.onload = () => {

  bloquearFormulario();
  btnGuardar.disabled = true;
  btnEliminar.disabled = true;
  btnCancelar.disabled = true;

  cargar();

  setTimeout(() => {
    codigoComprador.focus();
  }, 100);
};