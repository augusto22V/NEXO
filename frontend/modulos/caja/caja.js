let ventaActual = null;
let metodoPago = "efectivo";
let cotizacion = {
  brl: 0,
  usd: 0
};

let permisos = {};
let cobrando = false;
const PERMISOS_VENTA_RAPIDA_DEFAULT = Object.freeze({
  venta_rapida_efectivizar: true
});


/* =========================
   INIT
========================= */

document.addEventListener("DOMContentLoaded", async () => {
  await cargarPermisos();
  await cargarCotizacion();
  await cargarVentaDesdeURL();

  activarMetodos();
  aplicarMetodoInicialDesdeURL();

  actualizarHora();
  setInterval(actualizarHora, 1000);
});

/* =========================
   METODOS
========================= */

function activarMetodos() {
  document.querySelectorAll(".metodo").forEach(btn => {
    btn.addEventListener("click", () => {

      document.querySelectorAll(".metodo")
        .forEach(b => b.classList.remove("activo"));

      btn.classList.add("activo");

      metodoPago = btn.dataset.metodo;
    });
  });
}

function seleccionarMetodoPago(metodo) {
  const value = String(metodo || "").trim().toLowerCase();
  if (!value) return false;

  const botones = Array.from(document.querySelectorAll(".metodo"));
  const target = botones.find((btn) => String(btn.dataset.metodo || "").toLowerCase() === value);
  if (!target) return false;

  botones.forEach((btn) => btn.classList.toggle("activo", btn === target));
  metodoPago = value;
  return true;
}

function aplicarMetodoInicialDesdeURL() {
  const params = new URLSearchParams(window.location.search);
  const metodo = String(params.get("metodo") || "").trim().toLowerCase();
  if (!metodo) return;

  seleccionarMetodoPago(metodo);
}


function autoCompletarPago() {

  if (!ventaActual) return;

  const total = Number(ventaActual.total);

  const inputGs = document.getElementById("pagoGs");

  inputGs.value = total;

  calcularColumnas();
}

/* =========================
   CARGAR VENTA
========================= */

async function cargarVentaDesdeURL() {

  const params = new URLSearchParams(window.location.search);

  const ventaId = params.get("venta_id");
  const ventasParam = params.get("ventas");

  let ventasIds = [];

  if (ventasParam) {
    ventasIds = ventasParam
      .split(",")
      .map((v) => Number(String(v).trim()))
      .filter((n) => Number.isInteger(n) && n > 0);
  } else if (ventaId != null && String(ventaId).trim() !== "") {
    const n = Number(String(ventaId).trim());
    if (Number.isInteger(n) && n > 0) {
      ventasIds = [n];
    }
  }

  if (ventasIds.length === 0) {
    mostrarToast("Venta no encontrada", "error");
    return;
  }

  let totalGeneral = 0;
  let todosLosItems = [];

  for (const id of ventasIds) {

    const res = await fetch(`/api/venta/${id}`, { credentials: "include" });
    const data = await res.json();

    if (!res.ok) {
      mostrarToast("Error cargando venta " + id, "error");
      continue;
    }

    totalGeneral += Number(data.total);

    (data.detalles || []).forEach(d => {
      todosLosItems.push({
        ...d,
        venta_id: id
      });
    });
  }

  // 🔥 ARMAR OBJETO GLOBAL
  ventaActual = {
    id: ventasIds.join(","), // 🔥 clave para backend después
    total: totalGeneral,
    detalles: todosLosItems
  };

  // UI
  document.getElementById("nroVenta").value =
    ventasIds.length > 1
      ? `MULTI (${ventasIds.length})`
      : ventasIds[0];

  renderProductos(todosLosItems);
  actualizarTotales();
  autoCompletarPago();
}

/* =========================
   PRODUCTOS
========================= */

function renderProductos(detalles) {

  const cont = document.getElementById("carritoBody");
  cont.innerHTML = "";

  detalles.forEach(item => {

    const div = document.createElement("div");

    div.style.cssText =
      "display:flex; justify-content:space-between; padding:4px 0; border-bottom:1px solid #eee";

    const desc = item.descripcion || "";
    div.innerHTML =
      `<span>${item.cantidad}x ${desc}</span>` +
      `<span>Gs ${Number(item.subtotal).toLocaleString("es-PY")}</span>`;

    cont.appendChild(div);
  });
}

/* =========================
   TOTALES
========================= */

