const express = require("express");
const router = express.Router();
const db = require("../db");
const { clearMesaByVentaId } = require("../services/mesa.service");
const {
  ventaTieneFactura,
  registrarFacturaVentas
} = require("../services/factura_venta.service");

module.exports = router;

function getMesaScopeFromReq(req) {
  const empresaId = Number(req?.usuario?.empresa_id || 0);
  const terminalId = Number(req?.usuario?.terminal_id || 0);

  if (!Number.isFinite(empresaId) || empresaId <= 0) return null;
  if (!Number.isFinite(terminalId) || terminalId <= 0) return null;

  return {
    empresa_id: Math.trunc(empresaId),
    terminal_id: Math.trunc(terminalId)
  };
}

function toUpperSafe(value) {
  return value ? String(value).trim().toUpperCase() : null;
}

function normalizarRuc(ruc) {
  if (!ruc) return null;
  return String(ruc).split("-")[0].trim();
}

// GENERADOR DE NUMERO DE FACTURA OJO
async function generarNumeroFactura(client, modelo) {

  const prefijo = `${modelo.punto_establecimiento}-${modelo.punto_expedicion}`;

  const ultimo = await client.query(`
    SELECT numero_factura 
    FROM factura 
    WHERE numero_factura LIKE $1
    ORDER BY id DESC 
    LIMIT 1
  `, [`${prefijo}-%`]);

  let numero = 1;

  if (ultimo.rows.length && ultimo.rows[0].numero_factura) {
    const partes = ultimo.rows[0].numero_factura.split('-');

    if (partes.length === 3) {
      const numeroActual = parseInt(partes[2]) || 0;
      numero = numeroActual + 1;
    }
  }

  return `${prefijo}-${numero.toString().padStart(7, '0')}`;
}

