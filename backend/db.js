const { Pool } = require('pg');
const { getAuditContext } = require('./middlewares/auditContext.middleware');

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'libreria_sys',
    password: '12345',
    port: 5432,
});

function extractUserIdFromRequestContext(req) {
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

function toAuditUserId(rawUserId) {
  if (rawUserId == null) return null;
  const parsed = Number(rawUserId);
  return Number.isFinite(parsed) ? String(parsed) : null;
}

function getUserIdForAudit() {
  const context = getAuditContext();
  const rawUserId = extractUserIdFromRequestContext(context?.req) ?? context?.usuarioId;
  return toAuditUserId(rawUserId);
}

function isDmlQuery(sqlText) {
  if (typeof sqlText !== 'string') return false;
  const normalized = sqlText.trim().toLowerCase();
  return (
    normalized.startsWith('insert ') ||
    normalized.startsWith('update ') ||
    normalized.startsWith('delete ')
  );
}

async function setAuditUserOnConnection(queryFn, userId) {
  await queryFn("SELECT set_config('app.user_id', $1, false)", [userId]);
}

function patchQueryMethod(target, { isPool = false } = {}) {
  const originalQuery = target.query.bind(target);

  target.query = (...args) => {
    // Mantener compatibilidad con callbacks legacy
    if (args.some((a) => typeof a === 'function')) {
      return originalQuery(...args);
    }

    const userId = getUserIdForAudit();
    const [text] = args;

    const sqlText =
      typeof text === 'string'
        ? text
        : text && typeof text === 'object' && typeof text.text === 'string'
          ? text.text
          : null;

    if (!userId || !isDmlQuery(sqlText)) {
      return originalQuery(...args);
    }

    if (isPool) {
      return (async () => {
        const client = await target.connect();
        try {
          return await client.query(...args);
        } finally {
          client.release();
        }
      })();
    }

    return (async () => {
      await setAuditUserOnConnection(originalQuery, userId);
      return originalQuery(...args);
    })();
  };
}

patchQueryMethod(pool, { isPool: true });

const originalConnect = pool.connect.bind(pool);
pool.connect = (...args) => {
  if (typeof args[0] === 'function') {
    const userCallback = args[0];
    return originalConnect((err, client, done) => {
      if (client && !client.__auditQueryPatched) {
        patchQueryMethod(client, { isPool: false });
        client.__auditQueryPatched = true;
      }
      userCallback(err, client, done);
    });
  }

  const maybePromise = originalConnect(...args);
  if (!maybePromise || typeof maybePromise.then !== 'function') {
    return maybePromise;
  }

  return maybePromise.then((client) => {
    if (client && !client.__auditQueryPatched) {
      patchQueryMethod(client, { isPool: false });
      client.__auditQueryPatched = true;
    }
    return client;
  });
};

module.exports = pool;