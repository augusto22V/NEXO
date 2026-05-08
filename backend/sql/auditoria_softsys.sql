
-- ==========================================================
-- SoftSys - Auditoria centralizada de cambios DML
-- Tabla destino: public.auditoria
-- Acciones: INSERT / UPDATE / DELETE
-- Datos: JSONB (anteriores y nuevos)
-- Usuario: tomado desde current_setting('app.user_id', true)
-- ==========================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.auditoria (
  id bigserial PRIMARY KEY,
  tabla varchar(120) NOT NULL,
  registro_id varchar(80),
  accion varchar(10) NOT NULL CHECK (accion IN ('INSERT', 'UPDATE', 'DELETE')),
  usuario_id integer,
  datos_anteriores jsonb,
  datos_nuevos jsonb,
  fecha timestamp with time zone NOT NULL DEFAULT now()
);

-- Compatibilidad: si la tabla ya existía con registro_id integer, migrar a texto.
DO $$
DECLARE
  v_tipo text;
  v_is_nullable text;
BEGIN
  SELECT data_type
    INTO v_tipo
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'auditoria'
    AND column_name = 'registro_id';

  IF v_tipo IS DISTINCT FROM 'character varying' THEN
    EXECUTE '
      ALTER TABLE public.auditoria
      ALTER COLUMN registro_id TYPE varchar(80)
      USING registro_id::text
    ';
  END IF;

  -- Compatibilidad: permitir NULL en usuario_id (hay endpoints sin auth).
  SELECT is_nullable
    INTO v_is_nullable
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'auditoria'
    AND column_name = 'usuario_id';

  IF v_is_nullable = 'NO' THEN
    EXECUTE '
      ALTER TABLE public.auditoria
      ALTER COLUMN usuario_id DROP NOT NULL
    ';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_auditoria_tabla_fecha
  ON public.auditoria (tabla, fecha DESC);

CREATE INDEX IF NOT EXISTS idx_auditoria_registro
  ON public.auditoria (tabla, registro_id);

CREATE INDEX IF NOT EXISTS idx_auditoria_usuario_fecha
  ON public.auditoria (usuario_id, fecha DESC);

CREATE OR REPLACE FUNCTION public.fn_auditoria_dml()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_usuario_id integer;
  v_pk_col text;
  v_registro_id text;
  v_old jsonb;
  v_new jsonb;
BEGIN
  IF TG_TABLE_NAME = 'auditoria' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  BEGIN
    v_usuario_id := NULLIF(current_setting('app.user_id', true), '')::integer;
  EXCEPTION
    WHEN others THEN
      v_usuario_id := NULL;
  END;

  SELECT a.attname
    INTO v_pk_col
  FROM pg_index i
  JOIN pg_attribute a
    ON a.attrelid = i.indrelid
   AND a.attnum = ANY(i.indkey)
  WHERE i.indrelid = TG_RELID
    AND i.indisprimary
  ORDER BY a.attnum
  LIMIT 1;

  IF TG_OP = 'INSERT' THEN
    v_new := to_jsonb(NEW);
    v_registro_id := COALESCE(v_new ->> v_pk_col, NULL);
    v_usuario_id := COALESCE(
      v_usuario_id,
      CASE
        WHEN COALESCE(v_new ->> 'usuario_id', '') ~ '^[0-9]+$'
          THEN (v_new ->> 'usuario_id')::integer
        ELSE NULL
      END
    );

    INSERT INTO public.auditoria (tabla, registro_id, accion, usuario_id, datos_nuevos)
    VALUES (TG_TABLE_NAME, v_registro_id::varchar(80), 'INSERT', v_usuario_id, v_new);
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);

    IF v_old = v_new THEN
      RETURN NEW;
    END IF;

    v_registro_id := COALESCE(v_new ->> v_pk_col, v_old ->> v_pk_col, NULL);
    v_usuario_id := COALESCE(
      v_usuario_id,
      CASE
        WHEN COALESCE(v_new ->> 'usuario_id', '') ~ '^[0-9]+$'
          THEN (v_new ->> 'usuario_id')::integer
        ELSE NULL
      END,
      CASE
        WHEN COALESCE(v_old ->> 'usuario_id', '') ~ '^[0-9]+$'
          THEN (v_old ->> 'usuario_id')::integer
        ELSE NULL
      END
    );

    INSERT INTO public.auditoria (tabla, registro_id, accion, usuario_id, datos_anteriores, datos_nuevos)
    VALUES (TG_TABLE_NAME, v_registro_id::varchar(80), 'UPDATE', v_usuario_id, v_old, v_new);
    RETURN NEW;
  END IF;

  v_old := to_jsonb(OLD);
  v_registro_id := COALESCE(v_old ->> v_pk_col, NULL);
  v_usuario_id := COALESCE(
    v_usuario_id,
    CASE
      WHEN COALESCE(v_old ->> 'usuario_id', '') ~ '^[0-9]+$'
        THEN (v_old ->> 'usuario_id')::integer
      ELSE NULL
    END
  );

  INSERT INTO public.auditoria (tabla, registro_id, accion, usuario_id, datos_anteriores)
  VALUES (TG_TABLE_NAME, v_registro_id::varchar(80), 'DELETE', v_usuario_id, v_old);

  RETURN OLD;
END;
$$;

DO $$
DECLARE
  r record;
  v_trigger_name text;
BEGIN
  FOR r IN
    SELECT schemaname, tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename <> 'auditoria'
  LOOP
    v_trigger_name := 'trg_auditoria_dml';

    EXECUTE format(
      'DROP TRIGGER IF EXISTS %I ON %I.%I',
      v_trigger_name,
      r.schemaname,
      r.tablename
    );

    EXECUTE format(
      'CREATE TRIGGER %I
         AFTER INSERT OR UPDATE OR DELETE
         ON %I.%I
         FOR EACH ROW
         EXECUTE FUNCTION public.fn_auditoria_dml()',
      v_trigger_name,
      r.schemaname,
      r.tablename
    );
  END LOOP;
END $$;

COMMIT;



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
