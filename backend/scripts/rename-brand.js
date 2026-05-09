/**
 * Rename script: LibreríaSys → NEXO en todo el frontend
 * Uso: node scripts/rename-brand.js
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..", "frontend");
const REPLACEMENTS = [
  ["LIBRERÍASYS", "NEXO"],
  ["LIBRERIASYS", "NEXO"],
  ["LibreríaSys", "NEXO"],
  ["LibreriaSys", "NEXO"],
  ["libreriaSys", "nexo"],
  ["libreriasys", "nexo"]
];

const EXTENSIONES = [".html", ".js", ".css", ".json"];
const EXCLUIR = ["node_modules", ".git", "uploads", "recursos"];

let archivosModificados = 0;
let totalReemplazos = 0;

function procesarArchivo(file) {
  const ext = path.extname(file).toLowerCase();
  if (!EXTENSIONES.includes(ext)) return;

  let contenido = fs.readFileSync(file, "utf8");
  const original = contenido;
  let reemplazosLocales = 0;

  for (const [from, to] of REPLACEMENTS) {
    const regex = new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
    const matches = contenido.match(regex);
    if (matches) {
      reemplazosLocales += matches.length;
      contenido = contenido.replace(regex, to);
    }
  }

  if (contenido !== original) {
    fs.writeFileSync(file, contenido, "utf8");
    archivosModificados++;
    totalReemplazos += reemplazosLocales;
    console.log(`  ✓ ${path.relative(ROOT, file)}  (${reemplazosLocales} reemplazos)`);
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

console.log(`\n=== Renombrando branding LibreriaSys → NEXO ===\n`);
recorrer(ROOT);
console.log(`\n=== LISTO ===`);
console.log(`  ${archivosModificados} archivos modificados`);
console.log(`  ${totalReemplazos} reemplazos en total\n`);
