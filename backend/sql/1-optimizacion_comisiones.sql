  
  
  

ALTER TABLE vendedor 
ADD COLUMN IF NOT EXISTS porcentaje_ventas NUMERIC(12,2) DEFAULT 0;

ALTER TABLE vendedor 
ADD COLUMN IF NOT EXISTS porcentaje_servicios NUMERIC(12,2) DEFAULT 0;

ALTER TABLE vendedor 
ADD COLUMN IF NOT EXISTS tipo_comision VARCHAR(20) DEFAULT 'total_bruto';

ALTER TABLE vendedor 
ADD COLUMN IF NOT EXISTS tipo_calculo_comision VARCHAR(20) DEFAULT 'productos';

ALTER TABLE vendedor 
ADD COLUMN IF NOT EXISTS comision_por_cantidad BOOLEAN DEFAULT FALSE;


  
  -- ================================================================
-- SoftSys - Optimización de Base de Datos para Comisiones
-- Fecha: 2026-04-14
-- Objetivo: Implementar auditoría de comisiones y mejorar rendimiento
-- ================================================================

BEGIN;

-- ================================================================
-- 1. CREAR TIPOS ENUM
-- ================================================================

CREATE TYPE enum_estado_venta AS ENUM 
  ('PENDIENTE', 'CONCLUIDO', 'EFECTIVADO', 'CANCELADO');

CREATE TYPE enum_tipo_comision AS ENUM 
  ('total_bruto', 'total_neto', 'cantidad');

CREATE TYPE enum_tipo_calculo_comision AS ENUM 
  ('productos', 'servicios', 'ambos');

CREATE TYPE enum_estado_comision_pago AS ENUM
  ('PENDIENTE', 'PAGADA', 'REVERTIDA', 'AJUSTADA');

-- ================================================================
-- 2. TABLA: Auditoría de Cambios de Comisión
-- ================================================================

CREATE TABLE IF NOT EXISTS vendedor_comision_cambios (
  id BIGSERIAL PRIMARY KEY,
  vendedor_id BIGINT NOT NULL,
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
  fecha_cambio TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  usuario_id BIGINT,
  
  CONSTRAINT fk_vendedor_comision_cambios_vendedor
    FOREIGN KEY (vendedor_id) REFERENCES vendedor(id) ON DELETE CASCADE,
  CONSTRAINT fk_vendedor_comision_cambios_usuario
    FOREIGN KEY (usuario_id) REFERENCES usuario(id) ON DELETE SET NULL,
  
  CONSTRAINT chk_porcentaje_ventas_nuevo CHECK (porcentaje_ventas_nuevo >= 0),
  CONSTRAINT chk_porcentaje_servicios_nuevo CHECK (porcentaje_servicios_nuevo >= 0)
);

CREATE INDEX idx_vendedor_comision_cambios_vendedor_fecha
  ON vendedor_comision_cambios(vendedor_id, fecha_cambio DESC);

CREATE INDEX idx_vendedor_comision_cambios_fecha
  ON vendedor_comision_cambios(fecha_cambio DESC);

-- ================================================================
-- 3. TABLA: Comisión Pagada (Auditoría de Pagos)
-- ================================================================

