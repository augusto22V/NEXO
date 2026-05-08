const API_BASE = "/api/permisos";
const MONEDA_BASE_IDS = Object.freeze({
  PYG: 1,
  BRL: 2,
  USD: 3
});

const state = {
  activeScope: "usuario",
  catalogo: {
    usuario: [],
    empresa: [],
    terminal: []
  },
  usuarios: [],
  empresas: [],
  terminales: [],
  tiposPedido: [],
  monedasBase: [],
  selectedEmpresaId: null,
  selectedTerminalId: null
};

const USER_KEYS_FALLBACK = [
  "venta_rapida_ver",
  "venta_rapida_nueva",
  "venta_rapida_cancelar",
  "venta_rapida_imprimir_preparo",
  "venta_rapida_efectivizar",
  "venta_rapida_imprimir_venta",
  "caja_apertura",
  "caja_arqueo",
  "caja_lanzamiento_manual",
  "caja_conferir_cierre",
  "caja_cerrar",
  "caja_imprimir_cierre",
  "caja_consultas",
  "caja_informes"
];

function byId(id) {
  return document.getElementById(id);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function toBool(value, fallback = false) {
  if (value === true || value === false) return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "t", "si", "s", "yes", "y", "on"].includes(normalized)) return true;
    if (["0", "false", "f", "no", "n", "off"].includes(normalized)) return false;
  }
  return fallback;
}

function normalizeMonedaBaseId(value, fallback = MONEDA_BASE_IDS.PYG) {
  const id = Number(value);
  if (id === MONEDA_BASE_IDS.PYG || id === MONEDA_BASE_IDS.BRL || id === MONEDA_BASE_IDS.USD) return id;
  return fallback;
}

function toInt(value, fallback = 0) {
  const n = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(n) ? n : fallback;
}

function valorEstado(v) {
  return v ? '<span class="estado-on">SI</span>' : '<span class="estado-off">NO</span>';
}

function status(msg, type = "") {
  const box = byId("permEstado");
  if (!box) return;
  box.textContent = msg || "";
  box.classList.remove("is-ok", "is-error");
  if (type === "ok") box.classList.add("is-ok");
  if (type === "error") box.classList.add("is-error");
}

function sortFeatures(list = []) {
  return [...list].sort((a, b) => {
    const sa = Number(a?.sort_order) || 0;
    const sb = Number(b?.sort_order) || 0;
    if (sa !== sb) return sa - sb;
    return String(a?.nombre || a?.key || "").localeCompare(String(b?.nombre || b?.key || ""), "es");
  });
}

function getFeatures(scope) {
  return sortFeatures(Array.isArray(state.catalogo?.[scope]) ? state.catalogo[scope] : []);
}

function fallbackCatalogo() {
  const mapNombre = {
    venta_rapida_ver: "VR Ver",
    venta_rapida_nueva: "VR Nueva",
    venta_rapida_cancelar: "VR Cancelar",
    venta_rapida_imprimir_preparo: "VR Preparo",
    venta_rapida_efectivizar: "VR Efectivizar",
    venta_rapida_imprimir_venta: "VR Imprimir",
    caja_apertura: "Caja Abrir",
    caja_arqueo: "Caja Arqueo",
    caja_lanzamiento_manual: "Caja Mov.",
    caja_conferir_cierre: "Caja Conferir",
    caja_cerrar: "Caja Cerrar",
    caja_imprimir_cierre: "Caja Imprimir",
    caja_consultas: "Caja Consultas",
    caja_informes: "Caja Informes",
    controlar_lote: "Controlar lote",
    usar_vencimiento: "Usar vencimiento",
    agrupar_item: "Agrupar item",
    terminal_habilita_venta_rapida: "Terminal habilita VR",
    mostrar_tipo_pedido: "Mostrar tipo pedido"
  };

  state.catalogo.usuario = USER_KEYS_FALLBACK.map((key, idx) => ({
    key,
    nombre: mapNombre[key] || key,
    descripcion: "",
    default_enabled: true,
    sort_order: (idx + 1) * 10,
    scope: "USUARIO"
  }));

  state.catalogo.empresa = [
    {
      key: "controlar_lote",
      nombre: mapNombre.controlar_lote,
      descripcion: "",
      default_enabled: false,
      sort_order: 10,
      scope: "EMPRESA"
    },
    {
      key: "usar_vencimiento",
      nombre: mapNombre.usar_vencimiento,
      descripcion: "",
      default_enabled: false,
      sort_order: 20,
      scope: "EMPRESA"
    },
    {
      key: "agrupar_item",
      nombre: mapNombre.agrupar_item,
      descripcion: "",
      default_enabled: false,
      sort_order: 30,
      scope: "EMPRESA"
    }
  ];

  state.catalogo.terminal = [
    {
      key: "terminal_habilita_venta_rapida",
      nombre: mapNombre.terminal_habilita_venta_rapida,
      descripcion: "",
      default_enabled: true,
      sort_order: 10,
      scope: "TERMINAL"
    },
    {
      key: "mostrar_tipo_pedido",
      nombre: mapNombre.mostrar_tipo_pedido,
      descripcion: "",
      default_enabled: true,
      sort_order: 20,
      scope: "TERMINAL"
    }
  ];
}

