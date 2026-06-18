const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const PORT = 8080;

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

const RESEND_API_KEY = 're_ami8ZT68_3Ug7UbRWfz1eL6ouMkXDc8mD';

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
            to: ['vivemarketingdigital@gmail.com', 'trespa.paginas@gmail.com', 'luismendezramirez@hotmail.es'],
            subject: '🚨 CRM Vive Travel: Alerta de Salidas Próximas',
            html: htmlContent
        })
    });

    if (!response.ok) {
        const errText = await response.text();
        if (response.status === 403 && errText.includes('You can only send testing emails to your own email address')) {
            console.warn("Resend Sandbox detected. Retrying send to verified sandbox owner (trespa.paginas@gmail.com)...");
            const retryResponse = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${RESEND_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    from: 'onboarding@resend.dev',
                    to: ['trespa.paginas@gmail.com'],
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
    
    // Si es un directorio, servir index.html por defecto
    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
        filePath = path.join(filePath, 'index.html');
    }

    const extname = String(path.extname(filePath)).toLowerCase();
    const contentType = MIME_TYPES[extname] || 'application/octet-stream';

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

server.listen(PORT, () => {
    const url = `http://localhost:${PORT}`;
    console.log(`=======================================================`);
    console.log(` VIVE TRAVEL CRM - SERVIDOR LOCAL`);
    console.log(`=======================================================`);
    console.log(` Servidor activo en: ${url}`);
    console.log(` Para detener el servidor presiona: Ctrl + C`);
    console.log(`=======================================================`);

    // Abre el navegador automáticamente en Windows
    exec(`start ${url}`);
});
