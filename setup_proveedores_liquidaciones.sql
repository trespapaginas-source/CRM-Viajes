-- ============================================================
-- SQL: CONFIGURACIÓN DE TABLA DE LIQUIDACIONES A PROVEEDORES
-- Ejecutar en el Editor SQL de Supabase
-- ============================================================

CREATE TABLE IF NOT EXISTS public.proveedores_liquidaciones (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    proveedor_id UUID REFERENCES public.proveedores(id) ON DELETE CASCADE,
    monto NUMERIC NOT NULL CHECK (monto > 0),
    fecha DATE NOT NULL,
    comprobante TEXT, -- URL de almacenamiento o Base64 fallback
    detalles TEXT,
    usuario_email TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    deleted_by TEXT
);

-- Habilitar RLS
ALTER TABLE public.proveedores_liquidaciones ENABLE ROW LEVEL SECURITY;

-- Eliminar política si existe para evitar conflictos
DROP POLICY IF EXISTS "Permitir todo a usuarios autenticados" ON public.proveedores_liquidaciones;

-- Crear política de acceso total para usuarios autenticados
CREATE POLICY "Permitir todo a usuarios autenticados" ON public.proveedores_liquidaciones
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
