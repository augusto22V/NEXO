#!/usr/bin/env node
'use strict';

/**
 * ============================================================
 *  GENERADOR DE LICENCIAS — SOLO PARA EL VENDEDOR
 * ------------------------------------------------------------
 *  Esta herramienta NO se instala en la PC del cliente.
 *  Vos la corrés en TU máquina para generar el código de
 *  renovación cuando un cliente paga.
 *
 *  Uso:
 *    node generar_licencia.js <control_actual> <dias> <secret>
 *
 *  Ejemplo (cliente pidió renovar 365 días, su clave es 11223344):
 *    node generar_licencia.js 2026060512340002 365 11223344
 *
 *  - control_actual : el código de 16 dígitos que te pasa el cliente
 *  - dias           : cuántos días le renovás (30 = un mes, 365 = un año)
 *  - secret         : la clave secreta de ESE cliente (la que pusiste
 *                     en su .env como LICENSE_SECRET_NUM)
 *
 *  Te devuelve el CÓDIGO NUEVO que el cliente ingresa en su sistema.
 * ============================================================
 */

function soloDigitos(v) {
  return String(v || '').replace(/\D/g, '');
}

function pad(value, len) {
  return String(value).padStart(len, '0');
}

function fechaNum(date) {
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1, 2);
  const d = pad(date.getDate(), 2);
  return `${y}${m}${d}`; // YYYYMMDD
}

function calcularFirma(controlActual, fechaNumStr, secretStr) {
  const control = BigInt(soloDigitos(controlActual) || '0');
  const fecha = BigInt(soloDigitos(fechaNumStr) || '0');
  const secret = BigInt(soloDigitos(secretStr) || '0');
  const mixed = (control * 97n + fecha * 13n + secret * 31n) % 100000000n;
  return pad(String(mixed), 8);
}

function main() {
  const [, , controlArg, diasArg, secretArg] = process.argv;

  if (!controlArg || !diasArg || !secretArg) {
    console.log('\nUso:  node generar_licencia.js <control_actual> <dias> <secret>\n');
    console.log('Ejemplo:  node generar_licencia.js 2026060512340002 365 11223344\n');
    process.exit(1);
  }

  const controlActual = soloDigitos(controlArg).slice(0, 16);
  const dias = Number(soloDigitos(diasArg));
  const secret = soloDigitos(secretArg);

  if (!/^\d{16}$/.test(controlActual)) {
    console.error('ERROR: el control actual debe tener 16 dígitos.');
    process.exit(1);
  }
  if (!Number.isFinite(dias) || dias <= 0) {
    console.error('ERROR: los días deben ser un número mayor a 0.');
    process.exit(1);
  }
  if (!secret) {
    console.error('ERROR: falta la clave secreta del cliente.');
    process.exit(1);
  }

  const objetivo = new Date();
  objetivo.setHours(0, 0, 0, 0);
  objetivo.setDate(objetivo.getDate() + dias);

  const fNum = fechaNum(objetivo);
  const nuevoControl = `${fNum}${calcularFirma(controlActual, fNum, secret)}`;

  console.log('\n========================================');
  console.log('  Vence el:        ', `${fNum.slice(6, 8)}/${fNum.slice(4, 6)}/${fNum.slice(0, 4)}`);
  console.log('  CÓDIGO NUEVO:    ', nuevoControl);
  console.log('========================================');
  console.log('  → Pasale este código al cliente para que lo ingrese.\n');
}

main();