CREATE TABLE IF NOT EXISTS vendedor_comision_pago (
  id BIGSERIAL PRIMARY KEY,
  vendedor_id BIGINT NOT NULL,
  venta_id BIGINT NOT NULL,
  
  -- Comisión calculada según configuración vigente en el momento
  comision_calculada NUMERIC(14,2) NOT NULL,
  
  -- Comisión realmente pagada (puede diferir si hay ajustes)
  comision_pagada NUMERIC(14,2) DEFAULT 0,
  
  -- Estado del pago
  estado VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
  
  -- Datos de rastreo
  fecha_venta DATE NOT NULL,
  fecha_registro TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  fecha_pago TIMESTAMP WITH TIME ZONE,
  
  -- Auditoría
  usuario_registro_id BIGINT,
  usuario_pago_id BIGINT,
  observaciones TEXT,
  
  CONSTRAINT fk_vendedor_comision_pago_vendedor
    FOREIGN KEY (vendedor_id) REFERENCES vendedor(id) ON DELETE CASCADE,
  CONSTRAINT fk_vendedor_comision_pago_venta
    FOREIGN KEY (venta_id) REFERENCES venta(id) ON DELETE CASCADE,
  CONSTRAINT fk_vendedor_comision_pago_usuario_registro
    FOREIGN KEY (usuario_registro_id) REFERENCES usuario(id) ON DELETE SET NULL,
  CONSTRAINT fk_vendedor_comision_pago_usuario_pago
    FOREIGN KEY (usuario_pago_id) REFERENCES usuario(id) ON DELETE SET NULL,
  
  CONSTRAINT chk_comision_calculada_positiva CHECK (comision_calculada >= 0),
  CONSTRAINT chk_comision_pagada_positiva CHECK (comision_pagada >= 0),
  CONSTRAINT chk_comision_pagada_no_mayor_que_calculada 
    CHECK (comision_pagada <= comision_calculada),
  
  CONSTRAINT uq_vendedor_venta_comision 
    UNIQUE (vendedor_id, venta_id)
);

CREATE INDEX idx_vendedor_comision_pago_vendedor_fecha
  ON vendedor_comision_pago(vendedor_id, fecha_venta DESC);

CREATE INDEX idx_vendedor_comision_pago_estado_fecha
  ON vendedor_comision_pago(estado, fecha_pago DESC);

CREATE INDEX idx_vendedor_comision_pago_venta
  ON vendedor_comision_pago(venta_id);

-- ================================================================
-- 4. TABLA: Resumen Diario de Comisiones (Para Reportes)
-- ================================================================

CREATE TABLE IF NOT EXISTS vendedor_comision_resumen_diario (
  id BIGSERIAL PRIMARY KEY,
  vendedor_id BIGINT NOT NULL,
  fecha_venta DATE NOT NULL,
  cantidad_ventas INTEGER NOT NULL DEFAULT 0,
  total_ventas NUMERIC(14,2) NOT NULL DEFAULT 0,
  comision_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  comision_promedio_por_venta NUMERIC(14,2) NOT NULL DEFAULT 0,
  fecha_calculo TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  CONSTRAINT fk_vendedor_comision_resumen_diario_vendedor
    FOREIGN KEY (vendedor_id) REFERENCES vendedor(id) ON DELETE CASCADE,
  
  CONSTRAINT uq_vendedor_comision_resumen_diario
    UNIQUE (vendedor_id, fecha_venta)
);

CREATE INDEX idx_vendedor_comision_resumen_diario_vendedor_fecha
  ON vendedor_comision_resumen_diario(vendedor_id, fecha_venta DESC);

-- ================================================================
-- 5. MEJORAR TABLA VENDEDOR CON CONSTRAINTS
-- ================================================================

DO $$
BEGIN
  -- Agregar constraints si no existen
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_vendedor_porcentaje_ventas'
  ) THEN
    ALTER TABLE vendedor
      ADD CONSTRAINT chk_vendedor_porcentaje_ventas 
      CHECK (porcentaje_ventas >= 0 AND porcentaje_ventas <= 100);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_vendedor_porcentaje_servicios'
  ) THEN
    ALTER TABLE vendedor
      ADD CONSTRAINT chk_vendedor_porcentaje_servicios 
      CHECK (porcentaje_servicios >= 0 AND porcentaje_servicios <= 100);
  END IF;
END $$;

