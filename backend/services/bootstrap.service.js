'use strict';

/**
 * Bootstrap de primer arranque.
 * En una PC nueva (instalación limpia) se encarga de:
 *   1. Crear la base de datos si no existe.
 *   2. Cargar el esquema base (todas las tablas) si está vacía.
 *   3. Sembrar datos mínimos para poder loguear: 1 empresa, 1 terminal,
 *      1 usuario ADMIN (clave inicial: admin).
 *
 * Todo es idempotente: si ya existe, no toca nada. Así una instalación
 * existente no se ve afectada.
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const bcrypt = require('bcrypt');
const pool = require('../db');
const { DB_CONFIG } = require('../db');

// 1. Crear la base de datos si no existe (vía la BD de mantenimiento "postgres")
async function ensureDatabaseExists() {
  const admin = new Client({
    user: DB_CONFIG.user,
    host: DB_CONFIG.host,
    password: DB_CONFIG.password,
    port: DB_CONFIG.port,
    database: 'postgres',
  });

  try {
    await admin.connect();
    const r = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [DB_CONFIG.database]);
    if (!r.rowCount) {
      // El nombre viene de configuración (no de input de usuario) → seguro interpolarlo.
      await admin.query(`CREATE DATABASE "${DB_CONFIG.database}"`);
      console.log(`[bootstrap] Base de datos "${DB_CONFIG.database}" creada.`);
    }
  } finally {
    await admin.end().catch(() => {});
  }
}

// 2. ¿Existe ya el esquema? (la tabla empresa)
async function schemaExiste() {
  const r = await pool.query(`SELECT to_regclass('public.empresa') AS t`);
  return Boolean(r.rows[0] && r.rows[0].t);
}

// 3. Cargar el esquema base desde el archivo
async function ejecutarEsquemaBase() {
  const sqlPath = path.join(__dirname, '..', 'sql', 'bootstrap_schema.sql');
  if (!fs.existsSync(sqlPath)) {
    throw new Error('No se encontró bootstrap_schema.sql para inicializar la base.');
  }
  const raw = fs.readFileSync(sqlPath, 'utf8');

  // pg_dump incluye cosas que rompen al ejecutar vía la librería pg:
  //  - Meta-comandos de psql (líneas que empiezan con "\": \restrict, \connect…)
  //  - SELECT pg_catalog.set_config('search_path', '', false): deja la conexión
  //    del pool con search_path vacío y después no encuentra las tablas sin
  //    calificar. Lo quitamos para que quede el search_path por defecto (public).
  const sql = raw
    .split('\n')
    .filter((linea) => {
      const t = linea.trimStart();
      if (t.startsWith('\\')) return false;
      if (/set_config\(\s*'search_path'/i.test(t)) return false;
      if (/^SET\s+search_path\b/i.test(t)) return false;
      return true;
    })
    .join('\n');

  await pool.query(sql);
  // Asegurar search_path por defecto en la conexión actual
  await pool.query('SET search_path TO public');
  console.log('[bootstrap] Esquema base creado (tablas).');
}

// 4. Sembrar datos mínimos para poder loguear
async function ensureSeedInicial() {
  const r = await pool.query('SELECT id FROM empresa LIMIT 1');
  if (r.rowCount) return; // ya hay datos, no tocar

  const empresaRes = await pool.query(
    `INSERT INTO empresa (codigo, nombre, activa) VALUES ('EMP001', 'Mi Empresa', true) RETURNING id`
  );
  const empresaId = empresaRes.rows[0].id;

  const terminalRes = await pool.query(
    `INSERT INTO terminal (nombre, empresa_id, activo) VALUES ('Terminal 1', $1, true) RETURNING id`,
    [empresaId]
  );
  const terminalId = terminalRes.rows[0].id;

  const hash = await bcrypt.hash('admin', 10);
  await pool.query(
    `INSERT INTO usuario (usuario, nombre, password, rol, empresa_id, terminal_id, activo)
     VALUES ('ADMIN', 'Administrador', $1, 'ADMIN', $2, $3, true)`,
    [hash, empresaId, terminalId]
  );

  console.log('[bootstrap] Datos iniciales creados.');
  console.log('[bootstrap] >>> Login inicial:  usuario: ADMIN   clave: admin   (cambiala después)');
}

/**
 * Punto de entrada. Debe correr ANTES que cualquier otra migración
 * (las demás usan el pool y fallarían si la BD no existe todavía).
 */
async function bootstrapPrimerArranque() {
  await ensureDatabaseExists();
  if (!(await schemaExiste())) {
    await ejecutarEsquemaBase();
  }
  await ensureSeedInicial();
}

module.exports = { bootstrapPrimerArranque };
