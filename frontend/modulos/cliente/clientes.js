const API = "/api/clientes";

let clientes = [];
let cargandoCliente = false;
let formDirty = false;

let sortField = "id";
let sortDir = "desc";

// ===== DOM =====
const clienteId = document.getElementById('clienteId');
const codigoCliente = document.getElementById('codigoCliente');
const nombre = document.getElementById('nombre');
const razon = document.getElementById('razon');
const ruc = document.getElementById('ci-ruc');
const telefono = document.getElementById('telefono');
const direccion = document.getElementById('direccion');
const email = document.getElementById('email');
const buscar = document.getElementById('buscar');

const btnNuevo = document.getElementById('btnNuevo');
const btnGuardar = document.getElementById('btnGuardar');
const btnEliminar = document.getElementById('btnEliminar');
const btnCancelar = document.getElementById('btnCancelar');

const tablaClientes = document.getElementById('tablaClientes');

// ===== PARAMS =====
const params = new URLSearchParams(window.location.search);
const mode = params.get("mode");
const from = params.get("from");

// ===== LOAD =====
async function cargar() {
try {
const res = await fetch(API);
if (!res.ok) throw new Error();
clientes = await res.json();
render(clientes);
} catch {
console.error("Error cargando clientes");
tablaClientes.innerHTML = "<div style='padding:10px;color:red'>Error cargando datos</div>";
}
}

function bloquearFormulario() {

  nombre.disabled = true;
  razon.disabled = true;
  ruc.disabled = true;
  telefono.disabled = true;
  direccion.disabled = true;
  email.disabled = true;

}

function habilitarFormulario() {

  nombre.disabled = false;
  razon.disabled = false;
  ruc.disabled = false;
  telefono.disabled = false;
  direccion.disabled = false;
  email.disabled = false;

}

// ===== RENDER =====
function render(data) {

data = [...data].sort((a, b) => {
const av = a[sortField] ?? 0;
const bv = b[sortField] ?? 0;
return sortDir === "asc" ? av - bv : bv - av;
});

tablaClientes.innerHTML = '';

if (!data.length) {
tablaClientes.innerHTML = '<div style="padding:15px;color:#999">Sin clientes</div>';
return;
}

data.forEach(c => {

const row = document.createElement('div');
row.className = 'tabla-row';

row.innerHTML = `
  <span>${c.id}</span>
  <span>${c.nombre}</span>
  <span>${c.razon_social || '-'}</span>
  <span>${c.ruc || '-'}</span>
  <span>${c.telefono || '-'}</span>
  <span>${c.direccion || '-'}</span>
  <span>${c.email || '-'}</span>
`;

row.onclick = () => {

  if (mode === "select" && from === "venta") {
    document.querySelectorAll('.tabla-row').forEach(r => r.classList.remove('activo'));
    row.classList.add('activo');
    return;
  }

  if (formDirty) {
    mostrarAdvertencia('Finalice la carga o cancele');
    return;
  }

  document.querySelectorAll('.tabla-row').forEach(r => r.classList.remove('activo'));
  row.classList.add('activo');

  seleccionar(c);
};

row.ondblclick = () => {
  if (mode === "select" && from === "venta") {
    seleccionarClienteParaVenta(c);
    return;
  }
  seleccionar(c);
};

tablaClientes.appendChild(row);


});
}

async function obtenerProximoId() {
  const res = await fetch(API);
  const data = await res.json();

  if (!data.length) return 1;

  const maxId = Math.max(...data.map(c => c.id));
  return maxId + 1;
}

codigoCliente.addEventListener("keydown", async (e) => {

  if (e.key !== "Enter") return;
  e.preventDefault();

  const valor = codigoCliente.value.trim();

  // ENTER vacío → nuevo
  if (!valor) {
    const nextId = await obtenerProximoId();
    codigoCliente.value = nextId;
    modoNuevo();
    setTimeout(() => nombre.focus(), 50);
    return;
  }

  const id = parseInt(valor);

  const encontrado = clientes.find(c => Number(c.id) === id);

  if (encontrado) {
    seleccionar(encontrado);
    return;
  }

  mostrarAdvertencia(`No existe cliente con código ${id}`);
});

// ===== SELECT =====
function seleccionar(c) {

codigoCliente.value = c.id;

clienteId.value = c.id;
nombre.value = c.nombre;
razon.value = c.razon_social || '';
ruc.value = c.ruc || '';
telefono.value = c.telefono || '';
direccion.value = c.direccion || '';
email.value = c.email || '';

habilitarFormulario();

btnGuardar.disabled = false;
btnEliminar.disabled = false;
btnCancelar.disabled = false;

}

// ===== NUEVO =====
function nuevo() {
modoNuevo();
}

function cancelar() {

  formDirty = false;
  cargandoCliente = false;
  // limpiar id interno
  clienteId.value = '';

  // limpiar campos
  codigoCliente.value = '';
  nombre.value = '';
  razon.value = '';
  ruc.value = '';
  telefono.value = '';
  direccion.value = '';
  email.value = 'sincorreo@gmail.com';

  // quitar selección de tabla
  document.querySelectorAll('.tabla-row').forEach(r => r.classList.remove('activo'));

  // botones
  btnGuardar.disabled = true;
  btnEliminar.disabled = true;
  btnCancelar.disabled = true;
  actualizarEstadoTabla();
bloquearFormulario();
codigoCliente.focus();
codigoCliente.select();

  // foco en código
  setTimeout(() => {
    codigoCliente.focus();
    codigoCliente.select();
  }, 50);

}

