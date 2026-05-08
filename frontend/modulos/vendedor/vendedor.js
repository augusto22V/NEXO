const API = "/api/vendedor";

let vendedores = [];
let sortField = "id";
let sortDir = "desc";
let _dirty = false; 
let _loading = false;

// ===== DOM =====
const vendedorId = document.getElementById("vendedorId");
const codigoVendedor = document.getElementById("codigoVendedor");
const nombre = document.getElementById("nombre");
const activo = document.getElementById("activo"); 
const tipoCalculoComision = document.getElementById("tipoCalculoComision");
const tipoComision = document.getElementById("tipoComision");
const porcentajeVentas = document.getElementById("porcentajeVentas");
const porcentajeServicios = document.getElementById("porcentajeServicios");
const grupoComisionVentas = document.getElementById("grupoComisionVentas");
const grupoComisionServicios = document.getElementById("grupoComisionServicios");
const buscar = document.getElementById("buscarVendedor");

const btnNuevo = document.getElementById("btnNuevo");
const btnGuardar = document.getElementById("btnGuardar");
const btnEliminar = document.getElementById("btnEliminar");
const btnCancelar = document.getElementById("btnCancelar");

const tablaVendedores = document.getElementById("tablaVendedores");

const params = new URLSearchParams(window.location.search);
const modoSeleccion = params.get("modo") === "seleccion";

function toPercentValue(value, fallback = "0") {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return String(number);
}

function aplicarConfigComision(vendedor = {}) {
  if (tipoCalculoComision) {
    tipoCalculoComision.value = vendedor.tipo_calculo_comision || "productos";
  }
  if (tipoComision) {
    tipoComision.value = vendedor.tipo_comision || "total_bruto";
  }
  if (porcentajeVentas) {
    porcentajeVentas.value = toPercentValue(vendedor.porcentaje_ventas, "0");
  }
  if (porcentajeServicios) {
    porcentajeServicios.value = toPercentValue(vendedor.porcentaje_servicios, "0");
  }
  actualizarVisibilidadComision();
}

function actualizarVisibilidadComision() {
  const tipo = tipoCalculoComision?.value || "productos";

  if (grupoComisionVentas) {
    grupoComisionVentas.classList.toggle("hidden", tipo === "servicios");
  }

  if (grupoComisionServicios) {
    grupoComisionServicios.classList.toggle("hidden", tipo === "productos");
  }
}

// ===== LOAD =====
async function cargar() {

  _loading = true;

  try {
    const res = await fetch(API);
    if (!res.ok) throw new Error();

    vendedores = await res.json();
    render(vendedores);

  } catch {
    tablaVendedores.innerHTML =
      "<div style='padding:10px;color:red'>Error cargando datos</div>";
  } finally {
    _loading = false;
  }
}

function soloDigitos(valor) {
  return (valor || "").replace(/\D/g, "");
}

codigoVendedor.addEventListener("input", () => {
  const limpio = soloDigitos(codigoVendedor.value);
  if (codigoVendedor.value !== limpio) codigoVendedor.value = limpio;
});

codigoVendedor.addEventListener("keydown", async (e) => {
  if (e.key === "Enter") {
    e.preventDefault();

    const id = Number(codigoVendedor.value);
    if (!id) {
      await nuevo(); // si estÃ¡ vacÃ­o, sÃ­ crea secuencia
      return;
    }

    await buscarPorId(id); 
  }
});

const thId = document.getElementById("thId");

if (thId) {
  thId.style.cursor = "pointer";
  thId.addEventListener("click", () => {
    if (sortField !== "id") {
      sortField = "id";
      sortDir = "asc";
    } else {
      sortDir = (sortDir === "asc") ? "desc" : "asc";
    }
    thId.textContent = `ID ${sortDir === "asc" ? "â–²" : "â–¼"}`;
    render(vendedores);
  });
}

async function buscarPorId(id) {

  _loading = true;

  try {
    const res = await fetch(`${API}/${id}`);
    if (!res.ok) {
      mostrarAdvertencia("No existe vendedor con ese cÃ³digo");
      return;
    }

    const c = await res.json();
    seleccionar(c);

    document.querySelectorAll(".tabla-row")
      .forEach(r => r.classList.remove("activo"));

    const rows = [...document.querySelectorAll(".tabla-row")];
    const row = rows.find(r => r.firstElementChild?.textContent == String(c.id));
    if (row) row.classList.add("activo");

    setTimeout(() => nombre.focus(), 50);

  } catch {
    mostrarAdvertencia("Error buscando vendedor");
  } finally {
    _loading = false;
  }
}

