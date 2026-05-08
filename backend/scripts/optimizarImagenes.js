const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

/* 📂 CARPETAS */
const carpetas = [
  {
    ruta: path.join(__dirname, "../uploads/productos"),
    nombre: "PRODUCTOS",
    size: 800
  },
  {
    ruta: path.join(__dirname, "../uploads/categorias"),
    nombre: "CATEGORIAS",
    size: 600 // un poco más chico porque son iconos
  }
];

async function optimizarCarpeta(carpetaConfig) {

  const { ruta, nombre, size } = carpetaConfig;

  if (!fs.existsSync(ruta)) {
    console.log(`⚠️ Carpeta no encontrada: ${nombre}`);
    return;
  }

  const archivos = fs.readdirSync(ruta);

  console.log(`\n🚀 PROCESANDO ${nombre}...\n`);

  for (const archivo of archivos) {

    const rutaOriginal = path.join(ruta, archivo);

    // ignorar carpetas
    if (fs.lstatSync(rutaOriginal).isDirectory()) continue;

    // ignorar webp ya procesados
    if (archivo.endsWith(".webp")) continue;

    try {

      const nombreBase = archivo.substring(0, archivo.lastIndexOf("."));
      const nombreNuevo = nombreBase + ".webp";
      const rutaNueva = path.join(ruta, nombreNuevo);

      await sharp(rutaOriginal)
        .resize(size)
        .webp({ quality: 75 })
        .toFile(rutaNueva);

      fs.unlinkSync(rutaOriginal);

      console.log(`✔ ${archivo} → ${nombreNuevo}`);

    } catch (err) {
      console.error(`❌ Error en ${archivo}:`, err.message);
    }
  }

  console.log(`✅ ${nombre} TERMINADO`);
}

async function optimizarTodo() {

  for (const carpeta of carpetas) {
    await optimizarCarpeta(carpeta);
  }

  console.log("\n🔥 TODO OPTIMIZADO (PRODUCTOS + CATEGORIAS)");
}

optimizarTodo();



/*

EJECUTAR CON ESTO OJO ENTRAR EN SYS. BACKEND Y 
   node scripts/optimizarImagenes.js
 
   
UPDATE producto
SET imagen = REPLACE(imagen, '.jpg', '.webp');

UPDATE producto
SET imagen = REPLACE(imagen, '.png', '.webp');

UPDATE producto
SET imagen = REPLACE(imagen, '.jpeg', '.webp');

UPDATE categoria
SET imagen = REPLACE(imagen, '.jpg', '.webp');

UPDATE categoria
SET imagen = REPLACE(imagen, '.png', '.webp');

UPDATE categoria
SET imagen = REPLACE(imagen, '.jpeg', '.webp'); 

*/