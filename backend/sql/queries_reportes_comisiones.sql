-- ================================================================
-- SoftSys - Queries Útiles para Reportes de Comisiones
-- ================================================================
-- Este archivo contiene ejemplos de consultas para análisis
-- de comisiones, auditoría y reportes
-- ================================================================

-- ================================================================
-- 1. RESUMEN DIARIO DE COMISIONES POR VENDEDOR
-- ================================================================

SELECT 
  DATE(v.fecha) AS fecha_venta,
  ve.nombre AS vendedor,
  COUNT(*) AS cantidad_ventas,
  SUM(v.total) AS total_ventas,
  SUM(v.comision) AS comision_total,
  ROUND(100.0 * SUM(v.comision) / NULLIF(SUM(v.total), 0), 2) AS porcentaje_comision,
  AVG(v.comision) AS comision_promedio
FROM venta v
LEFT JOIN vendedor ve ON ve.id = v.vendedor_id
WHERE v.estado = 'EFECTIVADO'
  AND v.fecha >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY DATE(v.fecha), ve.id, ve.nombre
ORDER BY fecha_venta DESC, total_ventas DESC;

-- ================================================================
-- 2. VENDEDOR CON MÁS COMISIONES ACUMULADAS
-- ================================================================

SELECT 
  ve.id,
  ve.nombre,
  COUNT(v.id) AS cantidad_ventas,
  SUM(v.total) AS total_ventas,
  SUM(v.comision) AS comision_total,
  ROUND(SUM(v.comision) / NULLIF(COUNT(v.id), 0), 2) AS comision_promedio_por_venta,
  MAX(v.fecha) AS ultima_venta
FROM vendedor ve
LEFT JOIN venta v ON v.vendedor_id = ve.id AND v.estado = 'EFECTIVADO'
WHERE v.fecha >= CURRENT_DATE - INTERVAL '90 days'
GROUP BY ve.id, ve.nombre
ORDER BY comision_total DESC NULLS LAST
LIMIT 10;

-- ================================================================
-- 3. COMISIONES PENDIENTES DE PAGO (Resumen por Vendedor)
-- ================================================================

SELECT 
  vcp.vendedor_id,
  ve.nombre,
  COUNT(vcp.id) AS cantidad_pendientes,
  SUM(vcp.comision_calculada) AS monto_total_calculado,
  SUM(vcp.comision_pagada) AS monto_total_pagado,
  SUM(vcp.comision_calculada - vcp.comision_pagada) AS monto_pendiente,
  MIN(vcp.fecha_venta) AS fecha_primera_venta,
  MAX(vcp.fecha_venta) AS fecha_ultima_venta
FROM vendedor_comision_pago vcp
LEFT JOIN vendedor ve ON ve.id = vcp.vendedor_id
WHERE vcp.estado IN ('PENDIENTE', 'AJUSTADA')
GROUP BY vcp.vendedor_id, ve.nombre
ORDER BY monto_pendiente DESC;

-- ================================================================
-- 4. HISTORIAL DE CAMBIOS EN COMISIÓN (Auditoría)
-- ================================================================

SELECT 
  vcc.fecha_cambio,
  ve.nombre AS vendedor,
  CASE 
    WHEN vcc.tipo_comision_anterior IS NULL THEN 'CREACIÓN'
    ELSE 'CAMBIO'
  END AS tipo_accion,
  CONCAT(
    'Tipo: ', vcc.tipo_comision_anterior, ' → ', vcc.tipo_comision_nuevo, ' | ',
    'Ventas: ', COALESCE(vcc.porcentaje_ventas_anterior::TEXT, '-'), '% → ', 
    vcc.porcentaje_ventas_nuevo, '% | ',
    'Servicios: ', COALESCE(vcc.porcentaje_servicios_anterior::TEXT, '-'), '% → ',
    vcc.porcentaje_servicios_nuevo, '%'
  ) AS cambios,
  u.nombre AS usuario,
  vcc.observaciones
FROM vendedor_comision_cambios vcc
LEFT JOIN vendedor ve ON ve.id = vcc.vendedor_id
LEFT JOIN usuario u ON u.id = vcc.usuario_id
ORDER BY vcc.fecha_cambio DESC
LIMIT 100;

-- ================================================================
-- 5. COMISIONES POR RANGO DE FECHA (Período Específico)
-- ================================================================

SELECT 
  vcp.vendedor_id,
  ve.nombre,
  COUNT(vcp.id) AS ventas,
  SUM(vcp.comision_calculada) AS comision,
  vcp.estado
FROM vendedor_comision_pago vcp
LEFT JOIN vendedor ve ON ve.id = vcp.vendedor_id
WHERE vcp.fecha_venta >= '2026-04-01'
  AND vcp.fecha_venta <= '2026-04-14'
GROUP BY vcp.vendedor_id, ve.nombre, vcp.estado
ORDER BY ve.nombre, vcp.estado;

-- ================================================================
-- 6. COMISIONES REVERTIDAS Y AJUSTADAS
-- ================================================================

