-- =============================================================================
-- SQL MIGRATION SCRIPT: ADD RECURRING FLAG TO CORPORATE EXPENSES
-- =============================================================================
-- Description: Adds a boolean column `es_recurrente` to corporate expenses
--              to classify fixed monthly expenses (rent, salaries, software, etc.).
--              It also marks historical office rent as recurring by default.
-- Instructions: Run this script in the Supabase SQL Editor.
-- =============================================================================

BEGIN;

-- 1. Add `es_recurrente` column if it does not already exist
ALTER TABLE public.gastos_corporativos 
ADD COLUMN IF NOT EXISTS es_recurrente BOOLEAN DEFAULT FALSE;

-- 2. Mark historical rent/office expenses as recurring by default
UPDATE public.gastos_corporativos 
SET es_recurrente = TRUE 
WHERE (categoria ILIKE '%alquiler%' OR categoria ILIKE '%oficina%' OR concepto ILIKE '%arriendo%' OR concepto ILIKE '%alquiler%')
  AND deleted_at IS NULL;

COMMIT;
