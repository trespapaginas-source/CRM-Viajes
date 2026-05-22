-- Migración SQL: Arquitectura Soft-Delete y Papelera de Auditoría
-- Ejecutar en el Editor SQL de Supabase

-- 1. Tabla Clientes (Reservas locales/internacionales)
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS deleted_by TEXT;

-- 2. Tabla Abonos de Clientes
ALTER TABLE public.abonos ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.abonos ADD COLUMN IF NOT EXISTS deleted_by TEXT;

-- 3. Tabla Proveedores
ALTER TABLE public.proveedores ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.proveedores ADD COLUMN IF NOT EXISTS deleted_by TEXT;

-- 4. Tabla Planes (Catálogo)
ALTER TABLE public.planes ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.planes ADD COLUMN IF NOT EXISTS deleted_by TEXT;

-- 5. Tabla Gastos Corporativos
ALTER TABLE public.gastos_corporativos ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.gastos_corporativos ADD COLUMN IF NOT EXISTS deleted_by TEXT;

-- 6. Tabla Socios Movimientos (Retiros, Cortes)
ALTER TABLE public.socios_movimientos ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.socios_movimientos ADD COLUMN IF NOT EXISTS deleted_by TEXT;

-- 7. Tabla Gastos de Rentabilidad (Gastos Operativos de Reservas)
ALTER TABLE public.gastos_salidas ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.gastos_salidas ADD COLUMN IF NOT EXISTS deleted_by TEXT;
