/**
 * Sincroniza el catalogo de la base LOCAL (la PC del negocio) hacia la base de la NUBE (Neon),
 * donde corre solo la pagina publica del catalogo (modo CATALOGO_SOLO en Render).
 *
 * Copia unicamente lo que el catalogo necesita: empresa, categorias, productos, precio de venta
 * activo, stock, configuracion y servicios del catalogo, y las fotos que usan.
 * Nunca toca ventas, cajas, usuarios ni nada del resto del sistema.
 * Los pedidos de clientes viven en la nube (catalogo_pedido) y la PC los lee de alli.
 *
 * Se activa con CATALOGO_NUBE_URL en backend/.env (la direccion postgresql:// de Neon).
 */
const fs = require("fs");
require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const path = require("path");
const crypto = require("crypto");
const { Pool } = require("pg");
const localDb = require("../db");
const { ensureCatalogoSchema } = require("./catalogo.service");

const BACKEND_DIR = path.join(__dirname, "..");
const FRONTEND_DIR = path.join(__dirname, "../../frontend");

const MIME = {
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml"
};

let nubePool = null;
let enCurso = null;
const estado = { ultima: null, ok: null, mensaje: "", resumen: null };

function nubeUrl() {
  return String(process.env.CATALOGO_NUBE_URL || "").trim();
}

function nubeConfigurada() {
  return Boolean(nubeUrl());
}

/** Conexion a la base de la nube (se reutiliza). */
function getNubePool() {
  if (!nubeConfigurada()) return null;
  if (!nubePool) {
    nubePool = new Pool({
      connectionString: nubeUrl(),
      ssl: { rejectUnauthorized: false },
      max: 3,
      connectionTimeoutMillis: 15000,
      idleTimeoutMillis: 30000
    });
    nubePool.on("error", (err) => console.error("Catalogo nube: error de conexion", err.message));
  }
  return nubePool;
}

