const express = require("express");
const router = express.Router();
const pool = require("../db");
const {
  FEATURE_SCOPE,
  PERMISOS_VENTA_RAPIDA,
  ensurePermisosSchema,
  ensurePermisosUsuario,
  getFeatureCatalog,
  getPermisosVentaRapida,
  upsertPermisosVentaRapida,
  getEmpresaFeatures,
  listEmpresaFeatures,
  upsertEmpresaFeatures,
  getTerminalFeatures,  
  listTerminalFeatures,
  upsertTerminalFeatures
} = require("../services/permisos.service");

router.use(async (_req, res, next) => {
  try {
    await ensurePermisosSchema();
    next();
  } catch (error) {
    console.error("Error iniciando esquema de permisos:", error);
    res.status(500).json({ error: "No se pudo preparar esquema de permisos" });
  }
});

function normalizeRol(rol) {
  return String(rol || "").trim().toLowerCase();
}

function puedeGestionarPermisos(req) {
  const rol = normalizeRol(req?.usuario?.rol);
  return rol === "super" || rol === "admin" || rol === "sis";
}

router.get("/catalogo", async (req, res) => {
  try {
    if (!puedeGestionarPermisos(req)) {
      return res.status(403).json({ error: "Sin permiso para consultar catalogo de funcionalidades" });
    }

    const catalogo = await getFeatureCatalog();
    const salida = {
      usuario: catalogo.filter((row) => row.scope === FEATURE_SCOPE.USUARIO),
      terminal: catalogo.filter((row) => row.scope === FEATURE_SCOPE.TERMINAL),
      empresa: catalogo.filter((row) => row.scope === FEATURE_SCOPE.EMPRESA)
    };
    res.json(salida);
  } catch (err) {
    console.error("GET /permisos/catalogo:", err);
    res.status(500).json({ error: "No se pudo cargar catalogo de funcionalidades" });
  }
});

router.get("/me", async (req, res) => {
  try {
    const userId = Number(req?.usuario?.id || 0);
    if (!userId) {
      return res.status(401).json({ error: "No autorizado" });
    }

    const r = await pool.query(`
      SELECT
        id,
        nombre,
        rol,
        modo_factura,
        modo_impresion,
        modo_confirmacion
      FROM usuario
      WHERE id = $1
      LIMIT 1
    `, [userId]);

    if (!r.rows.length) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    const permisosVentaRapida = await getPermisosVentaRapida(userId);
    const empresaId = Number(req?.usuario?.empresa_id || 0);
    const terminalId = Number(req?.usuario?.terminal_id || 0);

    let permisosEmpresa = {};
    let permisosTerminal = {};
    let empresaMonedaBaseId = 1;
    let terminalTipoPedidoDefaultId = null;

    if (empresaId > 0) {
      try {
        const empresa = await getEmpresaFeatures(empresaId);
        permisosEmpresa = empresa.features || {};
        empresaMonedaBaseId = Number(empresa.moneda_base_id || 1) || 1;
      } catch (_error) {
        permisosEmpresa = {};
        empresaMonedaBaseId = 1;
      }
    }

    if (terminalId > 0) {
      try {
        const terminal = await getTerminalFeatures(terminalId);
        permisosTerminal = terminal.features || {};
        terminalTipoPedidoDefaultId = terminal.tipo_pedido_default_id == null
          ? null
          : Number(terminal.tipo_pedido_default_id);
      } catch (_error) {
        permisosTerminal = {};
        terminalTipoPedidoDefaultId = null;
      }
    }

    res.json({
      ...r.rows[0],
      empresa_id: empresaId > 0 ? empresaId : null,
      terminal_id: terminalId > 0 ? terminalId : null,
      permisos_venta_rapida: permisosVentaRapida,
      permisos_terminal: permisosTerminal,
      permisos_empresa: permisosEmpresa,
      empresa_moneda_base_id: empresaMonedaBaseId,
      terminal_tipo_pedido_default_id: terminalTipoPedidoDefaultId,
      config_terminal: {
        mostrar_tipo_pedido: permisosTerminal.mostrar_tipo_pedido !== false,
        tipo_pedido_default_id: terminalTipoPedidoDefaultId
      },
      ...permisosVentaRapida
    });
  } catch (err) {
    console.error("GET /permisos/me:", err);
    res.status(500).json({ error: "Error cargando permisos" });
  }
});

router.get("/lista", async (_req, res) => {
  try {
    if (!puedeGestionarPermisos(_req)) {
      return res.status(403).json({ error: "Sin permiso para listar permisos" });
    }

    const users = await pool.query(`
      SELECT
        id,
        usuario,
        nombre,
        rol,
        modo_factura,
        modo_impresion,
        modo_confirmacion,
        activo
      FROM usuario
      ORDER BY id
    `);

    const salida = [];
    for (const user of users.rows) {
      await ensurePermisosUsuario(user.id);
      const p = await getPermisosVentaRapida(user.id);
      salida.push({
        ...user,
        permisos_venta_rapida: p,
        ...p
      });
    }

    res.json(salida);
  } catch (err) {
    console.error("GET /permisos/lista:", err);
    res.status(500).json({ error: "Error cargando usuarios" });
  }
});

router.get("/venta-rapida/catalogo", (_req, res) => {
  if (!puedeGestionarPermisos(_req)) {
    return res.status(403).json({ error: "Sin permiso para consultar catalogo de permisos" });
  }
  res.json(PERMISOS_VENTA_RAPIDA);
});

