const API = "/api/comprador";

let compradores = [];
let sortField = "id";
let sortDir = "desc";
let _dirty = false;
let _loading = false;
let isSelectionMode = false;
let compradorSeleccionadoTemp = null;

// ===== DOM =====
const compradorId = document.getElementById("compradorId");
const codigoComprador = document.getElementById("codigoComprador");
const nombre = document.getElementById("nombre");
const activo = document.getElementById("activo"); 
const buscar = document.getElementById("buscarComprador");
const btnNuevo = document.getElementById("btnNuevo");
const btnGuardar = document.getElementById("btnGuardar");
const btnEliminar = document.getElementById("btnEliminar");
const btnCancelar = document.getElementById("btnCancelar");
const btnSeleccionar = document.getElementById("btnSeleccionar");
const tablaCompradores = document.getElementById("tablaCompradores");

// ===== LOAD =====
async function cargar() {

  _loading = true;

  try {
    const res = await fetch(API);
    if (!res.ok) throw new Error();

    compradores = await res.json();
    render(compradores);

  } catch {
    tablaCompradores.innerHTML =
      "<div style='padding:10px;color:red'>Error cargando datos</div>";
  } finally {
    _loading = false;
  }
}

function soloDigitos(valor) {
  return (valor || "").replace(/\D/g, "");
}

codigoComprador.addEventListener("input", () => {
  const limpio = soloDigitos(codigoComprador.value);
  if (codigoComprador.value !== limpio) codigoComprador.value = limpio;
});

codigoComprador.addEventListener("keydown", async (e) => {
  if (e.key === "Enter") {
    e.preventDefault();

    const id = Number(codigoComprador.value);
    if (!id) {
      await nuevo(); // si está vacío, sí crea secuencia
      return;
    }

    await buscarPorId(id); 
  }
});

const thId = document.getElementById("thId");

if (thId) {
  thId.style.cursor = "pointer";
  thId.addEventListener("click", () => {
    if (sortField !== "id") {
      sortField = "id";
      sortDir = "asc";
    } else {
      sortDir = (sortDir === "asc") ? "desc" : "asc";
    }
    thId.textContent = `ID ${sortDir === "asc" ? "▲" : "▼"}`;
    render(compradores);
  });
}

async function buscarPorId(id) {

  _loading = true;

  try {
    const res = await fetch(`${API}/${id}`);
    if (!res.ok) {
      mostrarAdvertencia("No existe comprador con ese código");
      return;
    }

    const c = await res.json();
    seleccionar(c);

    document.querySelectorAll(".tabla-row")
      .forEach(r => r.classList.remove("activo"));

    const rows = [...document.querySelectorAll(".tabla-row")];
    const row = rows.find(r => r.firstElementChild?.textContent == String(c.id));
    if (row) row.classList.add("activo");

    setTimeout(() => nombre.focus(), 50);

  } catch {
    mostrarAdvertencia("Error buscando comprador");
  } finally {
    _loading = false;
  }
}

//funcion para que le pregunte si quiere salir con Esc o volver cuando este cargado algop 
function hayCambiosSinGuardar() {
  return _dirty || _loading;
}
//funcion para que no salga si algo esta cargado ojo con esto 


// ===== RENDER =====
function render(data) {

  data = [...data].sort((a, b) => {
    const av = a[sortField] ?? 0;
    const bv = b[sortField] ?? 0;
    return sortDir === "asc" ? av - bv : bv - av;
  });

  tablaCompradores.innerHTML = "";

  if (!data.length) {
    tablaCompradores.innerHTML =
      '<div style="padding:15px;color:#999">Sin compradores</div>';
    return;
  }

  data.forEach(c => {

    const row = document.createElement("div");
    row.className = "tabla-row";

   const estadoTxt = (c.activo === false) ? " (INACTIVO)" : "";

row.innerHTML = `
  <span>${c.id}</span>
  <span>${c.nombre}${estadoTxt}</span>
`;

if (c.activo === false) {
  row.classList.add("inactivo");
}

    row.onclick = () => {
      document.querySelectorAll(".tabla-row")
        .forEach(r => r.classList.remove("activo"));

      row.classList.add("activo");
      seleccionar(c);
    };

    row.ondblclick = () => {
      if (isSelectionMode) {
        seleccionarCompradorDirecto(c);
      } else {
        seleccionar(c);
      }
    };

    tablaCompradores.appendChild(row);
  });
}



// ===== SELECT =====
function seleccionar(c) {
  compradorSeleccionadoTemp = c;

  compradorId.value = c.id;
  codigoComprador.value = c.id;
  nombre.value = c.nombre;
  if (activo) activo.checked = (c.activo !== false); 

  habilitarFormulario();

  btnGuardar.disabled = false;
  btnEliminar.disabled = false;
  btnCancelar.disabled = false;

  if (isSelectionMode) {
    btnSeleccionar.disabled = false;
  }

  _dirty = false;
}

