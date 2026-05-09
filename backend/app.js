require('dotenv').config();
const express      = require("express");
const cors         = require("cors");
const path         = require("path");
const jwt          = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const { auditContextMiddleware, softAuthMiddleware } = require("./middlewares/auditContext.middleware");
const { ensureComisionSchema } = require("./services/comision.service");
const { ensureMesaSchema } = require("./services/mesa.service");
const { ensureAuditoriaSchema } = require("./services/auditoria.service");
const { ensureProgramasSchema } = require("./services/programas.service");
const { ensureCajaSchema } = require("./services/caja.service");
const { ensurePermisosSchema } = require("./services/permisos.service");
const { ensureLoteSchema } = require("./services/lote.schema.service");
const { ensureMonedaSchema } = require("./services/moneda.schema.service");
const { ensureOperacionCatalogSchema } = require("./services/operacion.catalog.service");
const { ensureMenuDigitalSchema } = require("./services/menu_digital.service");
const { ensureKitchenPrintSchema } = require("./services/cocina_print.service");
const { ensureTerminalConfigSchema } = require("./services/terminal_config.service");
const { ensureSchemaCompat } = require("./services/schema_compat.service");
const { POS_SIN_COCINA } = require("./config/pos.mode");

const JWT_SECRET       = "stoptop_secret_2024";
const PAGINAS_PUBLICAS = ["/login/login.html"];
const DEV_MODE         = true; 
const ASSET_VERSION    = process.env.ASSET_VERSION || "2026.04.17.03";
const authMiddleware = require("./Auth.middleware");
const app = express();

function setNoStoreHeaders(res) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
}

function setStaticHeaders(res, filePath) {
  const ext = path.extname(filePath || "").toLowerCase();
  const base = path.basename(filePath || "").toLowerCase();
  const isUpload = String(filePath || "").toLowerCase().includes(`${path.sep}uploads${path.sep}`);

  res.setHeader("X-Asset-Version", ASSET_VERSION);

  if (base === "sw.js" || ext === ".html" || base === "manifest.json") {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    return;
  }

  const staticExt = new Set([
    ".css", ".js", ".mjs", ".map",
    ".png", ".jpg", ".jpeg", ".webp", ".svg", ".ico",
    ".woff", ".woff2", ".ttf", ".otf"
  ]);

  if (staticExt.has(ext)) {
    if (isUpload) {
      res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
      return;
    }

    res.setHeader("Cache-Control", "public, max-age=604800, stale-while-revalidate=86400");
    return;
  }

  res.setHeader("Cache-Control", "public, max-age=3600");
}

app.use("/recursos", express.static(path.join(__dirname, "../frontend/recursos"), {
  etag: true,
  lastModified: true,
  setHeaders: setStaticHeaders
}));



/* ==============================
   CONFIGURACION BASE
============================== */

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(softAuthMiddleware);
app.use(auditContextMiddleware);
app.use((req, res, next) => {
  res.setHeader("X-Asset-Version", ASSET_VERSION);
  next();
});
app.use("/api", (req, res, next) => {
  setNoStoreHeaders(res);
  next();
});

/* ==============================
   RUTAS API
============================== */

/* ==============================
   HEALTHCHECK LAN
============================== */
app.get("/api/health", (req, res) => {
  res.json({ ok: true, app: "libreriasys", ts: new Date().toISOString() });
});

app.use("/api/auth",             require("./routes/auth.routes"));
app.use("/api/empresa",          require("./routes/empresa.routes"));
app.use("/api/terminal",         require("./routes/terminal.routes"));
app.use("/api/usuarios",         require("./routes/usuarios.routes"));
app.use("/api/clientes",         require("./routes/clientes.routes"));
app.use("/api/productos",        require("./routes/productos.routes"));
app.use("/api/categorias",       require("./routes/categorias.routes"));
app.use("/api/venta",            require("./routes/venta.routes"));
app.use("/api/mesa",             require("./routes/mesa.routes"));
app.use("/api/compra",           require("./routes/compra.routes"));
app.use("/api/sorteo",           require("./routes/sorteo.routes"));
app.use("/api/proveedores",      require("./routes/proveedores.routes"));
app.use("/api/operacion",        require("./routes/operacion.routes"));
app.use("/api/forma-pago",       require("./routes/forma_pago.routes"));
app.use("/api/tipo-pedido",      require("./routes/tipo_pedido.route"));
app.use("/api/comprador",        require("./routes/comprador.routes"));
app.use("/api/moneda",           require("./routes/moneda.routes"));
app.use("/api/vendedor",         require("./routes/vendedor.routes"));
app.use("/api/productos-precio", require("./routes/productosPrecio.routes"));
app.use("/api/auditoria",        require("./routes/auditoria.routes"));
app.use("/api/config",           authMiddleware, require("./routes/config.routes"));
app.use("/api/caja",             require("./routes/caja.routes"));
app.use("/api/cotizacion",       require("./routes/cotizacion.routes"));
const reportesRoutes = require("./routes/reportes.routes");
app.use("/api/reportes", reportesRoutes);
app.use("/api/reportes-ia", reportesRoutes);
const modeloFacturaRoutes = require("./routes/modelo_factura.routes");
app.use("/api/modelo_factura", modeloFacturaRoutes);
const facturaRoutes = require("./routes/factura.routes");
app.use("/api/factura", facturaRoutes);
const permisosRoutes = require('./routes/permisos.routes');
app.use('/api/permisos', authMiddleware, permisosRoutes);
app.use('/api/produccion',      require('./routes/produccion.routes'));
app.use('/api/recetas',         require('./routes/receta.routes'));
app.use('/api/programas',       authMiddleware, require('./routes/programas.routes'));
app.use("/api/menu-digital",    require("./routes/menu_digital.routes"));
app.use("/admin/apk",           authMiddleware, require("./routes/admin_apk.routes"));



