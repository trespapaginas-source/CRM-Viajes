import { DataService, supabaseClient } from '../../../js/services/supabase.service.js';
import { Store } from '../../core/store.js';
import { UI } from '../../../js/utils/ui.utils.js';
import { formatCOP, formatShortDate } from '../../../js/utils/format.utils.js';

export const PlanesComponent = {
    currentTab: 'locales',
    tempProveedores: [],
    tempSelectedCatalog: [],
    tempFechas: [],
    eventsBound: false,

    init() {
        this.populateFilters();
        this.renderGrid();
        this.bindEvents();

        // Reactive subscription for planes updates
        Store.subscribe((state) => {
            if (state.lastUpdated === 'planes' || state.lastUpdated === 'full' || state.lastUpdated === 'proveedores') {
                this.populateFilters();
                this.renderGrid();
                // If form is open, maybe update providers list? Not necessary unless we want real-time dropdowns
            }
        });
    },

    bindEvents() {
        if (this.eventsBound) return;

        document.body.addEventListener('click', (e) => {
            const target = e.target.closest('[data-action]');
            if (!target) return;

            const action = target.dataset.action;

            if (action === 'switch-planes-tab') {
                this.switchPlanesTab(target.dataset.tabId);
            } else if (action === 'add-temp-date') {
                this.addDateToTempList();
            } else if (action === 'remove-temp-date') {
                this.removeTempDate(parseInt(target.dataset.index));
            } else if (action === 'open-plan-form') {
                this.openFormModal(target.dataset.planId);
            } else if (action === 'close-plan-form' || e.target.id === 'plan-form-bg') {
                this.closeFormModal();
            } else if (action === 'add-selected-products') {
                this.addSelectedProductsToPlan();
            } else if (action === 'remove-prov') {
                this.removeProv(parseInt(target.dataset.index));
            } else if (action === 'quick-update-price') {
                this.quickUpdatePrice(target.dataset.planId, parseFloat(target.dataset.precio));
            } else if (action === 'copiar-info-plan') {
                this.copiarInfoPlan();
            } else if (action === 'clone-plan') {
                this.clonePlan(target.dataset.planId);
            } else if (action === 'delete-plan') {
                if (window.promptGlobalDelete) {
                    window.promptGlobalDelete(target.dataset.planId, 'plan', target.dataset.planName);
                }
            }
        });

        // Form Submission
        const planForm = document.getElementById('plan-form');
        if (planForm) {
            planForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.savePlan();
            });
        }

        // Dropdowns and Inputs
        const selTipo = document.getElementById('pf-tipo');
        if (selTipo) {
            selTipo.addEventListener('change', () => this.checkNewType());
        }

        const selProvMaster = document.getElementById('pf-prov-master-select');
        if (selProvMaster) {
            selProvMaster.addEventListener('change', () => this.onProviderSelectForPlan());
        }

        const inputPfPrecio = document.getElementById('pf-precio');
        if (inputPfPrecio) {
            inputPfPrecio.addEventListener('input', () => this.syncSummary());
        }

        const btnSave = document.getElementById('btn-save-plan');
        if (btnSave) {
            btnSave.addEventListener('click', (e) => {
                e.preventDefault();
                this.savePlan();
            });
        }

        // Filters
        const filterTipo = document.getElementById('filter-planes-tipo');
        if (filterTipo) {
            filterTipo.addEventListener('change', () => this.filterGrid());
        }
        
        const filterDestino = document.getElementById('filter-planes-destino');
        if (filterDestino) {
            filterDestino.addEventListener('change', () => this.filterGrid());
        }

        // Global delegate for dynamic checkboxes (toggleCatalogProduct)
        document.body.addEventListener('change', (e) => {
            if (e.target.classList.contains('catalog-checkbox')) {
                this.toggleCatalogProduct(e.target, e.target.dataset.provId, e.target.dataset.prodName, parseFloat(e.target.dataset.prodCosto));
            }
        });

        this.eventsBound = true;
    },

    switchPlanesTab(tabId) {
        this.currentTab = tabId;
        document.querySelectorAll('.planes-sub-tab').forEach(btn => {
            btn.classList.remove('border-primary-600', 'text-slate-900', 'bg-white');
            btn.classList.add('border-transparent', 'text-slate-400', 'hover:text-slate-700');
        });
        const activeBtn = document.getElementById('planes-tab-' + tabId);
        if (activeBtn) {
            activeBtn.classList.remove('border-transparent', 'text-slate-400', 'hover:text-slate-700');
            activeBtn.classList.add('border-primary-600', 'text-slate-900', 'bg-white');
        }
        this.renderGrid();
    },

    addDateToTempList() {
        const start = document.getElementById('pf-new-date-start').value;
        const end = document.getElementById('pf-new-date-end').value;
        if (!start || !end || new Date(end) < new Date(start)) {
            return UI.showToast("Fechas inválidas o invertidas.", "error");
        }
        this.tempFechas.push({ id: Date.now().toString(), start, end });
        document.getElementById('pf-new-date-start').value = '';
        document.getElementById('pf-new-date-end').value = '';
        this.renderTempDates();
    },

    removeTempDate(idx) {
        this.tempFechas.splice(idx, 1);
        this.renderTempDates();
    },

    renderTempDates() {
        const list = document.getElementById('pf-dates-list');
        if (!list) return;
        list.innerHTML = '';
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);

        this.tempFechas.forEach((f, idx) => {
            const isPast = new Date(f.start + "T00:00:00") < hoy;
            const statusBadge = isPast
                ? '<span class="bg-red-100 text-red-600 px-2 py-0.5 rounded text-[9px] uppercase font-black ml-2 border border-red-200">Finalizado</span>'
                : '<span class="bg-green-100 text-green-600 px-2 py-0.5 rounded text-[9px] uppercase font-black ml-2 border border-green-200">Disponible</span>';

            const dateText = f.start === f.end
                ? formatShortDate(f.start)
                : `${formatShortDate(f.start)} al ${formatShortDate(f.end)}`;

            list.innerHTML += `
            <li class="flex justify-between items-center bg-white px-3 py-2.5 rounded-xl border border-slate-200 shadow-sm">
                <div>
                    <i class="ph ph-calendar-blank text-slate-400 mr-1"></i>
                    <span class="text-sm font-bold text-slate-700">${dateText}</span>
                    ${statusBadge}
                </div>
                <button type="button" data-action="remove-temp-date" data-index="${idx}" class="text-slate-400 hover:text-red-500 bg-slate-50 p-1.5 rounded-lg transition-colors"><i class="ph ph-trash"></i></button>
            </li>`;
        });
    },

    populateFilters() {
        const selectDestino = document.getElementById('filter-planes-destino');
        if (selectDestino) {
            selectDestino.innerHTML = '<option value="">Todos los Destinos</option>';
            DataService.db.destinos.forEach(d => {
                selectDestino.innerHTML += `<option value="${d}">${d}</option>`;
            });
        }
    },

    filterGrid() {
        const tipo = document.getElementById('filter-planes-tipo')?.value.toLowerCase() || "";
        const destino = document.getElementById('filter-planes-destino')?.value.toLowerCase() || "";
        const cards = document.querySelectorAll('#planes-grid > div');

        cards.forEach(card => {
            const cardTipo = card.getAttribute('data-tipo')?.toLowerCase() || "";
            const cardDestino = card.getAttribute('data-destino')?.toLowerCase() || "";
            const matchTipo = tipo === "" || cardTipo === tipo;
            const matchDestino = destino === "" || cardDestino.includes(destino);
            card.style.display = (matchTipo && matchDestino) ? "" : "none";
        });
    },

    renderGrid() {
        const mallaGrafica = document.getElementById('planes-grid');
        if (!mallaGrafica) return;
        mallaGrafica.innerHTML = '';

        DataService.planes.forEach(planBase => {
            const esInternacional = planBase.categoria === 'Internacional';
            if (this.currentTab === 'locales' && esInternacional) return;
            if (this.currentTab === 'internacionales' && !esInternacional) return;

            const marcoDiv = document.createElement('div');
            marcoDiv.className = "bg-white/60 backdrop-blur-xl border border-white p-5 rounded-3xl shadow-xl shadow-slate-200/40 hover:shadow-2xl hover:shadow-slate-300/50 hover:-translate-y-1 transition-all duration-300 relative group flex flex-col overflow-hidden";
            marcoDiv.setAttribute('data-tipo', UI.sanitize(planBase.tipo || ''));
            marcoDiv.setAttribute('data-destino', UI.sanitize(planBase.destino || ''));

            marcoDiv.innerHTML = `
                <div class="absolute inset-0 border border-white/80 rounded-3xl pointer-events-none"></div>
                <div class="absolute -right-12 -top-12 w-48 h-48 bg-gradient-to-br from-white to-transparent rounded-full blur-2xl opacity-70 pointer-events-none"></div>
                <div class="absolute top-4 right-4 flex space-x-1.5 z-50 opacity-100 lg:opacity-0 group-hover:opacity-100 transition-all">
                    <button data-action="open-plan-form" data-plan-id="${planBase.id}" class="bg-white/50 backdrop-blur-md shadow-sm border border-white p-1.5 rounded-xl text-slate-500 hover:text-primary-600 transition-colors cursor-pointer relative" title="Editar"><i class="ph ph-pencil-simple text-base pointer-events-none"></i></button>
                    <button data-action="delete-plan" data-plan-id="${planBase.id}" data-plan-name="${planBase.nombre.replace(/'/g, "\\'")}" class="btn-delete-protected bg-white/50 backdrop-blur-md shadow-sm border border-white p-1.5 rounded-xl text-red-400 hover:text-white hover:bg-red-500 transition-colors cursor-pointer relative" title="Eliminar Plan"><i class="ph ph-trash text-base pointer-events-none"></i></button>
                </div>
                <div class="mb-3 relative z-10">
                    <span class="text-[9px] font-black uppercase tracking-wider bg-slate-800 text-white px-3 py-1.5 rounded-lg shadow-sm">${planBase.tipo}</span>
                </div>
                <h4 class="text-xl font-black text-slate-800 leading-tight mb-2 pr-12 relative z-10">${planBase.nombre}</h4>
                <div class="space-y-2 mb-4 flex-1 relative z-10">
                    <p class="text-xs text-slate-600 font-semibold flex items-center"><i class="ph ph-map-pin mr-2 text-primary-500 text-sm"></i> ${planBase.destino || 'Destino Abierto'}</p>
                    <p class="text-xs text-slate-600 font-semibold flex items-center"><i class="ph ph-calendar-blank mr-2 text-slate-400 text-sm"></i>
                        <span class="text-slate-800 font-bold tracking-wide leading-tight mt-0.5">
                            ${planBase.fechas && planBase.fechas.length > 0
                                ? `${planBase.fechas.length} salida(s) programada(s)`
                                : (!planBase.fecha_entrada && !planBase.fecha_salida)
                                    ? 'Fecha Abierta / Por Definir'
                                    : (planBase.fecha_entrada === planBase.fecha_salida)
                                        ? formatShortDate(planBase.fecha_entrada)
                                        : formatShortDate(planBase.fecha_entrada) + ' al ' + formatShortDate(planBase.fecha_salida)}
                        </span>
                    </p>
                </div>
                <div class="flex justify-between items-end pt-4 border-t border-slate-200/50 mt-auto bg-white/40 backdrop-blur-sm -mx-5 -mb-5 px-5 pb-5 rounded-b-[1.35rem] relative z-10">
                    <div>
                        <p class="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-0.5">Tarifa / Pax</p>
                        <button data-action="quick-update-price" data-plan-id="${planBase.id}" data-precio="${planBase.precio_persona}" class="text-2xl font-black text-primary-600 tracking-tight hover:underline drop-shadow-sm">${formatCOP(planBase.precio_persona)}</button>
                    </div>
                    <div class="text-right">
                        <p class="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-0.5">Costos Prov.</p>
                        <p class="text-base font-black text-slate-700">${formatCOP(planBase.costo_base)}</p>
                    </div>
                </div>`;
            mallaGrafica.appendChild(marcoDiv);
        });
    },

    openFormModal(idToEdit = null) {
        document.getElementById('plan-form').reset();
        document.getElementById('pf-id').value = "";
        document.getElementById('plan-copy-promocional').value = "";
        this.tempProveedores = [];
        this.tempSelectedCatalog = [];
        this.tempFechas = [];

        UI.switchTab('plan', 'info');

        const sel = document.getElementById('pf-prov-master-select');
        sel.innerHTML = '<option value="">-- Elige la base del proveedor --</option>';
        DataService.proveedores.forEach(p => {
            sel.innerHTML += `<option value="${p.id}">${p.nombre} (${p.tipo})</option>`;
        });

        document.getElementById('pf-prov-catalog').classList.add('hidden');

        if (idToEdit) {
            const pq = DataService.planes.find(x => x.id === idToEdit);
            if (pq) {
                document.getElementById('plan-form-title').innerText = "Editor de Plan";
                document.getElementById('pf-id').value = pq.id;
                document.getElementById('pf-nombre').value = pq.nombre;
                
                let catVal = pq.categoria;
                if (!catVal || catVal === '') catVal = 'Local';
                document.getElementById('pf-categoria').value = catVal;

                document.getElementById('pf-destino').value = pq.destino;
                this.tempFechas = pq.fechas || [];
                document.getElementById('pf-precio').value = pq.precio_persona;
                document.getElementById('pf-deposito').value = pq.deposito_requerido || 0;
                document.getElementById('pf-condiciones').value = pq.condiciones_pago || '';
                document.getElementById('pf-notas').value = pq.notas || '';
                document.getElementById('plan-copy-promocional').value = pq.copy_promocional || '';

                let selTipo = document.getElementById('pf-tipo');
                if (![...selTipo.options].some(o => o.value === pq.tipo)) {
                    selTipo.innerHTML += `<option value="${pq.tipo}">${pq.tipo}</option>`;
                }
                selTipo.value = pq.tipo;
                this.tempProveedores = pq.proveedores_vinculados || [];
            }
        } else {
            document.getElementById('plan-form-title').innerText = "Nuevo Plan";
        }

        this.renderTempDates();
        this.renderTempProveedores();
        UI.openModal('plan-form-modal', 'plan-form-bg', 'plan-form-content');
        this.syncSummary();
    },

    closeFormModal() {
        UI.closeModal('plan-form-modal', 'plan-form-bg', 'plan-form-content');
    },

    checkNewType() {
        const s = document.getElementById('pf-tipo');
        const inp = document.getElementById('pf-tipo-nuevo');
        if (s.value === 'otro') {
            inp.classList.remove('hidden');
            inp.required = true;
        } else {
            inp.classList.add('hidden');
            inp.required = false;
        }
    },

    onProviderSelectForPlan() {
        const pId = document.getElementById('pf-prov-master-select').value;
        const cat = document.getElementById('pf-prov-catalog');
        const cbs = document.getElementById('pf-prov-checkboxes');

        this.tempSelectedCatalog = [];
        cbs.innerHTML = '';

        if (!pId) { cat.classList.add('hidden'); return; }

        const prov = DataService.getSupplierById(pId);
        if (prov && prov.productos && prov.productos.length > 0) {
            prov.productos.forEach((p, i) => {
                cbs.innerHTML += `
                    <label class="flex items-center p-3 border border-slate-200 bg-slate-50 cursor-pointer shadow-sm rounded-lg">
                        <input type="checkbox" value="${i}" class="w-5 h-5 rounded mr-3 catalog-checkbox" data-prov-id="${prov.id}" data-prod-name="${p.name}" data-prod-costo="${p.costo}">
                        <div class="flex-1 flex justify-between">
                            <span class="text-sm font-semibold">${p.name}</span>
                            <span class="text-sm font-black bg-white px-2 py-1 rounded shadow-sm">${formatCOP(p.costo)}</span>
                        </div>
                    </label>`;
            });
            cat.classList.remove('hidden');
        } else {
            cbs.innerHTML = `<div class="p-3 bg-red-50 text-red-600 rounded-lg text-xs font-semibold">Proveedor vacío sin catálogo.</div>`;
            cat.classList.remove('hidden');
        }
    },

    toggleCatalogProduct(chk, pID, pName, pCosto) {
        if (chk.checked) {
            this.tempSelectedCatalog.push({
                id_proveedor: pID,
                nombre: DataService.getSupplierById(pID).nombre,
                incluye: pName,
                costo: pCosto
            });
        } else {
            this.tempSelectedCatalog = this.tempSelectedCatalog.filter(e => !(e.id_proveedor === pID && e.incluye === pName));
        }
    },

    addSelectedProductsToPlan() {
        if (this.tempSelectedCatalog.length === 0) {
            return UI.showToast("Marca las casillas de los servicios primero.", "error");
        }
        this.tempProveedores.push(...this.tempSelectedCatalog);
        document.getElementById('pf-prov-master-select').value = "";
        document.getElementById('pf-prov-catalog').classList.add('hidden');
        this.renderTempProveedores();
        UI.showToast("Servicios añadidos al plan.", "success");
    },

    removeProv(i) {
        this.tempProveedores.splice(i, 1);
        this.renderTempProveedores();
    },

    renderTempProveedores() {
        const dom = document.getElementById('pf-proveedores-list');
        if (!dom) return;
        dom.innerHTML = '';
        let suma = 0;

        this.tempProveedores.forEach((f, i) => {
            suma += parseFloat(f.costo);
            dom.innerHTML += `
                <tr>
                    <td class="p-3 font-bold text-xs uppercase">${f.nombre}</td>
                    <td class="p-3 text-slate-500 font-medium">${f.incluye}</td>
                    <td class="p-3 text-right font-black text-base">${formatCOP(f.costo)}</td>
                    <td class="p-3 text-center">
                        <button type="button" data-action="remove-prov" data-index="${i}" class="text-red-400 hover:text-red-600 p-2 transition-colors">
                            <i class="ph ph-trash text-lg pointer-events-none"></i>
                        </button>
                    </td>
                </tr>`;
        });

        const totalSpan = document.getElementById('pf-costo-total');
        if (totalSpan) totalSpan.innerText = formatCOP(suma);
        this.syncSummary();
    },

    syncSummary() {
        const u = document.getElementById('pf-precio')?.value || 0;
        let s = 0;
        this.tempProveedores.forEach(p => s += parseFloat(p.costo));
        
        const summaryPrecio = document.getElementById('pf-summary-precio');
        if (summaryPrecio) summaryPrecio.innerText = formatCOP(u);
        
        const summaryCosto = document.getElementById('pf-summary-costo');
        if (summaryCosto) summaryCosto.innerText = formatCOP(s);
    },

    async savePlan() {
        const f = document.getElementById('plan-form');
        if (!f.checkValidity()) { f.reportValidity(); return; }

        if (this.tempFechas.length === 0) {
            return UI.showToast("Debes añadir al menos una fecha de salida para el plan.", "error");
        }

        let tip = document.getElementById('pf-tipo').value;
        if (tip === 'otro') tip = document.getElementById('pf-tipo-nuevo').value;

        const btn = document.getElementById('btn-save-plan');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="ph ph-spinner animate-spin mr-2"></i> Procesando...';
        }

        let cst = 0;
        this.tempProveedores.forEach(n => cst += parseFloat(n.costo));

        const obj = {
            id: document.getElementById('pf-id').value || "",
            nombre: document.getElementById('pf-nombre').value,
            tipo: tip,
            categoria: document.getElementById('pf-categoria').value || 'Local',
            destino: document.getElementById('pf-destino').value,
            fechas: this.tempFechas,
            precio_persona: parseFloat(document.getElementById('pf-precio').value) || 0,
            deposito_requerido: parseFloat(document.getElementById('pf-deposito').value) || 0,
            condiciones_pago: document.getElementById('pf-condiciones').value,
            notas: document.getElementById('pf-notas').value,
            copy_promocional: document.getElementById('plan-copy-promocional').value,
            proveedores_vinculados: this.tempProveedores,
            costo_base: cst
        };

        try {
            await DataService.savePlan(obj);
            // Store automatically triggers renderGrid() when data is updated via savePlan -> DataService -> Store.update()
            this.closeFormModal();
            UI.showToast("Plan guardado satisfactoriamente.");
        } catch (ex) {
            UI.showToast("Error de comunicación: " + ex.message, "error");
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="ph ph-check-circle mr-2 text-lg"></i> Validar y Guardar Plan';
            }
        }
    },

    async clonePlan(id) {
        const p = DataService.planes.find(x => x.id === id);
        if (!p) return;
        const { id: o, created_at, ...nP } = p;
        nP.nombre = p.nombre + " (Copia)";
        await DataService.savePlan(nP);
        UI.showToast("Plan clonado perfectamente.", "success");
    },

    async quickUpdatePrice(id, cp) {
        const np = prompt("Nueva tarifa de venta al público:", cp);
        if (np && !isNaN(np)) {
            await supabaseClient.from('planes').update({ precio_persona: parseFloat(np) }).eq('id', id);
            await DataService.loadAll();
            // Store reactive subscription will renderGrid automatically
        }
    },

    copiarInfoPlan() {
        const copyText = document.getElementById('plan-copy-promocional').value;
        if (!copyText || copyText.trim() === '') {
            return UI.showToast("No hay información escrita para copiar.", "error");
        }
        navigator.clipboard.writeText(copyText).then(() => {
            UI.showToast("¡Información del plan copiada al portapapeles!", "success");
        }).catch(() => {
            UI.showToast("No se pudo copiar. Selecciona el texto manualmente.", "error");
        });
    }
};
