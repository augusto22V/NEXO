'use strict';

/**
 * Esquema del módulo de Producción / Armado de paquetes.
 * Crea las tablas receta, receta_detalle, produccion y produccion_consumo
 * si no existen. Idempotente: corre en cada arranque sin efectos.
 */

const fs = require('fs');
const path = require('path');
const pool = require('../db');

let schemaPromise = null;

async function ensureProduccionSchema() {
  if (schemaPromise) return schemaPromise;

  schemaPromise = (async () => {
    const sqlPath = path.join(__dirname, '..', 'sql', 'produccion_module.sql');
    if (!fs.existsSync(sqlPath)) {
      throw new Error('No se encontró produccion_module.sql');
    }
    // Quitar BOM inicial (﻿) que rompe el primer statement (BEGIN).
    const sql = fs.readFileSync(sqlPath, 'utf8').replace(/^﻿/, '');
    await pool.query(sql);
  })();

  try {
    await schemaPromise;
  } catch (error) {
    schemaPromise = null;
    throw error;
  }
}

module.exports = { ensureProduccionSchema };
