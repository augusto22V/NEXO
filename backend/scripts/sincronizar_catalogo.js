/**
 * Copia el catalogo (productos, precios, stock, fotos, servicios y datos) de la PC a internet.
 * Uso: node scripts/sincronizar_catalogo.js
 * Necesita CATALOGO_NUBE_URL en backend/.env (lo deja configurar_catalogo_internet.bat).
 * El sistema abierto en la PC ya lo hace solo cada 10 minutos; esto es para hacerlo a mano.
 */
require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const { sincronizarCatalogo, nubeConfigurada } = require("../services/catalogo_sync.service");

/** Visita la pagina en internet para que Render no la apague por falta de visitas. */
async function despertarPagina() {
  const base = String(process.env.CATALOGO_PUBLIC_URL || "").trim().replace(/\/+$/, "");
  if (!/^https:\/\//i.test(base)) return;
  try {
    const r = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(90000) });
    console.log(`  Pagina en internet: ${r.ok ? "despierta" : `respondio ${r.status}`}`);
  } catch (error) {
    console.log("  No se pudo visitar la pagina en internet:", error.message);
  }
}

(async () => {
  // Primero se despierta la pagina (en paralelo con la copia), asi los clientes no esperan.
  const despertar = despertarPagina();
  if (!nubeConfigurada()) {
    console.error("Falta CATALOGO_NUBE_URL en backend/.env. Ejecuta configurar_catalogo_internet.bat primero.");
    process.exit(1);
  }
  try {
    const r = await sincronizarCatalogo();
    if (r.omitida) {
      console.log("El sistema abierto ya estaba copiando el catalogo en este momento. Listo, no hace falta repetir.");
      await despertar;
      process.exit(0);
    }
    console.log("Listo. Catalogo en internet actualizado:");
    console.log(`  Productos: ${r.productos}  Categorias: ${r.categorias}  Precios: ${r.precios}  Servicios: ${r.servicios}`);
    console.log(`  Fotos nuevas: ${r.fotos_subidas}  Sin cambios: ${r.fotos_sin_cambios}  No encontradas: ${r.fotos_no_encontradas}`);
    if (r.filas_con_error) console.log(`  Ojo: ${r.filas_con_error} filas no se pudieron copiar (ver mensajes arriba).`);
    console.log(`  Tiempo: ${r.segundos} s`);
    await despertar;
    process.exit(0);
  } catch (error) {
    console.error("No se pudo copiar el catalogo:", error.message);
    await despertar;
    process.exit(1);
  }
})();
