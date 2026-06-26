-- Script SQL: Configuración de Seguridad, Triggers y Rol Super Administrador
-- Ejecuta este script en el editor SQL de Supabase para aplicar los cambios de seguridad en el backend.

-- 1. Asegurar que trespa.paginas@gmail.com tenga el rol super_administrador
-- NOTA: Esto actualizará el perfil del administrador principal a super_administrador con privilegios completos.
UPDATE public.perfiles_usuarios
SET rol = 'super_administrador',
    modulos_permitidos = '["dashboard", "calendario", "planes", "clientes", "proveedores", "rentabilidad", "contactos", "enlaces", "configuracion"]'::jsonb,
    puede_eliminar = true,
    puede_configurar = true
WHERE email = 'trespa.paginas@gmail.com';

-- 2. Trigger para el congelamiento de edición de abonos después de 48 horas
-- Solo permite a usuarios con rol 'administrador' o 'super_administrador' editar o borrar abonos antiguos.
CREATE OR REPLACE FUNCTION check_abono_freeze()
RETURNS TRIGGER AS $$
DECLARE
    user_role TEXT;
    hours_since_created NUMERIC;
BEGIN
    -- Obtener rol del usuario actual en perfiles_usuarios
    SELECT rol INTO user_role
    FROM perfiles_usuarios
    WHERE user_id = auth.uid();

    -- Calcular horas desde la creación del abono
    hours_since_created := EXTRACT(EPOCH FROM (NOW() - OLD.created_at)) / 3600;

    -- Si han pasado más de 48 horas y no tiene rol de administrador o super_administrador, bloquear
    IF hours_since_created > 48 AND (user_role IS NULL OR user_role NOT IN ('administrador', 'super_administrador')) THEN
        RAISE EXCEPTION 'No se puede modificar un abono después de 48 horas. Contacte al administrador.';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Asignar el trigger a la tabla abonos
DROP TRIGGER IF EXISTS enforce_abono_freeze ON abonos;
CREATE TRIGGER enforce_abono_freeze
    BEFORE UPDATE OR DELETE ON abonos
    FOR EACH ROW
    EXECUTE FUNCTION check_abono_freeze();

-- 3. Actualizar políticas RLS de Historial/Logs para basarse en el Rol super_administrador
-- Eliminar la política anterior orientada a email literal
DROP POLICY IF EXISTS "Lectura exclusiva admin principal" ON public.historial_reservas;

-- Crear la nueva política basada en el rol de la tabla perfiles_usuarios
CREATE POLICY "Lectura exclusiva admin principal" 
ON public.historial_reservas FOR SELECT 
TO authenticated 
USING (
    EXISTS (
        SELECT 1 FROM public.perfiles_usuarios
        WHERE perfiles_usuarios.user_id = auth.uid()
          AND perfiles_usuarios.rol = 'super_administrador'
    )
);
