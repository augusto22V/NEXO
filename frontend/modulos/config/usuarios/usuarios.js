const API = "/api/usuarios";

const state = {
  usuarios: [],
  editandoId: null,
  programasModal: {
    usuarioId: null,
    catalogo: [],
    asignados: []
  }
};

const tabla = document.getElementById("tablaUsuarios");

function servicioProgramas() {
  return window.SoftSysProgramas || null;
}

function normalizarRol(rol) {
  const servicio = servicioProgramas();
  if (servicio) return servicio.normalizarRol(rol);
  return String(rol || "VENDEDOR").toUpperCase();
}

function nombreRol(rol) {
  const servicio = servicioProgramas();
  if (servicio) return servicio.obtenerNombreRol(rol);
  return normalizarRol(rol);
}

function buscarUsuario(id) {
  return state.usuarios.find((u) => Number(u.id) === Number(id)) || null;
}

function mapCatalogoPorCodigo() {
  const servicio = servicioProgramas();
  const map = new Map();
  if (!servicio) return map;

  for (const programa of servicio.obtenerCatalogo()) {
    map.set(String(programa.codigo || "").toUpperCase(), programa);
  }

  return map;
}

function resumenProgramasUsuario(usuario) {
  const servicio = servicioProgramas();
  if (!servicio) return "Sin catalogo";

  const codigos = servicio.resolverCodigosUsuario(usuario);
  const total = codigos.length;
  if (!total) return "Sin programas";

  const catalogoMap = mapCatalogoPorCodigo();
  const nombres = codigos
    .map((code) => catalogoMap.get(String(code || "").toUpperCase())?.nombre || code)
    .slice(0, 3);

  return `${total} programa${total === 1 ? "" : "s"}: ${nombres.join(", ")}${total > 3 ? "..." : ""}`;
}

function poblarOpcionesRol() {
  const select = document.getElementById("nuevoRol");
  if (!select) return;

  const servicio = servicioProgramas();
  const opciones = servicio
    ? servicio.obtenerOpcionesRol()
    : [
        { code: "SUPER", label: "SUPER" },
        { code: "ADMIN", label: "ADMIN" },
        { code: "VENDEDOR", label: "VENDEDOR" }
      ];

  select.innerHTML = "";
  for (const item of opciones) {
    const option = document.createElement("option");
    option.value = item.code;
    option.textContent = `${item.label} (${item.code})`;
    select.appendChild(option);
  }
}

function asegurarOpcionRol(rolCanonico) {
  const select = document.getElementById("nuevoRol");
  if (!select) return;

  if (Array.from(select.options).some((opt) => opt.value === rolCanonico)) return;

  const option = document.createElement("option");
  option.value = rolCanonico;
  option.textContent = `${rolCanonico} (${rolCanonico})`;
  select.appendChild(option);
}

function renderUsuarios() {
  if (!tabla) return;

  tabla.innerHTML = "";

  if (!state.usuarios.length) {
    tabla.innerHTML = `
      <tr>
        <td colspan="6">No hay usuarios registrados.</td>
      </tr>
    `;
    return;
  }

  for (const u of state.usuarios) {
    const tr = document.createElement("tr");
    tr.addEventListener("click", () => editarUsuarioByRow(u));

    const rol = nombreRol(u.rol);
    const resumen = resumenProgramasUsuario(u);

    tr.innerHTML = `
      <td>${u.usuario || "-"}</td>
      <td>${u.nombre || "-"}</td>
      <td><span class="tag-rol">${rol}</span></td>
      <td>${u.activo ? "SI" : "NO"}</td>
      <td class="resumen-programas">${resumen}</td>
      <td></td>
    `;

    const tdAccion = tr.lastElementChild;

    const btnProgramas = document.createElement("button");
    btnProgramas.type = "button";
    btnProgramas.className = "btn-row";
    btnProgramas.textContent = "Programas";
    btnProgramas.addEventListener("click", (event) => {
      event.stopPropagation();
      abrirProgramasUsuario(u.id);
    });

    const btnEliminar = document.createElement("button");
    btnEliminar.type = "button";
    btnEliminar.className = "btn-row danger";
    btnEliminar.textContent = "Eliminar";
    btnEliminar.addEventListener("click", (event) => {
      event.stopPropagation();
      eliminarUsuario(u.id);
    });

    tdAccion.append(btnProgramas, btnEliminar);
    tabla.appendChild(tr);
  }
}

