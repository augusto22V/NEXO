const inputUsuario = document.getElementById("inputUsuario");
const inputPassword = document.getElementById("inputPassword");
const btnLogin = document.getElementById("btnLogin");
const selectEmpresa = document.getElementById("selectEmpresa");
const selectTerminal = document.getElementById("selectTerminal");
const errorBox = document.getElementById("errorMsg");
const btnUsuarioDropdown = document.getElementById("btnUsuarioDropdown");
const usuarioDropdownPanel = document.getElementById("usuarioDropdownPanel");
const campoUsuario = inputUsuario?.closest(".campo-usuario") || null;
const quickLoginWrap = document.getElementById("quickLoginWrap");
const quickLoginUsuario = document.getElementById("quickLoginUsuario");
const btnCambiarUsuario = document.getElementById("btnCambiarUsuario");

const licenciaOverlay = document.getElementById("licenciaOverlay");
const licenciaMensaje = document.getElementById("licenciaMensaje");
const controlActualWrap = document.getElementById("controlActualWrap");
const licenciaError = document.getElementById("licenciaError");
const btnLicenciaConfirmar = document.getElementById("btnLicenciaConfirmar");
const btnLicenciaContinuar = document.getElementById("btnLicenciaContinuar");
const btnLicenciaCerrar = document.getElementById("btnLicenciaCerrar");
const nuevoControlInputs = Array.from(document.querySelectorAll(".nuevo-control-input"));

let contextoLicencia = null;
let usuarioSuggestAbort = null;
let usuarioSuggestTimer = null;
let usuarioDropdownRows = [];
let usuarioDropdownIndex = -1;
let quickLoginActivo = false;
let quickLoginUsuarioRecordado = "";

const LAST_VISIBLE_USER_KEY = "softsys_usuario_visible";
window.SoftSysSession?.purgeClientSession?.({ preserveSafe: true });

function leerEmpresaGuardada() {
  try {
    return String(localStorage.getItem("empresaId") || "").trim();
  } catch {
    return "";
  }
}

function leerTerminalGuardada() {
  try {
    return String(localStorage.getItem("terminalId") || "").trim();
  } catch {
    return "";
  }
}

function guardarEmpresaDispositivo(empresaId) {
  const empresa = String(empresaId || "").trim();
  if (empresa) {
    localStorage.setItem("empresaId", empresa);
  } else {
    localStorage.removeItem("empresaId");
  }
}

function guardarTerminalDispositivo(empresaId, terminalId) {
  void empresaId;
  const terminal = String(terminalId || "").trim();
  if (terminal) {
    localStorage.setItem("terminalId", terminal);
  } else {
    localStorage.removeItem("terminalId");
  }
}

function leerUsuarioVisible() {
  try {
    return String(localStorage.getItem(LAST_VISIBLE_USER_KEY) || "").trim().toUpperCase();
  } catch {
    return "";
  }
}

function setModoUsuarioManual({ enfocar = false } = {}) {
  quickLoginActivo = false;
  quickLoginUsuarioRecordado = "";

  quickLoginWrap?.classList.add("hidden");
  campoUsuario?.classList.remove("hidden");

  if (enfocar && inputUsuario) {
    inputUsuario.focus();
    inputUsuario.select();
  }
}

function setModoLoginRapido(usuarioVisible) {
  const usuario = String(usuarioVisible || "").trim().toUpperCase();
  if (!usuario) {
    setModoUsuarioManual();
    return false;
  }

  quickLoginActivo = true;
  quickLoginUsuarioRecordado = usuario;

  if (quickLoginUsuario) quickLoginUsuario.textContent = usuario;
  if (inputUsuario) inputUsuario.value = usuario;

  quickLoginWrap?.classList.remove("hidden");
  campoUsuario?.classList.add("hidden");
  cerrarDropdownUsuario();
  return true;
}

