const express = require("express");
const router = express.Router();
const pool = require("../db");
const {
  actualizarDetalleVenta,
  eliminarDetalleVenta,
  recalcularVentaTotales,
  registrarStockMovimientoVenta
} = require("../services/venta.service");
const {
  ensureComisionSchema,
  toNumber,
  recalculateVentaCommission
} = require("../services/comision.service");
const {
  ensureOperacionCatalogSchema,
  findDefaultOperacionVentaId
} = require("../services/operacion.catalog.service");
const {
  assignVentaToMesaByNumero,
  clearMesaByVentaId,
  ensureMesaSchema
} = require("../services/mesa.service");
const {
  requirePermisoVentaRapida,
  ensurePermisosSchema
} = require("../services/permisos.service");
const { ensureTerminalConfigSchema } = require("../services/terminal_config.service");
const {
  MONEDA_IDS,
  buildPrecioMonedaPayload,
  ensureMonedaSchema,
  getCotizacionActiva,
  resolveMonedaId
} = require("../services/moneda.schema.service");
const {
  ensureFacturaVentaSchema,
  ventaTieneFactura
} = require("../services/factura_venta.service");


/*
Estados :
PENDIENTE
EN_ESPERA
CONCLUIDO
EFECTIVADO
CANCELADO
*/

const ESTADOS_EDITABLES_VENTA = new Set(["PENDIENTE", "EN_ESPERA"]);
const { POS_SIN_COCINA, POS_SIN_TIPO_PEDIDO } = require("../config/pos.mode");

function ventaEditable(estado) {
  return ESTADOS_EDITABLES_VENTA.has(String(estado || "").trim().toUpperCase());
}

function getEmpresaIdFromReq(req) {
  const empresaId = Number(req?.usuario?.empresa_id || 0);
  return Number.isFinite(empresaId) && empresaId > 0 ? Math.trunc(empresaId) : null;
}

function getTerminalIdFromReq(req) {
  const terminalId = Number(req?.usuario?.terminal_id || 0);
  return Number.isFinite(terminalId) && terminalId > 0 ? Math.trunc(terminalId) : null;
}

function getUsuarioIdFromReq(req) {
  const uid = Number(req?.usuario?.id || 0);
  return Number.isFinite(uid) && uid > 0 ? Math.trunc(uid) : null;
}

async function resolveEmpresaIdParaVenta(client, req) {
  const fromReq = getEmpresaIdFromReq(req);
  if (fromReq) return fromReq;
  try {
    const r = await client.query(`
      SELECT id FROM empresa WHERE COALESCE(activa, true) = true ORDER BY id ASC LIMIT 1
    `);
    if (r.rowCount) return Number(r.rows[0].id);
  } catch (_e) {
    /* sin tabla empresa */
  }
  return null;
}

async function resolveClienteIdParaVenta(client) {
  try {
    const r = await client.query(`SELECT id FROM cliente ORDER BY id ASC LIMIT 1`);
    if (r.rowCount) return Number(r.rows[0].id);
  } catch (_e) {
    /* sin cliente */
  }
  return 1;
}

async function resolveVendedorIdParaVenta(client, solicitudRaw) {
  const solicitado = Number(solicitudRaw) > 0 ? Math.trunc(Number(solicitudRaw)) : 1;
  try {
    const ok = await client.query(`SELECT id FROM vendedor WHERE id = $1`, [solicitado]);
    if (ok.rowCount) return solicitado;
    const f = await client.query(`SELECT id FROM vendedor ORDER BY id ASC LIMIT 1`);
    if (f.rowCount) return Number(f.rows[0].id);
  } catch (_e) {
    /* sin vendedor */
  }
  return solicitado;
}

function getMesaScopeFromReq(req) {
  const empresaId = getEmpresaIdFromReq(req);
  const terminalId = getTerminalIdFromReq(req);

  if (!empresaId || !terminalId) return null;

  return {
    empresa_id: empresaId,
    terminal_id: terminalId
  };
}

