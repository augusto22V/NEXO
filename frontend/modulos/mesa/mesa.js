const mesaState = {
  mesas: [],
  selectedMesaId: null,
  modoMover: false,
  mensajeTimer: null,
  abriendoVenta: false
};

function $(id) {
  return document.getElementById(id);
}

function toId(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
}

function normalizarEstado(value, fallback = "LIBRE") {
  const estado = String(value || "").trim().toUpperCase();
  if (["LIBRE", "OCUPADA", "RESERVADA", "INACTIVA"].includes(estado)) {
    return estado;
  }
  return fallback;
}

function estadoCss(estado) {
  return normalizarEstado(estado, "LIBRE").toLowerCase();
}

function obtenerMesaSeleccionada() {
  return mesaState.mesas.find((mesa) => toId(mesa.id) === toId(mesaState.selectedMesaId)) || null;
}

function mostrarMensajeMesa(texto, tipo = "aviso") {
  const box = $("mesaMensaje");
  if (!box) return;

  box.textContent = texto || "";
  box.dataset.tipo = tipo || "aviso";

  if (mesaState.mensajeTimer) {
    clearTimeout(mesaState.mensajeTimer);
  }

  mesaState.mensajeTimer = setTimeout(() => {
    box.textContent = "";
    box.dataset.tipo = "";
    mesaState.mensajeTimer = null;
  }, 3500);
}

async function apiMesa(path, options = {}) {
  const headers = Object.assign({}, options.headers || {});

  if (options.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(path, {
    method: options.method || "GET",
    credentials: "include",
    headers,
    body: options.body || undefined
  });

  const raw = await response.text();
  let data = null;

  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch (_error) {
      data = null;
    }
  }

  if (!response.ok) {
    throw new Error(data?.error || `Error ${response.status}`);
  }

  return data;
}

function volverMesas() {
  if (document.referrer && document.referrer.startsWith(window.location.origin)) {
    window.history.back();
    return;
  }

  window.location.href = "/home.html";
}

async function cargarContextoMesa() {
  const badge = $("mesaContexto");
  if (!badge) return;

  try {
    const data = await apiMesa("/api/auth/verify");
    const usuario = data?.usuario || {};
    const empresa = Number(usuario.empresa_id || 0) || "-";
    const terminal = Number(usuario.terminal_id || 0) || "-";

    badge.textContent = `Empresa ${empresa} / Terminal ${terminal}`;

    const vendedorInput = $("mesaVendedorId");
    if (vendedorInput && !String(vendedorInput.value || "").trim()) {
      const usuarioId = Number(usuario.id || 0);
      vendedorInput.value = usuarioId > 0 ? String(usuarioId) : "1";
    }
  } catch (_error) {
    badge.textContent = "Empresa - / Terminal -";
  }
}

function actualizarResumenMesas() {
  const resumen = $("mesaResumen");
  if (!resumen) return;

  const total = mesaState.mesas.length;
  const libres = mesaState.mesas.filter((mesa) => normalizarEstado(mesa.estado) === "LIBRE").length;
  const ocupadas = mesaState.mesas.filter((mesa) => normalizarEstado(mesa.estado) === "OCUPADA").length;
  const reservadas = mesaState.mesas.filter((mesa) => normalizarEstado(mesa.estado) === "RESERVADA").length;
  const inactivas = mesaState.mesas.filter((mesa) => normalizarEstado(mesa.estado) === "INACTIVA").length;

  resumen.textContent = `${total} puestos | Libres ${libres} | Ocupados ${ocupadas} | Reservados ${reservadas} | Inactivos ${inactivas}`;
}