function seleccionarCompradorDirecto(c) {
  const compradorSeleccionado = {
    id: c.id,
    nombre: c.nombre
  };

  if (window.opener && !window.opener.closed && typeof window.opener.recibirComprador === "function") {
    try {
      window.opener.recibirComprador(compradorSeleccionado);
      window.opener.focus();
      window.close();
      return;
    } catch {
      // fallback localStorage
    }
  }

  localStorage.setItem("softsysCompradorSeleccionado", JSON.stringify(compradorSeleccionado));
  window.close();
}

function seleccionarComprador() {
  if (!compradorSeleccionadoTemp) {
    mostrarAdvertencia("Seleccione un comprador primero");
    return;
  }
  seleccionarCompradorDirecto(compradorSeleccionadoTemp);
}

// ===== BLOQUEAR / HABILITAR =====
function bloquearFormulario() {
  nombre.disabled = true;
  if (activo) activo.disabled = true;
}

function habilitarFormulario() {
  nombre.disabled = false;
  if (activo) activo.disabled = false;
}

// ===== NUEVO =====
async function nuevo() {
  compradorSeleccionadoTemp = null;

  compradorId.value = "";
  nombre.value = "";
  if (activo) activo.checked = true;

  const nextId = await obtenerProximoId();
  codigoComprador.value = nextId;

  habilitarFormulario();

  btnGuardar.disabled = false;
  btnEliminar.disabled = true;
  btnCancelar.disabled = false;
  

  setTimeout(() => nombre.focus(), 50);
}

// ===== CANCELAR =====
function cancelar() {
  compradorSeleccionadoTemp = null;

  compradorId.value = "";
  codigoComprador.value = "";
  nombre.value = "";
  if (activo) activo.checked = true;

  document.querySelectorAll(".tabla-row")
    .forEach(r => r.classList.remove("activo"));

  btnGuardar.disabled = true;
  btnEliminar.disabled = true;
  btnCancelar.disabled = true;
  _dirty = false;

  bloquearFormulario();

  codigoComprador.focus();
}

