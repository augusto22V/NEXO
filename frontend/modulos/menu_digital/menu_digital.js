const MENU_DIGITAL_API = "/api/menu-digital";
const DEFAULT_MENU_PRIMARY = "#147696";
const DEFAULT_MENU_SECONDARY = "#E6F1F4";
const DEFAULT_MENU_BACKGROUND = "linear-gradient(135deg, #f5f7f9 0%, #edf2f5 48%, #e2ebf0 100%)";
const LEGACY_MENU_PRIMARY = "#B43C2F";
const LEGACY_MENU_SECONDARY = "#F6EBD9";

const state = {
  bootstrap: null,
  activeTab: "resumen",
  dirty: false
};

function $(id) {
  return document.getElementById(id);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatGs(value) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return "Gs 0";
  return `Gs ${amount.toLocaleString("es-PY", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function normalizeHexColor(value, fallback = DEFAULT_MENU_PRIMARY) {
  const raw = String(value || "").trim().toUpperCase();
  const normalized = /^#([0-9A-F]{3}|[0-9A-F]{6})$/.test(raw) ? raw : fallback;

  if (normalized === LEGACY_MENU_PRIMARY && fallback === DEFAULT_MENU_PRIMARY) {
    return DEFAULT_MENU_PRIMARY;
  }

  if (normalized === LEGACY_MENU_SECONDARY && fallback === DEFAULT_MENU_SECONDARY) {
    return DEFAULT_MENU_SECONDARY;
  }

  return normalized;
}

function normalizePublicBaseUrlInput(value) {
  const raw = String(value || "").trim().replace(/\/+$/, "");
  if (!raw) return "";

  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `http://${raw}`;

  try {
    const parsed = new URL(candidate);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return "";
    }

    const pathname = parsed.pathname && parsed.pathname !== "/"
      ? parsed.pathname.replace(/\/+$/, "")
      : "";

    return `${parsed.protocol}//${parsed.host}${pathname}`;
  } catch {
    return "";
  }
}

function derivePublicBaseUrlFromMenuLink(value, slug = "") {
  const raw = String(value || "").trim().replace(/\/+$/, "");
  if (!raw) return "";

  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `http://${raw}`;

  try {
    const parsed = new URL(candidate);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return "";
    }

    let pathname = parsed.pathname || "";
    const menuMarker = "/menu/";
    const markerIndex = pathname.toLowerCase().indexOf(menuMarker);
    if (markerIndex >= 0) {
      pathname = pathname.slice(0, markerIndex);
    } else if (slug) {
      const slugSuffix = `/${encodeURIComponent(slug)}`;
      if (pathname.endsWith(slugSuffix)) {
        pathname = pathname.slice(0, -slugSuffix.length);
      }
    }

    pathname = pathname && pathname !== "/" ? pathname.replace(/\/+$/, "") : "";
    return `${parsed.protocol}//${parsed.host}${pathname}`;
  } catch {
    return "";
  }
}

function movePublicBaseEditor() {
  const input = $("configPublicBaseUrl");
  const hint = $("configPublicBaseHint");
  const slot = $("publicBaseEditorSlot");
  if (!input || !hint || !slot) return;

  const label = input.previousElementSibling && input.previousElementSibling.tagName === "LABEL"
    ? input.previousElementSibling
    : null;

  if (label) slot.appendChild(label);
  slot.appendChild(input);
  slot.appendChild(hint);
}

function setColorControl(colorId, textId, value, fallback) {
  const normalized = normalizeHexColor(value, fallback);
  const colorInput = $(colorId);
  const textInput = $(textId);
  if (colorInput) colorInput.value = normalized;
  if (textInput) textInput.value = normalized;
  return normalized;
}

function bindColorControl(colorId, textId, fallback) {
  const colorInput = $(colorId);
  const textInput = $(textId);
  if (!colorInput || !textInput) return;

  const syncFromColor = () => {
    textInput.value = normalizeHexColor(colorInput.value, fallback);
  };

  const syncFromText = (commit = false) => {
    const raw = String(textInput.value || "").trim().toUpperCase();
    textInput.value = raw;
    if (/^#([0-9A-F]{3}|[0-9A-F]{6})$/.test(raw)) {
      colorInput.value = raw;
      return;
    }
    if (commit) {
      const normalized = normalizeHexColor(raw, colorInput.value || fallback);
      colorInput.value = normalized;
      textInput.value = normalized;
    }
  };

  colorInput.addEventListener("input", syncFromColor);
  colorInput.addEventListener("change", syncFromColor);
  textInput.addEventListener("input", () => syncFromText(false));
  textInput.addEventListener("blur", () => syncFromText(true));
}

