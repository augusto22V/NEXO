const pool = require("../db");
const {
  ensureTerminalConfigSchema,
  normalizeTipoPedidoDefaultId
} = require("./terminal_config.service");

const FEATURE_SCOPE = Object.freeze({
  USUARIO: "USUARIO",
  TERMINAL: "TERMINAL",
  EMPRESA: "EMPRESA"
});

const MONEDA_BASE_IDS = Object.freeze({
  PYG: 1,
  BRL: 2,
  USD: 3
});

const USER_FEATURES_META = [
  {
    key: "venta_rapida_ver",
    nombre: "VR Ver",
    descripcion: "Permite abrir y operar Venta Rapida.",
    default_enabled: true,
    sort_order: 10
  },
  {
    key: "venta_rapida_nueva",
    nombre: "VR Nueva",
    descripcion: "Permite crear una nueva venta en Venta Rapida.",
    default_enabled: true,
    sort_order: 20
  },
  {
    key: "venta_rapida_cancelar",
    nombre: "VR Cancelar",
    descripcion: "Permite cancelar una venta en Venta Rapida.",
    default_enabled: true,
    sort_order: 30
  },
  {
    key: "venta_rapida_imprimir_preparo",
    nombre: "VR Imprimir Preparo",
    descripcion: "Permite enviar e imprimir comanda/preparo.",
    default_enabled: true,
    sort_order: 40
  },
  {
    key: "venta_rapida_efectivizar",
    nombre: "VR Efectivizar",
    descripcion: "Permite efectivizar/cobrar una venta.",
    default_enabled: true,
    sort_order: 50
  },
  {
    key: "venta_rapida_imprimir_venta",
    nombre: "VR Imprimir Venta",
    descripcion: "Permite imprimir ticket/venta.",
    default_enabled: true,
    sort_order: 60
  },
  {
    key: "caja_apertura",
    nombre: "Caja Apertura",
    descripcion: "Permite abrir caja en Gestion de Caja.",
    default_enabled: true,
    sort_order: 110
  },
  {
    key: "caja_arqueo",
    nombre: "Caja Arqueo",
    descripcion: "Permite realizar y guardar arqueos parciales de caja.",
    default_enabled: true,
    sort_order: 120
  },
  {
    key: "caja_lanzamiento_manual",
    nombre: "Caja Lanzamiento",
    descripcion: "Permite registrar movimientos manuales de entrada y salida.",
    default_enabled: true,
    sort_order: 130
  },
  {
    key: "caja_conferir_cierre",
    nombre: "Caja Conferir",
    descripcion: "Permite conferir diferencias antes del cierre de caja.",
    default_enabled: true,
    sort_order: 140
  },
  {
    key: "caja_cerrar",
    nombre: "Caja Cerrar",
    descripcion: "Permite ejecutar el cierre final de caja.",
    default_enabled: true,
    sort_order: 150
  },
  {
    key: "caja_imprimir_cierre",
    nombre: "Caja Imprimir",
    descripcion: "Permite imprimir ticket o comprobante de cierre de caja.",
    default_enabled: true,
    sort_order: 160
  },
  {
    key: "caja_consultas",
    nombre: "Caja Consultas",
    descripcion: "Permite consultar historial y estado de caja.",
    default_enabled: true,
    sort_order: 170
  },
  {
    key: "caja_informes",
    nombre: "Caja Informes",
    descripcion: "Permite acceder a informes de caja.",
    default_enabled: true,
    sort_order: 180
  }
];

const EMPRESA_FEATURES_META = [
  {
    key: "controlar_lote",
    nombre: "Controlar lote",
    descripcion: "Habilita control de lote por empresa.",
    default_enabled: false,
    sort_order: 10,
    legacy_column: "controlar_lote"
  },
  {
    key: "usar_vencimiento",
    nombre: "Usar vencimiento",
    descripcion: "Habilita control de fecha de vencimiento por empresa.",
    default_enabled: false,
    sort_order: 20,
    depends_on: "controlar_lote"
  },
  {
    key: "agrupar_item",
    nombre: "Agrupar item",
    descripcion: "Agrupa en una sola linea los productos repetidos en Compra.",
    default_enabled: false,
    sort_order: 30
  }
];

