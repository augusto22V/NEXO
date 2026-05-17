const pool = require("../db");

const DEFAULT_PROGRAMAS = [
  { codigo: "VENTA_RAPIDA", nombre: "Venta en caja", ruta: "/modulos/venta/venta_rapida.html", zona: "operativo", categoria: "Ventas", icono: "fa-bolt", visible_home: true, visible_admin: false, activo: true, orden_menu: 10 },
  { codigo: "MESAS", nombre: "Servicios y encargos", ruta: "/modulos/mesa/mesa.html", zona: "operativo", categoria: "Ventas", icono: "fa-shop", visible_home: true, visible_admin: false, activo: true, orden_menu: 20 },
  { codigo: "CAJA", nombre: "Gestión de caja", ruta: "/modulos/gestion_caja/gestion.html", zona: "operativo", categoria: "Caja", icono: "fa-cash-register", visible_home: true, visible_admin: false, activo: true, orden_menu: 30 },
  { codigo: "VENTA_MEDIO", nombre: "Venta medio", ruta: "/modulos/venta/venta_medio.html", zona: "operativo", categoria: "Ventas", icono: "fa-store", visible_home: true, visible_admin: false, activo: true, orden_menu: 35 },
  { codigo: "CONSULTA_PRODUCTOS", nombre: "Consulta de productos", ruta: "/modulos/consultas/consulta_productos.html", zona: "operativo", categoria: "Consultas", icono: "fa-book", visible_home: true, visible_admin: false, activo: true, orden_menu: 40 },
  { codigo: "MOV_VENTA", nombre: "Movimiento de venta", ruta: "/modulos/movimientoVenta/movimientoVenta.html", zona: "operativo", categoria: "Consultas", icono: "fa-receipt", visible_home: false, visible_admin: false, activo: true, orden_menu: 50 },
  { codigo: "MOV_COMPRA", nombre: "Movimiento de compra", ruta: "/modulos/movimientoCompra/movimientoCompra.html", zona: "operativo", categoria: "Consultas", icono: "fa-basket-shopping", visible_home: false, visible_admin: false, activo: true, orden_menu: 60 },
  { codigo: "MOV_FACTURA", nombre: "Factura fiscal", ruta: "/modulos/movimientoFactura/movimientoFactura.html", zona: "operativo", categoria: "Consultas", icono: "fa-file-invoice", visible_home: false, visible_admin: false, activo: true, orden_menu: 70 },
  { codigo: "CLIENTES", nombre: "Clientes", ruta: "/modulos/cliente/cliente.html", zona: "operativo", categoria: "Maestros", icono: "fa-user", visible_home: true, visible_admin: false, activo: true, orden_menu: 80 },
  { codigo: "VENDEDOR", nombre: "Vendedor", ruta: "/modulos/vendedor/vendedor.html", zona: "operativo", categoria: "Maestros", icono: "fa-id-badge", visible_home: true, visible_admin: false, activo: true, orden_menu: 85 },
  { codigo: "COMPRADOR", nombre: "Comprador", ruta: "/modulos/comprador/comprador.html", zona: "operativo", categoria: "Maestros", icono: "fa-user-tie", visible_home: true, visible_admin: false, activo: true, orden_menu: 88 },
  { codigo: "COMPRAS", nombre: "Compras a proveedores", ruta: "/modulos/compra/compra.html", zona: "operativo", categoria: "Compras", icono: "fa-truck-field", visible_home: true, visible_admin: false, activo: true, orden_menu: 90 },
  { codigo: "PRODUCTOS", nombre: "Productos y artículos", ruta: "/modulos/productos/productos.html", zona: "operativo", categoria: "Maestros", icono: "fa-box-open", visible_home: true, visible_admin: false, activo: true, orden_menu: 100 },
  { codigo: "CATEGORIAS", nombre: "Géneros y secciones", ruta: "/modulos/categorias/categorias.html", zona: "operativo", categoria: "Maestros", icono: "fa-tags", visible_home: true, visible_admin: false, activo: true, orden_menu: 110 },
  { codigo: "PROVEEDORES", nombre: "Proveedores", ruta: "/modulos/proveedores/proveedores.html", zona: "operativo", categoria: "Maestros", icono: "fa-handshake", visible_home: true, visible_admin: false, activo: true, orden_menu: 120 },
  { codigo: "PRODUCCION", nombre: "Reposición y armado", ruta: "/modulos/produccion/produccion.html", zona: "operativo", categoria: "Operaciones", icono: "fa-dolly", visible_home: false, visible_admin: false, activo: false, orden_menu: 130 },
  { codigo: "RECETAS", nombre: "Listas y paquetes", ruta: "/modulos/produccion/receta.html", zona: "operativo", categoria: "Operaciones", icono: "fa-list-ul", visible_home: false, visible_admin: false, activo: false, orden_menu: 140 },
  { codigo: "SORTEO", nombre: "Sorteos y promociones", ruta: "/modulos/sorteo/sorteo.html", zona: "operativo", categoria: "Operativo", icono: "fa-gift", visible_home: true, visible_admin: false, activo: true, orden_menu: 150 },
  { codigo: "MENU_DIGITAL", nombre: "Catálogo QR / vitrina", ruta: "/modulos/menu_digital/menu_digital.html", zona: "operativo", categoria: "Marketing", icono: "fa-qrcode", visible_home: true, visible_admin: false, activo: true, orden_menu: 155 },
  { codigo: "PARAMETROS", nombre: "Parámetros", ruta: "/modulos/parametros/parametros.html", zona: "admin", categoria: "Configuración", icono: "fa-sliders", visible_home: false, visible_admin: true, activo: true, orden_menu: 10 },
  { codigo: "OPERACIONES", nombre: "Operaciones", ruta: "/modulos/parametros/operacion.html", zona: "admin", categoria: "Configuración", icono: "fa-list-check", visible_home: false, visible_admin: true, activo: true, orden_menu: 20 },
  { codigo: "FORMA_PAGO", nombre: "Formas de pago", ruta: "/modulos/parametros/forma_pago.html", zona: "admin", categoria: "Configuración", icono: "fa-credit-card", visible_home: false, visible_admin: true, activo: true, orden_menu: 30 },
  { codigo: "USUARIOS", nombre: "Usuarios", ruta: "/modulos/config/usuarios/usuarios.html", zona: "admin", categoria: "Seguridad", icono: "fa-users", visible_home: false, visible_admin: true, activo: true, orden_menu: 40 },
  { codigo: "PROGRAMAS", nombre: "Programas", ruta: "/modulos/config/programas/programas.html", zona: "admin", categoria: "Seguridad", icono: "fa-layer-group", visible_home: false, visible_admin: true, activo: true, orden_menu: 50 },
  { codigo: "PERMISOS", nombre: "Permisos", ruta: "/modulos/config/permisos/permisos.html", zona: "admin", categoria: "Seguridad", icono: "fa-key", visible_home: false, visible_admin: true, activo: true, orden_menu: 60 },
  { codigo: "EMPRESA", nombre: "Empresa", ruta: "/modulos/config/empresa/empresa.html", zona: "admin", categoria: "Configuración", icono: "fa-building", visible_home: false, visible_admin: true, activo: true, orden_menu: 70 },
  { codigo: "TERMINALES", nombre: "Terminales", ruta: "/modulos/config/terminal/terminal.html", zona: "admin", categoria: "Configuración", icono: "fa-desktop", visible_home: false, visible_admin: true, activo: true, orden_menu: 80 },
  { codigo: "GENERADOR_CONTROL", nombre: "Generador de control", ruta: "/modulos/config/licencia_generador.html", zona: "admin", categoria: "Sistema", icono: "fa-shield-halved", visible_home: false, visible_admin: true, activo: true, orden_menu: 90 },
  { codigo: "MODELO_FACTURA", nombre: "Modelo de factura", ruta: "/modulos/modelo_factura/modelo_factura.html", zona: "admin", categoria: "Facturación", icono: "fa-file-contract", visible_home: false, visible_admin: true, activo: true, orden_menu: 100 }
];

