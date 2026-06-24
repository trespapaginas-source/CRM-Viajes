-- ============================================================
-- Script SQL: Tabla de Alertas Gestionadas (Notificaciones)
-- Ejecuta este script en el editor SQL de Supabase para crear la tabla.
-- ============================================================

-- 1. Crear tabla de Alertas Gestionadas
CREATE TABLE IF NOT EXISTS public.alertas_gestionadas (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tipo TEXT NOT NULL CHECK (tipo IN ('1d_checkin', '1d_checkout', '2d', '3d', '4d')),
    plan_id UUID NOT NULL REFERENCES public.planes(id) ON DELETE CASCADE,
    fecha_viaje TEXT NOT NULL,
    creado_por TEXT NOT NULL DEFAULT 'Staff',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_tipo_plan_fecha UNIQUE (tipo, plan_id, fecha_viaje)
);

-- Habilitar Row Level Security (RLS)
ALTER TABLE public.alertas_gestionadas ENABLE ROW LEVEL SECURITY;

-- Crear políticas para permitir lectura/escritura a usuarios autenticados y anónimos (si aplica)
DROP POLICY IF EXISTS "Permitir todo a usuarios autenticados" ON public.alertas_gestionadas;
CREATE POLICY "Permitir todo a usuarios autenticados" ON public.alertas_gestionadas
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir todo a usuarios anonimos" ON public.alertas_gestionadas;
CREATE POLICY "Permitir todo a usuarios anonimos" ON public.alertas_gestionadas
    FOR ALL TO anon USING (true) WITH CHECK (true);
