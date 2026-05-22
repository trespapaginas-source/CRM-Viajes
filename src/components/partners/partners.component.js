import { DataService, supabaseClient } from '../../../js/services/supabase.service.js';
import { Store } from '../../core/store.js';
import { UI } from '../../../js/utils/ui.utils.js';
import { formatCOP, formatShortDate } from '../../../js/utils/format.utils.js';

export const PartnersComponent = {
    sociosConfig: [],
    _configLoaded: false,
    eventsBound: false,
    activeTab: 'desempeno',
    movements: [],
    corporateExpenses: [],
    fallbackActive: false,
    fallbackGastosActive: false,

    async loadConfig() {
        if (this._configLoaded) return;

        const defaultSocios = [
            { email: 'trespa.paginas@gmail.com', nombre: 'Leo (Admin)', porcentaje: 18 },
            { email: 'luismendezramirez@hotmail.es', nombre: 'Luis Méndez', porcentaje: 50 },
            { email: 'vivemarketingdigital@outlook.com', nombre: 'Jean Fontalvo', porcentaje: 32 }
        ];

        // Migration patch para actualizar los correos de prueba antiguos si quedaron guardados
        const patchSocios = (socios) => {
            socios.forEach(s => {
                // Prevenir que el primer socio adopte dinámicamente el correo de otro administrador
                if (s.nombre.includes('Leo') || s.porcentaje === 18) {
                    s.email = 'trespa.paginas@gmail.com';
                }
                if (s.email === 'luis@travelers.com') s.email = 'luismendezramirez@hotmail.es';
                if (s.email === 'jean@travelers.com' || s.email === 'vivemarketingdigital@outlook.com' || s.nombre.includes('Gean') || s.nombre.includes('Jean')) {
                    s.email = 'vivemarketingdigital@outlook.com';
                    s.nombre = 'Jean Fontalvo';
                }
            });
        };

        const saved = localStorage.getItem('trv_socios');
        if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed.length > 0 && !(parsed.length === 1 && parsed[0].porcentaje === 100)) {
                patchSocios(parsed);
                this.sociosConfig = parsed;
                this._configLoaded = true;
                return;
            }
        }

        try {
            const { data, error } = await supabaseClient.from('socios_config').select('*').order('created_at', { ascending: true });
            if (!error && data && data.length > 0) {
                this.sociosConfig = data.map(s => ({ id: s.id, nombre: s.nombre, email: s.email, porcentaje: Number(s.porcentaje) }));
                patchSocios(this.sociosConfig);
                this._configLoaded = true;
                return;
            }
        } catch (e) {
            console.warn('Fallback: no se pudo cargar configuración de socios de BD', e);
        }

        this.sociosConfig = [...defaultSocios];
        this._configLoaded = true;
    },

    async init() {
        this.bindEvents();
        await this.loadConfig();
        await this.loadMovements();
        await this.loadCorporateExpenses();
        
        const currentUserEmail = (window.AuthModule?.currentUser?.email || '').toLowerCase();
        const adminSettings = document.getElementById('pvm-admin-settings');
        if (currentUserEmail === 'trespa.paginas@gmail.com') {
            if (adminSettings) adminSettings.classList.remove('hidden');
            this.renderPartnersEditor();
        } else {
            if (adminSettings) adminSettings.classList.add('hidden');
        }

        const quickFilters = document.getElementById('pvm-quick-filters');
        if (quickFilters) {
            quickFilters.value = 'mes_actual';
        }
        
        this.applyQuickDates();
        this.switchTab('desempeno');
        this.calculateDistribution();

        // Default date for corporate expenses form
        const gCorpFecha = document.getElementById('pvm-gasto-corp-fecha');
        if (gCorpFecha) {
            gCorpFecha.value = new Date().toISOString().substring(0, 10);
        }

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
            
            // Check if monthly row click first
            const row = e.target.closest('.pvm-monthly-row');
            if (row) {
                const month = row.dataset.month;
                this.showMonthlyDetail(month);
                return;
            }

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
                UI.closeModal('pvm-movimiento-modal', 'pvm-mov-bg', 'pvm-mov-content');
            } else if (action === 'pvm-switch-tab') {
                this.switchTab(target.dataset.tab);
            } else if (action === 'pvm-open-movimiento') {
                this.openMovimientoModal(target.dataset.email, target.dataset.tipo);
            } else if (action === 'close-pvm-movimiento' || e.target.id === 'pvm-mov-bg') {
                UI.closeModal('pvm-movimiento-modal', 'pvm-mov-bg', 'pvm-mov-content');
            } else if (action === 'pvm-delete-movimiento') {
                const id = target.dataset.id;
                if (confirm("¿Estás seguro de que deseas eliminar este movimiento del historial?")) {
                    this.handleDeleteMovimiento(id);
                }
            } else if (action === 'pvm-delete-gasto-corp') {
                const id = target.dataset.id;
                if (confirm("¿Estás seguro de que deseas eliminar este gasto corporativo?")) {
                    this.handleDeleteGastoCorp(id);
                }
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

        const histFilter = document.getElementById('pvm-history-filter-partner');
        if (histFilter) {
            histFilter.addEventListener('change', () => this.renderHistoryList());
        }

        const movForm = document.getElementById('pvm-movimiento-form');
        if (movForm) {
            movForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.handleMovimientoSubmit();
            });
        }

        const gastoForm = document.getElementById('pvm-gasto-corp-form');
        if (gastoForm) {
            gastoForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.handleGastoCorpSubmit();
            });
        }

        const fileInput = document.getElementById('pvm-gasto-corp-comprobante');
        if (fileInput) {
            fileInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    const label = document.getElementById('pvm-gasto-corp-file-name');
                    if (label) label.innerText = file.name;
                    
                    const previewContainer = document.getElementById('pvm-gasto-corp-preview-container');
                    const previewImg = document.getElementById('pvm-gasto-corp-preview');
                    const previewName = document.getElementById('pvm-gasto-corp-preview-name');
                    
                    if (previewImg) previewImg.src = URL.createObjectURL(file);
                    if (previewName) previewName.innerText = file.name;
                    if (previewContainer) previewContainer.classList.remove('hidden');
                }
            });
        }

        const removePreviewBtn = document.getElementById('pvm-gasto-corp-preview-remove');
        if (removePreviewBtn) {
            removePreviewBtn.addEventListener('click', () => {
                this.clearGastoCorpPreview();
            });
        }

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
        const currentUserEmail = (window.AuthModule?.currentUser?.email || '').toLowerCase();
        if (currentUserEmail !== 'trespa.paginas@gmail.com') return;
        this.sociosConfig.push({ nombre: 'Nuevo Socio', email: '', porcentaje: 0 }); 
        this.renderPartnersEditor(); 
    },
    
    updatePartnerField(idx, field, value) { 
        const currentUserEmail = (window.AuthModule?.currentUser?.email || '').toLowerCase();
        if (currentUserEmail !== 'trespa.paginas@gmail.com') return;
        if (field === 'porcentaje') value = parseFloat(value) || 0; 
        this.sociosConfig[idx][field] = value; 
    },
    
    removePartner(idx) { 
        const currentUserEmail = (window.AuthModule?.currentUser?.email || '').toLowerCase();
        if (currentUserEmail !== 'trespa.paginas@gmail.com') return;
        this.sociosConfig.splice(idx, 1); 
        this.renderPartnersEditor(); 
    },

    async saveSettings() {
        const currentUserEmail = (window.AuthModule?.currentUser?.email || '').toLowerCase();
        if (currentUserEmail !== 'trespa.paginas@gmail.com') {
            return UI.showToast("No tienes permiso para modificar la configuración de socios.", "error");
        }
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
            dEnd.value = formatDate(new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0));
        } else if (val === 'mes_anterior') {
            const firstOfPrevMonth = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
            const lastOfPrevMonth = new Date(hoy.getFullYear(), hoy.getMonth(), 0);
            dStart.value = formatDate(firstOfPrevMonth);
            dEnd.value = formatDate(lastOfPrevMonth);
        } else if (val === 'anio_actual') {
            dStart.value = formatDate(new Date(hoy.getFullYear(), 0, 1));
            dEnd.value = formatDate(new Date(hoy.getFullYear(), 11, 31));
        } else if (val === '3_meses') {
            let past = new Date(hoy.getFullYear(), hoy.getMonth() - 2, 1);
            dStart.value = formatDate(past);
            dEnd.value = formatDate(new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0));
        } else if (val === '6_meses') {
            let past = new Date(hoy.getFullYear(), hoy.getMonth() - 5, 1);
            dStart.value = formatDate(past);
            dEnd.value = formatDate(new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0));
        } else if (val === 'historico') {
            dStart.value = '2020-01-01';
            dEnd.value = '2099-12-31';
        }

        this.calculateDistribution();
    },

    getAllTrips() {
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

        const salidasUnicas = new Map();

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
                salidasUnicas.set(k, { planId: c.plan_id, planName: p ? p.nombre : 'Plan Genérico', fechaFormat: c.fecha_viaje, dateObj: d });
            }
        });

        const list = [];
        salidasUnicas.forEach(sal => {
            const clientesSalida = DataService.clientes.filter(c => {
                const st = c.estado ? c.estado.toLowerCase() : '';
                return c.plan_id === sal.planId && c.fecha_viaje === sal.fechaFormat && !['desistió', 'cancelado o devolución', 'cancelados'].includes(st);
            });
            const plan = DataService.planes.find(p => p.id === sal.planId);
            let paxTotal = 0, paxAsistentes = 0, paxRetenidos = 0, paxServicio = 0, ingresoBruto = 0;
            
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
                list.push({ ...sal, planName: `🗺️ ${sal.planName}`, ingresoBruto, costoTotal, margen, paxTotal, paxAsistentes, paxRetenidos }); 
            }
        });

        return list;
    },

    calculateDistribution() {
        const strStart = document.getElementById('pvm-date-start')?.value;
        const strEnd = document.getElementById('pvm-date-end')?.value;

        const dateStart = strStart ? new Date(`${strStart}T00:00:00`) : new Date('2020-01-01T00:00:00');
        const dateEnd = strEnd ? new Date(`${strEnd}T23:59:59`) : new Date('2099-12-31T23:59:59');

        const allTrips = this.getAllTrips();
        const hoy = new Date();
        hoy.setHours(23, 59, 59, 999);

        // Filtered Realized trips
        const filteredRealizedTrips = allTrips.filter(t => t.dateObj >= dateStart && t.dateObj <= dateEnd && t.dateObj <= hoy);

        // Filtered Future trips
        const filteredFutureTrips = allTrips.filter(t => t.dateObj >= dateStart && t.dateObj <= dateEnd && t.dateObj > hoy);

        // Filtered Corporate Expenses
        const filteredCorpExpenses = this.corporateExpenses.filter(g => {
            const d = new Date(`${g.fecha}T00:00:00`);
            return d >= dateStart && d <= dateEnd;
        });

        // Totals
        const filteredUB = filteredRealizedTrips.reduce((acc, t) => acc + t.margen, 0);
        const filteredGC = filteredCorpExpenses.reduce((acc, g) => acc + g.monto, 0);
        const filteredUN = filteredUB - filteredGC;
        const filteredUP = filteredFutureTrips.reduce((acc, t) => acc + t.margen, 0);

        const filteredIngresos = filteredRealizedTrips.reduce((acc, t) => acc + t.ingresoBruto, 0);
        const filteredCostos = filteredRealizedTrips.reduce((acc, t) => acc + t.costoTotal, 0);

        const filteredAllTrips = filteredRealizedTrips.concat(filteredFutureTrips);

        // Let's pass these to render distribution
        this.renderDistributionUI(filteredAllTrips, filteredIngresos, filteredCostos, filteredUN, filteredUB, filteredGC, filteredUP);
    },

    renderDistributionUI(viajes, gIngresos, gCostos, filteredUN, filteredUB, filteredGC, filteredUP) {
        const rol = window.AuthModule?.userProfile?.rol;
        const isAdmin = rol === 'administrador' || rol === 'socio_mayoritario';
        const currentUserEmail = (window.AuthModule?.currentUser?.email || '').toLowerCase();
        const me = this.sociosConfig.find(s => s.email.toLowerCase() === currentUserEmail);
        const miPorcentaje = me ? me.porcentaje : 0;
        const miPago = filteredUN * (miPorcentaje / 100);

        const utilTotal = document.getElementById('pvm-utilidad-total');
        if (utilTotal) {
            if (isAdmin) {
                utilTotal.innerText = formatCOP(filteredUN);
                utilTotal.classList.remove('blur-sm');
            } else {
                utilTotal.innerText = "Confidencial";
                utilTotal.classList.add('blur-sm', 'opacity-50');
            }
        }

        if (document.getElementById('pvm-bruta-planes')) {
            document.getElementById('pvm-bruta-planes').innerText = isAdmin ? formatCOP(filteredUB) : '***';
        }
        if (document.getElementById('pvm-gastos-corp-total')) {
            document.getElementById('pvm-gastos-corp-total').innerText = isAdmin ? formatCOP(filteredGC) : '***';
        }
        if (document.getElementById('pvm-proyectada-total')) {
            document.getElementById('pvm-proyectada-total').innerText = isAdmin ? formatCOP(filteredUP) : '***';
        }

        if (document.getElementById('pvm-my-share')) {
            document.getElementById('pvm-my-share').innerText = formatCOP(miPago);
        }
        if (document.getElementById('pvm-my-percent')) {
            document.getElementById('pvm-my-percent').innerText = `${miPorcentaje}% Share`;
        }
        if (document.getElementById('pvm-tours-count')) {
            document.getElementById('pvm-tours-count').innerText = `${viajes.length} Tours`;
        }
        if (document.getElementById('pvm-ingresos-total')) {
            document.getElementById('pvm-ingresos-total').innerText = isAdmin ? `Ingresos: ${formatCOP(gIngresos)}` : `Ingresos: ***`;
        }
        if (document.getElementById('pvm-costos-total')) {
            document.getElementById('pvm-costos-total').innerText = isAdmin ? `Costos: ${formatCOP(gCostos)}` : `Costos: ***`;
        }
        if (document.getElementById('pvm-breakdown-count')) {
            document.getElementById('pvm-breakdown-count').innerText = `${viajes.length} Tours`;
        }

        const sCards = document.getElementById('pvm-socios-cards');
        if (sCards) {
            sCards.innerHTML = '';
            this.sociosConfig.forEach(soc => {
                const esMio = soc.email.toLowerCase() === currentUserEmail;
                const pagoSocio = filteredUN * (soc.porcentaje / 100);
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

        // Refresh active sub-tab view as well
        this.renderActiveTab();
    },

    // TAB NAVIGATION
    switchTab(tabName) {
        this.activeTab = tabName;
        const tabs = ['desempeno', 'saldos', 'rentabilidad-mensual', 'gastos-corporativos', 'planes-rendimiento'];
        tabs.forEach(t => {
            const btn = document.getElementById(`pvm-tab-btn-${t}`);
            const panel = document.getElementById(`pvm-panel-${t}`);
            if (btn) {
                if (t === tabName) {
                    btn.className = "px-3 py-1.5 rounded-lg text-xs font-black transition-all whitespace-nowrap bg-slate-900 text-white shadow-sm";
                } else {
                    btn.className = "px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap text-slate-500 hover:text-slate-800 hover:bg-slate-100/80";
                }
            }
            if (panel) {
                if (t === tabName) {
                    panel.classList.remove('hidden');
                } else {
                    panel.classList.add('hidden');
                }
            }
        });
        this.renderActiveTab();
    },

    renderActiveTab() {
        if (this.activeTab === 'desempeno') {
            // Nothing extra
        } else if (this.activeTab === 'saldos') {
            this.renderSaldosAndHistory();
        } else if (this.activeTab === 'rentabilidad-mensual') {
            this.renderRentabilidadAnalisis();
        } else if (this.activeTab === 'gastos-corporativos') {
            this.renderCorporateExpenses();
        } else if (this.activeTab === 'planes-rendimiento') {
            this.renderPlanesRendimiento();
        }
    },

    // DATABASE MOVEMENTS
    async loadMovements() {
        try {
            const { data, error } = await supabaseClient
                .from('socios_movimientos')
                .select('*')
                .is('deleted_at', null)
                .order('fecha', { ascending: false });
            if (error) throw error;
            this.movements = data || [];
            this.fallbackActive = false;
        } catch (e) {
            console.warn('Supabase fallback for movements:', e);
            const local = localStorage.getItem('trv_socios_movimientos');
            this.movements = local ? JSON.parse(local) : [];
            this.fallbackActive = true;
        }
    },

    async saveMovement(socioEmail, tipo, monto, fecha, concepto) {
        const userEmail = window.AuthModule?.currentUser?.email || 'unknown@travelers.com';
        const newMov = {
            id: crypto.randomUUID ? crypto.randomUUID() : (Math.random().toString(36).substring(2) + Date.now().toString(36)),
            socio_email: socioEmail,
            tipo,
            monto: Number(monto),
            fecha,
            concepto,
            usuario_email: userEmail,
            created_at: new Date().toISOString()
        };

        if (this.fallbackActive) {
            this.movements.unshift(newMov);
            localStorage.setItem('trv_socios_movimientos', JSON.stringify(this.movements));
            return { success: true };
        } else {
            try {
                const row = { ...newMov };
                delete row.id;
                const { error } = await supabaseClient
                    .from('socios_movimientos')
                    .insert([row]);
                if (error) throw error;
                await this.loadMovements();
                return { success: true };
            } catch (e) {
                console.error('Error saving movement to Supabase, saving to local instead:', e);
                this.fallbackActive = true;
                this.movements.unshift(newMov);
                localStorage.setItem('trv_socios_movimientos', JSON.stringify(this.movements));
                return { success: true, fallback: true };
            }
        }
    },

    async deleteMovement(id) {
        if (this.fallbackActive) {
            this.movements = this.movements.filter(m => m.id !== id);
            localStorage.setItem('trv_socios_movimientos', JSON.stringify(this.movements));
            return { success: true };
        } else {
            try {
                const user = window.AuthModule?.currentUser?.email || 'Desconocido';
                const { error } = await supabaseClient
                    .from('socios_movimientos')
                    .update({ deleted_at: new Date().toISOString(), deleted_by: user })
                    .eq('id', id);
                if (error) throw error;
                await this.loadMovements();
                return { success: true };
            } catch (e) {
                console.error('Error deleting movement from Supabase, attempting local:', e);
                this.movements = this.movements.filter(m => m.id !== id);
                localStorage.setItem('trv_socios_movimientos', JSON.stringify(this.movements));
                return { success: true };
            }
        }
    },

    // DATABASE CORPORATE EXPENSES
    async loadCorporateExpenses() {
        try {
            const { data, error } = await supabaseClient
                .from('gastos_corporativos')
                .select('*')
                .is('deleted_at', null)
                .order('fecha', { ascending: false });
            if (error) throw error;
            this.corporateExpenses = data || [];
            this.fallbackGastosActive = false;
        } catch (e) {
            console.warn('Supabase fallback for corporate expenses:', e);
            const local = localStorage.getItem('trv_gastos_corporativos');
            this.corporateExpenses = local ? JSON.parse(local) : [];
            this.fallbackGastosActive = true;
        }
    },

    async saveCorporateExpense(concepto, categoria, monto, fecha, comprobante = '') {
        const userEmail = window.AuthModule?.currentUser?.email || 'unknown@travelers.com';
        const newGasto = {
            id: crypto.randomUUID ? crypto.randomUUID() : (Math.random().toString(36).substring(2) + Date.now().toString(36)),
            concepto,
            categoria,
            monto: Number(monto),
            fecha,
            comprobante,
            usuario_email: userEmail,
            created_at: new Date().toISOString()
        };

        if (this.fallbackGastosActive) {
            this.corporateExpenses.unshift(newGasto);
            localStorage.setItem('trv_gastos_corporativos', JSON.stringify(this.corporateExpenses));
            return { success: true };
        } else {
            try {
                const row = { ...newGasto };
                delete row.id;
                const { error } = await supabaseClient
                    .from('gastos_corporativos')
                    .insert([row]);
                if (error) throw error;
                await this.loadCorporateExpenses();
                return { success: true };
            } catch (e) {
                console.error('Error saving corporate expense to Supabase, saving to local instead:', e);
                this.fallbackGastosActive = true;
                this.corporateExpenses.unshift(newGasto);
                localStorage.setItem('trv_gastos_corporativos', JSON.stringify(this.corporateExpenses));
                return { success: true, fallback: true };
            }
        }
    },

    async deleteCorporateExpense(id) {
        if (this.fallbackGastosActive) {
            this.corporateExpenses = this.corporateExpenses.filter(g => g.id !== id);
            localStorage.setItem('trv_gastos_corporativos', JSON.stringify(this.corporateExpenses));
            return { success: true };
        } else {
            try {
                const user = window.AuthModule?.currentUser?.email || 'Desconocido';
                const { error } = await supabaseClient
                    .from('gastos_corporativos')
                    .update({ deleted_at: new Date().toISOString(), deleted_by: user })
                    .eq('id', id);
                if (error) throw error;
                await this.loadCorporateExpenses();
                return { success: true };
            } catch (e) {
                console.error('Error deleting corporate expense from Supabase, attempting local:', e);
                this.corporateExpenses = this.corporateExpenses.filter(g => g.id !== id);
                localStorage.setItem('trv_gastos_corporativos', JSON.stringify(this.corporateExpenses));
                return { success: true };
            }
        }
    },

    renderCorporateExpenses() {
        const strStart = document.getElementById('pvm-date-start')?.value;
        const strEnd = document.getElementById('pvm-date-end')?.value;
        const dateStart = strStart ? new Date(`${strStart}T00:00:00`) : new Date('2020-01-01T00:00:00');
        const dateEnd = strEnd ? new Date(`${strEnd}T23:59:59`) : new Date('2099-12-31T23:59:59');

        const rol = window.AuthModule?.userProfile?.rol;
        const isAdmin = rol === 'administrador' || rol === 'socio_mayoritario';

        const filtered = this.corporateExpenses.filter(g => {
            const d = new Date(`${g.fecha}T00:00:00`);
            return d >= dateStart && d <= dateEnd;
        });

        const banner = document.getElementById('pvm-gastos-fallback-banner');
        if (banner) {
            if (this.fallbackGastosActive) banner.classList.remove('hidden');
            else banner.classList.add('hidden');
        }

        const formContainer = document.getElementById('pvm-gasto-corp-form')?.parentElement;
        if (formContainer) {
            if (isAdmin) {
                formContainer.classList.remove('hidden');
            } else {
                formContainer.classList.add('hidden');
            }
        }

        const tableContainer = document.getElementById('pvm-gasto-corp-list')?.closest('.lg\\:col-span-8');
        if (tableContainer) {
            if (isAdmin) {
                tableContainer.className = "lg:col-span-8 bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm flex flex-col justify-between";
            } else {
                tableContainer.className = "lg:col-span-12 bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm flex flex-col justify-between";
            }
        }

        const countEl = document.getElementById('pvm-gasto-corp-count');
        if (countEl) countEl.innerText = `${filtered.length} Gastos`;

        const tb = document.getElementById('pvm-gasto-corp-list');
        const emptyState = document.getElementById('pvm-gasto-corp-empty');

        if (!tb || !emptyState) return;

        tb.innerHTML = '';

        if (filtered.length === 0) {
            emptyState.classList.remove('hidden');
            tb.parentElement.classList.add('hidden');
        } else {
            emptyState.classList.add('hidden');
            tb.parentElement.classList.remove('hidden');

            filtered.forEach(g => {
                const amountFormat = formatCOP(g.monto);
                const deleteBtn = isAdmin ? `<button type="button" data-action="pvm-delete-gasto-corp" data-id="${g.id}" class="text-red-400 hover:text-red-600 transition-colors p-1" title="Eliminar gasto"><i class="ph ph-trash"></i></button>` : '';

                const receiptHtml = g.comprobante 
                    ? `<button type="button" data-action="open-lightbox" data-url="${g.comprobante}" class="text-indigo-500 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-2 py-0.5 rounded text-[10px] font-bold inline-flex items-center gap-1 transition-all" title="Ver comprobante"><i class="ph ph-image text-xs"></i> Ver</button>`
                    : `<span class="text-slate-300 text-[10px]">Sin soporte</span>`;

                tb.innerHTML += `
                    <tr class="hover:bg-slate-50 transition-colors">
                        <td class="py-1.5 px-3 whitespace-nowrap text-[11px] font-medium text-slate-500">${formatShortDate(g.fecha)}</td>
                        <td class="py-1.5 px-3 whitespace-nowrap text-[11px] font-black text-slate-800">${UI.sanitize(g.categoria)}</td>
                        <td class="py-1.5 px-3 text-[11px] text-slate-600 max-w-[200px] truncate" title="${UI.sanitize(g.concepto)}">${UI.sanitize(g.concepto)}</td>
                        <td class="py-1.5 px-3 whitespace-nowrap text-center">${receiptHtml}</td>
                        <td class="py-1.5 px-3 whitespace-nowrap text-right text-[11px] font-black text-slate-800">${amountFormat}</td>
                        <td class="py-1.5 px-3 whitespace-nowrap text-[10px] text-slate-400 font-bold">${UI.sanitize(g.usuario_email)}</td>
                        <td class="py-1.5 px-3 whitespace-nowrap text-center">${deleteBtn}</td>
                    </tr>
                `;
            });
        }
    },

    renderSaldosAndHistory() {
        const currentUserEmail = (window.AuthModule?.currentUser?.email || '').toLowerCase();
        const rol = window.AuthModule?.userProfile?.rol;
        const isAdmin = rol === 'administrador' || rol === 'socio_mayoritario';

        const allTrips = this.getAllTrips();
        const hoy = new Date();
        hoy.setHours(23, 59, 59, 999);

        // Historical Realized margins
        const histRealizedTrips = allTrips.filter(t => t.dateObj <= hoy);
        const histUB = histRealizedTrips.reduce((acc, t) => acc + t.margen, 0);

        // Historical corporate expenses
        const histGC = this.corporateExpenses.reduce((acc, g) => acc + g.monto, 0);

        // Net Profit (devengado histórico)
        const histUN = histUB - histGC;

        // Future trips margin
        const futureTrips = allTrips.filter(t => t.dateObj > hoy);
        const futureUB = futureTrips.reduce((acc, t) => acc + t.margen, 0);

        const fallbackBanner = document.getElementById('pvm-saldos-fallback-banner');
        if (fallbackBanner) {
            if (this.fallbackActive) fallbackBanner.classList.remove('hidden');
            else fallbackBanner.classList.add('hidden');
        }

        const grid = document.getElementById('pvm-saldos-grid');
        if (grid) {
            grid.innerHTML = '';
            this.sociosConfig.forEach(soc => {
                const esMio = soc.email.toLowerCase() === currentUserEmail;
                const puedeVerDinero = isAdmin || esMio;

                const ganadoHistorico = histUN * (soc.porcentaje / 100);
                const totalRetirado = this.movements
                    .filter(m => m.socio_email.toLowerCase() === soc.email.toLowerCase())
                    .reduce((acc, m) => acc + m.monto, 0);
                const disponible = ganadoHistorico - totalRetirado;
                const proyectadoSocio = futureUB * (soc.porcentaje / 100);

                const ganadoFormat = puedeVerDinero ? formatCOP(ganadoHistorico) : '***';
                const retiradoFormat = puedeVerDinero ? formatCOP(totalRetirado) : '***';
                const disponibleFormat = puedeVerDinero ? formatCOP(disponible) : '***';
                const proyectadoFormat = puedeVerDinero ? formatCOP(proyectadoSocio) : '***';

                const cardClass = esMio 
                    ? 'border-2 border-indigo-500 bg-indigo-50/30' 
                    : 'border border-slate-200 bg-white';

                let buttonsHtml = '';
                if (isAdmin) {
                    buttonsHtml = `
                        <div class="flex gap-2 mt-3 pt-3 border-t border-slate-100">
                            <button type="button" data-action="pvm-open-movimiento" data-email="${soc.email}" data-tipo="retiro" class="flex-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 py-1.5 px-2.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1">
                                <i class="ph ph-hand-coins text-xs"></i> Retiro
                            </button>
                            <button type="button" data-action="pvm-open-movimiento" data-email="${soc.email}" data-tipo="corte" class="flex-1 bg-slate-900 hover:bg-slate-800 text-white py-1.5 px-2.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1">
                                <i class="ph ph-scissors text-xs"></i> Corte Caja
                            </button>
                        </div>
                    `;
                } else if (esMio) {
                    buttonsHtml = `
                        <div class="flex gap-2 mt-3 pt-3 border-t border-slate-100">
                            <button type="button" data-action="pvm-open-movimiento" data-email="${soc.email}" data-tipo="retiro" class="flex-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 py-1.5 px-2.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1">
                                <i class="ph ph-hand-coins text-xs"></i> Registrar Retiro
                            </button>
                        </div>
                    `;
                }

                grid.innerHTML += `
                    <div class="rounded-xl p-4 shadow-sm flex flex-col justify-between ${cardClass}">
                        <div>
                            <div class="flex justify-between items-start mb-2">
                                <div class="flex items-center gap-2">
                                    <div class="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-xs font-black text-slate-500 uppercase">${soc.nombre.substring(0,2)}</div>
                                    <div>
                                        <h5 class="text-xs font-black text-slate-800 uppercase tracking-wider">${UI.sanitize(soc.nombre)}</h5>
                                        <p class="text-[9px] text-slate-400 font-bold">${UI.sanitize(soc.email)}</p>
                                    </div>
                                </div>
                                <span class="bg-slate-100 text-slate-700 text-[9px] font-black px-1.5 py-0.5 rounded">${soc.porcentaje}% Share</span>
                            </div>
                            
                            <div class="space-y-1.5 mt-3">
                                <div class="flex justify-between text-[10px]">
                                    <span class="text-slate-500 font-medium">Ganado Histórico:</span>
                                    <span class="text-slate-800 font-bold">${ganadoFormat}</span>
                                </div>
                                <div class="flex justify-between text-[10px]">
                                    <span class="text-slate-500 font-medium">Total Retirado/Corte:</span>
                                    <span class="text-slate-600 font-bold">${retiradoFormat}</span>
                                </div>
                                <div class="flex justify-between text-xs pt-1.5 border-t border-dashed border-slate-100">
                                    <span class="text-slate-700 font-black">Disponible:</span>
                                    <span class="text-emerald-600 font-black">${disponibleFormat}</span>
                                </div>
                                <div class="flex justify-between text-[10px] pt-1.5 border-t border-slate-100">
                                    <span class="text-slate-500 font-medium">Proyectado Futuro:</span>
                                    <span class="text-indigo-600 font-black">${proyectadoFormat}</span>
                                </div>
                            </div>
                        </div>
                        ${buttonsHtml}
                    </div>
                `;
            });
        }

        const histFilter = document.getElementById('pvm-history-filter-partner');
        if (histFilter) {
            const currentSelected = histFilter.value;
            histFilter.innerHTML = '<option value="todos">Todos los Socios</option>';
            this.sociosConfig.forEach(soc => {
                histFilter.innerHTML += `<option value="${soc.email}">${UI.sanitize(soc.nombre)}</option>`;
            });
            histFilter.value = currentSelected;
        }

        this.renderHistoryList();
    },

    renderHistoryList() {
        const rol = window.AuthModule?.userProfile?.rol;
        const isAdmin = rol === 'administrador' || rol === 'socio_mayoritario';
        const currentUserEmail = (window.AuthModule?.currentUser?.email || '').toLowerCase();
        
        const histFilter = document.getElementById('pvm-history-filter-partner');
        const selectedEmail = histFilter ? histFilter.value : 'todos';

        // Filter movements by global date range too
        const strStart = document.getElementById('pvm-date-start')?.value;
        const strEnd = document.getElementById('pvm-date-end')?.value;
        const dateStart = strStart ? new Date(`${strStart}T00:00:00`) : new Date('2020-01-01T00:00:00');
        const dateEnd = strEnd ? new Date(`${strEnd}T23:59:59`) : new Date('2099-12-31T23:59:59');

        let filtered = this.movements.filter(m => {
            const d = new Date(`${m.fecha}T00:00:00`);
            return d >= dateStart && d <= dateEnd;
        });

        if (selectedEmail !== 'todos') {
            filtered = filtered.filter(m => m.socio_email.toLowerCase() === selectedEmail.toLowerCase());
        }

        const countEl = document.getElementById('pvm-history-count');
        if (countEl) countEl.innerText = `${filtered.length} Movimientos`;

        const tb = document.getElementById('pvm-history-list');
        const emptyState = document.getElementById('pvm-history-empty');

        if (!tb || !emptyState) return;

        tb.innerHTML = '';

        if (filtered.length === 0) {
            emptyState.classList.remove('hidden');
            tb.parentElement.classList.add('hidden');
        } else {
            emptyState.classList.add('hidden');
            tb.parentElement.classList.remove('hidden');

            filtered.forEach(m => {
                const partner = this.sociosConfig.find(s => s.email.toLowerCase() === m.socio_email.toLowerCase());
                const partnerName = partner ? partner.nombre : m.socio_email;

                const amountFormat = formatCOP(m.monto);
                
                const typeBadge = m.tipo === 'corte' 
                    ? `<span class="bg-slate-100 text-slate-700 text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded border border-slate-200">Corte</span>`
                    : `<span class="bg-indigo-50 text-indigo-700 text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded border border-indigo-100">Retiro</span>`;

                const deleteBtn = isAdmin ? `<button type="button" data-action="pvm-delete-movimiento" data-id="${m.id}" class="text-red-400 hover:text-red-600 transition-colors p-1" title="Eliminar movimiento"><i class="ph ph-trash"></i></button>` : '';

                tb.innerHTML += `
                    <tr class="hover:bg-slate-50 transition-colors">
                        <td class="py-2 px-4 whitespace-nowrap text-xs font-medium text-slate-500">${formatShortDate(m.fecha)}</td>
                        <td class="py-2 px-4 whitespace-nowrap text-xs font-black text-slate-800">${UI.sanitize(partnerName)}</td>
                        <td class="py-2 px-4 whitespace-nowrap">${typeBadge}</td>
                        <td class="py-2 px-4 whitespace-nowrap text-right text-xs font-black text-slate-800">${amountFormat}</td>
                        <td class="py-2 px-4 text-xs text-slate-600 max-w-[200px] truncate" title="${UI.sanitize(m.concepto)}">${UI.sanitize(m.concepto)}</td>
                        <td class="py-2 px-4 whitespace-nowrap text-[10px] text-slate-400 font-bold">${UI.sanitize(m.usuario_email)}</td>
                        <td class="py-2 px-4 whitespace-nowrap text-center">${deleteBtn}</td>
                    </tr>
                `;
            });
        }
    },

    renderRentabilidadAnalisis() {
        const rol = window.AuthModule?.userProfile?.rol;
        const isAdmin = rol === 'administrador' || rol === 'socio_mayoritario';
        const currentUserEmail = (window.AuthModule?.currentUser?.email || '').toLowerCase();

        const allTrips = this.getAllTrips();
        const hoy = new Date();
        hoy.setHours(23, 59, 59, 999);
        const realizedTrips = allTrips.filter(t => t.dateObj <= hoy);

        // Group by month
        const monthsSet = new Set();
        realizedTrips.forEach(t => {
            const y = t.dateObj.getFullYear();
            const m = String(t.dateObj.getMonth() + 1).padStart(2, '0');
            monthsSet.add(`${y}-${m}`);
        });
        this.corporateExpenses.forEach(g => {
            if (g.fecha) {
                const parts = g.fecha.split('-');
                if (parts.length >= 2) {
                    monthsSet.add(`${parts[0]}-${parts[1]}`);
                }
            }
        });
        this.movements.forEach(m => {
            if (m.fecha) {
                const parts = m.fecha.split('-');
                if (parts.length >= 2) {
                    monthsSet.add(`${parts[0]}-${parts[1]}`);
                }
            }
        });

        const sortedMonths = Array.from(monthsSet).sort((a, b) => b.localeCompare(a));

        const monthlyData = sortedMonths.map(month => {
            // Trips in this month
            const monthTrips = realizedTrips.filter(t => {
                const y = t.dateObj.getFullYear();
                const m = String(t.dateObj.getMonth() + 1).padStart(2, '0');
                return `${y}-${m}` === month;
            });

            const ingresos = monthTrips.reduce((acc, t) => acc + t.ingresoBruto, 0);
            const costos = monthTrips.reduce((acc, t) => acc + t.costoTotal, 0);
            const bruta = ingresos - costos;

            // Corporate expenses in this month
            const monthGastos = this.corporateExpenses.filter(g => {
                if (!g.fecha) return false;
                const parts = g.fecha.split('-');
                return `${parts[0]}-${parts[1]}` === month;
            });
            const gastosCorp = monthGastos.reduce((acc, g) => acc + g.monto, 0);

            const neta = bruta - gastosCorp;

            // Withdrawals in this month
            const monthMovements = this.movements.filter(m => {
                if (!m.fecha) return false;
                const parts = m.fecha.split('-');
                return `${parts[0]}-${parts[1]}` === month;
            });
            const retiros = monthMovements.reduce((acc, m) => acc + m.monto, 0);

            const toursCount = monthTrips.length;
            const paxAsistentes = monthTrips.reduce((acc, t) => acc + t.paxAsistentes, 0);

            return {
                month,
                toursCount,
                paxAsistentes,
                ingresos,
                costos,
                bruta,
                gastosCorp,
                neta,
                retiros
            };
        });

        const formatMonthYear = (keyStr) => {
            const [y, m] = keyStr.split('-');
            const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
            return `${meses[parseInt(m) - 1]} ${y}`;
        };

        const thead = document.getElementById('pvm-monthly-thead');
        if (thead) {
            let partnerCols = '';
            this.sociosConfig.forEach(soc => {
                partnerCols += `<th class="py-2.5 px-4 text-right">${UI.sanitize(soc.nombre)} (${soc.porcentaje}%)</th>`;
            });
            thead.innerHTML = `
                <tr>
                    <th class="py-2.5 px-4">Mes / Año</th>
                    <th class="py-2.5 px-4 text-right">Utilidad Bruta</th>
                    <th class="py-2.5 px-4 text-right">Gastos Corp.</th>
                    <th class="py-2.5 px-4 text-right">Utilidad Neta</th>
                    ${partnerCols}
                    <th class="py-2.5 px-4 text-right">Retiros</th>
                    <th class="py-2.5 px-4 text-right">Rentabilidad %</th>
                </tr>
            `;
        }

        const mList = document.getElementById('pvm-monthly-list');
        if (mList) {
            mList.innerHTML = '';
            if (monthlyData.length === 0) {
                const colspan = 6 + this.sociosConfig.length;
                mList.innerHTML = `<tr><td colspan="${colspan}" class="py-4 text-center text-xs text-slate-400 font-bold uppercase tracking-wider">Sin datos disponibles</td></tr>`;
            } else {
                monthlyData.forEach(row => {
                    const rentabilidad = row.ingresos > 0 ? ((row.neta / row.ingresos) * 100).toFixed(1) : 0;
                    const rentabilidadClass = row.neta >= 0 ? 'text-emerald-500 bg-emerald-50 border border-emerald-100' : 'text-red-500 bg-red-50 border border-red-100';
                    const netaColor = row.neta >= 0 ? 'text-emerald-600' : 'text-rose-500';

                    let partnerCells = '';
                    this.sociosConfig.forEach(soc => {
                        const esMio = soc.email.toLowerCase() === currentUserEmail;
                        const puedeVer = isAdmin || esMio;
                        const valorSocio = row.neta * (soc.porcentaje / 100);
                        partnerCells += `<td class="py-2.5 px-4 text-right whitespace-nowrap text-xs font-semibold ${row.neta >= 0 ? 'text-slate-800' : 'text-rose-500/80'}">${puedeVer ? formatCOP(valorSocio) : '***'}</td>`;
                    });

                    let retirosVal = 0;
                    if (isAdmin) {
                        retirosVal = row.retiros;
                    } else {
                        const monthMovements = this.movements.filter(m => {
                            if (!m.fecha) return false;
                            const parts = m.fecha.split('-');
                            return `${parts[0]}-${parts[1]}` === row.month;
                        });
                        retirosVal = monthMovements
                            .filter(m => m.socio_email.toLowerCase() === currentUserEmail)
                            .reduce((acc, m) => acc + m.monto, 0);
                    }

                    const rentabilidadDisplay = isAdmin ? `${rentabilidad}%` : '***';
                    const retirosDisplay = (isAdmin || retirosVal > 0) ? formatCOP(retirosVal) : '***';

                    mList.innerHTML += `
                        <tr class="pvm-monthly-row hover:bg-slate-100/70 transition-colors cursor-pointer" data-month="${row.month}">
                            <td class="py-2.5 px-4 whitespace-nowrap text-xs font-black text-slate-800 flex items-center gap-1.5"><i class="ph ph-caret-right text-[10px] text-slate-400"></i> ${formatMonthYear(row.month)}</td>
                            <td class="py-2.5 px-4 text-right whitespace-nowrap text-xs font-medium text-slate-600">${isAdmin ? formatCOP(row.bruta) : '***'}</td>
                            <td class="py-2.5 px-4 text-right whitespace-nowrap text-xs font-medium text-rose-500/80">${isAdmin ? formatCOP(row.gastosCorp) : '***'}</td>
                            <td class="py-2.5 px-4 text-right whitespace-nowrap text-xs font-black ${netaColor}">${isAdmin ? formatCOP(row.neta) : '***'}</td>
                            ${partnerCells}
                            <td class="py-2.5 px-4 text-right whitespace-nowrap text-xs font-medium text-slate-600">${retirosDisplay}</td>
                            <td class="py-2.5 px-4 text-right whitespace-nowrap"><span class="px-1.5 py-0.5 rounded shadow-sm text-[9px] font-black ${rentabilidadClass}">${rentabilidadDisplay}</span></td>
                        </tr>
                    `;
                });
            }
        }
    },

    renderPlanesRendimiento() {
        const rol = window.AuthModule?.userProfile?.rol;
        const isAdmin = rol === 'administrador' || rol === 'socio_mayoritario';

        const allTrips = this.getAllTrips();

        // Group by plan
        const planGroup = {};
        allTrips.forEach(v => {
            const key = v.planId;
            if (!planGroup[key]) {
                planGroup[key] = {
                    planName: v.planName,
                    salidasCount: 0,
                    paxTotal: 0,
                    ingresos: 0,
                    costos: 0,
                    margen: 0
                };
            }
            planGroup[key].salidasCount++;
            planGroup[key].paxTotal += v.paxTotal;
            planGroup[key].ingresos += v.ingresoBruto;
            planGroup[key].costos += v.costoTotal;
            planGroup[key].margen += v.margen;
        });

        const sortedPlanes = Object.values(planGroup).sort((a, b) => b.margen - a.margen);
        const pList = document.getElementById('pvm-plan-list');
        if (pList) {
            pList.innerHTML = '';
            if (sortedPlanes.length === 0) {
                pList.innerHTML = `<tr><td colspan="8" class="py-4 text-center text-xs text-slate-400 font-bold uppercase tracking-wider">Sin datos disponibles</td></tr>`;
            } else {
                sortedPlanes.forEach(p => {
                    const rentabilidad = p.ingresos > 0 ? ((p.margen / p.ingresos) * 100).toFixed(1) : 0;
                    const rentabilidadClass = p.margen >= 0 ? 'text-emerald-500 bg-emerald-50 border border-emerald-100' : 'text-red-500 bg-red-50 border border-red-100';
                    const margenColor = p.margen >= 0 ? 'text-emerald-600' : 'text-rose-500';
                    const gananciaPax = p.paxTotal > 0 ? (p.margen / p.paxTotal) : 0;

                    pList.innerHTML += `
                        <tr class="hover:bg-slate-50 transition-colors">
                            <td class="py-2.5 px-4 whitespace-nowrap text-xs font-black text-slate-800">${UI.sanitize(p.planName)}</td>
                            <td class="py-2.5 px-4 text-center whitespace-nowrap text-xs font-bold text-slate-600">${p.salidasCount}</td>
                            <td class="py-2.5 px-4 text-center whitespace-nowrap text-xs font-bold text-slate-600">${p.paxTotal}</td>
                            <td class="py-2.5 px-4 text-right whitespace-nowrap text-xs font-medium text-slate-600">${isAdmin ? formatCOP(p.ingresos) : '***'}</td>
                            <td class="py-2.5 px-4 text-right whitespace-nowrap text-xs font-medium text-rose-500/80">${isAdmin ? formatCOP(p.costos) : '***'}</td>
                            <td class="py-2.5 px-4 text-right whitespace-nowrap text-xs font-black ${margenColor}">${isAdmin ? formatCOP(p.margen) : '***'}</td>
                            <td class="py-2.5 px-4 text-right whitespace-nowrap"><span class="px-1.5 py-0.5 rounded shadow-sm text-[9px] font-black ${rentabilidadClass}">${isAdmin ? `${rentabilidad}%` : '***'}</span></td>
                            <td class="py-2.5 px-4 text-right whitespace-nowrap text-xs font-bold ${margenColor}">${isAdmin ? formatCOP(gananciaPax) : '***'}</td>
                        </tr>
                    `;
                });
            }
        }
    },

    showMonthlyDetail(month) {
        const rol = window.AuthModule?.userProfile?.rol;
        const isAdmin = rol === 'administrador' || rol === 'socio_mayoritario';

        const allTrips = this.getAllTrips();
        const hoy = new Date();
        hoy.setHours(23, 59, 59, 999);
        const realizedTrips = allTrips.filter(t => t.dateObj <= hoy);

        // Trips in this month
        const monthTrips = realizedTrips.filter(t => {
            const y = t.dateObj.getFullYear();
            const m = String(t.dateObj.getMonth() + 1).padStart(2, '0');
            return `${y}-${m}` === month;
        });

        // Corporate expenses in this month
        const monthGastos = this.corporateExpenses.filter(g => {
            if (!g.fecha) return false;
            const parts = g.fecha.split('-');
            return `${parts[0]}-${parts[1]}` === month;
        });

        // Update Title
        const titleEl = document.getElementById('pvm-detail-month-title');
        if (titleEl) {
            const [y, m] = month.split('-');
            const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
            titleEl.innerText = `${meses[parseInt(m) - 1]} ${y}`;
        }

        // Render month trips
        const tbodyPlanes = document.getElementById('pvm-detail-month-planes');
        if (tbodyPlanes) {
            tbodyPlanes.innerHTML = '';
            if (monthTrips.length === 0) {
                tbodyPlanes.innerHTML = `<tr><td colspan="6" class="py-3 text-center text-xs text-slate-400 font-bold uppercase tracking-wider">Sin planes realizados</td></tr>`;
            } else {
                monthTrips.forEach(v => {
                    const colorMargen = v.margen >= 0 ? 'text-emerald-600' : 'text-red-500';
                    tbodyPlanes.innerHTML += `
                        <tr class="hover:bg-slate-50 transition-colors">
                            <td class="py-2 px-3 text-xs font-black text-slate-800">${UI.sanitize(v.planName)}</td>
                            <td class="py-2 px-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest">${UI.sanitize(v.fechaFormat)}</td>
                            <td class="py-2 px-3 text-center text-xs font-bold text-slate-600">${v.paxAsistentes}</td>
                            <td class="py-2 px-3 text-right text-xs font-medium text-slate-600">${isAdmin ? formatCOP(v.ingresoBruto) : '***'}</td>
                            <td class="py-2 px-3 text-right text-xs font-medium text-rose-500/80">${isAdmin ? formatCOP(v.costoTotal) : '***'}</td>
                            <td class="py-2 px-3 text-right text-xs font-black ${colorMargen}">${isAdmin ? formatCOP(v.margen) : '***'}</td>
                        </tr>
                    `;
                });
            }
        }

        // Render month corporate expenses
        const tbodyGastos = document.getElementById('pvm-detail-month-gastos');
        if (tbodyGastos) {
            tbodyGastos.innerHTML = '';
            if (monthGastos.length === 0) {
                tbodyGastos.innerHTML = `<tr><td colspan="4" class="py-3 text-center text-xs text-slate-400 font-bold uppercase tracking-wider">Sin gastos registrados</td></tr>`;
            } else {
                monthGastos.forEach(g => {
                    const receiptHtml = g.comprobante 
                        ? `<button type="button" data-action="open-lightbox" data-url="${g.comprobante}" class="text-indigo-500 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-2 py-0.5 rounded text-[10px] font-bold inline-flex items-center gap-1 transition-all" title="Ver comprobante"><i class="ph ph-image text-xs"></i> Ver</button>`
                        : `<span class="text-slate-300 text-[10px]">Sin soporte</span>`;
                    tbodyGastos.innerHTML += `
                        <tr class="hover:bg-slate-50 transition-colors border-b border-slate-50">
                            <td class="py-1.5 px-3 text-[11px] font-black text-slate-800">${UI.sanitize(g.categoria)}</td>
                            <td class="py-1.5 px-3 text-[11px] text-slate-600 max-w-[150px] truncate" title="${UI.sanitize(g.concepto)}">${UI.sanitize(g.concepto)}</td>
                            <td class="py-1.5 px-3 text-center whitespace-nowrap">${receiptHtml}</td>
                            <td class="py-1.5 px-3 text-right text-[11px] font-black text-slate-800">${formatCOP(g.monto)}</td>
                        </tr>
                    `;
                });
            }
        }

        // Show panel
        const detailPanel = document.getElementById('pvm-monthly-detail-panel');
        if (detailPanel) {
            detailPanel.classList.remove('hidden');
            detailPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    },

    openMovimientoModal(email, tipo) {
        const currentUserEmail = (window.AuthModule?.currentUser?.email || '').toLowerCase();
        const rol = window.AuthModule?.userProfile?.rol;
        const isAdmin = rol === 'administrador' || rol === 'socio_mayoritario';

        if (!isAdmin && email.toLowerCase() !== currentUserEmail) {
            return UI.showToast("No tienes permiso para registrar movimientos de otros socios.", "error");
        }

        const partner = this.sociosConfig.find(s => s.email.toLowerCase() === email.toLowerCase());
        if (!partner) return UI.showToast("Socio no encontrado", "error");

        const allTrips = this.getAllTrips();
        const hoy = new Date();
        hoy.setHours(23, 59, 59, 999);

        // Historical Realized margins
        const histRealizedTrips = allTrips.filter(t => t.dateObj <= hoy);
        const histUB = histRealizedTrips.reduce((acc, t) => acc + t.margen, 0);

        // Historical corporate expenses
        const histGC = this.corporateExpenses.reduce((acc, g) => acc + g.monto, 0);

        // Net Profit (devengado histórico)
        const histUN = histUB - histGC;

        const ganadoHistorico = histUN * (partner.porcentaje / 100);
        const totalRetirado = this.movements
            .filter(m => m.socio_email.toLowerCase() === partner.email.toLowerCase())
            .reduce((acc, m) => acc + m.monto, 0);
        const disponible = ganadoHistorico - totalRetirado;

        document.getElementById('pvm-mov-socio-email').value = partner.email;
        document.getElementById('pvm-mov-tipo').value = tipo;
        document.getElementById('pvm-mov-socio-nombre').value = partner.nombre;
        document.getElementById('pvm-mov-tipo-texto').value = tipo === 'corte' ? 'Corte de Caja (Retiro de Caja/Control)' : 'Retiro de Utilidades';
        document.getElementById('pvm-mov-saldo-disponible').value = formatCOP(disponible);
        document.getElementById('pvm-mov-fecha').value = new Date().toISOString().substring(0, 10);
        
        const montoInput = document.getElementById('pvm-mov-monto');
        montoInput.value = tipo === 'corte' ? disponible.toFixed(2) : '';
        document.getElementById('pvm-mov-concepto').value = '';

        UI.openModal('pvm-movimiento-modal', 'pvm-mov-bg', 'pvm-mov-content');
    },

    async handleMovimientoSubmit() {
        const email = document.getElementById('pvm-mov-socio-email').value;
        const tipo = document.getElementById('pvm-mov-tipo').value;
        const monto = parseFloat(document.getElementById('pvm-mov-monto').value) || 0;
        const fecha = document.getElementById('pvm-mov-fecha').value;
        const concepto = document.getElementById('pvm-mov-concepto').value;

        if (monto <= 0) {
            return UI.showToast("El monto debe ser mayor a cero.", "error");
        }

        const currentUserEmail = (window.AuthModule?.currentUser?.email || '').toLowerCase();
        const rol = window.AuthModule?.userProfile?.rol;
        const isAdmin = rol === 'administrador' || rol === 'socio_mayoritario';

        if (!isAdmin && email.toLowerCase() !== currentUserEmail) {
            return UI.showToast("No tienes permiso para registrar movimientos de otros socios.", "error");
        }

        const allTrips = this.getAllTrips();
        const hoy = new Date();
        hoy.setHours(23, 59, 59, 999);

        // Historical Realized margins
        const histRealizedTrips = allTrips.filter(t => t.dateObj <= hoy);
        const histUB = histRealizedTrips.reduce((acc, t) => acc + t.margen, 0);

        // Historical corporate expenses
        const histGC = this.corporateExpenses.reduce((acc, g) => acc + g.monto, 0);

        // Net Profit (devengado histórico)
        const histUN = histUB - histGC;

        const partner = this.sociosConfig.find(s => s.email.toLowerCase() === email.toLowerCase());
        if (!partner) return UI.showToast("Socio no encontrado", "error");

        const ganadoHistorico = histUN * (partner.porcentaje / 100);
        const totalRetirado = this.movements
            .filter(m => m.socio_email.toLowerCase() === partner.email.toLowerCase())
            .reduce((acc, m) => acc + m.monto, 0);
        const disponible = ganadoHistorico - totalRetirado;

        if (monto > disponible + 0.01) {
            return UI.showToast(`Fondos insuficientes. El socio sólo tiene disponible ${formatCOP(disponible)}.`, "error");
        }

        const res = await this.saveMovement(email, tipo, monto, fecha, concepto);
        if (res.success) {
            UI.showToast(`Movimiento registrado con éxito.`, "success");
            UI.closeModal('pvm-movimiento-modal', 'pvm-mov-bg', 'pvm-mov-content');
            this.calculateDistribution();
        } else {
            UI.showToast("Error al registrar movimiento.", "error");
        }
    },

    async handleDeleteMovimiento(id) {
        const rol = window.AuthModule?.userProfile?.rol;
        const isAdmin = rol === 'administrador' || rol === 'socio_mayoritario';

        if (!isAdmin) {
            return UI.showToast("No tienes permiso para eliminar movimientos.", "error");
        }

        const res = await this.deleteMovement(id);
        if (res.success) {
            UI.showToast("Movimiento eliminado con éxito.", "success");
            this.calculateDistribution();
        } else {
            UI.showToast("Error al eliminar movimiento.", "error");
        }
    },

    async handleGastoCorpSubmit() {
        const categoria = document.getElementById('pvm-gasto-corp-categoria').value;
        const monto = parseFloat(document.getElementById('pvm-gasto-corp-monto').value) || 0;
        const fecha = document.getElementById('pvm-gasto-corp-fecha').value;
        const concepto = document.getElementById('pvm-gasto-corp-concepto').value.trim();
        const fileInput = document.getElementById('pvm-gasto-corp-comprobante');

        if (!concepto) {
            return UI.showToast("La descripción del gasto es obligatoria.", "error");
        }

        if (monto <= 0) {
            return UI.showToast("El monto debe ser mayor a cero.", "error");
        }

        if (!fileInput.files || fileInput.files.length === 0) {
            return UI.showToast("Es obligatorio adjuntar una captura de pantalla o comprobante del gasto.", "error");
        }

        const submitBtn = document.querySelector('#pvm-gasto-corp-form button[type="submit"]');
        const originalHtml = submitBtn ? submitBtn.innerHTML : 'Guardar Gasto';
        if (submitBtn) {
            submitBtn.innerHTML = '<i class="ph ph-spinner animate-spin text-xs"></i> Procesando...';
            submitBtn.disabled = true;
        }

        let comprobanteBase64 = '';
        const file = fileInput.files[0];
        try {
            comprobanteBase64 = await this.compressFileToBase64(file);
        } catch (err) {
            console.error("Error compressing file:", err);
            if (submitBtn) {
                submitBtn.innerHTML = originalHtml;
                submitBtn.disabled = false;
            }
            return UI.showToast("Error al procesar la imagen del comprobante.", "error");
        }

        const res = await this.saveCorporateExpense(concepto, categoria, monto, fecha, comprobanteBase64);
        
        if (submitBtn) {
            submitBtn.innerHTML = originalHtml;
            submitBtn.disabled = false;
        }

        if (res.success) {
            UI.showToast("Gasto corporativo registrado con éxito.", "success");
            document.getElementById('pvm-gasto-corp-form').reset();
            this.clearGastoCorpPreview();
            // Set default date to today
            document.getElementById('pvm-gasto-corp-fecha').value = new Date().toISOString().substring(0, 10);
            this.calculateDistribution();
        } else {
            UI.showToast("Error al registrar gasto corporativo.", "error");
        }
    },

    async handleDeleteGastoCorp(id) {
        const rol = window.AuthModule?.userProfile?.rol;
        const isAdmin = rol === 'administrador' || rol === 'socio_mayoritario';

        if (!isAdmin) {
            return UI.showToast("No tienes permiso para eliminar gastos corporativos.", "error");
        }

        const res = await this.deleteCorporateExpense(id);
        if (res.success) {
            UI.showToast("Gasto corporativo eliminado con éxito.", "success");
            this.calculateDistribution();
        } else {
            UI.showToast("Error al eliminar gasto corporativo.", "error");
        }
    },

    compressFileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = (event) => {
                const img = new Image();
                img.src = event.target.result;
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let width = img.width;
                    let height = img.height;
                    const maxDim = 800;
                    if (width > height) {
                        if (width > maxDim) {
                            height *= maxDim / width;
                            width = maxDim;
                        }
                    } else {
                        if (height > maxDim) {
                            width *= maxDim / height;
                            height = maxDim;
                        }
                    }
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    resolve(canvas.toDataURL('image/jpeg', 0.7));
                };
                img.onerror = (err) => reject(err);
            };
            reader.onerror = (err) => reject(err);
        });
    },

    clearGastoCorpPreview() {
        const previewContainer = document.getElementById('pvm-gasto-corp-preview-container');
        const previewImg = document.getElementById('pvm-gasto-corp-preview');
        const previewName = document.getElementById('pvm-gasto-corp-preview-name');
        const fileNameLabel = document.getElementById('pvm-gasto-corp-file-name');
        const fileInput = document.getElementById('pvm-gasto-corp-comprobante');

        if (fileInput) fileInput.value = '';
        if (previewContainer) previewContainer.classList.add('hidden');
        if (previewImg) previewImg.src = '';
        if (previewName) previewName.innerText = '';
        if (fileNameLabel) fileNameLabel.innerText = 'Adjuntar Comprobante';
    }
};
