const API = "/api/clientes";

let clientes = [];
let cargandoCliente = false;
let formDirty = false;
let sortField = "id";
let sortDir = "desc";
let _warnListener = null;
let _warnFocusEl = null;
let permitirSalida = false;
let offset = 0;
const limit = 20;
let cargandoScroll = false;
let finDatos = false;


// ===== DOM =====
const clienteId = document.getElementById('clienteId');
const codigoCliente = document.getElementById('codigoCliente');
const nombre = document.getElementById('nombre');
const razon = document.getElementById('razon');
const ruc = document.getElementById('ci-ruc');

ruc.addEventListener("keydown", async (e) => {

  if (e.key !== "Enter") return;

  const valor = ruc.value.trim();

  if (!valor) return;

  try {

    const res = await fetch(`/api/clientes/ruc/${valor}`);
    const data = await res.json();

    if (data) {

      // ðŸ”¥ IMPORTANTE
      ruc.value = data.ruc; // reemplaza con DV correcto

      razon.value = data.razon_social || '';
      nombre.value = data.nombre || data.razon_social || '';

      telefono.focus();

    } else {

      mostrarAdvertencia("RUC no encontrado", razon);

    }

  } catch (err) {

    console.error(err);
    mostrarAdvertencia("Error consultando RUC");

  }

});

const telefono = document.getElementById('telefono');
const direccion = document.getElementById('direccion');
const email = document.getElementById('email');
const buscar = document.getElementById('buscar');

const btnNuevo = document.getElementById('btnNuevo');
const btnGuardar = document.getElementById('btnGuardar');
const btnEliminar = document.getElementById('btnEliminar');
const btnCancelar = document.getElementById('btnCancelar');

const tablaClientes = document.getElementById('tablaClientes');
const thId = document.getElementById("thId");

// ===== PARAMS =====
const params = new URLSearchParams(window.location.search);
const modoSeleccion = params.get("modo") === "seleccion";
const permitirAltaSeleccion = params.get("permitir_alta") === "1";
const from = params.get("from");
const volver = params.get("volver");

// ===== LOAD =====
async function cargar() {

  if (cargandoScroll || finDatos) return;

  cargandoScroll = true;

  try {

    const res = await fetch(`${API}?limit=${limit}&offset=${offset}`);
    const data = await res.json();

    if (data.length < limit) {
      finDatos = true;
    }

    clientes = [...clientes, ...data];

    render(clientes);

    offset += limit;

  } catch (err) {
    console.error(err);
  }

  cargandoScroll = false;
}

tablaClientes.addEventListener("scroll", () => {

  const scrollTop = tablaClientes.scrollTop;
  const scrollHeight = tablaClientes.scrollHeight;
  const clientHeight = tablaClientes.clientHeight;

  if (scrollTop + clientHeight >= scrollHeight - 50) {
    cargar();
  }

});


function bloquearFormulario() {

  nombre.disabled = true;
  razon.disabled = true;
  ruc.disabled = true;
  telefono.disabled = true;
  direccion.disabled = true;
  email.disabled = true;

}

function habilitarFormulario() {

  nombre.disabled = false;
  razon.disabled = false;
  ruc.disabled = false;
  telefono.disabled = false;
  direccion.disabled = false;
  email.disabled = false;

}

function hayCambiosSinGuardar() {

  if (modoSeleccion) return false;

  if (cargandoCliente) return true;

  return formDirty === true;

}

function volverSeguro() {
  if (hayCambiosSinGuardar()) {

    baseModalOpenConfirmGeneric({
      titulo: "Salir",
      mensaje: "Hay cambios sin guardar. Â¿Desea salir?",
      onConfirm: () => {
        permitirSalida = true;
        history.back();
      }
    });

  } else {
    permitirSalida = true;
    history.back();
  }
}

