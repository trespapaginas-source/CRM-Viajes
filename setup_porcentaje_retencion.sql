-- Agregar columna para el porcentaje de retención en la configuración de la agencia
ALTER TABLE public.configuracion_agencia 
ADD COLUMN IF NOT EXISTS porcentaje_retencion NUMERIC(5, 2) DEFAULT 10.00;

-- Comentario explicativo
COMMENT ON COLUMN public.configuracion_agencia.porcentaje_retencion IS 'Porcentaje de utilidad neta retenida para el fondo de reserva / caja menor';
