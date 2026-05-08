const LOGIN_URL = "/login/login.html";
const HOME_URL = "/home.html";
const ADMIN_URL = "/admin.html";
const ASSET_VERSION_FALLBACK = "2026.04.17.03";
const IDLE_TIMEOUT_VENTA_CAJA_MS = 30 * 60 * 1000;
const IDLE_TIMEOUT_ADMIN_MS = 60 * 60 * 1000;

const ROL_ALIASES = {
  SUPER: ["SUPER", "SUP"],
  ADMIN: ["ADMIN", "ADM"],
  VENDEDOR: ["VENDEDOR", "VEND", "VEN"],
  CAIXA: ["CAIXA", "CXA", "CAJA"],
  CONSULTA: ["CONSULTA", "CON"],
  GERENCIA: ["GERENCIA", "GER"],
  NOTA: ["NOTA", "NOT"],
  SIS: ["SIS", "SISTEMA", "SUPER_SISTEMA"]
};

const PERMISOS_PAGINA = {
  "/admin.html": ["SUPER", "ADMIN", "SIS"],

  "/modulos/gestion_caja/gestion.html": ["SUPER", "ADMIN", "SIS", "CAIXA", "GERENCIA"],
  "/modulos/compra/compra.html": ["SUPER", "ADMIN", "SIS"],
  "/modulos/productos/productos.html": ["SUPER", "ADMIN", "SIS"],
  "/modulos/proveedores/proveedores.html": ["SUPER", "ADMIN", "SIS"],
  "/modulos/categorias/categorias.html": ["SUPER", "ADMIN", "SIS"],

  "/modulos/config/usuarios/usuarios.html": ["SUPER", "ADMIN", "SIS"],
  "/modulos/config/empresa/empresa.html": ["SUPER", "ADMIN", "SIS"],
  "/modulos/config/terminal/terminal.html": ["SUPER", "ADMIN", "SIS"],
  "/modulos/config/licencia_generador.html": ["SUPER", "ADMIN", "SIS"],
  "/modulos/config/programas/programas.html": ["SUPER", "ADMIN", "SIS"],
  "/modulos/config/permisos/permisos.html": ["SUPER", "ADMIN", "SIS"],

  "/modulos/parametros/parametros.html": ["SUPER", "ADMIN", "SIS"],
  "/modulos/parametros/operacion.html": ["SUPER", "ADMIN", "SIS"],
  "/modulos/parametros/forma_pago.html": ["SUPER", "ADMIN", "SIS"],
  "/modulos/precio/precio.html": ["SUPER", "ADMIN", "SIS"],
  "/modulos/herramientas/herramientas.html": ["SUPER", "ADMIN", "SIS"],

  "/modulos/venta/venta_rapida.html": ["SUPER", "ADMIN", "SIS", "VENDEDOR", "CAIXA", "GERENCIA", "NOTA"],
  "/modulos/venta/venta_medio.html": ["SUPER", "ADMIN", "SIS", "VENDEDOR", "CAIXA", "GERENCIA", "NOTA"],
  "/modulos/mesa/mesa.html": ["SUPER", "ADMIN", "SIS", "VENDEDOR", "CAIXA", "GERENCIA"],
  "/modulos/cliente/cliente.html": ["SUPER", "ADMIN", "SIS", "VENDEDOR", "CONSULTA", "GERENCIA"]
};

const RUTAS_BLOQUEADAS_MENU_SUPERIOR = [
  "/modulos/listado/listado_productos.html",
  "/modulos/listado/listado_categorias.html",
  "/modulos/listado/listado_proveedores.html",
  "/modulos/listado/listado_clientes.html",
  "/modulos/listado/listado_vendedores.html",
  "/modulos/listado/listado_compradores.html",
  "/modulos/reportes/reporte_produccion.html",
  "/modulos/Informes/informe_venta.html",
  "/modulos/Informes/informe_compra.html",
  "/modulos/informes/informe_venta.html",
  "/modulos/informes/informe_compra.html",
  "/modulos/informes/informe_ia.html",
  "/modulos/herramientas/cotizacion.html",
  "/modulos/parametros/parametros.html",
  "/modulos/parametros/operacion.html",
  "/modulos/parametros/forma_pago.html",
  "/modulos/precio/precio.html",
  "/modulos/tipo_pedido/tipo_pedido.html"
];

