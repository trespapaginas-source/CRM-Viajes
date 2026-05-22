-- Crear tabla para retiros y cortes de socios
CREATE TABLE IF NOT EXISTS public.socios_movimientos (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    socio_email TEXT NOT NULL,
    tipo TEXT NOT NULL CHECK (tipo IN ('retiro', 'corte')),
    monto NUMERIC(15, 2) NOT NULL DEFAULT 0,
    fecha DATE NOT NULL DEFAULT CURRENT_DATE,
    concepto TEXT NOT NULL,
    usuario_email TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Habilitar RLS si es necesario (según políticas del proyecto)
ALTER TABLE public.socios_movimientos ENABLE ROW LEVEL SECURITY;

-- Políticas simples: acceso a usuarios autenticados
CREATE POLICY "Permitir todo a usuarios autenticados" ON public.socios_movimientos
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Crear tabla para gastos corporativos e indirectos de la agencia
CREATE TABLE IF NOT EXISTS public.gastos_corporativos (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    concepto TEXT NOT NULL,
    categoria TEXT NOT NULL,
    monto NUMERIC(15, 2) NOT NULL DEFAULT 0,
    fecha DATE NOT NULL DEFAULT CURRENT_DATE,
    comprobante TEXT,
    usuario_email TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Asegurar compatibilidad si la tabla ya existe
ALTER TABLE public.gastos_corporativos ADD COLUMN IF NOT EXISTS comprobante TEXT;

-- Habilitar RLS si es necesario
ALTER TABLE public.gastos_corporativos ENABLE ROW LEVEL SECURITY;

-- Políticas simples: acceso a usuarios autenticados
CREATE POLICY "Permitir todo a usuarios autenticados" ON public.gastos_corporativos
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