router.get("/venta-rapida/:usuarioId", async (req, res) => {
  try {
    if (!puedeGestionarPermisos(req)) {
      return res.status(403).json({ error: "Sin permiso para consultar permisos de otros usuarios" });
    }

    const usuarioId = Number(req.params.usuarioId || 0);
    if (!usuarioId) {
      return res.status(400).json({ error: "Usuario invalido" });
    }

    const permisos = await getPermisosVentaRapida(usuarioId);
    res.json({
      usuario_id: usuarioId,
      permisos_venta_rapida: permisos,
      ...permisos
    });
  } catch (err) {
    console.error("GET /permisos/venta-rapida/:usuarioId", err);
    res.status(500).json({ error: "No se pudo cargar permisos de VentaRapida" });
  }
});

router.put("/venta-rapida/:usuarioId", async (req, res) => {
  try {
    if (!puedeGestionarPermisos(req)) {
      return res.status(403).json({ error: "Sin permiso para modificar permisos" });
    }

    const usuarioId = Number(req.params.usuarioId || 0);
    if (!usuarioId) {
      return res.status(400).json({ error: "Usuario invalido" });
    }

    const payload = {};
    for (const key of PERMISOS_VENTA_RAPIDA) {
      if (key in req.body) payload[key] = req.body[key];
    }

    const permisos = await upsertPermisosVentaRapida(usuarioId, payload);
    res.json({
      ok: true,
      usuario_id: usuarioId,
      permisos_venta_rapida: permisos,
      ...permisos
    });
  } catch (err) {
    console.error("PUT /permisos/venta-rapida/:usuarioId", err);
    res.status(500).json({ error: "No se pudo guardar permisos de VentaRapida" });
  }
});

router.get("/empresa-features", async (req, res) => {
  try {
    if (!puedeGestionarPermisos(req)) {
      return res.status(403).json({ error: "Sin permiso para consultar configuracion por empresa" });
    }

    const lista = await listEmpresaFeatures();
    res.json(lista);
  } catch (err) {
    console.error("GET /permisos/empresa-features:", err);
    res.status(500).json({ error: "No se pudo cargar configuracion por empresa" });
  }
});

router.get("/empresa-features/:empresaId", async (req, res) => {
  try {
    if (!puedeGestionarPermisos(req)) {
      return res.status(403).json({ error: "Sin permiso para consultar configuracion por empresa" });
    }

    const empresaId = Number(req.params.empresaId || 0);
    if (!empresaId) {
      return res.status(400).json({ error: "Empresa invalida" });
    }

    const data = await getEmpresaFeatures(empresaId);
    res.json(data);
  } catch (err) {
    console.error("GET /permisos/empresa-features/:empresaId", err);
    res.status(500).json({ error: err.message || "No se pudo cargar configuracion por empresa" });
  }
});

router.put("/empresa-features/:empresaId", async (req, res) => {
  try {
    if (!puedeGestionarPermisos(req)) {
      return res.status(403).json({ error: "Sin permiso para modificar configuracion por empresa" });
    }

    const empresaId = Number(req.params.empresaId || 0);
    if (!empresaId) {
      return res.status(400).json({ error: "Empresa invalida" });
    }

    const data = await upsertEmpresaFeatures(empresaId, req.body || {});
    res.json({
      ok: true,
      empresa_id: empresaId,
      moneda_base_id: data.moneda_base_id,
      features: data.features
    });
  } catch (err) {
    console.error("PUT /permisos/empresa-features/:empresaId", err);
    res.status(500).json({ error: err.message || "No se pudo guardar configuracion por empresa" });
  }
});

router.get("/terminal-features", async (req, res) => {
  try {
    if (!puedeGestionarPermisos(req)) {
      return res.status(403).json({ error: "Sin permiso para consultar configuracion por terminal" });
    }

    const empresaId = Number(req.query?.empresa_id || 0) || null;
    const lista = await listTerminalFeatures(empresaId);
    res.json(lista);
  } catch (err) {
    console.error("GET /permisos/terminal-features:", err);
    res.status(500).json({ error: "No se pudo cargar configuracion por terminal" });
  }
});

router.get("/terminal-features/:terminalId", async (req, res) => {
  try {
    if (!puedeGestionarPermisos(req)) {
      return res.status(403).json({ error: "Sin permiso para consultar configuracion por terminal" });
    }

    const terminalId = Number(req.params.terminalId || 0);
    if (!terminalId) {
      return res.status(400).json({ error: "Terminal invalida" });
    }

    const data = await getTerminalFeatures(terminalId);
    res.json(data);
  } catch (err) {
    console.error("GET /permisos/terminal-features/:terminalId", err);
    res.status(500).json({ error: err.message || "No se pudo cargar configuracion por terminal" });
  }
});

router.put("/terminal-features/:terminalId", async (req, res) => {
  try {
    if (!puedeGestionarPermisos(req)) {
      return res.status(403).json({ error: "Sin permiso para modificar configuracion por terminal" });
    }

    const terminalId = Number(req.params.terminalId || 0);
    if (!terminalId) {
      return res.status(400).json({ error: "Terminal invalida" });
    }

    const data = await upsertTerminalFeatures(terminalId, req.body || {});
    res.json({
      ok: true,
      terminal_id: terminalId,
      features: data.features,
      tipo_pedido_default_id: data.tipo_pedido_default_id
    });
  } catch (err) {
    console.error("PUT /permisos/terminal-features/:terminalId", err);
    if (err.message === "Tipo de pedido por defecto invalido") {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: err.message || "No se pudo guardar configuracion por terminal" });
  }
});

module.exports = router;
