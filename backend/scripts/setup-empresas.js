/**
 * Script de setup de empresas + usuarios + terminales
 *
 * Hace lo siguiente:
 *  1) Muestra el estado actual (empresas, terminales, usuarios)
 *  2) Borra TODOS los usuarios, terminales y empresas
 *  3) Crea 2 empresas:
 *      - id=1: Librería Demo  (con usuario ADMIN / admin)
 *      - id=2: NEXO           (con usuarios AUGUSTO / augusto  +  VENTA / venta)
 *  4) Crea una terminal por empresa (id 1 y 2)
 *  5) Inicializa los permisos por defecto de cada usuario
 *
 * Uso:
 *   cd backend
 *   node scripts/setup-empresas.js
 */

const path = require("path");
const bcrypt = require("bcrypt");
const pool = require(path.join(__dirname, "..", "db"));
const { ensureUsuarioSchema } = require(path.join(__dirname, "..", "services", "usuario.service"));
const { ensurePermisosUsuario } = require(path.join(__dirname, "..", "services", "permisos.service"));

const COLOR_RESET = "\x1b[0m";
const COLOR_GREEN = "\x1b[32m";
const COLOR_YELLOW = "\x1b[33m";
const COLOR_CYAN = "\x1b[36m";
const COLOR_RED = "\x1b[31m";

function log(msg, color = "") {
  console.log(`${color}${msg}${COLOR_RESET}`);
}

async function mostrarEstadoActual() {
  log("\n========== ESTADO ACTUAL ==========", COLOR_CYAN);

  try {
    const empresas = await pool.query(`SELECT id, nombre, codigo FROM empresa ORDER BY id`);
    log(`\nEmpresas existentes (${empresas.rowCount}):`, COLOR_YELLOW);
    empresas.rows.forEach(e => log(`  · id=${e.id}  ${e.codigo || ""}  ${e.nombre || ""}`));
  } catch (err) {
    log(`  (no se pudo leer empresas: ${err.message})`, COLOR_RED);
  }

  try {
    const terminales = await pool.query(`SELECT id, nombre, empresa_id FROM terminal ORDER BY id`);
    log(`\nTerminales existentes (${terminales.rowCount}):`, COLOR_YELLOW);
    terminales.rows.forEach(t => log(`  · id=${t.id}  ${t.nombre}  (empresa=${t.empresa_id})`));
  } catch (err) {
    log(`  (no se pudo leer terminales: ${err.message})`, COLOR_RED);
  }

  try {
    const usuarios = await pool.query(
      `SELECT u.id, u.usuario, u.nombre, u.rol, u.empresa_id, e.nombre AS empresa
       FROM usuario u LEFT JOIN empresa e ON e.id = u.empresa_id
       ORDER BY u.empresa_id, u.id`
    );
    log(`\nUsuarios existentes (${usuarios.rowCount}):`, COLOR_YELLOW);
    usuarios.rows.forEach(u =>
      log(`  · id=${u.id}  ${u.usuario}  (${u.nombre || "-"})  rol=${u.rol}  empresa=${u.empresa_id || "?"} ${u.empresa || ""}`)
    );
  } catch (err) {
    log(`  (no se pudo leer usuarios: ${err.message})`, COLOR_RED);
  }
}

async function borrarTodo() {
  log("\n========== BORRANDO ==========", COLOR_RED);
  await pool.query(`DELETE FROM permisos_usuario`);
  log("  · permisos_usuario borrados");
  await pool.query(`DELETE FROM usuario`);
  log("  · usuarios borrados");
  await pool.query(`DELETE FROM terminal`);
  log("  · terminales borradas");
  await pool.query(`DELETE FROM empresa`);
  log("  · empresas borradas");

  // Reiniciamos las secuencias para que los nuevos IDs empiecen en 1
  await pool.query(`ALTER SEQUENCE empresa_id_seq RESTART WITH 1`).catch(() => {});
  await pool.query(`ALTER SEQUENCE terminal_id_seq RESTART WITH 1`).catch(() => {});
  await pool.query(`ALTER SEQUENCE usuario_id_seq RESTART WITH 1`).catch(() => {});
  log("  · secuencias reiniciadas");
}

async function crearEmpresa({ codigo, nombre }) {
  const r = await pool.query(
    `INSERT INTO empresa (codigo, nombre) VALUES ($1, $2) RETURNING id`,
    [codigo, nombre]
  );
  return r.rows[0].id;
}

