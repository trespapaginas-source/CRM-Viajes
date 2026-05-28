-- ============================================================
-- SQL DIAGNOSTIC: INSPECCIÓN DE RESERVAS - DESPEDIDA DE SOLTERA
-- Ejecutar en el Editor SQL de Supabase
-- ============================================================

SELECT id, nombre, apellido, costo_base, proveedores_vinculados
FROM public.clientes
WHERE plan_id = '1d5f074c-bd5c-4b1e-913b-308eae29f15c'
  AND deleted_at IS NULL;
