-- Script SQL: Configuración de Biblioteca de Documentos y Cotizaciones Compartidas
-- Ejecutar en el Editor SQL de Supabase para crear la tabla y configurar seguridad RLS.

CREATE TABLE IF NOT EXISTS public.documentos_guardados (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    nombre TEXT NOT NULL,
    tipo TEXT NOT NULL CHECK (tipo IN ('cotizacion', 'soporte')),
    datos JSONB NOT NULL,
    creado_por TEXT NOT NULL,
    editado_por TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    deleted_by TEXT
);

-- Habilitar RLS
ALTER TABLE public.documentos_guardados ENABLE ROW LEVEL SECURITY;

-- Eliminar política anterior si existe para evitar conflictos
DROP POLICY IF EXISTS "Permitir todo a usuarios autenticados" ON public.documentos_guardados;

-- Crear política de acceso para usuarios autenticados
CREATE POLICY "Permitir todo a usuarios autenticados" ON public.documentos_guardados
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
