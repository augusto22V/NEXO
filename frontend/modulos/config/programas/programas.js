const state = {
  catalogo: [],
  filtroTexto: "",
  filtroZona: "",
  filtroActivo: ""
};

const refs = {};

function getServicio() {
  return window.SoftSysProgramas || null;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function cargarReferencias() {
  refs.tablaProgramas = document.getElementById("tablaProgramas");
  refs.conteoProgramas = document.getElementById("conteoProgramas");
  refs.filtroPrograma = document.getElementById("filtroPrograma");
  refs.filtroZona = document.getElementById("filtroZona");
  refs.filtroActivo = document.getElementById("filtroActivo");

  refs.modal = document.getElementById("modalPrograma");
  refs.tituloModal = document.getElementById("tituloModalPrograma");
  refs.programaId = document.getElementById("programaId");
  refs.programaCodigo = document.getElementById("programaCodigo");
  refs.programaNombre = document.getElementById("programaNombre");
  refs.programaRuta = document.getElementById("programaRuta");
  refs.programaZona = document.getElementById("programaZona");
  refs.programaCategoria = document.getElementById("programaCategoria");
  refs.programaIcono = document.getElementById("programaIcono");
  refs.programaVisibleHome = document.getElementById("programaVisibleHome");
  refs.programaVisibleAdmin = document.getElementById("programaVisibleAdmin");
  refs.programaActivo = document.getElementById("programaActivo");
  refs.programaOrden = document.getElementById("programaOrden");
}

function obtenerCatalogo() {
  const servicio = getServicio();
  if (!servicio) return [];

  return servicio
    .obtenerCatalogo()
    .slice()
    .sort((a, b) => {
      const zona = String(a.zona || "").localeCompare(String(b.zona || ""));
      if (zona !== 0) return zona;

      const orden = (Number(a.orden_menu) || 0) - (Number(b.orden_menu) || 0);
      if (orden !== 0) return orden;

      return String(a.codigo || "").localeCompare(String(b.codigo || ""));
    });
}

function aplicarFiltros(programas) {
  const txt = state.filtroTexto;
  return (programas || []).filter((item) => {
    if (state.filtroZona && item.zona !== state.filtroZona) return false;

    if (state.filtroActivo === "activos" && !item.activo) return false;
    if (state.filtroActivo === "inactivos" && item.activo) return false;

    if (!txt) return true;

    const full = [
      item.codigo,
      item.nombre,
      item.ruta,
      item.zona,
      item.categoria,
      item.icono
    ].join(" ").toLowerCase();

    return full.includes(txt);
  });
}

function tagBoolean(valor) {
  return valor ? "SI" : "NO";
}

function renderTabla() {
  const lista = aplicarFiltros(state.catalogo);

  if (refs.conteoProgramas) {
    refs.conteoProgramas.textContent = `${lista.length} programa${lista.length === 1 ? "" : "s"}`;
  }

  if (!refs.tablaProgramas) return;
  refs.tablaProgramas.innerHTML = "";

  if (!lista.length) {
    refs.tablaProgramas.innerHTML = `
      <tr>
        <td colspan="12" class="sin-datos">No hay programas para el filtro actual.</td>
      </tr>
    `;
    return;
  }

  for (const item of lista) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${Number(item.id) || "-"}</td>
      <td><strong>${escapeHtml(item.codigo)}</strong></td>
      <td>${escapeHtml(item.nombre)}</td>
      <td><code>${escapeHtml(item.ruta)}</code></td>
      <td><span class="tag tag-${escapeHtml(item.zona)}">${escapeHtml(item.zona)}</span></td>
      <td>${escapeHtml(item.categoria || "-")}</td>
      <td><i class="fa-solid ${escapeHtml(item.icono || "fa-circle")}"></i> ${escapeHtml(item.icono || "-")}</td>
      <td>${tagBoolean(item.visible_home)}</td>
      <td>${tagBoolean(item.visible_admin)}</td>
      <td>${tagBoolean(item.activo)}</td>
      <td>${Number(item.orden_menu) || 0}</td>
      <td class="acciones"></td>
    `;

    const acciones = tr.querySelector(".acciones");

    const btnEditar = document.createElement("button");
    btnEditar.type = "button";
    btnEditar.className = "btn-tabla";
    btnEditar.textContent = "Editar";
    btnEditar.addEventListener("click", () => abrirModal(item));

    const btnEstado = document.createElement("button");
    btnEstado.type = "button";
    btnEstado.className = "btn-tabla";
    btnEstado.textContent = item.activo ? "Desactivar" : "Activar";
    btnEstado.addEventListener("click", () => cambiarEstado(item));

    acciones.append(btnEditar, btnEstado);
    refs.tablaProgramas.appendChild(tr);
  }
}

function limpiarFormulario() {
  refs.programaId.value = "";
  refs.programaCodigo.value = "";
  refs.programaNombre.value = "";
  refs.programaRuta.value = "";
  refs.programaZona.value = "operativo";
  refs.programaCategoria.value = "";
  refs.programaIcono.value = "fa-circle";
  refs.programaVisibleHome.checked = true;
  refs.programaVisibleAdmin.checked = false;
  refs.programaActivo.checked = true;
  refs.programaOrden.value = "10";
}

function abrirModal(programa = null) {
  if (!refs.modal) return;

  if (programa) {
    refs.tituloModal.textContent = `Editar programa #${programa.id}`;
    refs.programaId.value = String(programa.id || "");
    refs.programaCodigo.value = programa.codigo || "";
    refs.programaNombre.value = programa.nombre || "";
    refs.programaRuta.value = programa.ruta || "";
    refs.programaZona.value = programa.zona || "operativo";
    refs.programaCategoria.value = programa.categoria || "";
    refs.programaIcono.value = programa.icono || "fa-circle";
    refs.programaVisibleHome.checked = Boolean(programa.visible_home);
    refs.programaVisibleAdmin.checked = Boolean(programa.visible_admin);
    refs.programaActivo.checked = programa.activo !== false;
    refs.programaOrden.value = String(Number(programa.orden_menu) || 0);
  } else {
    refs.tituloModal.textContent = "Nuevo programa";
    limpiarFormulario();
  }

  refs.modal.setAttribute("aria-hidden", "false");
  refs.modal.classList.add("is-open");
  refs.programaCodigo.focus();
}