function wireColorControls() {
  bindColorControl("categoriaMenuColor", "categoriaMenuColorText", DEFAULT_MENU_PRIMARY);
  bindColorControl("configColorPrincipal", "configColorPrincipalText", DEFAULT_MENU_PRIMARY);
  bindColorControl("configColorSecundario", "configColorSecundarioText", DEFAULT_MENU_SECONDARY);

  document.querySelectorAll(".md-color-preset").forEach((button) => {
    button.addEventListener("click", () => {
      const colorId = button.dataset.target || "";
      const textId = button.dataset.textTarget || "";
      const fallback = colorId === "configColorSecundario" ? DEFAULT_MENU_SECONDARY : DEFAULT_MENU_PRIMARY;
      setColorControl(colorId, textId, button.dataset.color || fallback, fallback);
      markDirty();
      renderPreview();
    });
  });
}

function sortByOrder(list) {
  return [...(Array.isArray(list) ? list : [])].sort((a, b) => {
    const diff = Number(a?.orden || 0) - Number(b?.orden || 0);
    if (diff !== 0) return diff;
    return Number(a?.id || 0) - Number(b?.id || 0);
  });
}

function sourceLabel(item) {
  if (!item) return "Manual";
  if (item.sincronizado && item.origen_tipo === "producto") return "Sincronizado desde producto";
  if (item.sincronizado && item.origen_tipo === "categoria") return "Sincronizado desde categoría";
  return "Manual";
}

function getConfig() {
  return state.bootstrap?.config || {};
}

function getCategories() {
  return sortByOrder(state.bootstrap?.categories || []);
}

function getItems() {
  return sortByOrder(state.bootstrap?.items || []);
}

function getPublication() {
  return state.bootstrap?.publication || {};
}

function markDirty() {
  state.dirty = true;
}

function clearDirty() {
  state.dirty = false;
}

function setStatusBadge(status) {
  const badge = $("estadoMenuBadge");
  if (!badge) return;
  badge.textContent = status || "BORRADOR";
}

function activarTab(tab) {
  state.activeTab = tab;
  document.querySelectorAll(".md-tab-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tab);
  });
  document.querySelectorAll(".md-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.panel === tab);
  });
}

window.activarTab = activarTab;

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    credentials: "include",
    ...options
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || "Error de comunicación");
  }
  return data;
}

function fillConfigForms() {
  const config = getConfig();
  const publication = getPublication();
  $("heroMenuNombre").textContent = config.nombre_publico || "Menú Digital";
  $("heroMenuMensaje").textContent = config.mensaje_principal || "Crea una carta moderna, visual y fácil de compartir con QR.";
  $("scopeMenuLabel").textContent = `${config.empresa_nombre || "Empresa"} · ${config.terminal_nombre || "Terminal"}`;
  setStatusBadge(config.estado);

  $("configNombrePublico").value = config.nombre_publico || "";
  $("configEstado").value = config.estado || "BORRADOR";
  $("configMensajePrincipal").value = config.mensaje_principal || "";
  $("configMensajeSecundario").value = config.mensaje_secundario || "";
  $("configHorarioAtencion").value = config.horario_atencion || "";
  $("configDatosContacto").value = config.datos_contacto || "";
  $("configPublicBaseUrl").value = config.public_base_url || "";
  $("configUsarLogoEmpresa").checked = config.usar_logo_empresa !== false;
  setColorControl("configColorPrincipal", "configColorPrincipalText", config.color_principal, DEFAULT_MENU_PRIMARY);
  setColorControl("configColorSecundario", "configColorSecundarioText", config.color_secundario, DEFAULT_MENU_SECONDARY);
  $("configFondoTipo").value = config.fondo_tipo || "gradient";
  $("configFondoValor").value = config.fondo_valor || DEFAULT_MENU_BACKGROUND;
  $("configLayoutCategorias").value = config.layout_categorias || "tabs";
  $("qrPreviewImage").src = `${publication.qr_png_url || ""}?ts=${Date.now()}`;
  refreshPublicationPreview(true);
}

