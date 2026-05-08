const API = "/api/tipo-pedido";

let tiposPedido = [];
let formDirty = false;
let sortField = "id_tipo_pedido";
let sortDir = "desc";

const tipoPedidoId = document.getElementById("tipoPedidoId");
const codigoTipoPedido = document.getElementById("codigoTipoPedido");
const nombreTipoPedido = document.getElementById("nombreTipoPedido");
const descripcionTipoPedido = document.getElementById("descripcionTipoPedido");
const activoTipoPedido = document.getElementById("activoTipoPedido");
const buscar = document.getElementById("buscar");
const thId = document.getElementById("thId");
const btnGuardar = document.getElementById("btnGuardar");
const btnEliminar = document.getElementById("btnEliminar");
const btnCancelar = document.getElementById("btnCancelar");
const tablaTipoPedido = document.getElementById("tablaTipoPedido");

async function cargar() {
  try {
    const res = await fetch(API);
    if (!res.ok) throw new Error();
    tiposPedido = await res.json();
    render(tiposPedido);
  } catch (err) {
    console.error(err);
    tablaTipoPedido.innerHTML = "<div style='padding:10px;color:red'>Error cargando datos</div>";
  }
}

function bloquearFormulario() {
  nombreTipoPedido.disabled = true;
  descripcionTipoPedido.disabled = true;
  activoTipoPedido.disabled = true;
}

function habilitarFormulario() {
  nombreTipoPedido.disabled = false;
  descripcionTipoPedido.disabled = false;
  activoTipoPedido.disabled = false;
}

function mostrarAdvertencia(texto, focusEl = codigoTipoPedido) {
  const modal = document.getElementById("modalAdvertencia");
  const txt = document.getElementById("modalAdvertenciaTexto");
  txt.textContent = texto;
  modal.classList.remove("hidden");
  setTimeout(() => focusEl?.focus?.(), 50);
}

function cerrarAdvertencia(refocus = false) {
  document.getElementById("modalAdvertencia").classList.add("hidden");
  if (refocus) {
    setTimeout(() => {
      codigoTipoPedido.focus();
      codigoTipoPedido.select();
    }, 40);
  }
}

function volverSeguro() {
  if (formDirty) {
    baseModalOpenConfirmGeneric({
      titulo: "Salir",
      mensaje: "Hay cambios sin guardar. Desea salir?",
      onConfirm: () => {
        window.location.href = "../parametros/parametros.html";
      }
    });
    return;
  }
  window.location.href = "../parametros/parametros.html";
}

function render(data) {
  data = [...data].sort((a, b) => {
    const av = a[sortField] ?? 0;
    const bv = b[sortField] ?? 0;
    return sortDir === "asc" ? av - bv : bv - av;
  });

  tablaTipoPedido.innerHTML = "";

  if (!data.length) {
    tablaTipoPedido.innerHTML = '<div style="padding:15px;color:#999">Sin tipos de pedido</div>';
    return;
  }

  data.forEach((tp) => {
    const row = document.createElement("div");
    row.className = "tabla-row";
    if (tp.estado === false) row.classList.add("inactivo");
    row.style.gridTemplateColumns = "90px 220px 1fr 120px";
    row.innerHTML = `
      <span>${tp.id_tipo_pedido}</span>
      <span>${tp.nombre || "-"}</span>
      <span>${tp.descripcion || "-"}</span>
      <span>${tp.estado ? "Activo" : "Inactivo"}</span>
    `;
    row.onclick = () => {
      document.querySelectorAll(".tabla-row").forEach((r) => r.classList.remove("activo"));
      row.classList.add("activo");
      seleccionar(tp);
    };
    tablaTipoPedido.appendChild(row);
  });
}

function seleccionar(tp) {
  tipoPedidoId.value = tp.id_tipo_pedido;
  codigoTipoPedido.value = tp.id_tipo_pedido;
  nombreTipoPedido.value = tp.nombre || "";
  descripcionTipoPedido.value = tp.descripcion || "";
  activoTipoPedido.checked = tp.estado !== false;
  habilitarFormulario();
  btnGuardar.disabled = false;
  btnEliminar.disabled = false;
  btnCancelar.disabled = false;
  formDirty = false;
}

function modoInicial() {
  tipoPedidoId.value = "";
  codigoTipoPedido.value = "";
  nombreTipoPedido.value = "";
  descripcionTipoPedido.value = "";
  activoTipoPedido.checked = true;
  btnGuardar.disabled = true;
  btnEliminar.disabled = true;
  btnCancelar.disabled = true;
  formDirty = false;
  bloquearFormulario();
}