function resolverUsuarioLogin() {
  const usuarioInput = String(inputUsuario?.value || "").trim().toUpperCase();
  if (usuarioInput) return usuarioInput;
  if (quickLoginActivo) return String(quickLoginUsuarioRecordado || leerUsuarioVisible()).trim().toUpperCase();
  return "";
}

function dropdownUsuarioAbierto() {
  return Boolean(usuarioDropdownPanel && !usuarioDropdownPanel.classList.contains("hidden"));
}

function cerrarDropdownUsuario() {
  if (!usuarioDropdownPanel) return;
  usuarioDropdownPanel.classList.add("hidden");
  usuarioDropdownIndex = -1;
}

function aplicarItemActivoDropdown() {
  if (!usuarioDropdownPanel) return;
  const buttons = Array.from(usuarioDropdownPanel.querySelectorAll(".usuario-option"));

  buttons.forEach((btn, idx) => {
    if (idx === usuarioDropdownIndex) {
      btn.classList.add("is-active");
      btn.scrollIntoView({ block: "nearest" });
    } else {
      btn.classList.remove("is-active");
    }
  });
}

function seleccionarUsuarioDropdown(usuario) {
  const value = String(usuario || "").trim().toUpperCase();
  if (!value) return;

  setModoUsuarioManual();
  inputUsuario.value = value;
  cerrarDropdownUsuario();
  inputPassword?.focus();
}

if (!setModoLoginRapido(leerUsuarioVisible()) && inputUsuario) {
  inputUsuario.focus();
} else {
  inputPassword?.focus();
}

if (inputUsuario) {
  inputUsuario.addEventListener("input", () => {
    inputUsuario.value = inputUsuario.value.toUpperCase();
    programarSugerenciasUsuario();
  });

  inputUsuario.addEventListener("focus", () => {
    if (inputUsuario.value.trim()) {
      programarSugerenciasUsuario();
    }
  });

  inputUsuario.addEventListener("keydown", (event) => {
    if (!dropdownUsuarioAbierto()) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        cargarSugerenciasUsuario(true);
      }
      return;
    }

    const total = usuarioDropdownRows.length;
    if (!total) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      usuarioDropdownIndex = (usuarioDropdownIndex + 1 + total) % total;
      aplicarItemActivoDropdown();
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      usuarioDropdownIndex = (usuarioDropdownIndex - 1 + total) % total;
      aplicarItemActivoDropdown();
      return;
    }

    if (event.key === "Enter") {
      if (usuarioDropdownIndex >= 0 && usuarioDropdownIndex < total) {
        event.preventDefault();
        event.stopPropagation();
        seleccionarUsuarioDropdown(usuarioDropdownRows[usuarioDropdownIndex].usuario);
      }
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      cerrarDropdownUsuario();
    }
  });
}

if (selectEmpresa) {
  selectEmpresa.addEventListener("change", async function () {
    limpiarError();

    const empresaId = this.value;
    guardarEmpresaDispositivo(empresaId);
    limpiarSugerenciasUsuario();

    if (empresaId) {
      await cargarTerminales(empresaId);
    } else {
      selectTerminal.innerHTML = `<option value="">Sin terminal disponible</option>`;
    }
  });
}

if (selectTerminal) {
  selectTerminal.addEventListener("change", function () {
    guardarTerminalDispositivo(selectEmpresa.value, this.value);
  });
}

if (btnUsuarioDropdown) {
  btnUsuarioDropdown.addEventListener("click", async () => {
    if (dropdownUsuarioAbierto()) {
      cerrarDropdownUsuario();
      return;
    }

    await cargarSugerenciasUsuario(true);
  });
}

if (btnCambiarUsuario) {
  btnCambiarUsuario.addEventListener("click", () => {
    setModoUsuarioManual({ enfocar: true });
  });
}

if (usuarioDropdownPanel) {
  usuarioDropdownPanel.addEventListener("click", (event) => {
    const option = event.target?.closest?.(".usuario-option");
    if (!option) return;
    seleccionarUsuarioDropdown(option.dataset.usuario || "");
  });
}

