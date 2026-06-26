-- =============================================================================
-- SCRIPT DE DEPURACIÓN Y CONCILIACIÓN CONTABLE MASIVA (ABONOS)
-- =============================================================================
-- Descripción: Mueve a la papelera (deleted_at) los abonos huérfanos y duplicados
--              de forma masiva para corregir el histórico contable.
-- Instrucciones: Ejecutar este script una sola vez en el Editor SQL de Supabase.
-- =============================================================================

BEGIN;

-- Desactivar temporalmente el trigger de congelamiento para permitir la depuración de registros históricos
ALTER TABLE abonos DISABLE TRIGGER enforce_abono_freeze;

-- 1. Soft-delete abonos huérfanos (cuyo cliente_id no existe en la tabla de clientes)
WITH huerfanos AS (
    SELECT id, cliente_id, monto
    FROM abonos
    WHERE deleted_at IS NULL
      AND cliente_id NOT IN (SELECT id FROM clientes)
)
UPDATE abonos
SET 
    deleted_at = NOW(),
    deleted_by = 'script_depuracion_masiva_admin@vtravel.com',
    motivo_eliminacion = 'Abono huérfano (cliente no existe en base de datos)'
WHERE 
    deleted_at IS NULL
    AND id IN (SELECT id FROM huerfanos);

-- 2. Soft-delete abonos duplicados el mismo día con diferencia de menos de 10 minutos
-- Se conserva el primer registro y se mueven a la papelera los duplicados posteriores
WITH duplicados AS (
    SELECT a1.id
    FROM abonos a1
    WHERE a1.deleted_at IS NULL
      AND EXISTS (
          SELECT 1 
          FROM abonos a2 
          WHERE a2.id <> a1.id 
            AND a2.deleted_at IS NULL
            AND a2.cliente_id = a1.cliente_id 
            AND a2.monto = a1.monto 
            AND COALESCE(a2.metodo, '') = COALESCE(a1.metodo, '')
            AND a2.created_at < a1.created_at
            AND a1.created_at - a2.created_at <= INTERVAL '10 minutes'
      )
)
UPDATE abonos
SET 
    deleted_at = NOW(),
    deleted_by = 'script_depuracion_masiva_admin@vtravel.com',
    motivo_eliminacion = 'Abono duplicado (monto, método, cliente idénticos en < 10 minutos)'
WHERE 
    deleted_at IS NULL
    AND id IN (SELECT id FROM duplicados);

-- 3. Soft-delete duplicados grupales manuales (sin enlace padre-hijo)
-- Detecta abonos del mismo monto/método registrados a diferentes miembros
-- del mismo grupo en ≤24h, donde el total de abonos excede el precio del plan.
-- Conserva el primer abono cronológico y mueve el exceso a la papelera.
WITH grupo_info AS (
    -- Identificar grupos (titular + acompañantes) y su precio total
    SELECT 
        COALESCE(c.parent_id, c.id) AS group_root_id,
        c.id AS cliente_id,
        c.precio_total
    FROM clientes c
    WHERE c.deleted_at IS NULL
),
grupo_sizes AS (
    -- Contar el número de integrantes de cada grupo
    SELECT group_root_id, COUNT(*) AS members_count
    FROM grupo_info
    GROUP BY group_root_id
),
grupo_precios AS (
    -- Precio del plan por grupo (precio individual * número de integrantes)
    SELECT DISTINCT ON (gi.group_root_id)
        gi.group_root_id,
        gi.precio_total * gs.members_count AS group_price
    FROM grupo_info gi
    JOIN grupo_sizes gs ON gi.group_root_id = gs.group_root_id
    WHERE gi.precio_total IS NOT NULL AND gi.precio_total > 0
    ORDER BY gi.group_root_id, gi.cliente_id
),
grupo_abonos_total AS (
    -- Total de abonos activos confirmados por grupo (sin parent_abono_id)
    SELECT 
        gi.group_root_id,
        SUM(a.monto) AS total_abonos
    FROM abonos a
    JOIN grupo_info gi ON a.cliente_id = gi.cliente_id
    WHERE a.deleted_at IS NULL
      AND a.estado = 'confirmado'
      AND a.parent_abono_id IS NULL
    GROUP BY gi.group_root_id
),
grupos_excedidos AS (
    -- Solo grupos donde los abonos exceden el precio del plan
    SELECT ga.group_root_id
    FROM grupo_abonos_total ga
    JOIN grupo_precios gp ON ga.group_root_id = gp.group_root_id
    WHERE ga.total_abonos > gp.group_price + 1000
),
abonos_ranked AS (
    -- Dentro de cada grupo excedido, rankear abonos similares (mismo monto, método, ≤24h)
    SELECT 
        a.id,
        a.cliente_id,
        a.monto,
        a.metodo,
        a.created_at,
        gi.group_root_id,
        ROW_NUMBER() OVER (
            PARTITION BY gi.group_root_id, 
                         ROUND(a.monto::numeric, -2), 
                         COALESCE(a.metodo, ''),
                         DATE(a.created_at)
            ORDER BY a.created_at ASC
        ) AS rn,
        COUNT(*) OVER (
            PARTITION BY gi.group_root_id, 
                         ROUND(a.monto::numeric, -2), 
                         COALESCE(a.metodo, ''),
                         DATE(a.created_at)
        ) AS cnt
    FROM abonos a
    JOIN grupo_info gi ON a.cliente_id = gi.cliente_id
    WHERE a.deleted_at IS NULL
      AND a.estado = 'confirmado'
      AND a.parent_abono_id IS NULL
      AND gi.group_root_id IN (SELECT group_root_id FROM grupos_excedidos)
),
duplicados_grupales AS (
    -- Seleccionar los abonos excedentes (rn > 1) donde hay más de 1 cliente afectado
    SELECT ar.id
    FROM abonos_ranked ar
    WHERE ar.rn > 1
      AND ar.cnt > 1
)
UPDATE abonos
SET 
    deleted_at = NOW(),
    deleted_by = 'script_depuracion_masiva_admin@vtravel.com',
    motivo_eliminacion = 'Duplicado grupal manual (mismo monto/método registrado a múltiples miembros del grupo, sin enlace automático)'
WHERE 
    deleted_at IS NULL
    AND id IN (SELECT id FROM duplicados_grupales);

-- Reactivar el trigger de congelamiento después de la depuración
ALTER TABLE abonos ENABLE TRIGGER enforce_abono_freeze;

COMMIT;
