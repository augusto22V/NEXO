let ventaSeleccionada = null;
let ventasSeleccionadas = [];
let ventasParaFacturar = [];

const paramsURL = new URLSearchParams(window.location.search);
const modoSeleccion = paramsURL.get("modo") === "seleccion";
const from = String(paramsURL.get("from") || "").trim().toLowerCase();
const STORAGE_MOVIMIENTO_VENTA_MEDIO = "ventaMedioMovimientoSeleccionado";
let facturaProcesando = false;

function construirReturnUrlDesdeModo(venta) {
  const ventaId = Number(venta?.id || 0);
  const numero = Number(venta?.numero || 0);

  if (from === "venta_medio") {
    if (ventaId > 0) return `/modulos/venta/venta_medio.html?venta_id=${ventaId}`;
    if (numero > 0) return `/modulos/venta/venta_medio.html?pedido=${numero}`;
    return "/modulos/venta/venta_medio.html";
  }

  if (ventaId > 0) return `/modulos/venta/venta_rapida.html?venta_id=${ventaId}`;
  if (numero > 0) return `/modulos/venta/venta_rapida.html?pedido=${numero}`;
  return "/modulos/venta/venta_rapida.html?rapida=true";
}

function seleccionarVentaDesdeListado(venta) {
  if (!modoSeleccion) return false;

  const payload = {
    id: Number(venta?.id || 0) || null,
    numero: Number(venta?.numero || 0) || null
  };

  if (from === "venta_medio") {
    localStorage.setItem(STORAGE_MOVIMIENTO_VENTA_MEDIO, JSON.stringify(payload));
  }

  if (window.opener && !window.opener.closed) {
    try {
      window.opener.focus();
    } catch (_err) {
      // sin bloqueo
    }
    window.close();
    return true;
  }

  window.location.href = construirReturnUrlDesdeModo(payload);
  return true;
}

function abrirModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  document.body.style.overflow = "hidden";
  el.classList.add("show");
}

function cerrarModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove("show");
  document.body.style.overflow = "";
}

function mostrarConfirmar(mensaje, onSi, onNo = null) {
  const modal = document.getElementById("modalConfirmar");
  const texto = document.getElementById("confirmarTexto");
  const btnSi = document.getElementById("confirmarSi");
  const btnNo = document.getElementById("confirmarNo");

  if (!modal || !texto || !btnSi || !btnNo) {
    if (window.confirm(mensaje)) {
      if (onSi) onSi();
    } else if (onNo) {
      onNo();
    }
    return;
  }

  texto.innerText = mensaje;
  abrirModal("modalConfirmar");

  const nuevoSi = btnSi.cloneNode(true);
  const nuevoNo = btnNo.cloneNode(true);

  btnSi.parentNode.replaceChild(nuevoSi, btnSi);
  btnNo.parentNode.replaceChild(nuevoNo, btnNo);

  nuevoSi.addEventListener("click", () => {
    cerrarModal("modalConfirmar");
    if (onSi) onSi();
  });

  nuevoNo.addEventListener("click", () => {
    cerrarModal("modalConfirmar");
    if (onNo) onNo();
  });
}

function limpiarFormularioFactura() {
  const clienteCodigo = document.getElementById("clienteCodigoFactura");
  const ruc = document.getElementById("rucFacturaInput");
  const nombre = document.getElementById("nombreFacturaInput");
  const direccion = document.getElementById("direccionFacturaInput");
  const ciudad = document.getElementById("ciudadFacturaInput");

  if (clienteCodigo) clienteCodigo.value = "";
  if (ruc) ruc.value = "";
  if (nombre) nombre.value = "Consumidor Final";
  if (direccion) direccion.value = "";
  if (ciudad) ciudad.value = "";
}

function formatearGs(valor) {
  return `Gs ${Number(valor || 0).toLocaleString("es-PY")}`;
}