function refreshPublicationPreview() {
  const publication = getPublication();
  const config = getConfig();
  const customBase = normalizePublicBaseUrlInput($("configPublicBaseUrl")?.value);
  const resolvedBase = customBase || publication.resolved_base_url || "";
  const publicUrl = resolvedBase && config.slug
    ? `${resolvedBase}/menu/${encodeURIComponent(config.slug)}`
    : (publication.public_url || "");

  $("configPublicBaseHint").textContent = customBase
    ? `Vista previa: ${customBase}`
    : `Base automática actual: ${publication.resolved_base_url || "sin resolver"}`;

  $("publicMenuLink").value = publicUrl;
}

function renderOverview() {
  const summary = state.bootstrap?.summary || {};
  const sourceSync = state.bootstrap?.source_sync || {};
  $("statCategorias").textContent = String(summary.categorias_total || 0);
  $("statItems").textContent = String(summary.items_total || 0);
  $("statDestacados").textContent = String(summary.items_destacados || 0);
  $("statEstado").textContent = getConfig().estado || "BORRADOR";
  $("resumenCategoriasMarcadas").textContent = String(sourceSync.categorias_marcadas || 0);
  $("resumenProductosMarcados").textContent = String(sourceSync.productos_marcados || 0);
}

function renderCategoryForm(category = null) {
  $("categoriaMenuId").value = category?.id || "";
  $("categoriaMenuNombre").value = category?.nombre || "";
  $("categoriaMenuDescripcion").value = category?.descripcion || "";
  setColorControl("categoriaMenuColor", "categoriaMenuColorText", category?.color, DEFAULT_MENU_PRIMARY);
  $("categoriaMenuIcono").value = category?.icono || "fa-utensils";
  $("categoriaMenuOrden").value = String(category?.orden || 0);
  $("categoriaMenuActiva").checked = category ? category.activo !== false : true;
  $("categoriaMenuVisible").checked = category ? category.visible_publico !== false : true;
  $("categoriaMenuAgotada").checked = category?.agotado === true;
  $("categoriaMenuImagen").value = "";
  $("categoriaMenuOrigen").textContent = sourceLabel(category);
  $("tituloFormCategoria").textContent = category ? "Editar categoría" : "Crear categoría";
}

function renderItemForm(item = null) {
  $("itemMenuId").value = item?.id || "";
  $("itemMenuCategoria").value = item?.categoria_id ? String(item.categoria_id) : "";
  $("itemMenuNombre").value = item?.nombre || "";
  $("itemMenuDescripcion").value = item?.descripcion || "";
  $("itemMenuPrecio").value = item?.precio != null ? String(item.precio) : "0";
  $("itemMenuOrden").value = String(item?.orden || 0);
  $("itemMenuDisponible").checked = item ? item.disponible !== false : true;
  $("itemMenuVisible").checked = item ? item.visible_publico !== false : true;
  $("itemMenuDestacado").checked = item?.destacado === true;
  $("itemMenuAgotado").checked = item?.agotado === true;
  $("itemMenuImagen").value = "";
  $("itemMenuOrigen").textContent = sourceLabel(item);
  $("tituloFormItem").textContent = item ? "Editar ítem" : "Crear ítem";
}

function populateCategorySelect() {
  const select = $("itemMenuCategoria");
  const categories = getCategories().filter((item) => item.activo !== false);
  const current = select.value;
  select.innerHTML = `<option value="">Sin categoría</option>`;
  categories.forEach((category) => {
    select.innerHTML += `<option value="${category.id}">${escapeHtml(category.nombre)}</option>`;
  });
  if ([...select.options].some((opt) => opt.value === current)) {
    select.value = current;
  }
}

