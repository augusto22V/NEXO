/* === STATE === */
let ventaActual = null;
let cotizacion = { brl: 0, usd: 0 };
let pagos = [];
let clienteActual = null;
let permisos = {};
let cobrando = false;

const PERMISOS_DEFAULT = Object.freeze({ venta_rapida_efectivizar: true });

/* === FORMATO / UTILIDADES === */
function fmtGs(n) {
  return Math.round(Number(n) || 0).toLocaleString("es-PY");
}

function fmtDecimal(n, maxDec = 2) {
  const num = Number(n) || 0;
  const fixed = num.toFixed(maxDec);
  return fixed.replace(/\.0+$/, "").replace(/,0+$/, "").replace(".", ",");
}

// Convierte el texto que el usuario teclea a un numero (ignora puntos/guias de miles)
function parseMontoTexto(txt) {
  if (txt == null) return 0;
  const limpio = String(txt).replace(/[^\d.,-]/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number(limpio);
  return Number.isFinite(n) ? n : 0;
}

// Parsea montos decimales (BRL/USD) tolerando coma o punto como separador decimal
function parseMontoTextoDecimal(txt) {
  if (txt == null) return 0;
  let limpio = String(txt).replace(/[^\d.,-]/g, "");
  // Si hay coma y punto: el ultimo es el separador decimal, el resto son miles
  if (limpio.includes(",") && limpio.includes(".")) {
    if (limpio.lastIndexOf(",") > limpio.lastIndexOf(".")) {
      limpio = limpio.replace(/\./g, "").replace(",", ".");
    } else {
      limpio = limpio.replace(/,/g, "");
    }
  } else if (limpio.includes(",")) {
    limpio = limpio.replace(",", ".");
  }
  const n = Number(limpio);
  return Number.isFinite(n) ? n : 0;
}

// Sufijo/etiqueta visible segun la moneda seleccionada
function simbMoneda(moneda) {
  if (moneda === "BRL") return "R$";
  if (moneda === "USD") return "US$";
  return "Gs";
}

// Actualiza la etiqueta de moneda pegada al input
function actualizarEtiquetaMoneda() {
  const moneda = document.getElementById("monedaSel")?.value || "PYG";
  const label = document.getElementById("montoMonedaLabel");
  if (label) label.textContent = simbMoneda(moneda);
}

// Aplica separador de miles en vivo mientras se escribe, segun la moneda.
// Gs -> enteros con separador de miles; BRL/USD -> decimales con coma.
function formatearInputMonto(el) {
  if (!el) return;
  const moneda = document.getElementById("monedaSel")?.value || "PYG";
  const raw = el.value;

  // Guardar posicion del cursor para no perderla al reformatear
  const cursor = (el.selectionStart != null) ? el.selectionStart : raw.length;

  let nuevo = raw;
  if (moneda === "PYG") {
    const n = parseMontoTexto(raw);
    nuevo = n === 0 ? "" : fmtGs(Math.trunc(n));
  } else {
    // BRL/USD: format con separador de miles y coma decimal (6 decimales tecleados)
    const num = parseMontoTextoDecimal(raw);
    nuevo = num === 0 ? "" : num.toLocaleString("es-PY", { maximumFractionDigits: 6 }).replace(/\./g, ",");
  }

  if (nuevo !== raw) {
    el.value = nuevo;
    // Reubicar cursor al final (lo mas simple y predecible para montos)
    const pos = el.value.length;
    if (el.setSelectionRange) {
      try { el.setSelectionRange(pos, pos); } catch (_) {}
    }
  }
}

/* === INIT === */
document.addEventListener("DOMContentLoaded", async () => {
  centrarVentana();
  await cargarPermisos();
  await cargarCotizacion();
  await cargarVentaDesdeURL();
  setClienteOcasional();   // siempre arranca con Ocasional por defecto
  actualizarHora();
  setInterval(actualizarHora, 1000);

  // Cuando cambia el método de pago, ajusta dinámicamente las monedas válidas
  document.getElementById("metodoPagoSel")?.addEventListener("change", () => {
    aplicarMonedasSegunMetodo();
    document.getElementById("montoInput")?.focus();
  });
  document.getElementById("monedaSel")?.addEventListener("change", () => {
    actualizarEtiquetaMoneda();
    const mi = document.getElementById("montoInput");
    if (mi) {
      mi.value = "";
      mi.focus();
    }
  });
  aplicarMonedasSegunMetodo();
  actualizarEtiquetaMoneda();

  // Enfocar el monto al arrancar para cobrar directo con teclado
  setTimeout(() => document.getElementById("montoInput")?.focus(), 250);
});

/* === MONEDA SEGÚN MÉTODO === */
// TARJETA y TRANSFERENCIA solo aceptan PYG → bloqueamos BRL/USD en el selector
function aplicarMonedasSegunMetodo() {
  const metodoSel = document.getElementById("metodoPagoSel");
  const monedaSel = document.getElementById("monedaSel");
  if (!metodoSel || !monedaSel) return;

  const soloPYG = metodoSel.value === "TARJETA" || metodoSel.value === "TRANSFERENCIA";

  Array.from(monedaSel.options).forEach((opt) => {
    if (opt.value === "BRL" || opt.value === "USD") {
      opt.disabled = soloPYG;
      opt.hidden   = soloPYG;
    }
  });

  if (soloPYG) {
    monedaSel.value = "PYG";
    monedaSel.classList.add("moneda-bloqueada");
    monedaSel.title = `${metodoSel.value} solo acepta PYG`;
  } else {
    monedaSel.classList.remove("moneda-bloqueada");
    monedaSel.title = "";
  }

  actualizarEtiquetaMoneda();
}

/* === CENTRAR VENTANA === */
function centrarVentana() {
  try {
    const w = Math.min(screen.availWidth,  960);
    const h = Math.min(screen.availHeight, 680);

    // Forzamos el tamaño antes de centrar para que el calculo de posicion sea correcto
    window.resizeTo(w, h);

    // Intentamos centrar hasta que la ventana quede en su lugar
    // (los popups pueden tardar en aplicar moveTo; reintentamos un par de veces)
    const left = Math.round((screen.availWidth  - w) / 2);
    const top  = Math.round((screen.availHeight - h) / 2);

    const intentarCentrar = (intento = 0) => {
      try {
        window.moveTo(left, top);
        window.moveTo(left, top);
        if (intento < 8) setTimeout(() => window.moveTo(left, top), 40 * (intento + 1));
      } catch (_) {}
    };

    intentarCentrar(0);
    setTimeout(() => intentarCentrar(2), 120);
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
    const brlStr  = cotizacion.brl > 0 ? "R$ " + fmtDecimal(gs / cotizacion.brl) : "—";
    const usdStr  = cotizacion.usd > 0 ? "US$ " + fmtDecimal(gs / cotizacion.usd) : "—";
    const qty     = fmtCantidad(item.cantidad);

    return `<div class="item-card">
      <div class="item-nombre"><span class="item-qty">${qty}×</span> ${nombre}</div>
      <div class="item-montos">
        <span class="item-moneda-row"><span class="item-flag">🇵🇾</span>${fmtGs(gs)} Gs</span>
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
  setEl("totalHeaderGs",  fmtGs(totalGs) + " Gs");
  setEl("totalHeaderBrl", fmtDecimal(cotizacion.brl > 0 ? totalGs / cotizacion.brl : 0));
  setEl("totalHeaderUsd", fmtDecimal(cotizacion.usd > 0 ? totalGs / cotizacion.usd : 0));

  // Fila "A pagar"
  setEl("aPagarGs",  fmtGs(pendienteGs) + " Gs");
  setEl("aPagarBrl", fmtDecimal(cotizacion.brl > 0 && pendienteGs > 0 ? pendienteGs / cotizacion.brl : 0));
  setEl("aPagarUsd", fmtDecimal(cotizacion.usd > 0 && pendienteGs > 0 ? pendienteGs / cotizacion.usd : 0));

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
  const monto  = moneda === "PYG"
    ? parseMontoTexto(document.getElementById("montoInput")?.value)
    : parseMontoTextoDecimal(document.getElementById("montoInput")?.value);

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
      const vGs  = fmtGs(vueltoGs) + " Gs";
      const vBrl = cotizacion.brl > 0 ? "R$ " + fmtDecimal(vueltoGs / cotizacion.brl) : null;
      const vUsd = cotizacion.usd > 0 ? "US$ " + fmtDecimal(vueltoGs / cotizacion.usd) : null;
      vueltoStr = `<div class="vuelto-multi">
        <span class="vm-row"><span class="vm-flag">🇵🇾</span>${vGs}</span>
        ${vBrl ? `<span class="vm-row"><span class="vm-flag">🇧🇷</span>${vBrl}</span>` : ""}
        ${vUsd ? `<span class="vm-row"><span class="vm-flag">🇺🇸</span>${vUsd}</span>` : ""}
      </div>`;
    }

    const montoFmt = p.moneda === "PYG"
      ? fmtGs(p.monto) + " Gs"
      : (p.moneda === "BRL" ? "R$ " : "US$ ") + fmtDecimal(p.monto);

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

/* Establece el cliente ocasional (ID 1) como seleccionado por defecto */
function setClienteOcasional() {
  clienteActual = { id: 1, nombre: "Ocasional" };
  const rucEl    = document.getElementById("rucInput");
  const nombreEl = document.getElementById("clienteNombre");
  if (rucEl)    rucEl.value    = "";
  if (nombreEl) nombreEl.value = "Ocasional";
}

/* × → vuelve a Ocasional en vez de dejar vacío */
function limpiarCliente() {
  setClienteOcasional();
}

/* === EFECTIVIZAR === */
async function efectivizar(imprimirTicket = true) {
  if (!tienePermiso("venta_rapida_efectivizar")) {
    mostrarToast("Sin permiso para cobrar", "error"); return;
  }
  if (cobrando) return;
  if (!ventaActual) { mostrarToast("Sin venta cargada", "error"); return; }

  const totalGs  = Number(ventaActual.total) || 0;
  const esVentaCero = totalGs === 0;

  if (!pagos.length && !esVentaCero) { mostrarToast("Agregue al menos un pago", "error"); return; }

  // Cliente obligatorio si hay pagos por tarjeta o transferencia (para SIFEN/respaldo)
  const tienePagoElectronico = pagos.some(
    (p) => p.metodo === "TARJETA" || p.metodo === "TRANSFERENCIA"
  );
  if (tienePagoElectronico && !clienteActual) {
    mostrarToast("Cargue un cliente (RUC o cédula) — obligatorio para tarjeta/transferencia", "error");
    document.getElementById("rucInput")?.focus();
    return;
  }

  const pagadoGs = pagos.reduce((s, p) => s + p.montoGs, 0);

  if (pagadoGs < totalGs) {
    const falta = Math.round(totalGs - pagadoGs);
    mostrarToast(`Monto insuficiente — falta ${fmtGs(falta)} Gs`, "error");
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
        ? `✔ Cobrado — Vuelto: ${fmtGs(vueltoGs)} Gs`
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
