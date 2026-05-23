-- Script SQL: Columnas Adicionales para el Catálogo de Planes
-- Ejecutar en el Editor SQL de Supabase para añadir el campo de servicios incluidos al catálogo.

ALTER TABLE public.planes 
ADD COLUMN IF NOT EXISTS servicios_incluidos jsonb DEFAULT '[]'::jsonb;
