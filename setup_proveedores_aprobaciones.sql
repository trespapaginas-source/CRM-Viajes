-- ============================================================
-- SQL MIGRATION: BLINDAJE DE PROVEEDORES Y FLUJO DE APROBACIONES
-- Ejecutar este script en el Editor SQL de Supabase
-- ============================================================

-- 1. Crear tabla de solicitudes de cambio para proveedores
CREATE TABLE IF NOT EXISTS public.solicitudes_cambio_proveedores (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    proveedor_id UUID REFERENCES public.proveedores(id) ON DELETE CASCADE,
    solicitante_email TEXT NOT NULL,
    tipo_operacion TEXT NOT NULL CHECK (tipo_operacion IN ('MODIFICACION', 'ELIMINACION')),
    estado TEXT NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE', 'APROBADO', 'RECHAZADO')),
    motivo TEXT NOT NULL,
    datos_anteriores JSONB,
    datos_nuevos JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    resolved_by TEXT
);

-- Habilitar RLS en la tabla de solicitudes de cambio
ALTER TABLE public.solicitudes_cambio_proveedores ENABLE ROW LEVEL SECURITY;

-- Eliminar políticas previas para evitar duplicados
DROP POLICY IF EXISTS "Permitir inserción de solicitudes a autenticados" ON public.solicitudes_cambio_proveedores;
DROP POLICY IF EXISTS "Lectura de solicitudes para administradores" ON public.solicitudes_cambio_proveedores;
DROP POLICY IF EXISTS "Actualización de solicitudes para administradores" ON public.solicitudes_cambio_proveedores;

-- Crear políticas de seguridad RLS
CREATE POLICY "Permitir inserción de solicitudes a autenticados"
ON public.solicitudes_cambio_proveedores FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Lectura de solicitudes para administradores"
ON public.solicitudes_cambio_proveedores FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.perfiles_usuarios
        WHERE user_id = auth.uid() AND rol = 'administrador'
    )
);

CREATE POLICY "Actualización de solicitudes para administradores"
ON public.solicitudes_cambio_proveedores FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.perfiles_usuarios
        WHERE user_id = auth.uid() AND rol = 'administrador'
    )
);

-- 2. Función para verificar si un usuario es administrador
CREATE OR REPLACE FUNCTION public.es_administrador()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.perfiles_usuarios
        WHERE user_id = auth.uid() AND rol = 'administrador'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Función para verificar si un proveedor está en uso real en el sistema
CREATE OR REPLACE FUNCTION public.proveedor_en_uso(p_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_in_use BOOLEAN;
BEGIN
    -- A. Verificar si el proveedor está vinculado a algún plan activo (no borrado)
    SELECT EXISTS (
        SELECT 1 FROM public.planes
        WHERE deleted_at IS NULL
          AND (
            proveedores_vinculados @> jsonb_build_array(jsonb_build_object('id_proveedor', p_id))
            OR
            proveedores_vinculados @> jsonb_build_array(jsonb_build_object('id_provider', p_id))
          )
    ) INTO v_in_use;
    
    IF v_in_use THEN
        -- B. Si está en un plan, verificar si el plan tiene al menos una reserva activa (no borrada)
        SELECT EXISTS (
            SELECT 1 FROM public.clientes c
            JOIN public.planes p ON c.plan_id = p.id
            WHERE c.deleted_at IS NULL
              AND p.deleted_at IS NULL
              AND (
                p.proveedores_vinculados @> jsonb_build_array(jsonb_build_object('id_proveedor', p_id))
                OR
                p.proveedores_vinculados @> jsonb_build_array(jsonb_build_object('id_provider', p_id))
              )
        ) INTO v_in_use;
    END IF;
    
    RETURN v_in_use;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Asegurar que no exista el trigger en proveedores
DROP TRIGGER IF EXISTS trigger_check_proveedor_modificacion ON public.proveedores;
DROP FUNCTION IF EXISTS public.check_proveedor_modificacion();

-- 5. Agregar columna motivo_eliminacion a las tablas para almacenar justificaciones
ALTER TABLE public.abonos ADD COLUMN IF NOT EXISTS motivo_eliminacion TEXT;
ALTER TABLE public.gastos_corporativos ADD COLUMN IF NOT EXISTS motivo_eliminacion TEXT;
ALTER TABLE public.socios_movimientos ADD COLUMN IF NOT EXISTS motivo_eliminacion TEXT;
ALTER TABLE public.gastos_salidas ADD COLUMN IF NOT EXISTS motivo_eliminacion TEXT;
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS motivo_eliminacion TEXT;
ALTER TABLE public.planes ADD COLUMN IF NOT EXISTS motivo_eliminacion TEXT;
ALTER TABLE public.proveedores ADD COLUMN IF NOT EXISTS motivo_eliminacion TEXT;