function renderCategoryList() {
  const wrap = $("listaCategoriasMenu");
  const categories = getCategories();

  if (!categories.length) {
    wrap.innerHTML = `<div class="md-empty-state">Todavía no hay categorías en el menú digital.</div>`;
    return;
  }

  wrap.innerHTML = categories.map((category, index) => `
    <article class="md-list-card">
      <div class="md-list-card-head">
        <div>
          <h4>${escapeHtml(category.nombre)}</h4>
          <div class="md-list-card-meta">
            <span class="md-chip">${escapeHtml(sourceLabel(category))}</span>
            <span class="md-chip gray">Orden ${Number(category.orden || 0)}</span>
            ${category.agotado ? `<span class="md-chip soft">Agotada</span>` : ""}
          </div>
        </div>
        <div class="md-list-card-meta">
          <span>${category.activo ? "Activa" : "Inactiva"}</span>
          <span>${category.visible_publico ? "Visible" : "Oculta"}</span>
        </div>
      </div>
      <div class="md-list-card-actions">
        <button type="button" class="md-mini-btn" onclick="editarCategoria(${category.id})">Editar</button>
        <button type="button" class="md-mini-btn" onclick="moverCategoria(${category.id}, -1)" ${index === 0 ? "disabled" : ""}>Subir</button>
        <button type="button" class="md-mini-btn" onclick="moverCategoria(${category.id}, 1)" ${index === categories.length - 1 ? "disabled" : ""}>Bajar</button>
        <button type="button" class="md-mini-btn" onclick="toggleCategoriaVisible(${category.id})">${category.visible_publico ? "Ocultar" : "Mostrar"}</button>
        <button type="button" class="md-mini-btn" onclick="eliminarCategoria(${category.id})">Eliminar</button>
      </div>
    </article>
  `).join("");
}

function renderItemList() {
  const wrap = $("listaItemsMenu");
  const items = getItems();

  if (!items.length) {
    wrap.innerHTML = `<div class="md-empty-state">Todavía no hay ítems cargados en el menú digital.</div>`;
    return;
  }

  wrap.innerHTML = items.map((item, index) => `
    <article class="md-list-card">
      <div class="md-list-card-head">
        <div>
          <h4>${escapeHtml(item.nombre)}</h4>
          <div class="md-list-card-meta">
            <span class="md-chip">${escapeHtml(item.categoria_nombre || "Sin categoría")}</span>
            <span class="md-chip gray">${escapeHtml(sourceLabel(item))}</span>
            ${item.destacado ? `<span class="md-chip soft">Destacado</span>` : ""}
          </div>
        </div>
        <div class="md-list-card-meta">
          <span>${formatGs(item.precio)}</span>
          <span>${item.visible_publico ? "Visible" : "Oculto"}</span>
        </div>
      </div>
      <div class="md-list-card-actions">
        <button type="button" class="md-mini-btn" onclick="editarItem(${item.id})">Editar</button>
        <button type="button" class="md-mini-btn" onclick="moverItem(${item.id}, -1)" ${index === 0 ? "disabled" : ""}>Subir</button>
        <button type="button" class="md-mini-btn" onclick="moverItem(${item.id}, 1)" ${index === items.length - 1 ? "disabled" : ""}>Bajar</button>
        <button type="button" class="md-mini-btn" onclick="toggleItemVisible(${item.id})">${item.visible_publico ? "Ocultar" : "Mostrar"}</button>
        <button type="button" class="md-mini-btn" onclick="eliminarItem(${item.id})">Eliminar</button>
      </div>
    </article>
  `).join("");
}

function buildPreviewConfig() {
  const current = getConfig();
  return {
    ...current,
    nombre_publico: $("configNombrePublico").value.trim() || current.nombre_publico || "Menú Digital",
    mensaje_principal: $("configMensajePrincipal").value.trim() || current.mensaje_principal || "",
    mensaje_secundario: $("configMensajeSecundario").value.trim() || current.mensaje_secundario || "",
    horario_atencion: $("configHorarioAtencion").value.trim() || current.horario_atencion || "",
    datos_contacto: $("configDatosContacto").value.trim() || current.datos_contacto || "",
    color_principal: normalizeHexColor(
      $("configColorPrincipalText")?.value || $("configColorPrincipal").value,
      current.color_principal || DEFAULT_MENU_PRIMARY
    ),
    color_secundario: normalizeHexColor(
      $("configColorSecundarioText")?.value || $("configColorSecundario").value,
      current.color_secundario || DEFAULT_MENU_SECONDARY
    ),
    fondo_tipo: $("configFondoTipo").value || current.fondo_tipo || "gradient",
    fondo_valor: $("configFondoValor").value.trim() || current.fondo_valor || DEFAULT_MENU_BACKGROUND,
    layout_categorias: $("configLayoutCategorias").value || current.layout_categorias || "tabs",
    usar_logo_empresa: $("configUsarLogoEmpresa").checked
  };
}

