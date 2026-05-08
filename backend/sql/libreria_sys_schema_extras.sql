-- Campos opcionales para catálogo de librería (ISBN / autor). Idempotente.
BEGIN;

ALTER TABLE producto
  ADD COLUMN IF NOT EXISTS isbn VARCHAR(32),
  ADD COLUMN IF NOT EXISTS autor VARCHAR(200);

CREATE INDEX IF NOT EXISTS idx_producto_isbn ON producto(isbn) WHERE isbn IS NOT NULL AND btrim(isbn) <> '';

COMMENT ON COLUMN producto.isbn IS 'ISBN o código de barras del libro (EAN-13)';
COMMENT ON COLUMN producto.autor IS 'Autor u origen editorial (texto libre)';

COMMIT;