// ===== GUARDAR =====
async function guardar() {

if (!nombre.value.trim()) {
mostrarAdvertencia("Ingrese nombre");
nombre.focus();
return;
}

const payload = {
id: codigoCliente.value ? Number(codigoCliente.value) : undefined,
nombre: nombre.value.trim(),
razon_social: razon.value.trim(),
ruc: ruc.value.trim(),
telefono: telefono.value.trim(),
direccion: direccion.value.trim(),
email: email.value.trim() || 'sincorreo@gmail.com'
};

try {


if (!clienteId.value) {
  const r = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!r.ok) throw new Error();

  const clienteCreado = await r.json();

  if (mode === "create" && from === "venta") {
    seleccionarClienteParaVenta(clienteCreado);
    return;
  }

} else {

  await fetch(`${API}/${clienteId.value}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

}

bloquearFormulario();
codigoCliente.focus();
codigoCliente.select();
modoNuevo();
cargar();


} catch {
mostrarAdvertencia("Error al guardar");
}
}

// ===== ELIMINAR =====
let clienteAEliminar = null;

function eliminar() {
if (!clienteId.value) return;
clienteAEliminar = clienteId.value;
document.getElementById('modalNombreCliente').textContent = nombre.value;
document.getElementById('modalEliminar').classList.remove('hidden');
}

function cerrarModalEliminar() {
clienteAEliminar = null;
document.getElementById('modalEliminar').classList.add('hidden');
}

async function confirmarEliminar() {
if (!clienteAEliminar) return;
await fetch(`${API}/${clienteAEliminar}`, { method: 'DELETE' });
cerrarModalEliminar();
modoNuevo();
cargar();
}

async function modoNuevo() {

clienteId.value = '';

nombre.value = '';
razon.value = '';
ruc.value = '';
telefono.value = '';
direccion.value = '';
email.value = 'sincorreo@gmail.com';

const nextId = await obtenerProximoId();
codigoCliente.value = nextId;

habilitarFormulario();

btnGuardar.disabled = false;
btnEliminar.disabled = true;
btnCancelar.disabled = false;   // 👈 ESTE ES EL FIX

setTimeout(() => nombre.focus(), 50);

}

// ===== FILTRO =====
function filtrar() {
const t = buscar.value.toLowerCase().trim();
render(clientes.filter(c =>
(c.nombre || '').toLowerCase().includes(t) ||
(c.ruc || '').toLowerCase().includes(t) ||
(c.telefono || '').toLowerCase().includes(t)
));
}

// ===== MODOS =====
function modoInicial() {

clienteId.value = '';

codigoCliente.value = '';
nombre.value = '';
razon.value = '';
ruc.value = '';
telefono.value = '';
direccion.value = '';
email.value = 'sincorreo@gmail.com';

btnGuardar.disabled = true;
btnEliminar.disabled = true;
btnCancelar.disabled = true;   // 👈 importante

bloquearFormulario();

}


// ===== ADVERTENCIA =====
function mostrarAdvertencia(texto) {
document.getElementById('modalAdvertenciaTexto').textContent = texto;
document.getElementById('modalAdvertencia').classList.remove('hidden');
}

function cerrarAdvertencia() {
document.getElementById('modalAdvertencia').classList.add('hidden');
}

// ===== TABLA BLOQUEO =====
function actualizarEstadoTabla() {
const tabla = document.querySelector('.tabla-clientes');
const aviso = document.getElementById('avisoTabla');

if (!tabla || !aviso) return;

if (cargandoCliente) {
tabla.classList.add('bloqueada');
aviso.classList.remove('hidden');
} else {
tabla.classList.remove('bloqueada');
aviso.classList.add('hidden');
}
}


// ===== EVENTOS =====
telefono?.addEventListener('input', () => {
telefono.value = telefono.value.replace(/[^0-9]/g, '');
});

ruc?.addEventListener('input', () => {
ruc.value = ruc.value.replace(/[^0-9-]/g, '');
});


// ===== ENTER NAVEGACIÓN ENTRE CAMPOS =====
document.querySelector('.form-panel').addEventListener("keydown", (e) => {

  if (e.key !== "Enter") return;

  // si está en código no intervenir
  if (document.activeElement.id === "codigoCliente") return;

  e.preventDefault();

  const campos = [
    nombre,
    razon,
    ruc,
    telefono,
    direccion,
    email
  ];

  const index = campos.indexOf(document.activeElement);

  if (index < campos.length - 1) {
    campos[index + 1].focus();
  } else {
    guardar();
  }

});


// ===== ATAJOS =====
document.addEventListener('keydown', e => {

  // F2 → Nuevo
  if (e.key === 'F2') {
    e.preventDefault();
    nuevo();
  }

  // F3 → Guardar
  if (e.key === 'F3') {
    e.preventDefault();
    guardar();
  }

  // DELETE → Eliminar
  if (e.key === 'Delete') {
    e.preventDefault();
    if (!btnEliminar.disabled) eliminar();
  }

  // ESC → Volver
  if (e.key === 'Escape') {
    e.preventDefault();
    volver();
  }

});

// ===== INIT =====
window.onload = () => {

modoInicial();
cargar();

bloquearFormulario();

setTimeout(() => {
  codigoCliente.focus();
  codigoCliente.select();
}, 100);

};