async function obtenerOCrearClienteFactura(client, { ruc, nombre, direccion, ciudad }) {
  const rucFinal = String(ruc || "").trim() || null;
  const nombreIngresado = toUpperSafe(nombre);
  const direccionIngresada = toUpperSafe(direccion) || toUpperSafe(ciudad);
  const rucNormalizado = normalizarRuc(rucFinal);

  if (rucNormalizado) {
    const existente = await client.query(
      `SELECT *
       FROM cliente
       WHERE ruc LIKE $1
       ORDER BY id ASC
       LIMIT 1`,
      [`${rucNormalizado}%`]
    );

    if (existente.rows.length) {
      const actualizado = await client.query(
        `UPDATE cliente
         SET nombre = COALESCE($1, nombre),
             razon_social = COALESCE($1, razon_social),
             direccion = COALESCE($2, direccion)
         WHERE id = $3
         RETURNING *`,
        [nombreIngresado, direccionIngresada, existente.rows[0].id]
      );

      return actualizado.rows[0];
    }
  }

  const nuevo = await client.query(
    `INSERT INTO cliente (nombre, razon_social, ruc, direccion)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [
      nombreIngresado || "OCASIONAL",
      nombreIngresado || "OCASIONAL",
      rucFinal,
      direccionIngresada || "SIN DIRECCION"
    ]
  );

  return nuevo.rows[0];
}


//  ROUTE
router.post("/generar/:ventaId", async (req, res) => {

  const { ventaId } = req.params;

  const client = await db.connect();

  try {

    await client.query("BEGIN");

    // Venta
    const venta = await client.query(
      "SELECT * FROM venta WHERE id=$1",
      [ventaId]
    );

    if (!venta.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Venta no encontrada" });
    }

    if (Number(venta.rows[0].factura_id || 0) > 0 || await ventaTieneFactura(client, ventaId)) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        error: "La venta ya fue facturada"
      });
    }

    //  Modelo factura
 const modelo = await client.query(
  "SELECT * FROM modelo_factura LIMIT 1"
);


    if (!modelo.rows.length) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "No existe modelo de factura" });
    }

    const mf = modelo.rows[0];

    // VALIDAR TIMBRADO 
    const hoy = new Date();
    const inicio = new Date(mf.fecha_inicio);
    const fin = new Date(mf.fecha_vencimiento);

    if (hoy < inicio) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        error: "El timbrado aún no está vigente"
      });
    }

    if (hoy > fin) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        error: "El timbrado está vencido"
      });
    }

    //  Detalle
  const detalle = await client.query(`
  SELECT  
    vd.*, 
    p.iva_tipo,
    p.nombre AS producto_nombre
  FROM venta_detalle vd 
  LEFT JOIN producto p ON p.id = vd.producto_id 
  WHERE vd.venta_id = $1
`, [ventaId]);



    if (!detalle.rows.length) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        error: "La venta no tiene detalle"
      });
    }


    // Generar número
    const numeroFactura = await generarNumeroFactura(client, mf);

    let iva5 = 0;
    let iva10 = 0;
    let total = 0;

    //  Calcular IVA
   for (const item of detalle.rows) {
  total += Number(item.subtotal);

  if (Number(item.iva_tipo) === 5) iva5 += Number(item.subtotal) / 21;
  if (Number(item.iva_tipo) === 10) iva10 += Number(item.subtotal) / 11;
}



    iva5 = Math.round(iva5);
    iva10 = Math.round(iva10);
    total = Math.round(total);
    const total_iva = iva5 + iva10;
    // 6. Insert factura


// =========================
//  OBTENER CLIENTE ACTUALIZADO
// =========================
const ventaActualizada = await client.query(
  "SELECT cliente_id, condicion_venta FROM venta WHERE id = $1",
  [ventaId]
);

const clienteIdReal = ventaActualizada.rows[0].cliente_id;
const condicionVenta = ventaActualizada.rows[0].condicion_venta;


// =========================
//  TRAER CLIENTE 
// =========================
const cliente = await client.query(
  "SELECT id, nombre, ruc, direccion FROM cliente WHERE id = $1",
  [clienteIdReal]
);

const clienteData = cliente.rows[0];

if (!clienteData) {
  throw new Error("Cliente no encontrado");
}

const { direccion, pagado, vuelto } = req.body;

const direccionFinal = (direccion || clienteData.direccion || "SIN DIRECCION")
  .toUpperCase();

// =========================
//  INSERT FACTURA 
// =========================
const factura = await client.query(
  `INSERT INTO factura
  (venta_id, numero_factura, timbrado, punto_establecimiento, fecha,
   cliente_id, cliente_nombre, cliente_ruc, cliente_direccion, condicion_venta,
   total, iva5, iva10, total_iva,
   pagado, vuelto,
   tipo_comprobante, estado, moneda)
 VALUES (
  $1,$2,$3,$4,(NOW() AT TIME ZONE 'America/Asuncion'),
    $5,$6,$7,$8,$9,
    $10,$11,$12,$13,
    $14,$15,
    'TICKET','EMITIDO','PYG'
  )
  RETURNING *`,
  [
    ventaId,
    numeroFactura,
    mf.timbrado,
    mf.punto_establecimiento,
    clienteIdReal,
    clienteData.nombre || "OCASIONAL",
    clienteData.ruc || "0000000-0",
    direccionFinal,
    condicionVenta,
    total,
    iva5,
    iva10,
    total_iva,
    0, // pagado (temporal)
    0  // vuelto (temporal)
  ]
);


// =========================
//  INSERT DETALLE (
// =========================
for (const item of detalle.rows) {
  let iva_monto = 0;

  if (Number(item.iva_tipo) === 5) iva_monto = Number(item.subtotal) / 21;
  if (Number(item.iva_tipo) === 10) iva_monto = Number(item.subtotal) / 11;

  await client.query(
    `INSERT INTO factura_detalle
    (factura_id, producto_id, descripcion, cantidad, precio, subtotal, iva_tipo, iva_monto)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      factura.rows[0].id,
      item.producto_id,
      item.producto_nombre || "SIN DESCRIPCION",
      item.cantidad,
      item.precio,
      item.subtotal,
      item.iva_tipo,
      iva_monto
    ]
  );
}

await registrarFacturaVentas(client, factura.rows[0].id, [ventaId]);

// =========================
// MARCAR VENTA COMO EFECTIVADO
// =========================
await client.query(`
  UPDATE venta
  SET estado = 'EFECTIVADO'
  WHERE id = $1
`, [ventaId]);

await clearMesaByVentaId(client, ventaId, getMesaScopeFromReq(req));

    await client.query("COMMIT");

    res.json(factura.rows[0]);

  } catch (err) {

    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Error generando factura" });

  } finally {
    client.release();
  }
});