function renderPreview() {
  const previewRoot = $("previewMenuPublico");
  const config = buildPreviewConfig();
  const categories = getCategories().filter((item) => item.visible_publico !== false && item.activo !== false);
  const items = getItems().filter((item) => item.visible_publico !== false);
  const categoryButtons = categories.map((category) => `<button type="button">${escapeHtml(category.nombre)}</button>`).join("");
  const previewItems = items.slice(0, 5).map((item) => `
    <article class="md-preview-item">
      ${item.imagen_url ? `<img src="${escapeHtml(item.imagen_url)}" alt="${escapeHtml(item.nombre)}">` : `<div class="md-preview-logo" style="display:grid;place-items:center;font-size:1.4rem;background:rgba(255,255,255,0.18)"><i class="fa-solid fa-bowl-food"></i></div>`}
      <div>
        <h4>${escapeHtml(item.nombre)}</h4>
        <p>${escapeHtml(item.descripcion || "Descripción breve del producto")}</p>
        <strong>${formatGs(item.precio)}</strong>
      </div>
    </article>
  `).join("");

  const heroStyle = (() => {
    if (config.banner_url) {
      return `background-image:url('${config.banner_url}');`;
    }
    if (config.fondo_tipo === "solid") {
      return `background:${config.fondo_valor || config.color_principal};`;
    }
    if (config.fondo_tipo === "imagen" && config.fondo_imagen_url) {
      return `background-image:url('${config.fondo_imagen_url}');`;
    }
    return `background:${config.fondo_valor || DEFAULT_MENU_BACKGROUND};`;
  })();

  const previewPrimary = escapeHtml(normalizeHexColor(config.color_principal, DEFAULT_MENU_PRIMARY));
  const previewSecondary = escapeHtml(normalizeHexColor(config.color_secundario, DEFAULT_MENU_SECONDARY));

  previewRoot.innerHTML = `
    <div class="md-preview-device" style="--preview-primary:${previewPrimary}; --preview-secondary:${previewSecondary};">
      <div class="md-preview-banner" style="${heroStyle}">
        <div class="md-preview-banner-content">
          ${config.logo_url ? `<img class="md-preview-logo" src="${escapeHtml(config.logo_url)}" alt="logo">` : ""}
          <h3 style="margin:12px 0 6px;">${escapeHtml(config.nombre_publico)}</h3>
          <p style="margin:0;color:rgba(255,255,255,0.88);">${escapeHtml(config.mensaje_principal || "Presentación del negocio")}</p>
        </div>
      </div>
      <div class="md-preview-body">
        <div class="md-preview-nav ${escapeHtml(config.layout_categorias)}">
          ${categoryButtons || `<button type="button">Sin categorías</button>`}
        </div>
        <div class="md-preview-items">
          ${previewItems || `<div class="md-empty-state" style="background:rgba(255,255,255,0.82);color:${previewPrimary};border-color:rgba(20,118,150,0.18)">Agrega ítems para ver la carta pública</div>`}
        </div>
      </div>
    </div>
  `;
}

function renderAll() {
  fillConfigForms();
  renderOverview();
  populateCategorySelect();
  renderCategoryList();
  renderItemList();
  renderPreview();
}

function setBootstrap(data) {
  state.bootstrap = data;
  clearDirty();
  renderAll();
  renderCategoryForm();
  renderItemForm();
  activarTab(state.activeTab || "resumen");
}

async function loadBootstrap() {
  const data = await fetchJson(`${MENU_DIGITAL_API}/admin/bootstrap`);
  setBootstrap(data);
}

async function guardarConfiguracion() {
  const formData = new FormData();
  formData.append("nombre_publico", $("configNombrePublico").value.trim());
  formData.append("estado", $("configEstado").value);
  formData.append("mensaje_principal", $("configMensajePrincipal").value.trim());
  formData.append("mensaje_secundario", $("configMensajeSecundario").value.trim());
  formData.append("horario_atencion", $("configHorarioAtencion").value.trim());
  formData.append("datos_contacto", $("configDatosContacto").value.trim());
  formData.append("public_base_url", normalizePublicBaseUrlInput($("configPublicBaseUrl").value));
  formData.append("usar_logo_empresa", $("configUsarLogoEmpresa").checked);
  formData.append("color_principal", $("configColorPrincipal").value);
  formData.append("color_secundario", $("configColorSecundario").value);
  formData.append("fondo_tipo", $("configFondoTipo").value);
  formData.append("fondo_valor", $("configFondoValor").value.trim());
  formData.append("layout_categorias", $("configLayoutCategorias").value);

  const logoFile = $("configLogoPersonalizado").files[0];
  const bannerFile = $("configBanner").files[0];
  const fondoFile = $("configFondo").files[0];

  if (logoFile) formData.append("logo_personalizado", logoFile);
  if (bannerFile) formData.append("banner", bannerFile);
  if (fondoFile) formData.append("fondo", fondoFile);

  await fetchJson(`${MENU_DIGITAL_API}/admin/config`, {
    method: "PUT",
    body: formData
  });

  await loadBootstrap();
  alert("Configuración del menú digital guardada");
}

