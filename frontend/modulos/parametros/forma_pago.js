const API = "/api/forma-pago";

let formasPago = [];
let formDirty = false;
let sortField = "id";
let sortDir = "desc";

const formaPagoId = document.getElementById("formaPagoId");
const codigoFormaPago = document.getElementById("codigoFormaPago");
const descripcionFormaPago = document.getElementById("descripcionFormaPago");
const cantidadCuotas = document.getElementById("cantidadCuotas");
const diasIntervalo = document.getElementById("diasIntervalo");
const activoFormaPago = document.getElementById("activoFormaPago");
const buscar = document.getElementById("buscar");
const thId = document.getElementById("thId");
const btnGuardar = document.getElementById("btnGuardar");
const btnEliminar = document.getElementById("btnEliminar");
const btnCancelar = document.getElementById("btnCancelar");
const btnNuevo = document.getElementById("btnNuevo");
const tablaFormasPago = document.getElementById("tablaFormasPago");

function toIntOrNull(value) {
  const n = Number.parseInt(String(value ?? "").trim(), 10);
  if (!Number.isFinite(n)) return null;
  return n;
}

function normalizeDescripcion(value) {
  return String(value || "").trim();
}

function resolveCuotas(value, fallback = 1) {
  const n = toIntOrNull(value);
  if (!n || n < 1) return fallback;
  return n;
}

function resolveDiasIntervalo(value, fallback = 0) {
  const n = toIntOrNull(value);
  if (n === null || n < 0) return fallback;
  return n;
}

function marcarFilaActiva(id) {
  document.querySelectorAll(".tabla-row").forEach((r) => {
    r.classList.toggle("activo", r.dataset.id === String(id));
  });
}

function setFormularioDesdeFormaPago(fp) {
  formaPagoId.value = fp.id;
  codigoFormaPago.value = fp.codigo ?? fp.id;
  descripcionFormaPago.value = fp.descripcion || "";
  cantidadCuotas.value = String(resolveCuotas(fp.cuotas ?? fp.cantidad_cuotas, 1));
  diasIntervalo.value = String(resolveDiasIntervalo(fp.dias_intervalo, 0));
  activoFormaPago.checked = fp.activo !== false;
  habilitarFormulario();
  btnGuardar.disabled = false;
  btnEliminar.disabled = false;
  btnCancelar.disabled = false;
  formDirty = false;
}

