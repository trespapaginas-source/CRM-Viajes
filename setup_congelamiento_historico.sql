-- ============================================================
-- SQL MIGRATION: CONGELAMIENTO HISTÓRICO DE TARIFAS Y SERVICIOS
-- Ejecutar en el Editor SQL de Supabase
-- ============================================================

-- 1. Añadir columnas de congelamiento a la tabla de clientes
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS proveedores_vinculados JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS costo_base NUMERIC DEFAULT 0;

-- 2. Migrar registros existentes copiando el costo_base y proveedores_vinculados de sus planes asociados
UPDATE public.clientes c
SET 
    costo_base = COALESCE(p.costo_base, 0),
    proveedores_vinculados = COALESCE(p.proveedores_vinculados, '[]'::jsonb)
FROM public.planes p
WHERE c.plan_id = p.id
  AND (c.costo_base IS NULL OR c.costo_base = 0);
