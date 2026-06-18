-- Script SQL: Configuración de Fondos Flotantes (Capital de Trabajo Flotante)
-- Ejecutar en el Editor SQL de Supabase para crear la tabla y configurar seguridad RLS.

CREATE TABLE IF NOT EXISTS public.fondos_flotantes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    cliente_nombre TEXT NOT NULL,
    plan_nombre TEXT NOT NULL,
    monto NUMERIC(15, 2) NOT NULL DEFAULT 0,
    fecha_registro DATE NOT NULL DEFAULT CURRENT_DATE,
    fecha_limite DATE NOT NULL,
    estado TEXT NOT NULL CHECK (estado IN ('disponible', 'aplicado_reserva')) DEFAULT 'disponible',
    usuario_email TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    deleted_by TEXT
);

-- Habilitar RLS (Row Level Security)
ALTER TABLE public.fondos_flotantes ENABLE ROW LEVEL SECURITY;

-- Eliminar política anterior si existe para evitar conflictos
DROP POLICY IF EXISTS "Permitir todo a usuarios autenticados" ON public.fondos_flotantes;

-- Crear política de acceso para usuarios autenticados
CREATE POLICY "Permitir todo a usuarios autenticados" ON public.fondos_flotantes
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