async function obtenerFormaPago(id) {
  const numericId = toIntOrNull(id);
  if (!numericId || numericId < 1) throw new Error("ID invalido");

  const res = await fetch(`${API}/${numericId}`, {
    cache: "no-store",
    headers: { "Cache-Control": "no-cache" }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "No se pudo cargar forma de pago");
  return data;
}

async function seleccionar(fp) {
  try {
    const full = await obtenerFormaPago(fp.id);
    setFormularioDesdeFormaPago(full);
    marcarFilaActiva(full.id);
  } catch (err) {
    setFormularioDesdeFormaPago(fp);
    marcarFilaActiva(fp.id);
    mostrarAdvertencia(err.message || "No se pudo cargar la forma de pago completa");
  }
}

async function seleccionarPorId(id) {
  const fp = formasPago.find((row) => Number(row.id) === Number(id));
  if (!fp) return false;
  await seleccionar(fp);
  return true;
}

async function cargar() {
  try {
    const res = await fetch(API);
    if (!res.ok) throw new Error();
    formasPago = await res.json();
    render(formasPago);
  } catch (err) {
    console.error(err);
    tablaFormasPago.innerHTML = "<div style='padding:10px;color:red'>Error cargando datos</div>";
  }
}

function bloquearFormulario() {
  descripcionFormaPago.disabled = true;
  cantidadCuotas.disabled = true;
  diasIntervalo.disabled = true;
  activoFormaPago.disabled = true;
}

function habilitarFormulario() {
  descripcionFormaPago.disabled = false;
  cantidadCuotas.disabled = false;
  diasIntervalo.disabled = false;
  activoFormaPago.disabled = false;
}

function mostrarAdvertencia(texto) {
  document.getElementById("modalAdvertenciaTexto").textContent = texto;
  document.getElementById("modalAdvertencia").classList.remove("hidden");
}

function cerrarAdvertencia(refocus = false) {
  document.getElementById("modalAdvertencia").classList.add("hidden");
  if (refocus) {
    setTimeout(() => {
      codigoFormaPago.focus();
      codigoFormaPago.select();
    }, 40);
  }
}

function volverSeguro() {
  if (formDirty) {
    baseModalOpenConfirmGeneric({
      titulo: "Salir",
      mensaje: "Hay cambios sin guardar. Desea salir?",
      onConfirm: () => {
        window.location.href = "./parametros.html";
      }
    });
    return;
  }
  window.location.href = "./parametros.html";
}

function render(data) {
  data = [...data].sort((a, b) => {
    const av = a[sortField] ?? 0;
    const bv = b[sortField] ?? 0;
    return sortDir === "asc" ? av - bv : bv - av;
  });

  tablaFormasPago.innerHTML = "";

  if (!data.length) {
    tablaFormasPago.innerHTML = '<div style="padding:15px;color:#999">Sin formas de pago</div>';
    return;
  }

  data.forEach((fp) => {
    const row = document.createElement("div");
    row.className = "tabla-row";
    if (fp.activo === false) row.classList.add("inactivo");
    row.style.gridTemplateColumns = "80px 1fr 120px 120px 100px";
    row.innerHTML = `
      <span>${fp.codigo ?? fp.id}</span>
      <span>${fp.descripcion || "-"}</span>
      <span>${fp.cuotas ?? fp.cantidad_cuotas ?? 1}</span>
      <span>${fp.dias_intervalo ?? 0}</span>
      <span>${fp.activo ? "Activo" : "Inactivo"}</span>
    `;
    row.dataset.id = String(fp.id);
    row.onclick = async () => {
      await seleccionar(fp);
    };
    tablaFormasPago.appendChild(row);
  });
}

function modoInicial() {
  formaPagoId.value = "";
  codigoFormaPago.value = "";
  descripcionFormaPago.value = "";
  cantidadCuotas.value = "1";
  diasIntervalo.value = "0";
  activoFormaPago.checked = true;
  btnGuardar.disabled = true;
  btnEliminar.disabled = true;
  btnCancelar.disabled = true;
  formDirty = false;
  bloquearFormulario();
}

async function obtenerProximoCodigo() {
  const res = await fetch(`${API}/next-id`);
  if (!res.ok) throw new Error("No se pudo obtener el codigo");
  const data = await res.json();
  return Number(data?.next_id || 1);
}

async function nuevo() {
  modoInicial();
  try {
    codigoFormaPago.value = await obtenerProximoCodigo();
  } catch {
    codigoFormaPago.value = "";
  }
  habilitarFormulario();
  btnGuardar.disabled = false;
  btnCancelar.disabled = false;
  setTimeout(() => descripcionFormaPago.focus(), 50);
}

function cancelar() {
  modoInicial();
  document.querySelectorAll(".tabla-row").forEach((r) => r.classList.remove("activo"));
  setTimeout(() => {
    codigoFormaPago.focus();
    codigoFormaPago.select();
  }, 40);
}

function payload() {
  const cuotasValue = resolveCuotas(cantidadCuotas.value, 1);
  const intervaloValue = resolveDiasIntervalo(diasIntervalo.value, 0);
  return {
    codigo: Number(codigoFormaPago.value),
    descripcion: normalizeDescripcion(descripcionFormaPago.value),
    cuotas: cuotasValue,
    cantidad_cuotas: cuotasValue,
    dias_intervalo: intervaloValue,
    activo: activoFormaPago.checked
  };
}

function validar() {
  const codigo = toIntOrNull(codigoFormaPago.value);
  const descripcion = normalizeDescripcion(descripcionFormaPago.value);
  const cuotas = toIntOrNull(cantidadCuotas.value);
  const intervalo = toIntOrNull(diasIntervalo.value);
  const editId = toIntOrNull(formaPagoId.value);

  if (!codigo || codigo < 1) return "Ingrese codigo valido";
  if (!descripcion) return "Ingrese descripcion";
  if (!cuotas || cuotas < 1) return "Cantidad de cuotas invalida (minimo 1)";
  if (intervalo === null || intervalo < 0) return "Dias de intervalo invalido (minimo 0)";

  const duplicado = formasPago.some((row) => {
    const mismoId = editId && Number(row.id) === Number(editId);
    if (mismoId) return false;
    return normalizeDescripcion(row.descripcion).toLowerCase() === descripcion.toLowerCase();
  });
  if (duplicado) return "Ya existe una forma de pago con esa descripcion";

  return null;
}

async function guardar() {
  const error = validar();
  if (error) return mostrarAdvertencia(error);

  try {
    const enEdicion = Boolean(formaPagoId.value);
    const url = enEdicion ? `${API}/${formaPagoId.value}` : API;
    const method = enEdicion ? "PUT" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload())
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Error");
    await cargar();
    if (enEdicion) {
      const seleccionado = await seleccionarPorId(data.id);
      if (!seleccionado) cancelar();
    } else {
      await nuevo();
    }
  } catch (err) {
    mostrarAdvertencia(err.message || "Error al guardar");
  }
}

