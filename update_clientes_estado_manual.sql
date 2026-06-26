-- ============================================================
-- update_clientes_estado_manual.sql
-- Fase 2: Agregar columna estado_manual a tabla clientes
-- Ejecutar en el editor SQL de Supabase
-- ============================================================

-- 1. Agregar la columna si no existe
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS estado_manual BOOLEAN DEFAULT false;

-- 2. Comentario explicativo
COMMENT ON COLUMN public.clientes.estado_manual IS 'Indica si el estado de la reserva fue fijado manualmente por un operador para omitir la reclasificación automática';

-- 3. Verificación
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'clientes'
  AND column_name = 'estado_manual';
