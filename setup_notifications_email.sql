-- ====================================================================
-- GUÍA DE AUTOMATIZACIÓN DE ALERTAS DE VIAJES Y INTEGRACIÓN CON RESEND
-- ====================================================================
-- Este archivo contiene las instrucciones y alternativas de SQL para
-- configurar la automatización nativa de correos electrónicos en Supabase.
-- 
-- Si deseas que las alertas se envíen de manera 100% autónoma todos los días
-- a las 8:00 AM (sin necesidad de que el CRM esté abierto), puedes elegir
-- una de las siguientes opciones.

------------------------------------------------------------------------
-- OPCIÓN A: PG_CRON + PG_NET (Recomendado - 100% Base de Datos)
------------------------------------------------------------------------
-- Esta opción utiliza la extensión de cron de Supabase para ejecutar un query
-- diariamente y disparar un webhook directamente a la API de Resend.

-- 1. Habilitar extensiones necesarias en Supabase (ejecutar en SQL Editor)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. Crear una función para enviar correos directamente a Resend usando pg_net
CREATE OR REPLACE FUNCTION public.enviar_reporte_salidas_resend()
RETURNS void AS $$
DECLARE
    resend_key TEXT := 're_ami8ZT68_3Ug7UbRWfz1eL6ouMkXDc8mD'; -- Tu API Key de Resend
    destinatarios JSONB := '["vivemarketingdigital@gmail.com", "trespa.paginas@gmail.com"]'::jsonb;
    html_content TEXT := '';
    alert_record RECORD;
    c_pax RECORD;
    pax_total INT := 0;
    pax_list_html TEXT := '';
    has_alerts BOOLEAN := FALSE;
BEGIN
    -- Crear el encabezado HTML para el correo
    html_content := '
        <div style="font-family: ''Segoe UI'', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 25px; color: #1e293b; background-color: #f8fafc; border-radius: 16px; border: 1px solid #e2e8f0;">
            <div style="text-align: center; padding-bottom: 20px; border-bottom: 2px solid #e2e8f0; margin-bottom: 20px;">
                <h2 style="color: #0f172a; margin: 0; font-size: 24px; font-weight: 800;">VIVE TRAVEL</h2>
                <p style="color: #64748b; margin: 5px 0 0 0; font-size: 11px; text-transform: uppercase; letter-spacing: 0.15em; font-weight: 700;">Reporte Automático de Salidas</p>
            </div>
    ';

    -- Buscar salidas para los próximos 2, 3 y 4 días
    -- NOTA: Dado que 'fecha_viaje' es de tipo texto, se recomienda usar conversión de fecha o un campo DATE.
    -- El siguiente query es ilustrativo si usas un campo date real en la base o la vista correspondiente:
    
    -- Si tu base de datos tiene tablas correspondientes, puedes armar la lógica aquí.
    -- Por ejemplo, un bucle para adjuntar las salidas detectadas:
    
    /*
    FOR alert_record IN (
        SELECT p.nombre as plan_nombre, c.fecha_viaje, count(c.id) as pax_count
        FROM public.clientes c
        JOIN public.planes p ON c.plan_id = p.id
        WHERE c.estado NOT IN ('desistió', 'cancelado o devolución', 'cancelados')
          -- Aquí tu lógica de parseo de fechas de salida (ej: salidas en 2, 3, 4 días)
        GROUP BY p.nombre, c.fecha_viaje
    ) LOOP
        has_alerts := TRUE;
        html_content := html_content || '
            <div style="background-color: #ffffff; padding: 15px; border-radius: 12px; margin-bottom: 12px; border: 1px solid #e2e8f0;">
                <h4 style="margin: 0 0 5px 0; color: #0f172a; font-size: 14px;">' || alert_record.plan_nombre || '</h4>
                <p style="margin: 0; font-size: 11px; color: #64748b;">📅 Fecha: ' || alert_record.fecha_viaje || ' | Pax: ' || alert_record.pax_count || '</p>
            </div>
        ';
    END LOOP;
    */

    -- Alternativa actual: El CRM Frontend gestiona de forma segura el cálculo dinámico de las
    -- fechas formateadas en español y la interacción con los abonos activos. El frontend envía
    -- la petición al backend local (Node) para despachar a través de Resend una única vez al día.

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Programar el cron job para ejecutar la función todos los días a las 8:00 AM
-- (Hora del servidor UTC: ajustar según tu zona horaria local, ej: 13:00 UTC = 8:00 AM Colombia)
-- SELECT cron.schedule('enviar-alertas-diarias', '0 13 * * *', 'SELECT public.enviar_reporte_salidas_resend();');


------------------------------------------------------------------------
-- OPCIÓN B: SUPABASE EDGE FUNCTIONS (Servidor sin Estado)
------------------------------------------------------------------------
-- Las Edge Functions son funciones en Typescript (Deno) que se ejecutan
-- directamente en Supabase.
-- Puedes crear una función 'send-alerts' y usar pg_cron para invocarla:
--
-- 1. Comando CLI para crear la función:
--    supabase functions new send-alerts
--
-- 2. Código TypeScript dentro de la Edge Function:
--    import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
--
--    serve(async (req) => {
--      // Tu lógica de envío a Resend:
--      const res = await fetch('https://api.resend.com/emails', {
--        method: 'POST',
--        headers: {
--          'Authorization': 'Bearer re_ami8ZT68_3Ug7UbRWfz1eL6ouMkXDc8mD',
--          'Content-Type': 'application/json'
--        },
--        body: JSON.stringify({
--          from: 'onboarding@resend.dev',
--          to: 'vivemarketingdigital@gmail.com',
--          subject: '🚨 CRM Vive Travel: Alerta de Salidas Próximas',
--          html: '...'
--        })
--      });
--      return new Response(JSON.stringify({ sent: true }), { headers: { "Content-Type": "application/json" } })
--    })
--
-- 3. Programar la Edge Function con pg_cron:
--    SELECT cron.schedule(
--      'ejecutar-edge-function-alertas',
--      '0 13 * * *',
--      $$ SELECT net.http_post('https://<tu-id-supabase>.supabase.co/functions/v1/send-alerts', NULL, NULL, '{"Authorization": "Bearer <SERVICE_ROLE_KEY>"}'::jsonb) $$
--    );