const TERMINAL_FEATURES_META = [
  {
    key: "terminal_habilita_venta_rapida",
    nombre: "Terminal habilita VR",
    descripcion: "Preparado para habilitar/bloquear Venta Rapida por terminal.",
    default_enabled: true,
    sort_order: 10
  },
  {
    key: "mostrar_tipo_pedido",
    nombre: "Mostrar tipo pedido",
    descripcion: "Muestra el selector de tipo de pedido en las pantallas de venta para esta terminal.",
    default_enabled: true,
    sort_order: 20
  }
];

const USER_FEATURE_KEYS = USER_FEATURES_META.map((row) => row.key);
const PERMISOS_VENTA_RAPIDA = USER_FEATURE_KEYS;
const EMPRESA_FEATURE_KEYS = EMPRESA_FEATURES_META.map((row) => row.key);
const TERMINAL_FEATURE_KEYS = TERMINAL_FEATURES_META.map((row) => row.key);

const FEATURE_CATALOG_SEED = [
  ...USER_FEATURES_META.map((row) => ({
    ...row,
    scope: FEATURE_SCOPE.USUARIO
  })),
  ...EMPRESA_FEATURES_META.map((row) => ({
    ...row,
    scope: FEATURE_SCOPE.EMPRESA
  })),
  ...TERMINAL_FEATURES_META.map((row) => ({
    ...row,
    scope: FEATURE_SCOPE.TERMINAL
  }))
];

let schemaPromise = null;