function renderMesasBoard() {
  const board = $("mesaBoard");
  if (!board) return;

  board.innerHTML = "";

  if (!mesaState.mesas.length) {
    board.innerHTML = '<div class="mesa-board-empty">No hay puestos de mostrador para esta empresa y terminal.</div>';
    return;
  }

  let maxX = 700;
  let maxY = 460;

  mesaState.mesas.forEach((mesa) => {
    const x = Number(mesa.posicion_x) || 40;
    const y = Number(mesa.posicion_y) || 40;
    maxX = Math.max(maxX, x + 180);
    maxY = Math.max(maxY, y + 180);
  });

  const canvas = document.createElement("div");
  canvas.className = "mesa-board-canvas";
  canvas.style.width = `${Math.ceil(maxX)}px`;
  canvas.style.height = `${Math.ceil(maxY)}px`;

  mesaState.mesas.forEach((mesa) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = `mesa-card estado-${estadoCss(mesa.estado)}`;

    if (mesaState.modoMover) {
      card.classList.add("mover-on");
    }

    if (toId(mesa.id) === toId(mesaState.selectedMesaId)) {
      card.classList.add("selected");
    }

    const x = Number(mesa.posicion_x) || 40;
    const y = Number(mesa.posicion_y) || 40;
    card.style.left = `${x}px`;
    card.style.top = `${y}px`;

    const meta = mesa.venta_numero
      ? `Pedido ${mesa.venta_numero}`
      : normalizarEstado(mesa.estado, "LIBRE");

    card.innerHTML = `
      <span class="mesa-card-numero">${mesa.numero || "-"}</span>
      <span class="mesa-card-meta">${meta}</span>
    `;

    card.addEventListener("click", (event) => {
      if (card.dataset.dragMoved === "1") return;
      if (mesaState.modoMover) return;
      if (event.detail > 1) return;
      seleccionarMesa(toId(mesa.id));
    });

    card.addEventListener("dblclick", async (event) => {
      if (card.dataset.dragMoved === "1") return;
      if (mesaState.modoMover) return;

      event.preventDefault();

      try {
        await abrirVentaMesaSeleccionada(mesa);
      } catch (error) {
        mostrarMensajeMesa(error.message || "No se pudo abrir la venta", "error");
      }
    });

    let ultimaPulsacionTouch = 0;
    card.addEventListener(
      "touchend",
      async (event) => {
        if (card.dataset.dragMoved === "1") return;
        if (mesaState.modoMover) return;

        event.preventDefault();

        const ahora = Date.now();
        if (ahora - ultimaPulsacionTouch <= 320) {
          ultimaPulsacionTouch = 0;
          try {
            await abrirVentaMesaSeleccionada(mesa);
          } catch (error) {
            mostrarMensajeMesa(error.message || "No se pudo abrir la venta", "error");
          }
          return;
        }

        ultimaPulsacionTouch = ahora;
        seleccionarMesa(toId(mesa.id));
      },
      { passive: false }
    );

    habilitarDragMesa(card, mesa);

    canvas.appendChild(card);
  });

  board.appendChild(canvas);
}

function renderMesaSeleccionada() {
  const mesa = obtenerMesaSeleccionada();
  const vacio = $("mesaSeleccionVacia");
  const detalle = $("mesaSeleccionDetalle");

  if (!vacio || !detalle) return;

  if (!mesa) {
    vacio.hidden = false;
    detalle.hidden = true;
    return;
  }

  vacio.hidden = true;
  detalle.hidden = false;

  $("mesaSelId").textContent = String(mesa.id || "-");
  $("mesaSelVenta").textContent = mesa.venta_numero
    ? `Pedido ${mesa.venta_numero}`
    : "Sin venta";

  $("mesaEditNumero").value = mesa.numero || "";
  $("mesaEditEstado").value = normalizarEstado(mesa.estado, "LIBRE");
  const editVentaRapida = $("mesaEditVentaRapida");
  if (editVentaRapida) {
    editVentaRapida.checked = mesa.mostrar_en_venta_rapida !== false;
  }

  const btnAbrir = $("btnMesaAbrirVenta");
  if (btnAbrir) {
    btnAbrir.textContent = mesa.venta_id ? "Abrir Venta Activa" : "Abrir Venta";
  }
}

function actualizarAuditoriaMesaSimple() {
  const input = $("mesaAuditId");
  if (!input) return;

  const mesa = obtenerMesaSeleccionada();
  const mesaId = toId(mesa?.id);
  input.value = mesaId ? String(mesaId) : "";

  if (typeof window.refrescarAuditoriaPantalla === "function") {
    window.refrescarAuditoriaPantalla();
  }
}

function renderMesaPantalla() {
  actualizarResumenMesas();
  renderMesasBoard();
  renderMesaSeleccionada();
}

function seleccionarMesa(mesaId) {
  mesaState.selectedMesaId = toId(mesaId) || null;
  renderMesaPantalla();
  actualizarAuditoriaMesaSimple();
}

async function cargarMesas() {
  const mesas = await apiMesa("/api/mesa");
  mesaState.mesas = Array.isArray(mesas) ? mesas : [];

  if (
    mesaState.selectedMesaId &&
    !mesaState.mesas.some((mesa) => toId(mesa.id) === toId(mesaState.selectedMesaId))
  ) {
    mesaState.selectedMesaId = null;
  }

  renderMesaPantalla();
  actualizarAuditoriaMesaSimple();
}

async function guardarPosicionMesa(mesaId, x, y) {
  await apiMesa(`/api/mesa/${mesaId}/posicion`, {
    method: "PUT",
    body: JSON.stringify({ posicion_x: x, posicion_y: y })
  });
}