function cerrarModal() {
  if (!refs.modal) return;
  refs.modal.setAttribute("aria-hidden", "true");
  refs.modal.classList.remove("is-open");
}

function leerFormulario() {
  const payload = {
    id: Number(refs.programaId.value) || 0,
    codigo: refs.programaCodigo.value.trim().toUpperCase(),
    nombre: refs.programaNombre.value.trim(),
    ruta: refs.programaRuta.value.trim(),
    zona: refs.programaZona.value,
    categoria: refs.programaCategoria.value.trim(),
    icono: refs.programaIcono.value.trim() || "fa-circle",
    visible_home: refs.programaVisibleHome.checked,
    visible_admin: refs.programaVisibleAdmin.checked,
    activo: refs.programaActivo.checked,
    orden_menu: Number(refs.programaOrden.value) || 0
  };

  if (!payload.codigo) throw new Error("Codigo requerido");
  if (!payload.nombre) throw new Error("Nombre requerido");
  if (!payload.ruta) throw new Error("Ruta requerida");

  return payload;
}

async function guardarPrograma() {
  const servicio = getServicio();
  if (!servicio) return;

  try {
    const payload = leerFormulario();
    await servicio.guardarPrograma(payload);
    recargar();
    cerrarModal();
  } catch (error) {
    alert(error.message || "No se pudo guardar el programa");
  }
}

async function cambiarEstado(programa) {
  const servicio = getServicio();
  if (!servicio) return;

  try {
    if (programa.activo) {
      await servicio.eliminarPrograma(programa.id);
    } else {
      await servicio.guardarPrograma({ ...programa, activo: true });
    }

    recargar();
  } catch (error) {
    alert(error.message || "No se pudo actualizar el estado del programa");
  }
}

function actualizarFiltros() {
  state.filtroTexto = String(refs.filtroPrograma?.value || "").trim().toLowerCase();
  state.filtroZona = String(refs.filtroZona?.value || "").trim().toLowerCase();
  state.filtroActivo = String(refs.filtroActivo?.value || "").trim().toLowerCase();
  renderTabla();
}

function recargar() {
  state.catalogo = obtenerCatalogo();
  renderTabla();
}

function bindEventos() {
  document.getElementById("btnNuevoPrograma")?.addEventListener("click", () => abrirModal());
  document.getElementById("btnGuardarPrograma")?.addEventListener("click", guardarPrograma);
  document.getElementById("btnCerrarPrograma")?.addEventListener("click", cerrarModal);

  refs.modal?.addEventListener("click", (event) => {
    if (event.target === refs.modal) cerrarModal();
  });

  refs.filtroPrograma?.addEventListener("input", actualizarFiltros);
  refs.filtroZona?.addEventListener("change", actualizarFiltros);
  refs.filtroActivo?.addEventListener("change", actualizarFiltros);
}

async function initProgramas() {
  if (!getServicio()) {
    alert("No se pudo cargar el servicio de programas.");
    return;
  }

  await getServicio().inicializar();
  cargarReferencias();
  bindEventos();
  recargar();
}

document.addEventListener("DOMContentLoaded", initProgramas);
