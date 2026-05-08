function getServicioProgramas() {
  return window.SoftSysProgramas || null;
}

const FALLBACK_ADMIN = [
  { nombre: "Usuarios", categoria: "Seguridad", ruta: "/modulos/config/usuarios/usuarios.html", icono: "fa-users" },
  { nombre: "Programas", categoria: "Seguridad", ruta: "/modulos/config/programas/programas.html", icono: "fa-layer-group" },
  { nombre: "Permisos", categoria: "Seguridad", ruta: "/modulos/config/permisos/permisos.html", icono: "fa-key" },
  { nombre: "Empresa", categoria: "Configuracion", ruta: "/modulos/config/empresa/empresa.html", icono: "fa-building" },
  { nombre: "Terminales", categoria: "Configuracion", ruta: "/modulos/config/terminal/terminal.html", icono: "fa-desktop" },
  { nombre: "Parametros", categoria: "Configuracion", ruta: "/modulos/parametros/parametros.html", icono: "fa-sliders" },
  { nombre: "Generador Control", categoria: "Sistema", ruta: "/modulos/config/licencia_generador.html", icono: "fa-shield-halved" }
];

function normalizarRol(rol) {
  const servicio = getServicioProgramas();
  if (servicio) return servicio.normalizarRol(rol);
  return String(rol || "").toUpperCase();
}

function nombreRol(rol) {
  const servicio = getServicioProgramas();
  if (servicio) return servicio.obtenerNombreRol(rol);
  return normalizarRol(rol);
}

function descripcionPrograma(item) {
  const categoria = item.categoria ? `Categoria: ${item.categoria}. ` : "";
  return `${categoria}Ruta: ${item.ruta}`;
}

function obtenerProgramasAdmin(user) {
  const servicio = getServicioProgramas();
  if (!servicio) return FALLBACK_ADMIN;

  const lista = servicio.resolverProgramasUsuario(user, {
    zona: "admin",
    visibleEn: "admin"
  });

  if (lista.length) return lista;

  const rolCanonico = normalizarRol(user?.rol);
  if (["SUPER", "ADMIN", "SIS"].includes(rolCanonico)) return FALLBACK_ADMIN;

  return [];
}

function construirUrlApk(fileName) {
  return new URL(`/admin/apk/${encodeURIComponent(fileName)}`, window.location.origin).href;
}

function mostrarEstadoDescarga(mensaje, tipo = "") {
  const estado = document.getElementById("adminDownloadStatus");
  if (!estado) return;

  estado.textContent = mensaje || "";
  estado.classList.remove("is-ok", "is-error");
  if (tipo === "ok") estado.classList.add("is-ok");
  if (tipo === "error") estado.classList.add("is-error");
}

function inicializarDescargaApks() {
  const origen = document.getElementById("adminServerOrigin");
  const frame = document.getElementById("adminDownloadFrame");
  const botones = Array.from(document.querySelectorAll(".admin-download-btn"));

  if (origen) origen.textContent = window.location.origin;
  if (!frame || !botones.length) return;

  botones.forEach((boton) => {
    const fileName = boton.dataset.apkFile;
    const etiqueta = boton.dataset.apkLabel || fileName || "APK";
    if (!fileName) return;

    const url = construirUrlApk(fileName);

    boton.addEventListener("click", () => {
      mostrarEstadoDescarga(`Descargando ${etiqueta}...`, "ok");
      boton.disabled = true;
      frame.src = `${url}${url.includes("?") ? "&" : "?"}ts=${Date.now()}`;

      window.setTimeout(() => {
        boton.disabled = false;
        mostrarEstadoDescarga(`Si no inicia la descarga, verifica la sesion o que ${etiqueta} exista en el servidor.`);
      }, 2400);
    });
  });
}

function renderMenuAdmin(programas) {
  const cont = document.getElementById("adminGrid");
  if (!cont) return;

  if (!programas.length) {
    cont.innerHTML = `
      <article class="admin-card">
        <div class="admin-card-head">
          <i class="fa-solid fa-lock"></i>
          <h3>Sin programas administrativos</h3>
        </div>
        <p>No tenes modulos administrativos habilitados.</p>
        <button type="button" onclick="window.location.href='/home.html'">Volver al operativo</button>
      </article>
    `;
    return;
  }

  cont.innerHTML = programas.map((modulo) => `
    <article class="admin-card">
      <div class="admin-card-head">
        <i class="fa-solid ${modulo.icono || "fa-layer-group"}"></i>
        <h3>${modulo.nombre}</h3>
      </div>
      <p>${descripcionPrograma(modulo)}</p>
      <button type="button" onclick="window.location.href='${modulo.ruta}'">Abrir</button>
    </article>
  `).join("");
}

function cargarUsuarioAdmin(user) {
  const usuario = document.getElementById("adminUsuario");
  const rol = document.getElementById("adminRol");
  const empresa = document.getElementById("adminEmpresa");

  if (usuario) usuario.textContent = user.usuario || user.nombre || "-";
  if (rol) rol.textContent = nombreRol(user.rol || "-");
  if (empresa) empresa.textContent = user.empresa_nombre || "-";
}

async function cerrarSesionAdmin() {
  if (window.SoftSysSession?.logout) {
    await window.SoftSysSession.logout({ redirect: true, reason: "manual" });
    return;
  }

  try {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include", cache: "no-store" });
  } finally {
    localStorage.removeItem("usuario");
    window.location.href = "/login/login.html";
  }
}

async function initAdmin() {
  try {
    const res = await fetch("/api/auth/verify", {
      credentials: "include",
      cache: "no-store",
      headers: { "Cache-Control": "no-cache" }
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data?.usuario) {
      window.location.href = "/login/login.html";
      return;
    }

    const user = data.usuario;
    if (window.SoftSysSession?.persistSessionUser) {
      window.SoftSysSession.persistSessionUser(user);
    } else {
      localStorage.setItem("usuario", JSON.stringify(user));
    }

    const servicio = getServicioProgramas();
    if (servicio?.inicializar) await servicio.inicializar();
    if (servicio?.cargarAsignacionUsuario) await servicio.cargarAsignacionUsuario(user.id);

    const programas = obtenerProgramasAdmin(user);
    const rolCanonico = normalizarRol(user.rol);
    const rolHistoricoAdmin = ["SUPER", "ADMIN", "SIS"].includes(rolCanonico);

    if (!programas.length && !rolHistoricoAdmin) {
      window.location.href = "/home.html";
      return;
    }

    cargarUsuarioAdmin(user);
    renderMenuAdmin(programas);
    inicializarDescargaApks();
    window.SoftSysSession?.startIdleGuard?.({ timeoutMs: 60 * 60 * 1000 });
  } catch (error) {
    window.location.href = "/login/login.html";
  }
}

document.addEventListener("DOMContentLoaded", initAdmin);