// ===== GUARDAR =====
async function guardar() {

  if (!nombre.value.trim()) {
    mostrarAdvertencia("Ingrese nombre");
    nombre.focus();
    return;
  }

  _loading = true;

  const payload = {
    nombre: nombre.value.trim(),
    activo: activo ? !!activo.checked : true
  };

  try {

    let compradorGuardado;

    if (!compradorId.value) {
      // NUEVO
      const res = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      compradorGuardado = await res.json();
    } else {
      // EDITAR
      const res = await fetch(`${API}/${compradorId.value}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      compradorGuardado = await res.json();
    }

    // En modo selección: seleccionar automáticamente y volver a la compra
    if (isSelectionMode && compradorGuardado?.id) {
      seleccionarCompradorDirecto(compradorGuardado);
      return;
    }

    await cargar();
    await nuevo();

    _dirty = false;
    codigoComprador.focus();

  } catch {
    mostrarAdvertencia("Error al guardar");
  } finally {
    _loading = false;
  }
}


function eliminar() {

  if (!compradorId.value) return;

  baseModalOpenConfirm({
    titulo: "Eliminar comprador",
    mensaje: "¿Desea eliminar el comprador?",
    detalle: nombre.value,
    confirmText: "Eliminar",
    cancelText: "Cancelar",
    onConfirm: async () => {

      _loading = true;

      try {
        await fetch(`${API}/${compradorId.value}`, {
          method: "DELETE"
        });

        await cargar();
        cancelar();

      } finally {
        _loading = false;
      }
    }
  });
}

// FILTRO
function filtrar() {
  const t = buscar.value.toLowerCase().trim();

  render(
    compradores.filter(c => {
      const nom = (c.nombre || "").toLowerCase();
      const idtxt = String(c.id ?? "");
      return nom.includes(t) || idtxt.includes(t);
    })
  );
}

// Enter en el buscador: selecciona el primer resultado
buscar.addEventListener("keydown", e => {
  if (e.key !== "Enter") return;
  e.preventDefault();

  // Si hay un comprador ya seleccionado, confirmar
  if (compradorSeleccionadoTemp) {
    seleccionarCompradorDirecto(compradorSeleccionadoTemp);
    return;
  }

  // Seleccionar el primer row visible
  const primera = tablaCompradores.querySelector(".tabla-row");
  if (primera) primera.click();
});

// ===== VOLVER SEGURO =====
function volverSeguro() {
  if (isSelectionMode) {
    // En modo selección, volver a la compra cambiando la URL de la ventana padre
    if (window.opener && !window.opener.closed) window.opener.focus();
    window.close();
    return;
  }

  // Para modo normal, usar la protección de salida estándar
  if (hayCambiosSinGuardar()) {
    baseModalOpenConfirm({
      titulo: "Salir",
      mensaje: "¿Desea salir sin guardar los cambios?",
      confirmText: "Salir",
      cancelText: "Cancelar",
      onConfirm: () => {
        window.location.href = "../../home.html";
      }
    });
  } else {
    window.location.href = "../../home.html";
  }
}

// ===== MODAL ADVERTENCIA =====
let _warnListener = null;

function mostrarAdvertencia(texto) {
  const modal = document.getElementById("modalAdvertencia");
  const txt   = document.getElementById("modalAdvertenciaTexto");
  const btn   = modal?.querySelector(".btn-aceptar");

  if (!modal || !txt) { alert(texto); return; }

  txt.textContent = texto;
  modal.classList.remove("hidden");
  setTimeout(() => btn?.focus(), 30);

  if (_warnListener) document.removeEventListener("keydown", _warnListener);
  _warnListener = function (e) {
    if (e.key === "Enter" || e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      modal.classList.add("hidden");
      document.removeEventListener("keydown", _warnListener);
      _warnListener = null;
      codigoComprador.focus();
    }
  };
  document.addEventListener("keydown", _warnListener);

  if (btn) btn.onclick = () => {
    modal.classList.add("hidden");
    if (_warnListener) {
      document.removeEventListener("keydown", _warnListener);
      _warnListener = null;
    }
    codigoComprador.focus();
  };
}

// ===== PRÓXIMO ID =====
async function obtenerProximoId() {
  try {
    const res = await fetch(API + "/next-id");
    const data = await res.json();
    return data.id;
  } catch {
    return "";
  }
}

// ===== ATAJOS =====
document.addEventListener("keydown", e => {

  if (e.key === "F2") {
    e.preventDefault();
    nuevo();
  }

  if (e.key === "F3") {
    e.preventDefault();
    if (!btnGuardar.disabled) guardar();
  }

  if (e.key === "F4") {
    e.preventDefault();
    if (!btnCancelar.disabled) cancelar();
  }

  if (e.key === "Delete") {
    e.preventDefault();
    if (!btnEliminar.disabled) eliminar();
  }

  // Enter global (solo cuando el foco NO está en input/textarea/button)
  if (e.key === "Enter" && isSelectionMode) {
    const tag = document.activeElement?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "BUTTON") return;
    e.preventDefault();
    if (compradorSeleccionadoTemp) {
      seleccionarCompradorDirecto(compradorSeleccionadoTemp);
    } else {
      nuevo();
    }
  }

});

nombre.addEventListener("input", () => {
  if (!btnGuardar.disabled) _dirty = true;
});

if (activo) {
  activo.addEventListener("change", () => {
    if (!btnGuardar.disabled) _dirty = true;
  });
}

nombre.addEventListener("keydown", async (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    if (!btnGuardar.disabled) {
      await guardar();
      // Después de guardar, listo para el siguiente
      codigoComprador.focus();
    }
  }
});


// ===== INIT =====
window.onload = () => {

  // Detectar modo selección
  const urlParams = new URLSearchParams(window.location.search);
  const searchParam = urlParams.get('search');
  const modoSeleccion = urlParams.get("modo") === "seleccion";
  isSelectionMode = Boolean(window.opener) || searchParam !== null || modoSeleccion;

  if (isSelectionMode) {
    document.getElementById("moduloTitulo").textContent = "Seleccionar Comprador";
    btnSeleccionar.style.display = "inline-flex";
    btnSeleccionar.disabled = true;
    // Mantener todos los botones visibles en modo selección

    if (searchParam) {
      buscar.value = searchParam;
      filtrar();
    }
  }

  bloquearFormulario();
  btnGuardar.disabled = true;
  btnEliminar.disabled = true;
  btnCancelar.disabled = true;

  cargar();

  // En modo selección (popup) no necesita protección de salida
  if (!isSelectionMode) {
    baseModalEnableExitProtection({
      hayCambios: hayCambiosSinGuardar
    });
  }

  // Re-asignar volverSeguro DESPUÉS de baseModal para que no lo sobreescriba
  window.volverSeguro = volverSeguro;

  setTimeout(() => {
    codigoComprador.focus();
  }, 100);
};

// Exponer funciones para HTML
window.nuevo = nuevo;
window.guardar = guardar;
window.eliminar = eliminar;
window.cancelar = cancelar;
window.filtrar = filtrar;
window.seleccionarComprador = seleccionarComprador;
window.volverSeguro = volverSeguro;
