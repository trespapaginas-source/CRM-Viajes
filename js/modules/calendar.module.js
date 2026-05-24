import { RentabilidadComponent } from '../../src/components/rentabilidad/rentabilidad.component.js';
// js/modules/calendar.module.js — Planificador Visual
// Extraído de app.js líneas 3193–3387
import { DataService } from '../services/supabase.service.js';
import { UI } from '../utils/ui.utils.js';
import { formatCOP, formatShortDate } from '../utils/format.utils.js';

const getPlanColors = (plan) => {
    const colors = [
        { bg: 'bg-emerald-50/70 hover:bg-emerald-50', border: 'border-l-emerald-500 border-emerald-100/30', text: 'text-emerald-950', dot: 'bg-emerald-500' },
        { bg: 'bg-sky-50/70 hover:bg-sky-50', border: 'border-l-sky-500 border-sky-100/30', text: 'text-sky-950', dot: 'bg-sky-500' },
        { bg: 'bg-amber-50/70 hover:bg-amber-50', border: 'border-l-amber-500 border-amber-100/30', text: 'text-amber-950', dot: 'bg-amber-500' },
        { bg: 'bg-rose-50/70 hover:bg-rose-50', border: 'border-l-rose-500 border-rose-100/30', text: 'text-rose-950', dot: 'bg-rose-500' },
        { bg: 'bg-violet-50/70 hover:bg-violet-50', border: 'border-l-violet-500 border-violet-100/30', text: 'text-violet-950', dot: 'bg-violet-500' },
        { bg: 'bg-teal-50/70 hover:bg-teal-50', border: 'border-l-teal-500 border-teal-100/30', text: 'text-teal-950', dot: 'bg-teal-500' },
        { bg: 'bg-indigo-50/70 hover:bg-indigo-50', border: 'border-l-indigo-500 border-indigo-100/30', text: 'text-indigo-950', dot: 'bg-indigo-500' }
    ];
    let hash = 0;
    const str = plan.nombre || "";
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % colors.length;
    return colors[index];
};