SELECT 
  vcp.id,
  vcp.fecha_venta,
  ve.nombre AS vendedor,
  v.numero AS numero_venta,
  vcp.comision_calculada,
  vcp.comision_pagada,
  vcp.estado,
  vcp.observaciones
FROM vendedor_comision_pago vcp
LEFT JOIN vendedor ve ON ve.id = vcp.vendedor_id
LEFT JOIN venta v ON v.id = vcp.venta_id
WHERE vcp.estado IN ('REVERTIDA', 'AJUSTADA')
ORDER BY vcp.fecha_venta DESC;

-- ================================================================
-- 7. COMPARACIÓN: CONFIGURACIÓN DE COMISIÓN POR VENDEDOR
-- ================================================================

SELECT 
  v.id,
  v.nombre,
  v.activo,
  v.tipo_comision,
  v.tipo_calculo_comision,
  v.porcentaje_ventas,
  v.porcentaje_servicios,
  v.comision_por_cantidad,
  (SELECT COUNT(*) FROM vendedor_comision_cambios WHERE vendedor_id = v.id) AS cambios_registrados,
  (SELECT COUNT(*) FROM venta WHERE vendedor_id = v.id AND estado = 'EFECTIVADO') AS ventas_efectivadas
FROM vendedor v
ORDER BY v.nombre;

-- ================================================================
-- 8. COMISIONES NO COINCIDENTES (Inconsistencias)
-- ================================================================

SELECT 
  v.id,
  v.numero,
  v.fecha,
  ve.nombre AS vendedor,
  v.comision AS comision_venta,
  COALESCE(vcp.comision_calculada, 0) AS comision_pagada_registrada,
  (v.comision - COALESCE(vcp.comision_calculada, 0)) AS diferencia
FROM venta v
LEFT JOIN vendedor ve ON ve.id = v.vendedor_id
LEFT JOIN vendedor_comision_pago vcp ON vcp.venta_id = v.id
WHERE v.estado = 'EFECTIVADO'
  AND v.comision != COALESCE(vcp.comision_calculada, 0)
LIMIT 50;

-- ================================================================
-- 9. ACTIVIDAD DE COMISIONES POR HORA
-- ================================================================

SELECT 
  EXTRACT(HOUR FROM v.fecha) AS hora,
  COUNT(*) AS cantidad_ventas,
  SUM(v.total) AS total_ventas,
  SUM(v.comision) AS comision_total,
  ROUND(AVG(v.comision), 2) AS comision_promedio
FROM venta v
WHERE v.estado = 'EFECTIVADO'
  AND v.fecha::DATE = CURRENT_DATE
GROUP BY EXTRACT(HOUR FROM v.fecha)
ORDER BY hora;

-- ================================================================
-- 10. PRODUCTOS CON MAYOR COMISIÓN GENERADA
-- ================================================================

SELECT 
  p.nombre AS producto,
  p.es_servicio,
  c.nombre AS categoria,
  SUM(vd.cantidad) AS cantidad_vendida,
  SUM(vd.subtotal) AS monto_vendido,
  SUM(v.comision) AS comision_generada,
  ROUND(100.0 * SUM(v.comision) / NULLIF(SUM(vd.subtotal), 0), 2) AS porcentaje_comision
FROM venta_detalle vd
JOIN venta v ON v.id = vd.venta_id
JOIN producto p ON p.id = vd.producto_id
LEFT JOIN categoria c ON c.id = p.categoria_id
WHERE v.estado = 'EFECTIVADO'
  AND v.fecha >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY p.id, p.nombre, p.es_servicio, c.id, c.nombre
ORDER BY comision_generada DESC
LIMIT 20;

-- ================================================================
-- 11. EVOLUCIÓN MENSUAL DE COMISIONES
-- ================================================================

SELECT 
  DATE_TRUNC('month', v.fecha)::DATE AS mes,
  ve.nombre AS vendedor,
  COUNT(*) AS cantidad_ventas,
  SUM(v.total) AS total_ventas,
  SUM(v.comision) AS comision_total,
  ROUND(100.0 * SUM(v.comision) / NULLIF(SUM(v.total), 0), 2) AS porcentaje_comision
FROM venta v
LEFT JOIN vendedor ve ON ve.id = v.vendedor_id
WHERE v.estado = 'EFECTIVADO'
  AND v.fecha >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '12 months')
GROUP BY DATE_TRUNC('month', v.fecha), ve.id, ve.nombre
ORDER BY mes DESC, total_ventas DESC;

-- ================================================================
-- 12. VENDEDORES CON CAMBIOS RECIENTES DE COMISIÓN
-- ================================================================

SELECT 
  ve.id,
  ve.nombre,
  MAX(vcc.fecha_cambio) AS ultima_modificacion,
  COUNT(vcc.id) AS total_cambios,
  -- Mostrar último cambio
  (SELECT jsonb_build_object(
    'antes', jsonb_build_object(
      'porcentaje_ventas', COALESCE(vcc.porcentaje_ventas_anterior, 0),
      'porcentaje_servicios', COALESCE(vcc.porcentaje_servicios_anterior, 0)
    ),
    'ahora', jsonb_build_object(
      'porcentaje_ventas', vcc.porcentaje_ventas_nuevo,
      'porcentaje_servicios', vcc.porcentaje_servicios_nuevo
    )
   ) FROM vendedor_comision_cambios vcc2 
   WHERE vcc2.vendedor_id = ve.id 
   ORDER BY vcc2.fecha_cambio DESC LIMIT 1) AS ultimo_cambio