const RUTAS_BLOQUEADAS_POR_ROL = {
  CAIXA: new Set([
    ...RUTAS_BLOQUEADAS_MENU_SUPERIOR,
    "/modulos/herramientas/herramientas.html",
    "/modulos/movimientoCompra/movimientoCompra.html",
    "/modulos/movimientoFactura/movimientoFactura.html"
  ]),
  VENDEDOR: new Set([
    ...RUTAS_BLOQUEADAS_MENU_SUPERIOR
  ])
};

function normalizarPath(path) {
  let txt = String(path || "").trim();
  if (!txt) return "/";

  txt = txt.split("?")[0].split("#")[0].trim();
  if (!txt.startsWith("/")) txt = `/${txt}`;
  if (txt.length > 1 && txt.endsWith("/")) txt = txt.slice(0, -1);
  return txt;
}

function resolverIdleTimeoutMs(pathNormalizado) {
  const path = normalizarPath(pathNormalizado);
  if (path === ADMIN_URL) return IDLE_TIMEOUT_ADMIN_MS;
  if (
    path.startsWith("/modulos/venta/") ||
    path.startsWith("/modulos/caja/") ||
    path.startsWith("/modulos/gestion_caja/")
  ) {
    return IDLE_TIMEOUT_VENTA_CAJA_MS;
  }
  return null;
}

function normalizarRol(rol) {
  const servicio = window.SoftSysProgramas;
  if (servicio?.normalizarRol) return servicio.normalizarRol(rol);

  const raw = String(rol || "").trim().toUpperCase();
  if (!raw) return "VENDEDOR";

  for (const [canon, aliases] of Object.entries(ROL_ALIASES)) {
    if (aliases.includes(raw)) return canon;
  }

  return raw;
}

function rolPermitido(path, rolCanonico) {
  const permitidos = PERMISOS_PAGINA[path];
  if (!Array.isArray(permitidos) || !permitidos.length) return true;
  return permitidos.includes(rolCanonico);
}

function redireccionPorZona(programa) {
  if (!programa) return HOME_URL;
  return String(programa.zona || "").toLowerCase() === "admin" ? ADMIN_URL : HOME_URL;
}

function ensureProgramasService() {
  if (window.SoftSysProgramas) return Promise.resolve();

  return new Promise((resolve) => {
    const yaExiste = document.querySelector('script[data-softsys-programas="1"]');
    if (yaExiste) {
      if (window.SoftSysProgramas) {
        resolve();
        return;
      }
      yaExiste.addEventListener("load", () => resolve(), { once: true });
      yaExiste.addEventListener("error", () => resolve(), { once: true });
      setTimeout(resolve, 250);
      return;
    }

    const script = document.createElement("script");
    script.src = "/compartido/js/programas.acceso.js";
    script.defer = true;
    script.dataset.softsysProgramas = "1";
    script.onload = () => resolve();
    script.onerror = () => resolve();
    document.head.appendChild(script);
  });
}