router.post("/generar-multiple", async (req, res) => {

  const { ventas = [], ruc, nombre, direccion, ciudad } = req.body;

  if (!ventas.length) {
    return res.status(400).json({ error: "Sin ventas" });
  }

  const client = await db.connect();

  try {

    await client.query("BEGIN");

    // =========================
    // VALIDAR MODELO
    // =========================
    const modelo = await client.query(
      "SELECT * FROM modelo_factura LIMIT 1"
    );

    if (!modelo.rows.length) {
      throw new Error("No existe modelo de factura");
    }

    const mf = modelo.rows[0];

    // VALIDAR TIMBRADO
    const hoy = new Date();
    if (hoy < new Date(mf.fecha_inicio)) {
      throw new Error("Timbrado no vigente");
    }
    if (hoy > new Date(mf.fecha_vencimiento)) {
      throw new Error("Timbrado vencido");
    }

    // =========================
    // CLIENTE
    // =========================
    const cliente = await obtenerOCrearClienteFactura(client, {
      ruc,
      nombre,
      direccion,
      ciudad
    });
    const ventasUnicas = [...new Set(ventas.map((ventaId) => Number(ventaId)).filter((ventaId) => ventaId > 0))];

    if (!ventasUnicas.length) {
      throw new Error("Sin ventas validas");
    }

    // =========================
    // RECORRER VENTAS
    // =========================
    let total = 0;
    let iva5 = 0;
    let iva10 = 0;
    let detallesFinal = [];

    for (const ventaId of ventasUnicas) {

      // 🔥 VALIDAR VENTA
      const venta = await client.query(
        `SELECT id, estado FROM venta WHERE id = $1 FOR UPDATE`,
        [ventaId]
      );

      if (!venta.rows.length) {
        throw new Error(`Venta ${ventaId} no existe`);
      }

      if (!["PENDIENTE", "CONCLUIDO", "EFECTIVADO"].includes(venta.rows[0].estado)) {
        throw new Error(`Venta ${ventaId} no válida`);
      }

      // 🔥 EVITAR DOBLE FACTURA

      if (await ventaTieneFactura(client, ventaId)) {
        throw new Error(`Venta ${ventaId} ya facturada`);
      }

      // DETALLE
      const detalle = await client.query(`
        SELECT vd.*, p.iva_tipo, p.nombre
        FROM venta_detalle vd
        JOIN producto p ON p.id = vd.producto_id
        WHERE vd.venta_id = $1
      `, [ventaId]);

      for (const item of detalle.rows) {

        total += Number(item.subtotal);

        if (item.iva_tipo == 5) iva5 += item.subtotal / 21;
        if (item.iva_tipo == 10) iva10 += item.subtotal / 11;

        detallesFinal.push(item);
      }
    }

    total = Math.round(total);
    iva5 = Math.round(iva5);
    iva10 = Math.round(iva10);

    const numeroFactura = await generarNumeroFactura(client, mf);

    // =========================
    // INSERT FACTURA
    // =========================
    const factura = await client.query(`
      INSERT INTO factura
      (venta_id, numero_factura, timbrado, punto_establecimiento, fecha,
       cliente_id, cliente_nombre, cliente_ruc, cliente_direccion,
 total, iva5, iva10, total_iva, pagado, vuelto,
tipo_comprobante, estado, moneda)
      VALUES (
        $1,$2,$3,$4,(NOW() AT TIME ZONE 'America/Asuncion'),
        $5,$6,$7,$8,
        $9,$10,$11,$12,$13,$14,
        'TICKET','EMITIDO','PYG'
      )
      RETURNING *
    `, [
      ventasUnicas[0],
      numeroFactura,
      mf.timbrado,
      mf.punto_establecimiento,
      cliente.id,
      cliente.nombre || nombre || "OCASIONAL",
      cliente.ruc || ruc || "0000000-0",
      direccion || ciudad || cliente.direccion || "SIN DIRECCION",
      total,
      iva5,
      iva10,
      iva5 + iva10,
      0, // pagado (opcional acá)
      0  // vuelto
    ]);

    const facturaId = factura.rows[0].id;

    await registrarFacturaVentas(client, facturaId, ventasUnicas);

    // =========================
    // DETALLE
    // =========================
    for (const item of detallesFinal) {

      let iva_monto = 0;

      if (item.iva_tipo == 5) iva_monto = item.subtotal / 21;
      if (item.iva_tipo == 10) iva_monto = item.subtotal / 11;

      await client.query(`
        INSERT INTO factura_detalle
        (factura_id, producto_id, descripcion, cantidad, precio, subtotal, iva_tipo, iva_monto)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      `, [
        facturaId,
        item.producto_id,
        item.nombre,
        item.cantidad,
        item.precio,
        item.subtotal,
        item.iva_tipo,
        iva_monto
      ]);
    }

    // =========================
    // LINK OPCIONAL (PRO)
    // =========================
    for (const ventaId of ventasUnicas) {
      await client.query(`
        UPDATE venta
        SET estado = 'EFECTIVADO'
        WHERE id = $1
      `, [ventaId]);
    }

    await client.query("COMMIT");

    res.json({ id: facturaId });

  } catch (err) {

    await client.query("ROLLBACK");
    console.error(err);

    res.status(400).json({ error: err.message });

  } finally {
    client.release();
  }
});