function habilitarDragMesa(card, mesa) {
  let drag = null;

  card.addEventListener("pointerdown", (event) => {
    if (!mesaState.modoMover) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;

    event.preventDefault();

    const originX = Number(mesa.posicion_x) || 40;
    const originY = Number(mesa.posicion_y) || 40;

    drag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX,
      originY,
      x: originX,
      y: originY,
      moved: false
    };

    card.classList.add("dragging");

    if (typeof card.setPointerCapture === "function") {
      card.setPointerCapture(event.pointerId);
    }
  });

  card.addEventListener("pointermove", (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;

    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;

    const x = Math.max(0, Math.round((drag.originX + dx) * 100) / 100);
    const y = Math.max(0, Math.round((drag.originY + dy) * 100) / 100);

    drag.x = x;
    drag.y = y;

    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      drag.moved = true;
    }

    card.style.left = `${x}px`;
    card.style.top = `${y}px`;
  });

  const finalizeDrag = async (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;

    card.classList.remove("dragging");

    if (typeof card.releasePointerCapture === "function") {
      try {
        card.releasePointerCapture(event.pointerId);
      } catch (_error) {
        // ignore capture errors
      }
    }

    const moved = drag.moved && (Math.abs(drag.x - drag.originX) > 0.5 || Math.abs(drag.y - drag.originY) > 0.5);
    card.dataset.dragMoved = moved ? "1" : "0";
    setTimeout(() => {
      card.dataset.dragMoved = "0";
    }, 160);

    if (moved) {
      mesa.posicion_x = drag.x;
      mesa.posicion_y = drag.y;

      try {
        await guardarPosicionMesa(mesa.id, drag.x, drag.y);
        mostrarMensajeMesa(`Puesto ${mesa.numero} movido`, "ok");
      } catch (error) {
        mostrarMensajeMesa(error.message || "No se pudo guardar posicion", "error");
        await cargarMesas();
      }
    }

    drag = null;
  };

  card.addEventListener("pointerup", finalizeDrag);
  card.addEventListener("pointercancel", finalizeDrag);
}

function obtenerPayloadApertura() {
  const tipoPedido = Number($("mesaTipoPedido")?.value || 1) || 1;
  const vendedorId = Number($("mesaVendedorId")?.value || 0) || 1;

  return {
    tipo_pedido_id: tipoPedido,
    vendedor_id: vendedorId
  };
}

async function crearMesaDesdeFormulario() {
  const numero = String($("mesaNuevaNumero")?.value || "").trim();
  const estado = normalizarEstado($("mesaNuevaEstado")?.value || "LIBRE", "LIBRE");
  const mostrarEnVentaRapida = $("mesaNuevaVentaRapida")?.checked !== false;

  if (!numero) {
    mostrarMensajeMesa("Ingresa el número o nombre del puesto", "aviso");
    return;
  }

  const creada = await apiMesa("/api/mesa", {
    method: "POST",
    body: JSON.stringify({
      numero,
      estado,
      mostrar_en_venta_rapida: mostrarEnVentaRapida
    })
  });

  $("mesaNuevaNumero").value = "";
  if ($("mesaNuevaVentaRapida")) {
    $("mesaNuevaVentaRapida").checked = true;
  }
  mesaState.selectedMesaId = toId(creada?.id) || null;

  await cargarMesas();
  mostrarMensajeMesa(`Puesto ${numero} creado`, "ok");
}

async function guardarMesaSeleccionada() {
  const mesa = obtenerMesaSeleccionada();
  if (!mesa) {
    mostrarMensajeMesa("Selecciona un puesto", "aviso");
    return;
  }

  const numero = String($("mesaEditNumero")?.value || "").trim();
  const estado = normalizarEstado($("mesaEditEstado")?.value || "LIBRE", "LIBRE");
  const mostrarEnVentaRapida = $("mesaEditVentaRapida")?.checked !== false;

  if (!numero) {
    mostrarMensajeMesa("El número o nombre del puesto es obligatorio", "aviso");
    return;
  }

  await apiMesa(`/api/mesa/${mesa.id}`, {
    method: "PUT",
    body: JSON.stringify({
      numero,
      estado,
      mostrar_en_venta_rapida: mostrarEnVentaRapida
    })
  });

  await cargarMesas();
  mostrarMensajeMesa(`Puesto ${numero} actualizado`, "ok");
}

async function eliminarMesaSeleccionada() {
  const mesa = obtenerMesaSeleccionada();
  if (!mesa) {
    mostrarMensajeMesa("Selecciona un puesto", "aviso");
    return;
  }

  if (mesa.venta_id) {
    mostrarMensajeMesa("No puedes eliminar un puesto con venta activa", "error");
    return;
  }

  if (!window.confirm(`Eliminar puesto ${mesa.numero}?`)) {
    return;
  }

  await apiMesa(`/api/mesa/${mesa.id}`, { method: "DELETE" });
  mesaState.selectedMesaId = null;
  await cargarMesas();
  mostrarMensajeMesa(`Puesto ${mesa.numero} eliminado`, "ok");
}

