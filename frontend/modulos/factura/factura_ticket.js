let FACTURA_ACTUAL = null;
let DETALLE_ACTUAL = [];

// ===== FORMATEADOR =====
function formatoPYG(valor) {
  return Number(valor || 0).toLocaleString("es-PY", {
    maximumFractionDigits: 0
  });
}

// ===== CARGAR FACTURA =====
async function cargarFactura(id) {

  try {

    const res = await fetch(`/api/factura/ticket/${id}`);
    const data = await res.json();

    if (!data || !data.factura) {
      alert("Factura no encontrada");
      return;
    }

    const f = data.factura;
    const detalle = data.detalle || [];

    FACTURA_ACTUAL = f;
    DETALLE_ACTUAL = detalle;

    // ===== EMPRESA =====
    document.getElementById("empresaNombre").innerText = f.empresa_nombre || "";
    document.getElementById("empresaRuc").innerText = f.empresa_ruc || "";
    document.getElementById("empresaDireccion").innerText = f.empresa_direccion || "";

    document.getElementById("empresaTelefono").innerText =
      f.empresa_telefono ? "Tel: " + f.empresa_telefono : "";

    document.getElementById("empresaEmail").innerText =
      f.empresa_email ? "Email: " + f.empresa_email : "";

    document.getElementById("empresaActividad").innerText = f.actividad || "";

    // ===== TIMBRADO =====
    document.getElementById("timbrado").innerText = f.timbrado || "";
    document.getElementById("inicioTimbrado").innerText =
      f.fecha_inicio ? formatearFecha(f.fecha_inicio) : "";
    document.getElementById("finTimbrado").innerText =
      f.fecha_vencimiento ? formatearFecha(f.fecha_vencimiento) : "";

    // ===== FACTURA =====
    document.getElementById("numeroFactura").innerText = f.numero_factura;

    const fecha = new Date(f.fecha);
    document.getElementById("fechaFactura").innerText =
      formatearFecha(fecha) + " " +
      fecha.toLocaleTimeString("es-PY", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
      });

    document.getElementById("condicion").innerText =
      f.condicion_venta || "CONTADO";

    // ===== CLIENTE =====
    document.getElementById("clienteFactura").innerText =
      f.cliente_nombre || "CONSUMIDOR FINAL";

    document.getElementById("rucFactura").innerText =
      f.cliente_ruc || "0000000-0";

    document.getElementById("direccionFactura").innerText =
      f.cliente_direccion || "SIN DIRECCION";

    document.getElementById("codigoVenta").innerText = f.venta_id || "";

    // ===== TABLA =====
    const tbody = document.querySelector("#tablaDetalle tbody");
    tbody.innerHTML = "";

    let gravada10 = 0;
    let gravada5 = 0;

    detalle.forEach(d => {

      // limpiar descripción (quita números colados)
      const descripcion = (d.descripcion || "").replace(/\s*\d+$/, "");

      const tr1 = document.createElement("tr");
      tr1.className = "item-row";

      tr1.innerHTML = `
        <td class="col-cant">${d.cantidad}</td>
        <td class="detalle-desc">${descripcion}</td>
        <td class="detalle-num">${formatoPYG(d.precio)}</td>
        <td></td>
      `;

      const tr2 = document.createElement("tr");
      tr2.className = "item-subrow";

      tr2.innerHTML = `
        <td></td>
        <td></td>
        <td></td>
        <td class="col-total">${formatoPYG(d.subtotal)}</td>
      `;

      tbody.appendChild(tr1);
      tbody.appendChild(tr2);

      //  IVA CORRECTO (DENTRO DEL LOOP)
      if (Number(d.iva_tipo) === 10) gravada10 += Number(d.subtotal);
      if (Number(d.iva_tipo) === 5) gravada5 += Number(d.subtotal);
    });

    // ===== IVA =====
    document.getElementById("gravada10").innerText = formatoPYG(gravada10);
    document.getElementById("gravada5").innerText = formatoPYG(gravada5);
    document.getElementById("iva10").innerText = formatoPYG(f.iva10);
    document.getElementById("iva5").innerText = formatoPYG(f.iva5);

    // ===== TOTAL =====
    document.getElementById("totalFactura").innerText = formatoPYG(f.total);

    // ===== PAGOS =====
    document.getElementById("pagadoGs").innerText = formatoPYG(f.total);
    document.getElementById("vueltoGs").innerText = "0";

  } catch (err) {
    console.error(err);
    alert("Error cargando factura");
  }
}

// ===== IMPRIMIR =====
let yaImprimioDuplicado = false;

function imprimirTicket() {

  document.getElementById("tipoCopia").innerText = "ORIGINAL: CLIENTE";

  window.onafterprint = () => {

    //  PRIMER PRINT → DUPLICADO
    if (!yaImprimioDuplicado) {
      yaImprimioDuplicado = true;

      document.getElementById("tipoCopia").innerText = "DUPLICADO: ARCHIVO";

      setTimeout(() => {
        window.print();
      }, 300);

    } else {
      //  SEGUNDO PRINT → CERRAR Y VOLVER
      window.onafterprint = null;

      setTimeout(() => {

        //  cerrar ventana actual
        window.close();

        //  volver a venta (por si no se cierra)
        window.location.href = "/modulos/venta/venta_rapida.html";

      }, 500);
    }
  };

  window.print();
}


// ===== FECHA =====
function formatearFecha(fechaStr) {
  const f = new Date(fechaStr);
  const dia = String(f.getDate()).padStart(2, '0');
  const mes = String(f.getMonth() + 1).padStart(2, '0');
  const anio = f.getFullYear();
  return `${dia}/${mes}/${anio}`;
}

// ===== INIT =====
window.onload = async () => {

  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");
  const ventas = params.get("ventas");

  try {

    if (id) {
      await cargarFactura(id);
    } else if (ventas) {

      const ids = ventas.split(",").map(v => Number(v));

      const res = await fetch("/api/factura/generar-multiple", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ventas: ids })
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Error generando factura múltiple");
        return;
      }

      await cargarFactura(data.id);
    } else {
      alert("Parámetros inválidos");
      return;
    }


  } catch (err) {
    console.error(err);
    alert("Error general en factura");
  }

  setTimeout(() => {
  imprimirTicket();
}, 500);

};
