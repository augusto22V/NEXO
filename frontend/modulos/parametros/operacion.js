const API = "/api/operacion";

let operaciones = [];
let formDirty = false;
let sortField = "id";
let sortDir = "desc";

const params = new URLSearchParams(window.location.search);
const modoSeleccion = params.get("modo") === "seleccion";
const filtroTipo = String(params.get("tipo") || "").trim().toUpperCase();
const soloActivos = params.get("activo") !== "0";
const storageKey = params.get("storage_key") || "operacionSeleccionada";
const buscarInicial = String(params.get("buscar") || "").trim();
const fromModulo = String(params.get("from") || "").trim().toLowerCase();

const operacionId = document.getElementById("operacionId");
const codigoOperacion = document.getElementById("codigoOperacion");
const descripcionOperacion = document.getElementById("descripcionOperacion");
const tipoOperacion = document.getElementById("tipoOperacion");
const afectaStock = document.getElementById("afectaStock");
const requiereConfirmacion = document.getElementById("requiereConfirmacion");
const permiteCredito = document.getElementById("permiteCredito");
const requiereCredito = document.getElementById("requiereCredito");
const generaFinanciero = document.getElementById("generaFinanciero");
const activoOperacion = document.getElementById("activoOperacion");
const buscar = document.getElementById("buscar");
const thId = document.getElementById("thId");
const btnGuardar = document.getElementById("btnGuardar");
const btnEliminar = document.getElementById("btnEliminar");
const btnCancelar = document.getElementById("btnCancelar");
const btnNuevo = document.getElementById("btnNuevo");
const tablaOperaciones = document.getElementById("tablaOperaciones");

const CODIGO_CORTO_REGLAS = Object.freeze({
  E: [
    { short: "9", aliases: ["9"], internal: [1101], tokens: ["compra", "contado"] },
    { short: "10", aliases: ["10"], internal: [1102], tokens: ["compra", "credito"] },
    { short: "15", aliases: ["15"], internal: [1108, 1104], tokens: ["entrada", "mercaderia"] },
    { short: "17", aliases: ["17"], internal: [1105], tokens: ["entrada", "transferencia"] },
    { short: "31", aliases: ["31"], internal: [1103], tokens: ["devolucion", "venta"] },
    { short: "36", aliases: ["36"], internal: [1106], tokens: ["mercaderia", "sobrante"] },
    { short: "44", aliases: ["44"], internal: [1107], tokens: ["importacion"] }
  ],
  S: [
    { short: "1", aliases: ["1", "3", "18"], internal: [2101], tokens: ["venta", "contado"] },
    { short: "2", aliases: ["2", "4", "19"], internal: [2102], tokens: ["venta", "credito"] },
    { short: "12", aliases: ["12", "13"], internal: [2103], tokens: ["presupuesto"] },
    { short: "16", aliases: ["16"], internal: [2106], tokens: ["salida", "transferencia"] },
    { short: "30", aliases: ["30"], internal: [2109], tokens: ["mercaderia", "faltante"] },
    { short: "45", aliases: ["45"], internal: [2107], tokens: ["brindis", "cliente"] }
  ]
});

