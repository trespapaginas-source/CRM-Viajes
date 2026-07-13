try {
    require('dotenv').config();
} catch (error) {
    console.warn('Warning: Could not load dotenv config. Continuing with system environment variables.');
}

const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const PORT = process.env.PORT || 8080;

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.webp': 'image/webp'
};

const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const ALERT_RECIPIENTS = (process.env.ALERT_RECIPIENTS || 'vivemarketingdigital@gmail.com,trespa.paginas@gmail.com,luismendezramirez@hotmail.es')
    .split(',')
    .map(e => e.trim())
    .filter(Boolean);
const SANDBOX_RECIPIENT = process.env.SANDBOX_RECIPIENT || 'trespa.paginas@gmail.com';


const sendResendEmail = async (alerts) => {
    // Build HTML content
    let htmlContent = `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 25px; color: #1e293b; background-color: #f8fafc; border-radius: 16px; border: 1px solid #e2e8f0;">
            <div style="text-align: center; padding-bottom: 20px; border-bottom: 2px solid #e2e8f0; margin-bottom: 20px;">
                <h2 style="color: #0f172a; margin: 0; font-size: 24px; font-weight: 800; tracking-tight: -0.025em;">VIVE TRAVEL</h2>
                <p style="color: #64748b; margin: 5px 0 0 0; font-size: 11px; text-transform: uppercase; letter-spacing: 0.15em; font-weight: 700;">Control de Salidas Próximas</p>
            </div>
    `;

    const renderAlertGroup = (title, color, items) => {
        if (!items || items.length === 0) return '';
        let itemsHtml = '';
        items.forEach(item => {
            let passengersHtml = '';
            if (item.clientes_detalle && item.clientes_detalle.length > 0) {
                passengersHtml = `
                    <div style="margin-top: 12px; border-top: 1px dashed #e2e8f0; padding-top: 10px;">
                        <p style="margin: 0 0 6px 0; font-size: 10px; font-weight: 800; color: #475569; text-transform: uppercase; letter-spacing: 0.05em;">Listado de Viajeros:</p>
                        <table style="width: 100%; font-size: 10px; border-collapse: collapse; color: #334155;">
                            <thead>
                                <tr style="border-bottom: 1px solid #e2e8f0; text-align: left; color: #64748b; font-weight: 700;">
                                    <th style="padding: 4px 0;">Nombre</th>
                                    <th style="padding: 4px 0;">Cédula</th>
                                    <th style="padding: 4px 0;">Celular</th>
                                    <th style="padding: 4px 0; text-align: right;">Total</th>
                                    <th style="padding: 4px 0; text-align: right;">Saldo</th>
                                </tr>
                            </thead>
                            <tbody>
                `;
                item.clientes_detalle.forEach(pax => {
                    const formatCurrency = (val) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(val);
                    passengersHtml += `
                                <tr style="border-bottom: 1px solid #f1f5f9;">
                                    <td style="padding: 5px 0; font-weight: 600; color: #0f172a;">${pax.nombre}</td>
                                    <td style="padding: 5px 0; color: #475569;">${pax.cedula}</td>
                                    <td style="padding: 5px 0; color: #475569;">${pax.celular}</td>
                                    <td style="padding: 5px 0; text-align: right; font-weight: 600;">${formatCurrency(pax.valor_total)}</td>
                                    <td style="padding: 5px 0; text-align: right; font-weight: 700; color: ${pax.saldo_pendiente > 0 ? '#ef4444' : '#10b981'};">${formatCurrency(pax.saldo_pendiente)}</td>
                                </tr>
                    `;
                });
                passengersHtml += `
                            </tbody>
                        </table>
                    </div>
                `;
            }

            itemsHtml += `
                <div style="background-color: #ffffff; padding: 15px; border-radius: 12px; margin-bottom: 12px; border: 1px solid #e2e8f0; box-shadow: 0 1px 2px rgba(15,23,42,0.02);">
                    <h4 style="margin: 0 0 5px 0; color: #0f172a; font-size: 14px; font-weight: 800;">${item.plan_nombre}</h4>
                    <p style="margin: 0 0 8px 0; color: #64748b; font-size: 11px; font-weight: 500;">Destino: ${item.destino || 'Destino Abierto'}</p>
                    <table style="width: 100%; font-size: 11px; color: #475569; font-weight: 600; margin-bottom: 6px;">
                        <tr>
                            <td>📅 Fecha: ${item.fecha_viaje}</td>
                            <td style="text-align: right;">👥 Pasajeros: ${item.pax} Pax</td>
                        </tr>
                    </table>
                    ${passengersHtml}
                </div>
            `;
        });

        return `
            <div style="margin-bottom: 25px;">
                <h3 style="color: ${color}; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 800; margin-bottom: 10px; border-bottom: 1px solid #e2e8f0; padding-bottom: 5px;">${title}</h3>
                ${itemsHtml}
            </div>
        `;
    };

    htmlContent += renderAlertGroup('🔑 Check-in Requerido (Salidas en 1 día)', '#8b5cf6', alerts['1d_checkin']);
    htmlContent += renderAlertGroup('🔔 Check-out Requerido (Regresos en 1 día)', '#ec4899', alerts['1d_checkout']);
    htmlContent += renderAlertGroup('🚨 Críticas (Salidas en 2 días)', '#ef4444', alerts['2d']);
    htmlContent += renderAlertGroup('⚠️ Urgentes (Salidas en 3 días)', '#f97316', alerts['3d']);
    htmlContent += renderAlertGroup('ℹ️ Informativas (Salidas en 4 días)', '#3b82f6', alerts['4d']);

    htmlContent += `
            <div style="font-size: 10px; color: #94a3b8; text-align: center; margin-top: 30px; padding-top: 15px; border-top: 1px solid #e2e8f0;">
                <p>Este es un reporte automático generado por el CRM de Vive Travel.</p>
            </div>
        </div>
    `;


    const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            from: 'onboarding@resend.dev',
            to: ALERT_RECIPIENTS,
            subject: '🚨 CRM Vive Travel: Alerta de Salidas Próximas',
            html: htmlContent
        })
    });

    if (!response.ok) {
        const errText = await response.text();
        if (response.status === 403 && errText.includes('You can only send testing emails to your own email address')) {
            console.warn(`Resend Sandbox detected. Retrying send to verified sandbox owner (${SANDBOX_RECIPIENT})...`);
            const retryResponse = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${RESEND_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    from: 'onboarding@resend.dev',
                    to: [SANDBOX_RECIPIENT],
                    subject: '🚨 CRM Vive Travel: Alerta de Salidas Próximas (Sandbox Mode)',
                    html: htmlContent
                })
            });
            if (!retryResponse.ok) {
                const retryErrText = await retryResponse.text();
                throw new Error(`Resend API Error (Retry): ${retryResponse.status} - ${retryErrText}`);
            }
            return await retryResponse.json();
        }
        throw new Error(`Resend API Error: ${response.status} - ${errText}`);
    }

    return await response.json();
};

