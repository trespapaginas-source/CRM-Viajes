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
