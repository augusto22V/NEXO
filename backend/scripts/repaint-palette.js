/**
 * Reemplaza colores hardcoded en TODOS los CSS del frontend por la
 * paleta ALPX Systems (lavanda + tan + crema).
 *
 * Mapeo:
 *   teal/cyan principal viejo  → lavanda principal #7B6BAD
 *   teal hover viejo            → lavanda hover #5E4F8E
 *   blues genericos             → lavanda
 *   acentos turquesa/cyan       → tan #998270
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..", "frontend");

// Mapeo de colores (lo más específico arriba — case insensitive lo manejamos al matcher)
const REPLACEMENTS = [
  // === Color-principal viejos (teal/cyan) → lavanda ALPX ===
  ["#147696", "#7B6BAD"],   // teal principal histórico
  ["#147695", "#7B6BAD"],
  ["#418F9E", "#5E4F8E"],   // teal hover
  ["#418f9e", "#5E4F8E"],
  ["#1a6474", "#5E4F8E"],   // teal de caja/cobro
  ["#1A6474", "#5E4F8E"],
  ["#0f4a58", "#3F3463"],   // teal hover oscuro
  ["#0F4A58", "#3F3463"],
  ["#0e6b8e", "#5E4F8E"],

  // === Azules genéricos comunes en Material/Bootstrap → lavanda ===
  ["#2196f3", "#7B6BAD"],
  ["#2196F3", "#7B6BAD"],
  ["#1976d2", "#5E4F8E"],
  ["#1976D2", "#5E4F8E"],
  ["#1565c0", "#5E4F8E"],
  ["#1565C0", "#5E4F8E"],
  ["#0288d1", "#7B6BAD"],
  ["#0288D1", "#7B6BAD"],
  ["#03A9F4", "#7B6BAD"],
  ["#03a9f4", "#7B6BAD"],
  ["#1A73E8", "#7B6BAD"],
  ["#1a73e8", "#7B6BAD"],

  // === Cyans/turquesas → tan (acento) ===
  ["#17a2b8", "#998270"],
  ["#17A2B8", "#998270"],
  ["#138496", "#75614F"],

  // === Verde teal de bootstrap (no confundir con verde success) ===
  ["#20c997", "#998270"],
  ["#20C997", "#998270"],

  // === Header oscuro: si es 1F1F1F dejalo; si es 0d2535 (azul oscuro) → violeta oscuro ===
  ["#0d2535", "#2A2336"],
  ["#0D2535", "#2A2336"]
];

const EXCLUIR = ["node_modules", ".git", "uploads", "img", "recursos"];

let archivosModificados = 0;
let totalReemplazos = 0;

function procesarArchivo(file) {
  if (path.extname(file).toLowerCase() !== ".css") return;

  let contenido = fs.readFileSync(file, "utf8");
  const original = contenido;
  let reemplazosLocales = 0;

  for (const [from, to] of REPLACEMENTS) {
    if (contenido.includes(from)) {
      const cnt = contenido.split(from).length - 1;
      reemplazosLocales += cnt;
      contenido = contenido.split(from).join(to);
    }
  }

  if (contenido !== original) {
    fs.writeFileSync(file, contenido, "utf8");
    archivosModificados++;
    totalReemplazos += reemplazosLocales;
    console.log(`  ${path.relative(ROOT, file)}  (${reemplazosLocales})`);
  }
}

function recorrer(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (EXCLUIR.includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) recorrer(full);
    else procesarArchivo(full);
  }
}

console.log(`\n=== Repintando frontend con paleta ALPX ===\n`);
recorrer(ROOT);
console.log(`\n=== LISTO ===`);
console.log(`  ${archivosModificados} archivos modificados`);
console.log(`  ${totalReemplazos} colores reemplazados\n`);