function toOperacionId(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

function toTipoPedidoId(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
}

async function findTipoPedidoActivoById(client, tipoPedidoId) {
  const id = toTipoPedidoId(tipoPedidoId);
  if (!id) return null;

  const result = await client.query(
    `
      SELECT id_tipo_pedido
      FROM tipo_pedido
      WHERE id_tipo_pedido = $1
        AND COALESCE(estado, true) = true
      LIMIT 1
    `,
    [id]
  );

  if (!result.rowCount) return null;
  return Number(result.rows[0].id_tipo_pedido);
}

async function findDefaultTipoPedidoActivo(client) {
  const result = await client.query(
    `
      SELECT id_tipo_pedido
      FROM tipo_pedido
      WHERE COALESCE(estado, true) = true
      ORDER BY id_tipo_pedido ASC
      LIMIT 1
    `
  );

  if (!result.rowCount) return null;
  return Number(result.rows[0].id_tipo_pedido);
}

async function resolveTerminalTipoPedidoConfig(client, req) {
  if (POS_SIN_TIPO_PEDIDO) {
    return {
      mostrarTipoPedido: false,
      defaultId: null
    };
  }

  await ensurePermisosSchema();
  await ensureTerminalConfigSchema();

  const terminalId = getTerminalIdFromReq(req);
  if (!terminalId) {
    return {
      mostrarTipoPedido: true,
      defaultId: null
    };
  }

  let result;
  try {
    result = await client.query(
      `
        SELECT
          t.tipo_pedido_default_id,
          COALESCE(tf.enabled, true) AS mostrar_tipo_pedido
        FROM terminal t
        LEFT JOIN terminal_feature_config tf
          ON tf.terminal_id = t.id
         AND tf.feature_key = 'mostrar_tipo_pedido'
        WHERE t.id = $1
        LIMIT 1
      `,
      [terminalId]
    );
  } catch {
    return {
      mostrarTipoPedido: false,
      defaultId: null
    };
  }

  if (!result.rowCount) {
    return {
      mostrarTipoPedido: true,
      defaultId: null
    };
  }

  const row = result.rows[0];
  return {
    mostrarTipoPedido: row.mostrar_tipo_pedido !== false,
    defaultId: toTipoPedidoId(row.tipo_pedido_default_id)
  };
}

async function resolveOperacionVenta(client, tipoOperacionId, { allowNull = false } = {}) {
  const opId = toOperacionId(tipoOperacionId);
  if (!opId) {
    if (allowNull) return null;
    throw new Error("tipo_operacion_id requerido");
  }

  const opRes = await client.query(
    `
      SELECT
        id,
        codigo,
        descripcion,
        tipo,
        activo,
        COALESCE(genera_financiero, false) AS genera_financiero,
        COALESCE(permite_credito, false) AS permite_credito,
        COALESCE(requiere_credito, false) AS requiere_credito
      FROM tipo_operacion
      WHERE id = $1
      LIMIT 1
    `,
    [opId]
  );

  if (!opRes.rowCount) throw new Error("Operación no encontrada");
  const operacion = opRes.rows[0];
  const tipo = String(operacion.tipo || "").trim().toUpperCase();
  if (tipo !== "S") throw new Error("La operación para venta debe ser de tipo S");
  if (operacion.activo === false) throw new Error("La operación seleccionada está inactiva");
  return operacion;
}

// =======================================
// CREAR NUEVA VENTA (PENDIENTE)
// =======================================
router.post("/nuevo", requirePermisoVentaRapida("venta_rapida_nueva"), async (req, res) => {
  /* No llamar ensureComisionSchema / ensureOperacionCatalogSchema / ALTER aquí: ya corren en
   * app.js (bootstrapSchemas). Repetir DDL en cada venta compite por bloqueos con el pool y puede
   * colgar o responder 500 si otra sesión dejó una transacción abierta. */

  const client = await pool.connect();

  try {

    await client.query("BEGIN");

try {
  await client.query("SAVEPOINT reset_check");
  const cfg = await client.query(`
    SELECT auto_reset_pedidos, hora_reset_pedidos, ultimo_reset
    FROM configuracion
    WHERE id = 1
  `);

  if (cfg.rows.length) {
    const autoReset = cfg.rows[0].auto_reset_pedidos;
    const horaReset = cfg.rows[0].hora_reset_pedidos;
    const ultimoResetDB = cfg.rows[0].ultimo_reset;
    const ultimoReset = ultimoResetDB
      ? new Date(ultimoResetDB).toISOString().slice(0, 10)
      : null;

    if (autoReset) {
      const ahora = new Date();
      const hoy = ahora.toISOString().slice(0, 10);
      const horaActual =
        ahora.getHours().toString().padStart(2, "0") +
        ":" +
        ahora.getMinutes().toString().padStart(2, "0");

      if (horaActual >= horaReset && ultimoReset !== hoy) {
        await client.query(`SELECT setval('venta_numero_seq', 1, false)`);
        await client.query(`
          UPDATE configuracion
          SET ultimo_reset = CURRENT_DATE
          WHERE id = 1
        `);
      }
    }
  }
  await client.query("RELEASE SAVEPOINT reset_check");
} catch (e) {
  await client.query("ROLLBACK TO SAVEPOINT reset_check");
  console.warn("[venta/nuevo] Reinicio automatico de numeracion omitido:", e.message);
}
    // Obtener nÃºmero desde la secuencia
    const r = await client.query(`
      SELECT nextval('venta_numero_seq') AS numero
    `);

    const nuevoNumero = r.rows[0].numero;

const { tipo_pedido_id, vendedor_id } = req.body;
const tipoPedidoSolicitado = toTipoPedidoId(tipo_pedido_id);

let tipoOperacionId = toOperacionId(req.body?.tipo_operacion_id);
if (tipoOperacionId) {
  await resolveOperacionVenta(client, tipoOperacionId);
} else {
  tipoOperacionId = await findDefaultOperacionVentaId();
}

if (!tipoOperacionId) {
  throw new Error(
    "No hay operacion de venta activa (tipo S en tipo_operacion). Ejecute el servidor para aplicar catalogo o cargue tipo_operacion."
  );
}

const terminalTipoPedido = await resolveTerminalTipoPedidoConfig(client, req);
let tipoPedidoId = null;

if (terminalTipoPedido.mostrarTipoPedido) {
  tipoPedidoId = await findTipoPedidoActivoById(client, tipoPedidoSolicitado);
  if (!tipoPedidoId && terminalTipoPedido.defaultId) {
    tipoPedidoId = await findTipoPedidoActivoById(client, terminalTipoPedido.defaultId);
  }
  if (!tipoPedidoId) {
    tipoPedidoId = await findDefaultTipoPedidoActivo(client);
  }
  if (!tipoPedidoId) {
    throw new Error("No hay tipos de pedido activos");
  }
} else {
  if (terminalTipoPedido.defaultId) {
    tipoPedidoId = await findTipoPedidoActivoById(client, terminalTipoPedido.defaultId);
  }
  if (!tipoPedidoId) {
    tipoPedidoId = await findDefaultTipoPedidoActivo(client);
  }
}

const empresaId = await resolveEmpresaIdParaVenta(client, req);
if (!empresaId) {
  throw new Error(
    "No hay empresa registrada o el usuario no tiene empresa_id. Revise Parametros > Empresa."
  );
}

const clienteId = await resolveClienteIdParaVenta(client);
const vendedorResId = await resolveVendedorIdParaVenta(client, vendedor_id);
const terminalId = getTerminalIdFromReq(req);
const usuarioId = getUsuarioIdFromReq(req);

const insert = await client.query(`
  INSERT INTO venta 
  (numero, fecha, pago, estado, total, comision, vendedor_id, cliente_id, cliente_nombre, tipo_pedido_id, tipo_operacion_id,
   empresa_id, terminal_id, usuario_id, prioridad_espera)
  VALUES 
  ($1, NOW(), 'PENDIENTE', 'PENDIENTE', 0, 0, $2, $3, 'Ocasional', $4, $5, $6, $7, $8, 1)
  RETURNING id, numero, vendedor_id, tipo_operacion_id, comision
`, [
  nuevoNumero,
  vendedorResId,
  clienteId,
  tipoPedidoId,
  tipoOperacionId,
  empresaId,
  terminalId,
  usuarioId
]);

    await client.query("COMMIT");

    res.json(insert.rows[0]);

  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("❌ ERROR venta/nuevo:", err.message, err.stack);
    if (err?.code) {
      console.error("❌ ERROR venta/nuevo PG:", err.code, err.detail, err.constraint);
    }
    res.status(500).json({ error: err.message || "Error creando venta" });

  } finally {

    client.release();

  }

  });


router.post("/agregar-item", requirePermisoVentaRapida("venta_rapida_ver"), async (req, res) => {
  const {
    venta_id,
    producto_id,
    cantidad,
    precio,
    observacion,
    precio_moneda_id,
    moneda_id,
    precio_moneda_origen
  } = req.body || {};

  const ventaId = Number(venta_id || 0);
  const productoId = Number(producto_id || 0);
  const cantidadValue = Number(cantidad);
  const precioValue = Number(precio);

  // =====================================
  // VALIDAR DATOS
  // =====================================
  if (!ventaId || !productoId || !Number.isFinite(cantidadValue) || cantidadValue <= 0) {
    return res.status(400).json({ error: "Datos invalidos" });
  }
  if (!Number.isFinite(precioValue) || precioValue < 0) {
    return res.status(400).json({ error: "Precio invalido" });
  }

  // =====================================
  // VERIFICAR VENTA
  // =====================================
  if (await ventaTieneFactura(pool, ventaId)) {
    return res.status(400).json({
      error: "No se puede modificar una venta facturada"
    });
  }

  const ventaCheck = await pool.query(
    `SELECT estado FROM venta WHERE id = $1`,
    [ventaId]
  );

  if (ventaCheck.rowCount === 0) {
    return res.status(404).json({ error: "Venta no encontrada" });
  }

  const estadoVenta = String(ventaCheck.rows[0].estado || "").toUpperCase();
  if (!ventaEditable(estadoVenta)) {
    return res.status(400).json({ error: `La venta no es editable (estado: ${estadoVenta || "DESCONOCIDO"})` });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await ensureMonedaSchema();

    const cotizacion = await getCotizacionActiva(client);
    const monedaId = resolveMonedaId(precio_moneda_id ?? moneda_id, MONEDA_IDS.PYG);
    const conversion = buildPrecioMonedaPayload({
      monto: precio_moneda_origen ?? precioValue,
      monedaId,
      cotizacion
    });
    const precioCanonicoGs = conversion.monto_gs != null
      ? Number(conversion.monto_gs)
      : (conversion.moneda_id === MONEDA_IDS.PYG
        ? Number(conversion.monto_origen)
        : precioValue);
    const subtotal = precioCanonicoGs * cantidadValue;

    // =====================================
    // VERIFICAR PRODUCTO
    // =====================================
    const prod = await client.query(`
      SELECT stock, no_control_stock, facturacion_directa
      FROM producto
      WHERE id = $1
      FOR UPDATE
    `, [productoId]);

    if (prod.rowCount === 0) {
      throw new Error("Producto no encontrado");
    }

    const esFacturacionDirecta = prod.rows[0].facturacion_directa === true;

    // =====================================
    // VALIDAR MEZCLA DE PRODUCTOS
    // =====================================
    const checkItems = await client.query(`
      SELECT p.facturacion_directa
      FROM venta_detalle vd
      JOIN producto p ON p.id = vd.producto_id
      WHERE vd.venta_id = $1
    `, [ventaId]);

    const hayNormales = checkItems.rows.some((r) => !r.facturacion_directa);
    const hayDirectos = checkItems.rows.some((r) => r.facturacion_directa);

    if (esFacturacionDirecta && hayNormales) {
      throw new Error("No se puede mezclar productos de facturacion directa");
    }

    if (!esFacturacionDirecta && hayDirectos) {
      throw new Error("Esta venta ya contiene productos de facturacion directa");
    }

    // =====================================
    // CONTROL STOCK
    // =====================================
    const controlaStock = !prod.rows[0].no_control_stock;
    const stockActual = prod.rows[0].stock;

    if (controlaStock && stockActual < cantidadValue) {
      throw new Error("Stock insuficiente");
    }

    // =====================================
    // INSERTAR ITEM
    // =====================================
    const insert = await client.query(`
      INSERT INTO venta_detalle
      (
        venta_id,
        producto_id,
        cantidad,
        precio,
        subtotal,
        observacion,
        precio_moneda_id,
        precio_moneda_origen,
        precio_gs,
        precio_brl,
        precio_usd,
        cotizacion_id,
        cotizacion_brl,
        cotizacion_usd
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      RETURNING id
    `, [
      ventaId,
      productoId,
      cantidadValue,
      precioCanonicoGs,
      subtotal,
      observacion || null,
      conversion.moneda_id,
      conversion.monto_origen,
      conversion.monto_gs,
      conversion.monto_brl,
      conversion.monto_usd,
      conversion.cotizacion_id,
      conversion.cotizacion_brl,
      conversion.cotizacion_usd
    ]);

    const itemId = insert.rows[0].id;

    // =====================================
    // DESCONTAR STOCK
    // =====================================
    if (controlaStock) {
      await client.query(`
        UPDATE producto
        SET stock = stock - $1
        WHERE id = $2
      `, [cantidadValue, productoId]);

      await registrarStockMovimientoVenta(client, {
        productoId,
        empresaId: getEmpresaIdFromReq(req),
        tipo: "SALIDA",
        cantidad: cantidadValue,
        referenciaId: itemId,
        referenciaTipo: "VENTA_DETALLE"
      });
    }

    const { totalVenta, comision } = await recalculateVentaCommission(client, ventaId);

    await client.query("COMMIT");

    if (esFacturacionDirecta) {
      return res.json({
        ok: true,
        total: totalVenta,
        comision,
        item_id: itemId,
        requiere_factura: true
      });
    }

    res.json({
      ok: true,
      total: totalVenta,
      comision,
      item_id: itemId,
      precio_moneda_id: conversion.moneda_id,
      precio_moneda_origen: conversion.monto_origen,
      precio_gs: conversion.monto_gs,
      precio_brl: conversion.monto_brl,
      precio_usd: conversion.monto_usd
    });

  } catch (err) {

    await client.query("ROLLBACK");

    res.status(400).json({
      error: err.message || "Error al agregar item"
    });

  } finally {
    client.release();
  }

});


router.put("/editar-item-legacy/:id", requirePermisoVentaRapida("venta_rapida_ver"), async (req, res) => {

  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "ID inválido" });
  }

  const client = await pool.connect();

  try {
    const { cantidad, precio, observacion } = req.body;

    if (!cantidad || cantidad <= 0 || !precio || precio < 0) {
      return res.status(400).json({ error: "Datos inválidos" });
    }

    await client.query("BEGIN");

    const { totalVenta, comision } = await actualizarDetalleVenta(client, id, {
      cantidad,
      precio,
      observacion
    });

    await client.query("COMMIT");

    return res.json({
      ok: true,
      total: totalVenta,
      comision
    });

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("ERROR EDITAR ITEM:", err);
    return res.status(400).json({
      error: err.message || "Error actualizando item"
    });
  } finally {
    client.release();
  }

});