function calcularTotalFacturaSeleccionada() {
  return ventasParaFacturar.reduce((acc, venta) => acc + Number(venta.total || 0), 0);
}

function obtenerVentasValidasParaFacturar() {
  const estadosPermitidos = ["PENDIENTE", "CONCLUIDO", "EFECTIVADO"];
  const ids = new Set();

  return ventasSeleccionadas.filter((venta) => {
    const id = Number(venta?.id || 0);
    if (!id || ids.has(id)) return false;
    ids.add(id);
    return estadosPermitidos.includes(venta.estado) && !venta.numero_factura;
  });
}

function cerrarModalFactura() {
  limpiarFormularioFactura();
  cerrarModal("modalFactura");
}

function abrirModalFactura() {
  if (!ventasParaFacturar.length) {
    alert("Selecciona al menos una venta valida para facturar");
    return;
  }

  limpiarFormularioFactura();
  abrirModal("modalFactura");

  const totalPreview = document.getElementById("totalFacturaPreview");
  const numeroPreview = document.getElementById("numeroFacturaPreview");

  if (totalPreview) {
    totalPreview.innerText = formatearGs(calcularTotalFacturaSeleccionada());
  }

  if (numeroPreview) {
    numeroPreview.value = "";
  }

  fetch("/api/factura/preview-numero")
    .then((r) => r.json())
    .then((data) => {
      if (numeroPreview) numeroPreview.value = data.numero || "";
    })
    .catch(() => {
      if (numeroPreview) numeroPreview.value = "";
    });
}

function completarFormularioFacturaConCliente(cliente) {
  if (!cliente) return;

  document.getElementById("clienteCodigoFactura").value = cliente.id || "";
  document.getElementById("nombreFacturaInput").value = cliente.nombre || "Consumidor Final";
  document.getElementById("rucFacturaInput").value = cliente.ruc || "";
  document.getElementById("direccionFacturaInput").value = cliente.direccion || "";
  document.getElementById("ciudadFacturaInput").value = cliente.ciudad || "";
}

async function buscarClienteFacturaPorCodigo(codigo) {
  const clienteCodigo = String(codigo || "").trim();
  if (!clienteCodigo) return false;

  try {
    const res = await fetch(`/api/clientes/${clienteCodigo}`);
    if (!res.ok) {
      alert("Cliente no encontrado");
      return false;
    }

    const cliente = await res.json();
    completarFormularioFacturaConCliente(cliente);
    return true;
  } catch (err) {
    console.error("Error buscando cliente:", err);
    alert("Error buscando cliente");
    return false;
  }
}

function buscarClienteFactura() {
  const codigo = document.getElementById("clienteCodigoFactura")?.value.trim();
  if (codigo) {
    buscarClienteFacturaPorCodigo(codigo);
    return;
  }

  const popup = window.open(
    "/modulos/cliente/cliente.html?modo=seleccion",
    "seleccionarClienteFactura",
    `width=${window.innerWidth},height=${window.innerHeight}`
  );

  if (!popup) {
    alert("Permita ventanas emergentes para buscar cliente");
    return;
  }

  const interval = setInterval(() => {
    if (!popup || popup.closed) {
      clearInterval(interval);

      const clienteSel = localStorage.getItem("clienteSeleccionado");
      if (!clienteSel) return;

      try {
        completarFormularioFacturaConCliente(JSON.parse(clienteSel));
      } catch (err) {
        console.error("Cliente seleccionado invalido:", err);
      }

      localStorage.removeItem("clienteSeleccionado");
    }
  }, 300);
}

async function completarClienteFacturaPorRuc(ruc) {
  const valor = String(ruc || "").trim();
  if (!valor) return;

  try {
    const res = await fetch(`/api/clientes/ruc/${valor}`);
    if (!res.ok) return;

    const cliente = await res.json();
    if (!cliente) return;

    document.getElementById("nombreFacturaInput").value =
      cliente.nombre || cliente.razon_social || "Consumidor Final";
    document.getElementById("direccionFacturaInput").value = cliente.direccion || "";
    document.getElementById("ciudadFacturaInput").value = cliente.ciudad || "";
  } catch (err) {
    console.error("Error buscando RUC:", err);
  }
}

