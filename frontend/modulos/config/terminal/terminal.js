const selectEmpresa = document.getElementById("selectEmpresa");
const inputNombre = document.getElementById("inputNombre");
const inputDescripcion = document.getElementById("inputDescripcion");
const selectTipo = document.getElementById("selectTipo");
const checkActivo = document.getElementById("checkActivo");
const tablaTerminales = document.getElementById("tablaTerminales");
const inputBuscar = document.getElementById("inputBuscar");
const msgBox = document.getElementById("msgBox");

const btnGuardar = document.getElementById("btnGuardar");
const btnActualizar = document.getElementById("btnActualizar");
const btnEliminar = document.getElementById("btnEliminar");

let terminales = [];
let empresas = [];
let terminalSeleccionada = null;

window.addEventListener("load", async () => {
  await cargarEmpresas();
  await cargarTerminales();
});

inputBuscar.addEventListener("input", renderTabla);

function volver() {
  window.location.href = "/home.html";
}

function mostrarMensaje(msg, tipo = "ok") {
  msgBox.textContent = msg;
  msgBox.className = `msg-box ${tipo}`;
  msgBox.style.display = "block";

  setTimeout(() => {
    msgBox.style.display = "none";
  }, 3000);
}

function limpiarFormulario() {
  selectEmpresa.selectedIndex = 0;
  inputNombre.value = "";
  inputDescripcion.value = "";
  selectTipo.value = "CAJA";
  checkActivo.checked = true;

  terminalSeleccionada = null;
  document.getElementById("terminalIdActual").value = "";
  btnGuardar.disabled = false;
  btnActualizar.disabled = true;
  btnEliminar.disabled = true;

  quitarSeleccionTabla();
  inputNombre.focus();
}

function nuevoRegistro() {
  limpiarFormulario();
}

function quitarSeleccionTabla() {
  document.querySelectorAll("#tablaTerminales tr").forEach(tr => {
    tr.classList.remove("selected");
  });
}

async function cargarEmpresas() {
  try {
    const res = await fetch("/api/empresa", { credentials: "include" });
    const data = await res.json();

    empresas = Array.isArray(data) ? data : [];

    selectEmpresa.innerHTML = "";

    if (empresas.length === 0) {
      selectEmpresa.innerHTML = `<option value="">No hay empresas</option>`;
      return;
    }

    // Opcion "Todas" para ver terminales de todas las empresas a la vez
    if (empresas.length > 1) {
      const optAll = document.createElement("option");
      optAll.value = "__TODAS__";
      optAll.textContent = "Todas las empresas";
      selectEmpresa.appendChild(optAll);
    }

    empresas.forEach(emp => {
      const option = document.createElement("option");
      option.value = emp.id;
      option.textContent = emp.nombre;
      selectEmpresa.appendChild(option);
    });

    // Si hay mas de una empresa, arrancamos con "Todas"
    if (empresas.length > 1) {
      selectEmpresa.value = "__TODAS__";
    }
  } catch (err) {
    console.error(err);
    mostrarMensaje("No se pudieron cargar las empresas", "err");
  }
}

async function cargarTerminales() {

  const empresa_id = selectEmpresa.value;

  if (!empresa_id) return;

  try {

    if (empresa_id === "__TODAS__") {
      // Trae las terminales de TODAS las empresas en paralelo
      const lotes = await Promise.all(
        empresas.map(async (emp) => {
          try {
            const r = await fetch(`/api/terminal/${emp.id}`, { credentials: "include" });
            if (!r.ok) return [];
            const d = await r.json();
            return Array.isArray(d) ? d : [];
          } catch (_) {
            return [];
          }
        })
      );
      terminales = lotes.flat();
    } else {
      const res = await fetch(`/api/terminal/${empresa_id}`, { credentials: "include" });
      const data = await res.json();
      terminales = Array.isArray(data) ? data : [];
    }

    renderTabla();

  } catch (err) {

    console.error(err);
    mostrarMensaje("No se pudieron cargar las terminales", "err");

  }
}