//funcion para que le pregunte si quiere salir con Esc o volver cuando este cargado algop 
function hayCambiosSinGuardar() {
  return _dirty || _loading;
}
//funcion para que no salga si algo esta cargado ojo con esto 


// ===== RENDER =====
function render(data) {

  data = [...data].sort((a, b) => {
    const av = a[sortField] ?? 0;
    const bv = b[sortField] ?? 0;
    return sortDir === "asc" ? av - bv : bv - av;
  });

  tablaVendedores.innerHTML = "";

  if (!data.length) {
    tablaVendedores.innerHTML =
      '<div style="padding:15px;color:#999">Sin vendedores</div>';
    return;
  }

  data.forEach(c => {

    const row = document.createElement("div");
    row.className = "tabla-row";

   const estadoTxt = (c.activo === false) ? " (INACTIVO)" : "";

row.innerHTML = `
  <span>${c.id}</span>
  <span>${c.nombre}${estadoTxt}</span>
`;

if (c.activo === false) {
  row.classList.add("inactivo");
}

   row.onclick = () => {

  if (modoSeleccion) {

    localStorage.setItem(
      "vendedorSeleccionado",
      JSON.stringify({
        id: c.id,
        nombre: c.nombre
      })
    );

    window.close();
    return;
  }

  // comportamiento normal del mÃ³dulo
  document.querySelectorAll(".tabla-row")
    .forEach(r => r.classList.remove("activo"));

  row.classList.add("activo");
  seleccionar(c);
};

    tablaVendedores.appendChild(row);
  });
}



// ===== SELECT =====
function seleccionar(c) {

  vendedorId.value = c.id;
  codigoVendedor.value = c.id;
  nombre.value = c.nombre;
  if (activo) activo.checked = (c.activo !== false); 
  aplicarConfigComision(c);

  habilitarFormulario();

  btnGuardar.disabled = false;
  btnEliminar.disabled = false;
  btnCancelar.disabled = false;

  _dirty = false;
}

// ===== BLOQUEAR / HABILITAR =====
function bloquearFormulario() {
  nombre.disabled = true;
  if (activo) activo.disabled = true;
  if (tipoCalculoComision) tipoCalculoComision.disabled = true;
  if (tipoComision) tipoComision.disabled = true;
  if (porcentajeVentas) porcentajeVentas.disabled = true;
  if (porcentajeServicios) porcentajeServicios.disabled = true;
}

function habilitarFormulario() {
  nombre.disabled = false;
  if (activo) activo.disabled = false;
  if (tipoCalculoComision) tipoCalculoComision.disabled = false;
  if (tipoComision) tipoComision.disabled = false;
  if (porcentajeVentas) porcentajeVentas.disabled = false;
  if (porcentajeServicios) porcentajeServicios.disabled = false;
}

// ===== NUEVO =====
async function nuevo() {

  vendedorId.value = "";
  nombre.value = "";
  if (activo) activo.checked = true;
  aplicarConfigComision({
    tipo_calculo_comision: "productos",
    tipo_comision: "total_bruto",
    porcentaje_ventas: 0,
    porcentaje_servicios: 0
  });

  const nextId = await obtenerProximoId();
  codigoVendedor.value = nextId;

  habilitarFormulario();

  btnGuardar.disabled = false;
  btnEliminar.disabled = true;
  btnCancelar.disabled = false;
  

  setTimeout(() => nombre.focus(), 50);
}

// ===== CANCELAR =====
function cancelar() {

  vendedorId.value = "";
  codigoVendedor.value = "";
  nombre.value = "";
  if (activo) activo.checked = true;
  aplicarConfigComision({
    tipo_calculo_comision: "productos",
    tipo_comision: "total_bruto",
    porcentaje_ventas: 0,
    porcentaje_servicios: 0
  });

  document.querySelectorAll(".tabla-row")
    .forEach(r => r.classList.remove("activo"));

  btnGuardar.disabled = true;
  btnEliminar.disabled = true;
  btnCancelar.disabled = true;
  _dirty = false;

  bloquearFormulario();

  codigoVendedor.focus();
}

