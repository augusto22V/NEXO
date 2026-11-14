(function () {
  "use strict";

  const API = "/api/catalogo/admin";
  const state = { config: null, servicios: [], estado: "PENDIENTE", enlace: "" };
  const $ = (id) => document.getElementById(id);

  function esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function gs(value) {
    return `Gs ${Number(value || 0).toLocaleString("es-PY", { maximumFractionDigits: 0 })}`;
  }

  function fecha(value) {
    if (!value) return "";
    const d = new Date(value);
    return d.toLocaleString("es-PY", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  }

  function toast(msg) {
    const el = $("caToast");
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { el.hidden = true; }, 2400);
  }

  async function api(url, options = {}) {
    const res = await fetch(url, { credentials: "include", ...options });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      window.location.href = "/login/login.html";
      throw new Error("Sesión vencida");
    }
    if (!res.ok) throw new Error(data.error || "Error de comunicación");
    return data;
  }

  /** Telefono del cliente a formato wa.me (Paraguay: 0981... -> 595981...). */
  function waCliente(telefono) {
    let d = String(telefono || "").replace(/\D/g, "");
    if (!d) return "";
    if (d.startsWith("0")) d = `595${d.slice(1)}`;
    return d;
  }

  /* ---------------- pestañas ---------------- */
  document.querySelectorAll(".ca-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".ca-tab").forEach((t) => t.classList.toggle("active", t === tab));
      document.querySelectorAll(".ca-panel").forEach((p) => p.classList.toggle("active", p.dataset.panel === tab.dataset.tab));
    });
  });

  /* ---------------- pedidos ---------------- */
  function setPendientes(n) {
    const b = $("badgePendientes");
    b.textContent = n;
    b.hidden = !n;
  }

  function renderPedido(p) {
    const disp = { SIN_STOCK: "sin stock", POCAS_UNIDADES: "pocas unidades" };
    const items = p.items.map((i) => `
      <li>
        <span>${esc(i.cantidad)} × ${esc(i.nombre)} ${disp[i.disponibilidad] ? `<span class="disp">(${disp[i.disponibilidad]})</span>` : ""}</span>
        <span>${Number(i.subtotal) > 0 ? gs(i.subtotal) : "—"}</span>
      </li>`).join("");
    const wa = waCliente(p.cliente_telefono);
    const saludo = encodeURIComponent(`Hola ${p.cliente_nombre}! Te escribimos por tu ${p.tipo === "CONSULTA" ? "consulta" : "pedido"} #${p.id} del catálogo.`);

    const botones = [];
    if (wa) botones.push(`<a class="ca-btn ca-btn-wa ca-btn-sm" href="https://wa.me/${wa}?text=${saludo}" target="_blank" rel="noopener"><i class="fa-brands fa-whatsapp"></i> Responder</a>`);
    botones.push(`<a class="ca-btn ca-btn-sm" href="tel:${esc(p.cliente_telefono)}"><i class="fa-solid fa-phone"></i> Llamar</a>`);
    if (p.estado !== "ATENDIDO") botones.push(`<button type="button" class="ca-btn ca-btn-ok ca-btn-sm" data-estado-pedido="ATENDIDO" data-id="${p.id}"><i class="fa-solid fa-check"></i> Atendido</button>`);
    if (p.estado !== "CANCELADO") botones.push(`<button type="button" class="ca-btn ca-btn-danger ca-btn-sm" data-estado-pedido="CANCELADO" data-id="${p.id}">Cancelar</button>`);
    if (p.estado !== "PENDIENTE") botones.push(`<button type="button" class="ca-btn ca-btn-sm" data-estado-pedido="PENDIENTE" data-id="${p.id}">Volver a pendiente</button>`);

    return `
      <article class="ca-pedido">
        <div class="ca-pedido-head">
          <div>
            <h3>#${p.id} · ${esc(p.cliente_nombre)}</h3>
            <small><i class="fa-solid fa-phone"></i> ${esc(p.cliente_telefono)} · ${fecha(p.created_at)}</small>
          </div>
          <div style="display:grid;gap:4px;justify-items:end">
            <span class="ca-tag ${esc(p.tipo)}">${p.tipo === "CONSULTA" ? "Consulta" : "Pedido"}</span>
            <span class="ca-tag ${esc(p.estado)}">${esc(p.estado.charAt(0) + p.estado.slice(1).toLowerCase())}</span>
          </div>
        </div>
        ${items ? `<ul>${items}</ul>` : ""}
        ${p.cliente_nota ? `<div class="ca-pedido-nota"><i class="fa-regular fa-comment"></i> ${esc(p.cliente_nota)}</div>` : ""}
        ${Number(p.total_estimado) > 0 ? `<div class="ca-pedido-total"><span>Total estimado</span><span>${gs(p.total_estimado)}</span></div>` : ""}
        <div class="ca-pedido-actions">${botones.join("")}</div>
      </article>`;
  }

  async function cargarPedidos() {
    const lista = $("listaPedidos");
    try {
      const data = await api(`${API}/pedidos?estado=${encodeURIComponent(state.estado)}`);
      setPendientes(data.pendientes);
      lista.innerHTML = data.pedidos.length
        ? data.pedidos.map(renderPedido).join("")
        : `<div class="ca-empty"><i class="fa-regular fa-folder-open"></i>${state.estado === "PENDIENTE" ? "No hay pedidos pendientes. Cuando alguien pida desde el catálogo, aparece acá." : "No hay pedidos en esta lista."}</div>`;
    } catch (error) {
      lista.innerHTML = `<div class="ca-empty">${esc(error.message)}</div>`;
    }
  }

  document.querySelectorAll(".ca-filter").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.estado = btn.dataset.estado;
      document.querySelectorAll(".ca-filter").forEach((b) => b.classList.toggle("active", b === btn));
      cargarPedidos();
    });
  });
  $("recargarPedidos").addEventListener("click", cargarPedidos);

  $("listaPedidos").addEventListener("click", async (event) => {
    const btn = event.target.closest("[data-estado-pedido]");
    if (!btn) return;
    btn.disabled = true;
    try {
      await api(`${API}/pedidos/${btn.dataset.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado: btn.dataset.estadoPedido })
      });
      toast("Pedido actualizado");
      cargarPedidos();
    } catch (error) {
      btn.disabled = false;
      toast(error.message);
    }
  });

  /* ---------------- servicios ---------------- */
  function renderServicios() {
    const cont = $("listaServicios");
    if (!state.servicios.length) {
      cont.innerHTML = `<div class="ca-empty"><i class="fa-solid fa-screwdriver-wrench"></i>Todavía no cargaste servicios.</div>`;
      return;
    }
    cont.innerHTML = state.servicios.map((s) => `
      <div class="ca-servicio ${s.activo ? "" : "inactivo"}">
        ${s.imagen_url ? `<img src="${esc(s.imagen_url)}" alt="">` : `<div class="ph"><i class="fa-solid fa-screwdriver-wrench"></i></div>`}
        <div class="ca-servicio-info">
          <strong>${esc(s.nombre)}</strong>
          <small>${s.precio != null ? `${esc(s.precio_texto)} ${gs(s.precio)}` : esc(s.precio_texto || "Consultar precio")}${s.activo ? "" : " · oculto"}</small>
        </div>
        <button type="button" class="ca-btn ca-btn-sm" data-editar="${s.id}"><i class="fa-solid fa-pen"></i></button>
        <button type="button" class="ca-btn ca-btn-sm ca-btn-danger" data-borrar="${s.id}"><i class="fa-regular fa-trash-can"></i></button>
      </div>`).join("");
  }

  function limpiarServicio() {
    $("servicioForm").reset();
    $("sId").value = "";
    $("sActivo").checked = true;
    $("sOrden").value = 0;
    $("sImagenActual").hidden = true;
    $("sImagenActual").innerHTML = "";
    $("servicioFormTitulo").textContent = "Nuevo servicio";
  }

  function editarServicio(id) {
    const s = state.servicios.find((x) => x.id === id);
    if (!s) return;
    $("sId").value = s.id;
    $("sNombre").value = s.nombre;
    $("sDescripcion").value = s.descripcion;
    $("sPrecio").value = s.precio != null ? Math.round(s.precio) : "";
    $("sPrecioTexto").value = s.precio_texto;
    $("sOrden").value = s.orden;
    $("sActivo").checked = s.activo;
    $("sImagen").value = "";
    if (s.imagen_url) {
      $("sImagenActual").innerHTML = `<img src="${esc(s.imagen_url)}" alt=""><label class="ca-check"><input type="checkbox" id="sQuitarImagen"> Quitar foto</label>`;
      $("sImagenActual").hidden = false;
    } else {
      $("sImagenActual").hidden = true;
    }
    $("servicioFormTitulo").textContent = "Editar servicio";
    $("sNombre").focus();
  }

  $("listaServicios").addEventListener("click", async (event) => {
    const editar = event.target.closest("[data-editar]");
    const borrar = event.target.closest("[data-borrar]");
    if (editar) return editarServicio(Number(editar.dataset.editar));
    if (borrar) {
      const s = state.servicios.find((x) => x.id === Number(borrar.dataset.borrar));
      if (!s || !window.confirm(`¿Eliminar el servicio “${s.nombre}”?`)) return;
      try {
        await api(`${API}/servicios/${s.id}`, { method: "DELETE" });
        state.servicios = state.servicios.filter((x) => x.id !== s.id);
        renderServicios();
        if (Number($("sId").value) === s.id) limpiarServicio();
        toast("Servicio eliminado");
      } catch (error) {
        toast(error.message);
      }
    }
  });

  $("servicioCancelar").addEventListener("click", limpiarServicio);

  $("servicioForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const id = Number($("sId").value || 0);
    const fd = new FormData();
    fd.set("nombre", $("sNombre").value.trim());
    fd.set("descripcion", $("sDescripcion").value.trim());
    fd.set("precio", $("sPrecio").value.replace(/[^\d]/g, ""));
    fd.set("precio_texto", $("sPrecioTexto").value.trim());
    fd.set("orden", $("sOrden").value || 0);
    fd.set("activo", $("sActivo").checked);
    if ($("sImagen").files[0]) fd.set("imagen", $("sImagen").files[0]);
    if ($("sQuitarImagen")?.checked) fd.set("quitar_imagen", "true");

    try {
      const guardado = await api(id ? `${API}/servicios/${id}` : `${API}/servicios`, { method: id ? "PUT" : "POST", body: fd });
      const idx = state.servicios.findIndex((s) => s.id === guardado.id);
      if (idx >= 0) state.servicios[idx] = guardado; else state.servicios.push(guardado);
      state.servicios.sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre));
      renderServicios();
      limpiarServicio();
      toast("Servicio guardado");
    } catch (error) {
      toast(error.message);
    }
  });

  /* ---------------- configuracion ---------------- */
  function esEnlaceLocal(url) {
    try {
      const host = new URL(url).hostname;
      return host === "localhost" || /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host);
    } catch (_) {
      return false;
    }
  }

  function pintarEnlace(enlace) {
    state.enlace = enlace;
    $("enlacePublico").value = enlace;
    $("abrirCatalogo").href = enlace;
    $("avisoLocal").hidden = !esEnlaceLocal(enlace);
    const qr = `${API}/qr.png?t=${Date.now()}`;
    $("qrImg").src = qr;
    $("qrDescargar").href = qr;
  }

  function pintarConfig(c) {
    state.config = c;
    $("cPublicado").checked = c.publicado;
    $("cNombre").value = c.nombre_publico;
    $("cMensaje").value = c.mensaje;
    $("cWhatsapp").value = c.whatsapp;
    $("cHorario").value = c.horario;
    $("cDireccion").value = c.direccion;
    $("cSlug").value = c.slug;
    $("cColor").value = c.color && c.color.length === 7 ? c.color : "#7B6BAD";
    $("cPrecios").checked = c.mostrar_precios;
    $("cSinStock").checked = c.mostrar_sin_stock;
  }

  $("copiarEnlace").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(state.enlace);
      toast("Enlace copiado");
    } catch (_) {
      $("enlacePublico").select();
      document.execCommand("copy");
      toast("Enlace copiado");
    }
  });

  $("configForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const data = await api(`${API}/config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          publicado: $("cPublicado").checked,
          nombre_publico: $("cNombre").value,
          mensaje: $("cMensaje").value,
          whatsapp: $("cWhatsapp").value,
          horario: $("cHorario").value,
          direccion: $("cDireccion").value,
          slug: $("cSlug").value,
          color: $("cColor").value,
          mostrar_precios: $("cPrecios").checked,
          mostrar_sin_stock: $("cSinStock").checked
        })
      });
      pintarConfig(data.config);
      pintarEnlace(data.enlace);
      toast("Cambios guardados");
    } catch (error) {
      toast(error.message);
    }
  });

  /* ---------------- inicio ---------------- */
  async function iniciar() {
    try {
      const data = await api(API);
      pintarConfig(data.config);
      pintarEnlace(data.enlace);
      state.servicios = data.servicios;
      renderServicios();
      setPendientes(data.pendientes);
      cargarPedidos();
    } catch (error) {
      $("listaPedidos").innerHTML = `<div class="ca-empty">${esc(error.message)}</div>`;
    }
  }

  iniciar();
  // Revisa pedidos nuevos cada minuto mientras la pantalla esta abierta.
  setInterval(() => { if (!document.hidden) cargarPedidos(); }, 60000);
})();
