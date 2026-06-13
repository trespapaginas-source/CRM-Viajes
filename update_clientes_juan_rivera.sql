-- ============================================================
-- SQL SCRIPT: ACTUALIZACIÓN DE TARIFAS Y PROVEEDORES
-- CLIENTES: Juan camilo Rivera Lorduy & Paola Patricia Polo
-- SALIDA: Martes 9 de Jun al Jueves 11 de Jun del 2026
-- PLAN: SAI - Juan Rivera & Paola Polo (ID: 611faded-431f-48dd-8ed9-0cf9f30892ee)
-- ============================================================

-- 1. Actualizar los costos operativos y conceptos en la tabla de clientes en Supabase
UPDATE public.clientes
SET 
    costo_base = 1136614,
    proveedores_vinculados = '[
      {
        "costo": 90000,
        "nombre": "ALIMENTOS SAI",
        "incluye": "Comidas - Juan Rivera",
        "id_proveedor": "b4f569e7-7b1c-477d-85ed-92ed30f49a98"
      },
      {
        "costo": 1046614,
        "nombre": "Colreservas Mayorista",
        "incluye": "SAI - JUAN DIAZ (v2)",
        "id_proveedor": "f7d1c729-116f-45b2-bc92-8536241f57fd"
      }
    ]'::jsonb
WHERE plan_id = '611faded-431f-48dd-8ed9-0cf9f30892ee'
  AND (fecha_viaje = 'Martes 9 de Jun del 2026 al Jueves 11 de Jun del 2026' OR fecha_viaje = '9 de jun al 11 de jun del 2026');

-- 2. Registrar en el historial de modificaciones
INSERT INTO public.historial_reservas (
    cliente_id,
    campo,
    valor_anterior,
    valor_nuevo,
    usuario_email,
    tipo_evento,
    detalles
)
SELECT 
    id,
    'costo_base',
    '1342133',
    '1136614',
    'Soporte Técnico',
    'MODIFICACION',
    '{"motivo": "Corrección manual de desalineación de costos en base de datos"}'::jsonb
FROM public.clientes
WHERE plan_id = '611faded-431f-48dd-8ed9-0cf9f30892ee'
  AND (fecha_viaje = 'Martes 9 de Jun del 2026 al Jueves 11 de Jun del 2026' OR fecha_viaje = '9 de jun al 11 de jun del 2026');
