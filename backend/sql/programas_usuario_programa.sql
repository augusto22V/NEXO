-- Catalogo maestro de programas
CREATE TABLE IF NOT EXISTS programas (
  id SERIAL PRIMARY KEY,
  codigo VARCHAR(80) NOT NULL UNIQUE,
  nombre VARCHAR(180) NOT NULL,
  ruta VARCHAR(260) NOT NULL,
  zona VARCHAR(20) NOT NULL DEFAULT 'operativo',
  categoria VARCHAR(80) NOT NULL DEFAULT 'General',
  icono VARCHAR(80) NOT NULL DEFAULT 'fa-circle',
  visible_home BOOLEAN NOT NULL DEFAULT false,
  visible_admin BOOLEAN NOT NULL DEFAULT false,
  activo BOOLEAN NOT NULL DEFAULT true,
  orden_menu INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Relacion usuario <-> programas personalizados
-- Nota: programa_id NULL se usa como marcador de "usuario personalizado"
-- para soportar el caso de 0 programas asignados manualmente.
CREATE TABLE IF NOT EXISTS usuario_programa (
  id BIGSERIAL PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
  programa_id INTEGER NULL REFERENCES programas(id) ON DELETE CASCADE,
  rol_snapshot VARCHAR(40) NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_usuario_programa_marker CHECK (
    (programa_id IS NULL) OR (programa_id > 0)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_usuario_programa_usuario_programa
ON usuario_programa(usuario_id, programa_id)
WHERE programa_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_usuario_programa_usuario
ON usuario_programa(usuario_id);

INSERT INTO programas
  (codigo, nombre, ruta, zona, categoria, icono, visible_home, visible_admin, activo, orden_menu)
VALUES
  ('VENTA_RAPIDA', 'VentaRapida', '/modulos/venta/venta_rapida.html', 'operativo', 'Ventas', 'fa-bolt', true, false, true, 10),
  ('MESAS', 'Mesas', '/modulos/mesa/mesa.html', 'operativo', 'Ventas', 'fa-table-cells-large', true, false, true, 20),
  ('CAJA', 'Gestion Caja', '/modulos/gestion_caja/gestion.html', 'operativo', 'Caja', 'fa-cash-register', true, false, true, 30),
  ('VENTA_MEDIO', 'Venta Medio', '/modulos/venta/venta_medio.html', 'operativo', 'Ventas', 'fa-store', true, false, true, 35),
  ('CONSULTA_PRODUCTOS', 'Consulta Productos', '/modulos/consultas/consulta_productos.html', 'operativo', 'Consultas', 'fa-magnifying-glass', true, false, true, 40),
  ('MOV_VENTA', 'Movimiento Venta', '/modulos/movimientoVenta/movimientoVenta.html', 'operativo', 'Consultas', 'fa-receipt', false, false, true, 50),
  ('MOV_COMPRA', 'Movimiento Compra', '/modulos/movimientoCompra/movimientoCompra.html', 'operativo', 'Consultas', 'fa-basket-shopping', false, false, true, 60),
  ('MOV_FACTURA', 'Factura Fiscal', '/modulos/movimientoFactura/movimientoFactura.html', 'operativo', 'Consultas', 'fa-file-invoice', false, false, true, 70),
  ('CLIENTES', 'Clientes', '/modulos/cliente/cliente.html', 'operativo', 'Maestros', 'fa-user', true, false, true, 80),
  ('VENDEDOR', 'Vendedor', '/modulos/vendedor/vendedor.html', 'operativo', 'Maestros', 'fa-id-badge', true, false, true, 85),
  ('COMPRADOR', 'Comprador', '/modulos/comprador/comprador.html', 'operativo', 'Maestros', 'fa-user-tie', true, false, true, 88),
  ('COMPRAS', 'Compra', '/modulos/compra/compra.html', 'operativo', 'Compras', 'fa-basket-shopping', true, false, true, 90),
  ('PRODUCTOS', 'Productos', '/modulos/productos/productos.html', 'operativo', 'Maestros', 'fa-box', true, false, true, 100),
  ('CATEGORIAS', 'Categorias', '/modulos/categorias/categorias.html', 'operativo', 'Maestros', 'fa-tags', true, false, true, 110),
  ('PROVEEDORES', 'Proveedores', '/modulos/proveedores/proveedores.html', 'operativo', 'Maestros', 'fa-handshake', true, false, true, 120),
  ('PRODUCCION', 'Produccion', '/modulos/produccion/produccion.html', 'operativo', 'Produccion', 'fa-kitchen-set', true, false, true, 130),
  ('RECETAS', 'Recetas', '/modulos/produccion/receta.html', 'operativo', 'Produccion', 'fa-book-open', true, false, true, 140),
  ('SORTEO', 'Sorteo', '/modulos/sorteo/sorteo.html', 'operativo', 'Operativo', 'fa-gift', true, false, true, 150),
  ('PARAMETROS', 'Parametros', '/modulos/parametros/parametros.html', 'admin', 'Configuracion', 'fa-sliders', false, true, true, 10),
  ('OPERACIONES', 'Operaciones', '/modulos/parametros/operacion.html', 'admin', 'Configuracion', 'fa-list-check', false, true, true, 20),
  ('FORMA_PAGO', 'Formas de Pago', '/modulos/parametros/forma_pago.html', 'admin', 'Configuracion', 'fa-credit-card', false, true, true, 30),
  ('USUARIOS', 'Usuarios', '/modulos/config/usuarios/usuarios.html', 'admin', 'Seguridad', 'fa-users', false, true, true, 40),
  ('PROGRAMAS', 'Programas', '/modulos/config/programas/programas.html', 'admin', 'Seguridad', 'fa-layer-group', false, true, true, 50),
  ('PERMISOS', 'Permisos', '/modulos/config/permisos/permisos.html', 'admin', 'Seguridad', 'fa-key', false, true, true, 60),
  ('EMPRESA', 'Empresa', '/modulos/config/empresa/empresa.html', 'admin', 'Configuracion', 'fa-building', false, true, true, 70),
  ('TERMINALES', 'Terminales', '/modulos/config/terminal/terminal.html', 'admin', 'Configuracion', 'fa-desktop', false, true, true, 80),
  ('GENERADOR_CONTROL', 'Generador Control', '/modulos/config/licencia_generador.html', 'admin', 'Sistema', 'fa-shield-halved', false, true, true, 90),
  ('MODELO_FACTURA', 'Modelo Factura', '/modulos/modelo_factura/modelo_factura.html', 'admin', 'Facturacion', 'fa-file-contract', false, true, true, 100)
ON CONFLICT (codigo) DO UPDATE
SET nombre = EXCLUDED.nombre,
    ruta = EXCLUDED.ruta,
    zona = EXCLUDED.zona,
    categoria = EXCLUDED.categoria,
    icono = EXCLUDED.icono,
    visible_home = EXCLUDED.visible_home,
    visible_admin = EXCLUDED.visible_admin,
    activo = EXCLUDED.activo,
    orden_menu = EXCLUDED.orden_menu,
    updated_at = NOW();
