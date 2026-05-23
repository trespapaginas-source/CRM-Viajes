import { DataService } from '../../../js/services/supabase.service.js';
import { Store } from '../../core/store.js';
import { UI } from '../../../js/utils/ui.utils.js';
import { formatCOP, parseSpanishDate } from '../../../js/utils/format.utils.js';

export const DashboardComponent = {
    currentRange: 'mes',
    lineChart: null,
    doughnutChart: null,
    eventsBound: false,

    init() {
        this.bindEvents();
        this.updateDataByDate('mes');

        Store.subscribe((state) => {
            if (state.lastUpdated === 'full' || state.lastUpdated === 'clientes' || state.lastUpdated === 'abonos' || state.lastUpdated === 'gastos') {
                if (document.getElementById('view-dashboard')?.classList.contains('active')) {
                    this.updateKPIs();
                }
            }
        });
    },

    bindEvents() {
        if (this.eventsBound) return;

        document.body.addEventListener('click', (e) => {
            const target = e.target.closest('[data-action]');
            if (!target) return;

            const action = target.dataset.action;

            if (action === 'update-dashboard-range') {
                this.updateDataByDate(target.dataset.range);
            }
        });

        this.eventsBound = true;
    },

    updateDataByDate(range) {
        this.currentRange = range;
        document.querySelectorAll('.time-pill').forEach(btn => {
            btn.classList.remove('bg-white', 'text-slate-900', 'shadow-sm');
            btn.classList.add('text-slate-500');
        });

        const activeBtn = document.getElementById(`pill-${range}`);
        if (activeBtn) {
            activeBtn.classList.add('bg-white', 'text-slate-900', 'shadow-sm');
            activeBtn.classList.remove('text-slate-500');
        }
        this.updateKPIs();
    },

    updateKPIs() {
        let ingresosTotales = 0, costosBase = 0, totalPasajeros = 0;
        let totalRecaudado = 0, carteraPendiente = 0;
        let totalClientesGeneral = 0, totalCancelados = 0;

        const now = new Date();
        let startDate = new Date(0);
        if (this.currentRange === 'hoy') startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        else if (this.currentRange === 'semana') { startDate = new Date(); startDate.setDate(now.getDate() - 7); }
        else if (this.currentRange === 'mes') startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        else if (this.currentRange === 'ano') startDate = new Date(now.getFullYear(), 0, 1);

        const planStats = {};

        // 1. Crear índices Hash Map O(1)
        const abonosMap = {};
        DataService.abonos.forEach(a => {
            if (a.estado_pago !== 'pending' && a.estado_pago !== 'refunded') {
                abonosMap[a.cliente_id] = (abonosMap[a.cliente_id] || 0) + (Number(a.monto) || 0);
            }
        });

        const ingresosSalidaMap = {};
        DataService.clientes.forEach(c => {
            if (c.estado !== 'cancelado o devolución') {
                const key = `${c.plan_id}_${c.fecha_viaje}`;
                ingresosSalidaMap[key] = (ingresosSalidaMap[key] || 0) + parseFloat(c.precio_total || 0);
            }
        });

        // 2. Calcular salidas próximas (7 días)
        let salidasProximas = 0;
        const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
        const en7Dias = new Date(hoy); en7Dias.setDate(hoy.getDate() + 7);
        const fechasContadas = new Set();

        DataService.clientes.forEach(cli => {
            const st = cli.estado ? cli.estado.toLowerCase() : '';
            if (['desistió', 'cancelado o devolución', 'cancelados'].includes(st)) return;
            const fechaKey = `${cli.plan_id}_${cli.fecha_viaje}`;
            if (fechasContadas.has(fechaKey)) return;

            const dateViaje = parseSpanishDate(cli.fecha_viaje);
            if (dateViaje && !isNaN(dateViaje) && dateViaje >= hoy && dateViaje <= en7Dias) {
                salidasProximas++;
                fechasContadas.add(fechaKey);
            }
        });

        // 3. Procesar Clientes
        DataService.clientes.forEach(cli => {
            const clientDate = new Date(cli.created_at);
            const stLower = cli.estado ? cli.estado.toLowerCase() : '';
            const isCancelled = ['cancelado o devolución', 'desistió', 'cancelados'].includes(stLower);

            // Conteo global
            if (clientDate >= startDate) {
                totalClientesGeneral++;
                if (isCancelled) totalCancelados++;
            }

            const isNotCancelled = !isCancelled;
            const isActiveSale = (isNotCancelled && clientDate >= startDate);

            if (isActiveSale) {
                const precio = parseFloat(cli.precio_total || 0);
                const abonosCli = abonosMap[cli.id] || 0;

                ingresosTotales += precio;
                totalRecaudado += abonosCli;
                carteraPendiente += Math.max(precio - abonosCli, 0);

                const paxCli = parseInt(cli.pax || 1);
                totalPasajeros += paxCli;

                const plan = DataService.planes.find(p => p.id === cli.plan_id);
                if (plan) {
                    const planCost = parseFloat(plan.costo_base || 0) * paxCli;
                    costosBase += planCost;

                    if (!planStats[plan.id]) {
                        planStats[plan.id] = {
                            nombre: plan.nombre,
                            destino: plan.destino,
                            totalVendido: 0,
                            totalRecaudado: 0,
                            costos: 0,
                            pax: 0,
                            pagados: 0,
                            deben: 0
                        };
                    }

                    planStats[plan.id].totalVendido += precio;
                    planStats[plan.id].totalRecaudado += abonosCli;
                    planStats[plan.id].costos += planCost;
                    planStats[plan.id].pax += paxCli;

                    if (abonosCli >= precio - 1) planStats[plan.id].pagados += paxCli;
                    else planStats[plan.id].deben += paxCli;
                }
            }
        });

        // 4. Procesar Gastos
        DataService.gastos.forEach(gasto => {
            const gastoDate = new Date(gasto.created_at);
            if (gastoDate >= startDate) {
                if (gasto.tipo_valor === 'fijo') {
                    costosBase += parseFloat(gasto.valor || 0);
                } else if (gasto.tipo_valor === 'porcentaje') {
                    const key = `${gasto.plan_id}_${gasto.fecha_viaje}`;
                    const ingresoBrutoSalida = ingresosSalidaMap[key] || 0;
                    costosBase += ingresoBrutoSalida * (parseFloat(gasto.valor) / 100);
                }
            }
        });

        // 5. Renderizar KPIs
        const beneficioNetoPuro = ingresosTotales - costosBase;
        const margenPorcentual = ingresosTotales > 0 ? ((beneficioNetoPuro / ingresosTotales) * 100).toFixed(1) : 0;

        UI.animateMoney("kpi-ingresos", ingresosTotales);
        UI.animateMoney("kpi-costos", costosBase);
        UI.animateMoney("kpi-margen", beneficioNetoPuro);

        const pctObj = document.getElementById('kpi-margen-pct');
        if (pctObj) pctObj.innerText = margenPorcentual + '%';

        const countObj = document.getElementById('kpi-clientes');
        if (countObj) countObj.innerText = totalPasajeros;

        // 6. KPIs estratégicos
        UI.animateMoney("kpi-recaudado", totalRecaudado);
        UI.animateMoney("kpi-cartera", carteraPendiente);

        const proximasEl = document.getElementById('kpi-proximas');
        if (proximasEl) proximasEl.innerText = salidasProximas;

        const cancelacionEl = document.getElementById('kpi-cancelacion');
        if (cancelacionEl) {
            const tasaCancelacion = totalClientesGeneral > 0 ? ((totalCancelados / totalClientesGeneral) * 100).toFixed(1) : 0;
            cancelacionEl.innerText = tasaCancelacion + '%';
        }

        this.renderActivePlans(planStats);
        this.renderRealCharts(planStats);
    },

    renderActivePlans(planStats) {
        const container = document.getElementById('active-plans-stats');
        if (!container) return;
        container.innerHTML = '';

        const plansArray = Object.values(planStats).sort((a, b) => b.totalVendido - a.totalVendido);
        const top3Plans = plansArray.slice(0, 3);

        top3Plans.forEach(p => {
            const pct = p.totalVendido > 0 ? Math.min(100, Math.round((p.totalRecaudado / p.totalVendido) * 100)) : 0;
            const margenReal = p.totalRecaudado - p.costos;

            container.innerHTML += `
                <div class="bg-white rounded-2xl p-5 border border-slate-100 flex flex-col relative overflow-hidden transition-all shadow-[0_1px_2px_rgba(15,23,42,0.02)]">
                    <div class="relative z-10 flex-1 flex flex-col">
                        <h4 class="font-semibold text-slate-900 text-base leading-tight truncate pr-2">${UI.sanitize(p.nombre)}</h4>
                        <p class="text-[10px] text-slate-400 font-medium mb-3 mt-1 flex items-center"><i class="ph ph-map-pin mr-1.5 text-slate-300 text-sm"></i>${UI.sanitize(p.destino || 'Destino Abierto')}</p>
                        <div class="grid grid-cols-2 gap-y-3 gap-x-4 mb-4">
                            <div>
                                <p class="text-[10px] text-slate-400 font-medium mb-0.5">Total Vendido</p>
                                <p class="text-sm font-semibold text-slate-900 tracking-tight">${formatCOP(p.totalVendido)}</p>
                            </div>
                            <div class="text-right">
                                <p class="text-[10px] text-slate-400 font-medium mb-0.5">Costos Base</p>
                                <p class="text-sm font-medium text-slate-500 tracking-tight">${formatCOP(p.costos)}</p>
                            </div>
                            <div>
                                <p class="text-[10px] text-slate-400 font-medium mb-0.5">Recaudado</p>
                                <p class="text-sm font-semibold text-slate-900 tracking-tight">${formatCOP(p.totalRecaudado)}</p>
                            </div>
                            <div class="text-right">
                                <p class="text-[10px] text-slate-400 font-medium mb-0.5">Margen a Hoy</p>
                                <p class="text-sm font-semibold tracking-tight ${margenReal >= 0 ? 'text-slate-900' : 'text-rose-500'}">${formatCOP(margenReal)}</p>
                            </div>
                        </div>
                        <div class="mt-auto">
                            <div class="flex justify-between items-center mb-1.5">
                                <span class="text-[10px] font-medium text-slate-500">Progreso</span>
                                <span class="text-[10px] font-semibold text-slate-855">${pct}%</span>
                            </div>
                            <div class="w-full bg-slate-100 h-1 rounded-full overflow-hidden mb-4">
                                <div class="bg-slate-900 h-full rounded-full transition-all duration-1000" style="width: ${pct}%"></div>
                            </div>
                            <div class="grid grid-cols-3 gap-2 border-t border-slate-100 pt-3">
                                <div class="flex items-center justify-center bg-slate-50 rounded-lg py-1.5 px-1 border border-slate-100/50">
                                    <i class="ph ph-users text-slate-400 mr-1.5 text-[10px]"></i>
                                    <span class="text-[10px] font-semibold text-slate-700">${p.pax} <span class="font-normal text-[8px] text-slate-400 uppercase ml-0.5">Pax</span></span>
                                </div>
                                <div class="flex items-center justify-center bg-slate-50 rounded-lg py-1.5 px-1 border border-slate-100/50">
                                    <i class="ph ph-check-circle text-slate-400 mr-1.5 text-[10px]"></i>
                                    <span class="text-[10px] font-semibold text-slate-700">${p.pagados} <span class="font-normal text-[8px] text-slate-400 uppercase ml-0.5">Al día</span></span>
                                </div>
                                <div class="flex items-center justify-center bg-slate-50 rounded-lg py-1.5 px-1 border border-slate-100/50">
                                    <i class="ph ph-warning-circle text-slate-400 mr-1.5 text-[10px]"></i>
                                    <span class="text-[10px] font-semibold text-slate-700">${p.deben} <span class="font-normal text-[8px] text-slate-400 uppercase ml-0.5">Deben</span></span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        });

        const emptySlots = 3 - top3Plans.length;
        for (let i = 0; i < emptySlots; i++) {
            container.innerHTML += `
                <div class="border border-dashed border-slate-200 bg-transparent rounded-2xl flex flex-col items-center justify-center text-slate-400 min-h-[280px] p-6 transition-colors hover:bg-slate-50/50">
                    <div class="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-[0_1px_2px_rgba(15,23,42,0.02)] border border-slate-100 mb-3">
                        <i class="ph ph-map-trifold text-2xl text-slate-300"></i>
                    </div>
                    <p class="text-[11px] font-semibold uppercase tracking-wider text-center text-slate-500">Espacio Disponible</p>
                    <p class="text-[10px] text-center mt-2 max-w-[200px] text-slate-400 font-medium">El sistema añadirá automáticamente un nuevo plan cuando registre ventas.</p>
                </div>
            `;
        }
    },

    renderRealCharts(planStats) {
        if (typeof Chart === 'undefined') return;
        
        const dashboardView = document.getElementById('view-dashboard');
        if (!dashboardView || !dashboardView.classList.contains('active')) return;

        Chart.defaults.font.family = "'Plus Jakarta Sans', sans-serif";
        Chart.defaults.color = '#64748b';

        const plansArray = Object.values(planStats).sort((a, b) => b.totalVendido - a.totalVendido);
        const labels = plansArray.map(p => p.nombre.length > 15 ? p.nombre.substring(0, 15) + '...' : p.nombre);
        const dataVendido = plansArray.map(p => p.totalVendido);
        const dataRecaudado = plansArray.map(p => p.totalRecaudado);

        if (this.lineChart) this.lineChart.destroy();
        const barCanvas = document.getElementById('revenueChart');
        if (barCanvas) {
            const ctxBar = barCanvas.getContext('2d');
            this.lineChart = new Chart(ctxBar, {
                type: 'bar',
                data: {
                    labels: labels.length > 0 ? labels : ['Sin datos'],
                    datasets: [
                        { label: 'Venta Total Negociada', data: dataVendido.length > 0 ? dataVendido : [0], backgroundColor: '#cbd5e1', borderRadius: 4 },
                        { label: 'Dinero Real Recaudado', data: dataRecaudado.length > 0 ? dataRecaudado : [0], backgroundColor: '#0f172a', borderRadius: 4 }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { position: 'top', labels: { usePointStyle: true, boxWidth: 8, font: { size: 11 } } } },
                    scales: {
                        y: { beginAtZero: true, grid: { borderDash: [4, 4], color: '#f1f5f9' } },
                        x: { grid: { display: false } }
                    }
                }
            });
        }

        if (this.doughnutChart) this.doughnutChart.destroy();
        const pieCanvas = document.getElementById('packagesChart');
        if (pieCanvas) {
            const ctxDoughnut = pieCanvas.getContext('2d');
            const bgColors = ['#0f172a', '#334155', '#475569', '#64748b', '#94a3b8', '#cbd5e1', '#e2e8f0', '#f1f5f9'];
            this.doughnutChart = new Chart(ctxDoughnut, {
                type: 'doughnut',
                data: {
                    labels: labels.length > 0 ? labels : ['Sin datos'],
                    datasets: [{ data: dataVendido.length > 0 ? dataVendido : [1], backgroundColor: bgColors.slice(0, labels.length || 1), borderWidth: 0 }]
                },
                options: { responsive: true, maintainAspectRatio: false, cutout: '75%', plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, font: { size: 10 } } } } }
            });
        }
    }
};