document.addEventListener("click", (event) => {
  if (!dropdownUsuarioAbierto()) return;

  const target = event.target;
  const dentroInput = target === inputUsuario || inputUsuario?.contains?.(target);
  const dentroBoton = target === btnUsuarioDropdown || btnUsuarioDropdown?.contains?.(target);
  const dentroPanel = target === usuarioDropdownPanel || usuarioDropdownPanel?.contains?.(target);

  if (!dentroInput && !dentroBoton && !dentroPanel) {
    cerrarDropdownUsuario();
  }
});

if (btnLogin) {
  btnLogin.addEventListener("click", login);
}

if (inputPassword) {
  inputPassword.addEventListener("focus", () => {
    cerrarDropdownUsuario();
  });
}

document.addEventListener("keydown", function (e) {
  if (e.key !== "Enter") return;
  if (e.defaultPrevented) return;

  if (!licenciaOverlay?.classList.contains("hidden")) {
    e.preventDefault();
    confirmarControlLicencia();
    return;
  }

  if (dropdownUsuarioAbierto()) return;

  if (btnLogin.disabled) return;

  const target = e.target;
  const isEditable = target && (
    target.id === "inputUsuario" ||
    target.id === "inputPassword" ||
    target.id === "selectEmpresa" ||
    target.id === "selectTerminal"
  );

  if (!isEditable) return;

  e.preventDefault();
  login();
});

window.addEventListener("load", () => {
  aplicarFallbackLogo();
  configurarInputsControl();

  selectEmpresa.innerHTML = `<option value="">Cargando empresas...</option>`;
  selectTerminal.innerHTML = `<option value="">Esperando empresa...</option>`;

  cargarEmpresas();
});


async function fetchConTimeout(url, options = {}, timeout = 8000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    return response;
  } finally {
    clearTimeout(id);
  }
}

function limpiarSugerenciasUsuario() {
  if (usuarioSuggestTimer) {
    clearTimeout(usuarioSuggestTimer);
    usuarioSuggestTimer = null;
  }

  if (usuarioSuggestAbort) {
    usuarioSuggestAbort.abort();
    usuarioSuggestAbort = null;
  }

  usuarioDropdownRows = [];
  usuarioDropdownIndex = -1;

  if (usuarioDropdownPanel) {
    usuarioDropdownPanel.innerHTML = "";
  }

  cerrarDropdownUsuario();
}

function renderSugerenciasUsuario(rows, abrir = false) {
  if (!usuarioDropdownPanel) return;

  const lista = (Array.isArray(rows) ? rows : [])
    .map((item) => ({
      usuario: String(item?.usuario || "").trim().toUpperCase(),
      nombre: String(item?.nombre || "").trim()
    }))
    .filter((item) => item.usuario);

  usuarioDropdownRows = lista;
  usuarioDropdownPanel.innerHTML = "";

  if (!lista.length) {
    cerrarDropdownUsuario();
    return;
  }

  for (let idx = 0; idx < lista.length; idx += 1) {
    const item = lista[idx];
    const button = document.createElement("button");
    button.type = "button";
    button.className = "usuario-option";
    button.dataset.index = String(idx);
    button.dataset.usuario = item.usuario;
    button.innerHTML = item.nombre
      ? `${item.usuario}<small>${item.nombre}</small>`
      : item.usuario;
    usuarioDropdownPanel.appendChild(button);
  }

  usuarioDropdownIndex = 0;
  aplicarItemActivoDropdown();

  if (abrir) {
    usuarioDropdownPanel.classList.remove("hidden");
  }
}