async function ensureProgramasSchema() {
  await pool.query(`
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
  `);

  await pool.query(`
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
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_usuario_programa_usuario_programa
    ON usuario_programa(usuario_id, programa_id)
    WHERE programa_id IS NOT NULL;
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_usuario_programa_usuario
    ON usuario_programa(usuario_id);
  `);

  await seedProgramas();
}

async function seedProgramas() {
  for (const item of DEFAULT_PROGRAMAS) {
    await pool.query(
      `
      INSERT INTO programas
        (codigo, nombre, ruta, zona, categoria, icono, visible_home, visible_admin, activo, orden_menu)
      VALUES
        ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (codigo) DO UPDATE SET
        nombre = EXCLUDED.nombre,
        ruta = EXCLUDED.ruta,
        zona = EXCLUDED.zona,
        categoria = EXCLUDED.categoria,
        icono = EXCLUDED.icono,
        visible_home = EXCLUDED.visible_home,
        visible_admin = EXCLUDED.visible_admin,
        activo = EXCLUDED.activo,
        orden_menu = EXCLUDED.orden_menu,
        updated_at = NOW()
      `,
      [
        item.codigo,
        item.nombre,
        item.ruta,
        item.zona,
        item.categoria,
        item.icono,
        item.visible_home,
        item.visible_admin,
        item.activo,
        item.orden_menu
      ]
    );
  }
}

module.exports = {
  ensureProgramasSchema
};