// ===== GUARDAR =====
async function guardar() {

  if (!nombre.value.trim()) {
    mostrarAdvertencia("Ingrese nombre");
    nombre.focus();
    return;
  }

  _loading = true;

  const payload = {
    nombre: nombre.value.trim(),
    activo: activo ? !!activo.checked : true,
    tipo_calculo_comision: tipoCalculoComision?.value || "productos",
    tipo_comision: tipoComision?.value || "total_bruto",
    porcentaje_ventas: Number(porcentajeVentas?.value || 0) || 0,
    porcentaje_servicios: Number(porcentajeServicios?.value || 0) || 0,
    comision_por_cantidad: (tipoComision?.value || "") === "cantidad"
  };

  try {

    if (!vendedorId.value) {
      // NUEVO
      await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
    } else {
      // EDITAR
      await fetch(`${API}/${vendedorId.value}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
    }

    await cargar();
    await nuevo();

    _dirty = false;
    codigoVendedor.focus();

  } catch {
    mostrarAdvertencia("Error al guardar");
  } finally {
    _loading = false;
  }
}


function eliminar() {

  if (!vendedorId.value) return;

  baseModalOpenConfirm({
    titulo: "Eliminar vendedor",
    mensaje: "Â¿Desea eliminar el vendedor?",
    detalle: nombre.value,
    confirmText: "Eliminar",
    cancelText: "Cancelar",
    onConfirm: async () => {

      _loading = true;

      try {
        await fetch(`${API}/${vendedorId.value}`, {
          method: "DELETE"
        });

        await cargar();
        cancelar();

      } finally {
        _loading = false;
      }
    }
  });
}

// FILTRO 
function filtrar() {
  const t = buscar.value.toLowerCase().trim();

  render(
    vendedores.filter(c => {
      const nom = (c.nombre || "").toLowerCase();
      const idtxt = String(c.id ?? "");
      return nom.includes(t) || idtxt.includes(t);
    })
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
  baseModalOpenInfo({
    titulo: "AtenciÃ³n",
    mensaje: texto
  });
}

// ===== ATAJOS =====
document.addEventListener("keydown", e => {

  if (e.key === "F2") {
    e.preventDefault();
    nuevo();
  }
if (e.key === "F3") {
  e.preventDefault();
  if (!btnGuardar.disabled) guardar();
}

  if (e.key === "F4") {
  e.preventDefault();
  if (!btnCancelar.disabled) cancelar();
 }

  if (e.key === "Delete") {
    e.preventDefault();
    if (!btnEliminar.disabled) eliminar();
  }


});

nombre.addEventListener("input", () => {
  if (!btnGuardar.disabled) _dirty = true;
});

if (activo) {
  activo.addEventListener("change", () => {
    if (!btnGuardar.disabled) _dirty = true;
  });
}

[tipoCalculoComision, tipoComision, porcentajeVentas, porcentajeServicios].forEach((input) => {
  if (!input) return;

  const eventName = input.tagName === "SELECT" ? "change" : "input";

  input.addEventListener(eventName, () => {
    if (input === tipoCalculoComision) {
      actualizarVisibilidadComision();
    }

    if (!btnGuardar.disabled) {
      _dirty = true;
    }
  });
});


nombre.addEventListener("keydown", async (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    if (!btnGuardar.disabled) {
      await guardar();
      // DespuÃ©s de guardar, listo para el siguiente
      codigoVendedor.focus();
    }
  }
});


function seleccionarVendedor(vendedor) {

  localStorage.setItem("vendedorSeleccionado", JSON.stringify(vendedor));

  window.close();
}

document.addEventListener("DOMContentLoaded", () => {

  if (modoSeleccion) {

  document.querySelector(".form-panel").style.display = "none";

  document.querySelector(".cliente-layout")
          .classList.add("modo-seleccion");

  document.getElementById("moduloTitulo")
          .innerText = "Seleccionar Vendedor";

}

});

// ===== INIT =====
window.onload = () => {

  aplicarConfigComision({
    tipo_calculo_comision: "productos",
    tipo_comision: "total_bruto",
    porcentaje_ventas: 0,
    porcentaje_servicios: 0
  });
  bloquearFormulario();
  btnGuardar.disabled = true;
  btnEliminar.disabled = true;
  btnCancelar.disabled = true;

  cargar();

  baseModalEnableExitProtection({
    hayCambios: hayCambiosSinGuardar
  });

  setTimeout(() => {
    codigoVendedor.focus();
  }, 100);
};