window.guardarConfiguracion = guardarConfiguracion;

async function sincronizarFuentes() {
  const data = await fetchJson(`${MENU_DIGITAL_API}/admin/sincronizar`, {
    method: "POST"
  });
  setBootstrap(data);
  alert("Contenido sincronizado desde productos y categorías");
}

window.sincronizarFuentes = sincronizarFuentes;

function nuevoFormularioCategoria() {
  renderCategoryForm();
}

function nuevoFormularioItem() {
  renderItemForm();
}

window.nuevoFormularioCategoria = nuevoFormularioCategoria;
window.nuevoFormularioItem = nuevoFormularioItem;

function findCategoryById(id) {
  return getCategories().find((item) => Number(item.id) === Number(id)) || null;
}

function findItemById(id) {
  return getItems().find((item) => Number(item.id) === Number(id)) || null;
}

function editarCategoria(id) {
  const category = findCategoryById(id);
  if (!category) return;
  renderCategoryForm(category);
  activarTab("categorias");
}

function editarItem(id) {
  const item = findItemById(id);
  if (!item) return;
  renderItemForm(item);
  activarTab("items");
}

window.editarCategoria = editarCategoria;
window.editarItem = editarItem;

async function persistCategoryPayload(id, payload) {
  const url = id ? `${MENU_DIGITAL_API}/admin/categorias/${id}` : `${MENU_DIGITAL_API}/admin/categorias`;
  await fetchJson(url, {
    method: id ? "PUT" : "POST",
    body: payload
  });
  await loadBootstrap();
}

async function persistItemPayload(id, payload) {
  const url = id ? `${MENU_DIGITAL_API}/admin/items/${id}` : `${MENU_DIGITAL_API}/admin/items`;
  await fetchJson(url, {
    method: id ? "PUT" : "POST",
    body: payload
  });
  await loadBootstrap();
}

$("formCategoriaMenu").addEventListener("submit", async (event) => {
  event.preventDefault();
  const id = $("categoriaMenuId").value.trim();
  const formData = new FormData();
  formData.append("nombre", $("categoriaMenuNombre").value.trim().toUpperCase());
  formData.append("descripcion", $("categoriaMenuDescripcion").value.trim());
  formData.append("color", $("categoriaMenuColor").value);
  formData.append("icono", $("categoriaMenuIcono").value.trim() || "fa-utensils");
  formData.append("orden", $("categoriaMenuOrden").value || "0");
  formData.append("activo", $("categoriaMenuActiva").checked);
  formData.append("visible_publico", $("categoriaMenuVisible").checked);
  formData.append("agotado", $("categoriaMenuAgotada").checked);
  if ($("categoriaMenuImagen").files[0]) {
    formData.append("imagen", $("categoriaMenuImagen").files[0]);
  }

  await persistCategoryPayload(id, formData);
  renderCategoryForm();
  alert("Categoría guardada");
});

$("formItemMenu").addEventListener("submit", async (event) => {
  event.preventDefault();
  const id = $("itemMenuId").value.trim();
  const formData = new FormData();
  formData.append("categoria_id", $("itemMenuCategoria").value);
  formData.append("nombre", $("itemMenuNombre").value.trim().toUpperCase());
  formData.append("descripcion", $("itemMenuDescripcion").value.trim());
  formData.append("precio", $("itemMenuPrecio").value || "0");
  formData.append("orden", $("itemMenuOrden").value || "0");
  formData.append("disponible", $("itemMenuDisponible").checked);
  formData.append("visible_publico", $("itemMenuVisible").checked);
  formData.append("destacado", $("itemMenuDestacado").checked);
  formData.append("agotado", $("itemMenuAgotado").checked);
  if ($("itemMenuImagen").files[0]) {
    formData.append("imagen", $("itemMenuImagen").files[0]);
  }

  await persistItemPayload(id, formData);
  renderItemForm();
  alert("Ítem guardado");
});

