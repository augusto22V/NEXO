const API = "/api/proveedores";

let proveedores = [];
let formDirty = false;

let sortField = "id";
let sortDir = "desc";

// ===== DOM =====
const proveedorId = document.getElementById("proveedorId");
const codigoProveedor = document.getElementById("codigoProveedor");
const nombreProveedor = document.getElementById("nombreProveedor");
const razonProveedor = document.getElementById("razonProveedor");
const rucProveedor = document.getElementById("rucProveedor");
const telefonoProveedor = document.getElementById("telefonoProveedor");
const direccionProveedor = document.getElementById("direccionProveedor");
const emailProveedor = document.getElementById("emailProveedor");
const activoProveedor = document.getElementById("activoProveedor");

const buscar = document.getElementById("buscar");

const btnNuevo = document.getElementById("btnNuevo");
const btnGuardar = document.getElementById("btnGuardar");
const btnEliminar = document.getElementById("btnEliminar");
const btnCancelar = document.getElementById("btnCancelar");

const tablaProveedores = document.getElementById("tablaProveedores");

// ===== LOAD =====
async function cargar() {
  try {
    const res = await fetch(API);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    proveedores = await res.json();
    render(proveedores);
  } catch (e) {
    console.error("Error cargando proveedores", e);
    tablaProveedores.innerHTML =
      "<div style='padding:10px;color:red'>Error cargando datos</div>";
  }
}

function bloquearFormulario() {
  nombreProveedor.disabled = true;
  razonProveedor.disabled = true;
  rucProveedor.disabled = true;
  telefonoProveedor.disabled = true;
  direccionProveedor.disabled = true;
  emailProveedor.disabled = true;
}

function habilitarFormulario() {
  nombreProveedor.disabled = false;
  razonProveedor.disabled = false;
  rucProveedor.disabled = false;
  telefonoProveedor.disabled = false;
  direccionProveedor.disabled = false;
  emailProveedor.disabled = false;
}

// ===== RENDER =====
function render(data) {
  data = [...data].sort((a, b) => {
    const av = a[sortField] ?? 0;
    const bv = b[sortField] ?? 0;
    return sortDir === "asc" ? av - bv : bv - av;
  });

  tablaProveedores.innerHTML = "";

  if (!data.length) {
    tablaProveedores.innerHTML =
      '<div style="padding:15px;color:#999">Sin proveedores</div>';
    return;
  }

  data.forEach((p) => {

  const row = document.createElement("div");
  row.className = "tabla-row";

  //  si está inactivo agregamos clase
  if (p.activo === false) {
    row.classList.add("inactivo");
  }

  row.innerHTML = `
    <span>${p.id ?? ""}</span>
    <span>${p.nombre || "-"}</span>
    <span>${p.ruc || "-"}</span>
    <span>${p.telefono || "-"}</span>
    <span>${p.direccion || "-"}</span>
    <span>${p.email || "-"}</span>
    <span>${p.activo ? "Activo" : "Inactivo"}</span>
  `;

  row.onclick = () => {
    if (formDirty) {
      mostrarAdvertencia("Finalice la carga o cancele");
      return;
    }

    document.querySelectorAll(".tabla-row").forEach((r) => r.classList.remove("activo"));
    row.classList.add("activo");

    seleccionar(p);
  };

  row.ondblclick = () => seleccionar(p);

  tablaProveedores.appendChild(row);
});
}

// ===== NEXT ID (PG REAL) =====
async function obtenerProximoId() {
  const res = await fetch(`${API}/next-id`);
  if (!res.ok) throw new Error("No se pudo obtener next id");
  const data = await res.json();
  return Number(data.next_id);
}

