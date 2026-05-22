-- Migración para añadir soporte legal de Términos y Condiciones y Tratamiento de Datos
-- Ejecutar en el SQL Editor de Supabase

ALTER TABLE public.clientes
ADD COLUMN IF NOT EXISTS terminos_aceptados BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS terminos_fecha TIMESTAMP WITH TIME ZONE;
