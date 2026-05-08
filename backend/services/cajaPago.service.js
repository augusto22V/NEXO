const METODOS_COMPATIBLES = new Set([
  "EFECTIVO",
  "TARJETA",
  "TRANSFERENCIA",
  "PIX",
  "GIRO"
]);

const MONEDAS_COMPATIBLES = new Set(["PYG", "BRL", "USD"]);
const METODOS_SOLO_PYG = new Set(["TARJETA", "TRANSFERENCIA", "PIX", "GIRO"]);

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function normalizarMetodo(value) {
  return String(value || "EFECTIVO").trim().toUpperCase();
}

function normalizarMoneda(value) {
  return String(value || "PYG").trim().toUpperCase();
}

function convertirAGs(moneda, monto, cotizaciones) {
  const cantidad = toNumber(monto);

  if (moneda === "PYG") return cantidad;
  if (moneda === "BRL") return cantidad * toNumber(cotizaciones.brl);
  if (moneda === "USD") return cantidad * toNumber(cotizaciones.usd);

  throw new Error(`Moneda no soportada: ${moneda}`);
}

function redondearMonto(moneda, monto) {
  const cantidad = toNumber(monto);

  if (moneda === "PYG") {
    return Math.round(cantidad);
  }

  return Math.round(cantidad * 100) / 100;
}

function construirPagosDesdePayload(body, cotizaciones) {
  if (Array.isArray(body.pagos) && body.pagos.length > 0) {
    return body.pagos
      .map((pago) => ({
        metodo: normalizarMetodo(pago.metodo),
        moneda: normalizarMoneda(pago.moneda),
        monto: toNumber(pago.monto)
      }))
      .filter((pago) => pago.monto > 0);
  }

  const pagos = [];
  const pagoGs = toNumber(body.pago_gs);
  const pagoBrl = toNumber(body.pago_brl);
  const pagoUsd = toNumber(body.pago_usd);

  if (pagoGs > 0) pagos.push({ metodo: "EFECTIVO", moneda: "PYG", monto: pagoGs });
  if (pagoBrl > 0) pagos.push({ metodo: "EFECTIVO", moneda: "BRL", monto: pagoBrl });
  if (pagoUsd > 0) pagos.push({ metodo: "EFECTIVO", moneda: "USD", monto: pagoUsd });

  if (!pagos.length && toNumber(body.total_pagado_gs) > 0) {
    pagos.push({ metodo: "EFECTIVO", moneda: "PYG", monto: toNumber(body.total_pagado_gs) });
  }

  return pagos.map((pago) => ({
    ...pago,
    monto_gs: convertirAGs(pago.moneda, pago.monto, cotizaciones)
  }));
}

function normalizarPagos(body, cotizaciones) {
  const pagos = construirPagosDesdePayload(body, cotizaciones).map((pago) => {
    const metodo = normalizarMetodo(pago.metodo);
    const moneda = normalizarMoneda(pago.moneda);

    if (!METODOS_COMPATIBLES.has(metodo)) {
      throw new Error(`Método de pago no soportado: ${metodo}`);
    }

    if (!MONEDAS_COMPATIBLES.has(moneda)) {
      throw new Error(`Moneda no soportada: ${moneda}`);
    }

    if (METODOS_SOLO_PYG.has(metodo) && moneda !== "PYG") {
      throw new Error(`El método ${metodo} solo admite moneda PYG`);
    }

    const monto = redondearMonto(moneda, pago.monto);
    const montoGs = pago.monto_gs != null
      ? toNumber(pago.monto_gs)
      : convertirAGs(moneda, monto, cotizaciones);

    return { metodo, moneda, monto, monto_gs: Math.round(montoGs) };
  });

  if (!pagos.length) {
    throw new Error("No se recibieron pagos");
  }

  return pagos;
}

function resumirPagos(pagos) {
  return pagos.reduce(
    (acc, pago) => {
      if (pago.metodo === "EFECTIVO" && pago.moneda === "PYG") acc.pago_efectivo += pago.monto;
      if (pago.metodo === "EFECTIVO" && pago.moneda === "BRL") acc.pago_efectivo_real += pago.monto;
      if (pago.metodo === "EFECTIVO" && pago.moneda === "USD") acc.pago_efectivo_dolar += pago.monto;
      if (pago.metodo === "TARJETA") acc.pago_tarjeta += pago.monto_gs;
      if (pago.metodo === "TRANSFERENCIA") acc.pago_transferencia += pago.monto_gs;
      if (pago.metodo === "GIRO") {
        acc.pago_transferencia += pago.monto_gs;
        acc.pago_giro += pago.monto_gs;
      }
      if (pago.metodo === "PIX") acc.pago_pix += pago.monto_gs;
      acc.total_pagado_gs += pago.monto_gs;
      return acc;
    },
    {
      pago_efectivo: 0,
      pago_efectivo_real: 0,
      pago_efectivo_dolar: 0,
      pago_tarjeta: 0,
      pago_transferencia: 0,
      pago_giro: 0,
      pago_pix: 0,
      total_pagado_gs: 0
    }
  );
}

function prorratearPagos(pagos, proporcion, esUltimaVenta, acumuladoPorPago) {
  return pagos.map((pago, index) => {
    const clave = `${index}:${pago.metodo}:${pago.moneda}`;
    const consumido = acumuladoPorPago.get(clave) || { monto: 0, monto_gs: 0 };

    if (esUltimaVenta) {
      return {
        ...pago,
        monto: redondearMonto(pago.moneda, pago.monto - consumido.monto),
        monto_gs: pago.monto_gs - consumido.monto_gs
      };
    }

    const monto = redondearMonto(pago.moneda, pago.monto * proporcion);
    const monto_gs = Math.round(pago.monto_gs * proporcion);

    acumuladoPorPago.set(clave, {
      monto: consumido.monto + monto,
      monto_gs: consumido.monto_gs + monto_gs
    });

    return { ...pago, monto, monto_gs };
  }).filter((pago) => pago.monto > 0 || pago.monto_gs > 0);
}

async function insertarDetallePago(client, cajaMovimientoId, pagosVenta) {
  for (const pago of pagosVenta) {
    await client.query(
      `
        INSERT INTO caja_pago_detalle
          (caja_movimiento_id, metodo, moneda, monto, monto_gs)
        VALUES ($1, $2, $3, $4, $5)
      `,
      [
        cajaMovimientoId,
        pago.metodo,
        pago.moneda,
        pago.monto,
        pago.monto_gs
      ]
    );
  }
}

module.exports = {
  insertarDetallePago,
  normalizarPagos,
  prorratearPagos,
  resumirPagos,
  toNumber
};
