const DAY_MS = 24 * 60 * 60 * 1000;
const SECRET_NUM_STR = String(process.env.LICENSE_SECRET_NUM || "73915482").replace(/\D/g, "") || "73915482";
const SECRET_NUM = BigInt(SECRET_NUM_STR);

function onlyDigits(value) {
  return String(value ?? "").replace(/\D/g, "");
}

function padLeft(value, len) {
  return String(value).padStart(len, "0");
}

function dateOnly(value) {
  const d = new Date(value);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function formatDateNum(value) {
  const d = new Date(value);
  const yyyy = d.getFullYear();
  const mm = padLeft(d.getMonth() + 1, 2);
  const dd = padLeft(d.getDate(), 2);
  return `${yyyy}${mm}${dd}`;
}

function formatDateTimeNum(value) {
  const d = new Date(value);
  const fecha = formatDateNum(d);
  const hh = padLeft(d.getHours(), 2);
  const mi = padLeft(d.getMinutes(), 2);
  return `${fecha}${hh}${mi}`;
}

function parseDateNum(dateNum) {
  const digits = onlyDigits(dateNum);
  if (!/^\d{8}$/.test(digits)) return null;

  const year = Number(digits.slice(0, 4));
  const month = Number(digits.slice(4, 6));
  const day = Number(digits.slice(6, 8));

  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() + 1 !== month ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

function generateControlActual(idInterno, now = new Date()) {
  const idNum = Math.max(0, Number(idInterno) || 0) % 10000;
  return `${formatDateTimeNum(now)}${padLeft(idNum, 4)}`;
}

function calculateSignature(controlActual, fechaNum) {
  const control = BigInt(onlyDigits(controlActual) || "0");
  const fecha = BigInt(onlyDigits(fechaNum) || "0");
  const mixed = (control * 97n + fecha * 13n + SECRET_NUM * 31n) % 100000000n;
  return String(mixed).padStart(8, "0");
}

function generateNuevoControl(controlActual, fechaDate) {
  const fechaNum = formatDateNum(fechaDate);
  const signature = calculateSignature(controlActual, fechaNum);
  return `${fechaNum}${signature}`;
}

function calcDiasRestantes(fechaVencimiento) {
  const today = dateOnly(new Date());
  const venc = dateOnly(fechaVencimiento);
  return Math.floor((venc.getTime() - today.getTime()) / DAY_MS);
}

function licenseStateFromRow(row) {
  const diasRestantes = calcDiasRestantes(row.fecha_vencimiento);
  const vencida = diasRestantes < 0;
  const fechaNum = Number(formatDateNum(row.fecha_vencimiento));
  const controlActual = Number(onlyDigits(row.control_actual || 0));

  return {
    empresa_id: Number(row.empresa_id),
    fecha_vencimiento_num: fechaNum,
    dias_restantes: diasRestantes,
    vencida,
    control_actual: controlActual,
  };
}

async function ensureLicenseRow(db, empresaId) {
  const empresaNum = Number(empresaId);

  if (!Number.isFinite(empresaNum) || empresaNum <= 0) {
    throw new Error("empresa_invalida");
  }

  // Compatibilidad: algunos esquemas viejos no traen control_licencia.
  await db.query(`
    CREATE TABLE IF NOT EXISTS control_licencia (
      id BIGSERIAL PRIMARY KEY,
      empresa_id BIGINT NOT NULL UNIQUE REFERENCES empresa(id) ON DELETE CASCADE,
      id_interno BIGINT NOT NULL,
      fecha_vencimiento DATE NOT NULL,
      control_actual BIGINT,
      control_actual_ts TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.query(
    `INSERT INTO control_licencia (empresa_id, id_interno, fecha_vencimiento)
     VALUES ($1, $2, (CURRENT_DATE + INTERVAL '30 days')::date)
     ON CONFLICT (empresa_id) DO NOTHING`,
    [empresaNum, 1000 + empresaNum]
  );

  const r = await db.query(
    `SELECT empresa_id, id_interno, fecha_vencimiento, control_actual, control_actual_ts
       FROM control_licencia
      WHERE empresa_id = $1`,
    [empresaNum]
  );

  if (!r.rowCount) {
    throw new Error("licencia_no_encontrada");
  }

  return r.rows[0];
}

async function getLicenseState(db, empresaId, opts = {}) {
  const { regenerateControl = true } = opts;
  const row = await ensureLicenseRow(db, empresaId);

  let controlActual = onlyDigits(row.control_actual || "");

  if (regenerateControl || !/^\d{16}$/.test(controlActual)) {
    controlActual = generateControlActual(row.id_interno, new Date());

    await db.query(
      `UPDATE control_licencia
          SET control_actual = $1::bigint,
              control_actual_ts = now(),
              updated_at = now()
        WHERE empresa_id = $2`,
      [controlActual, Number(empresaId)]
    );

    row.control_actual = controlActual;
  }

  return licenseStateFromRow(row);
}

async function activateLicense(db, empresaId, nuevoControl) {
  const empresaNum = Number(empresaId);
  const nuevoDigits = onlyDigits(nuevoControl);

  if (!/^\d{16}$/.test(nuevoDigits)) {
    return { ok: false, error: "control_invalido" };
  }

  const row = await ensureLicenseRow(db, empresaNum);

  let controlActual = onlyDigits(row.control_actual || "");
  if (!/^\d{16}$/.test(controlActual)) {
    controlActual = generateControlActual(row.id_interno, new Date());

    await db.query(
      `UPDATE control_licencia
          SET control_actual = $1::bigint,
              control_actual_ts = now(),
              updated_at = now()
        WHERE empresa_id = $2`,
      [controlActual, empresaNum]
    );
  }

  const fechaNum = nuevoDigits.slice(0, 8);
  const signature = nuevoDigits.slice(8);
  const fechaDate = parseDateNum(fechaNum);

  if (!fechaDate) {
    return { ok: false, error: "fecha_invalida" };
  }

  const today = dateOnly(new Date());
  const venc = dateOnly(fechaDate);

  if (venc.getTime() < today.getTime()) {
    return { ok: false, error: "fecha_menor_hoy" };
  }

  const expectedSignature = calculateSignature(controlActual, fechaNum);

  if (expectedSignature !== signature) {
    return { ok: false, error: "control_no_valido" };
  }

  const fechaIso = `${fechaNum.slice(0, 4)}-${fechaNum.slice(4, 6)}-${fechaNum.slice(6, 8)}`;
  const nuevoControlActual = generateControlActual(row.id_interno, new Date());

  await db.query(
    `UPDATE control_licencia
        SET fecha_vencimiento = $1::date,
            control_actual = $2::bigint,
            control_actual_ts = now(),
            updated_at = now()
      WHERE empresa_id = $3`,
    [fechaIso, nuevoControlActual, empresaNum]
  );

  const licencia = await getLicenseState(db, empresaNum, { regenerateControl: false });
  return { ok: true, licencia };
}

module.exports = {
  getLicenseState,
  activateLicense,
  generateNuevoControl,
  generateControlActual,
};