-- ================================================================
-- 6. MEJORAR TABLA VENTA_DETALLE CON CONSTRAINTS
-- ================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_venta_detalle_cantidad'
  ) THEN
    ALTER TABLE venta_detalle
      ADD CONSTRAINT chk_venta_detalle_cantidad CHECK (cantidad > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_venta_detalle_precio'
  ) THEN
    ALTER TABLE venta_detalle
      ADD CONSTRAINT chk_venta_detalle_precio CHECK (precio >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_venta_detalle_subtotal'
  ) THEN
    ALTER TABLE venta_detalle
      ADD CONSTRAINT chk_venta_detalle_subtotal CHECK (subtotal > 0);
  END IF;
END $$;

-- ================================================================
-- 7. MEJORAR TABLA VENTA CON CONSTRAINTS
-- ================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_venta_comision_positiva'
  ) THEN
    ALTER TABLE venta
      ADD CONSTRAINT chk_venta_comision_positiva CHECK (comision >= 0);
  END IF;
END $$;

-- ================================================================
-- 8. AGREGAR ÍNDICES COMPUESTOS PARA CONSULTAS FRECUENTES
-- ================================================================

CREATE INDEX IF NOT EXISTS idx_venta_estado_fecha_vendedor
  ON venta(estado, fecha DESC, vendedor_id);

CREATE INDEX IF NOT EXISTS idx_venta_vendedor_estado_fecha
  ON venta(vendedor_id, estado, fecha DESC);

CREATE INDEX IF NOT EXISTS idx_venta_cliente_estado_fecha
  ON venta(cliente_id, estado, fecha DESC);

CREATE INDEX IF NOT EXISTS idx_venta_estado_comision_fecha
  ON venta(estado, comision, fecha DESC);

CREATE INDEX IF NOT EXISTS idx_venta_detalle_venta_producto
  ON venta_detalle(venta_id, producto_id);

-- ================================================================
-- 9. FUNCIÓN: Obtener Configuración Vigente de Comisión
-- ================================================================

