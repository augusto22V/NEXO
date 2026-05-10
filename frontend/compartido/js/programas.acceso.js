/* =========================================================
   ALPX — Programas / accesos
   ---------------------------------------------------------
   Persistencia principal: PostgreSQL via /api/programas.
   Cache local: solo memoria de la sesion actual.
   ========================================================= */
(function () {
  const API_BASE = "/api/programas";

  const ROLE_EQUIV = {
    SUPER: ["SUPER", "SUP", "super", "sup"],
    ADMIN: ["ADMIN", "ADM", "admin", "adm"],
    VENDEDOR: ["VENDEDOR", "VEND", "VEN", "vendedor", "vend", "ven"],
    CAIXA: ["CAIXA", "CXA", "CAJA", "caixa", "cxa", "caja"],
    CONSULTA: ["CONSULTA", "CON", "consulta", "con"],
    GERENCIA: ["GERENCIA", "GER", "gerencia", "ger"],
    NOTA: ["NOTA", "NOT", "nota", "not"],
    SIS: ["SIS", "SISTEMA", "SUPER_SISTEMA", "sis", "sistema", "super_sistema"]
  };

  const ROLE_NAME = {
    SUPER: "SUPER",
    ADMIN: "ADMIN",
    VENDEDOR: "VENDEDOR",
    CAIXA: "CAIXA",
    CONSULTA: "CONSULTA",
    GERENCIA: "GERENCIA",
    NOTA: "NOTA",
    SIS: "SISTEMA"
  };

  const DEFAULT_PLANTILLAS = {
    SUPER: "*",
    SIS: "*",
    ADMIN: [
      "VENTA_RAPIDA", "MESAS", "CAJA", "CONSULTA_PRODUCTOS", "MOV_VENTA", "MOV_COMPRA", "MOV_FACTURA",
      "CLIENTES", "COMPRAS", "PRODUCTOS", "CATEGORIAS", "PROVEEDORES", "PRODUCCION", "RECETAS", "MENU_DIGITAL",
      "PARAMETROS", "OPERACIONES", "FORMA_PAGO", "USUARIOS", "PROGRAMAS", "PERMISOS",
      "EMPRESA", "TERMINALES", "GENERADOR_CONTROL", "MODELO_FACTURA"
    ],
    VENDEDOR: ["VENTA_RAPIDA", "MESAS", "CONSULTA_PRODUCTOS", "MOV_VENTA", "CLIENTES"],
    CAIXA: ["CAJA", "VENTA_RAPIDA", "CONSULTA_PRODUCTOS", "MOV_VENTA"],
    CONSULTA: ["CONSULTA_PRODUCTOS", "MOV_VENTA", "MOV_COMPRA", "MOV_FACTURA"],
    GERENCIA: ["CONSULTA_PRODUCTOS", "MOV_VENTA", "MOV_COMPRA", "MOV_FACTURA", "CAJA", "PARAMETROS", "MENU_DIGITAL"],
    NOTA: ["MOV_FACTURA"]
  };

  const state = {
    catalogo: [],
    catalogoPromise: null,
    asignaciones: {},
    plantillas: { ...DEFAULT_PLANTILLAS }
  };

  function normalizeRoute(route) {
    const txt = String(route || "").trim();
    if (!txt) return "";

    let path = txt;
    if (!path.startsWith("/")) path = `/${path}`;
    path = path.split("?")[0].split("#")[0].trim();
    if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
    return path;
  }

  function normalizeRole(rawRole) {
    const role = String(rawRole || "").trim();
    if (!role) return "VENDEDOR";

    const roleUpper = role.toUpperCase();
    for (const [canonical, aliases] of Object.entries(ROLE_EQUIV)) {
      if (aliases.map((a) => String(a).toUpperCase()).includes(roleUpper)) {
        return canonical;
      }
    }
    return roleUpper;
  }

  function roleDisplayName(rawRole) {
    const canonical = normalizeRole(rawRole);
    return ROLE_NAME[canonical] || canonical;
  }

  function getRoleOptions() {
    return Object.keys(ROLE_NAME).map((code) => ({ code, label: ROLE_NAME[code] }));
  }

  function normalizeProgramRow(row) {
    const item = { ...row };
    item.id = Number(item.id) || 0;
    item.codigo = String(item.codigo || "").trim().toUpperCase();
    item.nombre = String(item.nombre || "").trim();
    item.ruta = normalizeRoute(item.ruta);
    item.zona = String(item.zona || "operativo").toLowerCase() === "admin" ? "admin" : "operativo";
    item.categoria = String(item.categoria || "General").trim();
    item.icono = String(item.icono || "fa-circle").trim();
    item.visible_home = Boolean(item.visible_home);
    item.visible_admin = Boolean(item.visible_admin);
    item.activo = item.activo !== false;
    item.orden_menu = Number(item.orden_menu) || 0;
    return item;
  }

  async function fetchJSON(url, options = {}) {
    const res = await fetch(url, {
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      },
      ...options
    });

    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      throw new Error(payload?.error || `HTTP ${res.status}`);
    }
    return res.json().catch(() => null);
  }

  async function ensureCatalog(force = false) {
    if (!force && state.catalogo.length) return state.catalogo;
    if (!force && state.catalogoPromise) return state.catalogoPromise;

    state.catalogoPromise = fetchJSON(`${API_BASE}/catalogo`)
      .then((rows) => {
        state.catalogo = (Array.isArray(rows) ? rows : []).map(normalizeProgramRow);
        return state.catalogo;
      })
      .finally(() => {
        state.catalogoPromise = null;
      });

    return state.catalogoPromise;
  }

  function getTemplateCodesByRole(role) {
    const canonical = normalizeRole(role);
    const tpl = state.plantillas[canonical];

    const catalog = state.catalogo.filter((item) => item.activo);
    if (tpl === "*") {
      return catalog.map((item) => item.codigo);
    }

    const codes = Array.isArray(tpl) ? tpl : [];
    const validCodes = new Set(catalog.map((item) => item.codigo));
    return codes.filter((code) => validCodes.has(String(code || "").toUpperCase()));
  }

  function normalizeAssignment(payload, userId) {
    if (!payload) return null;

    const codes = Array.isArray(payload.codes)
      ? Array.from(new Set(payload.codes.map((c) => String(c || "").trim().toUpperCase()).filter(Boolean)))
      : [];

    return {
      user_id: Number(userId || payload.user_id || 0),
      manual: payload.manual !== false,
      role: normalizeRole(payload.role),
      codes,
      updated_at: payload.updated_at || null
    };
  }

  async function loadUserAssignment(userId, force = false) {
    const key = String(userId || "");
    if (!key) return null;
    if (!force && state.asignaciones[key]) return state.asignaciones[key];

    const data = await fetchJSON(`${API_BASE}/asignaciones/${encodeURIComponent(key)}`);
    const normalized = normalizeAssignment(data, key);
    state.asignaciones[key] = normalized;
    return normalized;
  }

  async function preloadUserAssignments(userIds) {
    const ids = Array.from(new Set((Array.isArray(userIds) ? userIds : []).map((id) => Number(id)).filter((id) => id > 0)));
    if (!ids.length) return {};

    const map = await fetchJSON(`${API_BASE}/asignaciones/lote`, {
      method: "POST",
      body: JSON.stringify({ usuarioIds: ids })
    });

    const data = map && typeof map === "object" ? map : {};
    for (const [userId, payload] of Object.entries(data)) {
      state.asignaciones[String(userId)] = normalizeAssignment(payload, userId);
    }
    return data;
  }

  async function setUserAssignment(userId, payload) {
    const key = String(userId || "");
    if (!key) throw new Error("usuarioId requerido");

    const data = await fetchJSON(`${API_BASE}/asignaciones/${encodeURIComponent(key)}`, {
      method: "POST",
      body: JSON.stringify({
        manual: payload?.manual !== false,
        role: normalizeRole(payload?.role),
        codes: Array.isArray(payload?.codes) ? payload.codes : []
      })
    });

    const normalized = normalizeAssignment(data, key);
    state.asignaciones[key] = normalized;
    return normalized;
  }

  async function clearUserAssignment(userId) {
    const key = String(userId || "");
    if (!key) throw new Error("usuarioId requerido");
    await fetchJSON(`${API_BASE}/asignaciones/${encodeURIComponent(key)}`, { method: "DELETE" });
    delete state.asignaciones[key];
  }

  function getUserAssignment(userId) {
    const key = String(userId || "");
    return state.asignaciones[key] || null;
  }

  function resolveUserCodes(user) {
    const role = normalizeRole(user?.rol);
    const activeCodes = new Set(state.catalogo.filter((p) => p.activo).map((p) => p.codigo));
    const userId = user?.id;
    const assignment = userId ? getUserAssignment(userId) : null;

    // Si fue editado manualmente, prevalece sobre plantilla y sobre SUPER/SIS.
    if (assignment?.manual) {
      return (assignment.codes || []).filter((code) => activeCodes.has(String(code || "").toUpperCase()));
    }

    if (role === "SUPER" || role === "SIS") {
      return [...activeCodes];
    }

    return getTemplateCodesByRole(role);
  }

  function resolveUserPrograms(user, options = {}) {
    const zona = options?.zona ? String(options.zona).toLowerCase() : null;
    const visibleEn = options?.visibleEn || null;
    const codes = new Set(resolveUserCodes(user));
    let rows = state.catalogo.filter((p) => p.activo && codes.has(p.codigo));

    if (zona) rows = rows.filter((p) => p.zona === zona);
    if (visibleEn === "home") rows = rows.filter((p) => p.visible_home);
    if (visibleEn === "admin") rows = rows.filter((p) => p.visible_admin);

    rows.sort((a, b) => (Number(a.orden_menu) || 0) - (Number(b.orden_menu) || 0));
    return rows;
  }

  function findProgramByRoute(route) {
    const path = normalizeRoute(route);
    if (!path) return null;
    return state.catalogo.find((p) => normalizeRoute(p.ruta) === path) || null;
  }

  function isRouteAllowedForUser(user, route) {
    const role = normalizeRole(user?.rol);
    if (role === "SUPER" || role === "SIS") return true;

    const program = findProgramByRoute(route);
    if (!program) return true;
    if (program.activo === false) return false;

    const codes = new Set(resolveUserCodes(user));
    return codes.has(program.codigo);
  }

  function hasProgramCode(user, code) {
    const codes = new Set(resolveUserCodes(user));
    return codes.has(String(code || "").toUpperCase().trim());
  }

  async function upsertProgram(programa) {
    const saved = await fetchJSON(`${API_BASE}/catalogo`, {
      method: "POST",
      body: JSON.stringify(programa || {})
    });
    await ensureCatalog(true);
    return normalizeProgramRow(saved || {});
  }

  async function removeProgram(programId) {
    await fetchJSON(`${API_BASE}/catalogo/${encodeURIComponent(programId)}`, {
      method: "DELETE"
    });
    await ensureCatalog(true);
    return state.catalogo;
  }

  function getCatalog() {
    return state.catalogo.slice();
  }

  function saveTemplates(templates) {
    state.plantillas = {
      ...DEFAULT_PLANTILLAS,
      ...(templates || {})
    };
    return state.plantillas;
  }

  function loadTemplates() {
    return { ...state.plantillas };
  }

  function suggestCodesByRole(role) {
    return getTemplateCodesByRole(role);
  }

  window.SoftSysProgramas = {
    inicializar: ensureCatalog,
    refrescarCatalogo: () => ensureCatalog(true),
    precargarAsignaciones: preloadUserAssignments,
    cargarAsignacionUsuario: loadUserAssignment,

    normalizarRol: normalizeRole,
    obtenerNombreRol: roleDisplayName,
    obtenerOpcionesRol: getRoleOptions,
    normalizarRuta: normalizeRoute,

    obtenerCatalogo: getCatalog,
    guardarCatalogo: () => Promise.reject(new Error("guardarCatalogo no soportado; use guardarPrograma")),
    guardarPrograma: upsertProgram,
    eliminarPrograma: removeProgram,

    obtenerPlantillas: loadTemplates,
    guardarPlantillas: saveTemplates,
    sugerirCodigosPorRol: suggestCodesByRole,

    obtenerAsignacionUsuario: getUserAssignment,
    guardarAsignacionUsuario: setUserAssignment,
    limpiarAsignacionUsuario: clearUserAssignment,

    resolverCodigosUsuario: resolveUserCodes,
    resolverProgramasUsuario: resolveUserPrograms,
    buscarProgramaPorRuta: findProgramByRoute,
    estaRutaHabilitadaParaUsuario: isRouteAllowedForUser,
    usuarioTienePrograma: hasProgramCode
  };
})();
