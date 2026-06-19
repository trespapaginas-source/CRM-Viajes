-- Script SQL: Actualización de gastos_corporativos para trazabilidad de fondos
-- Ejecutar en el Editor SQL de Supabase para agregar las columnas necesarias.

ALTER TABLE public.gastos_corporativos ADD COLUMN IF NOT EXISTS origen_fondos TEXT DEFAULT 'Utilidad de la Agencia';
ALTER TABLE public.gastos_corporativos ADD COLUMN IF NOT EXISTS estado_pago TEXT DEFAULT 'pagado';