CREATE OR REPLACE FUNCTION get_vendedor_comision_vigente(
  p_vendedor_id BIGINT,
  p_as_of_date TIMESTAMP WITH TIME ZONE DEFAULT NOW()
)
RETURNS TABLE (
  vendedor_id BIGINT,
  nombre VARCHAR,
  tipo_calculo VARCHAR,
  tipo_comision VARCHAR,
  porcentaje_ventas NUMERIC,
  porcentaje_servicios NUMERIC,
  comision_por_cantidad BOOLEAN,
  fecha_vigencia TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    v.id,
    v.nombre,
    v.tipo_calculo_comision,
    v.tipo_comision,
    v.porcentaje_ventas,
    v.porcentaje_servicios,
    v.comision_por_cantidad,
    COALESCE(
      (SELECT fecha_cambio FROM vendedor_comision_cambios 
       WHERE vendedor_id = p_vendedor_id AND fecha_cambio <= p_as_of_date
       ORDER BY fecha_cambio DESC LIMIT 1),
      (SELECT created_at FROM auditoria 
       WHERE tabla = 'vendedor' AND registro_id::BIGINT = p_vendedor_id 
       AND accion = 'INSERT'
       ORDER BY fecha DESC LIMIT 1),
      NOW()
    ) AS fecha_vigencia
  FROM vendedor v
  WHERE v.id = p_vendedor_id;
END;
$$ LANGUAGE plpgsql STABLE;

-- ================================================================
-- 10. FUNCIÓN: Calcular Comisión de Venta
-- ================================================================

CREATE OR REPLACE FUNCTION calcular_comision_venta(
  p_venta_id BIGINT
)
RETURNS TABLE (
  comision_total NUMERIC,
  total_venta NUMERIC,
  detalle JSONB
) AS $$
DECLARE
  v_tipo_comision VARCHAR;
  v_tipo_calculo VARCHAR;
  v_porcentaje_ventas NUMERIC;
  v_porcentaje_servicios NUMERIC;
  v_comision_por_cantidad BOOLEAN;
  v_estado VARCHAR;
  v_comision NUMERIC := 0;
  v_total_venta NUMERIC := 0;
  v_total_productos NUMERIC := 0;
  v_total_servicios NUMERIC := 0;
  v_cantidad_productos NUMERIC := 0;
  v_cantidad_servicios NUMERIC := 0;
BEGIN
  -- Obtener datos de venta
  SELECT 
    v.estado,
    COALESCE(ve.tipo_comision, 'total_bruto'),
    COALESCE(ve.tipo_calculo_comision, 'productos'),
    COALESCE(ve.porcentaje_ventas, 0),
    COALESCE(ve.porcentaje_servicios, 0),
    COALESCE(ve.comision_por_cantidad, FALSE)
  INTO 
    v_estado,
    v_tipo_comision,
    v_tipo_calculo,
    v_porcentaje_ventas,
    v_porcentaje_servicios,
    v_comision_por_cantidad
  FROM venta v
  LEFT JOIN vendedor ve ON ve.id = v.vendedor_id
  WHERE v.id = p_venta_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Venta % no encontrada', p_venta_id;
  END IF;

  -- Si venta está cancelada, comisión es 0
  IF v_estado = 'CANCELADO' THEN
    RETURN QUERY SELECT 0::NUMERIC, 0::NUMERIC, '{"cancelada": true}'::JSONB;
    RETURN;
  END IF;

  -- Calcular resumen de venta
  SELECT 
    COALESCE(SUM(vd.subtotal), 0),
    COALESCE(SUM(CASE WHEN COALESCE(p.es_servicio, FALSE) THEN vd.subtotal ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN COALESCE(p.es_servicio, FALSE) THEN 0 ELSE vd.subtotal END), 0),
    COALESCE(SUM(CASE WHEN COALESCE(p.es_servicio, FALSE) THEN vd.cantidad ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN COALESCE(p.es_servicio, FALSE) THEN 0 ELSE vd.cantidad END), 0)
  INTO 
    v_total_venta,
    v_total_servicios,
    v_total_productos,
    v_cantidad_servicios,
    v_cantidad_productos
  FROM venta_detalle vd
  LEFT JOIN producto p ON p.id = vd.producto_id
  WHERE vd.venta_id = p_venta_id;

  -- Calcular comisión
  IF v_comision_por_cantidad THEN
    -- Comisión por cantidad
    IF v_tipo_calculo IN ('productos', 'ambos') THEN
      v_comision := v_comision + (v_cantidad_productos * v_porcentaje_ventas / 100);
    END IF;
    IF v_tipo_calculo IN ('servicios', 'ambos') THEN
      v_comision := v_comision + (v_cantidad_servicios * v_porcentaje_servicios / 100);
    END IF;
  ELSE
    -- Comisión por monto
    IF v_tipo_calculo IN ('productos', 'ambos') THEN
      v_comision := v_comision + (v_total_productos * v_porcentaje_ventas / 100);
    END IF;
    IF v_tipo_calculo IN ('servicios', 'ambos') THEN
      v_comision := v_comision + (v_total_servicios * v_porcentaje_servicios / 100);
    END IF;
  END IF;

  RETURN QUERY SELECT 
    ROUND(v_comision::NUMERIC, 2),
    ROUND(v_total_venta::NUMERIC, 2),
    jsonb_build_object(
      'tipo_comision', v_tipo_comision,
      'tipo_calculo', v_tipo_calculo,
      'total_productos', v_total_productos,
      'total_servicios', v_total_servicios,
      'cantidad_productos', v_cantidad_productos,
      'cantidad_servicios', v_cantidad_servicios,
      'porcentaje_ventas', v_porcentaje_ventas,
      'porcentaje_servicios', v_porcentaje_servicios
    );
END;
$$ LANGUAGE plpgsql STABLE;

-- ================================================================
-- 11. VISTA: Comisiones Vigentes
-- ================================================================

CREATE OR REPLACE VIEW v_vendedor_comision_vigente AS
SELECT 
  v.id,
  v.nombre,
  v.activo,
  v.tipo_calculo_comision,
  v.tipo_comision,
  v.porcentaje_ventas,
  v.porcentaje_servicios,
  v.comision_por_cantidad,
  COALESCE(
    (SELECT MAX(fecha_cambio) FROM vendedor_comision_cambios WHERE vendedor_id = v.id),
    NOW()
  ) AS fecha_ultima_modificacion,
  (SELECT COUNT(*) FROM vendedor_comision_cambios WHERE vendedor_id = v.id) AS cambios_registrados
FROM vendedor v;

-- ================================================================
-- 12. VISTA: Comisiones Pendientes de Pago
-- ================================================================

CREATE OR REPLACE VIEW v_comisiones_pendientes_pago AS
SELECT 
  vcp.id,
  vcp.vendedor_id,
  v.nombre AS vendedor_nombre,
  vcp.venta_id,
  venta.numero AS numero_venta,
  vcp.comision_calculada,
  vcp.comision_pagada,
  (vcp.comision_calculada - vcp.comision_pagada) AS comision_pendiente,
  vcp.estado,
  vcp.fecha_venta,
  vcp.fecha_registro,
  venta.estado AS estado_venta
FROM vendedor_comision_pago vcp
LEFT JOIN vendedor v ON v.id = vcp.vendedor_id
LEFT JOIN venta ON venta.id = vcp.venta_id
WHERE vcp.estado IN ('PENDIENTE', 'AJUSTADA');

-- ================================================================
-- 13. VISTA: Resumen Diario de Comisiones (Materializable)
-- ================================================================

CREATE OR REPLACE VIEW v_comisiones_diarias AS
SELECT 
  DATE(v.fecha) AS fecha_venta,
  ve.id AS vendedor_id,
  ve.nombre AS vendedor_nombre,
  COUNT(*) AS cantidad_ventas,
  SUM(v.total) AS total_ventas,
  SUM(v.comision) AS comision_total,
  ROUND(SUM(v.comision) / NULLIF(COUNT(*), 0), 2) AS comision_promedio,
  ROUND(100.0 * SUM(v.comision) / NULLIF(SUM(v.total), 0), 2) AS porcentaje_comision
FROM venta v
LEFT JOIN vendedor ve ON ve.id = v.vendedor_id
WHERE v.estado = 'EFECTIVADO'
GROUP BY DATE(v.fecha), ve.id, ve.nombre;

-- ================================================================
-- 14. VISTA: Comisiones No Pagadas por Vendedor (Resumen)
-- ================================================================

CREATE OR REPLACE VIEW v_comisiones_pendientes_por_vendedor AS
SELECT 
  v.id,
  v.nombre,
  COUNT(vcp.id) AS cantidad_comisiones_pendientes,
  SUM(CASE WHEN vcp.estado = 'PENDIENTE' THEN vcp.comision_calculada - vcp.comision_pagada ELSE 0 END) AS monto_pendiente,
  SUM(CASE WHEN vcp.estado = 'PAGADA' THEN vcp.comision_pagada ELSE 0 END) AS monto_pagado,
  MAX(vcp.fecha_registro) AS ultima_comision_registrada
FROM vendedor v
LEFT JOIN vendedor_comision_pago vcp ON vcp.vendedor_id = v.id
GROUP BY v.id, v.nombre;

COMMIT;

-- ================================================================
-- VERIFICACIÓN DE CREACIÓN
-- ================================================================

-- SELECT COUNT(*) as tablas FROM information_schema.tables 
-- WHERE table_schema = 'public' AND table_name LIKE 'vendedor_comision%';

-- SELECT * FROM v_vendedor_comision_vigente;
-- SELECT * FROM v_comisiones_pendientes_pago;
-- SELECT * FROM v_comisiones_diarias LIMIT 10;