function normalizeTiposPedido(data) {
  return (Array.isArray(data) ? data : [])
    .filter((row) => row && row.estado !== false)
    .map((row) => ({
      id: toInt(row.id_tipo_pedido ?? row.id, 0),
      nombre: String(row.nombre || "").trim()
    }))
    .filter((row) => row.id > 0 && row.nombre);
}

async function cargarCatalogo() {
  try {
    const res = await fetch(`${API_BASE}/catalogo`, { credentials: "include" });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data.error || "No se pudo cargar catalogo");
    }

    state.catalogo.usuario = Array.isArray(data.usuario) ? data.usuario : [];
    state.catalogo.empresa = Array.isArray(data.empresa) ? data.empresa : [];
    state.catalogo.terminal = Array.isArray(data.terminal) ? data.terminal : [];
  } catch (_error) {
    fallbackCatalogo();
    status("No se pudo cargar catalogo completo. Se usaron valores base.", "error");
  }
}

function setActiveScope(scope) {
  state.activeScope = scope;

  const tabs = Array.from(document.querySelectorAll("[data-scope-tab]"));
  const panels = Array.from(document.querySelectorAll("[data-scope-panel]"));

  tabs.forEach((tab) => {
    const active = tab.dataset.scopeTab === scope;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", active ? "true" : "false");
  });

  panels.forEach((panel) => {
    const active = panel.dataset.scopePanel === scope;
    panel.classList.toggle("is-active", active);
    panel.hidden = !active;
  });
}

function initTabs() {
  const tabs = Array.from(document.querySelectorAll("[data-scope-tab]"));
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      setActiveScope(tab.dataset.scopeTab);
    });
  });
}

function boolUsuarioPermiso(usuario, key) {
  const nested = usuario?.permisos_venta_rapida?.[key];
  if (typeof nested === "boolean") return nested;
  if (typeof usuario?.[key] === "boolean") return usuario[key];

  const meta = getFeatures("usuario").find((row) => row.key === key);
  if (meta) return Boolean(meta.default_enabled);
  return true;
}

function getUsuarioById(id) {
  return state.usuarios.find((u) => Number(u.id) === Number(id)) || null;
}

