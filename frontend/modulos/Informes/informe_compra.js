const BASE = window.location.origin;
const API = `${BASE}/api`;

function mostrarSpinner(texto = "Cargando...") {
  document.getElementById("spinnerTexto").textContent = texto;
  document.getElementById("spinnerOverlay").classList.remove("hidden");
}

function ocultarSpinner() {
  document.getElementById("spinnerOverlay").classList.add("hidden");
}

function toast(mensaje, tipo = "info", duracion = 3500) {
  const cfg = {
    success: { bg: "#2D6A4F", icon: "OK" },
    error: { bg: "#DC2626", icon: "X" },
    warning: { bg: "#D97706", icon: "!" },
    info: { bg: "#1D4ED8", icon: "i" }
  }[tipo] || { bg: "#1D4ED8", icon: "i" };

  const t = document.createElement("div");
  t.className = "toast-item";
  t.style.background = cfg.bg;
  t.innerHTML = `<span class="toast-icon">${cfg.icon}</span><span>${mensaje}</span>`;
  document.getElementById("toastContainer").appendChild(t);
  requestAnimationFrame(() => t.classList.add("toast-visible"));

  setTimeout(() => {
    t.classList.remove("toast-visible");
    t.addEventListener("transitionend", () => t.remove());
  }, duracion);
}

function obtenerEmpresaId() {
  try {
    const raw = localStorage.getItem("usuario");
    if (!raw) return null;
    const user = JSON.parse(raw);
    const id = Number(user?.empresa_id);
    return Number.isFinite(id) && id > 0 ? String(id) : null;
  } catch {
    return null;
  }
}

function formatearFecha(fechaRaw) {
  if (!fechaRaw) return "-";
  const fecha = new Date(fechaRaw);
  if (Number.isNaN(fecha.getTime())) return "-";
  return fecha.toLocaleDateString("es-PY") + " " + fecha.toLocaleTimeString("es-PY", { hour: "2-digit", minute: "2-digit" });
}

function agruparPorProducto(rows) {
  const map = new Map();
  rows.forEach((r) => {
    const key = String(r.producto || "-");
    if (!map.has(key)) {
      map.set(key, { producto: key, cantidad: 0, monto: 0 });
    }
    const acc = map.get(key);
    acc.cantidad += Number(r.cantidad || 0);
    acc.monto += Number(r.subtotal || r.total || 0);
  });
  return Array.from(map.values()).sort((a, b) => b.monto - a.monto);
}

function agruparPorProveedor(rows) {
  const map = new Map();
  rows.forEach((r) => {
    const key = String(r.proveedor || "-");
    if (!map.has(key)) {
      map.set(key, { proveedor: key, cantidad: 0, monto: 0 });
    }
    const acc = map.get(key);
    acc.cantidad += Number(r.cantidad || 0);
    acc.monto += Number(r.subtotal || r.total || 0);
  });
  return Array.from(map.values()).sort((a, b) => b.monto - a.monto);
}

function renderErrorTabla(mensaje) {
  const tabla = document.getElementById("tablaCompras");
  tabla.innerHTML = `<tr><td colspan="8" class="inf-cargando" style="color:#DC2626">${mensaje}</td></tr>`;
  document.getElementById("totalCompras").textContent = "Gs 0";
}

async function buscarCompras() {
  const desde = document.getElementById("filtroDesde").value;
  const hasta = document.getElementById("filtroHasta").value;
  const proveedor = document.getElementById("filtroProveedor").value.trim();
  const producto = document.getElementById("filtroProducto").value.trim();
  const tipo = document.getElementById("tipoInforme").value;

  if (!desde || !hasta) {
    toast("Seleccione rango de fechas", "warning");
    renderErrorTabla("Seleccione un rango de fechas");
    return;
  }

  if (desde > hasta) {
    toast("Fecha desde no puede ser mayor a hasta", "warning");
    renderErrorTabla("Rango de fechas invalido");
    return;
  }

  const thProducto = document.getElementById("thProducto");
  if (thProducto) thProducto.textContent = tipo === "proveedor" ? "Proveedor" : "Producto";

  mostrarSpinner("Buscando compras...");

  try {
    const params = new URLSearchParams({ desde, hasta, tipo });
    const empresaId = obtenerEmpresaId();
    if (empresaId) params.set("empresa_id", empresaId);
    if (proveedor) params.set("proveedor", proveedor);
    if (producto) params.set("producto", producto);

    const res = await fetch(`${API}/compra/reporte?${params}`, { credentials: "include" });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data?.error || "Error al obtener reporte");
    }

    renderTabla(Array.isArray(data) ? data : [], tipo);
  } catch (err) {
    console.error(err);
    toast(err.message || "Error de conexion", "error");
    renderErrorTabla(err.message || "Error al cargar reporte");
  } finally {
    ocultarSpinner();
  }
}