function toInt(value, fallback = 0) {
  const n = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function resolveContextoOperativo() {
  if (filtroTipo === "E" || fromModulo.includes("compra")) return "E";
  if (filtroTipo === "S" || fromModulo.includes("venta")) return "S";
  return null;
}

const contextoOperativo = resolveContextoOperativo();

function matchReglaCodigoCorto(op, tipo) {
  const reglas = CODIGO_CORTO_REGLAS[tipo] || [];
  const codigoInterno = toInt(op?.codigo, 0);
  const descripcion = normalizeText(op?.descripcion);

  for (const regla of reglas) {
    if (regla.internal.includes(codigoInterno)) return regla;
    if (descripcion && regla.tokens.every((token) => descripcion.includes(token))) return regla;
  }

  return null;
}

function getCodigoVisible(op) {
  if (!modoSeleccion) return String(op?.codigo ?? op?.id ?? "");
  const tipo = String(op?.tipo || "").trim().toUpperCase();
  if (!["E", "S"].includes(tipo)) return String(op?.codigo ?? op?.id ?? "");
  if (contextoOperativo && contextoOperativo !== tipo) return String(op?.codigo ?? op?.id ?? "");

  const regla = matchReglaCodigoCorto(op, tipo);
  return String(regla?.short || op?.codigo || op?.id || "");
}

function getCodigosBusqueda(op) {
  const codigos = new Set();
  codigos.add(String(op?.codigo ?? op?.id ?? "").trim());
  const tipo = String(op?.tipo || "").trim().toUpperCase();
  const regla = matchReglaCodigoCorto(op, tipo);
  if (regla?.short) codigos.add(String(regla.short));
  for (const alias of regla?.aliases || []) codigos.add(String(alias));
  return Array.from(codigos).filter(Boolean);
}

function cerrarVentanaSeleccion() {
  try {
    window.close();
  } catch {
    // noop
  }
  if (!window.closed) {
    if (window.history.length > 1) window.history.back();
    else window.location.href = "/home.html";
  }
}

function notificarSeleccionAOrigen(data) {
  if (!modoSeleccion || !data?.id) return;
  try {
    if (window.opener && typeof window.opener.recibirOperacion === "function") {
      window.opener.recibirOperacion(data);
    }
  } catch {
    // noop
  }
  try {
    window.opener?.postMessage?.(
      {
        type: "operacion:seleccionada",
        storageKey,
        payload: data
      },
      window.location.origin
    );
  } catch {
    // noop
  }
}

function buildApiQuery() {
  const q = new URLSearchParams();
  if (filtroTipo === "E" || filtroTipo === "S") q.set("tipo", filtroTipo);
  if (modoSeleccion) q.set("activo", soloActivos ? "1" : "0");
  return q.toString() ? `?${q.toString()}` : "";
}

async function cargar() {
  try {
    const res = await fetch(`${API}${buildApiQuery()}`);
    if (!res.ok) throw new Error();
    operaciones = await res.json();
    render(operaciones);
  } catch (err) {
    console.error(err);
    tablaOperaciones.innerHTML = "<div style='padding:10px;color:red'>Error cargando datos</div>";
  }
}

function bloquearFormulario() {
  descripcionOperacion.disabled = true;
  tipoOperacion.disabled = true;
  afectaStock.disabled = true;
  requiereConfirmacion.disabled = true;
  permiteCredito.disabled = true;
  requiereCredito.disabled = true;
  generaFinanciero.disabled = true;
  activoOperacion.disabled = true;
}

function habilitarFormulario() {
  descripcionOperacion.disabled = false;
  tipoOperacion.disabled = false;
  afectaStock.disabled = false;
  requiereConfirmacion.disabled = false;
  permiteCredito.disabled = false;
  requiereCredito.disabled = false;
  generaFinanciero.disabled = false;
  activoOperacion.disabled = false;
}

function mostrarAdvertencia(texto, focusEl = codigoOperacion) {
  const modal = document.getElementById("modalAdvertencia");
  const txt = document.getElementById("modalAdvertenciaTexto");
  txt.textContent = texto;
  modal.classList.remove("hidden");
  setTimeout(() => focusEl?.focus?.(), 50);
}

function cerrarAdvertencia(refocus = false) {
  document.getElementById("modalAdvertencia").classList.add("hidden");
  if (refocus && !modoSeleccion) {
    setTimeout(() => {
      codigoOperacion.focus();
      codigoOperacion.select();
    }, 40);
  }
}

function volverSeguro() {
  if (modoSeleccion) {
    cerrarVentanaSeleccion();
    return;
  }
  const destino = "/modulos/parametros/parametros.html";
  if (formDirty) {
    baseModalOpenConfirmGeneric({
      titulo: "Salir",
      mensaje: "Hay cambios sin guardar. Desea salir?",
      onConfirm: () => {
        window.location.href = destino;
      }
    });
    return;
  }
  window.location.href = destino;
}

function payloadOperacion(op = {}) {
  const codigosLookup = getCodigosBusqueda(op);
  return {
    id: op.id,
    codigo: toInt(op.codigo, 0),
    codigo_visible: getCodigoVisible(op),
    codigos_lookup: codigosLookup,
    descripcion: String(op.descripcion || "").trim(),
    tipo: String(op.tipo || "").trim().toUpperCase(),
    afecta_stock: op.afecta_stock === true,
    requiere_confirmacion: op.requiere_confirmacion === true,
    permite_credito: op.permite_credito === true,
    requiere_credito: op.requiere_credito === true,
    genera_financiero: op.genera_financiero === true,
    activo: op.activo !== false
  };
}

function seleccionarModoPopup(op) {
  const data = payloadOperacion(op);
  if (!data.id) return;
  localStorage.setItem(storageKey, JSON.stringify(data));
  notificarSeleccionAOrigen(data);
  cerrarVentanaSeleccion();
}

function render(data) {
  data = [...data].sort((a, b) => {
    const av = a[sortField] ?? 0;
    const bv = b[sortField] ?? 0;
    return sortDir === "asc" ? av - bv : bv - av;
  });

  tablaOperaciones.innerHTML = "";

  if (!data.length) {
    tablaOperaciones.innerHTML = '<div style="padding:15px;color:#999">Sin operaciones</div>';
    return;
  }

  data.forEach((op) => {
    const row = document.createElement("div");
    row.className = "tabla-row";
    if (op.activo === false) row.classList.add("inactivo");
    const codigoVisible = getCodigoVisible(op);
    row.style.gridTemplateColumns = "70px 180px 90px 95px 120px 120px 120px 90px";
    row.innerHTML = `
      <span>${codigoVisible}</span>
      <span>${op.descripcion || "-"}</span>
      <span>${op.tipo || "-"}</span>
      <span>${op.afecta_stock ? "SI" : "NO"}</span>
      <span>${op.requiere_confirmacion ? "SI" : "NO"}</span>
      <span>${op.permite_credito ? "SI" : "NO"}</span>
      <span>${op.genera_financiero ? "SI" : "NO"}</span>
      <span>${op.activo ? "Activo" : "Inactivo"}</span>
    `;
    row.onclick = () => {
      if (modoSeleccion) {
        seleccionarModoPopup(op);
        return;
      }
      document.querySelectorAll(".tabla-row").forEach((r) => r.classList.remove("activo"));
      row.classList.add("activo");
      seleccionar(op);
    };
    tablaOperaciones.appendChild(row);
  });
}

function seleccionar(op) {
  operacionId.value = op.id;
  codigoOperacion.value = op.codigo ?? op.id;
  descripcionOperacion.value = op.descripcion || "";
  tipoOperacion.value = (op.tipo || "").toUpperCase();
  afectaStock.checked = !!op.afecta_stock;
  requiereConfirmacion.checked = !!op.requiere_confirmacion;
  permiteCredito.checked = !!op.permite_credito;
  requiereCredito.checked = !!op.requiere_credito;
  generaFinanciero.checked = !!op.genera_financiero;
  activoOperacion.checked = op.activo !== false;
  habilitarFormulario();
  btnGuardar.disabled = false;
  btnEliminar.disabled = false;
  btnCancelar.disabled = false;
  formDirty = false;
}

function modoInicial() {
  operacionId.value = "";
  codigoOperacion.value = "";
  descripcionOperacion.value = "";
  tipoOperacion.value = filtroTipo === "S" ? "S" : "E";
  afectaStock.checked = true;
  requiereConfirmacion.checked = false;
  permiteCredito.checked = false;
  requiereCredito.checked = false;
  generaFinanciero.checked = false;
  activoOperacion.checked = true;
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
    codigoOperacion.value = await obtenerProximoCodigo();
  } catch {
    const maxCodigo = operaciones.reduce((acc, row) => {
      const codigo = Number(row.codigo ?? 0);
      return Number.isFinite(codigo) && codigo > acc ? codigo : acc;
    }, 0);
    codigoOperacion.value = String(maxCodigo + 1);
  }
  habilitarFormulario();
  btnGuardar.disabled = false;
  btnCancelar.disabled = false;
  setTimeout(() => descripcionOperacion.focus(), 50);
}