async function cargarSugerenciasUsuario(forzarMostrar = false) {
  const empresaId = String(selectEmpresa?.value || "").trim();
  const texto = String(inputUsuario?.value || "").trim().toUpperCase();

  if (!empresaId) {
    limpiarSugerenciasUsuario();
    return;
  }

  if (!forzarMostrar && texto.length < 1) {
    limpiarSugerenciasUsuario();
    return;
  }

  if (usuarioSuggestAbort) {
    usuarioSuggestAbort.abort();
  }

  usuarioSuggestAbort = new AbortController();

  try {
    const q = encodeURIComponent(texto);
    const e = encodeURIComponent(empresaId);
    const res = await fetch(`/api/auth/usuarios/sugerir?empresa_id=${e}&q=${q}&limit=20`, {
      credentials: "include",
      signal: usuarioSuggestAbort.signal
    });

    if (!res.ok) {
      limpiarSugerenciasUsuario();
      return;
    }

    const rows = await res.json().catch(() => []);
    renderSugerenciasUsuario(rows, forzarMostrar || texto.length >= 1);
  } catch (err) {
    if (err.name !== "AbortError") {
      console.error("Error sugerencias usuario:", err);
    }
  } finally {
    usuarioSuggestAbort = null;
  }
}

function programarSugerenciasUsuario() {
  if (usuarioSuggestTimer) clearTimeout(usuarioSuggestTimer);
  usuarioSuggestTimer = setTimeout(() => cargarSugerenciasUsuario(false), 180);
}

if (btnLicenciaConfirmar) {
  btnLicenciaConfirmar.addEventListener("click", confirmarControlLicencia);
}

if (btnLicenciaContinuar) {
  btnLicenciaContinuar.addEventListener("click", continuarSinRevalidar);
}

if (btnLicenciaCerrar) {
  btnLicenciaCerrar.addEventListener("click", cerrarControlLicencia);
}

function aplicarFallbackLogo() {
  const logos = Array.from(document.querySelectorAll("[data-login-logo]"));
  const candidates = [
    "/recursos/img/logo_softsys.png",
    "/recursos/img/Logo.png",
    "/recursos/img/softSys.png",
    "../recursos/img/logo_softsys.png"
  ];

  logos.forEach((imgEl) => {
    let idx = 0;
    imgEl.addEventListener("error", () => {
      idx += 1;
      if (idx < candidates.length) {
        imgEl.src = candidates[idx];
      }
    });
  });
}

function bloquearLogin() {
  if (!btnLogin) return;
  btnLogin.disabled = true;
  btnLogin.textContent = "Ingresando...";
}

function restaurarLogin() {
  if (!btnLogin) return;
  btnLogin.disabled = false;
  btnLogin.textContent = "Ingresar";
}

function limpiarLicenciaError() {
  if (licenciaError) licenciaError.textContent = "";
}

function mostrarLicenciaError(msg) {
  if (licenciaError) licenciaError.textContent = msg;
}

function partirEnGrupos(control) {
  const digits = String(control || "").replace(/\D/g, "").padStart(16, "0").slice(0, 16);
  return [
    digits.slice(0, 4),
    digits.slice(4, 8),
    digits.slice(8, 12),
    digits.slice(12, 16)
  ];
}

function renderControlActual(control) {
  if (!controlActualWrap) return;

  controlActualWrap.innerHTML = "";

  const grupos = partirEnGrupos(control);
  grupos.forEach((g) => {
    const input = document.createElement("input");
    input.type = "text";
    input.value = g;
    input.readOnly = true;
    input.disabled = true;
    controlActualWrap.appendChild(input);
  });
}

function limpiarNuevoControl() {
  nuevoControlInputs.forEach((input) => {
    input.value = "";
  });
}

function leerNuevoControl() {
  return nuevoControlInputs.map((input) => input.value).join("");
}

function configurarInputsControl() {
  if (!nuevoControlInputs.length) return;

  nuevoControlInputs.forEach((input, idx) => {
    input.addEventListener("input", () => {
      input.value = input.value.replace(/\D/g, "").slice(0, 4);

      if (input.value.length === 4 && idx < nuevoControlInputs.length - 1) {
        nuevoControlInputs[idx + 1].focus();
        nuevoControlInputs[idx + 1].select();
      }
    });

    input.addEventListener("keydown", (event) => {
      if (event.key === "Backspace" && input.value.length === 0 && idx > 0) {
        nuevoControlInputs[idx - 1].focus();
      }
    });

    input.addEventListener("paste", (event) => {
      const pasted = (event.clipboardData || window.clipboardData).getData("text");
      const digits = String(pasted).replace(/\D/g, "").slice(0, 16);
      if (!digits) return;

      event.preventDefault();

      for (let i = 0; i < nuevoControlInputs.length; i += 1) {
        nuevoControlInputs[i].value = digits.slice(i * 4, i * 4 + 4);
      }

      const next = nuevoControlInputs.find((i) => i.value.length < 4);
      if (next) next.focus();
      else nuevoControlInputs[nuevoControlInputs.length - 1].focus();
    });
  });
}

