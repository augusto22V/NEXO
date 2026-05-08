const express = require("express");
const router = express.Router();
const db = require("../db");
const authMiddleware = require("../Auth.middleware");
const compraService = require("../services/compra.service");
const { MONEDA_IDS, ensureMonedaSchema } = require("../services/moneda.schema.service");

router.use(authMiddleware);

function empresaIdFromRequest(req) {
  return Number(req.query.empresa_id || req.body.empresa_id || req.usuario?.empresa_id || 0);
}

router.post("/", async (req, res) => {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const result = await compraService.createCompra(client, req.body, req);
    await client.query("COMMIT");
    res.json({ ok: true, ...result });
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

router.put("/:id", async (req, res) => {
  const client = await db.connect();
  try {
    const compraId = Number(req.params.id);
    if (!compraId) return res.status(400).json({ error: "ID inválido" });

    await client.query("BEGIN");
    const result = await compraService.editarCompra(client, compraId, req.body, req);
    await client.query("COMMIT");
    res.json({ ok: true, ...result });
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

router.delete("/:id", async (req, res) => {
  const client = await db.connect();
  try {
    const compraId = Number(req.params.id);
    const empresaId = empresaIdFromRequest(req);
    if (!compraId || !empresaId) return res.status(400).json({ error: "Datos inválidos" });

    await client.query("BEGIN");
    await compraService.eliminarCompra(client, compraId, empresaId);
    await client.query("COMMIT");
    res.json({ ok: true });
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

router.post("/:id/items", async (req, res) => {
  const client = await db.connect();
  try {
    const compraId = Number(req.params.id);
    const empresaId = empresaIdFromRequest(req);
    if (!compraId || !empresaId) return res.status(400).json({ error: "Datos inválidos" });

    await client.query("BEGIN");
    const result = await compraService.agregarItemCompra(client, compraId, empresaId, req.body);
    await client.query("COMMIT");
    res.json({ ok: true, ...result });
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

router.put("/items/:id", async (req, res) => {
  const client = await db.connect();
  try {
    const detalleId = Number(req.params.id);
    const empresaId = empresaIdFromRequest(req);
    if (!detalleId || !empresaId) return res.status(400).json({ error: "Datos inválidos" });

    await client.query("BEGIN");
    const result = await compraService.editarItemCompra(client, detalleId, empresaId, req.body);
    await client.query("COMMIT");
    res.json({ ok: true, ...result });
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

router.delete("/items/:id", async (req, res) => {
  const client = await db.connect();
  try {
    const detalleId = Number(req.params.id);
    const empresaId = empresaIdFromRequest(req);
    if (!detalleId || !empresaId) return res.status(400).json({ error: "Datos inválidos" });

    await client.query("BEGIN");
    const result = await compraService.eliminarItemCompra(client, detalleId, empresaId);
    await client.query("COMMIT");
    res.json({ ok: true, ...result });
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

router.get("/", async (req, res) => {
  const client = await db.connect();
  try {
    const rows = await compraService.buscarCompras(client, req.query, req);
    res.json(rows);
  } catch (err) {
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

router.get("/movimientos", async (req, res) => {
  const client = await db.connect();
  try {
    const rows = await compraService.buscarCompras(client, req.query, req);
    res.json(rows);
  } catch (err) {
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

router.get("/filtro", async (req, res) => {
  const client = await db.connect();
  try {
    const rows = await compraService.buscarCompras(client, req.query, req);
    res.json(rows);
  } catch (err) {
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

router.put("/efectivar/:id", async (req, res) => {
  const client = await db.connect();
  try {
    const compraId = Number(req.params.id);
    if (!compraId) return res.status(400).json({ error: "ID inválido" });

    await client.query("BEGIN");
    const result = await compraService.editarCompra(client, compraId, {
      ...req.body,
      empresa_id: empresaIdFromRequest(req),
      estado: 3
    }, req);
    await client.query("COMMIT");
    res.json({ ok: true, ...result });
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

router.put("/:id/estado", async (req, res) => {
  const client = await db.connect();
  try {
    const compraId = Number(req.params.id);
    if (!compraId) return res.status(400).json({ error: "ID inválido" });

    await client.query("BEGIN");
    const result = await compraService.editarCompra(client, compraId, {
      ...req.body,
      empresa_id: empresaIdFromRequest(req)
    }, req);
    await client.query("COMMIT");
    res.json({ ok: true, ...result });
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

router.get("/reporte", async (req, res) => {
  const client = await db.connect();
  try {
    const empresaId = empresaIdFromRequest(req);
    if (!empresaId) return res.status(400).json({ error: "empresa_id requerido" });

    const result = await client.query(
      `
        SELECT
          c.fecha,
          COALESCE(c.numero_compra, CAST(c.id AS text)) AS numero_movimiento,
          p.nombre AS proveedor,
          pr.nombre AS producto,
          cd.cantidad,
          cd.costo AS precio_unitario,
          cd.total AS subtotal,
          c.total,
          c.estado,
          m.nombre AS moneda
        FROM compra c
        JOIN compra_detalle cd ON cd.compra_id = c.id
        JOIN proveedor p ON p.id = c.proveedor_id
        JOIN producto pr ON pr.id = cd.producto_id
        LEFT JOIN moneda m ON m.id = c.moneda_id
        WHERE c.empresa_id = $1
          AND ($2::date IS NULL OR c.fecha >= $2::date)
          AND ($3::date IS NULL OR c.fecha <= $3::date)
        ORDER BY c.fecha DESC, c.id DESC, cd.id DESC
      `,
      [empresaId, req.query.desde || null, req.query.hasta || null]
    );

    res.json(result.rows);
  } catch (err) {
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

router.get("/catalogos", async (req, res) => {
  const client = await db.connect();
  try {
    await ensureMonedaSchema();

    const [tipos, condiciones, proveedores, productos, monedas] = await Promise.all([
      client.query(`
        SELECT
          t.id,
          t.codigo,
          t.descripcion,
          t.tipo,
          t.afecta_stock,
          t.requiere_confirmacion,
          t.genera_financiero,
          t.permite_credito,
          COALESCE(t.requiere_credito, false) AS requiere_credito,
          t.activo
        FROM tipo_operacion t
        WHERE t.activo = true
          AND UPPER(TRIM(t.tipo::text)) = 'E'
        ORDER BY t.codigo ASC, t.id ASC
      `),
      client.query(`
        SELECT c.id, c.codigo, c.descripcion, c.cuotas, c.dias_intervalo, c.activo
        FROM condicion_pago c
        WHERE c.activo = true
        ORDER BY c.codigo ASC, c.id ASC
      `),
      client.query(`
        SELECT p.id, p.nombre
        FROM proveedor p
        ORDER BY p.id
      `),
      client.query(`
        SELECT pr.id, pr.nombre
        FROM producto pr
        ORDER BY pr.id
      `),
      client.query(`
        SELECT m.id, m.nombre
        FROM moneda m
        WHERE m.id IN ($1, $2, $3)
        ORDER BY m.id
      `, [MONEDA_IDS.PYG, MONEDA_IDS.BRL, MONEDA_IDS.USD])
    ]);

    res.json({
      tipos_operacion: tipos.rows,
      condiciones_pago: condiciones.rows,
      proveedores: proveedores.rows,
      productos: productos.rows,
      monedas: monedas.rows
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

router.get("/:id", async (req, res) => {
  const client = await db.connect();
  try {
    const compraId = Number(req.params.id);
    const empresaId = empresaIdFromRequest(req);
    if (!compraId || !empresaId) return res.status(400).json({ error: "Datos inválidos" });

    const compra = await compraService.obtenerCompra(client, compraId, empresaId);
    res.json(compra);
  } catch (err) {
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