function renderUsuarios(lista = []) {
  const tbody = byId("tablaPermisosUsuario");
  if (!tbody) return;

  tbody.innerHTML = "";

  if (!lista.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="23">Sin datos para mostrar</td>
      </tr>
    `;
    return;
  }

  lista.forEach((u) => {
    const checkbox = (key) => {
      return `
        <input
          type="checkbox"
          class="perm-chk perm-user-chk"
          data-user="${u.id}"
          data-key="${key}"
          ${boolUsuarioPermiso(u, key) ? "checked" : ""}
        >
      `;
    };

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${u.id ?? "-"}</td>
      <td>${escapeHtml(u.usuario ?? "-")}</td>
      <td>${escapeHtml(u.nombre ?? "-")}</td>
      <td>${escapeHtml((u.rol || "-").toUpperCase())}</td>
      <td>${escapeHtml(u.modo_factura ?? "-")}</td>
      <td>${escapeHtml(u.modo_impresion ?? "-")}</td>
      <td>${valorEstado(toBool(u.modo_confirmacion, false))}</td>
      <td class="perm-center">${checkbox("venta_rapida_ver")}</td>
      <td class="perm-center">${checkbox("venta_rapida_nueva")}</td>
      <td class="perm-center">${checkbox("venta_rapida_cancelar")}</td>
      <td class="perm-center">${checkbox("venta_rapida_imprimir_preparo")}</td>
      <td class="perm-center">${checkbox("venta_rapida_efectivizar")}</td>
      <td class="perm-center">${checkbox("venta_rapida_imprimir_venta")}</td>
      <td class="perm-center">${checkbox("caja_apertura")}</td>
      <td class="perm-center">${checkbox("caja_arqueo")}</td>
      <td class="perm-center">${checkbox("caja_lanzamiento_manual")}</td>
      <td class="perm-center">${checkbox("caja_conferir_cierre")}</td>
      <td class="perm-center">${checkbox("caja_cerrar")}</td>
      <td class="perm-center">${checkbox("caja_imprimir_cierre")}</td>
      <td class="perm-center">${checkbox("caja_consultas")}</td>
      <td class="perm-center">${checkbox("caja_informes")}</td>
      <td>${valorEstado(Boolean(u.activo))}</td>
      <td><button type="button" class="btn-guardar-vr" data-user="${u.id}">Guardar</button></td>
    `;
    tbody.appendChild(tr);
  });
}

function filtrarUsuarios() {
  const txt = String(byId("filtroPermisosUsuario")?.value || "").trim().toLowerCase();
  if (!txt) {
    renderUsuarios(state.usuarios);
    return;
  }

  const filtrada = state.usuarios.filter((u) => {
    return (
      String(u.usuario || "").toLowerCase().includes(txt) ||
      String(u.nombre || "").toLowerCase().includes(txt) ||
      String(u.rol || "").toLowerCase().includes(txt)
    );
  });

  renderUsuarios(filtrada);
}

async function cargarUsuarios() {
  try {
    const res = await fetch(`${API_BASE}/lista`, { credentials: "include" });
    const data = await res.json().catch(() => []);

    if (!res.ok) {
      throw new Error(data.error || "No se pudo cargar usuarios");
    }

    state.usuarios = Array.isArray(data) ? data : [];
    filtrarUsuarios();
  } catch (_error) {
    state.usuarios = [];
    renderUsuarios([]);
    status("No se pudieron cargar permisos por usuario.", "error");
  }
}

async function guardarPermisosUsuario(usuarioId) {
  const user = getUsuarioById(usuarioId);
  if (!user) return;

  const payload = {};
  for (const key of USER_KEYS_FALLBACK) {
    const chk = document.querySelector(`.perm-user-chk[data-user="${usuarioId}"][data-key="${key}"]`);
    payload[key] = Boolean(chk?.checked);
  }

  const res = await fetch(`${API_BASE}/venta-rapida/${usuarioId}`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || "No se pudo guardar permisos de usuario");
  }

  const updated = {
    ...user,
    permisos_venta_rapida: data.permisos_venta_rapida || payload,
    ...payload
  };

  state.usuarios = state.usuarios.map((u) => (Number(u.id) === Number(usuarioId) ? updated : u));
}

function featureLabel(meta) {
  return meta?.nombre || meta?.key || "-";
}

function featureDescription(meta) {
  return String(meta?.descripcion || "").trim();
}

function getEmpresaById(id) {
  return state.empresas.find((row) => Number(row.id) === Number(id)) || null;
}

function getTerminalById(id) {
  return state.terminales.find((row) => Number(row.id) === Number(id)) || null;
}

function buildMonedaBaseOptions() {
  if (Array.isArray(state.monedasBase) && state.monedasBase.length) {
    return state.monedasBase
      .filter((row) => [MONEDA_BASE_IDS.PYG, MONEDA_BASE_IDS.BRL, MONEDA_BASE_IDS.USD].includes(Number(row?.id)))
      .map((row) => ({
        id: normalizeMonedaBaseId(row.id, MONEDA_BASE_IDS.PYG),
        nombre: String(row?.nombre || "")
      }));
  }

  return [
    { id: MONEDA_BASE_IDS.PYG, nombre: "Guarani" },
    { id: MONEDA_BASE_IDS.BRL, nombre: "Real" },
    { id: MONEDA_BASE_IDS.USD, nombre: "Dolar" }
  ];
}

