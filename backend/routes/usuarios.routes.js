const express = require("express");
const router = express.Router();
const pool = require("../db");
const bcrypt = require("bcrypt");
const { ensurePermisosUsuario } = require("../services/permisos.service");
const { ensureUsuarioSchema } = require("../services/usuario.service");

// Aplica las migraciones de la tabla usuario antes de servir requests
router.use(async (_req, res, next) => {
  try {
    await ensureUsuarioSchema();
    next();
  } catch (err) {
    console.error("[USUARIO SCHEMA ERROR]", err);
    res.status(500).json({
      error: "No se pudo preparar esquema de usuario",
      detalle: err.message,
      codigo: err.code || null
    });
  }
});

const ROLES_VALIDOS = new Set([
  "super",
  "admin",
  "vendedor",
  "caixa",
  "consulta",
  "gerencia",
  "nota",
  "sis"
]);


/* ==============================
   LISTAR USUARIOS
============================== */

router.get("/", async (req,res)=>{

try{

const result = await pool.query(`
SELECT
  u.id,
  u.usuario,
  u.nombre,
  u.rol,
  u.activo,
  u.empresa_id,
  e.nombre AS empresa_nombre,
  u.modo_factura,
  u.modo_impresion,
  u.modo_confirmacion
FROM usuario u
LEFT JOIN empresa e ON e.id = u.empresa_id
ORDER BY u.empresa_id, u.id
`);

res.json(result.rows);

}catch(err){

console.error("[ERROR LISTAR USUARIOS]", err);
res.status(500).json({
  error: "Error al listar usuarios",
  detalle: err.message,
  codigo: err.code || null
});

}

});



/* ==============================
   CREAR USUARIO
============================== */

router.post("/", async (req,res)=>{

try{

const {
  usuario,
  password,
  nombre,
  rol,
  empresa_id,
  activo,
  modo_factura,
  modo_impresion,
  modo_confirmacion
} = req.body;

const usuarioUpper = usuario?.toUpperCase();
const rolLower = String(rol || "").trim().toLowerCase();
const empresaIdFinal = Number(empresa_id) > 0 ? Number(empresa_id) : 1;

if (!ROLES_VALIDOS.has(rolLower)) {
  return res.status(400).json({ error: "Rol invalido" });
}

if(!usuario || !password){
  return res.status(400).json({error:"Usuario y contraseña requeridos"});
}

// Validar que la empresa exista
const empresaExiste = await pool.query(`SELECT id FROM empresa WHERE id = $1`, [empresaIdFinal]);
if (!empresaExiste.rowCount) {
  return res.status(400).json({ error: `La empresa ${empresaIdFinal} no existe` });
}

// El nombre de usuario es UNICO por empresa (no global)
const existe = await pool.query(
  `SELECT id FROM usuario WHERE usuario=$1 AND empresa_id=$2`,
  [usuarioUpper, empresaIdFinal]
);

if(existe.rows.length > 0){
  return res.status(400).json({error:"El usuario ya existe en esta empresa"});
}

const hash = await bcrypt.hash(password,10);

const inserted = await pool.query(`
INSERT INTO usuario
(usuario,password,nombre,rol,activo,empresa_id,
 modo_factura,modo_impresion,modo_confirmacion)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
RETURNING id
`,
[
  usuarioUpper,
  hash,
  nombre,
  rolLower,
  activo,
  empresaIdFinal,
  (modo_factura || "PREGUNTAR").toUpperCase(),
  (modo_impresion || "AUTO").toUpperCase(),
  modo_confirmacion ?? false
]);

await ensurePermisosUsuario(inserted.rows[0].id);

res.json({ok:true, id: inserted.rows[0].id});

}catch(err){

console.error("[ERROR CREAR USUARIO]", err);
res.status(500).json({
  error: "Error al crear usuario",
  detalle: err.message,
  codigo: err.code || null,
  hint: err.hint || null,
  detail: err.detail || null
});

}

});



/* ==============================
   EDITAR USUARIO
============================== */

router.put("/:id", async (req, res) => {
  try {

    const {
      usuario,
      password,
      nombre,
      rol,
      empresa_id,
      activo,
      modo_factura,
      modo_impresion,
      modo_confirmacion
    } = req.body;

    // =========================
    // NORMALIZAR DATOS
    // =========================
    const usuarioUpper = usuario?.toUpperCase();
    const rolLower = String(rol || "").trim().toLowerCase();
    const mf = (modo_factura || "PREGUNTAR").toUpperCase();
    const mi = (modo_impresion || "AUTO").toUpperCase();
    const mc = modo_confirmacion ?? false;
    const empresaIdFinal = Number(empresa_id) > 0 ? Number(empresa_id) : null;

    if (!ROLES_VALIDOS.has(rolLower)) {
      return res.status(400).json({ error: "Rol invalido" });
    }

    // Validar que la empresa exista (si se proporcionó)
    if (empresaIdFinal) {
      const empresaExiste = await pool.query(
        `SELECT id FROM empresa WHERE id = $1`, [empresaIdFinal]
      );
      if (!empresaExiste.rowCount) {
        return res.status(400).json({ error: `La empresa ${empresaIdFinal} no existe` });
      }
    }

    // =========================
    // SI VIENE PASSWORD → actualizar con hash
    // =========================
    let updated;

    if (password && password !== "") {

      const hash = await bcrypt.hash(password, 10);

      updated = await pool.query(`
        UPDATE usuario
        SET usuario=$1,
            nombre=$2,
            password=$3,
            rol=$4,
            activo=$5,
            empresa_id=$6,
            modo_factura=$7,
            modo_impresion=$8,
            modo_confirmacion=$9
        WHERE id=$10
      RETURNING id`,
      [
        usuarioUpper,
        nombre,
        hash,
        rolLower,
        activo,
        empresaIdFinal,
        mf,
        mi,
        mc,
        req.params.id
      ]);

    } else {

      // =========================
      // SIN PASSWORD → no tocar contraseña
      // =========================
      updated = await pool.query(`
        UPDATE usuario
        SET usuario=$1,
            nombre=$2,
            rol=$3,
            activo=$4,
            empresa_id=$5,
            modo_factura=$6,
            modo_impresion=$7,
            modo_confirmacion=$8
        WHERE id=$9
      RETURNING id`,
      [
        usuarioUpper,
        nombre,
        rolLower,
        activo,
        empresaIdFinal,
        mf,
        mi,
        mc,
        req.params.id
      ]);

    }

    res.json({ ok: true, id: Number(updated.rows[0]?.id || req.params.id) });

  } catch (err) {
    console.error("[ERROR ACTUALIZAR USUARIO]", err);
    res.status(500).json({
      error: "Error al actualizar usuario",
      detalle: err.message,
      codigo: err.code || null,
      detail: err.detail || null
    });
  }
});



/* ==============================
   ELIMINAR USUARIO
============================== */

router.delete("/:id", async (req,res)=>{

try{

await pool.query(`
UPDATE usuario
SET activo=false
WHERE id=$1
`,
[req.params.id]);

res.json({ok:true});

}catch(err){

console.error("[ERROR ELIMINAR USUARIO]", err);
res.status(500).json({
  error: "Error al eliminar usuario",
  detalle: err.message,
  codigo: err.code || null
});

}

});



module.exports = router;