function abrirPantallaControlLicencia({ licencia, obligatorio, usuarioData, empresaId }) {
  contextoLicencia = { licencia, obligatorio, usuarioData, empresaId };

  if (licenciaMensaje) {
    if (obligatorio) {
      licenciaMensaje.textContent = "Sistema vencido. Ingrese nuevo control numerico para desbloquear.";
    } else {
      licenciaMensaje.textContent = `Faltan ${licencia.dias_restantes} dias para expirar.`;
    }
  }

  renderControlActual(licencia.control_actual);
  limpiarNuevoControl();
  limpiarLicenciaError();

  if (btnLicenciaContinuar) {
    btnLicenciaContinuar.style.display = obligatorio ? "none" : "inline-block";
  }

  if (btnLicenciaCerrar) {
    btnLicenciaCerrar.textContent = obligatorio ? "Cerrar sistema" : "Cancelar";
  }

  licenciaOverlay.classList.remove("hidden");

  if (nuevoControlInputs[0]) {
    nuevoControlInputs[0].focus();
  }
}

function ocultarPantallaControlLicencia() {
  licenciaOverlay.classList.add("hidden");
  contextoLicencia = null;
  limpiarNuevoControl();
  limpiarLicenciaError();
}

function cerrarSistemaCompleto() {
  window.open("", "_self");
  window.close();
  window.location.href = "about:blank";
}

async function confirmarControlLicencia() {
  if (!contextoLicencia) return;

  limpiarLicenciaError();

  const nuevoControl = leerNuevoControl();
  if (!/^\d{16}$/.test(nuevoControl)) {
    mostrarLicenciaError("Nuevo Control invalido");
    return;
  }

  const textoOriginal = btnLicenciaConfirmar.textContent;
  btnLicenciaConfirmar.disabled = true;
  btnLicenciaConfirmar.textContent = "Validando...";

  try {
    const res = await fetchConTimeout("/api/auth/licencia/activar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        empresa_id: contextoLicencia.empresaId,
        nuevo_control: nuevoControl
      })
    }, 10000);

    const data = await res.json();

    if (!res.ok || !data?.ok) {
      mostrarLicenciaError(data.error || "Control invalido");
      return;
    }

    localStorage.setItem("licenciaVencida", "0");

    if (data.licencia?.fecha_vencimiento_num) {
      localStorage.setItem(
        "licenciaVencimientoNum",
        String(data.licencia.fecha_vencimiento_num)
      );
    }

    const dataContexto = contextoLicencia;
    ocultarPantallaControlLicencia();

    finalizarLogin(
      dataContexto?.usuarioData || null,
      dataContexto?.empresaId || null
    );

  } catch (err) {
    console.error(err);

    // 🔥 IMPORTANTE: distinguir red lenta vs error normal
    if (err.name === "AbortError") {
      mostrarLicenciaError("La conexión está muy lenta. Intente nuevamente.");
    } else {
      mostrarLicenciaError("Error de conexión");
    }

  } finally {
    btnLicenciaConfirmar.disabled = false;
    btnLicenciaConfirmar.textContent = textoOriginal;
  }
}

function continuarSinRevalidar() {
  if (!contextoLicencia) return;
  const data = contextoLicencia;
  ocultarPantallaControlLicencia();
  finalizarLogin(data.usuarioData, data.empresaId);
}