function toId(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

function toBool(value, fallback = false) {
  if (value === true || value === false) return value;
  if (value == null) return fallback;

  const txt = String(value).trim().toLowerCase();
  if (["1", "true", "t", "si", "s", "yes", "y", "on"].includes(txt)) return true;
  if (["0", "false", "f", "no", "n", "off"].includes(txt)) return false;
  return fallback;
}

function normalizeMonedaBaseId(value, fallback = MONEDA_BASE_IDS.PYG) {
  const number = Number(value);
  if (number === MONEDA_BASE_IDS.PYG || number === MONEDA_BASE_IDS.BRL || number === MONEDA_BASE_IDS.USD) {
    return number;
  }
  return fallback;
}

function toScope(value) {
  const txt = String(value || "").trim().toUpperCase();
  if (txt === FEATURE_SCOPE.USUARIO) return FEATURE_SCOPE.USUARIO;
  if (txt === FEATURE_SCOPE.TERMINAL) return FEATURE_SCOPE.TERMINAL;
  if (txt === FEATURE_SCOPE.EMPRESA) return FEATURE_SCOPE.EMPRESA;
  return null;
}

function allowedKeysFromScope(scope) {
  const normalized = toScope(scope);
  if (normalized === FEATURE_SCOPE.USUARIO) return USER_FEATURE_KEYS;
  if (normalized === FEATURE_SCOPE.TERMINAL) return TERMINAL_FEATURE_KEYS;
  if (normalized === FEATURE_SCOPE.EMPRESA) return EMPRESA_FEATURE_KEYS;
  return [];
}

function defaultsFromMeta(list = []) {
  return Object.fromEntries(list.map((row) => [row.key, Boolean(row.default_enabled)]));
}

function pickBooleanPayload(payload, keys = []) {
  const out = {};
  for (const key of keys) {
    if (!(key in (payload || {}))) continue;
    out[key] = toBool(payload[key], false);
  }
  return out;
}

async function ensureCatalogSeedRows() {
  for (const row of FEATURE_CATALOG_SEED) {
    await pool.query(
      `
        INSERT INTO config_feature_catalog
          (
            feature_key,
            scope,
            nombre,
            descripcion,
            default_enabled,
            sort_order,
            active,
            legacy_column,
            depends_on
          )
        VALUES ($1,$2,$3,$4,$5,$6,true,$7,$8)
        ON CONFLICT (feature_key) DO UPDATE
        SET scope = EXCLUDED.scope,
            nombre = EXCLUDED.nombre,
            descripcion = EXCLUDED.descripcion,
            default_enabled = EXCLUDED.default_enabled,
            sort_order = EXCLUDED.sort_order,
            active = true,
            legacy_column = EXCLUDED.legacy_column,
            depends_on = EXCLUDED.depends_on,
            updated_at = NOW()
      `,
      [
        row.key,
        row.scope,
        row.nombre,
        row.descripcion || null,
        Boolean(row.default_enabled),
        Number(row.sort_order) || 0,
        row.legacy_column || null,
        row.depends_on || null
      ]
    );
  }
}

async function seedUsuarioPermisosDefaults() {
  await pool.query(
    `
      INSERT INTO usuario_permiso_accion (usuario_id, permiso, permitido)
      SELECT
        u.id,
        p.permiso,
        TRUE
      FROM usuario u
      CROSS JOIN unnest($1::text[]) AS p(permiso)
      ON CONFLICT (usuario_id, permiso) DO NOTHING
    `,
    [PERMISOS_VENTA_RAPIDA]
  );
}

async function seedEmpresaFeaturesDefaults() {
  for (const feature of EMPRESA_FEATURES_META) {
    if (feature.key === "controlar_lote") {
      await pool.query(
        `
          INSERT INTO empresa_feature_config (empresa_id, feature_key, enabled)
          SELECT
            e.id,
            $1::varchar(80),
            COALESCE(e.controlar_lote, $2::boolean)
          FROM empresa e
          ON CONFLICT (empresa_id, feature_key) DO NOTHING
        `,
        [feature.key, Boolean(feature.default_enabled)]
      );
      continue;
    }

    await pool.query(
      `
        INSERT INTO empresa_feature_config (empresa_id, feature_key, enabled)
        SELECT
          e.id,
          $1::varchar(80),
          $2::boolean
        FROM empresa e
        ON CONFLICT (empresa_id, feature_key) DO NOTHING
      `,
      [feature.key, Boolean(feature.default_enabled)]
    );
  }
}

async function seedTerminalFeaturesDefaults() {
  for (const feature of TERMINAL_FEATURES_META) {
    await pool.query(
      `
        INSERT INTO terminal_feature_config (terminal_id, feature_key, enabled)
        SELECT
          t.id,
          $1,
          $2::boolean
        FROM terminal t
        ON CONFLICT (terminal_id, feature_key) DO NOTHING
      `,
      [feature.key, Boolean(feature.default_enabled)]
    );
  }
}

async function ensurePermisosSchema() {
  if (schemaPromise) return schemaPromise;

  schemaPromise = (async () => {
    await pool.query(`
      ALTER TABLE empresa
      ADD COLUMN IF NOT EXISTS controlar_lote BOOLEAN DEFAULT false
    `);

    await pool.query(`
      UPDATE empresa
      SET controlar_lote = COALESCE(controlar_lote, false)
      WHERE controlar_lote IS NULL
    `);

    await pool.query(`
      ALTER TABLE empresa
      ALTER COLUMN controlar_lote SET DEFAULT false
    `);

    await pool.query(`
      ALTER TABLE empresa
      ADD COLUMN IF NOT EXISTS moneda_base_id INTEGER DEFAULT 1
    `);

    await pool.query(`
      UPDATE empresa
      SET moneda_base_id = 1
      WHERE moneda_base_id IS NULL
         OR moneda_base_id NOT IN (1,2,3)
    `);

    await pool.query(`
      ALTER TABLE empresa
      ALTER COLUMN moneda_base_id SET DEFAULT 1
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS usuario_permiso_accion (
        id BIGSERIAL PRIMARY KEY,
        usuario_id INTEGER NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
        permiso VARCHAR(80) NOT NULL,
        permitido BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_usuario_permiso_accion UNIQUE (usuario_id, permiso)
      )
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_usuario_permiso_usuario
      ON usuario_permiso_accion(usuario_id)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_usuario_permiso_permiso
      ON usuario_permiso_accion(permiso)
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS config_feature_catalog (
        feature_key VARCHAR(80) PRIMARY KEY,
        scope VARCHAR(20) NOT NULL CHECK (scope IN ('USUARIO','TERMINAL','EMPRESA')),
        nombre VARCHAR(120) NOT NULL,
        descripcion TEXT,
        default_enabled BOOLEAN NOT NULL DEFAULT false,
        sort_order INTEGER NOT NULL DEFAULT 0,
        active BOOLEAN NOT NULL DEFAULT true,
        legacy_column VARCHAR(120),
        depends_on VARCHAR(80),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_cfg_feature_scope
      ON config_feature_catalog(scope, sort_order, feature_key)
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS empresa_feature_config (
        id BIGSERIAL PRIMARY KEY,
        empresa_id INTEGER NOT NULL REFERENCES empresa(id) ON DELETE CASCADE,
        feature_key VARCHAR(80) NOT NULL REFERENCES config_feature_catalog(feature_key) ON DELETE CASCADE,
        enabled BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_empresa_feature_config UNIQUE (empresa_id, feature_key)
      )
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_empresa_feature_empresa
      ON empresa_feature_config(empresa_id)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_empresa_feature_key
      ON empresa_feature_config(feature_key)
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS terminal_feature_config (
        id BIGSERIAL PRIMARY KEY,
        terminal_id INTEGER NOT NULL REFERENCES terminal(id) ON DELETE CASCADE,
        feature_key VARCHAR(80) NOT NULL REFERENCES config_feature_catalog(feature_key) ON DELETE CASCADE,
        enabled BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_terminal_feature_config UNIQUE (terminal_id, feature_key)
      )
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_terminal_feature_terminal
      ON terminal_feature_config(terminal_id)
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_terminal_feature_key
      ON terminal_feature_config(feature_key)
    `);

    await ensureCatalogSeedRows();
    await seedUsuarioPermisosDefaults();
    await seedEmpresaFeaturesDefaults();
    await seedTerminalFeaturesDefaults();
  })();

  try {
    await schemaPromise;
  } catch (error) {
    schemaPromise = null;
    throw error;
  }
}

async function getFeatureCatalog(scope = null) {
  await ensurePermisosSchema();

  const normalizedScope = toScope(scope);
  const params = [];
  let where = "WHERE c.active = true";

  if (normalizedScope) {
    params.push(normalizedScope);
    where += ` AND c.scope = $${params.length}`;
  }

  const r = await pool.query(
    `
      SELECT
        c.feature_key,
        c.scope,
        c.nombre,
        c.descripcion,
        c.default_enabled,
        c.sort_order,
        c.legacy_column,
        c.depends_on
      FROM config_feature_catalog c
      ${where}
      ORDER BY c.scope, c.sort_order, c.feature_key
    `,
    params
  );

  return r.rows.map((row) => ({
    key: row.feature_key,
    scope: row.scope,
    nombre: row.nombre,
    descripcion: row.descripcion || "",
    default_enabled: Boolean(row.default_enabled),
    sort_order: Number(row.sort_order) || 0,
    legacy_column: row.legacy_column || null,
    depends_on: row.depends_on || null
  }));
}

async function ensurePermisosUsuario(usuarioId) {
  const uid = toId(usuarioId);
  if (!uid) return;

  await ensurePermisosSchema();
  await pool.query(
    `
      INSERT INTO usuario_permiso_accion (usuario_id, permiso, permitido)
      SELECT
        $1,
        p.permiso,
        TRUE
      FROM unnest($2::text[]) AS p(permiso)
      ON CONFLICT (usuario_id, permiso) DO NOTHING
    `,
    [uid, PERMISOS_VENTA_RAPIDA]
  );
}

function normalizePermisoKey(permiso) {
  const key = String(permiso || "").trim().toLowerCase();
  return PERMISOS_VENTA_RAPIDA.includes(key) ? key : null;
}

async function getPermisosVentaRapida(usuarioId) {
  const uid = toId(usuarioId);
  const defaults = defaultsFromMeta(USER_FEATURES_META);

  if (!uid) return defaults;

  await ensurePermisosUsuario(uid);

  const r = await pool.query(
    `
      SELECT permiso, permitido
      FROM usuario_permiso_accion
      WHERE usuario_id = $1
        AND permiso = ANY($2::text[])
    `,
    [uid, PERMISOS_VENTA_RAPIDA]
  );

  const map = { ...defaults };
  for (const row of r.rows) {
    const key = normalizePermisoKey(row.permiso);
    if (!key) continue;
    map[key] = Boolean(row.permitido);
  }

  return map;
}

async function upsertPermisosVentaRapida(usuarioId, payload = {}) {
  const uid = toId(usuarioId);
  if (!uid) throw new Error("Usuario invalido");

  await ensurePermisosUsuario(uid);

  const picked = pickBooleanPayload(payload, PERMISOS_VENTA_RAPIDA);
  const entries = Object.entries(picked);
  if (!entries.length) return getPermisosVentaRapida(uid);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const [permiso, permitido] of entries) {
      await client.query(
        `
          UPDATE usuario_permiso_accion
          SET permitido = $1,
              updated_at = NOW()
          WHERE usuario_id = $2
            AND permiso = $3
        `,
        [permitido, uid, permiso]
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  return getPermisosVentaRapida(uid);
}

async function getEmpresaFeatures(empresaId) {
  await ensurePermisosSchema();
  const eid = toId(empresaId);
  if (!eid) throw new Error("Empresa invalida");

  const r = await pool.query(
    `
      SELECT
        e.id,
        e.codigo,
        e.nombre,
        e.activa,
        COALESCE(e.moneda_base_id, 1) AS moneda_base_id,
        COALESCE(e.controlar_lote, false) AS controlar_lote_legacy,
        ef.feature_key,
        ef.enabled
      FROM empresa e
      LEFT JOIN empresa_feature_config ef
        ON ef.empresa_id = e.id
       AND ef.feature_key = ANY($2::text[])
      WHERE e.id = $1
      ORDER BY ef.feature_key
    `,
    [eid, EMPRESA_FEATURE_KEYS]
  );

  if (!r.rowCount) throw new Error("Empresa no encontrada");

  const baseRow = r.rows[0];
  const features = defaultsFromMeta(EMPRESA_FEATURES_META);
  features.controlar_lote = Boolean(baseRow.controlar_lote_legacy);

  for (const row of r.rows) {
    if (!row.feature_key) continue;
    if (!EMPRESA_FEATURE_KEYS.includes(row.feature_key)) continue;
    features[row.feature_key] = Boolean(row.enabled);
  }

  return {
    id: Number(baseRow.id),
    codigo: baseRow.codigo || "",
    nombre: baseRow.nombre || "",
    activa: Boolean(baseRow.activa),
    moneda_base_id: normalizeMonedaBaseId(baseRow.moneda_base_id, MONEDA_BASE_IDS.PYG),
    features
  };
}

async function listEmpresaFeatures() {
  await ensurePermisosSchema();

  const r = await pool.query(
    `
      SELECT
        e.id,
        e.codigo,
        e.nombre,
        e.activa,
        COALESCE(e.moneda_base_id, 1) AS moneda_base_id,
        COALESCE(e.controlar_lote, false) AS controlar_lote_legacy,
        ef.feature_key,
        ef.enabled
      FROM empresa e
      LEFT JOIN empresa_feature_config ef
        ON ef.empresa_id = e.id
       AND ef.feature_key = ANY($1::text[])
      WHERE e.activa = true
      ORDER BY e.nombre ASC, e.id ASC, ef.feature_key ASC
    `,
    [EMPRESA_FEATURE_KEYS]
  );

  const map = new Map();

  for (const row of r.rows) {
    const empresaId = Number(row.id);
    if (!map.has(empresaId)) {
      const defaults = defaultsFromMeta(EMPRESA_FEATURES_META);
      defaults.controlar_lote = Boolean(row.controlar_lote_legacy);

      map.set(empresaId, {
        id: empresaId,
        codigo: row.codigo || "",
        nombre: row.nombre || "",
        activa: Boolean(row.activa),
        moneda_base_id: normalizeMonedaBaseId(row.moneda_base_id, MONEDA_BASE_IDS.PYG),
        features: defaults
      });
    }

    if (row.feature_key && EMPRESA_FEATURE_KEYS.includes(row.feature_key)) {
      map.get(empresaId).features[row.feature_key] = Boolean(row.enabled);
    }
  }

  return Array.from(map.values());
}

async function upsertEmpresaFeatures(empresaId, payload = {}) {
  await ensurePermisosSchema();

  const eid = toId(empresaId);
  if (!eid) throw new Error("Empresa invalida");

  const validEmpresa = await pool.query(
    `SELECT id FROM empresa WHERE id = $1 LIMIT 1`,
    [eid]
  );
  if (!validEmpresa.rowCount) throw new Error("Empresa no encontrada");

  const picked = pickBooleanPayload(payload, EMPRESA_FEATURE_KEYS);
  const hasMonedaBaseInPayload = Object.prototype.hasOwnProperty.call(payload || {}, "moneda_base_id");
  const monedaBaseId = hasMonedaBaseInPayload
    ? normalizeMonedaBaseId(payload.moneda_base_id, NaN)
    : null;

  if (hasMonedaBaseInPayload && !Number.isFinite(monedaBaseId)) {
    throw new Error("moneda_base_id invalida");
  }

  if (!Object.keys(picked).length && !hasMonedaBaseInPayload) return getEmpresaFeatures(eid);

  if (picked.controlar_lote === false) {
    picked.usar_vencimiento = false;
  } else if (picked.usar_vencimiento === true && picked.controlar_lote !== true) {
    const current = await getEmpresaFeatures(eid);
    if (!current.features.controlar_lote) {
      throw new Error("No se puede activar vencimiento sin controlar_lote");
    }
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    for (const [featureKey, enabled] of Object.entries(picked)) {
      await client.query(
        `
          INSERT INTO empresa_feature_config (empresa_id, feature_key, enabled)
          VALUES ($1,$2,$3)
          ON CONFLICT (empresa_id, feature_key)
          DO UPDATE SET
            enabled = EXCLUDED.enabled,
            updated_at = NOW()
        `,
        [eid, featureKey, Boolean(enabled)]
      );

      if (featureKey === "controlar_lote") {
        await client.query(
          `
            UPDATE empresa
            SET controlar_lote = $1
            WHERE id = $2
          `,
          [Boolean(enabled), eid]
        );
      }
    }

    if (hasMonedaBaseInPayload) {
      await client.query(
        `
          UPDATE empresa
          SET moneda_base_id = $1
          WHERE id = $2
        `,
        [monedaBaseId, eid]
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  return getEmpresaFeatures(eid);
}

async function getTerminalFeatures(terminalId) {
  await ensurePermisosSchema();
  await ensureTerminalConfigSchema();
  const tid = toId(terminalId);
  if (!tid) throw new Error("Terminal invalida");

  const r = await pool.query(
    `
      SELECT
        t.id,
        t.nombre,
        t.descripcion,
        t.tipo,
        t.activo,
        t.tipo_pedido_default_id,
        t.empresa_id,
        e.nombre AS empresa_nombre,
        tf.feature_key,
        tf.enabled
      FROM terminal t
      JOIN empresa e ON e.id = t.empresa_id
      LEFT JOIN terminal_feature_config tf
        ON tf.terminal_id = t.id
       AND tf.feature_key = ANY($2::text[])
      WHERE t.id = $1
      ORDER BY tf.feature_key
    `,
    [tid, TERMINAL_FEATURE_KEYS]
  );

  if (!r.rowCount) throw new Error("Terminal no encontrada");

  const baseRow = r.rows[0];
  const features = defaultsFromMeta(TERMINAL_FEATURES_META);
  for (const row of r.rows) {
    if (!row.feature_key) continue;
    if (!TERMINAL_FEATURE_KEYS.includes(row.feature_key)) continue;
    features[row.feature_key] = Boolean(row.enabled);
  }

  return {
    id: Number(baseRow.id),
    nombre: baseRow.nombre || "",
    descripcion: baseRow.descripcion || "",
    tipo: baseRow.tipo || "",
    activo: Boolean(baseRow.activo),
    tipo_pedido_default_id: baseRow.tipo_pedido_default_id == null
      ? null
      : Number(baseRow.tipo_pedido_default_id),
    empresa_id: Number(baseRow.empresa_id),
    empresa_nombre: baseRow.empresa_nombre || "",
    features
  };
}

async function listTerminalFeatures(empresaId = null) {
  await ensurePermisosSchema();
  await ensureTerminalConfigSchema();

  const eid = toId(empresaId);
  const params = [TERMINAL_FEATURE_KEYS];
  let where = "";
  if (eid) {
    params.push(eid);
    where = `WHERE t.empresa_id = $${params.length}`;
  }

  const r = await pool.query(
    `
      SELECT
        t.id,
        t.nombre,
        t.descripcion,
        t.tipo,
        t.activo,
        t.tipo_pedido_default_id,
        t.empresa_id,
        e.nombre AS empresa_nombre,
        tf.feature_key,
        tf.enabled
      FROM terminal t
      JOIN empresa e ON e.id = t.empresa_id
      LEFT JOIN terminal_feature_config tf
        ON tf.terminal_id = t.id
       AND tf.feature_key = ANY($1::text[])
      ${where}
      ORDER BY e.nombre ASC, t.nombre ASC, t.id ASC, tf.feature_key ASC
    `,
    params
  );

  const map = new Map();
  for (const row of r.rows) {
    const tid = Number(row.id);
    if (!map.has(tid)) {
      map.set(tid, {
        id: tid,
        nombre: row.nombre || "",
        descripcion: row.descripcion || "",
        tipo: row.tipo || "",
        activo: Boolean(row.activo),
        tipo_pedido_default_id: row.tipo_pedido_default_id == null
          ? null
          : Number(row.tipo_pedido_default_id),
        empresa_id: Number(row.empresa_id),
        empresa_nombre: row.empresa_nombre || "",
        features: defaultsFromMeta(TERMINAL_FEATURES_META)
      });
    }

    if (row.feature_key && TERMINAL_FEATURE_KEYS.includes(row.feature_key)) {
      map.get(tid).features[row.feature_key] = Boolean(row.enabled);
    }
  }

  return Array.from(map.values());
}

async function upsertTerminalFeatures(terminalId, payload = {}) {
  await ensurePermisosSchema();
  await ensureTerminalConfigSchema();

  const tid = toId(terminalId);
  if (!tid) throw new Error("Terminal invalida");

  const exists = await pool.query(
    `SELECT id FROM terminal WHERE id = $1 LIMIT 1`,
    [tid]
  );
  if (!exists.rowCount) throw new Error("Terminal no encontrada");

  const picked = pickBooleanPayload(payload, TERMINAL_FEATURE_KEYS);
  const hasTipoPedidoDefault = Object.prototype.hasOwnProperty.call(payload || {}, "tipo_pedido_default_id");
  const requestedTipoPedidoDefaultId = hasTipoPedidoDefault
    ? normalizeTipoPedidoDefaultId(payload?.tipo_pedido_default_id)
    : undefined;

  if (!Object.keys(picked).length && !hasTipoPedidoDefault) return getTerminalFeatures(tid);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    if (hasTipoPedidoDefault) {
      if (requestedTipoPedidoDefaultId) {
        const tipoPedido = await client.query(
          `
            SELECT id_tipo_pedido
            FROM tipo_pedido
            WHERE id_tipo_pedido = $1
            LIMIT 1
          `,
          [requestedTipoPedidoDefaultId]
        );

        if (!tipoPedido.rowCount) {
          throw new Error("Tipo de pedido por defecto invalido");
        }
      }

      await client.query(
        `
          UPDATE terminal
          SET tipo_pedido_default_id = $1
          WHERE id = $2
        `,
        [requestedTipoPedidoDefaultId || null, tid]
      );
    }

    for (const [featureKey, enabled] of Object.entries(picked)) {
      await client.query(
        `
          INSERT INTO terminal_feature_config (terminal_id, feature_key, enabled)
          VALUES ($1,$2,$3)
          ON CONFLICT (terminal_id, feature_key)
          DO UPDATE SET
            enabled = EXCLUDED.enabled,
            updated_at = NOW()
        `,
        [tid, featureKey, Boolean(enabled)]
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  return getTerminalFeatures(tid);
}

async function hasPermisoVentaRapida(usuarioId, permiso) {
  const key = normalizePermisoKey(permiso);
  if (!key) return false;
  const map = await getPermisosVentaRapida(usuarioId);
  return Boolean(map[key]);
}

async function hasPermisoUsuarioAccion(usuarioId, permiso) {
  return hasPermisoVentaRapida(usuarioId, permiso);
}

function getUsuarioIdFromReq(req) {
  return toId(req?.usuario?.id || req?.user?.id);
}

function requirePermisoVentaRapida(permiso) {
  return async function permisoMiddleware(req, res, next) {
    try {
      const usuarioId = getUsuarioIdFromReq(req);
      if (!usuarioId) {
        return res.status(401).json({ error: "No autorizado" });
      }

      const ok = await hasPermisoVentaRapida(usuarioId, permiso);
      if (!ok) {
        return res.status(403).json({
          error: "Sin permiso para esta accion",
          permiso
        });
      }

      next();
    } catch (error) {
      console.error("Error validando permiso:", error);
      res.status(500).json({ error: "No se pudo validar permiso" });
    }
  };
}

function requirePermisoUsuarioAccion(permiso) {
  return requirePermisoVentaRapida(permiso);
}

module.exports = {
  FEATURE_SCOPE,
  PERMISOS_VENTA_RAPIDA,
  EMPRESA_FEATURE_KEYS,
  TERMINAL_FEATURE_KEYS,
  ensurePermisosSchema,
  ensurePermisosUsuario,
  getFeatureCatalog,
  getPermisosVentaRapida,
  upsertPermisosVentaRapida,
  getEmpresaFeatures,
  listEmpresaFeatures,
  upsertEmpresaFeatures,
  getTerminalFeatures,
  listTerminalFeatures,
  upsertTerminalFeatures,
  USER_FEATURE_KEYS,
  hasPermisoVentaRapida,
  hasPermisoUsuarioAccion,
  requirePermisoVentaRapida,
  requirePermisoUsuarioAccion,
  getUsuarioIdFromReq,
  allowedKeysFromScope
};
