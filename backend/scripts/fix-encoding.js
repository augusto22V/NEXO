/**
 * Fix encoding script: arregla mojibake comun (UTF-8 leido como CP-1252)
 *
 *   CÃ³digo  → Código
 *   AcciÃ³n  → Acción
 *   Ã³ Ã© Ã± Ã¡ Ã­ Ãº → ó é ñ á í ú
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..", "frontend");

// Pares from→to. Lo más específico arriba.
const REPLACEMENTS = [
  ["Ã¡", "á"],
  ["Ã©", "é"],
  ["Ã­", "í"],
  ["Ã³", "ó"],
  ["Ãº", "ú"],
  ["Ã±", "ñ"],
  ["Ã¼", "ü"],
  ["Â¿", "¿"],
  ["Â¡", "¡"],
  ["Â°", "°"],
  ["Â²", "²"]
];

const EXTENSIONES = [".html", ".js", ".css"];
const EXCLUIR = ["node_modules", ".git", "uploads"];

let archivosModificados = 0;
let totalReemplazos = 0;

function procesarArchivo(file) {
  const ext = path.extname(file).toLowerCase();
  if (!EXTENSIONES.includes(ext)) return;

  let contenido = fs.readFileSync(file, "utf8");
  const original = contenido;
  let reemplazosLocales = 0;

  for (const [from, to] of REPLACEMENTS) {
    if (contenido.includes(from)) {
      const matches = contenido.split(from).length - 1;
      reemplazosLocales += matches;
      contenido = contenido.split(from).join(to);
    }
  }

  if (contenido !== original) {
    fs.writeFileSync(file, contenido, "utf8");
    archivosModificados++;
    totalReemplazos += reemplazosLocales;
    console.log(`  ${path.relative(ROOT, file)}  (${reemplazosLocales} fix)`);
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

console.log(`\n=== Reparando encoding mojibake en frontend ===\n`);
recorrer(ROOT);
console.log(`\n=== LISTO ===`);
console.log(`  ${archivosModificados} archivos modificados`);
console.log(`  ${totalReemplazos} reemplazos\n`);