// =======================================
// EDITAR ITEM
// =======================================
router.put("/editar-item/:id", requirePermisoVentaRapida("venta_rapida_ver"), async (req, res) => {

  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "ID invalido" });
  }

  const client = await pool.connect();

  try {
    const {
      cantidad,
      precio,
      observacion,
      precio_moneda_id,
      moneda_id,
      precio_moneda_origen
    } = req.body || {};
    const cantidadValue = Number(cantidad);
    const precioValue = Number(precio);

    if (!Number.isFinite(cantidadValue) || cantidadValue <= 0 || !Number.isFinite(precioValue) || precioValue < 0) {
      return res.status(400).json({ error: "Datos invalidos" });
    }

    await client.query("BEGIN");
    await ensureMonedaSchema();

    const cotizacion = await getCotizacionActiva(client);
    const monedaId = resolveMonedaId(precio_moneda_id ?? moneda_id, MONEDA_IDS.PYG);
    const conversion = buildPrecioMonedaPayload({
      monto: precio_moneda_origen ?? precioValue,
      monedaId,
      cotizacion
    });

    const { totalVenta, comision } = await actualizarDetalleVenta(client, id, {
      cantidad: cantidadValue,
      precio: precioValue,
      observacion,
      precio_moneda_id: conversion.moneda_id,
      precio_moneda_origen: conversion.monto_origen
    }, {
      empresa_id: getEmpresaIdFromReq(req)
    });

    await client.query("COMMIT");

    return res.json({
      ok: true,
      total: totalVenta,
      comision
    });

  } catch (err) {
    await client.query("ROLLBACK");
    return res.status(400).json({
      error: err.message || "Error actualizando item"
    });
  } finally {
    client.release();
  }

});

router.put("/efectivizar/:id", requirePermisoVentaRapida("venta_rapida_efectivizar"), async (req, res) => {

  const ventaId = Number(req.params.id || 0);

  if (!ventaId) {
    return res.status(400).json({ error: "ID invalido" });
  }

  if (await ventaTieneFactura(pool, ventaId)) {
    return res.status(400).json({
      error: "Esta venta ya fue facturada, no puede pasar por caja"
    });
  }

  const client = await pool.connect();

  try {

    await ensureMesaSchema();
    await client.query("BEGIN");

    await client.query(`
      UPDATE venta
      SET estado = 'EFECTIVADO'
      WHERE id = $1
    `, [ventaId]);

    await clearMesaByVentaId(client, ventaId, getMesaScopeFromReq(req));

    await client.query("COMMIT");

    res.json({ ok: true });

  } catch (err) {

    await client.query("ROLLBACK");
    res.status(500).json({ error: err.message });

  } finally {

    client.release();

  }

});

router.put("/productos/orden", requirePermisoVentaRapida("venta_rapida_ver"), async (req,res)=>{

  const orden = req.body;

  if(!Array.isArray(orden)){
    return res.status(400).json({error:"Formato inválido"});
  }

  const client = await pool.connect();

  try{

    await client.query("BEGIN");

    for(const item of orden){

      const id = parseInt(item.id);
      const posicion = parseInt(item.orden);

      if(isNaN(id) || isNaN(posicion)) continue;

      await client.query(
        "UPDATE producto SET orden_pos = $1 WHERE id = $2",
        [posicion, id]
      );

    }

    await client.query("COMMIT");

    res.json({ok:true});

  }catch(err){

    await client.query("ROLLBACK");
    console.error("ERROR UPDATE PRODUCTO:",err);

    res.status(500).json({error:"No se pudo guardar orden"});

  }finally{
    client.release();
  }

});

// =======================================
// ELIMINAR ITEM DEL DETALLE
// DELETE /api/venta/detalle/:id
// =======================================
router.delete("/detalle-legacy/:id", requirePermisoVentaRapida("venta_rapida_ver"), async (req, res) => {

  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "ID inválido" });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const result = await eliminarDetalleVenta(client, id);
    await client.query("COMMIT");
    return res.json({ ok: true, total: result.totalVenta, comision: result.comision });
  } catch (err) {
    await client.query("ROLLBACK");
    return res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }

});

router.delete("/detalle/:id", requirePermisoVentaRapida("venta_rapida_ver"), async (req, res) => {

  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "ID invalido" });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const result = await eliminarDetalleVenta(client, id, {
      empresa_id: getEmpresaIdFromReq(req)
    });
    await client.query("COMMIT");
    return res.json({ ok: true, total: result.totalVenta, comision: result.comision });
  } catch (err) {
    await client.query("ROLLBACK");
    return res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }

});

