BEGIN;

-- Empresa base
INSERT INTO empresa (codigo, nombre, activa)
VALUES ('EMP001', 'Librería Demo', true)
ON CONFLICT (codigo) DO NOTHING;

-- Terminal demo para login (compatible con esquemas distintos)
DO $$
DECLARE
  v_empresa_id BIGINT;
BEGIN
  SELECT id INTO v_empresa_id
  FROM empresa
  WHERE codigo = 'EMP001'
  LIMIT 1;

  IF v_empresa_id IS NULL THEN
    RAISE EXCEPTION 'No se encontro EMP001 en empresa';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM terminal t
    WHERE t.empresa_id = v_empresa_id
      AND LOWER(t.nombre) = LOWER('Terminal 1')
  ) THEN
    INSERT INTO terminal (empresa_id, nombre)
    VALUES (v_empresa_id, 'Terminal 1');
  END IF;

  -- Si existen estas columnas en tu esquema, las completa.
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'terminal'
      AND column_name = 'activo'
  ) THEN
    UPDATE terminal
    SET activo = true
    WHERE empresa_id = v_empresa_id
      AND LOWER(nombre) = LOWER('Terminal 1')
      AND activo IS NULL;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'terminal'
      AND column_name = 'descripcion'
  ) THEN
    UPDATE terminal
    SET descripcion = COALESCE(descripcion, 'Terminal de caja principal')
    WHERE empresa_id = v_empresa_id
      AND LOWER(nombre) = LOWER('Terminal 1');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'terminal'
      AND column_name = 'tipo'
  ) THEN
    UPDATE terminal
    SET tipo = COALESCE(tipo, 'POS')
    WHERE empresa_id = v_empresa_id
      AND LOWER(nombre) = LOWER('Terminal 1');
  END IF;
END $$;

COMMIT;