function renderTabla(lista, tipo) {
  const tabla = document.getElementById("tablaCompras");
  tabla.innerHTML = "";

  if (!Array.isArray(lista) || !lista.length) {
    tabla.innerHTML = `<tr><td colspan="8" class="inf-cargando">No se encontraron resultados</td></tr>`;
    document.getElementById("totalCompras").textContent = "Gs 0";
    return;
  }

  let total = 0;

  if (tipo === "producto") {
    const agrupado = agruparPorProducto(lista);
    agrupado.forEach((v) => {
      total += Number(v.monto || 0);
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>-</td><td>-</td><td>-</td><td>-</td>
        <td>${v.producto || "-"}</td>
        <td class="text-right">${Number(v.cantidad || 0).toLocaleString("es-PY")}</td>
        <td class="text-right">-</td>
        <td class="text-right">Gs ${Number(v.monto || 0).toLocaleString("es-PY")}</td>
      `;
      tabla.appendChild(tr);
    });
  } else if (tipo === "proveedor") {
    const agrupado = agruparPorProveedor(lista);
    agrupado.forEach((v) => {
      total += Number(v.monto || 0);
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>-</td><td>-</td>
        <td>${v.proveedor || "-"}</td>
        <td>-</td><td>-</td>
        <td class="text-right">${Number(v.cantidad || 0).toLocaleString("es-PY")}</td>
        <td class="text-right">-</td>
        <td class="text-right">Gs ${Number(v.monto || 0).toLocaleString("es-PY")}</td>
      `;
      tabla.appendChild(tr);
    });
  } else {
    lista.forEach((v) => {
      const subtotal = Number(v.subtotal || v.total || 0);
      total += subtotal;
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${formatearFecha(v.fecha)}</td>
        <td>${v.numero_movimiento || v.numero || v.id || "-"}</td>
        <td>${v.proveedor || "-"}</td>
        <td>${v.comprador || "-"}</td>
        <td>${v.producto || "-"}</td>
        <td class="text-right">${Number(v.cantidad || 0).toLocaleString("es-PY")}</td>
        <td class="text-right">Gs ${Number(v.precio_unitario || v.costo || 0).toLocaleString("es-PY")}</td>
        <td class="text-right">Gs ${subtotal.toLocaleString("es-PY")}</td>
      `;
      tabla.appendChild(tr);
    });
  }

  document.getElementById("totalCompras").textContent = `Gs ${total.toLocaleString("es-PY")}`;
}

function limpiarFiltro() {
  const hoy = new Date().toISOString().split("T")[0];
  document.getElementById("filtroDesde").value = hoy;
  document.getElementById("filtroHasta").value = hoy;
  document.getElementById("filtroProveedor").value = "";
  document.getElementById("filtroProducto").value = "";
  document.getElementById("tablaCompras").innerHTML = `<tr><td colspan="8" class="inf-cargando">Seleccione un rango de fechas y presione Filtrar</td></tr>`;
  document.getElementById("totalCompras").textContent = "Gs 0";
}

function imprimir() {
  window.print();
}

function construirPayloadExportCompras(formato) {
  const tipo = document.getElementById("tipoInforme").value;
  const desde = document.getElementById("filtroDesde").value;
  const hasta = document.getElementById("filtroHasta").value;
  const proveedor = document.getElementById("filtroProveedor").value.trim();
  const producto = document.getElementById("filtroProducto").value.trim();

  return {
    modulo: "compras",
    formato,
    filename: `reporte_compras_${tipo}_${Date.now()}`,
    tipo,
    desde,
    hasta,
    filtros: { proveedor, producto, tipo, desde, hasta }
  };
}

async function exportarInforme(formato) {
  try {
    mostrarSpinner(formato === "pdf" ? "Generando PDF..." : "Generando Excel...");
    const payload = construirPayloadExportCompras(formato);

    const res = await fetch(`${API}/reportes/exportar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload)
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok) {
      throw new Error(data?.error || "No se pudo exportar");
    }

    toast(`Archivo generado: ${data.archivo} en C:/Sys/doc`, "success");
  } catch (err) {
    console.error(err);
    toast(err.message || "Error al exportar", "error");
  } finally {
    ocultarSpinner();
  }
}

function exportarPDF() {
  exportarInforme("pdf");
}

function exportarExcel() {
  exportarInforme("excel");
}

function abrirBuscadorProveedor() {
  window.open(
    `${BASE}/modulos/proveedores/proveedores.html?modo=seleccion&volver=informe_compra`,
    "buscarProveedor",
    "width=1100,height=700"
  );
}

function abrirBuscadorProducto() {
  window.open(
    "/modulos/productos/productos.html?modo=seleccion&volver=informe_compra",
    "buscarProducto",
    "width=1100,height=700"
  );
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("fechaGenerado").textContent = new Date().toLocaleString("es-PY");
  const hoy = new Date().toISOString().split("T")[0];
  document.getElementById("filtroDesde").value = hoy;
  document.getElementById("filtroHasta").value = hoy;
  buscarCompras();
});