FROM vendedor ve
LEFT JOIN vendedor_comision_cambios vcc ON vcc.vendedor_id = ve.id
WHERE vcc.fecha_cambio >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY ve.id, ve.nombre
ORDER BY ultima_modificacion DESC;

-- ================================================================
-- 13. ESTADÍSTICAS DE COMISIÓN POR CONFIGURACIÓN
-- ================================================================

SELECT 
  ve.tipo_comision,
  ve.tipo_calculo_comision,
  COUNT(ve.id) AS cantidad_vendedores,
  COUNT(DISTINCT v.id) AS cantidad_ventas,
  SUM(v.total) AS total_ventas,
  SUM(v.comision) AS comision_total,
  ROUND(AVG(v.comision), 2) AS comision_promedio,
  ROUND(MIN(v.comision), 2) AS comision_minima,
  ROUND(MAX(v.comision), 2) AS comision_maxima
FROM vendedor ve
LEFT JOIN venta v ON v.vendedor_id = ve.id AND v.estado = 'EFECTIVADO'
WHERE v.fecha >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY ve.tipo_comision, ve.tipo_calculo_comision
ORDER BY comision_total DESC NULLS LAST;

-- ================================================================
-- 14. VALIDAR INTEGRIDAD: VENTAS SIN REGISTRO DE COMISIÓN
-- ================================================================

SELECT 
  v.id,
  v.numero,
  v.fecha,
  ve.nombre AS vendedor,
  v.total,
  v.comision,
  COUNT(vcp.id) AS tiene_registro_comision
FROM venta v
LEFT JOIN vendedor ve ON ve.id = v.vendedor_id
LEFT JOIN vendedor_comision_pago vcp ON vcp.venta_id = v.id
WHERE v.estado = 'EFECTIVADO'
  AND v.fecha >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY v.id, v.numero, v.fecha, ve.id, ve.nombre, v.total, v.comision
HAVING COUNT(vcp.id) = 0
ORDER BY v.fecha DESC;

-- ================================================================
-- 15. PROYECCIÓN: COMISIONES DEL MES ACTUAL
-- ================================================================

SELECT 
  ve.id,
  ve.nombre,
  COUNT(v.id) AS ventas_hasta_hoy,
  SUM(v.total) AS total_vendido_hasta_hoy,
  SUM(v.comision) AS comision_hasta_hoy,
  ROUND(
    SUM(v.comision) * (
      DAY(DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month' - INTERVAL '1 day')::NUMERIC /
      DAY(CURRENT_DATE)::NUMERIC
    ), 2
  ) AS comision_proyectada_mes
FROM venta v
LEFT JOIN vendedor ve ON ve.id = v.vendedor_id
WHERE v.estado = 'EFECTIVADO'
  AND v.fecha >= DATE_TRUNC('month', CURRENT_DATE)
GROUP BY ve.id, ve.nombre
ORDER BY comision_hasta_hoy DESC;

-- ================================================================
-- VISTAS ÚTILES PARA DASHBOARDS
-- ================================================================

-- Vista 1: Comisiones del día actual
CREATE OR REPLACE VIEW v_comisiones_hoy AS
SELECT 
  ve.nombre AS vendedor,
  COUNT(*) AS ventas,
  SUM(v.total) AS total,
  SUM(v.comision) AS comision
FROM venta v
LEFT JOIN vendedor ve ON ve.id = v.vendedor_id
WHERE DATE(v.fecha) = CURRENT_DATE
  AND v.estado = 'EFECTIVADO'
GROUP BY ve.id, ve.nombre;

-- Vista 2: Top 5 vendedores del mes
CREATE OR REPLACE VIEW v_top_vendedores_mes AS
SELECT 
  ve.nombre,
  SUM(v.comision) AS comision
FROM venta v
LEFT JOIN vendedor ve ON ve.id = v.vendedor_id
WHERE DATE_TRUNC('month', v.fecha) = DATE_TRUNC('month', CURRENT_DATE)
  AND v.estado = 'EFECTIVADO'
GROUP BY ve.id, ve.nombre
ORDER BY comision DESC
LIMIT 5;

-- Vista 3: Comisiones pendientes urgentes (> 30 días)
CREATE OR REPLACE VIEW v_comisiones_pendientes_urgentes AS
SELECT 
  vcp.id,
  ve.nombre,
  vcp.comision_calculada - vcp.comision_pagada AS monto_pendiente,
  CURRENT_DATE - vcp.fecha_venta AS dias_pendiente
FROM vendedor_comision_pago vcp
LEFT JOIN vendedor ve ON ve.id = vcp.vendedor_id
WHERE vcp.estado IN ('PENDIENTE', 'AJUSTADA')
  AND (CURRENT_DATE - vcp.fecha_venta) > 30
ORDER BY dias_pendiente DESC;