// =======================================
// GET LISTADO DE VENTA
// =======================================
router.get("/", requirePermisoVentaRapida("venta_rapida_ver"), async (req, res) => {

  try {

    const { desde, hasta, estado, numero } = req.query;
    const params = [];
    let where = "WHERE 1=1";

    if (desde) {
      params.push(desde);
      where += ` AND v.fecha::date >= $${params.length}`;
    }

    if (hasta) {
      params.push(hasta);
     where += ` AND v.fecha::date <= $${params.length}`;
    }

    if (estado) {
      params.push(estado);
      where += ` AND v.estado = $${params.length}`;
    }

    if (numero) {
      params.push(numero);
      where += ` AND v.numero = $${params.length}`;
    }

   await ensureMesaSchema();
   await ensureFacturaVentaSchema();

   const mesaScope = getMesaScopeFromReq(req);
   let mesaJoin = "LEFT JOIN mesa m ON m.venta_id = v.id";

   if (mesaScope) {
     params.push(mesaScope.empresa_id, mesaScope.terminal_id);
     mesaJoin = `LEFT JOIN mesa m ON m.venta_id = v.id
      AND m.empresa_id = $${params.length - 1}
      AND m.terminal_id = $${params.length}`;
   }

   const r = await pool.query(
`
SELECT 
v.id,
v.numero,
v.fecha,
v.estado,
v.total,
v.comision,
m.numero AS mesa,
fdoc.numero_factura, 

COALESCE(v.cliente_nombre, c.nombre, 'Ocasional') AS cliente,
ve.nombre AS vendedor,

tp.nombre AS tipo_pedido, 

'GUARANI' AS moneda

FROM venta v
LEFT JOIN LATERAL (
  SELECT f.numero_factura
  FROM factura f
  LEFT JOIN factura_venta fv ON fv.factura_id = f.id
  WHERE f.venta_id = v.id OR fv.venta_id = v.id
  ORDER BY f.id DESC
  LIMIT 1
) fdoc ON true
LEFT JOIN cliente c ON c.id = v.cliente_id
LEFT JOIN vendedor ve ON ve.id = v.vendedor_id
LEFT JOIN tipo_pedido tp ON tp.id_tipo_pedido = v.tipo_pedido_id
${mesaJoin}

${where}
ORDER BY v.id DESC
LIMIT 500
`,
params
);

    res.json(r.rows);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al listar venta" });
  }

});


router.get("/clientes/:id", requirePermisoVentaRapida("venta_rapida_ver"), async (req, res) => {
  const r = await pool.query(
    "SELECT id, nombre FROM cliente WHERE id = $1",
    [req.params.id]
  );
  res.json(r.rows[0]);
});

router.get("/vendedores/:id", requirePermisoVentaRapida("venta_rapida_ver"), async (req, res) => {
  const r = await pool.query(
    "SELECT id, nombre FROM vendedor WHERE id = $1",
    [req.params.id]
  );
  res.json(r.rows[0]);
});

router.post("/vendedor", requirePermisoVentaRapida("venta_rapida_ver"), async (req, res) => {

  const ventaId = Number(req.body?.venta_id || 0);
  const vendedorId = Number(req.body?.vendedor_id || 0) || 1;

  if (!ventaId) {
    return res.status(400).json({ error: "venta_id requerido" });
  }

  const client = await pool.connect();

  try {
    await ensureComisionSchema();
    await client.query("BEGIN");

    const vendedorRes = await client.query(
      `SELECT id, nombre FROM vendedor WHERE id = $1 LIMIT 1`,
      [vendedorId]
    );

    if (!vendedorRes.rowCount) {
      throw new Error("Vendedor no encontrado");
    }

    const ventaRes = await client.query(
      `
        UPDATE venta
        SET vendedor_id = $1
        WHERE id = $2
        RETURNING id
      `,
      [vendedorId, ventaId]
    );

    if (!ventaRes.rowCount) {
      throw new Error("Venta no encontrada");
    }

    const { totalVenta, comision } = await recalculateVentaCommission(client, ventaId);

    await client.query("COMMIT");

    res.json({
      ok: true,
      total: totalVenta,
      comision,
      vendedor: vendedorRes.rows[0]
    });

  } catch (err) {

    await client.query("ROLLBACK");
    res.status(400).json({ error: err.message || "No se pudo guardar vendedor" });

  } finally {
    client.release();
  }

});


router.post("/cliente", requirePermisoVentaRapida("venta_rapida_ver"), async (req, res) => {

  const { venta_id, cliente_id, cliente_nombre } = req.body;

  const ventaIdNum = Number(venta_id);
  if (!Number.isFinite(ventaIdNum) || ventaIdNum <= 0) {
    return res.status(400).json({ error: "venta_id requerido" });
  }

  const idCliente = Number(cliente_id) || 1;

  try {

  await pool.query(`
  UPDATE venta
  SET cliente_id = $1,
      cliente_nombre = $2
  WHERE id = $3
`, [
  idCliente,
  cliente_nombre || "Ocasional",
  ventaIdNum
]);

    res.json({ ok: true });

  } catch (err) {

    console.error("ERROR CLIENTE:", err); // ðŸ”¥ CLAVE
    res.status(500).json({ error: err.message });

  }

});


// =======================================
// GUARDAR MESA
// =======================================

router.post("/mesa", requirePermisoVentaRapida("venta_rapida_ver"), async (req, res) => {

  const ventaId = Number(req.body?.venta_id || 0);
  const mesaNumero = req.body?.mesa;

  if (!ventaId) {
    return res.status(400).json({ error: "Venta no especificada" });
  }

  const client = await pool.connect();

  try {

    await ensureMesaSchema();
    await client.query("BEGIN");

    const mesa = await assignVentaToMesaByNumero(
      client,
      ventaId,
      mesaNumero,
      getMesaScopeFromReq(req)
    );

    await client.query("COMMIT");

    res.json({ ok: true, mesa });

  } catch (err) {

    await client.query("ROLLBACK");
    res.status(400).json({ error: err.message || "No se pudo guardar mesa" });

  } finally {

    client.release();

  }

});

router.get("/tipos-pedido", requirePermisoVentaRapida("venta_rapida_ver"), async (req, res) => {
  if (POS_SIN_TIPO_PEDIDO) {
    return res.json({
      items: [],
      default_id: null
    });
  }

  try {
    await ensurePermisosSchema();
    await ensureTerminalConfigSchema();

    const result = await pool.query(
      `
        SELECT
          id_tipo_pedido,
          nombre,
          descripcion
        FROM tipo_pedido
        WHERE COALESCE(estado, true) = true
        ORDER BY id_tipo_pedido ASC
      `
    );

    const items = result.rows.map((row) => ({
      id: Number(row.id_tipo_pedido),
      nombre: String(row.nombre || "").trim(),
      descripcion: row.descripcion == null ? null : String(row.descripcion)
    }));

    let defaultId = items.length ? items[0].id : null;
    const terminalId = getTerminalIdFromReq(req);

    if (terminalId > 0) {
      const terminalResult = await pool.query(
        `
          SELECT
            t.tipo_pedido_default_id,
            COALESCE(tf.enabled, true) AS mostrar_tipo_pedido
          FROM terminal t
          LEFT JOIN terminal_feature_config tf
            ON tf.terminal_id = t.id
           AND tf.feature_key = 'mostrar_tipo_pedido'
          WHERE t.id = $1
          LIMIT 1
        `,
        [terminalId]
      );

      if (terminalResult.rowCount) {
        const terminalRow = terminalResult.rows[0];
        if (terminalRow.mostrar_tipo_pedido === false) {
          defaultId = null;
        } else {
          const terminalDefaultId = toTipoPedidoId(terminalRow.tipo_pedido_default_id);
          if (terminalDefaultId && items.some((item) => item.id === terminalDefaultId)) {
            defaultId = terminalDefaultId;
          }
        }
      }
    }

    res.json({
      items,
      default_id: defaultId
    });
  } catch (err) {
    res.status(500).json({ error: err.message || "No se pudieron cargar los tipos de pedido" });
  }
});

