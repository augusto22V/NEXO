ALTER TABLE vendedor
  ADD COLUMN IF NOT EXISTS tipo_calculo_comision VARCHAR(20) DEFAULT 'productos';

ALTER TABLE vendedor
  ADD COLUMN IF NOT EXISTS tipo_comision VARCHAR(20) DEFAULT 'total_bruto';

ALTER TABLE vendedor
  ADD COLUMN IF NOT EXISTS porcentaje_ventas NUMERIC(12,2) DEFAULT 0;

ALTER TABLE vendedor
  ADD COLUMN IF NOT EXISTS porcentaje_servicios NUMERIC(12,2) DEFAULT 0;

ALTER TABLE vendedor
  ADD COLUMN IF NOT EXISTS comision_por_cantidad BOOLEAN DEFAULT false;

ALTER TABLE venta
  ADD COLUMN IF NOT EXISTS comision NUMERIC(14,2) DEFAULT 0;

ALTER TABLE producto
  ADD COLUMN IF NOT EXISTS es_servicio BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_producto_es_servicio
  ON producto(es_servicio);

CREATE INDEX IF NOT EXISTS idx_venta_comision_vendedor_estado
  ON venta(vendedor_id, estado, fecha);