async function liberarMesaSeleccionada() {
  const mesa = obtenerMesaSeleccionada();
  if (!mesa) {
    mostrarMensajeMesa("Selecciona un puesto", "aviso");
    return;
  }

  if (!window.confirm(`Liberar puesto ${mesa.numero}?`)) {
    return;
  }

  await apiMesa(`/api/mesa/${mesa.id}/liberar`, { method: "POST" });
  await cargarMesas();
  mostrarMensajeMesa(`Puesto ${mesa.numero} liberado`, "ok");
}

async function abrirVentaMesaSeleccionada(mesaInput = null) {
  const mesa = mesaInput || obtenerMesaSeleccionada();
  if (!mesa) {
    mostrarMensajeMesa("Selecciona un puesto", "aviso");
    return;
  }

  if (mesaState.abriendoVenta) {
    return;
  }

  const mesaId = toId(mesa.id);
  if (!mesaId) {
    throw new Error("Puesto inválido");
  }

  mesaState.abriendoVenta = true;
  try {
    if (mesaId !== toId(mesaState.selectedMesaId)) {
      mesaState.selectedMesaId = mesaId;
      renderMesaPantalla();
      actualizarAuditoriaMesaSimple();
    }

    const data = await apiMesa(`/api/mesa/seleccionar/${mesaId}`, {
      method: "POST",
      body: JSON.stringify(obtenerPayloadApertura())
    });

    const ventaId = toId(data?.venta?.id);
    if (!ventaId) {
      throw new Error("No se pudo abrir la venta del puesto");
    }

    window.location.href = `/modulos/venta/venta_rapida.html?venta_id=${encodeURIComponent(ventaId)}`;
  } finally {
    mesaState.abriendoVenta = false;
  }
}

function actualizarBotonMover() {
  const boton = $("btnMesaMover");
  if (!boton) return;

  boton.textContent = `Mover: ${mesaState.modoMover ? "ON" : "OFF"}`;
  boton.classList.toggle("btn-primary", mesaState.modoMover);
  boton.classList.toggle("btn-neutral", !mesaState.modoMover);
}

function toggleModoMover() {
  mesaState.modoMover = !mesaState.modoMover;
  actualizarBotonMover();
  renderMesasBoard();
}

function registrarEventosMesa() {
  $("btnMesaRefrescar")?.addEventListener("click", async () => {
    try {
      await cargarMesas();
      mostrarMensajeMesa("Mostrador actualizado", "ok");
    } catch (error) {
      mostrarMensajeMesa(error.message || "No se pudieron cargar los puestos", "error");
    }
  });

  $("btnMesaMover")?.addEventListener("click", toggleModoMover);

  $("btnMesaCrear")?.addEventListener("click", async () => {
    try {
      await crearMesaDesdeFormulario();
    } catch (error) {
      mostrarMensajeMesa(error.message || "No se pudo crear el puesto", "error");
    }
  });

  $("btnMesaGuardar")?.addEventListener("click", async () => {
    try {
      await guardarMesaSeleccionada();
    } catch (error) {
      mostrarMensajeMesa(error.message || "No se pudo actualizar el puesto", "error");
    }
  });

  $("btnMesaEliminar")?.addEventListener("click", async () => {
    try {
      await eliminarMesaSeleccionada();
    } catch (error) {
      mostrarMensajeMesa(error.message || "No se pudo eliminar el puesto", "error");
    }
  });

  $("btnMesaLiberar")?.addEventListener("click", async () => {
    try {
      await liberarMesaSeleccionada();
    } catch (error) {
      mostrarMensajeMesa(error.message || "No se pudo liberar el puesto", "error");
    }
  });

  $("btnMesaAbrirVenta")?.addEventListener("click", async () => {
    try {
      await abrirVentaMesaSeleccionada();
    } catch (error) {
      mostrarMensajeMesa(error.message || "No se pudo abrir la venta", "error");
    }
  });

  const vendedorInput = $("mesaVendedorId");
  if (vendedorInput) {
    vendedorInput.addEventListener("input", () => {
      vendedorInput.value = vendedorInput.value.replace(/[^0-9]/g, "");
    });
  }

  const nuevaMesaInput = $("mesaNuevaNumero");
  if (nuevaMesaInput) {
    nuevaMesaInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        $("btnMesaCrear")?.click();
      }
    });
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  registrarEventosMesa();
  actualizarBotonMover();
  actualizarAuditoriaMesaSimple();
  await cargarContextoMesa();

  try {
    await cargarMesas();
  } catch (error) {
    mostrarMensajeMesa(error.message || "No se pudieron cargar los puestos", "error");
  }
});

window.volverMesas = volverMesas;
