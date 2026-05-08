-- =========================
-- AGREGAR COLUMNAS
-- =========================
ALTER TABLE condicion_pago
  ADD COLUMN IF NOT EXISTS codigo integer,
  ADD COLUMN IF NOT EXISTS descripcion varchar(120),
  ADD COLUMN IF NOT EXISTS cuotas integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS dias_intervalo integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS activo boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS created_at timestamp without time zone DEFAULT now();

-- =========================
-- SI EXISTE cantidad_cuotas → MIGRAR A cuotas
-- =========================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name='condicion_pago' AND column_name='cantidad_cuotas'
  ) THEN

    -- Copiar datos
    UPDATE condicion_pago
    SET cuotas = cantidad_cuotas
    WHERE cuotas IS NULL;

    -- Eliminar columna vieja
    ALTER TABLE condicion_pago DROP COLUMN cantidad_cuotas;

  END IF;
END$$;

-- =========================
-- NORMALIZAR DATOS
-- =========================
UPDATE condicion_pago
SET codigo = id
WHERE codigo IS NULL;

UPDATE condicion_pago
SET descripcion = CONCAT('CONDICION ', id)
WHERE descripcion IS NULL;

UPDATE condicion_pago
SET cuotas = 1
WHERE cuotas IS NULL;

UPDATE condicion_pago
SET dias_intervalo = 0
WHERE dias_intervalo IS NULL;

UPDATE condicion_pago
SET activo = true
WHERE activo IS NULL;

UPDATE condicion_pago
SET created_at = now()
WHERE created_at IS NULL;

-- =========================
-- NOT NULL
-- =========================
ALTER TABLE condicion_pago
  ALTER COLUMN codigo SET NOT NULL,
  ALTER COLUMN descripcion SET NOT NULL,
  ALTER COLUMN cuotas SET NOT NULL,
  ALTER COLUMN dias_intervalo SET NOT NULL,
  ALTER COLUMN activo SET NOT NULL,
  ALTER COLUMN created_at SET NOT NULL;

-- =========================
-- CONSTRAINTS
-- =========================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'condicion_pago_codigo_unique'
  ) THEN
    ALTER TABLE condicion_pago
    ADD CONSTRAINT condicion_pago_codigo_unique UNIQUE (codigo);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'condicion_pago_descripcion_unique'
  ) THEN
    ALTER TABLE condicion_pago
    ADD CONSTRAINT condicion_pago_descripcion_unique UNIQUE (descripcion);
  END IF;
END$$;
-- =========================
-- CONTROL DE LICENCIA POS (NUMERICO)
-- =========================
CREATE TABLE IF NOT EXISTS control_licencia (
  id bigserial PRIMARY KEY,
  empresa_id integer NOT NULL UNIQUE REFERENCES empresa(id) ON DELETE CASCADE,
  id_interno integer NOT NULL CHECK (id_interno > 0),
  fecha_vencimiento date NOT NULL,
  control_actual bigint,
  control_actual_ts timestamp without time zone,
  updated_at timestamp without time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_control_licencia_vencimiento
  ON control_licencia (fecha_vencimiento);

INSERT INTO control_licencia (empresa_id, id_interno, fecha_vencimiento)
SELECT e.id, (1000 + e.id), (CURRENT_DATE + INTERVAL '30 days')::date
FROM empresa e
WHERE NOT EXISTS (
  SELECT 1 FROM control_licencia c WHERE c.empresa_id = e.id
);
