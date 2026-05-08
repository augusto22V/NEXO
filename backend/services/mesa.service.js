const db = require("../db");

const { ensureAuditoriaTriggerForTable } = require("./auditoria.service");
const ESTADO_LIBRE = "LIBRE";
const ESTADO_OCUPADA = "OCUPADA";
const ESTADOS_VENTA_CERRADA = new Set(["EFECTIVADO", "CANCELADO"]);
const ESTADOS_MESA_VALIDOS = new Set(["LIBRE", "OCUPADA", "RESERVADA", "INACTIVA"]);
let schemaPromise = null;

function toId(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
}

function toCoordinate(value, fallback = 40) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  if (n < 0) return 0;
  if (n > 10000) return 10000;
  return Math.round(n * 100) / 100;
}

function toBooleanFlag(value, fallback = true) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;

  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "t", "si", "yes", "y"].includes(normalized)) return true;
  if (["0", "false", "f", "no", "n"].includes(normalized)) return false;

  return fallback;
}

function normalizeMesaNumero(value) {
  return String(value ?? "").trim();
}

function normalizeMesaEstado(value, fallback = ESTADO_LIBRE) {
  const normalized = String(value ?? "").trim().toUpperCase();
  return ESTADOS_MESA_VALIDOS.has(normalized) ? normalized : fallback;
}

function isVentaActiva(estado) {
  const normalized = String(estado ?? "").trim().toUpperCase();
  return normalized.length > 0 && !ESTADOS_VENTA_CERRADA.has(normalized);
}

function normalizeScope(scope = {}) {
  return {
    empresa_id: toId(scope.empresa_id ?? scope.empresaId),
    terminal_id: toId(scope.terminal_id ?? scope.terminalId)
  };
}

function hasScope(scope = {}) {
  return toId(scope.empresa_id) > 0 && toId(scope.terminal_id) > 0;
}

function resolveScope(scope = {}, fallback = {}) {
  const normalized = normalizeScope(scope);
  if (hasScope(normalized)) return normalized;

  const fallbackScope = normalizeScope(fallback);
  if (hasScope(fallbackScope)) return fallbackScope;

  return {
    empresa_id: 1,
    terminal_id: 1
  };
}

function mapMesaRow(row = {}) {
  return {
    id: toId(row.id),
    numero: row.numero || "",
    estado: normalizeMesaEstado(row.estado, ESTADO_LIBRE),
    posicion_x: toCoordinate(row.posicion_x, 40),
    posicion_y: toCoordinate(row.posicion_y, 40),
    venta_id: row.venta_id ? toId(row.venta_id) : null,
    venta_numero: row.venta_numero ? Number(row.venta_numero) : null,
    venta_estado: row.venta_estado || null,
    venta_total: row.venta_total != null ? Number(row.venta_total) : null,
    mostrar_en_venta_rapida: toBooleanFlag(row.mostrar_en_venta_rapida, true),
    empresa_id: toId(row.empresa_id) || null,
    terminal_id: toId(row.terminal_id) || null
  };
}

function appendScopeFilter(params, scope = {}, alias = "") {
  const normalized = normalizeScope(scope);
  if (!hasScope(normalized)) {
    return { sql: "", params };
  }

  const prefix = alias ? `${alias}.` : "";
  params.push(normalized.empresa_id);
  const empresaIdx = params.length;
  params.push(normalized.terminal_id);
  const terminalIdx = params.length;

  return {
    sql: ` AND ${prefix}empresa_id = $${empresaIdx} AND ${prefix}terminal_id = $${terminalIdx}`,
    params
  };
}

