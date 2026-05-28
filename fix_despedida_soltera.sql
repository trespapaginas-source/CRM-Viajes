-- ============================================================
-- SQL MIGRATION: CORRECCIÓN DE RESERVAS - DESPEDIDA DE SOLTERA
-- Ejecutar este bloque en el Editor SQL de Supabase (SQL Editor)
-- ============================================================

-- 1. INSPECCIÓN ANTES DEL CAMBIO
SELECT id, nombre, apellido, costo_base, proveedores_vinculados
FROM public.clientes
WHERE plan_id = '1d5f074c-bd5c-4b1e-913b-308eae29f15c'
  AND deleted_at IS NULL;

-- 2. ACTUALIZACIÓN DIRECTA (Corrección del costo base y proveedores vinculados)
UPDATE public.clientes
SET costo_base = 168888,
    proveedores_vinculados = '[
      {
        "costo": 168888,
        "nombre": "PALMARITO BEACH CLUB",
        "incluye": "Hospedaje - Despedida de soltera",
        "id_provider": "269592d6-dde1-401c-a888-15ac01237010",
        "id_proveedor": "269592d6-dde1-401c-a888-15ac01237010"
      }
    ]'::jsonb
WHERE plan_id = '1d5f074c-bd5c-4b1e-913b-308eae29f15c'
  AND deleted_at IS NULL;

-- 3. VERIFICACIÓN DESPUÉS DEL CAMBIO
SELECT id, nombre, apellido, costo_base, proveedores_vinculados
FROM public.clientes
WHERE plan_id = '1d5f074c-bd5c-4b1e-913b-308eae29f15c'
  AND deleted_at IS NULL;