/* ================= CONTADOR ================= */

function actualizarContador() {
  const el = document.getElementById("contadorSeleccion");
  if (el) {
    el.innerText = `${ventasSeleccionadas.length} seleccionados`;
  }
}

/* ================= BUSCAR ================= */
function obtenerNumeroCortoFactura(numeroCompleto) {
  if (!numeroCompleto) return null;

  const partes = numeroCompleto.split("-");
  return parseInt(partes[2], 10) || null;
}

async function buscarMovimientos() {
  const params = new URLSearchParams({
    desde: document.getElementById("fechaDesde").value,
    hasta: document.getElementById("fechaHasta").value,
    estado: document.getElementById("situacion").value,
    numero: document.getElementById("numeroNota").value
  });

  const res = await fetch(`/api/venta?${params}`);
  const data = await res.json();

  ventasSeleccionadas = [];
  actualizarContador();

  renderTabla(data);
}

/* ================= RENDER ================= */

function renderTabla(data) {
  const tabla = document.getElementById("tablaMovimientos");
  tabla.innerHTML = "";

  data.forEach((v) => {
    const tr = document.createElement("tr");

    const fechaTexto = v.fecha ? new Date(v.fecha).toLocaleString("es-PY") : "-";

    const puedeSeleccionar =
      v.estado === "CONCLUIDO" ||
      v.estado === "EFECTIVADO" ||
      v.estado === "PENDIENTE";

    tr.innerHTML = `
      <td>
        ${
          puedeSeleccionar
            ? `<input type="checkbox"
                class="checkVenta"
                value="${v.id}"
                data-estado="${v.estado}"
                data-factura="${v.numero_factura || ""}">`
            : ""
        }
      </td>
      <td>${fechaTexto}</td>
      <td>${v.tipo_pedido || "-"}</td>
      <td>${v.numero}</td>
      <td>${v.mesa || "-"}</td>
      <td>
        ${
          v.numero_factura
            ? `Nro ${obtenerNumeroCortoFactura(v.numero_factura)}`
            : `<span style="color:gray">Sin factura</span>`
        }
      </td>
      <td>${v.cliente || "-"}</td>
      <td>${v.vendedor || "-"}</td>
      <td>${v.moneda}</td>
      <td class="estado-${v.estado}">${v.estado}</td>
      <td>Gs ${Number(v.total).toLocaleString("es-PY")}</td>
    `;

    const checkbox = tr.querySelector(".checkVenta");

    if (checkbox) {
      checkbox.addEventListener("click", (e) => e.stopPropagation());

      checkbox.addEventListener("change", async (e) => {
        const id = Number(e.target.value);
        const estado = e.target.dataset.estado;
        const factura = e.target.dataset.factura;

        if (e.target.checked) {
          if (!ventasSeleccionadas.some((venta) => venta.id === id)) {
            ventasSeleccionadas.push({
              id,
              estado,
              numero_factura: factura || null,
              numero: v.numero,
              total: Number(v.total || 0)
            });
          }

          tr.classList.add("fila-seleccionada");
        } else {
          ventasSeleccionadas = ventasSeleccionadas.filter((venta) => venta.id !== id);
          tr.classList.remove("fila-seleccionada");
        }

        actualizarContador();

        if (ventasSeleccionadas.length === 1) {
          await verDetalle(ventasSeleccionadas[0].id);
        } else {
          document.getElementById("ventaIdActual").value = "";
          document.getElementById("detalleVenta").innerHTML = "";
        }
      });
    }

    tr.addEventListener("click", () => {
      const chk = tr.querySelector(".checkVenta");
      if (chk) {
        chk.checked = !chk.checked;
        chk.dispatchEvent(new Event("change"));
      }
    });

    const abrirVenta = () => {
      if (seleccionarVentaDesdeListado(v)) return;
      window.location.href = `/modulos/venta/venta_rapida.html?venta_id=${v.id}`;
    };

    tr.addEventListener("dblclick", abrirVenta);

    let lastTap = 0;
    tr.addEventListener(
      "touchend",
      (e) => {
        const now = Date.now();
        const diff = now - lastTap;

        if (diff < 300 && diff > 0) {
          e.preventDefault();
          abrirVenta();
        }

        lastTap = now;
      },
      { passive: false }
    );

    tabla.appendChild(tr);
  });

  const checkAll = document.getElementById("checkAll");
  if (checkAll) {
    checkAll.checked = false;

    checkAll.onchange = (e) => {
      const checked = e.target.checked;
      ventasSeleccionadas = [];

      document.querySelectorAll(".checkVenta").forEach((chk) => {
        chk.checked = checked;

        const id = Number(chk.value);
        const estado = chk.dataset.estado;
        const factura = chk.dataset.factura;

        if (checked) {
          ventasSeleccionadas.push({
            id,
            estado,
            numero_factura: factura || null,
            numero: chk.closest("tr")?.children?.[3]?.innerText || "",
            total: Number(data.find((venta) => Number(venta.id) === id)?.total || 0)
          });

          chk.closest("tr").classList.add("fila-seleccionada");
        } else {
          chk.closest("tr").classList.remove("fila-seleccionada");
        }
      });

      actualizarContador();
    };
  }
}