router.post("/tipo-pedido", requirePermisoVentaRapida("venta_rapida_ver"), async (req, res) => {
  if (POS_SIN_TIPO_PEDIDO) {
    return res.json({ ok: true, tipo_pedido_id: null });
  }

  const ventaId = Number(req.body?.venta_id || 0);
  const rawTipoPedido = req.body?.tipo_pedido_id;
  const tipoPedidoSolicitado = toTipoPedidoId(req.body?.tipo_pedido_id);

  if (!ventaId) {
    return res.status(400).json({ error: "Venta no especificada" });
  }

  try {
    if (rawTipoPedido == null || rawTipoPedido === "" || !tipoPedidoSolicitado) {
      const cleared = await pool.query(`
        UPDATE venta
        SET tipo_pedido_id = NULL
        WHERE id = $1
        RETURNING id, tipo_pedido_id
      `, [ventaId]);

      if (!cleared.rowCount) {
        return res.status(404).json({ error: "Venta no encontrada" });
      }

      return res.json({ ok: true, tipo_pedido_id: null });
    }

    const tipoPedidoId = await findTipoPedidoActivoById(pool, tipoPedidoSolicitado);
    if (!tipoPedidoId) {
      return res.status(400).json({ error: "Tipo de pedido invalido o inactivo" });
    }

    const updated = await pool.query(`
      UPDATE venta
      SET tipo_pedido_id = $1
      WHERE id = $2
      RETURNING id, tipo_pedido_id
    `, [tipoPedidoId, ventaId]);

    if (!updated.rowCount) {
      return res.status(404).json({ error: "Venta no encontrada" });
    }

    res.json({ ok: true });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }

});

router.post("/operacion", requirePermisoVentaRapida("venta_rapida_ver"), async (req, res) => {
  const ventaId = Number(req.body?.venta_id || 0);
  const tipoOperacionId = toOperacionId(req.body?.tipo_operacion_id);

  if (!ventaId) {
    return res.status(400).json({ error: "venta_id requerido" });
  }
  if (!tipoOperacionId) {
    return res.status(400).json({ error: "tipo_operacion_id requerido" });
  }

  const client = await pool.connect();
  try {
    await ensureOperacionCatalogSchema();
    const operacion = await resolveOperacionVenta(client, tipoOperacionId);

    const ventaRes = await client.query(
      `
        UPDATE venta
        SET tipo_operacion_id = $1
        WHERE id = $2
        RETURNING id, tipo_operacion_id
      `,
      [tipoOperacionId, ventaId]
    );

    if (!ventaRes.rowCount) {
      return res.status(404).json({ error: "Venta no encontrada" });
    }

    return res.json({
      ok: true,
      venta_id: ventaId,
      tipo_operacion_id: tipoOperacionId,
      operacion
    });
  } catch (err) {
    return res.status(400).json({ error: err.message || "No se pudo guardar operacion" });
  } finally {
    client.release();
  }
});

// =======================================
// EN ESPERA / REANUDAR (FLUJO AUXILIAR)
// =======================================
router.post("/en-espera/:id", requirePermisoVentaRapida("venta_rapida_ver"), async (req, res) => {
  const id = Number(req.params.id);
  const notaEspera = String(req.body?.nota_espera || "").trim() || null;
  const prioridad = Math.max(1, Math.min(9, Number(req.body?.prioridad_espera || 1) || 1));
  const usuarioId = Number(req?.usuario?.id || req?.usuario?.usuario_id || 0) || null;

  if (!id) return res.status(400).json({ error: "ID invalido" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const v = await client.query(
      `SELECT id, estado FROM venta WHERE id = $1 FOR UPDATE`,
      [id]
    );
    if (!v.rowCount) throw new Error("Venta no encontrada");

    const estado = String(v.rows[0].estado || "").toUpperCase();
    if (estado === "EFECTIVADO") throw new Error("No se puede poner en espera una venta cobrada");
    if (estado === "CANCELADO") throw new Error("No se puede poner en espera una venta cancelada");

    await client.query(
      `
      UPDATE venta
      SET estado = 'EN_ESPERA',
          en_espera_desde = NOW(),
          en_espera_por_usuario_id = COALESCE($2, en_espera_por_usuario_id),
          prioridad_espera = $3,
          nota_espera = $4
      WHERE id = $1
      `,
      [id, usuarioId, prioridad, notaEspera]
    );

    await client.query("COMMIT");
    res.json({ ok: true, id, estado: "EN_ESPERA" });
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(400).json({ error: err.message || "No se pudo poner en espera" });
  } finally {
    client.release();
  }
});

router.post("/reanudar/:id", requirePermisoVentaRapida("venta_rapida_ver"), async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "ID invalido" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const v = await client.query(
      `SELECT id, estado FROM venta WHERE id = $1 FOR UPDATE`,
      [id]
    );
    if (!v.rowCount) throw new Error("Venta no encontrada");

    const estado = String(v.rows[0].estado || "").toUpperCase();
    if (estado === "EFECTIVADO") throw new Error("No se puede reanudar una venta cobrada");
    if (estado === "CANCELADO") throw new Error("No se puede reanudar una venta cancelada");

    await client.query(
      `
      UPDATE venta
      SET estado = 'PENDIENTE',
          en_espera_desde = NULL,
          en_espera_por_usuario_id = NULL,
          prioridad_espera = 1
      WHERE id = $1
      `,
      [id]
    );

    await client.query("COMMIT");
    res.json({ ok: true, id, estado: "PENDIENTE" });
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(400).json({ error: err.message || "No se pudo reanudar la venta" });
  } finally {
    client.release();
  }
});

router.get("/en-espera", requirePermisoVentaRapida("venta_rapida_ver"), async (req, res) => {
  try {
    const empresaId = getEmpresaIdFromReq(req);
    const terminalId = getTerminalIdFromReq(req);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 40) || 40));

    const params = [];
    let idx = 1;
    const where = [`v.estado = 'EN_ESPERA'`];
    let mesaJoin = "LEFT JOIN mesa m ON m.venta_id = v.id";

    if (empresaId && terminalId) {
      params.push(empresaId, terminalId);
      mesaJoin = `LEFT JOIN mesa m ON m.venta_id = v.id AND m.empresa_id = $${idx++} AND m.terminal_id = $${idx++}`;
    }

    params.push(limit);
    const result = await pool.query(
      `
      SELECT
        v.id,
        v.numero,
        v.estado,
        v.fecha,
        v.total,
        v.cliente_id,
        COALESCE(v.cliente_nombre, c.nombre, 'Ocasional') AS cliente_nombre,
        v.vendedor_id,
        ve.nombre AS vendedor_nombre,
        v.en_espera_desde,
        v.prioridad_espera,
        v.nota_espera,
        m.id AS mesa_id,
        m.numero AS mesa_numero
      FROM venta v
      LEFT JOIN cliente c ON c.id = v.cliente_id
      LEFT JOIN vendedor ve ON ve.id = v.vendedor_id
      ${mesaJoin}
      WHERE ${where.join(" AND ")}
      ORDER BY COALESCE(v.prioridad_espera, 1) DESC, COALESCE(v.en_espera_desde, v.fecha) ASC
      LIMIT $${idx}
      `,
      params
    );

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message || "No se pudo listar ventas en espera" });
  }
});