function cerrarControlLicencia() {
  if (!contextoLicencia) return;

  if (contextoLicencia.obligatorio) {
    cerrarSistemaCompleto();
    return;
  }

  continuarSinRevalidar();
}

async function cargarEmpresas() {
  try {
    limpiarError();

    selectEmpresa.innerHTML = `<option value="">Cargando empresas...</option>`;
    selectTerminal.innerHTML = `<option value="">Cargando terminales...</option>`;

    const res = await fetchConTimeout("/api/empresa", {
      credentials: "include"
    }, 8000);

    const empresas = await res.json();

    selectEmpresa.innerHTML = "";

    if (!Array.isArray(empresas) || empresas.length === 0) {
      selectEmpresa.innerHTML = `<option value="">No hay empresas registradas</option>`;
      selectTerminal.innerHTML = `<option value="">No hay terminales</option>`;
      mostrarError("No existen empresas activas registradas");
      return;
    }

    empresas.forEach((e) => {
      const option = document.createElement("option");
      option.value = e.id;
      option.textContent = e.nombre;
      option.dataset.logo = e.logo || "";
      selectEmpresa.appendChild(option);
    });

    const empresaGuardada = leerEmpresaGuardada();
    const existeEmpresa = Array.from(selectEmpresa.options).some((opt) => String(opt.value) === String(empresaGuardada));

    if (empresaGuardada && existeEmpresa) {
      selectEmpresa.value = String(empresaGuardada);
    } else {
      selectEmpresa.selectedIndex = 0;
    }

    guardarEmpresaDispositivo(selectEmpresa.value);

    await cargarTerminales(selectEmpresa.value);

  } catch (err) {
    console.error(err);

    selectEmpresa.innerHTML = `<option value="">Error al cargar empresas</option>`;
    selectTerminal.innerHTML = `<option value="">Sin terminales</option>`;

    if (err.name === "AbortError") {
      mostrarError("La red está lenta. No se pudieron cargar las empresas a tiempo.");
    } else {
      mostrarError("No se pudieron cargar las empresas");
    }
  }
}

async function cargarTerminales(empresaId) {
  try {
    limpiarError();

    if (!empresaId) {
      selectTerminal.innerHTML = `<option value="">Sin terminal disponible</option>`;
      return;
    }

    selectTerminal.innerHTML = `<option value="">Cargando terminales...</option>`;

    const res = await fetchConTimeout(`/api/terminal/${empresaId}`, {
      credentials: "include"
    }, 8000);

    const terminales = await res.json();

    selectTerminal.innerHTML = "";

    if (!Array.isArray(terminales) || terminales.length === 0) {
      selectTerminal.innerHTML = `<option value="">No hay terminales registradas</option>`;
      mostrarError("La empresa seleccionada no tiene terminales");
      return;
    }

    terminales.forEach((t) => {
      const option = document.createElement("option");
      option.value = t.id;
      option.textContent = t.nombre;
      selectTerminal.appendChild(option);
    });

    const terminalGuardada = leerTerminalGuardada();
    const existeTerminal = Array.from(selectTerminal.options).some((opt) => String(opt.value) === String(terminalGuardada));

    if (terminalGuardada && existeTerminal) {
      selectTerminal.value = String(terminalGuardada);
    } else {
      selectTerminal.selectedIndex = 0;
    }

    guardarTerminalDispositivo(empresaId, selectTerminal.value);

    if (inputUsuario?.value?.trim()) {
      programarSugerenciasUsuario();
    }

  } catch (err) {
    console.error(err);

    selectTerminal.innerHTML = `<option value="">Error al cargar terminales</option>`;

    if (err.name === "AbortError") {
      mostrarError("La red está lenta. No se pudieron cargar las terminales a tiempo.");
    } else {
      mostrarError("No se pudieron cargar las terminales");
    }
  }
}