async function crearTerminal({ nombre, empresaId }) {
  // ensure terminal table tiene columnas mínimas
  await pool.query(`CREATE TABLE IF NOT EXISTS terminal (
    id BIGSERIAL PRIMARY KEY,
    nombre VARCHAR(120),
    empresa_id BIGINT
  )`);
  await pool.query(`ALTER TABLE terminal ADD COLUMN IF NOT EXISTS nombre VARCHAR(120)`);
  await pool.query(`ALTER TABLE terminal ADD COLUMN IF NOT EXISTS empresa_id BIGINT`);

  const r = await pool.query(
    `INSERT INTO terminal (nombre, empresa_id) VALUES ($1, $2) RETURNING id`,
    [nombre, empresaId]
  );
  return r.rows[0].id;
}

async function crearUsuario({ usuario, password, nombre, rol, empresaId }) {
  const hash = await bcrypt.hash(password, 10);
  const r = await pool.query(
    `INSERT INTO usuario (usuario, password, nombre, rol, empresa_id, activo,
                          modo_factura, modo_impresion, modo_confirmacion)
     VALUES ($1, $2, $3, $4, $5, true, 'PREGUNTAR', 'AUTO', false)
     RETURNING id`,
    [usuario.toUpperCase(), hash, nombre, rol.toLowerCase(), empresaId]
  );
  const id = r.rows[0].id;
  try {
    await ensurePermisosUsuario(id);
  } catch (err) {
    log(`    (no se pudieron inicializar permisos: ${err.message})`, COLOR_YELLOW);
  }
  return id;
}

async function crearTodo() {
  log("\n========== CREANDO ==========", COLOR_GREEN);

  // 1) LIBRERÍA DEMO
  const empresaDemo = await crearEmpresa({ codigo: "DEMO", nombre: "Librería Demo" });
  log(`  · empresa creada id=${empresaDemo}: Librería Demo`);

  const termDemo = await crearTerminal({ nombre: "Mostrador Demo", empresaId: empresaDemo });
  log(`  · terminal creada id=${termDemo}: Mostrador Demo (empresa=${empresaDemo})`);

  const userDemo = await crearUsuario({
    usuario: "ADMIN", password: "admin", nombre: "Admin Demo",
    rol: "admin", empresaId: empresaDemo
  });
  log(`  · usuario creado id=${userDemo}: ADMIN / admin  (empresa=${empresaDemo}, rol=admin)`);

  // 2) NEXO
  const empresaNexo = await crearEmpresa({ codigo: "NEXO", nombre: "NEXO" });
  log(`  · empresa creada id=${empresaNexo}: NEXO`);

  const termNexo = await crearTerminal({ nombre: "Mostrador 1", empresaId: empresaNexo });
  log(`  · terminal creada id=${termNexo}: Mostrador 1 (empresa=${empresaNexo})`);

  const userAugusto = await crearUsuario({
    usuario: "AUGUSTO", password: "augusto", nombre: "Augusto",
    rol: "super", empresaId: empresaNexo
  });
  log(`  · usuario creado id=${userAugusto}: AUGUSTO / augusto  (empresa=${empresaNexo}, rol=super)`);

  const userVenta = await crearUsuario({
    usuario: "VENTA", password: "venta", nombre: "Vendedor",
    rol: "vendedor", empresaId: empresaNexo
  });
  log(`  · usuario creado id=${userVenta}: VENTA / venta  (empresa=${empresaNexo}, rol=vendedor)`);
}

async function main() {
  try {
    log("\n=================================================", COLOR_CYAN);
    log("  SETUP DE EMPRESAS + USUARIOS + TERMINALES", COLOR_CYAN);
    log("=================================================", COLOR_CYAN);

    await ensureUsuarioSchema();

    await mostrarEstadoActual();
    await borrarTodo();
    await crearTodo();

    log("\n========== ESTADO FINAL ==========", COLOR_GREEN);
    await mostrarEstadoActual();

    log("\n=================================================", COLOR_GREEN);
    log("  ✓ LISTO. Credenciales para login:", COLOR_GREEN);
    log("=================================================", COLOR_GREEN);
    log("\n  Empresa: Librería Demo");
    log("    Terminal: Mostrador Demo");
    log("    Usuario:  ADMIN / admin   (rol admin)");
    log("\n  Empresa: NEXO");
    log("    Terminal: Mostrador 1");
    log("    Usuario:  AUGUSTO / augusto  (rol super)");
    log("    Usuario:  VENTA   / venta    (rol vendedor)");
    log("");

  } catch (err) {
    log(`\n❌ ERROR: ${err.message}`, COLOR_RED);
    console.error(err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
