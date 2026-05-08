BEGIN;

-- ============================================================
-- SoftSys - Optimizacion compatible de base de datos
-- Objetivo:
-- - reforzar relaciones faltantes
-- - agregar indices para consultas reales del sistema
-- - limpiar duplicados evidentes de constraints/index
-- - habilitar mejor uso de caja_pago_detalle sin romper caja_movimiento
-- ============================================================

-- ------------------------------------------------------------
-- 1. Limpieza de constraints/index duplicados
-- ------------------------------------------------------------
ALTER TABLE caja_movimiento DROP CONSTRAINT IF EXISTS unique_venta_caja;
ALTER TABLE caja_movimiento DROP CONSTRAINT IF EXISTS venta_cobrada_unique;
ALTER TABLE usuario DROP CONSTRAINT IF EXISTS usuario_unique;

DROP INDEX IF EXISTS unique_venta_caja;
DROP INDEX IF EXISTS venta_cobrada_unique;
DROP INDEX IF EXISTS usuario_unique;

-- ------------------------------------------------------------
-- 2. Foreign keys faltantes
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_venta_detalle_venta'
  ) THEN
    ALTER TABLE venta_detalle
      ADD CONSTRAINT fk_venta_detalle_venta
      FOREIGN KEY (venta_id) REFERENCES venta(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_venta_detalle_producto'
  ) THEN
    ALTER TABLE venta_detalle
      ADD CONSTRAINT fk_venta_detalle_producto
      FOREIGN KEY (producto_id) REFERENCES producto(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_factura_venta'
  ) THEN
    ALTER TABLE factura
      ADD CONSTRAINT fk_factura_venta
      FOREIGN KEY (venta_id) REFERENCES venta(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_factura_cliente'
  ) THEN
    ALTER TABLE factura
      ADD CONSTRAINT fk_factura_cliente
      FOREIGN KEY (cliente_id) REFERENCES cliente(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_factura_detalle_factura'
  ) THEN
    ALTER TABLE factura_detalle
      ADD CONSTRAINT fk_factura_detalle_factura
      FOREIGN KEY (factura_id) REFERENCES factura(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_factura_detalle_producto'
  ) THEN
    ALTER TABLE factura_detalle
      ADD CONSTRAINT fk_factura_detalle_producto
      FOREIGN KEY (producto_id) REFERENCES producto(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_caja_pago_detalle_movimiento'
  ) THEN
    ALTER TABLE caja_pago_detalle
      ADD CONSTRAINT fk_caja_pago_detalle_movimiento
      FOREIGN KEY (caja_movimiento_id) REFERENCES caja_movimiento(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_stock_movimiento_producto'
  ) THEN
    ALTER TABLE stock_movimiento
      ADD CONSTRAINT fk_stock_movimiento_producto
      FOREIGN KEY (producto_id) REFERENCES producto(id) ON DELETE RESTRICT;
  END IF;
END $$;

-- ------------------------------------------------------------
-- 3. Checks ligeros y defaults compatibles
-- ------------------------------------------------------------
ALTER TABLE caja_pago_detalle
  ALTER COLUMN created_at SET DEFAULT NOW();

ALTER TABLE venta
  ALTER COLUMN total SET DEFAULT 0;

ALTER TABLE caja_movimiento
  ALTER COLUMN pago_efectivo SET DEFAULT 0,
  ALTER COLUMN pago_efectivo_real SET DEFAULT 0,
  ALTER COLUMN pago_efectivo_dolar SET DEFAULT 0,
  ALTER COLUMN pago_tarjeta SET DEFAULT 0,
  ALTER COLUMN pago_transferencia SET DEFAULT 0,
  ALTER COLUMN pago_pix SET DEFAULT 0,
  ALTER COLUMN vuelto SET DEFAULT 0,
  ALTER COLUMN vuelto_real SET DEFAULT 0,
  ALTER COLUMN vuelto_dolar SET DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_caja_pago_detalle_monto'
  ) THEN
    ALTER TABLE caja_pago_detalle
      ADD CONSTRAINT chk_caja_pago_detalle_monto
      CHECK (monto >= 0 AND monto_gs >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_venta_total_non_negative'
  ) THEN
    ALTER TABLE venta
      ADD CONSTRAINT chk_venta_total_non_negative
      CHECK (total >= 0);
  END IF;
END $$;