function finalizarLogin(usuarioData, empresaId) {
  if (!usuarioData) return;

  if (window.SoftSysSession?.persistSessionUser) {
    window.SoftSysSession.persistSessionUser(usuarioData);
  } else {
    localStorage.setItem("usuario", JSON.stringify(usuarioData));
  }

  const empresaNombre = selectEmpresa.options[selectEmpresa.selectedIndex]?.text || "";
  localStorage.setItem("empresaNombre", empresaNombre);

  if (empresaId) {
    localStorage.setItem("empresaId", String(empresaId));
  }

  const terminalId = String(selectTerminal?.value || "");
  if (terminalId) {
    localStorage.setItem("terminalId", terminalId);
  }

  guardarEmpresaDispositivo(empresaId || selectEmpresa?.value || "");
  guardarTerminalDispositivo(empresaId || selectEmpresa?.value || "", terminalId);
  window.SoftSysSession?.rememberLoginContext?.({
    empresaId: empresaId || selectEmpresa?.value || "",
    empresaNombre,
    terminalId,
    usuarioVisible: usuarioData.usuario || usuarioData.nombre || ""
  });

  window.location.replace("/home.html");
}

async function login() {
  limpiarError();

  const empresa_id = selectEmpresa.value;
  const terminal_id = selectTerminal.value;
  const usuario = resolverUsuarioLogin();
  const password = inputPassword.value.trim();

  if (!empresa_id) {
    mostrarError("Debes seleccionar una empresa");
    return;
  }

  if (!terminal_id) {
    mostrarError("Debes seleccionar una terminal");
    return;
  }

  if (!usuario) {
    if (quickLoginActivo) {
      mostrarError("No se encontro usuario recordado. Presione 'Cambiar usuario'.");
      setModoUsuarioManual({ enfocar: true });
    } else {
      mostrarError("Debes ingresar el usuario");
      inputUsuario.focus();
    }
    return;
  }

  if (!password) {
    mostrarError("Debes ingresar la contrasena o PIN");
    inputPassword.focus();
    return;
  }

  if (btnLogin.disabled) return;

  bloquearLogin();

  try {
    const res = await fetchConTimeout("/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache"
      },
      credentials: "include",
      cache: "no-store",
      body: JSON.stringify({
        empresa_id,
        terminal_id,
        usuario,
        password
      })
    }, 10000);

    const data = await res.json();

    if (!res.ok) {
      const baseMsg = data.error || "Usuario o contrasena incorrectos";
      mostrarError(
        quickLoginActivo
          ? `${baseMsg}. Si cambio de usuario, pulse 'Cambiar usuario'.`
          : baseMsg
      );
      restaurarLogin();
      return;
    }

    const licencia = data.licencia || null;

    if (!licencia) {
      localStorage.setItem("licenciaVencida", "0");
      finalizarLogin(data.usuario, empresa_id);
      return;
    }

    localStorage.setItem("licenciaVencida", licencia.vencida ? "1" : "0");
    localStorage.setItem("licenciaVencimientoNum", String(licencia.fecha_vencimiento_num || 0));

    if (licencia.vencida) {
      restaurarLogin();
      abrirPantallaControlLicencia({
        licencia,
        obligatorio: true,
        usuarioData: data.usuario,
        empresaId: empresa_id
      });
      return;
    }

    if (Number(licencia.dias_restantes) <= 3) {
      const confirmar = window.confirm(`Faltan ${licencia.dias_restantes} dias para expirar. ¿Desea revalidar?`);

      if (confirmar) {
        restaurarLogin();
        abrirPantallaControlLicencia({
          licencia,
          obligatorio: false,
          usuarioData: data.usuario,
          empresaId: empresa_id
        });
        return;
      }
    }

    finalizarLogin(data.usuario, empresa_id);

} catch (err) {
  console.error(err);

  if (err.name === "AbortError") {
    mostrarError("La conexión está muy lenta. Intente nuevamente.");
  } else {
    mostrarError("Error de conexión con el servidor");
  }

  restaurarLogin();
}
}

function mostrarError(msg) {
  errorBox.textContent = msg;
  errorBox.style.display = "block";
}

function limpiarError() {
  errorBox.textContent = "";
  errorBox.style.display = "none";
}

