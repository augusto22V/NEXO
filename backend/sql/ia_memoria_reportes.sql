CREATE TABLE IF NOT EXISTS ia_user_memory (
  user_id BIGINT PRIMARY KEY,
  ultimo_modulo VARCHAR(20),
  ultimo_cliente VARCHAR(160),
  ultimo_vendedor VARCHAR(160),
  ultimo_tipo_consulta VARCHAR(20),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ia_user_query_history (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL,
  consulta_texto TEXT NOT NULL,
  consulta_expandida TEXT,
  interpretacion JSONB NOT NULL DEFAULT '{}'::jsonb,
  contexto_selector VARCHAR(20),
  modulo_aplicado VARCHAR(20),
  tipo_consulta VARCHAR(20),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ia_user_query_history_user_created
  ON ia_user_query_history (user_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_ia_user_query_history_modulo
  ON ia_user_query_history (modulo_aplicado, created_at DESC);

-- Limpieza recomendada por retencion temporal (6 meses):
-- DELETE FROM ia_user_query_history
-- WHERE created_at < NOW() - INTERVAL '180 days';

-- Limpieza recomendada por limite de filas por usuario (ej: 1200):
-- DELETE FROM ia_user_query_history
-- WHERE user_id = :user_id
--   AND id IN (
--     SELECT id
--     FROM ia_user_query_history
--     WHERE user_id = :user_id
--     ORDER BY created_at DESC, id DESC
--     OFFSET 1200
--   );