// ===== RENDER =====
// ===== RENDER =====
function render(data, append = false) {

  //  ordenar SOLO lo nuevo (evita reordenar todo y romper scroll)
  const ordenados = [...data].sort((a, b) => {
    const av = a[sortField] ?? 0;
    const bv = b[sortField] ?? 0;
    return sortDir === "asc" ? av - bv : bv - av;
  });

  //  SOLO limpiar si NO es append
  if (!append) {
    tablaClientes.innerHTML = '';

    if (!ordenados.length) {
      tablaClientes.innerHTML = '<div style="padding:15px;color:#999">Sin clientes</div>';
      return;
    }
  }

  ordenados.forEach(c => {

    const row = document.createElement('div');
    row.className = 'tabla-row';

    row.innerHTML = `
      <span>${c.id}</span>
      <span>${c.nombre}</span>
      <span>${c.razon_social || '-'}</span>
      <span>${c.ruc || '-'}</span>
      <span>${c.telefono || '-'}</span>
      <span>${c.direccion || '-'}</span>
      <span>${c.email || '-'}</span>
    `;

    row.onclick = () => {

      if (modoSeleccion) {

        if (volver === "informe" && window.opener && !window.opener.closed) {
          const inputCliente = window.opener.document.getElementById("filtroCliente");
          if (inputCliente) {
            inputCliente.value = c.nombre || "";
            if (typeof inputCliente.focus === "function") {
              inputCliente.focus();
            }
          }

          window.close();
          return;
        }

        localStorage.setItem(
          "clienteSeleccionado",
          JSON.stringify({
            id: c.id,
            nombre: c.nombre,
            ruc: c.ruc,
            direccion: c.direccion
          })
        );

        window.close();
        return;
      }

      if (formDirty) {
        mostrarAdvertencia('Finalice la carga o cancele');
        return;
      }

      document.querySelectorAll('.tabla-row')
        .forEach(r => r.classList.remove('activo'));

      row.classList.add('activo');

      seleccionar(c);
    };

    row.ondblclick = () => {
      seleccionar(c);
    };

    tablaClientes.appendChild(row);

  });

}

async function obtenerProximoId() {

  const res = await fetch(API + "/next-id");
  const data = await res.json();

  return data.id;

}

codigoCliente.addEventListener("keydown", async (e) => {

  if (e.key !== "Enter") return;

  const valor = codigoCliente.value.trim();

  // ENTER vacÃ­o  nuevo
  if (!valor) {

    e.preventDefault();

    const nextId = await obtenerProximoId();

    if (!nextId) {
      mostrarAdvertencia("No se pudo obtener el cÃ³digo");
      return;
    }

    codigoCliente.value = nextId;

    habilitarFormulario();

    btnGuardar.disabled = false;
    btnCancelar.disabled = false;

    setTimeout(() => nombre.focus(), 50);

    return;
  }

  const id = Number(valor);

  const encontrado = clientes.find(c => Number(c.id) === id);

  if (encontrado) {
    e.preventDefault();
    seleccionar(encontrado);
    return;
  }

  //  SOLO acÃ¡ prevenimos y cortamos todo
  e.preventDefault();
  e.stopImmediatePropagation();

  mostrarAdvertencia(`No existe cliente con cÃ³digo ${id}`, codigoCliente);
});

// ===== SELECT =====
function seleccionar(c) {

  codigoCliente.value = c.id;

  clienteId.value = c.id;
  nombre.value = c.nombre;
  razon.value = c.razon_social || '';
  ruc.value = c.ruc || '';
  telefono.value = c.telefono || '';
  direccion.value = c.direccion || '';
  email.value = c.email || '';

  habilitarFormulario();

  btnGuardar.disabled = false;
  btnEliminar.disabled = false;
  btnCancelar.disabled = false;
  formDirty = false;
}

// ===== NUEVO =====
async function nuevo() {

  formDirty = false;
  cargandoCliente = false;

  // limpiar id interno
  clienteId.value = '';

  // limpiar campos
  nombre.value = '';
  razon.value = '';
  ruc.value = '';
  telefono.value = '';
  direccion.value = '';
  email.value = 'sincorreo@gmail.com';

  // quitar selecciÃ³n de tabla
  document.querySelectorAll('.tabla-row')
    .forEach(r => r.classList.remove('activo'));

  habilitarFormulario();

  btnGuardar.disabled = false;
  btnEliminar.disabled = true;
  btnCancelar.disabled = false;

  try {

    const nextId = await obtenerProximoId();

    if (!nextId) {
      mostrarAdvertencia("No se pudo obtener el cÃ³digo");
      return;
    }

    codigoCliente.value = nextId;

  } catch {
    mostrarAdvertencia("Error obteniendo cÃ³digo");
  }

  setTimeout(() => {
    nombre.focus();
  }, 50);

}

