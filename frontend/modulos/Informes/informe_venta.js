const BASE = window.location.origin;
const API  = `${BASE}/api`;



/* ================= SPINNER ================= */

function mostrarSpinner(texto="Cargando..."){
document.getElementById("spinnerTexto").textContent=texto;
document.getElementById("spinnerOverlay").classList.remove("hidden");
}


function ocultarSpinner(){
document.getElementById("spinnerOverlay").classList.add("hidden");
}



/* ================= TOAST ================= */

function toast(mensaje,tipo="info",duracion=3500){

const cfg={
success:{bg:"#2e7d32",icon:"âœ”"},
error:{bg:"#c62828",icon:"âœ–"},
warning:{bg:"#f57f17",icon:"âš "},
info:{bg:"#1565c0",icon:"â„¹"}
}[tipo]||{bg:"#1565c0",icon:"â„¹"};

const t=document.createElement("div");

t.className="toast-item";
t.style.background=cfg.bg;

t.innerHTML=`<span class="toast-icon">${cfg.icon}</span><span>${mensaje}</span>`;

document.getElementById("toastContainer").appendChild(t);

requestAnimationFrame(()=>t.classList.add("toast-visible"));

setTimeout(()=>{
t.classList.remove("toast-visible");
t.addEventListener("transitionend",()=>t.remove());
},duracion);

}