function ensureScript(src, dataAttr) {
  return new Promise((resolve) => {
    const baseSrc = String(src || "").split("?")[0];
    const selector = dataAttr ? `script[${dataAttr}=\"1\"]` : null;
    const existingByAttr = selector ? document.querySelector(selector) : null;
    const existingBySrc = Array.from(document.querySelectorAll("script[src]"))
      .find((script) => String(script.getAttribute("src") || "").split("?")[0] === baseSrc);
    const existing = existingByAttr || existingBySrc || null;

    if (existing) {
      if (dataAttr) existing.setAttribute(dataAttr, "1");
      if (existing.dataset.loaded === "1") {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => resolve(), { once: true });
      setTimeout(resolve, 300);
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.defer = true;
    if (dataAttr) script.setAttribute(dataAttr, "1");
    script.addEventListener("load", () => {
      script.dataset.loaded = "1";
      resolve();
    }, { once: true });
    script.addEventListener("error", () => resolve(), { once: true });
    document.head.appendChild(script);
  });
}

async function ensureSessionSupport() {
  const version = encodeURIComponent(window.SoftSysAppConfig?.assetVersion || ASSET_VERSION_FALLBACK);

  if (!window.SoftSysAppConfig) {
    await ensureScript(`/compartido/js/app.config.js?v=${version}`, "data-softsys-app-config");
  }

  if (!window.SoftSysSession) {
    await ensureScript(`/compartido/js/session.manager.js?v=${version}`, "data-softsys-session");
  }

  await ensureScript(`/compartido/js/cache.bootstrap.js?v=${version}`, "data-softsys-cache");
}

async function verificarSeguridad() {
  try {
    await ensureSessionSupport();
    await ensureProgramasService();

    const res = await fetch("/api/auth/verify", {
      credentials: "include",
      cache: "no-store",
      headers: { "Cache-Control": "no-cache" }
    });
    if (!res.ok) {
      window.SoftSysSession?.purgeClientSession?.({ preserveSafe: true });
      window.location.href = LOGIN_URL;
      return;
    }

    const data = await res.json().catch(() => ({}));
    const user = data?.usuario;
    if (!user) {
      window.SoftSysSession?.purgeClientSession?.({ preserveSafe: true });
      window.location.href = LOGIN_URL;
      return;
    }

    if (window.SoftSysSession?.persistSessionUser) {
      window.SoftSysSession.persistSessionUser(user);
    } else {
      localStorage.setItem("usuario", JSON.stringify(user));
    }

    const paginaActual = normalizarPath(window.location.pathname);
    const rolCanonico = normalizarRol(user.rol);
    const bloqueadasRol = RUTAS_BLOQUEADAS_POR_ROL[rolCanonico];

    if (bloqueadasRol && bloqueadasRol.has(paginaActual)) {
      window.location.href = HOME_URL;
      return;
    }

    if (!rolPermitido(paginaActual, rolCanonico)) {
      window.location.href = HOME_URL;
      return;
    }

    const servicio = window.SoftSysProgramas;
    if (!servicio) return;

    if (servicio.inicializar) {
      await servicio.inicializar();
    }
    if (servicio.cargarAsignacionUsuario && user?.id) {
      await servicio.cargarAsignacionUsuario(user.id);
    }

    if (paginaActual === ADMIN_URL) {
      const adminProgramas = servicio.resolverProgramasUsuario(user, {
        zona: "admin",
        visibleEn: "admin"
      });

      const historicoAdmin = ["SUPER", "ADMIN", "SIS"].includes(rolCanonico);
      if (!adminProgramas.length && !historicoAdmin) {
        window.location.href = HOME_URL;
        return;
      }
    }

    const habilitada = servicio.estaRutaHabilitadaParaUsuario(user, paginaActual);
    if (!habilitada) {
      const programa = servicio.buscarProgramaPorRuta(paginaActual);
      let destino = redireccionPorZona(programa);

      if (paginaActual === ADMIN_URL) destino = HOME_URL;
      window.location.href = destino;
      return;
    }

    const timeoutMs = resolverIdleTimeoutMs(paginaActual);
    window.SoftSysSession?.startIdleGuard?.(
      timeoutMs ? { timeoutMs } : {}
    );
  } catch (error) {
    console.error("Error de seguridad:", error);
    window.SoftSysSession?.purgeClientSession?.({ preserveSafe: true });
    window.location.href = LOGIN_URL;
  }
}

if (typeof window.cerrarSesion !== "function") {
  window.cerrarSesion = function cerrarSesionGlobal() {
    if (window.SoftSysSession?.logout) {
      window.SoftSysSession.logout({ redirect: true, reason: "manual" });
      return;
    }
    window.location.href = LOGIN_URL;
  };
}

verificarSeguridad();