-- ------------------------------------------------------------
-- 4. Unicidad de negocio compatible
-- ------------------------------------------------------------
-- Importante:
-- No se fuerza unicidad por factura.venta_id porque algunos despliegues
-- pueden necesitar:
-- - una factura por venta
-- - varias ventas agrupadas en una factura
-- - refacturacion o notas asociadas al mismo origen
--
-- Si el despliegue necesita "una sola factura por venta", habilitar:
-- CREATE UNIQUE INDEX IF NOT EXISTS uq_factura_venta_no_nula
--   ON factura(venta_id)
--   WHERE venta_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_factura_numero_factura
  ON factura(numero_factura)
  WHERE numero_factura IS NOT NULL;

-- Nota:
-- Si desean garantizar una sola caja ABIERTA al nivel BD,
-- validar primero que no existan multiples cajas abiertas y luego habilitar:
-- CREATE UNIQUE INDEX IF NOT EXISTS uq_caja_abierta ON caja(estado) WHERE estado = 'ABIERTA';

-- ------------------------------------------------------------
-- 5. Indices para consultas frecuentes
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_venta_fecha_desc ON venta(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_venta_estado_fecha ON venta(estado, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_venta_numero ON venta(numero);
CREATE INDEX IF NOT EXISTS idx_venta_cliente ON venta(cliente_id);
CREATE INDEX IF NOT EXISTS idx_venta_vendedor ON venta(vendedor_id);
CREATE INDEX IF NOT EXISTS idx_venta_tipo_pedido ON venta(tipo_pedido_id);

CREATE INDEX IF NOT EXISTS idx_venta_detalle_producto ON venta_detalle(producto_id);
CREATE INDEX IF NOT EXISTS idx_venta_detalle_venta_producto ON venta_detalle(venta_id, producto_id);

CREATE INDEX IF NOT EXISTS idx_caja_estado_fecha ON caja(estado, fecha_apertura DESC);
CREATE INDEX IF NOT EXISTS idx_caja_movimiento_caja_fecha ON caja_movimiento(caja_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_caja_movimiento_fecha ON caja_movimiento(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_caja_pago_detalle_movimiento ON caja_pago_detalle(caja_movimiento_id);
CREATE INDEX IF NOT EXISTS idx_caja_pago_detalle_metodo_moneda ON caja_pago_detalle(metodo, moneda);
CREATE INDEX IF NOT EXISTS idx_caja_sesiones_caja_estado_fecha ON caja_sesiones(caja_id, estado, fecha_apertura DESC);

CREATE INDEX IF NOT EXISTS idx_factura_fecha_desc ON factura(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_factura_cliente ON factura(cliente_id);
CREATE INDEX IF NOT EXISTS idx_factura_estado_fecha ON factura(estado, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_factura_detalle_factura ON factura_detalle(factura_id);
CREATE INDEX IF NOT EXISTS idx_factura_detalle_producto ON factura_detalle(producto_id);

CREATE INDEX IF NOT EXISTS idx_stock_producto ON stock_movimiento(producto_id);
CREATE INDEX IF NOT EXISTS idx_stock_movimiento_producto_fecha ON stock_movimiento(producto_id, creado_en DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movimiento_ref ON stock_movimiento(referencia_tipo, referencia_id);

CREATE INDEX IF NOT EXISTS idx_compra_fecha_desc ON compra(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_compra_proveedor_fecha ON compra(proveedor_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_compra_usuario_fecha ON compra(usuario_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_compra_detalle_compra_producto ON compra_detalle(compra_id, producto_id);

CREATE INDEX IF NOT EXISTS idx_producto_categoria_activo ON producto(categoria_id, activo);
CREATE INDEX IF NOT EXISTS idx_producto_nombre_lower ON producto(LOWER(nombre));
CREATE INDEX IF NOT EXISTS idx_cliente_ruc ON cliente(ruc);
CREATE INDEX IF NOT EXISTS idx_proveedor_ruc ON proveedor(ruc);
CREATE INDEX IF NOT EXISTS idx_usuario_empresa_activo ON usuario(empresa_id, activo);


-- ------------------------------------------------------------
-- 6. Sincronizacion segura de cache de stock (opcional)
-- ------------------------------------------------------------
UPDATE producto p
SET stock = sub.total
FROM (
  SELECT
    producto_id,
    SUM(
      CASE
        WHEN tipo = 'ENTRADA' THEN cantidad
        ELSE -cantidad
      END
    ) AS total
  FROM stock_movimiento
  GROUP BY producto_id
) sub
WHERE p.id = sub.producto_id;

COMMIT;