function actualizarTotales() {

  const total = Number(ventaActual.total);

  document.getElementById("totalBase").innerText =
    total.toLocaleString("es-PY");

  document.getElementById("totalGs").innerText =
    total.toLocaleString("es-PY");

  document.getElementById("totalBrl").innerText =
    cotizacion.brl > 0 ? (total / cotizacion.brl).toFixed(2).replace(".", ",") : "0,00";

  document.getElementById("totalUsd").innerText =
    cotizacion.usd > 0 ? (total / cotizacion.usd).toFixed(2).replace(".", ",") : "0,00";
}

/* =========================
   CALCULAR VUELTO
========================= */

function calcularColumnas() {

  if (!ventaActual) return;

  const totalGs = ventaActual.total;

  const pagoGs  = Number(document.getElementById("pagoGs").value || 0);
  const pagoBrl = Number(document.getElementById("pagoBrl").value || 0);
  const pagoUsd = Number(document.getElementById("pagoUsd").value || 0);

  const totalPagadoGs =
    pagoGs +
    (pagoBrl * cotizacion.brl) +
    (pagoUsd * cotizacion.usd);

  const diferencia = totalPagadoGs - totalGs;

  // VUELTOS
  document.getElementById("vueltoGs").innerText =
    Math.max(diferencia, 0).toLocaleString("es-PY");

  document.getElementById("vueltoBrl").innerText =
    cotizacion.brl > 0
      ? (Math.max(diferencia, 0) / cotizacion.brl).toFixed(2)
      : 0;

  document.getElementById("vueltoUsd").innerText =
    cotizacion.usd > 0
      ? (Math.max(diferencia, 0) / cotizacion.usd).toFixed(2)
      : 0;

  // COLORES
  const columnas = document.querySelectorAll(".columna");

  columnas.forEach(c => {
    c.classList.remove("columna-ok", "columna-falta");
  });

  if (diferencia >= 0) {
    columnas.forEach(c => c.classList.add("columna-ok"));
  } else {
    columnas.forEach(c => c.classList.add("columna-falta"));
  }
}

/* =========================
   CONFIRMAR
========================= */
async function cargarPermisos() {
  const res = await fetch("/api/permisos/me", {
    credentials: "include"
  });

  const data = await res.json();

  permisos = data;
  aplicarPermisosCajaUI();

  console.log("Permisos:", permisos);
}

function tienePermisoVentaRapida(clave) {
  if (!clave) return false;

  const fromMap = permisos?.permisos_venta_rapida?.[clave];
  if (typeof fromMap === "boolean") return fromMap;

  const fromRoot = permisos?.[clave];
  if (typeof fromRoot === "boolean") return fromRoot;

  return Boolean(PERMISOS_VENTA_RAPIDA_DEFAULT[clave]);
}

function aplicarPermisosCajaUI() {
  const btn = document.querySelector(".btn-confirmar");
  if (!btn) return;

  const permitido = tienePermisoVentaRapida("venta_rapida_efectivizar");
  btn.disabled = !permitido;
  btn.style.display = permitido ? "" : "none";
}
function abrirFactura(ventaId) {
  console.log("➡ Ir a factura");

  window.location.href = `/modulos/factura/factura.html?venta_id=${ventaId}`;
}

function finalizarVenta() {
  console.log("✔ Venta finalizada");

  limpiarVenta();

  mostrarToast("Venta finalizada", "success");
}


function mostrarMensaje(msg, tipo) {
  mostrarToast(msg, tipo);
}

function mostrarToast(msg, tipo = "info") {
  if (!document.getElementById("cajaToastKeyframes")) {
    const s = document.createElement("style");
    s.id = "cajaToastKeyframes";
    s.textContent =
      "@keyframes cajaToastFadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}";
    document.head.appendChild(s);
  }
  const colores = { success: "#2e7d32", error: "#c62828", info: "#1565c0" };
  const div = document.createElement("div");
  div.textContent = msg;
  div.style.cssText = `
    position:fixed; bottom:24px; right:24px; z-index:9999;
    background:${colores[tipo] || colores.info}; color:#fff;
    padding:12px 20px; border-radius:8px; font-size:15px;
    box-shadow:0 4px 12px rgba(0,0,0,0.3); max-width:320px;
    animation: cajaToastFadeIn 0.2s ease;
  `;
  document.body.appendChild(div);
  setTimeout(() => div.remove(), 3500);
}

