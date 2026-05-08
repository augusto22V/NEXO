const DEFAULT_MENU_PRIMARY = "#147696";
const DEFAULT_MENU_SECONDARY = "#E6F1F4";
const DEFAULT_MENU_BACKGROUND = "linear-gradient(180deg, #f5f7f9 0%, #e8eef2 100%)";

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

function getSlugFromUrl() {
  const parts = window.location.pathname.split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : "";
}

function resolveShellStyle(config = {}) {
  if (config.fondo_tipo === "imagen" && config.fondo_imagen_url) {
    return `background-image:url('${config.fondo_imagen_url}');`;
  }
  if (config.fondo_tipo === "solid") {
    return `background:${config.fondo_valor || config.color_secundario || DEFAULT_MENU_SECONDARY};`;
  }
  return `background:${config.fondo_valor || DEFAULT_MENU_BACKGROUND};`;
}

function resolveBannerStyle(config = {}) {
  if (config.banner_url) {
    return `background-image:url('${config.banner_url}');`;
  }
  return `background:${config.fondo_valor || `linear-gradient(135deg, ${config.color_principal || DEFAULT_MENU_PRIMARY} 0%, ${config.color_secundario || DEFAULT_MENU_SECONDARY} 100%)`};`;
}

function groupItemsByCategory(categories, items) {
  const byCategory = new Map(categories.map((category) => [Number(category.id), { ...category, items: [] }]));
  const uncategorized = [];

  items.forEach((item) => {
    const bucket = byCategory.get(Number(item.categoria_id || 0));
    if (bucket) {
      bucket.items.push(item);
      return;
    }
    uncategorized.push(item);
  });

  const groups = Array.from(byCategory.values()).filter((category) => category.items.length > 0);

  if (uncategorized.length) {
    groups.unshift({
      id: "destacados",
      nombre: "Especiales",
      icono: "fa-star",
      color: categories[0]?.color || DEFAULT_MENU_PRIMARY,
      items: uncategorized
    });
  }

  return groups;
}

