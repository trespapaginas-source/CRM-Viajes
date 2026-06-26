-- ============================================================
-- SQL SCRIPT: RESTAURACIÓN DE ABONOS Y RECALCULACIÓN DE SALDOS
-- Ejecuta este script en el Editor SQL de Supabase para revertir
-- la depuración masiva y restaurar los pagos legítimos.
-- ============================================================

BEGIN;

-- Desactivar temporalmente el trigger de seguridad
ALTER TABLE abonos DISABLE TRIGGER enforce_abono_freeze;

-- 1. Restaurar todos los abonos eliminados por el script de depuración masiva
UPDATE public.abonos
SET 
    deleted_at = NULL,
    deleted_by = NULL,
    motivo_eliminacion = NULL
WHERE deleted_by = 'script_depuracion_masiva_admin@vtravel.com';

-- 2. Recalcular abono_acumulado y saldo_restante para todos los clientes activos
WITH abonos_calc AS (
    SELECT 
        cliente_id,
        COALESCE(SUM(monto), 0) AS total_recaudado
    FROM public.abonos
    WHERE deleted_at IS NULL
      AND estado_pago NOT IN ('pending', 'refunded')
    GROUP BY cliente_id
)
UPDATE public.clientes c
SET 
    abono_acumulado = COALESCE(ac.total_recaudado, 0),
    saldo_restante = GREATEST(0, c.precio_total - COALESCE(ac.total_recaudado, 0))
FROM (
    SELECT id FROM public.clientes WHERE deleted_at IS NULL
) cl
LEFT JOIN abonos_calc ac ON cl.id = ac.cliente_id
WHERE c.id = cl.id;

-- Reactivar el trigger de seguridad
ALTER TABLE abonos ENABLE TRIGGER enforce_abono_freeze;

COMMIT;
