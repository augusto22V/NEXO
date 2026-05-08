-- Evolucion incremental de caja por terminal + sesiones de cajero.
-- Script idempotente: no elimina tablas ni columnas existentes.

ALTER TABLE caja ADD COLUMN IF NOT EXISTS terminal_id BIGINT;
ALTER TABLE caja_movimiento ADD COLUMN IF NOT EXISTS usuario_id BIGINT;
ALTER TABLE caja_movimiento ADD COLUMN IF NOT EXISTS caja_sesion_id BIGINT;
ALTER TABLE caja_sesiones ADD COLUMN IF NOT EXISTS terminal_id BIGINT;
ALTER TABLE caja_sesiones ADD COLUMN IF NOT EXISTS usuario_cierre BIGINT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_caja_terminal'
  ) THEN
    ALTER TABLE caja
      ADD CONSTRAINT fk_caja_terminal
      FOREIGN KEY (terminal_id) REFERENCES terminal(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_caja_movimiento_usuario'
  ) THEN
    ALTER TABLE caja_movimiento
      ADD CONSTRAINT fk_caja_movimiento_usuario
      FOREIGN KEY (usuario_id) REFERENCES usuario(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_caja_movimiento_sesion'
  ) THEN
    ALTER TABLE caja_movimiento
      ADD CONSTRAINT fk_caja_movimiento_sesion
      FOREIGN KEY (caja_sesion_id) REFERENCES caja_sesiones(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_caja_sesiones_terminal'
  ) THEN
    ALTER TABLE caja_sesiones
      ADD CONSTRAINT fk_caja_sesiones_terminal
      FOREIGN KEY (terminal_id) REFERENCES terminal(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_caja_sesiones_usuario_cierre'
  ) THEN
    ALTER TABLE caja_sesiones
      ADD CONSTRAINT fk_caja_sesiones_usuario_cierre
      FOREIGN KEY (usuario_cierre) REFERENCES usuario(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_caja_terminal_estado_fecha
  ON caja(terminal_id, estado, fecha_apertura DESC);

CREATE INDEX IF NOT EXISTS idx_caja_movimiento_usuario_fecha
  ON caja_movimiento(usuario_id, fecha DESC);

CREATE INDEX IF NOT EXISTS idx_caja_movimiento_sesion
  ON caja_movimiento(caja_sesion_id);

CREATE INDEX IF NOT EXISTS idx_caja_sesiones_terminal_estado_fecha
  ON caja_sesiones(terminal_id, estado, fecha_apertura DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_caja_terminal_abierta
  ON caja(terminal_id)
  WHERE terminal_id IS NOT NULL AND UPPER(estado) = 'ABIERTA';
