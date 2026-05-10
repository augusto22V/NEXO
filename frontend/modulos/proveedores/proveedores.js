const API = "/api/proveedores";

let proveedores = [];
let formDirty = false;
let isSelectionMode = false;
let selectionReturn = null;

let sortField = "id";
let sortDir = "desc";
let cargandoProveedor = false;
let proveedorSeleccionadoTemp = null;
let _warnListener = null;
let _warnFocusEl = null;
let permitirSalida = false;

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


const thId = document.getElementById("thId");
const buscar = document.getElementById("buscar");

const btnNuevo = document.getElementById("btnNuevo");
const btnGuardar = document.getElementById("btnGuardar");
const btnEliminar = document.getElementById("btnEliminar");
const btnCancelar = document.getElementById("btnCancelar");
const btnSeleccionar = document.getElementById("btnSeleccionar");

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

function hayCambiosSinGuardar() {

  if (cargandoProveedor) return true;

  if (btnGuardar.disabled) return false;

  if (!proveedorId.value &&
      !nombreProveedor.value.trim() &&
      !razonProveedor.value.trim() &&
      !rucProveedor.value.trim() &&
      !telefonoProveedor.value.trim() &&
      !direccionProveedor.value.trim()) {
    return false;
  }

  return true;
}

function habilitarFormulario() {
  nombreProveedor.disabled = false;
  razonProveedor.disabled = false;
  rucProveedor.disabled = false;
  telefonoProveedor.disabled = false;
  direccionProveedor.disabled = false;
  emailProveedor.disabled = false;
}

