// ========= BASE MODAL (GLOBAL) =========
// Usa:
// - modalEliminar  (confirmación)
// - modalAdvertencia (información / error)

let _onConfirmEliminar = null;

/* ================= MODAL ELIMINAR ================= */
function baseModalOpenConfirm({ titulo, mensaje, detalle = "", onConfirm }) {
  const modal = document.getElementById("modalEliminar");

  const tituloEl = modal.querySelector(".modal-title");
  const mensajeEl = modal.querySelector(".modal-text");
  const detalleEl = modal.querySelector(".modal-nombre");
  const btnEliminar = modal.querySelector(".btn-eliminar");
  const btnCancelar = modal.querySelector(".btn-cancelar");

  // Setear textos
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

  // Eventos
  btnCancelar.onclick = cerrarModalEliminar;
  btnEliminar.onclick = async () => {
    cerrarModalEliminar();
    if (_onConfirmEliminar) {
      await _onConfirmEliminar();
    }
  };

  modal.classList.remove("hidden");
}

function cerrarModalEliminar() {
  const modal = document.getElementById("modalEliminar");
  modal.classList.add("hidden");
  _onConfirmEliminar = null;
}

/* ================= MODAL ADVERTENCIA ================= */
function baseModalOpenInfo({ titulo = "Atención", mensaje }) {
  const modal = document.getElementById("modalAdvertencia");

  const tituloEl = modal.querySelector(".modal-title");
  const mensajeEl = modal.querySelector(".modal-text");

  tituloEl.textContent = titulo;
  mensajeEl.innerHTML = mensaje || "";

  modal.classList.remove("hidden");
}

function cerrarAdvertencia() {
  const modal = document.getElementById("modalAdvertencia");
  modal.classList.add("hidden");
}
