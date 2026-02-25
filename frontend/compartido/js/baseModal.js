// ========= BASE MODAL (GLOBAL) =========
// Usa:
// - modalEliminar  (confirmación)
// - modalAdvertencia (información / error)

let _onConfirmEliminar = null;
let _listenerInfo = null;
let _listenerConfirm = null;
let _onCloseInfo = null;

/* ================= MODAL ELIMINAR ================= */
function baseModalOpenConfirm({ titulo, mensaje, detalle = "", onConfirm }) {

  const modal = document.getElementById("modalEliminar");

  const tituloEl = modal.querySelector(".modal-title");
  const mensajeEl = modal.querySelector(".modal-text");
  const detalleEl = modal.querySelector(".modal-nombre");
  const btnEliminar = modal.querySelector(".btn-eliminar");
  const btnCancelar = modal.querySelector(".btn-cancelar");

  tituloEl.textContent = titulo || "Confirmar eliminación";
  mensajeEl.textContent = mensaje || "¿Desea eliminar el registro?";

  if (detalle) {
    detalleEl.innerHTML = detalle;
    detalleEl.classList.remove("hidden");
  } else {
    detalleEl.innerHTML = "";
    detalleEl.classList.add("hidden");
  }

  _onConfirmEliminar = onConfirm || null;

  btnCancelar.onclick = cerrarModalEliminar;

btnEliminar.onclick = async () => {
  if (_onConfirmEliminar) await _onConfirmEliminar();
  cerrarModalEliminar();
};

  modal.classList.remove("hidden");

  //  foco automático
  setTimeout(() => btnEliminar.focus(), 50);

  //  teclado
 _listenerConfirm = function(e) {
  if (e.key === "Enter") {
    e.preventDefault();
    btnEliminar.click();
  }
  if (e.key === "Escape") {
    e.preventDefault();
    cerrarModalEliminar();
  }
};

  document.addEventListener("keydown", _listenerConfirm);
}

function cerrarModalEliminar() {

  const modal = document.getElementById("modalEliminar");
  modal.classList.add("hidden");

  if (_listenerConfirm) {
    document.removeEventListener("keydown", _listenerConfirm);
    _listenerConfirm = null;
  }

  _onConfirmEliminar = null;
}


/* ================= MODAL ADVERTENCIA ================= */

function baseModalOpenInfo({ titulo = "Atención", mensaje, onClose }) {

  const modal = document.getElementById("modalAdvertencia");

  const tituloEl = modal.querySelector(".modal-title");
  const mensajeEl = modal.querySelector(".modal-text");
  const btnAceptar = modal.querySelector(".btn-aceptar");

  tituloEl.textContent = titulo;
  mensajeEl.innerHTML = mensaje || "";

  _onCloseInfo = onClose || null;

  modal.classList.remove("hidden");

  setTimeout(() => btnAceptar.focus(), 50);

 _listenerInfo = function(e) {

  if (e.key === "Enter" || e.key === "Escape") {

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    cerrarAdvertencia();

  }

};

  document.addEventListener("keydown", _listenerInfo);
}

function cerrarAdvertencia() {

  const modal = document.getElementById("modalAdvertencia");
  modal.classList.add("hidden");

  if (_listenerInfo) {
    document.removeEventListener("keydown", _listenerInfo);
    _listenerInfo = null;
  }

  if (_onCloseInfo) {
    _onCloseInfo();
    _onCloseInfo = null;
  }
}