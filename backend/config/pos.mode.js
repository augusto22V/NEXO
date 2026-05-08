/**
 * Modo POS retail (librería / útiles / servicios).
 * Variables opcionales en .env:
 *   POS_SIN_COCINA=1|false    — desactiva bloqueos y flujo cocina (default: activado / sin cocina)
 *   POS_SIN_TIPO_PEDIDO=1|false — ventas sin tipo de pedido obligatorio (default: activado)
 */

function envFlag(name, defaultTrue = true) {
  const v = process.env[name];
  if (v == null || String(v).trim() === "") return defaultTrue;

  const s = String(v).trim().toLowerCase();
  if (["0", "false", "no", "off"].includes(s)) return false;
  if (["1", "true", "yes", "on"].includes(s)) return true;

  return defaultTrue;
}

module.exports = {
  POS_SIN_COCINA: envFlag("POS_SIN_COCINA", true),
  POS_SIN_TIPO_PEDIDO: envFlag("POS_SIN_TIPO_PEDIDO", true)
};
