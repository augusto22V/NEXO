BEGIN;

ALTER TABLE venta
  ADD COLUMN IF NOT EXISTS en_espera_desde TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS en_espera_por_usuario_id BIGINT REFERENCES usuario(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS prioridad_espera SMALLINT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS nota_espera TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ck_venta_estado_flex'
  ) THEN
    ALTER TABLE venta
      ADD CONSTRAINT ck_venta_estado_flex
      CHECK (estado IN ('PENDIENTE', 'EN_ESPERA', 'CONCLUIDO', 'EFECTIVADO', 'CANCELADO', 'FACTURADO'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_venta_estado_fecha ON venta(estado, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_venta_espera_fecha ON venta(en_espera_desde DESC) WHERE estado = 'EN_ESPERA';

COMMIT;
