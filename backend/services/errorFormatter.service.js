/**
 * Formatea errores de PostgreSQL en un objeto JSON friendly para el frontend.
 * Detecta los codigos comunes y agrega una explicacion en español.
 *
 * Ejemplo:
 *   try {
 *     await pool.query(...);
 *   } catch (err) {
 *     return res.status(formatDbError(err).status).json(formatDbError(err));
 *   }
 */
function formatDbError(err, contextoLabel = "Error en operacion DB") {
  const codigo = err?.code || null;
  const detalle = err?.message || String(err);

  // Tabla de codigos PostgreSQL comunes — https://www.postgresql.org/docs/current/errcodes-appendix.html
  const explicaciones = {
    "42P01": "La tabla referenciada no existe en la BD",
    "42703": "La columna referenciada no existe en la tabla",
    "23505": "Valor duplicado — viola un constraint UNIQUE",
    "23503": "Violacion de foreign key — referencia a un registro que no existe",
    "23502": "Una columna NOT NULL recibio un valor nulo",
    "23514": "Un CHECK constraint fallo (valor no valido para la columna)",
    "22P02": "Tipo de dato invalido (ej. texto donde se esperaba numero)",
    "08006": "Conexion con la BD perdida",
    "08001": "No se pudo conectar a la BD",
    "53300": "Demasiadas conexiones a la BD",
    "57P03": "La BD se esta apagando"
  };

  const explicacion = codigo ? explicaciones[codigo] : null;
  // 5xx para problemas de servidor/DB, 400 para datos invalidos del cliente
  const codigosCliente = ["23505", "23503", "23502", "23514", "22P02"];
  const status = codigosCliente.includes(codigo) ? 400 : 500;

  return {
    status,
    body: {
      error: contextoLabel,
      detalle,
      codigo,
      explicacion,
      hint: err?.hint || null,
      detail: err?.detail || null,
      column: err?.column || null,
      table: err?.table || null,
      constraint: err?.constraint || null
    }
  };
}

/**
 * Middleware global de Express. Captura errores que escapan via next(err)
 * o de async handlers que no fueron capturados manualmente.
 * Debe ser el ULTIMO middleware en la cadena.
 */
function globalErrorMiddleware(err, req, res, _next) {
  console.error(`[GLOBAL ERROR] ${req.method} ${req.path}:`, err);
  if (res.headersSent) return;
  const formatted = formatDbError(err, "Error interno del servidor");
  res.status(formatted.status).json(formatted.body);
}

module.exports = {
  formatDbError,
  globalErrorMiddleware
};
