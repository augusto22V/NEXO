  const express = require("express");
  const router = express.Router();
  const pool = require("../db");
  const { ensureMesaSchema } = require("../services/mesa.service");
  const escpos = require("escpos");
  escpos.Network = require("escpos-network");
  escpos.Image = require("escpos").Image;
  const fs = require("fs");
  const path = require("path");
  const net = require("net");
  const os = require("os");
  const { exec } = require("child_process");
  const { requirePermisoVentaRapida } = require("../services/permisos.service");
  const { ensureKitchenPrintSchema } = require("../services/cocina_print.service");
  const ANCHO = 48;
  const CMD = {
  INIT: Buffer.from([0x1b, 0x40]),
  ALIGN_CENTER: Buffer.from([0x1b, 0x61, 0x01]),
  ALIGN_LEFT: Buffer.from([0x1b, 0x61, 0x00]),
  ALIGN_RIGHT: Buffer.from([0x1b, 0x61, 0x02]),
  BOLD_ON: Buffer.from([0x1b, 0x45, 0x01]),
  BOLD_OFF: Buffer.from([0x1b, 0x45, 0x00]),
  FONT_GRANDE: Buffer.from([0x1d, 0x21, 0x11]),
  FONT_NORMAL: Buffer.from([0x1d, 0x21, 0x00]),
  FEED: Buffer.from([0x0a, 0x0a]),
  CUT: Buffer.from([0x1d, 0x56, 0x00])
  };

  function getConfigPath(req) {

  if (!req.usuario || !req.usuario.terminal_id || !req.usuario.empresa_id) {
    throw new Error("Terminal o empresa no identificada");
  }

  const empresaId = req.usuario.empresa_id;

  const terminalNombre = (req.usuario.terminal_nombre || "terminal")
    .replace(/\s+/g, "_")
    .toLowerCase();

  return path.join(
    __dirname,
    `../config/empresa_${empresaId}/impresoras_${terminalNombre}.json`
  );
  }

  async function imprimirConRetry(fn, intentos = 2) {
  let ultimoError = null;

  for (let i = 0; i < intentos; i++) {
    try {
      await fn();
      console.log(`✅ OK intento ${i + 1}`);
      return true;
    } catch (err) {
      ultimoError = err;
      console.log(`⚠️ intento ${i + 1} falló:`, err.message);
      await new Promise(r => setTimeout(r, 300));
    }
  }

  console.log("❌ Falló totalmente:", ultimoError?.message);
  return false;
  }

  function getConfig(req) {

  const CONFIG_PATH = getConfigPath(req);

  if (!fs.existsSync(CONFIG_PATH)) return {};

  return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  }


  /*
  =======================================
  CANCELAR TODO SI PASA NO ENCUENTRA IMPORESORA EN TAL SEGUNDOS 
  =======================================
  */
  function probarConexion(ip, puerto = 9100, timeout = 300) {

  return new Promise((resolve) => {

    const socket = new net.Socket();

    const timer = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, timeout);

    socket.connect(puerto, ip, () => {
      clearTimeout(timer);
      socket.destroy();
      resolve(true);
    });

    socket.on("error", () => {
      clearTimeout(timer);
      resolve(false);
    });

  });

  }

  function createRouteError(status, payload = {}) {
  const error = new Error(payload.error || "Error");
  error.status = status;
  error.payload = { ok: false, ...payload };
  return error;
  }

  function normalizeKitchenRequestUuid(raw) {
  const value = String(raw || "").trim();
  if (!value) return null;
  if (value.length < 16 || value.length > 80) return null;
  if (!/^[a-zA-Z0-9._:-]+$/.test(value)) return null;
  return value;
  }

  function normalizePrintDestination(value) {
  return String(value || "").trim().toLowerCase();
  }

  async function findKitchenRequestByUuid(requestUuid) {
  if (!requestUuid) return null;

  const result = await pool.query(
    `
    SELECT
      request_uuid,
      venta_id,
      estado,
      reimprimir,
      intentos,
      ultimo_error,
      ultimo_resultado,
      updated_at
    FROM venta_cocina_envio
    WHERE request_uuid = $1
    LIMIT 1
    `,
    [requestUuid]
  );

  return result.rows[0] || null;
  }

  function buildKitchenIdempotentResponse(existing) {
  const result = existing?.ultimo_resultado && typeof existing.ultimo_resultado === "object"
    ? existing.ultimo_resultado
    : {};

  return {
    ok: true,
    duplicado: true,
    estado: existing?.estado || "PENDIENTE",
    request_uuid: existing?.request_uuid || null,
    ...result
  };
  }

  function isFreshKitchenProcessing(existing, maxAgeMs = 15000) {
  if (!existing || existing.estado !== "PROCESANDO") return false;
  const updatedAt = existing.updated_at ? new Date(existing.updated_at).getTime() : 0;
  if (!updatedAt) return false;
  return (Date.now() - updatedAt) < maxAgeMs;
  }

  async function upsertKitchenRequestProcessing(queryable, payload = {}) {
  const requestUuid = normalizeKitchenRequestUuid(payload.requestUuid);
  if (!requestUuid) return null;

  const result = await queryable.query(
    `
    INSERT INTO venta_cocina_envio (
      request_uuid,
      empresa_id,
      terminal_id,
      venta_id,
      reimprimir,
      cliente_nombre,
      estado,
      intentos,
      ultimo_error,
      updated_at,
      procesando_desde
    ) VALUES (
      $1, $2, $3, $4, $5, $6, 'PROCESANDO', 1, NULL, NOW(), NOW()
    )
    ON CONFLICT (request_uuid) DO UPDATE
    SET
      empresa_id = EXCLUDED.empresa_id,
      terminal_id = EXCLUDED.terminal_id,
      venta_id = EXCLUDED.venta_id,
      reimprimir = EXCLUDED.reimprimir,
      cliente_nombre = EXCLUDED.cliente_nombre,
      estado = 'PROCESANDO',
      intentos = venta_cocina_envio.intentos + 1,
      ultimo_error = NULL,
      updated_at = NOW(),
      procesando_desde = NOW()
    RETURNING request_uuid, venta_id, estado, intentos
    `,
    [
      requestUuid,
      payload.empresaId || null,
      payload.terminalId || null,
      payload.ventaId,
      !!payload.reimprimir,
      payload.clienteNombre || null
    ]
  );

  return result.rows[0] || null;
  }

  async function markKitchenRequestSent(queryable, requestUuid, resultData = {}) {
  const normalized = normalizeKitchenRequestUuid(requestUuid);
  if (!normalized) return;

  await queryable.query(
    `
    UPDATE venta_cocina_envio
    SET
      estado = 'ENVIADO',
      ultimo_error = NULL,
      ultimo_resultado = $2::jsonb,
      updated_at = NOW(),
      completado_en = NOW()
    WHERE request_uuid = $1
    `,
    [normalized, JSON.stringify(resultData || {})]
  );
  }

  async function markKitchenRequestPending(queryable, requestUuid, errorMessage) {
  const normalized = normalizeKitchenRequestUuid(requestUuid);
  if (!normalized) return;

  await queryable.query(
    `
    UPDATE venta_cocina_envio
    SET
      estado = 'PENDIENTE',
      ultimo_error = $2,
      updated_at = NOW()
    WHERE request_uuid = $1
    `,
    [normalized, errorMessage || "Pendiente de reintento"]
  );
  }

  async function loadKitchenPrintContext(ventaId, { reimprimir = false } = {}) {
  const cab = await pool.query(
    `
    SELECT
      v.numero,
      m.numero AS mesa,
      v.cliente_nombre,
      v.cliente_id,
      c.nombre AS cliente_real,
      v.estado,
      tp.nombre AS tipo_pedido
    FROM venta v
    LEFT JOIN cliente c ON c.id = v.cliente_id
    LEFT JOIN tipo_pedido tp ON tp.id_tipo_pedido = v.tipo_pedido_id
    LEFT JOIN mesa m ON m.venta_id = v.id
    WHERE v.id = $1
    `,
    [ventaId]
  );

  if (cab.rowCount === 0) {
    throw createRouteError(404, { error: "Venta no encontrada" });
  }

  const venta = cab.rows[0];

  if (venta.estado === "CANCELADO" || venta.estado === "EFECTIVADO") {
    throw createRouteError(400, { error: "Venta no válida para impresión" });
  }

  const yaImpreso = venta.estado === "CONCLUIDO";
  const esReimpresionTotal = !!reimprimir;

  const itemsSql = esReimpresionTotal
    ? `
      SELECT
        vd.id,
        vd.cantidad,
        p.nombre,
        vd.observacion,
        p.destino_impresion
      FROM venta_detalle vd
      JOIN producto p ON p.id = vd.producto_id
      WHERE vd.venta_id = $1
      AND p.destino_impresion IS NOT NULL
      AND LOWER(TRIM(p.destino_impresion)) <> 'ninguno'
      ORDER BY vd.id
      `
    : `
      SELECT
        vd.id,
        vd.cantidad,
        p.nombre,
        vd.observacion,
        p.destino_impresion
      FROM venta_detalle vd
      JOIN producto p ON p.id = vd.producto_id
      WHERE vd.venta_id = $1
      AND vd.enviado_cocina = false
      AND p.destino_impresion IS NOT NULL
      AND LOWER(TRIM(p.destino_impresion)) <> 'ninguno'
      ORDER BY vd.id
      `;

  const det = await pool.query(itemsSql, [ventaId]);
  const itemsDB = det.rows;

  if (!itemsDB.length) {
    if (esReimpresionTotal) {
      throw createRouteError(400, {
        error: "La venta no tiene productos para reimprimir"
      });
    }

    throw createRouteError(409, {
      sin_pendientes: true,
      error: "No hay productos pendientes para cocina"
    });
  }

  const grupos = {};

  itemsDB.forEach((item) => {
    const destino = normalizePrintDestination(item.destino_impresion);
    if (!destino || destino === "ninguno") return;
    if (!grupos[destino]) grupos[destino] = [];
    grupos[destino].push(item);
  });

  if (Object.keys(grupos).length === 0) {
    throw createRouteError(400, {
      error: "No hay productos con destino de impresión"
    });
  }

  return {
    venta,
    yaImpreso,
    esReimpresionTotal,
    itemsDB,
    grupos
  };
  }

  async function validateKitchenPrinters(req, grupos = {}) {
  const cfg = getConfig(req);
  const destinos = [];

  for (const destino of Object.keys(grupos)) {
    const impresora = cfg[destino];

    if (!impresora) {
      throw createRouteError(400, {
        sin_impresora: true,
        error: `No hay impresora configurada para ${destino}`
      });
    }

    const ip = impresora.ip;
    const puerto = impresora.puerto || 9100;
    const conexion = await probarConexion(ip, puerto, 800);

    if (!conexion) {
      throw createRouteError(503, {
        sin_impresora: true,
        error: `La impresora de ${destino} no responde`
      });
    }

    destinos.push({
      destino,
      ip,
      puerto
    });
  }

  return {
    cfg,
    destinos
  };
  }




  function txt(t) {
  return Buffer.from(t + "\n", "utf8");
  }

  function br() {
  return Buffer.from("\n");
  }

  function linea(c = "-") {
  return Buffer.from(c.repeat(ANCHO) + "\n");
  }

  function padDer(texto, largo) {
  return texto.padEnd(largo, " ");
  }

  function padIzq(texto, largo) {
  return texto.padStart(largo, " ");
  }

  function formatearFecha(fecha) {
  return new Date(fecha).toLocaleDateString("es-PY");
  }

  function horaActual() {
  return new Date().toLocaleTimeString("es-PY");
  }

  const LOGO_BITMAP = Buffer.alloc(0);




    /* ==============================================
   POST /api/print/venta    IMPRESORA USB
   ============================================== */
  router.post("/venta", requirePermisoVentaRapida("venta_rapida_imprimir_venta"), async (req, res) => {
  try {

    const { numero, fecha, items, cliente, venta_id } = req.body;
    const ventaId = Number(venta_id || 0);

    let ticketNumero = numero || "-";
    let ticketFecha = fecha || new Date().toISOString();
    let ticketCliente = cliente || "Ocasional";
    let itemsTicket = [];

    if (ventaId > 0) {
      const cabRes = await pool.query(
        `
        SELECT
          v.numero,
          v.fecha,
          COALESCE(v.cliente_nombre, c.nombre, 'Ocasional') AS cliente
        FROM venta v
        LEFT JOIN cliente c ON c.id = v.cliente_id
        WHERE v.id = $1
        LIMIT 1
        `,
        [ventaId]
      );

      if (!cabRes.rowCount) {
        return res.status(404).json({ ok: false, error: "Venta no encontrada" });
      }

      const detRes = await pool.query(
        `
        SELECT
          vd.cantidad,
          vd.precio,
          p.nombre AS descripcion
        FROM venta_detalle vd
        JOIN producto p ON p.id = vd.producto_id
        WHERE vd.venta_id = $1
        ORDER BY vd.id
        `,
        [ventaId]
      );

      if (!detRes.rowCount) {
        return res.status(400).json({ ok: false, error: "La venta no tiene items guardados" });
      }

      ticketNumero = cabRes.rows[0].numero || ticketNumero;
      ticketFecha = cabRes.rows[0].fecha || ticketFecha;
      ticketCliente = cabRes.rows[0].cliente || ticketCliente;
      itemsTicket = detRes.rows.map((row) => ({
        cantidad: Number(row.cantidad) || 0,
        precioManual: Number(row.precio) || 0,
        descripcion: row.descripcion || "Producto"
      }));
    } else {
      if (!items || !items.length) {
        return res.status(400).json({ ok: false, error: "Sin items" });
      }

      itemsTicket = items.map((item) => ({
        cantidad: Number(item?.cantidad) || 0,
        precioManual: Number(item?.precioManual ?? item?.precio ?? 0) || 0,
        descripcion: item?.descripcion || "Producto"
      }));
    }

    if (!itemsTicket.length) {
      return res.status(400).json({ ok: false, error: "Sin items válidos para imprimir" });
    }

    // =========================
    // EMPRESA
    // =========================
    let empresa = {
      nombre: "STOP TOP",
      direccion: ""
    };

    try {
      const empresaRes = await pool.query(
        `SELECT nombre, direccion FROM empresa WHERE id = $1`,
        [req.usuario.empresa_id]
      );

      if (empresaRes.rows.length) {
        empresa = empresaRes.rows[0];
      }
    } catch {}

    // =========================
    // COTIZACIONES
    // =========================
    let cotizaciones = [];

    try {
      const cotizRes = await pool.query(
        `SELECT moneda, valor_indice AS valor FROM cotizacion WHERE activa = true`
      );
      cotizaciones = cotizRes.rows.filter(c => Number(c.valor) > 0);
    } catch {}

    // =========================
    // ARMADO
    // =========================
    let total = 0;
    const buffers = [];

    buffers.push(CMD.INIT);

    // =========================
    // LOGO
    // =========================
    buffers.push(CMD.ALIGN_CENTER);
    buffers.push(LOGO_BITMAP);
    buffers.push(br());

    // =========================
    // EMPRESA
    // =========================
    buffers.push(CMD.BOLD_ON);
    buffers.push(txt(empresa.nombre));
    buffers.push(CMD.BOLD_OFF);

    if (empresa.direccion) {
      buffers.push(txt(empresa.direccion));
    }

    buffers.push(br());

    // =========================
    // CABECERA
    // =========================
    buffers.push(linea("="));

    buffers.push(CMD.ALIGN_LEFT);
    buffers.push(CMD.BOLD_ON);
    buffers.push(txt(`Pedido : #${ticketNumero || "-"}`));
    buffers.push(CMD.BOLD_OFF);

    buffers.push(txt(`Fecha  : ${formatearFecha(ticketFecha)} ${horaActual()}`));
    buffers.push(txt(`Cliente: ${truncar(ticketCliente || "Ocasional", ANCHO)}`));

    buffers.push(linea("-"));

    // =========================
    // ITEMS (estilo preview)
    // =========================
    itemsTicket.forEach(item => {

      const precio = Number(item.precioManual || 0);
      const cantidad = Number(item.cantidad || 0);
      const subtotal = precio * cantidad;

      total += subtotal;

      // 🔥 NOMBRE
      buffers.push(CMD.BOLD_ON);
      dividirTexto(`${cantidad}x ${item.descripcion}`, ANCHO)
        .forEach(l => buffers.push(txt(l)));
      buffers.push(CMD.BOLD_OFF);

      // 🔥 PRECIO UNITARIO
      buffers.push(txt(`   ${cantidad} x ${precio.toLocaleString("es-PY")}`));

      // 🔥 SUBTOTAL DERECHA
      buffers.push(CMD.ALIGN_RIGHT);
      buffers.push(txt(`Gs ${subtotal.toLocaleString("es-PY")}`));

      buffers.push(CMD.ALIGN_LEFT);
      buffers.push(br());

    });

    // =========================
    // TOTAL
    // =========================
    buffers.push(linea("="));

    buffers.push(CMD.ALIGN_CENTER);
    buffers.push(CMD.BOLD_ON);
    buffers.push(txt("TOTAL"));
    buffers.push(CMD.FONT_GRANDE);
    buffers.push(txt(`Gs ${total.toLocaleString("es-PY")}`));
    buffers.push(CMD.FONT_NORMAL);
    buffers.push(CMD.BOLD_OFF);

    // =========================
    // MONEDAS
    // =========================
    if (cotizaciones.length > 0) {

      buffers.push(linea("-"));

      const SIMBOLO = {
        DOLAR: "USD",
        REAL: "BRL"
      };

      cotizaciones.forEach(c => {

        const equiv = (total / Number(c.valor)).toFixed(2);
        const simbolo = SIMBOLO[c.moneda] || c.moneda;

        const lineaMoneda =
          padDer(simbolo, 6) +
          padIzq(equiv, ANCHO - 6);

        buffers.push(txt(lineaMoneda));
      });

    }

    // =========================
    // FOOTER
    // =========================
    buffers.push(linea("="));
    buffers.push(br());

    buffers.push(CMD.ALIGN_CENTER);
    buffers.push(txt("Gracias por su preferencia"));
    buffers.push(txt("Vuelva pronto"));

    buffers.push(br());
    buffers.push(CMD.FEED);
    buffers.push(CMD.CUT);

    // =========================
    // IMPRESIÓN
    // =========================
    const cfg = getConfig(req);

    if (!cfg.venta || !cfg.venta.nombre) {
      return res.status(400).json({ ok: false, error: "Impresora de venta no configurada" });
    }

    await imprimirPorUSB(Buffer.concat(buffers), cfg.venta.nombre);

    res.json({ ok: true });

  } catch (err) {
    console.error("ERROR PRINT VENTA:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
  });



  /*
    =======================================
    IMPRIMIR COCINA (VERSIÓN PRO)
    =======================================
  */

  router.post("/imprimir-cocina/:id/validar", requirePermisoVentaRapida("venta_rapida_imprimir_preparo"), async (req, res) => {

  const id = Number(req.params.id);
  const requestUuid = normalizeKitchenRequestUuid(req.body?.request_uuid);
  const reimprimir = !!req.body?.reimprimir;

  if (!id) {
    return res.status(400).json({ ok: false, disponible: false, error: "ID inválido" });
  }

  try {
    await ensureMesaSchema();
    await ensureKitchenPrintSchema();

    const existingRequest = await findKitchenRequestByUuid(requestUuid);
    if (existingRequest && Number(existingRequest.venta_id) !== id) {
      return res.status(409).json({
        ok: false,
        disponible: false,
        error: "UUID de cocina ya asociado a otra venta"
      });
    }

    if (existingRequest?.estado === "ENVIADO") {
      return res.json({
        ...buildKitchenIdempotentResponse(existingRequest),
        disponible: true
      });
    }

    if (isFreshKitchenProcessing(existingRequest)) {
      return res.status(202).json({
        ...buildKitchenIdempotentResponse(existingRequest),
        disponible: true
      });
    }

    const contexto = await loadKitchenPrintContext(id, { reimprimir });
    const validacion = await validateKitchenPrinters(req, contexto.grupos);

    res.json({
      ok: true,
      disponible: true,
      request_uuid: requestUuid,
      destinos: validacion.destinos.map((item) => item.destino)
    });
  } catch (err) {
    const status = Number(err?.status) || 500;
    const payload = err?.payload || {
      ok: false,
      disponible: false,
      error: err.message || "No se pudo validar la impresora"
    };

    res.status(status).json({
      ...payload,
      disponible: false,
      request_uuid: requestUuid || null
    });
  }
  });

  router.post("/imprimir-cocina/:id", requirePermisoVentaRapida("venta_rapida_imprimir_preparo"), async (req, res) => {

  const id = Number(req.params.id);
  const { cliente_nombre, reimprimir } = req.body;
  const requestUuid = normalizeKitchenRequestUuid(req.body?.request_uuid);

  if (!id) return res.status(400).json({ ok: false, error: "ID inválido" });

  let lockClient = null;
  let lockTomado = false;

  try {
    await ensureMesaSchema();
    await ensureKitchenPrintSchema();

    const existingRequest = await findKitchenRequestByUuid(requestUuid);

    if (existingRequest && Number(existingRequest.venta_id) !== id) {
      return res.status(409).json({
        ok: false,
        error: "UUID de cocina ya asociado a otra venta"
      });
    }

    if (existingRequest?.estado === "ENVIADO") {
      return res.json(buildKitchenIdempotentResponse(existingRequest));
    }

    if (isFreshKitchenProcessing(existingRequest)) {
      return res.status(202).json(buildKitchenIdempotentResponse(existingRequest));
    }

    // Evita doble envío por doble click/doble request concurrente
    lockClient = await pool.connect();
    const lockRes = await lockClient.query(
      "SELECT pg_try_advisory_lock($1::bigint) AS locked",
      [id]
    );

    if (!lockRes.rows[0]?.locked) {
      return res.status(409).json({
        ok: false,
        error: "Esta venta ya se está imprimiendo en cocina"
      });
    }
    lockTomado = true;

    const contexto = await loadKitchenPrintContext(id, { reimprimir });
    const {
      venta,
      yaImpreso,
      esReimpresionTotal,
      grupos
    } = contexto;

    const { cfg } = await validateKitchenPrinters(req, grupos);

    if (requestUuid) {
      await upsertKitchenRequestProcessing(lockClient, {
        requestUuid,
        empresaId: req.usuario?.empresa_id || null,
        terminalId: req.usuario?.terminal_id || null,
        ventaId: id,
        reimprimir: esReimpresionTotal,
        clienteNombre: cliente_nombre
      });
    }

    // =========================
    // IMPRIMIR
    // =========================
    for (const destino in grupos) {
      const impresora = cfg[destino];
      const ip = impresora.ip;
      const puerto = impresora.puerto || 9100;
      const itemsGrupo = grupos[destino];

      const ok = await imprimirConRetry(
        () =>
          new Promise((resolve, reject) => {
            const device = new escpos.Network(ip, puerto, { timeout: 1000 });
            const printer = new escpos.Printer(device);

            const timeout = setTimeout(() => {
              try { device.close(); } catch {}
              reject(new Error("Timeout impresora"));
            }, 3000);

            device.open(() => {
              clearTimeout(timeout);

              try {
                const nombreCliente =
                  cliente_nombre ||
                  (venta.cliente_id === 1 ? venta.cliente_nombre : venta.cliente_real) ||
                  "Ocasional";

                printer.align("CT");
                printer.style("B");

                if (esReimpresionTotal) {
                  printer.text("*** REIMPRESION ***");
                } else if (yaImpreso) {
                  printer.text("*** AGREGADO ***");
                }

                printer.text(`PREPARO - ${destino.toUpperCase()}`);
                printer.style("NORMAL");
                printer.drawLine();

                printer.align("LT");
                printer.text(`Pedido : ${venta.numero}`);
                printer.text(`Mesa   : ${venta.mesa || " "}`);
                printer.text(`Cliente: ${nombreCliente}`);
                printer.text(new Date().toLocaleString("es-PY"));
                printer.drawLine();

                itemsGrupo.forEach((item) => {
                  printer.style("B");
                  dividirTexto(`${item.cantidad}x ${item.nombre}`, 40)
                    .forEach(l => printer.text(l));
                  printer.style("NORMAL");

                  if (item.observacion) {
                    dividirTexto(item.observacion.toUpperCase(), 38)
                      .forEach(l => printer.text(`Obs: ${l}`));
                  }

                  printer.drawLine();
                });

                printer.align("CT");
                printer.style("B");
                printer.text("*** FIN ***");
                printer.style("NORMAL");
                printer.feed(4);
                printer.cut();
                printer.close();
                resolve();
              } catch (err) {
                reject(err);
              }
            });
          })
      );

      if (!ok) {
        return res.status(503).json({
          ok: false,
          sin_impresora: true,
          error: `No se pudo imprimir en ${destino} (reintento fallido)`
        });
      }
    }

    const idsImpresos = [
      ...new Set(
        Object.values(grupos)
          .flat()
          .map((item) => Number(item.id))
          .filter((n) => n > 0)
      )
    ];

    // Solo marcar como enviados los ids exactos que se imprimieron en esta ejecución.
    if (!esReimpresionTotal && idsImpresos.length) {
      await lockClient.query(
        `
        UPDATE venta_detalle
        SET enviado_cocina = true
        WHERE venta_id = $1
        AND id = ANY($2::int[])
        `,
        [id, idsImpresos]
      );
    }

    if (!esReimpresionTotal && !yaImpreso) {
      await lockClient.query(
        `
        UPDATE venta
        SET estado = 'CONCLUIDO'
        WHERE id = $1
        `,
        [id]
      );
    }

    const responsePayload = {
      ok: true,
      modo: esReimpresionTotal ? "REIMPRESION" : "ENVIO",
      items_impresos: idsImpresos.length,
      estado: "ENVIADO",
      request_uuid: requestUuid || null
    };

    await markKitchenRequestSent(lockClient, requestUuid, responsePayload);

    res.json(responsePayload);
  } catch (err) {
    console.error("ERROR COCINA:", err);
    try {
      await markKitchenRequestPending(lockClient || pool, requestUuid, err.message || "Error imprimiendo cocina");
    } catch (updateErr) {
      console.error("ERROR ACTUALIZANDO UUID COCINA:", updateErr);
    }

    const status = Number(err?.status) || 500;
    const payload = err?.payload || { ok: false, error: err.message || "Error imprimiendo cocina" };
    res.status(status).json({
      ...payload,
      request_uuid: requestUuid || null
    });
  } finally {
    if (lockClient) {
      if (lockTomado) {
        try {
          await lockClient.query("SELECT pg_advisory_unlock($1::bigint)", [id]);
        } catch {}
      }
      lockClient.release();
    }
  }

  });

    /*  ==============================================
      POST /api/print/prueba-red
        ============================================== */
      router.post("/prueba-red", async (req, res) => {
  try {
    const { nombre, ip, puerto } = req.body;

    if (!nombre && !ip) {
      return res.status(400).json({ error: "Nombre o IP requerida" });
    }

    const buffers = [];
    buffers.push(CMD.INIT);
    buffers.push(CMD.ALIGN_CENTER);
    buffers.push(CMD.FONT_GRANDE);
    buffers.push(CMD.BOLD_ON);
    buffers.push(txt("PRUEBA OK"));
    buffers.push(CMD.FONT_NORMAL);
    buffers.push(CMD.BOLD_OFF);
    buffers.push(txt("Impresora Cocina"));
    if (nombre) {
      buffers.push(txt(`USB: ${nombre}`));
    } else {
      buffers.push(txt(`IP: ${ip}`));
    }
    buffers.push(CMD.FEED);
    buffers.push(CMD.CUT);

    if (nombre) {
      await imprimirPorUSB(Buffer.concat(buffers), nombre);
    } else {
      await imprimirPorRed(Buffer.concat(buffers), ip, puerto || 9100);
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
      });


    /* ==============================================
      POST /api/print/prueba-usb
        ============================================== */
    router.post("/prueba-usb", async (req, res) => {
  try {
    const { nombre } = req.body;
    if (!nombre) return res.status(400).json({ error: "Nombre requerido" });

    const buffers = [];
    buffers.push(CMD.INIT);
    buffers.push(CMD.ALIGN_CENTER);
    buffers.push(CMD.FONT_GRANDE);
    buffers.push(CMD.BOLD_ON);
    buffers.push(txt("PRUEBA OK"));
    buffers.push(CMD.FONT_NORMAL);
    buffers.push(CMD.BOLD_OFF);
    buffers.push(txt("Impresora Venta"));
    buffers.push(txt(`USB: ${nombre}`));
    buffers.push(CMD.FEED);
    buffers.push(CMD.CUT);

    await imprimirPorUSB(Buffer.concat(buffers), nombre);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
    });


    /*==============================================
      HELPER — Imprimir por RED (TCP/IP)
    ============================================== */
  function imprimirPorRed(buffer, ip, puerto = 9100) {
  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    const timeout = setTimeout(() => {
      client.destroy();
      reject(new Error(`Timeout — no se pudo conectar a ${ip}:${puerto}`));
    }, 5000);

    client.connect(puerto, ip, () => {
      client.write(buffer, () => {
        clearTimeout(timeout);
        client.end();
        console.log(`✅ Impreso por red ${ip}:${puerto}`);
        resolve();
      });
    });

    client.on("error", (err) => {
      clearTimeout(timeout);
      reject(new Error(`Error red: ${err.message}`));
    });
  });
  }


    /* ==============================================
      HELPER — Imprimir por USB (PowerShell)
      ============================================== */
    function imprimirPorUSB(buffer, nombreImpresora) {
  return new Promise((resolve, reject) => {

    const tmpFile = path.join(os.tmpdir(), `ticket_${Date.now()}.bin`);

    fs.writeFile(tmpFile, buffer, (errWrite) => {
      if (errWrite) return reject(errWrite);

      const ps = `
        $bytes = [System.IO.File]::ReadAllBytes('${tmpFile.replace(/\\/g, "\\\\")}');
        Add-Type -TypeDefinition @'
          using System;
          using System.Runtime.InteropServices;
          public class RawPrint {
            [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
            public class DOCINFOW {
              [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
              [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
              [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
            }
            [DllImport("winspool.drv", EntryPoint="OpenPrinterW", SetLastError=true, CharSet=CharSet.Unicode)]
            public static extern bool OpenPrinter(string pPrinterName, out IntPtr phPrinter, IntPtr pDefault);
            [DllImport("winspool.drv", EntryPoint="StartDocPrinterW", SetLastError=true, CharSet=CharSet.Unicode)]
            public static extern int StartDocPrinter(IntPtr hPrinter, int Level, DOCINFOW pDocInfo);
            [DllImport("winspool.drv", SetLastError=true)] public static extern bool StartPagePrinter(IntPtr hPrinter);
            [DllImport("winspool.drv", SetLastError=true)] public static extern bool WritePrinter(IntPtr hPrinter, byte[] pBytes, int dwCount, out int dwWritten);
            [DllImport("winspool.drv", SetLastError=true)] public static extern bool EndPagePrinter(IntPtr hPrinter);
            [DllImport("winspool.drv", SetLastError=true)] public static extern bool EndDocPrinter(IntPtr hPrinter);
            [DllImport("winspool.drv", SetLastError=true)] public static extern bool ClosePrinter(IntPtr hPrinter);
          }
'@;
        $hPrinter = [IntPtr]::Zero;
        $opened = [RawPrint]::OpenPrinter('${nombreImpresora}', [ref]$hPrinter, [IntPtr]::Zero);
        Write-Host "OpenPrinter: $opened handle: $hPrinter";
        $di = New-Object RawPrint+DOCINFOW;
        $di.pDocName    = "Ticket";
        $di.pOutputFile = $null;
        $di.pDataType   = "RAW";
        $docId = [RawPrint]::StartDocPrinter($hPrinter, 1, $di);
        Write-Host "StartDoc: $docId";
        [RawPrint]::StartPagePrinter($hPrinter) | Out-Null;
        $written = 0;
        [RawPrint]::WritePrinter($hPrinter, $bytes, $bytes.Length, [ref]$written) | Out-Null;
        Write-Host "written=$written of $($bytes.Length)";
        [RawPrint]::EndPagePrinter($hPrinter) | Out-Null;
        [RawPrint]::EndDocPrinter($hPrinter) | Out-Null;
        [RawPrint]::ClosePrinter($hPrinter) | Out-Null;
      `;

      const tmpPs = path.join(os.tmpdir(), `print_${Date.now()}.ps1`);

      fs.writeFile(tmpPs, ps, { encoding: "utf8" }, (errPs) => {
        if (errPs) return reject(errPs);

        exec(`powershell -ExecutionPolicy Bypass -File "${tmpPs}"`, (errExec, stdout, stderr) => {
          setTimeout(() => { fs.unlink(tmpFile, () => { }); fs.unlink(tmpPs, () => { }); }, 5000);

          console.log("=== PRINT DEBUG ===");
          console.log("stdout:", stdout?.trim());
          console.log("stderr:", stderr?.trim());
          if (errExec) return reject(new Error(errExec.message));

          console.log("✅ Impresion USB OK");
          resolve();
        });
      });
    });
  });
    }


    /* ==============================================
          IMPRIMIR FACTURA TICKET 
    ============================================== */
    router.post("/venta-factura", async (req, res) => {
  try {

    const { facturaId } = req.body;

    if (!facturaId) {
      return res.status(400).json({ error: "FacturaId requerido" });
    }

    // =========================
    // TRAER FACTURA COMPLETA
    // =========================
    const data = await pool.query(`
      SELECT 
        f.*,
        e.nombre AS empresa_nombre,
        e.ruc AS empresa_ruc,
        e.direccion AS empresa_direccion,
        e.telefono AS empresa_telefono,
        e.email AS empresa_email,
        v.numero AS numero_pedido,
        mf.timbrado,
        mf.fecha_inicio,
        mf.fecha_vencimiento,
        mf.actividad
      FROM factura f
      LEFT JOIN empresa e ON e.id = 1
      LEFT JOIN venta v ON v.id = f.venta_id
      LEFT JOIN modelo_factura mf ON true
      WHERE f.id = $1
    `, [facturaId]);

    if (!data.rows.length) {
      return res.status(404).json({ error: "Factura no encontrada" });
    }

    const f = data.rows[0];

    // =========================
    // DETALLE
    // =========================
    const detalle = await pool.query(`
      SELECT descripcion, cantidad, precio, subtotal, iva_tipo
      FROM factura_detalle
      WHERE factura_id = $1
    `, [facturaId]);

    // =========================
    // FORMATO
    // =========================
    const gs = (n) => Number(n).toLocaleString("es-PY");

    const fechaPY = (fecha) => {
      const d = new Date(fecha);
      return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`;
    };

    const horaPY = (fecha) => {
      const d = new Date(fecha);
      let h = d.getHours();
      const m = String(d.getMinutes()).padStart(2,"0");
      const ampm = h >= 12 ? "p. m." : "a. m.";
      h = h % 12 || 12;
      return `${String(h).padStart(2,"0")}:${m} ${ampm}`;
    };

    // =========================
    // IMPRESORA
    // =========================
    const cfg = getConfig(req);

    if (!cfg.factura) {
      return res.status(500).json({ error: "Impresora factura no configurada" });
    }

    const device = new escpos.Network(cfg.factura.ip, cfg.factura.puerto || 9100);
    const printer = new escpos.Printer(device);

    // =========================
    // IMPRESIÓN
    // =========================
    device.open(() => {

  const logoPath = path.join(__dirname, "../recursos/img/logofactura.png");

  escpos.Image.load(logoPath, function(image){

    const imprimir = (titulo) => {

      printer.encode("CP858");

      //  LOGO
      printer
        .align("CT")
        .image(image, "d24") //  probá d24 o d48
        .text(""); // espacio

      // EMPRESA
      printer.align("CT").style("B").text(f.empresa_nombre || "").style("NORMAL");
      printer.text(`RUC: ${f.empresa_ruc || ""}`);
      printer.text(f.empresa_direccion || "");
      printer.text(f.empresa_telefono || "");
      printer.text(f.empresa_email || "");
      printer.text(f.actividad || "");

      printer.drawLine();

      // TIMBRADO
      printer.align("LT");
      printer.text(`Timbrado: ${f.timbrado || ""}`);
      printer.text(`Inicio: ${f.fecha_inicio ? fechaPY(f.fecha_inicio) : ""}`);
      printer.text(`Vence: ${f.fecha_vencimiento ? fechaPY(f.fecha_vencimiento) : ""}`);

      printer.drawLine();

      // FACTURA
      printer.text(`Factura: ${f.numero_factura}`);
      printer.text(`Fecha: ${fechaPY(f.fecha)} ${horaPY(f.fecha)}`);
      printer.text(`Condición: ${f.condicion_venta || "CONTADO"}`);
      printer.text(`Pedido: ${f.numero_pedido || "-"}`);

      printer.drawLine();

      // CLIENTE
      printer.text(`Cliente: ${f.cliente_nombre}`);
      printer.text(`CI-RUC: ${f.cliente_ruc}`);
      printer.text(`Dirección: ${f.cliente_direccion}`);

      printer.drawLine();

      printer.align("CT").text("***** I.V.A. INCLUIDO *****");
      printer.drawLine();

      printer.align("LT");

      let total = 0;
      let gravada10 = 0;
      let gravada5 = 0;

      detalle.rows.forEach(i => {

        total += Number(i.subtotal);

        if (Number(i.iva_tipo) === 10) gravada10 += Number(i.subtotal);
        if (Number(i.iva_tipo) === 5) gravada5 += Number(i.subtotal);

        dividirTexto(`${i.cantidad}x ${i.descripcion}`, 40)
          .forEach(l => printer.text(l));

        printer.text(`   ${i.cantidad} x ${gs(i.precio)}`);
        printer.align("RT").text(`Gs ${gs(i.subtotal)}`).align("LT");

        printer.drawLine();
      });

      const iva10 = Math.round(gravada10 / 11);
      const iva5 = Math.round(gravada5 / 21);

      printer
        .text(`Gravada 10%: ${gs(gravada10)}`)
        .text(`Gravada 5%: ${gs(gravada5)}`)
        .text(`IVA 10%: ${gs(iva10)}`)
        .text(`IVA 5%: ${gs(iva5)}`)

        .drawLine()

        .align("RT")
        .style("B")
        .text(`TOTAL: Gs ${gs(total)}`)
        .style("NORMAL")

        .drawLine()

        .align("CT")
        .text(titulo)
        .text("GRACIAS POR LA PREFERENCIA");
    };

    //  COPIAS
    imprimir("ORIGINAL: CLIENTE");
    printer.cut();

    imprimir("DUPLICADO: CONTABILIDAD");
    printer.cut();

    printer.close();

  });

});

    res.json({ ok: true });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error imprimiendo factura" });
  }
    });


  function truncar(texto, max = 32) {
  if (!texto) return "";
  if (texto.length <= max) return texto;
  return texto.substring(0, max);
  }
  function dividirTexto(texto, max = 32) {
  if (!texto) return [];

  const palabras = texto.split(" ");
  const lineas = [];
  let linea = "";

  palabras.forEach(p => {
    if ((linea + p).length > max) {
      lineas.push(linea.trim());
      linea = p + " ";
    } else {
      linea += p + " ";
    }
  });

  if (linea.trim().length > 0) {
    lineas.push(linea.trim());
  }

  return lineas;
  }
  /* ==============================================
     GET /api/print-preview/venta/:id
     Preview HTML del ticket de venta — abre en nueva pestaña y auto-imprime
  ============================================== */
  router.get("/venta/:id", async (req, res) => {
    const id = Number(req.params.id);
    if (!id) return res.status(400).send("ID inválido");

    try {
      const cabRes = await pool.query(
        `SELECT v.id, v.numero, v.fecha, v.total,
                COALESCE(v.cliente_nombre, c.nombre, 'Ocasional') AS cliente
         FROM venta v
         LEFT JOIN cliente c ON c.id = v.cliente_id
         WHERE v.id = $1 LIMIT 1`,
        [id]
      );
      if (!cabRes.rowCount) return res.status(404).send("Venta no encontrada");
      const v = cabRes.rows[0];

      const detRes = await pool.query(
        `SELECT vd.cantidad, vd.precio, vd.subtotal, p.nombre AS descripcion
         FROM venta_detalle vd
         JOIN producto p ON p.id = vd.producto_id
         WHERE vd.venta_id = $1 ORDER BY vd.id`,
        [id]
      );

      let empresaNombre = "NEXO", empresaDireccion = "";
      try {
        const empRes = await pool.query(`SELECT nombre, direccion FROM empresa LIMIT 1`);
        if (empRes.rowCount) { empresaNombre = empRes.rows[0].nombre; empresaDireccion = empRes.rows[0].direccion || ""; }
      } catch (_) {}

      let cotBrl = 0, cotUsd = 0;
      try {
        const cotRes = await pool.query(`SELECT moneda, valor_indice FROM cotizacion WHERE activa = true`);
        cotRes.rows.forEach(c => {
          if (c.moneda === "REAL")  cotBrl = Number(c.valor_indice);
          if (c.moneda === "DOLAR") cotUsd = Number(c.valor_indice);
        });
      } catch (_) {}

      const gs   = n => Number(n || 0).toLocaleString("es-PY");
      const dec2 = n => Number(n || 0).toFixed(2).replace(".", ",");
      const total = Number(v.total || 0);
      const fecha = new Date(v.fecha).toLocaleString("es-PY");

      let itemsHtml = "";
      detRes.rows.forEach(i => {
        const sub = Number(i.subtotal || 0);
        itemsHtml += `
          <tr>
            <td>${Number(i.cantidad)}x ${i.descripcion}</td>
            <td class="r">${gs(i.precio)}</td>
            <td class="r">${gs(sub)}</td>
          </tr>`;
      });

      const brlHtml = cotBrl > 0
        ? `<tr><td>R$</td><td class="r">${dec2(total / cotBrl)}</td></tr>` : "";
      const usdHtml = cotUsd > 0
        ? `<tr><td>US$</td><td class="r">${dec2(total / cotUsd)}</td></tr>` : "";

      const html = `<!DOCTYPE html><html lang="es"><head>
<meta charset="UTF-8">
<title>Ticket #${v.numero}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: monospace; font-size: 12px; width: 300px; margin: 0 auto; padding: 10px; }
  h2 { text-align:center; font-size:14px; margin-bottom:2px; }
  .sub { text-align:center; font-size:11px; color:#555; margin-bottom:6px; }
  hr { border:none; border-top:1px dashed #000; margin:6px 0; }
  table { width:100%; border-collapse:collapse; }
  td { padding:2px 0; vertical-align:top; }
  .r { text-align:right; white-space:nowrap; }
  .total-row td { font-weight:bold; font-size:13px; border-top:1px dashed #000; padding-top:4px; }
  .footer { text-align:center; margin-top:8px; font-size:11px; }
  @media print { body { width:100%; } button { display:none; } }
</style>
</head><body>
<h2>${empresaNombre}</h2>
${empresaDireccion ? `<div class="sub">${empresaDireccion}</div>` : ""}
<hr>
<div>Pedido: <strong>#${v.numero}</strong></div>
<div>Fecha: ${fecha}</div>
<div>Cliente: ${v.cliente}</div>
<hr>
<table>
  <thead><tr><th style="text-align:left">Descripción</th><th class="r">P/U Gs</th><th class="r">Sub Gs</th></tr></thead>
  <tbody>${itemsHtml}</tbody>
  <tfoot>
    <tr class="total-row"><td colspan="2">TOTAL Gs</td><td class="r">${gs(total)}</td></tr>
    ${brlHtml ? `<tr><td colspan="2">R$</td><td class="r">${dec2(total / cotBrl)}</td></tr>` : ""}
    ${usdHtml ? `<tr><td colspan="2">US$</td><td class="r">${dec2(total / cotUsd)}</td></tr>` : ""}
  </tfoot>
</table>
<hr>
<div class="footer">Gracias por su preferencia</div>
<script>window.onload = function(){ window.print(); };</script>
</body></html>`;

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(html);
    } catch (err) {
      console.error("GET /print-preview/venta:", err);
      res.status(500).send("Error generando preview");
    }
  });

  module.exports = router;

  //ver factura sin impresora por ahora porque hendy
  router.get("/preview-factura/:id", async (req, res) => {
  const { id } = req.params;

  try {

    // =========================
    // TRAER FACTURA
    // =========================
    const data = await pool.query(`
      SELECT 
        f.*,
        e.nombre AS empresa_nombre,
        e.ruc AS empresa_ruc,
        e.direccion AS empresa_direccion,
        e.telefono AS empresa_telefono,
        e.email AS empresa_email,
        e.logo AS empresa_logo,
        v.numero AS numero_pedido, 
        mf.timbrado,
        mf.fecha_inicio,
        mf.fecha_vencimiento,
        mf.actividad
       FROM factura f
       LEFT JOIN empresa e ON e.id = 1
      LEFT JOIN venta v ON v.id = f.venta_id
      LEFT JOIN modelo_factura mf ON true
      WHERE f.id = $1
    `, [id]);

    if (!data.rows.length) {
      return res.send("Factura no encontrada");
    }

    const f = data.rows[0];

    // =========================
    // DETALLE
    // =========================
    const detalle = await pool.query(`
      SELECT descripcion, cantidad, precio, subtotal, iva_tipo
      FROM factura_detalle
      WHERE factura_id = $1
    `, [id]);

    // =========================
    // FORMATO GUARANÍ
    // =========================
    const gs = (n) =>
      Number(n).toLocaleString("es-PY");

    let total = 0;
    let gravada10 = 0;
    let gravada5 = 0;

    const baseURL = `${req.protocol}://${req.get("host")}`;

const fechaPY = (fecha) => {
  const d = new Date(fecha);

  const dia = String(d.getDate()).padStart(2, "0");
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const anio = d.getFullYear();

  return `${dia}/${mes}/${anio}`;
};

const horaPY = (fecha) => {
  return new Date(fecha)
    .toLocaleTimeString("es-PY", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true
    })
    .replace("a. m.", "a. m.")
    .replace("p. m.", "p. m.");
};


const logo = f.empresa_logo && f.empresa_logo.trim() !== ""
  ? f.empresa_logo
  : "logofactura.png";

    let html = `
    <html>
    <head>
      <style>

.empresa {
  font-size: 18px;
  font-weight: bold;
  margin-top: 5px;
}

.ruc {
  margin-top: 4px;
}

        body {
          font-family: monospace;
          max-width: 320px;
          margin: auto;
          font-size: 12px;
        }

        .ticket {
          border: 2px dashed black;
          padding: 10px;
        }

        .center { text-align:center; }
        .right { text-align:right; }
        .bold { font-weight:bold; }

        .linea {
          border-top:1px dashed #000;
          margin:6px 0;
        }

        img {
          max-width: 120px;
          margin-bottom: 5px;
        }
          
      </style>
      
    </head>
    
    <body>


    
    <div class="ticket">

       ${
    logo
      ? `<div class="center">
           <img src="${baseURL}/recursos/img/${logo}" />
         </div>`
      : ""
  }

     <div class="center empresa">${f.empresa_nombre || ""}</div>
    <div class="center ruc">RUC: ${f.empresa_ruc || ""}</div>
      <div class="center">${f.empresa_direccion || ""}</div>
      <div class="center">${f.empresa_telefono || ""}</div>
      <div class="center">${f.empresa_email || ""}</div>
      <div class="center">${f.actividad || ""}</div>

      <div class="linea"></div>

      <div>Timbrado: ${f.timbrado || ""}</div>
      <div>Inicio: ${f.fecha_inicio ? fechaPY(f.fecha_inicio) : ""}</div>
      <div>Vence: ${f.fecha_vencimiento ? fechaPY(f.fecha_vencimiento) : ""}</div>

      <div class="linea"></div>

      <div>Factura: ${f.numero_factura}</div>
      <div>Fecha: ${fechaPY(f.fecha)} ${horaPY(f.fecha)}</div>
      <div>Condición: ${f.condicion_venta || "CONTADO"}</div>
      <div>Pedido: ${f.numero_pedido || "-"}</div>

      <div class="linea"></div>

      <div>Cliente: ${f.cliente_nombre}</div>
      <div>CI-RUC: ${f.cliente_ruc}</div>
      <div>Dirección: ${f.cliente_direccion || ""}</div>

      <div class="linea"></div>

      <div class="center bold">***** I.V.A. INCLUIDO *****</div>

      <div class="linea"></div>
    `;

    detalle.rows.forEach(i => {

      total += Number(i.subtotal);

      if (Number(i.iva_tipo) === 10) gravada10 += Number(i.subtotal);
      if (Number(i.iva_tipo) === 5) gravada5 += Number(i.subtotal);

      html += `
        <div>${i.cantidad}x ${i.descripcion}</div>
        <div>${i.cantidad} x ${gs(i.precio)}</div>
        <div class="right">Gs ${gs(i.subtotal)}</div>
        <div class="linea"></div>
      `;
    });

    const iva10 = Math.round(gravada10 / 11);
    const iva5 = Math.round(gravada5 / 21);

    html += `
      <div>Gravada 10%: ${gs(gravada10)}</div>
      <div>Gravada 5%: ${gs(gravada5)}</div>
      <div>IVA 10%: ${gs(iva10)}</div>
      <div>IVA 5%: ${gs(iva5)}</div>

      <div class="linea"></div>

      <div class="right bold">TOTAL: Gs ${gs(total)}</div>

      <div class="linea"></div>

      <div class="center">ORIGINAL: CLIENTE</div>
      <div class="center">GRACIAS POR LA PREFERENCIA</div>

    </div>

    </body>
    </html>
    `;

    res.send(html);

  } catch (err) {
    console.error(err);
    res.send("Error preview factura");
  }
  });






