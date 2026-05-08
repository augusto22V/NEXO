/* =====================================
   gestion.js
===================================== */

const API = '/api/caja';

// Estado global
let cotizacion   = { brl: 0, usd: 0 };
let resumenActual = {};
let arqInit       = false;
let estadoCajaActual = null;
let permisos = {};
let arqueoResumenCache = null;
let manualInit = false;
let historialFormalInit = false;

const PERMISOS_CAJA_DEFAULT = Object.freeze({
  caja_apertura: true,
  caja_arqueo: true,
  caja_lanzamiento_manual: true,
  caja_conferir_cierre: true,
  caja_cerrar: true,
  caja_imprimir_cierre: true,
  caja_consultas: true,
  caja_informes: true
});

function getUsuarioLogueado() {
  try {
    const raw = localStorage.getItem('usuario');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function toNumber(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function tienePermisoCaja(key) {
  if (!key) return false;
  const fromMap = permisos?.permisos_venta_rapida?.[key];
  if (typeof fromMap === "boolean") return fromMap;
  const fromRoot = permisos?.[key];
  if (typeof fromRoot === "boolean") return fromRoot;
  return Boolean(PERMISOS_CAJA_DEFAULT[key]);
}

function normalizarNaturaleza(v) {
  const txt = String(v || "").trim().toUpperCase();
  if (txt === "SALIDA" || txt === "EGRESO") return "SALIDA";
  return "ENTRADA";
}

function normalizarMonedaId(v) {
  const txt = String(v ?? "").trim().toUpperCase();
  if (txt === "2" || txt === "BRL" || txt === "R$" || txt === "REAL") return 2;
  if (txt === "3" || txt === "USD" || txt === "US$" || txt === "DOLAR") return 3;
  return 1;
}


function formatearFechaPY(fecha) {
  if (!fecha) return '-';

  //  FORZAR UTC
  let f = new Date(fecha);

  // Si viene sin Z â†’ lo forzamos
  if (typeof fecha === 'string' && !fecha.includes('Z')) {
    f = new Date(fecha + 'Z');
  }

  return f.toLocaleString('es-PY', {
    timeZone: 'America/Asuncion',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
}

// Denominaciones por moneda
const DENS_GS  = [100000, 50000, 20000, 10000, 5000, 2000, 1000, 500, 100, 50];
const DENS_BRL = [200, 100, 50, 20, 10, 5, 2, 1, 0.50, 0.25, 0.10, 0.05];
const DENS_USD = [100, 50, 20, 10, 5, 1, 0.50, 0.25, 0.10, 0.05, 0.01];

/* =========================
   INIT
========================= */
document.addEventListener('DOMContentLoaded', async () => {
  actualizarReloj();
  setInterval(actualizarReloj, 1000);

  await cargarPermisos();
  aplicarPermisosCajaUI();

  await Promise.all([cargarCotizacion(), cargarEstado()]);

  const params = new URLSearchParams(window.location.search);
  const auto = String(params.get("auto") || "").trim().toLowerCase();
  if (auto === "apertura") {
    const btn = document.querySelector('.gc-tab[data-tab=\"apertura\"]');
    if (btn && !btn.classList.contains('is-hidden')) showTab('apertura', btn);
  }
});

async function cargarPermisos() {
  try {
    const res = await fetch("/api/permisos/me", {
      credentials: "include",
      cache: "no-store",
      headers: { "Cache-Control": "no-cache" }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "No se pudieron cargar permisos");
    permisos = data || {};
  } catch (error) {
    permisos = { ...PERMISOS_CAJA_DEFAULT };
    console.warn("Permisos Caja fallback:", error?.message || error);
  }
}

function aplicarPermisosCajaUI() {
  const tabs = Array.from(document.querySelectorAll(".gc-tab[data-perm]"));
  tabs.forEach((tab) => {
    const permiso = tab.dataset.perm;
    const ok = tienePermisoCaja(permiso);
    tab.classList.toggle("is-hidden", !ok);
  });

  const acciones = Array.from(document.querySelectorAll(".gc-btn[data-perm]"));
  acciones.forEach((btn) => {
    const permiso = btn.dataset.perm;
    const ok = tienePermisoCaja(permiso);
    btn.classList.toggle("is-hidden", !ok);
    btn.disabled = !ok;
  });

  const botones = {
    btnAbrirCaja: tienePermisoCaja("caja_apertura"),
    btnGuardarArqueo: tienePermisoCaja("caja_arqueo"),
    btnGuardarManual: tienePermisoCaja("caja_lanzamiento_manual"),
    btnCambiarSesion: tienePermisoCaja("caja_conferir_cierre"),
    btnConferirCierre: tienePermisoCaja("caja_conferir_cierre"),
    btnEjecutarCierre: tienePermisoCaja("caja_cerrar")
  };

  for (const [id, enabled] of Object.entries(botones)) {
    const el = document.getElementById(id);
    if (!el) continue;
    el.disabled = !enabled;
    el.classList.toggle("is-hidden", !enabled && id === "btnCambiarSesion");
  }

  const activeVisible = document.querySelector(".gc-tab.active:not(.is-hidden)");
  if (activeVisible) return;

  const firstVisible = document.querySelector(".gc-tab:not(.is-hidden)");
  if (!firstVisible) {
    mostrarToast("No tiene permisos para operar Caja.", "error");
    return;
  }
  showTab(firstVisible.dataset.tab, firstVisible);
}

/* =========================
   RELOJ
========================= */
function actualizarReloj() {
  const el = document.getElementById('reloj');
  if (el) {
    el.textContent = new Date().toLocaleTimeString('es-PY', {
      timeZone: 'America/Asuncion',
      hour12: false
    });
  }
}

/* =========================
   TABS
========================= */
function showTab(tab, el) {
  const btn = el || document.querySelector(`.gc-tab[data-tab="${tab}"]`);
  if (!btn) return;
  if (btn.classList.contains("is-hidden")) return;

  const permiso = btn.dataset.perm;
  if (permiso && !tienePermisoCaja(permiso)) {
    mostrarToast("Sin permiso para abrir esta seccion", "error");
    return;
  }

  document.querySelectorAll('.gc-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.gc-panel').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');

  const panel = document.getElementById('panel-' + tab);
  if (!panel) return;
  panel.classList.add('active');

  if (tab === 'apertura') {
    cargarCotizacion();
    cargarEstado();
  }
  if (tab === 'arqueo') {
    cargarCotizacion();
    initArqueo();
    setTimeout(() => document.getElementById("arqMontoGs")?.focus(), 40);
  }
  if (tab === 'cierre') {
    cargarCotizacion();
    cargarResumen();
    initCierreRapido();
    setTimeout(() => document.getElementById("cierreGs")?.focus(), 40);
  }
  if (tab === 'manual') {
    initManual();
    setTimeout(() => document.getElementById("manualValor")?.focus(), 40);
  }
  if (tab === 'historial') {
    setUltimos7Dias();
    cargarHistorial();
  }
  if (tab === 'lanzamiento-historial') {
    initHistorialFormal();
  }
}

function showMoneda(m, el) {
  document.querySelectorAll('.mtab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.moneda-panel').forEach(p => p.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('mp-' + m).classList.add('active');
}

/* =========================
   TOAST
========================= */
function mostrarToast(mensaje, tipo = 'success') {
  const cont = document.getElementById('toastContainer');
  const t = document.createElement('div');
  t.className = 'toast-item ' + tipo;
  t.textContent = mensaje;
  cont.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

/* =========================
   MODAL
========================= */
function cerrarModal() {
  document.getElementById('modalCierre').classList.remove('open');
}

/* =========================
   UTILS FORMATO
========================= */
function fGs(n)  { return 'Gs '  + Number(n || 0).toLocaleString('es-PY'); }
function fBrl(n) { return 'R$ '  + Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fUsd(n) { return 'US$ ' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

function setBadge(estado) {
  const b = document.getElementById('estadoBadge');
  if (!b) return;
  b.className = 'estado-badge';
  if (estado === 'ABIERTA') { b.classList.add('badge-abierta'); b.textContent = 'CAJA ABIERTA'; }
  else if (estado === 'CERRADA') { b.classList.add('badge-cerrada'); b.textContent = 'CAJA CERRADA'; }
  else { b.classList.add('badge-sin'); b.textContent = 'SIN CAJA'; }
}

function statBox(label, val, cls) {
  return `<div class="gc-stat">
    <div class="gc-stat-label">${label}</div>
    <div class="gc-stat-val ${cls}">${val}</div>
  </div>`;
}

function setDif(boxId, valId, txtId, n, fmt) {
  const box = document.getElementById(boxId);
  const val = document.getElementById(valId);
  if (!box || !val) return;
  val.textContent = fmt(n);
  val.className   = 'dif-val ' + (n > 0 ? 'pos' : n < 0 ? 'neg' : '');
  box.classList.toggle('neg', n < 0);
  if (txtId) {
    const txt = document.getElementById(txtId);
    if (txt) txt.textContent = n === 0 ? 'âœ“ Exacto' : n > 0 ? 'Sobrante' : 'Faltante';
  }
}

/* =========================
   API HELPERS
========================= */
async function apiGet(url) {
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(await r.text());
    return await r.json();
  } catch (e) {
    mostrarToast(e.message || 'Error de conexiÃ³n', 'error');
    return null;
  }
}

async function apiPost(url, body) {
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'Error');
    return d;
  } catch (e) {
    mostrarToast(e.message || 'Error', 'error');
    return null;
  }
}

/* =========================
   COTIZACION - desde BD
========================= */
async function cargarCotizacion() {
  const d = await apiGet('/api/cotizacion/hoy');
  if (!d) return;

  cotizacion.brl = Number(d.brl) || 0;
  cotizacion.usd = Number(d.usd) || 0;

  const brlTxt = `1 R$ = ${fGs(cotizacion.brl)}`;
  const usdTxt = `1 US$ = ${fGs(cotizacion.usd)}`;

  ['cotBarBrl', 'arqCotBrl', 'cierreCotBrl'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = brlTxt;
  });
  ['cotBarUsd', 'arqCotUsd', 'cierreCotUsd'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = usdTxt;
  });
}

/* =========================
   ESTADO DE CAJA
========================= */
async function cargarEstado() {
  const d = await apiGet(`${API}/estado`);
  if (!d) return;

  estadoCajaActual = d;
  setCajaAuditId(d.caja?.id);

  setBadge(d.estado);
  renderSesionActiva(d);

  const formApertura = document.getElementById('formApertura');
  const avisoAbierta = document.getElementById('avisoAbierta');
  const statsApertura = document.getElementById('statsApertura');

  if (!formApertura || !avisoAbierta || !statsApertura) return;

  if (d.estado === 'ABIERTA' && d.caja) {
    formApertura.style.display = 'none';
    avisoAbierta.style.display = 'block';
    statsApertura.style.display = 'grid';

    const c = d.caja;
    const inicialGs = toNumber(c.monto_inicial, 0);
    const inicialBrl = toNumber(c.monto_inicial_real, 0);
    const inicialUsd = toNumber(c.monto_inicial_dolar, 0);

    statsApertura.innerHTML =
      statBox('Apertura', formatearFechaPY(c.fecha_apertura), '') +
      statBox('Inicial Gs', fGs(inicialGs), 'c-gs') +
      statBox('Inicial R$', fBrl(inicialBrl), 'c-brl') +
      statBox('Inicial US$', fUsd(inicialUsd), 'c-usd');
  } else {
    formApertura.style.display = 'block';
    avisoAbierta.style.display = 'none';
    statsApertura.style.display = 'none';
    statsApertura.innerHTML = '';
  }
}

function renderSesionActiva(data) {
  const card = document.getElementById('sesionActualCard');
  if (!card) return;

  if (!data || data.estado !== 'ABIERTA' || !data.caja) {
    card.style.display = 'none';
    return;
  }

  const sesion = data.sesion || data.sesion_actual || null;
  card.style.display = 'block';

  document.getElementById('sesionUsuario').textContent =
    sesion?.usuario_nombre ||
    sesion?.usuario_apertura_nombre ||
    (sesion?.usuario_apertura ? `#${sesion.usuario_apertura}` : 'Sin asignar');

  document.getElementById('sesionApertura').textContent =
    sesion?.fecha_apertura ? formatearFechaPY(sesion.fecha_apertura) : '-';

  const terminalTxt =
    data?.caja?.terminal_nombre ||
    data?.sesion?.terminal_nombre ||
    data?.terminal_nombre ||
    (data?.terminal_id ? `#${data.terminal_id}` : (data?.caja?.terminal_id ? `#${data.caja.terminal_id}` : 'Sin terminal'));

  document.getElementById('sesionTerminal').textContent = terminalTxt;
}

async function abrirCaja() {
  if (!tienePermisoCaja('caja_apertura')) {
    mostrarToast('Sin permiso para apertura de caja', 'error');
    return;
  }

  const r = await apiPost(`${API}/abrir`, {
    monto_inicial:       parseFloat(document.getElementById('iniGs').value)  || 0,
    monto_inicial_real:  parseFloat(document.getElementById('iniBrl').value) || 0,
    monto_inicial_dolar: parseFloat(document.getElementById('iniUsd').value) || 0,
    observacion:         document.getElementById('obsApertura').value
  });

  if (!r) return;
  setCajaAuditId(r?.caja?.id);

  mostrarToast('Caja abierta correctamente âœ“', 'success');
  setBadge('ABIERTA');
  await cargarEstado();

  //  PRIORIDAD 1: continuar cobro automÃ¡tico
  const ventaId = localStorage.getItem("ventaPendienteCobro");

  if (ventaId) {
    localStorage.removeItem("ventaPendienteCobro");

    window.location.href = `/modulos/caja/caja.html?venta_id=${ventaId}`;
    return;
  }

  //  PRIORIDAD 2: fallback (volver a venta normal)
  if (localStorage.getItem("volverAVenta")) {
    localStorage.removeItem("volverAVenta");

    window.location.href = "/modulos/venta/venta_rapida.html?rapida=true";
    return;
  }

}

async function cambiarSesionActual() {
  if (!tienePermisoCaja('caja_conferir_cierre')) {
    mostrarToast('Sin permiso para cambiar sesion de caja', 'error');
    return;
  }

  if (!estadoCajaActual || estadoCajaActual.estado !== 'ABIERTA') {
    mostrarToast('No hay caja abierta', 'warning');
    return;
  }

  const usuario = getUsuarioLogueado();
  const usuarioId = Number(usuario?.id || 0);

  if (!usuarioId) {
    mostrarToast('No se pudo identificar el usuario actual', 'error');
    return;
  }

  const r = await apiPost(`${API}/cambiar-sesion`, {
    usuario_id: usuarioId,
    observacion: 'Cambio manual desde gestion de caja'
  });

  if (!r) return;

  mostrarToast('Sesion cambiada correctamente', 'success');
  await cargarEstado();
  if (document.getElementById('panel-cierre')?.classList.contains('active')) {
    await cargarResumen();
  }
}

/* =========================
   ARQUEO
========================= */
function initArqueo() {
  cargarResumenArqueo();
}

async function cargarResumenArqueo() {
  const data = await apiGet(`${API}/resumen`);
  if (!data) return;

  arqueoResumenCache = data;
  const esperadoGs = toNumber(data.monto_inicial) + toNumber(data.efectivo);
  const esperadoBrl = toNumber(data.monto_inicial_real) + toNumber(data.efectivo_real);
  const esperadoUsd = toNumber(data.monto_inicial_dolar) + toNumber(data.efectivo_dolar);

  document.getElementById('arqueoStats').innerHTML =
    statBox('Esperado Gs', fGs(esperadoGs), 'c-gs') +
    statBox('Esperado R$', fBrl(esperadoBrl), 'c-brl') +
    statBox('Esperado US$', fUsd(esperadoUsd), 'c-usd') +
    statBox('Tarjeta', fGs(data.tarjeta || 0), '') +
    statBox('Transferencia', fGs(data.transferencia || 0), '') +
    statBox('PIX', fGs(data.pix || 0), '') +
    statBox('Cant. ventas', data.cant_ventas || 0, '');
}

function getArqueoContado() {
  return {
    gs: toNumber(document.getElementById('arqMontoGs')?.value, 0),
    brl: toNumber(document.getElementById('arqMontoBrl')?.value, 0),
    usd: toNumber(document.getElementById('arqMontoUsd')?.value, 0),
    tarjeta: toNumber(document.getElementById('arqMontoTarjeta')?.value, 0),
    transferencia: toNumber(document.getElementById('arqMontoTransferencia')?.value, 0),
    pix: toNumber(document.getElementById('arqMontoPix')?.value, 0)
  };
}

function calcularArqueo() {
  if (!arqueoResumenCache) return;

  const esperado = {
    gs: toNumber(arqueoResumenCache.monto_inicial) + toNumber(arqueoResumenCache.efectivo),
    brl: toNumber(arqueoResumenCache.monto_inicial_real) + toNumber(arqueoResumenCache.efectivo_real),
    usd: toNumber(arqueoResumenCache.monto_inicial_dolar) + toNumber(arqueoResumenCache.efectivo_dolar),
    tarjeta: toNumber(arqueoResumenCache.tarjeta),
    transferencia: toNumber(arqueoResumenCache.transferencia),
    pix: toNumber(arqueoResumenCache.pix)
  };
  const contado = getArqueoContado();

  document.getElementById('arqTbody').innerHTML = `
    <tr><td>Efectivo Gs</td><td>${fGs(esperado.gs)}</td><td>${fGs(contado.gs)}</td><td>${fGs(contado.gs - esperado.gs)}</td></tr>
    <tr><td>Efectivo R$</td><td>${fBrl(esperado.brl)}</td><td>${fBrl(contado.brl)}</td><td>${fBrl(contado.brl - esperado.brl)}</td></tr>
    <tr><td>Efectivo US$</td><td>${fUsd(esperado.usd)}</td><td>${fUsd(contado.usd)}</td><td>${fUsd(contado.usd - esperado.usd)}</td></tr>
    <tr><td>Tarjeta</td><td>${fGs(esperado.tarjeta)}</td><td>${fGs(contado.tarjeta)}</td><td>${fGs(contado.tarjeta - esperado.tarjeta)}</td></tr>
    <tr><td>Transferencia</td><td>${fGs(esperado.transferencia)}</td><td>${fGs(contado.transferencia)}</td><td>${fGs(contado.transferencia - esperado.transferencia)}</td></tr>
    <tr><td>PIX</td><td>${fGs(esperado.pix)}</td><td>${fGs(contado.pix)}</td><td>${fGs(contado.pix - esperado.pix)}</td></tr>`;

  setDif('difBoxGs', 'difGsVal', 'difGsTxt', contado.gs - esperado.gs, fGs);
  setDif('difBoxBrl', 'difBrlVal', 'difBrlTxt', contado.brl - esperado.brl, fBrl);
  setDif('difBoxUsd', 'difUsdVal', 'difUsdTxt', contado.usd - esperado.usd, fUsd);
  document.getElementById('arqueoResultado').style.display = 'block';
}

function limpiarArqueo() {
  [
    'arqMontoGs',
    'arqMontoBrl',
    'arqMontoUsd',
    'arqMontoTarjeta',
    'arqMontoTransferencia',
    'arqMontoPix',
    'obsArqueo'
  ].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('arqueoResultado').style.display = 'none';
  cargarResumenArqueo();
}

async function guardarArqueo() {
  if (!tienePermisoCaja('caja_arqueo')) {
    mostrarToast('Sin permiso para guardar arqueo', 'error');
    return;
  }

  const contado = getArqueoContado();
  const payload = {
    contado_gs: contado.gs,
    contado_brl: contado.brl,
    contado_usd: contado.usd,
    contado_tarjeta: contado.tarjeta,
    contado_transferencia: contado.transferencia,
    contado_pix: contado.pix,
    observacion: document.getElementById('obsArqueo')?.value || ''
  };

  const r = await apiPost(`${API}/arqueo`, payload);
  if (!r) return;

  mostrarToast('Arqueo guardado correctamente', 'success');
  await cargarResumenArqueo();
  calcularArqueo();
}

/* =========================
   CIERRE
========================= */
async function cargarResumen() {
  const data = await apiGet(`${API}/resumen`);
  if (!data) {
    setCajaAuditId(null);
    document.getElementById('statsCierre').innerHTML =
      '<div class="gc-loading">No hay caja abierta</div>';
    return;
  }

  setCajaAuditId(data.caja_id);
  resumenActual = data;

  if (data.cotizacion_brl) cotizacion.brl = Number(data.cotizacion_brl);
  if (data.cotizacion_usd) cotizacion.usd = Number(data.cotizacion_usd);
  const esperadoGs = toNumber(data.monto_inicial) + toNumber(data.efectivo);
  const esperadoBrl = toNumber(data.monto_inicial_real) + toNumber(data.efectivo_real);
  const esperadoUsd = toNumber(data.monto_inicial_dolar) + toNumber(data.efectivo_dolar);

  document.getElementById('statsCierre').innerHTML =
    statBox('Esperado Gs',     fGs(esperadoGs),                 'c-gs')  +
    statBox('Esperado R$',     fBrl(esperadoBrl),               'c-brl') +
    statBox('Esperado US$',    fUsd(esperadoUsd),               'c-usd') +
    statBox('Tarjeta',         fGs(data.tarjeta),               '')      +
    statBox('Transferencia',   fGs(data.transferencia),         '')      +
    statBox('PIX',             fGs(data.pix),                   '')      +
    statBox('Cant. ventas',    data.cant_ventas || 0,           '');
}

function recalcDif() {
  const contGs  = parseFloat(document.getElementById('cierreGs').value)  || 0;
  const contBrl = parseFloat(document.getElementById('cierreBrl').value) || 0;
  const contUsd = parseFloat(document.getElementById('cierreUsd').value) || 0;

  const espGs  = parseFloat(resumenActual.monto_inicial || 0) + parseFloat(resumenActual.efectivo || 0);
  const espBrl = parseFloat(resumenActual.monto_inicial_real || 0) + parseFloat(resumenActual.efectivo_real  || 0);
  const espUsd = parseFloat(resumenActual.monto_inicial_dolar || 0) + parseFloat(resumenActual.efectivo_dolar || 0);

  document.getElementById('difCierreRow').style.display = 'grid';
  setDif('dcBoxGs',  'dcGsVal',  null, contGs  - espGs,  fGs);
  setDif('dcBoxBrl', 'dcBrlVal', null, contBrl - espBrl, fBrl);
  setDif('dcBoxUsd', 'dcUsdVal', null, contUsd - espUsd, fUsd);
}

function confirmarCierre() {
  if (!tienePermisoCaja('caja_conferir_cierre')) {
    mostrarToast('Sin permiso para conferir cierre', 'error');
    return;
  }

  const cGs  = parseFloat(document.getElementById('cierreGs').value)  || 0;
  const cBrl = parseFloat(document.getElementById('cierreBrl').value) || 0;
  const cUsd = parseFloat(document.getElementById('cierreUsd').value) || 0;
  const cTarjeta = parseFloat(document.getElementById('cierreTarjeta').value) || 0;
  const cTransferencia = parseFloat(document.getElementById('cierreTransferencia').value) || 0;
  const cPix = parseFloat(document.getElementById('cierrePix').value) || 0;

  const eGs  = parseFloat(resumenActual.monto_inicial || 0) + parseFloat(resumenActual.efectivo || 0);
  const eBrl = parseFloat(resumenActual.monto_inicial_real || 0) + parseFloat(resumenActual.efectivo_real  || 0);
  const eUsd = parseFloat(resumenActual.monto_inicial_dolar || 0) + parseFloat(resumenActual.efectivo_dolar || 0);
  const eTarjeta = parseFloat(resumenActual.tarjeta || 0);
  const eTransferencia = parseFloat(resumenActual.transferencia || 0);
  const ePix = parseFloat(resumenActual.pix || 0);

  const color = n => n >= 0 ? '#2e7d32' : '#c62828';

  document.getElementById('modalResumen').innerHTML = `
    <table class="gc-table">
      <thead>
        <tr><th>Moneda</th><th>Esperado</th><th>Contado</th><th>Diferencia</th></tr>
      </thead>
      <tbody>
        <tr>
          <td>â‚² GuaranÃ­</td><td>${fGs(eGs)}</td><td>${fGs(cGs)}</td>
          <td style="color:${color(cGs-eGs)}">${fGs(cGs - eGs)}</td>
        </tr>
        <tr>
          <td>R$ Real</td><td>${fBrl(eBrl)}</td><td>${fBrl(cBrl)}</td>
          <td style="color:${color(cBrl-eBrl)}">${fBrl(cBrl - eBrl)}</td>
        </tr>
        <tr>
          <td>US$ DÃ³lar</td><td>${fUsd(eUsd)}</td><td>${fUsd(cUsd)}</td>
          <td style="color:${color(cUsd-eUsd)}">${fUsd(cUsd - eUsd)}</td>
        </tr>
        <tr>
          <td>Tarjeta</td><td>${fGs(eTarjeta)}</td><td>${fGs(cTarjeta)}</td>
          <td style="color:${color(cTarjeta-eTarjeta)}">${fGs(cTarjeta - eTarjeta)}</td>
        </tr>
        <tr>
          <td>Transferencia</td><td>${fGs(eTransferencia)}</td><td>${fGs(cTransferencia)}</td>
          <td style="color:${color(cTransferencia-eTransferencia)}">${fGs(cTransferencia - eTransferencia)}</td>
        </tr>
        <tr>
          <td>PIX</td><td>${fGs(ePix)}</td><td>${fGs(cPix)}</td>
          <td style="color:${color(cPix-ePix)}">${fGs(cPix - ePix)}</td>
        </tr>
      </tbody>
    </table>`;

  document.getElementById('modalCierre').classList.add('open');
}

async function ejecutarCierre() {
  if (!tienePermisoCaja('caja_cerrar')) {
    mostrarToast('Sin permiso para cerrar caja', 'error');
    return;
  }

  cerrarModal();
  const r = await apiPost(`${API}/cerrar`, {
    monto_contado:       parseFloat(document.getElementById('cierreGs').value)  || 0,
    monto_contado_real:  parseFloat(document.getElementById('cierreBrl').value) || 0,
    monto_contado_dolar: parseFloat(document.getElementById('cierreUsd').value) || 0,
    monto_contado_tarjeta: parseFloat(document.getElementById('cierreTarjeta').value) || 0,
    monto_contado_transferencia: parseFloat(document.getElementById('cierreTransferencia').value) || 0,
    monto_contado_pix: parseFloat(document.getElementById('cierrePix').value) || 0,
    observacion:         document.getElementById('obsCierre').value
  });
  if (r) {
    mostrarToast('Caja cerrada correctamente âœ“', 'success');
    setBadge('CERRADA');
    setTimeout(() => cargarHistorial(), 500);
    const tabHistorial = document.querySelector('.gc-tab[data-tab=\"historial\"]');
    if (tabHistorial && !tabHistorial.classList.contains('is-hidden')) {
      showTab('historial', tabHistorial);
    }
  }
}

/* =========================
   LANZAMIENTO MANUAL
========================= */
async function initManual() {
  if (!tienePermisoCaja('caja_lanzamiento_manual')) return;

  if (!manualInit) {
    document.getElementById('manualNaturaleza')?.addEventListener('change', onManualNaturalezaChange);
    document.getElementById('manualValor')?.addEventListener('keydown', async (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      await guardarMovimientoManual();
    });
    manualInit = true;
  }

  await Promise.all([
    cargarResumenManual(),
    cargarTiposManual(),
    cargarUltimosManual()
  ]);
}

async function cargarResumenManual() {
  const data = await apiGet(`${API}/resumen`);
  if (!data) return;

  const esperadoGs = toNumber(data.monto_inicial) + toNumber(data.efectivo);
  const esperadoBrl = toNumber(data.monto_inicial_real) + toNumber(data.efectivo_real);
  const esperadoUsd = toNumber(data.monto_inicial_dolar) + toNumber(data.efectivo_dolar);

  document.getElementById('manualResumen').innerHTML =
    statBox('Esperado Gs', fGs(esperadoGs), 'c-gs') +
    statBox('Esperado R$', fBrl(esperadoBrl), 'c-brl') +
    statBox('Esperado US$', fUsd(esperadoUsd), 'c-usd') +
    statBox('Movimientos', toNumber(data.manual_cantidad), '');
}

async function cargarTiposManual() {
  const naturaleza = normalizarNaturaleza(document.getElementById('manualNaturaleza')?.value);
  const data = await apiGet(`${API}/manual/tipos?naturaleza=${encodeURIComponent(naturaleza)}&solo_activos=1`);
  const select = document.getElementById('manualTipoSelect');
  if (!select) return;

  const lista = Array.isArray(data) ? data : [];
  select.innerHTML = '<option value=\"\">Seleccionar...</option>';
  for (const row of lista) {
    const opt = document.createElement('option');
    opt.value = String(row.id);
    opt.textContent = String(row.nombre || `Tipo ${row.id}`);
    select.appendChild(opt);
  }
}

async function onManualNaturalezaChange() {
  await cargarTiposManual();
}

function limpiarMovimientoManual() {
  ['manualTipoNuevo', 'manualValor', 'manualDocumento', 'manualObs'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const tipo = document.getElementById('manualTipoSelect');
  if (tipo) tipo.value = '';
}

function monedaManualLabel(id) {
  if (Number(id) === 2) return 'R$';
  if (Number(id) === 3) return 'US$';
  return 'Gs';
}

async function cargarUltimosManual() {
  const box = document.getElementById('manualUltimos');
  if (!box) return;
  box.innerHTML = '<div class=\"gc-loading\">Cargando...</div>';

  const data = await apiGet(`${API}/manual?limite=30`);
  const lista = Array.isArray(data?.movimientos) ? data.movimientos : [];
  if (!lista.length) {
    box.innerHTML = '<div class=\"gc-loading\">Sin movimientos manuales.</div>';
    return;
  }

  box.innerHTML = `
    <table class=\"manual-table\">
      <thead>
        <tr>
          <th>Fecha</th>
          <th>Tipo</th>
          <th>Historial</th>
          <th>Moneda</th>
          <th>Monto</th>
          <th>Equiv. Gs</th>
          <th>Documento</th>
          <th>Observacion</th>
        </tr>
      </thead>
      <tbody>
        ${lista.map((m) => `
          <tr>
            <td>${formatearFechaPY(m.created_at)}</td>
            <td><span class=\"manual-tag ${String(m.naturaleza || '').toUpperCase() === 'SALIDA' ? 'out' : 'in'}\">${String(m.naturaleza || '').toUpperCase() === 'SALIDA' ? 'Salida' : 'Entrada'}</span></td>
            <td>${m.tipo_movimiento_nombre || '-'}</td>
            <td>${monedaManualLabel(m.moneda_id)}</td>
            <td>${Number(m.moneda_id) === 2 ? fBrl(m.monto) : Number(m.moneda_id) === 3 ? fUsd(m.monto) : fGs(m.monto)}</td>
            <td>${fGs(m.monto_gs)}</td>
            <td>${m.documento || '-'}</td>
            <td>${m.observacion || '-'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

async function guardarMovimientoManual() {
  if (!tienePermisoCaja('caja_lanzamiento_manual')) {
    mostrarToast('Sin permiso para lanzamiento manual', 'error');
    return;
  }

  const naturaleza = normalizarNaturaleza(document.getElementById('manualNaturaleza')?.value);
  const tipoMovId = Number(document.getElementById('manualTipoSelect')?.value || 0);
  const tipoMovNuevo = String(document.getElementById('manualTipoNuevo')?.value || '').trim();
  const monedaId = normalizarMonedaId(document.getElementById('manualMoneda')?.value);
  const valor = toNumber(document.getElementById('manualValor')?.value, 0);
  const documento = String(document.getElementById('manualDocumento')?.value || '').trim();
  const observacion = String(document.getElementById('manualObs')?.value || '').trim();

  if (valor <= 0) {
    mostrarToast('Ingrese un valor mayor a cero', 'warning');
    document.getElementById('manualValor')?.focus();
    return;
  }

  if (!tipoMovId && !tipoMovNuevo) {
    mostrarToast('Seleccione o escriba un tipo de movimiento', 'warning');
    document.getElementById('manualTipoNuevo')?.focus();
    return;
  }

  const payload = {
    naturaleza,
    tipo_movimiento_id: tipoMovId > 0 ? tipoMovId : null,
    tipo_movimiento_nombre: tipoMovNuevo || null,
    moneda_id: monedaId,
    monto: valor,
    documento,
    observacion
  };

  const r = await apiPost(`${API}/manual`, payload);
  if (!r) return;

  mostrarToast('Movimiento manual registrado', 'success');
  limpiarMovimientoManual();
  await Promise.all([cargarTiposManual(), cargarUltimosManual(), cargarResumenManual(), cargarResumen()]);
}

/* =========================
   HISTORIAL
========================= */

// ðŸ”¥ Setea Ãºltimos 7 dÃ­as automÃ¡ticamente
function setUltimos7Dias() {
  const hoy = new Date();
  const desde = new Date();
  desde.setDate(hoy.getDate() - 7);

  document.getElementById('histDesde').value = desde.toISOString().slice(0, 10);
  document.getElementById('histHasta').value = hoy.toISOString().slice(0, 10);
}

// ðŸ”¥ Cargar historial con filtros
async function cargarHistorial() {
  if (!tienePermisoCaja('caja_consultas')) {
    document.getElementById('tablaHistorial').innerHTML =
      '<div class="gc-loading">Sin permiso para consultar historial.</div>';
    return;
  }

  document.getElementById('tablaHistorial').innerHTML =
    '<div class="gc-loading">Cargando...</div>';

  let desde = document.getElementById('histDesde')?.value;
  let hasta = document.getElementById('histHasta')?.value;
  const estado = document.getElementById('histEstado')?.value || '';

  // ðŸ§  Si no hay fechas â†’ usar Ãºltimos 7 dÃ­as
  if (!desde || !hasta) {
    setUltimos7Dias();
    desde = document.getElementById('histDesde').value;
    hasta = document.getElementById('histHasta').value;
  }

  const data = await apiGet(
    `${API}/historial/sesiones?desde=${desde}&hasta=${hasta}&estado=${estado}`
  );

  if (!data || !data.sesiones?.length) {
    document.getElementById('tablaHistorial').innerHTML =
      '<div class="gc-loading">Sin registros de sesiones</div>';
    return;
  }

  const color = n =>
    Number(n) > 0 ? '#2e7d32' :
    Number(n) < 0 ? '#c62828' : '#9e9e9e';

  const rows = data.sesiones.map(s => `
    <tr>
      <td>${s.id}</td>
      <td>${formatearFechaPY(s.fecha_apertura)}</td>
      <td>${s.fecha_cierre ? formatearFechaPY(s.fecha_cierre) : '-'}</td>
      <td>${s.usuario_nombre || (s.usuario_apertura ? `#${s.usuario_apertura}` : '-')}</td>
      <td>${s.usuario_cierre_nombre || (s.usuario_cierre ? `#${s.usuario_cierre}` : '-')}</td>
      <td>${s.terminal_nombre || (s.terminal_id ? `#${s.terminal_id}` : '-')}</td>
      <td>${fGs(s.monto_apertura)}</td>
      <td>${fGs(s.total_ventas)}</td>
      <td style="color:${color(s.diferencia)}">${fGs(s.diferencia)}</td>
      <td style="color:${color(s.diferencia_real)}">${fBrl(s.diferencia_real)}</td>
      <td style="color:${color(s.diferencia_dolar)}">${fUsd(s.diferencia_dolar)}</td>
      <td>
        <span class="hbadge ${s.estado === 'ABIERTA' ? 'hbadge-open' : 'hbadge-close'}">
          ${s.estado}
        </span>
      </td>
    </tr>
  `).join('');

  document.getElementById('tablaHistorial').innerHTML = `
    <div style="margin-bottom:10px; font-size:12px; color:#777;">
      Mostrando desde ${desde} hasta ${hasta}
    </div>

    <table class="hist-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Apertura</th>
          <th>Cierre</th>
          <th>Apertura por</th>
          <th>Cierre por</th>
          <th>Terminal</th>
          <th>Inicial Gs</th>
          <th>Ventas</th>
          <th>Dif Gs</th>
          <th>Dif R$</th>
          <th>Dif US$</th>
          <th>Estado</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function formatDateInputLocal(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function extraerFechaHoraPY(fecha) {
  const txt = formatearFechaPY(fecha);
  if (!txt || txt === '-') return { fecha: '-', hora: '-' };
  const normalizado = txt.replace(',', ' ').replace(/\s+/g, ' ').trim();
  const partes = normalizado.split(' ');
  return {
    fecha: partes[0] || '-',
    hora: partes[1] || '-'
  };
}

function getContextoUsuarioCaja() {
  const user = getUsuarioLogueado() || {};
  return {
    empresaId: toNumber(user.empresa_id ?? user.empresaId ?? user.id_empresa, 0),
    terminalId: toNumber(user.terminal_id ?? user.terminalId ?? user.id_terminal, 0),
    usuarioId: toNumber(user.id ?? user.usuario_id ?? user.user_id, 0),
    cajaId: toNumber(estadoCajaActual?.caja?.id, 0)
  };
}

function setFiltrosHoyHistorialFormal(force = false) {
  const hoy = formatDateInputLocal(new Date());
  const contexto = getContextoUsuarioCaja();

  const setIf = (id, value) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (force || !String(el.value || '').trim()) el.value = value || '';
  };

  setIf('histFormalDesde', hoy);
  setIf('histFormalHasta', hoy);
  setIf('histFormalEmpresa', contexto.empresaId > 0 ? String(contexto.empresaId) : '');
  setIf('histFormalTerminal', contexto.terminalId > 0 ? String(contexto.terminalId) : '');
  setIf('histFormalUsuario', contexto.usuarioId > 0 ? String(contexto.usuarioId) : '');
  setIf('histFormalCaja', contexto.cajaId > 0 ? String(contexto.cajaId) : '');
}

function getFiltrosHistorialFormal() {
  return {
    fecha_desde: String(document.getElementById('histFormalDesde')?.value || '').trim(),
    fecha_hasta: String(document.getElementById('histFormalHasta')?.value || '').trim(),
    empresa: String(document.getElementById('histFormalEmpresa')?.value || '').trim(),
    terminal: String(document.getElementById('histFormalTerminal')?.value || '').trim(),
    caja: String(document.getElementById('histFormalCaja')?.value || '').trim(),
    usuario: String(document.getElementById('histFormalUsuario')?.value || '').trim(),
    operacion: String(document.getElementById('histFormalOperacion')?.value || '').trim(),
    origen: String(document.getElementById('histFormalOrigen')?.value || '').trim(),
    moneda: String(document.getElementById('histFormalMoneda')?.value || '').trim()
  };
}

function normalizarMonedaHistorial(moneda) {
  const txt = String(moneda || '').trim().toUpperCase();
  if (txt === 'R$' || txt === 'BRL' || txt === 'REAL') return 'R$';
  if (txt === 'US$' || txt === 'USD' || txt === 'DOLAR' || txt === 'DÓLAR') return 'US$';
  return 'GS';
}

function formatearMontoHistorial(moneda, monto) {
  const m = normalizarMonedaHistorial(moneda);
  if (m === 'R$') return fBrl(monto);
  if (m === 'US$') return fUsd(monto);
  return fGs(monto);
}

function badgeOperacionHistorial(operacion) {
  const op = String(operacion || '').trim().toUpperCase() || '-';
  const cls = op === 'DEBITO' ? 'hf-op-debito' : op === 'REFERENCIA' ? 'hf-op-ref' : 'hf-op-credito';
  return `<span class="hf-op ${cls}">${op}</span>`;
}

async function initHistorialFormal() {
  if (!historialFormalInit) {
    if (!estadoCajaActual) {
      const estado = await apiGet(`${API}/estado`);
      if (estado) estadoCajaActual = estado;
    }
    setFiltrosHoyHistorialFormal(true);
    historialFormalInit = true;
  }
  await cargarHistorialFormal();
}

async function cargarHistorialFormal() {
  if (!tienePermisoCaja('caja_consultas')) {
    const tabla = document.getElementById('tablaHistorialFormal');
    if (tabla) tabla.innerHTML = '<div class="gc-loading">Sin permiso para consultar historial.</div>';
    return;
  }

  const tabla = document.getElementById('tablaHistorialFormal');
  const totalesBox = document.getElementById('totalesHistorialFormal');
  if (!tabla || !totalesBox) return;

  const filtros = getFiltrosHistorialFormal();
  if (!filtros.fecha_desde || !filtros.fecha_hasta) {
    setFiltrosHoyHistorialFormal(true);
    return cargarHistorialFormal();
  }

  tabla.innerHTML = '<div class="gc-loading">Cargando...</div>';
  totalesBox.innerHTML = '';

  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filtros)) {
    if (v) params.set(k, v);
  }
  params.set('limite', '600');

  const data = await apiGet(`${API}/historial?${params.toString()}`);
  const listaRaw = Array.isArray(data?.movimientos) ? data.movimientos : [];
  const lista = listaRaw.filter((m) => Math.abs(Number(m?.monto || 0)) > 0);
  const totalesRaw = Array.isArray(data?.totales_moneda) ? data.totales_moneda : [];
  const totales = totalesRaw.filter((t) => {
    const c = Number(t?.total_credito || 0);
    const d = Number(t?.total_debito || 0);
    const s = Number(t?.saldo || 0);
    return Math.abs(c) > 0 || Math.abs(d) > 0 || Math.abs(s) > 0;
  });

  if (!lista.length) {
    tabla.innerHTML = '<div class="gc-loading">Sin movimientos con monto distinto de cero para el filtro actual.</div>';
    totalesBox.innerHTML = '';
    return;
  }

  const rows = lista.map((m) => {
    const op = String(m.operacion || '').toUpperCase();
    const fh = extraerFechaHoraPY(m.fecha);
    const descripcion = [String(m.tipo_nombre || '').trim(), String(m.observacion || '').trim()]
      .filter(Boolean)
      .join(' - ') || '-';

    return `
      <tr>
        <td>${fh.fecha}</td>
        <td>${fh.hora}</td>
        <td>${m.empresa_nombre || (m.empresa_id ? `#${m.empresa_id}` : '-')}</td>
        <td>${m.terminal_nombre || (m.terminal_id ? `#${m.terminal_id}` : '-')}</td>
        <td>${m.caja_id || '-'}</td>
        <td>${m.usuario_nombre || (m.usuario_id ? `#${m.usuario_id}` : '-')}</td>
        <td>${m.origen || '-'}</td>
        <td>${badgeOperacionHistorial(op)}</td>
        <td>${normalizarMonedaHistorial(m.moneda)}</td>
        <td>${formatearMontoHistorial(m.moneda, m.monto)}</td>
        <td>${m.documento || '-'}</td>
        <td>${descripcion}</td>
      </tr>
    `;
  }).join('');

  tabla.innerHTML = `
    <div class="hist-formal-meta">
      Registros: <strong>${lista.length}</strong>
    </div>
    <table class="hist-formal-table">
      <thead>
        <tr>
          <th>Fecha</th>
          <th>Hora</th>
          <th>Empresa</th>
          <th>Terminal</th>
          <th>Caja</th>
          <th>Usuario</th>
          <th>Origen</th>
          <th>Operacion</th>
          <th>Moneda</th>
          <th>Monto</th>
          <th>Documento</th>
          <th>Descripcion</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  if (!totales.length) {
    totalesBox.innerHTML = '<div class="gc-loading" style="padding:14px 0;">Sin totales para mostrar.</div>';
    return;
  }

  totalesBox.innerHTML = totales.map((t) => {
    const monedaT = normalizarMonedaHistorial(t.moneda);
    const credito = Number(t.total_credito || 0);
    const debito = Number(t.total_debito || 0);
    const saldo = Number(t.saldo || 0);
    return `
      <div class="hf-total-card">
        <div class="hf-total-moneda">${monedaT}</div>
        <div class="hf-total-line">Credito <strong>${formatearMontoHistorial(monedaT, credito)}</strong></div>
        <div class="hf-total-line">Debito <strong>${formatearMontoHistorial(monedaT, debito)}</strong></div>
        <div class="hf-total-line">Neto <strong class="${saldo < 0 ? 'c-neg' : ''}">${formatearMontoHistorial(monedaT, saldo)}</strong></div>
      </div>
    `;
  }).join('');
}

/* =========================
   CIERRE RÃPIDO - DENOMINACIONES
========================= */
const DENS_CIERRE_GS  = [100000, 50000, 20000, 10000, 5000, 2000, 1000, 500, 100, 50];
const DENS_CIERRE_BRL = [200, 100, 50, 20, 10, 5, 2, 1];
const DENS_CIERRE_USD = [100, 50, 20, 10, 5, 1];

let cierreRapidoInit = false;

function initCierreRapido() {
  if (cierreRapidoInit) return;
  buildDenomsCierre('cierreDenomGs',  DENS_CIERRE_GS,  'gs',  v => 'â‚² ' + v.toLocaleString('es-PY'));
  buildDenomsCierre('cierreDenomBrl', DENS_CIERRE_BRL, 'brl', v => 'R$ ' + v.toFixed(2));
  buildDenomsCierre('cierreDenomUsd', DENS_CIERRE_USD, 'usd', v => 'US$ ' + v.toFixed(2));
  cierreRapidoInit = true;
}

function buildDenomsCierre(containerId, dens, moneda, labelFn) {
  const c = document.getElementById(containerId);
  if (!c) return;
  c.innerHTML = '';
  dens.forEach(d => {
    const key = String(d).replace('.', '_');
    c.innerHTML += `
      <div class="cd-item">
        <span class="cd-lbl ${moneda === 'usd' ? 'cd-usd' : moneda === 'brl' ? 'cd-brl' : 'cd-gs'}">${labelFn(d)}</span>
        <input type="number" id="cd_${moneda}_${key}" placeholder="0" min="0"
          oninput="recalcCierreRapido()">
        <span class="cd-sub" id="cds_${moneda}_${key}">= 0</span>
      </div>`;
  });
}

function recalcCierreRapido() {
  let totalGs  = 0;
  let totalBrl = 0;
  let totalUsd = 0;

  DENS_CIERRE_GS.forEach(d => {
    const key = String(d).replace('.', '_');
    const cant = parseInt(document.getElementById(`cd_gs_${key}`)?.value || 0) || 0;
    const sub  = cant * d;
    totalGs += sub;
    const subEl = document.getElementById(`cds_gs_${key}`);
    if (subEl) subEl.textContent = '= â‚² ' + sub.toLocaleString('es-PY');
  });

  DENS_CIERRE_BRL.forEach(d => {
    const key = String(d).replace('.', '_');
    const cant = parseInt(document.getElementById(`cd_brl_${key}`)?.value || 0) || 0;
    const sub  = cant * d;
    totalBrl += sub;
    const subEl = document.getElementById(`cds_brl_${key}`);
    if (subEl) subEl.textContent = '= R$ ' + sub.toFixed(2);
  });

  DENS_CIERRE_USD.forEach(d => {
    const key = String(d).replace('.', '_');
    const cant = parseInt(document.getElementById(`cd_usd_${key}`)?.value || 0) || 0;
    const sub  = cant * d;
    totalUsd += sub;
    const subEl = document.getElementById(`cds_usd_${key}`);
    if (subEl) subEl.textContent = '= US$ ' + sub.toFixed(2);
  });

  const tGsEl  = document.getElementById('cdTotalGs');
  const tBrlEl = document.getElementById('cdTotalBrl');
  const tUsdEl = document.getElementById('cdTotalUsd');
  if (tGsEl)  tGsEl.textContent  = 'â‚² ' + totalGs.toLocaleString('es-PY');
  if (tBrlEl) tBrlEl.textContent = 'R$ ' + totalBrl.toFixed(2);
  if (tUsdEl) tUsdEl.textContent = 'US$ ' + totalUsd.toFixed(2);

  document.getElementById('cierreGs').value  = totalGs  || '';
  document.getElementById('cierreBrl').value = totalBrl || '';
  document.getElementById('cierreUsd').value = totalUsd || '';

  recalcDif();
}

function limpiarCierreRapido() {
  [
    { dens: DENS_CIERRE_GS,  m: 'gs'  },
    { dens: DENS_CIERRE_BRL, m: 'brl' },
    { dens: DENS_CIERRE_USD, m: 'usd' }
  ].forEach(({ dens, m }) => {
    dens.forEach(d => {
      const key = String(d).replace('.', '_');
      const el  = document.getElementById(`cd_${m}_${key}`);
      const sub = document.getElementById(`cds_${m}_${key}`);
      if (el)  el.value = '';
      if (sub) sub.textContent = '= 0';
    });
  });
  document.getElementById('cierreGs').value  = '';
  document.getElementById('cierreBrl').value = '';
  document.getElementById('cierreUsd').value = '';
  const tGs = document.getElementById('cdTotalGs');
  const tBrl = document.getElementById('cdTotalBrl');
  const tUsd = document.getElementById('cdTotalUsd');
  if (tGs)  tGs.textContent  = 'â‚² 0';
  if (tBrl) tBrl.textContent = 'R$ 0,00';
  if (tUsd) tUsd.textContent = 'US$ 0.00';
  recalcDif();
}

function toggleConteo() {
  const body    = document.getElementById('cdBody');
  const chevron = document.getElementById('cdChevron');
  const visible = body.style.display !== 'none';
  body.style.display    = visible ? 'none' : 'block';
  chevron.textContent   = visible ? 'â–¼' : 'â–²';
}

function switchCdMoneda(m, el) {
  document.querySelectorAll('.cd-mtab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.cd-panel').forEach(p => p.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('cdPanel-' + m).classList.add('active');
}

/* =========================
   INFORME DE CAJA
========================= */
function setHoy() {
  const hoy = new Date();
  const fecha = hoy.toISOString().slice(0, 10);
  document.getElementById('infDesde').value = fecha + 'T00:00';
  document.getElementById('infHasta').value = fecha + 'T23:59';
}

function setAyer() {
  const ayer = new Date();
  ayer.setDate(ayer.getDate() - 1);
  const fecha = ayer.toISOString().slice(0, 10);
  document.getElementById('infDesde').value = fecha + 'T00:00';
  document.getElementById('infHasta').value = fecha + 'T23:59';
}

async function cargarInforme() {
  if (!tienePermisoCaja('caja_informes')) {
    mostrarToast('Sin permiso para consultar informes', 'error');
    return;
  }

  const desde = document.getElementById('infDesde').value;
  const hasta = document.getElementById('infHasta').value;

  if (!desde || !hasta) {
    mostrarToast('SeleccionÃ¡ un perÃ­odo', 'warning');
    return;
  }

  document.getElementById('infResultado').style.display = 'none';
  document.getElementById('infVacio').style.display     = 'none';

const data = await apiGet(`${API}/informe?fecha_desde=${desde}&fecha_hasta=${hasta}`);
  if (!data) return;

  const r = data.resumen;

  const hasVentas = Number(r?.cant_ventas || 0) > 0;
  const hasManual = Number(r?.manual_cantidad || 0) > 0;

  if (!r || (!hasVentas && !hasManual)) {
    document.getElementById('infVacio').style.display = 'block';
    return;
  }

  // Resumen general
  document.getElementById('infStats').innerHTML =
    statBox('Ventas',        r.cant_ventas || 0,            '')     +
    statBox('Total Gs',      fGs(r.total_ventas),           'c-gs') +
    statBox('Efectivo Gs',   fGs(r.efectivo_gs),            'c-gs') +
    statBox('Efectivo R$',   fBrl(r.efectivo_brl || 0),     'c-brl')+
    statBox('Efectivo US$',  fUsd(r.efectivo_usd || 0),     'c-usd')+
    statBox('Tarjeta',       fGs(r.tarjeta || 0),           '')     +
    statBox('Transferencia', fGs(r.transferencia || 0),     '')     +
    statBox('PIX',           fGs(r.pix || 0),               '')     +
    statBox('Vuelto total',  fGs(r.vuelto_total || 0),      '');

  // Por forma de pago
  const pagoGrid = document.getElementById('infPagoGrid');
  pagoGrid.innerHTML = '';
  const pagos = [
    { label: 'Efectivo Gs',  val: fGs(r.efectivo_gs),          cls: 'c-gs'  },
    { label: 'Efectivo R$',  val: fBrl(r.efectivo_brl || 0),   cls: 'c-brl' },
    { label: 'Efectivo US$', val: fUsd(r.efectivo_usd || 0),   cls: 'c-usd' },
    { label: 'Tarjeta',      val: fGs(r.tarjeta || 0),         cls: ''      },
    { label: 'Transfer.',    val: fGs(r.transferencia || 0),   cls: ''      },
    { label: 'PIX',          val: fGs(r.pix || 0),             cls: ''      },
  ];
  pagos.forEach(p => {
    pagoGrid.innerHTML += `
      <div class="inf-pago-item">
        <div class="inf-pago-label">${p.label}</div>
        <div class="inf-pago-val ${p.cls}">${p.val}</div>
      </div>`;
  });

  // Sesiones
  const sesDiv = document.getElementById('infSesiones');
  if (data.sesiones?.length) {
    sesDiv.innerHTML = `
      <table class="gc-table">
        <thead>
          <tr><th>#</th><th>Apertura</th><th>Cierre</th><th>Cajero</th><th>Terminal</th><th>Estado</th><th>Diferencia Gs</th></tr>
        </thead>
        <tbody>
          ${data.sesiones.map(s => `
            <tr>
              <td>${s.id}</td>
        <td>${formatearFechaPY(s.fecha_apertura)}</td>
<td>${s.fecha_cierre ? formatearFechaPY(s.fecha_cierre) : '-'}</td>
              <td>${s.usuario_nombre || (s.usuario_apertura ? `#${s.usuario_apertura}` : '-')}</td>
              <td>${s.terminal_nombre || (s.terminal_id ? `#${s.terminal_id}` : '-')}</td>
              <td><span class="hbadge ${s.estado === 'ABIERTA' ? 'hbadge-open' : 'hbadge-close'}">${s.estado}</span></td>
              <td>${fGs(s.diferencia || 0)}</td>
            </tr>`).join('')}
        </tbody>
      </table>`;
  } else {
    sesDiv.innerHTML = '<div class="gc-loading">Sin sesiones en el perÃ­odo</div>';
  }

    // Movimientos
  const movimientosVenta = Array.isArray(data.movimientos) ? data.movimientos : [];
  const movimientosManual = Array.isArray(data.manual_movimientos) ? data.manual_movimientos : [];
  const movimientos = [
    ...movimientosVenta.map((m) => ({ ...m, _origen: 'VENTA' })),
    ...movimientosManual.map((m) => ({ ...m, _origen: 'MANUAL' }))
  ].sort((a, b) => new Date(a.fecha || a.created_at || 0) - new Date(b.fecha || b.created_at || 0));

  document.getElementById('infCantMovs').textContent = `(${movimientos.length})`;
  const movDiv = document.getElementById('infMovimientos');

  if (movimientos.length) {
    movDiv.innerHTML = `
      <table class="gc-table inf-mov-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Hora</th>
            <th>Origen</th>
            <th>Referencia</th>
            <th>Cajero</th>
            <th>Total Gs</th>
            <th>Ef. Gs</th>
            <th>Ef. R$</th>
            <th>Ef. US$</th>
            <th>Vuelto / Doc</th>
          </tr>
        </thead>
        <tbody>
          ${movimientos.map((m) => {
            const isManual = m._origen === 'MANUAL';
            const fecha = m.fecha || m.created_at;
            const hora = (formatearFechaPY(fecha).split(' ')[1] || '-');
            const referencia = isManual
              ? `${m.naturaleza || ''} - ${m.tipo_movimiento_nombre || '-'}`
              : `#${m.numero_venta || '-'}`;
            const totalGs = isManual ? toNumber(m.monto_gs, 0) : toNumber(m.total_venta, 0);
            const pagoGs = isManual
              ? (Number(m.moneda_id) === 1 ? toNumber(m.monto, 0) : 0)
              : toNumber(m.pago_efectivo, 0);
            const pagoBrl = isManual
              ? (Number(m.moneda_id) === 2 ? toNumber(m.monto, 0) : 0)
              : toNumber(m.pago_efectivo_real, 0);
            const pagoUsd = isManual
              ? (Number(m.moneda_id) === 3 ? toNumber(m.monto, 0) : 0)
              : toNumber(m.pago_efectivo_dolar, 0);
            const cajero = m.cajero_nombre || m.usuario_nombre || m.vendedor_nombre || '-';
            const vueltodoc = isManual ? (m.documento || '-') : (toNumber(m.vuelto, 0) > 0 ? fGs(m.vuelto) : '-');
            return `
              <tr>
                <td>${m.id}</td>
                <td>${hora}</td>
                <td>${isManual ? 'Manual' : 'Venta'}</td>
                <td>${referencia}</td>
                <td>${cajero}</td>
                <td>${fGs(totalGs)}</td>
                <td>${pagoGs !== 0 ? fGs(pagoGs) : '-'}</td>
                <td>${pagoBrl !== 0 ? fBrl(pagoBrl) : '-'}</td>
                <td>${pagoUsd !== 0 ? fUsd(pagoUsd) : '-'}</td>
                <td>${vueltodoc}</td>
              </tr>`;
          }).join('')}
        </tbody>
      </table>`;
  } else {
    movDiv.innerHTML = '<div class="gc-loading">Sin movimientos</div>';
  }

  document.getElementById('infResultado').style.display = 'block';
}


function imprimirInforme() {
  if (!tienePermisoCaja('caja_informes')) {
    mostrarToast('Sin permiso para imprimir informe', 'error');
    return;
  }

  const area = document.getElementById('infResultado');
  if (area.style.display === 'none') {
    mostrarToast('ConsultÃ¡ el informe primero', 'warning');
    return;
  }
  window.print();
}

function imprimirCierre(){
if (!tienePermisoCaja('caja_imprimir_cierre')) {
  mostrarToast('Sin permiso para imprimir cierre', 'error');
  return;
}

const r = resumenActual;

let ticket = `
STOP TOP
CIERRE DE CAJA

${new Date().toLocaleString("es-PY")}

-------------------------
VENTAS: ${r.cant_ventas}

TOTAL
${fGs(r.total)}

EFECTIVO
${fGs(r.efectivo)}

TARJETA
${fGs(r.tarjeta)}

TRANSFERENCIA
${fGs(r.transferencia)}

PIX
${fGs(r.pix)}

-------------------------
`;

const w = window.open("", "ticket");

w.document.write(`
<html>
<head>
<style>
body{
width:80mm;
font-family:monospace;
}
</style>
</head>
<body>
<pre>${ticket}</pre>
<script>
window.print();
window.close();
<\/script>
</body>
</html>
`);

w.document.close();

}

function setCajaAuditId(id) {
  const el = document.getElementById('cajaIdActual');
  if (!el) return;
  el.value = id ? String(id) : '';
}

