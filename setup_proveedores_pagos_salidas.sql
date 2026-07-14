-- ============================================================
-- SQL: CONFIGURACIÓN DE TABLA DE PAGOS A PROVEEDORES PARA VIAJES FUTUROS
-- Ejecutar en el Editor SQL de Supabase
-- ============================================================

CREATE TABLE IF NOT EXISTS public.proveedores_pagos_salidas (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    plan_id UUID REFERENCES public.planes(id) ON DELETE CASCADE,
    fecha_viaje TEXT NOT NULL,
    nombre_proveedor TEXT NOT NULL,
    monto NUMERIC(15, 2) NOT NULL DEFAULT 0 CHECK (monto >= 0),
    soporte_url TEXT, -- Comprobante opcional
    justificacion TEXT NOT NULL,
    usuario_email TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    deleted_by TEXT
);

-- Habilitar RLS
ALTER TABLE public.proveedores_pagos_salidas ENABLE ROW LEVEL SECURITY;

-- Eliminar política si existe para evitar conflictos
DROP POLICY IF EXISTS "Permitir todo a usuarios autenticados" ON public.proveedores_pagos_salidas;

-- Crear política de acceso total para usuarios autenticados
CREATE POLICY "Permitir todo a usuarios autenticados" ON public.proveedores_pagos_salidas
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
