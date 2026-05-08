BEGIN;

ALTER TABLE compra
  ADD COLUMN IF NOT EXISTS tipo_operacion_id integer,
  ADD COLUMN IF NOT EXISTS condicion_pago_id integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_compra_tipo_operacion'
  ) THEN
    ALTER TABLE compra
      ADD CONSTRAINT fk_compra_tipo_operacion
      FOREIGN KEY (tipo_operacion_id) REFERENCES tipo_operacion(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_compra_condicion_pago'
  ) THEN
    ALTER TABLE compra
      ADD CONSTRAINT fk_compra_condicion_pago
      FOREIGN KEY (condicion_pago_id) REFERENCES condicion_pago(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_compra_detalle_producto'
  ) THEN
    ALTER TABLE compra_detalle
      ADD CONSTRAINT fk_compra_detalle_producto
      FOREIGN KEY (producto_id) REFERENCES producto(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_stock_movimiento_compra_producto'
  ) THEN
    ALTER TABLE stock_movimiento
      ADD CONSTRAINT fk_stock_movimiento_compra_producto
      FOREIGN KEY (producto_id) REFERENCES producto(id) ON DELETE RESTRICT;
  END IF;
END $$;

ALTER TABLE compra
  ALTER COLUMN total SET DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_compra_empresa_fecha ON compra(empresa_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_compra_empresa_estado_fecha ON compra(empresa_id, estado, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_compra_empresa_numero ON compra(empresa_id, numero_compra);
CREATE INDEX IF NOT EXISTS idx_compra_empresa_proveedor ON compra(empresa_id, proveedor_id);
CREATE INDEX IF NOT EXISTS idx_compra_empresa_moneda ON compra(empresa_id, moneda_id);
CREATE INDEX IF NOT EXISTS idx_compra_empresa_tipo_operacion ON compra(empresa_id, tipo_operacion_id);

CREATE INDEX IF NOT EXISTS idx_compra_detalle_compra ON compra_detalle(compra_id);
CREATE INDEX IF NOT EXISTS idx_compra_detalle_producto ON compra_detalle(producto_id);
CREATE INDEX IF NOT EXISTS idx_compra_detalle_compra_producto ON compra_detalle(compra_id, producto_id);

CREATE INDEX IF NOT EXISTS idx_producto_codigo_barra ON producto(codigo_barra);
CREATE INDEX IF NOT EXISTS idx_producto_nombre_lower_compra ON producto(LOWER(nombre));

CREATE INDEX IF NOT EXISTS idx_stock_movimiento_empresa_ref ON stock_movimiento(empresa_id, referencia_tipo, referencia_id);
CREATE INDEX IF NOT EXISTS idx_stock_movimiento_producto_fecha_compra ON stock_movimiento(producto_id, creado_en DESC);

COMMIT;