// =======================================
// CANCELAR VENTA
// =======================================
router.post("/cancelar/:id", requirePermisoVentaRapida("venta_rapida_cancelar"), async (req, res) => {

  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "ID inválido" });

  const client = await pool.connect();

  try {

    await client.query("BEGIN");

    const v = await client.query(
      `SELECT estado FROM venta WHERE id = $1 FOR UPDATE`,
      [id]
    );

    if (v.rowCount === 0) {
      throw new Error("Venta no existe");
    }

    const estado = v.rows[0].estado;

    if (estado === "CANCELADO") {
      throw new Error("Venta ya cancelada");
    }

// =====================================
// DEVOLVER STOCK SI YA ESTABA CONCLUIDO O EFECTIVADO
// =====================================
if (estado === "CONCLUIDO" || estado === "EFECTIVADO") {

  const detalle = await client.query(`
    SELECT producto_id, cantidad
    FROM venta_detalle
    WHERE venta_id = $1
  `, [id]);

  for (const item of detalle.rows) {

    const prod = await client.query(`
      SELECT no_control_stock
      FROM producto
      WHERE id = $1
    `, [item.producto_id]);

    if (!prod.rows[0].no_control_stock) {

      await client.query(`
        UPDATE producto
        SET stock = stock + $1
        WHERE id = $2
      `, [item.cantidad, item.producto_id]);

      await registrarStockMovimientoVenta(client, {
        productoId: item.producto_id,
        empresaId: getEmpresaIdFromReq(req),
        tipo: "ENTRADA",
        cantidad: item.cantidad,
        referenciaId: id,
        referenciaTipo: "VENTA_CANCELADA"
      });

    }

  }

}
    // =====================================
    // CANCELAR VENTA
    // =====================================
    await client.query(
      `UPDATE venta
       SET estado = 'CANCELADO',
           pago = 'CANCELADO',
           estado_caja = 'ANULADO',
           comision = 0
       WHERE id = $1`,
      [id]
    );

    await clearMesaByVentaId(client, id, getMesaScopeFromReq(req));

    await client.query("COMMIT");

    res.json({ ok: true });

  } catch (err) {

    await client.query("ROLLBACK");
    res.status(400).json({ error: err.message });

  } finally {

    client.release();

  }

});

// =======================================
// CONCLUIR VENTA
// =======================================
router.post("/concluir/:id", requirePermisoVentaRapida("venta_rapida_ver"), async (req, res) => {

  const id = Number(req.params.id);

  if (!id) {
    return res.status(400).json({ error: "ID inválido" });
  }

  try {
    await ensureOperacionCatalogSchema();

    const venta = await pool.query(
      "SELECT id, numero, estado, tipo_operacion_id FROM venta WHERE id = $1",
      [id]
    );

    if (!venta.rowCount) {
      return res.status(404).json({ error: "Venta no encontrada" });
    }

    const ventaRow = venta.rows[0];
    const estado = ventaRow.estado;

    // ðŸ”’ evitar estados invÃ¡lidos
    if (estado === "EFECTIVADO") {
      return res.status(400).json({ error: "La venta ya fue cobrada" });
    }

    if (estado === "CANCELADO") {
      return res.status(400).json({ error: "La venta está cancelada" });
    }

    // ðŸ” si ya estÃ¡ concluida â†’ ok
    if (estado === "CONCLUIDO") {
      return res.json({ ok: true });
    }

    let tipoOperacionId = toOperacionId(ventaRow.tipo_operacion_id);
    if (!tipoOperacionId) {
      tipoOperacionId = await findDefaultOperacionVentaId();
      if (!tipoOperacionId) {
        return res.status(400).json({ error: "No hay operacion de venta activa configurada" });
      }

      await pool.query(
        `
          UPDATE venta
          SET tipo_operacion_id = $1
          WHERE id = $2
        `,
        [tipoOperacionId, id]
      );
    }

    const operacion = await resolveOperacionVenta(pool, tipoOperacionId);
    if (operacion.requiere_credito === true) {
      return res.status(400).json({
        error: "La operacion seleccionada requiere credito y no puede concluirse para cobro contado"
      });
    }
    if (operacion.genera_financiero === false) {
      return res.status(400).json({
        error: "La operacion seleccionada no genera movimiento financiero/caja"
      });
    }

    await pool.query(
      "UPDATE venta SET estado = 'CONCLUIDO' WHERE id = $1",
      [id]
    );

    res.json({ ok: true });

  } catch (err) {

    console.error("ERROR CONCLUIR:", err);

    res.status(500).json({
      error: "Error concluyendo venta"
    });

  }

});



// =======================================
// BUSCAR VENTA POR NÃšMERO â€” PARA EL POS
// GET /api/venta/buscar/:numero
// =======================================
router.get("/buscar/:numero", requirePermisoVentaRapida("venta_rapida_ver"), async (req, res) => {

  const numero = Number(req.params.numero);
  if (!numero) return res.status(400).json({ error: "Número inválido" });

  try {

    await ensureMesaSchema();
    await ensureMonedaSchema();
    const mesaScope = getMesaScopeFromReq(req);
    const mesaParams = [numero];
    let mesaJoin = "LEFT JOIN mesa m ON m.venta_id = v.id";

    if (mesaScope) {
      mesaParams.push(mesaScope.empresa_id, mesaScope.terminal_id);
      mesaJoin = `LEFT JOIN mesa m ON m.venta_id = v.id
      AND m.empresa_id = $2
      AND m.terminal_id = $3`;
    }

    const ventaRes = await pool.query(`
      SELECT
        v.id,
        v.numero,
  v.fecha,
        v.estado,
        v.comision,
        m.id AS mesa_id,
        m.numero AS mesa,
          v.tipo_pedido_id,
        v.tipo_operacion_id,
        o.codigo AS operacion_codigo,
        o.descripcion AS operacion_descripcion,
        o.tipo AS operacion_tipo,
        COALESCE(o.permite_credito, false) AS operacion_permite_credito,
        COALESCE(o.requiere_credito, false) AS operacion_requiere_credito,
        v.cliente_id,
        COALESCE(v.cliente_nombre, c.nombre, 'Ocasional') AS cliente_nombre,
        v.vendedor_id,
        ve.nombre AS vendedor_nombre
      FROM venta v
      LEFT JOIN cliente  c  ON c.id  = v.cliente_id
      LEFT JOIN vendedor ve ON ve.id = v.vendedor_id
      LEFT JOIN tipo_operacion o ON o.id = v.tipo_operacion_id
      ${mesaJoin}
      WHERE v.numero = $1
      ORDER BY v.id DESC
      LIMIT 1
    `, mesaParams);

    if (ventaRes.rowCount === 0) {
      return res.status(404).json({ error: "Pedido no encontrado" });
    }

    const venta = ventaRes.rows[0];

    const detalleRes = await pool.query(`
      SELECT
        vd.id,
        vd.producto_id,
        vd.cantidad,
        vd.precio,
        vd.subtotal,
        vd.observacion,
        vd.precio_moneda_id,
        vd.precio_moneda_origen,
        vd.precio_gs,
        vd.precio_brl,
        vd.precio_usd,
        vd.cotizacion_id,
        vd.cotizacion_brl,
        vd.cotizacion_usd,

        p.nombre AS descripcion,
        p.destino_impresion,
        p.efectivacion_directa,
        p.permite_multi_sabor,
        p.max_sabores

      FROM venta_detalle vd
      JOIN producto p ON p.id = vd.producto_id
      WHERE vd.venta_id = $1
      ORDER BY vd.id
    `, [venta.id]);

    const items = detalleRes.rows.map(d => {

      //  convertir observacion en sabores
    let sabores = [];

if (d.observacion && d.permite_multi_sabor) {

  const partes = d.observacion.split("|");

  const saboresTexto = partes[0] || "";

  sabores = saboresTexto
    .split("/")
    .map(s => s.trim())
    .filter(s => s.length > 0)
    .map(nombre => ({
      nombre
    }));
}
      return {

        id:           d.id,
        producto_id:  d.producto_id,
        descripcion:  d.descripcion,

        precio: Number(d.precio),
        precio_moneda_id: Number(d.precio_moneda_id) || MONEDA_IDS.PYG,
        precio_moneda_origen: d.precio_moneda_origen == null ? null : Number(d.precio_moneda_origen),
        precio_gs: d.precio_gs == null ? Number(d.precio) : Number(d.precio_gs),
        precio_brl: d.precio_brl == null ? null : Number(d.precio_brl),
        precio_usd: d.precio_usd == null ? null : Number(d.precio_usd),
        cotizacion_id: d.cotizacion_id == null ? null : Number(d.cotizacion_id),
        cotizacion_brl: d.cotizacion_brl == null ? null : Number(d.cotizacion_brl),
        cotizacion_usd: d.cotizacion_usd == null ? null : Number(d.cotizacion_usd),

precioManual: d.precio_gs == null ? Number(d.precio) : Number(d.precio_gs), // mismo valor real

precioOriginal: d.precio_gs == null ? Number(d.precio) : Number(d.precio_gs), // base tambien,

        cantidad:     Number(d.cantidad),
        subtotal:     Number(d.subtotal),

        observacion:  d.observacion || "",
        nota:         d.observacion || "",

        confirmado:   false,

        destino_impresion: POS_SIN_COCINA ? "" : (d.destino_impresion || ""),

        requiere_preparacion: POS_SIN_COCINA
          ? false
          : d.destino_impresion === "cocina",

        efectivacion_directa:
          d.efectivacion_directa === true ||
          d.efectivacion_directa === "true" ||
          d.efectivacion_directa === 1,

        permite_multi_sabor:
          d.permite_multi_sabor === true ||
          d.permite_multi_sabor === "true" ||
          d.permite_multi_sabor === 1,

        max_sabores: Number(d.max_sabores) || 1,
        sabores

      };

    });

    return res.json({
      id:              venta.id,
      numero:          venta.numero,
      fecha:           venta.fecha,
      estado:          venta.estado,
      comision:        toNumber(venta.comision),
      mesa_id:         venta.mesa_id || null,
      mesa:            venta.mesa || "",
      tipo_pedido_id: venta.tipo_pedido_id,
      tipo_operacion_id: venta.tipo_operacion_id || null,
      operacion_codigo: venta.operacion_codigo || null,
      operacion_descripcion: venta.operacion_descripcion || null,
      operacion_tipo: venta.operacion_tipo || null,
      operacion_permite_credito: venta.operacion_permite_credito === true,
      operacion_requiere_credito: venta.operacion_requiere_credito === true,
      cliente_id:      venta.cliente_id,
      cliente_nombre:  venta.cliente_nombre,
      vendedor_id:     venta.vendedor_id,
      vendedor_nombre: venta.vendedor_nombre,
      items
    });

  } catch (err) {
    console.error("Error buscando pedido:", err);
    res.status(500).json({ error: "Error buscando pedido" });
  }

});


