/* === STATE === */
let ventaActual = null;
let cotizacion = { brl: 0, usd: 0 };
let pagos = [];
let clienteActual = null;
let permisos = {};
let cobrando = false;

const PERMISOS_DEFAULT = Object.freeze({ venta_rapida_efectivizar: true });

/* === INIT === */
document.addEventListener("DOMContentLoaded", async () => {
  centrarVentana();
  await cargarPermisos();
  await cargarCotizacion();
  await cargarVentaDesdeURL();
  actualizarHora();
  setInterval(actualizarHora, 1000);
});

/* === CENTRAR VENTANA === */
function centrarVentana() {
  try {
    const w = Math.min(screen.availWidth,  960);
    const h = Math.min(screen.availHeight, 680);
    const left = Math.round((screen.availWidth  - w) / 2);
    const top  = Math.round((screen.availHeight - h) / 2);
    window.moveTo(left, top);
    window.resizeTo(w, h);
  } catch (_) {}
}

/* === HORA === */
function actualizarHora() {
  const el = document.getElementById("cajaFecha");
  if (el) el.innerText = new Date().toLocaleString("es-PY");
}

/* === COTIZACION === */
async function cargarCotizacion() {
  try {
    const res = await fetch("/api/cotizacion/hoy", { credentials: "include" });
    const data = await res.json();
    cotizacion.brl = Number(data.brl) || 0;
    cotizacion.usd = Number(data.usd) || 0;

    if (cotizacion.brl <= 0 || cotizacion.usd <= 0) {
      const faltan = [];
      if (cotizacion.brl <= 0) faltan.push("REAL");
      if (cotizacion.usd <= 0) faltan.push("DÓLAR");
      mostrarToast(
        `⚠ Falta cargar cotización ${faltan.join(" y ")} — abrí Herramientas › Cotización`,
        "warning"
      );
    }
  } catch (_) {
    mostrarToast("Error cargando cotización", "error");
  }
}

/* === PERMISOS === */
async function cargarPermisos() {
  try {
    const res = await fetch("/api/permisos/me", { credentials: "include" });
    permisos = await res.json();
  } catch (_) { permisos = {}; }
}

function tienePermiso(clave) {
  const fromMap = permisos?.permisos_venta_rapida?.[clave];
  if (typeof fromMap === "boolean") return fromMap;
  const fromRoot = permisos?.[clave];
  if (typeof fromRoot === "boolean") return fromRoot;
  return Boolean(PERMISOS_DEFAULT[clave]);
}

/* === CARGAR VENTA === */
async function cargarVentaDesdeURL() {
  const params     = new URLSearchParams(window.location.search);
  const ventasParam = params.get("ventas");
  const ventaParam  = params.get("venta_id");

  let ventasIds = [];
  if (ventasParam) {
    ventasIds = ventasParam.split(",").map(v => Number(String(v).trim())).filter(n => n > 0);
  } else if (ventaParam) {
    const n = Number(String(ventaParam).trim());
    if (n > 0) ventasIds = [n];
  }

  if (!ventasIds.length) {
    setItemsBody('<div class="items-vacio">Sin venta</div>');
    return;
  }

  setItemsBody('<div class="items-vacio">Cargando...</div>');

  let totalGeneral = 0;
  let todosItems   = [];

  for (const id of ventasIds) {
    try {
      const res = await fetch(`/api/venta/${id}`, { credentials: "include" });
      if (!res.ok) { mostrarToast(`Error cargando venta ${id}`, "error"); continue; }
      const data = await res.json();
      totalGeneral += Number(data.total || 0);
      (data.detalles || []).forEach(d => todosItems.push({ ...d, venta_id: id }));
    } catch (_) {
      mostrarToast(`Error de red (venta ${id})`, "error");
    }
  }

  ventaActual = {
    ids:      ventasIds,
    id:       ventasIds.join(","),
    total:    totalGeneral,
    detalles: todosItems
  };

  renderItems(todosItems);
  actualizarHeader();
}

function setItemsBody(html) {
  const el = document.getElementById("itemsBody");
  if (el) el.innerHTML = html;
}

/* === FORMATO CANTIDAD === */
function fmtCantidad(n) {
  const num = Number(n);
  return Number.isInteger(num) ? String(num) : num.toFixed(2).replace(/\.?0+$/, "");
}

