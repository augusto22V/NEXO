const API = "/api/movimientos";

function $(id){
  return document.getElementById(id);
}

const movBody       = $("movBody");
const fechaDesde    = $("movFechaDesde");
const fechaHasta    = $("movFechaHasta");
const movEstado     = $("movEstado");
const movClienteCod = $("movClienteCod");
const movClienteNom = $("movClienteNom");
const detalleBody   = $("movDetalleBody");

function money(n){
  return Number(n || 0).toLocaleString("es-PY");
}

function hoyISO(){
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function getMovs(){
  try { 
    return JSON.parse(localStorage.getItem(KEY_MOVS) || "[]"); 
  } catch { 
    return []; 
  }
}

/* ============================
   BUSCADOR CLIENTE
============================ */
function abrirBuscadorCliente(){
  window.location.href = "cliente.html?mode=select&from=movimientos";
}

function aplicarClienteDesdeStorage(){
  const id = sessionStorage.getItem("venta_cliente_id");
  const nombre = sessionStorage.getItem("venta_cliente_nombre");

  if(id && nombre){
    movClienteCod.value = id;
    movClienteNom.value = nombre;

    sessionStorage.removeItem("venta_cliente_id");
    sessionStorage.removeItem("venta_cliente_nombre");
  }
}

/* ============================
   DETALLE PRODUCTOS
============================ */
function mostrarDetalle(mov){

  if(!detalleBody) return;

  if(!mov.detalle || mov.detalle.length === 0){
    detalleBody.innerHTML = `<div style="padding:10px;color:#999">Sin detalle</div>`;
    return;
  }

  let html = "";

  mov.detalle.forEach(d=>{
    const subt = Number(d.cantidad) * Number(d.precio_unit);

    html += `
      <div class="mov-row">
        <div>${d.nombre}</div>
        <div>${d.cantidad}</div>
        <div>Gs. ${money(d.precio_unit)}</div>
        <div>Gs. ${money(subt)}</div>
      </div>
    `;
  });

  detalleBody.innerHTML = html;
}

/* ============================
   SELECCIONAR MOVIMIENTO
============================ */
function seleccionarMovimiento(id){

  const list = getMovs();
  const mov = list.find(x=> x.id == id);

  if(!mov) return;

  mostrarDetalle(mov);
}

/* ============================
   RENDER
============================ */
function renderMovimientos(lista){

  if(!movBody) return;

  movBody.innerHTML = "";

  if(!lista || lista.length === 0){
    movBody.innerHTML = `
      <div style="padding:12px;color:#999">
        Sin resultados.
      </div>`;
    return;
  }

  lista.forEach(m=>{

    const row = document.createElement("div");
    row.className = "mov-row";

    const idVisual = Number(m.id);

    row.innerHTML = `
      <div>
        <input type="checkbox" onclick="seleccionarMovimiento('${m.id}')">
      </div>

      <div>${idVisual}</div>

      <div>${m.fecha}</div>

      <div title="${m.cliente?.codigo} - ${m.cliente?.nombre}">
        ${m.cliente?.codigo} - ${m.cliente?.nombre}
      </div>

      <div>${m.estado}</div>

      <div style="text-align:right;">Gs. ${money(m.total)}</div>
    `;

    //  DOBLE CLICK VUELVE A VENTA
    row.ondblclick = ()=>{
      sessionStorage.setItem("mov_seleccionado", m.id);
      window.location.href = "venta.html";
    }

    movBody.appendChild(row);
  });
}

/* ============================
   FILTRO
============================ */
function filtrarMovimientos(){

  const list = getMovs();

  const codFiltro   = movClienteCod?.value.trim() || "";
  const nomFiltro   = movClienteNom?.value.toLowerCase().trim() || "";
  const estadoFiltro = movEstado?.value || "";

  const desde = fechaDesde?.value || "";
  const hasta = fechaHasta?.value || "";

  const filtrados = list.filter(m=>{

    if(desde && m.fecha < desde) return false;
    if(hasta && m.fecha > hasta) return false;

    if(estadoFiltro && m.estado !== estadoFiltro) return false;

    // 🔥 FILTRO CODIGO PARCIAL
    if(codFiltro){
      if(!String(m.cliente?.codigo).includes(codFiltro)) return false;
    }

    // 🔥 FILTRO NOMBRE PARCIAL
    if(nomFiltro){
      const nombre = (m.cliente?.nombre || "").toLowerCase();
      if(!nombre.includes(nomFiltro)) return false;
    }

    return true;
  });

  renderMovimientos(filtrados);
}

/* ============================
   LIMPIAR
============================ */
function limpiarFiltrosMov(){

  if(fechaDesde) fechaDesde.value = hoyISO();
  if(fechaHasta) fechaHasta.value = hoyISO();
  if(movEstado) movEstado.value = "";
  if(movClienteCod) movClienteCod.value = "";
  if(movClienteNom) movClienteNom.value = "";

  const hoy = hoyISO();
  const list = getMovs().filter(m => m.fecha === hoy);

  renderMovimientos(list);
}

/* ============================
   INIT 
============================ */
document.addEventListener("DOMContentLoaded", ()=>{

  const hoy = hoyISO();

  if(fechaDesde) fechaDesde.value = hoy;
  if(fechaHasta) fechaHasta.value = hoy;

  aplicarClienteDesdeStorage();

  const list = getMovs().filter(m => m.fecha === hoy);

  renderMovimientos(list);
});