router.get("/reporte", async (req, res) => {

  const { desde, hasta, cliente, producto, tipo } = req.query;
  const tipoReporte = String(tipo || "detallado").trim().toLowerCase();
  const comisionDetalleExpr = `
    CASE
      WHEN COALESCE(v.total, 0) > 0
        THEN COALESCE(v.comision, 0) * ((vd.cantidad * vd.precio) / NULLIF(v.total, 0))
      ELSE 0
    END
  `;
  try {
    await ensureComisionSchema();
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }


  // =======================================
// REPORTE AGRUPADO POR PRODUCTO
// =======================================

if (tipoReporte === "producto") {

  let sql = `
  SELECT
    p.nombre AS producto,
    SUM(vd.cantidad) AS cantidad,
    SUM(vd.cantidad * vd.precio) AS total,
    SUM(${comisionDetalleExpr}) AS comision_total
  FROM venta_detalle vd
  JOIN venta v ON v.id = vd.venta_id
  JOIN producto p ON p.id = vd.producto_id
  LEFT JOIN cliente c ON c.id = v.cliente_id
  WHERE v.estado = 'EFECTIVADO'
  `;

  const params = [];
  let i = 1;

  if (desde)    { sql += ` AND v.fecha::date >= $${i++}`; params.push(desde); }
  if (hasta)    { sql += ` AND v.fecha::date <= $${i++}`; params.push(hasta); }
  if (producto) { sql += ` AND LOWER(p.nombre) LIKE LOWER($${i++})`; params.push(`%${producto}%`); }
  if (cliente)  { sql += ` AND LOWER(COALESCE(v.cliente_nombre,c.nombre,'Ocasional')) LIKE LOWER($${i++})`; params.push(`%${cliente}%`); }
  sql += ` GROUP BY p.nombre ORDER BY total DESC`;

  const r = await pool.query(sql, params);

  return res.json(r.rows);

}

// =======================================
// REPORTE GANANCIA POR PRODUCTO
// =======================================

if (tipoReporte === "ganancia") {

  let sql = `
  SELECT
    p.nombre AS producto,
    SUM(vd.cantidad) AS cantidad,
    vd.precio,
    pp.precio_compra,
    pp.costo_transporte,
    SUM(vd.cantidad * vd.precio) AS subtotal,
    SUM(${comisionDetalleExpr}) AS comision_total
  FROM venta_detalle vd
  JOIN venta v ON v.id = vd.venta_id
  JOIN producto p ON p.id = vd.producto_id

  LEFT JOIN producto_precio pp 
  ON pp.producto_id = p.id
  AND pp.activo = true
  LEFT JOIN cliente c ON c.id = v.cliente_id

  WHERE v.estado = 'EFECTIVADO'
  `;

  const params = [];
  let i = 1;

  if (desde) {
    sql += ` AND v.fecha::date >= $${i++}`;
    params.push(desde);
  }

  if (hasta) {
    sql += ` AND v.fecha::date <= $${i++}`;
    params.push(hasta);
  }

  if (producto) {
    sql += ` AND LOWER(p.nombre) LIKE LOWER($${i++})`;
    params.push(`%${producto}%`);
  }

  if (cliente) {
    sql += ` AND LOWER(COALESCE(v.cliente_nombre,c.nombre,'Ocasional')) LIKE LOWER($${i++})`;
    params.push(`%${cliente}%`);
  }

  sql += `
  GROUP BY
    p.nombre,
    vd.precio,
    pp.precio_compra,
    pp.costo_transporte
  ORDER BY producto
  `;

  const r = await pool.query(sql, params);

  return res.json(r.rows);

}

/* =======================================
REPORTE POR CATEGORIA
======================================= */

if (tipoReporte === "categoria") {

  let sql = `
  SELECT
    c.nombre AS categoria,
    SUM(vd.cantidad) AS cantidad,
    SUM(vd.cantidad * vd.precio) AS total,
    SUM(${comisionDetalleExpr}) AS comision_total
  FROM venta_detalle vd
  JOIN venta v ON v.id = vd.venta_id
  JOIN producto p ON p.id = vd.producto_id
  JOIN categoria c ON c.id = p.categoria_id
  LEFT JOIN cliente cl ON cl.id = v.cliente_id
  WHERE v.estado = 'EFECTIVADO'
  `;

  const params = [];
  let i = 1;

  if (desde) {
    sql += ` AND v.fecha::date >= $${i++}`;
    params.push(desde);
  }

  if (hasta) {
    sql += ` AND v.fecha::date <= $${i++}`;
    params.push(hasta);
  }

  if (cliente) {
    sql += ` AND LOWER(COALESCE(v.cliente_nombre,cl.nombre,'Ocasional')) LIKE LOWER($${i++})`;
    params.push(`%${cliente}%`);
  }

  if (producto) {
    sql += ` AND LOWER(p.nombre) LIKE LOWER($${i++})`;
    params.push(`%${producto}%`);
  }

  sql += `
  GROUP BY c.nombre
  ORDER BY total DESC
  `;

  const r = await pool.query(sql, params);

  return res.json(r.rows);

}

if (tipoReporte === "comision_vendedor") {

  let sql = `
SELECT
  COALESCE(ve.nombre, 'Sin vendedor') AS vendedor,
  COUNT(*) AS ventas,
  SUM(v.total) AS total_ventas,
  SUM(v.comision) AS total_comision

FROM venta v
LEFT JOIN vendedor ve ON ve.id = v.vendedor_id
LEFT JOIN cliente c ON c.id = v.cliente_id

WHERE v.estado = 'EFECTIVADO'
  `;

  const params = [];
  let i = 1;

  if (desde) {
    sql += ` AND v.fecha::date >= $${i++}`;
    params.push(desde);
  }

  if (hasta) {
    sql += ` AND v.fecha::date <= $${i++}`;
    params.push(hasta);
  }

  if (cliente) {
    sql += ` AND LOWER(COALESCE(v.cliente_nombre,c.nombre,'Ocasional')) LIKE LOWER($${i++})`;
    params.push(`%${cliente}%`);
  }

  if (producto) {
    sql += ` AND EXISTS (
      SELECT 1
      FROM venta_detalle vd2
      JOIN producto p2 ON p2.id = vd2.producto_id
      WHERE vd2.venta_id = v.id
        AND LOWER(p2.nombre) LIKE LOWER($${i++})
    )`;
    params.push(`%${producto}%`);
  }

  sql += `
  GROUP BY COALESCE(ve.nombre, 'Sin vendedor')
  ORDER BY total_comision DESC, vendedor ASC
  `;

  const r = await pool.query(sql, params);
  return res.json(r.rows);
}


  let sql = `
  SELECT
  v.id,
  v.fecha,
  v.numero,
  COALESCE(v.cliente_nombre, c.nombre, 'Ocasional') AS cliente,
  ve.nombre AS vendedor,
  p.nombre AS producto,
  SUM(vd.cantidad) AS cantidad,
  vd.precio,

  pp.precio_compra,
  pp.costo_transporte,

  SUM(vd.cantidad * vd.precio) AS subtotal,
  SUM(${comisionDetalleExpr}) AS comision

  FROM venta_detalle vd
  JOIN venta v ON v.id = vd.venta_id
  JOIN producto p ON p.id = vd.producto_id

  LEFT JOIN producto_precio pp 
  ON pp.producto_id = p.id
  AND pp.activo = true

  LEFT JOIN cliente c ON c.id = v.cliente_id
  LEFT JOIN vendedor ve ON ve.id = v.vendedor_id

  WHERE v.estado = 'EFECTIVADO'
  `;

  const params = [];
  let i = 1;

  if (desde) {
    sql += ` AND v.fecha::date >= $${i++}`;
    params.push(desde);
  }

  if (hasta) {
    sql += ` AND v.fecha::date <= $${i++}`;
    params.push(hasta);
  }

  if (cliente) {
    sql += ` AND LOWER(COALESCE(v.cliente_nombre,c.nombre,'Ocasional')) LIKE LOWER($${i++})`;
    params.push(`%${cliente}%`);
  }

  if (producto) {
    sql += ` AND LOWER(p.nombre) LIKE LOWER($${i++})`;
    params.push(`%${producto}%`);
  }

  sql += `
GROUP BY
v.id,
v.fecha,
  v.numero,
  c.nombre,
  v.cliente_nombre,
  ve.nombre,
  p.nombre,
  vd.precio,
  v.total,
  v.comision,
  pp.precio_compra,
  pp.costo_transporte
ORDER BY v.fecha DESC
  `;

  const r = await pool.query(sql, params);

  res.json(r.rows);
});


