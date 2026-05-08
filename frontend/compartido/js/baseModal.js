// ========= BASE MODAL (GLOBAL) =========

let _listenerConfirm = null;
let _listenerInfo = null;
let _onConfirm = null;
let _onCloseInfo = null;


/* =======================================================
   ================= MODAL CONFIRMAR =====================
   ======================================================= */

function baseModalOpenConfirm({
  titulo,
  mensaje,
  detalle = "",
  onConfirm,
  confirmText = "Aceptar",
  cancelText = "Cancelar"
}) {

  const modalOverlay = document.getElementById("modalOverlay");

  /* ================= NUEVO MODAL ================= */
  if (modalOverlay) {

    const tituloEl = document.getElementById("modalTitulo");
    const mensajeEl = document.getElementById("modalMensaje");
    const extraEl = document.getElementById("modalExtra");

    const btnOk = document.getElementById("modalBtnOk");
    const btnCancel = document.getElementById("modalBtnCancel");
    const btnDanger = document.getElementById("modalBtnDanger");

    tituloEl.textContent = titulo || "Confirmar";
    mensajeEl.textContent = mensaje || "¿Desea continuar?";

    if (extraEl) {
      if (detalle) {
        extraEl.innerHTML = detalle;
        extraEl.classList.remove("hidden");
      } else {
        extraEl.innerHTML = "";
        extraEl.classList.add("hidden");
      }
    }

    btnOk.classList.add("hidden");
    btnDanger.classList.remove("hidden");
    btnCancel.classList.remove("hidden");

    btnDanger.textContent = confirmText;
    btnCancel.textContent = cancelText;

    _onConfirm = onConfirm || null;

    btnCancel.onclick = cerrarModal;
    btnDanger.onclick = async () => {
      if (_onConfirm) await _onConfirm();
      cerrarModal();
    };

    modalOverlay.classList.remove("hidden");
    setTimeout(() => btnDanger.focus(), 50);

    if (_listenerConfirm) {
      document.removeEventListener("keydown", _listenerConfirm);
    }

_listenerConfirm = function (e) {

  const btnDanger = document.getElementById("modalBtnDanger");
  const btnCancel = document.getElementById("modalBtnCancel");

  // 🔹 Flechas izquierda / derecha
  if (e.key === "ArrowRight" || e.key === "ArrowLeft") {

    e.preventDefault();
    e.stopPropagation();

    if (document.activeElement === btnDanger) {
      btnCancel.focus();
    } else {
      btnDanger.focus();
    }

    return;
  }

  // 🔹 Enter ejecuta el botón enfocado
  if (e.key === "Enter") {
    e.preventDefault();
    document.activeElement.click();
    return;
  }

  // 🔹 Escape cierra
  if (e.key === "Escape") {
    e.preventDefault();
    cerrarModal();
    return;
  }
};

    document.addEventListener("keydown", _listenerConfirm);
    return;
  }

  /* ================= MODAL VIEJO ================= */
  const modalViejo = document.getElementById("modalEliminar");

  if (modalViejo) {

    const tituloEl = modalViejo.querySelector(".modal-title");
    const mensajeEl = modalViejo.querySelector(".modal-text");
    const detalleEl = modalViejo.querySelector(".modal-nombre");
    const btnEliminar = modalViejo.querySelector(".btn-eliminar");
    const btnCancelar = modalViejo.querySelector(".btn-cancelar");

    tituloEl.textContent = titulo || "Confirmar";
    mensajeEl.textContent = mensaje || "¿Desea continuar?";

    if (detalleEl) {
      if (detalle) {
        detalleEl.innerHTML = detalle;
        detalleEl.classList.remove("hidden");
      } else {
        detalleEl.innerHTML = "";
        detalleEl.classList.add("hidden");
      }
    }

    btnEliminar.textContent = confirmText;
    btnCancelar.textContent = cancelText;

    _onConfirm = onConfirm || null;

    btnCancelar.onclick = cerrarModalEliminar;
    btnEliminar.onclick = async () => {
      if (_onConfirm) await _onConfirm();
      cerrarModalEliminar();
    };

    modalViejo.classList.remove("hidden");
    setTimeout(() => btnEliminar.focus(), 50);

    if (_listenerConfirm) {
      document.removeEventListener("keydown", _listenerConfirm);
    }
_listenerConfirm = function (e) {

  // 🔹 Flechas izquierda / derecha
  if (e.key === "ArrowRight" || e.key === "ArrowLeft") {

    e.preventDefault();
    e.stopPropagation();

    if (document.activeElement === btnEliminar) {
      btnCancelar.focus();
    } else {
      btnEliminar.focus();
    }

    return;
  }

  // 🔹 Enter ejecuta el botón enfocado
  if (e.key === "Enter") {
    e.preventDefault();
    document.activeElement.click();
    return;
  }

  // 🔹 Escape cierra
  if (e.key === "Escape") {
    e.preventDefault();
    cerrarModalEliminar();
    return;
  }
};

    document.addEventListener("keydown", _listenerConfirm);
  }
}

