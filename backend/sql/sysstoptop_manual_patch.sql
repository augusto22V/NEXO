-- SysStoptop manual patch
-- Uso recomendado en pgAdmin cuando la base esta atrasada frente al codigo actual.
-- Este archivo cubre los puntos que no estaban totalmente resueltos por los scripts
-- existentes o por los ensure* del backend.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Normalizar tipo_operacion al esquema que espera el codigo actual.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_bad_count integer;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'tipo_operacion'
      AND column_name = 'codigo'
      AND data_type <> 'integer'
  ) THEN
    SELECT COUNT(*)
      INTO v_bad_count
    FROM tipo_operacion
    WHERE codigo IS NOT NULL
      AND NULLIF(REGEXP_REPLACE(codigo::text, '[^0-9]', '', 'g'), '') IS NULL;

    IF v_bad_count > 0 THEN
      RAISE EXCEPTION
        'No se pudo convertir tipo_operacion.codigo a integer. Revise % registro(s) con codigo no numerico.',
        v_bad_count;
    END IF;

    ALTER TABLE tipo_operacion
      ALTER COLUMN codigo TYPE integer
      USING NULLIF(REGEXP_REPLACE(codigo::text, '[^0-9]', '', 'g'), '')::integer;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'tipo_operacion'
      AND column_name = 'descripcion'
      AND (data_type <> 'character varying' OR character_maximum_length IS DISTINCT FROM 120)
  ) THEN
    ALTER TABLE tipo_operacion
      ALTER COLUMN descripcion TYPE varchar(120)
      USING LEFT(TRIM(COALESCE(descripcion::text, '')), 120);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'tipo_operacion'
      AND column_name = 'tipo'
      AND (data_type <> 'character' OR udt_name <> 'bpchar')
  ) THEN
    ALTER TABLE tipo_operacion
      ALTER COLUMN tipo TYPE char(1)
      USING LEFT(UPPER(TRIM(COALESCE(tipo::text, 'E'))), 1)::char(1);
  END IF;
END $$;

UPDATE tipo_operacion
SET
  codigo = COALESCE(codigo, id),
  descripcion = COALESCE(NULLIF(BTRIM(descripcion), ''), CONCAT('OPERACION ', COALESCE(codigo, id))),
  tipo = CASE
           WHEN UPPER(TRIM(COALESCE(tipo::text, ''))) = 'S' THEN 'S'
           ELSE 'E'
         END,
  afecta_stock = COALESCE(afecta_stock, false),
  requiere_confirmacion = COALESCE(requiere_confirmacion, false),
  genera_financiero = COALESCE(genera_financiero, false),
  permite_credito = COALESCE(permite_credito, false),
  requiere_credito = COALESCE(requiere_credito, false),
  activo = COALESCE(activo, true);

ALTER TABLE tipo_operacion
  ALTER COLUMN codigo SET NOT NULL,
  ALTER COLUMN descripcion SET NOT NULL,
  ALTER COLUMN tipo SET NOT NULL,
  ALTER COLUMN afecta_stock SET DEFAULT false,
  ALTER COLUMN requiere_confirmacion SET DEFAULT false,
  ALTER COLUMN genera_financiero SET DEFAULT false,
  ALTER COLUMN permite_credito SET DEFAULT false,
  ALTER COLUMN requiere_credito SET DEFAULT false,
  ALTER COLUMN activo SET DEFAULT true;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'idx_tipo_operacion_codigo_uq'
  ) AND NOT EXISTS (
    SELECT 1
    FROM tipo_operacion
    GROUP BY codigo
    HAVING COUNT(*) > 1
  ) THEN
    CREATE UNIQUE INDEX idx_tipo_operacion_codigo_uq
      ON tipo_operacion(codigo);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Tabla de precios por cantidad para productos.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS producto_precio_cantidad (
  id BIGSERIAL PRIMARY KEY,
  producto_id INTEGER NOT NULL REFERENCES producto(id) ON DELETE CASCADE,
  orden SMALLINT NOT NULL CHECK (orden BETWEEN 1 AND 4),
  cantidad NUMERIC(18,6),
  porcentaje_valor NUMERIC(9,4),
  valor NUMERIC(18,6),
  actualizado_en TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE (producto_id, orden)
);

