// ============================================================
// js/utils/format.utils.js — Utilidades de Formateo Financiero
// Dependencias: Ninguna
// Extraído de app.js líneas 10–83
// ============================================================

export function formatCOP(value) {
    if (value === null || value === undefined || isNaN(value)) return '$ 0';
    return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(Number(value));
}

export function formatShortDate(dateString) {
    if (!dateString) return 'Libre / Por Definir';
    const parts = dateString.split('-');
    if (parts.length !== 3) return dateString;
    const d = new Date(parts[0], parts[1] - 1, parts[2]);
    const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    return `${dias[d.getDay()]} ${d.getDate()} de ${meses[d.getMonth()]} del ${d.getFullYear()}`;
}

export function parseSpanishDate(dateStr) {
    if (!dateStr) return null;
    dateStr = dateStr.replace(/\(.*\)/g, '').trim();

    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        const parts = dateStr.split('-');
        return new Date(parts[0], parts[1] - 1, parts[2]);
    }

    const regex = /([A-Za-záéíóú]+)\s+(\d+)\s+de\s+([A-Za-z]+)\s+del\s+(\d{4})/i;
    const match = dateStr.match(regex);
    if (match) {
        const dia = parseInt(match[2]);
        const mesStr = match[3].toLowerCase();
        const year = parseInt(match[4]);
        const meses = {
            'ene': 0, 'feb': 1, 'mar': 2, 'abr': 3, 'may': 4, 'jun': 5,
            'jul': 6, 'ago': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dic': 11
        };
        const mes = meses[mesStr.substring(0, 3)];
        if (mes !== undefined) return new Date(year, mes, dia);
    }
    return new Date(dateStr);
}

export function calcularFinanzas(totalAbonadoValido = 0, tarifaTotal = 0) {
    totalAbonadoValido = Number(Math.floor(totalAbonadoValido || 0));
    tarifaTotal = Number(Math.floor(tarifaTotal || 0));

    const saldo = Math.max(tarifaTotal - totalAbonadoValido, 0);
    let porcentajeTimes100 = 0;

    if (tarifaTotal > 0) {
        porcentajeTimes100 = Math.floor((totalAbonadoValido * 10000) / tarifaTotal);
    }

    let porcentaje = porcentajeTimes100 / 100;
    if (porcentaje > 100) porcentaje = 100;

    const credito = totalAbonadoValido > tarifaTotal ? (totalAbonadoValido - tarifaTotal) : 0;

    return { abonado: totalAbonadoValido, tarifa: tarifaTotal, saldo, porcentaje, credito };
}

export function updateFinancialUI(reservationData) {
    const tarifa = Number(reservationData.tarifa_total_negociada || 0);
    const abonado = Number(reservationData.total_abonado || 0);
    const fin = calcularFinanzas(abonado, tarifa);

    const elARecaudar = document.getElementById('cf-resumen-total');
    const elRecaudado = document.getElementById('cf-resumen-abonado');
    const elPorcentaje = document.getElementById('cf-resumen-saldo');
    const progressBar = document.getElementById('cf-progress-bar');

    if (elARecaudar) elARecaudar.innerText = formatCOP(fin.saldo);
    if (elRecaudado) elRecaudado.innerText = formatCOP(fin.abonado);

    if (elPorcentaje) {
        elPorcentaje.innerHTML = fin.porcentaje >= 100
            ? '<span class="text-green-400">100% Pagado</span>'
            : `${fin.porcentaje}%`;
    }
    if (progressBar) progressBar.style.width = `${fin.porcentaje}%`;

    let badge = document.getElementById('cf-credito-badge');
    if (fin.credito > 0) {
        if (!badge) {
            badge = document.createElement('div');
            badge.id = 'cf-credito-badge';
            badge.className = 'text-[10px] font-black text-amber-400 uppercase tracking-widest mt-1 bg-amber-900/30 px-2 py-1 rounded shadow-sm';
            if (elRecaudado) elRecaudado.parentElement.appendChild(badge);
        }
        badge.innerHTML = `<i class="ph ph-warning-circle"></i> Crédito a favor: ${formatCOP(fin.credito)}`;
    } else if (badge) {
        badge.remove();
    }
}

export function formatDoubleDate(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.split(/\s+AL\s+/i);
    if (parts.length !== 2) {
        // Keep single dates exactly as they are
        return dateStr;
    }

    const cleanDatePart = (partStr, keepYear) => {
        const tokens = partStr.trim().split(/\s+/);
        // Find first numeric token
        const dayIndex = tokens.findIndex(t => /^\d+$/.test(t));
        if (dayIndex === -1) return partStr;

        let cleanTokens = tokens.slice(dayIndex);

        if (!keepYear) {
            if (cleanTokens.length >= 3) {
                const lastToken = cleanTokens[cleanTokens.length - 1];
                if (/^\d{4}$/.test(lastToken)) {
                    cleanTokens.pop();
                    const prevToken = cleanTokens[cleanTokens.length - 1].toLowerCase();
                    if (prevToken === 'del' || prevToken === 'de') {
                        cleanTokens.pop();
                    }
                }
            }
        }

        return cleanTokens.map(token => {
            const lower = token.toLowerCase();
            if (lower === 'de' || lower === 'del') return lower;
            if (/^\d+$/.test(token)) return token;
            return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
        }).join(' ');
    };

    const part1 = cleanDatePart(parts[0], false);
    const part2 = cleanDatePart(parts[1], true);

    return `${part1} al ${part2}`;
}

/**
 * Distribuye un monto entero entre N partes sin perder centavos.
 * El residuo (total % count) se reparte de 1 en 1 a los primeros elementos.
 * Ejemplo: distributeAmount(1000003, 4) → [250001, 250001, 250001, 250000]
 * @param {number} total - Monto total a distribuir (entero positivo)
 * @param {number} count - Cantidad de partes (>= 1)
 * @returns {number[]} Array de montos que suman exactamente `total`
 */
export function distributeAmount(total, count) {
    if (count <= 0) return [];
    if (count === 1) return [total];
    total = Math.floor(total);
    const base = Math.floor(total / count);
    const remainder = total - (base * count);
    const result = [];
    for (let i = 0; i < count; i++) {
        result.push(base + (i < remainder ? 1 : 0));
    }
    return result;
}

