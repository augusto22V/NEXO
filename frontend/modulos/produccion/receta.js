const API_RECETAS = `${window.location.origin}/api/recetas`;
const API_PRODUCTOS = `${window.location.origin}/api/productos`;

const estado = {
  loadingGuardar: false,
  selectedFinal: null,
  pickerConfig: null
};

function debounce(fn, wait = 250) {
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

function setStatus(msg = "", type = "") {
  const el = document.getElementById("statusReceta");
  el.className = "status";
  el.textContent = msg;
  if (type) el.classList.add(type);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function fetchProductos(term, esInsumo, limit = 20) {
  const q = encodeURIComponent(term || "");
  const param = esInsumo === null || esInsumo === undefined ? "" : `&es_insumo=${encodeURIComponent(String(esInsumo))}`;
  const res = await fetch(`${API_PRODUCTOS}?buscar=${q}&limit=${limit}&page=1${param}`, { credentials: "include" });
  const data = await res.json().catch(() => []);
  if (!res.ok) throw new Error(data?.error || `Error ${res.status}`);
  return Array.isArray(data) ? data : [];
}

function hideList(el) {
  el.style.display = "none";
  el.innerHTML = "";
}

function renderInlineResults(listEl, items, onSelect) {
  listEl.innerHTML = items
    .map((p) => `
      <button type="button" class="autocomplete-item" data-id="${p.id}" data-nombre="${escapeHtml(p.nombre)}" data-unidad="${escapeHtml(p.unidad_medida || "unidad")}">
        ${escapeHtml(p.nombre)} <small>#${p.id} · ${escapeHtml(p.unidad_medida || "unidad")}</small>
      </button>
    `)
    .join("");

  if (!items.length) {
    listEl.innerHTML = `<div class="autocomplete-item no-result">Sin resultados</div>`;
  }

  listEl.style.display = "block";

  listEl.querySelectorAll(".autocomplete-item[data-id]").forEach((itemEl) => {
    itemEl.addEventListener("click", () => {
      onSelect({
        id: Number(itemEl.getAttribute("data-id")),
        nombre: itemEl.getAttribute("data-nombre"),
        unidad_medida: itemEl.getAttribute("data-unidad")
      });
      hideList(listEl);
    });
  });
}

function attachProductAutocomplete({ inputEl, hiddenIdEl, listEl, onSelect, esInsumo }) {
  const doSearch = debounce(async () => {
    const term = inputEl.value.trim();
    if (term.length < 1) {
      hideList(listEl);
      return;
    }

    try {
      const items = await fetchProductos(term, esInsumo, 25);
      renderInlineResults(listEl, items, (prod) => {
        hiddenIdEl.value = String(prod.id);
        inputEl.value = prod.nombre;
        if (typeof onSelect === "function") onSelect(prod);
      });
    } catch {
      hideList(listEl);
    }
  }, 180);

  inputEl.addEventListener("input", () => {
    hiddenIdEl.value = "";
    doSearch();
  });

  inputEl.addEventListener("focus", () => {
    if (inputEl.value.trim().length >= 1) doSearch();
  });

  document.addEventListener("click", (e) => {
    if (!listEl.contains(e.target) && e.target !== inputEl) hideList(listEl);
  });
}

function getPickerElements() {
  return {
    overlay: document.getElementById("pickerOverlay"),
    titulo: document.getElementById("pickerTitulo"),
    buscar: document.getElementById("pickerBuscar"),
    lista: document.getElementById("pickerLista")
  };
}

function closePicker() {
  const { overlay, buscar, lista } = getPickerElements();
  overlay.hidden = true;
  buscar.value = "";
  lista.innerHTML = "";
  estado.pickerConfig = null;
}

function renderPickerItems(items, onPick) {
  const { lista } = getPickerElements();
  lista.innerHTML = items
    .map((p) => `
      <button type="button" class="picker-item" data-id="${p.id}" data-nombre="${escapeHtml(p.nombre)}" data-unidad="${escapeHtml(p.unidad_medida || "unidad")}">
        <span>${escapeHtml(p.nombre)}</span>
        <small>#${p.id} · ${escapeHtml(p.unidad_medida || "unidad")}</small>
      </button>
    `)
    .join("");

  if (!items.length) {
    lista.innerHTML = `<div class="picker-empty">Sin resultados</div>`;
    return;
  }

  lista.querySelectorAll(".picker-item").forEach((itemEl) => {
    itemEl.addEventListener("click", () => {
      onPick({
        id: Number(itemEl.getAttribute("data-id")),
        nombre: itemEl.getAttribute("data-nombre"),
        unidad_medida: itemEl.getAttribute("data-unidad")
      });
      closePicker();
    });
  });
}

async function refreshPickerList() {
  if (!estado.pickerConfig) return;
  const { buscar } = getPickerElements();
  const term = buscar.value.trim();
  const items = await fetchProductos(term, estado.pickerConfig.esInsumo, 40);
  renderPickerItems(items, estado.pickerConfig.onPick);
}

async function openPicker(config) {
  const { overlay, titulo, buscar } = getPickerElements();
  estado.pickerConfig = config;
  titulo.textContent = config.title;
  buscar.value = "";
  overlay.hidden = false;
  buscar.focus();

  try {
    await refreshPickerList();
  } catch {
    const { lista } = getPickerElements();
    lista.innerHTML = `<div class="picker-empty">No se pudo cargar la lista</div>`;
  }
}

function assignProductoFinal(prod) {
  document.getElementById("productoFinalId").value = String(prod.id);
  document.getElementById("productoFinalSearch").value = prod.nombre;
  estado.selectedFinal = prod;

  const nombre = document.getElementById("nombreReceta");
  if (!nombre.value.trim()) {
    nombre.value = `Receta ${prod.nombre}`;
  }
}

function seleccionarProducto(producto) {
  const inputProducto = estado.seleccionContext?.inputProducto;
  const inputUnidad = estado.seleccionContext?.inputUnidad;
  if (!inputProducto || !inputUnidad) return;
  inputProducto.value = producto?.nombre || "";
  inputUnidad.value = producto?.unidad_medida || "unidad";
}

function assignInsumoToRow(row, prod) {
  row.querySelector(".insumo-id").value = String(prod.id);
  estado.seleccionContext = {
    inputProducto: row.querySelector(".insumo-search"),
    inputUnidad: row.querySelector(".insumo-unidad")
  };
  seleccionarProducto(prod);
}

function createInsumoRow() {
  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td>
      <div class="autocomplete-wrap">
        <div class="input-with-action">
          <input class="insumo-search" type="text" placeholder="Buscar insumo..." />
          <button type="button" class="btn-lupa btn-insumo-picker" title="Buscar insumo">??</button>
        </div>
        <input class="insumo-id" type="hidden" />
        <div class="autocomplete-list"></div>
      </div>
    </td>
    <td><input class="insumo-cantidad" type="number" min="0.0001" step="0.0001" placeholder="0" /></td>
    <td><input class="insumo-unidad" type="text" disabled placeholder="Unidad" /></td>
    <td><button type="button" class="btn btn-danger btn-remove">Quitar</button></td>
  `;

  tr.querySelector(".btn-remove").addEventListener("click", () => tr.remove());

  const searchInput = tr.querySelector(".insumo-search");
  const idInput = tr.querySelector(".insumo-id");
  const unidadInput = tr.querySelector(".insumo-unidad");
  const listEl = tr.querySelector(".autocomplete-list");

  attachProductAutocomplete({
    inputEl: searchInput,
    hiddenIdEl: idInput,
    listEl,
    esInsumo: true,
    onSelect: (prod) => {
      estado.seleccionContext = {
        inputProducto: searchInput,
        inputUnidad: unidadInput
      };
      seleccionarProducto(prod);
    }
  });

  tr.querySelector(".btn-insumo-picker").addEventListener("click", async () => {
    await openPicker({
      title: "Seleccionar insumo",
      esInsumo: true,
      onPick: (prod) => assignInsumoToRow(tr, prod)
    });
  });

  searchInput.addEventListener("input", () => {
    if (!searchInput.value.trim()) {
      idInput.value = "";
      unidadInput.value = "";
    }
  });

  return tr;
}

function collectDetalles() {
  const rows = Array.from(document.querySelectorAll("#tbodyInsumos tr"));
  const detalles = [];
  const finalId = Number(document.getElementById("productoFinalId").value || 0);
  let hasError = false;

  rows.forEach((row) => {
    row.classList.remove("row-error");
    const productoId = Number(row.querySelector(".insumo-id").value || 0);
    const cantidad = Number(row.querySelector(".insumo-cantidad").value || 0);

    if (!productoId || cantidad <= 0) {
      row.classList.add("row-error");
      hasError = true;
      return;
    }

    if (finalId && productoId === finalId) {
      row.classList.add("row-error");
      hasError = true;
      return;
    }

    detalles.push({
      producto_insumo_id: productoId,
      cantidad
    });
  });

  if (hasError) {
    throw new Error("Complete correctamente los insumos y evite usar el producto final como insumo");
  }

  if (!detalles.length) {
    throw new Error("No se puede guardar receta vacia");
  }

  return detalles;
}

async function guardarReceta(e) {
  e.preventDefault();
  if (estado.loadingGuardar) return;

  try {
    const productoId = Number(document.getElementById("productoFinalId").value || 0);
    const nombre = document.getElementById("nombreReceta").value.trim();

    if (!productoId) throw new Error("Seleccione un producto final valido");

    const detalles = collectDetalles();

    estado.loadingGuardar = true;
    setStatus("Guardando receta...", "ok");
    document.getElementById("btnGuardarReceta").disabled = true;

    const res = await fetch(API_RECETAS, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        producto_id: productoId,
        nombre,
        detalles
      })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || `Error ${res.status}`);

    setStatus("Receta guardada correctamente.", "ok");

    const recetaId = data?.receta?.id || "";
    document.getElementById("recetaId").value = recetaId ? String(recetaId) : "";

    document.getElementById("nombreReceta").value = "";
    document.getElementById("productoFinalId").value = "";
    document.getElementById("productoFinalSearch").value = "";
    document.getElementById("tbodyInsumos").innerHTML = "";
    document.getElementById("tbodyInsumos").appendChild(createInsumoRow());

    await cargarRecetas();
  } catch (err) {
    setStatus(err.message || "No se pudo guardar la receta", "err");
  } finally {
    estado.loadingGuardar = false;
    document.getElementById("btnGuardarReceta").disabled = false;
  }
}

async function cargarRecetas() {
  const term = document.getElementById("buscarReceta").value.trim();
  const q = encodeURIComponent(term);

  const res = await fetch(`${API_RECETAS}?buscar=${q}&limit=50`, { credentials: "include" });
  const data = await res.json().catch(() => []);
  if (!res.ok) throw new Error(data?.error || `Error ${res.status}`);

  const tbody = document.getElementById("tbodyRecetas");
  tbody.innerHTML = (data || []).map((r) => `
    <tr data-id="${r.id}">
      <td>${r.id}</td>
      <td>${escapeHtml(r.nombre || "-")}</td>
      <td>${escapeHtml(r.producto_final || "-")}</td>
      <td>${Number(r.insumos || 0)}</td>
    </tr>
  `).join("");

  tbody.querySelectorAll("tr").forEach((tr) => {
    tr.addEventListener("click", () => verDetalleReceta(tr.dataset.id));
  });
}

function renderDetalleReceta(data) {
  const box = document.getElementById("detalleReceta");
  const detalles = Array.isArray(data?.detalles) ? data.detalles : [];
  const unidadFinal = data?.unidad_producto_final || data?.unidad_medida || "unidad";

  const insumosHtml = detalles.length
    ? detalles
      .map((d) => `
        <li>
          <span>${escapeHtml(d.producto_insumo || d.nombre || "Insumo")}</span>
          <strong>${Number(d.cantidad || 0).toLocaleString("es-PY")} ${escapeHtml(d.unidad || d.unidad_producto || "unidad")}</strong>
        </li>
      `)
      .join("")
    : `<li><span>Sin insumos registrados</span></li>`;

  box.innerHTML = `
    <div class="detalle-line"><span>Producto final:</span><strong>${escapeHtml(data?.producto_final || "-")}</strong></div>
    <div class="detalle-line"><span>Unidad:</span><strong>${escapeHtml(unidadFinal)}</strong></div>
    <div class="detalle-title">Insumos:</div>
    <ul class="detalle-lista">${insumosHtml}</ul>
  `;
}

async function verDetalleReceta(id) {
  document.getElementById("recetaId").value = id ? String(id) : "";
  const res = await fetch(`${API_RECETAS}/${id}`, { credentials: "include" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Error ${res.status}`);

  renderDetalleReceta(data);
}

function initAutocompleteProductoFinal() {
  const inputEl = document.getElementById("productoFinalSearch");
  const hiddenIdEl = document.getElementById("productoFinalId");
  const listEl = document.getElementById("productoFinalList");

  attachProductAutocomplete({
    inputEl,
    hiddenIdEl,
    listEl,
    esInsumo: false,
    onSelect: (prod) => {
      estado.selectedFinal = prod;
      const nombre = document.getElementById("nombreReceta");
      if (!nombre.value.trim()) {
        nombre.value = `Receta ${prod.nombre}`;
      }
    }
  });

  inputEl.addEventListener("input", () => {
    if (!inputEl.value.trim()) {
      hiddenIdEl.value = "";
      estado.selectedFinal = null;
    }
  });

  document.getElementById("btnBuscarProductoFinal").addEventListener("click", async () => {
    await openPicker({
      title: "Seleccionar producto final",
      esInsumo: false,
      onPick: assignProductoFinal
    });
  });
}

function initPickerEvents() {
  const { overlay, buscar } = getPickerElements();

  document.getElementById("pickerCerrar").addEventListener("click", closePicker);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closePicker();
  });

  buscar.addEventListener("input", debounce(async () => {
    try {
      await refreshPickerList();
    } catch {
      const { lista } = getPickerElements();
      lista.innerHTML = `<div class="picker-empty">No se pudo cargar la lista</div>`;
    }
  }, 180));
}

document.addEventListener("DOMContentLoaded", async () => {
  document.getElementById("btnIrProduccion").addEventListener("click", () => {
    window.location.href = "produccion.html";
  });

  document.getElementById("btnAgregarInsumo").addEventListener("click", () => {
    document.getElementById("tbodyInsumos").appendChild(createInsumoRow());
  });

  document.getElementById("btnRefrescarRecetas").addEventListener("click", async () => {
    try {
      await cargarRecetas();
      setStatus("Listado actualizado", "ok");
    } catch (err) {
      setStatus(err.message || "No se pudo actualizar", "err");
    }
  });

  document.getElementById("buscarReceta").addEventListener("input", debounce(async () => {
    try {
      await cargarRecetas();
    } catch {}
  }, 250));

  document.getElementById("formReceta").addEventListener("submit", guardarReceta);

  initPickerEvents();
  initAutocompleteProductoFinal();
  document.getElementById("tbodyInsumos").appendChild(createInsumoRow());

  try {
    await cargarRecetas();
  } catch (err) {
    setStatus(err.message || "No se pudo cargar recetas", "err");
  }
});




