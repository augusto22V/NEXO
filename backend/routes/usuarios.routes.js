const express = require("express");
const router = express.Router();
const pool = require("../db");
const bcrypt = require("bcrypt");
const { ensurePermisosUsuario } = require("../services/permisos.service");

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
  id,
  usuario,
  nombre,
  rol,
  activo,
  modo_factura,
  modo_impresion,
  modo_confirmacion
FROM usuario
ORDER BY id
`);

res.json(result.rows);

}catch(err){

console.error(err);
res.status(500).json({error:"Error al listar usuarios"});

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
  activo,
  modo_factura,
  modo_impresion,
  modo_confirmacion
} = req.body;

const usuarioUpper = usuario?.toUpperCase();
const rolLower = String(rol || "").trim().toLowerCase();

if (!ROLES_VALIDOS.has(rolLower)) {
  return res.status(400).json({ error: "Rol invalido" });
}

if(!usuario || !password){
  return res.status(400).json({error:"Usuario y contraseña requeridos"});
}

const existe = await pool.query(
  `SELECT id FROM usuario WHERE usuario=$1`,
  [usuarioUpper]
);

if(existe.rows.length > 0){
  return res.status(400).json({error:"El usuario ya existe"});
}

const hash = await bcrypt.hash(password,10);

const inserted = await pool.query(`
INSERT INTO usuario
(usuario,password,nombre,rol,activo,empresa_id,
 modo_factura,modo_impresion,modo_confirmacion)
VALUES ($1,$2,$3,$4,$5,1,$6,$7,$8)
RETURNING id
`,
[
  usuarioUpper,
  hash,
  nombre,
  rolLower,
  activo,
  (modo_factura || "PREGUNTAR").toUpperCase(),
  (modo_impresion || "AUTO").toUpperCase(),
  modo_confirmacion ?? false
]);

await ensurePermisosUsuario(inserted.rows[0].id);

res.json({ok:true, id: inserted.rows[0].id});

}catch(err){

console.error(err);
res.status(500).json({error:"Error al crear usuario"});

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

    if (!ROLES_VALIDOS.has(rolLower)) {
      return res.status(400).json({ error: "Rol invalido" });
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
            modo_factura=$6,
            modo_impresion=$7,
            modo_confirmacion=$8
        WHERE id=$9
      RETURNING id`,
      [
        usuarioUpper,
        nombre,
        hash,
        rolLower,
        activo,
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
            modo_factura=$5,
            modo_impresion=$6,
            modo_confirmacion=$7
        WHERE id=$8
      RETURNING id`,
      [
        usuarioUpper,
        nombre,
        rolLower,
        activo,
        mf,
        mi,
        mc,
        req.params.id
      ]);

    }

    res.json({ ok: true, id: Number(updated.rows[0]?.id || req.params.id) });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al actualizar usuario" });
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

console.error(err);
res.status(500).json({error:"Error al eliminar usuario"});

}

});



module.exports = router;