async function columnas(q, tabla) {
  const r = await q.query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1`,
    [tabla]
  );
  return new Set(r.rows.map((x) => x.column_name));
}

/** Tablas minimas por si la base de la nube esta vacia (si ya existen, no se tocan). */
async function asegurarTablasNube(nube) {
  await nube.query(`
    CREATE TABLE IF NOT EXISTS empresa (
      id SERIAL PRIMARY KEY, nombre TEXT, logo TEXT, telefono TEXT, direccion TEXT
    )`);
  await nube.query(`
    CREATE TABLE IF NOT EXISTS categoria (
      id SERIAL PRIMARY KEY, nombre TEXT, imagen TEXT, activo BOOLEAN DEFAULT true
    )`);
  await nube.query(`
    CREATE TABLE IF NOT EXISTS producto (
      id SERIAL PRIMARY KEY, nombre TEXT, descripcion TEXT, imagen TEXT, stock NUMERIC DEFAULT 0,
      activo BOOLEAN DEFAULT true, categoria_id INTEGER, unidad_medida TEXT, codigo_barra TEXT
    )`);
  await nube.query(`
    CREATE TABLE IF NOT EXISTS producto_precio (
      id SERIAL PRIMARY KEY, producto_id INTEGER, precio_venta NUMERIC DEFAULT 0, activo BOOLEAN DEFAULT true
    )`);
  await nube.query(`
    CREATE TABLE IF NOT EXISTS archivo_subido (
      ruta text PRIMARY KEY, mime text NOT NULL, datos bytea NOT NULL, actualizado timestamptz NOT NULL DEFAULT now()
    )`);
  await ensureCatalogoSchema(nube);
}

function valorPara(v) {
  if (v !== null && typeof v === "object" && !(v instanceof Date) && !Buffer.isBuffer(v)) return JSON.stringify(v);
  return v;
}

/**
 * Inserta o actualiza filas (por `clave`) copiando las columnas que existen en ambas bases.
 * Si una fila falla con todas las columnas (por ejemplo una referencia que no existe en la nube),
 * reintenta solo con las columnas basicas que necesita el catalogo.
 */
async function upsertFilas(nube, tabla, filas, { clave = "id", basicas = [] } = {}) {
  if (!filas.length) return { ok: 0, fallidas: 0 };
  const destino = await columnas(nube, tabla);
  const todas = Object.keys(filas[0]).filter((c) => destino.has(c));
  const minimas = [clave, ...basicas].filter((c) => destino.has(c) && todas.includes(c));
  let ok = 0;
  let fallidas = 0;

  const sqlPara = (cols) => {
    const lista = cols.map((c) => `"${c}"`).join(", ");
    const params = cols.map((_, i) => `$${i + 1}`).join(", ");
    const sets = cols.filter((c) => c !== clave).map((c) => `"${c}" = EXCLUDED."${c}"`).join(", ");
    return `INSERT INTO "${tabla}" (${lista}) VALUES (${params})
            ON CONFLICT ("${clave}") DO ${sets ? `UPDATE SET ${sets}` : "NOTHING"}`;
  };
  const sqlTodas = sqlPara(todas);
  const sqlMinimas = sqlPara(minimas);

  const client = await nube.connect();
  try {
    await client.query("BEGIN");
    for (const fila of filas) {
      await client.query("SAVEPOINT fila");
      try {
        await client.query(sqlTodas, todas.map((c) => valorPara(fila[c])));
        await client.query("RELEASE SAVEPOINT fila");
        ok += 1;
      } catch (_) {
        await client.query("ROLLBACK TO SAVEPOINT fila");
        try {
          await client.query(sqlMinimas, minimas.map((c) => valorPara(fila[c])));
          await client.query("RELEASE SAVEPOINT fila");
          ok += 1;
        } catch (error) {
          await client.query("ROLLBACK TO SAVEPOINT fila");
          fallidas += 1;
          console.error(`Catalogo nube: no se pudo copiar ${tabla} ${clave}=${fila[clave]}:`, error.message);
        }
      }
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
  return { ok, fallidas };
}

/** Lee el archivo de una foto desde el disco local o, si no esta, desde la tabla local archivo_subido. */
async function leerFotoLocal(ruta) {
  const limpio = String(ruta || "").split("?")[0];
  if (!limpio.startsWith("/")) return null;
  const candidatos = [];
  if (limpio.startsWith("/uploads/")) candidatos.push(path.join(BACKEND_DIR, limpio));
  else candidatos.push(path.join(FRONTEND_DIR, limpio));
  for (const archivo of candidatos) {
    const normal = path.normalize(archivo);
    if (!normal.startsWith(BACKEND_DIR) && !normal.startsWith(FRONTEND_DIR)) continue;
    if (fs.existsSync(normal) && fs.statSync(normal).isFile()) {
      return { datos: await fs.promises.readFile(normal), mime: MIME[path.extname(normal).toLowerCase()] || "application/octet-stream" };
    }
  }
  try {
    const r = await localDb.query("SELECT mime, datos FROM archivo_subido WHERE ruta = $1", [limpio]);
    if (r.rows.length) return { datos: r.rows[0].datos, mime: r.rows[0].mime };
  } catch (_) { /* tabla puede no existir */ }
  return null;
}

async function subirFotos(nube, rutas) {
  const unicas = [...new Set(rutas.map((r) => String(r || "").split("?")[0]).filter((r) => r.startsWith("/")))];
  if (!unicas.length) return { subidas: 0, iguales: 0, faltantes: 0 };

  const existentes = await nube.query(
    `SELECT ruta, md5(datos) AS hash FROM archivo_subido WHERE ruta = ANY($1::text[])`,
    [unicas]
  );
  const hashNube = new Map(existentes.rows.map((r) => [r.ruta, r.hash]));
  let subidas = 0;
  let iguales = 0;
  let faltantes = 0;

  for (const ruta of unicas) {
    const foto = await leerFotoLocal(ruta);
    if (!foto) { faltantes += 1; continue; }
    const hash = crypto.createHash("md5").update(foto.datos).digest("hex");
    if (hashNube.get(ruta) === hash) { iguales += 1; continue; }
    await nube.query(
      `INSERT INTO archivo_subido (ruta, mime, datos, actualizado) VALUES ($1, $2, $3, now())
       ON CONFLICT (ruta) DO UPDATE SET mime = EXCLUDED.mime, datos = EXCLUDED.datos, actualizado = now()`,
      [ruta, foto.mime, foto.datos]
    );
    subidas += 1;
  }
  return { subidas, iguales, faltantes };
}

async function ajustarSecuencia(nube, tabla) {
  try {
    await nube.query(
      `SELECT setval(pg_get_serial_sequence($1, 'id'), GREATEST((SELECT COALESCE(MAX(id), 1) FROM "${tabla}"), 1))`,
      [tabla]
    );
  } catch (_) { /* tabla sin secuencia */ }
}

const LOCK_ID = 774411; // candado en la nube: evita dos PCs/procesos copiando a la vez

async function sincronizarAhora() {
  const nube = getNubePool();
  if (!nube) throw new Error("Falta CATALOGO_NUBE_URL en backend/.env");
  const candado = await nube.connect();
  try {
    const r = await candado.query("SELECT pg_try_advisory_lock($1) AS ok", [LOCK_ID]);
    if (!r.rows[0].ok) return { omitida: true, motivo: "Otra copia ya estaba en curso" };
    try {
      return await copiarTodo(nube);
    } finally {
      await candado.query("SELECT pg_advisory_unlock($1)", [LOCK_ID]).catch(() => {});
    }
  } finally {
    candado.release();
  }
}

async function copiarTodo(nube) {
  const inicio = Date.now();

  await ensureCatalogoSchema();
  await asegurarTablasNube(nube);

  // 1) Empresa (nombre, logo, contacto)
  const empresas = (await localDb.query("SELECT * FROM empresa ORDER BY id")).rows;
  const rEmp = await upsertFilas(nube, "empresa", empresas, { basicas: ["nombre", "logo", "telefono", "direccion"] });

  // 2) Categorias
  const categorias = (await localDb.query("SELECT * FROM categoria ORDER BY id")).rows;
  const rCat = await upsertFilas(nube, "categoria", categorias, { basicas: ["nombre", "imagen", "activo"] });

  // 3) Productos (incluye stock). Los borrados en la PC se ocultan en la nube.
  const productos = (await localDb.query("SELECT * FROM producto ORDER BY id")).rows;
  const rProd = await upsertFilas(nube, "producto", productos, {
    basicas: ["nombre", "descripcion", "imagen", "stock", "activo", "categoria_id", "unidad_medida",
      "codigo_barra", "es_insumo", "es_servicio", "no_control_stock", "ocultar_catalogo"]
  });
  const idsProductos = productos.map((p) => p.id);
  await nube.query(`UPDATE producto SET activo = false WHERE NOT (id = ANY($1::int[])) AND activo = true`, [idsProductos]);

  // 4) Precio de venta activo de cada producto
  const precios = (await localDb.query(
    `SELECT * FROM producto_precio WHERE activo = true AND producto_id = ANY($1::int[]) ORDER BY id`,
    [idsProductos]
  )).rows;
  const rPrecio = await upsertFilas(nube, "producto_precio", precios, { basicas: ["producto_id", "precio_venta", "activo"] });
  await nube.query(`UPDATE producto_precio SET activo = false WHERE activo = true AND NOT (id = ANY($1::int[]))`, [precios.map((p) => p.id)]);

  // 5) Configuracion y servicios del catalogo
  const configs = (await localDb.query("SELECT * FROM catalogo_config ORDER BY id")).rows;
  for (const c of configs) {
    // La nube puede tener su propia fila (creada sola). Se reemplaza por la de la PC.
    await nube.query(`DELETE FROM catalogo_config WHERE empresa_id = $1 AND id <> $2`, [c.empresa_id, c.id]);
    await nube.query(`DELETE FROM catalogo_config WHERE slug = $1 AND id <> $2`, [c.slug, c.id]);
  }
  const rConf = await upsertFilas(nube, "catalogo_config", configs);
  const servicios = (await localDb.query("SELECT * FROM catalogo_servicio ORDER BY id")).rows;
  const rServ = await upsertFilas(nube, "catalogo_servicio", servicios);
  await nube.query(`DELETE FROM catalogo_servicio WHERE NOT (id = ANY($1::bigint[]))`, [servicios.map((s) => s.id)]);

  for (const t of ["empresa", "categoria", "producto", "producto_precio", "catalogo_config", "catalogo_servicio"]) {
    await ajustarSecuencia(nube, t);
  }

  // 6) Fotos usadas por el catalogo
  const rutasLogo = empresas.map((e) => (e.logo ? (String(e.logo).startsWith("/") ? e.logo : `/recursos/img/${e.logo}`) : null));
  const fotos = await subirFotos(nube, [
    ...rutasLogo,
    ...categorias.map((c) => c.imagen),
    ...productos.filter((p) => p.activo !== false).map((p) => p.imagen),
    ...servicios.map((s) => s.imagen_url)
  ]);

  const fallidas = rEmp.fallidas + rCat.fallidas + rProd.fallidas + rPrecio.fallidas + rConf.fallidas + rServ.fallidas;
  return {
    productos: rProd.ok,
    categorias: rCat.ok,
    precios: rPrecio.ok,
    servicios: rServ.ok,
    fotos_subidas: fotos.subidas,
    fotos_sin_cambios: fotos.iguales,
    fotos_no_encontradas: fotos.faltantes,
    filas_con_error: fallidas,
    segundos: Math.round((Date.now() - inicio) / 100) / 10
  };
}

/** Ejecuta una sincronizacion (si ya hay una en curso, espera esa). */
async function sincronizarCatalogo() {
  if (enCurso) return enCurso;
  enCurso = (async () => {
    try {
      const resumen = await sincronizarAhora();
      if (resumen.omitida) return { ...estado.resumen, omitida: true };
      Object.assign(estado, { ultima: new Date().toISOString(), ok: true, mensaje: "", resumen });
      return resumen;
    } catch (error) {
      Object.assign(estado, { ultima: new Date().toISOString(), ok: false, mensaje: error.message, resumen: null });
      throw error;
    } finally {
      enCurso = null;
    }
  })();
  return enCurso;
}

function estadoSincronizacion() {
  return { configurada: nubeConfigurada(), en_curso: Boolean(enCurso), ...estado };
}

/** Sincroniza sola cada N minutos mientras el sistema esta abierto en la PC. */
function iniciarSincronizacionAutomatica() {
  if (!nubeConfigurada()) return;
  const minutos = Math.max(2, Number(process.env.CATALOGO_SYNC_MINUTOS) || 10);
  const correr = () => sincronizarCatalogo()
    .then((r) => r && !r.omitida && console.log(`Catalogo nube sincronizado: ${r.productos} productos, ${r.fotos_subidas} fotos nuevas (${r.segundos}s)`))
    .catch((e) => console.error("Catalogo nube: no se pudo sincronizar:", e.message));
  setTimeout(correr, 20 * 1000);
  setInterval(correr, minutos * 60 * 1000).unref();
  console.log(`Catalogo nube: sincronizacion automatica cada ${minutos} minutos.`);
}

module.exports = {
  nubeConfigurada,
  getNubePool,
  sincronizarCatalogo,
  estadoSincronizacion,
  iniciarSincronizacionAutomatica
};