function mostrarAdvertencia(texto, focusEl = codigoProveedor) {

  const modal = document.getElementById('modalAdvertencia');
  const txt = document.getElementById('modalAdvertenciaTexto');
  const btn = modal?.querySelector('.btn-aceptar');

  if (!modal || !txt || !btn) return;

  txt.textContent = texto;

  _warnFocusEl = focusEl || codigoProveedor;

  modal.classList.remove('hidden');

  setTimeout(() => btn.focus(), 30);

  if (_warnListener) document.removeEventListener('keydown', _warnListener);

  _warnListener = function (e) {

    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      cerrarAdvertencia(true);
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      cerrarAdvertencia(true);
      return;
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

  if (refocus && _warnFocusEl && typeof _warnFocusEl.focus === "function") {
    setTimeout(() => {
      _warnFocusEl.focus();
      if (typeof _warnFocusEl.select === "function") {
        _warnFocusEl.select();
      }
    }, 30);
  }
}

thId.addEventListener("click", () => {

  if (sortField === "id") {
    sortDir = sortDir === "asc" ? "desc" : "asc";
  } else {
    sortField = "id";
    sortDir = "asc";
  }

  thId.textContent = sortDir === "asc" ? "ID â–²" : "ID â–¼";

  render(proveedores);

});

function volverSeguro() {
  if (isSelectionMode) {
    if (window.opener && !window.opener.closed) window.opener.focus();
    window.close();
    return;
  }

  if (hayCambiosSinGuardar()) {

    baseModalOpenConfirmGeneric({
      titulo: "Salir",
      mensaje: "Hay cambios sin guardar. ¿Desea salir?",
      onConfirm: () => {
        permitirSalida = true;
        window.location.href = "../../home.html";
      }
    });

  } else {
    permitirSalida = true;
    window.location.href = "../../home.html";
  }
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
    if (formDirty && !isSelectionMode) {
      mostrarAdvertencia("Finalice la carga o cancele");
      return;
    }

    document.querySelectorAll(".tabla-row").forEach((r) => r.classList.remove("activo"));
    row.classList.add("activo");

    if (isSelectionMode) {
      proveedorSeleccionadoTemp = p;
      btnSeleccionar.disabled = false;
    } else {
      seleccionar(p);
    }
  };

  row.ondblclick = () => {
    if (isSelectionMode) {
      seleccionarProveedorDirecto(p);
    } else {
      seleccionar(p);
    }
  };

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

// ===== ENTER EN CÃ“DIGO (igual Producto) =====
codigoProveedor.addEventListener("keydown", async (e) => {

  if (e.key !== "Enter") return;

  e.preventDefault();
  e.stopImmediatePropagation(); // ðŸ”¥ importante

  const valor = codigoProveedor.value.trim();

  // ENTER vacío â†’ next-id
  if (!valor) {
    try {
      const nextId = await obtenerProximoId();
      codigoProveedor.value = nextId;
      await modoNuevo(false);
      setTimeout(() => nombreProveedor.focus(), 50);
    } catch {
      mostrarAdvertencia("Error obteniendo código", codigoProveedor);
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

    // NO EXISTE â†’ advertir y NO avanzar
    mostrarAdvertencia(`No existe proveedor con código ${id}`, codigoProveedor);
    return;

  } catch (err) {
    console.error(err);
    mostrarAdvertencia("Error consultando servidor", codigoProveedor);
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

  if (isSelectionMode) {
    btnSeleccionar.disabled = false;
  }

  formDirty = false;
}

function seleccionarProveedorDirecto(p) {
  const proveedorSeleccionado = {
    id: p.id,
    nombre: p.nombre,
    razon_social: p.razon_social,
    ruc: p.ruc,
    telefono: p.telefono,
    direccion: p.direccion,
    email: p.email
  };

  if (selectionReturn === "informe_compra" && window.opener && !window.opener.closed) {
    const inputProveedor = window.opener.document.getElementById("filtroProveedor");
    if (inputProveedor) {
      inputProveedor.value = proveedorSeleccionado.nombre || "";
      if (typeof inputProveedor.focus === "function") inputProveedor.focus();
    }
    window.close();
    return;
  }

  if (window.opener && !window.opener.closed && typeof window.opener.recibirProveedor === "function") {
    try {
      window.opener.recibirProveedor(proveedorSeleccionado);
      window.opener.focus();
      window.close();
      return;
    } catch {
      // fallback localStorage
    }
  }

  localStorage.setItem("softsysProveedorSeleccionado", JSON.stringify(proveedorSeleccionado));
  window.close();
}

function seleccionarProveedor() {
  if (!proveedorSeleccionadoTemp) {
    mostrarAdvertencia("Seleccione un proveedor primero");
    return;
  }

  const proveedorSeleccionado = {
    id: Number(proveedorSeleccionadoTemp.id),
    nombre: proveedorSeleccionadoTemp.nombre,
    razon_social: proveedorSeleccionadoTemp.razon_social,
    ruc: proveedorSeleccionadoTemp.ruc,
    telefono: proveedorSeleccionadoTemp.telefono,
    direccion: proveedorSeleccionadoTemp.direccion,
    email: proveedorSeleccionadoTemp.email
  };

  if (selectionReturn === "informe_compra" && window.opener && !window.opener.closed) {
    const inputProveedor = window.opener.document.getElementById("filtroProveedor");
    if (inputProveedor) {
      inputProveedor.value = proveedorSeleccionado.nombre || "";
      if (typeof inputProveedor.focus === "function") inputProveedor.focus();
    }
    window.close();
    return;
  }

  if (window.opener && !window.opener.closed && typeof window.opener.recibirProveedor === "function") {
    try {
      window.opener.recibirProveedor(proveedorSeleccionado);
      window.opener.focus();
      window.close();
      return;
    } catch {
      // fallback localStorage
    }
  }

  localStorage.setItem("softsysProveedorSeleccionado", JSON.stringify(proveedorSeleccionado));
  window.close();
}
function nuevo() {
  modoNuevo(true);
}

function cancelar() {
  formDirty = false;
  proveedorSeleccionadoTemp = null;

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

  if (isSelectionMode) {
    btnSeleccionar.disabled = true;
  }

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

  cargandoProveedor = true;

  if (!nombreProveedor.value.trim()) {
    mostrarAdvertencia("Ingrese nombre");
    nombreProveedor.focus();
    cargandoProveedor = false;
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

  cargandoProveedor = false;

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

  rucProveedor.addEventListener("keydown", async (e) => {

  if (e.key !== "Enter") return;

  const valor = rucProveedor.value.trim();

  if (!valor) return;

  try {

    const res = await fetch(`/api/proveedores/ruc/${valor}`);
    const data = await res.json();

    if (data) {

      // ðŸ”¥ reemplaza con DV correcto
      rucProveedor.value = data.ruc;

      razonProveedor.value = data.razon_social || '';
      nombreProveedor.value = data.nombre || data.razon_social || '';

      telefonoProveedor.focus();

    } else {

      mostrarAdvertencia("RUC no encontrado", razonProveedor);

    }

  } catch (err) {

    console.error(err);
    mostrarAdvertencia("Error consultando RUC");

  }

});

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

// ===== ENTER NAVEGACIÃ“N ENTRE CAMPOS =====
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

  // si modal advertencia está abierto â†’ no salir
  const modal = document.getElementById("modalAdvertencia");
  if (modal && !modal.classList.contains("hidden")) return;

  // si modal eliminar está abierto â†’ no salir
  const modalEliminar = document.getElementById("modalEliminar");
  if (modalEliminar && !modalEliminar.classList.contains("hidden")) return;

  e.preventDefault();
  volverSeguro();
}
});


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
window.seleccionarProveedor = seleccionarProveedor;

// ===== INIT =====
window.onload = () => {

  // Detectar modo selección
  const urlParams = new URLSearchParams(window.location.search);
  const searchParam = urlParams.get('search');
  const modoSeleccion = urlParams.get("modo") === "seleccion";
  selectionReturn = urlParams.get('volver');
  isSelectionMode = Boolean(window.opener) || searchParam !== null || modoSeleccion;

  if (isSelectionMode) {
    document.getElementById("moduloTitulo").textContent = "Seleccionar Proveedor";
    btnSeleccionar.style.display = "inline-flex";
    btnSeleccionar.disabled = true;
    // Mantener todos los botones visibles en modo selección

    if (searchParam) {
      buscar.value = searchParam;
      filtrar();
    }
  }

  modoInicial();
  bloquearFormulario();
  cargar();

  baseModalEnableExitProtection({
    hayCambios: hayCambiosSinGuardar
  });

  setTimeout(() => {
    codigoProveedor.disabled = false; 
    codigoProveedor.focus();
    codigoProveedor.select();
  }, 150);

};

