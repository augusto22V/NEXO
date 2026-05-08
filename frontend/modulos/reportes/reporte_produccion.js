const API = `${window.location.origin}/api/produccion/reporte`;

function fmt(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString("es-PY") : "0";
}

function setStatus(msg = "", type = "") {
  const el = document.getElementById("statusReporte");
  el.className = "status";
  el.textContent = msg;
  if (type) el.classList.add(type);
}

function renderKpis(resumen = {}) {
  const top = resumen.producto_mas_producido;
  const kpiPanel = document.getElementById("kpiPanel");

  kpiPanel.innerHTML = `
    <article class="kpi"><label>Lotes</label><strong>${fmt(resumen.lotes || 0)}</strong></article>
    <article class="kpi"><label>Cantidad producida</label><strong>${fmt(resumen.cantidad_producida || 0)}</strong></article>
    <article class="kpi"><label>Producto más producido</label><strong>${top ? `${top.producto} (${fmt(top.cantidad_total)})` : "-"}</strong></article>
  `;
}

function renderFecha(rows = []) {
  const tbody = document.getElementById("tbFecha");
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="3">Sin datos</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map((r) => `
    <tr>
      <td>${String(r.fecha || "").slice(0, 10)}</td>
      <td>${fmt(r.lotes)}</td>
      <td>${fmt(r.cantidad_total)}</td>
    </tr>
  `).join("");
}

function renderConsumo(rows = []) {
  const tbody = document.getElementById("tbConsumo");
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="3">Sin datos</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map((r) => `
    <tr>
      <td>${r.insumo || "-"}</td>
      <td>${fmt(r.total_consumido)}</td>
      <td>${r.unidad_medida || "-"}</td>
    </tr>
  `).join("");
}

function renderDetalle(rows = []) {
  const tbody = document.getElementById("tbDetalle");
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="7">Sin datos</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map((r) => `
    <tr>
      <td>${r.id || "-"}</td>
      <td>${String(r.fecha || "").slice(0, 10)}</td>
      <td>${r.receta || "-"}</td>
      <td>${r.producto_final || "-"}</td>
      <td>${fmt(r.cantidad_producida)}</td>
      <td>${r.insumo || "-"}</td>
      <td>${fmt(r.cantidad_usada)} ${r.unidad_insumo || ""}</td>
    </tr>
  `).join("");
}

async function cargarReporte() {
  try {
    setStatus("Generando reporte...", "ok");

    const desde = document.getElementById("fDesde").value;
    const hasta = document.getElementById("fHasta").value;
    const qs = new URLSearchParams();
    if (desde) qs.set("desde", desde);
    if (hasta) qs.set("hasta", hasta);

    const res = await fetch(`${API}?${qs.toString()}`, { credentials: "include" });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data?.error || `Error ${res.status}`);
    }

    renderKpis(data.resumen || {});
    renderFecha(data.por_fecha || []);
    renderConsumo(data.consumo || []);
    renderDetalle(data.detalle || []);

    setStatus("Reporte generado", "ok");
  } catch (err) {
    setStatus(err.message || "No se pudo generar el reporte", "err");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const hoy = new Date().toISOString().slice(0, 10);
  const hace30 = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
  document.getElementById("fDesde").value = hace30;
  document.getElementById("fHasta").value = hoy;

  document.getElementById("btnBuscar").addEventListener("click", cargarReporte);
  cargarReporte();
});
