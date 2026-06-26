import { DataService } from '../../../js/services/supabase.service.js';
import { Store } from '../../core/store.js';
import { UI } from '../../../js/utils/ui.utils.js';
import { formatCOP } from '../../../js/utils/format.utils.js';

export const FacturacionComponent = {
    eventsBound: false,

    init() {
        this.populatePaymentMethods();
        this.bindEvents();
        this.render();

        // Reactivity subscription
        Store.subscribe((state) => {
            if (state.lastUpdated === 'full' || state.lastUpdated === 'abonos' || state.lastUpdated === 'clientes') {
                this.render();
            }
        });
    },



    bindEvents() {
        if (this.eventsBound) return;

        // Search inputs / Filters
        const searchInput = document.getElementById('facturacion-search');
        if (searchInput) searchInput.addEventListener('input', () => this.renderTableOnly());

        const methodFilter = document.getElementById('facturacion-filter-metodo');
        if (methodFilter) methodFilter.addEventListener('change', () => this.renderTableOnly());

        const stateFilter = document.getElementById('facturacion-filter-estado');
        if (stateFilter) stateFilter.addEventListener('change', () => this.renderTableOnly());

        const dateStart = document.getElementById('facturacion-date-start');
        if (dateStart) dateStart.addEventListener('change', () => this.renderTableOnly());

        const dateEnd = document.getElementById('facturacion-date-end');
        if (dateEnd) dateEnd.addEventListener('change', () => this.renderTableOnly());

        // Audit diagnose button click
        const diagnoseBtn = document.getElementById('btn-facturacion-diagnose');
        if (diagnoseBtn) {
            diagnoseBtn.addEventListener('click', () => this.openAuditModal());
        }

        // Event Delegation for action buttons
        document.body.addEventListener('click', (e) => {
            const target = e.target.closest('button');
            if (!target) return;

            if (target.dataset.action === 'facturacion-recibo') {
                const abonoId = target.dataset.abonoId;
                if (abonoId) {
                    window.emitirReciboAbono(abonoId);
                }
            } else if (target.dataset.action === 'facturacion-whatsapp') {
                const abonoId = target.dataset.abonoId;
                if (abonoId) {
                    this.shareWhatsApp(abonoId);
                }
            }
        });

        this.eventsBound = true;
    },

    populatePaymentMethods() {
        const select = document.getElementById('facturacion-filter-metodo');
        if (!select) return;

        select.innerHTML = '<option value="">Todos los métodos</option>';
        const metodos = [...new Set(DataService.abonos.map(a => a.metodo).filter(Boolean))];
        metodos.forEach(m => {
            select.innerHTML += `<option value="${UI.sanitize(m)}">${UI.sanitize(m)}</option>`;
        });
    },

    getFilteredAbonos() {
        const search = (document.getElementById('facturacion-search')?.value || '').toLowerCase();
        const metodo = document.getElementById('facturacion-filter-metodo')?.value || '';
        const estado = document.getElementById('facturacion-filter-estado')?.value || '';
        const start = document.getElementById('facturacion-date-start')?.value || '';
        const end = document.getElementById('facturacion-date-end')?.value || '';

        return DataService.abonos.filter(a => {
            // Find corresponding client
            const c = DataService.clientes.find(cli => cli.id === a.cliente_id);
            const clientName = c ? `${c.nombre} ${c.apellido || ''}`.toLowerCase() : '';
            const clientDoc = c ? (c.documento || '').toLowerCase() : '';
            
            // Search text match
            if (search && !clientName.includes(search) && !clientDoc.includes(search) && !a.id.toLowerCase().includes(search)) {
                return false;
            }

            // Method filter match
            if (metodo && a.metodo !== metodo) {
                return false;
            }

            // State filter match
            if (estado && a.estado_pago !== estado) {
                return false;
            }

            // Date range match (comparing created_at date part)
            if (a.created_at) {
                const itemDate = a.created_at.split('T')[0];
                if (start && itemDate < start) return false;
                if (end && itemDate > end) return false;
            }

            return true;
        });
    },

    render() {
        this.populatePaymentMethods();
        this.renderKPIs();
        this.renderTableOnly();

        // Control audit button visibility
        const btnContainer = document.getElementById('facturacion-audit-btn-container');
        if (btnContainer) {
            const email = window.AuthModule?.currentUser?.email;
            const rol = window.AuthModule?.userProfile?.rol;
            if (email === 'trespa.paginas@gmail.com' || rol === 'super_administrador') {
                btnContainer.classList.remove('hidden');
            } else {
                btnContainer.classList.add('hidden');
            }
        }
    },

    renderKPIs() {
        // Confirmed abonos only for KPIs
        const confirmedAbonos = DataService.abonos.filter(a => {
            const isValidState = a.estado_pago === 'confirmed' || (a.estado_pago !== 'pending' && a.estado_pago !== 'refunded');
            if (!isValidState) return false;

            // Find corresponding client status
            const c = DataService.clientes.find(cli => cli.id === a.cliente_id);
            if (c) {
                const clientStatus = (c.estado || '').toLowerCase();
                // Exclude clients who are Cancelado, Devolución, or Desistió
                // But keep "En Caja" (which means they didn't travel but their payment is retained)
                if (
                    clientStatus.includes('cancel') ||
                    clientStatus.includes('devolu') ||
                    clientStatus.includes('desisti') ||
                    clientStatus.includes('desistió')
                ) {
                    return false;
                }
            }
            return true;
        });
        
        const total = confirmedAbonos.reduce((sum, a) => sum + (Number(a.monto) || 0), 0);
        const count = confirmedAbonos.length;
        const avg = count > 0 ? total / count : 0;

        const elTotal = document.getElementById('facturacion-kpi-total');
        const elTransacciones = document.getElementById('facturacion-kpi-transacciones');
        const elPromedio = document.getElementById('facturacion-kpi-promedio');

        if (elTotal) elTotal.innerText = formatCOP(total);
        if (elTransacciones) elTransacciones.innerText = `${count} Recibos`;
        if (elPromedio) elPromedio.innerText = formatCOP(avg);
    },

    renderTableOnly() {
        const tbody = document.getElementById('facturacion-table-body');
        if (!tbody) return;

        tbody.innerHTML = '';
        const abonos = this.getFilteredAbonos();

        if (abonos.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="p-8 text-center text-slate-400 italic">
                        No se encontraron transacciones con los filtros seleccionados
                    </td>
                </tr>
            `;
            return;
        }

        abonos.forEach(a => {
            const c = DataService.clientes.find(cli => cli.id === a.cliente_id);
            const travelerName = c ? `${c.nombre} ${c.apellido || ''}` : 'Pasajero Desconocido';
            const travelerDoc = c ? c.documento || 'CC --' : 'CC --';
            
            const plan = c ? DataService.planes.find(p => p.id === c.plan_id) : null;
            const planNom = plan ? plan.nombre : 'Plan Individual';

            // Formato de fecha
            const dateObj = new Date(a.created_at);
            const dateFormatted = dateObj.toLocaleDateString('es-CO', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

            // Badge de estado
            let statusBadge = '';
            if (a.estado_pago === 'pending') {
                statusBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200">Pendiente</span>';
            } else if (a.estado_pago === 'refunded') {
                statusBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700 border border-rose-200">Reembolso</span>';
            } else {
                statusBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">Confirmado</span>';
            }

            const tr = document.createElement('tr');
            tr.className = 'hover:bg-slate-50 border-b border-slate-100 transition-colors';
            tr.innerHTML = `
                <td class="py-3 px-4 font-mono text-xs text-slate-500">${a.id.substring(0, 8).toUpperCase()}</td>
                <td class="py-3 px-4">
                    <p class="font-bold text-slate-850 text-sm leading-tight">${UI.sanitize(travelerName)}</p>
                    <p class="text-[10px] text-slate-400 font-mono mt-0.5">${UI.sanitize(travelerDoc)}</p>
                </td>
                <td class="py-3 px-4">
                    <p class="font-semibold text-slate-700 text-xs">${UI.sanitize(planNom)}</p>
                    <p class="text-[10px] text-slate-400 font-mono mt-0.5">${dateFormatted}</p>
                </td>
                <td class="py-3 px-4">
                    <p class="font-bold text-slate-900 text-sm">${formatCOP(a.monto)}</p>
                    <p class="text-[10px] text-slate-500 font-bold uppercase mt-0.5">${UI.sanitize(a.metodo)}</p>
                </td>
                <td class="py-3 px-4">${statusBadge}</td>
                <td class="py-3 px-4 text-right">
                    <div class="flex items-center justify-end space-x-1.5">
                        <button type="button" data-action="facturacion-recibo" data-abono-id="${a.id}" class="px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 text-xs font-bold transition-colors flex items-center gap-1 shadow-sm border border-emerald-100" title="Ver Recibo de Caja">
                            <i class="ph ph-file-text"></i> Recibo
                        </button>
                        <button type="button" data-action="facturacion-whatsapp" data-abono-id="${a.id}" class="px-2.5 py-1.5 rounded-lg bg-green-50 text-green-700 hover:bg-green-100 text-xs font-bold transition-colors flex items-center gap-1 shadow-sm border border-green-100" title="Compartir WhatsApp">
                            <i class="ph ph-whatsapp-logo"></i> WhatsApp
                        </button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
    },

    shareWhatsApp(abonoId) {
        const abono = DataService.abonos.find(a => a.id === abonoId);
        if (!abono) return;

        const c = DataService.clientes.find(cli => cli.id === abono.cliente_id);
        if (!c) return;

        const plan = DataService.planes.find(p => p.id === c.plan_id);
        const planNom = plan ? plan.nombre : 'Plan Comercial';
        const destino = plan ? plan.destino || 'Destino' : 'Destino';

        // Calculate pending balance
        let totalAbo = 0;
        let targetPrice = c.precio_total || 0;

        if (!c.parent_id && (c.pax || 1) > 1) {
            const comps = DataService.clientes.filter(x => x.parent_id === c.id && !x.deleted_at);
            const groupIds = [c.id, ...comps.map(x => x.id)];
            totalAbo = DataService.abonos.filter(a => groupIds.includes(a.cliente_id) && a.estado_pago !== 'pending' && a.estado_pago !== 'refunded').reduce((s, a) => s + (Number(a.monto) || 0), 0);
            targetPrice = (c.precio_total || 0) * (c.pax || 1);
        } else {
            totalAbo = DataService.abonos.filter(a => a.cliente_id === c.id && a.estado_pago !== 'pending' && a.estado_pago !== 'refunded').reduce((s, a) => s + (Number(a.monto) || 0), 0);
            targetPrice = c.precio_total || 0;
        }

        const saldoRestante = Math.max(targetPrice - totalAbo, 0);

        const shortId = abono.id.substring(0, 8).toUpperCase();
        
        // Structured Message
        const msg = `Hola *${c.nombre} ${c.apellido || ''}*,\n\nTe confirmamos el recibo de tu pago:\n\n*Recibo de Caja:* RC-${shortId}\n*Monto:* ${formatCOP(abono.monto)}\n*Método:* ${abono.metodo}\n*Plan:* ${planNom}\n*Destino:* ${destino}\n*Saldo Pendiente:* ${formatCOP(saldoRestante)}\n\nPuedes ver e imprimir el soporte en PDF desde nuestro portal. ¡Gracias por viajar con *Vive Travel*! ✈️`;

        // Clean phone number (removing non-digits, prepending 57 for Colombia if no country code)
        let phone = (c.telefono || '').replace(/\D/g, '');
        if (phone.length === 10 && (phone.startsWith('3') || phone.startsWith('5'))) {
            phone = '57' + phone;
        }

        const url = `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(msg)}`;
        window.open(url, '_blank');
    },

    // ── AUDIT & CONCILIATION METHODS ─────────────────────────────
    openAuditModal() {
        this.runDiagnostics();
        UI.openModal('facturacion-audit-modal', 'fact-audit-bg', 'fact-audit-content');
    },

    closeAuditModal() {
        UI.closeModal('facturacion-audit-modal', 'fact-audit-bg', 'fact-audit-content');
    },

    injectModalIfNeeded() {
        if (document.getElementById('facturacion-audit-modal')) return;

        const modalHTML = `
            <div id="facturacion-audit-modal" class="fixed inset-0 z-[75] hidden flex items-center justify-center p-2 md:p-4">
                <div id="fact-audit-bg" class="absolute inset-0 bg-slate-900/60 backdrop-blur-sm opacity-0 transition-opacity duration-300"></div>
                <div id="fact-audit-content" class="relative w-full max-w-4xl bg-white rounded-[2rem] shadow-2xl opacity-0 scale-95 transition-all duration-300 overflow-hidden border border-slate-100 flex flex-col max-h-[90vh]">
                    
                    <!-- Modal Header -->
                    <div class="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 shrink-0">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100 shadow-sm">
                                <i class="ph ph-shield-check text-2xl font-bold"></i>
                            </div>
                            <div>
                                <h3 class="text-base font-black text-slate-800 tracking-tight">Auditoría Financiera de Recaudado</h3>
                                <p class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">Desglose técnico de la cartera histórica</p>
                            </div>
                        </div>
                        <button type="button" id="btn-close-fact-audit" class="text-slate-400 hover:text-red-500 bg-white p-2 rounded-xl shadow-sm border border-slate-200 transition-all"><i class="ph ph-x text-base font-bold"></i></button>
                    </div>

                    <!-- Modal Body -->
                    <div class="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
                        
                        <!-- Alert Summary -->
                        <div class="bg-gradient-to-br from-indigo-50/40 to-emerald-50/40 border border-indigo-100/50 rounded-2xl p-5 text-slate-700 shadow-sm">
                            <h4 class="text-xs font-bold text-slate-950 mb-1 flex items-center gap-1.5">
                                <i class="ph ph-info-circle text-indigo-600 text-lg"></i>
                                <span>Diagnóstico de Conciliación Contable</span>
                            </h4>
                            <p class="text-[11px] leading-relaxed font-semibold text-slate-600">
                                El monto de <strong class="text-slate-900" id="audit-ui-total">$0</strong> en <strong>Recaudado Confirmado</strong> es la suma exacta de todos los pagos con estado <span class="bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-mono text-[9px] font-bold">confirmado</span> cargados en la base de datos. Sin embargo, contiene registros de períodos anteriores y posibles anomalías que incrementan el valor.
                            </p>
                        </div>

                        <!-- Statistics Grid -->
                        <div class="grid grid-cols-2 md:grid-cols-5 gap-4">
                            <div class="bg-slate-50/50 border border-slate-100 rounded-2xl p-4 shadow-sm">
                                <span class="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Doble Conteo Grupal</span>
                                <span class="text-sm font-black text-indigo-600 mt-1 block" id="audit-stat-group-double">$0</span>
                                <span class="text-[9px] text-slate-400 mt-1 block leading-tight font-bold" id="audit-stat-group-count">0 casos</span>
                            </div>
                            <div class="bg-slate-50/50 border border-slate-100 rounded-2xl p-4 shadow-sm">
                                <span class="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Abonos Huérfanos</span>
                                <span class="text-sm font-black text-amber-600 mt-1 block" id="audit-stat-orphans">$0</span>
                                <span class="text-[9px] text-slate-400 mt-1 block leading-tight font-bold" id="audit-stat-orphans-count">0 abonos</span>
                            </div>
                            <div class="bg-slate-50/50 border border-slate-100 rounded-2xl p-4 shadow-sm">
                                <span class="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Duplicados Mismo Día</span>
                                <span class="text-sm font-black text-rose-600 mt-1 block" id="audit-stat-duplicates">$0</span>
                                <span class="text-[9px] text-slate-400 mt-1 block leading-tight font-bold" id="audit-stat-duplicates-count">0 pagos</span>
                            </div>
                            <div class="bg-slate-50/50 border border-slate-100 rounded-2xl p-4 shadow-sm">
                                <span class="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Clientes Cancelados</span>
                                <span class="text-sm font-black text-slate-600 mt-1 block" id="audit-stat-cancelled">$0</span>
                                <span class="text-[9px] text-slate-400 mt-1 block leading-tight font-bold" id="audit-stat-cancelled-count">0 abonos</span>
                            </div>
                            <div class="bg-slate-50/50 border border-slate-100 rounded-2xl p-4 shadow-sm">
                                <span class="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Duplic. Grupales</span>
                                <span class="text-sm font-black text-orange-600 mt-1 block" id="audit-stat-unlinked-group">$0</span>
                                <span class="text-[9px] text-slate-400 mt-1 block leading-tight font-bold" id="audit-stat-unlinked-group-count">0 grupos</span>
                            </div>
                        </div>

                        <!-- Main Sections Accordion -->
                        <div class="space-y-4">
                            <!-- 1. Group Double Counting -->
                            <div class="border border-slate-100 rounded-2xl overflow-hidden bg-white shadow-sm transition-all hover:border-slate-200">
                                <button type="button" class="w-full px-5 py-4 flex justify-between items-center bg-slate-50/30 hover:bg-slate-50 transition-colors font-bold text-slate-800 text-xs text-left" onclick="FacturacionComponent.toggleAuditAccordion('acc-group')">
                                    <div class="flex items-center gap-2">
                                        <i class="ph ph-users text-indigo-500 text-lg"></i>
                                        <span>1. Doble conteo en Reservas Grupales (Duplicados antes de fix)</span>
                                    </div>
                                    <i class="ph ph-caret-down text-slate-400 transition-transform" id="acc-group-icon"></i>
                                </button>
                                <div id="acc-group-panel" class="hidden border-t border-slate-100 p-5 overflow-x-auto bg-white">
                                    <p class="text-[11px] text-slate-500 mb-4 leading-relaxed font-semibold">
                                        Antes de la actualización de distribución grupal, al registrar un abono a un titular de grupo, en ocasiones se guardaba el monto total tanto en el titular como en el acompañante, duplicando el valor recaudado en el sistema.
                                    </p>
                                    <table class="w-full text-xs text-left text-slate-600 border-collapse">
                                        <thead>
                                            <tr class="border-b border-slate-100 text-[10px] uppercase font-black text-slate-400 tracking-wider">
                                                <th class="pb-2">Titular</th>
                                                <th class="pb-2">Monto Registrado</th>
                                                <th class="pb-2">N° Pasajeros</th>
                                                <th class="pb-2">Suma Acompañantes</th>
                                                <th class="pb-2 text-right">Monto Duplicado</th>
                                                <th class="pb-2 text-right">Acción</th>
                                            </tr>
                                        </thead>
                                        <tbody id="audit-table-group" class="divide-y divide-slate-50"></tbody>
                                    </table>
                                </div>
                            </div>

                            <!-- 2. Orphan Abonos -->
                            <div class="border border-slate-100 rounded-2xl overflow-hidden bg-white shadow-sm transition-all hover:border-slate-200">
                                <button type="button" class="w-full px-5 py-4 flex justify-between items-center bg-slate-50/30 hover:bg-slate-50 transition-colors font-bold text-slate-800 text-xs text-left" onclick="FacturacionComponent.toggleAuditAccordion('acc-orphans')">
                                    <div class="flex items-center gap-2">
                                        <i class="ph ph-ghost text-amber-500 text-lg"></i>
                                        <span>2. Abonos Huérfanos (Registrados sin cliente activo)</span>
                                    </div>
                                    <i class="ph ph-caret-down text-slate-400 transition-transform" id="acc-orphans-icon"></i>
                                </button>
                                <div id="acc-orphans-panel" class="hidden border-t border-slate-100 p-5 overflow-x-auto bg-white">
                                    <p class="text-[11px] text-slate-500 mb-4 leading-relaxed font-semibold">
                                        Abonos confirmados asociados a identificadores de clientes que ya no existen en la base de datos (por ejemplo, clientes eliminados permanentemente sin cascada).
                                    </p>
                                    <table class="w-full text-xs text-left text-slate-600 border-collapse">
                                        <thead>
                                            <tr class="border-b border-slate-100 text-[10px] uppercase font-black text-slate-400 tracking-wider">
                                                <th class="pb-2">Abono ID</th>
                                                <th class="pb-2">Cliente ID Relacionado</th>
                                                <th class="pb-2">Método</th>
                                                <th class="pb-2">Fecha Registro</th>
                                                <th class="pb-2 text-right">Monto</th>
                                                <th class="pb-2 text-right">Acción</th>
                                            </tr>
                                        </thead>
                                        <tbody id="audit-table-orphans" class="divide-y divide-slate-50"></tbody>
                                    </table>
                                </div>
                            </div>

                            <!-- 3. Duplicate payments -->
                            <div class="border border-slate-100 rounded-2xl overflow-hidden bg-white shadow-sm transition-all hover:border-slate-200">
                                <button type="button" class="w-full px-5 py-4 flex justify-between items-center bg-slate-50/30 hover:bg-slate-50 transition-colors font-bold text-slate-800 text-xs text-left" onclick="FacturacionComponent.toggleAuditAccordion('acc-duplicates')">
                                    <div class="flex items-center gap-2">
                                        <i class="ph ph-copy text-rose-500 text-lg"></i>
                                        <span>3. Pagos Potencialmente Duplicados el mismo día</span>
                                    </div>
                                    <i class="ph ph-caret-down text-slate-400 transition-transform" id="acc-duplicates-icon"></i>
                                </button>
                                <div id="acc-duplicates-panel" class="hidden border-t border-slate-100 p-5 overflow-x-auto bg-white">
                                    <p class="text-[11px] text-slate-500 mb-4 leading-relaxed font-semibold">
                                        Transacciones idénticas (mismo cliente, mismo monto y mismo método) registradas el mismo día con diferencias de pocos minutos. Podrían corresponder a doble clic o reintentos.
                                    </p>
                                    <table class="w-full text-xs text-left text-slate-600 border-collapse">
                                        <thead>
                                            <tr class="border-b border-slate-100 text-[10px] uppercase font-black text-slate-400 tracking-wider">
                                                <th class="pb-2">Viajero</th>
                                                <th class="pb-2">Método</th>
                                                <th class="pb-2">Abono Original</th>
                                                <th class="pb-2">Abono Repetido</th>
                                                <th class="pb-2 text-right">Monto</th>
                                                <th class="pb-2 text-right">Acción</th>
                                            </tr>
                                        </thead>
                                        <tbody id="audit-table-duplicates" class="divide-y divide-slate-50"></tbody>
                                    </table>
                                </div>
                            </div>

                            <!-- 4. Monthly History -->
                            <div class="border border-slate-100 rounded-2xl overflow-hidden bg-white shadow-sm transition-all hover:border-slate-200">
                                <button type="button" class="w-full px-5 py-4 flex justify-between items-center bg-slate-50/30 hover:bg-slate-50 transition-colors font-bold text-slate-800 text-xs text-left" onclick="FacturacionComponent.toggleAuditAccordion('acc-monthly')">
                                    <div class="flex items-center gap-2">
                                        <i class="ph ph-calendar-blank text-blue-500 text-lg"></i>
                                        <span>4. Recaudado Mensual Acumulado (Períodos Marzo - Junio)</span>
                                    </div>
                                    <i class="ph ph-caret-down text-slate-400 transition-transform" id="acc-monthly-icon"></i>
                                </button>
                                <div id="acc-monthly-panel" class="hidden border-t border-slate-100 p-5 overflow-x-auto bg-white">
                                    <p class="text-[11px] text-slate-500 mb-4 leading-relaxed font-semibold">
                                        El recaudado confirmado refleja la facturación acumulada de toda la vida del sistema. A continuación se desglosa el monto ingresado mes a mes para una mayor claridad contable.
                                    </p>
                                    <table class="w-full text-xs text-left text-slate-600 border-collapse">
                                        <thead>
                                            <tr class="border-b border-slate-100 text-[10px] uppercase font-black text-slate-400 tracking-wider">
                                                <th class="pb-2">Año-Mes de Registro</th>
                                                <th class="pb-2 text-center">N° Transacciones</th>
                                                <th class="pb-2 text-right">Monto Recaudado</th>
                                            </tr>
                                        </thead>
                                        <tbody id="audit-table-monthly" class="divide-y divide-slate-55"></tbody>
                                    </table>
                                </div>
                            </div>

                            <!-- 5. Unlinked Group Duplicates -->
                            <div class="border border-slate-100 rounded-2xl overflow-hidden bg-white shadow-sm transition-all hover:border-slate-200">
                                <button type="button" class="w-full px-5 py-4 flex justify-between items-center bg-slate-50/30 hover:bg-slate-50 transition-colors font-bold text-slate-800 text-xs text-left" onclick="FacturacionComponent.toggleAuditAccordion('acc-unlinked-group')">
                                    <div class="flex items-center gap-2">
                                        <i class="ph ph-users-three text-orange-500 text-lg"></i>
                                        <span>5. Duplicados de Grupo Manuales (Sin enlace automático)</span>
                                    </div>
                                    <i class="ph ph-caret-down text-slate-400 transition-transform" id="acc-unlinked-group-icon"></i>
                                </button>
                                <div id="acc-unlinked-group-panel" class="hidden border-t border-slate-100 p-5 overflow-x-auto bg-white">
                                    <p class="text-[11px] text-slate-500 mb-4 leading-relaxed font-semibold">
                                        Abonos registrados manualmente a cada integrante del grupo por el monto completo, en lugar de usar la distribución automática del sistema. Estos pagos no tienen enlace padre-hijo y se registraron antes de la implementación del sistema de distribución equitativa. Solo se muestran grupos cuyo total de abonos excede el precio del plan.
                                    </p>
                                    <table class="w-full text-xs text-left text-slate-600 border-collapse">
                                        <thead>
                                            <tr class="border-b border-slate-100 text-[10px] uppercase font-black text-slate-400 tracking-wider">
                                                <th class="pb-2">Titular del Grupo</th>
                                                <th class="pb-2">Pax</th>
                                                <th class="pb-2">Monto Repetido</th>
                                                <th class="pb-2">Pagos Encontrados</th>
                                                <th class="pb-2 text-right">Exceso Ficticio</th>
                                                <th class="pb-2 text-right">Acción</th>
                                            </tr>
                                        </thead>
                                        <tbody id="audit-table-unlinked-group" class="divide-y divide-slate-50"></tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Modal Footer -->
                    <div class="p-4 border-t border-slate-100 flex bg-slate-55 shrink-0">
                        <button type="button" id="btn-close-fact-audit-footer" class="w-full py-3 bg-slate-900 hover:bg-slate-850 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-md transition-all text-center">
                            Cerrar Auditoría
                        </button>
                    </div>
                </div>
            </div>
        `;

        const div = document.createElement('div');
        div.innerHTML = modalHTML.trim();
        const modalNode = div.firstChild;
        document.body.appendChild(modalNode);

        // Bind modal close events
        document.getElementById('btn-close-fact-audit').addEventListener('click', () => this.closeAuditModal());
        document.getElementById('btn-close-fact-audit-footer').addEventListener('click', () => this.closeAuditModal());
    },

    runDiagnostics() {
        this.injectModalIfNeeded();

        const abonos = DataService.abonos;
        const clientes = DataService.clientes;

        const clientMap = {};
        clientes.forEach(c => { clientMap[c.id] = c; });

        const activeConfirmedAbonos = abonos.filter(a => 
            (a.deleted_at === null || a.deleted_at === undefined) &&
            (a.estado_pago === 'confirmed' || (a.estado_pago !== 'pending' && a.estado_pago !== 'refunded'))
        );

        const totalSum = activeConfirmedAbonos.reduce((sum, a) => sum + (parseFloat(a.monto) || 0), 0);

        // 1. Double counting in group bookings
        const parentMap = {};
        activeConfirmedAbonos.forEach(a => {
            if (a.parent_abono_id) {
                if (!parentMap[a.parent_abono_id]) parentMap[a.parent_abono_id] = [];
                parentMap[a.parent_abono_id].push(a);
            }
        });

        const doubleCountedGroups = [];
        let doubleCountingSum = 0;
        activeConfirmedAbonos.forEach(parent => {
            const children = parentMap[parent.id];
            if (children && children.length > 0) {
                const parentAmount = parseFloat(parent.monto) || 0;
                const childrenSum = children.reduce((sum, c) => sum + (parseFloat(c.monto) || 0), 0);
                const client = clientMap[parent.cliente_id];
                const clientName = client ? `${client.nombre} ${client.apellido || ''}`.trim() : `ID: ${parent.cliente_id}`;
                const childrenAvg = childrenSum / children.length;

                // Detect legitimate group distributions and avoid false positives
                const companions = client ? clientes.filter(c => c.parent_id === client.id && !c.deleted_at) : [];
                const groupSize = companions.length + 1;
                
                const titularPrice = client ? (parseFloat(client.precio_total) || 0) : 0;
                const companionsPrice = companions.reduce((sum, c) => sum + (parseFloat(c.precio_total) || 0), 0);
                const groupTotalPrice = titularPrice + companionsPrice;
                const totalGroupAbonos = parentAmount + childrenSum;

                let isDoubleCounting = false;
                
                // Only audit real payments > 1000 COP (prevents false positives on cents/rounding adjustments)
                if (parentAmount > 1000) {
                    // 1. Exceeds the total group price (definitive duplicate indicator)
                    if (groupTotalPrice > 0 && totalGroupAbonos > groupTotalPrice + 1000) {
                        isDoubleCounting = true;
                    }
                    // 2. Or the parent amount is significantly larger than the companions' average (indicating the parent was not split)
                    else if (parentAmount > childrenAvg * 1.5) {
                        isDoubleCounting = true;
                    }
                    // 3. Or for groups of size > 2, the parent amount matches the children sum (indicating the parent represents the total instead of a split share)
                    else if (groupSize > 2 && Math.abs(parentAmount - childrenSum) < 1000) {
                        isDoubleCounting = true;
                    }
                }

                if (isDoubleCounting) {
                    doubleCountingSum += childrenSum;
                    doubleCountedGroups.push({
                        parent,
                        clientName,
                        children,
                        childrenSum
                    });
                }
            }
        });

        // 2. Orphans
        const orphans = [];
        let orphanSum = 0;
        activeConfirmedAbonos.forEach(a => {
            const client = clientMap[a.cliente_id];
            if (!client) {
                orphanSum += parseFloat(a.monto) || 0;
                orphans.push(a);
            }
        });

        // 3. Duplicates (created within less than 10 minutes)
        const duplicates = [];
        let duplicateSum = 0;
        
        // Sort activeConfirmedAbonos chronologically to compare consecutive entries
        const sortedAbonos = [...activeConfirmedAbonos].sort((x, y) => new Date(x.created_at) - new Date(y.created_at));
        const lastProcessedAbonoMap = {};

        sortedAbonos.forEach(a => {
            const client = clientMap[a.cliente_id];
            const name = client ? `${client.nombre} ${client.apellido || ''}`.trim() : `ID: ${a.cliente_id}`;
            const key = `${a.cliente_id}_${Math.round(a.monto)}_${a.metodo}`;
            const lastAbono = lastProcessedAbonoMap[key];

            if (lastAbono) {
                const diffTimeMs = Math.abs(new Date(a.created_at) - new Date(lastAbono.created_at));
                // 10 minutes = 10 * 60 * 1000 = 600,000 ms
                if (diffTimeMs <= 600000) {
                    // Safety check: Only flag as duplicate if the client's total active abonos exceeds their price_total.
                    // This avoids flagging legitimate split payments that happen to be registered close to each other.
                    const clientPrice = client ? (parseFloat(client.precio_total) || 0) : 0;
                    const clientActiveAbonos = activeConfirmedAbonos.filter(ab => ab.cliente_id === a.cliente_id);
                    const totalAbonado = clientActiveAbonos.reduce((s, ab) => s + (parseFloat(ab.monto) || 0), 0);

                    if (clientPrice > 0 && totalAbonado > clientPrice + 1000) {
                        duplicateSum += parseFloat(a.monto) || 0;
                        duplicates.push({
                            abono: a,
                            clientName: name,
                            originalAbono: lastAbono
                        });
                        return;
                    }
                }
            }
            
            lastProcessedAbonoMap[key] = a;
        });

        // 4. Cancelled/Devolucion
        const cancelled = [];
        let cancelledSum = 0;
        activeConfirmedAbonos.forEach(a => {
            const client = clientMap[a.cliente_id];
            if (client) {
                const st = (client.estado || '').toLowerCase();
                if (st.includes('cancel') || st.includes('devolu') || st.includes('desisti') || st.includes('desistió')) {
                    cancelledSum += parseFloat(a.monto) || 0;
                    cancelled.push({
                        abono: a,
                        clientName: `${client.nombre} ${client.apellido || ''}`.trim(),
                        status: client.estado
                    });
                }
            }
        });

        // 5. Monthly breakdown
        const monthly = {};
        activeConfirmedAbonos.forEach(a => {
            if (a.created_at) {
                const date = new Date(a.created_at);
                const yearMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                if (!monthly[yearMonth]) monthly[yearMonth] = { sum: 0, count: 0 };
                monthly[yearMonth].sum += parseFloat(a.monto) || 0;
                monthly[yearMonth].count++;
            }
        });

        // 6. Unlinked Group Duplicates (manual individual registrations)
        const unlinkGroupDups = [];
        let unlinkGroupDupSum = 0;

        const groupMapLocal = {};
        clientes.forEach(c => {
            if (c.deleted_at) return;
            const rootId = c.parent_id || c.id;
            if (!groupMapLocal[rootId]) groupMapLocal[rootId] = [];
            groupMapLocal[rootId].push(c);
        });

        Object.entries(groupMapLocal).forEach(([groupId, members]) => {
            if (members.length <= 1) return;

            const memberIds = members.map(m => m.id);
            const titular = members.find(m => !m.parent_id) || members[0];

            // Get all unlinked abonos for this group (no parent_abono_id)
            const groupAbonos = activeConfirmedAbonos.filter(a =>
                memberIds.includes(a.cliente_id) && !a.parent_abono_id
            );
            if (groupAbonos.length <= 1) return;

            // Safety: Only flag if total group abonos exceed the stored plan price * number of members
            const totalGroupAbonos = groupAbonos.reduce((sum, a) => sum + (parseFloat(a.monto) || 0), 0);
            const groupPrice = (parseFloat(titular.precio_total) || 0) * members.length;
            if (groupPrice > 0 && totalGroupAbonos <= groupPrice + 1000) return;

            const checked = new Set();

            for (let i = 0; i < groupAbonos.length; i++) {
                if (checked.has(groupAbonos[i].id)) continue;
                const current = groupAbonos[i];
                const matchGroup = [current];

                for (let j = i + 1; j < groupAbonos.length; j++) {
                    if (checked.has(groupAbonos[j].id)) continue;
                    const other = groupAbonos[j];

                    const sameAmount = Math.abs((parseFloat(current.monto) || 0) - (parseFloat(other.monto) || 0)) < 100;
                    const sameMethod = current.metodo === other.metodo;
                    const within24h = Math.abs(new Date(current.created_at) - new Date(other.created_at)) <= 24 * 60 * 60 * 1000;
                    const differentClients = current.cliente_id !== other.cliente_id;

                    if (sameAmount && sameMethod && within24h && differentClients) {
                        matchGroup.push(other);
                    }
                }

                if (matchGroup.length > 1) {
                    matchGroup.forEach(a => checked.add(a.id));
                    const excess = matchGroup.slice(1).reduce((sum, a) => sum + (parseFloat(a.monto) || 0), 0);
                    unlinkGroupDupSum += excess;

                    const titularName = `${titular.nombre} ${titular.apellido || ''}`.trim();
                    unlinkGroupDups.push({
                        titularName,
                        titular,
                        members,
                        matchGroup,
                        excess
                    });
                }
            }
        });

        // Render UI metrics
        document.getElementById('audit-ui-total').innerText = formatCOP(totalSum);
        document.getElementById('audit-stat-group-double').innerText = formatCOP(doubleCountingSum);
        document.getElementById('audit-stat-group-count').innerText = `${doubleCountedGroups.length} casos`;
        document.getElementById('audit-stat-orphans').innerText = formatCOP(orphanSum);
        document.getElementById('audit-stat-orphans-count').innerText = `${orphans.length} abonos`;
        document.getElementById('audit-stat-duplicates').innerText = formatCOP(duplicateSum);
        document.getElementById('audit-stat-duplicates-count').innerText = `${duplicates.length} pagos`;
        document.getElementById('audit-stat-cancelled').innerText = formatCOP(cancelledSum);
        document.getElementById('audit-stat-cancelled-count').innerText = `${cancelled.length} abonos`;
        document.getElementById('audit-stat-unlinked-group').innerText = formatCOP(unlinkGroupDupSum);
        document.getElementById('audit-stat-unlinked-group-count').innerText = `${unlinkGroupDups.length} grupos`;

        // Render Tables
        // Table 1: Group Double Counting
        const tGroup = document.getElementById('audit-table-group');
        tGroup.innerHTML = '';
        if (doubleCountedGroups.length === 0) {
            tGroup.innerHTML = '<tr><td colspan="6" class="py-4 text-center text-slate-400 italic">No se encontraron casos de doble contabilidad en grupos</td></tr>';
        } else {
            doubleCountedGroups.forEach(g => {
                const tr = document.createElement('tr');
                tr.className = 'border-b border-slate-50 hover:bg-slate-50';
                tr.innerHTML = `
                    <td class="py-2.5 font-bold text-slate-800">${UI.sanitize(g.clientName)}</td>
                    <td class="py-2.5 font-semibold text-slate-700">${formatCOP(g.parent.monto)}</td>
                    <td class="py-2.5 font-semibold text-slate-700">${g.children.length + 1} pax</td>
                    <td class="py-2.5 font-semibold text-slate-700">${formatCOP(g.childrenSum)}</td>
                    <td class="py-2.5 text-right font-bold text-indigo-600">${formatCOP(g.childrenSum)}</td>
                    <td class="py-2.5 text-right">
                        <button type="button" class="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 text-[10px] font-bold transition-all shadow-sm border border-indigo-100" onclick="FacturacionComponent.deleteGroupExcess('${g.parent.id}')">
                            <i class="ph ph-trash"></i> Eliminar Exceso
                        </button>
                    </td>
                `;
                tGroup.appendChild(tr);
            });
        }

        // Table 2: Orphans
        const tOrphans = document.getElementById('audit-table-orphans');
        tOrphans.innerHTML = '';
        if (orphans.length === 0) {
            tOrphans.innerHTML = '<tr><td colspan="6" class="py-4 text-center text-slate-400 italic">No se detectaron abonos huérfanos en el sistema</td></tr>';
        } else {
            orphans.forEach(o => {
                const tr = document.createElement('tr');
                tr.className = 'border-b border-slate-50 hover:bg-slate-50';
                const dateObj = new Date(o.created_at);
                const formattedDate = dateObj.toLocaleDateString('es-CO', { year: 'numeric', month: 'short', day: 'numeric' });
                tr.innerHTML = `
                    <td class="py-2.5 font-mono text-[10px] text-slate-450">${o.id.substring(0, 8).toUpperCase()}</td>
                    <td class="py-2.5 font-mono text-[10px] text-slate-450">${o.cliente_id.substring(0, 8).toUpperCase()}...</td>
                    <td class="py-2.5 font-semibold text-slate-700 uppercase text-[10px]">${UI.sanitize(o.metodo)}</td>
                    <td class="py-2.5 font-semibold text-slate-700">${formattedDate}</td>
                    <td class="py-2.5 text-right font-bold text-amber-600">${formatCOP(o.monto)}</td>
                    <td class="py-2.5 text-right">
                        <button type="button" class="px-2.5 py-1 rounded-lg bg-amber-50 text-amber-600 hover:bg-amber-100 text-[10px] font-bold transition-all shadow-sm border border-amber-100" onclick="FacturacionComponent.deleteOrphanAbono('${o.id}')">
                            <i class="ph ph-trash"></i> Eliminar
                        </button>
                    </td>
                `;
                tOrphans.appendChild(tr);
            });
        }

        // Table 3: Duplicates
        const tDups = document.getElementById('audit-table-duplicates');
        tDups.innerHTML = '';
        if (duplicates.length === 0) {
            tDups.innerHTML = '<tr><td colspan="6" class="py-4 text-center text-slate-400 italic">No se detectaron transacciones duplicadas el mismo día</td></tr>';
        } else {
            duplicates.forEach(d => {
                const tr = document.createElement('tr');
                tr.className = 'border-b border-slate-50 hover:bg-slate-50';
                const d1 = new Date(d.originalAbono.created_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
                const d2 = new Date(d.abono.created_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
                tr.innerHTML = `
                    <td class="py-2.5 font-bold text-slate-800">${UI.sanitize(d.clientName)}</td>
                    <td class="py-2.5 font-semibold text-slate-700 uppercase text-[10px]">${UI.sanitize(d.abono.metodo)}</td>
                    <td class="py-2.5 text-slate-500 font-medium">${d1}</td>
                    <td class="py-2.5 text-slate-500 font-medium">${d2}</td>
                    <td class="py-2.5 text-right font-bold text-rose-600">${formatCOP(d.abono.monto)}</td>
                    <td class="py-2.5 text-right">
                        <button type="button" class="px-2.5 py-1 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 text-[10px] font-bold transition-all shadow-sm border border-rose-100" onclick="FacturacionComponent.deleteDuplicateAbono('${d.abono.id}', '${d.abono.cliente_id}')">
                            <i class="ph ph-trash"></i> Eliminar Duplicado
                        </button>
                    </td>
                `;
                tDups.appendChild(tr);
            });
        }

        // Table 4: Monthly
        const tMonthly = document.getElementById('audit-table-monthly');
        tMonthly.innerHTML = '';
        Object.entries(monthly)
            .sort((x, y) => x[0].localeCompare(y[0]))
            .forEach(([ym, data]) => {
                const tr = document.createElement('tr');
                tr.className = 'border-b border-slate-50 hover:bg-slate-50 font-bold';
                tr.innerHTML = `
                    <td class="py-2.5 text-slate-800 font-semibold">${ym}</td>
                    <td class="py-2.5 text-center text-slate-600 font-semibold">${data.count}</td>
                    <td class="py-2.5 text-right text-emerald-600">${formatCOP(data.sum)}</td>
                `;
                tMonthly.appendChild(tr);
            });

        // Table 5: Unlinked Group Duplicates
        const tUnlinked = document.getElementById('audit-table-unlinked-group');
        tUnlinked.innerHTML = '';
        if (unlinkGroupDups.length === 0) {
            tUnlinked.innerHTML = '<tr><td colspan="6" class="py-4 text-center text-slate-400 italic">No se detectaron duplicados grupales manuales</td></tr>';
        } else {
            unlinkGroupDups.forEach(g => {
                const first = g.matchGroup[0];
                const dupIds = g.matchGroup.slice(1).map(a => a.id).join(',');
                const tr = document.createElement('tr');
                tr.className = 'border-b border-slate-50 hover:bg-slate-50';
                tr.innerHTML = `
                    <td class="py-2.5 font-bold text-slate-800">${UI.sanitize(g.titularName)}</td>
                    <td class="py-2.5 font-semibold text-slate-700">${g.members.length} pax</td>
                    <td class="py-2.5 font-semibold text-slate-700">${formatCOP(first.monto)}</td>
                    <td class="py-2.5 font-semibold text-slate-700">${g.matchGroup.length} pagos</td>
                    <td class="py-2.5 text-right font-bold text-orange-600">${formatCOP(g.excess)}</td>
                    <td class="py-2.5 text-right">
                        <button type="button" class="px-2.5 py-1 rounded-lg bg-orange-50 text-orange-600 hover:bg-orange-100 text-[10px] font-bold transition-all shadow-sm border border-orange-100" onclick="FacturacionComponent.deleteUnlinkedGroupDuplicates('${dupIds}')">
                            <i class="ph ph-trash"></i> Eliminar Exceso
                        </button>
                    </td>
                `;
                tUnlinked.appendChild(tr);
            });
        }
    },

    toggleAuditAccordion(id) {
        const panel = document.getElementById(id + '-panel');
        const icon = document.getElementById(id + '-icon');
        if (panel.classList.contains('hidden')) {
            panel.classList.remove('hidden');
            icon.className = 'ph ph-caret-up text-slate-400 transition-transform rotate-180';
        } else {
            panel.classList.add('hidden');
            icon.className = 'ph ph-caret-down text-slate-400 transition-transform';
        }
    },

    async deleteGroupExcess(parentId) {
        if (!confirm('¿Está seguro de eliminar los abonos de los acompañantes vinculados para resolver el doble conteo? Esto moverá los abonos hijos a la papelera.')) {
            return;
        }
        UI.showToast("Procesando...", "info");
        try {
            const children = DataService.abonos.filter(a => a.parent_abono_id === parentId && !a.deleted_at);
            for (const child of children) {
                await DataService.deleteAbono(child.id, child.cliente_id, 'Corrección de doble conteo grupal (Auditoría)');
            }
            UI.showToast("Doble conteo solucionado correctamente", "success");
            this.runDiagnostics();
            this.render();
        } catch (error) {
            console.error(error);
            UI.showToast("Error al resolver el doble conteo", "error");
        }
    },

    async deleteOrphanAbono(abonoId) {
        if (!confirm('¿Está seguro de eliminar este abono huérfano? Se moverá a la papelera.')) {
            return;
        }
        UI.showToast("Eliminando...", "info");
        try {
            await DataService.deleteAbono(abonoId, null, 'Eliminación de abono huérfano (Auditoría)');
            UI.showToast("Abono huérfano eliminado", "success");
            this.runDiagnostics();
            this.render();
        } catch (error) {
            console.error(error);
            UI.showToast("Error al eliminar el abono", "error");
        }
    },

    async deleteDuplicateAbono(abonoId, clienteId) {
        if (!confirm('¿Está seguro de eliminar este abono duplicado? Se moverá a la papelera.')) {
            return;
        }
        UI.showToast("Eliminando...", "info");
        try {
            await DataService.deleteAbono(abonoId, clienteId, 'Eliminación de abono duplicado del mismo día (Auditoría)');
            UI.showToast("Abono duplicado eliminado", "success");
            this.runDiagnostics();
            this.render();
        } catch (error) {
            console.error(error);
            UI.showToast("Error al eliminar el abono duplicado", "error");
        }
    },

    async deleteUnlinkedGroupDuplicates(dupIdsStr) {
        const dupIds = dupIdsStr.split(',');
        if (!confirm(`¿Está seguro de eliminar ${dupIds.length} abono(s) duplicado(s) de este grupo? Se moverán a la papelera.`)) {
            return;
        }
        UI.showToast("Procesando...", "info");
        try {
            for (const abonoId of dupIds) {
                const abono = DataService.abonos.find(a => a.id === abonoId);
                const clienteId = abono ? abono.cliente_id : null;
                await DataService.deleteAbono(abonoId, clienteId, 'Eliminación de duplicado grupal manual (Auditoría)');
            }
            UI.showToast(`${dupIds.length} abono(s) duplicado(s) eliminado(s) correctamente`, "success");
            this.runDiagnostics();
            this.render();
        } catch (error) {
            console.error(error);
            UI.showToast("Error al eliminar los duplicados grupales", "error");
        }
    }
};

window.FacturacionComponent = FacturacionComponent;

