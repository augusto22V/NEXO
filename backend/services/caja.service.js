const db = require("../db");

let schemaPromise = null;

function normalizeHistorialOperacion(value) {
  const txt = String(value || "").trim().toUpperCase();
  if (txt === "DEBITO" || txt === "DÉBITO") return "DEBITO";
  if (txt === "REFERENCIA" || txt === "REF") return "REFERENCIA";
  return "CREDITO";
}

function normalizeHistorialMoneda(value) {
  const txt = String(value || "").trim().toUpperCase();
  if (!txt) return "GS";
  if (txt === "GS" || txt === "PYG" || txt === "GUARANI" || txt === "₲") return "GS";
  if (txt === "R$" || txt === "BRL" || txt === "REAL") return "R$";
  if (txt === "US$" || txt === "USD" || txt === "DOLAR" || txt === "DÓLAR") return "US$";
  return txt.slice(0, 10);
}

function normalizeHistorialOrigen(value) {
  const txt = String(value || "").trim().toUpperCase();
  return (txt || "SISTEMA").slice(0, 30);
}

function truncateText(value, max) {
  if (value == null) return null;
  const txt = String(value).trim();
  if (!txt) return null;
  return txt.slice(0, max);
}

async function ensureCajaSchema() {
  if (schemaPromise) return schemaPromise;

  schemaPromise = (async () => {
    await db.query(`ALTER TABLE caja ADD COLUMN IF NOT EXISTS terminal_id BIGINT`);
    await db.query(`ALTER TABLE caja ADD COLUMN IF NOT EXISTS monto_inicial_real NUMERIC(12,2) DEFAULT 0`);
    await db.query(`ALTER TABLE caja ADD COLUMN IF NOT EXISTS monto_inicial_dolar NUMERIC(12,2) DEFAULT 0`);
    await db.query(`ALTER TABLE caja ADD COLUMN IF NOT EXISTS monto_final_real  NUMERIC(12,2) DEFAULT 0`);
    await db.query(`ALTER TABLE caja ADD COLUMN IF NOT EXISTS monto_final_dolar NUMERIC(12,2) DEFAULT 0`);
    await db.query(`ALTER TABLE caja_movimiento ADD COLUMN IF NOT EXISTS usuario_id BIGINT`);
    await db.query(`ALTER TABLE caja_movimiento ADD COLUMN IF NOT EXISTS caja_sesion_id BIGINT`);
    await db.query(`ALTER TABLE caja_movimiento ADD COLUMN IF NOT EXISTS fecha TIMESTAMPTZ`);
    await db.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'caja_movimiento'
            AND column_name = 'creado_en'
        ) THEN
          UPDATE caja_movimiento
          SET fecha = creado_en
          WHERE fecha IS NULL;
        END IF;
      END $$;
    `);
    await db.query(`ALTER TABLE caja_movimiento ALTER COLUMN fecha SET DEFAULT NOW()`);
    await db.query(`ALTER TABLE caja_sesiones ADD COLUMN IF NOT EXISTS terminal_id BIGINT`);
    await db.query(`ALTER TABLE caja_sesiones ADD COLUMN IF NOT EXISTS usuario_cierre BIGINT`);
    await db.query(`ALTER TABLE caja_sesiones ADD COLUMN IF NOT EXISTS fecha_apertura TIMESTAMPTZ`);
    await db.query(`ALTER TABLE caja_sesiones ADD COLUMN IF NOT EXISTS fecha_cierre TIMESTAMPTZ`);
    await db.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'caja_sesiones'
            AND column_name = 'fecha_inicio'
        ) THEN
          UPDATE caja_sesiones
          SET fecha_apertura = fecha_inicio
          WHERE fecha_apertura IS NULL;
        END IF;

        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'caja_sesiones'
            AND column_name = 'fecha_fin'
        ) THEN
          UPDATE caja_sesiones
          SET fecha_cierre = fecha_fin
          WHERE fecha_cierre IS NULL;
        END IF;
      END $$;
    `);
    await db.query(`ALTER TABLE caja_sesiones ADD COLUMN IF NOT EXISTS monto_apertura NUMERIC(12,2) DEFAULT 0`);
    await db.query(`ALTER TABLE caja_sesiones ADD COLUMN IF NOT EXISTS monto_apertura_real NUMERIC(12,2) DEFAULT 0`);
    await db.query(`ALTER TABLE caja_sesiones ADD COLUMN IF NOT EXISTS monto_apertura_dolar NUMERIC(12,2) DEFAULT 0`);

    await db.query(`
      CREATE TABLE IF NOT EXISTS caja_movimiento_tipo (
        id BIGSERIAL PRIMARY KEY,
        nombre VARCHAR(120) NOT NULL,
        naturaleza VARCHAR(10) NOT NULL CHECK (naturaleza IN ('ENTRADA', 'SALIDA')),
        activo BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS caja_movimiento_manual (
        id BIGSERIAL PRIMARY KEY,
        caja_id BIGINT NOT NULL REFERENCES caja(id) ON DELETE CASCADE,
        caja_sesion_id BIGINT REFERENCES caja_sesiones(id) ON DELETE SET NULL,
        terminal_id BIGINT REFERENCES terminal(id) ON DELETE SET NULL,
        usuario_id BIGINT REFERENCES usuario(id) ON DELETE SET NULL,
        tipo_movimiento_id BIGINT REFERENCES caja_movimiento_tipo(id) ON DELETE SET NULL,
        tipo_movimiento_nombre VARCHAR(120) NOT NULL,
        naturaleza VARCHAR(10) NOT NULL CHECK (naturaleza IN ('ENTRADA', 'SALIDA')),
        moneda_id INTEGER NOT NULL CHECK (moneda_id IN (1,2,3)),
        monto NUMERIC(18,6) NOT NULL DEFAULT 0,
        monto_gs NUMERIC(18,6) NOT NULL DEFAULT 0,
        cotizacion_brl NUMERIC(18,6),
        cotizacion_usd NUMERIC(18,6),
        observacion TEXT,
        documento VARCHAR(120),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS caja_arqueo (
        id BIGSERIAL PRIMARY KEY,
        caja_id BIGINT NOT NULL REFERENCES caja(id) ON DELETE CASCADE,
        caja_sesion_id BIGINT REFERENCES caja_sesiones(id) ON DELETE SET NULL,
        terminal_id BIGINT REFERENCES terminal(id) ON DELETE SET NULL,
        usuario_id BIGINT REFERENCES usuario(id) ON DELETE SET NULL,
        contado_gs NUMERIC(18,6) NOT NULL DEFAULT 0,
        contado_brl NUMERIC(18,6) NOT NULL DEFAULT 0,
        contado_usd NUMERIC(18,6) NOT NULL DEFAULT 0,
        contado_tarjeta NUMERIC(18,6) NOT NULL DEFAULT 0,
        contado_transferencia NUMERIC(18,6) NOT NULL DEFAULT 0,
        contado_pix NUMERIC(18,6) NOT NULL DEFAULT 0,
        esperado_gs NUMERIC(18,6) NOT NULL DEFAULT 0,
        esperado_brl NUMERIC(18,6) NOT NULL DEFAULT 0,
        esperado_usd NUMERIC(18,6) NOT NULL DEFAULT 0,
        esperado_tarjeta NUMERIC(18,6) NOT NULL DEFAULT 0,
        esperado_transferencia NUMERIC(18,6) NOT NULL DEFAULT 0,
        esperado_pix NUMERIC(18,6) NOT NULL DEFAULT 0,
        diferencia_gs NUMERIC(18,6) NOT NULL DEFAULT 0,
        diferencia_brl NUMERIC(18,6) NOT NULL DEFAULT 0,
        diferencia_usd NUMERIC(18,6) NOT NULL DEFAULT 0,
        diferencia_tarjeta NUMERIC(18,6) NOT NULL DEFAULT 0,
        diferencia_transferencia NUMERIC(18,6) NOT NULL DEFAULT 0,
        diferencia_pix NUMERIC(18,6) NOT NULL DEFAULT 0,
        observacion TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS caja_historial (
        id BIGSERIAL PRIMARY KEY,
        fecha TIMESTAMP DEFAULT now(),
        caja_id BIGINT,
        sesion_id BIGINT,
        terminal_id BIGINT,
        empresa_id BIGINT,
        usuario_id BIGINT,
        origen VARCHAR(30),
        operacion VARCHAR(10),
        moneda VARCHAR(10),
        monto NUMERIC(14,2) DEFAULT 0,
        tipo_id BIGINT,
        tipo_nombre VARCHAR(120),
        documento VARCHAR(120),
        referencia_id BIGINT,
        observacion TEXT
      )
    `);

    await db.query(`ALTER TABLE caja_historial ADD COLUMN IF NOT EXISTS fecha TIMESTAMP DEFAULT now()`);
    await db.query(`ALTER TABLE caja_historial ADD COLUMN IF NOT EXISTS caja_id BIGINT`);
    await db.query(`ALTER TABLE caja_historial ADD COLUMN IF NOT EXISTS sesion_id BIGINT`);
    await db.query(`ALTER TABLE caja_historial ADD COLUMN IF NOT EXISTS terminal_id BIGINT`);
    await db.query(`ALTER TABLE caja_historial ADD COLUMN IF NOT EXISTS empresa_id BIGINT`);
    await db.query(`ALTER TABLE caja_historial ADD COLUMN IF NOT EXISTS usuario_id BIGINT`);
    await db.query(`ALTER TABLE caja_historial ADD COLUMN IF NOT EXISTS origen VARCHAR(30)`);
    await db.query(`ALTER TABLE caja_historial ADD COLUMN IF NOT EXISTS operacion VARCHAR(10)`);
    await db.query(`ALTER TABLE caja_historial ADD COLUMN IF NOT EXISTS moneda VARCHAR(10)`);
    await db.query(`ALTER TABLE caja_historial ADD COLUMN IF NOT EXISTS monto NUMERIC(14,2) DEFAULT 0`);
    await db.query(`ALTER TABLE caja_historial ADD COLUMN IF NOT EXISTS tipo_id BIGINT`);
    await db.query(`ALTER TABLE caja_historial ADD COLUMN IF NOT EXISTS tipo_nombre VARCHAR(120)`);
    await db.query(`ALTER TABLE caja_historial ADD COLUMN IF NOT EXISTS documento VARCHAR(120)`);
    await db.query(`ALTER TABLE caja_historial ADD COLUMN IF NOT EXISTS referencia_id BIGINT`);
    await db.query(`ALTER TABLE caja_historial ADD COLUMN IF NOT EXISTS observacion TEXT`);

    await db.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'fk_caja_terminal'
        ) THEN
          ALTER TABLE caja
          ADD CONSTRAINT fk_caja_terminal
          FOREIGN KEY (terminal_id) REFERENCES terminal(id) ON DELETE SET NULL;
        END IF;
      END $$;
    `);

    await db.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'fk_caja_movimiento_usuario'
        ) THEN
          ALTER TABLE caja_movimiento
          ADD CONSTRAINT fk_caja_movimiento_usuario
          FOREIGN KEY (usuario_id) REFERENCES usuario(id) ON DELETE SET NULL;
        END IF;
      END $$;
    `);

    await db.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'fk_caja_movimiento_sesion'
        ) THEN
          ALTER TABLE caja_movimiento
          ADD CONSTRAINT fk_caja_movimiento_sesion
          FOREIGN KEY (caja_sesion_id) REFERENCES caja_sesiones(id) ON DELETE SET NULL;
        END IF;
      END $$;
    `);

    await db.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'fk_caja_sesiones_terminal'
        ) THEN
          ALTER TABLE caja_sesiones
          ADD CONSTRAINT fk_caja_sesiones_terminal
          FOREIGN KEY (terminal_id) REFERENCES terminal(id) ON DELETE SET NULL;
        END IF;
      END $$;
    `);

    await db.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'fk_caja_sesiones_usuario_cierre'
        ) THEN
          ALTER TABLE caja_sesiones
          ADD CONSTRAINT fk_caja_sesiones_usuario_cierre
          FOREIGN KEY (usuario_cierre) REFERENCES usuario(id) ON DELETE SET NULL;
        END IF;
      END $$;
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_caja_terminal_estado_fecha
      ON caja(terminal_id, estado, fecha_apertura DESC)
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_caja_movimiento_usuario_fecha
      ON caja_movimiento(usuario_id, fecha DESC)
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_caja_movimiento_sesion
      ON caja_movimiento(caja_sesion_id)
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_caja_sesiones_terminal_estado_fecha
      ON caja_sesiones(terminal_id, estado, fecha_apertura DESC)
    `);

    await db.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_caja_movimiento_tipo_nombre_naturaleza
      ON caja_movimiento_tipo(nombre, naturaleza)
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_caja_mov_manual_caja_fecha
      ON caja_movimiento_manual(caja_id, created_at DESC)
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_caja_mov_manual_terminal_fecha
      ON caja_movimiento_manual(terminal_id, created_at DESC)
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_caja_arqueo_caja_fecha
      ON caja_arqueo(caja_id, created_at DESC)
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_caja_historial_fecha
      ON caja_historial(fecha DESC, id DESC)
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_caja_historial_empresa_fecha
      ON caja_historial(empresa_id, fecha DESC)
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_caja_historial_terminal_fecha
      ON caja_historial(terminal_id, fecha DESC)
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_caja_historial_caja_fecha
      ON caja_historial(caja_id, fecha DESC)
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_caja_historial_usuario_fecha
      ON caja_historial(usuario_id, fecha DESC)
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_caja_historial_origen_operacion_moneda
      ON caja_historial(origen, operacion, moneda)
    `);

    await db.query(`
      INSERT INTO caja_movimiento_tipo (nombre, naturaleza, activo)
      VALUES
        ('Ajuste de ingreso', 'ENTRADA', true),
        ('Ajuste de egreso', 'SALIDA', true)
      ON CONFLICT (nombre, naturaleza) DO UPDATE
      SET activo = true,
          updated_at = NOW()
    `);

    await db.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_caja_terminal_abierta
      ON caja(terminal_id)
      WHERE terminal_id IS NOT NULL AND UPPER(estado) = 'ABIERTA'
    `);
  })();

  try {
    await schemaPromise;
  } finally {
    schemaPromise = null;
  }
}

async function registrarHistorialCaja(client, payload) {
  const fn = client && typeof client.query === "function" ? client : db;
  const input = Array.isArray(payload) ? payload : [payload];
  const rows = [];

  for (const item of input) {
    if (!item || item.caja_id == null) continue;
    const monto = Number(item.monto ?? 0);
    if (!Number.isFinite(monto)) continue;

    rows.push({
      fecha: item.fecha ? new Date(item.fecha) : new Date(),
      caja_id: Number(item.caja_id) || null,
      sesion_id: item.sesion_id != null ? Number(item.sesion_id) || null : null,
      terminal_id: item.terminal_id != null ? Number(item.terminal_id) || null : null,
      empresa_id: item.empresa_id != null ? Number(item.empresa_id) || null : null,
      usuario_id: item.usuario_id != null ? Number(item.usuario_id) || null : null,
      origen: normalizeHistorialOrigen(item.origen),
      operacion: normalizeHistorialOperacion(item.operacion),
      moneda: normalizeHistorialMoneda(item.moneda),
      monto,
      tipo_id: item.tipo_id != null ? Number(item.tipo_id) || null : null,
      tipo_nombre: truncateText(item.tipo_nombre, 120),
      documento: truncateText(item.documento, 120),
      referencia_id: item.referencia_id != null ? Number(item.referencia_id) || null : null,
      observacion: truncateText(item.observacion, 4000)
    });
  }

  if (!rows.length) return [];

  const values = [];
  const placeholders = rows.map((row, index) => {
    const base = index * 15;
    values.push(
      row.fecha,
      row.caja_id,
      row.sesion_id,
      row.terminal_id,
      row.empresa_id,
      row.usuario_id,
      row.origen,
      row.operacion,
      row.moneda,
      row.monto,
      row.tipo_id,
      row.tipo_nombre,
      row.documento,
      row.referencia_id,
      row.observacion
    );

    return `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8},$${base + 9},$${base + 10},$${base + 11},$${base + 12},$${base + 13},$${base + 14},$${base + 15})`;
  });

  const insert = await fn.query(
    `
      INSERT INTO caja_historial (
        fecha,
        caja_id,
        sesion_id,
        terminal_id,
        empresa_id,
        usuario_id,
        origen,
        operacion,
        moneda,
        monto,
        tipo_id,
        tipo_nombre,
        documento,
        referencia_id,
        observacion
      )
      VALUES ${placeholders.join(",")}
      RETURNING *
    `,
    values
  );

  return insert.rows;
}

module.exports = {
  ensureCajaSchema,
  registrarHistorialCaja
};