async function obtenerProximoId() {
  const res = await fetch(`${API}/next-id`);
  if (!res.ok) throw new Error("No se pudo obtener el codigo");
  const data = await res.json();
  return Number(data?.next_id || 1);
}

async function nuevo() {
  modoInicial();
  try {
    codigoTipoPedido.value = await obtenerProximoId();
  } catch {
    codigoTipoPedido.value = "";
  }
  habilitarFormulario();
  btnGuardar.disabled = false;
  btnCancelar.disabled = false;
  setTimeout(() => nombreTipoPedido.focus(), 50);
}

function cancelar() {
  modoInicial();
  document.querySelectorAll(".tabla-row").forEach((r) => r.classList.remove("activo"));
  setTimeout(() => {
    codigoTipoPedido.focus();
    codigoTipoPedido.select();
  }, 40);
}

function payload() {
  const id = Number(tipoPedidoId.value || 0);
  const codigo = Number(codigoTipoPedido.value || 0);
  return {
    id_tipo_pedido: id > 0 ? id : null,
    codigo: codigo > 0 ? codigo : null,
    nombre: nombreTipoPedido.value.trim(),
    descripcion: descripcionTipoPedido.value.trim(),
    estado: activoTipoPedido.checked
  };
}

function validar() {
  if (!nombreTipoPedido.value.trim()) return "Ingrese nombre";
  return null;
}

async function guardar() {
  const error = validar();
  if (error) return mostrarAdvertencia(error, nombreTipoPedido);

  try {
    const res = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload())
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Error");
    await cargar();
    const guardadoId = Number(data?.id_tipo_pedido || 0);
    const guardado = tiposPedido.find((tp) => Number(tp.id_tipo_pedido) === guardadoId);
    if (guardado) {
      seleccionar(guardado);
      const row = Array.from(tablaTipoPedido.querySelectorAll(".tabla-row"))
        .find((el) => String(el.firstElementChild?.textContent || "").trim() === String(guardadoId));
      if (row) {
        document.querySelectorAll(".tabla-row").forEach((r) => r.classList.remove("activo"));
        row.classList.add("activo");
      }
    } else {
      cancelar();
    }
  } catch (err) {
    mostrarAdvertencia(err.message || "Error al guardar");
  }
}

async function eliminar() {
  if (!tipoPedidoId.value) return;
  baseModalOpenConfirmGeneric({
    titulo: "Eliminar",
    mensaje: "Desea eliminar el tipo de pedido seleccionado?",
    onConfirm: async () => {
      try {
        const res = await fetch(`${API}/${tipoPedidoId.value}`, { method: "DELETE" });
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
    tiposPedido.filter((tp) =>
      String(tp.id_tipo_pedido).includes(t) ||
      (tp.nombre || "").toLowerCase().includes(t) ||
      (tp.descripcion || "").toLowerCase().includes(t)
    )
  );
}

codigoTipoPedido.addEventListener("input", () => {
  codigoTipoPedido.value = codigoTipoPedido.value.replace(/\D/g, "");
});

[nombreTipoPedido, descripcionTipoPedido].forEach((el) => {
  el.addEventListener("input", () => {
    if (!btnGuardar.disabled) formDirty = true;
  });
});

activoTipoPedido.addEventListener("change", () => {
  if (!btnGuardar.disabled) formDirty = true;
});

codigoTipoPedido.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  e.preventDefault();
  if (!codigoTipoPedido.value.trim()) {
    nuevo();
    return;
  }
  fetch(`${API}/${encodeURIComponent(codigoTipoPedido.value.trim())}`)
    .then(async (res) => {
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "No existe tipo pedido con ese codigo");
      seleccionar(data);
      return data;
    })
    .then((tp) => {
      const row = Array.from(tablaTipoPedido.querySelectorAll(".tabla-row"))
        .find((el) => String(el.firstElementChild?.textContent || "").trim() === String(tp.id_tipo_pedido));
      if (row) {
        document.querySelectorAll(".tabla-row").forEach((r) => r.classList.remove("activo"));
        row.classList.add("activo");
      }
    })
    .catch((err) => {
      mostrarAdvertencia(err.message || "No existe tipo pedido con ese codigo");
    });
});

nombreTipoPedido.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    descripcionTipoPedido.focus();
  }
});

descripcionTipoPedido.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    guardar();
  }
});

thId.addEventListener("click", () => {
  sortDir = sortDir === "asc" ? "desc" : "asc";
  thId.textContent = sortDir === "asc" ? "ID ▲" : "ID ▼";
  render(tiposPedido);
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
    codigoTipoPedido.disabled = false;
    codigoTipoPedido.focus();
  }, 120);
};