async function eliminar() {
  if (!formaPagoId.value) return;
  baseModalOpenConfirmGeneric({
    titulo: "Eliminar",
    mensaje: "Desea eliminar la forma de pago seleccionada?",
    onConfirm: async () => {
      try {
        const res = await fetch(`${API}/${formaPagoId.value}`, { method: "DELETE" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Error");
        await cargar();
        cancelar();
      } catch (err) {
        mostrarAdvertencia(err.message || "Error al eliminar");
      }
    }
  });
}

function filtrar() {
  const t = (buscar.value || "").toLowerCase().trim();
  render(
    formasPago.filter((fp) =>
      String(fp.codigo ?? fp.id).includes(t) ||
      (fp.descripcion || "").toLowerCase().includes(t)
    )
  );
}

[codigoFormaPago, cantidadCuotas, diasIntervalo].forEach((el) => {
  if (el === codigoFormaPago) return;
  el.addEventListener("input", () => {
    el.value = el.value.replace(/\D/g, "");
  });
});

[descripcionFormaPago, cantidadCuotas, diasIntervalo].forEach((el) => {
  el.addEventListener("input", () => {
    if (!btnGuardar.disabled) formDirty = true;
  });
});

activoFormaPago.addEventListener("change", () => {
  if (!btnGuardar.disabled) formDirty = true;
});

descripcionFormaPago.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    cantidadCuotas.focus();
  }
});

diasIntervalo.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    guardar();
  }
});

thId.addEventListener("click", () => {
  sortDir = sortDir === "asc" ? "desc" : "asc";
  thId.textContent = sortDir === "asc" ? "ID ▲" : "ID ▼";
  render(formasPago);
});

document.addEventListener("keydown", (e) => {
  if (e.key === "F2") { e.preventDefault(); nuevo(); }
  if (e.key === "F3") { e.preventDefault(); if (!btnGuardar.disabled) guardar(); }
  if (e.key === "F4") { e.preventDefault(); if (!btnCancelar.disabled) cancelar(); }
  if (e.key === "Delete") { e.preventDefault(); if (!btnEliminar.disabled) eliminar(); }
  if (e.key === "Escape") { e.preventDefault(); volverSeguro(); }
});

window.nuevo = nuevo;
window.guardar = guardar;
window.eliminar = eliminar;
window.cancelar = cancelar;
window.filtrar = filtrar;
window.cerrarAdvertencia = cerrarAdvertencia;
window.volverSeguro = volverSeguro;

window.onload = async () => {
  modoInicial();
  await cargar();
  baseModalEnableExitProtection({ hayCambios: () => formDirty });
  setTimeout(() => {
    btnNuevo?.focus();
  }, 120);
};