function renderTabla() {
  const filtro = inputBuscar.value.trim().toLowerCase();

  const filtradas = terminales.filter(t => {
    const empresaNombre = (t.empresa_nombre || "").toLowerCase();
    const nombre = (t.nombre || "").toLowerCase();
    const descripcion = (t.descripcion || "").toLowerCase();
    const tipo = (t.tipo || "").toLowerCase();

    return (
      empresaNombre.includes(filtro) ||
      nombre.includes(filtro) ||
      descripcion.includes(filtro) ||
      tipo.includes(filtro)
    );
  });

  tablaTerminales.innerHTML = "";

  if (filtradas.length === 0) {
    tablaTerminales.innerHTML = `
      <tr>
        <td colspan="6" style="text-align:center; color:#6b7280;">No hay terminales registradas</td>
      </tr>
    `;
    return;
  }

  filtradas.forEach(t => {
    const tr = document.createElement("tr");

    if (terminalSeleccionada && terminalSeleccionada.id === t.id) {
      tr.classList.add("selected");
    }

    tr.innerHTML = `
      <td>${t.id ?? ""}</td>
      <td>${t.empresa_nombre ?? ""}</td>
      <td>${t.nombre ?? ""}</td>
      <td>${t.descripcion ?? ""}</td>
      <td>${t.tipo ?? ""}</td>
      <td>
        <span class="badge ${t.activo ? "badge-ok" : "badge-off"}">
          ${t.activo ? "ACTIVO" : "INACTIVO"}
        </span>
      </td>
    `;

    tr.addEventListener("click", () => seleccionarTerminal(t, tr));
    tablaTerminales.appendChild(tr);
  });
}

function seleccionarTerminal(terminal, tr) {
  terminalSeleccionada = terminal;
  document.getElementById("terminalIdActual").value = terminal.id || "";

  selectEmpresa.value = terminal.empresa_id;
  inputNombre.value = terminal.nombre || "";
  inputDescripcion.value = terminal.descripcion || "";
  selectTipo.value = terminal.tipo || "CAJA";
  checkActivo.checked = !!terminal.activo;

  quitarSeleccionTabla();
  tr.classList.add("selected");

  btnGuardar.disabled = true;
  btnActualizar.disabled = false;
  btnEliminar.disabled = false;
}

function validarFormulario() {
  const empresa_id = selectEmpresa.value;
  const nombre = inputNombre.value.trim();
  const tipo = selectTipo.value;

  if (!empresa_id) {
    mostrarMensaje("Debes seleccionar una empresa", "err");
    selectEmpresa.focus();
    return false;
  }

  if (!nombre) {
    mostrarMensaje("Debes ingresar el nombre de la terminal", "err");
    inputNombre.focus();
    return false;
  }

  if (!tipo) {
    mostrarMensaje("Debes seleccionar el tipo de terminal", "err");
    selectTipo.focus();
    return false;
  }

  return true;
}

function getPayload() {
  return {
    empresa_id: Number(selectEmpresa.value),
    nombre: inputNombre.value.trim(),
    descripcion: inputDescripcion.value.trim(),
    tipo: selectTipo.value,
    activo: checkActivo.checked
  };
}

async function guardarTerminal() {
  if (!validarFormulario()) return;

  try {
    const res = await fetch("/api/terminal", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      credentials: "include",
      body: JSON.stringify(getPayload())
    });

    const data = await res.json();

    if (!res.ok) {
      mostrarMensaje(data.error || "No se pudo guardar la terminal", "err");
      return;
    }

    if (data?.id) {
      document.getElementById("terminalIdActual").value = data.id;
    }

    mostrarMensaje("Terminal guardada correctamente", "ok");
    limpiarFormulario();
    await cargarTerminales();
  } catch (err) {
    console.error(err);
    mostrarMensaje("Error de conexión al guardar", "err");
  }
}

async function actualizarTerminal() {
  if (!terminalSeleccionada) {
    mostrarMensaje("Debes seleccionar una terminal", "err");
    return;
  }

  if (!validarFormulario()) return;

  try {
    const res = await fetch(`/api/terminal/${terminalSeleccionada.id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      credentials: "include",
      body: JSON.stringify(getPayload())
    });

    const data = await res.json();

    if (!res.ok) {
      mostrarMensaje(data.error || "No se pudo actualizar la terminal", "err");
      return;
    }

    mostrarMensaje("Terminal actualizada correctamente", "ok");
    limpiarFormulario();
    await cargarTerminales();
  } catch (err) {
    console.error(err);
    mostrarMensaje("Error de conexión al actualizar", "err");
  }
}

async function eliminarTerminal() {
  if (!terminalSeleccionada) {
    mostrarMensaje("Debes seleccionar una terminal", "err");
    return;
  }

  const ok = confirm(`¿Eliminar la terminal "${terminalSeleccionada.nombre}"?`);
  if (!ok) return;

  try {
    const res = await fetch(`/api/terminal/${terminalSeleccionada.id}`, {
      method: "DELETE",
      credentials: "include"
    });

    const data = await res.json();

    if (!res.ok) {
      mostrarMensaje(data.error || "No se pudo eliminar la terminal", "err");
      return;
    }

    mostrarMensaje("Terminal eliminada correctamente", "ok");
    limpiarFormulario();
    await cargarTerminales();
  } catch (err) {
    console.error(err);
    mostrarMensaje("Error de conexión al eliminar", "err");
  }
}
