-- Script SQL: Configuración del Historial de Reservas, Auditoría y Logs
-- Ejecutar este script en el editor SQL de Supabase para habilitar el backend de trazabilidad.

-- 1. Crear la tabla si no existe
CREATE TABLE IF NOT EXISTS public.historial_reservas (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    cliente_id UUID,
    campo TEXT NOT NULL,
    valor_anterior TEXT,
    valor_nuevo TEXT,
    usuario_email TEXT NOT NULL,
    tipo_evento TEXT DEFAULT 'MODIFICACION', -- 'CREACION', 'MODIFICACION', 'ELIMINACION', 'SEGURIDAD', 'SISTEMA'
    detalles JSONB DEFAULT '{}'::jsonb,      -- Para almacenar metadatos extra
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Asegurar que las columnas nuevas existan si la tabla ya había sido creada anteriormente
ALTER TABLE public.historial_reservas ADD COLUMN IF NOT EXISTS tipo_evento TEXT DEFAULT 'MODIFICACION';
ALTER TABLE public.historial_reservas ADD COLUMN IF NOT EXISTS detalles JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.historial_reservas ADD COLUMN IF NOT EXISTS cliente_id UUID;

-- 3. Crear índices de rendimiento optimizados para búsquedas rápidas por cliente y fechas
CREATE INDEX IF NOT EXISTS idx_historial_cliente ON public.historial_reservas(cliente_id);
CREATE INDEX IF NOT EXISTS idx_historial_tipo ON public.historial_reservas(tipo_evento);
CREATE INDEX IF NOT EXISTS idx_historial_fecha ON public.historial_reservas(created_at DESC);

-- 4. Habilitar Row Level Security (RLS)
ALTER TABLE public.historial_reservas ENABLE ROW LEVEL SECURITY;

-- 5. Eliminar políticas previas para evitar duplicados al re-ejecutar el script
DROP POLICY IF EXISTS "Permitir inserción a usuarios autenticados" ON public.historial_reservas;
DROP POLICY IF EXISTS "Lectura exclusiva admin principal" ON public.historial_reservas;
DROP POLICY IF EXISTS "Bloqueo de ediciones en logs" ON public.historial_reservas;
DROP POLICY IF EXISTS "Bloqueo de eliminaciones en logs" ON public.historial_reservas;

-- 6. Crear políticas de seguridad estrictas (Inmutabilidad + Acceso Restringido)

-- A. Permitir inserción a cualquier usuario autenticado (para que el sistema registre su actividad)
CREATE POLICY "Permitir inserción a usuarios autenticados" 
ON public.historial_reservas FOR INSERT 
TO authenticated 
WITH CHECK (true);

-- B. Permitir la lectura de logs ÚNICAMENTE al administrador principal trespa.paginas@gmail.com
CREATE POLICY "Lectura exclusiva admin principal" 
ON public.historial_reservas FOR SELECT 
TO authenticated 
USING (auth.jwt() ->> 'email' = 'trespa.paginas@gmail.com');

-- C. Denegar cualquier tipo de UPDATE para todos
CREATE POLICY "Bloqueo de ediciones en logs" 
ON public.historial_reservas FOR UPDATE 
TO authenticated 
USING (false);

-- D. Denegar cualquier tipo de DELETE para todos
CREATE POLICY "Bloqueo de eliminaciones en logs" 
ON public.historial_reservas FOR DELETE 
TO authenticated 
USING (false);

-- 7. (Opcional) Si deseas enlazar cliente_id con la tabla clientes asegurando que no se borren los logs al eliminar el cliente
-- Primero identificamos si existe la foreign key para evitar errores
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.table_constraints AS tc 
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY' 
          AND tc.table_name = 'historial_reservas'
          AND kcu.column_name = 'cliente_id'
    ) THEN
        ALTER TABLE public.historial_reservas
        ADD CONSTRAINT fk_historial_cliente
        FOREIGN KEY (cliente_id) REFERENCES public.clientes(id)
        ON DELETE SET NULL;
    END IF;
END $$;
