-- ============================================================
-- SQL MIGRATION: CORRECCIÓN DE TARIFAS Y SALDOS - GRUPO KARINA CUETO
-- Ejecutar este bloque en el Editor SQL de Supabase (SQL Editor)
-- de tu proyecto de producción (qefuqkplornelbzwqgri)
-- ============================================================

-- 1. INSPECCIÓN ANTES DEL CAMBIO:
-- Validamos los datos actuales de los 4 integrantes del grupo
SELECT id, nombre, apellido, precio_total, abono_acumulado, saldo_restante, estado, parent_id
FROM public.clientes
WHERE (nombre ILIKE '%Karina%patricia%' AND apellido ILIKE '%Cueto%')
   OR parent_id IN (
      SELECT id FROM public.clientes WHERE nombre ILIKE '%Karina%patricia%' AND apellido ILIKE '%Cueto%'
   )
   AND deleted_at IS NULL;

-- 2. ACTUALIZACIÓN DIRECTA:
-- Corregimos el precio individual por persona a 1.488.414 y recalculamos su saldo pendiente
UPDATE public.clientes
SET precio_total = 1488414,
    saldo_restante = 1488414 - COALESCE(abono_acumulado, 0)
WHERE (
    (nombre ILIKE '%Karina%patricia%' AND apellido ILIKE '%Cueto%')
    OR parent_id IN (
      SELECT id FROM public.clientes WHERE nombre ILIKE '%Karina%patricia%' AND apellido ILIKE '%Cueto%'
    )
)
AND deleted_at IS NULL;

-- 3. INSPECCIÓN DESPUÉS DEL CAMBIO:
-- Verificamos que los precios y saldos se hayan actualizado correctamente
SELECT id, nombre, apellido, precio_total, abono_acumulado, saldo_restante, estado, parent_id
FROM public.clientes
WHERE (nombre ILIKE '%Karina%patricia%' AND apellido ILIKE '%Cueto%')
   OR parent_id IN (
      SELECT id FROM public.clientes WHERE nombre ILIKE '%Karina%patricia%' AND apellido ILIKE '%Cueto%'
   )
   AND deleted_at IS NULL;