//libera api  

// PUBLICO (SIN LOGIN)
app.use("/api/print-preview", require("./routes/print.routes"));

app.get("/menu/:slug", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/modulos/menu_digital/menu_publico.html"));
});

// pRIVADO (CON LOGIN)
app.use("/api/print", authMiddleware, require("./routes/print.routes"));

/* ==============================
   PROTECCION DE HTML
============================== */

app.use((req, res, next) => {

  if (DEV_MODE) return next();

  if (!req.path.endsWith(".html")) return next();
  if (PAGINAS_PUBLICAS.includes(req.path)) return next();

  const token = req.cookies?.token;

 if (!token) return res.redirect("/login/login.html");

  try {
    jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    res.clearCookie("token");
    return res.redirect("/login/login.html");
  }

});

/* ==============================
   SERVIR FRONTEND
============================== */
app.use("/uploads", express.static(path.join(__dirname, "uploads"), {
  etag: true,
  lastModified: true,
  setHeaders: setStaticHeaders
}));

app.use(express.static(path.join(__dirname, "../frontend"), {
  etag: true,
  lastModified: true,
  setHeaders: setStaticHeaders
}));

/* ==============================
   ERROR HANDLER GLOBAL
   Red de seguridad: captura errores no manejados y devuelve detalle
   util (codigo PostgreSQL + explicacion) en vez de 500 silencioso.
============================== */
const { globalErrorMiddleware } = require("./services/errorFormatter.service");
app.use(globalErrorMiddleware);

/* ==============================
   PUERTO SERVIDOR
============================== */

const PORT = Number(process.env.PORT) || 3000;

async function bootstrapSchemas() {
  try {
    await ensureSchemaCompat();
  } catch (error) {
    console.error("No se pudo aplicar compatibilidad de esquema (proveedor/comprador/cotizacion/usuario):", error.message);
  }

  try {
    await ensureComisionSchema();
  } catch (error) {
    console.error("No se pudo preparar esquema de comisiones:", error.message);
  }

  try {
    await ensureMesaSchema();
  } catch (error) {
    console.error("No se pudo preparar esquema de mesas:", error.message);
  }

  try {
    await ensureAuditoriaSchema();
  } catch (error) {
    console.error("No se pudo preparar esquema de auditoria:", error.message);
  }

  try {
    await ensureProgramasSchema();
  } catch (error) {
    console.error("No se pudo preparar esquema de programas:", error.message);
  }

  try {
    await ensureCajaSchema();
  } catch (error) {
    console.error("No se pudo preparar esquema de caja:", error.message);
  }

  try {
    await ensurePermisosSchema();
  } catch (error) {
    console.error("No se pudo preparar esquema de permisos:", error.message);
  }

  try {
    await ensureLoteSchema();
  } catch (error) {
    console.error("No se pudo preparar esquema de lotes:", error.message);
  }

  try {
    await ensureMonedaSchema();
  } catch (error) {
    console.error("No se pudo preparar esquema de moneda/multimoneda:", error.message);
  }

  try {
    await ensureOperacionCatalogSchema();
  } catch (error) {
    console.error("No se pudo preparar catalogo de operaciones:", error.message);
  }

  try {
    await ensureMenuDigitalSchema();
  } catch (error) {
    console.error("No se pudo preparar esquema de menu digital:", error.message);
  }

  if (!POS_SIN_COCINA) {
    try {
      await ensureKitchenPrintSchema();
    } catch (error) {
      console.error("No se pudo preparar esquema de cocina print:", error.message);
    }
  }

  try {
    await ensureTerminalConfigSchema();
  } catch (error) {
    console.error("No se pudo preparar configuracion extendida de terminal:", error.message);
  }
}

/* Escuchar ya: bootstrapSchemas() puede tardar o bloquearse en DDL (bloqueos PostgreSQL).
 * Si await bootstrapSchemas antes de listen(), el proceso parece "no ejecutarse" (sin mensaje de puerto). */
app.listen(PORT, "0.0.0.0", () => {
  console.log(` Servidor ejecutandose en puerto ${PORT}`);
});

setImmediate(() => {
  bootstrapSchemas()
    .then(() => {
      console.log(" Migraciones de esquema finalizadas.");
    })
    .catch((err) => {
      console.error(" Migraciones de esquema (error global):", err?.message || err);
    });
});








