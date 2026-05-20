import { DataService, supabaseClient } from '../../../js/services/supabase.service.js';
import { Store } from '../../core/store.js';
import { UI } from '../../../js/utils/ui.utils.js';
import { formatCOP, formatShortDate } from '../../../js/utils/format.utils.js';

export const PartnersComponent = {
    sociosConfig: [],
    _configLoaded: false,
    eventsBound: false,

    async loadConfig() {
        if (this._configLoaded) return;

        const defaultSocios = [
            { email: window.AuthModule?.currentUser?.email || 'admin@travelers.com', nombre: 'Leo (Admin)', porcentaje: 18 },
            { email: 'luis@travelers.com', nombre: 'Luis Méndez', porcentaje: 50 },
            { email: 'jean@travelers.com', nombre: 'Jean', porcentaje: 32 }
        ];

        const saved = localStorage.getItem('trv_socios');
        if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed.length > 0 && !(parsed.length === 1 && parsed[0].porcentaje === 100)) {
                this.sociosConfig = parsed;
                this._configLoaded = true;
                return;
            }
        }

        try {
            const { data, error } = await supabaseClient.from('socios_config').select('*').order('created_at', { ascending: true });
            if (!error && data && data.length > 0) {
                this.sociosConfig = data.map(s => ({ id: s.id, nombre: s.nombre, email: s.email, porcentaje: Number(s.porcentaje) }));
                this._configLoaded = true;
                return;
            }
        } catch (e) {
            // Tabla no existe aún, continuar al fallback
        }

        this.sociosConfig = defaultSocios;
        this._configLoaded = true;
    },

    async init() {
        this.bindEvents();
        await this.loadConfig();
        
        const rol = window.AuthModule?.userProfile?.rol;
        if (rol === 'administrador' || rol === 'socio_mayoritario') {
            const adminSettings = document.getElementById('pvm-admin-settings');
            if (adminSettings) adminSettings.classList.remove('hidden');
            this.renderPartnersEditor();
        }

        const quickFilters = document.getElementById('pvm-quick-filters');
        if (quickFilters) {
            quickFilters.value = 'mes_actual';
        }
        
        this.applyQuickDates();
        this.calculateDistribution();

        Store.subscribe((state) => {
            if (state.lastUpdated === 'full' || state.lastUpdated === 'clientes' || state.lastUpdated === 'gastos') {
                if (!document.getElementById('pvm-bg')?.classList.contains('hidden')) {
                    this.calculateDistribution();
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

            if (action === 'toggle-partners-editor') {
                this.toggleEditor();
            } else if (action === 'add-partner-row') {
                this.addNewPartnerRow();
            } else if (action === 'save-partners-settings') {
                this.saveSettings();
            } else if (action === 'remove-partner') {
                this.removePartner(parseInt(target.dataset.idx));
            } else if (action === 'close-partners-vault' || e.target.id === 'pvm-bg') {
                UI.closeModal('partners-vault-modal', 'pvm-bg', 'pvm-content');
            }
        });

        const quickFilters = document.getElementById('pvm-quick-filters');
        if (quickFilters) {
            quickFilters.addEventListener('change', () => this.applyQuickDates());
        }

        const dateStart = document.getElementById('pvm-date-start');
        if (dateStart) dateStart.addEventListener('change', () => this.calculateDistribution());

        const dateEnd = document.getElementById('pvm-date-end');
        if (dateEnd) dateEnd.addEventListener('change', () => this.calculateDistribution());

        document.body.addEventListener('change', (e) => {
            if (e.target.matches('.partner-input')) {
                this.updatePartnerField(parseInt(e.target.dataset.idx), e.target.dataset.field, e.target.value);
            }
        });

        this.eventsBound = true;
    },

    toggleEditor() {
        document.getElementById('pvm-editor-panel')?.classList.toggle('hidden');
        document.getElementById('pvm-editor-toggle-icon')?.classList.toggle('rotate-180');
    },

    renderPartnersEditor() {
        const container = document.getElementById('pvm-partners-editor');
        if (!container) return;
        container.innerHTML = '';
        this.sociosConfig.forEach((soc, idx) => {
            container.innerHTML += `
                <div class="bg-white border border-slate-200 p-2.5 rounded-xl shadow-sm space-y-2 relative group flex flex-col sm:flex-row gap-2 sm:items-center">
                    <button data-action="remove-partner" data-idx="${idx}" class="absolute sm:relative -right-2 -top-2 sm:right-0 sm:top-0 bg-white sm:bg-transparent text-red-400 hover:text-red-600 border border-red-100 sm:border-none rounded-full p-1 shadow-sm sm:shadow-none opacity-0 group-hover:opacity-100 transition-opacity"><i class="ph ph-minus-circle text-base pointer-events-none"></i></button>
                    <div class="flex-1">
                        <label class="text-[8px] font-black text-slate-400 uppercase tracking-widest pl-1">Nombre</label>
                        <input type="text" placeholder="Nombre" value="${UI.sanitize(soc.nombre)}" data-idx="${idx}" data-field="nombre" class="partner-input w-full text-xs font-bold bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:ring-2 focus:ring-indigo-500">
                    </div>
                    <div class="flex-1">
                        <label class="text-[8px] font-black text-slate-400 uppercase tracking-widest pl-1">Email</label>
                        <input type="email" placeholder="Email Supabase" value="${UI.sanitize(soc.email)}" data-idx="${idx}" data-field="email" class="partner-input w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:ring-2 focus:ring-indigo-500">
                    </div>
                    <div class="w-24">
                        <label class="text-[8px] font-black text-slate-400 uppercase tracking-widest pl-1">% Share</label>
                        <div class="relative">
                            <input type="number" value="${soc.porcentaje}" data-idx="${idx}" data-field="porcentaje" class="partner-input w-full text-xs font-black bg-slate-50 border border-slate-200 rounded-lg pl-2 pr-6 py-1.5 outline-none focus:ring-2 focus:ring-indigo-500 text-right">
                            <span class="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-400 pointer-events-none">%</span>
                        </div>
                    </div>
                </div>`;
        });
    },

    addNewPartnerRow() { 
        this.sociosConfig.push({ nombre: 'Nuevo Socio', email: '', porcentaje: 0 }); 
        this.renderPartnersEditor(); 
    },
    
    updatePartnerField(idx, field, value) { 
        if (field === 'porcentaje') value = parseFloat(value) || 0; 
        this.sociosConfig[idx][field] = value; 
    },
    
    removePartner(idx) { 
        this.sociosConfig.splice(idx, 1); 
        this.renderPartnersEditor(); 
    },

    async saveSettings() {
        const total = this.sociosConfig.reduce((acc, s) => acc + s.porcentaje, 0);
        if (total > 100) return UI.showToast(`Error: La suma de porcentajes es ${total}%. No puede superar el 100%.`, "error");

        try {
            await supabaseClient.from('socios_config').delete().neq('id', '00000000-0000-0000-0000-000000000000');
            const rows = this.sociosConfig.map(s => ({ nombre: s.nombre, email: s.email, porcentaje: s.porcentaje }));
            const { error } = await supabaseClient.from('socios_config').insert(rows);
            if (error) throw error;

            localStorage.removeItem('trv_socios');
            UI.showToast("Configuración de socios guardada en base de datos.", "success");
        } catch (e) {
            console.error('Error guardando socios en BD:', e);
            localStorage.setItem('trv_socios', JSON.stringify(this.sociosConfig));
            UI.showToast("Guardado local (ejecuta setup_socios.sql para migrar a BD).", "info");
        }
        this.calculateDistribution();
    },

    applyQuickDates() {
        const dStart = document.getElementById('pvm-date-start');
        const dEnd = document.getElementById('pvm-date-end');
        const quickFilters = document.getElementById('pvm-quick-filters');
        const val = quickFilters ? quickFilters.value : 'mes_actual';
        const container = document.getElementById('pvm-custom-dates-container');

        if (!dStart || !dEnd || !container) return;

        const hoy = new Date();
        const formatDate = (date) => {
            const y = date.getFullYear();
            const m = String(date.getMonth() + 1).padStart(2, '0');
            const d = String(date.getDate()).padStart(2, '0');
            return `${y}-${m}-${d}`;
        };

        if (val === 'personalizado') {
            container.classList.remove('hidden');
            return;
        } else {
            container.classList.add('hidden');
        }

        dEnd.value = formatDate(hoy);

        if (val === 'mes_actual') {
            dStart.value = formatDate(new Date(hoy.getFullYear(), hoy.getMonth(), 1));
        } else if (val === '3_meses') {
            let past = new Date(hoy);
            past.setMonth(hoy.getMonth() - 3);
            dStart.value = formatDate(past);
        } else if (val === '6_meses') {
            let past = new Date(hoy);
            past.setMonth(hoy.getMonth() - 6);
            dStart.value = formatDate(past);
        } else if (val === 'historico') {
            dStart.value = '2020-01-01'; // Todo el histórico
        }

        this.calculateDistribution();
    },

    calculateDistribution() {
        const strStart = document.getElementById('pvm-date-start')?.value;
        const strEnd = document.getElementById('pvm-date-end')?.value;

        const dateStart = strStart ? new Date(`${strStart}T00:00:00`) : new Date('2020-01-01T00:00:00');
        const dateEnd = strEnd ? new Date(`${strEnd}T23:59:59`) : new Date('2099-12-31T23:59:59');

        const salidasMensuales = [];
        const salidasUnicas = new Map();

        const parseDateText = (dateStr) => {
            if (!dateStr || dateStr.includes("Abierta")) return new Date();
            if (dateStr.includes('-') && !dateStr.includes(' de ')) {
                const parts = dateStr.split('-');
                if (parts.length >= 3) return new Date(parts[0], parts[1] - 1, parts[2].substring(0, 2));
            }
            const match = dateStr.match(/(\d{1,2})\s+de\s+([a-záéíóú]+)\s+del?\s+(\d{4})/i);
            if (match) {
                const day = parseInt(match[1]);
                const mStr = match[2].toLowerCase().substring(0, 3).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                const year = parseInt(match[3]);
                const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
                const mIndex = meses.indexOf(mStr);
                if (mIndex !== -1) return new Date(year, mIndex, day);
            }
            const fb = new Date(dateStr);
            return isNaN(fb.getTime()) ? new Date() : fb;
        };

        DataService.clientes.forEach(c => {
            const st = c.estado ? c.estado.toLowerCase() : '';
            if (st === 'desistió' || st === 'cancelado o devolución' || st === 'cancelados') return;

            const k = `${c.plan_id}_${c.fecha_viaje}`;
            if (!salidasUnicas.has(k)) {
                const p = DataService.planes.find(x => x.id === c.plan_id);
                let parseStr = c.fecha_viaje;
                if (p && p.fechas) {
                    const objF = p.fechas.find(f => formatShortDate(f.start) === c.fecha_viaje || `${formatShortDate(f.start)} al ${formatShortDate(f.end)}` === c.fecha_viaje);
                    if (objF && objF.end) parseStr = formatShortDate(objF.end);
                }
                const d = parseDateText(parseStr);

                let match = d >= dateStart && d <= dateEnd;

                if (match) salidasUnicas.set(k, { planId: c.plan_id, planName: p ? p.nombre : 'Plan Genérico', fechaFormat: c.fecha_viaje, dateObj: d });
            }
        });

        let globalIngresos = 0, globalCostos = 0, globalMargen = 0;

        salidasUnicas.forEach(sal => {
            const clientesSalida = DataService.clientes.filter(c => {
                const st = c.estado ? c.estado.toLowerCase() : '';
                return c.plan_id === sal.planId && c.fecha_viaje === sal.fechaFormat && !['desistió', 'cancelado o devolución', 'cancelados'].includes(st);
            });
            const plan = DataService.planes.find(p => p.id === sal.planId);
            let paxTotal = 0, paxServicio = 0, ingresoBruto = 0;
            let paxAsistentes = 0, paxRetenidos = 0;
            
            clientesSalida.forEach(c => {
                const paxNum = parseInt(c.pax || 1);
                paxTotal += paxNum;
                const st = c.estado ? c.estado.toLowerCase() : '';
                
                if (['devolución', 'en caja', 'reprogramado'].includes(st)) {
                    paxRetenidos += paxNum;
                } else {
                    paxAsistentes += paxNum;
                }

                if (st === 'devolución') {
                    const totalAbo = DataService.abonos.filter(a => a.cliente_id === c.id && a.estado_pago !== 'pending' && a.estado_pago !== 'refunded').reduce((s, a) => s + (Number(a.monto) || 0), 0);
                    const devuelto = parseFloat(c.monto_devuelto || 0);
                    ingresoBruto += Math.max(0, totalAbo - devuelto);
                    paxServicio += paxNum;
                } else if (st === 'en caja') {
                    const totalAbo = DataService.abonos.filter(a => a.cliente_id === c.id && a.estado_pago !== 'pending' && a.estado_pago !== 'refunded').reduce((s, a) => s + (Number(a.monto) || 0), 0);
                    ingresoBruto += totalAbo;
                } else {
                    ingresoBruto += parseFloat(c.precio_total || 0);
                    paxServicio += paxNum;
                }
            });
            
            const gastosSalida = DataService.gastos.filter(g => g.plan_id === sal.planId && g.fecha_viaje === sal.fechaFormat);
            let costoTotal = parseFloat(plan?.costo_base || 0) * paxServicio;
            gastosSalida.forEach(g => { if (g.tipo_valor === 'fijo') costoTotal += parseFloat(g.valor); else costoTotal += ingresoBruto * (parseFloat(g.valor) / 100); });
            
            const margen = ingresoBruto - costoTotal;
            if (ingresoBruto > 0) { 
                globalIngresos += ingresoBruto; 
                globalCostos += costoTotal; 
                globalMargen += margen; 
                salidasMensuales.push({ ...sal, planName: `🗺️ ${sal.planName}`, ingresoBruto, costoTotal, margen, paxTotal, paxAsistentes, paxRetenidos }); 
            }
        });

        salidasMensuales.sort((a, b) => b.dateObj - a.dateObj);
        this.renderDistributionUI(salidasMensuales, globalIngresos, globalCostos, globalMargen);
    },

    renderDistributionUI(viajes, gIngresos, gCostos, gMargen) {
        const rol = window.AuthModule?.userProfile?.rol;
        const isAdmin = rol === 'administrador' || rol === 'socio_mayoritario';
        const me = this.sociosConfig.find(s => s.email.toLowerCase() === window.AuthModule?.currentUser?.email.toLowerCase());
        const miPorcentaje = me ? me.porcentaje : 0;
        const miPago = gMargen * (miPorcentaje / 100);

        const utilTotal = document.getElementById('pvm-utilidad-total');
        if (utilTotal) {
            if (isAdmin) {
                utilTotal.innerText = formatCOP(gMargen);
                utilTotal.classList.remove('blur-sm');
            } else {
                utilTotal.innerText = "Confidencial";
                utilTotal.classList.add('blur-sm', 'opacity-50');
            }
        }

        if (document.getElementById('pvm-my-share')) document.getElementById('pvm-my-share').innerText = formatCOP(miPago);
        if (document.getElementById('pvm-my-percent')) document.getElementById('pvm-my-percent').innerText = `${miPorcentaje}% Share`;
        if (document.getElementById('pvm-tours-count')) document.getElementById('pvm-tours-count').innerText = `${viajes.length} Tours`;
        if (document.getElementById('pvm-ingresos-total')) document.getElementById('pvm-ingresos-total').innerText = isAdmin ? `Ingresos: ${formatCOP(gIngresos)}` : `Ingresos: ***`;
        if (document.getElementById('pvm-costos-total')) document.getElementById('pvm-costos-total').innerText = isAdmin ? `Costos: ${formatCOP(gCostos)}` : `Costos: ***`;
        if (document.getElementById('pvm-breakdown-count')) document.getElementById('pvm-breakdown-count').innerText = `${viajes.length} Tours`;

        const sCards = document.getElementById('pvm-socios-cards');
        if (sCards) {
            sCards.innerHTML = '';
            this.sociosConfig.forEach(soc => {
                const esMio = soc.email.toLowerCase() === window.AuthModule?.currentUser?.email.toLowerCase();
                const pagoSocio = gMargen * (soc.porcentaje / 100);
                const puedeVerDinero = isAdmin || esMio;
                const dineroFormat = puedeVerDinero ? formatCOP(pagoSocio) : '***';
                const extraClasses = esMio ? 'ring-2 ring-indigo-500 bg-indigo-50/50' : 'bg-slate-50 hover:bg-slate-100';
                sCards.innerHTML += `
                    <div class="border border-slate-200 rounded-xl px-3 py-2 flex items-center transition-colors shadow-sm ${extraClasses}">
                        <div class="w-8 h-8 rounded-full bg-slate-200 border border-white flex items-center justify-center text-xs font-black text-slate-500 mr-2 shrink-0">${soc.nombre.substring(0, 2).toUpperCase()}</div>
                        <div>
                            <div class="flex items-center gap-1.5 mb-0.5"><p class="text-[10px] font-black text-slate-800 uppercase tracking-widest">${UI.sanitize(soc.nombre)}</p><span class="text-[8px] bg-slate-200 text-slate-600 px-1 py-0.5 rounded font-black tracking-widest">${soc.porcentaje}%</span></div>
                            <p class="text-xs font-black text-slate-600">${dineroFormat}</p>
                        </div>
                    </div>`;
            });
        }

        const tb = document.getElementById('pvm-breakdown-list');
        const emptyState = document.getElementById('pvm-breakdown-empty');
        if (!tb || !emptyState) return;
        
        tb.innerHTML = '';

        if (viajes.length === 0) {
            emptyState.classList.remove('hidden');
            tb.parentElement.classList.add('hidden');
        } else {
            emptyState.classList.add('hidden');
            tb.parentElement.classList.remove('hidden');
            viajes.sort((a, b) => (b.dateObj || 0) - (a.dateObj || 0));
            const hoy = new Date(); hoy.setHours(0, 0, 0, 0);

            viajes.forEach(v => {
                const colorMargen = v.margen >= 0 ? 'text-emerald-600' : 'text-red-500';
                const isPast = v.dateObj && v.dateObj <= hoy;
                const badgeHtml = isPast ? `<span class="inline-flex items-center ml-2 px-1.5 py-0.5 rounded text-[8px] font-black bg-emerald-50 text-emerald-600 uppercase tracking-widest border border-emerald-100"><i class="ph-fill ph-check-circle mr-1 text-[10px]"></i>Realizado</span>` : '';
                const rowClass = isPast ? 'bg-slate-50/40 hover:bg-slate-100/50' : 'hover:bg-slate-50';

                const rentabilidad = v.ingresoBruto > 0 ? ((v.margen / v.ingresoBruto) * 100).toFixed(1) : 0;
                const rentabilidadHtml = isAdmin ? `<span class="${v.margen >= 0 ? 'text-emerald-500 bg-emerald-50 border border-emerald-100' : 'text-red-500 bg-red-50 border border-red-100'} px-1.5 py-0.5 rounded shadow-sm text-[9px] font-black">${rentabilidad}%</span>` : '***';
                
                const gananciaPax = v.paxTotal > 0 ? (v.margen / v.paxTotal) : 0;

                tb.innerHTML += `
                    <tr class="transition-colors ${rowClass}">
                        <td class="py-2.5 px-4 whitespace-nowrap"><div class="flex items-center"><p class="text-xs font-black text-slate-800">${UI.sanitize(v.planName)}</p>${badgeHtml}</div></td>
                        <td class="py-2.5 px-4 whitespace-nowrap"><p class="text-[10px] font-bold text-slate-500 uppercase tracking-widest">${UI.sanitize(v.fechaFormat)}</p></td>
                        <td class="py-2.5 px-4 text-center whitespace-nowrap"><span class="text-xs font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded shadow-sm">${v.paxAsistentes}</span></td>
                        <td class="py-2.5 px-4 text-center whitespace-nowrap"><span class="text-xs font-black text-rose-500 bg-rose-50 px-2 py-0.5 rounded shadow-sm">${v.paxRetenidos}</span></td>
                        <td class="py-2.5 px-4 text-right whitespace-nowrap"><p class="text-xs font-medium text-slate-600">${isAdmin ? formatCOP(v.ingresoBruto) : '***'}</p></td>
                        <td class="py-2.5 px-4 text-right whitespace-nowrap"><p class="text-xs font-medium text-rose-500/80">${isAdmin ? formatCOP(v.costoTotal) : '***'}</p></td>
                        <td class="py-2.5 px-4 text-right whitespace-nowrap"><p class="text-xs font-black ${colorMargen}">${isAdmin ? formatCOP(v.margen) : '***'}</p></td>
                        <td class="py-2.5 px-4 text-right whitespace-nowrap">${rentabilidadHtml}</td>
                        <td class="py-2.5 px-4 text-right whitespace-nowrap"><p class="text-[10px] font-black ${colorMargen}">${isAdmin ? formatCOP(gananciaPax) : '***'}</p></td>
                    </tr>`;
            });
        }
    }
};