/* =========================
   CONFIRMAR COBRO
========================= */
async function efectivizar() {
  if (!tienePermisoVentaRapida("venta_rapida_efectivizar")) {
    mostrarToast("Sin permiso para cobrar", "error");
    return;
  }

  if (cobrando) return;
  cobrando = true;

  const btn = document.querySelector(".btn-confirmar");
  if (btn) btn.disabled = true;

  if (!ventaActual) {
    mostrarToast("No hay venta cargada", "error");
    cobrando = false;
    if (btn) btn.disabled = false;
    return;
  }

  const ventaId = ventaActual.id;

  try {
    const pagoGs = Number(document.getElementById("pagoGs")?.value || 0);
    const pagoBrl = Number(document.getElementById("pagoBrl")?.value || 0);
    const pagoUsd = Number(document.getElementById("pagoUsd")?.value || 0);

    const totalPagadoGs =
      pagoGs +
      (pagoBrl * cotizacion.brl) +
      (pagoUsd * cotizacion.usd);

    if (totalPagadoGs < ventaActual.total) {
      mostrarToast("Monto insuficiente", "error");
      return;
    }

    const res = await fetch("/api/caja/cobrar", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ventas: String(ventaActual.id)
          .split(",")
          .map(Number)
          .filter((n) => n > 0),
        metodo: metodoPagoParaApi(metodoPago),
        pago_gs: pagoGs,
        pago_brl: pagoBrl,
        pago_usd: pagoUsd,
        total_pagado_gs: totalPagadoGs
      })
    });

    let data = {};
    try {
      data = await res.json();
    } catch (_e) {
      data = {};
    }

    if (!res.ok) {
      if (data.error && String(data.error).includes("No hay caja abierta")) {
        mostrarToast("No hay caja abierta — abrí la caja primero", "error");
        localStorage.setItem("ventaPendienteCobro", String(ventaActual.id));
        setTimeout(() => {
          window.location.href = "/modulos/gestion_caja/gestion.html";
        }, 1500);
        return;
      }
      mostrarToast(data.error || "Error al cobrar", "error");
      return;
    }

    const totalVenta = Number(ventaActual.total) || 0;
    const vueltoGs = Math.max(0, totalPagadoGs - totalVenta);
    if (vueltoGs > 0) {
      mostrarToast(
        `✔ Cobrado — Vuelto: Gs ${vueltoGs.toLocaleString("es-PY")}`,
        "success"
      );
    } else {
      mostrarToast("✔ Cobrado correctamente", "success");
    }

    setTimeout(() => {
      if (
        window.opener &&
        !window.opener.closed &&
        typeof window.opener.postCobroDesdeCaja === "function"
      ) {
        window.opener.postCobroDesdeCaja(ventaId);
        window.close();
      } else {
        const params = new URLSearchParams(window.location.search);
        const from = String(params.get("from") || "").toLowerCase();
        const ventaIdRetorno = String(ventaId || "").split(",")[0] || "";

        if (from === "venta_medio" && ventaIdRetorno) {
          window.location.href =
            `/modulos/venta/venta_medio.html?post_cobro=1&venta_id=${encodeURIComponent(ventaIdRetorno)}`;
          return;
        }

        if (from === "venta" && ventaIdRetorno) {
          window.location.href =
            `/modulos/venta/venta_rapida.html?post_cobro=1&venta_id=${encodeURIComponent(ventaIdRetorno)}`;
          return;
        }

        window.close();
      }
    }, 1800);
  } catch (err) {
    mostrarToast("Error de conexión", "error");
  } finally {
    cobrando = false;
    if (btn) btn.disabled = false;
  }
}


function limpiarVenta() {

  ventaActual = null;

  document.getElementById("carritoBody").innerHTML = "";

  document.getElementById("totalBase").innerText = "0";
  document.getElementById("totalGs").innerText = "0";
  document.getElementById("totalBrl").innerText = "0";
  document.getElementById("totalUsd").innerText = "0";

  document.getElementById("pagoGs").value = "";
  document.getElementById("pagoBrl").value = "";
  document.getElementById("pagoUsd").value = "";

}

/* =========================
   OTROS
========================= */

function formatearGs(n) {
  return Number(n).toLocaleString("es-PY");
}

function metodoPagoParaApi(raw) {
  const m = String(raw || "efectivo").toLowerCase();
  if (m === "pix") return "PIX";
  if (m === "transferencia") return "TRANSFERENCIA";
  if (m === "efectivo") return "EFECTIVO";
  return "TARJETA";
}

async function cargarCotizacion() {
  try {
    const res = await fetch("/api/cotizacion/hoy", { credentials: "include" });
    const data = await res.json();

    cotizacion.brl = Number(data.brl) || 0;
    cotizacion.usd = Number(data.usd) || 0;
  } catch (_e) {
    cotizacion.brl = 0;
    cotizacion.usd = 0;
  }
}

function actualizarHora() {
  const ahora = new Date();
  document.getElementById("cajaFecha").innerText =
    ahora.toLocaleString("es-PY");
}
