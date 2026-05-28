-- ============================================================
-- SQL MIGRATION: CORRECCIÓN ESPECÍFICA PARA ROXANA & GUILLERMO
-- Ejecutar este bloque en el Editor SQL de Supabase (SQL Editor)
-- ============================================================

-- 1. INSPECCIÓN: Ver los datos actuales antes del cambio
SELECT id, nombre, apellido, costo_base, proveedores_vinculados
FROM public.clientes
WHERE nombre ILIKE '%Roxana%' OR nombre ILIKE '%Guillermo%';

-- 2. CORRECCIÓN DIRECTA: Actualizar el costo base y los proveedores vinculados
UPDATE public.clientes
SET costo_base = 1125054,
    proveedores_vinculados = '[
      {
        "costo": 1040054,
        "nombre": "Colreservas Mayorista",
        "incluye": "SAI - hotel + Vuelos",
        "id_provider": "f7d1c729-116f-45b2-bc92-8536241f57fd",
        "id_proveedor": "f7d1c729-116f-45b2-bc92-8536241f57fd"
      },
      {
        "costo": 85000,
        "nombre": "ALIMENTOS SAI",
        "incluye": "Comidas 1",
        "id_provider": "b4f569e7-7b1c-477d-85ed-92ed30f49a98",
        "id_proveedor": "b4f569e7-7b1c-477d-85ed-92ed30f49a98"
      }
    ]'::jsonb
WHERE (nombre ILIKE '%Roxana%' OR nombre ILIKE '%Guillermo%');

-- 3. VERIFICACIÓN: Ver cómo quedaron los datos después de la actualización
SELECT id, nombre, apellido, costo_base, proveedores_vinculados
FROM public.clientes
WHERE nombre ILIKE '%Roxana%' OR nombre ILIKE '%Guillermo%';