function cancelar() {
  modoInicial();
  document.querySelectorAll(".tabla-row").forEach((r) => r.classList.remove("activo"));
  setTimeout(() => {
    codigoOperacion.focus();
    codigoOperacion.select();
  }, 40);
}

function payload() {
  const requiereCreditoChecked = requiereCredito.checked;
  return {
    codigo: Number(codigoOperacion.value),
    descripcion: descripcionOperacion.value.trim(),
    tipo: tipoOperacion.value.trim().toUpperCase(),
    afecta_stock: afectaStock.checked,
    requiere_confirmacion: requiereConfirmacion.checked,
    permite_credito: requiereCreditoChecked ? true : permiteCredito.checked,
    requiere_credito: requiereCreditoChecked,
    genera_financiero: generaFinanciero.checked,
    activo: activoOperacion.checked
  };
}

function validar() {
  if (!codigoOperacion.value.trim()) return "Ingrese codigo";
  if (!descripcionOperacion.value.trim()) return "Ingrese descripcion";
  if (!["E", "S"].includes(tipoOperacion.value.trim().toUpperCase())) return "Tipo debe ser E o S";
  return null;
}

async function guardar() {
  const error = validar();
  if (error) return mostrarAdvertencia(error);

  try {
    const url = operacionId.value ? `${API}/${operacionId.value}` : API;
    const method = operacionId.value ? "PUT" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload())
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Error");
    await cargar();
    await nuevo();
  } catch (err) {
    mostrarAdvertencia(err.message || "Error al guardar");
  }
}

