const express = require("express");
const fs = require("fs");
const path = require("path");
const ExcelJS = require("exceljs");
const PDFDocument = require("pdfkit");
const pool = require("../db");

const router = express.Router();
const authMiddleware = require("../Auth.middleware");
const reportesService = require("../services/reportes.service");
const { ensureComisionSchema } = require("../services/comision.service");

const EXPORT_DIR = "C:\\Sys\\doc";

router.use(authMiddleware);

function ensureExportDir() {
  fs.mkdirSync(EXPORT_DIR, { recursive: true });
  return EXPORT_DIR;
}

function safeText(value) {
  return String(value ?? "").trim();
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function formatGs(value) {
  return `${Math.round(toNumber(value)).toLocaleString("es-PY")} Gs`;
}

function formatQty(value) {
  return toNumber(value).toLocaleString("es-PY");
}

function formatPct(value) {
  return `${toNumber(value).toFixed(1)} %`;
}

function normalizeTipo(tipo, fallback = "detallado") {
  const value = safeText(tipo).toLowerCase();
  return value || fallback;
}

function getEmpresaId(req) {
  const fromBody = Number(req.body?.empresa_id || 0);
  const fromUser = Number(req.usuario?.empresa_id || 0);
  if (Number.isFinite(fromBody) && fromBody > 0) return Math.trunc(fromBody);
  if (Number.isFinite(fromUser) && fromUser > 0) return Math.trunc(fromUser);
  return null;
}

function formatDateOnly(value) {
  if (value == null || value === "") return "-";

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const d = String(value.getDate()).padStart(2, "0");
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const y = value.getFullYear();
    return `${d}/${m}/${y}`;
  }

  const raw = String(value).trim();
  if (!raw) return "-";

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;

  const dmy = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (dmy) return raw;

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    const d = String(parsed.getDate()).padStart(2, "0");
    const m = String(parsed.getMonth() + 1).padStart(2, "0");
    const y = parsed.getFullYear();
    return `${d}/${m}/${y}`;
  }

  return raw;
}

function todayIso() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function writeXlsxFile(payload, fullPath) {
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet("Reporte");

  ws.addRow(["Informe", payload.title]);
  ws.addRow(["Tipo", payload.tipo]);
  ws.addRow(["Desde", payload.desde]);
  ws.addRow(["Hasta", payload.hasta]);
  ws.addRow([]);

  const headerRow = ws.addRow(payload.headers);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1F4E78" }
    };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = {
      top: { style: "thin", color: { argb: "FFCCCCCC" } },
      left: { style: "thin", color: { argb: "FFCCCCCC" } },
      bottom: { style: "thin", color: { argb: "FFCCCCCC" } },
      right: { style: "thin", color: { argb: "FFCCCCCC" } }
    };
  });

  payload.rows.forEach((row) => {
    const r = ws.addRow(row);
    r.eachCell((cell) => {
      cell.alignment = { vertical: "top", horizontal: "left", wrapText: true };
      cell.border = {
        top: { style: "thin", color: { argb: "FFE5E5E5" } },
        left: { style: "thin", color: { argb: "FFE5E5E5" } },
        bottom: { style: "thin", color: { argb: "FFE5E5E5" } },
        right: { style: "thin", color: { argb: "FFE5E5E5" } }
      };
    });
  });

  ws.addRow([]);
  ws.addRow(["Totales", "Valor"]);
  const totalsHeader = ws.lastRow;
  totalsHeader.eachCell((cell) => {
    cell.font = { bold: true };
  });

  payload.totals.forEach((t) => ws.addRow([t.label, t.value]));

  ws.columns.forEach((column) => {
    let max = 12;
    column.eachCell({ includeEmpty: true }, (cell) => {
      const len = String(cell.value ?? "").length;
      if (len > max) max = len;
    });
    column.width = Math.min(max + 2, 45);
  });

  await workbook.xlsx.writeFile(fullPath);
}

