-- Configuracion funcional por alcance (usuario / terminal / empresa)
-- Fecha: 2026-04-18

ALTER TABLE empresa
  ADD COLUMN IF NOT EXISTS controlar_lote BOOLEAN DEFAULT false;

UPDATE empresa
SET controlar_lote = COALESCE(controlar_lote, false)
WHERE controlar_lote IS NULL;

ALTER TABLE empresa
  ALTER COLUMN controlar_lote SET DEFAULT false;

CREATE TABLE IF NOT EXISTS config_feature_catalog (
  feature_key VARCHAR(80) PRIMARY KEY,
  scope VARCHAR(20) NOT NULL CHECK (scope IN ('USUARIO','TERMINAL','EMPRESA')),
  nombre VARCHAR(120) NOT NULL,
  descripcion TEXT,
  default_enabled BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  legacy_column VARCHAR(120),
  depends_on VARCHAR(80),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cfg_feature_scope
  ON config_feature_catalog(scope, sort_order, feature_key);

CREATE TABLE IF NOT EXISTS empresa_feature_config (
  id BIGSERIAL PRIMARY KEY,
  empresa_id INTEGER NOT NULL REFERENCES empresa(id) ON DELETE CASCADE,
  feature_key VARCHAR(80) NOT NULL REFERENCES config_feature_catalog(feature_key) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_empresa_feature_config UNIQUE (empresa_id, feature_key)
);

CREATE INDEX IF NOT EXISTS idx_empresa_feature_empresa
  ON empresa_feature_config(empresa_id);

CREATE INDEX IF NOT EXISTS idx_empresa_feature_key
  ON empresa_feature_config(feature_key);

CREATE TABLE IF NOT EXISTS terminal_feature_config (
  id BIGSERIAL PRIMARY KEY,
  terminal_id INTEGER NOT NULL REFERENCES terminal(id) ON DELETE CASCADE,
  feature_key VARCHAR(80) NOT NULL REFERENCES config_feature_catalog(feature_key) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_terminal_feature_config UNIQUE (terminal_id, feature_key)
);

CREATE INDEX IF NOT EXISTS idx_terminal_feature_terminal
  ON terminal_feature_config(terminal_id);

CREATE INDEX IF NOT EXISTS idx_terminal_feature_key
  ON terminal_feature_config(feature_key);

INSERT INTO config_feature_catalog
  (feature_key, scope, nombre, descripcion, default_enabled, sort_order, active)
VALUES
  (
    'agrupar_item',
    'EMPRESA',
    'Agrupar item',
    'Agrupa en una sola linea los productos repetidos en Compra.',
    false,
    30,
    true
  )
ON CONFLICT (feature_key) DO UPDATE
SET scope = EXCLUDED.scope,
    nombre = EXCLUDED.nombre,
    descripcion = EXCLUDED.descripcion,
    default_enabled = EXCLUDED.default_enabled,
    sort_order = EXCLUDED.sort_order,
    active = true,
    updated_at = NOW();

INSERT INTO empresa_feature_config (empresa_id, feature_key, enabled)
SELECT
  e.id,
  'agrupar_item',
  false
FROM empresa e
ON CONFLICT (empresa_id, feature_key) DO NOTHING;