function fillMonedaBaseSelector() {
  const select = byId("selectEmpresaMonedaBase");
  if (!select) return;

  const options = buildMonedaBaseOptions()
    .map((row) => `<option value="${row.id}">${escapeHtml(`${row.id} - ${row.nombre}`)}</option>`)
    .join("");

  select.innerHTML = options || `
    <option value="${MONEDA_BASE_IDS.PYG}">1 - Guarani</option>
    <option value="${MONEDA_BASE_IDS.BRL}">2 - Real</option>
    <option value="${MONEDA_BASE_IDS.USD}">3 - Dolar</option>
  `;
}

function syncMonedaBaseFromSelectedEmpresa() {
  const select = byId("selectEmpresaMonedaBase");
  if (!select) return;
  const empresa = getEmpresaById(state.selectedEmpresaId);
  const monedaBaseId = normalizeMonedaBaseId(empresa?.moneda_base_id, MONEDA_BASE_IDS.PYG);
  select.value = String(monedaBaseId);
}

function fillEmpresaSelector() {
  const select = byId("selectEmpresaFeature");
  if (!select) return;

  const current = String(state.selectedEmpresaId || "");
  const options = state.empresas
    .map((row) => `<option value="${row.id}">${escapeHtml(row.codigo || "-")} - ${escapeHtml(row.nombre || `Empresa ${row.id}`)}</option>`)
    .join("");

  select.innerHTML = options || `<option value="">Sin empresas</option>`;

  if (!state.empresas.length) {
    state.selectedEmpresaId = null;
    return;
  }

  const hasCurrent = state.empresas.some((row) => String(row.id) === current);
  if (hasCurrent) {
    select.value = current;
    state.selectedEmpresaId = Number(current);
    return;
  }

  state.selectedEmpresaId = Number(state.empresas[0].id);
  select.value = String(state.selectedEmpresaId);
}

function fillTerminalSelector() {
  const select = byId("selectTerminalFeature");
  if (!select) return;

  const current = String(state.selectedTerminalId || "");
  const options = state.terminales
    .map((row) => {
      const label = `${row.empresa_nombre || "Empresa"} / ${row.nombre || `Terminal ${row.id}`} (${row.tipo || "-"})`;
      return `<option value="${row.id}">${escapeHtml(label)}</option>`;
    })
    .join("");

  select.innerHTML = options || `<option value="">Sin terminales</option>`;

  if (!state.terminales.length) {
    state.selectedTerminalId = null;
    return;
  }

  const hasCurrent = state.terminales.some((row) => String(row.id) === current);
  if (hasCurrent) {
    select.value = current;
    state.selectedTerminalId = Number(current);
    return;
  }

  state.selectedTerminalId = Number(state.terminales[0].id);
  select.value = String(state.selectedTerminalId);
}

function buildTerminalTipoPedidoDefaultOptions(selectedId = null) {
  const current = toInt(selectedId, 0);
  const base = ['<option value="">Sin predeterminado</option>'];

  state.tiposPedido.forEach((row) => {
    const selected = row.id === current ? "selected" : "";
    base.push(`<option value="${row.id}" ${selected}>${escapeHtml(row.nombre)}</option>`);
  });

  return base.join("");
}

function terminalTipoPedidoVisibleChecked() {
  const chk = document.querySelector('.feature-chk[data-scope="terminal"][data-key="mostrar_tipo_pedido"]');
  return chk ? chk.checked : true;
}

function syncTerminalTipoPedidoDefaultUI() {
  const select = byId("terminalTipoPedidoDefault");
  const hint = byId("terminalTipoPedidoDefaultHint");
  if (!select) return;

  const enabled = terminalTipoPedidoVisibleChecked();
  select.disabled = !enabled;

  if (hint) {
    hint.textContent = enabled
      ? "Se aplicara automaticamente al crear el pedido en esta terminal."
      : "Desactivado porque esta terminal no muestra tipo de pedido.";
  }
}

