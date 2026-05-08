const jwt = require('jsonwebtoken');
const { AsyncLocalStorage } = require('node:async_hooks');

const JWT_SECRET = 'stoptop_secret_2024';
const storage = new AsyncLocalStorage();

function extractUserIdFromRequest(req) {
  const candidates = [
    req?.usuario?.id,
    req?.usuario?.usuario_id,
    req?.usuario?.user_id,
    req?.user?.id,
    req?.user?.usuario_id,
    req?.user?.user_id,
    req?.auth?.id,
    req?.usuario_id,
    req?.user_id,
    req?.session?.usuario?.id,
    req?.session?.user?.id,
    req?.session?.usuario_id,
    req?.session?.user_id,
  ];

  for (const candidate of candidates) {
    if (candidate != null && candidate !== '') return candidate;
  }

  return null;
}

function extractToken(req) {
  if (req?.cookies?.token) return req.cookies.token;

  const authHeader = req?.headers?.authorization;
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  return null;
}

function resolveUsuarioId(req) {
  const directId = extractUserIdFromRequest(req);
  if (directId != null) return directId;

  const token = extractToken(req);
  if (!token) return null;

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    return payload?.id ?? null;
  } catch {
    return null;
  }
}

// Middleware "suave" que establece req.usuario si el token existe, SIN rechazar
function softAuthMiddleware(req, _res, next) {
  const token = extractToken(req);
  if (token) {
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      req.usuario = payload;
    } catch {
      // Token invalido, pero no rechazamos, solo continuamos sin usuario
    }
  }
  next();
}

function auditContextMiddleware(req, _res, next) {
  const context = {
    req,
    usuarioId: resolveUsuarioId(req),
  };

  storage.enterWith(context);
  next();
}

function getAuditContext() {
  return storage.getStore() || null;
}

module.exports = {
  auditContextMiddleware,
  softAuthMiddleware,
  getAuditContext,
};