function renderMenu(payload) {
  const root = document.getElementById("menuPublicRoot");
  const config = payload?.config || {};
  const categories = Array.isArray(payload?.categories) ? payload.categories : [];
  const items = Array.isArray(payload?.items) ? payload.items : [];
  const groups = groupItemsByCategory(categories, items);

  if (!groups.length) {
    root.innerHTML = `
      <section class="md-public-loading">
        <div class="md-public-empty">
          <i class="fa-solid fa-bowl-food"></i>
          <h1>${escapeHtml(config.nombre_publico || "Menú Digital")}</h1>
          <p>El menú todavía no tiene categorías visibles o ítems publicados.</p>
        </div>
      </section>
    `;
    return;
  }

  const navClass = escapeHtml(config.layout_categorias || "tabs");
  const navButtons = groups.map((group) => `
    <button type="button" onclick="document.getElementById('cat-${group.id}').scrollIntoView({behavior:'smooth', block:'start'})">
      ${escapeHtml(group.nombre)}
    </button>
  `).join("");

  const tags = [
    config.horario_atencion ? `<span class="md-public-tag"><i class="fa-regular fa-clock"></i>${escapeHtml(config.horario_atencion)}</span>` : "",
    config.datos_contacto ? `<span class="md-public-tag"><i class="fa-solid fa-phone"></i>${escapeHtml(config.datos_contacto)}</span>` : "",
    config.terminal_nombre ? `<span class="md-public-tag"><i class="fa-solid fa-store"></i>${escapeHtml(config.terminal_nombre)}</span>` : ""
  ].filter(Boolean).join("");

  root.innerHTML = `
    <div class="md-public-shell" style="${resolveShellStyle(config)}">
      <div class="md-public-overlay">
        <header class="md-public-header">
          <div class="md-public-banner" style="${resolveBannerStyle(config)}">
            <div class="md-public-banner-inner">
              <div class="md-public-brand">
                ${config.logo_url
                  ? `<img src="${escapeHtml(config.logo_url)}" alt="Logo ${escapeHtml(config.nombre_publico || "")}">`
                  : `<div class="md-public-brand-fallback"><i class="fa-solid fa-utensils"></i></div>`}
                <div>
                  <small>${escapeHtml(config.empresa_nombre || "LibreríaSys")}</small>
                  <h1>${escapeHtml(config.nombre_publico || "Menú Digital")}</h1>
                </div>
              </div>
              ${config.mensaje_principal ? `<p>${escapeHtml(config.mensaje_principal)}</p>` : ""}
              ${config.mensaje_secundario ? `<p class="md-public-subtitle">${escapeHtml(config.mensaje_secundario)}</p>` : ""}
              ${tags ? `<div class="md-public-tags">${tags}</div>` : ""}
            </div>
          </div>
        </header>

        <div class="md-public-content">
          <div class="md-public-nav-wrap">
            <div class="md-public-nav ${navClass}">
              ${navButtons}
            </div>
          </div>

          <section class="md-public-sections">
            ${groups.map((group) => `
              <article id="cat-${group.id}" class="md-public-category">
                <div class="md-public-category-head">
                  <div class="md-public-category-title">
                    <i class="fa-solid ${escapeHtml(group.icono || "fa-utensils")}" style="background:${escapeHtml(group.color || config.color_principal || DEFAULT_MENU_PRIMARY)}"></i>
                    <div>
                      <h2>${escapeHtml(group.nombre)}</h2>
                      ${group.descripcion ? `<p>${escapeHtml(group.descripcion)}</p>` : ""}
                    </div>
                  </div>
                </div>

                <div class="md-public-items">
                  ${group.items.map((item) => `
                    <article class="md-public-item">
                      <figure>
                        ${item.imagen_url
                          ? `<img src="${escapeHtml(item.imagen_url)}" alt="${escapeHtml(item.nombre)}">`
                          : `<div class="md-public-brand-fallback" style="width:100%;height:100%"><i class="fa-solid fa-bowl-food"></i></div>`}
                      </figure>
                      <div class="md-public-item-body">
                        <div class="md-public-item-top">
                          <h3>${escapeHtml(item.nombre)}</h3>
                          <span class="md-public-price">${formatGs(item.precio)}</span>
                        </div>
                        ${item.descripcion ? `<p>${escapeHtml(item.descripcion)}</p>` : ""}
                        <div class="md-public-pill-row">
                          ${item.destacado ? `<span class="md-public-pill"><i class="fa-solid fa-star"></i>Destacado</span>` : ""}
                          ${item.agotado || item.disponible === false ? `<span class="md-public-pill gray"><i class="fa-solid fa-ban"></i>No disponible</span>` : ""}
                        </div>
                      </div>
                    </article>
                  `).join("")}
                </div>
              </article>
            `).join("")}
          </section>
        </div>
      </div>
    </div>
  `;
}

async function initPublicMenu() {
  const slug = getSlugFromUrl();
  const root = document.getElementById("menuPublicRoot");

  if (!slug) {
    root.innerHTML = `
      <section class="md-public-loading">
        <div class="md-public-empty">
          <i class="fa-solid fa-circle-exclamation"></i>
          <h1>Menú no disponible</h1>
          <p>No se encontró el enlace del menú digital.</p>
        </div>
      </section>
    `;
    return;
  }

  try {
    const response = await fetch(`/api/menu-digital/publico/${encodeURIComponent(slug)}`);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.error || "El menú no está disponible");
    }

    document.title = payload?.config?.nombre_publico
      ? `${payload.config.nombre_publico} | Menú Digital`
      : "Menú Digital";

    renderMenu(payload);
  } catch (error) {
    root.innerHTML = `
      <section class="md-public-loading">
        <div class="md-public-empty">
          <i class="fa-solid fa-circle-exclamation"></i>
          <h1>Menú no disponible</h1>
          <p>${escapeHtml(error.message || "No se pudo abrir el menú digital.")}</p>
        </div>
      </section>
    `;
  }
}

window.addEventListener("DOMContentLoaded", initPublicMenu);
