let facturaSeleccionada = null;
let facturasSeleccionadas = [];

/* ================= BUSCAR ================= */

async function buscarFacturas() {
  document.getElementById("facturaIdActual").value = "";

  const params = new URLSearchParams({
    desde: document.getElementById("fechaDesde").value,
    hasta: document.getElementById("fechaHasta").value,
    estado: document.getElementById("estado").value,
    tipo: document.getElementById("tipo").value,
    numero: document.getElementById("numeroFactura").value,
    cliente: document.getElementById("clienteFiltro").value
  });

  const res = await fetch(`/api/factura?${params}`);
  const data = await res.json();

  renderTabla(data);
}

/* ================= TABLA ================= */

function renderTabla(data) {

  const tabla = document.getElementById("tablaFacturas");
  tabla.innerHTML = "";

  data.forEach(f => {

    const tr = document.createElement("tr");

    const fecha = new Date(f.fecha);

    const fechaTexto = fecha.toLocaleString('es-PY', {
      timeZone: "America/Asuncion",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });

  tr.innerHTML = `
  <td>${fechaTexto}</td>
  <td>${f.venta_id}</td>
  <td>${f.numero}</td>
  <td>${f.cliente_nombre || "-"}</td>
  <td>${f.cliente_ruc || "-"}</td>
  <td>${f.tipo_comprobante}</td>
  <td class="estado-${f.estado}">${f.estado}</td>
  <td>Gs ${Number(f.total).toLocaleString()}</td>
`;

    /* ================= VISUAL ANULADO ================= */

    if (f.estado === "ANULADO") {
      tr.style.opacity = "0.5";
    }

    /* ================= CLICK / DOBLE CLICK ================= */

    let lastClick = 0;

    tr.addEventListener("click", () => {

      const now = Date.now();
      const diff = now - lastClick;

      // 🔥 DOBLE CLICK (rápido)
      if (diff < 300 && diff > 0) {
      window.location.href = `/modulos/venta/venta_rapida.html?ventaId=${f.venta_id}`;
        return;
      }

      // 🔹 CLICK NORMAL
      seleccionarFila(tr);
      verDetalle(f.id);

      lastClick = now;
    });

    /* ================= TOUCH (CELULAR) ================= */

    let lastTap = 0;

    tr.addEventListener("touchend", (e) => {

      const now = Date.now();
      const diff = now - lastTap;

      if (diff < 300 && diff > 0) {
        e.preventDefault();
       window.location.href = `/modulos/venta/venta_rapida.html?pedido=${f.venta_numero}`;
      }

      lastTap = now;

    }, { passive: false });

    tabla.appendChild(tr);
  });
}
/* ================= Busqueda de Cliente ================= */
function abrirBusquedaCliente(){

  const popup = window.open(
    "/modulos/cliente/cliente.html?modo=seleccion",
    "seleccionarCliente",
    "width=900,height=600"
  );

  const interval = setInterval(() => {

    if (popup.closed) {

      clearInterval(interval);

      const clienteSel = localStorage.getItem("clienteSeleccionado");

      if (clienteSel) {

        const cliente = JSON.parse(clienteSel);

        // 🔥 CARGAR EN FILTRO
        document.getElementById("clienteFiltro").value = cliente.nombre;

        // limpiar storage
        localStorage.removeItem("clienteSeleccionado");

        // 🔥 opcional: buscar automáticamente
        buscarFacturas();
      }
    }

  }, 300);
}

/* ================= SELECCION ================= */

function seleccionarFila(fila) {

  document.querySelectorAll("#tablaFacturas tr")
    .forEach(tr => tr.classList.remove("fila-seleccionada"));

  fila.classList.add("fila-seleccionada");
}



/* ================= DETALLE ================= */

async function verDetalle(id) {
  document.getElementById("facturaIdActual").value = id ? String(id) : "";

  const res = await fetch(`/api/factura/${id}`);
  const data = await res.json();

  facturaSeleccionada = data;

  const cont = document.getElementById("detalleFactura");
  cont.innerHTML = "";

  let total = 0;

  data.detalles.forEach(d => {

    total += Number(d.subtotal);

    cont.innerHTML += `
      <div class="item-detalle">
        <div>${d.cantidad}x ${d.descripcion}</div>
        <div>Gs ${Number(d.subtotal).toLocaleString()}</div>
      </div>
    `;
  });

  cont.innerHTML += `<hr><b>Total: Gs ${total.toLocaleString()}</b>`;
}

/* ================= REIMPRIMIR ================= */

function reimprimir(id = null) {

  const facturaId = id || facturaSeleccionada?.id;

  if (!facturaId) {
    alert("Seleccioná una factura");
    return;
  }

  window.open(`/api/factura/${facturaId}/print`, "_blank");
}

async function anularFactura() {

  if (!facturaSeleccionada) {
    alert("Seleccioná una factura");
    return;
  }

  if (facturaSeleccionada.estado === "ANULADO") {
    alert("La factura ya está anulada");
    return;
  }

  const ok = confirm("¿Seguro que querés ANULAR esta factura?");
  if (!ok) return;

  const res = await fetch(`/api/factura/${facturaSeleccionada.id}/anular`, {
    method: "PUT"
  });

  const data = await res.json();

  alert("Factura anulada correctamente");

  await buscarFacturas();
}

   // enviar 
function verFacturaPDF() {

  if (!facturaSeleccionada) {
    alert("Seleccioná una factura");
    return;
  }

  window.open(
    `/modulos/factura/factura_ticket.html?id=${facturaSeleccionada.id}`,
    "_blank"
  );
}

/* ================= INIT ================= */

document.addEventListener("DOMContentLoaded", async () => {

  const hoy = new Date();
  const yyyy = hoy.getFullYear();
  const mm = String(hoy.getMonth() + 1).padStart(2, '0');
  const dd = String(hoy.getDate()).padStart(2, '0');

  document.getElementById("fechaDesde").value = `${yyyy}-${mm}-${dd}`;
  document.getElementById("fechaHasta").value = `${yyyy}-${mm}-${dd}`;

  await buscarFacturas();
});

/* ================= SALIR ================= */

function salir(){
  window.location.href = "../../home.html";
}
