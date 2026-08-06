const fs = require('fs');
const path = require('path');

const supabaseUrl = 'https://qefuqkplornelbzwqgri.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFlZnVxa3Bsb3JuZWxiendxZ3JpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4MDkzMTUsImV4cCI6MjA4ODM4NTMxNX0.nqTpWWq0wJXrY-JynUz_oPUEGaMhVbTK1dOBBq3p9rs';

function formatCurrency(amount) {
    if (amount === null || amount === undefined || isNaN(amount)) return '$0';
    return '$' + Number(amount).toLocaleString('es-CO');
}

function formatDate(isoStr) {
    if (!isoStr) return 'N/A';
    try {
        const d = new Date(isoStr);
        if (isNaN(d.getTime())) return isoStr;
        return d.toLocaleDateString('es-CO', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch (e) {
        return isoStr;
    }
}

async function main() {
    console.log("=== GENERANDO REPORTE DE CLIENTES VIVE TRAVEL ===");

    // 1. Obtener Clientes
    const resCli = await fetch(`${supabaseUrl}/rest/v1/clientes?select=*&order=created_at.desc`, {
        headers: {
            'apikey': supabaseAnonKey,
            'Authorization': `Bearer ${supabaseAnonKey}`
        }
    });
    if (!resCli.ok) {
        console.error("Error consultando clientes de Supabase:", await resCli.text());
        return;
    }
    const clientes = await resCli.json();

    // 2. Obtener Planes
    const resPlanes = await fetch(`${supabaseUrl}/rest/v1/planes?select=*`, {
        headers: {
            'apikey': supabaseAnonKey,
            'Authorization': `Bearer ${supabaseAnonKey}`
        }
    });
    const planes = await resPlanes.json();
    const planeMap = new Map();
    (planes || []).forEach(p => planeMap.set(p.id, p));

    console.log(`Clientes encontrados en la BD: ${clientes.length}`);
    console.log(`Planes encontrados en la BD: ${planes.length}`);

    // Estadísticas
    let totalVendido = 0;
    let totalAbonado = 0;
    let totalSaldoPendiente = 0;
    let clientesActivos = 0;
    let clientesEliminados = 0;
    const porDestino = {};
    const porEstado = {};

    clientes.forEach(c => {
        const isDeleted = Boolean(c.deleted_at);
        if (isDeleted) {
            clientesEliminados++;
        } else {
            clientesActivos++;
        }

        const plan = planeMap.get(c.plan_id);
        const destino = plan?.destino || 'Sin Destino Asignado';
        const estado = c.estado || 'Sin Estado';

        const precio = parseFloat(c.precio_total || 0);
        const abono = parseFloat(c.abono_acumulado || 0);
        const saldo = parseFloat(c.saldo_restante || (precio - abono));

        if (!isDeleted) {
            totalVendido += precio;
            totalAbonado += abono;
            totalSaldoPendiente += saldo;

            porDestino[destino] = (porDestino[destino] || 0) + 1;
            porEstado[estado] = (porEstado[estado] || 0) + 1;
        }
    });

    // Construcción del documento Markdown
    let md = `# 📊 Reporte Maestro de Clientes y Ventas — CRM Vive Travel\n\n`;
    md += `> **Fecha de generación:** ${new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' })}\n`;
    md += `> **Origen de datos:** Base de Datos Supabase (Tabla \`clientes\` y \`planes\`)\n\n`;

    md += `---\n\n`;
    md += `## 📈 Resumen Ejecutivo y Estadísticas\n\n`;
    md += `| Métrica | Valor |\n`;
    md += `| :--- | :--- |\n`;
    md += `| **Total Registros en BD** | ${clientes.length} |\n`;
    md += `| **Clientes Activos / Reservas** | ${clientesActivos} |\n`;
    md += `| **Registros en Papelera / Pruebas (\`deleted_at\`)** | ${clientesEliminados} |\n`;
    md += `| **Monto Total Vendido (Activos)** | ${formatCurrency(totalVendido)} |\n`;
    md += `| **Monto Total Recaudado / Abonos** | ${formatCurrency(totalAbonado)} |\n`;
    md += `| **Saldo Pendiente por Cobrar** | ${formatCurrency(totalSaldoPendiente)} |\n\n`;

    md += `### 🏙️ Distribución por Destino (Clientes Activos)\n\n`;
    md += `| Destino | N° de Viajeros |\n`;
    md += `| :--- | :--- |\n`;
    if (Object.keys(porDestino).length === 0) {
        md += `| *Sin reservas activas registradas* | 0 |\n`;
    } else {
        for (const [dest, count] of Object.entries(porDestino)) {
            md += `| ${dest} | ${count} |\n`;
        }
    }
    md += `\n`;

    md += `### 📌 Distribución por Estado de Reserva\n\n`;
    md += `| Estado | N° de Clientes |\n`;
    md += `| :--- | :--- |\n`;
    if (Object.keys(porEstado).length === 0) {
        md += `| *Sin estados registrados* | 0 |\n`;
    } else {
        for (const [est, count] of Object.entries(porEstado)) {
            md += `| ${est} | ${count} |\n`;
        }
    }
    md += `\n`;

    md += `---\n\n`;
    md += `## 📋 Tabla Maestra Consolidada de Clientes\n\n`;
    md += `*Esta tabla contiene la totalidad de los datos recaudados de cada viajero. Puedes seleccionarla y copiarla directamente a **Microsoft Excel** o **Google Sheets**.*\n\n`;

    // Encabezados de la tabla maestra
    const headers = [
        "ID Registro",
        "Estado Reg.",
        "Nombre",
        "Apellido",
        "Documento / DNI",
        "Teléfono / Celular",
        "Email",
        "Ciudad Origen",
        "Edad",
        "EPS",
        "Alergias",
        "Requerimientos Especiales",
        "Contacto Emergencia",
        "Plan Comprado",
        "Destino",
        "Fecha de Viaje",
        "Pasajeros (Pax)",
        "Tipo Reserva",
        "Canal / Etiqueta",
        "Precio Total Plan",
        "Abono Acumulado",
        "Saldo Restante",
        "Costo Base Operativo",
        "Fecha Creación"
    ];

    md += `| ${headers.join(" | ")} |\n`;
    md += `| ${headers.map(() => ":---").join(" | ")} |\n`;

    clientes.forEach(c => {
        const plan = planeMap.get(c.plan_id);
        const planNombre = plan ? plan.nombre.replace(/\|/g, '-') : (c.plan_id ? 'Plan No Encontrado' : 'Sin Plan');
        const planDestino = plan ? (plan.destino || 'N/A').replace(/\|/g, '-') : 'N/A';

        const estadoReg = c.deleted_at ? `⚠️ Eliminado (${c.motivo_eliminacion || 'Soft delete'})` : (c.estado || 'Activo');
        const precio = parseFloat(c.precio_total || 0);
        const abono = parseFloat(c.abono_acumulado || 0);
        const saldo = parseFloat(c.saldo_restante || (precio - abono));
        const costoBase = parseFloat(c.costo_base || plan?.costo_base || 0);

        const clean = (val) => (val === null || val === undefined || val === '') ? 'N/A' : String(val).replace(/\|/g, '-').replace(/\n/g, ' ');

        const row = [
            clean(c.id),
            clean(estadoReg),
            clean(c.nombre),
            clean(c.apellido),
            clean(c.documento),
            clean(c.telefono),
            clean(c.email),
            clean(c.ciudad),
            clean(c.edad),
            clean(c.eps),
            clean(c.alergias),
            clean(c.requerimientos),
            clean(c.contacto_emergencia),
            clean(planNombre),
            clean(planDestino),
            clean(c.fecha_viaje),
            clean(c.pax),
            clean(c.tipo_reserva),
            clean(c.etiqueta),
            formatCurrency(precio),
            formatCurrency(abono),
            formatCurrency(saldo),
            formatCurrency(costoBase),
            formatDate(c.created_at)
        ];

        md += `| ${row.join(" | ")} |\n`;
    });

    md += `\n\n---\n\n`;
    md += `## 🛠️ Instrucciones para Exportar a Excel\n\n`;
    md += `1. Selecciona todo el contenido de la **Tabla Maestra Consolidada** arriba.\n`;
    md += `2. Copia la selección (\`Ctrl + C\` o \`Cmd + C\`).\n`;
    md += `3. Abre una hoja en **Microsoft Excel** o **Google Sheets** y pega directamente (\`Ctrl + V\` o \`Cmd + V\`).\n`;
    md += `4. Las columnas y filas se alinearán automáticamente en las celdas correspondientes.\n\n`;
    md += `> **Nota de actualización:** Puedes volver a generar este reporte en cualquier momento ejecutando el comando:\n`;
    md += `> \`node generar_reporte_clientes.js\`\n`;

    const outputPath = path.join(__dirname, 'REPORTE_CLIENTES_MAESTRO.md');
    fs.writeFileSync(outputPath, md, 'utf8');

    console.log(`\n✅ ¡Reporte generado exitosamente en:\n${outputPath}`);
}

main();