router.get("/ticket/:facturaId", async (req, res) => {

  const { facturaId } = req.params;

  //  FIX: fallback empresa
  const empresaId = req.usuario?.empresa_id || 1;

  try {

 const factura = await db.query(
  `SELECT 
  f.*,

  -- CLIENTE
  COALESCE(c.nombre, f.cliente_nombre, 'OCASIONAL') AS cliente_nombre,
  COALESCE(c.ruc, f.cliente_ruc, '0000000-0') AS cliente_ruc,
COALESCE(f.cliente_direccion, c.direccion, 'SIN DIRECCION') AS cliente_direccion,

  -- EMPRESA
  e.nombre AS empresa_nombre,
  e.ruc AS empresa_ruc,
  e.direccion AS empresa_direccion,
  e.telefono AS empresa_telefono,
  e.email AS empresa_email, 
  e.logo AS empresa_logo,

  -- MODELO FACTURA
  mf.timbrado,
  mf.fecha_inicio,
  mf.fecha_vencimiento,
  mf.actividad,
  mf.punto_establecimiento

FROM factura f

LEFT JOIN cliente c ON c.id = f.cliente_id
LEFT JOIN empresa e ON e.id = $2
LEFT JOIN modelo_factura mf ON true

WHERE f.id = $1`,
  [facturaId, empresaId]
);

    if (!factura.rows.length) {
      return res.status(404).json({ error: "Factura no encontrada" });
    }

    const detalle = await db.query(
      `SELECT 
        producto_id,
        descripcion,
        cantidad,
        precio,
        subtotal,
        iva_tipo,
        iva_monto
       FROM factura_detalle
       WHERE factura_id = $1`,
      [facturaId]
    );

    res.json({
      factura: factura.rows[0],
      detalle: detalle.rows
    });

  } catch (err) {

    console.error("ERROR TICKET:", err);

    res.status(500).json({
      error: "Error obteniendo ticket",
      detalle: err.message 
    });
  }
});

router.get("/preview-numero", async (req, res) => {
  try {

    const modelo = await db.query("SELECT * FROM modelo_factura LIMIT 1");

    if (!modelo.rows.length) {
      return res.json({ numero: "000-000-0000000" });
    }

    const client = await db.connect();

    const numero = await generarNumeroFactura(client, modelo.rows[0]);

    client.release();

    res.json({ numero });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error generando preview" });
  }
});

   // PARA MOVIMIENTO DE FACTURA 
router.get("/", async (req, res) => {
  try {

    const {
      desde,
      hasta,
      estado,
      tipo,
      numero,
      cliente
    } = req.query;

    let query = `
      SELECT 
        f.id,
        f.venta_id,
        f.fecha,
        f.numero_factura AS numero,
        f.cliente_nombre,
        f.cliente_ruc,
        f.tipo_comprobante,
        f.estado,
        f.total
      FROM factura f
      WHERE 1=1
    `;

    const params = [];
    let i = 1;

    // FECHA
    if (desde) {
      query += ` AND f.fecha >= $${i++}`;
      params.push(desde);
    }

    if (hasta) {
      query += ` AND f.fecha <= $${i++}`;
      params.push(hasta + " 23:59:59");
    }

    // ESTADO
    if (estado) {
      query += ` AND f.estado = $${i++}`;
      params.push(estado);
    }

    // TIPO
    if (tipo) {
      query += ` AND f.tipo_comprobante = $${i++}`;
      params.push(tipo);
    }

    // NUMERO
    if (numero) {
      query += ` AND f.numero_factura ILIKE $${i++}`;
      params.push(`%${numero}%`);
    }

    // CLIENTE
    if (cliente) {
      query += ` AND f.cliente_nombre ILIKE $${i++}`;
      params.push(`%${cliente}%`);
    }

    query += ` ORDER BY f.id DESC LIMIT 200`;

    const result = await db.query(query, params);

    res.json(result.rows);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error listando facturas" });
  }
});

   // PARA MOVIMIENTO DE FACTURA DETALLE
router.get("/:id", async (req, res) => {
  try {

    const { id } = req.params;

    const factura = await db.query(
      `SELECT * FROM factura WHERE id = $1`,
      [id]
    );

    if (!factura.rows.length) {
      return res.status(404).json({ error: "Factura no encontrada" });
    }

    const detalle = await db.query(
      `SELECT 
        descripcion,
        cantidad,
        precio,
        subtotal
       FROM factura_detalle
       WHERE factura_id = $1`,
      [id]
    );

    res.json({
      ...factura.rows[0],
      detalles: detalle.rows
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error obteniendo factura" });
  }
});


router.put("/:id/anular", async (req, res) => {
  try {

    const { id } = req.params;

    await db.query(
      "UPDATE factura SET estado='ANULADO' WHERE id=$1",
      [id]
    );

    res.json({ ok: true });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error anulando factura" });
  }
});


router.get("/:id/pdf", async (req, res) => {

  const { id } = req.params;

  const puppeteer = require("puppeteer");

  try {

    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    const url = `http://localhost:3000/modulos/factura/factura_ticket.html?id=${id}`;

    await page.goto(url, { waitUntil: "networkidle0" });

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true
    });

    await browser.close();

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename=factura_${id}.pdf`
    });

    res.send(pdf);

  } catch (err) {
    console.error(err);
    res.status(500).send("Error generando PDF");
  }

});