CREATE INDEX IF NOT EXISTS idx_producto_precio_cantidad_producto
  ON producto_precio_cantidad(producto_id);

-- ---------------------------------------------------------------------------
-- 3. Tablas auxiliares de auditoria de comisiones.
--    Se dejan idempotentes y compatibles con el codigo/reportes actuales.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vendedor_comision_cambios (
  id BIGSERIAL PRIMARY KEY,
  vendedor_id BIGINT NOT NULL REFERENCES vendedor(id) ON DELETE CASCADE,
  tipo_comision_anterior VARCHAR(20),
  tipo_comision_nuevo VARCHAR(20) NOT NULL,
  tipo_calculo_anterior VARCHAR(20),
  tipo_calculo_nuevo VARCHAR(20) NOT NULL,
  porcentaje_ventas_anterior NUMERIC(12,2),
  porcentaje_ventas_nuevo NUMERIC(12,2) NOT NULL,
  porcentaje_servicios_anterior NUMERIC(12,2),
  porcentaje_servicios_nuevo NUMERIC(12,2) NOT NULL,
  comision_por_cantidad_anterior BOOLEAN,
  comision_por_cantidad_nueva BOOLEAN NOT NULL,
  observaciones TEXT,
  fecha_cambio TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  usuario_id BIGINT REFERENCES usuario(id) ON DELETE SET NULL,
  CONSTRAINT chk_vcc_porcentaje_ventas_nuevo CHECK (porcentaje_ventas_nuevo >= 0),
  CONSTRAINT chk_vcc_porcentaje_servicios_nuevo CHECK (porcentaje_servicios_nuevo >= 0)
);

CREATE INDEX IF NOT EXISTS idx_vendedor_comision_cambios_vendedor_fecha
  ON vendedor_comision_cambios(vendedor_id, fecha_cambio DESC);

CREATE INDEX IF NOT EXISTS idx_vendedor_comision_cambios_fecha
  ON vendedor_comision_cambios(fecha_cambio DESC);

CREATE TABLE IF NOT EXISTS vendedor_comision_pago (
  id BIGSERIAL PRIMARY KEY,
  vendedor_id BIGINT NOT NULL REFERENCES vendedor(id) ON DELETE CASCADE,
  venta_id BIGINT NOT NULL REFERENCES venta(id) ON DELETE CASCADE,
  comision_calculada NUMERIC(14,2) NOT NULL,
  comision_pagada NUMERIC(14,2) DEFAULT 0,
  estado VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
  fecha_venta DATE NOT NULL,
  fecha_registro TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fecha_pago TIMESTAMPTZ,
  usuario_registro_id BIGINT REFERENCES usuario(id) ON DELETE SET NULL,
  usuario_pago_id BIGINT REFERENCES usuario(id) ON DELETE SET NULL,
  observaciones TEXT,
  CONSTRAINT chk_vcp_comision_calculada_positiva CHECK (comision_calculada >= 0),
  CONSTRAINT chk_vcp_comision_pagada_positiva CHECK (comision_pagada >= 0),
  CONSTRAINT chk_vcp_comision_pagada_no_mayor CHECK (comision_pagada <= comision_calculada),
  CONSTRAINT uq_vendedor_venta_comision UNIQUE (vendedor_id, venta_id)
);

CREATE INDEX IF NOT EXISTS idx_vendedor_comision_pago_vendedor_fecha
  ON vendedor_comision_pago(vendedor_id, fecha_venta DESC);

CREATE INDEX IF NOT EXISTS idx_vendedor_comision_pago_estado_fecha
  ON vendedor_comision_pago(estado, fecha_pago DESC);

CREATE INDEX IF NOT EXISTS idx_vendedor_comision_pago_venta
  ON vendedor_comision_pago(venta_id);

