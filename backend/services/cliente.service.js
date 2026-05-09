const db = require("../db");

let schemaPromise = null;

/**
 * Asegura las columnas necesarias para identificar al cliente y emitir
 * factura electrónica (SIFEN — Paraguay).
 *
 * Columnas agregadas (todas con IF NOT EXISTS):
 *  - numero_documento    : cédula sin DV o RUC sin DV. Se usa para búsquedas.
 *  - dv                  : dígito verificador (cuando aplica)
 *  - tipo_documento      : CI | RUC | PASAPORTE | EXTRANJERO
 *  - naturaleza          : FISICA | JURIDICA
 *  - tipo_contribuyente  : CONTRIBUYENTE | NO_CONTRIBUYENTE
 *  - departamento_id     : código SIFEN del depto.
 *  - distrito_id         : código SIFEN del distrito
 *  - ciudad_id           : código SIFEN de la ciudad
 *  - numero_casa         : número de casa
 *
 * Después de agregar las columnas, hace un backfill: separa la columna
 * histórica `ruc` (formato "1234567-8") en `numero_documento` + `dv`
 * y deduce tipo_documento/naturaleza/tipo_contribuyente para clientes
 * que ya estaban cargados.
 */
async function ensureClienteSchema() {
  if (schemaPromise) return schemaPromise;

  schemaPromise = (async () => {
    // Garantiza la tabla base. Si ya existe se ignora.
    await db.query(`
      CREATE TABLE IF NOT EXISTS cliente (
        id           BIGSERIAL PRIMARY KEY,
        nombre       VARCHAR(200),
        razon_social VARCHAR(200),
        ruc          VARCHAR(30),
        telefono     VARCHAR(60),
        direccion    VARCHAR(300),
        email        VARCHAR(150)
      )
    `);

    await db.query(`ALTER TABLE cliente ADD COLUMN IF NOT EXISTS numero_documento   VARCHAR(30)`);
    await db.query(`ALTER TABLE cliente ADD COLUMN IF NOT EXISTS dv                 VARCHAR(2)`);
    await db.query(`ALTER TABLE cliente ADD COLUMN IF NOT EXISTS tipo_documento     VARCHAR(30)`);
    await db.query(`ALTER TABLE cliente ADD COLUMN IF NOT EXISTS naturaleza         VARCHAR(20)`);
    await db.query(`ALTER TABLE cliente ADD COLUMN IF NOT EXISTS tipo_contribuyente VARCHAR(30)`);
    await db.query(`ALTER TABLE cliente ADD COLUMN IF NOT EXISTS departamento_id    INT`);
    await db.query(`ALTER TABLE cliente ADD COLUMN IF NOT EXISTS distrito_id        INT`);
    await db.query(`ALTER TABLE cliente ADD COLUMN IF NOT EXISTS ciudad_id          INT`);
    await db.query(`ALTER TABLE cliente ADD COLUMN IF NOT EXISTS numero_casa        VARCHAR(30)`);

    // Index para acelerar búsquedas por documento
    await db.query(`CREATE INDEX IF NOT EXISTS idx_cliente_numero_documento ON cliente(numero_documento)`);

    // Backfill: separar el campo `ruc` histórico en numero_documento + dv
    await db.query(`
      UPDATE cliente
      SET numero_documento = SPLIT_PART(ruc, '-', 1),
          dv               = NULLIF(SPLIT_PART(ruc, '-', 2), '')
      WHERE numero_documento IS NULL
        AND ruc IS NOT NULL
        AND ruc <> ''
    `);

    // Si tiene DV → es RUC. Si no → asumimos CI.
    await db.query(`
      UPDATE cliente
      SET tipo_documento = CASE WHEN dv IS NOT NULL AND dv <> '' THEN 'RUC' ELSE 'CI' END
      WHERE tipo_documento IS NULL AND numero_documento IS NOT NULL
    `);

    await db.query(`
      UPDATE cliente
      SET tipo_contribuyente = CASE WHEN dv IS NOT NULL AND dv <> '' THEN 'CONTRIBUYENTE' ELSE 'NO_CONTRIBUYENTE' END
      WHERE tipo_contribuyente IS NULL AND numero_documento IS NOT NULL
    `);

    // Heurística simple: si la razón social tiene "S.A." / "SRL" / "EIRL" / "LTDA" → JURIDICA
    await db.query(`
      UPDATE cliente
      SET naturaleza = CASE
        WHEN UPPER(COALESCE(razon_social, nombre, '')) ~ '(S\\.?A\\.?|SRL|S\\.R\\.L|EIRL|LTDA|LIMITADA|CIA|S\\.A\\.E\\.C\\.A|SOCIEDAD)' THEN 'JURIDICA'
        WHEN dv IS NOT NULL AND dv <> '' THEN 'JURIDICA'
        ELSE 'FISICA'
      END
      WHERE naturaleza IS NULL AND numero_documento IS NOT NULL
    `);
  })();

  return schemaPromise;
}

/**
 * Separa un input de RUC/cédula en componentes.
 *  parseRuc("1234567-8")  → { numero: "1234567", dv: "8" }
 *  parseRuc("1234567")    → { numero: "1234567", dv: null }
 *  parseRuc(" 80012345-6 ")→{ numero: "80012345", dv: "6" }
 */
function parseRuc(input) {
  const raw = String(input || "").trim();
  if (!raw) return { numero: "", dv: null };
  const [numero, dv] = raw.split("-");
  return {
    numero: (numero || "").trim(),
    dv: dv ? dv.trim() : null
  };
}

module.exports = {
  ensureClienteSchema,
  parseRuc
};