function cerrarModal() {
  const modalOverlay = document.getElementById("modalOverlay");
  if (modalOverlay) modalOverlay.classList.add("hidden");

  if (_listenerConfirm) {
    document.removeEventListener("keydown", _listenerConfirm);
    _listenerConfirm = null;
  }

  _onConfirm = null;
}

function cerrarModalEliminar() {
  const modalViejo = document.getElementById("modalEliminar");
  if (modalViejo) modalViejo.classList.add("hidden");

  if (_listenerConfirm) {
    document.removeEventListener("keydown", _listenerConfirm);
    _listenerConfirm = null;
  }

  _onConfirm = null;
}

/* =======================================================
   ========== PROTECCIÓN GLOBAL DE SALIDA =================
   ======================================================= */

function baseModalEnableExitProtection({
  hayCambios,
  onExit
}) {

  let permitirSalida = false;   // 🔹 AQUÍ (baseModal.js)

  function volverInterno() {

    const hay = hayCambios && hayCambios();

    if (!hay) {
      if (onExit) onExit();
      else history.back();
      return;
    }

    baseModalOpenConfirm({
      titulo: "Salir",
      mensaje: "Hay cambios sin guardar. ¿Desea salir?",
      confirmText: "Salir",
      cancelText: "Cancelar",
      onConfirm: () => {

        permitirSalida = true;   // 🔹 AQUÍ TAMBIÉN

        if (onExit) onExit();
        else history.back();
      }
    });
  }

  // ===== ESC =====
  if (window._exitEscHandler) {
    document.removeEventListener("keydown", window._exitEscHandler);
  }

  window._exitEscHandler = function (e) {

    if (e.key !== "Escape") return;

e.stopImmediatePropagation();

    const modalOverlay = document.getElementById("modalOverlay");
    const modalEliminar = document.getElementById("modalEliminar");
    const modalAdvertencia = document.getElementById("modalAdvertencia");

    const modalVisible =
      (modalOverlay && !modalOverlay.classList.contains("hidden")) ||
      (modalEliminar && !modalEliminar.classList.contains("hidden")) ||
      (modalAdvertencia && !modalAdvertencia.classList.contains("hidden"));

    if (modalVisible) return;

    e.preventDefault();
    e.stopPropagation();

    volverInterno();
  };

  document.addEventListener("keydown", window._exitEscHandler);

  // ===== BOTÓN X DEL NAVEGADOR =====
  if (window._beforeUnloadHandler) {
    window.removeEventListener("beforeunload", window._beforeUnloadHandler);
  }

 window._beforeUnloadHandler = function (e) {

  if (permitirSalida) return;   // 🔹 ESTA LÍNEA ES LA CLAVE

  if (hayCambios && hayCambios()) {
    e.preventDefault();
    e.returnValue = "";
  }
};

  window.addEventListener("beforeunload", window._beforeUnloadHandler);

  window.volverSeguro = volverInterno;
}