async function updateCategoryQuick(category, patch = {}) {
  if (!category) return;
  const payload = new FormData();
  payload.append("nombre", patch.nombre ?? category.nombre ?? "");
  payload.append("descripcion", patch.descripcion ?? category.descripcion ?? "");
  payload.append("color", patch.color ?? category.color ?? DEFAULT_MENU_PRIMARY);
  payload.append("icono", patch.icono ?? category.icono ?? "fa-utensils");
  payload.append("orden", String(patch.orden ?? category.orden ?? 0));
  payload.append("activo", patch.activo ?? (category.activo !== false));
  payload.append("visible_publico", patch.visible_publico ?? (category.visible_publico !== false));
  payload.append("agotado", patch.agotado ?? (category.agotado === true));
  await persistCategoryPayload(category.id, payload);
}

async function updateItemQuick(item, patch = {}) {
  if (!item) return;
  const payload = new FormData();
  payload.append("categoria_id", patch.categoria_id ?? item.categoria_id ?? "");
  payload.append("nombre", patch.nombre ?? item.nombre ?? "");
  payload.append("descripcion", patch.descripcion ?? item.descripcion ?? "");
  payload.append("precio", String(patch.precio ?? item.precio ?? 0));
  payload.append("orden", String(patch.orden ?? item.orden ?? 0));
  payload.append("disponible", patch.disponible ?? (item.disponible !== false));
  payload.append("visible_publico", patch.visible_publico ?? (item.visible_publico !== false));
  payload.append("destacado", patch.destacado ?? (item.destacado === true));
  payload.append("agotado", patch.agotado ?? (item.agotado === true));
  await persistItemPayload(item.id, payload);
}

async function moverCategoria(id, delta) {
  const categories = getCategories();
  const index = categories.findIndex((item) => Number(item.id) === Number(id));
  const target = index + delta;
  if (index < 0 || target < 0 || target >= categories.length) return;
  [categories[index], categories[target]] = [categories[target], categories[index]];
  await fetchJson(`${MENU_DIGITAL_API}/admin/categorias/orden`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(categories.map((item, idx) => ({ id: item.id, orden: idx + 1 })))
  });
  await loadBootstrap();
}

async function moverItem(id, delta) {
  const items = getItems();
  const index = items.findIndex((item) => Number(item.id) === Number(id));
  const target = index + delta;
  if (index < 0 || target < 0 || target >= items.length) return;
  [items[index], items[target]] = [items[target], items[index]];
  await fetchJson(`${MENU_DIGITAL_API}/admin/items/orden`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(items.map((item, idx) => ({ id: item.id, orden: idx + 1 })))
  });
  await loadBootstrap();
}

async function toggleCategoriaVisible(id) {
  const category = findCategoryById(id);
  if (!category) return;
  await updateCategoryQuick(category, { visible_publico: !category.visible_publico });
}

async function toggleItemVisible(id) {
  const item = findItemById(id);
  if (!item) return;
  await updateItemQuick(item, { visible_publico: !item.visible_publico });
}

async function eliminarCategoria(id) {
  const category = findCategoryById(id);
  if (!category) return;

  if (category.sincronizado) {
    if (!confirm("Esta categoría viene sincronizada. Se ocultará del menú digital, pero no se borrará del módulo original. ¿Continuar?")) return;
    await updateCategoryQuick(category, { visible_publico: false, activo: false });
    return;
  }

  if (!confirm("¿Eliminar esta categoría del menú digital?")) return;
  await fetchJson(`${MENU_DIGITAL_API}/admin/categorias/${id}`, { method: "DELETE" });
  await loadBootstrap();
}

async function eliminarItem(id) {
  const item = findItemById(id);
  if (!item) return;

  if (item.sincronizado) {
    if (!confirm("Este ítem viene sincronizado. Se ocultará del menú digital, pero no se borrará del producto original. ¿Continuar?")) return;
    await updateItemQuick(item, { visible_publico: false, disponible: false, agotado: true });
    return;
  }

  if (!confirm("¿Eliminar este ítem del menú digital?")) return;
  await fetchJson(`${MENU_DIGITAL_API}/admin/items/${id}`, { method: "DELETE" });
  await loadBootstrap();
}

