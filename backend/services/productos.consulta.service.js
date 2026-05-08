const pool = require("../db");
const { ensureMonedaSchema } = require("./moneda.schema.service");

function toText(value) {
  if (value == null) return "";
  return String(value).trim();
}

function toPositiveInt(value, fallback = null) {
  const n = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

function toBooleanNullable(value) {
  if (value === undefined || value === null || value === "") return null;
  const raw = String(value).trim().toLowerCase();
  if (["true", "1", "si", "yes"].includes(raw)) return true;
  if (["false", "0", "no"].includes(raw)) return false;
  return null;
}

function normalizeTipoSaldo(value) {
  const raw = toText(value).toLowerCase();
  if (["mayor_0", "mayor", "positivo", ">0"].includes(raw)) return "mayor_0";
  if (["igual_0", "cero", "=0"].includes(raw)) return "igual_0";
  return "todos";
}

function normalizeTipoValor(value) {
  const raw = toText(value).toLowerCase();
  if (["venta", "precio_venta", "minorista"].includes(raw)) return "minorista";
  if (["mayorista", "precio_mayorista"].includes(raw)) return "mayorista";
  if (["compra", "precio_compra", "costo", "costo_mayor_0"].includes(raw)) return "costo";
  if (["minimo", "precio_minimo"].includes(raw)) return "minimo";
  if (["promocional", "promo", "precio_promocional"].includes(raw)) return "promocional";
  return "todos";
}

function normalizeSort(value) {
  const raw = toText(value).toLowerCase();
  if (["id", "nombre", "stock", "precio_venta", "precio_compra"].includes(raw)) return raw;
  return "id";
}

function normalizeMonedaCompraId(value) {
  const id = toPositiveInt(value);
  if (id === 1 || id === 2 || id === 3) return id;
  return null;
}

function normalizeDirection(value) {
  return String(value || "").toLowerCase() === "asc" ? "ASC" : "DESC";
}

function precioMayoristaExpr(alias = "pp") {
  return `
    COALESCE(
      CASE
        WHEN COALESCE(to_jsonb(${alias})->>'precio_mayorista', '') ~ '^-?[0-9]+(\\.[0-9]+)?$'
          THEN (to_jsonb(${alias})->>'precio_mayorista')::numeric
        ELSE NULL
      END,
      COALESCE(${alias}.precio_venta, 0)
    )
  `;
}

function buildWhereAndParams(filters) {
  const where = [];
  const params = [];
  const mayoristaSql = precioMayoristaExpr("pp");

  const add = (sqlPart, value) => {
    params.push(value);
    where.push(sqlPart.replace(/\$\?/g, `$${params.length}`));
  };

  if (!filters.mostrar_inactivos) {
    where.push("p.activo = true");
  }

  if (filters.codigo_producto) {
    add("CAST(p.id AS TEXT) = $?", filters.codigo_producto);
  }

  if (filters.codigo_marca) {
    add("COALESCE(to_jsonb(p)->>'codigo_marca', to_jsonb(p)->>'marca_id', '') ILIKE $?", `%${filters.codigo_marca}%`);
  }

  if (filters.descripcion) {
    add("(LOWER(p.nombre) LIKE LOWER($?) OR LOWER(COALESCE(p.descripcion, '')) LIKE LOWER($?))", `%${filters.descripcion}%`);
  }

  if (filters.codigo_barra) {
    add("COALESCE(p.codigo_barra, '') ILIKE $?", `%${filters.codigo_barra}%`);
  }

  if (filters.categoria_id) {
    add("p.categoria_id = $?", filters.categoria_id);
  }

  if (filters.moneda_compra_id) {
    add("COALESCE(pp.precio_compra_moneda_id, 1) = $?", filters.moneda_compra_id);
  }

  if (filters.empresa_id) {
    const includeNoHistory = (
      Number.isFinite(filters.empresa_base_id)
      && filters.empresa_base_id > 0
      && filters.empresa_base_id === filters.empresa_id
    );

    add(`
      (
        EXISTS (
          SELECT 1
          FROM compra_detalle cd
          JOIN compra c ON c.id = cd.compra_id
          WHERE cd.producto_id = p.id
            AND c.empresa_id = $?
          LIMIT 1
        )
        OR EXISTS (
          SELECT 1
          FROM stock_movimiento sm
          WHERE sm.producto_id = p.id
            AND sm.empresa_id = $?
          LIMIT 1
        )
        ${includeNoHistory ? `
          OR (
            NOT EXISTS (
              SELECT 1
              FROM compra_detalle cd_any
              WHERE cd_any.producto_id = p.id
              LIMIT 1
            )
            AND NOT EXISTS (
              SELECT 1
              FROM stock_movimiento sm_any
              WHERE sm_any.producto_id = p.id
              LIMIT 1
            )
          )
        ` : ""}
      )
    `, filters.empresa_id);
  }

  if (filters.destino) {
    add("COALESCE(p.destino_impresion, '') ILIKE $?", `%${filters.destino}%`);
  }

  if (filters.iva_tipo) {
    add("CAST(COALESCE(p.iva_tipo, 0) AS TEXT) = $?", filters.iva_tipo);
  }

  if (typeof filters.es_insumo === "boolean") {
    add("p.es_insumo = $?", filters.es_insumo);
  }

  if (typeof filters.no_control_stock === "boolean") {
    add("p.no_control_stock = $?", filters.no_control_stock);
  }

  if (typeof filters.facturacion_directa === "boolean") {
    add("p.facturacion_directa = $?", filters.facturacion_directa);
  }

  if (filters.tipo_saldo === "mayor_0") {
    where.push("COALESCE(p.stock, 0) > 0");
  } else if (filters.tipo_saldo === "igual_0") {
    where.push("COALESCE(p.stock, 0) = 0");
  }

  if (filters.tipo_valor === "minorista") {
    where.push("COALESCE(pp.precio_venta, 0) > 0");
  } else if (filters.tipo_valor === "mayorista") {
    where.push(`${mayoristaSql} > 0`);
  } else if (filters.tipo_valor === "costo") {
    where.push("(COALESCE(pp.precio_compra_origen, pp.precio_compra, 0) + COALESCE(pp.costo_transporte, 0)) > 0");
  } else if (filters.tipo_valor === "minimo") {
    where.push("COALESCE(pp.precio_minimo, 0) > 0");
  } else if (filters.tipo_valor === "promocional") {
    where.push("COALESCE(pp.precio_promocional, 0) > 0");
  }

  return { where, params };
}

function parseFilters(query = {}) {
  const page = toPositiveInt(query.page, 1);
  const limitRaw = toPositiveInt(query.limit, 200);
  const limit = Math.min(Math.max(limitRaw || 200, 1), 2000);

  return {
    codigo_producto: toText(query.codigo_producto),
    codigo_marca: toText(query.codigo_marca),
    descripcion: toText(query.descripcion),
    codigo_barra: toText(query.codigo_barra),
    mostrar_inactivos: toBooleanNullable(query.mostrar_inactivos) === true,
    tipo_saldo: normalizeTipoSaldo(query.tipo_saldo),
    tipo_valor: normalizeTipoValor(query.tipo_valor),
    empresa_id: toPositiveInt(query.empresa_id),
    empresa_base_id: toPositiveInt(query.empresa_base_id),
    moneda_compra_id: normalizeMonedaCompraId(query.moneda_compra_id),
    categoria_id: toPositiveInt(query.categoria_id),
    destino: toText(query.destino),
    iva_tipo: toText(query.iva_tipo),
    es_insumo: toBooleanNullable(query.es_insumo),
    no_control_stock: toBooleanNullable(query.no_control_stock),
    facturacion_directa: toBooleanNullable(query.facturacion_directa),
    sort_by: normalizeSort(query.sort_by),
    sort_dir: normalizeDirection(query.sort_dir),
    page,
    limit,
    offset: (page - 1) * limit
  };
}

async function consultarProductosAvanzado(rawQuery = {}) {
  await ensureMonedaSchema();
  const filters = parseFilters(rawQuery);
  const { where, params } = buildWhereAndParams(filters);
  const mayoristaSql = precioMayoristaExpr("pp");

  const sortMap = {
    id: "p.id",
    nombre: "p.nombre",
    stock: "p.stock",
    precio_venta: "COALESCE(pp.precio_venta, 0)",
    precio_compra: "COALESCE(pp.precio_compra_origen, pp.precio_compra, 0)"
  };

  const orderBy = sortMap[filters.sort_by] || "p.id";

  params.push(filters.limit);
  const limitParam = `$${params.length}`;
  params.push(filters.offset);
  const offsetParam = `$${params.length}`;

  const sql = `
    SELECT
      p.id,
      p.nombre,
      p.descripcion,
      p.stock,
      p.activo,
      p.iva_tipo,
      p.categoria_id,
      p.codigo_barra,
      p.destino_impresion,
      p.es_insumo,
      p.no_control_stock,
      p.facturacion_directa,
      c.nombre AS categoria_nombre,
      COALESCE(to_jsonb(p)->>'codigo_marca', to_jsonb(p)->>'marca_id', '') AS codigo_marca,
      COALESCE(pp.precio_compra_origen, pp.precio_compra, 0) AS precio_compra,
      COALESCE(pp.precio_compra_origen, pp.precio_compra, 0) AS precio_compra_origen,
      COALESCE(pp.precio_compra, 0) AS precio_compra_gs_compat,
      COALESCE(pp.precio_compra_moneda_id, 1) AS precio_compra_moneda_id,
      COALESCE(pp.costo_transporte, 0) AS costo_transporte,
      COALESCE(pp.precio_venta, 0) AS precio_venta,
      ${mayoristaSql} AS precio_mayorista,
      COALESCE(pp.precio_minimo, 0) AS precio_minimo,
      COALESCE(pp.precio_promocional, 0) AS precio_promocional,
      (COALESCE(pp.precio_compra_origen, pp.precio_compra, 0) + COALESCE(pp.costo_transporte, 0)) AS costo_total,
      (COALESCE(pp.precio_compra, 0) + COALESCE(pp.costo_transporte, 0)) AS costo_total_gs_compat
    FROM producto p
    LEFT JOIN categoria c ON c.id = p.categoria_id
    LEFT JOIN producto_precio pp
      ON pp.producto_id = p.id
      AND pp.activo = true
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY ${orderBy} ${filters.sort_dir}, p.id DESC
    LIMIT ${limitParam}
    OFFSET ${offsetParam}
  `;

  const result = await pool.query(sql, params);

  return {
    filtros: filters,
    total: result.rowCount,
    rows: result.rows
  };
}

async function consultarDetalleProducto(productoIdRaw, empresaIdRaw = null) {
  await ensureMonedaSchema();

  const productoId = toPositiveInt(productoIdRaw);
  if (!productoId) {
    throw new Error("producto_id invalido");
  }

  const empresaId = toPositiveInt(empresaIdRaw);

  const sql = `
    SELECT
      c.fecha AS fecha_ultima_compra,
      COALESCE(pr.id::text || '-' || pr.nombre, '-') AS ultimo_proveedor,
      COALESCE(c.numero_compra, c.id::text, '-') AS numero_ultimo_movimiento,
      COALESCE(cd.costo_moneda_origen, cd.costo, 0) AS ultima_compra,
      COALESCE(
        cd.costo_moneda_origen,
        cd.costo,
        pp.costo_total_origen,
        0
      ) AS costo_final,
      COALESCE(cd.moneda_id, pp.precio_compra_moneda_id, 1) AS moneda_id,
      COALESCE(m.nombre, CASE COALESCE(cd.moneda_id, pp.precio_compra_moneda_id, 1)
        WHEN 1 THEN 'GUARANI'
        WHEN 2 THEN 'REAL'
        WHEN 3 THEN 'DOLAR'
        ELSE 'GUARANI'
      END) AS moneda,
      ''::text AS localizacion_producto
    FROM compra_detalle cd
    JOIN compra c ON c.id = cd.compra_id
    LEFT JOIN proveedor pr ON pr.id = c.proveedor_id
    LEFT JOIN moneda m ON m.id = COALESCE(cd.moneda_id, c.moneda_id, 1)
    LEFT JOIN LATERAL (
      SELECT
        (COALESCE(px.precio_compra_origen, px.precio_compra, 0) + COALESCE(px.costo_transporte, 0)) AS costo_total_origen,
        COALESCE(px.precio_compra_moneda_id, 1) AS precio_compra_moneda_id
      FROM producto_precio px
      WHERE px.producto_id = cd.producto_id
        AND px.activo = true
      ORDER BY px.id DESC
      LIMIT 1
    ) pp ON true
    WHERE cd.producto_id = $1
      AND ($2::int IS NULL OR c.empresa_id = $2)
    ORDER BY c.fecha DESC NULLS LAST, c.id DESC, cd.id DESC
    LIMIT 1
  `;

  const result = await pool.query(sql, [productoId, empresaId || null]);
  return result.rows[0] || {
    fecha_ultima_compra: null,
    ultimo_proveedor: "-",
    numero_ultimo_movimiento: "-",
    ultima_compra: null,
    costo_final: null,
    moneda_id: 1,
    moneda: "-",
    localizacion_producto: ""
  };
}

module.exports = {
  consultarDetalleProducto,
  consultarProductosAvanzado
};