export const CalendarModule = {
    currentDate: new Date(),
    currentPopPlanId: null,
    currentPopFecha: null,

    init() { this.populateFilters(); this.renderCalendar(); },

    populateFilters() {
        const fP = document.getElementById('cal-filter-plan');
        const fD = document.getElementById('cal-filter-destino');
        if (!fP || !fD) return;
        fP.innerHTML = '<option value="">Todos los Planes</option>';
        DataService.planes.forEach(p => fP.innerHTML += `<option value="${p.id}">${UI.sanitize(p.nombre)}</option>`);
        fD.innerHTML = '<option value="">Todos los Destinos</option>';
        DataService.db.destinos.forEach(d => fD.innerHTML += `<option value="${d}">${d}</option>`);
    },

    resetFilters() {
        document.getElementById('cal-filter-plan').value = "";
        document.getElementById('cal-filter-destino').value = "";
        this.currentDate = new Date();
        this.renderCalendar();
    },

    prevMonth() { this.currentDate.setMonth(this.currentDate.getMonth() - 1); this.renderCalendar(); },
    nextMonth() { this.currentDate.setMonth(this.currentDate.getMonth() + 1); this.renderCalendar(); },

    renderCalendar() {
        const grid = document.getElementById('calendar-grid');
        const labelMes = document.getElementById('cal-mes-actual');
        if (!grid || !labelMes) return;

        const year = this.currentDate.getFullYear();
        const month = this.currentDate.getMonth();
        const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
        labelMes.innerText = `${meses[month]} ${year}`;
        grid.innerHTML = '';

        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        // Celdas vacías (mes anterior) sin bordes redundantes, usando el gap nativo
        for (let i = 0; i < firstDay; i++) {
            grid.innerHTML += `<div class="bg-slate-50/30 min-h-[90px] md:min-h-[120px] transition-colors hover:bg-slate-50/50"></div>`;
        }

        const filterP = document.getElementById('cal-filter-plan').value;
        const filterD = document.getElementById('cal-filter-destino').value.toLowerCase();
        const salidasMap = {};

        DataService.planes.forEach(plan => {
            if (filterP && plan.id !== filterP) return;
            if (filterD && !(plan.destino || "").toLowerCase().includes(filterD)) return;
            if (plan.fechas && plan.fechas.length > 0) {
                plan.fechas.forEach(f => {
                    const fStart = new Date(f.start + "T00:00:00");
                    if (fStart.getFullYear() === year && fStart.getMonth() === month) {
                        const day = fStart.getDate();
                        if (!salidasMap[day]) salidasMap[day] = [];
                        const fechaFormat = f.start === f.end ? formatShortDate(f.start) : `${formatShortDate(f.start)} al ${formatShortDate(f.end)}`;
                        salidasMap[day].push({ plan, fechaFormat, rawDate: f.start });
                    }
                });
            }
        });

        const hoy = new Date();
        const isCurrentMonth = hoy.getFullYear() === year && hoy.getMonth() === month;

        for (let day = 1; day <= daysInMonth; day++) {
            const isToday = isCurrentMonth && hoy.getDate() === day;
            
            // Indicador del número de día
            const headerClass = isToday
                ? "bg-primary-600 text-white w-6 h-6 flex items-center justify-center rounded-full shadow-sm shadow-primary-600/20 font-black"
                : "text-slate-600 font-semibold w-6 h-6 flex items-center justify-center";

            let eventsHtml = '';
            if (salidasMap[day]) {
                salidasMap[day].forEach(sal => {
                    const col = getPlanColors(sal.plan);
                    eventsHtml += `
                        <div onclick="CalendarModule.showPopover('${sal.plan.id}', '${sal.fechaFormat}', '${UI.sanitize(sal.plan.nombre).replace(/'/g, "\\'")}')"
                            class="${col.bg} border-l-4 ${col.border} ${col.text} shadow-[0_1px_2px_rgba(0,0,0,0.02)] text-[10px] font-bold tracking-tight px-2 py-1.5 mt-1 rounded-r-lg cursor-pointer hover:shadow-md hover:-translate-y-px transition-all truncate flex items-center justify-between group">
                            <div class="flex items-center min-w-0 flex-1">
                                <span class="w-1.5 h-1.5 rounded-full ${col.dot} mr-1.5 shrink-0 opacity-85"></span>
                                <span class="truncate font-bold">${UI.sanitize(sal.plan.nombre)}</span>
                            </div>
                            <i class="ph ph-arrow-right opacity-0 group-hover:opacity-100 transition-opacity ml-1 text-[9px] shrink-0 text-slate-400"></i>
                        </div>`;
                });
            }

            const cellBg = isToday 
                ? "bg-primary-50/10 hover:bg-primary-50/20" 
                : "bg-white hover:bg-slate-50/30";

            grid.innerHTML += `
                <div class="${cellBg} p-2 min-h-[90px] md:min-h-[120px] flex flex-col transition-colors relative group">
                    <div class="flex justify-between items-center mb-1">
                        <span class="${headerClass} text-[11px]">${day}</span>
                    </div>
                    <div class="flex-1 flex flex-col gap-1 overflow-y-auto custom-scrollbar px-0.5">${eventsHtml}</div>
                </div>`;
        }

        const totalCells = firstDay + daysInMonth;
        const remaining = (7 - (totalCells % 7)) % 7;
        for (let i = 0; i < remaining; i++) {
            grid.innerHTML += `<div class="bg-slate-50/30 min-h-[90px] md:min-h-[120px] transition-colors hover:bg-slate-50/50"></div>`;
        }
    },

    showPopover(planId, fechaFormateada, planNombre) {
        this.currentPopPlanId = planId;
        this.currentPopFecha = fechaFormateada;

        document.getElementById('cal-pop-plan').innerText = planNombre;
        document.getElementById('cal-pop-fecha').innerText = fechaFormateada;

        const clientesSalida = DataService.clientes.filter(c => c.plan_id === planId && c.fecha_viaje === fechaFormateada && c.estado !== 'cancelado o devolución');
        const plan = DataService.planes.find(p => p.id === planId);

        let paxTotal = 0, ingresoBruto = 0, recaudado = 0;
        clientesSalida.forEach(c => {
            const px = parseInt(c.pax || 1);
            paxTotal += px;
            ingresoBruto += parseFloat(c.precio_total || 0);
            const abonosCli = DataService.abonos.filter(a => a.cliente_id === c.id && a.estado_pago !== 'pending' && a.estado_pago !== 'refunded').reduce((s, a) => s + (Number(a.monto) || 0), 0);
            recaudado += abonosCli;
        });

        const pendiente = Math.max(ingresoBruto - recaudado, 0);
        const gastosSalida = DataService.gastos.filter(g => g.plan_id === planId && g.fecha_viaje === fechaFormateada);
        let costoTotal = (parseFloat(plan?.costo_base || 0) * paxTotal);
        gastosSalida.forEach(g => {
            if (g.tipo_valor === 'fijo') costoTotal += parseFloat(g.valor);
            else costoTotal += ingresoBruto * (parseFloat(g.valor) / 100);
        });
        const margen = ingresoBruto - costoTotal;

        document.getElementById('cal-pop-pax').innerText = paxTotal;
        document.getElementById('cal-pop-recaudo').innerText = formatCOP(recaudado);
        document.getElementById('cal-pop-pendiente').innerText = formatCOP(pendiente);
        const margenEl = document.getElementById('cal-pop-margen');
        margenEl.innerText = formatCOP(margen);
        margenEl.className = `text-base font-black relative z-10 ${margen >= 0 ? 'text-emerald-400' : 'text-red-400'}`;

        UI.openModal('cal-popover-modal', 'cal-pop-bg', 'cal-pop-content');
    },

    goToRentabilidad() {
        UI.closeModal('cal-popover-modal', 'cal-pop-bg', 'cal-pop-content');
        setTimeout(() => {
            window.App.navigate('rentabilidad');
            setTimeout(() => RentabilidadComponent.openFinancialModal(this.currentPopPlanId, this.currentPopFecha), 400);
        }, 300);
    }
};