function cancelar() {

  formDirty = false;
  cargandoCliente = false;
  // limpiar id interno
  clienteId.value = '';

  // limpiar campos
  codigoCliente.value = '';
  nombre.value = '';
  razon.value = '';
  ruc.value = '';
  telefono.value = '';
  direccion.value = '';
  email.value = 'sincorreo@gmail.com';

  // quitar selecciÃ³n de tabla
  document.querySelectorAll('.tabla-row').forEach(r => r.classList.remove('activo'));

  // botones
  btnGuardar.disabled = true;
  btnEliminar.disabled = true;
  btnCancelar.disabled = true;
  actualizarEstadoTabla();
  bloquearFormulario();
  codigoCliente.focus();
  codigoCliente.select();

  // foco en cÃ³digo
  setTimeout(() => {
    codigoCliente.focus();
    codigoCliente.select();
  }, 50);

}

// ===== GUARDAR =====
async function guardar() {

  if (!nombre.value.trim()) {
    marcarCampoError(nombre);
    return;
  }

  const payload = {
    nombre: nombre.value.trim(),
    razon_social: razon.value.trim(),
    ruc: ruc.value.trim(),
    telefono: telefono.value.trim(),
    direccion: direccion.value.trim(),
    email: email.value.trim() || 'sincorreo@gmail.com'
  };

  try {

    let r;

    if (!clienteId.value) {

      r = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

    } else {

      r = await fetch(`${API}/${clienteId.value}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

    }

    if (!r.ok) {
      throw new Error("Error servidor");
    }

    bloquearFormulario();
    codigoCliente.focus();
    codigoCliente.select();


clientes = [];
offset = 0;
finDatos = false;
await cargar();
cancelar();

  } catch (err) {

    console.error(err);
    mostrarAdvertencia("Error al guardar");

  }

}

function marcarCampoError(campo) {
  campo.classList.add("campo-error");
  campo.focus();

  // quitar error cuando el usuario empiece a escribir
  campo.addEventListener("input", function limpiar() {
    campo.classList.remove("campo-error");
    campo.removeEventListener("input", limpiar);
  });
}

// ===== ELIMINAR =====
let clienteAEliminar = null;

function eliminar() {
  if (!clienteId.value) return;
  clienteAEliminar = clienteId.value;
  document.getElementById('modalNombreCliente').textContent = nombre.value;
  document.getElementById('modalEliminar').classList.remove('hidden');
}

function cerrarModalEliminar() {
  clienteAEliminar = null;
  document.getElementById('modalEliminar').classList.add('hidden');
}

async function confirmarEliminar() {
  if (!clienteAEliminar) return;

  try {

    const res = await fetch(`${API}/${clienteAEliminar}`, {
      method: 'DELETE'
    });

    const data = await res.json();

    if (!res.ok) {
      mostrarAdvertencia(data.mensaje || "No se pudo eliminar");
      return;
    }

    cerrarModalEliminar();
    cargar();

  } catch (err) {
    console.error(err);
    mostrarAdvertencia("Error al eliminar cliente");
  }
}

// ===== FILTRO =====
function filtrar() {
  const t = buscar.value.toLowerCase().trim();
  render(clientes.filter(c =>
    (c.nombre || '').toLowerCase().includes(t) ||
    (c.ruc || '').toLowerCase().includes(t) ||
    (c.telefono || '').toLowerCase().includes(t)
  ));
}

// ===== MODOS =====
function modoInicial() {

  clienteId.value = '';
  codigoCliente.value = '';
  nombre.value = '';
  razon.value = '';
  ruc.value = '';
  telefono.value = '';
  direccion.value = '';
  email.value = 'sincorreo@gmail.com';
  btnGuardar.disabled = true;
  btnEliminar.disabled = true;
  btnCancelar.disabled = true;   // ðŸ‘ˆ importante

  bloquearFormulario();

}


// ===== ADVERTENCIA =====
function mostrarAdvertencia(texto, focusEl = codigoCliente) {

  const modal = document.getElementById('modalAdvertencia');
  const txt = document.getElementById('modalAdvertenciaTexto');
  const btn = modal?.querySelector('.btn-aceptar');

  if (!modal || !txt || !btn) return;

  txt.textContent = texto;
  _warnFocusEl = focusEl || codigoCliente;

  modal.classList.remove('hidden');
  setTimeout(() => btn.focus(), 30);
  if (_warnListener) document.removeEventListener('keydown', _warnListener);
  _warnListener = function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      cerrarAdvertencia(true);
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      cerrarAdvertencia(true);
      return;
    }
  };

  document.addEventListener('keydown', _warnListener);
}

function cerrarAdvertencia(refocus = false) {

  const modal = document.getElementById('modalAdvertencia');
  if (modal) modal.classList.add('hidden');

  if (_warnListener) {
    document.removeEventListener('keydown', _warnListener);
    _warnListener = null;
  }

  if (refocus && _warnFocusEl && typeof _warnFocusEl.focus === "function") {
    setTimeout(() => {
      _warnFocusEl.focus();
      if (typeof _warnFocusEl.select === "function") {
        _warnFocusEl.select();
      }
    }, 30);
  }

}
// ===== TABLA BLOQUEO =====
function actualizarEstadoTabla() {
  const tabla = document.querySelector('.tabla-clientes');
  const aviso = document.getElementById('avisoTabla');

  if (!tabla || !aviso) return;

  if (cargandoCliente) {
    tabla.classList.add('bloqueada');
    aviso.classList.remove('hidden');
  } else {
    tabla.classList.remove('bloqueada');
    aviso.classList.add('hidden');
  }
}


[nombre, razon, ruc, telefono, direccion, email].forEach(input => {
  input.addEventListener("input", () => {
    formDirty = true;
  });
});

// ===== EVENTOS =====
telefono?.addEventListener('input', () => {
  telefono.value = telefono.value.replace(/[^0-9]/g, '');
});

ruc?.addEventListener('input', () => {
  ruc.value = ruc.value.replace(/[^0-9-]/g, '');
});

// ===== ENTER NAVEGACIÃ“N ENTRE CAMPOS =====
document.querySelector('.form-panel').addEventListener("keydown", (e) => {

  if (e.key !== "Enter") return;

  // si estÃ¡ en cÃ³digo no intervenir
  if (document.activeElement.id === "codigoCliente") return;

  e.preventDefault();

  const campos = [
    nombre,
    razon,
    ruc,
    telefono,
    direccion,
    email
  ];

  const index = campos.indexOf(document.activeElement);

  if (index < campos.length - 1) {
    campos[index + 1].focus();
  } else {
    guardar();
  }

});

codigoCliente.addEventListener('input', () => {
  codigoCliente.value = codigoCliente.value.replace(/\D/g, '');
});


// MAYUSCULAS
[nombre, razon, direccion].forEach(input => {
  input.addEventListener("input", () => {

    //  convierte automÃ¡ticamente a MAYÃšSCULAS
    input.value = input.value.toUpperCase();

    formDirty = true;
  });
});

[nombre, razon, direccion].forEach(input => {
  input.addEventListener("paste", (e) => {
    e.preventDefault();

    const texto = (e.clipboardData || window.clipboardData)
      .getData("text")
      .toUpperCase();

    document.execCommand("insertText", false, texto);
  });
});


// ===== ATAJOS =====
document.addEventListener('keydown', e => {

  // F2 â†’ Nuevo
  if (e.key === 'F2') {
    e.preventDefault();
    nuevo();
  }

  // F3 â†’ Guardar
  if (e.key === 'F3') {
    e.preventDefault();
    guardar();
  }

  if (e.key === "F4") {
    e.preventDefault();
    if (!btnCancelar.disabled) cancelar();
  }

  // DELETE â†’ Eliminar
  if (e.key === 'Delete') {
    e.preventDefault();
    if (!btnEliminar.disabled) eliminar();
  }


});

thId.addEventListener("click", () => {

  if (sortField === "id") {
    sortDir = sortDir === "asc" ? "desc" : "asc";
  } else {
    sortField = "id";
    sortDir = "asc";
  }

  thId.textContent = sortDir === "asc" ? "ID â–²" : "ID â–¼";

  render(clientes);

});



// ===== INIT =====
window.onload = () => {

  modoInicial();
  clientes = [];
  offset = 0;
  finDatos = false;
  cargar();

  bloquearFormulario();

  if (modoSeleccion) {
    if (!permitirAltaSeleccion) {
      document.querySelector(".form-panel").style.display = "none";
    }
    document.querySelector(".cliente-layout").classList.add("modo-seleccion");

    document.getElementById("moduloTitulo").innerText = "Seleccionar Cliente";

    formDirty = false;
    cargandoCliente = false;
  }

  baseModalEnableExitProtection({
    hayCambios: hayCambiosSinGuardar
  });

  setTimeout(() => {
    codigoCliente.focus();
    codigoCliente.select();
  }, 100);

};