// =======================================
// REINICIAR NUMERO DE PEDIDO
// =======================================
router.post("/reiniciar-numeracion", async (req, res) => {

  try {

    await pool.query(`
      SELECT setval('venta_numero_seq', 1, false)
    `);

    res.json({
      ok: true,
      mensaje: "Numeración reiniciada. El próximo pedido será 1."
    });

  } catch (err) {

    console.error(err);

    res.status(500).json({
      error: "No se pudo reiniciar la numeración"
    });

  }

});

// =======================================
// GET VENTA POR ID (PARA CAJA)
// =======================================
router.get("/:id", requirePermisoVentaRapida("venta_rapida_ver"), async (req, res) => {

  const raw = String(req.params.id ?? "").trim();
  const id = Number.parseInt(raw, 10);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "ID de venta invalido" });
  }

  try {

    await ensureMesaSchema();
    await ensureMonedaSchema();
    const mesaScope = getMesaScopeFromReq(req);
    const mesaParams = [id];
    let mesaJoin = "LEFT JOIN mesa m ON m.venta_id = v.id";

    if (mesaScope) {
      mesaParams.push(mesaScope.empresa_id, mesaScope.terminal_id);
      mesaJoin = `LEFT JOIN mesa m ON m.venta_id = v.id
  AND m.empresa_id = $2
  AND m.terminal_id = $3`;
    }

    const ventaRes = await pool.query(`
  SELECT 
  v.id, 
  v.numero, 
v.fecha,
  v.total, 
  v.comision,
  v.estado,
  v.tipo_pedido_id,
  v.tipo_operacion_id,
  o.codigo AS operacion_codigo,
  o.descripcion AS operacion_descripcion,
  o.tipo AS operacion_tipo,
  COALESCE(o.permite_credito, false) AS operacion_permite_credito,
  COALESCE(o.requiere_credito, false) AS operacion_requiere_credito,
  m.id AS mesa_id,
  m.numero AS mesa,
  COALESCE(v.cliente_nombre, c.nombre, 'Ocasional') AS cliente_nombre   
FROM venta v
LEFT JOIN cliente c ON c.id = v.cliente_id
LEFT JOIN tipo_operacion o ON o.id = v.tipo_operacion_id
${mesaJoin}
WHERE v.id = $1
`, mesaParams);

    if (ventaRes.rowCount === 0) {
      return res.status(404).json({ error: "Venta no encontrada" });
    }

    const detalleRes = await pool.query(`
     SELECT 
  vd.id,
  vd.producto_id,
  vd.cantidad,
  vd.precio,
  vd.subtotal,
  vd.observacion,
  vd.precio_moneda_id,
  vd.precio_moneda_origen,
  vd.precio_gs,
  vd.precio_brl,
  vd.precio_usd,
  vd.cotizacion_id,
  vd.cotizacion_brl,
  vd.cotizacion_usd,

  p.nombre AS descripcion,
  p.destino_impresion,
  p.efectivacion_directa,
  p.permite_multi_sabor

FROM venta_detalle vd
JOIN producto p ON p.id = vd.producto_id
WHERE vd.venta_id = $1
    `, [id]);

res.json({
  id: ventaRes.rows[0].id,
  numero: ventaRes.rows[0].numero,
  fecha: ventaRes.rows[0].fecha,
  total: ventaRes.rows[0].total,
  comision: toNumber(ventaRes.rows[0].comision),
  estado: ventaRes.rows[0].estado,
  tipo_pedido_id: ventaRes.rows[0].tipo_pedido_id,
  tipo_operacion_id: ventaRes.rows[0].tipo_operacion_id || null,
  operacion_codigo: ventaRes.rows[0].operacion_codigo || null,
  operacion_descripcion: ventaRes.rows[0].operacion_descripcion || null,
  operacion_tipo: ventaRes.rows[0].operacion_tipo || null,
  operacion_permite_credito: ventaRes.rows[0].operacion_permite_credito === true,
  operacion_requiere_credito: ventaRes.rows[0].operacion_requiere_credito === true,
  mesa_id: ventaRes.rows[0].mesa_id || null,
  mesa: ventaRes.rows[0].mesa || "",
  cliente_nombre: ventaRes.rows[0].cliente_nombre, 
  detalles: detalleRes.rows.map((row) => ({
    ...row,
    destino_impresion: POS_SIN_COCINA ? "" : (row.destino_impresion || ""),
    requiere_preparacion: POS_SIN_COCINA ? false : row.destino_impresion === "cocina",
    precio_moneda_id: Number(row.precio_moneda_id) || MONEDA_IDS.PYG,
    precio_moneda_origen: row.precio_moneda_origen == null ? null : Number(row.precio_moneda_origen),
    precio_gs: row.precio_gs == null ? Number(row.precio) : Number(row.precio_gs),
    precio_brl: row.precio_brl == null ? null : Number(row.precio_brl),
    precio_usd: row.precio_usd == null ? null : Number(row.precio_usd),
    cotizacion_id: row.cotizacion_id == null ? null : Number(row.cotizacion_id),
    cotizacion_brl: row.cotizacion_brl == null ? null : Number(row.cotizacion_brl),
    cotizacion_usd: row.cotizacion_usd == null ? null : Number(row.cotizacion_usd)
  }))
});

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error trayendo venta" });
  }

});


module.exports = router;