function drawPdfTableHeader(doc, x, y, colWidths, headers, rowHeight) {
  let cursorX = x;
  headers.forEach((h, idx) => {
    const w = colWidths[idx];
    doc.rect(cursorX, y, w, rowHeight).fillAndStroke("#1F4E78", "#CCCCCC");
    doc.fillColor("#FFFFFF")
      .fontSize(9)
      .text(String(h || ""), cursorX + 3, y + 4, { width: w - 6, align: "center" });
    cursorX += w;
  });
  doc.fillColor("#111111");
}

function computeRowHeight(doc, row, colWidths) {
  let maxHeight = 16;
  row.forEach((cell, idx) => {
    const text = String(cell ?? "");
    const h = doc.heightOfString(text, { width: colWidths[idx] - 6, align: "left" }) + 8;
    if (h > maxHeight) maxHeight = h;
  });
  return maxHeight;
}

function drawPdfDataRow(doc, x, y, row, colWidths, rowHeight) {
  let cursorX = x;
  row.forEach((cell, idx) => {
    const w = colWidths[idx];
    doc.rect(cursorX, y, w, rowHeight).stroke("#DDDDDD");
    doc.fontSize(8).fillColor("#111111")
      .text(String(cell ?? ""), cursorX + 3, y + 4, { width: w - 6, align: "left" });
    cursorX += w;
  });
}

async function writePdfFile(payload, fullPath) {
  await new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 30 });
    const stream = fs.createWriteStream(fullPath);
    doc.pipe(stream);

    doc.fontSize(16).text(payload.title, { align: "left" });
    doc.moveDown(0.5);
    doc.fontSize(10).text(`Tipo: ${payload.tipo}`);
    doc.text(`Desde: ${payload.desde}`);
    doc.text(`Hasta: ${payload.hasta}`);
    doc.moveDown(0.8);

    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const colCount = payload.headers.length || 1;
    const colWidth = Math.max(45, Math.floor(pageWidth / colCount));
    const colWidths = Array.from({ length: colCount }, () => colWidth);

    let y = doc.y;
    const x = doc.page.margins.left;
    const headerHeight = 22;

    drawPdfTableHeader(doc, x, y, colWidths, payload.headers, headerHeight);
    y += headerHeight;

    payload.rows.forEach((row) => {
      const rowHeight = computeRowHeight(doc, row, colWidths);
      const bottomLimit = doc.page.height - doc.page.margins.bottom;
      if (y + rowHeight > bottomLimit) {
        doc.addPage();
        y = doc.page.margins.top;
        drawPdfTableHeader(doc, x, y, colWidths, payload.headers, headerHeight);
        y += headerHeight;
      }
      drawPdfDataRow(doc, x, y, row, colWidths, rowHeight);
      y += rowHeight;
    });

    if (y + 80 > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      y = doc.page.margins.top;
    }

    doc.y = y + 10;
    doc.fontSize(11).fillColor("#111111").text("Totales", { underline: true });
    payload.totals.forEach((t) => {
      doc.fontSize(10).text(`${t.label}: ${t.value}`);
    });

    doc.end();
    stream.on("finish", resolve);
    stream.on("error", reject);
  });
}

