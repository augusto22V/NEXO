const express = require("express");
const router = express.Router();
const pool = require("../db");

/*
  Estados:
  EFECTIVADO
  CONCLUIDO
  CANCELADO
*/

// =========================
// POST /ventas/efectivizar
// =========================
router.post("/efectivizar", async (req, res) => {

  const mov = req.body;

  if (!mov || !Array.isArray(mov.detalle) || mov.detalle.length === 0) {
    return res.status(400).json({ error: "Detalle vacío" });
  }

  for (const d of mov.detalle) {
    const pid = Number(d.producto_id);
    const cant = Number(d.cantidad);
    if (!pid || !Number.isInteger(cant) || cant <= 0) {
      return res.status(400).json({ error: "Detalle inválido" });
    }
  }

  const client = await pool.connect();

  try {

    await client.query("BEGIN");

    let total = 0;
    const detalleDB = [];

    // ================= VALIDAR PRODUCTOS =================
    for (const item of mov.detalle) {

      const producto_id = Number(item.producto_id);
      const cantidad = Number(item.cantidad);
      const nota = item.nota || null;

      const r = await client.query(
        `
        SELECT
          p.id,
          p.nombre,
          p.stock,
          p.tiene_preparo,
          COALESCE(pp.precio_venta, 0) AS precio
        FROM producto p
        LEFT JOIN producto_precio pp
          ON pp.producto_id = p.id
         AND pp.activo = true
        WHERE p.id = $1
          AND p.activo = true
        FOR UPDATE
        `,
        [producto_id]
      );

      if (r.rowCount === 0) {
        throw new Error(`Producto #${producto_id} no existe`);
      }

      const p = r.rows[0];
      const stock = Number(p.stock || 0);
      const precio = Number(p.precio || 0);

      if (precio <= 0) {
        throw new Error(`Producto ${p.nombre} sin precio`);
      }

      // 👉 Solo validar stock si NO es preparo
      if (!p.tiene_preparo && stock < cantidad) {
        throw new Error(`Stock insuficiente ${p.nombre}`);
      }

      const subtotal = precio * cantidad;
      total += subtotal;

      detalleDB.push({
        producto_id,
        nombre: p.nombre,
        cantidad,
        precio_unit: precio,
        subtotal,
        nota,
        tiene_preparo: p.tiene_preparo
      });

    }

    // ================= INSERT CABECERA =================
    const fecha = mov.fecha;
    const tipo = mov.tipo || "CONTADO";
    const pago = mov.pago || "EFECTIVO";
    const cliente_codigo = (mov.cliente?.codigo || "001").trim();
    const cliente_nombre = mov.cliente?.nombre || "Consumidor final";

    const v = await client.query(
      `
      INSERT INTO venta (fecha, tipo, pago, cliente_codigo, cliente_nombre, total, estado)
      VALUES ($1,$2,$3,$4,$5,$6,'EFECTIVADO')
      RETURNING id, fecha, total, estado
      `,
      [fecha, tipo, pago, cliente_codigo, cliente_nombre, total]
    );

    const ventaId = v.rows[0].id;

    // ================= INSERT DETALLE =================
    for (const d of detalleDB) {

      await client.query(
        `
        INSERT INTO venta_detalle
        (venta_id, producto_id, nombre, cantidad, precio_unit, subtotal, nota)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        `,
        [ventaId, d.producto_id, d.nombre, d.cantidad, d.precio_unit, d.subtotal, d.nota]
      );

      // 👉 Descontar stock SOLO si no es preparo
      if (!d.tiene_preparo) {
        await client.query(
          `UPDATE producto SET stock = stock - $1 WHERE id = $2`,
          [d.cantidad, d.producto_id]
        );
      }

    }

    await client.query("COMMIT");

 

    return res.status(201).json({
      ok: true,
      venta_id: ventaId,
      total
    });

  } catch (err) {

    await client.query("ROLLBACK");
    return res.status(400).json({ error: err.message });

  } finally {
    client.release();
  }

});


// =========================
// GET LISTADO
// =========================
router.get("/", async (req, res) => {

  try {

    const { desde, hasta, estado } = req.query;
    const params = [];
    let where = "WHERE 1=1";

    if (desde) { params.push(desde); where += ` AND fecha >= $${params.length}`; }
    if (hasta) { params.push(hasta); where += ` AND fecha <= $${params.length}`; }

    if (estado && estado !== "TODOS") {
      params.push(estado);
      where += ` AND estado = $${params.length}`;
    }

    const r = await pool.query(
      `
      SELECT id, fecha, cliente_codigo, cliente_nombre, estado, total
      FROM venta
      ${where}
      ORDER BY id DESC
      LIMIT 300
      `,
      params
    );

    res.json(r.rows);

  } catch (err) {
    res.status(500).json({ error: "Error al listar ventas" });
  }

});


// =========================
// GET DETALLE
// =========================
router.get("/:id", async (req, res) => {

  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "ID inválido" });

  try {

    const cab = await pool.query(
      `SELECT id, fecha, tipo, pago, cliente_codigo, cliente_nombre, total, estado
       FROM venta
       WHERE id = $1`,
      [id]
    );

    const det = await pool.query(
      `
      SELECT id, producto_id, nombre, cantidad, precio_unit, subtotal, nota
      FROM venta_detalle
      WHERE venta_id = $1
      ORDER BY id
      `,
      [id]
    );

    res.json({ venta: cab.rows[0], detalle: det.rows });

  } catch (err) {
    res.status(500).json({ error: "Error al leer venta" });
  }

});

module.exports = router;