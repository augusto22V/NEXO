const API = `${window.location.origin}/api`;
let chartFecha = null;
let chartProducto = null;

const toNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const fmt = (v) => {
  if (v == null) return "-";
  if (typeof v === "number") return v.toLocaleString("es-PY");
  return String(v);
};

function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function setStatus(message, type = "") {
  const el = document.getElementById("status");
  el.className = "status";
  if (!message) {
    el.textContent = "";
    return;
  }
  el.textContent = message;
  if (type === "ok") el.classList.add("ok");
  if (type === "err") el.classList.add("err");
}

function renderQuickAnswer(data = {}) {
  const box = document.getElementById("quickAnswer");
  const text = data?.respuesta_rapida || data?.resumen_texto || "No hay respuesta disponible para la consulta.";
  box.innerHTML = `<p>${escapeHtml(text)}</p>`;
}

function renderMeta(data = {}) {
  const meta = data?.meta || {};
  const interp = data?.interpretation || {};
  const structured = interp?.consulta_estructurada || {};
  const contexto = interp?.contexto_selector || "todos";
  const modulo = structured?.modulo || meta?.modulo || interp?.modulo_aplicado || interp?.modulo || "-";
  const tipo = structured?.tipo || meta?.tipo || interp?.tipo || "-";
  const tipoReporte = interp?.tipo_aplicado || meta?.tipo || "-";
  const desde = structured?.fecha_desde || meta?.desde || interp?.filtros_aplicados?.desde || "-";
  const hasta = structured?.fecha_hasta || meta?.hasta || interp?.filtros_aplicados?.hasta || "-";
  const intent = structured?.intencion || interp?.intencion || "general";
  const filtros = structured?.filtros && typeof structured.filtros === "object" ? structured.filtros : {};
  const filtrosText = Object.entries(filtros)
    .filter(([, value]) => value != null && value !== "")
    .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(", ") : value}`)
    .join(" | ") || "sin filtros";
  const validacion = interp?.validacion?.posible_error_filtros
    ? " | Validacion: revisar filtros si el resultado es 0"
    : "";

  document.getElementById("metaText").textContent =
    `Contexto: ${contexto} | Modulo: ${modulo} | Intencion: ${intent} | Tipo: ${tipo} | Reporte: ${tipoReporte} | Desde: ${desde} | Hasta: ${hasta} | Filtros: ${filtrosText}${validacion}`;
}
function renderAnalysis(data = {}) {
  const analysisList = document.getElementById("analysisList");
  const recommendList = document.getElementById("recommendList");
  if (!analysisList || !recommendList) return;

  const a = data?.analisis || {};
  const bestClient = a?.mejor_cliente;
  const topProduct = a?.producto_mas_vendido;
  const lowProduct = a?.producto_menos_vendido;
  const bestDay = a?.mejor_dia;
  const weekRows = Array.isArray(a?.dia_semana) ? a.dia_semana : [];

  const lines = [];
  if (bestDay?.dia) {
    lines.push(`Mejor dia: ${bestDay.dia} (Total: ${fmt(Math.round(toNum(bestDay.total_monto)))} Gs, Transacciones: ${fmt(bestDay.transacciones)})`);
  }
  if (bestClient?.cliente) {
    lines.push(`Mejor cliente: ${bestClient.cliente} (Total: ${fmt(Math.round(toNum(bestClient.monto)))} Gs, Compras: ${fmt(bestClient.transacciones)})`);
  }
  if (topProduct?.producto) {
    lines.push(`Producto mas vendido: ${topProduct.producto} (${fmt(topProduct.cantidad)} unidades)`);
  }
  if (lowProduct?.producto) {
    lines.push(`Producto menos vendido: ${lowProduct.producto} (${fmt(lowProduct.cantidad)} unidades)`);
  }

  if (weekRows.length) {
    const resumenSemana = weekRows
      .map((r) => `${r.dia}: ${fmt(Math.round(toNum(r.total_monto)))} Gs (${fmt(r.transacciones)} transacciones)`)
      .join(" | ");
    lines.push(`Semana: ${resumenSemana}`);
  }

  if (!lines.length) lines.push("Sin analisis disponible para esta consulta.");
  analysisList.innerHTML = lines.map((l) => `<li>${escapeHtml(l)}</li>`).join("");

  const recs = Array.isArray(data?.recomendaciones) ? data.recomendaciones : [];
  recommendList.innerHTML = (recs.length ? recs : ["Sin recomendaciones por el momento."])
    .map((r) => `<li>${escapeHtml(r)}</li>`)
    .join("");
}

function buildKPIs(summary = {}, rows = []) {
  const totalMonto = toNum(summary.total_monto ?? summary.total_ventas ?? summary.total_pagado_gs ?? 0);
  const totalCantidad = toNum(summary.total_cantidad ?? summary.total_movimientos ?? summary.cant_ventas ?? 0);
  const totalRows = toNum(summary.rows ?? rows.length);
  const promedio = totalCantidad > 0 ? totalMonto / totalCantidad : (totalRows > 0 ? totalMonto / totalRows : 0);

  const cards = [
    ["Total", fmt(totalMonto)],
    ["Cantidad", fmt(totalCantidad)],
    ["Promedio", fmt(Math.round(promedio))],
    ["Registros", fmt(totalRows)]
  ];

  const el = document.getElementById("kpiGrid");
  el.innerHTML = cards.map(([label, value]) => `
    <article class="kpi ia-kpi">
      <label>${escapeHtml(label)}</label>
      <strong>${escapeHtml(value)}</strong>
    </article>
  `).join("");
}

function pickAmount(r) {
  return toNum(r.monto ?? r.total ?? r.subtotal ?? r.total_venta ?? r.total_ventas ?? r.precio_unitario ?? r.precio ?? 0);
}

function buildFechaSeries(rows = []) {
  const map = new Map();
  rows.forEach((r) => {
    const f = r.fecha ?? r.dia ?? r.date;
    if (!f) return;
    const key = String(f).slice(0, 10);
    map.set(key, (map.get(key) || 0) + pickAmount(r));
  });
  const labels = Array.from(map.keys()).sort();
  return { labels, data: labels.map((l) => map.get(l)) };
}

function buildProductoSeries(rows = []) {
  const map = new Map();
  rows.forEach((r) => {
    const p = r.producto ?? r.producto_nombre ?? r.descripcion;
    if (!p) return;
    map.set(p, (map.get(p) || 0) + pickAmount(r));
  });
  const top = Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10);
  return { labels: top.map((i) => i[0]), data: top.map((i) => i[1]) };
}

function renderCharts(rows = []) {
  const byFecha = buildFechaSeries(rows);
  const byProd = buildProductoSeries(rows);

  if (chartFecha) chartFecha.destroy();
  if (chartProducto) chartProducto.destroy();

  chartFecha = new Chart(document.getElementById("chartFecha"), {
    type: "line",
    data: {
      labels: byFecha.labels,
      datasets: [{
        label: "Monto",
        data: byFecha.data,
        borderColor: "#229cac",
        backgroundColor: "rgba(34,156,172,0.2)",
        fill: true,
        tension: 0.25,
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: "#334155" } } },
      scales: {
        x: { ticks: { color: "#64748b" }, grid: { color: "#e2e8f0" } },
        y: { ticks: { color: "#64748b" }, grid: { color: "#e2e8f0" } }
      }
    }
  });

  chartProducto = new Chart(document.getElementById("chartProducto"), {
    type: "bar",
    data: {
      labels: byProd.labels,
      datasets: [{
        label: "Monto",
        data: byProd.data,
        backgroundColor: "rgba(126,217,87,0.8)",
        borderColor: "#6bc74b",
        borderWidth: 1,
        borderRadius: 8
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: "#334155" } } },
      scales: {
        x: { ticks: { color: "#64748b" }, grid: { color: "#e2e8f0" } },
        y: { ticks: { color: "#64748b" }, grid: { color: "#e2e8f0" } }
      }
    }
  });
}

function renderTable(rows = []) {
  const thead = document.getElementById("theadRows");
  const tbody = document.getElementById("tbodyRows");

  if (!Array.isArray(rows) || !rows.length) {
    thead.innerHTML = "<tr><th>Resultado</th></tr>";
    tbody.innerHTML = "<tr><td>Sin resultados</td></tr>";
    return;
  }

  const cols = Object.keys(rows[0]);
  thead.innerHTML = `<tr>${cols.map((c) => `<th>${escapeHtml(c)}</th>`).join("")}</tr>`;

  tbody.innerHTML = rows.map((r) => `
    <tr>
      ${cols.map((c) => {
        const raw = r[c];
        const val = typeof raw === "number" ? raw.toLocaleString("es-PY") : (raw == null ? "-" : String(raw));
        const cls = typeof raw === "number" ? "text-right" : "";
        return `<td class="${cls}" title="${escapeHtml(val)}">${escapeHtml(val)}</td>`;
      }).join("")}
    </tr>
  `).join("");
}

async function generar() {
  const prompt = document.getElementById("prompt").value.trim();
  if (!prompt) {
    setStatus("Ingrese una consulta para generar el informe.", "err");
    return;
  }

  setStatus("Generando informe...", "ok");

  try {
    const contexto = document.getElementById("contextSelector")?.value || "todos";

    const res = await fetch(`${API}/reportes-ia`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ prompt, contexto })
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data?.error || `Error ${res.status}`);
    }

    renderMeta(data);
    renderQuickAnswer(data);
    renderAnalysis(data);
    buildKPIs(data.summary || {}, data.rows || []);
    renderCharts(data.rows || []);
    renderTable(data.rows || []);
    setStatus("Informe generado correctamente.", "ok");
  } catch (err) {
    setStatus(`No se pudo generar (${err?.message || "Error"})`, "err");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("fechaGenerado").textContent = `Actualizado: ${new Date().toLocaleString("es-PY")}`;
  document.getElementById("btnGenerar").addEventListener("click", generar);
  document.getElementById("prompt").addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      generar();
    }
  });

  renderQuickAnswer({ resumen_texto: "Escriba una consulta para ver una respuesta rapida aqui." });
  renderAnalysis({});
  buildKPIs({}, []);
  renderCharts([]);
});