/* =======================================
FORMATEAR FECHA (SIN DESFASE)
======================================= */
function formatearFechaPY(fecha) {
  if (!fecha) return "-";

  return new Date(fecha).toLocaleString('es-PY', {
    timeZone: 'America/Asuncion',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/* ================= INIT ================= */

document.addEventListener("DOMContentLoaded",()=>{

document.getElementById("fechaGenerado").textContent=
new Date().toLocaleString("es-PY");

const hoy=new Date().toISOString().split("T")[0];

document.getElementById("filtroDesde").value=hoy;
document.getElementById("filtroHasta").value=hoy;

// Mostrar/ocultar columna de comisión según tipo de informe
document.getElementById("tipoInforme").addEventListener("change", (e) => {
  const tipo = e.target.value;
  const thComision = document.querySelector("th:nth-child(10)");
  if (tipo === "comision_vendedor") {
    thComision.style.display = "";
  } else {
    thComision.style.display = "none";
  }
});

// auto buscar
buscarVentas();

});



/* ================= BUSCAR ================= */
async function buscarVentas(){

const desde=document.getElementById("filtroDesde").value;
const hasta=document.getElementById("filtroHasta").value;
const cliente=document.getElementById("filtroCliente").value;
const producto=document.getElementById("filtroProducto").value;
const tipo = document.getElementById("tipoInforme").value;

if(!desde||!hasta){
toast("Seleccione rango de fechas","warning");
return;
}

if(desde>hasta){
toast("Fecha desde no puede ser mayor","warning");
return;
}

mostrarSpinner("Buscando ventas...");

try{

const params = new URLSearchParams();

params.append("desde", desde);
params.append("hasta", hasta);
params.append("tipo", tipo);

const thProducto = document.querySelector("th:nth-child(5)");

if(tipo==="categoria"){
  thProducto.textContent="Categoría";
}else if(tipo==="comision_vendedor"){
  thProducto.textContent="Resumen";
}else{
  thProducto.textContent="Producto";
}

if(cliente) params.append("cliente", cliente);
if(producto) params.append("producto", producto);

const res=await fetch(`${API}/venta/reporte?${params}`);

ocultarSpinner();

if(!res.ok){
toast("Error al obtener reporte","error");
return;
}

const data=await res.json();

renderTabla(data,tipo);

}catch(err){

ocultarSpinner();
console.error(err);
toast("Error de conexión","error");

}

}


/* ================= RENDER TABLA ================= */

function renderTabla(lista,tipo){

// Mostrar/ocultar columna de comisión
const thComision = document.querySelector("th:nth-child(10)");
if (tipo === "comision_vendedor") {
  thComision.style.display = "";
} else {
  thComision.style.display = "none";
}

const tabla=document.getElementById("tablaVentas");
tabla.innerHTML="";

if(!lista.length){

tabla.innerHTML=`<tr>
<td colspan="13" class="inf-cargando">No se encontraron resultados</td>
</tr>`;

document.getElementById("totalVenta").textContent="Gs 0";
document.getElementById("totalCosto").textContent="Gs 0";
document.getElementById("totalComision").textContent="Gs 0";
document.getElementById("totalGanancia").textContent="Gs 0";
document.getElementById("totalMargen").textContent="0 %";
return;

}

let total=0;
let totalVenta = 0;
let totalCosto = 0;
let totalComision = 0;

lista.forEach(v=>{

let tr=document.createElement("tr");



/* =======================================
REPORTE POR PRODUCTO
======================================= */

if(tipo==="producto"){

  const cantidad = Number(v.cantidad || 0);
  const totalItem = Number(v.total || 0);
  const comision = Number(v.comision_total || 0);

  total += totalItem;
  totalComision += comision;

  tr.innerHTML = `
  <td>-</td>
  <td>-</td>
  <td>-</td>
  <td>-</td>
  <td>${v.producto}</td>
  <td class="text-right">${cantidad.toLocaleString("es-PY")}</td>
  <td class="text-right">-</td>
  <td class="text-right">-</td>
  <td class="text-right">${totalItem.toLocaleString("es-PY")} Gs</td>
  <td class="text-right"></td>
  <td class="text-right">-</td>
  <td class="text-right">-</td>
  <td class="text-right">-</td>
  `;
}


/* =======================================
REPORTE GANANCIA
======================================= */


else if(tipo==="ganancia"){

const cantidad = Number(v.cantidad ?? 0);

const costoUnit =
(Number(v.precio_compra ?? 0)) +
(Number(v.costo_transporte ?? 0));

const precioVenta = Number(v.precio ?? 0);

const costoTotal = costoUnit * cantidad;
const ventaTotal = precioVenta * cantidad;
const comision = Number(v.comision_total || 0);

totalVenta += ventaTotal;
totalCosto += costoTotal;
totalComision += comision;

const ganancia = ventaTotal - costoTotal;

total += ganancia;

/* margen y markup correctos */

const margen =
ventaTotal > 0 ? ((ganancia / ventaTotal) * 100) : 0;

const markup =
costoTotal > 0 ? ((ganancia / costoTotal) * 100) : 0;

tr.innerHTML = `

<td>-</td>
<td>-</td>
<td>-</td>
<td>-</td>

<td>${v.producto ?? "-"}</td>

<td class="text-right">
${cantidad.toLocaleString("es-PY")}
</td>

<td class="text-right">
${costoUnit.toLocaleString("es-PY")} Gs
</td>

<td class="text-right">
${precioVenta.toLocaleString("es-PY")} Gs
</td>

<td class="text-right">
${ventaTotal.toLocaleString("es-PY")} Gs
</td>


<td class="text-right">-</td>  

<td class="text-right">
${ganancia.toLocaleString("es-PY")} Gs
</td>

<td class="text-right">
${margen.toFixed(1)} %
</td>

<td class="text-right">
${markup.toFixed(1)} %
</td>

`;

}

/* =======================================
REPORTE POR CATEGORIA
======================================= */

else if(tipo==="categoria"){

total+=Number(v.total||0);
totalComision += Number(v.comision_total || 0);

tr.innerHTML=`

<td>-</td>
<td>-</td>
<td>-</td>
<td>-</td>
<td>${v.categoria}</td>
<td class="text-right">${Number(v.cantidad).toLocaleString("es-PY")}</td>
<td class="text-right">-</td>
<td class="text-right">-</td>
<td class="text-right">Gs ${Number(v.total).toLocaleString("es-PY")}</td>

<td class="text-right">-</td>
<td class="text-right">-</td>
<td class="text-right">-</td>

`;

}

else if(tipo==="comision_vendedor"){

const ventas = Number(v.ventas || 0);
const totalVendedor = Number(v.total_ventas || 0);
const comision = Number(v.total_comision || 0);

totalVenta += totalVendedor;
totalComision += comision;

tr.innerHTML = `

<td>-</td>
<td>-</td>
<td>-</td>
<td>${v.vendedor || "-"}</td>
<td>Resumen</td>
<td class="text-right">${ventas.toLocaleString("es-PY")}</td>
<td class="text-right">-</td>
<td class="text-right">-</td>
<td class="text-right">${totalVendedor.toLocaleString("es-PY")} Gs</td>
<td class="text-right">${comision.toLocaleString("es-PY")} Gs</td>
<td class="text-right">-</td>
<td class="text-right">-</td>
<td class="text-right">-</td>

`;

}

/* =======================================
REPORTE DETALLADO
======================================= */

else{

const fechaTexto = formatearFechaPY(v.fecha);

const subtotal = Number(v.subtotal || 0);
const costo = Number(v.precio_compra || 0) + Number(v.costo_transporte || 0);
const cantidad = Number(v.cantidad || 0);

const costoTotal = costo * cantidad;
const ganancia = subtotal - costoTotal;

// ❌ NO USAR COMISION
// const comision = Number(v.comision || 0);

total += ganancia;

const margen =
subtotal > 0 ? ((ganancia / subtotal) * 100) : 0;

const markup =
costoTotal > 0 ? ((ganancia / costoTotal) * 100) : 0;

tr.innerHTML = `
<td>${fechaTexto}</td>
<td>${v.numero}</td>
<td>${v.cliente || "-"}</td>
<td>${v.vendedor || "-"}</td>
<td>${v.producto || "-"}</td>

<td class="text-right">${cantidad.toLocaleString("es-PY")}</td>

<td class="text-right">${costo.toLocaleString("es-PY")} Gs</td>
<td class="text-right">${Number(v.precio).toLocaleString("es-PY")} Gs</td>
<td class="text-right">${subtotal.toLocaleString("es-PY")} Gs</td>
<td class="text-right">-</td> 

<td class="text-right">${ganancia.toLocaleString("es-PY")} Gs</td>

<td class="text-right">${margen.toFixed(1)} %</td>
<td class="text-right">${markup.toFixed(1)} %</td>
`;

}

tabla.appendChild(tr);

});

if (tipo !== "comision_vendedor") {

  const th = document.querySelector("th:nth-child(10)");
  if (th) th.style.display = "none";

  document.querySelectorAll("#tablaVentas tr").forEach(tr => {
    const td = tr.children[9];
    if (td) td.style.display = "none";
  });

} else {

  const th = document.querySelector("th:nth-child(10)");
  if (th) th.style.display = "";

  document.querySelectorAll("#tablaVentas tr").forEach(tr => {
    const td = tr.children[9];
    if (td) td.style.display = "";
  });

}

/* =======================================
TOTALES
======================================= */

if(tipo==="producto"){

  document.getElementById("totalVenta").innerHTML =
  `<span class="moneda">${total.toLocaleString("es-PY")} Gs</span>`;

  document.getElementById("totalCosto").innerHTML =
  `<span class="moneda">0 Gs</span>`;

 const tdComisionTotal = document.getElementById("totalComision").closest("td");
tdComisionTotal.style.display = "none";

  document.getElementById("totalGanancia").innerHTML =
  `<span class="moneda">0 Gs</span>`;

  document.getElementById("totalMargen").textContent = "0 %";

}

else if(tipo==="categoria"){

  document.getElementById("totalVenta").innerHTML =
  `<span class="moneda">${total.toLocaleString("es-PY")} Gs</span>`;

  document.getElementById("totalCosto").innerHTML =
  `<span class="moneda">0 Gs</span>`;

  const tdComisionTotal = document.getElementById("totalComision").closest("td");
tdComisionTotal.style.display = "none";

  document.getElementById("totalGanancia").innerHTML =
  `<span class="moneda">0 Gs</span>`;

  document.getElementById("totalMargen").textContent = "0 %";

}

else if(tipo==="ganancia"){

  const margenTotal =
  totalVenta > 0 ? (total / totalVenta) * 100 : 0;

  document.getElementById("totalVenta").innerHTML =
  `<span class="moneda">${totalVenta.toLocaleString("es-PY")} Gs</span>`;

  document.getElementById("totalCosto").innerHTML =
  `<span class="moneda">${totalCosto.toLocaleString("es-PY")} Gs</span>`;

  const tdComisionTotal = document.getElementById("totalComision").closest("td");
tdComisionTotal.style.display = "none";

  document.getElementById("totalGanancia").innerHTML =
  `<span class="moneda">${total.toLocaleString("es-PY")} Gs</span>`;

  document.getElementById("totalMargen").textContent =
  margenTotal.toFixed(1) + " %";

}

else if(tipo==="comision_vendedor"){

  document.getElementById("totalVenta").innerHTML =
  `<span class="moneda">${totalVenta.toLocaleString("es-PY")} Gs</span>`;

  document.getElementById("totalCosto").innerHTML =
  `<span class="moneda">0 Gs</span>`;

const tdComisionTotal = document.getElementById("totalComision").closest("td");
tdComisionTotal.style.display = "";

document.getElementById("totalComision").textContent =
`${totalComision.toLocaleString("es-PY")} Gs`;

  document.getElementById("totalGanancia").innerHTML =
  `<span class="moneda">0 Gs</span>`;

  document.getElementById("totalMargen").textContent = "0 %";

}

else{

  let totalVentaCalc = 0;
  let totalCostoCalc = 0;

  lista.forEach(v => {

    const cantidad = Number(v.cantidad || 0);

    const costoUnit =
    Number(v.precio_compra || 0) +
    Number(v.costo_transporte || 0);

    const precioVenta = Number(v.precio || 0);

    totalVentaCalc += precioVenta * cantidad;
    totalCostoCalc += costoUnit * cantidad;

  });


  const totalGanancia = totalVentaCalc - totalCostoCalc;

  const margenTotal =
  totalVentaCalc > 0 ? (totalGanancia / totalVentaCalc) * 100 : 0;

  document.getElementById("totalVenta").innerHTML =
  `<span class="moneda">${totalVentaCalc.toLocaleString("es-PY")} Gs</span>`;

  document.getElementById("totalCosto").innerHTML =
  `<span class="moneda">${totalCostoCalc.toLocaleString("es-PY")} Gs</span>`;

  const tdComisionTotal = document.getElementById("totalComision").closest("td");
tdComisionTotal.style.display = "none";

  document.getElementById("totalGanancia").innerHTML =
  `<span class="moneda">${total.toLocaleString("es-PY")} Gs</span>`;

  document.getElementById("totalMargen").textContent =
  margenTotal.toFixed(1) + " %";

}

}


/* ================= LIMPIAR FILTRO ================= */

function limpiarFiltro(){

document.getElementById("filtroCliente").value="";
document.getElementById("filtroProducto").value="";

document.getElementById("tablaVentas").innerHTML=`
<tr>
<td colspan="13" class="inf-cargando">Seleccione un rango de fechas</td>
</tr>
`;

document.getElementById("totalVenta").textContent="Gs 0";
document.getElementById("totalCosto").textContent="Gs 0";
document.getElementById("totalComision").textContent="Gs 0";
document.getElementById("totalGanancia").textContent="Gs 0";
document.getElementById("totalMargen").textContent="0 %";

}


/* ================= IMPRIMIR ================= */

function imprimir(){
window.print();
}

function abrirBuscadorCliente(){

window.open(
`${BASE}/modulos/cliente/cliente.html?modo=seleccion&volver=informe`,
"buscarCliente",
"width=1100,height=700"
);

}
function abrirBuscadorProducto(){

window.open(
"/modulos/productos/productos.html?modo=seleccion&volver=informe",
"buscarProducto",
"width=1100,height=700"
);

}

/* ================= EXPORTAR ================= */



function construirPayloadExportVentas(formato) {
  const tipo = document.getElementById('tipoInforme').value;
  const desde = document.getElementById('filtroDesde').value;
  const hasta = document.getElementById('filtroHasta').value;
  const cliente = document.getElementById('filtroCliente').value.trim();
  const producto = document.getElementById('filtroProducto').value.trim();

  return {
    modulo: 'ventas',
    formato,
    filename: `reporte_ventas_${tipo}_${Date.now()}`,
    tipo,
    desde,
    hasta,
    filtros: { cliente, producto, tipo, desde, hasta }
  };
}

async function exportarInforme(formato) {
  try {
    mostrarSpinner(formato === 'pdf' ? 'Generando PDF...' : 'Generando Excel...');

    const payload = construirPayloadExportVentas(formato);
    const res = await fetch(`${API}/reportes/exportar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload)
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok) {
      throw new Error(data?.error || 'No se pudo exportar');
    }

    toast(`Archivo generado: ${data.archivo} en C:/Sys/doc`, 'success');
  } catch (err) {
    console.error(err);
    toast(err.message || 'Error al exportar', 'error');
  } finally {
    ocultarSpinner();
  }
}

function exportarPDF(){
  exportarInforme('pdf');
}

function exportarExcel(){
  exportarInforme('excel');
}



