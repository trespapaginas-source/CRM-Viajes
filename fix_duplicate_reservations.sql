-- ============================================================
-- SQL MIGRATION: LIMPIEZA DE DUPLICADOS EN RESERVAS CONGELADAS
-- Ejecutar en el Editor SQL de Supabase (SQL Editor)
-- ============================================================

-- OPCIÓN A: Limpieza global de duplicados en la tabla clientes (Recomendada)
WITH deduplicated AS (
  SELECT 
    c.id, 
    clean_provs,
    (
      SELECT COALESCE(SUM(costo), 0)
      FROM jsonb_to_recordset(clean_provs) AS x(costo numeric)
    ) AS clean_cost
  FROM (
    SELECT 
      c.id,
      (
        SELECT jsonb_agg(elem) 
        FROM (
          SELECT DISTINCT elem 
          FROM jsonb_array_elements(c.proveedores_vinculados) elem
        ) t
      ) AS clean_provs
    FROM public.clientes c
    WHERE c.deleted_at IS NULL
  ) c
)
UPDATE public.clientes c
SET 
  proveedores_vinculados = COALESCE(d.clean_provs, '[]'::jsonb),
  costo_base = d.clean_cost
FROM deduplicated d
WHERE c.id = d.id
  AND c.costo_base <> d.clean_cost; -- Solo actualiza filas con desajustes/duplicados