async function cargarUsuarios() {
  try {
    const servicio = servicioProgramas();
    if (servicio?.inicializar) {
      await servicio.inicializar();
    }

    const res = await fetch(API);
    if (!res.ok) throw new Error("Error cargando usuarios");

    const usuarios = await res.json();
    state.usuarios = Array.isArray(usuarios) ? usuarios : [];

    if (servicio?.precargarAsignaciones && state.usuarios.length) {
      await servicio.precargarAsignaciones(state.usuarios.map((u) => Number(u.id)).filter(Boolean));
    }

    renderUsuarios();
  } catch (error) {
    console.error(error);
    alert("No se pudieron cargar los usuarios");
  }
}

function mostrarModalUsuario() {
  const modal = document.getElementById("modalUsuario");
  if (modal) modal.style.display = "flex";
}

function cerrarModal() {
  const modal = document.getElementById("modalUsuario");
  if (modal) modal.style.display = "none";
}

function nuevoUsuario() {
  state.editandoId = null;
  document.getElementById("usuarioIdActual").value = "";
  document.getElementById("tituloModal").innerText = "Nuevo Usuario";

  document.getElementById("nuevoUsuarioNombre").value = "";
  document.getElementById("nuevoNombre").value = "";
  document.getElementById("nuevoPassword").value = "";
  document.getElementById("nuevoRol").value = "VENDEDOR";
  document.getElementById("nuevoActivo").checked = true;
  document.getElementById("nuevoModoFactura").value = "PREGUNTAR";
  document.getElementById("nuevoModoImpresion").value = "AUTO";
  document.getElementById("nuevoModoConfirmacion").checked = false;

  actualizarSugerenciaRol();
  actualizarEstadoBotonProgramas();
  mostrarModalUsuario();
}

function editarUsuarioByRow(usuario) {
  state.editandoId = Number(usuario.id);
  document.getElementById("usuarioIdActual").value = String(usuario.id || "");
  document.getElementById("tituloModal").innerText = "Editar Usuario";

  document.getElementById("nuevoUsuarioNombre").value = usuario.usuario || "";
  document.getElementById("nuevoNombre").value = usuario.nombre || "";
  document.getElementById("nuevoPassword").value = "";
  const rolCanonico = normalizarRol(usuario.rol);
  asegurarOpcionRol(rolCanonico);
  document.getElementById("nuevoRol").value = rolCanonico;
  document.getElementById("nuevoActivo").checked = Boolean(usuario.activo);

  document.getElementById("nuevoModoFactura").value = (usuario.modo_factura || "PREGUNTAR").toUpperCase();
  document.getElementById("nuevoModoImpresion").value = (usuario.modo_impresion || "AUTO").toUpperCase();
  document.getElementById("nuevoModoConfirmacion").checked = Boolean(usuario.modo_confirmacion);

  actualizarSugerenciaRol();
  actualizarEstadoBotonProgramas();
  mostrarModalUsuario();
}

function editarUsuario() {
  // Compatibilidad por si existe alguna llamada anterior
}

function actualizarEstadoBotonProgramas() {
  const btn = document.getElementById("btnConfigProgramas");
  if (!btn) return;

  const habilitado = Boolean(state.editandoId);
  btn.disabled = !habilitado;
  btn.title = habilitado ? "Editar programas asignados" : "Guarde el usuario primero para personalizar programas";
}

function actualizarSugerenciaRol() {
  const servicio = servicioProgramas();
  const panel = document.getElementById("rolSugerencia");
  if (!panel) return;

  const rol = normalizarRol(document.getElementById("nuevoRol")?.value);

  if (!servicio) {
    panel.textContent = "Catalogo no disponible";
    return;
  }

  const codigos = servicio.sugerirCodigosPorRol(rol);
  const catalogo = mapCatalogoPorCodigo();

  if (!codigos.length) {
    panel.textContent = "Sin plantilla definida para este rol";
    return;
  }

  const nombres = codigos
    .map((code) => catalogo.get(String(code || "").toUpperCase())?.nombre || code)
    .slice(0, 8);

  panel.textContent = `${nombres.join(", ")}${codigos.length > 8 ? "..." : ""}`;
}

