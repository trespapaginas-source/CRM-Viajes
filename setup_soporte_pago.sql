-- ============================================================
-- MIGRACIÓN: AGREGAR SOPORTE DE PAGO EN RESERVAS Y CONFIGURACIÓN DE STORAGE
-- Ejecutar en el Editor SQL de Supabase
-- ============================================================

-- 1. Agregar columna para almacenar la URL del soporte de pago en la tabla de clientes (reservas)
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS soporte_pago_url TEXT;

-- 2. Registrar el bucket 'soportes_pago' en la configuración de storage de Supabase (si no existe)
INSERT INTO storage.buckets (id, name, public)
VALUES ('soportes_pago', 'soportes_pago', true)
ON CONFLICT (id) DO NOTHING;

-- 3. Configurar políticas de seguridad RLS para el bucket 'soportes_pago'
-- Primero eliminamos las políticas si existen para evitar conflictos en ejecuciones múltiples
DROP POLICY IF EXISTS "Soportes lectura publica" ON storage.objects;
DROP POLICY IF EXISTS "Soportes carga autenticados" ON storage.objects;
DROP POLICY IF EXISTS "Soportes edicion autenticados" ON storage.objects;
DROP POLICY IF EXISTS "Soportes borrado autenticados" ON storage.objects;

-- A. Permitir lecturas públicas de los archivos del bucket 'soportes_pago'
CREATE POLICY "Soportes lectura publica" ON storage.objects
  FOR SELECT TO public USING (bucket_id = 'soportes_pago');

-- B. Permitir subir archivos (cargar) a usuarios autenticados
CREATE POLICY "Soportes carga autenticados" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'soportes_pago');

-- C. Permitir actualizar archivos existentes a usuarios autenticados
CREATE POLICY "Soportes edicion autenticados" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'soportes_pago');

-- D. Permitir eliminar archivos a usuarios autenticados
CREATE POLICY "Soportes borrado autenticados" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'soportes_pago');
