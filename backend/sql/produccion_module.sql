BEGIN;

CREATE TABLE IF NOT EXISTS receta (
  id BIGSERIAL PRIMARY KEY,
  producto_id BIGINT NOT NULL,
  nombre VARCHAR(180) NOT NULL,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_receta_producto
    FOREIGN KEY (producto_id)
    REFERENCES producto(id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS receta_detalle (
  id BIGSERIAL PRIMARY KEY,
  receta_id BIGINT NOT NULL,
  producto_insumo_id BIGINT NOT NULL,
  cantidad NUMERIC(14,4) NOT NULL CHECK (cantidad > 0),
  unidad VARCHAR(40),
  CONSTRAINT fk_receta_detalle_receta
    FOREIGN KEY (receta_id)
    REFERENCES receta(id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  CONSTRAINT fk_receta_detalle_producto_insumo
    FOREIGN KEY (producto_insumo_id)
    REFERENCES producto(id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS produccion (
  id BIGSERIAL PRIMARY KEY,
  receta_id BIGINT NOT NULL,
  cantidad_producida NUMERIC(14,4) NOT NULL CHECK (cantidad_producida > 0),
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  usuario_id BIGINT NULL,
  CONSTRAINT fk_produccion_receta
    FOREIGN KEY (receta_id)
    REFERENCES receta(id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT fk_produccion_usuario
    FOREIGN KEY (usuario_id)
    REFERENCES usuario(id)
    ON UPDATE CASCADE
    ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS produccion_consumo (
  id BIGSERIAL PRIMARY KEY,
  produccion_id BIGINT NOT NULL,
  producto_insumo_id BIGINT NOT NULL,
  cantidad_usada NUMERIC(14,4) NOT NULL CHECK (cantidad_usada > 0),
  CONSTRAINT fk_produccion_consumo_produccion
    FOREIGN KEY (produccion_id)
    REFERENCES produccion(id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  CONSTRAINT fk_produccion_consumo_producto
    FOREIGN KEY (producto_insumo_id)
    REFERENCES producto(id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_receta_producto_id ON receta(producto_id);
CREATE INDEX IF NOT EXISTS idx_receta_detalle_receta_id ON receta_detalle(receta_id);
CREATE INDEX IF NOT EXISTS idx_receta_detalle_producto_id ON receta_detalle(producto_insumo_id);
CREATE INDEX IF NOT EXISTS idx_produccion_receta_fecha ON produccion(receta_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_produccion_consumo_produccion ON produccion_consumo(produccion_id);

ALTER TABLE receta_detalle
  ALTER COLUMN unidad DROP NOT NULL;

COMMENT ON COLUMN receta_detalle.unidad IS 'DEPRECATED: usar producto.unidad_medida';

-- VERIFICACION
-- SELECT COUNT(*) FROM receta_detalle WHERE unidad IS NOT NULL;

-- FUTURO:
-- ALTER TABLE receta_detalle DROP COLUMN unidad;

COMMIT;
