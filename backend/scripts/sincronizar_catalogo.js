/**
 * Copia el catalogo (productos, precios, stock, fotos, servicios y datos) de la PC a internet.
 * Uso: node scripts/sincronizar_catalogo.js
 * Necesita CATALOGO_NUBE_URL en backend/.env (lo deja configurar_catalogo_internet.bat).
 * El sistema abierto en la PC ya lo hace solo cada 10 minutos; esto es para hacerlo a mano.
 */
require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const { sincronizarCatalogo, nubeConfigurada } = require("../services/catalogo_sync.service");

(async () => {
  if (!nubeConfigurada()) {
    console.error("Falta CATALOGO_NUBE_URL en backend/.env. Ejecuta configurar_catalogo_internet.bat primero.");
    process.exit(1);
  }
  try {
    const r = await sincronizarCatalogo();
    if (r.omitida) {
      console.log("El sistema abierto ya estaba copiando el catalogo en este momento. Listo, no hace falta repetir.");
      process.exit(0);
    }
    console.log("Listo. Catalogo en internet actualizado:");
    console.log(`  Productos: ${r.productos}  Categorias: ${r.categorias}  Precios: ${r.precios}  Servicios: ${r.servicios}`);
    console.log(`  Fotos nuevas: ${r.fotos_subidas}  Sin cambios: ${r.fotos_sin_cambios}  No encontradas: ${r.fotos_no_encontradas}`);
    if (r.filas_con_error) console.log(`  Ojo: ${r.filas_con_error} filas no se pudieron copiar (ver mensajes arriba).`);
    console.log(`  Tiempo: ${r.segundos} s`);
    process.exit(0);
  } catch (error) {
    console.error("No se pudo copiar el catalogo:", error.message);
    process.exit(1);
  }
})();
