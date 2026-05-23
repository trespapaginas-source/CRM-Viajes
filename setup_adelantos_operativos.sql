-- Script SQL: Configuración de Adelantos Operativos y Liquidez
-- Ejecutar en el Editor SQL de Supabase para crear la tabla y configurar seguridad RLS.

CREATE TABLE IF NOT EXISTS public.adelantos_operativos (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    cliente_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
    plan_id UUID REFERENCES public.planes(id) ON DELETE SET NULL,
    fecha_viaje TEXT,
    concepto TEXT NOT NULL,
    tipo_servicio TEXT NOT NULL CHECK (tipo_servicio IN ('vuelos', 'hotel', 'transporte', 'entradas', 'otro')),
    monto_total_servicio NUMERIC(15, 2) NOT NULL DEFAULT 0,
    monto_cubierto_cliente NUMERIC(15, 2) NOT NULL DEFAULT 0,
    monto_adelantado NUMERIC(15, 2) NOT NULL DEFAULT 0,
    monto_recuperado NUMERIC(15, 2) NOT NULL DEFAULT 0,
    fecha DATE NOT NULL DEFAULT CURRENT_DATE,
    metodo_pago TEXT,
    comprobante TEXT, -- Soporte en Base64
    estado TEXT NOT NULL CHECK (estado IN ('solicitado', 'aprobado', 'ejecutado', 'recuperado', 'perdido', 'credito_proveedor')) DEFAULT 'solicitado',
    solicitado_por TEXT NOT NULL,
    aprobado_por TEXT,
    fecha_ejecucion DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    deleted_by TEXT
);

-- Habilitar RLS
ALTER TABLE public.adelantos_operativos ENABLE ROW LEVEL SECURITY;

-- Eliminar política anterior si existe para evitar conflictos
DROP POLICY IF EXISTS "Permitir todo a usuarios autenticados" ON public.adelantos_operativos;

-- Crear política de acceso para usuarios autenticados
CREATE POLICY "Permitir todo a usuarios autenticados" ON public.adelantos_operativos
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
