(function () {
  "use strict";

  const API = "/api/catalogo/publico";
  const DISPONIBILIDAD = {
    DISPONIBLE: { clase: "ok", icono: "fa-circle-check", texto: "Disponible" },
    POCAS_UNIDADES: { clase: "warn", icono: "fa-hourglass-half", texto: "Últimas unidades" },
    SIN_STOCK: { clase: "off", icono: "fa-circle-question", texto: "Sin stock · consultá" }
  };

  const state = {
    slug: "",
    data: null,
    filtro: "",
    categoria: "todas",
    carrito: [],
    tipo: "PEDIDO",
    enviando: false
  };

  /* ------------------------- utilidades ------------------------- */
  const $ = (id) => document.getElementById(id);

  function esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function safeUrl(url) {
    const txt = String(url || "").trim();
    if (!txt) return "";
    if (txt.startsWith("/") && !txt.startsWith("//")) return txt;
    if (/^https:\/\//i.test(txt)) return txt;
    return "";
  }

  function gs(value) {
    const n = Number(value || 0);
    return `Gs ${n.toLocaleString("es-PY", { maximumFractionDigits: 0 })}`;
  }

  function normalizar(texto) {
    return String(texto || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  }

  function toast(msg) {
    const el = $("toast");
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { el.hidden = true; }, 2200);
  }

  function storageKey() { return `catalogo_carrito_${state.slug}`; }

  function guardarCarrito() {
    try { localStorage.setItem(storageKey(), JSON.stringify(state.carrito)); } catch (_) { /* sin almacenamiento */ }
  }

  function cargarCarrito() {
    try {
      const raw = JSON.parse(localStorage.getItem(storageKey()) || "[]");
      return Array.isArray(raw) ? raw : [];
    } catch (_) {
      return [];
    }
  }

  function precioHtml(precio, precioTexto) {
    if (!state.data.config.mostrar_precios) return `<span class="cp-price muted">Consultar precio</span>`;
    if (precio != null && Number(precio) > 0) {
      return `<span class="cp-price">${precioTexto ? `<small style="font-weight:500;font-size:12px">${esc(precioTexto)} </small>` : ""}${gs(precio)}</span>`;
    }
    return `<span class="cp-price muted">${esc(precioTexto || "Consultar precio")}</span>`;
  }

  function badgeHtml(disp) {
    const d = DISPONIBILIDAD[disp] || DISPONIBILIDAD.DISPONIBLE;
    return `<span class="cp-badge ${d.clase}"><i class="fa-solid ${d.icono}"></i>${d.texto}</span>`;
  }

  /* ------------------------- datos ------------------------- */
  function buscarItem(clase, id) {
    const data = state.data;
    if (clase === "servicio") return data.servicios.find((s) => s.clase === "servicio" && s.id === id);
    return data.productos.find((p) => p.id === id) || data.servicios.find((s) => s.clase === "producto" && s.id === id);
  }

  function productosFiltrados() {
    const q = normalizar(state.filtro);
    return state.data.productos.filter((p) => {
      if (state.categoria !== "todas" && state.categoria !== "servicios" && String(p.categoria_id) !== state.categoria) return false;
      if (state.categoria === "servicios") return false;
      if (!q) return true;
      return normalizar(`${p.nombre} ${p.descripcion} ${p.categoria_nombre} ${p.codigo}`).includes(q);
    });
  }

  function serviciosFiltrados() {
    if (state.categoria !== "todas" && state.categoria !== "servicios") return [];
    const q = normalizar(state.filtro);
    return state.data.servicios.filter((s) => !q || normalizar(`${s.nombre} ${s.descripcion}`).includes(q));
  }

  /* ------------------------- render ------------------------- */
  const TAG_CORTO = { DISPONIBLE: "Disponible", POCAS_UNIDADES: "Últimas", SIN_STOCK: "Consultar" };

  function iconoCategoria(nombre) {
    const n = normalizar(nombre);
    const mapa = [
      [/arte|manualid/, "fa-palette"], [/boligraf|pluma|lapicer/, "fa-pen"], [/borrador|corrector/, "fa-eraser"],
      [/carpeta|archivo|sobre/, "fa-folder-open"], [/cartulina|papel|hoja/, "fa-file-lines"], [/cuaderno|libro/, "fa-book"],
      [/lapi|ecolapi/, "fa-pencil"], [/marcador|resaltador/, "fa-highlighter"], [/mochila|accesorio|cartuchera/, "fa-bag-shopping"],
      [/util|oficina|escolar/, "fa-ruler"], [/impresi|fotocop|servicio/, "fa-print"]
    ];
    const hit = mapa.find(([re]) => re.test(n));
    return hit ? hit[1] : "fa-tag";
  }

  function telefonoLindo(numero) {
    const d = String(numero || "").replace(/\D/g, "");
    if (d.startsWith("595") && d.length >= 11) {
      const local = `0${d.slice(3)}`;
      return `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`.trim();
    }
    return d;
  }

  function renderShell() {
    const c = state.data.config;
    document.title = `${c.nombre_publico} · Catálogo`;
    if (c.color) {
      document.documentElement.style.setProperty("--cp-primary", c.color);
      document.documentElement.style.setProperty("--cp-primary-soft", `${c.color}1F`);
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute("content", "#0B0D12");
    }

    const waUrl = c.whatsapp
      ? `https://wa.me/${encodeURIComponent(c.whatsapp)}?text=${encodeURIComponent(`¡Hola ${c.nombre_publico || ""}! Vi su catálogo online y quería hacer una consulta.`)}`
      : "";
    const logo = safeUrl(c.logo);
    const mapa = c.direccion ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.direccion)}` : "";

    const datos = [];
    if (waUrl) datos.push(`<a class="cp-info" href="${esc(waUrl)}" target="_blank" rel="noopener"><strong><i class="fa-brands fa-whatsapp"></i> ${esc(telefonoLindo(c.whatsapp))}</strong><small>Consultas y pedidos</small></a>`);
    datos.push(c.horario
      ? `<div class="cp-info"><strong><i class="fa-regular fa-clock"></i> ${esc(c.horario)}</strong><small>Horario</small></div>`
      : `<div class="cp-info cp-info-opt"><strong><i class="fa-solid fa-bolt"></i> Respuesta rápida</strong><small>Te confirmamos por WhatsApp</small></div>`);
    datos.push(mapa
      ? `<a class="cp-info" href="${esc(mapa)}" target="_blank" rel="noopener"><strong><i class="fa-solid fa-location-dot"></i> Ver en mapa</strong><small>${esc(c.direccion)}</small></a>`
      : `<button type="button" class="cp-info" id="compartirInfo"><strong><i class="fa-solid fa-share-nodes"></i> Compartir</strong><small>Enviá el catálogo</small></button>`);

    $("app").innerHTML = `
      <header class="cp-hero">
        <div class="cp-hero-inner">
          ${logo ? `<img class="cp-logo" src="${esc(logo)}" alt="" onerror="this.remove()">` : ""}
          <div class="cp-hero-text">
            <div class="cp-hero-title">
              <h1>${esc(c.nombre_publico)}</h1>
              ${waUrl ? `<a class="cp-round-btn wa" href="${esc(waUrl)}" target="_blank" rel="noopener" aria-label="WhatsApp"><i class="fa-brands fa-whatsapp"></i></a>` : ""}
              <button type="button" class="cp-round-btn" id="compartirBtn" aria-label="Compartir"><i class="fa-solid fa-share-nodes"></i></button>
            </div>
            <p>${esc(c.mensaje || "Mirá nuestros productos y servicios. Consultá disponibilidad o hacé tu pedido por WhatsApp.")}</p>
          </div>
        </div>
      </header>

      <div class="cp-infobar"><div class="cp-infobar-inner">${datos.join("")}</div></div>

      <div class="cp-catbar">
        <div class="cp-catbar-inner">
          <button type="button" class="cp-cat-toggle" id="catToggle" aria-expanded="true" aria-controls="chips">
            <span><i class="fa-solid fa-layer-group"></i> Categorías <b id="catActual"></b></span>
            <span class="cp-cat-toggle-txt"><span id="catToggleTxt">Ocultar</span> <i class="fa-solid fa-chevron-up"></i></span>
          </button>
          <nav class="cp-chips" id="chips" aria-label="Categorías"></nav>
        </div>
      </div>

      <div class="cp-searchrow">
        <label class="cp-search">
          <i class="fa-solid fa-magnifying-glass"></i>
          <input id="buscar" type="search" placeholder="Buscar productos o servicios…" autocomplete="off" aria-label="Buscar">
        </label>
      </div>

      <main class="cp-main" id="contenido"></main>

      <footer class="cp-footer">
        <div class="cp-footer-inner">
          <strong>${esc(c.nombre_publico)}</strong>
          <span>Los precios y la disponibilidad se confirman al responderte por WhatsApp.</span>
        </div>
      </footer>
    `;

    $("buscar").addEventListener("input", (e) => {
      state.filtro = e.target.value;
      renderContenido();
    });
    $("compartirBtn").addEventListener("click", compartir);
    if ($("compartirInfo")) $("compartirInfo").addEventListener("click", compartir);
    $("catToggle").addEventListener("click", () => {
      const cerrada = !document.querySelector(".cp-catbar").classList.contains("cerrada");
      ponerCategoriasOcultas(cerrada);
      try { localStorage.setItem("catalogo_cat_oculta", cerrada ? "1" : "0"); } catch (_) { /* nada */ }
    });
    let oculta = false;
    try { oculta = localStorage.getItem("catalogo_cat_oculta") === "1"; } catch (_) { /* nada */ }
    ponerCategoriasOcultas(oculta);
    renderChips();
    renderContenido();
  }

  function ponerCategoriasOcultas(cerrada) {
    document.querySelector(".cp-catbar").classList.toggle("cerrada", cerrada);
    $("catToggle").setAttribute("aria-expanded", String(!cerrada));
    $("catToggleTxt").textContent = cerrada ? "Mostrar" : "Ocultar";
  }

  function renderChips() {
    const data = state.data;
    const chip = (cat, nombre, icono, extra = "") =>
      `<button type="button" class="cp-chip ${state.categoria === cat ? "active" : ""}" data-cat="${esc(cat)}"><span class="cp-chip-ico"><i class="fa-solid ${icono}"></i></span>${esc(nombre)}${extra}</button>`;
    const chips = [chip("todas", "Todo", "fa-border-all")];
    data.categorias.forEach((cat) => chips.push(chip(String(cat.id), cat.nombre, iconoCategoria(cat.nombre))));
    if (data.servicios.length) chips.push(chip("servicios", "Impresiones y servicios", "fa-print"));
    $("chips").innerHTML = chips.join("");
    const activo = $("chips").querySelector(".cp-chip.active");
    $("catActual").textContent = activo ? "· " + activo.textContent.trim() : "";
    $("chips").querySelectorAll("[data-cat]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.categoria = btn.dataset.cat;
        renderChips();
        renderContenido();
        const cont = $("contenido");
        if (cont) window.scrollTo({ top: Math.max(0, cont.offsetTop - 140), behavior: "smooth" });
        const activo = $("chips").querySelector(".cp-chip.active");
        if (activo) activo.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
      });
    });
  }

  /** Tarjeta unica para productos y servicios. */
  function cardItem(item, clase) {
    const img = safeUrl(item.imagen || item.imagen_url);
    const ver = `${clase}:${item.id}`;
    const ph = clase === "servicio" || item.es_servicio || !item.categoria_nombre || /impresi|fotocop|servicio/i.test(item.categoria_nombre || "")
      ? "fa-print" : iconoCategoria(item.categoria_nombre);
    const media = img
      ? `<img class="cp-card-img" src="${esc(img)}" alt="" loading="lazy" onerror="this.outerHTML='<div class=&quot;cp-card-ph&quot;><i class=&quot;fa-solid ${ph}&quot;></i></div>'">`
      : `<div class="cp-card-ph"><i class="fa-solid ${ph}"></i></div>`;
    const d = item.disponibilidad ? (DISPONIBILIDAD[item.disponibilidad] || DISPONIBILIDAD.DISPONIBLE) : null;
    return `
      <article class="cp-card">
        <div class="cp-card-media">
          <button type="button" data-ver="${ver}" class="cp-card-media-btn" aria-label="Ver ${esc(item.nombre)}">${media}</button>
          <button type="button" data-ver="${ver}" class="cp-zoom" aria-label="Ver grande"><i class="fa-solid fa-magnifying-glass-plus"></i></button>
          ${d ? `<span class="cp-tag ${d.clase}"><i class="fa-solid ${d.icono}"></i>${TAG_CORTO[item.disponibilidad] || d.texto}</span>` : ""}
        </div>
        <div class="cp-card-body">
          <h3 class="cp-card-name">${esc(item.nombre)}</h3>
          ${item.descripcion ? `<p class="cp-card-desc">${esc(item.descripcion)}</p>` : ""}
          <button type="button" class="cp-more" data-ver="${ver}">Ver más</button>
          <div class="cp-card-foot">
            ${precioHtml(item.precio, item.precio_texto)}
            <div class="cp-card-actions">
              <button type="button" class="cp-icon-btn soft" data-consultar="${ver}" title="Preguntar disponibilidad" aria-label="Preguntar disponibilidad"><i class="fa-regular fa-comment-dots"></i></button>
              <button type="button" class="cp-icon-btn" data-agregar="${ver}" title="Agregar al pedido" aria-label="Agregar al pedido"><i class="fa-solid fa-plus"></i></button>
            </div>
          </div>
        </div>
      </article>`;
  }

  function seccion(id, titulo, icono, items) {
    return `
      <section class="cp-section" id="${id}">
        <div class="cp-section-head"><h2><i class="fa-solid ${icono}"></i>${esc(titulo)}</h2><span>${items.length} ${items.length === 1 ? "producto" : "productos"}</span></div>
        <div class="cp-grid">${items.join("")}</div>
      </section>`;
  }

  function renderContenido() {
    const cont = $("contenido");
    const productos = productosFiltrados();
    const servicios = serviciosFiltrados();
    const grupos = new Map();

    productos.forEach((p) => {
      const key = p.categoria_id || 0;
      if (!grupos.has(key)) grupos.set(key, { nombre: p.categoria_nombre, items: [] });
      grupos.get(key).items.push(p);
    });

    let html = "";
    grupos.forEach((g, key) => {
      html += seccion(`cat-${key}`, g.nombre || "Otros", iconoCategoria(g.nombre), g.items.map((p) => cardItem(p, "producto")));
    });
    if (servicios.length) {
      html += seccion("servicios", "Impresiones y servicios", "fa-print", servicios.map((s) => cardItem(s, s.clase)));
    }

    if (!html) {
      html = state.filtro
        ? `<div class="cp-no-results"><i class="fa-solid fa-magnifying-glass" style="font-size:28px"></i><p>No encontramos “${esc(state.filtro)}”.<br>¿No está lo que buscás? <button type="button" class="cp-link-btn" data-consulta-libre="1">Preguntanos</button></p></div>`
        : `<div class="cp-no-results"><p>Todavía no hay productos cargados en el catálogo.</p></div>`;
    } else if (state.categoria === "todas" && !state.filtro) {
      html = `<p class="cp-note"><i class="fa-solid fa-circle-info"></i><span>Elegí lo que necesitás y mandanos tu pedido, o tocá <i class="fa-regular fa-comment-dots"></i> para preguntar si hay disponible. Te respondemos por WhatsApp.</span></p>` + html;
    }

    cont.innerHTML = html;
  }

  /* ------------------------- detalle ------------------------- */
  function abrirDetalle(clase, id) {
    const p = buscarItem(clase, id);
    if (!p) return;
    const img = safeUrl(p.imagen || p.imagen_url);
    let cantidad = 1;
    $("detalleContenido").innerHTML = `
      <div class="cp-detail">
        ${img ? `<img class="cp-detail-img" src="${esc(img)}" alt="">` : ""}
        <div class="cp-detail-cat">${esc(p.categoria_nombre || "Servicio")}</div>
        <h2 id="detalleNombre">${esc(p.nombre)}</h2>
        <div class="cp-detail-row">
          ${precioHtml(p.precio, p.precio_texto)}
          ${p.disponibilidad ? badgeHtml(p.disponibilidad) : ""}
        </div>
        ${p.descripcion ? `<p class="cp-detail-desc">${esc(p.descripcion)}</p>` : ""}
        ${p.codigo ? `<div class="cp-detail-meta">Código: ${esc(p.codigo)}</div>` : ""}
        <div class="cp-actions">
          <div class="cp-detail-row">
            <span style="font-weight:600">Cantidad</span>
            <div class="cp-qty">
              <button type="button" id="detMenos" aria-label="Menos"><i class="fa-solid fa-minus"></i></button>
              <span id="detCant">1</span>
              <button type="button" id="detMas" aria-label="Más"><i class="fa-solid fa-plus"></i></button>
            </div>
          </div>
          <button type="button" class="cp-btn" id="detAgregar"><i class="fa-solid fa-basket-shopping"></i>Agregar al pedido</button>
          <button type="button" class="cp-btn secondary" id="detConsultar"><i class="fa-regular fa-comment-dots"></i>Preguntar si hay disponible</button>
        </div>
      </div>`;
    const actualizar = () => { $("detCant").textContent = cantidad; };
    $("detMenos").onclick = () => { cantidad = Math.max(1, cantidad - 1); actualizar(); };
    $("detMas").onclick = () => { cantidad = Math.min(999, cantidad + 1); actualizar(); };
    $("detAgregar").onclick = () => { agregar(clase, id, cantidad); cerrar("detalle"); };
    $("detConsultar").onclick = () => { cerrar("detalle", true); consultar(clase, id, cantidad); };
    abrir("detalle");
  }

  /* ------------------------- carrito ------------------------- */
  function agregar(clase, id, cantidad = 1, silencioso = false) {
    const item = buscarItem(clase, id);
    if (!item) return;
    const existente = state.carrito.find((c) => c.clase === clase && c.id === id);
    if (existente) existente.cantidad = Math.min(999, existente.cantidad + cantidad);
    else state.carrito.push({ clase, id, cantidad });
    guardarCarrito();
    actualizarFab();
    if (!silencioso) toast(`Agregado: ${item.nombre}`);
  }

  function consultar(clase, id, cantidad = 1) {
    if (!state.carrito.some((c) => c.clase === clase && c.id === id)) agregar(clase, id, cantidad, true);
    state.tipo = "CONSULTA";
    abrirPedido();
  }

  function itemsCarrito() {
    return state.carrito
      .map((c) => ({ ...c, item: buscarItem(c.clase, c.id) }))
      .filter((c) => c.item);
  }

  function totalCarrito() {
    return itemsCarrito().reduce((acc, c) => acc + (Number(c.item.precio) || 0) * c.cantidad, 0);
  }

  function actualizarFab() {
    const items = itemsCarrito();
    const cantidad = items.reduce((acc, c) => acc + c.cantidad, 0);
    const btn = $("carritoBtn");
    btn.hidden = cantidad === 0;
    $("carritoCantidad").textContent = cantidad;
    const total = totalCarrito();
    $("carritoTexto").textContent = state.data.config.mostrar_precios && total > 0 ? `Ver pedido · ${gs(total)}` : "Ver pedido";
  }

  function abrirPedido() {
    renderPedido();
    abrir("pedido");
  }

  function renderPedido(error = "") {
    const items = itemsCarrito();
    const total = totalCarrito();
    const esConsulta = state.tipo === "CONSULTA";
    const mostrarPrecios = state.data.config.mostrar_precios;
    const guardado = (() => { try { return JSON.parse(localStorage.getItem("catalogo_cliente") || "{}"); } catch (_) { return {}; } })();

    $("pedidoContenido").innerHTML = `
      <div>
        <h2 id="pedidoTitulo">${esConsulta ? "Consultar disponibilidad" : "Tu pedido"}</h2>
        <p class="cp-sub">${esConsulta
          ? "Te avisamos si tenemos lo que buscás y el precio."
          : "Lo recibimos y te respondemos para confirmar disponibilidad, precio y entrega."}</p>
        <div class="cp-tipo" role="tablist">
          <button type="button" class="${!esConsulta ? "active" : ""}" data-tipo="PEDIDO"><i class="fa-solid fa-basket-shopping"></i> Hacer pedido</button>
          <button type="button" class="${esConsulta ? "active" : ""}" data-tipo="CONSULTA"><i class="fa-regular fa-comment-dots"></i> Solo consultar</button>
        </div>
        ${items.length ? `
          <ul class="cp-items">
            ${items.map((c, idx) => `
              <li class="cp-item">
                <div class="cp-item-info">
                  <strong>${esc(c.item.nombre)}</strong>
                  <small>${mostrarPrecios && Number(c.item.precio) > 0 ? `${gs(c.item.precio)} c/u` : "Precio a confirmar"}</small>
                </div>
                <div class="cp-qty">
                  <button type="button" data-menos="${idx}" aria-label="Menos"><i class="fa-solid fa-minus"></i></button>
                  <span>${c.cantidad}</span>
                  <button type="button" data-mas="${idx}" aria-label="Más"><i class="fa-solid fa-plus"></i></button>
                </div>
                <button type="button" class="cp-remove" data-quitar="${idx}" aria-label="Quitar"><i class="fa-regular fa-trash-can"></i></button>
              </li>`).join("")}
          </ul>
          ${mostrarPrecios && total > 0 ? `
            <div class="cp-total"><span>Total estimado</span><span>${gs(total)}</span></div>
            <p class="cp-total-note">El precio final se confirma al responderte.</p>` : ""}
        ` : `<p class="cp-empty-cart">${esConsulta ? "Podés escribir tu consulta abajo, aunque no hayas elegido productos." : "Todavía no agregaste productos."}</p>`}

        <form class="cp-form" id="pedidoForm" novalidate>
          <div class="cp-field">
            <label for="pNombre">Tu nombre</label>
            <input id="pNombre" name="nombre" required maxlength="160" autocomplete="name" value="${esc(guardado.nombre || "")}">
          </div>
          <div class="cp-field">
            <label for="pTelefono">Tu teléfono / WhatsApp</label>
            <input id="pTelefono" name="telefono" required maxlength="40" inputmode="tel" autocomplete="tel" placeholder="Ej. 0981 123 456" value="${esc(guardado.telefono || "")}">
          </div>
          <div class="cp-field">
            <label for="pNota">${esConsulta ? "Tu consulta" : "Nota (opcional)"}</label>
            <textarea id="pNota" name="nota" rows="3" maxlength="1000" placeholder="${esConsulta ? "Ej. ¿Tienen este cuaderno en tapa dura?" : "Ej. Paso a retirar mañana a la tarde"}"></textarea>
          </div>
          <div class="cp-hp" aria-hidden="true"><label>No completar<input name="sitio_web" tabindex="-1" autocomplete="off"></label></div>
          ${error ? `<p class="cp-error">${esc(error)}</p>` : ""}
          <button type="submit" class="cp-btn${state.data.config.whatsapp ? " wa" : ""}" id="pedidoEnviar" ${state.enviando ? "disabled" : ""}>
            ${state.data.config.whatsapp
              ? `<i class="fa-brands fa-whatsapp"></i>${esConsulta ? "Consultar por WhatsApp" : "Enviar pedido por WhatsApp"}`
              : `<i class="fa-solid fa-paper-plane"></i>${state.enviando ? "Enviando…" : (esConsulta ? "Enviar consulta" : "Enviar pedido")}`}
          </button>
          ${state.data.config.whatsapp ? `<p class="cp-total-note">Se abre WhatsApp con tu pedido ya escrito. Solo tocá enviar.</p>` : ""}
        </form>
      </div>`;

    const cont = $("pedidoContenido");
    cont.querySelectorAll("[data-tipo]").forEach((b) => b.addEventListener("click", () => { state.tipo = b.dataset.tipo; renderPedido(); }));
    cont.querySelectorAll("[data-menos]").forEach((b) => b.addEventListener("click", () => cambiarCantidad(Number(b.dataset.menos), -1)));
    cont.querySelectorAll("[data-mas]").forEach((b) => b.addEventListener("click", () => cambiarCantidad(Number(b.dataset.mas), 1)));
    cont.querySelectorAll("[data-quitar]").forEach((b) => b.addEventListener("click", () => quitar(Number(b.dataset.quitar))));
    $("pedidoForm").addEventListener("submit", enviarPedido);
  }

  function cambiarCantidad(idx, delta) {
    const items = itemsCarrito();
    const c = items[idx];
    if (!c) return;
    const real = state.carrito.find((x) => x.clase === c.clase && x.id === c.id);
    real.cantidad = Math.max(1, Math.min(999, real.cantidad + delta));
    guardarCarrito();
    actualizarFab();
    conservarFormulario(renderPedido);
  }

  function quitar(idx) {
    const c = itemsCarrito()[idx];
    if (!c) return;
    state.carrito = state.carrito.filter((x) => !(x.clase === c.clase && x.id === c.id));
    guardarCarrito();
    actualizarFab();
    conservarFormulario(renderPedido);
  }

  function conservarFormulario(fn) {
    const nota = $("pNota")?.value || "";
    const nombre = $("pNombre")?.value;
    const tel = $("pTelefono")?.value;
    fn();
    if ($("pNota")) $("pNota").value = nota;
    if (nombre !== undefined && $("pNombre")) $("pNombre").value = nombre;
    if (tel !== undefined && $("pTelefono")) $("pTelefono").value = tel;
  }

  async function enviarPedido(event) {
    event.preventDefault();
    if (state.enviando) return;
    const form = event.target;
    const nombre = form.nombre.value.trim();
    const telefono = form.telefono.value.trim();
    const nota = form.nota.value.trim();
    const items = itemsCarrito();

    if (!nombre) return conservarFormulario(() => renderPedido("Escribí tu nombre."));
    if (telefono.replace(/\D/g, "").length < 6) return conservarFormulario(() => renderPedido("Escribí un teléfono válido para poder responderte."));
    if (!items.length && !nota) return conservarFormulario(() => renderPedido("Agregá algún producto o escribí tu consulta."));

    try { localStorage.setItem("catalogo_cliente", JSON.stringify({ nombre, telefono })); } catch (_) { /* nada */ }

    const whatsapp = state.data.config.whatsapp;
    if (whatsapp) return enviarPorWhatsapp({ whatsapp, nombre, telefono, nota, items, sitioWeb: form.sitio_web.value });

    state.enviando = true;
    conservarFormulario(() => renderPedido());
    try {
      const res = await fetch(`${API}/${encodeURIComponent(state.slug)}/pedido`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo: state.tipo,
          nombre,
          telefono,
          nota,
          sitio_web: form.sitio_web.value,
          items: items.map((c) => ({ clase: c.clase, id: c.id, cantidad: c.cantidad }))
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "No se pudo enviar. Probá de nuevo.");

      const tipo = state.tipo;
      state.carrito = [];
      state.tipo = "PEDIDO";
      guardarCarrito();
      actualizarFab();
      mostrarExito(data, tipo);
    } catch (error) {
      state.enviando = false;
      conservarFormulario(() => renderPedido(error.message));
      return;
    }
    state.enviando = false;
  }

  function textoWhatsapp({ nombre, telefono, nota, items }) {
    const c = state.data.config;
    const tienda = c.nombre_publico || "";
    const lineas = [state.tipo === "CONSULTA"
      ? `Hola ${tienda}! Quiero consultar si tienen disponible:`
      : `Hola ${tienda}! Quiero hacer un pedido:`];
    if (items.length) {
      lineas.push("");
      items.forEach((it) => {
        const precio = Number(it.item.precio) || 0;
        const sub = c.mostrar_precios && precio > 0 ? ` - ${gs(precio * it.cantidad)}` : "";
        lineas.push(`• ${it.cantidad} x ${it.item.nombre}${sub}`);
      });
      const total = totalCarrito();
      if (c.mostrar_precios && total > 0) { lineas.push(""); lineas.push(`Total estimado: ${gs(total)}`); }
    }
    if (nota) { lineas.push(""); lineas.push(state.tipo === "CONSULTA" && !items.length ? nota : `Nota: ${nota}`); }
    lineas.push("");
    lineas.push(`Nombre: ${nombre}`);
    lineas.push(`Teléfono: ${telefono}`);
    return lineas.join("\n");
  }

  /** Abre WhatsApp con el pedido ya escrito. Tambien lo guarda en el sistema, sin esperar. */
  function enviarPorWhatsapp({ whatsapp, nombre, telefono, nota, items, sitioWeb }) {
    const url = `https://wa.me/${encodeURIComponent(whatsapp)}?text=${encodeURIComponent(textoWhatsapp({ nombre, telefono, nota, items }))}`;
    // Sin "noopener" en las opciones: con esa opcion window.open devuelve null aunque abra la pestaña.
    const ventana = window.open(url, "_blank");
    if (ventana) { try { ventana.opener = null; } catch (_) { /* nada */ } }

    fetch(`${API}/${encodeURIComponent(state.slug)}/pedido`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        tipo: state.tipo, nombre, telefono, nota, sitio_web: sitioWeb,
        items: items.map((c) => ({ clase: c.clase, id: c.id, cantidad: c.cantidad }))
      })
    }).catch(() => { /* el mensaje ya va por WhatsApp */ });

    const tipo = state.tipo;
    state.carrito = [];
    state.tipo = "PEDIDO";
    guardarCarrito();
    actualizarFab();
    mostrarExito({ whatsapp_url: url, directo: true }, tipo);
    // Si el navegador no dejo abrir otra pestaña, se abre en esta.
    if (!ventana) window.location.href = url;
  }

  function mostrarExito(data, tipo) {
    if (data.directo) {
      $("pedidoContenido").innerHTML = `
        <div class="cp-success">
          <i class="fa-brands fa-whatsapp big"></i>
          <h2>¡Ya casi!</h2>
          <p>Se abrió WhatsApp con tu ${tipo === "CONSULTA" ? "consulta" : "pedido"} escrito. Tocá <strong>enviar</strong> allí y te respondemos.</p>
          <div class="cp-actions">
            <a class="cp-btn wa" href="${esc(safeUrl(data.whatsapp_url))}" target="_blank" rel="noopener"><i class="fa-brands fa-whatsapp"></i>Abrir WhatsApp de nuevo</a>
            <button type="button" class="cp-btn secondary" data-close="pedido">Seguir mirando</button>
          </div>
        </div>`;
      return;
    }
    const wa = safeUrl(data.whatsapp_url);
    $("pedidoContenido").innerHTML = `
      <div class="cp-success">
        <i class="fa-solid fa-circle-check big"></i>
        <h2>${tipo === "CONSULTA" ? "¡Consulta enviada!" : "¡Pedido recibido!"}</h2>
        ${data.id ? `<p>Número: <strong>#${esc(data.id)}</strong></p>` : ""}
        <p>Te vamos a responder al teléfono que dejaste para confirmar disponibilidad${tipo === "CONSULTA" ? "" : ", precio y entrega"}.</p>
        <div class="cp-actions">
          ${wa ? `<a class="cp-btn wa" href="${esc(wa)}" target="_blank" rel="noopener"><i class="fa-brands fa-whatsapp"></i>Enviar también por WhatsApp</a>` : ""}
          <button type="button" class="cp-btn secondary" data-close="pedido">Seguir mirando</button>
        </div>
      </div>`;
  }

  /* ------------------------- modales ------------------------- */
  // Cada ventana abierta deja una entrada en el historial, asi el boton "atras" del celular la cierra.
  function abrir(nombre) {
    const el = nombre === "detalle" ? $("detalleModal") : $("pedidoPanel");
    el.hidden = false;
    document.body.style.overflow = "hidden";
    const st = history.state;
    if (st && st.cpModal) history.replaceState({ cpModal: nombre }, "");
    else history.pushState({ cpModal: nombre }, "");
  }

  /** soloOcultar: no tocar el historial (cuando lo cerro el "atras" o se abre otra ventana enseguida). */
  function cerrar(nombre, soloOcultar = false) {
    const el = nombre === "detalle" ? $("detalleModal") : $("pedidoPanel");
    if (el.hidden) return;
    el.hidden = true;
    if ($("detalleModal").hidden && $("pedidoPanel").hidden) document.body.style.overflow = "";
    if (!soloOcultar && history.state && history.state.cpModal === nombre) history.back();
  }

  window.addEventListener("popstate", () => { cerrar("detalle", true); cerrar("pedido", true); });
  if (history.state && history.state.cpModal) history.replaceState(null, "");

  async function compartir() {
    const url = window.location.href;
    const titulo = state.data?.config?.nombre_publico || "Catálogo";
    if (navigator.share) {
      try { await navigator.share({ title: titulo, url }); return; } catch (_) { /* cancelado */ }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast("Enlace copiado");
    } catch (_) {
      window.prompt("Copiá el enlace:", url);
    }
  }

  document.addEventListener("click", (event) => {
    const t = event.target.closest("[data-close],[data-ver],[data-agregar],[data-consultar],[data-consulta-libre]");
    if (!t) return;
    if (t.dataset.close) return cerrar(t.dataset.close);
    if (t.dataset.consultaLibre) { state.tipo = "CONSULTA"; return abrirPedido(); }
    const [clase, idTxt] = String(t.dataset.ver || t.dataset.agregar || t.dataset.consultar).split(":");
    const id = Number(idTxt);
    if (t.dataset.ver) return abrirDetalle(clase, id);
    if (t.dataset.agregar) return agregar(clase, id);
    if (t.dataset.consultar) return consultar(clase, id);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") { cerrar("detalle"); cerrar("pedido"); }
  });

  $("carritoBtn").addEventListener("click", () => { state.tipo = "PEDIDO"; abrirPedido(); });

  /* ------------------------- inicio ------------------------- */
  async function iniciar() {
    const partes = window.location.pathname.split("/").filter(Boolean);
    state.slug = partes[0] === "catalogo" && partes[1] ? decodeURIComponent(partes[1]) : "";
    if (!state.slug) {
      $("app").innerHTML = `<div class="cp-empty"><i class="fa-solid fa-store-slash"></i><h1>Catálogo no disponible</h1><p>Todavía no hay un catálogo publicado.</p></div>`;
      return;
    }
    try {
      const res = await fetch(`${API}/${encodeURIComponent(state.slug)}`, { credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Este catálogo no está disponible por ahora.");
      state.data = data;
      state.carrito = cargarCarrito().filter((c) => buscarItem(c.clase, c.id));
      renderShell();
      actualizarFab();
    } catch (error) {
      $("app").innerHTML = `<div class="cp-empty"><i class="fa-solid fa-store-slash"></i><h1>Catálogo no disponible</h1><p>${esc(error.message)}</p></div>`;
    }
  }

  iniciar();
})();