CREATE TABLE IF NOT EXISTS vendedor_comision_resumen_diario (
  id BIGSERIAL PRIMARY KEY,
  vendedor_id BIGINT NOT NULL REFERENCES vendedor(id) ON DELETE CASCADE,
  fecha_venta DATE NOT NULL,
  cantidad_ventas INTEGER NOT NULL DEFAULT 0,
  total_ventas NUMERIC(14,2) NOT NULL DEFAULT 0,
  comision_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  comision_promedio_por_venta NUMERIC(14,2) NOT NULL DEFAULT 0,
  fecha_calculo TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_vendedor_comision_resumen_diario UNIQUE (vendedor_id, fecha_venta)
);

CREATE INDEX IF NOT EXISTS idx_vendedor_comision_resumen_diario_vendedor_fecha
  ON vendedor_comision_resumen_diario(vendedor_id, fecha_venta DESC);

-- ---------------------------------------------------------------------------
-- 4. Menu digital: esquema base para clientes muy atrasados.
--    Incluye tablas, columnas de apoyo en categoria/producto e indices.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS menu_digital_config (
  id BIGSERIAL PRIMARY KEY,
  empresa_id INTEGER NOT NULL REFERENCES empresa(id) ON DELETE CASCADE,
  terminal_id INTEGER NOT NULL REFERENCES terminal(id) ON DELETE CASCADE,
  slug VARCHAR(160) NOT NULL UNIQUE,
  nombre_publico VARCHAR(180) NOT NULL,
  estado VARCHAR(20) NOT NULL DEFAULT 'BORRADOR',
  mensaje_principal TEXT NULL,
  mensaje_secundario TEXT NULL,
  horario_atencion VARCHAR(180) NULL,
  datos_contacto TEXT NULL,
  color_principal VARCHAR(20) NOT NULL DEFAULT '#147696',
  color_secundario VARCHAR(20) NOT NULL DEFAULT '#E6F1F4',
  fondo_tipo VARCHAR(20) NOT NULL DEFAULT 'gradient',
  fondo_valor TEXT NULL,
  public_base_url TEXT NULL,
  fondo_imagen_url TEXT NULL,
  banner_url TEXT NULL,
  logo_url TEXT NULL,
  usar_logo_empresa BOOLEAN NOT NULL DEFAULT true,
  layout_categorias VARCHAR(20) NOT NULL DEFAULT 'tabs',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS menu_digital_categoria (
  id BIGSERIAL PRIMARY KEY,
  menu_id BIGINT NOT NULL REFERENCES menu_digital_config(id) ON DELETE CASCADE,
  nombre VARCHAR(140) NOT NULL,
  descripcion TEXT NULL,
  color VARCHAR(20) NOT NULL DEFAULT '#147696',
  icono VARCHAR(80) NOT NULL DEFAULT 'fa-utensils',
  imagen_url TEXT NULL,
  orden INTEGER NOT NULL DEFAULT 0,
  activo BOOLEAN NOT NULL DEFAULT true,
  visible_publico BOOLEAN NOT NULL DEFAULT true,
  agotado BOOLEAN NOT NULL DEFAULT false,
  origen_tipo VARCHAR(20) NOT NULL DEFAULT 'manual',
  origen_categoria_id INTEGER NULL REFERENCES categoria(id) ON DELETE SET NULL,
  sincronizado BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS menu_digital_item (
  id BIGSERIAL PRIMARY KEY,
  menu_id BIGINT NOT NULL REFERENCES menu_digital_config(id) ON DELETE CASCADE,
  categoria_id BIGINT NULL REFERENCES menu_digital_categoria(id) ON DELETE SET NULL,
  nombre VARCHAR(180) NOT NULL,
  descripcion TEXT NULL,
  precio NUMERIC(14,2) NOT NULL DEFAULT 0,
  imagen_url TEXT NULL,
  disponible BOOLEAN NOT NULL DEFAULT true,
  visible_publico BOOLEAN NOT NULL DEFAULT true,
  destacado BOOLEAN NOT NULL DEFAULT false,
  agotado BOOLEAN NOT NULL DEFAULT false,
  orden INTEGER NOT NULL DEFAULT 0,
  origen_tipo VARCHAR(20) NOT NULL DEFAULT 'manual',
  origen_producto_id INTEGER NULL REFERENCES producto(id) ON DELETE SET NULL,
  origen_categoria_id INTEGER NULL REFERENCES categoria(id) ON DELETE SET NULL,
  sincronizado BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE menu_digital_config
  ADD COLUMN IF NOT EXISTS empresa_id INTEGER,
  ADD COLUMN IF NOT EXISTS terminal_id INTEGER,
  ADD COLUMN IF NOT EXISTS slug VARCHAR(160),
  ADD COLUMN IF NOT EXISTS nombre_publico VARCHAR(180),
  ADD COLUMN IF NOT EXISTS estado VARCHAR(20) DEFAULT 'BORRADOR',
  ADD COLUMN IF NOT EXISTS mensaje_principal TEXT,
  ADD COLUMN IF NOT EXISTS mensaje_secundario TEXT,
  ADD COLUMN IF NOT EXISTS horario_atencion VARCHAR(180),
  ADD COLUMN IF NOT EXISTS datos_contacto TEXT,
  ADD COLUMN IF NOT EXISTS color_principal VARCHAR(20) DEFAULT '#147696',
  ADD COLUMN IF NOT EXISTS color_secundario VARCHAR(20) DEFAULT '#E6F1F4',
  ADD COLUMN IF NOT EXISTS fondo_tipo VARCHAR(20) DEFAULT 'gradient',
  ADD COLUMN IF NOT EXISTS fondo_valor TEXT,
  ADD COLUMN IF NOT EXISTS public_base_url TEXT,
  ADD COLUMN IF NOT EXISTS fondo_imagen_url TEXT,
  ADD COLUMN IF NOT EXISTS banner_url TEXT,
  ADD COLUMN IF NOT EXISTS logo_url TEXT,
  ADD COLUMN IF NOT EXISTS usar_logo_empresa BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS layout_categorias VARCHAR(20) DEFAULT 'tabs',
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE menu_digital_categoria
  ADD COLUMN IF NOT EXISTS menu_id BIGINT,
  ADD COLUMN IF NOT EXISTS nombre VARCHAR(140),
  ADD COLUMN IF NOT EXISTS descripcion TEXT,
  ADD COLUMN IF NOT EXISTS color VARCHAR(20) DEFAULT '#147696',
  ADD COLUMN IF NOT EXISTS icono VARCHAR(80) DEFAULT 'fa-utensils',
  ADD COLUMN IF NOT EXISTS imagen_url TEXT,
  ADD COLUMN IF NOT EXISTS orden INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS activo BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS visible_publico BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS agotado BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS origen_tipo VARCHAR(20) DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS origen_categoria_id INTEGER,
  ADD COLUMN IF NOT EXISTS sincronizado BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE menu_digital_item
  ADD COLUMN IF NOT EXISTS menu_id BIGINT,
  ADD COLUMN IF NOT EXISTS categoria_id BIGINT,
  ADD COLUMN IF NOT EXISTS nombre VARCHAR(180),
  ADD COLUMN IF NOT EXISTS descripcion TEXT,
  ADD COLUMN IF NOT EXISTS precio NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS imagen_url TEXT,
  ADD COLUMN IF NOT EXISTS disponible BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS visible_publico BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS destacado BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS agotado BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS orden INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS origen_tipo VARCHAR(20) DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS origen_producto_id INTEGER,
  ADD COLUMN IF NOT EXISTS origen_categoria_id INTEGER,
  ADD COLUMN IF NOT EXISTS sincronizado BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE producto
  ADD COLUMN IF NOT EXISTS mostrar_menu_digital BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE categoria
  ADD COLUMN IF NOT EXISTS mostrar_menu_digital BOOLEAN NOT NULL DEFAULT false;

UPDATE producto
SET mostrar_menu_digital = COALESCE(mostrar_menu_digital, false);

UPDATE categoria
SET mostrar_menu_digital = COALESCE(mostrar_menu_digital, false);

UPDATE menu_digital_config
SET
  slug = CASE
           WHEN NULLIF(BTRIM(slug), '') IS NOT NULL THEN BTRIM(slug)
           WHEN empresa_id IS NOT NULL AND terminal_id IS NOT NULL THEN CONCAT('menu-', empresa_id, '-', terminal_id)
           ELSE CONCAT('menu-config-', id)
         END,
  nombre_publico = COALESCE(NULLIF(BTRIM(nombre_publico), ''), 'Menu Digital'),
  estado = CASE
             WHEN UPPER(BTRIM(COALESCE(estado, ''))) IN ('BORRADOR', 'PUBLICADO', 'OCULTO')
               THEN UPPER(BTRIM(estado))
             ELSE 'BORRADOR'
           END,
  mensaje_principal = COALESCE(mensaje_principal, ''),
  mensaje_secundario = COALESCE(mensaje_secundario, ''),
  horario_atencion = COALESCE(horario_atencion, ''),
  datos_contacto = COALESCE(datos_contacto, ''),
  color_principal = COALESCE(NULLIF(BTRIM(color_principal), ''), '#147696'),
  color_secundario = COALESCE(NULLIF(BTRIM(color_secundario), ''), '#E6F1F4'),
  fondo_tipo = CASE
                 WHEN LOWER(BTRIM(COALESCE(fondo_tipo, ''))) IN ('gradient', 'solid', 'imagen')
                   THEN LOWER(BTRIM(fondo_tipo))
                 ELSE 'gradient'
               END,
  fondo_valor = COALESCE(
    NULLIF(fondo_valor, ''),
    'linear-gradient(135deg, #f5f7f9 0%, #edf2f5 48%, #e2ebf0 100%)'
  ),
  usar_logo_empresa = COALESCE(usar_logo_empresa, true),
  layout_categorias = CASE
                        WHEN LOWER(BTRIM(COALESCE(layout_categorias, ''))) IN ('tabs', 'botones', 'lista')
                          THEN LOWER(BTRIM(layout_categorias))
                        ELSE 'tabs'
                      END,
  created_at = COALESCE(created_at, NOW()),
  updated_at = COALESCE(updated_at, NOW());

UPDATE menu_digital_config m
SET nombre_publico = COALESCE(NULLIF(BTRIM(e.nombre), ''), 'Menu Digital')
FROM empresa e
WHERE e.id = m.empresa_id
  AND BTRIM(COALESCE(m.nombre_publico, '')) IN ('', 'Menu Digital');

UPDATE menu_digital_categoria
SET
  nombre = COALESCE(NULLIF(BTRIM(nombre), ''), CONCAT('CATEGORIA ', id)),
  descripcion = COALESCE(descripcion, ''),
  color = COALESCE(NULLIF(BTRIM(color), ''), '#147696'),
  icono = COALESCE(NULLIF(BTRIM(icono), ''), 'fa-utensils'),
  orden = COALESCE(orden, 0),
  activo = COALESCE(activo, true),
  visible_publico = COALESCE(visible_publico, true),
  agotado = COALESCE(agotado, false),
  origen_tipo = COALESCE(NULLIF(BTRIM(origen_tipo), ''), 'manual'),
  sincronizado = COALESCE(sincronizado, false),
  created_at = COALESCE(created_at, NOW()),
  updated_at = COALESCE(updated_at, NOW());

UPDATE menu_digital_item
SET
  nombre = COALESCE(NULLIF(BTRIM(nombre), ''), CONCAT('ITEM ', id)),
  descripcion = COALESCE(descripcion, ''),
  precio = COALESCE(precio, 0),
  disponible = COALESCE(disponible, true),
  visible_publico = COALESCE(visible_publico, true),
  destacado = COALESCE(destacado, false),
  agotado = COALESCE(agotado, false),
  orden = COALESCE(orden, 0),
  origen_tipo = COALESCE(NULLIF(BTRIM(origen_tipo), ''), 'manual'),
  sincronizado = COALESCE(sincronizado, false),
  created_at = COALESCE(created_at, NOW()),
  updated_at = COALESCE(updated_at, NOW());

ALTER TABLE producto
  ALTER COLUMN mostrar_menu_digital SET DEFAULT false;

ALTER TABLE categoria
  ALTER COLUMN mostrar_menu_digital SET DEFAULT false;

ALTER TABLE menu_digital_config
  ALTER COLUMN estado SET DEFAULT 'BORRADOR',
  ALTER COLUMN color_principal SET DEFAULT '#147696',
  ALTER COLUMN color_secundario SET DEFAULT '#E6F1F4',
  ALTER COLUMN fondo_tipo SET DEFAULT 'gradient',
  ALTER COLUMN usar_logo_empresa SET DEFAULT true,
  ALTER COLUMN layout_categorias SET DEFAULT 'tabs',
  ALTER COLUMN created_at SET DEFAULT NOW(),
  ALTER COLUMN updated_at SET DEFAULT NOW();

ALTER TABLE menu_digital_categoria
  ALTER COLUMN color SET DEFAULT '#147696',
  ALTER COLUMN icono SET DEFAULT 'fa-utensils',
  ALTER COLUMN orden SET DEFAULT 0,
  ALTER COLUMN activo SET DEFAULT true,
  ALTER COLUMN visible_publico SET DEFAULT true,
  ALTER COLUMN agotado SET DEFAULT false,
  ALTER COLUMN origen_tipo SET DEFAULT 'manual',
  ALTER COLUMN sincronizado SET DEFAULT false,
  ALTER COLUMN created_at SET DEFAULT NOW(),
  ALTER COLUMN updated_at SET DEFAULT NOW();

ALTER TABLE menu_digital_item
  ALTER COLUMN precio SET DEFAULT 0,
  ALTER COLUMN disponible SET DEFAULT true,
  ALTER COLUMN visible_publico SET DEFAULT true,
  ALTER COLUMN destacado SET DEFAULT false,
  ALTER COLUMN agotado SET DEFAULT false,
  ALTER COLUMN orden SET DEFAULT 0,
  ALTER COLUMN origen_tipo SET DEFAULT 'manual',
  ALTER COLUMN sincronizado SET DEFAULT false,
  ALTER COLUMN created_at SET DEFAULT NOW(),
  ALTER COLUMN updated_at SET DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'uq_menu_digital_config_scope'
  ) AND NOT EXISTS (
    SELECT 1
    FROM menu_digital_config
    WHERE empresa_id IS NOT NULL
      AND terminal_id IS NOT NULL
    GROUP BY empresa_id, terminal_id
    HAVING COUNT(*) > 1
  ) THEN
    CREATE UNIQUE INDEX uq_menu_digital_config_scope
      ON menu_digital_config(empresa_id, terminal_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'uq_menu_digital_categoria_origen'
  ) AND NOT EXISTS (
    SELECT 1
    FROM menu_digital_categoria
    WHERE origen_categoria_id IS NOT NULL
    GROUP BY menu_id, origen_categoria_id
    HAVING COUNT(*) > 1
  ) THEN
    CREATE UNIQUE INDEX uq_menu_digital_categoria_origen
      ON menu_digital_categoria(menu_id, origen_categoria_id)
      WHERE origen_categoria_id IS NOT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'uq_menu_digital_item_origen'
  ) AND NOT EXISTS (
    SELECT 1
    FROM menu_digital_item
    WHERE origen_producto_id IS NOT NULL
    GROUP BY menu_id, origen_producto_id
    HAVING COUNT(*) > 1
  ) THEN
    CREATE UNIQUE INDEX uq_menu_digital_item_origen
      ON menu_digital_item(menu_id, origen_producto_id)
      WHERE origen_producto_id IS NOT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_menu_digital_categoria_menu_orden
  ON menu_digital_categoria(menu_id, orden, id);

CREATE INDEX IF NOT EXISTS idx_menu_digital_item_menu_orden
  ON menu_digital_item(menu_id, orden, id);

CREATE INDEX IF NOT EXISTS idx_producto_mostrar_menu_digital
  ON producto(mostrar_menu_digital, categoria_id, id);

CREATE INDEX IF NOT EXISTS idx_categoria_mostrar_menu_digital
  ON categoria(mostrar_menu_digital, id);

COMMIT;