/* === RENDER ITEMS === */
function renderItems(detalles) {
  const cantEl = document.getElementById("cantItems");
  if (cantEl) cantEl.textContent = detalles ? detalles.length : 0;

  if (!detalles || !detalles.length) {
    setItemsBody('<div class="items-vacio">Sin ítems</div>');
    return;
  }

  const html = detalles.map(item => {
    const nombre  = item.descripcion || item.producto_nombre || "(sin nombre)";
    const gs      = Number(item.subtotal || 0);
    const brlStr  = cotizacion.brl > 0 ? (gs / cotizacion.brl).toFixed(2).replace(".", ",") : "—";
    const usdStr  = cotizacion.usd > 0 ? (gs / cotizacion.usd).toFixed(2).replace(".", ",") : "—";
    const qty     = fmtCantidad(item.cantidad);

    return `<div class="item-card">
      <div class="item-nombre"><span class="item-qty">${qty}×</span> ${nombre}</div>
      <div class="item-montos">
        <span class="item-moneda-row"><span class="item-flag">🇵🇾</span>${gs.toLocaleString("es-PY")}</span>
        <span class="item-moneda-row"><span class="item-flag">🇧🇷</span>${brlStr}</span>
        <span class="item-moneda-row"><span class="item-flag">🇺🇸</span>${usdStr}</span>
      </div>
    </div>`;
  }).join("");

  setItemsBody(html);
}

/* === HEADER TOTALES === */
function actualizarHeader() {
  if (!ventaActual) return;

  const totalGs     = Number(ventaActual.total) || 0;
  const pagadoGs    = pagos.reduce((s, p) => s + p.montoGs, 0);
  const pendienteGs = Math.max(0, totalGs - pagadoGs);

  // Fila "Total"
  setEl("totalHeaderGs",  totalGs.toLocaleString("es-PY"));
  setEl("totalHeaderBrl", cotizacion.brl > 0 ? (totalGs / cotizacion.brl).toFixed(2).replace(".", ",") : "0,00");
  setEl("totalHeaderUsd", cotizacion.usd > 0 ? (totalGs / cotizacion.usd).toFixed(2).replace(".", ",") : "0,00");

  // Fila "A pagar"
  setEl("aPagarGs",  pendienteGs.toLocaleString("es-PY"));
  setEl("aPagarBrl", cotizacion.brl > 0 && pendienteGs > 0 ? (pendienteGs / cotizacion.brl).toFixed(2).replace(".", ",") : "0,00");
  setEl("aPagarUsd", cotizacion.usd > 0 && pendienteGs > 0 ? (pendienteGs / cotizacion.usd).toFixed(2).replace(".", ",") : "0,00");

  const apRow = document.getElementById("filaPagar");
  if (apRow) {
    apRow.classList.toggle("apagar-ok",    pendienteGs <= 0);
    apRow.classList.toggle("apagar-falta", pendienteGs > 0);
  }
}

