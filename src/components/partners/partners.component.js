import { DataService, supabaseClient } from '../../../js/services/supabase.service.js';
import { Store } from '../../core/store.js';
import { UI } from '../../../js/utils/ui.utils.js';
import { formatCOP, formatShortDate, formatDoubleDate, parseSpanishDate } from '../../../js/utils/format.utils.js';

export const PartnersComponent = {
    sociosConfig: [],
    _configLoaded: false,
    eventsBound: false,
    activeTab: 'desempeno',
    movements: [],
    corporateExpenses: [],
    fondosFlotantes: [],
    fallbackActive: false,
    fallbackGastosActive: false,
    fallbackFondosActive: false,
    porcentajeRetencion: 10,
    currentAdelantoDistribute: false,
    selectedSaldosMonth: null,

    getClientRealPax(c) {
        const companionsCount = DataService.clientes.filter(x => x.parent_id === c.id && !x.deleted_at).length;
        return companionsCount > 0 ? 1 : parseInt(c.pax || 1);
    },

    async loadAgencyConfig() {
        try {
            const res = await DataService.getAgenciaConfig();
            if (res && res.data && res.data.porcentaje_retencion !== undefined && res.data.porcentaje_retencion !== null) {
                this.porcentajeRetencion = Number(res.data.porcentaje_retencion);
            } else {
                this.porcentajeRetencion = 10;
            }
        } catch (e) {
            console.warn('Error al cargar configuración de agencia:', e);
            this.porcentajeRetencion = 10;
        }
        const retInput = document.getElementById('pvm-config-retencion-pct');
        if (retInput) {
            retInput.value = this.porcentajeRetencion;
        }
    },

    async loadConfig() {
        if (this._configLoaded) return;

        const defaultSocios = [
            { email: 'trespa.paginas@gmail.com', nombre: 'Leo (Admin)', porcentaje: 18 },
            { email: 'luismendezramirez@hotmail.es', nombre: 'Luis Méndez', porcentaje: 50 },
            { email: 'vivemarketingdigital@outlook.com', nombre: 'Jean Fontalvo', porcentaje: 32 }
        ];

        // 1. Intentar cargar configuración de socios desde Supabase (Fuente de Verdad)
        try {
            const { data, error } = await supabaseClient.from('socios_config').select('*').order('created_at', { ascending: true });
            if (!error && data && data.length > 0) {
                this.sociosConfig = data.map(s => ({ id: s.id, nombre: s.nombre, email: s.email, porcentaje: Number(s.porcentaje) }));
                this._configLoaded = true;
                return;
            }
        } catch (e) {
            console.warn('Advertencia: No se pudo cargar la configuración de socios de Supabase, intentando fallback.', e);
        }

        // 2. Fallback: Cargar desde localStorage (si existe y tiene datos válidos)
        const saved = localStorage.getItem('trv_socios');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                if (parsed.length > 0 && !(parsed.length === 1 && parsed[0].porcentaje === 100)) {
                    this.sociosConfig = parsed;
                    this._configLoaded = true;
                    return;
                }
            } catch (err) {
                console.error("Error al deserializar socios desde localStorage:", err);
            }
        }

        // 3. Fallback Final: Cargar configuración por defecto
        this.sociosConfig = [...defaultSocios];
        this._configLoaded = true;
    },

    isSuperAdmin() {
        return window.AuthModule?.userProfile?.rol === 'super_administrador';
    },

    async init() {
        this.selectedSaldosMonth = new Date().toISOString().substring(0, 7);
        this.bindEvents();
        await this.loadConfig();

        const rol = window.AuthModule?.userProfile?.rol;
        const isAdmin = rol === 'administrador' || rol === 'socio_mayoritario' || rol === 'super_administrador';
        const currentUserEmail = (window.AuthModule?.currentUser?.email || '').toLowerCase();
        const isPartner = this.sociosConfig.some(s => s.email.toLowerCase() === currentUserEmail);

        if (!isAdmin && !isPartner) {
            UI.closeModal('partners-vault-modal', 'pvm-bg', 'pvm-content');
            UI.showToast("Acceso Denegado: Este módulo es exclusivo para socios y administradores.", "error");
            return false;
        }

        await this.loadMovements();
        await this.loadCorporateExpenses();
        await this.loadAgencyConfig();
        await this.loadFondosFlotantes();
        
        const adminSettings = document.getElementById('pvm-admin-settings');
        if (this.isSuperAdmin()) {
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
        return true;
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
            } else if (action === 'pvm-edit-fondo') {
                this.handleEditFondoFlotante(target.dataset.id);
            } else if (action === 'pvm-release-fondo') {
                if (confirm("¿Estás seguro de que deseas liberar/aplicar este fondo a su reserva? Dejará de ser considerado liquidez flotante disponible.")) {
                    this.handleReleaseFondoFlotante(target.dataset.id);
                }
            } else if (action === 'pvm-delete-fondo') {
                if (confirm("¿Estás seguro de que deseas eliminar este fondo flotante?")) {
                    this.handleDeleteFondoFlotante(target.dataset.id);
                }
            } else if (action === 'close-partners-vault' || e.target.id === 'pvm-bg') {
                UI.closeModal('partners-vault-modal', 'pvm-bg', 'pvm-content');
                UI.closeModal('pvm-movimiento-modal', 'pvm-mov-bg', 'pvm-mov-content');
            } else if (action === 'pvm-switch-tab') {
                this.switchTab(target.dataset.tab);
            } else if (action === 'pvm-select-saldos-month') {
                this.selectedSaldosMonth = target.dataset.month;
                this.renderSaldosAndHistory();
            } else if (action === 'pvm-global-withdrawal') {
                const email = target.dataset.email;
                const totalDisp = parseFloat(target.dataset.disponible || 0);
                if (totalDisp <= 0) {
                    UI.showToast("No tienes saldo disponible para retirar.", "error");
                } else {
                    const monto = prompt(`¿Cuánto deseas retirar del saldo global acumulado (Disponible: ${formatCOP(totalDisp)})?`, String(Math.floor(totalDisp)));
                    if (monto !== null) {
                        const parsedMonto = UI.parseCurrency(monto);
                        if (isNaN(parsedMonto) || parsedMonto <= 0) {
                            UI.showToast("El monto ingresado no es válido.", "error");
                        } else if (parsedMonto > totalDisp) {
                            UI.showToast(`No puedes retirar más del saldo disponible (${formatCOP(totalDisp)}).`, "error");
                        } else {
                            this.handleGlobalWithdrawal(email, parsedMonto);
                        }
                    }
                }
            } else if (action === 'filter-partner-withdrawals') {
                this.filterPartnerWithdrawals(target.dataset.email);
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
            } else if (action === 'pvm-pagar-deuda-gasto') {
                const id = target.dataset.id;
                this.pagarDeudaGasto(id);
            } else if (action === 'pvm-delete-adelanto') {
                const id = target.dataset.id;
                if (confirm("¿Estás seguro de que deseas eliminar este adelanto operativo?")) {
                    this.handleDeleteAdelanto(id);
                }
            } else if (action === 'pvm-approve-adelanto') {
                const id = target.dataset.id;
                this.handleAdelantoStatusChange(id, 'aprobado');
            } else if (action === 'pvm-execute-adelanto') {
                const id = target.dataset.id;
                this.openEjecutarModal(id);
            } else if (action === 'pvm-lost-adelanto') {
                const id = target.dataset.id;
                if (confirm("¿Estás seguro de declarar este adelanto como perdido? El monto no recuperado se sumará como gasto corporativo de este periodo.")) {
                    this.handleAdelantoStatusChange(id, 'perdido');
                }
            } else if (action === 'pvm-credit-adelanto') {
                const id = target.dataset.id;
                this.handleAdelantoStatusChange(id, 'credito_proveedor');
            } else if (action === 'pvm-pend-adelanto') {
                const id = target.dataset.id;
                this.handleAdelantoStatusChange(id, 'ejecutado');
            } else if (action === 'close-pvm-ejecutar' || e.target.id === 'pvm-ejec-bg') {
                UI.closeModal('pvm-ejecutar-modal', 'pvm-ejec-bg', 'pvm-ejec-content');
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

        // OPERATIONAL ADVANCES LISTENERS
        const adelantoForm = document.getElementById('pvm-adelanto-form');
        if (adelantoForm) {
            adelantoForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.handleAdelantoSubmit();
            });
        }

        const ejecutarForm = document.getElementById('pvm-ejecutar-form');
        if (ejecutarForm) {
            ejecutarForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.handleEjecutarSubmit();
            });
        }

        const fondoForm = document.getElementById('pvm-fondo-form');
        if (fondoForm) {
            fondoForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.handleFondoFlotanteSubmit();
            });
        }

        const cancelFondoBtn = document.getElementById('pvm-btn-cancel-fondo');
        if (cancelFondoBtn) {
            cancelFondoBtn.addEventListener('click', () => {
                this.clearFondoForm();
            });
        }

        const statusFondosFilter = document.getElementById('pvm-fondos-filtro-estado');
        if (statusFondosFilter) {
            statusFondosFilter.addEventListener('change', () => {
                this.renderFondosFlotantesList();
            });
        }

        const adelantoFileInput = document.getElementById('pvm-adelanto-comprobante');
        if (adelantoFileInput) {
            adelantoFileInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    const label = document.getElementById('pvm-adelanto-file-name');
                    if (label) label.innerText = file.name;
                    
                    const previewContainer = document.getElementById('pvm-adelanto-preview-container');
                    const previewImg = document.getElementById('pvm-adelanto-preview');
                    const previewName = document.getElementById('pvm-adelanto-preview-name');
                    
                    if (previewImg) previewImg.src = URL.createObjectURL(file);
                    if (previewName) previewName.innerText = file.name;
                    if (previewContainer) previewContainer.classList.remove('hidden');
                }
            });
        }
        const adelantoRemovePreviewBtn = document.getElementById('pvm-adelanto-preview-remove');
        if (adelantoRemovePreviewBtn) {
            adelantoRemovePreviewBtn.addEventListener('click', () => {
                this.clearAdelantoPreview();
            });
        }

        const ejecFileInput = document.getElementById('pvm-ejec-comprobante');
        if (ejecFileInput) {
            ejecFileInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    const label = document.getElementById('pvm-ejec-file-name');
                    if (label) label.innerText = file.name;
                    
                    const previewContainer = document.getElementById('pvm-ejec-preview-container');
                    const previewImg = document.getElementById('pvm-ejec-preview');
                    const previewName = document.getElementById('pvm-ejec-preview-name');
                    
                    if (previewImg) previewImg.src = URL.createObjectURL(file);
                    if (previewName) previewName.innerText = file.name;
                    if (previewContainer) previewContainer.classList.remove('hidden');
                }
            });
        }
        const ejecRemovePreviewBtn = document.getElementById('pvm-ejec-preview-remove');
        if (ejecRemovePreviewBtn) {
            ejecRemovePreviewBtn.addEventListener('click', () => {
                this.clearEjecutarPreview();
            });
        }

        const tipoRelacion = document.getElementById('pvm-adelanto-tipo-relacion');
        if (tipoRelacion) {
            tipoRelacion.addEventListener('change', (e) => {
                const isIndividual = e.target.value === 'individual';
                const indGroup = document.getElementById('pvm-adelanto-relacion-individual-group');
                const grupGroup = document.getElementById('pvm-adelanto-relacion-grupal-group');
                if (indGroup) {
                    if (isIndividual) indGroup.classList.remove('hidden');
                    else indGroup.classList.add('hidden');
                }
                if (grupGroup) {
                    if (isIndividual) grupGroup.classList.add('hidden');
                    else grupGroup.classList.remove('hidden');
                }
            });
        }

        const clientSearch = document.getElementById('pvm-adelanto-cliente-search');
        const clientDropdown = document.getElementById('pvm-adelanto-cliente-dropdown');

        if (clientSearch && clientDropdown) {
            clientSearch.addEventListener('focus', () => {
                this.populatePassengerDropdown(clientSearch.value);
                clientDropdown.classList.remove('hidden');
            });

            clientSearch.addEventListener('input', (e) => {
                this.populatePassengerDropdown(e.target.value);
                clientDropdown.classList.remove('hidden');
            });

            clientSearch.addEventListener('click', (e) => {
                e.stopPropagation();
            });
            clientDropdown.addEventListener('click', (e) => {
                e.stopPropagation();
            });

            // Close dropdown when clicking outside
            document.addEventListener('click', (e) => {
                if (!clientDropdown.contains(e.target) && e.target !== clientSearch) {
                    clientDropdown.classList.add('hidden');
                }
            });
        }

        const clientSelect = document.getElementById('pvm-adelanto-cliente-id');
        if (clientSelect) {
            clientSelect.addEventListener('change', (e) => {
                const clientId = e.target.value;
                if (!clientId) {
                    this.currentAdelantoDistribute = false;
                    return;
                }
                const client = DataService.clientes.find(c => c.id === clientId && !c.deleted_at);
                if (client && !client.parent_id) {
                    const companions = DataService.clientes.filter(x => x.parent_id === client.id && !x.deleted_at);
                    if (companions.length > 0) {
                        const confirmDistribute = confirm(
                            `El pasajero seleccionado es Titular de un grupo (${1 + companions.length} personas en total).\n\n¿Deseas distribuir el impacto financiero de este dinero prestado de forma equitativa entre todos los integrantes de su grupo?\n\n- Aceptar: Distribuir equitativamente entre los integrantes para no alterar el margen de rentabilidad individual del titular.\n- Cancelar: Hacer que el gasto recaiga únicamente sobre el perfil del titular.`
                        );
                        this.currentAdelantoDistribute = confirmDistribute;
                    } else {
                        this.currentAdelantoDistribute = false;
                    }
                } else {
                    this.currentAdelantoDistribute = false;
                }
            });
        }

        const planSelect = document.getElementById('pvm-adelanto-plan-id');
        if (planSelect) {
            planSelect.addEventListener('change', (e) => {
                const planId = e.target.value;
                const dateSelect = document.getElementById('pvm-adelanto-fecha-viaje');
                if (!dateSelect) return;
                dateSelect.innerHTML = '<option value="">-- Seleccionar Fecha --</option>';
                if (!planId) return;

                const dates = [...new Set(DataService.clientes
                    .filter(c => c.plan_id === planId && c.fecha_viaje && !['desistió', 'cancelado o devolución', 'cancelados'].includes(c.estado ? c.estado.toLowerCase() : ''))
                    .map(c => c.fecha_viaje)
                )];
                dates.forEach(d => {
                    dateSelect.innerHTML += `<option value="${d}">${d}</option>`;
                });
            });
        }

        const totalInput = document.getElementById('pvm-adelanto-monto-total');
        const cubiertoInput = document.getElementById('pvm-adelanto-monto-cubierto');
        const solicitadoInput = document.getElementById('pvm-adelanto-monto-solicitado');
        const riskWarning = document.getElementById('pvm-adelanto-risk-warning');

        const recalculateRisk = () => {
            const val = solicitadoInput ? (UI.parseCurrency(solicitadoInput.value) || 0) : 0;
            if (riskWarning) {
                if (val > 2000000) riskWarning.classList.remove('hidden');
                else riskWarning.classList.add('hidden');
            }
        };

        const recalculateDiff = () => {
            const total = UI.parseCurrency(totalInput?.value) || 0;
            const cubierto = UI.parseCurrency(cubiertoInput?.value) || 0;
            const diff = Math.max(0, total - cubierto);
            
            if (solicitadoInput) {
                solicitadoInput.value = String(diff).replace(/\D/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
            }
            
            recalculateRisk();
        };

        if (totalInput) totalInput.addEventListener('input', recalculateDiff);
        if (cubiertoInput) cubiertoInput.addEventListener('input', recalculateDiff);
        if (solicitadoInput) solicitadoInput.addEventListener('input', recalculateRisk);

        const statusFilter = document.getElementById('pvm-adelantos-filtro-estado');
        if (statusFilter) {
            statusFilter.addEventListener('change', () => {
                this.renderAdelantosList();
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
        if (!this.isSuperAdmin()) return;
        this.sociosConfig.push({ nombre: 'Nuevo Socio', email: '', porcentaje: 0 }); 
        this.renderPartnersEditor(); 
    },
    
    updatePartnerField(idx, field, value) { 
        if (!this.isSuperAdmin()) return;
        if (field === 'porcentaje') value = parseFloat(value) || 0; 
        this.sociosConfig[idx][field] = value; 
    },
    
    removePartner(idx) { 
        if (!this.isSuperAdmin()) return;
        this.sociosConfig.splice(idx, 1); 
        this.renderPartnersEditor(); 
    },

    async saveSettings() {
        if (!this.isSuperAdmin()) {
            return UI.showToast("No tienes permiso para modificar la configuración de socios.", "error");
        }
        const total = this.sociosConfig.reduce((acc, s) => acc + s.porcentaje, 0);
        if (total > 100) return UI.showToast(`Error: La suma de porcentajes es ${total}%. No puede superar el 100%.`, "error");

        const retInput = document.getElementById('pvm-config-retencion-pct');
        let newRetPct = this.porcentajeRetencion;
        if (retInput) {
            const val = parseFloat(retInput.value);
            if (!isNaN(val) && val >= 0 && val <= 100) {
                newRetPct = val;
            } else {
                return UI.showToast("El porcentaje de retención debe estar entre 0% y 100%.", "error");
            }
        }

        try {
            await supabaseClient.from('socios_config').delete().neq('id', '00000000-0000-0000-0000-000000000000');
            const rows = this.sociosConfig.map(s => ({ nombre: s.nombre, email: s.email, porcentaje: s.porcentaje }));
            const { error } = await supabaseClient.from('socios_config').insert(rows);
            if (error) throw error;

            await DataService.saveAgenciaConfig({ porcentaje_retencion: newRetPct });
            this.porcentajeRetencion = newRetPct;

            localStorage.removeItem('trv_socios');
            UI.showToast("Configuración guardada en base de datos.", "success");
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
                    if (objF && objF.start) parseStr = formatShortDate(objF.start);
                }
                let d = parseSpanishDate(parseStr);
                if (!d || isNaN(d.getTime())) d = new Date();
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
            
            let paxTotal = 0, paxAsistentes = 0, paxRetenidos = 0, ingresoBruto = 0;
            let costoOperativoBase = 0;
            
            clientesSalida.forEach(c => {
                const paxNum = this.getClientRealPax(c);
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
                } else if (st === 'en caja') {
                    const totalAbo = DataService.abonos.filter(a => a.cliente_id === c.id && a.estado_pago !== 'pending' && a.estado_pago !== 'refunded').reduce((s, a) => s + (Number(a.monto) || 0), 0);
                    ingresoBruto += totalAbo;
                } else if (st === 'reprogramado') {
                    // No aporta ingresos a esta salida
                } else {
                    ingresoBruto += parseFloat(c.precio_total || 0);
                }

                if (st !== 'en caja' && st !== 'devolución' && st !== 'reprogramado') {
                    let cCost = (c.costo_base !== undefined && c.costo_base !== null) ? parseFloat(c.costo_base) : parseFloat(plan?.costo_base || 0);
                    if (cCost === 0) {
                        const provs = (c.proveedores_vinculados && c.proveedores_vinculados.length > 0)
                            ? c.proveedores_vinculados
                            : (plan?.proveedores_vinculados || []);
                        cCost = provs.reduce((sum, p) => sum + parseFloat(p.costo || 0), 0);
                    }
                    costoOperativoBase += cCost * paxNum;
                }
            });
            
            const gastosSalida = DataService.gastos.filter(g => g.plan_id === sal.planId && g.fecha_viaje === sal.fechaFormat);
            let costoTotal = costoOperativoBase;
            gastosSalida.forEach(g => { 
                if (g.tipo_valor === 'fijo') costoTotal += parseFloat(g.valor); 
                else costoTotal += ingresoBruto * (parseFloat(g.valor) / 100); 
            });
            
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

        // 1. Reconciliar estados de adelantos operativos con abonos
        this.reconciliarEstadosAdelantos();

        // Filtered Realized trips
        const filteredRealizedTrips = allTrips.filter(t => t.dateObj >= dateStart && t.dateObj <= dateEnd && t.dateObj <= hoy);

        // Filtered Future trips
        const filteredFutureTrips = allTrips.filter(t => t.dateObj >= dateStart && t.dateObj <= dateEnd && t.dateObj > hoy);

        // Filtered Corporate Expenses (only ones paid by Agency Utility, or repaid Float debts, excluding reserve-funded/pending float ones)
        const filteredCorpExpenses = this.corporateExpenses.filter(g => {
            const d = new Date(`${g.fecha}T00:00:00`);
            const isMatchedRange = d >= dateStart && d <= dateEnd;
            const isOrdinario = g.origen_fondos === 'Utilidad de la Agencia' || (g.origen_fondos === 'Fondo Flotante' && g.estado_pago === 'pagado') || !g.origen_fondos;
            return isMatchedRange && isOrdinario;
        });

        // 2. Filtrar y calcular pérdidas de adelantos declarados como "perdido" en este rango de fechas
        const lostAdvancesList = (DataService.adelantos_operativos || []).filter(a => {
            if (a.estado !== 'perdido') return false;
            const d = new Date(`${a.fecha}T00:00:00`);
            return d >= dateStart && d <= dateEnd;
        });
        const totalLostAdvances = lostAdvancesList.reduce((sum, a) => sum + (Number(a.monto_adelantado) - Number(a.monto_recuperado)), 0);

        // Totals
        const filteredUB = filteredRealizedTrips.reduce((acc, t) => acc + t.margen, 0);
        // Las pérdidas operativas por adelantos se sumarán directamente al total de egresos corporativos
        const filteredGC = filteredCorpExpenses.reduce((acc, g) => acc + g.monto, 0) + totalLostAdvances;
        const filteredUP = filteredFutureTrips.reduce((acc, t) => acc + t.margen, 0);

        // Prioridad Financiera (Opción B)
        const isDeficit = filteredUB <= filteredGC;
        let filteredUN = 0;
        let retencionFondo = 0;
        let deficitAmount = 0;

        if (isDeficit) {
            deficitAmount = filteredGC - filteredUB;
        } else {
            const totalUN_Operacion = filteredUB - filteredGC;
            retencionFondo = totalUN_Operacion * (this.porcentajeRetencion / 100);
            filteredUN = totalUN_Operacion - retencionFondo;
        }

        const filteredIngresos = filteredRealizedTrips.reduce((acc, t) => acc + t.ingresoBruto, 0);
        const filteredCostos = filteredRealizedTrips.reduce((acc, t) => acc + t.costoTotal, 0);

        const filteredAllTrips = filteredRealizedTrips.concat(filteredFutureTrips);

        // 3. Flujo de caja real del periodo: efectivo recaudado y adelantos activos en tránsito
        const rangeAbonos = DataService.abonos.filter(a => {
            if (a.estado_pago === 'pending' || a.estado_pago === 'refunded' || a.deleted_at) return false;
            const d = new Date(a.created_at || a.fecha);
            return d >= dateStart && d <= dateEnd;
        });
        const totalRecaudadoRango = rangeAbonos.reduce((sum, a) => sum + (Number(a.monto) || 0), 0);

        const rangeAdelantos = (DataService.adelantos_operativos || []).filter(a => {
            if (a.deleted_at) return false;
            const d = new Date(`${a.fecha}T00:00:00`);
            return d >= dateStart && d <= dateEnd;
        });
        const activeAdelantosRango = rangeAdelantos.filter(a => a.estado === 'ejecutado' || a.estado === 'solicitado' || a.estado === 'aprobado' || a.estado === 'credito_proveedor');
        const totalAdelantadoActivoRango = activeAdelantosRango.reduce((sum, a) => sum + (Number(a.monto_adelantado) - Number(a.monto_recuperado)), 0);

        // Let's pass these to render distribution
        this.renderDistributionUI(filteredAllTrips, filteredIngresos, filteredCostos, filteredUN, filteredUB, filteredGC, filteredUP, retencionFondo, isDeficit, deficitAmount, totalRecaudadoRango, totalAdelantadoActivoRango);
    },

    renderDistributionUI(viajes, gIngresos, gCostos, filteredUN, filteredUB, filteredGC, filteredUP, retencionFondo = 0, isDeficit = false, deficitAmount = 0, totalRecaudadoRango = 0, totalAdelantadoActivoRango = 0) {
        const rol = window.AuthModule?.userProfile?.rol;
        const isAdmin = rol === 'administrador' || rol === 'socio_mayoritario' || rol === 'super_administrador';
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
        if (document.getElementById('pvm-fondo-retencion-total')) {
            document.getElementById('pvm-fondo-retencion-total').innerText = isAdmin ? formatCOP(retencionFondo) : '***';
        }
        if (document.getElementById('pvm-proyectada-total')) {
            document.getElementById('pvm-proyectada-total').innerText = isAdmin ? formatCOP(filteredUP) : '***';
        }

        // Flujo de caja y control de liquidez
        if (document.getElementById('pvm-cash-ingreso-neto')) {
            document.getElementById('pvm-cash-ingreso-neto').innerText = isAdmin ? formatCOP(filteredUN) : '***';
        }
        if (document.getElementById('pvm-cash-proyectado')) {
            document.getElementById('pvm-cash-proyectado').innerText = isAdmin ? formatCOP(filteredUP) : '***';
        }
        if (document.getElementById('pvm-cash-recaudado')) {
            document.getElementById('pvm-cash-recaudado').innerText = isAdmin ? formatCOP(totalRecaudadoRango) : '***';
        }
        if (document.getElementById('pvm-cash-adelantos')) {
            document.getElementById('pvm-cash-adelantos').innerText = isAdmin ? formatCOP(totalAdelantadoActivoRango) : '***';
        }

        // Deficit alert
        const deficitAlert = document.getElementById('pvm-deficit-alert');
        const deficitText = document.getElementById('pvm-deficit-text');
        if (deficitAlert) {
            if (isAdmin && isDeficit && filteredGC > 0) {
                deficitAlert.classList.remove('hidden');
                if (deficitText) {
                    deficitText.innerText = `Las utilidades brutas (${formatCOP(filteredUB)}) no alcanzan a cubrir los gastos corporativos del periodo (${formatCOP(filteredGC)}). La distribución a socios y la retención del fondo de reserva están bloqueadas debido a un déficit operativo de ${formatCOP(deficitAmount)}.`;
                }
            } else {
                deficitAlert.classList.add('hidden');
            }
        }

        // Expenses Tab KPIs
        if (document.getElementById('pvm-gasto-corp-kpi-ingresos')) {
            document.getElementById('pvm-gasto-corp-kpi-ingresos').innerText = isAdmin ? formatCOP(retencionFondo) : '***';
        }
        if (document.getElementById('pvm-gasto-corp-kpi-egresos')) {
            document.getElementById('pvm-gasto-corp-kpi-egresos').innerText = isAdmin ? formatCOP(filteredGC) : '***';
        }
        const balanceEl = document.getElementById('pvm-gasto-corp-kpi-balance');
        if (balanceEl) {
            if (isAdmin) {
                const bal = retencionFondo - filteredGC;
                balanceEl.innerText = formatCOP(bal);
                if (bal >= 0) {
                    balanceEl.className = "text-base font-black text-emerald-600 mt-0.5 tracking-tight";
                } else {
                    balanceEl.className = "text-base font-black text-rose-500 mt-0.5 tracking-tight";
                }
            } else {
                balanceEl.innerText = '***';
                balanceEl.className = "text-base font-black text-slate-800 mt-0.5 tracking-tight";
            }
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
                        <td class="py-2.5 px-4 whitespace-nowrap"><p class="text-[10px] font-bold text-slate-500 uppercase tracking-widest">${UI.sanitize(formatDoubleDate(v.fechaFormat))}</p></td>
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
        const tabs = ['desempeno', 'saldos', 'rentabilidad-mensual', 'gastos-corporativos', 'planes-rendimiento', 'adelantos-operativos', 'fondos-flotantes'];
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
        } else if (this.activeTab === 'adelantos-operativos') {
            this.renderAdelantosPanel();
        } else if (this.activeTab === 'fondos-flotantes') {
            this.renderFondosFlotantesPanel();
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

    renderSaldosMonthTabs() {
        const nav = document.getElementById('pvm-saldos-months-nav');
        if (!nav) return;
        nav.innerHTML = '';

        // Agency started in April 2026
        const startDate = new Date('2026-04-01T00:00:00');
        const endDate = new Date();
        
        const months = [];
        let curr = new Date(startDate);
        while (curr <= endDate) {
            const y = curr.getFullYear();
            const m = String(curr.getMonth() + 1).padStart(2, '0');
            const ym = `${y}-${m}`;
            months.push({
                ym,
                label: curr.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
            });
            curr.setMonth(curr.getMonth() + 1);
        }

        // Generate sub-tab buttons
        months.forEach(m => {
            const isSelected = m.ym === this.selectedSaldosMonth;
            const btnClass = isSelected
                ? "px-3 py-1.5 rounded-lg text-xs font-black bg-slate-900 text-white shadow-sm transition-all whitespace-nowrap cursor-pointer"
                : "px-3 py-1.5 rounded-lg text-xs font-bold text-slate-500 hover:text-slate-800 hover:bg-slate-200/50 transition-all whitespace-nowrap cursor-pointer";
            
            nav.innerHTML += `
                <button type="button" data-action="pvm-select-saldos-month" data-month="${m.ym}" class="${btnClass}">
                    ${m.label.charAt(0).toUpperCase() + m.label.slice(1)}
                </button>
            `;
        });
    },

    async handleGlobalWithdrawal(email, totalWithdrawal) {
        try {
            const currentUserEmail = (window.AuthModule?.currentUser?.email || '').toLowerCase();
            const rol = window.AuthModule?.userProfile?.rol;
            const isAdmin = rol === 'administrador' || rol === 'socio_mayoritario' || rol === 'super_administrador';

            if (!isAdmin && email.toLowerCase() !== currentUserEmail) {
                return UI.showToast("No tienes permiso para registrar retiros de otros socios.", "error");
            }

            const partner = this.sociosConfig.find(s => s.email.toLowerCase() === email.toLowerCase());
            if (!partner) return UI.showToast("Socio no encontrado", "error");

            // Safety check for float pool
            const pendingFloatExpenses = (this.corporateExpenses || [])
                .filter(g => g.origen_fondos === 'Fondo Flotante' && g.estado_pago === 'pendiente')
                .reduce((sum, g) => sum + (Number(g.monto) || 0), 0);
            const totalFloatPool = (this.fondosFlotantes || [])
                .filter(f => f.estado === 'disponible')
                .reduce((sum, f) => sum + (Number(f.monto) || 0), 0) - pendingFloatExpenses;

            // Calculate global totals to check liquidity first
            const allTrips = this.getAllTrips();
            const hoy = new Date();
            hoy.setHours(23, 59, 59, 999);
            const histRealizedTrips = allTrips.filter(t => t.dateObj <= hoy);
            const histUB = histRealizedTrips.reduce((acc, t) => acc + t.margen, 0);
            const histGC = this.corporateExpenses
                .filter(g => g.origen_fondos === 'Utilidad de la Agencia' || (g.origen_fondos === 'Fondo Flotante' && g.estado_pago === 'pagado') || !g.origen_fondos)
                .reduce((acc, g) => acc + g.monto, 0);
            const histGC_Reserva = this.corporateExpenses
                .filter(g => g.origen_fondos === 'Fondo de Reserva')
                .reduce((acc, g) => acc + g.monto, 0);

            let histUN = 0;
            let histRetenidoFondo = 0;
            if (histUB > histGC) {
                const histUN_Operacion = histUB - histGC;
                histRetenidoFondo = histUN_Operacion * (this.porcentajeRetencion / 100);
                histUN = histUN_Operacion - histRetenidoFondo;
            }

            let totalSociosDisp = 0;
            this.sociosConfig.forEach(soc => {
                const ganado = histUN * (soc.porcentaje / 100);
                const reserve = histRetenidoFondo * (soc.porcentaje / 100);
                const retirado = this.movements
                    .filter(m => m.socio_email.toLowerCase() === soc.email.toLowerCase())
                    .reduce((acc, m) => acc + m.monto, 0);
                totalSociosDisp += ((ganado + reserve) - retirado);
            });

            let totalReservaUtilizada = 0;
            this.sociosConfig.forEach(soc => {
                const ganado = histUN * (soc.porcentaje / 100);
                const reserve = histRetenidoFondo * (soc.porcentaje / 100);
                const retirado = this.movements
                    .filter(m => m.socio_email.toLowerCase() === soc.email.toLowerCase())
                    .reduce((acc, m) => acc + m.monto, 0);
                
                const excess = Math.max(0, retirado - ganado);
                const reserveUsed = Math.min(reserve, excess);
                totalReservaUtilizada += reserveUsed;
            });

            const balanceF = histUB > histGC 
                ? Math.max(0, histRetenidoFondo - histGC_Reserva - totalReservaUtilizada) 
                : -(histGC - histUB);
            const cajaTeoricaPre = balanceF + totalSociosDisp;

            if ((cajaTeoricaPre - totalWithdrawal) < totalFloatPool) {
                return UI.showToast(`Operación bloqueada: Mantener el fondo de clientes en custodia requiere un respaldo de ${formatCOP(totalFloatPool)} en caja. Caja estimada restante: ${formatCOP(cajaTeoricaPre - totalWithdrawal)}.`, "error");
            }

            // FIFO Algorithm across all months starting from April 2026
            const startDate = new Date('2026-04-01T00:00:00');
            const endDate = new Date();
            let curr = new Date(startDate);
            let remainingWithdrawal = totalWithdrawal;
            
            // Collect months in order
            const monthsList = [];
            while (curr <= endDate) {
                const y = curr.getFullYear();
                const m = String(curr.getMonth() + 1).padStart(2, '0');
                monthsList.push(`${y}-${m}`);
                curr.setMonth(curr.getMonth() + 1);
            }

            let registeredCount = 0;

            // Iterate month by month and deduct
            for (const ym of monthsList) {
                if (remainingWithdrawal <= 0.01) break;

                // Calculate available for partner in month `ym`
                // 1. Month trips & margins
                const monthTrips = allTrips.filter(t => {
                    const y = t.dateObj.getFullYear();
                    const m = String(t.dateObj.getMonth() + 1).padStart(2, '0');
                    return t.dateObj <= hoy && `${y}-${m}` === ym;
                });
                const monthUB = monthTrips.reduce((acc, t) => acc + t.margen, 0);

                // 2. Month expenses
                const parts = ym.split('-');
                const y = parseInt(parts[0]);
                const mIdx = parseInt(parts[1]);
                const startM = new Date(y, mIdx - 1, 1);
                const endM = new Date(y, mIdx, 0, 23, 59, 59, 999);

                const monthExpenses = this.corporateExpenses.filter(g => {
                    const date = new Date(g.fecha);
                    const isCreatedBeforeOrInMonth = date <= endM;
                    const isNotDeletedOrDeletedAfterMonth = !g.deleted_at || new Date(g.deleted_at) > endM;
                    
                    if (!isCreatedBeforeOrInMonth || !isNotDeletedOrDeletedAfterMonth) return false;
                    
                    if (g.es_recurrente) return true;
                    return date >= startM && date <= endM;
                });

                const monthFixedGC = monthExpenses.filter(g => g.es_recurrente).reduce((sum, g) => sum + g.monto, 0);
                const monthVariableGC = monthExpenses.filter(g => !g.es_recurrente).reduce((sum, g) => sum + g.monto, 0);

                let monthUN = 0;
                let monthRetencionFondo = 0;
                if (monthUB > monthFixedGC) {
                    const monthUN_Operacion = monthUB - monthFixedGC - monthVariableGC;
                    monthRetencionFondo = Math.max(0, monthUN_Operacion * (this.porcentajeRetencion / 100));
                    monthUN = Math.max(0, monthUN_Operacion - monthRetencionFondo);
                }

                const ganadoSocio = monthUN * (partner.porcentaje / 100);
                const reserveShare = monthRetencionFondo * (partner.porcentaje / 100);
                const totalRetirado = this.movements
                    .filter(m => m.socio_email.toLowerCase() === partner.email.toLowerCase() && m.fecha.substring(0, 7) === ym)
                    .reduce((acc, m) => acc + m.monto, 0);

                const disponibleMes = (ganadoSocio + reserveShare) - totalRetirado;

                if (disponibleMes > 0.01) {
                    const deduction = Math.min(remainingWithdrawal, disponibleMes);
                    
                    // Register withdrawal for this month (set date to last day of this month)
                    const lastDayStr = endM.toISOString().substring(0, 10);
                    const res = await this.saveMovement(
                        partner.email, 
                        'retiro', 
                        deduction, 
                        lastDayStr, 
                        `Retiro Total Express (FIFO) - Porción de ${ym}`
                    );
                    if (res.success) {
                        remainingWithdrawal -= deduction;
                        registeredCount++;
                    }
                }
            }

            if (registeredCount > 0) {
                UI.showToast(`Retiro express completado con éxito (${registeredCount} meses liquidados).`, "success");
                await this.loadMovements();
                this.calculateDistribution();
            } else {
                UI.showToast("No se encontraron saldos disponibles en meses anteriores para retirar.", "info");
            }
        } catch (err) {
            console.error("Error in handleGlobalWithdrawal:", err);
            UI.showToast("Excepción al procesar el retiro.", "error");
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

    async saveCorporateExpense(concepto, categoria, monto, fecha, comprobante = '', origenFondos = 'Utilidad de la Agencia', estadoPago = 'pagado', esRecurrente = false) {
        const userEmail = window.AuthModule?.currentUser?.email || 'unknown@travelers.com';
        const newGasto = {
            id: crypto.randomUUID ? crypto.randomUUID() : (Math.random().toString(36).substring(2) + Date.now().toString(36)),
            concepto,
            categoria,
            monto: Number(monto),
            fecha,
            comprobante,
            usuario_email: userEmail,
            origen_fondos: origenFondos,
            estado_pago: estadoPago,
            es_recurrente: esRecurrente,
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
        const isAdmin = rol === 'administrador' || rol === 'socio_mayoritario' || rol === 'super_administrador';

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

                const origen = g.origen_fondos || 'Utilidad de la Agencia';
                let statusBadge = '';
                let actionBtnHtml = deleteBtn;

                if (origen === 'Fondo Flotante') {
                    if (g.estado_pago === 'pendiente') {
                        statusBadge = `<span class="inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-black bg-rose-50 text-rose-600 border border-rose-100 uppercase tracking-wider">Deuda (Pendiente)</span>`;
                        if (isAdmin) {
                            actionBtnHtml = `<button type="button" data-action="pvm-pagar-deuda-gasto" data-id="${g.id}" class="bg-emerald-500 hover:bg-emerald-600 text-white px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider transition-all" title="Pagar y reembolsar al flotante"><i class="ph ph-check-circle inline mr-0.5"></i> Pagar</button> ` + deleteBtn;
                        }
                    } else {
                        statusBadge = `<span class="inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-black bg-emerald-50 text-emerald-600 border border-emerald-100 uppercase tracking-wider">Reembolsado (OK)</span>`;
                    }
                } else if (origen === 'Fondo de Reserva') {
                    statusBadge = `<span class="inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-black bg-indigo-50 text-indigo-600 border border-indigo-100 uppercase tracking-wider">Reserva</span>`;
                } else {
                    statusBadge = `<span class="inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-black bg-slate-100 text-slate-600 border border-slate-200 uppercase tracking-wider">Pagado</span>`;
                }

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
                        <td class="py-1.5 px-3 whitespace-nowrap text-[10px] font-bold text-slate-600">${UI.sanitize(origen)}</td>
                        <td class="py-1.5 px-3 whitespace-nowrap text-center">${statusBadge}</td>
                        <td class="py-1.5 px-3 whitespace-nowrap text-[10px] text-slate-400 font-bold">${UI.sanitize(g.usuario_email)}</td>
                        <td class="py-1.5 px-3 whitespace-nowrap text-center">${actionBtnHtml}</td>
                    </tr>
                `;
            });
        }
    },

    renderSaldosAndHistory() {
        const currentUserEmail = (window.AuthModule?.currentUser?.email || '').toLowerCase();
        const rol = window.AuthModule?.userProfile?.rol;
        const isAdmin = rol === 'administrador' || rol === 'socio_mayoritario' || rol === 'super_administrador';

        const allTrips = this.getAllTrips();
        const hoy = new Date();
        hoy.setHours(23, 59, 59, 999);

        // Render monthly tabs first
        this.renderSaldosMonthTabs();

        // 1. Global / Historical calculations
        const histRealizedTripsGlobal = allTrips.filter(t => t.dateObj <= hoy);
        const histUBGlobal = histRealizedTripsGlobal.reduce((acc, t) => acc + t.margen, 0);

        const histGCGlobal = this.corporateExpenses
            .filter(g => g.origen_fondos === 'Utilidad de la Agencia' || (g.origen_fondos === 'Fondo Flotante' && g.estado_pago === 'pagado') || !g.origen_fondos)
            .reduce((acc, g) => acc + g.monto, 0);

        const histGC_ReservaGlobal = this.corporateExpenses
            .filter(g => g.origen_fondos === 'Fondo de Reserva')
            .reduce((acc, g) => acc + g.monto, 0);

        let histUNGlobal = 0;
        let histRetenidoFondoGlobal = 0;
        if (histUBGlobal > histGCGlobal) {
            const histUN_OperacionGlobal = histUBGlobal - histGCGlobal;
            histRetenidoFondoGlobal = histUN_OperacionGlobal * (this.porcentajeRetencion / 100);
            histUNGlobal = histUN_OperacionGlobal - histRetenidoFondoGlobal;
        }

        // 2. Selected Month calculations
        const [ySelected, mSelected] = this.selectedSaldosMonth.split('-').map(Number);
        const startM = new Date(ySelected, mSelected - 1, 1);
        const endM = new Date(ySelected, mSelected, 0, 23, 59, 59, 999);
        const monthLabel = startM.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });

        // Update local month subheader title
        const monthHeader = document.getElementById('pvm-saldos-month-header');
        if (monthHeader) {
            monthHeader.innerHTML = `<i class="ph ph-calendar mr-1.5 text-sm"></i> Rendimiento de ${monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)} (Tarjetas Mensuales)`;
        }

        // Monthly Realized margins
        const monthRealizedTrips = allTrips.filter(t => t.dateObj <= hoy && t.dateObj >= startM && t.dateObj <= endM);
        const monthUB = monthRealizedTrips.reduce((acc, t) => acc + t.margen, 0);

        // Filter month corporate expenses applying the recurrence rule
        const monthExpenses = this.corporateExpenses.filter(g => {
            const date = new Date(g.fecha);
            const isCreatedBeforeOrInMonth = date <= endM;
            const isNotDeletedOrDeletedAfterMonth = !g.deleted_at || new Date(g.deleted_at) > endM;
            
            if (!isCreatedBeforeOrInMonth || !isNotDeletedOrDeletedAfterMonth) return false;
            
            if (g.es_recurrente) {
                return true; // Recurring expenses apply to their month of registration and all future months
            } else {
                return date >= startM && date <= endM; // Non-recurring expenses apply only to their month of registration
            }
        });

        // Split corporate expenses of this month
        const monthFixedGC = monthExpenses.filter(g => g.es_recurrente).reduce((sum, g) => sum + g.monto, 0);
        const monthVariableGC = monthExpenses.filter(g => !g.es_recurrente).reduce((sum, g) => sum + g.monto, 0);
        const monthTotalGC = monthFixedGC + monthVariableGC;

        // Coverage percentage of Fixed/Recurring Expenses
        let fixedCoveragePct = 100;
        if (monthFixedGC > 0) {
            fixedCoveragePct = Math.min(100, Math.round((monthUB / monthFixedGC) * 100));
        }

        // Render fixed coverage bar container
        const coverageContainer = document.getElementById('pvm-saldos-fixed-coverage-container');
        if (coverageContainer) {
            if (monthFixedGC > 0) {
                coverageContainer.classList.remove('hidden');
                const isSaneado = fixedCoveragePct >= 100;
                const barColor = isSaneado ? 'bg-emerald-500' : 'bg-amber-500';
                const badge = isSaneado 
                    ? `<span class="px-2 py-0.5 rounded text-[8px] font-black bg-emerald-50 text-emerald-600 border border-emerald-100 uppercase tracking-wider">Saneado 100%</span>`
                    : `<span class="px-2 py-0.5 rounded text-[8px] font-black bg-amber-50 text-amber-600 border border-amber-100 uppercase tracking-wider">Falta Cobertura</span>`;
                
                coverageContainer.innerHTML = `
                    <div class="flex justify-between items-center mb-1.5">
                        <div>
                            <p class="text-[9px] font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                                <i class="ph ph-shield-check text-base text-slate-400"></i> Cobertura de Gastos Fijos del Mes (${monthLabel})
                            </p>
                            <p class="text-[8px] text-slate-400 font-bold mt-0.5">Margen de viajes realizados: ${formatCOP(monthUB)} / Gastos recurrentes obligatorios: ${formatCOP(monthFixedGC)}</p>
                        </div>
                        ${badge}
                    </div>
                    <div class="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                        <div class="${barColor} h-1.5 rounded-full transition-all duration-500" style="width: ${fixedCoveragePct}%"></div>
                    </div>
                    ${!isSaneado ? `
                        <p class="text-[8px] font-bold text-rose-500 mt-2 flex items-center gap-1">
                            <i class="ph ph-warning-circle text-xs shrink-0"></i> Las utilidades y el disponible del mes están congelados hasta cubrir la meta de gastos fijos.
                        </p>
                    ` : `
                        <p class="text-[8px] font-bold text-emerald-600 mt-2 flex items-center gap-1">
                            <i class="ph ph-check-circle text-xs shrink-0"></i> Gastos fijos 100% cubiertos. Utilidades liberadas para distribución en este mes.
                        </p>
                    `}
                `;
            } else {
                coverageContainer.classList.add('hidden');
            }
        }

        // Net Profit & Reserve of the month
        let monthUN = 0;
        let monthRetencionFondo = 0;
        if (monthUB >= monthFixedGC) {
            const monthUN_Operacion = monthUB - monthFixedGC - monthVariableGC;
            monthRetencionFondo = Math.max(0, monthUN_Operacion * (this.porcentajeRetencion / 100));
            monthUN = Math.max(0, monthUN_Operacion - monthRetencionFondo);
        }

        const fallbackBanner = document.getElementById('pvm-saldos-fallback-banner');
        if (fallbackBanner) {
            if (this.fallbackActive) fallbackBanner.classList.remove('hidden');
            else fallbackBanner.classList.add('hidden');
        }

        // Render local month KPIs at the top
        const kpisContainer = document.getElementById('pvm-saldos-kpis-container');
        if (kpisContainer) {
            kpisContainer.innerHTML = `
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div class="bg-white border border-slate-200 rounded-xl p-3 flex items-center justify-between shadow-sm">
                        <div>
                            <span class="text-[8px] font-black text-slate-400 uppercase tracking-widest block">Utilidad Bruta del Mes (Realizada)</span>
                            <span class="text-sm font-black text-slate-800 mt-0.5 tracking-tight">${formatCOP(monthUB)}</span>
                        </div>
                        <div class="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-500"><i class="ph ph-chart-line-up text-base"></i></div>
                    </div>
                    <div class="bg-white border border-slate-200 rounded-xl p-3 flex items-center justify-between shadow-sm">
                        <div>
                            <span class="text-[8px] font-black text-slate-400 uppercase tracking-widest block">Gastos Corporativos del Mes</span>
                            <span class="text-sm font-black text-rose-500 mt-0.5 tracking-tight">${formatCOP(monthTotalGC)}</span>
                        </div>
                        <div class="w-8 h-8 rounded-full bg-rose-50 flex items-center justify-center text-rose-500"><i class="ph ph-trend-down text-base"></i></div>
                    </div>
                    <div class="bg-white border border-slate-200 rounded-xl p-3 flex items-center justify-between shadow-sm">
                        <div>
                            <span class="text-[8px] font-black text-slate-400 uppercase tracking-widest block">Utilidad Neta del Mes</span>
                            <span class="text-sm font-black text-emerald-600 mt-0.5 tracking-tight">${formatCOP(monthUN)}</span>
                        </div>
                        <div class="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600"><i class="ph ph-hand-coins text-base"></i></div>
                    </div>
                </div>
            `;
        }

        // 3. Render Global Cards (Tarjetas Principales)
        const globalGrid = document.getElementById('pvm-saldos-global-grid');
        if (globalGrid) {
            globalGrid.innerHTML = '';
            this.sociosConfig.forEach(soc => {
                const esMio = soc.email.toLowerCase() === currentUserEmail;
                const puedeVerDinero = isAdmin || esMio;

                const ganadoHistorico = histUNGlobal * (soc.porcentaje / 100);
                const reserveShare = histRetenidoFondoGlobal * (soc.porcentaje / 100);
                const totalRetirado = this.movements
                    .filter(m => m.socio_email.toLowerCase() === soc.email.toLowerCase())
                    .reduce((acc, m) => acc + m.monto, 0);
                
                const disponible = ganadoHistorico - totalRetirado;

                const ganadoFormat = puedeVerDinero ? formatCOP(ganadoHistorico) : '***';
                const reserveShareFormat = puedeVerDinero ? formatCOP(reserveShare) : '***';
                const retiradoFormat = puedeVerDinero ? formatCOP(totalRetirado) : '***';
                const disponibleFormat = puedeVerDinero ? formatCOP(disponible) : '***';

                const cardClass = esMio 
                    ? 'border-2 border-indigo-500 bg-indigo-50/30 shadow-md' 
                    : 'border border-slate-200 bg-white';

                let buttonsHtml = '';
                if (puedeVerDinero && disponible > 0.01) {
                    buttonsHtml = `
                        <button type="button" data-action="pvm-global-withdrawal" data-email="${soc.email}" data-disponible="${disponible}" class="w-full bg-slate-900 hover:bg-slate-800 text-white font-black py-2 rounded-xl text-[9px] uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 mt-3 shadow-md">
                            <i class="ph ph-hand-coins text-xs"></i> Retiro Total (Express)
                        </button>
                    `;
                }

                const tooltipTitle = `Fórmula de Ganancia Histórica:\n(Utilidad Bruta Realizada Global: ${formatCOP(histUBGlobal)} - Gastos Corporativos Globales: ${formatCOP(histGCGlobal)}) * 90% * ${soc.porcentaje}% = ${formatCOP(ganadoHistorico)}`;
                const reserveShareTooltip = `Fórmula de Reserva Histórica:\nUtilidad Operativa Global (${formatCOP(histUBGlobal - histGCGlobal)}) * 10% * ${soc.porcentaje}% = ${formatCOP(reserveShare)}`;

                globalGrid.innerHTML += `
                    <div class="rounded-xl p-4 flex flex-col justify-between ${cardClass}">
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
                                    <span class="text-slate-500 font-medium flex items-center">
                                        Ganado Histórico (90%):
                                        ${puedeVerDinero ? `<i class="ph ph-info text-slate-400 hover:text-slate-600 cursor-pointer ml-1 text-xs" title="${tooltipTitle}" onclick="alert(this.getAttribute('title'))"></i>` : ''}
                                    </span>
                                    <span class="text-slate-800 font-bold">${ganadoFormat}</span>
                                </div>
                                <div class="flex justify-between text-[10px]">
                                    <span class="text-slate-500 font-medium flex items-center">
                                        Fondo Reserva (10%):
                                        ${puedeVerDinero ? `<i class="ph ph-info text-slate-400 hover:text-slate-600 cursor-pointer ml-1 text-xs" title="${reserveShareTooltip}" onclick="alert(this.getAttribute('title'))"></i>` : ''}
                                    </span>
                                    <span class="text-slate-700 font-semibold">${reserveShareFormat}</span>
                                </div>
                                <div class="flex justify-between text-[10px]">
                                    <span class="text-slate-500 font-medium">Retirado Histórico:</span>
                                    <span class="text-slate-600 font-bold">${retiradoFormat}</span>
                                </div>
                                <div class="flex justify-between text-xs pt-1.5 border-t border-dashed border-slate-100 items-center">
                                    <span class="text-slate-700 font-black">Disponible Real Global:</span>
                                    <span class="${disponible >= 0 ? 'text-emerald-600' : 'text-rose-500'} font-black">${disponibleFormat}</span>
                                </div>
                            </div>
                        </div>
                        ${buttonsHtml}
                    </div>
                `;
            });

            // Reserve Fund Card
            if (isAdmin) {
                let totalReservaUtilizada = 0;
                this.sociosConfig.forEach(soc => {
                    const ganado = histUNGlobal * (soc.porcentaje / 100);
                    const reserve = histRetenidoFondoGlobal * (soc.porcentaje / 100);
                    const retirado = this.movements
                        .filter(m => m.socio_email.toLowerCase() === soc.email.toLowerCase())
                        .reduce((acc, m) => acc + m.monto, 0);
                    
                    const excess = Math.max(0, retirado - ganado);
                    const reserveUsed = Math.min(reserve, excess);
                    totalReservaUtilizada += reserveUsed;
                });

                const fondoDisponible = histUBGlobal > histGCGlobal 
                    ? Math.max(0, histRetenidoFondoGlobal - histGC_ReservaGlobal - totalReservaUtilizada) 
                    : -(histGCGlobal - histUBGlobal);
                
                const balanceColorClass = fondoDisponible >= 0 ? 'text-emerald-600' : 'text-rose-500';
                
                const retencionTooltip = `Retención Acumulada:\n${formatCOP(histRetenidoFondoGlobal)}`;
                const disponibleTooltip = `Saldo Disponible del Fondo:\n${formatCOP(fondoDisponible)}\n\n(Retención: ${formatCOP(histRetenidoFondoGlobal)} - Gastos Reserva: ${formatCOP(histGC_ReservaGlobal)} - Reserva Socios: ${formatCOP(totalReservaUtilizada)})`;

                globalGrid.innerHTML += `
                    <div class="rounded-xl p-4 flex flex-col justify-between border border-dashed border-slate-300 bg-slate-50/50">
                        <div>
                            <div class="flex justify-between items-start mb-2">
                                <div class="flex items-center gap-2">
                                    <div class="w-7 h-7 rounded-full bg-slate-800 flex items-center justify-center text-xs font-black text-white uppercase"><i class="ph ph-vault"></i></div>
                                    <div>
                                        <h5 class="text-xs font-black text-slate-800 uppercase tracking-wider">Fondo de Reserva</h5>
                                        <p class="text-[9px] text-slate-400 font-bold">Caja Menor / Corporativo</p>
                                    </div>
                                </div>
                                <span class="bg-indigo-100 text-indigo-700 text-[9px] font-black px-1.5 py-0.5 rounded">${this.porcentajeRetencion}% Retención</span>
                            </div>
                            
                            <div class="space-y-1.5 mt-3">
                                <div class="flex justify-between text-[10px]">
                                    <span class="text-slate-500 font-medium flex items-center">
                                        Retención Acumulada:
                                        <i class="ph ph-info text-slate-400 hover:text-slate-600 cursor-pointer ml-1 text-xs" title="${retencionTooltip}" onclick="alert(this.getAttribute('title'))"></i>
                                    </span>
                                    <span class="text-slate-800 font-bold">${formatCOP(histRetenidoFondoGlobal)}</span>
                                </div>
                                <div class="flex justify-between text-[10px]">
                                    <span class="text-slate-500 font-medium">Gastos con Reserva:</span>
                                    <span class="text-slate-600 font-bold">${formatCOP(histGC_ReservaGlobal)}</span>
                                </div>
                                <div class="flex justify-between text-xs pt-1.5 border-t border-dashed border-slate-200">
                                    <span class="text-slate-700 font-black flex items-center">
                                        Saldo Disponible:
                                        <i class="ph ph-info text-slate-400 hover:text-slate-600 cursor-pointer ml-1 text-xs" title="${disponibleTooltip}" onclick="alert(this.getAttribute('title'))"></i>
                                    </span>
                                    <span class="${balanceColorClass} font-black">${formatCOP(fondoDisponible)}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }
        }

        // 4. Render Monthly Cards (Tarjetas del Mes)
        const monthGrid = document.getElementById('pvm-saldos-month-grid');
        if (monthGrid) {
            monthGrid.innerHTML = '';
            this.sociosConfig.forEach(soc => {
                const esMio = soc.email.toLowerCase() === currentUserEmail;
                const puedeVerDinero = isAdmin || esMio;

                const ganadoMonth = monthUN * (soc.porcentaje / 100);
                const reserveShareMonth = monthRetencionFondo * (soc.porcentaje / 100);
                const totalRetiradoMonth = this.movements
                    .filter(m => m.socio_email.toLowerCase() === soc.email.toLowerCase() && m.fecha.substring(0, 7) === this.selectedSaldosMonth)
                    .reduce((acc, m) => acc + m.monto, 0);
                
                const disponibleMonth = ganadoMonth - totalRetiradoMonth;

                const ganadoFormat = puedeVerDinero ? formatCOP(ganadoMonth) : '***';
                const reserveShareFormat = puedeVerDinero ? formatCOP(reserveShareMonth) : '***';
                const retiradoFormat = puedeVerDinero ? formatCOP(totalRetiradoMonth) : '***';
                const disponibleFormat = puedeVerDinero ? formatCOP(disponibleMonth) : '***';

                const cardClass = esMio 
                    ? 'border-2 border-indigo-500 bg-indigo-50/30 shadow-md' 
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

                const tooltipTitle = `Fórmula de este mes (${monthLabel}):\n(Utilidad Bruta: ${formatCOP(monthUB)} - Gastos Recurrentes: ${formatCOP(monthFixedGC)} - Gastos Variables: ${formatCOP(monthVariableGC)}) * 90% * ${soc.porcentaje}% = ${formatCOP(ganadoMonth)}`;

                let progressHtml = '';
                if (puedeVerDinero) {
                    const totalCupo = ganadoMonth;
                    if (totalCupo > 0) {
                        const pct = Math.min(100, Math.round((totalRetiradoMonth / totalCupo) * 100));
                        const isExceeded = totalRetiradoMonth > totalCupo;
                        const barColor = isExceeded ? 'bg-rose-500' : 'bg-indigo-500';
                        progressHtml = `
                            <div class="mt-2.5 pt-2 border-t border-slate-100/50">
                                <div class="flex justify-between items-center text-[8px] font-black text-slate-400 uppercase tracking-wider mb-1">
                                    <span>Progreso Retiros del Mes</span>
                                    <span class="${isExceeded ? 'text-rose-500 font-black' : 'text-slate-500'}">${isExceeded ? 'Excedido' : `${pct}%`}</span>
                                </div>
                                <div class="w-full bg-slate-100 rounded-full h-1 overflow-hidden">
                                    <div class="${barColor} h-1 rounded-full transition-all duration-500" style="width: ${pct}%"></div>
                                </div>
                            </div>
                        `;
                    } else {
                        const hasWithdrawn = totalRetiradoMonth > 0;
                        progressHtml = `
                            <div class="mt-2.5 pt-2 border-t border-slate-100/50">
                                <div class="flex justify-between items-center text-[8px] font-black text-slate-400 uppercase tracking-wider mb-1">
                                    <span>Progreso Retiros del Mes</span>
                                    <span class="${hasWithdrawn ? 'text-rose-500 font-black' : 'text-slate-500'}">${hasWithdrawn ? 'Excedido (Sin Utilidades)' : 'Sin Retiros'}</span>
                                </div>
                                <div class="w-full bg-slate-100 rounded-full h-1 overflow-hidden">
                                    <div class="${hasWithdrawn ? 'bg-rose-500 w-full' : 'bg-slate-300 w-0'} h-1 rounded-full transition-all duration-500"></div>
                                </div>
                            </div>
                        `;
                    }
                }

                monthGrid.innerHTML += `
                    <div class="rounded-xl p-4 flex flex-col justify-between ${cardClass}">
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
                                    <span class="text-slate-500 font-medium flex items-center">
                                        Ganado en el Mes (90%):
                                        ${puedeVerDinero ? `<i class="ph ph-info text-slate-400 hover:text-slate-600 cursor-pointer ml-1 text-xs" title="${tooltipTitle}" onclick="alert(this.getAttribute('title'))"></i>` : ''}
                                    </span>
                                    <span class="text-slate-800 font-bold">${ganadoFormat}</span>
                                </div>
                                <div class="flex justify-between text-[10px]">
                                    <span class="text-slate-500 font-medium">Fondo Reserva (10%):</span>
                                    <span class="text-slate-700 font-semibold">${reserveShareFormat}</span>
                                </div>
                                <div class="flex justify-between text-[10px] hover:bg-slate-100/50 cursor-pointer p-0.5 -mx-0.5 rounded transition-colors" 
                                     data-action="filter-partner-withdrawals" data-email="${soc.email}" title="Ver transacciones de este socio abajo">
                                    <span class="text-slate-500 font-medium flex items-center gap-0.5 font-bold text-indigo-600">Retirado del Mes: <i class="ph ph-magnifying-glass text-[10px] text-indigo-400"></i></span>
                                    <span class="text-slate-600 font-bold underline decoration-dotted decoration-indigo-400">${retiradoFormat}</span>
                                </div>
                                <div class="flex justify-between text-xs pt-1.5 border-t border-dashed border-slate-100 items-center">
                                    <span class="text-slate-700 font-black">Disponible del Mes:</span>
                                    <span class="${disponibleMonth >= 0 ? 'text-emerald-600' : 'text-rose-500'} font-black">${disponibleFormat}</span>
                                </div>
                            </div>
                            ${progressHtml}
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
        const isAdmin = rol === 'administrador' || rol === 'socio_mayoritario' || rol === 'super_administrador';
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
                        <td class="py-2 px-4 text-xs text-slate-600 max-w-[280px] xl:max-w-[350px] truncate" title="${UI.sanitize(m.concepto)}">${UI.sanitize(m.concepto)}</td>
                        <td class="py-2 px-4 whitespace-nowrap text-[10px] text-slate-400 font-bold">${UI.sanitize(m.usuario_email)}</td>
                        <td class="py-2 px-4 whitespace-nowrap text-center">${deleteBtn}</td>
                    </tr>
                `;
            });
        }
    },

    filterPartnerWithdrawals(email) {
        // Set partner filter dropdown
        const histFilter = document.getElementById('pvm-history-filter-partner');
        if (histFilter) {
            histFilter.value = email || 'todos';
        }

        // Force date filters to historico range to show all withdrawals
        const quickFilters = document.getElementById('pvm-quick-filters');
        if (quickFilters) {
            quickFilters.value = 'historico';
            this.applyQuickDates();
        } else {
            this.renderHistoryList();
        }

        // Scroll smoothly to the history ledger card
        const historyContainer = document.getElementById('pvm-history-filter-partner')?.closest('.border');
        if (historyContainer) {
            historyContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    },

    renderRentabilidadAnalisis() {
        const rol = window.AuthModule?.userProfile?.rol;
        const isAdmin = rol === 'administrador' || rol === 'socio_mayoritario' || rol === 'super_administrador';
        const currentUserEmail = (window.AuthModule?.currentUser?.email || '').toLowerCase();

        const allTrips = this.getAllTrips();
        const hoy = new Date();
        hoy.setHours(23, 59, 59, 999);

        // Group by month (using all trips: realized & future)
        const monthsSet = new Set();
        allTrips.forEach(t => {
            if (t.dateObj) {
                const y = t.dateObj.getFullYear();
                const m = String(t.dateObj.getMonth() + 1).padStart(2, '0');
                monthsSet.add(`${y}-${m}`);
            }
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
        (DataService.adelantos_operativos || []).forEach(a => {
            if (a.fecha && !a.deleted_at) {
                const parts = a.fecha.split('-');
                if (parts.length >= 2) {
                    monthsSet.add(`${parts[0]}-${parts[1]}`);
                }
            }
        });

        const sortedMonths = Array.from(monthsSet).sort((a, b) => b.localeCompare(a));

        const monthlyData = sortedMonths.map(month => {
            // Trips in this month
            const monthTrips = allTrips.filter(t => {
                const y = t.dateObj.getFullYear();
                const m = String(t.dateObj.getMonth() + 1).padStart(2, '0');
                return `${y}-${m}` === month;
            });

            const ingresos = monthTrips.reduce((acc, t) => acc + t.ingresoBruto, 0);
            const costos = monthTrips.reduce((acc, t) => acc + t.costoTotal, 0);
            const bruta = ingresos - costos;

            // Corporate expenses in this month (only ones paid by Agency Utility, or repaid Float debts, excluding reserve-funded/pending float ones)
            const monthGastos = this.corporateExpenses.filter(g => {
                if (!g.fecha) return false;
                const parts = g.fecha.split('-');
                const isMatchedMonth = `${parts[0]}-${parts[1]}` === month;
                const isOrdinario = g.origen_fondos === 'Utilidad de la Agencia' || (g.origen_fondos === 'Fondo Flotante' && g.estado_pago === 'pagado') || !g.origen_fondos;
                return isMatchedMonth && isOrdinario;
            });
            const gastosCorp = monthGastos.reduce((acc, g) => acc + g.monto, 0);

            // Adelantos en este mes
            const monthAdelantosList = (DataService.adelantos_operativos || []).filter(a => {
                if (a.deleted_at || !a.fecha) return false;
                const parts = a.fecha.split('-');
                return `${parts[0]}-${parts[1]}` === month;
            });
            const monthAdelantos = monthAdelantosList.reduce((acc, a) => acc + (Number(a.monto_adelantado) || 0), 0);

            // Prioridad Financiera (Opción B)
            let neta = 0;
            let retencionFondo = 0;
            if (bruta > gastosCorp) {
                const operacionNeta = bruta - gastosCorp;
                retencionFondo = operacionNeta * (this.porcentajeRetencion / 100);
                neta = operacionNeta - retencionFondo;
            }

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
                retencionFondo,
                neta,
                retiros,
                adelantos: monthAdelantos
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
                    <th class="py-2.5 px-4 text-right">Gastos Fijos</th>
                    <th class="py-2.5 px-4 text-right">Retención Fondo</th>
                    <th class="py-2.5 px-4 text-right">Neta Distribuible</th>
                    ${partnerCols}
                    <th class="py-2.5 px-4 text-right">Adelantos/Préstamos</th>
                    <th class="py-2.5 px-4 text-right">Retiros</th>
                    <th class="py-2.5 px-4 text-right">Rentabilidad %</th>
                </tr>
            `;
        }

        const mList = document.getElementById('pvm-monthly-list');
        if (mList) {
            mList.innerHTML = '';
            if (monthlyData.length === 0) {
                const colspan = 7 + this.sociosConfig.length;
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

                    const currentYearMonth = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
                    let statusBadge = '';
                    if (row.month > currentYearMonth) {
                        statusBadge = `<span class="inline-flex items-center ml-2 px-1.5 py-0.5 rounded text-[8px] font-black bg-slate-100 text-slate-600 uppercase tracking-widest border border-slate-200">Proyectado</span>`;
                    } else if (row.month === currentYearMonth) {
                        statusBadge = `<span class="inline-flex items-center ml-2 px-1.5 py-0.5 rounded text-[8px] font-black bg-indigo-50 text-indigo-600 uppercase tracking-widest border border-indigo-100">En Curso</span>`;
                    } else {
                        statusBadge = `<span class="inline-flex items-center ml-2 px-1.5 py-0.5 rounded text-[8px] font-black bg-emerald-50 text-emerald-600 uppercase tracking-widest border border-emerald-100">Realizado</span>`;
                    }

                    mList.innerHTML += `
                        <tr class="pvm-monthly-row hover:bg-slate-100/70 transition-colors cursor-pointer" data-month="${row.month}">
                            <td class="py-2.5 px-4 whitespace-nowrap text-xs font-black text-slate-800 flex items-center gap-1.5"><i class="ph ph-caret-right text-[10px] text-slate-400"></i> ${formatMonthYear(row.month)} ${statusBadge}</td>
                            <td class="py-2.5 px-4 text-right whitespace-nowrap text-xs font-medium text-slate-600">${isAdmin ? formatCOP(row.bruta) : '***'}</td>
                            <td class="py-2.5 px-4 text-right whitespace-nowrap text-xs font-medium text-rose-500/80">${isAdmin ? formatCOP(row.gastosCorp) : '***'}</td>
                            <td class="py-2.5 px-4 text-right whitespace-nowrap text-xs font-medium text-amber-500">${isAdmin ? formatCOP(row.retencionFondo) : '***'}</td>
                            <td class="py-2.5 px-4 text-right whitespace-nowrap text-xs font-black ${netaColor}">${isAdmin ? formatCOP(row.neta) : '***'}</td>
                            ${partnerCells}
                            <td class="py-2.5 px-4 text-right whitespace-nowrap text-xs font-medium text-amber-600">${isAdmin ? formatCOP(row.adelantos) : '***'}</td>
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
        const isAdmin = rol === 'administrador' || rol === 'socio_mayoritario' || rol === 'super_administrador';

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
        const isAdmin = rol === 'administrador' || rol === 'socio_mayoritario' || rol === 'super_administrador';

        const allTrips = this.getAllTrips();
        const hoy = new Date();
        hoy.setHours(23, 59, 59, 999);

        // Trips in this month (both realized and projected)
        const monthTrips = allTrips.filter(t => {
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
                tbodyPlanes.innerHTML = `<tr><td colspan="8" class="py-3 text-center text-xs text-slate-400 font-bold uppercase tracking-wider">Sin viajes programados ni realizados</td></tr>`;
            } else {
                monthTrips.forEach(v => {
                    const colorMargen = v.margen >= 0 ? 'text-emerald-600' : 'text-red-500';

                    // Clientes de esta salida
                    const clientesSalida = DataService.clientes.filter(c => {
                        const st = c.estado ? c.estado.toLowerCase() : '';
                        return c.plan_id === v.planId && c.fecha_viaje === v.fechaFormat && !['desistió', 'cancelado o devolución', 'cancelados'].includes(st);
                    });

                    // Abonos Recaudados
                    let totalRecaudado = 0;
                    clientesSalida.forEach(c => {
                        const totalAbo = DataService.abonos.filter(a => a.cliente_id === c.id && a.estado_pago !== 'pending' && a.estado_pago !== 'refunded' && !a.deleted_at).reduce((s, a) => s + (Number(a.monto) || 0), 0);
                        const st = c.estado ? c.estado.toLowerCase() : '';
                        if (st === 'devolución') {
                            const devuelto = parseFloat(c.monto_devuelto || 0);
                            totalRecaudado += Math.max(0, totalAbo - devuelto);
                        } else {
                            totalRecaudado += totalAbo;
                        }
                    });

                    // Adelantos / Préstamos
                    const planAdvances = (DataService.adelantos_operativos || []).filter(a => {
                        if (a.deleted_at) return false;
                        if (a.plan_id === v.planId && a.fecha_viaje === v.fechaFormat) return true;
                        if (a.cliente_id) {
                            return clientesSalida.some(c => c.id === a.cliente_id);
                        }
                        return false;
                    });
                    const totalAdelantos = planAdvances.reduce((sum, a) => sum + (Number(a.monto_adelantado) || 0), 0);

                    const adelantosDisplay = totalAdelantos > 0 ? formatCOP(totalAdelantos) : '$0';
                    const recaudadoDisplay = formatCOP(totalRecaudado);

                    tbodyPlanes.innerHTML += `
                        <tr class="hover:bg-slate-50 transition-colors">
                            <td class="py-2 px-3 text-xs font-black text-slate-800">${UI.sanitize(v.planName)}</td>
                            <td class="py-2 px-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest">${UI.sanitize(v.fechaFormat)}</td>
                            <td class="py-2 px-3 text-center text-xs font-bold text-slate-600">${v.paxAsistentes}</td>
                            <td class="py-2 px-3 text-right text-xs font-medium text-slate-600">${isAdmin ? formatCOP(v.ingresoBruto) : '***'}</td>
                            <td class="py-2 px-3 text-right text-xs font-medium text-rose-500/80">${isAdmin ? formatCOP(v.costoTotal) : '***'}</td>
                            <td class="py-2 px-3 text-right text-xs font-black ${colorMargen}">${isAdmin ? formatCOP(v.margen) : '***'}</td>
                            <td class="py-2 px-3 text-right text-xs font-medium text-amber-600">${isAdmin ? adelantosDisplay : '***'}</td>
                            <td class="py-2 px-3 text-right text-xs font-black text-emerald-600">${isAdmin ? recaudadoDisplay : '***'}</td>
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
        const isAdmin = rol === 'administrador' || rol === 'socio_mayoritario' || rol === 'super_administrador';

        if (!isAdmin && email.toLowerCase() !== currentUserEmail) {
            return UI.showToast("No tienes permiso para registrar movimientos de otros socios.", "error");
        }

        const partner = this.sociosConfig.find(s => s.email.toLowerCase() === email.toLowerCase());
        if (!partner) return UI.showToast("Socio no encontrado", "error");

        const allTrips = this.getAllTrips();
        const hoy = new Date();
        hoy.setHours(23, 59, 59, 999);

        // Selected Month calculations
        const [ySelected, mSelected] = this.selectedSaldosMonth.split('-').map(Number);
        const startM = new Date(ySelected, mSelected - 1, 1);
        const endM = new Date(ySelected, mSelected, 0, 23, 59, 59, 999);

        // Monthly Realized margins
        const monthRealizedTrips = allTrips.filter(t => t.dateObj <= hoy && t.dateObj >= startM && t.dateObj <= endM);
        const monthUB = monthRealizedTrips.reduce((acc, t) => acc + t.margen, 0);

        // Filter month corporate expenses applying the recurrence rule
        const monthExpenses = this.corporateExpenses.filter(g => {
            const date = new Date(g.fecha);
            const isCreatedBeforeOrInMonth = date <= endM;
            const isNotDeletedOrDeletedAfterMonth = !g.deleted_at || new Date(g.deleted_at) > endM;
            
            if (!isCreatedBeforeOrInMonth || !isNotDeletedOrDeletedAfterMonth) return false;
            
            if (g.es_recurrente) return true;
            return date >= startM && date <= endM;
        });

        // Split corporate expenses of this month
        const monthFixedGC = monthExpenses.filter(g => g.es_recurrente).reduce((sum, g) => sum + g.monto, 0);
        const monthVariableGC = monthExpenses.filter(g => !g.es_recurrente).reduce((sum, g) => sum + g.monto, 0);

        // Net Profit & Reserve of the month
        let monthUN = 0;
        let monthRetencionFondo = 0;
        if (monthUB >= monthFixedGC) {
            const monthUN_Operacion = monthUB - monthFixedGC - monthVariableGC;
            monthRetencionFondo = Math.max(0, monthUN_Operacion * (this.porcentajeRetencion / 100));
            monthUN = Math.max(0, monthUN_Operacion - monthRetencionFondo);
        }

        const ganadoMonth = monthUN * (partner.porcentaje / 100);
        const reserveShareMonth = monthRetencionFondo * (partner.porcentaje / 100);
        const totalRetiradoMonth = this.movements
            .filter(m => m.socio_email.toLowerCase() === partner.email.toLowerCase() && m.fecha.substring(0, 7) === this.selectedSaldosMonth)
            .reduce((acc, m) => acc + m.monto, 0);
        
        const disponible = (ganadoMonth + reserveShareMonth) - totalRetiradoMonth;

        document.getElementById('pvm-mov-socio-email').value = partner.email;
        document.getElementById('pvm-mov-tipo').value = tipo;
        document.getElementById('pvm-mov-socio-nombre').value = partner.nombre;
        document.getElementById('pvm-mov-tipo-texto').value = tipo === 'corte' ? 'Corte de Caja (Retiro de Caja/Control)' : 'Retiro de Utilidades';
        document.getElementById('pvm-mov-saldo-disponible').value = formatCOP(disponible);

        const dateInput = document.getElementById('pvm-mov-fecha');
        const currentYM = new Date().toISOString().substring(0, 7);
        if (this.selectedSaldosMonth === currentYM) {
            dateInput.value = new Date().toISOString().substring(0, 10);
            dateInput.disabled = false;
        } else {
            dateInput.value = endM.toISOString().substring(0, 10);
            dateInput.disabled = true; // force the date to be the end of that selected month
        }
        
        const montoInput = document.getElementById('pvm-mov-monto');
        if (tipo === 'corte') {
            UI.setCurrencyValue('pvm-mov-monto', Math.floor(disponible));
        } else {
            montoInput.value = '';
        }
        document.getElementById('pvm-mov-concepto').value = '';

        UI.openModal('pvm-movimiento-modal', 'pvm-mov-bg', 'pvm-mov-content');
    },

    async handleMovimientoSubmit() {
        const email = document.getElementById('pvm-mov-socio-email').value;
        const tipo = document.getElementById('pvm-mov-tipo').value;
        const monto = UI.parseCurrency(document.getElementById('pvm-mov-monto').value) || 0;
        const fecha = document.getElementById('pvm-mov-fecha').value;
        const concepto = document.getElementById('pvm-mov-concepto').value;

        if (monto <= 0) {
            return UI.showToast("El monto debe ser mayor a cero.", "error");
        }

        const currentUserEmail = (window.AuthModule?.currentUser?.email || '').toLowerCase();
        const rol = window.AuthModule?.userProfile?.rol;
        const isAdmin = rol === 'administrador' || rol === 'socio_mayoritario' || rol === 'super_administrador';

        if (!isAdmin && email.toLowerCase() !== currentUserEmail) {
            return UI.showToast("No tienes permiso para registrar movimientos de otros socios.", "error");
        }

        const partner = this.sociosConfig.find(s => s.email.toLowerCase() === email.toLowerCase());
        if (!partner) return UI.showToast("Socio no encontrado", "error");

        const allTrips = this.getAllTrips();
        const hoy = new Date();
        hoy.setHours(23, 59, 59, 999);

        // Selected Month calculations
        const [ySelected, mSelected] = this.selectedSaldosMonth.split('-').map(Number);
        const startM = new Date(ySelected, mSelected - 1, 1);
        const endM = new Date(ySelected, mSelected, 0, 23, 59, 59, 999);

        // Monthly Realized margins
        const monthRealizedTrips = allTrips.filter(t => t.dateObj <= hoy && t.dateObj >= startM && t.dateObj <= endM);
        const monthUB = monthRealizedTrips.reduce((acc, t) => acc + t.margen, 0);

        // Filter month corporate expenses applying the recurrence rule
        const monthExpenses = this.corporateExpenses.filter(g => {
            const date = new Date(g.fecha);
            const isCreatedBeforeOrInMonth = date <= endM;
            const isNotDeletedOrDeletedAfterMonth = !g.deleted_at || new Date(g.deleted_at) > endM;
            
            if (!isCreatedBeforeOrInMonth || !isNotDeletedOrDeletedAfterMonth) return false;
            
            if (g.es_recurrente) return true;
            return date >= startM && date <= endM;
        });

        // Split corporate expenses of this month
        const monthFixedGC = monthExpenses.filter(g => g.es_recurrente).reduce((sum, g) => sum + g.monto, 0);
        const monthVariableGC = monthExpenses.filter(g => !g.es_recurrente).reduce((sum, g) => sum + g.monto, 0);

        // Net Profit & Reserve of the month
        let monthUN = 0;
        let monthRetencionFondo = 0;
        if (monthUB >= monthFixedGC) {
            const monthUN_Operacion = monthUB - monthFixedGC - monthVariableGC;
            monthRetencionFondo = Math.max(0, monthUN_Operacion * (this.porcentajeRetencion / 100));
            monthUN = Math.max(0, monthUN_Operacion - monthRetencionFondo);
        }

        const ganadoMonth = monthUN * (partner.porcentaje / 100);
        const reserveShareMonth = monthRetencionFondo * (partner.porcentaje / 100);
        const totalRetiradoMonth = this.movements
            .filter(m => m.socio_email.toLowerCase() === partner.email.toLowerCase() && m.fecha.substring(0, 7) === this.selectedSaldosMonth)
            .reduce((acc, m) => acc + m.monto, 0);
        
        const disponible = (ganadoMonth + reserveShareMonth) - totalRetiradoMonth;

        if (monto > disponible + 0.01) {
            return UI.showToast(`Fondos insuficientes. El socio sólo tiene disponible ${formatCOP(disponible)} en este mes.`, "error");
        }

        // Global check for float pool safety (uses global variables)
        // Historical Realized margins (global)
        const histRealizedTrips = allTrips.filter(t => t.dateObj <= hoy);
        const histUB = histRealizedTrips.reduce((acc, t) => acc + t.margen, 0);

        // Historical corporate expenses (global)
        const histGC = this.corporateExpenses
            .filter(g => g.origen_fondos === 'Utilidad de la Agencia' || (g.origen_fondos === 'Fondo Flotante' && g.estado_pago === 'pagado') || !g.origen_fondos)
            .reduce((acc, g) => acc + g.monto, 0);

        const histGC_Reserva = this.corporateExpenses
            .filter(g => g.origen_fondos === 'Fondo de Reserva')
            .reduce((acc, g) => acc + g.monto, 0);

        // Net Profit (devengado histórico total applying 10% retention)
        let histUN = 0;
        let histRetenidoFondo = 0;
        if (histUB > histGC) {
            const histUN_Operacion = histUB - histGC;
            histRetenidoFondo = histUN_Operacion * (this.porcentajeRetencion / 100);
            histUN = histUN_Operacion - histRetenidoFondo;
        }

        // Bloqueo de retiros si comprometen fondos flotantes
        const pendingFloatExpenses = (this.corporateExpenses || [])
            .filter(g => g.origen_fondos === 'Fondo Flotante' && g.estado_pago === 'pendiente')
            .reduce((sum, g) => sum + (Number(g.monto) || 0), 0);
        const totalFloatPool = (this.fondosFlotantes || [])
            .filter(f => f.estado === 'disponible')
            .reduce((sum, f) => sum + (Number(f.monto) || 0), 0) - pendingFloatExpenses;
            
        let totalSociosDisp = 0;
        this.sociosConfig.forEach(soc => {
            const ganado = histUN * (soc.porcentaje / 100);
            const reserve = histRetenidoFondo * (soc.porcentaje / 100);
            const retirado = this.movements
                .filter(m => m.socio_email.toLowerCase() === soc.email.toLowerCase())
                .reduce((acc, m) => acc + m.monto, 0);
            totalSociosDisp += ((ganado + reserve) - retirado);
        });

        let totalReservaUtilizada = 0;
        this.sociosConfig.forEach(soc => {
            const ganado = histUN * (soc.porcentaje / 100);
            const reserve = histRetenidoFondo * (soc.porcentaje / 100);
            const retirado = this.movements
                .filter(m => m.socio_email.toLowerCase() === soc.email.toLowerCase())
                .reduce((acc, m) => acc + m.monto, 0);
            
            const excess = Math.max(0, retirado - ganado);
            const reserveUsed = Math.min(reserve, excess);
            totalReservaUtilizada += reserveUsed;
        });

        const balanceF = histUB > histGC 
            ? Math.max(0, histRetenidoFondo - histGC_Reserva - totalReservaUtilizada) 
            : -(histGC - histUB);
        const cajaTeoricaPre = balanceF + totalSociosDisp;

        if (tipo === 'retiro' && (cajaTeoricaPre - monto) < totalFloatPool) {
            return UI.showToast(`Operación bloqueada: Mantener el fondo de clientes en custodia requiere un respaldo de ${formatCOP(totalFloatPool)} en caja. Caja estimada restante: ${formatCOP(cajaTeoricaPre - monto)}.`, "error");
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
        const isAdmin = rol === 'administrador' || rol === 'socio_mayoritario' || rol === 'super_administrador';

        if (!isAdmin) {
            return UI.showToast("No tienes permiso para eliminar movimientos.", "error");
        }

        const m = this.movements.find(x => x.id === id);
        const name = m ? `Retiro de Socio: ${m.concepto} (${formatCOP(m.monto)})` : 'Retiro de Socio';
        window.promptGlobalDelete(id, 'socio_movimiento', name);
    },

    async handleGastoCorpSubmit() {
        const categoria = document.getElementById('pvm-gasto-corp-categoria').value;
        const monto = UI.parseCurrency(document.getElementById('pvm-gasto-corp-monto').value) || 0;
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

        let comprobante = '';
        const file = fileInput.files[0];

        if (this.fallbackGastosActive) {
            try {
                comprobante = await this.compressFileToBase64(file);
            } catch (err) {
                console.error("Error compressing file:", err);
                if (submitBtn) {
                    submitBtn.innerHTML = originalHtml;
                    submitBtn.disabled = false;
                }
                return UI.showToast("Error al procesar la imagen del comprobante.", "error");
            }
        } else {
            try {
                const blob = await this.compressFileToBlob(file);
                comprobante = await this.uploadComprobanteStorage(blob, 'gastos_corp');
            } catch (err) {
                console.warn("Storage upload failed, falling back to Base64 database storage:", err);
                try {
                    comprobante = await this.compressFileToBase64(file);
                } catch (b64Err) {
                    console.error("Base64 compression fallback failed:", b64Err);
                    if (submitBtn) {
                        submitBtn.innerHTML = originalHtml;
                        submitBtn.disabled = false;
                    }
                    return UI.showToast("Error al procesar la imagen del comprobante.", "error");
                }
            }
        }

        const origenFondos = document.getElementById('pvm-gasto-corp-origen')?.value || 'Utilidad de la Agencia';
        const estadoPago = origenFondos === 'Fondo Flotante' ? 'pendiente' : 'pagado';
        const esRecurrente = document.getElementById('pvm-gasto-corp-es-recurrente')?.checked || false;
        const res = await this.saveCorporateExpense(concepto, categoria, monto, fecha, comprobante, origenFondos, estadoPago, esRecurrente);
        
        if (submitBtn) {
            submitBtn.innerHTML = originalHtml;
            submitBtn.disabled = false;
        }

        if (res.success) {
            UI.showToast("Gasto corporativo registrado con éxito.", "success");
            document.getElementById('pvm-gasto-corp-form').reset();
            this.clearGastoCorpPreview();
            // Restablecer el select del origen a su valor por defecto
            const selectOrigen = document.getElementById('pvm-gasto-corp-origen');
            if (selectOrigen) selectOrigen.value = 'Utilidad de la Agencia';
            
            // Set default date to today
            document.getElementById('pvm-gasto-corp-fecha').value = new Date().toISOString().substring(0, 10);
            this.calculateDistribution();
        } else {
            UI.showToast("Error al registrar gasto corporativo.", "error");
        }
    },

    async pagarDeudaGasto(id) {
        if (!confirm("¿Confirmas que deseas reembolsar esta deuda del Fondo Flotante utilizando los fondos de Utilidad de la Agencia? Esto moverá el dinero de vuelta al fondo flotante y cargará el egreso en la utilidad distribuible actual.")) return;
        
        if (this.fallbackGastosActive) {
            this.corporateExpenses = this.corporateExpenses.map(g => 
                g.id === id ? { ...g, estado_pago: 'pagado' } : g
            );
            localStorage.setItem('trv_gastos_corporativos', JSON.stringify(this.corporateExpenses));
            this.calculateDistribution();
            UI.showToast("Deuda reembolsada localmente con éxito.", "success");
        } else {
            try {
                const { error } = await supabaseClient
                    .from('gastos_corporativos')
                    .update({ estado_pago: 'pagado' })
                    .eq('id', id);
                if (error) throw error;
                await this.loadCorporateExpenses();
                this.calculateDistribution();
                UI.showToast("Deuda reembolsada y pagada con éxito en la base de datos.", "success");
            } catch (e) {
                console.error("Error al pagar deuda en Supabase:", e);
                UI.showToast("Error al liquidar la deuda en Supabase.", "error");
            }
        }
    },

    async handleDeleteGastoCorp(id) {
        const rol = window.AuthModule?.userProfile?.rol;
        const isAdmin = rol === 'administrador' || rol === 'socio_mayoritario' || rol === 'super_administrador';

        if (!isAdmin) {
            return UI.showToast("No tienes permiso para eliminar gastos corporativos.", "error");
        }

        const g = this.corporateExpenses.find(x => x.id === id);
        const name = g ? `Gasto Corporativo: ${g.concepto} (${formatCOP(g.monto)})` : 'Gasto Corporativo';
        window.promptGlobalDelete(id, 'gasto_corporativo', name);
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

    compressFileToBlob(file) {
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
                    canvas.toBlob((blob) => {
                        if (blob) {
                            resolve(blob);
                        } else {
                            reject(new Error("La compresión de la imagen falló."));
                        }
                    }, 'image/jpeg', 0.7);
                };
                img.onerror = (err) => reject(err);
            };
            reader.onerror = (err) => reject(err);
        });
    },

    async uploadComprobanteStorage(blob, folder) {
        const timestamp = Date.now();
        const rand = Math.random().toString(36).substring(2, 7);
        const filePath = `${folder}/${folder}_${timestamp}_${rand}.jpg`;

        const { data, error } = await supabaseClient.storage
            .from('comprobantes')
            .upload(filePath, blob, { cacheControl: '3600', upsert: false });

        if (error) throw error;

        const { data: urlData } = supabaseClient.storage
            .from('comprobantes')
            .getPublicUrl(filePath);

        return urlData.publicUrl;
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
    },

    // ─── ADELANTOS OPERATIVOS BUSINESS LOGIC ───────────────────
    reconciliarEstadosAdelantos() {
        if (!DataService.adelantos_operativos || DataService.adelantos_operativos.length === 0) return;

        DataService.adelantos_operativos.forEach(adv => {
            if (adv.deleted_at) return;
            // Solo auto-conciliar si está aprobado, ejecutado o ya recuperado (para auto-corregir si cambian abonos)
            if (adv.estado !== 'aprobado' && adv.estado !== 'ejecutado' && adv.estado !== 'recuperado') return;

            let totalAbonos = 0;
            if (adv.cliente_id) {
                // Relación individual (si es compartido con el grupo, consolidar abonos de todo el grupo)
                const client = DataService.clientes.find(x => x.id === adv.cliente_id);

                // Auto-corrección: Si el cliente es titular de un grupo, el adelanto no está marcado como distribuido,
                // pero el monto del adelanto supera su precio de venta individual, significa que es un adelanto
                // grupal. Lo auto-corregimos a distribuir_grupo = true en local y base de datos.
                if (client && !client.parent_id && !adv.distribuir_grupo) {
                    const companions = DataService.clientes.filter(x => x.parent_id === client.id && !x.deleted_at);
                    if (companions.length > 0 && Number(adv.monto_adelantado) > (Number(client.precio_total) || 0)) {
                        adv.distribuir_grupo = true;
                        supabaseClient.from('adelantos_operativos')
                            .update({ distribuir_grupo: true })
                            .eq('id', adv.id)
                            .then(({ error }) => {
                                if (error) console.error("Error al auto-corregir distribuir_grupo en Supabase:", error);
                            });
                    }
                }

                let clientAbonos = [];
                if (adv.distribuir_grupo && client && !client.parent_id) {
                    const companions = DataService.clientes.filter(x => x.parent_id === client.id && !x.deleted_at);
                    const groupIds = [client.id, ...companions.map(x => x.id)];
                    clientAbonos = DataService.abonos.filter(a => groupIds.includes(a.cliente_id) && a.estado_pago !== 'pending' && a.estado_pago !== 'refunded');
                } else {
                    clientAbonos = DataService.abonos.filter(a => a.cliente_id === adv.cliente_id && a.estado_pago !== 'pending' && a.estado_pago !== 'refunded');
                }
                totalAbonos = clientAbonos.reduce((s, a) => s + (Number(a.monto) || 0), 0);
            } else if (adv.plan_id && adv.fecha_viaje) {
                // Relación grupal (Salida completa)
                const groupClientes = DataService.clientes.filter(c => c.plan_id === adv.plan_id && c.fecha_viaje === adv.fecha_viaje && !['desistió', 'cancelado o devolución', 'cancelados'].includes(c.estado ? c.estado.toLowerCase() : ''));
                const groupAbonos = DataService.abonos.filter(a => groupClientes.some(c => c.id === a.cliente_id) && a.estado_pago !== 'pending' && a.estado_pago !== 'refunded');
                totalAbonos = groupAbonos.reduce((s, a) => s + (Number(a.monto) || 0), 0);
            }

            const baseCubierta = Number(adv.monto_cubierto_cliente) || 0;
            const montoAdelantado = Number(adv.monto_adelantado) || 0;
            
            // Lógica de recuperación acumulativa por abonos
            const newRecuperado = Math.max(0, Math.min(montoAdelantado, totalAbonos - baseCubierta));
            let newEstado = adv.estado;
            
            if (newRecuperado >= montoAdelantado && montoAdelantado > 0) {
                newEstado = 'recuperado';
            } else {
                if (adv.estado === 'recuperado') {
                    newEstado = adv.comprobante ? 'ejecutado' : 'aprobado';
                }
            }

            if (Number(adv.monto_recuperado) !== newRecuperado || adv.estado !== newEstado) {
                const oldEstado = adv.estado;
                const oldRec = adv.monto_recuperado;
                adv.monto_recuperado = newRecuperado;
                adv.estado = newEstado;
                
                // Actualizar en Supabase de forma asíncrona
                supabaseClient.from('adelantos_operativos')
                    .update({ monto_recuperado: newRecuperado, estado: newEstado })
                    .eq('id', adv.id)
                    .then(({ error }) => {
                        if (error) console.error("Error al auto-reconciliar adelanto:", error);
                    });
                
                // Registrar log de trazabilidad
                DataService.registrarHistorial(
                    adv.cliente_id || null,
                    'Auto-Conciliación de Adelanto',
                    `Estado: ${oldEstado} | Rec: ${formatCOP(oldRec)}`,
                    `Estado: ${newEstado} | Rec: ${formatCOP(newRecuperado)}`,
                    'SISTEMA',
                    { adelanto_id: adv.id, concepto: adv.concepto }
                );
            }
        });
    },

    renderAdelantosPanel() {
        const rol = window.AuthModule?.userProfile?.rol;
        const isAdmin = rol === 'administrador' || rol === 'socio_mayoritario' || rol === 'super_administrador';

        // 1. Cargar dropdowns del formulario
        const clientSearch = document.getElementById('pvm-adelanto-cliente-search');
        if (clientSearch) {
            clientSearch.value = '';
        }
        const clientSelect = document.getElementById('pvm-adelanto-cliente-id');
        if (clientSelect) {
            clientSelect.value = '';
        }
        const clientDropdown = document.getElementById('pvm-adelanto-cliente-dropdown');
        if (clientDropdown) {
            clientDropdown.classList.add('hidden');
        }
        const solicitadoInput = document.getElementById('pvm-adelanto-monto-solicitado');
        if (solicitadoInput) {
            solicitadoInput.value = '';
        }
        const riskWarning = document.getElementById('pvm-adelanto-risk-warning');
        if (riskWarning) {
            riskWarning.classList.add('hidden');
        }
        this.populatePassengerDropdown('');

        const planSelect = document.getElementById('pvm-adelanto-plan-id');
        if (planSelect) {
            planSelect.innerHTML = '<option value="">-- Seleccionar Plan --</option>';
            const activePlanes = DataService.planes.filter(p => !p.deleted_at);
            activePlanes.sort((a, b) => a.nombre.localeCompare(b.nombre));
            activePlanes.forEach(p => {
                planSelect.innerHTML += `<option value="${p.id}">${UI.sanitize(p.nombre)}</option>`;
            });
        }

        // Default Date
        const fechaInput = document.getElementById('pvm-adelanto-fecha');
        if (fechaInput) {
            fechaInput.value = new Date().toISOString().substring(0, 10);
        }

        // 2. Calcular KPIs
        const activeAdelantos = (DataService.adelantos_operativos || []).filter(a => !a.deleted_at);
        const transitAdelantos = activeAdelantos.filter(a => a.estado === 'ejecutado');
        const creditAdelantos = activeAdelantos.filter(a => a.estado === 'credito_proveedor');
        
        const recuperadoTotal = activeAdelantos.reduce((sum, a) => sum + (Number(a.monto_recuperado) || 0), 0);
        const totalTransito = transitAdelantos.reduce((sum, a) => sum + (Number(a.monto_adelantado) - Number(a.monto_recuperado)), 0);
        const totalVouchers = creditAdelantos.reduce((sum, a) => sum + (Number(a.monto_adelantado) - Number(a.monto_recuperado)), 0);

        // Caja Estimada
        const hoy = new Date();
        hoy.setHours(23, 59, 59, 999);
        const allTrips = this.getAllTrips();
        const histRealizedTrips = allTrips.filter(t => t.dateObj <= hoy);
        const histUB = histRealizedTrips.reduce((acc, t) => acc + t.margen, 0);
        // Historical corporate expenses (excluding reserve-funded ones and pending float-funded ones)
        const histGC = this.corporateExpenses
            .filter(g => g.origen_fondos === 'Utilidad de la Agencia' || (g.origen_fondos === 'Fondo Flotante' && g.estado_pago === 'pagado') || !g.origen_fondos)
            .reduce((acc, g) => acc + g.monto, 0);

        const histGC_Reserva = this.corporateExpenses
            .filter(g => g.origen_fondos === 'Fondo de Reserva')
            .reduce((acc, g) => acc + g.monto, 0);
        
        let histUN = 0;
        let histRetenidoFondo = 0;
        if (histUB > histGC) {
            const histUN_Operacion = histUB - histGC;
            histRetenidoFondo = histUN_Operacion * (this.porcentajeRetencion / 100);
            histUN = histUN_Operacion - histRetenidoFondo;
        }

        let totalSociosDisponible = 0;
        this.sociosConfig.forEach(soc => {
            const ganadoHistorico = histUN * (soc.porcentaje / 100);
            const reserveShare = histRetenidoFondo * (soc.porcentaje / 100);
            const totalRetirado = this.movements
                .filter(m => m.socio_email.toLowerCase() === soc.email.toLowerCase())
                .reduce((acc, m) => acc + m.monto, 0);
            // Disponible includes the 90% earned + the 10% reserve fund share to buffer deficits
            totalSociosDisponible += ((ganadoHistorico + reserveShare) - totalRetirado);
        });

        let totalReservaUtilizada = 0;
        this.sociosConfig.forEach(soc => {
            const ganado = histUN * (soc.porcentaje / 100);
            const reserve = histRetenidoFondo * (soc.porcentaje / 100);
            const retirado = this.movements
                .filter(m => m.socio_email.toLowerCase() === soc.email.toLowerCase())
                .reduce((acc, m) => acc + m.monto, 0);
            
            const excess = Math.max(0, retirado - ganado);
            const reserveUsed = Math.min(reserve, excess);
            totalReservaUtilizada += reserveUsed;
        });

        const balanceFondo = histUB > histGC 
            ? Math.max(0, histRetenidoFondo - histGC_Reserva - totalReservaUtilizada) 
            : -(histGC - histUB);

        const pendingFloatExpenses = (this.corporateExpenses || [])
            .filter(g => g.origen_fondos === 'Fondo Flotante' && g.estado_pago === 'pendiente')
            .reduce((sum, g) => sum + (Number(g.monto) || 0), 0);

        // Sumar fondos flotantes activos a la caja teórica
        const totalFloatPool = (this.fondosFlotantes || [])
            .filter(f => f.estado === 'disponible')
            .reduce((sum, f) => sum + (Number(f.monto) || 0), 0) - pendingFloatExpenses;

        // Calcular egresos de caja por pagos realizados a proveedores para viajes futuros
        const totalPagosFuturos = (DataService.proveedores_pagos_salidas || [])
            .filter(p => {
                if (p.deleted_at) return false;
                let d = null;
                if (p.fecha_viaje) {
                    const parts = p.fecha_viaje.split(/\s+al\s+/i);
                    const parseStr = parts.length === 2 ? parts[1].trim() : p.fecha_viaje;
                    d = parseSpanishDate(parseStr);
                }
                return d && d > hoy;
            })
            .reduce((sum, p) => sum + parseFloat(p.monto || 0), 0);

        const cajaTeorica = balanceFondo + totalSociosDisponible + totalFloatPool - totalPagosFuturos;
        const liquidezLibre = cajaTeorica - totalTransito - totalVouchers;

        // Render KPI Texts
        if (document.getElementById('pvm-adelantos-kpi-liquidez')) {
            document.getElementById('pvm-adelantos-kpi-liquidez').innerText = isAdmin ? formatCOP(liquidezLibre) : '***';
        }
        if (document.getElementById('pvm-adelantos-kpi-transito')) {
            document.getElementById('pvm-adelantos-kpi-transito').innerText = isAdmin ? formatCOP(totalTransito) : '***';
        }
        if (document.getElementById('pvm-adelantos-kpi-vouchers')) {
            document.getElementById('pvm-adelantos-kpi-vouchers').innerText = isAdmin ? formatCOP(totalVouchers) : '***';
        }
        if (document.getElementById('pvm-adelantos-kpi-recuperado')) {
            document.getElementById('pvm-adelantos-kpi-recuperado').innerText = isAdmin ? formatCOP(recuperadoTotal) : '***';
        }

        // 3. Alertas de Riesgo
        const riskAlert = document.getElementById('pvm-adelantos-risk-alert');
        if (riskAlert) {
            if (isAdmin && totalTransito > 10000000) {
                riskAlert.classList.remove('hidden');
            } else {
                riskAlert.classList.add('hidden');
            }
        }

        const liquidezAlert = document.getElementById('pvm-adelantos-liquidez-alert');
        const saveAdelantoBtn = document.getElementById('pvm-btn-save-adelanto');
        if (liquidezAlert) {
            if (liquidezLibre < 1000000) {
                liquidezAlert.classList.remove('hidden');
                if (saveAdelantoBtn && !isAdmin) {
                    saveAdelantoBtn.disabled = true;
                    saveAdelantoBtn.classList.add('opacity-50', 'cursor-not-allowed');
                }
            } else {
                liquidezAlert.classList.add('hidden');
                if (saveAdelantoBtn) {
                    saveAdelantoBtn.disabled = false;
                    saveAdelantoBtn.classList.remove('opacity-50', 'cursor-not-allowed');
                }
            }
        }

        // 4. Renderizar Listado
        this.renderAdelantosList();
    },

    populatePassengerDropdown(filterText = '') {
        const clientSelect = document.getElementById('pvm-adelanto-cliente-id');
        const dropdown = document.getElementById('pvm-adelanto-cliente-dropdown');
        if (!clientSelect || !dropdown) return;

        // Clear dropdown
        dropdown.innerHTML = '';

        const activeClients = DataService.clientes.filter(c => !c.deleted_at);
        const normalizedFilter = filterText.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

        let matches = [];

        activeClients.forEach(c => {
            const plan = DataService.planes.find(p => p.id === c.plan_id);
            const planNom = plan ? plan.nombre : 'Plan Genérico';
            const planNomLower = planNom.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            
            let score = 0;
            if (normalizedFilter) {
                score = this.getPassengerMatchScore(c, normalizedFilter, planNomLower);
                if (score === -1) return; // Exclude
            }
            
            matches.push({ client: c, planNom, score });
        });

        // Sort: score ascending (priority), then alphabetically by full name
        matches.sort((a, b) => {
            if (a.score !== b.score) {
                return a.score - b.score;
            }
            const nameA = `${a.client.nombre} ${a.client.apellido || ''}`.trim();
            const nameB = `${b.client.nombre} ${b.client.apellido || ''}`.trim();
            return nameA.localeCompare(nameB);
        });

        // Populate hidden select options only when filterText is empty (panel open / initialization)
        if (filterText === '') {
            const fragment = document.createDocumentFragment();
            const defOpt = document.createElement('option');
            defOpt.value = '';
            defOpt.textContent = '-- Seleccionar Pasajero --';
            fragment.appendChild(defOpt);
            
            activeClients.forEach(c => {
                const plan = DataService.planes.find(p => p.id === c.plan_id);
                const planNom = plan ? plan.nombre : 'Plan Genérico';
                const option = document.createElement('option');
                option.value = c.id;
                option.textContent = `${c.nombre} ${c.apellido || ''} - ${planNom} (${c.fecha_viaje})`;
                fragment.appendChild(option);
            });
            clientSelect.innerHTML = '';
            clientSelect.appendChild(fragment);
        }

        const visibleMatches = matches.slice(0, 15);

        if (visibleMatches.length === 0) {
            dropdown.innerHTML = `
                <div class="px-3 py-3 text-xs text-slate-400 font-bold text-center uppercase tracking-wider">
                    No se encontraron resultados
                </div>
            `;
        } else {
            const fragment = document.createDocumentFragment();
            visibleMatches.forEach(m => {
                const c = m.client;
                const opt = document.createElement('div');
                opt.className = 'w-full text-left px-3.5 py-2.5 text-xs hover:bg-slate-50 transition-colors cursor-pointer border-b border-slate-50 last:border-0 flex flex-col gap-0.5';
                opt.innerHTML = `
                    <span class="font-black text-slate-800">${UI.sanitize(c.nombre)} ${UI.sanitize(c.apellido)}</span>
                    <span class="text-[9px] font-bold text-slate-400 uppercase tracking-wide truncate">${UI.sanitize(m.planNom)} (${c.fecha_viaje})</span>
                `;
                opt.addEventListener('click', () => {
                    this.selectPassenger(c.id, `${c.nombre} ${c.apellido} - ${m.planNom} (${c.fecha_viaje})`);
                });
                fragment.appendChild(opt);
            });
            dropdown.appendChild(fragment);
        }
    },

    getPassengerMatchScore(c, queryNormalized, planNomNormalized) {
        if (!queryNormalized) return 0;
        
        const nombreWords = c.nombre.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/\s+/);
        const apellidoWords = (c.apellido || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/\s+/);
        
        if (nombreWords[0] && nombreWords[0].startsWith(queryNormalized)) return 1;
        
        for (let i = 1; i < nombreWords.length; i++) {
            if (nombreWords[i] && nombreWords[i].startsWith(queryNormalized)) return 2;
        }
        
        if (apellidoWords[0] && apellidoWords[0].startsWith(queryNormalized)) return 3;
        
        for (let i = 1; i < apellidoWords.length; i++) {
            if (apellidoWords[i] && apellidoWords[i].startsWith(queryNormalized)) return 4;
        }
        
        const fullName = `${c.nombre} ${c.apellido || ''}`.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        if (fullName.includes(queryNormalized)) return 5;
        
        if (planNomNormalized && planNomNormalized.includes(queryNormalized)) return 6;
        if (c.fecha_viaje && c.fecha_viaje.includes(queryNormalized)) return 7;
        
        return -1;
    },

    selectPassenger(id, nameText) {
        const clientSelect = document.getElementById('pvm-adelanto-cliente-id');
        const clientSearch = document.getElementById('pvm-adelanto-cliente-search');
        const dropdown = document.getElementById('pvm-adelanto-cliente-dropdown');

        if (clientSelect) {
            clientSelect.value = id;
            const event = new Event('change', { bubbles: true });
            clientSelect.dispatchEvent(event);
        }

        if (clientSearch) {
            clientSearch.value = nameText;
        }

        if (dropdown) {
            dropdown.classList.add('hidden');
        }

        // Show/hide group distribution checkbox if the selected client is a titular with companions
        const c = DataService.clientes.find(x => x.id === id);
        const checkboxContainer = document.getElementById('pvm-adelanto-distribuir-grupo-container');
        const checkboxInput = document.getElementById('pvm-adelanto-distribuir-grupo');
        if (c && !c.parent_id && checkboxContainer && checkboxInput) {
            const companions = DataService.clientes.filter(x => x.parent_id === c.id && !x.deleted_at);
            if (companions.length > 0) {
                checkboxContainer.classList.remove('hidden');
                checkboxInput.checked = true; // Default to checked for group members
            } else {
                checkboxContainer.classList.add('hidden');
                checkboxInput.checked = false;
            }
        } else if (checkboxContainer && checkboxInput) {
            checkboxContainer.classList.add('hidden');
            checkboxInput.checked = false;
        }
    },

    renderAdelantosList() {
        const rol = window.AuthModule?.userProfile?.rol;
        const isAdmin = rol === 'administrador' || rol === 'socio_mayoritario' || rol === 'super_administrador';
        const userEmail = (window.AuthModule?.currentUser?.email || '').toLowerCase();

        const filtroEstado = document.getElementById('pvm-adelantos-filtro-estado')?.value || 'todos';
        let filtered = (DataService.adelantos_operativos || []).filter(a => !a.deleted_at);

        if (filtroEstado !== 'todos') {
            filtered = filtered.filter(a => a.estado === filtroEstado);
        }

        const countEl = document.getElementById('pvm-adelantos-count');
        if (countEl) countEl.innerText = `${filtered.length} Adelantos`;

        const tb = document.getElementById('pvm-adelantos-list');
        const emptyState = document.getElementById('pvm-adelantos-empty');

        if (!tb || !emptyState) return;

        tb.innerHTML = '';

        if (filtered.length === 0) {
            emptyState.classList.remove('hidden');
            tb.parentElement.classList.add('hidden');
        } else {
            emptyState.classList.add('hidden');
            tb.parentElement.classList.remove('hidden');

            filtered.forEach(adv => {
                // Relación text description
                let relacionHtml = '';
                if (adv.cliente_id) {
                    const c = DataService.clientes.find(x => x.id === adv.cliente_id);
                    let groupInfo = '';
                    if (c && !c.parent_id) {
                        const comps = DataService.clientes.filter(x => x.parent_id === c.id && !x.deleted_at);
                        if (comps.length > 0) {
                            groupInfo = adv.distribuir_grupo 
                                ? `<br><span class="text-[8px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.2 rounded border border-emerald-200">Grupo Compartido</span>` 
                                : `<br><span class="text-[8px] bg-slate-100 text-slate-600 font-bold px-1.5 py-0.2 rounded border border-slate-200">Solo Titular</span>`;
                        }
                    }
                    relacionHtml = c ? `<span class="font-black text-slate-800">${UI.sanitize(c.nombre)} ${UI.sanitize(c.apellido)}</span>${groupInfo}<br><span class="text-[8px] text-slate-400 font-bold uppercase tracking-wider">Pasajero</span>` : '<span class="text-slate-400">Cliente Eliminado</span>';
                } else if (adv.plan_id && adv.fecha_viaje) {
                    const p = DataService.planes.find(x => x.id === adv.plan_id);
                    relacionHtml = p ? `<span class="font-black text-indigo-700">👥 Grupal: ${UI.sanitize(p.nombre)}</span><br><span class="text-[8px] text-slate-400 font-bold uppercase tracking-wider">${UI.sanitize(adv.fecha_viaje)}</span>` : '<span class="text-slate-400">Plan Eliminado</span>';
                } else {
                    relacionHtml = '<span class="text-slate-400">Genérico</span>';
                }

                // Badges de estado
                let badgeClass = '';
                let badgeText = '';
                if (adv.estado === 'solicitado') {
                    badgeClass = 'bg-slate-100 text-slate-700 border-slate-200';
                    badgeText = 'Solicitado';
                } else if (adv.estado === 'aprobado') {
                    badgeClass = 'bg-indigo-50 text-indigo-700 border-indigo-100/50';
                    badgeText = 'Aprobado';
                } else if (adv.estado === 'ejecutado') {
                    badgeClass = 'bg-amber-50 text-amber-700 border-amber-100/50';
                    badgeText = 'En Tránsito';
                } else if (adv.estado === 'recuperado') {
                    badgeClass = 'bg-emerald-50 text-emerald-700 border-emerald-100/50';
                    badgeText = 'Recuperado';
                } else if (adv.estado === 'perdido') {
                    badgeClass = 'bg-rose-50 text-rose-700 border-rose-100/50';
                    badgeText = 'Perdido';
                } else if (adv.estado === 'credito_proveedor') {
                    badgeClass = 'bg-sky-50 text-sky-700 border-sky-100/50';
                    badgeText = 'Voucher Prov';
                }

                const badgeHtml = `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black border uppercase tracking-wider ${badgeClass}">${badgeText}</span>`;

                // Comprobante
                const supportHtml = adv.comprobante 
                    ? `<button type="button" data-action="open-lightbox" data-url="${adv.comprobante}" class="text-indigo-500 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-2 py-0.5 rounded text-[10px] font-bold inline-flex items-center gap-1 transition-all" title="Ver comprobante"><i class="ph ph-image text-xs"></i> Ver</button>`
                    : `<span class="text-slate-300 text-[10px]">Sin soporte</span>`;

                // Acciones
                let actionsHtml = '';
                const isMyRequest = adv.solicitado_por.toLowerCase() === userEmail;

                if (isAdmin) {
                    if (adv.estado === 'solicitado') {
                        actionsHtml = `
                            <button type="button" data-action="pvm-approve-adelanto" data-id="${adv.id}" class="text-emerald-600 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border border-emerald-100">Aprobar</button>
                            <button type="button" data-action="pvm-execute-adelanto" data-id="${adv.id}" class="text-amber-600 hover:text-amber-800 bg-amber-50 hover:bg-amber-100 px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border border-amber-100">Pagar</button>
                        `;
                    } else if (adv.estado === 'aprobado') {
                        actionsHtml = `
                            <button type="button" data-action="pvm-execute-adelanto" data-id="${adv.id}" class="text-amber-600 hover:text-amber-800 bg-amber-50 hover:bg-amber-100 px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border border-amber-100">Pagar</button>
                        `;
                    } else if (adv.estado === 'ejecutado') {
                        actionsHtml = `
                            <button type="button" data-action="pvm-lost-adelanto" data-id="${adv.id}" class="text-rose-600 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border border-rose-100">Perdido</button>
                            <button type="button" data-action="pvm-credit-adelanto" data-id="${adv.id}" class="text-sky-600 hover:text-sky-800 bg-sky-50 hover:bg-sky-100 px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border border-sky-100">Voucher</button>
                        `;
                    } else if (adv.estado === 'credito_proveedor') {
                        actionsHtml = `
                            <button type="button" data-action="pvm-pend-adelanto" data-id="${adv.id}" class="text-slate-600 hover:text-slate-800 bg-slate-50 hover:bg-slate-100 px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border border-slate-200">En Tránsito</button>
                        `;
                    } else if (adv.estado === 'perdido') {
                        actionsHtml = `
                            <button type="button" data-action="pvm-pend-adelanto" data-id="${adv.id}" class="text-slate-600 hover:text-slate-800 bg-slate-50 hover:bg-slate-100 px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border border-slate-200">Re-activar</button>
                        `;
                    }
                    
                    // Admin delete button
                    actionsHtml += `<button type="button" data-action="pvm-delete-adelanto" data-id="${adv.id}" class="text-red-400 hover:text-red-600 transition-colors p-1" title="Eliminar registro"><i class="ph ph-trash"></i></button>`;
                } else {
                    // Si es asesor y fue su solicitud en estado solicitado, puede borrarla/cancelarla
                    if (adv.estado === 'solicitado' && isMyRequest) {
                        actionsHtml = `<button type="button" data-action="pvm-delete-adelanto" data-id="${adv.id}" class="text-red-400 hover:text-red-600 transition-colors p-1" title="Cancelar solicitud"><i class="ph ph-trash"></i></button>`;
                    } else {
                        actionsHtml = `<span class="text-slate-300 text-[10px]">Sin acciones</span>`;
                    }
                }

                tb.innerHTML += `
                    <tr class="hover:bg-slate-50 transition-colors">
                        <td class="py-2 px-3 whitespace-nowrap text-[11px] font-medium text-slate-500">${formatShortDate(adv.fecha)}</td>
                        <td class="py-2 px-3 text-[11px] leading-tight min-w-[220px]">${relacionHtml}</td>
                        <td class="py-2 px-3 text-[11px] text-slate-600 max-w-[280px] xl:max-w-[350px] truncate" title="${UI.sanitize(adv.concepto)}">
                            <span class="font-black text-slate-800 uppercase tracking-widest text-[8px] bg-slate-100 px-1 py-0.5 rounded mr-1">${UI.sanitize(adv.tipo_servicio)}</span>
                            ${UI.sanitize(adv.concepto)}
                        </td>
                        <td class="py-2 px-3 whitespace-nowrap text-right text-[11px] font-black text-slate-800">${formatCOP(adv.monto_adelantado)}</td>
                        <td class="py-2 px-3 whitespace-nowrap text-right text-[11px] font-semibold text-emerald-600">${formatCOP(adv.monto_recuperado)}</td>
                        <td class="py-2 px-3 whitespace-nowrap text-center">${badgeHtml}</td>
                        <td class="py-2 px-3 whitespace-nowrap text-center">${supportHtml}</td>
                        <td class="py-2 px-3 whitespace-nowrap text-center flex items-center justify-center gap-1.5">${actionsHtml}</td>
                    </tr>
                `;
            });
        }
    },

    async handleAdelantoSubmit() {
        const tipoRelacion = document.getElementById('pvm-adelanto-tipo-relacion').value;
        const clienteId = document.getElementById('pvm-adelanto-cliente-id').value;
        const planId = document.getElementById('pvm-adelanto-plan-id').value;
        const fechaViaje = document.getElementById('pvm-adelanto-fecha-viaje').value;

        const tipoServicio = document.getElementById('pvm-adelanto-tipo-servicio').value;
        const concepto = document.getElementById('pvm-adelanto-concepto').value.trim();
        const totalServicio = UI.parseCurrency(document.getElementById('pvm-adelanto-monto-total').value) || 0;
        const cubiertoCliente = UI.parseCurrency(document.getElementById('pvm-adelanto-monto-cubierto').value) || 0;
        
        const fecha = document.getElementById('pvm-adelanto-fecha').value;
        const metodoPago = document.getElementById('pvm-adelanto-metodo').value.trim();
        const fileInput = document.getElementById('pvm-adelanto-comprobante');

        if (!concepto) {
            return UI.showToast("La descripción del servicio es obligatoria.", "error");
        }
        if (totalServicio <= 0) {
            return UI.showToast("El costo total del servicio debe ser mayor a cero.", "error");
        }
        if (totalServicio < cubiertoCliente) {
            return UI.showToast("El costo total del servicio no puede ser menor a la cantidad cubierta por el cliente.", "error");
        }

        if (tipoRelacion === 'individual' && !clienteId) {
            return UI.showToast("Debe seleccionar un pasajero para este adelanto individual.", "error");
        }
        if (tipoRelacion === 'grupal' && (!planId || !fechaViaje)) {
            return UI.showToast("Debe seleccionar el plan y la fecha de salida para este adelanto grupal.", "error");
        }

        const montoAdelantado = UI.parseCurrency(document.getElementById('pvm-adelanto-monto-solicitado').value) || 0;
        if (montoAdelantado <= 0) {
            return UI.showToast("El monto a financiar debe ser mayor a cero.", "error");
        }
        if (montoAdelantado > (totalServicio - cubiertoCliente)) {
            return UI.showToast("El monto a financiar no puede ser mayor a la diferencia (Costo Total - Cubierto Cliente).", "error");
        }
        const userEmail = (window.AuthModule?.currentUser?.email || '').toLowerCase();
        const rol = window.AuthModule?.userProfile?.rol;
        const isAdmin = rol === 'administrador' || rol === 'socio_mayoritario' || rol === 'super_administrador';

        // Flujo inicial: si lo hace admin, puede registrarlo directamente ejecutado. Si es asesor, se registra como solicitado.
        const targetEstado = isAdmin ? (fileInput.files.length > 0 ? 'ejecutado' : 'aprobado') : 'solicitado';

        const submitBtn = document.getElementById('pvm-btn-save-adelanto');
        const originalHtml = submitBtn ? submitBtn.innerHTML : 'Registrar Adelanto';
        if (submitBtn) {
            submitBtn.innerHTML = '<i class="ph ph-spinner animate-spin text-xs"></i> Guardando...';
            submitBtn.disabled = true;
        }

        let comprobante = null;
        if (fileInput.files && fileInput.files.length > 0) {
            const file = fileInput.files[0];
            try {
                const blob = await this.compressFileToBlob(file);
                comprobante = await this.uploadComprobanteStorage(blob, 'adelantos');
            } catch (err) {
                console.warn("Storage upload failed, falling back to Base64 database storage:", err);
                try {
                    comprobante = await this.compressFileToBase64(file);
                } catch (b64Err) {
                    console.error("Base64 compression fallback failed:", b64Err);
                    if (submitBtn) {
                        submitBtn.innerHTML = originalHtml;
                        submitBtn.disabled = false;
                    }
                    return UI.showToast("Error al procesar la imagen del soporte.", "error");
                }
            }
        }

        const distribuirGrupoEl = document.getElementById('pvm-adelanto-distribuir-grupo');
        const distribuirGrupo = distribuirGrupoEl ? distribuirGrupoEl.checked : false;

        const payload = {
            cliente_id: tipoRelacion === 'individual' ? clienteId : null,
            plan_id: tipoRelacion === 'grupal' ? planId : null,
            fecha_viaje: tipoRelacion === 'grupal' ? fechaViaje : null,
            concepto,
            tipo_servicio: tipoServicio,
            monto_total_servicio: totalServicio,
            monto_cubierto_cliente: cubiertoCliente,
            monto_adelantado: montoAdelantado,
            monto_recuperado: 0,
            fecha,
            metodo_pago: targetEstado === 'ejecutado' ? metodoPago : null,
            comprobante: targetEstado === 'ejecutado' ? comprobante : null,
            estado: targetEstado,
            solicitado_por: userEmail,
            aprobado_por: targetEstado !== 'solicitado' ? userEmail : null,
            fecha_ejecucion: targetEstado === 'ejecutado' ? fecha : null,
            distribuir_grupo: tipoRelacion === 'individual' ? distribuirGrupo : false
        };

        try {
            let data = null;
            let insertRes = await supabaseClient.from('adelantos_operativos').insert([payload]).select();
            if (insertRes.error) {
                // Fallback robusto si la columna distribuir_grupo no existe aún en la base de datos del usuario
                if (insertRes.error.code === 'PGRST204' || (insertRes.error.message && insertRes.error.message.includes('distribuir_grupo'))) {
                    console.warn("La columna 'distribuir_grupo' no existe en la tabla 'adelantos_operativos'. Reintentando inserción omitiendo esta propiedad...");
                    const fallbackPayload = { ...payload };
                    delete fallbackPayload.distribuir_grupo;
                    const retryRes = await supabaseClient.from('adelantos_operativos').insert([fallbackPayload]).select();
                    if (retryRes.error) throw retryRes.error;
                    data = retryRes.data;
                } else {
                    throw insertRes.error;
                }
            } else {
                data = insertRes.data;
            }

            UI.showToast(isAdmin ? "Adelanto operativo registrado con éxito." : "Solicitud de adelanto enviada correctamente.", "success");
            
            // Recargar datos locales
            if (DataService.adelantos_operativos) {
                if (data && data.length > 0) DataService.adelantos_operativos.unshift(data[0]);
                else await DataService.loadAll();
            }

            // Limpiar formulario
            document.getElementById('pvm-adelanto-form').reset();
            const clientSearch = document.getElementById('pvm-adelanto-cliente-search');
            if (clientSearch) clientSearch.value = '';
            const clientDropdown = document.getElementById('pvm-adelanto-cliente-dropdown');
            if (clientDropdown) clientDropdown.classList.add('hidden');
            this.populatePassengerDropdown('');
            this.clearAdelantoPreview();
            this.currentAdelantoDistribute = false;
            const checkboxContainer = document.getElementById('pvm-adelanto-distribuir-grupo-container');
            const checkboxInput = document.getElementById('pvm-adelanto-distribuir-grupo');
            if (checkboxContainer) checkboxContainer.classList.add('hidden');
            if (checkboxInput) checkboxInput.checked = false;
            
            // Recalcular finanzas y UI
            this.calculateDistribution();
        } catch (e) {
            console.error("Error saving operational advance:", e);
            UI.showToast("Error al guardar el adelanto operativo.", "error");
        } finally {
            if (submitBtn) {
                submitBtn.innerHTML = originalHtml;
                submitBtn.disabled = false;
            }
        }
    },

    openEjecutarModal(id) {
        const adv = DataService.adelantos_operativos.find(a => a.id === id);
        if (!adv) return;

        document.getElementById('pvm-ejec-id').value = id;
        document.getElementById('pvm-ejec-concepto').value = adv.concepto;
        document.getElementById('pvm-ejec-monto').value = formatCOP(adv.monto_adelantado);
        document.getElementById('pvm-ejec-metodo').value = '';
        this.clearEjecutarPreview();

        UI.openModal('pvm-ejecutar-modal', 'pvm-ejec-bg', 'pvm-ejec-content');
    },

    async handleEjecutarSubmit() {
        const id = document.getElementById('pvm-ejec-id').value;
        const metodo = document.getElementById('pvm-ejec-metodo').value.trim();
        const fileInput = document.getElementById('pvm-ejec-comprobante');

        if (!metodo) {
            return UI.showToast("El método de pago es obligatorio.", "error");
        }
        if (!fileInput.files || fileInput.files.length === 0) {
            return UI.showToast("Debe subir un comprobante físico o captura del pago.", "error");
        }

        const userEmail = (window.AuthModule?.currentUser?.email || '').toLowerCase();
        const today = new Date().toISOString().substring(0, 10);

        let comprobante = '';
        const file = fileInput.files[0];
        try {
            const blob = await this.compressFileToBlob(file);
            comprobante = await this.uploadComprobanteStorage(blob, 'adelantos');
        } catch (err) {
            console.warn("Storage upload failed, falling back to Base64 database storage:", err);
            try {
                comprobante = await this.compressFileToBase64(file);
            } catch (b64Err) {
                console.error("Base64 compression fallback failed:", b64Err);
                return UI.showToast("Error al procesar la imagen del soporte.", "error");
            }
        }

        try {
            const { error } = await supabaseClient.from('adelantos_operativos').update({
                metodo_pago: metodo,
                comprobante: comprobante,
                estado: 'ejecutado',
                aprobado_por: userEmail,
                fecha_ejecucion: today
            }).eq('id', id);

            if (error) throw error;

            UI.showToast("Desembolso ejecutado y registrado exitosamente.", "success");
            UI.closeModal('pvm-ejecutar-modal', 'pvm-ejec-bg', 'pvm-ejec-content');

            // Actualizar localmente
            const localAdv = DataService.adelantos_operativos.find(a => a.id === id);
            if (localAdv) {
                localAdv.metodo_pago = metodo;
                localAdv.comprobante = comprobante;
                localAdv.estado = 'ejecutado';
                localAdv.aprobado_por = userEmail;
                localAdv.fecha_ejecucion = today;
            }

            this.calculateDistribution();
        } catch (e) {
            console.error("Error executing operational advance:", e);
            UI.showToast("Error al ejecutar el desembolso.", "error");
        }
    },

    async handleAdelantoStatusChange(id, nextStatus) {
        const userEmail = (window.AuthModule?.currentUser?.email || '').toLowerCase();
        const updates = { estado: nextStatus };

        if (nextStatus === 'aprobado') {
            updates.aprobado_por = userEmail;
        }

        try {
            const { error } = await supabaseClient.from('adelantos_operativos').update(updates).eq('id', id);
            if (error) throw error;

            UI.showToast(`Estado del adelanto cambiado a "${nextStatus}" con éxito.`, "success");

            // Modificar localmente
            const localAdv = DataService.adelantos_operativos.find(a => a.id === id);
            if (localAdv) {
                localAdv.estado = nextStatus;
                if (nextStatus === 'aprobado') localAdv.aprobado_por = userEmail;
            }

            this.calculateDistribution();
        } catch (e) {
            console.error("Error changing operational advance status:", e);
            UI.showToast("Error al modificar el estado.", "error");
        }
    },

    async handleDeleteAdelanto(id) {
        const userEmail = (window.AuthModule?.currentUser?.email || '').toLowerCase();
        try {
            const { error } = await supabaseClient.from('adelantos_operativos').update({
                deleted_at: new Date().toISOString(),
                deleted_by: userEmail
            }).eq('id', id);

            if (error) throw error;

            UI.showToast("Registro de adelanto eliminado correctamente.", "success");

            // Quitar de local
            DataService.adelantos_operativos = DataService.adelantos_operativos.filter(a => a.id !== id);

            this.calculateDistribution();
        } catch (e) {
            console.error("Error deleting operational advance:", e);
            UI.showToast("Error al eliminar el registro.", "error");
        }
    },

    clearAdelantoPreview() {
        const previewContainer = document.getElementById('pvm-adelanto-preview-container');
        const previewImg = document.getElementById('pvm-adelanto-preview');
        const previewName = document.getElementById('pvm-adelanto-preview-name');
        const fileNameLabel = document.getElementById('pvm-adelanto-file-name');
        const fileInput = document.getElementById('pvm-adelanto-comprobante');

        if (fileInput) fileInput.value = '';
        if (previewContainer) previewContainer.classList.add('hidden');
        if (previewImg) previewImg.src = '';
        if (previewName) previewName.innerText = '';
        if (fileNameLabel) fileNameLabel.innerText = 'Adjuntar Comprobante';
    },

    clearEjecutarPreview() {
        const previewContainer = document.getElementById('pvm-ejec-preview-container');
        const previewImg = document.getElementById('pvm-ejec-preview');
        const previewName = document.getElementById('pvm-ejec-preview-name');
        const fileNameLabel = document.getElementById('pvm-ejec-file-name');
        const fileInput = document.getElementById('pvm-ejec-comprobante');

        if (fileInput) fileInput.value = '';
        if (previewContainer) previewContainer.classList.add('hidden');
        if (previewImg) previewImg.src = '';
        if (previewName) previewName.innerText = '';
        if (fileNameLabel) fileNameLabel.innerText = 'Adjuntar Comprobante';
    },

    // DATABASE FONDOS FLOTANTES
    async loadFondosFlotantes() {
        try {
            const { data, error } = await supabaseClient
                .from('fondos_flotantes')
                .select('*')
                .is('deleted_at', null)
                .order('fecha_registro', { ascending: false });
            if (error) throw error;
            this.fondosFlotantes = data || [];
            this.fallbackFondosActive = false;
        } catch (e) {
            console.warn('Supabase fallback for fondos flotantes:', e);
            const local = localStorage.getItem('trv_fondos_flotantes');
            this.fondosFlotantes = local ? JSON.parse(local) : [];
            this.fallbackFondosActive = true;
        }
    },

    async saveFondoFlotante(clienteNombre, planNombre, monto, fechaRegistro, fechaLimite, estado = 'disponible') {
        const userEmail = window.AuthModule?.currentUser?.email || 'unknown@travelers.com';
        const newFondo = {
            id: crypto.randomUUID ? crypto.randomUUID() : (Math.random().toString(36).substring(2) + Date.now().toString(36)),
            cliente_nombre: clienteNombre,
            plan_nombre: planNombre,
            monto: Number(monto),
            fecha_registro: fechaRegistro,
            fecha_limite: fechaLimite,
            estado,
            usuario_email: userEmail,
            created_at: new Date().toISOString()
        };

        if (this.fallbackFondosActive) {
            this.fondosFlotantes.unshift(newFondo);
            localStorage.setItem('trv_fondos_flotantes', JSON.stringify(this.fondosFlotantes));
            return { success: true };
        } else {
            try {
                const row = { ...newFondo };
                delete row.id;
                const { error } = await supabaseClient
                    .from('fondos_flotantes')
                    .insert([row]);
                if (error) throw error;
                await this.loadFondosFlotantes();
                return { success: true };
            } catch (e) {
                console.error('Error saving fondo flotante to Supabase, saving to local instead:', e);
                this.fallbackFondosActive = true;
                this.fondosFlotantes.unshift(newFondo);
                localStorage.setItem('trv_fondos_flotantes', JSON.stringify(this.fondosFlotantes));
                return { success: true, fallback: true };
            }
        }
    },

    async updateFondoFlotante(id, clienteNombre, planNombre, monto, fechaRegistro, fechaLimite, estado) {
        if (this.fallbackFondosActive) {
            this.fondosFlotantes = this.fondosFlotantes.map(f => f.id === id ? {
                ...f,
                cliente_nombre: clienteNombre,
                plan_nombre: planNombre,
                monto: Number(monto),
                fecha_registro: fechaRegistro,
                fecha_limite: fechaLimite,
                estado
            } : f);
            localStorage.setItem('trv_fondos_flotantes', JSON.stringify(this.fondosFlotantes));
            return { success: true };
        } else {
            try {
                const { error } = await supabaseClient
                    .from('fondos_flotantes')
                    .update({
                        cliente_nombre: clienteNombre,
                        plan_nombre: planNombre,
                        monto: Number(monto),
                        fecha_registro: fechaRegistro,
                        fecha_limite: fechaLimite,
                        estado
                    })
                    .eq('id', id);
                if (error) throw error;
                await this.loadFondosFlotantes();
                return { success: true };
            } catch (e) {
                console.error('Error updating fondo flotante in Supabase, updating local instead:', e);
                this.fondosFlotantes = this.fondosFlotantes.map(f => f.id === id ? {
                    ...f,
                    cliente_nombre: clienteNombre,
                    plan_nombre: planNombre,
                    monto: Number(monto),
                    fecha_registro: fechaRegistro,
                    fecha_limite: fechaLimite,
                    estado
                } : f);
                localStorage.setItem('trv_fondos_flotantes', JSON.stringify(this.fondosFlotantes));
                return { success: true };
            }
        }
    },

    async releaseFondoFlotante(id) {
        if (this.fallbackFondosActive) {
            this.fondosFlotantes = this.fondosFlotantes.map(f => f.id === id ? { ...f, estado: 'aplicado_reserva' } : f);
            localStorage.setItem('trv_fondos_flotantes', JSON.stringify(this.fondosFlotantes));
            return { success: true };
        } else {
            try {
                const { error } = await supabaseClient
                    .from('fondos_flotantes')
                    .update({ estado: 'aplicado_reserva' })
                    .eq('id', id);
                if (error) throw error;
                await this.loadFondosFlotantes();
                return { success: true };
            } catch (e) {
                console.error('Error releasing fondo flotante in Supabase, updating local instead:', e);
                this.fondosFlotantes = this.fondosFlotantes.map(f => f.id === id ? { ...f, estado: 'aplicado_reserva' } : f);
                localStorage.setItem('trv_fondos_flotantes', JSON.stringify(this.fondosFlotantes));
                return { success: true };
            }
        }
    },

    async deleteFondoFlotante(id) {
        if (this.fallbackFondosActive) {
            this.fondosFlotantes = this.fondosFlotantes.filter(f => f.id !== id);
            localStorage.setItem('trv_fondos_flotantes', JSON.stringify(this.fondosFlotantes));
            return { success: true };
        } else {
            try {
                const user = window.AuthModule?.currentUser?.email || 'Desconocido';
                const { error } = await supabaseClient
                    .from('fondos_flotantes')
                    .update({ deleted_at: new Date().toISOString(), deleted_by: user })
                    .eq('id', id);
                if (error) throw error;
                await this.loadFondosFlotantes();
                return { success: true };
            } catch (e) {
                console.error('Error deleting fondo flotante from Supabase, attempting local:', e);
                this.fondosFlotantes = this.fondosFlotantes.filter(f => f.id !== id);
                localStorage.setItem('trv_fondos_flotantes', JSON.stringify(this.fondosFlotantes));
                return { success: true };
            }
        }
    },

    // SUBMIT HANDLERS
    async handleFondoFlotanteSubmit() {
        const id = document.getElementById('pvm-fondo-id').value;
        const cliente = document.getElementById('pvm-fondo-cliente').value;
        const plan = document.getElementById('pvm-fondo-plan').value;
        const monto = UI.parseCurrency(document.getElementById('pvm-fondo-monto').value) || 0;
        const fechaReg = document.getElementById('pvm-fondo-fecha-registro').value;
        const fechaLim = document.getElementById('pvm-fondo-fecha-limite').value;

        if (monto <= 0) {
            return UI.showToast("El monto debe ser mayor a cero.", "error");
        }
        if (!cliente || !plan || !fechaReg || !fechaLim) {
            return UI.showToast("Por favor complete todos los campos obligatorios.", "error");
        }

        let res;
        if (id) {
            res = await this.updateFondoFlotante(id, cliente, plan, monto, fechaReg, fechaLim, 'disponible');
        } else {
            res = await this.saveFondoFlotante(cliente, plan, monto, fechaReg, fechaLim, 'disponible');
        }

        if (res.success) {
            UI.showToast(id ? "Fondo flotante actualizado." : "Fondo flotante registrado.", "success");
            this.clearFondoForm();
            this.renderFondosFlotantesPanel();
            this.calculateDistribution();
        } else {
            UI.showToast("Error al procesar fondo flotante.", "error");
        }
    },

    async handleEditFondoFlotante(id) {
        const f = this.fondosFlotantes.find(x => x.id === id);
        if (!f) return;

        document.getElementById('pvm-fondo-id').value = f.id;
        document.getElementById('pvm-fondo-cliente').value = f.cliente_nombre;
        document.getElementById('pvm-fondo-plan').value = f.plan_nombre;
        UI.setCurrencyValue('pvm-fondo-monto', f.monto);
        document.getElementById('pvm-fondo-fecha-registro').value = f.fecha_registro;
        document.getElementById('pvm-fondo-fecha-limite').value = f.fecha_limite;

        // Change title and button text
        document.getElementById('pvm-fondo-form-title').innerHTML = `<i class="ph ph-note-pencil mr-1.5 text-base text-indigo-500"></i> Editar Fondo Flotante`;
        document.getElementById('pvm-btn-save-fondo').innerHTML = `<i class="ph ph-floppy-disk text-xs"></i> Guardar`;
        document.getElementById('pvm-btn-cancel-fondo').classList.remove('hidden');
    },

    async handleReleaseFondoFlotante(id) {
        const res = await this.releaseFondoFlotante(id);
        if (res.success) {
            UI.showToast("Fondo flotante liberado y aplicado a su reserva.", "success");
            this.renderFondosFlotantesPanel();
            this.calculateDistribution();
        } else {
            UI.showToast("Error al liberar fondo flotante.", "error");
        }
    },

    async handleDeleteFondoFlotante(id) {
        const res = await this.deleteFondoFlotante(id);
        if (res.success) {
            UI.showToast("Fondo flotante eliminado con éxito.", "success");
            this.clearFondoForm();
            this.renderFondosFlotantesPanel();
            this.calculateDistribution();
        } else {
            UI.showToast("Error al eliminar fondo flotante.", "error");
        }
    },

    clearFondoForm() {
        document.getElementById('pvm-fondo-id').value = '';
        document.getElementById('pvm-fondo-cliente').value = '';
        document.getElementById('pvm-fondo-plan').value = '';
        document.getElementById('pvm-fondo-monto').value = '';
        document.getElementById('pvm-fondo-fecha-registro').value = new Date().toISOString().substring(0, 10);
        document.getElementById('pvm-fondo-fecha-limite').value = '';

        document.getElementById('pvm-fondo-form-title').innerHTML = `<i class="ph ph-plus-circle mr-1.5 text-base text-slate-500"></i> Registrar Fondo Flotante`;
        document.getElementById('pvm-btn-save-fondo').innerHTML = `<i class="ph ph-floppy-disk text-xs"></i> Registrar`;
        document.getElementById('pvm-btn-cancel-fondo').classList.add('hidden');
    },

    // RENDER HANDLERS
    renderFondosFlotantesPanel() {
        const banner = document.getElementById('pvm-fondos-fallback-banner');
        if (banner) {
            if (this.fallbackFondosActive) banner.classList.remove('hidden');
            else banner.classList.add('hidden');
        }

        // Set default date if empty
        const dateReg = document.getElementById('pvm-fondo-fecha-registro');
        if (dateReg && !dateReg.value) {
            dateReg.value = new Date().toISOString().substring(0, 10);
        }

        // Compute KPIs
        const activeFondos = (this.fondosFlotantes || []).filter(f => !f.deleted_at);
        const totalActivos = activeFondos.reduce((sum, f) => sum + (Number(f.monto) || 0), 0);
        
        const pendingFloatExpenses = (this.corporateExpenses || [])
            .filter(g => g.origen_fondos === 'Fondo Flotante' && g.estado_pago === 'pendiente')
            .reduce((sum, g) => sum + (Number(g.monto) || 0), 0);
        const disponibles = activeFondos.filter(f => f.estado === 'disponible').reduce((sum, f) => sum + (Number(f.monto) || 0), 0) - pendingFloatExpenses;
        const aplicados = activeFondos.filter(f => f.estado === 'aplicado_reserva').reduce((sum, f) => sum + (Number(f.monto) || 0), 0);

        const rol = window.AuthModule?.userProfile?.rol;
        const isAdmin = rol === 'administrador' || rol === 'socio_mayoritario' || rol === 'super_administrador';

        if (document.getElementById('pvm-fondos-kpi-total')) {
            document.getElementById('pvm-fondos-kpi-total').innerText = isAdmin ? formatCOP(totalActivos) : '***';
        }
        if (document.getElementById('pvm-fondos-kpi-disponibles')) {
            document.getElementById('pvm-fondos-kpi-disponibles').innerText = isAdmin ? formatCOP(disponibles) : '***';
        }
        if (document.getElementById('pvm-fondos-kpi-aplicados')) {
            document.getElementById('pvm-fondos-kpi-aplicados').innerText = isAdmin ? formatCOP(aplicados) : '***';
        }

        this.renderFondosFlotantesList();
    },

    renderFondosFlotantesList() {
        const statusFilter = document.getElementById('pvm-fondos-filtro-estado')?.value || 'todos';
        const activeFondos = (this.fondosFlotantes || []).filter(f => !f.deleted_at);

        const filtered = activeFondos.filter(f => {
            if (statusFilter === 'todos') return true;
            return f.estado === statusFilter;
        });

        const countEl = document.getElementById('pvm-fondos-count');
        if (countEl) countEl.innerText = `${filtered.length} Registros`;

        const tb = document.getElementById('pvm-fondos-list');
        const emptyState = document.getElementById('pvm-fondos-empty');

        if (!tb || !emptyState) return;

        tb.innerHTML = '';

        if (filtered.length === 0) {
            emptyState.classList.remove('hidden');
            tb.parentElement.classList.add('hidden');
        } else {
            emptyState.classList.add('hidden');
            tb.parentElement.classList.remove('hidden');

            const rol = window.AuthModule?.userProfile?.rol;
            const isAdmin = rol === 'administrador' || rol === 'socio_mayoritario' || rol === 'super_administrador';

            filtered.forEach(f => {
                const isDisponible = f.estado === 'disponible';
                const statusBadge = isDisponible
                    ? `<span class="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-black bg-indigo-50 text-indigo-600 border border-indigo-100 uppercase tracking-widest"><i class="ph ph-trend-up mr-1 text-[10px]"></i>Flotante</span>`
                    : `<span class="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-black bg-slate-50 text-slate-500 border border-slate-200 uppercase tracking-widest"><i class="ph ph-lock mr-1 text-[10px]"></i>Aplicado</span>`;

                let actionBtns = '';
                if (isAdmin) {
                    if (isDisponible) {
                        actionBtns += `<button type="button" data-action="pvm-release-fondo" data-id="${f.id}" class="text-emerald-500 hover:text-emerald-700 transition-colors p-1" title="Aplicar a reserva (Bloquear)"><i class="ph ph-lock text-sm"></i></button>`;
                        actionBtns += `<button type="button" data-action="pvm-edit-fondo" data-id="${f.id}" class="text-indigo-500 hover:text-indigo-700 transition-colors p-1 ml-1" title="Editar"><i class="ph ph-note-pencil text-sm"></i></button>`;
                    }
                    actionBtns += `<button type="button" data-action="pvm-delete-fondo" data-id="${f.id}" class="text-red-400 hover:text-red-600 transition-colors p-1 ml-1" title="Eliminar"><i class="ph ph-trash text-sm"></i></button>`;
                } else {
                    actionBtns = `<span class="text-slate-300 text-[10px]">-</span>`;
                }

                tb.innerHTML += `
                    <tr class="hover:bg-slate-50 transition-colors">
                        <td class="py-2 px-3 whitespace-nowrap text-[11px] font-medium text-slate-500">${formatShortDate(f.fecha_registro)}</td>
                        <td class="py-2 px-3 text-[11px] font-black text-slate-800">${UI.sanitize(f.cliente_nombre)}</td>
                        <td class="py-2 px-3 text-[11px] text-slate-600 max-w-[200px] truncate" title="${UI.sanitize(f.plan_nombre)}">${UI.sanitize(f.plan_nombre)}</td>
                        <td class="py-2 px-3 whitespace-nowrap text-right text-[11px] font-black text-slate-800">${isAdmin ? formatCOP(f.monto) : '***'}</td>
                        <td class="py-2 px-3 whitespace-nowrap text-[11px] font-bold text-rose-500">${formatShortDate(f.fecha_limite)}</td>
                        <td class="py-2 px-3 whitespace-nowrap text-center">${statusBadge}</td>
                        <td class="py-2 px-3 whitespace-nowrap text-center">${actionBtns}</td>
                    </tr>
                `;
            });
        }
    }
};
