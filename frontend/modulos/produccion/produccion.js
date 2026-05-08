const API_PRODUCCION = `${window.location.origin}/api/produccion`;
const API_RECETAS = `${window.location.origin}/api/recetas`;

const uiState = {
  loadingPreview: false,
  loadingCreate: false,
  selectedReceta: null,
  lastPreview: null
};

function debounce(fn, wait = 250) {
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function setStatus(msg = "", type = "") {
  const el = document.getElementById("statusProd");
  el.className = "status";
  el.textContent = msg;
  if (type) el.classList.add(type);
}

function hideList(el) {
  el.style.display = "none";
  el.innerHTML = "";
}

async function fetchRecetas(term, limit = 25) {
  const q = encodeURIComponent(term || "");
  const res = await fetch(`${API_RECETAS}?buscar=${q}&limit=${limit}`, { credentials: "include" });
  const data = await res.json().catch(() => []);
  if (!res.ok) throw new Error(data?.error || `Error ${res.status}`);
  return Array.isArray(data) ? data : [];
}

function assignReceta(receta) {
  uiState.selectedReceta = receta;
  document.getElementById("recetaId").value = String(receta.id);
  document.getElementById("recetaSearch").value = receta.nombre || "";
  document.getElementById("productoFinalNombre").value = receta.producto_final || "";
}

function renderRecetaInlineList(listEl, rows) {
  listEl.innerHTML = rows
    .map((r) => `
      <button type="button" class="autocomplete-item"
        data-id="${r.id}"
        data-nombre="${escapeHtml(r.nombre || "")}" 
        data-producto="${escapeHtml(r.producto_final || "")}">
        ${escapeHtml(r.nombre || "-")}
        <small>#${r.id} · ${escapeHtml(r.producto_final || "-")}</small>
      </button>
    `)
    .join("");

  if (!rows.length) {
    listEl.innerHTML = `<div class="autocomplete-item no-result">Sin resultados</div>`;
  }

  listEl.style.display = "block";

  listEl.querySelectorAll(".autocomplete-item[data-id]").forEach((itemEl) => {
    itemEl.addEventListener("click", () => {
      assignReceta({
        id: Number(itemEl.getAttribute("data-id")),
        nombre: itemEl.getAttribute("data-nombre"),
        producto_final: itemEl.getAttribute("data-producto")
      });
      hideList(listEl);
    });
  });
}

function attachRecetaAutocomplete() {
  const inputEl = document.getElementById("recetaSearch");
  const listEl = document.getElementById("recetaList");

  const doSearch = debounce(async () => {
    const term = inputEl.value.trim();
    if (term.length < 1) {
      hideList(listEl);
      return;
    }

    try {
      const rows = await fetchRecetas(term, 30);
      renderRecetaInlineList(listEl, rows);
    } catch {
      hideList(listEl);
    }
  }, 180);

  inputEl.addEventListener("input", () => {
    document.getElementById("recetaId").value = "";
    uiState.selectedReceta = null;
    document.getElementById("productoFinalNombre").value = "";
    doSearch();
  });

  inputEl.addEventListener("focus", () => {
    if (inputEl.value.trim().length >= 1) doSearch();
  });

  document.addEventListener("click", (e) => {
    if (!listEl.contains(e.target) && e.target !== inputEl) hideList(listEl);
  });
}

function getPayloadBase() {
  const recetaId = Number(document.getElementById("recetaId").value || 0);
  const cantidad = Number(document.getElementById("cantidadProducida").value || 0);
  const fecha = document.getElementById("fechaProduccion").value || null;

  if (!recetaId) throw new Error("Seleccione una receta valida");
  if (!(cantidad > 0)) throw new Error("Ingrese una cantidad valida");

  return {
    receta_id: recetaId,
    cantidad_producida: cantidad,
    fecha
  };
}

function renderPreview(preview) {
  uiState.lastPreview = preview;
  const tbody = document.getElementById("tbodyPreview");
  const items = Array.isArray(preview?.insumos) ? preview.insumos : [];

  if (!items.length) {
    tbody.innerHTML = `<tr><td colspan="5">Sin datos de previsualización</td></tr>`;
    return;
  }

  tbody.innerHTML = items.map((i) => {
    const ok = i.no_control_stock || Number(i.stock_actual) >= Number(i.cantidad_usada);
    return `
      <tr>
        <td>${escapeHtml(i.producto_insumo || "-")}</td>
        <td>${Number(i.cantidad_usada || 0).toLocaleString("es-PY")}</td>
        <td>${escapeHtml(i.unidad_producto || "-")}</td>
        <td>${i.no_control_stock ? "No controla" : Number(i.stock_actual || 0).toLocaleString("es-PY")}</td>
        <td class="${ok ? "badge-ok" : "badge-err"}">${ok ? "OK" : "Insuficiente"}</td>
      </tr>
    `;
  }).join("");
}

async function previsualizar() {
  if (uiState.loadingPreview) return;
  try {
    const payload = getPayloadBase();

    uiState.loadingPreview = true;
    setStatus("Calculando previsualización...", "ok");
    document.getElementById("btnPreview").disabled = true;

    const res = await fetch(`${API_PRODUCCION}/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload)
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || `Error ${res.status}`);

    renderPreview(data);

    if (data?.stock?.ok === false) {
      setStatus("La receta no tiene stock suficiente para producir", "err");
    } else {
      setStatus("Previsualización generada", "ok");
    }
  } catch (err) {
    setStatus(err.message || "No se pudo previsualizar", "err");
  } finally {
    uiState.loadingPreview = false;
    document.getElementById("btnPreview").disabled = false;
  }
}

async function crearProduccion(e) {
  e.preventDefault();
  if (uiState.loadingCreate) return;

  try {
    const payload = getPayloadBase();

    uiState.loadingCreate = true;
    setStatus("Registrando producción...", "ok");
    document.getElementById("btnCrear").disabled = true;

    const res = await fetch(API_PRODUCCION, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload)
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || `Error ${res.status}`);

    const produccionId = data?.produccion?.id || "";
    document.getElementById("produccionId").value = produccionId ? String(produccionId) : "";
    setStatus(`Producción ${data?.produccion?.id || ""} registrada correctamente`, "ok");

    await cargarListado();
    await verDetalle(data?.produccion?.id);
  } catch (err) {
    setStatus(err.message || "No se pudo registrar la producción", "err");
  } finally {
    uiState.loadingCreate = false;
    document.getElementById("btnCrear").disabled = false;
  }
}

async function cargarListado() {
  const res = await fetch(API_PRODUCCION, { credentials: "include" });
  const data = await res.json().catch(() => []);
  if (!res.ok) throw new Error(data?.error || `Error ${res.status}`);

  const tbody = document.getElementById("tbodyProduccion");
  tbody.innerHTML = (data || []).map((r) => `
    <tr data-id="${r.id}">
      <td>${r.id}</td>
      <td>${String(r.fecha || "").slice(0, 10)}</td>
      <td>${escapeHtml(r.receta_nombre || "-")}</td>
      <td>${escapeHtml(r.producto_final || "-")}</td>
      <td>${Number(r.cantidad_producida || 0).toLocaleString("es-PY")}</td>
      <td>${escapeHtml(r.usuario_nombre || "-")}</td>
    </tr>
  `).join("");

  tbody.querySelectorAll("tr").forEach((tr) => {
    tr.addEventListener("click", () => verDetalle(tr.dataset.id));
  });
}

function renderDetalleProduccion(data) {
  const box = document.getElementById("detalleProduccion");
  const produccion = data?.produccion || data || {};
  const consumos = Array.isArray(data?.consumos)
    ? data.consumos
    : Array.isArray(produccion?.consumos)
      ? produccion.consumos
      : [];

  const items = consumos.length
    ? consumos
      .map((c) => `
        <li>
          <span>${escapeHtml(c.producto_insumo || c.nombre || "Insumo")}</span>
          <strong>${Number(c.cantidad_usada || c.cantidad || 0).toLocaleString("es-PY")}</strong>
        </li>
      `)
      .join("")
    : `<li><span>Sin consumos registrados</span></li>`;

  box.innerHTML = `
    <div class="detalle-line"><span>Receta:</span><strong>${escapeHtml(produccion.receta_nombre || "-")}</strong></div>
    <div class="detalle-line"><span>Producto final:</span><strong>${escapeHtml(produccion.producto_final || "-")}</strong></div>
    <div class="detalle-line"><span>Cantidad:</span><strong>${Number(produccion.cantidad_producida || 0).toLocaleString("es-PY")}</strong></div>
    <div class="detalle-title">Insumos usados:</div>
    <ul class="detalle-lista">${items}</ul>
  `;
}

async function verDetalle(id) {
  if (!id) return;
  document.getElementById("produccionId").value = String(id);

  const res = await fetch(`${API_PRODUCCION}/${id}`, { credentials: "include" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Error ${res.status}`);

  renderDetalleProduccion(data);
}

function getPickerEls() {
  return {
    overlay: document.getElementById("pickerRecetaOverlay"),
    buscar: document.getElementById("pickerRecetaBuscar"),
    lista: document.getElementById("pickerRecetaLista")
  };
}

function closeRecetaPicker() {
  const { overlay, buscar, lista } = getPickerEls();
  overlay.hidden = true;
  buscar.value = "";
  lista.innerHTML = "";
}

function renderRecetaPicker(rows) {
  const { lista } = getPickerEls();
  lista.innerHTML = rows
    .map((r) => `
      <button type="button" class="picker-item"
        data-id="${r.id}"
        data-nombre="${escapeHtml(r.nombre || "")}" 
        data-producto="${escapeHtml(r.producto_final || "")}">
        <span>${escapeHtml(r.nombre || "-")}</span>
        <small>#${r.id} · ${escapeHtml(r.producto_final || "-")}</small>
      </button>
    `)
    .join("");

  if (!rows.length) {
    lista.innerHTML = `<div class="picker-empty">Sin resultados</div>`;
    return;
  }

  lista.querySelectorAll(".picker-item").forEach((itemEl) => {
    itemEl.addEventListener("click", () => {
      assignReceta({
        id: Number(itemEl.getAttribute("data-id")),
        nombre: itemEl.getAttribute("data-nombre"),
        producto_final: itemEl.getAttribute("data-producto")
      });
      closeRecetaPicker();
    });
  });
}

async function refreshRecetaPicker() {
  const { buscar } = getPickerEls();
  const rows = await fetchRecetas(buscar.value.trim(), 40);
  renderRecetaPicker(rows);
}

function initRecetaPicker() {
  const { overlay, buscar, lista } = getPickerEls();

  document.getElementById("btnBuscarReceta").addEventListener("click", async () => {
    overlay.hidden = false;
    buscar.value = "";
    buscar.focus();
    try {
      await refreshRecetaPicker();
    } catch {
      lista.innerHTML = `<div class="picker-empty">No se pudo cargar la lista</div>`;
    }
  });

  document.getElementById("pickerRecetaCerrar").addEventListener("click", closeRecetaPicker);

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeRecetaPicker();
  });

  buscar.addEventListener("input", debounce(async () => {
    try {
      await refreshRecetaPicker();
    } catch {
      lista.innerHTML = `<div class="picker-empty">No se pudo cargar la lista</div>`;
    }
  }, 180));
}

document.addEventListener("DOMContentLoaded", async () => {
  document.getElementById("fechaProduccion").value = new Date().toISOString().slice(0, 10);

  document.getElementById("btnIrRecetas").addEventListener("click", () => {
    window.location.href = "receta.html";
  });

  document.getElementById("btnPreview").addEventListener("click", previsualizar);
  document.getElementById("btnRefrescarProd").addEventListener("click", async () => {
    try {
      await cargarListado();
      setStatus("Listado actualizado", "ok");
    } catch (err) {
      setStatus(err.message || "No se pudo actualizar", "err");
    }
  });

  document.getElementById("formProduccion").addEventListener("submit", crearProduccion);

  attachRecetaAutocomplete();
  initRecetaPicker();

  try {
    await cargarListado();
  } catch (err) {
    setStatus(err.message || "No se pudo cargar historial", "err");
  }
});




