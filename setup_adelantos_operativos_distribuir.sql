-- Script SQL: Agregar columna distribuir_grupo a la tabla adelantos_operativos
-- Ejecutar este comando en el editor SQL de Supabase para actualizar la base de datos.

ALTER TABLE public.adelantos_operativos ADD COLUMN IF NOT EXISTS distribuir_grupo BOOLEAN NOT NULL DEFAULT FALSE;
