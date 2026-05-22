// Copying the relevant logic to run a clean node test.

function parseSpanishDate(dateStr) {
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

const parseRange = function(dateStr) {
    if (!dateStr) return null;
    const cleanStr = dateStr.replace(/\(.*?\)/g, '').trim();
    const splitters = [/\s+al\s+/i, /\s+a\s+/i, /\s+-\s+/];
    for (const splitter of splitters) {
        if (splitter.test(cleanStr)) {
            const parts = cleanStr.split(splitter);
            if (parts.length === 2) {
                const start = parseSpanishDate(parts[0].trim());
                const end = parseSpanishDate(parts[1].trim());
                if (start && end && !isNaN(start.getTime()) && !isNaN(end.getTime())) {
                    return { start, end };
                }
            }
        }
    }
    const single = parseSpanishDate(cleanStr);
    if (single && !isNaN(single.getTime())) {
        return { start: single, end: single };
    }
    return null;
};

const calculateDuration = function(start, end, planTipo) {
    const isPasadia = planTipo && planTipo.toLowerCase().includes('pasadía');
    if (isPasadia) {
        return '1 Día (Pasadía)';
    }
    if (start && end && !isNaN(start.getTime()) && !isNaN(end.getTime())) {
        const diffTime = Math.abs(end - start);
        const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24)); // using round to avoid timezone/DST issues
        if (diffDays === 0) {
            return '1 Día (Pasadía)';
        } else {
            const days = diffDays;
            const nights = Math.max(0, diffDays - 1);
            const daysStr = days === 1 ? '1 Día' : `${days} Días`;
            const nightsStr = nights === 1 ? '1 Noche' : `${nights} Noches`;
            return `${daysStr} / ${nightsStr}`;
        }
    }
    return null;
};

// Running test cases
const testCases = [
    // Pasadía explicitly by type
    {
        start: '2026-05-17',
        end: '2026-05-17',
        tipo: 'Pasadía',
        expected: '1 Día (Pasadía)'
    },
    // Multi-day plan
    {
        start: '2026-07-10',
        end: '2026-07-12',
        tipo: 'Plan a la medida',
        expected: '2 Días / 1 Noche'
    },
    // Multi-day plan (July 8 to 11)
    {
        start: '2026-07-08',
        end: '2026-07-11',
        tipo: 'Plan grupal',
        expected: '3 Días / 2 Noches'
    },
    // Single-day range (start and end are same, not explicitly pasadía)
    {
        start: '2026-05-17',
        end: '2026-05-17',
        tipo: 'Transporte',
        expected: '1 Día (Pasadía)'
    },
    // Spanish date range: "Domingo 14 de Jun del 2026 al Miércoles 17 de Jun del 2026"
    {
        rangeStr: "Domingo 14 de Jun del 2026 al Miércoles 17 de Jun del 2026",
        tipo: "Viaje grupal",
        expected: "3 Días / 2 Noches"
    },
    // Spanish date range: "Viernes 10 de Jul del 2026 al Domingo 12 de Jul del 2026"
    {
        rangeStr: "Viernes 10 de Jul del 2026 al Domingo 12 de Jul del 2026",
        tipo: "Plan a la medida",
        expected: "2 Días / 1 Noche"
    }
];

console.log("--- STARTING TESTS ---");
let passed = 0;
for (const tc of testCases) {
    let startObj, endObj;
    if (tc.rangeStr) {
        const parsed = parseRange(tc.rangeStr);
        if (parsed) {
            startObj = parsed.start;
            endObj = parsed.end;
        } else {
            console.error(`FAIL: Could not parse range "${tc.rangeStr}"`);
            continue;
        }
    } else {
        startObj = parseSpanishDate(tc.start);
        endObj = parseSpanishDate(tc.end);
    }

    const duration = calculateDuration(startObj, endObj, tc.tipo);
    const success = duration === tc.expected;
    if (success) {
        console.log(`PASS: [${tc.tipo}] Date details -> calculated: "${duration}" (expected: "${tc.expected}")`);
        passed++;
    } else {
        console.log(`FAIL: [${tc.tipo}] Date details -> calculated: "${duration}" (expected: "${tc.expected}")`);
    }
}
console.log(`Summary: Passed ${passed}/${testCases.length}`);