function setEl(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

/* === AGREGAR PAGO === */
function agregarPago() {
  if (!ventaActual) { mostrarToast("Sin venta cargada", "error"); return; }

  const metodo = document.getElementById("metodoPagoSel")?.value || "EFECTIVO";
  const moneda = document.getElementById("monedaSel")?.value    || "PYG";
  const monto  = parseFloat(document.getElementById("montoInput")?.value || "0");

  if (!monto || monto <= 0) { mostrarToast("Ingrese un monto válido", "error"); return; }

  if ((metodo === "TARJETA" || metodo === "TRANSFERENCIA") && moneda !== "PYG") {
    mostrarToast(`${metodo} solo acepta PYG`, "error");
    return;
  }

  let montoGs = monto;
  if      (moneda === "BRL") montoGs = monto * cotizacion.brl;
  else if (moneda === "USD") montoGs = monto * cotizacion.usd;

  pagos.push({ metodo, moneda, monto, montoGs });

  document.getElementById("montoInput").value = "";
  document.getElementById("montoInput").focus();

  renderPagos();
  actualizarHeader();
}

/* === RENDER PAGOS === */
function renderPagos() {
  const tbody = document.getElementById("pagosBody");
  if (!tbody) return;

  if (!pagos.length) {
    tbody.innerHTML = '<tr class="pagos-vacio-row"><td colspan="5">Lista vacía</td></tr>';
    return;
  }

  const totalGs = ventaActual ? Number(ventaActual.total) : 0;
  let acumGs = 0;

  tbody.innerHTML = pagos.map((p, i) => {
    acumGs += p.montoGs;
    const vueltoGs = Math.max(0, acumGs - totalGs);

    let vueltoStr = "—";
    if (vueltoGs > 0) {
      const vGs  = Math.round(vueltoGs).toLocaleString("es-PY");
      const vBrl = cotizacion.brl > 0 ? (vueltoGs / cotizacion.brl).toFixed(2).replace(".", ",") : null;
      const vUsd = cotizacion.usd > 0 ? (vueltoGs / cotizacion.usd).toFixed(2).replace(".", ",") : null;
      vueltoStr = `<div class="vuelto-multi">
        <span class="vm-row"><span class="vm-flag">🇵🇾</span>${vGs}</span>
        ${vBrl ? `<span class="vm-row"><span class="vm-flag">🇧🇷</span>${vBrl}</span>` : ""}
        ${vUsd ? `<span class="vm-row"><span class="vm-flag">🇺🇸</span>${vUsd}</span>` : ""}
      </div>`;
    }

    const montoFmt = p.moneda === "PYG"
      ? Math.round(p.monto).toLocaleString("es-PY")
      : p.monto.toFixed(2).replace(".", ",");

    return `<tr>
      <td class="vuelto-col ${vueltoGs > 0 ? "vuelto-positivo" : ""}">${vueltoStr}</td>
      <td>${p.metodo}</td>
      <td>${p.moneda}</td>
      <td class="valor-col">${montoFmt}</td>
      <td><button class="btn-quitar-pago" onclick="quitarPago(${i})">×</button></td>
    </tr>`;
  }).join("");
}

/* === QUITAR PAGO === */
function quitarPago(idx) {
  pagos.splice(idx, 1);
  renderPagos();
  actualizarHeader();
}

/* === CLIENTE === */
async function buscarClientePorRuc(event) {
  if (event.key !== "Enter") return;
  const ruc = String(document.getElementById("rucInput")?.value || "").trim();
  if (!ruc) return;

  mostrarSpinner(true, "Buscando cliente...");
  try {
    // 1) Busqueda local en BD (acepta RUC con o sin DV, o solo cedula)
    const res = await fetch(`/api/clientes/ruc/${encodeURIComponent(ruc)}`, { credentials: "include" });
    let cliente = null;
    let errorDetalle = null;

    if (res.ok) {
      const data = await res.json();
      cliente = Array.isArray(data) ? data[0] : data;
    } else {
      // Capturamos el detalle real del error del backend para diagnosticar
      try {
        const errData = await res.json();
        errorDetalle = errData?.detalle || errData?.error || `HTTP ${res.status}`;
        console.error("[BUSCAR CLIENTE] error backend:", errData);
      } catch (_) {
        errorDetalle = `HTTP ${res.status}`;
      }
    }

    if (errorDetalle) {
      mostrarToast(`Error: ${errorDetalle}`, "error");
      return;
    }

    if (!cliente) {
      mostrarToast("Cliente no encontrado", "warning");
      return;
    }

    clienteActual = cliente;
    const nombreEl = document.getElementById("clienteNombre");
    if (nombreEl) nombreEl.value = cliente.nombre || cliente.razon_social || "";
    // Si vino sin DV de la API externa, completar el input con el RUC formal
    if (cliente.ruc) {
      const rucEl = document.getElementById("rucInput");
      if (rucEl) rucEl.value = cliente.ruc;
    }
    mostrarToast(`✔ ${cliente.nombre || cliente.razon_social || "Cliente"}`, "success");
  } catch (_) {
    mostrarToast("Error buscando cliente", "error");
  } finally {
    mostrarSpinner(false);
  }
}

function limpiarCliente() {
  clienteActual = null;
  const rucEl    = document.getElementById("rucInput");
  const nombreEl = document.getElementById("clienteNombre");
  if (rucEl)    rucEl.value    = "";
  if (nombreEl) nombreEl.value = "";
}

/* === EFECTIVIZAR === */
async function efectivizar(imprimirTicket = true) {
  if (!tienePermiso("venta_rapida_efectivizar")) {
    mostrarToast("Sin permiso para cobrar", "error"); return;
  }
  if (cobrando) return;
  if (!ventaActual) { mostrarToast("Sin venta cargada", "error"); return; }
  if (!pagos.length) { mostrarToast("Agregue al menos un pago", "error"); return; }

  const totalGs  = Number(ventaActual.total);
  const pagadoGs = pagos.reduce((s, p) => s + p.montoGs, 0);

  if (pagadoGs < totalGs) {
    const falta = Math.round(totalGs - pagadoGs);
    mostrarToast(`Monto insuficiente — falta Gs ${falta.toLocaleString("es-PY")}`, "error");
    return;
  }

  cobrando = true;
  const btn = document.getElementById("btnFinalizar");
  if (btn) btn.disabled = true;
  mostrarSpinner(true, "Procesando cobro...");

  try {
    let pagoGs = 0, pagoBrl = 0, pagoUsd = 0, pagoTarjeta = 0, pagoTransferencia = 0;

    for (const p of pagos) {
      if      (p.moneda === "BRL")              pagoBrl           += p.monto;
      else if (p.moneda === "USD")              pagoUsd           += p.monto;
      else if (p.metodo === "TARJETA")          pagoTarjeta       += p.monto;
      else if (p.metodo === "TRANSFERENCIA")    pagoTransferencia += p.monto;
      else                                      pagoGs            += p.monto;
    }

    const body = {
      ventas:             ventaActual.ids,
      metodo:             pagos[0]?.metodo || "EFECTIVO",
      pago_gs:            pagoGs,
      pago_brl:           pagoBrl,
      pago_usd:           pagoUsd,
      pago_tarjeta:       pagoTarjeta,
      pago_transferencia: pagoTransferencia,
      total_pagado_gs:    Math.round(pagadoGs),
      imprimir_ticket:    imprimirTicket,
      cliente_id:         clienteActual?.id     || null,
      cliente_nombre:     clienteActual?.nombre || null
    };

    const res = await fetch("/api/caja/cobrar", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    let data = {};
    try { data = await res.json(); } catch (_) {}

    if (!res.ok) {
      if (String(data.error || "").includes("No hay caja abierta")) {
        mostrarToast("No hay caja abierta — abrí la caja primero", "error");
        localStorage.setItem("ventaPendienteCobro", String(ventaActual.id));
        setTimeout(() => { window.location.href = "/modulos/gestion_caja/gestion.html"; }, 1500);
        return;
      }
      mostrarToast(data.error || "Error al cobrar", "error");
      return;
    }

    const vueltoGs = Math.max(0, Math.round(pagadoGs - totalGs));
    mostrarToast(
      vueltoGs > 0
        ? `✔ Cobrado — Vuelto: Gs ${vueltoGs.toLocaleString("es-PY")}`
        : "✔ Cobrado correctamente",
      "success"
    );

    setTimeout(() => {
      const ventaId = ventaActual.id;
      if (window.opener && !window.opener.closed && typeof window.opener.postCobroDesdeCaja === "function") {
        window.opener.postCobroDesdeCaja(ventaId);
        window.close();
        return;
      }
      const urlParams = new URLSearchParams(window.location.search);
      const from = String(urlParams.get("from") || "").toLowerCase();
      const vid  = String(ventaId).split(",")[0] || "";
      if (from === "venta_medio" && vid) {
        window.location.href = `/modulos/venta/venta_medio.html?post_cobro=1&venta_id=${encodeURIComponent(vid)}`;
      } else if (from === "venta" && vid) {
        window.location.href = `/modulos/venta/venta_rapida.html?post_cobro=1&venta_id=${encodeURIComponent(vid)}`;
      } else {
        window.close();
      }
    }, 1800);

  } catch (_) {
    mostrarToast("Error de conexión", "error");
  } finally {
    mostrarSpinner(false);
    cobrando = false;
    if (btn) btn.disabled = false;
  }
}

/* === SPINNER === */
function mostrarSpinner(show, texto = "Procesando...") {
  const el = document.getElementById("spinnerOverlay");
  const tx = document.getElementById("spinnerTexto");
  if (!el) return;
  el.classList.toggle("hidden", !show);
  if (tx) tx.textContent = texto;
}

/* === TOAST === */
function mostrarToast(msg, tipo = "info") {
  const cont = document.getElementById("toastContainer");
  if (!cont) return;
  const div = document.createElement("div");
  div.className = `toast-item ${tipo}`;
  div.textContent = msg;
  cont.appendChild(div);
  setTimeout(() => {
    div.classList.add("toast-out");
    setTimeout(() => div.remove(), 250);
  }, 3200);
}
