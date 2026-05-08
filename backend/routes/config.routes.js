const express = require("express");
const router  = express.Router();
const fs      = require("fs");
const path    = require("path");
const pool    = require("../db");

/* =====================================
   FUNCIÓN PARA OBTENER ARCHIVO POR TERMINAL
===================================== */
function getConfigPath(req) {

  if (!req.usuario || !req.usuario.terminal_id || !req.usuario.empresa_id) {
    throw new Error("Terminal o empresa no identificada en la sesión");
  }

  const empresaId = req.usuario.empresa_id;
  const terminalNombre = (req.usuario.terminal_nombre || "terminal")
    .replace(/\s+/g, "_")
    .toLowerCase();

  const empresaDir = path.join(__dirname, `../config/empresa_${empresaId}`);

  // Crear carpeta si no existe
  if (!fs.existsSync(empresaDir)) {
    fs.mkdirSync(empresaDir, { recursive: true });
  }

  return path.join(
    empresaDir,
    `impresoras_${terminalNombre}.json`
  );

}

/* =====================================
   IMPRESORAS
===================================== */
router.get("/impresoras", (req, res) => {

  try {

    const CONFIG_PATH = getConfigPath(req);

    if (!fs.existsSync(CONFIG_PATH)) {
      return res.json({});
    }

    const data = fs.readFileSync(CONFIG_PATH, "utf8");

    res.json(JSON.parse(data));

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "No se pudo leer la configuración" });
  }

});

router.post("/impresoras", (req, res) => {

  try {

    const CONFIG_PATH = getConfigPath(req);

    fs.writeFileSync(
      CONFIG_PATH,
      JSON.stringify(req.body, null, 2),
      "utf8"
    );

    res.json({ ok: true });

  } catch (err) {

    console.error(err);
    res.status(500).json({ error: "No se pudo guardar la configuración" });

  }

});


/* =====================================
   CONFIGURACIÓN PEDIDOS
===================================== */
router.get("/pedidos", async (req,res)=>{

  try{

    const r = await pool.query(`
      SELECT auto_reset_pedidos, hora_reset_pedidos
      FROM configuracion
      WHERE id = 1
    `);

    res.json(r.rows[0] || {});

  }catch(err){

    console.error(err);
    res.status(500).json({ error:"No se pudo cargar configuración" });

  }

});

router.post("/pedidos", async (req,res)=>{

  const { autoReset, horaReset } = req.body;

  try{

    await pool.query(`
      UPDATE configuracion
      SET auto_reset_pedidos = $1,
          hora_reset_pedidos = $2
      WHERE id = 1
    `,[autoReset, horaReset]);

    res.json({ ok:true });

  }catch(err){

    console.error(err);
    res.status(500).json({ error:"No se pudo guardar configuración" });

  }

});


/* =====================================
   FACTURA
===================================== */
router.post("/factura", (req,res)=>{

  const CONFIG_FACTURA = path.join(__dirname,"../config/factura.json");

  fs.writeFileSync(
    CONFIG_FACTURA,
    JSON.stringify(req.body,null,2),
    "utf8"
  );

  res.json({ok:true});

});

module.exports = router;