async function eliminar() {
  if (!operacionId.value) return;
  baseModalOpenConfirmGeneric({
    titulo: "Inactivar",
    mensaje: "Desea inactivar la operacion seleccionada?",
    onConfirm: async () => {
      try {
        const res = await fetch(`${API}/${operacionId.value}`, { method: "DELETE" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Error");
        await cargar();
        cancelar();
      } catch (err) {
        mostrarAdvertencia(err.message || "Error al inactivar");
      }
    }
  });
}

function filtrar() {
  const t = normalizeText(buscar.value || "");
  render(
    operaciones.filter((op) =>
      getCodigosBusqueda(op).some((code) => normalizeText(code).includes(t)) ||
      normalizeText(op.descripcion || "").includes(t) ||
      normalizeText(op.tipo || "").includes(t)
    )
  );
}

function aplicarModoSeleccionUI() {
  if (!modoSeleccion) return;
  document.body.classList.add("modo-seleccion");
  const titulo = document.querySelector(".topbar .titulo span");
  if (titulo) titulo.textContent = "Seleccionar Operacion";
  const formPanel = document.querySelector(".panel-form");
  if (formPanel) formPanel.hidden = true;
  const acciones = document.querySelector(".acciones");
  if (acciones) acciones.hidden = true;
  const auditoria = document.getElementById("auditOperacion");
  if (auditoria) auditoria.hidden = true;
  buscar.placeholder = "Buscar por codigo corto, codigo interno o descripcion...";
  buscar.focus();
}

tipoOperacion.addEventListener("input", () => {
  tipoOperacion.value = tipoOperacion.value.toUpperCase().replace(/[^ES]/g, "").slice(0, 1);
});

permiteCredito.addEventListener("change", () => {
  if (!permiteCredito.checked) requiereCredito.checked = false;
});

requiereCredito.addEventListener("change", () => {
  if (requiereCredito.checked) permiteCredito.checked = true;
});

[descripcionOperacion, tipoOperacion].forEach((el) => {
  el.addEventListener("input", () => {
    if (!btnGuardar.disabled) formDirty = true;
  });
});

[afectaStock, requiereConfirmacion, permiteCredito, requiereCredito, generaFinanciero, activoOperacion].forEach((el) => {
  el.addEventListener("change", () => {
    if (!btnGuardar.disabled) formDirty = true;
  });
});

descripcionOperacion.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    tipoOperacion.focus();
  }
});

tipoOperacion.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    guardar();
  }
});

thId.addEventListener("click", () => {
  sortDir = sortDir === "asc" ? "desc" : "asc";
  thId.textContent = sortDir === "asc" ? "ID ^" : "ID v";
  render(operaciones);
});

document.addEventListener("keydown", (e) => {
  if (modoSeleccion) {
    if (e.key === "Escape") {
      e.preventDefault();
      cerrarVentanaSeleccion();
    }
    return;
  }

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
  aplicarModoSeleccionUI();
  if (buscarInicial) buscar.value = buscarInicial;
  if (modoSeleccion) {
    await cargar();
    if (buscarInicial) filtrar();
    return;
  }

  modoInicial();
  await cargar();
  if (buscarInicial) filtrar();
  baseModalEnableExitProtection({ hayCambios: () => formDirty });
  setTimeout(() => {
    btnNuevo?.focus();
  }, 120);
};