const server = http.createServer((req, res) => {
    // Handler for browser error reports
    if (req.method === 'POST' && req.url === '/log-error') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            console.log(`\n=======================================================\n[BROWSER CLIENT ERROR]: ${body}\n=======================================================\n`);
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end('ok');
        });
        return;
    }

    // Handler for browser diagnostic data dumps
    if (req.method === 'POST' && req.url === '/log-diagnostics') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                const scratchDir = path.join(__dirname, 'scratch');
                if (!fs.existsSync(scratchDir)) {
                    fs.mkdirSync(scratchDir);
                }
                const dumpPath = path.join(scratchDir, 'abonos_dump.json');
                fs.writeFileSync(dumpPath, body, 'utf8');
                console.log(`\n[DIAGNOSTICS] Received diagnostic dump. Saved to ${dumpPath}.\n`);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'success' }));
            } catch (err) {
                console.error("Error saving diagnostics dump:", err);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'error', message: err.message }));
            }
        });
        return;
    }

    // Handler for sending email alerts via Resend
    if (req.method === 'POST' && req.url === '/send-alerts-email') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                const { alerts } = JSON.parse(body);
                sendResendEmail(alerts)
                    .then((result) => {
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ status: 'success', result }));
                    })
                    .catch(err => {
                        console.error("Error sending Resend email:", err);
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ status: 'error', message: err.message }));
                    });
            } catch (err) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'error', message: 'Invalid JSON' }));
            }
        });
        return;
    }

    // Decodificar URL para manejar espacios y caracteres especiales en las rutas
    let filePath = path.join(__dirname, decodeURIComponent(req.url));

    // ERR-006: Prevenir Path Traversal
    const resolvedPath = path.resolve(filePath);
    if (!resolvedPath.startsWith(path.resolve(__dirname))) {
        res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<h1>403 Forbidden</h1>', 'utf-8');
        return;
    }
    filePath = resolvedPath;
    
    // Si es un directorio, servir index.html por defecto
    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
        filePath = path.join(filePath, 'index.html');
    }

    const basename = path.basename(filePath);
    if (basename.startsWith('.') || ['package.json', 'package-lock.json', 'server.js'].includes(basename)) {
        res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<h1>403 Forbidden</h1>', 'utf-8');
        return;
    }

    const extname = String(path.extname(filePath)).toLowerCase();
    const contentType = MIME_TYPES[extname];
    if (!contentType) {
        res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<h1>403 Forbidden</h1>', 'utf-8');
        return;
    }

    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code === 'ENOENT') {
                console.log(`404: ${req.url} (File not found at: ${filePath})`);
                res.writeHead(404, { 'Content-Type': 'text/html' });
                res.end('<h1>404 Not Found</h1>', 'utf-8');
            } else {
                console.log(`500: ${req.url} (Error: ${error.code})`);
                res.writeHead(500);
                res.end(`Error del servidor: ${error.code} ..\n`);
            }
        } else {
            // Log successful responses for JS/CSS/HTML/JSON to avoid too much noise from images
            if (['.html', '.js', '.css', '.json'].includes(extname)) {
                console.log(`200: ${req.url}`);
            }
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

let isRetrying = false;

server.on('listening', () => {
    const actualPort = server.address().port;
    const url = `http://localhost:${actualPort}`;
    console.log(`=======================================================`);
    console.log(` VIVE TRAVEL CRM - SERVIDOR LOCAL`);
    console.log(`=======================================================`);
    console.log(` Servidor activo en: ${url}`);
    console.log(` Para detener el servidor presiona: Ctrl + C`);
    console.log(`=======================================================`);

    // Abre el navegador automáticamente según la plataforma
    const openCmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
    exec(`${openCmd} ${url}`);
});

server.on('error', (error) => {
    if (error.code === 'EADDRINUSE' && !isRetrying) {
        isRetrying = true;
        console.warn(`[WARN] El puerto ${PORT} está ocupado. Buscando un puerto libre...`);
        server.listen(0);
    } else {
        console.error('Error en el servidor:', error);
        process.exit(1);
    }
});

server.listen(PORT);