async function ensureMesaSchema() {
  if (schemaPromise) return schemaPromise;

  schemaPromise = (async () => {
    await db.query(`
      CREATE TABLE IF NOT EXISTS mesa (
        id BIGSERIAL PRIMARY KEY,
        numero VARCHAR(20) NOT NULL,
        estado VARCHAR(20) NOT NULL DEFAULT 'LIBRE',
        posicion_x NUMERIC(10,2) NOT NULL DEFAULT 40,
        posicion_y NUMERIC(10,2) NOT NULL DEFAULT 40,
        mostrar_en_venta_rapida BOOLEAN NOT NULL DEFAULT TRUE,
        venta_id BIGINT NULL,
        empresa_id BIGINT NOT NULL DEFAULT 1,
        terminal_id BIGINT NOT NULL DEFAULT 1,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await db.query(`ALTER TABLE mesa ADD COLUMN IF NOT EXISTS numero VARCHAR(20)`);
    await db.query(`ALTER TABLE mesa ADD COLUMN IF NOT EXISTS estado VARCHAR(20) DEFAULT 'LIBRE'`);
    await db.query(`ALTER TABLE mesa ADD COLUMN IF NOT EXISTS posicion_x NUMERIC(10,2) DEFAULT 40`);
    await db.query(`ALTER TABLE mesa ADD COLUMN IF NOT EXISTS posicion_y NUMERIC(10,2) DEFAULT 40`);
    await db.query(`ALTER TABLE mesa ADD COLUMN IF NOT EXISTS mostrar_en_venta_rapida BOOLEAN DEFAULT TRUE`);
    await db.query(`ALTER TABLE mesa ADD COLUMN IF NOT EXISTS venta_id BIGINT`);
    await db.query(`ALTER TABLE mesa ADD COLUMN IF NOT EXISTS empresa_id BIGINT DEFAULT 1`);
    await db.query(`ALTER TABLE mesa ADD COLUMN IF NOT EXISTS terminal_id BIGINT DEFAULT 1`);
    await db.query(`ALTER TABLE mesa ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()`);
    await db.query(`ALTER TABLE mesa ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`);

    await db.query(`
      UPDATE mesa
      SET numero = TRIM(COALESCE(numero, '')),
          estado = COALESCE(NULLIF(UPPER(TRIM(estado)), ''), 'LIBRE'),
          posicion_x = COALESCE(posicion_x, 40),
          posicion_y = COALESCE(posicion_y, 40),
          mostrar_en_venta_rapida = COALESCE(mostrar_en_venta_rapida, TRUE),
          empresa_id = COALESCE(empresa_id, 1),
          terminal_id = COALESCE(terminal_id, 1),
          updated_at = COALESCE(updated_at, NOW())
    `);

    await db.query(`ALTER TABLE mesa ALTER COLUMN empresa_id SET DEFAULT 1`);
    await db.query(`ALTER TABLE mesa ALTER COLUMN terminal_id SET DEFAULT 1`);
    await db.query(`ALTER TABLE mesa ALTER COLUMN mostrar_en_venta_rapida SET DEFAULT TRUE`);
    await db.query(`ALTER TABLE mesa ALTER COLUMN empresa_id SET NOT NULL`);
    await db.query(`ALTER TABLE mesa ALTER COLUMN terminal_id SET NOT NULL`);
    await db.query(`ALTER TABLE mesa ALTER COLUMN mostrar_en_venta_rapida SET NOT NULL`);

    await db.query(`DROP INDEX IF EXISTS uq_mesa_numero`);
    await db.query(`DROP INDEX IF EXISTS uq_mesa_venta_activa`);

    await db.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_mesa_numero_scope
      ON mesa(empresa_id, terminal_id, numero)
    `);

    await db.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_mesa_venta_activa
      ON mesa(venta_id)
      WHERE venta_id IS NOT NULL
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_mesa_scope_estado
      ON mesa(empresa_id, terminal_id, estado)
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_mesa_scope
      ON mesa(empresa_id, terminal_id)
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_mesa_scope_venta_rapida
      ON mesa(empresa_id, terminal_id, mostrar_en_venta_rapida)
    `);

    await db.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'fk_mesa_venta'
        ) THEN
          ALTER TABLE mesa
          ADD CONSTRAINT fk_mesa_venta
          FOREIGN KEY (venta_id) REFERENCES venta(id) ON DELETE SET NULL;
        END IF;
      END $$;
    `);

    await db.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'venta'
            AND column_name = 'mesa'
        ) THEN
          WITH seed AS (
            SELECT DISTINCT ON (TRIM(v.mesa))
              TRIM(v.mesa) AS numero,
              CASE
                WHEN v.estado IN ('EFECTIVADO', 'CANCELADO') THEN NULL
                ELSE v.id
              END AS venta_id,
              CASE
                WHEN v.estado IN ('EFECTIVADO', 'CANCELADO') THEN 'LIBRE'
                ELSE 'OCUPADA'
              END AS estado,
              1 AS empresa_id,
              1 AS terminal_id,
              ROW_NUMBER() OVER (ORDER BY TRIM(v.mesa)) AS rn
            FROM venta v
            WHERE v.mesa IS NOT NULL
              AND BTRIM(v.mesa) <> ''
            ORDER BY TRIM(v.mesa),
                     CASE WHEN v.estado IN ('PENDIENTE', 'CONCLUIDO') THEN 0 ELSE 1 END,
                     v.id DESC
          )
          INSERT INTO mesa (
            numero,
            estado,
            venta_id,
            posicion_x,
            posicion_y,
            empresa_id,
            terminal_id,
            created_at,
            updated_at
          )
          SELECT
            s.numero,
            s.estado,
            s.venta_id,
            40 + ((s.rn - 1) % 6) * 120,
            40 + FLOOR((s.rn - 1) / 6) * 120,
            s.empresa_id,
            s.terminal_id,
            NOW(),
            NOW()
          FROM seed s
          ON CONFLICT (empresa_id, terminal_id, numero)
          DO UPDATE
          SET venta_id = COALESCE(EXCLUDED.venta_id, mesa.venta_id),
              estado = CASE
                         WHEN COALESCE(EXCLUDED.venta_id, mesa.venta_id) IS NULL THEN 'LIBRE'
                         ELSE 'OCUPADA'
                       END,
              updated_at = NOW();

          BEGIN
            ALTER TABLE venta DROP COLUMN IF EXISTS mesa;
          EXCEPTION
            WHEN dependent_objects_still_exist THEN
              RAISE NOTICE 'No se pudo eliminar venta.mesa por dependencias.';
          END;
        END IF;
      END $$;
    `);

    await db.query(`
      UPDATE mesa m
      SET venta_id = NULL,
          estado = CASE
                     WHEN UPPER(COALESCE(m.estado, '')) = 'INACTIVA' THEN m.estado
                     ELSE 'LIBRE'
                   END,
          updated_at = NOW()
      WHERE m.venta_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM venta v
          WHERE v.id = m.venta_id
            AND v.estado IN ('EFECTIVADO', 'CANCELADO')
        )
    `);

    await ensureAuditoriaTriggerForTable("mesa");
  })();

  try {
    await schemaPromise;
  } catch (error) {
    schemaPromise = null;
    throw error;
  }
}

async function getVentaResumenById(client, ventaId, forUpdate = false) {
  const result = await client.query(
    `
      SELECT
        id,
        numero,
        fecha,
        estado,
        total,
        comision,
        cliente_id,
        cliente_nombre,
        vendedor_id,
        tipo_pedido_id
      FROM venta
      WHERE id = $1
      ${forUpdate ? "FOR UPDATE" : ""}
    `,
    [ventaId]
  );

  if (!result.rowCount) return null;
  return result.rows[0];
}

async function clearMesaByVentaId(client, ventaId, scope = null) {
  await ensureMesaSchema();
  const id = toId(ventaId);
  if (!id) return null;

  const params = [id];
  const scopeFilter = appendScopeFilter(params, scope);

  const updated = await client.query(
    `
      UPDATE mesa
      SET venta_id = NULL,
          estado = CASE
                     WHEN UPPER(COALESCE(estado, '')) = 'INACTIVA' THEN estado
                     ELSE 'LIBRE'
                   END,
          updated_at = NOW()
      WHERE venta_id = $1
      ${scopeFilter.sql}
      RETURNING id, numero, estado, posicion_x, posicion_y, venta_id, mostrar_en_venta_rapida, empresa_id, terminal_id
    `,
    params
  );

  return updated.rows.map(mapMesaRow);
}

async function getMesaByVentaId(client, ventaId, scope = null) {
  await ensureMesaSchema();
  const id = toId(ventaId);
  if (!id) return null;

  const params = [id];
  const scopeFilter = appendScopeFilter(params, scope);

  const result = await client.query(
    `
      SELECT id, numero, estado, posicion_x, posicion_y, venta_id, mostrar_en_venta_rapida, empresa_id, terminal_id
      FROM mesa
      WHERE venta_id = $1
      ${scopeFilter.sql}
      LIMIT 1
    `,
    params
  );

  if (!result.rowCount) return null;
  return mapMesaRow(result.rows[0]);
}

async function assignVentaToMesaById(client, ventaId, mesaId, scope = null) {
  await ensureMesaSchema();

  const ventaIdNum = toId(ventaId);
  const mesaIdNum = toId(mesaId);

  if (!ventaIdNum) throw new Error("venta_id requerido");
  if (!mesaIdNum) throw new Error("mesa_id requerido");

  const venta = await getVentaResumenById(client, ventaIdNum, true);
  if (!venta) throw new Error("Venta no encontrada");

  const mesaScope = normalizeScope(scope);
  const mesaParams = [mesaIdNum];
  const mesaScopeFilter = appendScopeFilter(mesaParams, mesaScope);

  const mesaRes = await client.query(
    `
      SELECT id, numero, estado, posicion_x, posicion_y, venta_id, mostrar_en_venta_rapida, empresa_id, terminal_id
      FROM mesa
      WHERE id = $1
      ${mesaScopeFilter.sql}
      FOR UPDATE
    `,
    mesaParams
  );

  if (!mesaRes.rowCount) {
    throw new Error("Mesa no encontrada");
  }

  const mesaActual = mesaRes.rows[0];
  const ventaAsignada = toId(mesaActual.venta_id);

  if (ventaAsignada && ventaAsignada !== ventaIdNum) {
    const ventaOcupando = await getVentaResumenById(client, ventaAsignada, true);
    if (ventaOcupando && isVentaActiva(ventaOcupando.estado)) {
      throw new Error(`Mesa ${mesaActual.numero} ya tiene una venta activa`);
    }

    await client.query(
      `
        UPDATE mesa
        SET venta_id = NULL,
            estado = CASE
                       WHEN UPPER(COALESCE(estado, '')) = 'INACTIVA' THEN estado
                       ELSE 'LIBRE'
                     END,
            updated_at = NOW()
        WHERE id = $1
      `,
      [mesaIdNum]
    );
  }

  const clearParams = [ventaIdNum, mesaIdNum];
  const clearScopeFilter = appendScopeFilter(clearParams, mesaScope);

  await client.query(
    `
      UPDATE mesa
      SET venta_id = NULL,
          estado = CASE
                     WHEN UPPER(COALESCE(estado, '')) = 'INACTIVA' THEN estado
                     ELSE 'LIBRE'
                   END,
          updated_at = NOW()
      WHERE venta_id = $1
        AND id <> $2
      ${clearScopeFilter.sql}
    `,
    clearParams
  );

  const updateParams = [ventaIdNum, mesaIdNum];
  const updateScopeFilter = appendScopeFilter(updateParams, mesaScope);

  const updated = await client.query(
    `
      UPDATE mesa
      SET venta_id = $1,
          estado = CASE
                     WHEN UPPER(COALESCE(estado, '')) = 'INACTIVA' THEN estado
                     ELSE 'OCUPADA'
                   END,
          updated_at = NOW()
      WHERE id = $2
      ${updateScopeFilter.sql}
      RETURNING id, numero, estado, posicion_x, posicion_y, venta_id, mostrar_en_venta_rapida, empresa_id, terminal_id
    `,
    updateParams
  );

  if (!updated.rowCount) {
    throw new Error("Mesa no encontrada");
  }

  return mapMesaRow(updated.rows[0]);
}

async function assignVentaToMesaByNumero(client, ventaId, mesaNumero, scope = null) {
  await ensureMesaSchema();

  const numero = normalizeMesaNumero(mesaNumero);
  if (!numero) {
    await clearMesaByVentaId(client, ventaId, scope);
    return null;
  }

  const safeScope = resolveScope(scope, scope);

  const upsert = await client.query(
    `
      INSERT INTO mesa (
        numero,
        estado,
        posicion_x,
        posicion_y,
        venta_id,
        empresa_id,
        terminal_id,
        created_at,
        updated_at
      )
      VALUES ($1, 'LIBRE', 40, 40, NULL, $2, $3, NOW(), NOW())
      ON CONFLICT (empresa_id, terminal_id, numero)
      DO UPDATE
      SET numero = EXCLUDED.numero,
          updated_at = NOW()
      RETURNING id
    `,
    [numero, safeScope.empresa_id, safeScope.terminal_id]
  );

  return assignVentaToMesaById(client, ventaId, upsert.rows[0].id, safeScope);
}

async function crearVentaNuevaParaMesa(client, payload = {}) {
  const tipoPedidoId = toId(payload.tipo_pedido_id);
  const vendedorId = toId(payload.vendedor_id) || 1;

  const seq = await client.query(`SELECT nextval('venta_numero_seq') AS numero`);
  const numero = Number(seq.rows[0]?.numero || 0);

  const insert = await client.query(
    `
      INSERT INTO venta
      (numero, fecha, pago, estado, total, comision, vendedor_id, cliente_id, cliente_nombre, tipo_pedido_id)
      VALUES
      ($1, NOW(), 'PENDIENTE', 'PENDIENTE', 0, 0, $2, 1, 'Ocasional', $3)
      RETURNING
        id,
        numero,
        fecha,
        estado,
        total,
        comision,
        cliente_id,
        cliente_nombre,
        vendedor_id,
        tipo_pedido_id
    `,
    [numero, vendedorId, tipoPedidoId]
  );

  return insert.rows[0];
}

async function seleccionarMesa(client, mesaId, payload = {}, scope = null) {
  await ensureMesaSchema();

  const mesaIdNum = toId(mesaId);
  if (!mesaIdNum) throw new Error("mesa_id requerido");

  const normalizedScope = normalizeScope(scope);
  const mesaParams = [mesaIdNum];
  const scopeFilter = appendScopeFilter(mesaParams, normalizedScope);

  const mesaRes = await client.query(
    `
      SELECT id, numero, estado, posicion_x, posicion_y, venta_id, mostrar_en_venta_rapida, empresa_id, terminal_id
      FROM mesa
      WHERE id = $1
      ${scopeFilter.sql}
      FOR UPDATE
    `,
    mesaParams
  );

  if (!mesaRes.rowCount) {
    throw new Error("Mesa no encontrada");
  }

  const mesa = mesaRes.rows[0];
  let venta = null;
  const ventaIdActual = toId(mesa.venta_id);

  if (ventaIdActual) {
    venta = await getVentaResumenById(client, ventaIdActual, true);

    if (!venta || !isVentaActiva(venta.estado)) {
      await clearMesaByVentaId(client, ventaIdActual, normalizedScope);
      venta = null;
    }
  }

  let creada = false;
  if (!venta) {
    venta = await crearVentaNuevaParaMesa(client, payload);
    creada = true;
  }

  const mesaAsignada = await assignVentaToMesaById(client, venta.id, mesaIdNum, normalizedScope);

  return {
    creada,
    mesa: mesaAsignada,
    venta
  };
}

async function limpiarMesasConVentaCerrada(client = db, scope = null) {
  await ensureMesaSchema();

  const params = [];
  let scopeWhere = "";

  const normalizedScope = normalizeScope(scope);
  if (hasScope(normalizedScope)) {
    params.push(normalizedScope.empresa_id);
    const empresaIdx = params.length;
    params.push(normalizedScope.terminal_id);
    const terminalIdx = params.length;
    scopeWhere = ` AND m.empresa_id = $${empresaIdx} AND m.terminal_id = $${terminalIdx}`;
  }

  await client.query(
    `
      UPDATE mesa m
      SET venta_id = NULL,
          estado = CASE
                     WHEN UPPER(COALESCE(m.estado, '')) = 'INACTIVA' THEN m.estado
                     ELSE 'LIBRE'
                   END,
          updated_at = NOW()
      WHERE m.venta_id IS NOT NULL
      ${scopeWhere}
        AND EXISTS (
          SELECT 1
          FROM venta v
          WHERE v.id = m.venta_id
            AND v.estado IN ('EFECTIVADO', 'CANCELADO')
        )
    `,
    params
  );
}

async function listarMesas(client = db, scope = null, options = {}) {
  await ensureMesaSchema();
  await limpiarMesasConVentaCerrada(client, scope);

  const params = [];
  let where = "";
  const onlyVentaRapida = toBooleanFlag(options?.onlyVentaRapida, false);

  const normalizedScope = normalizeScope(scope);
  if (hasScope(normalizedScope)) {
    params.push(normalizedScope.empresa_id);
    const empresaIdx = params.length;
    params.push(normalizedScope.terminal_id);
    const terminalIdx = params.length;
    where = `WHERE m.empresa_id = $${empresaIdx} AND m.terminal_id = $${terminalIdx}`;
  }

  if (onlyVentaRapida) {
    const clause = "COALESCE(m.mostrar_en_venta_rapida, TRUE) = TRUE";
    where = where ? `${where} AND ${clause}` : `WHERE ${clause}`;
  }

  const result = await client.query(
    `
      SELECT
        m.id,
        m.numero,
        m.estado,
        m.posicion_x,
        m.posicion_y,
        m.venta_id,
        m.mostrar_en_venta_rapida,
        m.empresa_id,
        m.terminal_id,
        v.numero AS venta_numero,
        v.estado AS venta_estado,
        v.total AS venta_total
      FROM mesa m
      LEFT JOIN venta v ON v.id = m.venta_id
      ${where}
      ORDER BY
        COALESCE(NULLIF(REGEXP_REPLACE(m.numero, '[^0-9]', '', 'g'), '')::int, 2147483647),
        m.numero
    `,
    params
  );

  return result.rows.map(mapMesaRow);
}

async function crearMesa(client, payload = {}, scope = null) {
  await ensureMesaSchema();

  const numero = normalizeMesaNumero(payload.numero);
  if (!numero) throw new Error("numero requerido");

  const estado = normalizeMesaEstado(payload.estado, ESTADO_LIBRE);
  const posicionX = toCoordinate(payload.posicionX ?? payload.posicion_x, 40);
  const posicionY = toCoordinate(payload.posicionY ?? payload.posicion_y, 40);
  const mostrarEnVentaRapida = toBooleanFlag(
    payload.mostrar_en_venta_rapida ?? payload.mostrarEnVentaRapida,
    true
  );
  const safeScope = resolveScope(scope, payload);

  const created = await client.query(
    `
      INSERT INTO mesa (
        numero,
        estado,
        posicion_x,
        posicion_y,
        mostrar_en_venta_rapida,
        venta_id,
        empresa_id,
        terminal_id,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, NULL, $6, $7, NOW(), NOW())
      RETURNING id, numero, estado, posicion_x, posicion_y, venta_id, mostrar_en_venta_rapida, empresa_id, terminal_id
    `,
    [
      numero,
      estado,
      posicionX,
      posicionY,
      mostrarEnVentaRapida,
      safeScope.empresa_id,
      safeScope.terminal_id
    ]
  );

  return mapMesaRow(created.rows[0]);
}

async function actualizarMesa(client, mesaId, payload = {}, scope = null) {
  await ensureMesaSchema();

  const id = toId(mesaId);
  if (!id) throw new Error("id de mesa invalido");

  const normalizedScope = normalizeScope(scope);
  const currentParams = [id];
  const scopeFilter = appendScopeFilter(currentParams, normalizedScope);

  const currentRes = await client.query(
    `
      SELECT id, numero, estado, posicion_x, posicion_y, venta_id, mostrar_en_venta_rapida, empresa_id, terminal_id
      FROM mesa
      WHERE id = $1
      ${scopeFilter.sql}
      FOR UPDATE
    `,
    currentParams
  );

  if (!currentRes.rowCount) throw new Error("Mesa no encontrada");

  const current = currentRes.rows[0];
  const numero = normalizeMesaNumero(payload.numero ?? current.numero);
  if (!numero) throw new Error("numero requerido");

  const estado = normalizeMesaEstado(payload.estado, current.estado);
  const posicionX = toCoordinate(payload.posicionX ?? payload.posicion_x ?? current.posicion_x, current.posicion_x);
  const posicionY = toCoordinate(payload.posicionY ?? payload.posicion_y ?? current.posicion_y, current.posicion_y);
  const mostrarEnVentaRapida = toBooleanFlag(
    payload.mostrar_en_venta_rapida ?? payload.mostrarEnVentaRapida,
    toBooleanFlag(current.mostrar_en_venta_rapida, true)
  );

  const updateParams = [numero, estado, posicionX, posicionY, mostrarEnVentaRapida, id];
  const updateScopeFilter = appendScopeFilter(updateParams, normalizedScope);

  const updated = await client.query(
    `
      UPDATE mesa
      SET numero = $1,
          estado = $2,
          posicion_x = $3,
          posicion_y = $4,
          mostrar_en_venta_rapida = $5,
          updated_at = NOW()
      WHERE id = $6
      ${updateScopeFilter.sql}
      RETURNING id, numero, estado, posicion_x, posicion_y, venta_id, mostrar_en_venta_rapida, empresa_id, terminal_id
    `,
    updateParams
  );

  if (!updated.rowCount) throw new Error("Mesa no encontrada");
  return mapMesaRow(updated.rows[0]);
}

async function actualizarPosicionMesa(client, mesaId, payload = {}, scope = null) {
  await ensureMesaSchema();

  const id = toId(mesaId);
  if (!id) throw new Error("id de mesa invalido");

  const posicionX = toCoordinate(payload.posicionX ?? payload.posicion_x, 40);
  const posicionY = toCoordinate(payload.posicionY ?? payload.posicion_y, 40);

  const normalizedScope = normalizeScope(scope);
  const params = [posicionX, posicionY, id];
  const scopeFilter = appendScopeFilter(params, normalizedScope);

  const updated = await client.query(
    `
      UPDATE mesa
      SET posicion_x = $1,
          posicion_y = $2,
          updated_at = NOW()
      WHERE id = $3
      ${scopeFilter.sql}
      RETURNING id, numero, estado, posicion_x, posicion_y, venta_id, mostrar_en_venta_rapida, empresa_id, terminal_id
    `,
    params
  );

  if (!updated.rowCount) throw new Error("Mesa no encontrada");
  return mapMesaRow(updated.rows[0]);
}

async function liberarMesaById(client, mesaId, scope = null) {
  await ensureMesaSchema();

  const id = toId(mesaId);
  if (!id) throw new Error("id de mesa invalido");

  const normalizedScope = normalizeScope(scope);
  const params = [id];
  const scopeFilter = appendScopeFilter(params, normalizedScope);

  const updated = await client.query(
    `
      UPDATE mesa
      SET venta_id = NULL,
          estado = CASE
                     WHEN UPPER(COALESCE(estado, '')) = 'INACTIVA' THEN estado
                     ELSE 'LIBRE'
                   END,
          updated_at = NOW()
      WHERE id = $1
      ${scopeFilter.sql}
      RETURNING id, numero, estado, posicion_x, posicion_y, venta_id, mostrar_en_venta_rapida, empresa_id, terminal_id
    `,
    params
  );

  if (!updated.rowCount) throw new Error("Mesa no encontrada");
  return mapMesaRow(updated.rows[0]);
}

async function eliminarMesa(client, mesaId, scope = null) {
  await ensureMesaSchema();

  const id = toId(mesaId);
  if (!id) throw new Error("id de mesa invalido");

  const normalizedScope = normalizeScope(scope);
  const currentParams = [id];
  const scopeFilter = appendScopeFilter(currentParams, normalizedScope);

  const current = await client.query(
    `
      SELECT id, numero, venta_id, empresa_id, terminal_id
      FROM mesa
      WHERE id = $1
      ${scopeFilter.sql}
      FOR UPDATE
    `,
    currentParams
  );

  if (!current.rowCount) throw new Error("Mesa no encontrada");
  if (current.rows[0].venta_id) {
    throw new Error("No se puede eliminar una mesa con venta activa");
  }

  const deleteParams = [id];
  const deleteScopeFilter = appendScopeFilter(deleteParams, normalizedScope);

  await client.query(
    `
      DELETE FROM mesa
      WHERE id = $1
      ${deleteScopeFilter.sql}
    `,
    deleteParams
  );

  return { ok: true };
}

module.exports = {
  ESTADO_LIBRE,
  ESTADO_OCUPADA,
  assignVentaToMesaById,
  assignVentaToMesaByNumero,
  actualizarMesa,
  actualizarPosicionMesa,
  clearMesaByVentaId,
  crearMesa,
  eliminarMesa,
  ensureMesaSchema,
  getMesaByVentaId,
  liberarMesaById,
  listarMesas,
  normalizeMesaNumero,
  seleccionarMesa
};
