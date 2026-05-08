-- Permisos finos por usuario para VentaRapida.
-- Script idempotente.

CREATE TABLE IF NOT EXISTS usuario_permiso_accion (
  id BIGSERIAL PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
  permiso VARCHAR(80) NOT NULL,
  permitido BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_usuario_permiso_accion UNIQUE (usuario_id, permiso)
);

CREATE INDEX IF NOT EXISTS idx_usuario_permiso_usuario
  ON usuario_permiso_accion(usuario_id);

CREATE INDEX IF NOT EXISTS idx_usuario_permiso_permiso
  ON usuario_permiso_accion(permiso);

WITH permisos AS (
  SELECT unnest(ARRAY[
    'venta_rapida_ver',
    'venta_rapida_nueva',
    'venta_rapida_cancelar',
    'venta_rapida_imprimir_preparo',
    'venta_rapida_efectivizar',
    'venta_rapida_imprimir_venta'
  ]::text[]) AS permiso
)
INSERT INTO usuario_permiso_accion (usuario_id, permiso, permitido)
SELECT u.id, p.permiso, TRUE
FROM usuario u
CROSS JOIN permisos p
ON CONFLICT (usuario_id, permiso) DO NOTHING;
