-- ============================================================
-- MIGRACIÓN: CONFIGURACIÓN DE SEGURIDAD RLS PARA PROVEEDORES Y B2B
-- Ejecutar en el Editor SQL de Supabase (Dashboard → SQL Editor)
-- ============================================================

-- 1. Habilitar Row Level Security (RLS) en las tablas operativas
ALTER TABLE public.proveedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.b2b_aliados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.b2b_servicios_catalogo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.b2b_negocios ENABLE ROW LEVEL SECURITY;

-- 2. Eliminar políticas antiguas para evitar conflictos
DROP POLICY IF EXISTS "Permitir todo a autenticados en proveedores" ON public.proveedores;
DROP POLICY IF EXISTS "Permitir todo a autenticados en aliados" ON public.b2b_aliados;
DROP POLICY IF EXISTS "Permitir todo a autenticados en servicios" ON public.b2b_servicios_catalogo;
DROP POLICY IF EXISTS "Permitir todo a autenticados en negocios" ON public.b2b_negocios;

-- 3. Crear nuevas políticas simplificadas y seguras para usuarios autenticados
-- Esto asegura que cualquier asesor o administrador logueado tenga acceso completo.

-- A. Tabla de Proveedores (Directorio y Productos)
CREATE POLICY "Permitir todo a autenticados en proveedores"
ON public.proveedores
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- B. Tabla de Aliados B2B
CREATE POLICY "Permitir todo a autenticados en aliados"
ON public.b2b_aliados
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- C. Tabla de Catálogo de Servicios B2B
CREATE POLICY "Permitir todo a autenticados en servicios"
ON public.b2b_servicios_catalogo
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- D. Tabla de Negocios y Operaciones B2B
CREATE POLICY "Permitir todo a autenticados en negocios"
ON public.b2b_negocios
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- 4. Verificación de políticas creadas
-- SELECT tablename, policyname, roles, cmd, qual FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('proveedores', 'b2b_aliados', 'b2b_servicios_catalogo', 'b2b_negocios');