/* ================= SELECCION VISUAL ================= */

function seleccionarFila(fila) {
  document
    .querySelectorAll("#tablaMovimientos tr")
    .forEach((tr) => tr.classList.remove("fila-seleccionada"));

  fila.classList.add("fila-seleccionada");
}

/* ================= DETALLE ================= */

async function verDetalle(id) {
  document.getElementById("ventaIdActual").value = id ? String(id) : "";

  try {
    const res = await fetch(`/api/venta/${id}`);
    const data = await res.json();

    ventaSeleccionada = data;

    const cont = document.getElementById("detalleVenta");
    cont.innerHTML = "";

    let total = 0;

    (data.detalles || []).forEach((d) => {
      total += Number(d.subtotal);

      cont.innerHTML += `
        <div class="item-detalle">
          <div>${d.cantidad}x ${d.descripcion}</div>
          <div>Gs ${Number(d.subtotal).toLocaleString("es-PY")}</div>
        </div>
      `;
    });

    cont.innerHTML += `<hr><b>Total: Gs ${total.toLocaleString("es-PY")}</b>`;
  } catch (err) {
    console.error("Error cargando detalle:", err);
  }
}

/* ================= EFECTIVIZAR ================= */

async function efectivizar() {
  if (ventasSeleccionadas.length === 0) {
    alert("Selecciona al menos una venta");
    return;
  }

  const validas = ventasSeleccionadas.filter((venta) => venta.estado === "CONCLUIDO");

  if (validas.length === 0) {
    alert("Solo ventas CONCLUIDAS pueden ser cobradas");
    return;
  }

  if (validas.length !== ventasSeleccionadas.length) {
    if (!confirm("Hay ventas que no estan CONCLUIDAS. Continuar solo con las validas?")) {
      return;
    }
  }

  const ids = [...new Set(validas.map((venta) => venta.id))].join(",");

  window.open(`/modulos/caja/caja.html?ventas=${ids}`, "_blank", "width=1000,height=750");
}

function postCobroDesdeCaja() {
  buscarMovimientos();
}

/* ================= FACTURAR ================= */