async function guardarUsuario() {
  const usuario = document.getElementById("nuevoUsuarioNombre").value.trim().toUpperCase();
  const nombre = document.getElementById("nuevoNombre").value.trim();
  const password = document.getElementById("nuevoPassword").value.trim();
  const rol = normalizarRol(document.getElementById("nuevoRol").value);

  if (!usuario) {
    alert("Debe ingresar el usuario");
    return;
  }

  if (!nombre) {
    alert("Debe ingresar el nombre");
    return;
  }

  const body = {
    usuario,
    nombre,
    rol,
    activo: document.getElementById("nuevoActivo").checked,
    modo_factura: document.getElementById("nuevoModoFactura").value,
    modo_impresion: document.getElementById("nuevoModoImpresion").value,
    modo_confirmacion: document.getElementById("nuevoModoConfirmacion").checked
  };

  if (password) body.password = password;

  try {
    let res;
    let data;

    if (state.editandoId) {
      res = await fetch(`${API}/${state.editandoId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      data = await res.json().catch(() => ({}));
    } else {
      if (!password) {
        alert("Debe ingresar contrasena");
        return;
      }

      res = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      data = await res.json().catch(() => ({}));
    }

    if (!res.ok) {
      throw new Error(data?.error || "Error guardando usuario");
    }

    const usuarioId = state.editandoId || Number(data?.id || 0);
    if (usuarioId) {
      document.getElementById("usuarioIdActual").value = String(usuarioId);
      const servicio = servicioProgramas();
      const asignacion = servicio?.obtenerAsignacionUsuario(usuarioId);

      if (servicio && asignacion?.manual) {
        await servicio.guardarAsignacionUsuario(usuarioId, {
          manual: true,
          codes: asignacion.codes || [],
          role: rol
        });
      }
    }

    cerrarModal();
    await cargarUsuarios();
  } catch (error) {
    console.error(error);
    alert(error.message || "Error guardando usuario");
  }
}

async function eliminarUsuario(id) {
  if (!confirm("Eliminar usuario?")) return;

  try {
    const res = await fetch(`${API}/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error("No se pudo eliminar");

    const servicio = servicioProgramas();
    servicio?.limpiarAsignacionUsuario(id);

    await cargarUsuarios();
  } catch (error) {
    console.error(error);
    alert("No se pudo eliminar");
  }
}

function volver() {
  window.location.href = "/admin.html";
}

function abrirModalProgramas() {
  const modal = document.getElementById("modalProgramasUsuario");
  if (modal) modal.style.display = "flex";
}

function cerrarModalProgramas() {
  const modal = document.getElementById("modalProgramasUsuario");
  if (modal) modal.style.display = "none";
}

function abrirProgramasDesdeModal() {
  if (!state.editandoId) {
    alert("Primero guarde el usuario para personalizar programas");
    return;
  }

  abrirProgramasUsuario(state.editandoId);
}

function renderListasProgramas() {
  const listaDisponibles = document.getElementById("listaDisponibles");
  const listaAsignados = document.getElementById("listaAsignados");

  if (!listaDisponibles || !listaAsignados) return;

  const filtroDisp = String(document.getElementById("filtroDisponibles")?.value || "").trim().toLowerCase();
  const filtroAsig = String(document.getElementById("filtroAsignados")?.value || "").trim().toLowerCase();

  const asignadosSet = new Set(state.programasModal.asignados);

  const disponibles = state.programasModal.catalogo.filter((item) => !asignadosSet.has(item.codigo));
  const asignados = state.programasModal.catalogo.filter((item) => asignadosSet.has(item.codigo));

  const match = (item, filtro) => {
    if (!filtro) return true;
    const full = `${item.codigo} ${item.nombre} ${item.zona} ${item.categoria}`.toLowerCase();
    return full.includes(filtro);
  };

  listaDisponibles.innerHTML = "";
  for (const item of disponibles.filter((p) => match(p, filtroDisp))) {
    const option = document.createElement("option");
    option.value = item.codigo;
    option.textContent = `${item.nombre} [${item.codigo}] (${item.zona})`;
    listaDisponibles.appendChild(option);
  }

  listaAsignados.innerHTML = "";
  for (const item of asignados.filter((p) => match(p, filtroAsig))) {
    const option = document.createElement("option");
    option.value = item.codigo;
    option.textContent = `${item.nombre} [${item.codigo}] (${item.zona})`;
    listaAsignados.appendChild(option);
  }
}

function moverProgramas(desdeId, haciaAsignados) {
  const select = document.getElementById(desdeId);
  if (!select) return;

  const seleccion = Array.from(select.selectedOptions).map((opt) => opt.value);
  if (!seleccion.length) return;

  const set = new Set(state.programasModal.asignados);

  if (haciaAsignados) {
    for (const code of seleccion) set.add(code);
  } else {
    for (const code of seleccion) set.delete(code);
  }

  state.programasModal.asignados = Array.from(set);
  renderListasProgramas();
}

function setInfoProgramaUsuario(usuario) {
  const servicio = servicioProgramas();
  const info = document.getElementById("programaUsuarioInfo");
  if (!info || !servicio || !usuario) return;

  const asignacion = servicio.obtenerAsignacionUsuario(usuario.id);
  const modo = asignacion?.manual ? "Personalizado" : "Plantilla por rol";
  info.textContent = `Usuario: ${usuario.usuario} | Rol: ${nombreRol(usuario.rol)} | Modo: ${modo}`;
}

async function abrirProgramasUsuario(usuarioId) {
  try {
    const servicio = servicioProgramas();
    if (!servicio) {
      alert("No se pudo cargar el catalogo de programas");
      return;
    }

    const usuario = buscarUsuario(usuarioId);
    if (!usuario) {
      alert("Usuario no encontrado");
      return;
    }

    if (servicio.inicializar) {
      await servicio.inicializar();
    }
    if (servicio.cargarAsignacionUsuario) {
      await servicio.cargarAsignacionUsuario(usuario.id);
    }

    state.programasModal.usuarioId = Number(usuario.id);

    const catalogo = servicio
      .obtenerCatalogo()
      .filter((p) => p.activo)
      .slice()
      .sort((a, b) => {
        const z = String(a.zona || "").localeCompare(String(b.zona || ""));
        if (z !== 0) return z;
        return (Number(a.orden_menu) || 0) - (Number(b.orden_menu) || 0);
      });

    const asignados = servicio.resolverCodigosUsuario(usuario);
    state.programasModal.catalogo = catalogo;
    state.programasModal.asignados = Array.from(new Set(asignados.map((c) => String(c || "").toUpperCase())));

    setInfoProgramaUsuario(usuario);

    const filtroD = document.getElementById("filtroDisponibles");
    const filtroA = document.getElementById("filtroAsignados");
    if (filtroD) filtroD.value = "";
    if (filtroA) filtroA.value = "";

    renderListasProgramas();
    abrirModalProgramas();
  } catch (error) {
    console.error(error);
    alert("No se pudieron cargar los programas del usuario");
  }
}

async function guardarProgramasUsuarioActual() {
  const servicio = servicioProgramas();
  if (!servicio) return;

  const usuario = buscarUsuario(state.programasModal.usuarioId);
  if (!usuario) return;

  try {
    await servicio.guardarAsignacionUsuario(usuario.id, {
      manual: true,
      role: normalizarRol(usuario.rol),
      codes: state.programasModal.asignados
    });

    cerrarModalProgramas();
    renderUsuarios();
  } catch (error) {
    console.error(error);
    alert("No se pudo guardar la asignacion de programas");
  }
}

async function restaurarPlantillaRolUsuario() {
  const servicio = servicioProgramas();
  if (!servicio) return;

  const usuario = buscarUsuario(state.programasModal.usuarioId);
  if (!usuario) return;

  try {
    await servicio.limpiarAsignacionUsuario(usuario.id);
    state.programasModal.asignados = servicio.resolverCodigosUsuario(usuario);
    setInfoProgramaUsuario(usuario);
    renderListasProgramas();
  } catch (error) {
    console.error(error);
    alert("No se pudo restaurar la plantilla del rol");
  }
}

function bindEventos() {
  const inputUsuario = document.getElementById("nuevoUsuarioNombre");
  inputUsuario?.addEventListener("input", function () {
    this.value = this.value.toUpperCase();
  });

  document.getElementById("nuevoRol")?.addEventListener("change", actualizarSugerenciaRol);

  document.getElementById("filtroDisponibles")?.addEventListener("input", renderListasProgramas);
  document.getElementById("filtroAsignados")?.addEventListener("input", renderListasProgramas);

  document.getElementById("btnAgregarPrograma")?.addEventListener("click", () => moverProgramas("listaDisponibles", true));
  document.getElementById("btnQuitarPrograma")?.addEventListener("click", () => moverProgramas("listaAsignados", false));
  document.getElementById("btnGuardarProgramas")?.addEventListener("click", guardarProgramasUsuarioActual);
  document.getElementById("btnRestaurarPlantilla")?.addEventListener("click", restaurarPlantillaRolUsuario);
  document.getElementById("btnCerrarProgramas")?.addEventListener("click", cerrarModalProgramas);

  document.getElementById("modalProgramasUsuario")?.addEventListener("click", (event) => {
    if (event.target?.id === "modalProgramasUsuario") cerrarModalProgramas();
  });
}

async function initUsuarios() {
  poblarOpcionesRol();
  bindEventos();
  await cargarUsuarios();
}

document.addEventListener("DOMContentLoaded", initUsuarios);
