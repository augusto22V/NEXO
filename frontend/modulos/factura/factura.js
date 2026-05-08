// =========================
// MODAL FACTURA
// =========================
function abrirModalFactura() {
  if (!pedidoActual || !pedidoActual.id) {
    mostrarMensaje("No hay venta activa", "error");
    return;
  }

  document.getElementById("modalFactura").style.display = "flex";
  document.getElementById("totalFacturaPreview").value =
    formatearGs(calcularTotalPedido());

  fetch("/api/factura/preview-numero")
    .then(r => r.json())
    .then(data => {
      document.getElementById("numeroFacturaPreview").value = data.numero || "";
    })
    .catch(() => {
      console.log("No se pudo obtener número de factura");
    });
}

function cerrarModalFactura() {
  document.getElementById("modalFactura").style.display = "none";
}

// =========================
// AUTOCOMPLETAR RUC
// =========================

function initFacturaEventos() {

  const inputRuc = document.getElementById("rucFacturaInput");

  if (!inputRuc) return;

  inputRuc.addEventListener("keydown", async function (e) {

    if (e.key !== "Enter") return;

    const ruc = this.value.trim();

    if (!ruc) return;

    try {

      const res = await fetch(`/api/clientes/ruc/${ruc}`);

      if (!res.ok) {
        mostrarMensaje("Error consultando RUC", "error");
        return;
      }

      const data = await res.json();

      if (!data) {
        mostrarMensaje("RUC no encontrado", "aviso");
        return;
      }

      document.getElementById("nombreFacturaInput").value =
        data.nombre || data.razon_social || "";

      document.getElementById("direccionFacturaInput").value =
        data.direccion || "";

      document.getElementById("ciudadFacturaInput").value =
        data.ciudad || "";

    } catch (err) {
      mostrarMensaje("Error buscando RUC", "error");
    }
  });

}

// =========================
// BUSCADOR CLIENTE
// =========================

function abrirBuscadorClienteFactura() {

  const popup = window.open(
    "/modulos/cliente/cliente.html?modo=seleccion",
    "clienteFactura",
    "width=900,height=600"
  );

  const interval = setInterval(() => {
    if (popup.closed) {

      clearInterval(interval);

      const clienteSel = localStorage.getItem("clienteSeleccionado");

      if (clienteSel) {

        const cliente = JSON.parse(clienteSel);

        document.getElementById("rucFacturaInput").value = cliente.ruc || "";
        document.getElementById("nombreFacturaInput").value = cliente.nombre || "";
        document.getElementById("direccionFacturaInput").value = cliente.direccion || "";
        document.getElementById("ciudadFacturaInput").value = cliente.ciudad || "";

        localStorage.removeItem("clienteSeleccionado");
      }
    }
  }, 300);
}

// =========================
// CONFIRMAR FACTURA
// =========================

async function confirmarFactura2() {
  const ventaId = pedidoActual?.id;

  if (!ventaId) {
    mostrarMensaje("No hay venta activa", "error");
    return;
  }

  const ruc = document.getElementById("rucFacturaInput").value.trim();
  const nombre = document.getElementById("nombreFacturaInput").value.trim();
  const direccion = document.getElementById("direccionFacturaInput").value.trim();
  const ciudad = document.getElementById("ciudadFacturaInput").value.trim();

  if (!nombre) {
    mostrarMensaje("Nombre es obligatorio", "aviso");
    return;
  }

  try {
    const resCliente = await fetch("/api/clientes/guardar-o-buscar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ruc, nombre, direccion, ciudad })
    });

    const clienteData = await resCliente.json();

    if (!resCliente.ok) {
      mostrarMensaje(clienteData.error || "Error guardando cliente", "error");
      return;
    }

    const resVentaCliente = await fetch("/api/venta/cliente", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        venta_id: ventaId,
        cliente_id: clienteData.id,
        cliente_nombre: clienteData.nombre
      })
    });

    if (!resVentaCliente.ok) {
      mostrarMensaje("Error asignando cliente a la venta", "error");
      return;
    }

    const res = await fetch(`/api/factura/generar/${ventaId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ruc, nombre, direccion, ciudad })
    });

    const data = await res.json();

    if (!res.ok) {
      mostrarMensaje(data.error || "Error generando factura", "error");
      return;
    }

    const resPrint = await fetch("/api/print/venta-factura", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ facturaId: data.id })
    });

    if (!resPrint.ok) {
      mostrarMensaje("Factura generada, pero no se pudo imprimir", "aviso");
      cerrarModalFactura();
      vaciarPOS();
      return;
    }

    mostrarMensaje("✔ Factura generada e impresa", "ok");
    cerrarModalFactura();
    vaciarPOS();

  } catch (err) {
    mostrarMensaje("Error de conexión", "error");
  }
}
// =========================
// INIT
// =========================

document.addEventListener("DOMContentLoaded", () => {
  initFacturaEventos();
});