-- ============================================================
-- Script SQL: Configuración de Tablas de Seguimientos y Socios
-- Ejecuta este script en el editor SQL de Supabase para crear las tablas faltantes.
-- ============================================================

-- 1. Crear tabla de Seguimientos (Bitácora de Clientes)
CREATE TABLE IF NOT EXISTS public.seguimientos (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    cliente_id UUID REFERENCES public.clientes(id) ON DELETE CASCADE,
    fecha_programada DATE NOT NULL DEFAULT CURRENT_DATE,
    nota TEXT NOT NULL,
    estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'completado')),
    creado_por TEXT NOT NULL DEFAULT 'Staff',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Habilitar Row Level Security (RLS) para Seguimientos
ALTER TABLE public.seguimientos ENABLE ROW LEVEL SECURITY;

-- Crear políticas para permitir lectura/escritura a usuarios autenticados
DROP POLICY IF EXISTS "Permitir todo a usuarios autenticados" ON public.seguimientos;
CREATE POLICY "Permitir todo a usuarios autenticados" ON public.seguimientos
    FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- 2. Crear tabla de Configuración de Socios (Partners Shares)
CREATE TABLE IF NOT EXISTS public.socios_config (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    nombre TEXT NOT NULL,
    email TEXT NOT NULL,
    porcentaje NUMERIC(5, 2) NOT NULL DEFAULT 0 CHECK (porcentaje >= 0 AND porcentaje <= 100),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Habilitar Row Level Security (RLS) para Configuración de Socios
ALTER TABLE public.socios_config ENABLE ROW LEVEL SECURITY;

-- Crear políticas para permitir lectura/escritura a usuarios autenticados
DROP POLICY IF EXISTS "Permitir todo a usuarios autenticados" ON public.socios_config;
CREATE POLICY "Permitir todo a usuarios autenticados" ON public.socios_config
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