async function fetchVentasRows(filters) {
  await ensureComisionSchema();
  const tipo = normalizeTipo(filters.tipo);
  const desde = safeText(filters.desde) || null;
  const hasta = safeText(filters.hasta) || null;
  const cliente = safeText(filters.cliente) || null;
  const producto = safeText(filters.producto) || null;
  const comisionDetalleExpr = `
    CASE
      WHEN COALESCE(v.total, 0) > 0
        THEN COALESCE(v.comision, 0) * ((vd.cantidad * vd.precio) / NULLIF(v.total, 0))
      ELSE 0
    END
  `;

  if (tipo === "producto") {
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
    if (desde) { sql += ` AND v.fecha::date >= $${i++}`; params.push(desde); }
    if (hasta) { sql += ` AND v.fecha::date <= $${i++}`; params.push(hasta); }
    if (producto) { sql += ` AND LOWER(p.nombre) LIKE LOWER($${i++})`; params.push(`%${producto}%`); }
    if (cliente) { sql += ` AND LOWER(COALESCE(c.nombre,v.cliente_nombre)) LIKE LOWER($${i++})`; params.push(`%${cliente}%`); }
    sql += " GROUP BY p.nombre ORDER BY total DESC";
    const r = await pool.query(sql, params);
    return r.rows;
  }

  if (tipo === "ganancia") {
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
      LEFT JOIN producto_precio pp ON pp.producto_id = p.id AND pp.activo = true
      LEFT JOIN cliente c ON c.id = v.cliente_id
      WHERE v.estado = 'EFECTIVADO'
    `;
    const params = [];
    let i = 1;
    if (desde) { sql += ` AND v.fecha::date >= $${i++}`; params.push(desde); }
    if (hasta) { sql += ` AND v.fecha::date <= $${i++}`; params.push(hasta); }
    if (producto) { sql += ` AND LOWER(p.nombre) LIKE LOWER($${i++})`; params.push(`%${producto}%`); }
    if (cliente) { sql += ` AND LOWER(COALESCE(c.nombre,v.cliente_nombre)) LIKE LOWER($${i++})`; params.push(`%${cliente}%`); }
    sql += ` GROUP BY p.nombre, vd.precio, pp.precio_compra, pp.costo_transporte ORDER BY producto `;
    const r = await pool.query(sql, params);
    return r.rows;
  }

  if (tipo === "categoria") {
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
    if (desde) { sql += ` AND v.fecha::date >= $${i++}`; params.push(desde); }
    if (hasta) { sql += ` AND v.fecha::date <= $${i++}`; params.push(hasta); }
    if (cliente) { sql += ` AND LOWER(COALESCE(cl.nombre,v.cliente_nombre)) LIKE LOWER($${i++})`; params.push(`%${cliente}%`); }
    if (producto) { sql += ` AND LOWER(p.nombre) LIKE LOWER($${i++})`; params.push(`%${producto}%`); }
    sql += " GROUP BY c.nombre ORDER BY total DESC";
    const r = await pool.query(sql, params);
    return r.rows;
  }

  if (tipo === "comision_vendedor") {
    let sql = `
      SELECT
        COALESCE(ve.nombre, 'Sin vendedor') AS vendedor,
        COUNT(*) AS ventas,
        COALESCE(SUM(v.total), 0) AS total_ventas,
        COALESCE(SUM(v.comision), 0) AS total_comision
      FROM venta v
      LEFT JOIN cliente c ON c.id = v.cliente_id
      LEFT JOIN vendedor ve ON ve.id = v.vendedor_id
      WHERE v.estado = 'EFECTIVADO'
    `;
    const params = [];
    let i = 1;
    if (desde) { sql += ` AND v.fecha::date >= $${i++}`; params.push(desde); }
    if (hasta) { sql += ` AND v.fecha::date <= $${i++}`; params.push(hasta); }
    if (cliente) { sql += ` AND LOWER(COALESCE(c.nombre,v.cliente_nombre)) LIKE LOWER($${i++})`; params.push(`%${cliente}%`); }
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
    sql += " GROUP BY COALESCE(ve.nombre, 'Sin vendedor') ORDER BY total_comision DESC, vendedor ASC";
    const r = await pool.query(sql, params);
    return r.rows;
  }

  let sql = `
    SELECT
      v.id,
      v.fecha,
      v.numero,
      COALESCE(c.nombre, v.cliente_nombre) AS cliente,
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
    LEFT JOIN producto_precio pp ON pp.producto_id = p.id AND pp.activo = true
    LEFT JOIN cliente c ON c.id = v.cliente_id
    LEFT JOIN vendedor ve ON ve.id = v.vendedor_id
    WHERE v.estado = 'EFECTIVADO'
  `;

  const params = [];
  let i = 1;
  if (desde) { sql += ` AND v.fecha::date >= $${i++}`; params.push(desde); }
  if (hasta) { sql += ` AND v.fecha::date <= $${i++}`; params.push(hasta); }
  if (cliente) { sql += ` AND LOWER(COALESCE(c.nombre,v.cliente_nombre)) LIKE LOWER($${i++})`; params.push(`%${cliente}%`); }
  if (producto) { sql += ` AND LOWER(p.nombre) LIKE LOWER($${i++})`; params.push(`%${producto}%`); }

  sql += `
    GROUP BY v.id, v.fecha, v.numero, c.nombre, v.cliente_nombre, ve.nombre, p.nombre, vd.precio, v.total, v.comision, pp.precio_compra, pp.costo_transporte
    ORDER BY v.fecha DESC
  `;

  const r = await pool.query(sql, params);
  return r.rows;
}

async function fetchComprasRows(filters, req) {
  const tipo = normalizeTipo(filters.tipo);
  const desde = safeText(filters.desde) || null;
  const hasta = safeText(filters.hasta) || null;
  const proveedor = safeText(filters.proveedor) || null;
  const producto = safeText(filters.producto) || null;
  const empresaId = getEmpresaId(req);
  if (!empresaId) throw new Error("empresa_id requerido para exportar compras");

  let sql = `
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
  `;

  const params = [empresaId, desde, hasta];
  let i = 4;
  if (proveedor) { sql += ` AND LOWER(p.nombre) LIKE LOWER($${i++})`; params.push(`%${proveedor}%`); }
  if (producto) { sql += ` AND LOWER(pr.nombre) LIKE LOWER($${i++})`; params.push(`%${producto}%`); }

  sql += " ORDER BY c.fecha DESC, c.id DESC, cd.id DESC";
  const r = await pool.query(sql, params);
  const rows = r.rows;

  if (tipo === "producto") {
    const byProduct = new Map();
    rows.forEach((row) => {
      const key = row.producto || "-";
      const prev = byProduct.get(key) || { producto: key, cantidad: 0, monto: 0 };
      prev.cantidad += toNumber(row.cantidad);
      prev.monto += toNumber(row.subtotal || row.total);
      byProduct.set(key, prev);
    });
    return Array.from(byProduct.values()).sort((a, b) => b.monto - a.monto);
  }

  if (tipo === "proveedor") {
    const byProvider = new Map();
    rows.forEach((row) => {
      const key = row.proveedor || "-";
      const prev = byProvider.get(key) || { proveedor: key, cantidad: 0, monto: 0 };
      prev.cantidad += toNumber(row.cantidad);
      prev.monto += toNumber(row.subtotal || row.total);
      byProvider.set(key, prev);
    });
    return Array.from(byProvider.values()).sort((a, b) => b.monto - a.monto);
  }

  return rows;
}

function buildVentasExportData(rows, filters, range) {
  const tipo = normalizeTipo(filters.tipo);
  const headers = [
    "Fecha", "Nr Venta", "Cliente", "Vendedor", "Producto", "Cant", "Costo", "Precio Venta", "Subtotal", "Comision", "Ganancia", "% Margen", "% Markup"
  ];

  const dataRows = [];
  let totalGanancia = 0;
  let totalVenta = 0;
  let totalCosto = 0;
  let totalComision = 0;

  rows.forEach((v) => {
    if (tipo === "producto") {
      const cantidad = toNumber(v.cantidad);
      const total = toNumber(v.total);
      const comision = toNumber(v.comision_total);
      dataRows.push(["-", "-", "-", "-", v.producto || "-", formatQty(cantidad), "-", "-", formatGs(total), formatGs(comision), "-", "-", "-"]);
      totalVenta += total;
      totalComision += comision;
      return;
    }

    if (tipo === "categoria") {
      const cantidad = toNumber(v.cantidad);
      const total = toNumber(v.total);
      const comision = toNumber(v.comision_total);
      dataRows.push(["-", "-", "-", "-", v.categoria || "-", formatQty(cantidad), "-", "-", formatGs(total), formatGs(comision), "-", "-", "-"]);
      totalVenta += total;
      totalComision += comision;
      return;
    }

    if (tipo === "ganancia") {
      const cantidad = toNumber(v.cantidad);
      const costoUnit = toNumber(v.precio_compra) + toNumber(v.costo_transporte);
      const precioVenta = toNumber(v.precio);
      const costoTotal = costoUnit * cantidad;
      const ventaTotal = precioVenta * cantidad;
      const ganancia = ventaTotal - costoTotal;
      const comision = toNumber(v.comision_total);
      const margen = ventaTotal > 0 ? (ganancia / ventaTotal) * 100 : 0;
      const markup = costoTotal > 0 ? (ganancia / costoTotal) * 100 : 0;

      dataRows.push(["-", "-", "-", "-", v.producto || "-", formatQty(cantidad), formatGs(costoUnit), formatGs(precioVenta), formatGs(ventaTotal), formatGs(comision), formatGs(ganancia), formatPct(margen), formatPct(markup)]);
      totalVenta += ventaTotal;
      totalCosto += costoTotal;
      totalComision += comision;
      totalGanancia += ganancia;
      return;
    }

    if (tipo === "comision_vendedor") {
      const ventas = toNumber(v.ventas);
      const totalVentas = toNumber(v.total_ventas);
      const comision = toNumber(v.total_comision);
      dataRows.push(["-", "-", "-", v.vendedor || "-", "-", formatQty(ventas), "-", "-", formatGs(totalVentas), formatGs(comision), "-", "-", "-"]);
      totalVenta += totalVentas;
      totalComision += comision;
      return;
    }

    const cantidad = toNumber(v.cantidad);
    const costoUnit = toNumber(v.precio_compra) + toNumber(v.costo_transporte);
    const precioVenta = toNumber(v.precio);
    const subtotal = toNumber(v.subtotal);
    const costoTotal = costoUnit * cantidad;
    const ganancia = subtotal - costoTotal;
    const comision = toNumber(v.comision);
    const margen = subtotal > 0 ? (ganancia / subtotal) * 100 : 0;
    const markup = costoTotal > 0 ? (ganancia / costoTotal) * 100 : 0;

    dataRows.push([
      formatDateOnly(v.fecha),
      safeText(v.numero) || "-",
      v.cliente || "-",
      v.vendedor || "-",
      v.producto || "-",
      formatQty(cantidad),
      formatGs(costoUnit),
      formatGs(precioVenta),
      formatGs(subtotal),
      formatGs(comision),
      formatGs(ganancia),
      formatPct(margen),
      formatPct(markup)
    ]);

    totalVenta += subtotal;
    totalCosto += costoTotal;
    totalComision += comision;
    totalGanancia += ganancia;
  });

  const margenTotal = totalVenta > 0 && tipo !== "comision_vendedor" ? (totalGanancia / totalVenta) * 100 : 0;
  return {
    title: "Informe de Ventas",
    tipo,
    desde: range.desde,
    hasta: range.hasta,
    headers,
    rows: dataRows,
    totals: [
      { label: "Total Costo", value: formatGs(totalCosto) },
      { label: "Total Venta", value: formatGs(totalVenta) },
      { label: "Total Comision", value: formatGs(totalComision) },
      { label: "Total Ganancia", value: formatGs(totalGanancia) },
      { label: "Margen", value: formatPct(margenTotal) }
    ]
  };
}

function buildComprasExportData(rows, filters, range) {
  const tipo = normalizeTipo(filters.tipo);
  const headers = ["Fecha", "Nr Compra", "Proveedor", "Comprador", "Producto", "Cantidad", "Costo Unit.", "Subtotal"];

  const dataRows = [];
  let total = 0;

  rows.forEach((v) => {
    if (tipo === "producto") {
      const cantidad = toNumber(v.cantidad);
      const monto = toNumber(v.monto);
      dataRows.push(["-", "-", "-", "-", v.producto || "-", formatQty(cantidad), "-", formatGs(monto)]);
      total += monto;
      return;
    }

    if (tipo === "proveedor") {
      const cantidad = toNumber(v.cantidad);
      const monto = toNumber(v.monto);
      dataRows.push(["-", "-", v.proveedor || "-", "-", "-", formatQty(cantidad), "-", formatGs(monto)]);
      total += monto;
      return;
    }

    const subtotal = toNumber(v.subtotal || v.total);
    dataRows.push([
      formatDateOnly(v.fecha),
      safeText(v.numero_movimiento) || "-",
      v.proveedor || "-",
      v.comprador || "-",
      v.producto || "-",
      formatQty(v.cantidad),
      formatGs(v.precio_unitario || v.costo || 0),
      formatGs(subtotal)
    ]);
    total += subtotal;
  });

  return {
    title: "Informe de Compras",
    tipo,
    desde: range.desde,
    hasta: range.hasta,
    headers,
    rows: dataRows,
    totals: [{ label: "Total Compras", value: formatGs(total) }]
  };
}

async function buildExportPayload(req) {
  const modulo = safeText(req.body?.modulo).toLowerCase();
  const filtros = req.body?.filtros && typeof req.body.filtros === "object" ? req.body.filtros : {};
  const tipo = normalizeTipo(req.body?.tipo || filtros.tipo);
  const desdeRaw = safeText(req.body?.desde || filtros.desde);
  const hastaRaw = safeText(req.body?.hasta || filtros.hasta);
  const range = {
    desde: formatDateOnly(desdeRaw),
    hasta: formatDateOnly(hastaRaw)
  };

  if (modulo === "ventas") {
    const rows = await fetchVentasRows({
      tipo,
      desde: desdeRaw,
      hasta: hastaRaw,
      cliente: filtros.cliente || req.body?.cliente,
      producto: filtros.producto || req.body?.producto
    });
    return { ...buildVentasExportData(rows, { tipo }, range), modulo };
  }

  if (modulo === "compras") {
    const rows = await fetchComprasRows({
      tipo,
      desde: desdeRaw,
      hasta: hastaRaw,
      proveedor: filtros.proveedor || req.body?.proveedor,
      producto: filtros.producto || req.body?.producto
    }, req);
    return { ...buildComprasExportData(rows, { tipo }, range), modulo };
  }

  throw new Error("Modulo de exportacion invalido");
}

router.get("/compras", async (req, res) => {
  try {
    const data = await reportesService.getComprasReport(req.query, req);
    res.json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get("/ventas", async (req, res) => {
  try {
    const data = await reportesService.getVentasReport(req.query, req);
    res.json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get("/caja", async (req, res) => {
  try {
    const data = await reportesService.getCajaReport(req.query, req);
    res.json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/exportar", async (req, res) => {
  try {
    const formato = safeText(req.body?.formato).toLowerCase();
    if (formato !== "pdf" && formato !== "excel") {
      return res.status(400).json({ error: "Formato invalido" });
    }

    const exportData = await buildExportPayload(req);
    const modulo = exportData.modulo;
    const baseName = `${modulo}_${todayIso()}`;

    ensureExportDir();

    if (formato === "excel") {
      const fileName = `${baseName}.xlsx`;
      const fullPath = path.join(EXPORT_DIR, fileName);
      await writeXlsxFile(exportData, fullPath);
      return res.json({ ok: true, formato, archivo: fileName, ruta: fullPath });
    }

    const fileName = `${baseName}.pdf`;
    const fullPath = path.join(EXPORT_DIR, fileName);
    await writePdfFile(exportData, fullPath);
    return res.json({ ok: true, formato, archivo: fileName, ruta: fullPath });
  } catch (err) {
    console.error("POST /reportes/exportar", err);
    res.status(500).json({ error: "No se pudo exportar el reporte" });
  }
});

router.post("/", async (req, res) => {
  try {
    const data = await reportesService.getIaReport(req.body, req);
    res.json(data);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