function renderSimpleFeatureTable({ scope, targetId, entity, emptyLabel }) {
  const tbody = byId(targetId);
  if (!tbody) return;
  const features = getFeatures(scope);
  tbody.innerHTML = "";

  if (!entity) {
    tbody.innerHTML = `<tr><td colspan="2">${emptyLabel}</td></tr>`;
    return;
  }

  if (!features.length) {
    tbody.innerHTML = `<tr><td colspan="2">No hay funciones configuradas para este alcance.</td></tr>`;
    return;
  }

  const entityFeatures = entity.features || {};

  features.forEach((meta) => {
    const checked = typeof entityFeatures[meta.key] === "boolean"
      ? entityFeatures[meta.key]
      : Boolean(meta.default_enabled);

    const descripcion = featureDescription(meta);

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>
        <div class="perm-feature-name">
          <strong>${escapeHtml(featureLabel(meta))}</strong>
          ${descripcion ? `<small>${escapeHtml(descripcion)}</small>` : ""}
        </div>
      </td>
      <td class="perm-center">
        <input
          type="checkbox"
          class="perm-chk feature-chk"
          data-scope="${scope}"
          data-key="${meta.key}"
          ${checked ? "checked" : ""}
        >
      </td>
    `;
    tbody.appendChild(tr);

    if (scope === "terminal" && meta.key === "mostrar_tipo_pedido") {
      const defaultId = toInt(entity?.tipo_pedido_default_id, 0);
      const extra = document.createElement("tr");
      extra.className = "perm-extra-config-row";
      extra.innerHTML = `
        <td colspan="2">
          <div class="perm-inline-config">
            <label for="terminalTipoPedidoDefault">Tipo de pedido por defecto</label>
            <select id="terminalTipoPedidoDefault">
              ${buildTerminalTipoPedidoDefaultOptions(defaultId)}
            </select>
            <small id="terminalTipoPedidoDefaultHint">Se aplicara automaticamente al crear el pedido en esta terminal.</small>
          </div>
        </td>
      `;
      tbody.appendChild(extra);
    }
  });

  applyFeatureDependencies(scope, targetId);
  if (scope === "terminal") {
    syncTerminalTipoPedidoDefaultUI();
  }
}

function applyFeatureDependencies(scope, targetId) {
  const tbody = byId(targetId);
  if (!tbody) return;

  const features = getFeatures(scope);
  for (const meta of features) {
    const dependsOn = String(meta?.depends_on || "").trim();
    if (!dependsOn) continue;

    const parent = tbody.querySelector(`.feature-chk[data-scope="${scope}"][data-key="${dependsOn}"]`);
    const child = tbody.querySelector(`.feature-chk[data-scope="${scope}"][data-key="${meta.key}"]`);
    if (!parent || !child) continue;

    if (!parent.checked) {
      child.checked = false;
      child.disabled = true;
    } else {
      child.disabled = false;
    }
  }
}

function renderEmpresaFeatures() {
  const empresa = getEmpresaById(state.selectedEmpresaId);
  syncMonedaBaseFromSelectedEmpresa();
  renderSimpleFeatureTable({
    scope: "empresa",
    targetId: "tablaPermisosEmpresaSimple",
    entity: empresa,
    emptyLabel: "Seleccione una empresa para ver sus funciones."
  });
}

function renderTerminalFeatures() {
  const terminal = getTerminalById(state.selectedTerminalId);
  renderSimpleFeatureTable({
    scope: "terminal",
    targetId: "tablaPermisosTerminalSimple",
    entity: terminal,
    emptyLabel: "Seleccione una terminal para ver sus funciones."
  });
}

async function cargarEmpresasSection() {
  try {
    const res = await fetch(`${API_BASE}/empresa-features`, { credentials: "include" });
    const data = await res.json().catch(() => []);
    if (!res.ok) {
      throw new Error(data.error || "No se pudo cargar funciones por empresa");
    }

    state.empresas = Array.isArray(data)
      ? data.map((row) => ({
        ...row,
        moneda_base_id: normalizeMonedaBaseId(row?.moneda_base_id, MONEDA_BASE_IDS.PYG)
      }))
      : [];
    fillEmpresaSelector();
    syncMonedaBaseFromSelectedEmpresa();
    renderEmpresaFeatures();
  } catch (_error) {
    state.empresas = [];
    fillEmpresaSelector();
    renderEmpresaFeatures();
    status("No se pudieron cargar funciones por empresa.", "error");
  }
}

async function cargarTerminalesSection() {
  try {
    const res = await fetch(`${API_BASE}/terminal-features`, { credentials: "include" });
    const data = await res.json().catch(() => []);
    if (!res.ok) {
      throw new Error(data.error || "No se pudo cargar funciones por terminal");
    }

    state.terminales = Array.isArray(data) ? data : [];
    fillTerminalSelector();
    renderTerminalFeatures();
  } catch (_error) {
    state.terminales = [];
    fillTerminalSelector();
    renderTerminalFeatures();
    status("No se pudieron cargar funciones por terminal.", "error");
  }
}

async function cargarTiposPedidoSection() {
  try {
    const res = await fetch("/api/tipo-pedido", { credentials: "include" });
    const data = await res.json().catch(() => []);
    if (!res.ok) {
      throw new Error(data.error || "No se pudo cargar tipos de pedido");
    }

    state.tiposPedido = normalizeTiposPedido(data);
  } catch (_error) {
    state.tiposPedido = [];
    status("No se pudieron cargar tipos de pedido para terminal.", "error");
  }
}

function collectSimplePayload(scope, targetId) {
  const tbody = byId(targetId);
  if (!tbody) return {};

  const payload = {};
  const checks = Array.from(tbody.querySelectorAll(`.feature-chk[data-scope="${scope}"]`));
  checks.forEach((chk) => {
    payload[chk.dataset.key] = Boolean(chk.checked);
  });
  return payload;
}

async function guardarEmpresaFeaturesSeleccionada() {
  const empresaId = Number(state.selectedEmpresaId || 0);
  if (!empresaId) throw new Error("Seleccione una empresa");

  const payload = collectSimplePayload("empresa", "tablaPermisosEmpresaSimple");
  payload.moneda_base_id = normalizeMonedaBaseId(
    byId("selectEmpresaMonedaBase")?.value,
    MONEDA_BASE_IDS.PYG
  );

  const res = await fetch(`${API_BASE}/empresa-features/${empresaId}`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || "No se pudo guardar configuracion de empresa");
  }

  const features = data.features || payload;
  const monedaBaseId = normalizeMonedaBaseId(data.moneda_base_id ?? payload.moneda_base_id, MONEDA_BASE_IDS.PYG);
  state.empresas = state.empresas.map((row) => {
    if (Number(row.id) !== empresaId) return row;
    return {
      ...row,
      moneda_base_id: monedaBaseId,
      features: {
        ...(row.features || {}),
        ...features
      }
    };
  });
}

async function guardarTerminalFeaturesSeleccionada() {
  const terminalId = Number(state.selectedTerminalId || 0);
  if (!terminalId) throw new Error("Seleccione una terminal");

  const payload = collectSimplePayload("terminal", "tablaPermisosTerminalSimple");
  payload.tipo_pedido_default_id = toInt(byId("terminalTipoPedidoDefault")?.value, 0) || null;

  const res = await fetch(`${API_BASE}/terminal-features/${terminalId}`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || "No se pudo guardar configuracion de terminal");
  }

  const features = data.features || payload;
  state.terminales = state.terminales.map((row) => {
    if (Number(row.id) !== terminalId) return row;
    return {
      ...row,
      tipo_pedido_default_id: toInt(data.tipo_pedido_default_id, 0) || null,
      features: {
        ...(row.features || {}),
        ...features
      }
    };
  });
}

function initEventosUsuario() {
  byId("filtroPermisosUsuario")?.addEventListener("input", filtrarUsuarios);
  byId("btnRecargarPermisosUsuario")?.addEventListener("click", async () => {
    await cargarUsuarios();
    status("Permisos por usuario recargados.", "ok");
  });

  byId("tablaPermisosUsuario")?.addEventListener("click", async (event) => {
    const btn = event.target.closest(".btn-guardar-vr");
    if (!btn) return;

    const usuarioId = Number(btn.dataset.user || 0);
    if (!usuarioId) return;

    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Guardando...";
    try {
      await guardarPermisosUsuario(usuarioId);
      btn.textContent = "Guardado";
      status("Permisos de usuario guardados correctamente.", "ok");
      setTimeout(() => {
        btn.textContent = original;
      }, 900);
    } catch (error) {
      btn.textContent = original;
      status(error.message || "No se pudo guardar permisos de usuario.", "error");
    } finally {
      btn.disabled = false;
    }
  });
}

function initEventosEmpresa() {
  byId("selectEmpresaFeature")?.addEventListener("change", (event) => {
    state.selectedEmpresaId = Number(event.target.value || 0) || null;
    syncMonedaBaseFromSelectedEmpresa();
    renderEmpresaFeatures();
  });

  byId("selectEmpresaMonedaBase")?.addEventListener("change", (event) => {
    const empresa = getEmpresaById(state.selectedEmpresaId);
    if (!empresa) return;
    empresa.moneda_base_id = normalizeMonedaBaseId(event.target.value, MONEDA_BASE_IDS.PYG);
  });

  byId("tablaPermisosEmpresaSimple")?.addEventListener("change", (event) => {
    if (!event.target.classList.contains("feature-chk")) return;
    applyFeatureDependencies("empresa", "tablaPermisosEmpresaSimple");
  });

  byId("btnRecargarPermisosEmpresa")?.addEventListener("click", async () => {
    await cargarEmpresasSection();
    status("Funciones por empresa recargadas.", "ok");
  });

  byId("btnGuardarEmpresaFeatures")?.addEventListener("click", async (event) => {
    const btn = event.currentTarget;
    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Guardando...";
    try {
      await guardarEmpresaFeaturesSeleccionada();
      status("Configuracion de empresa guardada correctamente.", "ok");
      btn.textContent = "Guardado";
      setTimeout(() => {
        btn.textContent = original;
      }, 900);
    } catch (error) {
      btn.textContent = original;
      status(error.message || "No se pudo guardar configuracion de empresa.", "error");
    } finally {
      btn.disabled = false;
    }
  });
}

function initEventosTerminal() {
  byId("selectTerminalFeature")?.addEventListener("change", (event) => {
    state.selectedTerminalId = Number(event.target.value || 0) || null;
    renderTerminalFeatures();
  });

  byId("tablaPermisosTerminalSimple")?.addEventListener("change", (event) => {
    if (!event.target.classList.contains("feature-chk")) return;
    applyFeatureDependencies("terminal", "tablaPermisosTerminalSimple");
    syncTerminalTipoPedidoDefaultUI();
  });

  byId("btnRecargarPermisosTerminal")?.addEventListener("click", async () => {
    await cargarTerminalesSection();
    status("Funciones por terminal recargadas.", "ok");
  });

  byId("btnGuardarTerminalFeatures")?.addEventListener("click", async (event) => {
    const btn = event.currentTarget;
    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Guardando...";
    try {
      await guardarTerminalFeaturesSeleccionada();
      status("Configuracion de terminal guardada correctamente.", "ok");
      btn.textContent = "Guardado";
      setTimeout(() => {
        btn.textContent = original;
      }, 900);
    } catch (error) {
      btn.textContent = original;
      status(error.message || "No se pudo guardar configuracion de terminal.", "error");
    } finally {
      btn.disabled = false;
    }
  });
}

async function initPermisos() {
  initTabs();
  initEventosUsuario();
  initEventosEmpresa();
  initEventosTerminal();

  setActiveScope("usuario");

  fillMonedaBaseSelector();
  await cargarMonedasBase();
  fillMonedaBaseSelector();
  await cargarCatalogo();
  await Promise.all([
    cargarUsuarios(),
    cargarEmpresasSection(),
    cargarTerminalesSection(),
    cargarTiposPedidoSection()
  ]);

  renderTerminalFeatures();
}

async function cargarMonedasBase() {
  try {
    const res = await fetch("/api/moneda", { credentials: "include" });
    const data = await res.json().catch(() => []);
    if (!res.ok || !Array.isArray(data)) {
      throw new Error("No se pudieron cargar monedas");
    }

    state.monedasBase = data
      .filter((row) => [MONEDA_BASE_IDS.PYG, MONEDA_BASE_IDS.BRL, MONEDA_BASE_IDS.USD].includes(Number(row?.id)))
      .map((row) => ({
        id: normalizeMonedaBaseId(row.id, MONEDA_BASE_IDS.PYG),
        nombre: String(row?.nombre || "")
      }));
  } catch (_error) {
    state.monedasBase = [
      { id: MONEDA_BASE_IDS.PYG, nombre: "Guarani" },
      { id: MONEDA_BASE_IDS.BRL, nombre: "Real" },
      { id: MONEDA_BASE_IDS.USD, nombre: "Dolar" }
    ];
  }
}

document.addEventListener("DOMContentLoaded", initPermisos);