// ===== ENTER EN CÓDIGO (igual Producto) =====
codigoProveedor.addEventListener("keydown", async (e) => {
  if (e.key !== "Enter") return;
  e.preventDefault();

  const valor = codigoProveedor.value.trim();

  // ENTER vacío → next-id real
  if (!valor) {
    try {
      const nextId = await obtenerProximoId();
      codigoProveedor.value = nextId;
      await modoNuevo(false); // false = no recalcular id otra vez
      setTimeout(() => nombreProveedor.focus(), 50);
    } catch {
      mostrarAdvertencia("Error obteniendo código");
    }
    return;
  }

  const id = parseInt(valor, 10);
  if (!Number.isFinite(id)) return;

  try {
    const res = await fetch(`${API}/${id}`);

    if (res.ok) {
      const prov = await res.json();
      seleccionar(prov);
      return;
    }

    // no existe → preparar nuevo con ese id
    proveedorId.value = "";
    habilitarFormulario();

    btnGuardar.disabled = false;
    btnEliminar.disabled = true;
    btnCancelar.disabled = false;

    formDirty = false;
    setTimeout(() => nombreProveedor.focus(), 50);

  } catch (err) {
    console.error(err);
    mostrarAdvertencia("Error consultando servidor");
  }
});

// ===== SELECT =====
function seleccionar(p) {
  codigoProveedor.value = p.id;

  proveedorId.value = p.id;
  nombreProveedor.value = p.nombre || "";
  razonProveedor.value = p.razon_social || "";
  rucProveedor.value = p.ruc || "";
  telefonoProveedor.value = p.telefono || "";
  direccionProveedor.value = p.direccion || "";
  emailProveedor.value = p.email || "sincorreo@gmail.com";
  activoProveedor.checked = p.activo !== false;

  habilitarFormulario();

  btnGuardar.disabled = false;
  btnEliminar.disabled = false;
  btnCancelar.disabled = false;

  formDirty = false;
}

// ===== NUEVO / CANCELAR =====
function nuevo() {
  modoNuevo(true);
}

function cancelar() {
  formDirty = false;

  proveedorId.value = "";

  codigoProveedor.value = "";
  nombreProveedor.value = "";
  razonProveedor.value = "";
  rucProveedor.value = "";
  telefonoProveedor.value = "";
  direccionProveedor.value = "";
  emailProveedor.value = "sincorreo@gmail.com";
  activoProveedor.checked = true;

  document.querySelectorAll(".tabla-row").forEach((r) => r.classList.remove("activo"));

  btnGuardar.disabled = true;
  btnEliminar.disabled = true;
  btnCancelar.disabled = true;

  bloquearFormulario();

  setTimeout(() => {
    codigoProveedor.focus();
    codigoProveedor.select();
  }, 50);
}

async function modoNuevo(recalcularId = true) {
  proveedorId.value = "";

  nombreProveedor.value = "";
  razonProveedor.value = "";
  rucProveedor.value = "";
  telefonoProveedor.value = "";
  direccionProveedor.value = "";
  emailProveedor.value = "sincorreo@gmail.com";
  activoProveedor.checked = true;

  if (recalcularId) {
    try {
      const nextId = await obtenerProximoId();
      codigoProveedor.value = nextId;
    } catch {
      // si falla next-id, al menos no rompemos
    }
  }

  habilitarFormulario();

  btnGuardar.disabled = false;
  btnEliminar.disabled = true;
  btnCancelar.disabled = false;

  formDirty = false;

  setTimeout(() => nombreProveedor.focus(), 50);
}

