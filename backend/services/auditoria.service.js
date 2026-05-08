const db = require("../db");

let schemaPromise = null;

function normalizeTableName(value) {
  const tableName = String(value || "").trim().toLowerCase();
  if (!/^[a-z_][a-z0-9_]*$/i.test(tableName)) {
    throw new Error("Nombre de tabla invalido para auditoria");
  }
  return tableName;
}

async function ensureAuditoriaSchema() {
  if (schemaPromise) return schemaPromise;

  schemaPromise = (async () => {
    await db.query(`
      CREATE TABLE IF NOT EXISTS public.auditoria (
        id bigserial PRIMARY KEY,
        tabla varchar(120) NOT NULL,
        registro_id varchar(80),
        accion varchar(10) NOT NULL CHECK (accion IN ('INSERT', 'UPDATE', 'DELETE')),
        usuario_id integer,
        datos_anteriores jsonb,
        datos_nuevos jsonb,
        fecha timestamp with time zone NOT NULL DEFAULT now()
      )
    `);

    await db.query(`
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
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_auditoria_tabla_fecha
      ON public.auditoria (tabla, fecha DESC)
    `);
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_auditoria_registro
      ON public.auditoria (tabla, registro_id)
    `);
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_auditoria_usuario_fecha
      ON public.auditoria (usuario_id, fecha DESC)
    `);

    await db.query(`
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
    `);

    await db.query(`
      DO $$
      DECLARE
        r record;
      BEGIN
        FOR r IN
          SELECT schemaname, tablename
          FROM pg_tables
          WHERE schemaname = 'public'
            AND tablename <> 'auditoria'
        LOOP
          EXECUTE format(
            'DROP TRIGGER IF EXISTS %I ON %I.%I',
            'trg_auditoria_dml',
            r.schemaname,
            r.tablename
          );

          EXECUTE format(
            'CREATE TRIGGER %I
               AFTER INSERT OR UPDATE OR DELETE
               ON %I.%I
               FOR EACH ROW
               EXECUTE FUNCTION public.fn_auditoria_dml()',
            'trg_auditoria_dml',
            r.schemaname,
            r.tablename
          );
        END LOOP;
      END $$;
    `);
  })();

  try {
    await schemaPromise;
  } catch (error) {
    schemaPromise = null;
    throw error;
  }
}

async function ensureAuditoriaTriggerForTable(tableName) {
  const safeTableName = normalizeTableName(tableName);
  await ensureAuditoriaSchema();

  await db.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM pg_tables
        WHERE schemaname = 'public'
          AND tablename = '${safeTableName}'
      ) THEN
        EXECUTE 'DROP TRIGGER IF EXISTS trg_auditoria_dml ON public.${safeTableName}';
        EXECUTE 'CREATE TRIGGER trg_auditoria_dml
                   AFTER INSERT OR UPDATE OR DELETE
                   ON public.${safeTableName}
                   FOR EACH ROW
                   EXECUTE FUNCTION public.fn_auditoria_dml()';
      END IF;
    END $$;
  `);
}

module.exports = {
  ensureAuditoriaSchema,
  ensureAuditoriaTriggerForTable,
};
