-- ============================================================
-- SQL SCRIPT: ELIMINACIÓN DE ABONOS CREADOS HOY POR ERROR (GRUPO KARINA CUETO)
-- Ejecuta este script en el Editor SQL de Supabase para limpiar
-- los abonos de prueba creados hoy por Jean Fontalvo.
-- ============================================================

BEGIN;

-- Desactivar temporalmente el trigger por seguridad
ALTER TABLE abonos DISABLE TRIGGER enforce_abono_freeze;

-- 1. Eliminar abonos creados el día de hoy para el grupo de Karina Cueto
DELETE FROM public.abonos
WHERE created_at >= '2026-06-26 00:00:00+00'
  AND cliente_id IN (
      '22cdc569-4a1d-42ed-897d-3f6c9842c684', -- Karina
      'd07d65bf-7d42-4b9d-b192-c3d7ac688cc2', -- Angelly
      '0c742e3b-e938-4df0-ad01-790c5edebc5f', -- Edgar
      'b690425f-d458-4ab8-a5c3-a9841c04c149'  -- Brian
  );

-- Reactivar el trigger de seguridad
ALTER TABLE abonos ENABLE TRIGGER enforce_abono_freeze;

COMMIT;