function facturarSeleccionados(event) {
  if (event?.preventDefault) event.preventDefault();

  if (ventasSeleccionadas.length === 0) {
    alert("Selecciona al menos una venta");
    return;
  }

  const validas = obtenerVentasValidasParaFacturar();

  if (validas.length === 0) {
    alert("Solo ventas validas para facturar");
    return;
  }

  ventasParaFacturar = validas;

  const omitidas = ventasSeleccionadas.length - validas.length;
  const mensaje = omitidas > 0
    ? `Hay ${omitidas} registro(s) no valido(s). ¿Desea continuar y generar factura solo con ${validas.length} venta(s)?`
    : validas.length > 1
      ? `¿Desea generar una sola factura para ${validas.length} ventas seleccionadas?`
      : `¿Desea generar factura para la venta #${validas[0].numero || validas[0].id}?`;

  mostrarConfirmar(mensaje, () => {
    abrirModalFactura();
  });
}

async function confirmarFactura() {
  if (facturaProcesando) return;

  const ventasIds = ventasParaFacturar.map((venta) => Number(venta.id)).filter((id) => id > 0);
  if (!ventasIds.length) {
    alert("No hay ventas seleccionadas para facturar");
    return;
  }

  const ruc = document.getElementById("rucFacturaInput").value.trim();
  const nombre = document.getElementById("nombreFacturaInput").value.trim();
  const direccion = document.getElementById("direccionFacturaInput").value.trim();
  const ciudad = document.getElementById("ciudadFacturaInput").value.trim();
  const btnConfirmar = document.getElementById("btnConfirmarFactura");

  if (!nombre) {
    alert("Nombre es obligatorio");
    return;
  }

  facturaProcesando = true;
  if (btnConfirmar) btnConfirmar.disabled = true;

  try {
    let facturaId = null;

    if (ventasIds.length === 1) {
      const resCliente = await fetch("/api/clientes/guardar-o-buscar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ruc: ruc || null, nombre, direccion, ciudad })
      });

      const clienteData = await resCliente.json().catch(() => ({}));
      if (!resCliente.ok || !clienteData?.id) {
        throw new Error(clienteData.error || "Error guardando cliente");
      }

      const resVentaCliente = await fetch("/api/venta/cliente", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          venta_id: ventasIds[0],
          cliente_id: clienteData.id,
          cliente_nombre: clienteData.nombre || "OCASIONAL"
        })
      });

      if (!resVentaCliente.ok) {
        const ventaClienteData = await resVentaCliente.json().catch(() => ({}));
        throw new Error(ventaClienteData.error || "Error guardando cliente en venta");
      }

      const resFactura = await fetch(`/api/factura/generar/${ventasIds[0]}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ruc: ruc || null, nombre, direccion, ciudad })
      });

      const facturaData = await resFactura.json().catch(() => ({}));
      if (!resFactura.ok) {
        throw new Error(facturaData.error || "Error generando factura");
      }

      facturaId = facturaData.id;
    } else {
      const resFactura = await fetch("/api/factura/generar-multiple", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ventas: ventasIds,
          ruc: ruc || null,
          nombre,
          direccion,
          ciudad
        })
      });

      const facturaData = await resFactura.json().catch(() => ({}));
      if (!resFactura.ok) {
        throw new Error(facturaData.error || "Error generando factura");
      }

      facturaId = facturaData.id;
    }

    ventasParaFacturar = [];
    ventasSeleccionadas = [];
    actualizarContador();
    cerrarModalFactura();
    window.location.href = `/modulos/factura/factura_ticket.html?id=${facturaId}`;
  } catch (err) {
    console.error("Error facturando:", err);
    alert(err.message || "Error generando factura");
  } finally {
    facturaProcesando = false;
    if (btnConfirmar) btnConfirmar.disabled = false;
  }
}

/* ================= ANULAR ================= */

async function anularSeleccionados() {
  if (ventasSeleccionadas.length === 0) {
    alert("Selecciona al menos una venta");
    return;
  }

  const estadosPermitidos = ["PENDIENTE", "CONCLUIDO", "EFECTIVADO"];

  const validas = ventasSeleccionadas.filter(
    (venta) => estadosPermitidos.includes(venta.estado) && !venta.numero_factura
  );

  if (validas.length === 0) {
    alert("Solo ventas sin factura (PENDIENTE, CONCLUIDO o EFECTIVADO) pueden anularse");
    return;
  }

  if (validas.length !== ventasSeleccionadas.length) {
    const continuar = confirm(
      "Algunas ventas no se pueden anular (facturadas u otro estado). Continuar con las validas?"
    );
    if (!continuar) return;
  }

  if (!confirm(`Anular ${validas.length} ventas?`)) return;

  for (const venta of validas) {
    try {
      const res = await fetch(`/api/venta/cancelar/${venta.id}`, {
        method: "POST"
      });

      if (!res.ok) {
        console.log("Error anulando:", venta.id);
      }
    } catch (err) {
      console.log("Error conexion:", err);
    }
  }

  alert("Proceso de anulacion finalizado");
  buscarMovimientos();
}

/* ================= NUEVO ================= */

function nuevoPedido() {
  buscarMovimientos();

  document.getElementById("detalleVenta").innerHTML = "";
  document.getElementById("ventaIdActual").value = "";

  ventaSeleccionada = null;
  ventasSeleccionadas = [];

  actualizarContador();
}

/* ================= FILTROS AUX ================= */

function abrirBusquedaCliente() {
  window.open("/modulos/cliente/cliente.html?modo=seleccion", "seleccionarCliente", "width=1000,height=700");
}

function abrirBusquedaVendedor() {
  window.open("/modulos/vendedor/vendedor.html?modo=seleccion", "seleccionarVendedor", "width=1000,height=700");
}

/* ================= INIT ================= */

document.addEventListener("DOMContentLoaded", async () => {
  const hoy = new Date();
  const yyyy = hoy.getFullYear();
  const mm = String(hoy.getMonth() + 1).padStart(2, "0");
  const dd = String(hoy.getDate()).padStart(2, "0");

  document.getElementById("fechaDesde").value = `${yyyy}-${mm}-${dd}`;
  document.getElementById("fechaHasta").value = `${yyyy}-${mm}-${dd}`;

  if (modoSeleccion) {
    document.getElementById("situacion").value = "";

    const topBtn = document.querySelector(".btn-volver");
    if (topBtn && from === "venta_medio") {
      topBtn.textContent = "← Volver a VentaMedio";
    }

    const acciones = document.querySelector(".acciones-botones");
    if (acciones) acciones.style.display = "none";
  } else {
    document.getElementById("situacion").value = "CONCLUIDO";
  }

  document.getElementById("btnBuscarClienteFactura")?.addEventListener("click", buscarClienteFactura);

  document.getElementById("clienteCodigoFactura")?.addEventListener("keydown", async function (e) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    await buscarClienteFacturaPorCodigo(this.value);
  });

  document.getElementById("rucFacturaInput")?.addEventListener("keydown", async function (e) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    await completarClienteFacturaPorRuc(this.value);
  });

  document.getElementById("rucFacturaInput")?.addEventListener("input", function () {
    let valor = this.value.replace(/[^0-9-]/g, "");
    const partes = valor.split("-");

    if (partes.length > 2) {
      valor = `${partes[0]}-${partes[1]}`;
    }

    if (partes[0]) partes[0] = partes[0].slice(0, 8);
    if (partes[1]) partes[1] = partes[1].slice(0, 1);

    this.value = partes.join("-");
  });

  await buscarMovimientos();
});

/* ================= SALIR ================= */

function salir() {
  if (modoSeleccion) {
    if (window.opener && !window.opener.closed) {
      window.close();
      return;
    }

    if (from === "venta_medio") {
      window.location.href = "/modulos/venta/venta_medio.html";
      return;
    }
  }

  window.location.href = "/modulos/venta/venta_rapida.html?rapida=true";
}