// ===== GUARDAR =====
async function guardar() {
  if (!nombreProveedor.value.trim()) {
    mostrarAdvertencia("Ingrese nombre");
    nombreProveedor.focus();
    return;
  }

  const payload = {
    id: codigoProveedor.value ? Number(codigoProveedor.value) : undefined,
    nombre: nombreProveedor.value.trim(),
    razon_social: razonProveedor.value.trim(),
    ruc: rucProveedor.value.trim(),
    telefono: telefonoProveedor.value.trim(),
    direccion: direccionProveedor.value.trim(),
    email: (emailProveedor.value.trim() || "sincorreo@gmail.com"),
    activo: activoProveedor.checked,
  };

  try {
    if (!proveedorId.value) {
      const r = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      await r.json();
    } else {
      const r = await fetch(`${API}/${proveedorId.value}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
    }

    bloquearFormulario();
    await modoNuevo(true);
    await cargar();

    setTimeout(() => {
      codigoProveedor.focus();
      codigoProveedor.select();
    }, 50);

  } catch (e) {
    console.error(e);
    mostrarAdvertencia("Error al guardar");
  }
}

// ===== ELIMINAR =====
let proveedorAEliminar = null;

function eliminar() {
  if (!proveedorId.value) return;
  proveedorAEliminar = proveedorId.value;

  document.getElementById("modalNombreProveedor").textContent = nombreProveedor.value || "";
  document.getElementById("modalEliminar").classList.remove("hidden");
}

function cerrarModalEliminar() {
  proveedorAEliminar = null;
  document.getElementById("modalEliminar").classList.add("hidden");
}

async function confirmarEliminar() {
  if (!proveedorAEliminar) return;

  try {
    await fetch(`${API}/${proveedorAEliminar}`, { method: "DELETE" });
  } catch (e) {
    console.error(e);
  }

  cerrarModalEliminar();
  await modoNuevo(true);
  await cargar();
}

// ===== FILTRO =====
function filtrar() {
  const t = (buscar.value || "").toLowerCase().trim();

  render(
    proveedores.filter((p) =>
      (p.nombre || "").toLowerCase().includes(t) ||
      (p.ruc || "").toLowerCase().includes(t) ||
      (p.telefono || "").toLowerCase().includes(t) ||
      (p.direccion || "").toLowerCase().includes(t) ||
      (p.email || "").toLowerCase().includes(t)
    )
  );
}

// ===== EVENTOS =====
codigoProveedor.addEventListener("input", () => {
  codigoProveedor.value = codigoProveedor.value.replace(/[^0-9]/g, "");
});

telefonoProveedor.addEventListener("input", () => {
  telefonoProveedor.value = telefonoProveedor.value.replace(/[^0-9]/g, "");
});

rucProveedor.addEventListener("input", () => {
  rucProveedor.value = rucProveedor.value.replace(/[^0-9-]/g, "");
});

// marcar dirty
[
  nombreProveedor,
  razonProveedor,
  rucProveedor,
  telefonoProveedor,
  direccionProveedor,
  emailProveedor
].forEach(inp => {
  inp.addEventListener("input", () => {
    if (!btnGuardar.disabled) formDirty = true;
  });
});

// ===== ENTER NAVEGACIÓN ENTRE CAMPOS =====
document.querySelector(".panel-form")?.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;

  if (document.activeElement.id === "codigoProveedor") return;

  e.preventDefault();

  const campos = [
    nombreProveedor,
    razonProveedor,
    rucProveedor,
    telefonoProveedor,
    direccionProveedor,
    emailProveedor
  ];

  const idx = campos.indexOf(document.activeElement);
  if (idx < campos.length - 1) campos[idx + 1].focus();
  else guardar();
});

// ===== ATAJOS =====
document.addEventListener("keydown", (e) => {
  if (e.key === "F2") { e.preventDefault(); nuevo(); }
  if (e.key === "F3") { e.preventDefault(); if (!btnGuardar.disabled) guardar(); }
  if (e.key === "F4") { e.preventDefault(); if (!btnCancelar.disabled) cancelar(); }

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
  modoInicial();
  cargar();
  bloquearFormulario();

  setTimeout(() => {
    codigoProveedor.focus();
    codigoProveedor.select();
  }, 100);
};

function modoInicial() {
  proveedorId.value = "";

  codigoProveedor.value = "";
  nombreProveedor.value = "";
  razonProveedor.value = "";
  rucProveedor.value = "";
  telefonoProveedor.value = "";
  direccionProveedor.value = "";
  emailProveedor.value = "sincorreo@gmail.com";
  activoProveedor.checked = true;

  btnGuardar.disabled = true;
  btnEliminar.disabled = true;
  btnCancelar.disabled = true;

  formDirty = false;
  bloquearFormulario();
}

// Exponer funciones para HTML
window.nuevo = nuevo;
window.guardar = guardar;
window.eliminar = eliminar;
window.cancelar = cancelar;
window.filtrar = filtrar;
window.cerrarModalEliminar = cerrarModalEliminar;
window.confirmarEliminar = confirmarEliminar;
window.cerrarAdvertencia = cerrarAdvertencia;