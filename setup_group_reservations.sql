-- ============================================================
-- SQL MIGRATION: SOPORTE PARA RESERVAS GRUPALES Y ABONOS
-- Ejecutar en el Editor SQL de Supabase
-- ============================================================

-- 1. Agregar columna parent_id en la tabla clientes (relaciona acompañantes con el titular)
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL;

-- 2. Agregar columna parent_abono_id en la tabla abonos (relaciona abonos distribuidos con el abono del titular)
ALTER TABLE public.abonos ADD COLUMN IF NOT EXISTS parent_abono_id UUID REFERENCES public.abonos(id) ON DELETE CASCADE;

-- 3. Crear índices para optimizar las consultas de relaciones grupales y abonos
CREATE INDEX IF NOT EXISTS idx_clientes_parent_id ON public.clientes(parent_id);
CREATE INDEX IF NOT EXISTS idx_abonos_parent_abono_id ON public.abonos(parent_abono_id);
