/**
 * Servidor liviano para internet: SOLO el catalogo publico.
 *
 * Se usa en Render con CATALOGO_SOLO=true. El sistema completo (caja, ventas, usuarios, etc.)
 * sigue corriendo en la PC del negocio con su base local; aca solo se muestran los productos
 * (copiados desde la PC por catalogo_sync) y se reciben pedidos y consultas.
 */
require("dotenv").config();
const express = require("express");
const path = require("path");
const db = require("./db");
const { ensureArchivosSchema, servirDesdeBase } = require("./services/archivos_db.service");
const { ensureCatalogoSchema, getDefaultPublishedSlug } = require("./services/catalogo.service");

const app = express();
const FRONTEND = path.join(__dirname, "../frontend");
const PAGINA = path.join(FRONTEND, "modulos/catalogo/catalogo_publico.html");

app.disable("x-powered-by");
app.set("trust proxy", true);
app.use(express.json({ limit: "200kb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, app: "catalogo", ts: new Date().toISOString() });
});

// Solo la parte publica de la API del catalogo (la administracion queda en la PC).
const catalogoRouter = require("./routes/catalogo.routes");
app.use("/api/catalogo", (req, res, next) => {
  if (!req.path.startsWith("/publico/")) return res.status(404).json({ error: "No disponible" });
  return catalogoRouter(req, res, next);
});

async function irAlCatalogo(_req, res) {
  try {
    const slug = await getDefaultPublishedSlug(db);
    if (slug) return res.redirect(`/catalogo/${encodeURIComponent(slug)}`);
  } catch (error) {
    console.error("No se pudo resolver el catalogo:", error.message);
  }
  res.sendFile(PAGINA);
}

app.get("/", irAlCatalogo);
app.get("/catalogo", irAlCatalogo);
app.get("/catalogo/:slug", (_req, res) => {
  res.setHeader("Cache-Control", "no-cache");
  res.sendFile(PAGINA);
});

// Archivos que usa la pagina publica
const estaticos = { maxAge: "1d", fallthrough: true };
app.use("/modulos/catalogo", (req, res, next) => {
  if (!/^\/catalogo_publico\.(css|js)$/.test(req.path)) return next();
  // Sin cache larga: cada cambio publicado se ve al recargar (el navegador revalida con etag).
  return express.static(path.join(FRONTEND, "modulos/catalogo"), { maxAge: 0 })(req, res, next);
});
app.use("/recursos/css", express.static(path.join(FRONTEND, "recursos/css"), estaticos));
app.use("/recursos/webfonts", express.static(path.join(FRONTEND, "recursos/webfonts"), estaticos));
app.use("/recursos/img", express.static(path.join(FRONTEND, "recursos/img"), estaticos));
app.use("/recursos", servirDesdeBase("/recursos"));
app.use("/uploads", express.static(path.join(__dirname, "uploads"), estaticos));
app.use("/uploads", servirDesdeBase("/uploads"));

// Todo lo demas (pantallas del sistema) no existe en internet: se manda al catalogo.
app.use((req, res) => {
  if (req.method === "GET" && req.accepts("html") && !req.path.startsWith("/api/")) {
    return res.redirect("/catalogo");
  }
  res.status(404).json({ error: "No disponible" });
});

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(` Catalogo online (solo catalogo) en puerto ${PORT}`);
});

(async () => {
  try {
    await ensureArchivosSchema();
    await ensureCatalogoSchema();
    console.log(" Catalogo listo.");
  } catch (error) {
    console.error(" No se pudo preparar la base del catalogo:", error.message);
  }
})();