window.moverCategoria = moverCategoria;
window.moverItem = moverItem;
window.toggleCategoriaVisible = toggleCategoriaVisible;
window.toggleItemVisible = toggleItemVisible;
window.eliminarCategoria = eliminarCategoria;
window.eliminarItem = eliminarItem;

function abrirMenuPublico() {
  const url = getPublication().public_url;
  if (!url) return;
  window.open(url, "_blank", "noopener,noreferrer");
}

window.abrirMenuPublico = abrirMenuPublico;

async function copyToClipboard(text) {
  if (!text) return;
  await navigator.clipboard.writeText(text);
}

async function copiarEnlaceMenu() {
  try {
    await copyToClipboard($("publicMenuLink").value);
    alert("Enlace copiado al portapapeles");
  } catch {
    alert("No se pudo copiar el enlace");
  }
}

window.copiarEnlaceMenu = copiarEnlaceMenu;

async function compartirEnlaceMenu() {
  const url = $("publicMenuLink").value;
  if (!url) return;

  if (navigator.share) {
    try {
      await navigator.share({
        title: getConfig().nombre_publico || "Menú Digital",
        text: "Te comparto nuestro menú digital",
        url
      });
      return;
    } catch {
      // fallback a copiar
    }
  }

  await copiarEnlaceMenu();
}

window.compartirEnlaceMenu = compartirEnlaceMenu;

async function descargarQr(formato) {
  const urls = {
    png: getPublication().qr_png_url,
    jpg: getPublication().qr_jpg_url,
    pdf: getPublication().qr_pdf_url
  };
  const url = urls[formato];
  if (!url) return;

  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) {
    alert("No se pudo descargar el archivo");
    return;
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = `menu-digital.${formato}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

window.descargarQr = descargarQr;

function imprimirQr() {
  const qrUrl = `${getPublication().qr_png_url}?ts=${Date.now()}`;
  const menuName = escapeHtml(getConfig().nombre_publico || "Menú Digital");
  const publicUrl = escapeHtml(getPublication().public_url || "");
  const popup = window.open("", "_blank", "width=420,height=620");
  if (!popup) return;

  popup.document.write(`
    <html lang="es">
      <head>
        <title>QR ${menuName}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 0; padding: 24px; text-align: center; color: #1f2937; background: #f4f6f5; }
          .card { border: 1px solid #d5dde7; border-radius: 18px; padding: 18px; background: #ffffff; }
          img { width: 230px; height: auto; }
          h1 { font-size: 24px; margin: 0 0 12px; }
          p { font-size: 12px; line-height: 1.5; }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>${menuName}</h1>
          <img src="${qrUrl}" alt="QR Menú Digital" onload="window.print()">
          <p>Escanea para ver el menú</p>
          <p>${publicUrl}</p>
        </div>
      </body>
    </html>
  `);
  popup.document.close();
}

window.imprimirQr = imprimirQr;

function volverSeguro() {
  if (state.dirty && !confirm("Hay cambios pendientes en pantalla. ¿Deseas salir igual?")) {
    return;
  }
  window.location.href = "/home.html";
}

window.volverSeguro = volverSeguro;

function wireDirtyTracking() {
  document.querySelectorAll("input, textarea, select").forEach((element) => {
    element.addEventListener("input", () => {
      markDirty();
      if (element.id === "configPublicBaseUrl") {
        refreshPublicationPreview();
      }
      if (element.closest("#formDisenoMenu") || element.closest("#formPublicacionMenu")) {
        renderPreview();
      }
    });
    element.addEventListener("change", () => {
      markDirty();
      if (element.id === "configPublicBaseUrl") {
        refreshPublicationPreview();
      }
      if (element.closest("#formDisenoMenu") || element.closest("#formPublicacionMenu")) {
        renderPreview();
      }
    });
  });
}

window.addEventListener("beforeunload", (event) => {
  if (!state.dirty) return;
  event.preventDefault();
  event.returnValue = "";
});

window.addEventListener("DOMContentLoaded", async () => {
  wireColorControls();
  wireDirtyTracking();
  activarTab("resumen");
  try {
    await loadBootstrap();
  } catch (error) {
    console.error(error);
    alert(error.message || "No se pudo cargar el módulo Menú Digital");
  }
});
