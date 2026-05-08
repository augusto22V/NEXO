-- VentaMedio: visibilidad y orden independiente de VentaRapida
-- Fecha: 2026-04-17

BEGIN;

ALTER TABLE categoria
  ADD COLUMN IF NOT EXISTS mostrar_venta_medio BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE categoria
  ADD COLUMN IF NOT EXISTS orden_venta_medio INTEGER NOT NULL DEFAULT 0;

ALTER TABLE producto
  ADD COLUMN IF NOT EXISTS mostrar_venta_medio BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE producto
  ADD COLUMN IF NOT EXISTS orden_venta_medio INTEGER NOT NULL DEFAULT 0;

-- Inicializar orden propio de VentaMedio a partir del orden existente
UPDATE categoria
SET orden_venta_medio = COALESCE(orden_pantalla, 0)
WHERE COALESCE(orden_venta_medio, 0) = 0;

UPDATE producto
SET orden_venta_medio = COALESCE(orden_pos, 0)
WHERE COALESCE(orden_venta_medio, 0) = 0;

CREATE INDEX IF NOT EXISTS idx_categoria_venta_medio
  ON categoria(mostrar_venta_medio, activo, orden_venta_medio, id);

CREATE INDEX IF NOT EXISTS idx_producto_venta_medio
  ON producto(categoria_id, mostrar_venta_medio, activo, orden_venta_medio, id);

COMMIT;
