// js/modules/b2b.module.js — Ecosistema B2B (Alianzas y Catálogo)
// Cross-module: window.AuthModule, window.ClientsModule
// Extraído de app.js líneas 4155-4754
import { DataService, supabaseClient } from '../services/supabase.service.js';
import { UI } from '../utils/ui.utils.js';
import { formatCOP, formatShortDate } from '../utils/format.utils.js';
export const B2BModule = {
    currentEditingDealId: null,
    dealType: 'new',

    init() {
        this.renderGrid();
        this.renderCatalogList();
        this.setupSelects();
    },

    setupSelects() {
        const aliadoSelect = document.getElementById('b2b-deal-aliado');
        const servSelect = document.getElementById('b2b-deal-servicio');

        if (aliadoSelect) {
            aliadoSelect.innerHTML = '<option value="">-- Elige la empresa --</option>' +
                DataService.b2b_aliados.map(a => `<option value="${a.id}">${UI.sanitize(a.nombre_empresa)}</option>`).join('');
        }
        if (servSelect) {
            servSelect.innerHTML = '<option value="">-- Selecciona el servicio --</option>' +
                DataService.b2b_servicios.map(s => `<option value="${s.id}">${UI.sanitize(s.nombre)} ($${formatCOP(s.precio_sugerido)})</option>`).join('');
        }
    },

    filterGrid() {
        const term = document.getElementById('b2b-search-input')?.value.toLowerCase() || '';
        const cards = document.querySelectorAll('#b2b-grid > div');

        cards.forEach(card => {
            const searchData = card.getAttribute('data-search') || '';
            if (searchData.includes(term)) card.style.display = '';
            else card.style.display = 'none';
        });
    },

    autoFillPrice() {
        const servId = document.getElementById('b2b-deal-servicio').value;
        if (!servId) {
            document.getElementById('b2b-deal-monto').value = "";
            return;
        }
        const serv = DataService.b2b_servicios.find(s => s.id === servId);
        if (serv) document.getElementById('b2b-deal-monto').value = serv.precio_sugerido;
    },

    renderGrid() {
        const grid = document.getElementById('b2b-grid');
        if (!grid) return;

        let totalGanadoGlobal = 0;
        let totalPipelineGlobal = 0;

        const gridHTML = DataService.b2b_aliados.map(aliado => {
            const aliadoDeals = DataService.b2b_negocios.filter(d => d.aliado_id === aliado.id);
            const totalMontoAliado = aliadoDeals.reduce((sum, d) => sum + Number(d.monto_acordado), 0);
            const dealsContados = aliadoDeals.length;

            aliadoDeals.forEach(deal => {
                if (deal.estado === 'cerrado_ganado') totalGanadoGlobal += Number(deal.monto_acordado);
                else if (deal.estado === 'negociacion' || deal.estado === 'propuesta') totalPipelineGlobal += Number(deal.monto_acordado);
            });

            let statusBadge = '';
            if (dealsContados === 0) {
                statusBadge = '<span class="bg-slate-100 text-slate-500 px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest"><i class="ph ph-user-minus mr-1"></i>Sin Deals</span>';
            } else if (aliadoDeals.some(d => d.estado === 'cerrado_ganado')) {
                statusBadge = '<span class="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest"><i class="ph ph-check-circle mr-1"></i>Con Ingresos</span>';
            } else {
                statusBadge = '<span class="bg-amber-100 text-amber-700 px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest"><i class="ph ph-chart-line-up mr-1"></i>En Pipeline</span>';
            }

            const searchString = `${UI.sanitize(aliado.nombre_empresa).toLowerCase()} ${UI.sanitize(aliado.contacto_nombre || '').toLowerCase()}`;
            const igHtml = aliado.instagram ? `<a href="${aliado.instagram}" target="_blank" onclick="event.stopPropagation()" class="text-pink-500 hover:text-pink-700 transition-colors ml-2"><i class="ph ph-instagram-logo text-base"></i></a>` : '';

            return `
                <div data-search="${searchString}" onclick="B2BModule.openAliadoMaster('${aliado.id}')" class="bg-white border border-slate-200/60 rounded-[1.5rem] p-5 hover:shadow-md hover:-translate-y-1 transition-all duration-300 relative group flex flex-col justify-between cursor-pointer overflow-hidden shadow-sm">
                    <div class="absolute top-4 right-4 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                        <span class="bg-slate-900 text-white px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-widest shadow-lg flex items-center gap-1.5"><i class="ph ph-eye"></i> Ficha</span>
                    </div>
                    <div>
                        <div class="flex items-start mb-4 border-b border-slate-100/80 pb-4">
                            <div class="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center border border-indigo-100 shrink-0 shadow-inner">
                                <i class="ph ph-buildings text-2xl text-indigo-400"></i>
                            </div>
                            <div class="ml-3 flex-1 min-w-0 pr-8">
                                <h3 class="font-black text-slate-800 text-base tracking-tight leading-tight truncate flex items-center">${UI.sanitize(aliado.nombre_empresa)} ${igHtml}</h3>
                                <p class="text-[10px] font-bold text-slate-400 mt-1 flex items-center truncate"><i class="ph ph-user text-sm mr-1"></i> ${UI.sanitize(aliado.contacto_nombre || 'Sin contacto')} ${aliado.telefono ? '• ' + aliado.telefono : ''}</p>
                            </div>
                        </div>
                        <div class="mb-4">
                            <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 flex justify-between items-center">
                                Resumen de Cuenta ${statusBadge}
                            </p>
                            <p class="text-sm font-bold text-slate-700 flex items-center"><i class="ph ph-handshake mr-1.5 text-primary-500"></i> ${dealsContados} ${dealsContados === 1 ? 'Servicio Registrado' : 'Servicios Registrados'}</p>
                        </div>
                    </div>
                    <div class="bg-slate-50 p-3 rounded-xl border border-slate-100 flex justify-between items-center shadow-inner">
                        <span class="text-[9px] font-black text-slate-500 uppercase tracking-widest">Capital Negociado</span>
                        <span class="font-black text-lg text-emerald-600 tracking-tighter">${formatCOP(totalMontoAliado)}</span>
                    </div>
                </div>
            `;
        }).join('');

        if (DataService.b2b_aliados.length === 0) {
            grid.innerHTML = '<div class="col-span-full py-16 text-center text-slate-400 italic bg-white/50 rounded-3xl border border-slate-200/50 border-dashed">No hay aliados comerciales registrados. <br> <button onclick="B2BModule.openNewDealModal()" class="mt-4 text-xs bg-slate-900 text-white px-3 py-1.5 rounded-lg font-bold">Crear Primera Alianza</button></div>';
        } else {
            grid.innerHTML = gridHTML;
        }

        const kpiCerrado = document.getElementById('b2b-kpi-cerrado');
        const kpiPipeline = document.getElementById('b2b-kpi-pipeline');
        if (kpiCerrado) kpiCerrado.innerText = formatCOP(totalGanadoGlobal);
        if (kpiPipeline) kpiPipeline.innerText = formatCOP(totalPipelineGlobal);
    },

    openNewDealModal() {
        this.currentEditingDealId = null;
        document.getElementById('b2b-deal-form').reset();

        document.getElementById('b2b-deal-modal-title').innerHTML = '<i class="ph ph-handshake text-primary-600 mr-2 text-xl"></i> Nueva Alianza';
        document.getElementById('btn-save-deal').innerHTML = '<i class="ph ph-floppy-disk mr-2 text-lg"></i> Validar y Procesar';

        this.toggleDealType('new');

        UI.openModal('b2b-deal-modal', 'b2b-deal-bg', 'b2b-deal-content');
    },

    toggleDealType(type) {
        this.dealType = type;
        const divNew = document.getElementById('div-deal-aliado-nuevo');

        if (type === 'new') {
            divNew.classList.remove('hidden');
            document.getElementById('b2b-new-empresa').required = true;
        } else {
            divNew.classList.add('hidden');
            document.getElementById('b2b-new-empresa').required = false;
        }
    },

    async saveDeal() {
        const form = document.getElementById('b2b-deal-form');
        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        const btn = document.getElementById('btn-save-deal');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="ph ph-spinner animate-spin mr-2 text-lg"></i> Guardando...';
        btn.disabled = true;

        try {
            let aliadoIdFinal = null;

            if (!this.currentEditingDealId) {
                if (this.dealType === 'new') {
                    const objAliado = {
                        nombre_empresa: document.getElementById('b2b-new-empresa').value.trim(),
                        contacto_nombre: document.getElementById('b2b-new-contacto').value.trim(),
                        telefono: document.getElementById('b2b-new-telefono').value.trim(),
                        instagram: document.getElementById('b2b-new-instagram').value.trim()
                    };

                    const { data: nAliado, error: errAli } = await supabaseClient.from('b2b_aliados').insert([objAliado]).select();
                    if (errAli) {
                        if (errAli.code === '42703') throw new Error("COLUMNA_INSTAGRAM_FALTA");
                        throw errAli;
                    }

                    aliadoIdFinal = nAliado[0].id;
                    DataService.b2b_aliados.unshift(nAliado[0]);
                } else {
                    aliadoIdFinal = document.getElementById('b2b-deal-aliado').value;
                }
            } else {
                aliadoIdFinal = document.getElementById('b2b-deal-aliado').value;
            }

            if (!aliadoIdFinal) throw new Error("Falta la asignación del Aliado.");

            const servicioId = document.getElementById('b2b-deal-servicio').value;
            const monto = document.getElementById('b2b-deal-monto').value;
            const estado = document.getElementById('b2b-deal-estado').value;
            const notas = document.getElementById('b2b-deal-notas').value.trim();

            if (this.currentEditingDealId) {
                if (!servicioId) throw new Error("El servicio es obligatorio para actualizar.");

                const payloadUpdateDeal = {
                    servicio_id: servicioId,
                    monto_acordado: parseFloat(monto),
                    estado: estado,
                    notas: notas
                };

                const { error: errUpdateDeal } = await supabaseClient.from('b2b_negocios').update(payloadUpdateDeal).eq('id', this.currentEditingDealId);
                if (errUpdateDeal) throw errUpdateDeal;

                UI.showToast('Servicio actualizado con éxito', 'success');
                const dIdx = DataService.b2b_negocios.findIndex(d => d.id === this.currentEditingDealId);
                if (dIdx !== -1) DataService.b2b_negocios[dIdx] = { ...DataService.b2b_negocios[dIdx], ...payloadUpdateDeal };

            } else {
                if (servicioId) {
                    const payloadNewDeal = {
                        aliado_id: aliadoIdFinal,
                        servicio_id: servicioId,
                        monto_acordado: parseFloat(monto || 0),
                        estado: estado,
                        notas: notas
                    };

                    const { data: nDeal, error: errNewDeal } = await supabaseClient.from('b2b_negocios').insert([payloadNewDeal]).select();
                    if (errNewDeal) throw errNewDeal;
                    DataService.b2b_negocios.unshift(nDeal[0]);
                    UI.showToast('¡Alianza y Servicio creados!', 'success');
                } else {
                    UI.showToast('¡Perfil de Alianza creado!', 'success');
                }
            }

            this.renderGrid();

            const masterModal = document.getElementById('b2b-master-modal');
            if (masterModal && !masterModal.classList.contains('hidden')) {
                const currentOpenAliadoId = document.getElementById('master-aliado-id-ref')?.value;
                if (currentOpenAliadoId === aliadoIdFinal) this.openAliadoMaster(aliadoIdFinal);
            }

            this.closeDealModal();
            form.reset();
            this.currentEditingDealId = null;

        } catch (e) {
            if (e.message === "COLUMNA_INSTAGRAM_FALTA") {
                UI.showToast('Error Crítico: Faltó crear la columna "instagram" en la BD.', 'error');
            } else {
                UI.showToast('Error BD: ' + e.message, 'error');
            }
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    },

    openNewDealForAliado(aliadoId) {
        this.currentEditingDealId = null;
        document.getElementById('b2b-deal-form').reset();

        this.toggleDealType('exist');
        document.getElementById('b2b-deal-aliado').value = aliadoId;

        document.getElementById('b2b-deal-modal-title').innerHTML = '<i class="ph ph-plus-circle text-primary-600 mr-2 text-xl"></i> Agregar Servicio';
        document.getElementById('btn-save-deal').innerHTML = '<i class="ph ph-floppy-disk mr-2 text-lg"></i> Guardar Servicio';
        document.getElementById('b2b-deal-servicio').required = true;

        UI.openModal('b2b-deal-modal', 'b2b-deal-bg', 'b2b-deal-content');
    },

    editDeal(dealId) {
        const deal = DataService.b2b_negocios.find(d => d.id === dealId);
        if (!deal) return;

        this.currentEditingDealId = dealId;

        this.toggleDealType('exist');

        document.getElementById('b2b-deal-aliado').value = deal.aliado_id;
        document.getElementById('b2b-deal-servicio').value = deal.servicio_id;
        document.getElementById('b2b-deal-servicio').required = true;
        document.getElementById('b2b-deal-monto').value = deal.monto_acordado;
        document.getElementById('b2b-deal-estado').value = deal.estado;
        document.getElementById('b2b-deal-notas').value = deal.notas || '';

        document.getElementById('b2b-deal-modal-title').innerHTML = '<i class="ph ph-pencil-simple text-blue-600 mr-2 text-xl"></i> Editar Servicio';
        document.getElementById('btn-save-deal').innerHTML = '<i class="ph ph-floppy-disk mr-2 text-lg"></i> Actualizar';

        UI.openModal('b2b-deal-modal', 'b2b-deal-bg', 'b2b-deal-content');
    },

    closeDealModal() {
        UI.closeModal('b2b-deal-modal', 'b2b-deal-bg', 'b2b-deal-content');
        this.currentEditingDealId = null;
    },

    openAliadoMaster(aliadoId) {
        const aliado = DataService.b2b_aliados.find(a => a.id === aliadoId);
        if (!aliado) return;

        let modal = document.getElementById('b2b-master-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'b2b-master-modal';
            modal.className = 'fixed inset-0 z-[60] hidden flex justify-end p-0 md:p-4';
            modal.innerHTML = `
                <div id="b2b-master-bg" class="absolute inset-0 bg-slate-900/40 backdrop-blur-sm opacity-0 transition-opacity duration-300" onclick="UI.closeModal('b2b-master-modal', 'b2b-master-bg', 'b2b-master-content')"></div>
                <div id="b2b-master-content" class="relative w-full max-w-lg bg-white shadow-2xl translate-x-full transition-transform duration-300 flex flex-col modal-mobile-safe border-l border-white/50 h-full">
                    <div class="p-5 md:p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 shrink-0">
                        <h3 class="text-xl font-black text-slate-800"><i class="ph ph-buildings text-primary-600 mr-2"></i> Perfil B2B</h3>
                        <button onclick="UI.closeModal('b2b-master-modal', 'b2b-master-bg', 'b2b-master-content')" class="text-slate-400 hover:text-red-500 bg-white p-2 rounded-xl shadow-sm border border-slate-200"><i class="ph ph-x"></i></button>
                    </div>
                    <div class="p-5 md:p-6 flex-1 overflow-y-auto custom-scrollbar" id="b2b-master-body"></div>
                </div>`;
            document.body.appendChild(modal);
        }

        const deals = DataService.b2b_negocios.filter(d => d.aliado_id === aliadoId);
        let dealsHtml = deals.map(d => {
            const serv = DataService.b2b_servicios.find(s => s.id === d.servicio_id) || { nombre: 'Borrado' };
            let stColor = d.estado === 'cerrado_ganado' ? 'text-emerald-700 bg-emerald-50 border-emerald-100' : 'text-slate-500 bg-slate-100 border-slate-200';

            return `
                <div class="group relative flex flex-col sm:flex-row sm:justify-between sm:items-center p-4 border border-slate-200/80 rounded-2xl mb-3 hover:bg-slate-50 transition-all shadow-sm cursor-pointer gap-2" onclick="B2BModule.editDeal('${d.id}')">
                    <div class="flex-1 pr-2">
                        <p class="font-black text-sm text-slate-800 group-hover:text-primary-600 transition-colors truncate">${UI.sanitize(serv.nombre)}</p>
                        <span class="text-[9px] font-black uppercase px-2 py-0.5 rounded border ${stColor} mt-1 inline-block">${d.estado.replace('_', ' ')}</span>
                    </div>
                    <div class="flex items-center justify-between sm:justify-end gap-3 sm:gap-4 shrink-0 border-t border-slate-100 pt-2 sm:pt-0 sm:border-0">
                        <div class="text-left sm:text-right">
                            <p class="font-black text-slate-900 tracking-tight">${formatCOP(d.monto_acordado)}</p>
                            <p class="text-[9px] text-primary-600 font-black uppercase mt-1 hidden sm:block"><i class="ph ph-pencil-simple mr-0.5"></i> Toca para Editar</p>
                        </div>
                        <button onclick="event.stopPropagation(); B2BModule.deleteDeal('${d.id}', '${aliadoId}')" class="p-2 sm:p-2.5 text-slate-400 hover:text-white hover:bg-red-500 rounded-xl transition-all border border-slate-200 bg-white">
                            <i class="ph ph-trash text-lg"></i>
                        </button>
                    </div>
                </div>`;
        }).join('');

        document.getElementById('b2b-master-body').innerHTML = `
            <input type="hidden" id="master-aliado-id-ref" value="${aliado.id}">

            <div class="mb-8 p-4 md:p-5 bg-white rounded-3xl border border-slate-100 shadow-sm">
                
                <div class="flex justify-between items-center mb-4 pb-2 border-b border-slate-100">
                    <p class="text-[10px] font-black text-slate-500 uppercase tracking-widest pl-1">Información del aliado</p>
                    <div class="flex items-center gap-2">
                        <span class="text-[9px] font-bold text-slate-400">Editar</span>
                        <label class="b2b-switch" title="Activar para editar los datos">
                            <input type="checkbox" id="master-edit-switch" onchange="B2BModule.toggleMasterEdit()">
                            <span class="b2b-slider"></span>
                        </label>
                    </div>
                </div>
                
                <div class="space-y-3" id="master-aliado-info-fields">
                    <input type="text" id="master-al-empresa" value="${UI.sanitize(aliado.nombre_empresa)}" readonly class="w-full px-4 py-3 border border-slate-200/60 rounded-xl text-base font-black text-slate-800 shadow-none outline-none transition-all" placeholder="Nombre Empresa">
                    
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div class="relative bg-white p-1 rounded-xl border border-slate-200/60 shadow-none">
                            <span class="absolute -top-2 left-3 bg-white px-1 text-[9px] font-black text-slate-400 uppercase">Contacto</span>
                            <input type="text" id="master-al-contacto" value="${UI.sanitize(aliado.contacto_nombre || '')}" readonly class="w-full px-3 py-2 text-sm font-bold text-slate-700 outline-none rounded-lg bg-transparent" placeholder="No registrado">
                        </div>
                        <div class="relative bg-white p-1 rounded-xl border border-slate-200/60 shadow-none">
                            <span class="absolute -top-2 left-3 bg-white px-1 text-[9px] font-black text-slate-400 uppercase">Celular</span>
                            <input type="text" id="master-al-telefono" value="${UI.sanitize(aliado.telefono || '')}" readonly class="w-full px-3 py-2 text-sm font-bold text-slate-700 outline-none rounded-lg bg-transparent" placeholder="No registrado">
                        </div>
                    </div>
                    
                    <div class="relative bg-white p-1 rounded-xl border border-slate-200/60 shadow-none flex items-center">
                        <span class="absolute -top-2 left-3 bg-white px-1 text-[9px] font-black text-slate-400 uppercase flex items-center"><i class="ph ph-instagram-logo mr-0.5 text-pink-500"></i> IG Link</span>
                        <input type="url" id="master-al-instagram" value="${UI.sanitize(aliado.instagram || '')}" readonly class="w-full px-3 py-2.5 text-xs font-semibold text-slate-600 outline-none rounded-lg bg-transparent flex-1" placeholder="https://instagram.com/...">
                        ${aliado.instagram ? `<a href="${aliado.instagram}" target="_blank" class="mr-1.5 text-pink-500 hover:bg-pink-50 p-1 rounded-lg transition-colors"><i class="ph ph-link-simple text-lg"></i></a>` : ''}
                    </div>
                </div>

                <div class="mt-4 hidden" id="div-master-save-aliado">
                    <button onclick="B2BModule.updateAliado('${aliado.id}', this)" class="w-full bg-slate-900 text-white font-black px-4 py-3 rounded-xl shadow-lg shadow-slate-900/20 text-[10px] uppercase tracking-widest hover:bg-slate-800 transition-all">
                        <i class="ph ph-floppy-disk mr-1.5 text-base align-middle"></i> Guardar Cambios
                    </button>
                </div>
            </div>

            <div class="flex justify-between items-center mb-4 px-1 shrink-0">
                <h4 class="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center"><i class="ph ph-shopping-bag text-slate-400 mr-1.5"></i> Deals</h4>
                <button onclick="B2BModule.openNewDealForAliado('${aliado.id}')" class="text-[10px] bg-primary-600 text-white font-black uppercase px-3 py-2.5 rounded-xl shadow-lg shadow-primary-600/20 hover:bg-primary-700 hover:-translate-y-0.5 transition-all flex items-center">
                    <i class="ph ph-plus-circle sm:mr-1.5 text-base sm:text-sm align-middle"></i> <span class="hidden sm:inline">Agregar</span>
                </button>
            </div>
            
            <div id="master-deals-list">${dealsHtml || '<p class="text-center py-10 text-slate-400 italic text-xs border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50">Este aliado aún no tiene propuestas.</p>'}</div>`;

        UI.openModal('b2b-master-modal', 'b2b-master-bg', 'b2b-master-content');
    },

    toggleMasterEdit() {
        const switchEl = document.getElementById('master-edit-switch');
        const isChecked = switchEl.checked;
        const fieldsContainer = document.getElementById('master-aliado-info-fields');
        const divSave = document.getElementById('div-master-save-aliado');
        const inputs = fieldsContainer.querySelectorAll('input');

        if (isChecked) {
            UI.showToast('Campos desbloqueados.', 'info');
            inputs.forEach(input => input.removeAttribute('readonly'));
            inputs.forEach(input => input.parentElement.classList.remove('shadow-none'));
            inputs.forEach(input => input.parentElement.classList.add('bg-white', 'border-slate-300'));
            divSave.classList.remove('hidden');
            divSave.classList.add('fade-in');
        } else {
            inputs.forEach(input => input.setAttribute('readonly', true));
            inputs.forEach(input => input.parentElement.classList.add('shadow-none'));
            inputs.forEach(input => input.parentElement.classList.remove('bg-white', 'border-slate-300'));
            divSave.classList.add('hidden');
        }
    },

    async updateAliado(aliadoId, btnEl) {
        const empresa = document.getElementById('master-al-empresa').value.trim();
        const contacto = document.getElementById('master-al-contacto').value.trim();
        const telefono = document.getElementById('master-al-telefono').value.trim();
        const ig = document.getElementById('master-al-instagram').value.trim();

        if (!empresa) return UI.showToast("El nombre es obligatorio.", "error");

        const origHtml = btnEl.innerHTML;
        btnEl.innerHTML = '<i class="ph ph-spinner animate-spin text-lg align-middle"></i>';
        btnEl.disabled = true;

        try {
            const { error } = await supabaseClient.from('b2b_aliados').update({
                nombre_empresa: empresa,
                contacto_nombre: contacto,
                telefono: telefono,
                instagram: ig
            }).eq('id', aliadoId);

            if (error) {
                if (error.code === '42703') throw new Error("Falta columna instagram en BD");
                throw error;
            }

            UI.showToast("Perfil actualizado.", "success");
            await DataService.loadAll();
            this.renderGrid();

            document.getElementById('master-edit-switch').checked = false;
            this.toggleMasterEdit();

            this.openAliadoMaster(aliadoId);

        } catch (e) {
            UI.showToast(e.message === "Falta columna instagram en BD" ? "Error: Falta crear columna instagram en BD" : "Error BD", "error");
        } finally {
            btnEl.innerHTML = origHtml;
            btnEl.disabled = false;
        }
    },

    async deleteDeal(dealId, aliadoId) {
        if (!confirm("¿Estás seguro de eliminar esta venta/propuesta?")) return;
        try {
            const { error } = await supabaseClient.from('b2b_negocios').delete().eq('id', dealId);
            if (error) throw error;
            UI.showToast("Eliminado", "success");
            await DataService.loadAll();
            this.renderGrid();
            this.openAliadoMaster(aliadoId);
        } catch (e) {
            UI.showToast("Error", "error");
        }
    },

    // --- CATÁLOGO B2B (AHORA CON EDITAR Y ELIMINAR) ---
    renderCatalogList() {
        const list = document.getElementById('b2b-catalog-list');
        if (!list) return;

        if (DataService.b2b_servicios.length === 0) {
            list.innerHTML = `<p class="text-xs font-bold text-slate-400 text-center py-6 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50 italic">Tu catálogo está vacío.</p>`;
            return;
        }

        list.innerHTML = DataService.b2b_servicios.map(s => `
            <div class="flex flex-col sm:flex-row sm:justify-between sm:items-center bg-white border border-slate-200/60 p-4 rounded-xl shadow-sm mb-3 gap-2 group hover:shadow-md transition-shadow">
                <div class="pr-2 flex-1">
                    <h4 class="text-sm font-black text-slate-800">${UI.sanitize(s.nombre)}</h4>
                    <p class="text-[10px] font-bold text-slate-400 mt-1 leading-tight">${UI.sanitize(s.descripcion || '')}</p>
                </div>
                <div class="flex items-center justify-between sm:justify-end gap-3 sm:gap-4 shrink-0 border-t sm:border-0 border-slate-100 pt-3 sm:pt-0">
                    <span class="text-xs font-black text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-100">${formatCOP(s.precio_sugerido)}</span>
                    <div class="flex items-center gap-1.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                        <button type="button" onclick="B2BModule.editCatalogItem('${s.id}')" class="p-2 text-slate-400 hover:text-blue-600 bg-slate-50 hover:bg-blue-50 rounded-lg transition-colors border border-slate-200 shadow-sm" title="Editar Servicio"><i class="ph ph-pencil-simple text-base"></i></button>
                        <button type="button" onclick="B2BModule.deleteCatalogItem('${s.id}')" class="p-2 text-slate-400 hover:text-red-600 bg-slate-50 hover:bg-red-50 rounded-lg transition-colors border border-slate-200 shadow-sm" title="Borrar del Catálogo"><i class="ph ph-trash text-base"></i></button>
                    </div>
                </div>
            </div>
        `).join('');
    },

    editCatalogItem(id) {
        const item = DataService.b2b_servicios.find(s => s.id === id);
        if (!item) return;

        // Llenar el formulario con los datos del servicio a editar
        document.getElementById('b2b-cat-id').value = item.id;
        document.getElementById('b2b-cat-nombre').value = item.nombre;
        document.getElementById('b2b-cat-precio').value = item.precio_sugerido;
        document.getElementById('b2b-cat-desc').value = item.descripcion || '';

        // Cambiar la vista de los botones
        document.getElementById('btn-cancel-catalog-edit').classList.remove('hidden');
        document.getElementById('catalog-btn-text').innerText = 'Actualizar Servicio';
        document.getElementById('catalog-btn-icon').className = 'ph ph-pencil-simple mr-2 text-base';

        UI.showToast("Modo edición activado", "info");
    },

    cancelEditCatalogItem() {
        document.getElementById('b2b-catalog-form').reset();
        document.getElementById('b2b-cat-id').value = '';

        const btnCancel = document.getElementById('btn-cancel-catalog-edit');
        const btnText = document.getElementById('catalog-btn-text');
        const btnIcon = document.getElementById('catalog-btn-icon');

        if (btnCancel) btnCancel.classList.add('hidden');
        if (btnText) btnText.innerText = 'Guardar Servicio';
        if (btnIcon) btnIcon.className = 'ph ph-plus-circle mr-2 text-base';
    },

    async saveCatalogItem(event) {
        const form = document.getElementById('b2b-catalog-form');
        if (!form.checkValidity()) { form.reportValidity(); return; }

        const btn = document.getElementById('btn-save-catalog');
        const btnText = document.getElementById('catalog-btn-text');
        const btnIcon = document.getElementById('catalog-btn-icon');
        const id = document.getElementById('b2b-cat-id').value;

        // Animación de carga segura sin destruir los IDs
        if (btn) btn.disabled = true;
        if (btnText) btnText.innerText = 'Procesando...';
        if (btnIcon) btnIcon.className = 'ph ph-spinner animate-spin mr-2 text-base';

        try {
            const payload = {
                nombre: document.getElementById('b2b-cat-nombre').value.trim(),
                precio_sugerido: parseFloat(document.getElementById('b2b-cat-precio').value),
                descripcion: document.getElementById('b2b-cat-desc').value.trim()
            };

            if (id) {
                // MODO EDICIÓN
                const { error } = await supabaseClient.from('b2b_servicios_catalogo').update(payload).eq('id', id);
                if (error) throw error;
                UI.showToast('Servicio actualizado en el catálogo', 'success');

                // Actualizar RAM local sin recargar toda la página
                const idx = DataService.b2b_servicios.findIndex(s => s.id === id);
                if (idx !== -1) DataService.b2b_servicios[idx] = { ...DataService.b2b_servicios[idx], ...payload };

            } else {
                // MODO CREACIÓN
                const { data, error } = await supabaseClient.from('b2b_servicios_catalogo').insert([payload]).select();
                if (error) throw error;
                DataService.b2b_servicios.unshift(data[0]);
                UI.showToast('Servicio maestro agregado', 'success');
            }

            this.renderCatalogList();
            this.setupSelects();
            this.cancelEditCatalogItem(); // Esto reinicia todo a su estado normal de forma segura

        } catch (e) {
            UI.showToast('Error: ' + e.message, 'error');
            // Si hay un error, devolvemos el texto original para que el usuario intente de nuevo
            if (btnText) btnText.innerText = id ? 'Actualizar Servicio' : 'Guardar Servicio';
            if (btnIcon) btnIcon.className = id ? 'ph ph-pencil-simple mr-2 text-base' : 'ph ph-plus-circle mr-2 text-base';
        } finally {
            if (btn) btn.disabled = false;
        }
    },

    async deleteCatalogItem(id) {
        if (!confirm("¿Estás seguro de eliminar este servicio maestro del catálogo? No afectará a los negocios que ya lo tienen guardado, pero desaparecerá de la lista para futuras ventas.")) return;

        try {
            const { error } = await supabaseClient.from('b2b_servicios_catalogo').delete().eq('id', id);
            if (error) throw error;

            // Eliminar de RAM local
            DataService.b2b_servicios = DataService.b2b_servicios.filter(s => s.id !== id);

            this.renderCatalogList();
            this.setupSelects();
            UI.showToast("Servicio eliminado del catálogo", "success");

            // Si estaba editando justo ese que borró, reiniciar
            if (document.getElementById('b2b-cat-id').value === id) {
                this.cancelEditCatalogItem();
            }

        } catch (e) {
            UI.showToast("Error al eliminar de la base de datos", "error");
        }
    },

    // ── FINANZAS B2B ─────────────────────────────────────────────────
    switchTab(tab) {
        const panelAliados  = document.getElementById('b2b-panel-aliados');
        const panelFinanzas = document.getElementById('b2b-panel-finanzas');
        const btnAliados    = document.getElementById('b2b-tab-aliados');
        const btnFinanzas   = document.getElementById('b2b-tab-finanzas');
        if (!panelAliados || !panelFinanzas) return;

        if (tab === 'aliados') {
            panelAliados.classList.remove('hidden');
            panelFinanzas.classList.add('hidden');
            btnAliados.classList.add('bg-slate-900', 'text-white', 'shadow-md');
            btnAliados.classList.remove('text-slate-500');
            btnFinanzas.classList.remove('bg-slate-900', 'text-white', 'shadow-md');
            btnFinanzas.classList.add('text-slate-500');
        } else {
            panelAliados.classList.add('hidden');
            panelFinanzas.classList.remove('hidden');
            btnFinanzas.classList.add('bg-slate-900', 'text-white', 'shadow-md');
            btnFinanzas.classList.remove('text-slate-500');
            btnAliados.classList.remove('bg-slate-900', 'text-white', 'shadow-md');
            btnAliados.classList.add('text-slate-500');
            this.initFinanzas();
        }
    },

    initFinanzas() {
        // Poblar selector de aliados
        const sel = document.getElementById('b2bf-filter-aliado');
        if (!sel) return;
        sel.innerHTML = '<option value="">Todos los Aliados</option>';
        (DataService.b2b_aliados || []).forEach(a => {
            sel.innerHTML += `<option value="${a.id}">${UI.sanitize(a.nombre_empresa)}</option>`;
        });
        this.renderFinanzas();
    },

    getDealsFilter() {
        const aliado  = document.getElementById('b2bf-filter-aliado')?.value || '';
        const periodo = document.getElementById('b2bf-filter-periodo')?.value || 'all';
        const hoy = new Date();

        return (DataService.b2b_negocios || []).filter(b => {
            if (b.estado !== 'cerrado_ganado') return false;
            if (aliado && b.aliado_id !== aliado) return false;

            if (periodo !== 'all') {
                const fecha = b.fecha_cierre ? new Date(b.fecha_cierre) : new Date(b.created_at);
                const diffMes = (hoy.getFullYear() - fecha.getFullYear()) * 12 + (hoy.getMonth() - fecha.getMonth());
                if (periodo === 'mes' && diffMes !== 0) return false;
                if (periodo === '3m' && diffMes > 3) return false;
                if (periodo === '6m' && diffMes > 6) return false;
            }
            return true;
        });
    },

    renderFinanzas() {
        const deals = this.getDealsFilter();
        const totalFacturado = deals.reduce((s, d) => s + parseFloat(d.monto_acordado || 0), 0);
        const ticketProm = deals.length > 0 ? totalFacturado / deals.length : 0;

        // Mejor aliado
        const porAliado = {};
        deals.forEach(d => {
            const aliado = (DataService.b2b_aliados || []).find(a => a.id === d.aliado_id);
            const nom = aliado ? aliado.nombre_empresa : 'Desconocido';
            porAliado[nom] = (porAliado[nom] || 0) + parseFloat(d.monto_acordado || 0);
        });
        const topAliado = Object.entries(porAliado).sort((a, b) => b[1] - a[1])[0];

        // KPIs
        document.getElementById('b2bf-total').innerText   = formatCOP(totalFacturado);
        document.getElementById('b2bf-deals').innerText   = deals.length;
        document.getElementById('b2bf-ticket').innerText  = formatCOP(ticketProm);
        document.getElementById('b2bf-top-aliado').innerText = topAliado ? topAliado[0] : '—';
        document.getElementById('b2bf-deals-count').innerText = `${deals.length} registros`;

        // Tabla de deals
        const tbody = document.getElementById('b2bf-deals-body');
        tbody.innerHTML = '';
        if (deals.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="py-8 text-center text-slate-400 text-xs font-medium italic">No hay deals cerrados para este filtro.</td></tr>';
        } else {
            deals.sort((a, b) => new Date(b.fecha_cierre || b.created_at) - new Date(a.fecha_cierre || a.created_at));
            deals.forEach(d => {
                const aliado  = (DataService.b2b_aliados || []).find(a => a.id === d.aliado_id);
                const serv    = (DataService.b2b_servicios || []).find(s => s.id === d.servicio_id);
                const monto   = parseFloat(d.monto_acordado || 0);
                const fecha   = d.fecha_cierre
                    ? new Date(d.fecha_cierre).toLocaleDateString('es-CO', { day:'numeric', month:'short', year:'numeric' })
                    : '—';
                tbody.innerHTML += `
                    <tr class="hover:bg-slate-50 transition-colors">
                        <td class="py-3 px-4 text-xs font-bold text-slate-800">${UI.sanitize(aliado?.nombre_empresa || '—')}</td>
                        <td class="py-3 px-4 text-xs text-slate-600 font-medium">${UI.sanitize(serv?.nombre || d.nombre_prospecto || '—')}</td>
                        <td class="py-3 px-4 text-xs text-slate-500 font-medium">${fecha}</td>
                        <td class="py-3 px-4 text-xs font-black text-emerald-700 text-right">${formatCOP(monto)}</td>
                    </tr>`;
            });
        }

        // Distribución de Socios
        this.renderSociosSplitB2B(totalFacturado);
    },

    renderSociosSplitB2B(totalB2B) {
        const container = document.getElementById('b2bf-socios-cards');
        if (!container) return;
        container.innerHTML = '';

        const socios = JSON.parse(localStorage.getItem('trv_socios') || '[]');
        if (socios.length === 0) {
            container.innerHTML = '<p class="text-xs text-slate-400 font-medium">Configura los socios en la Bóveda de Socios primero.</p>';
            return;
        }

        const rol = window.AuthModule?.userProfile?.rol;
        const isAdmin = rol === 'administrador' || rol === 'socio_mayoritario';
        const meEmail = window.AuthModule?.currentUser?.email?.toLowerCase();

        socios.forEach(soc => {
            const esMio = soc.email.toLowerCase() === meEmail;
            const monto = totalB2B * (soc.porcentaje / 100);
            const puedeVer = isAdmin || esMio;
            const extra = esMio ? 'ring-2 ring-indigo-500 bg-indigo-50/50' : 'bg-slate-50';

            container.innerHTML += `
                <div class="border border-slate-200 rounded-xl px-4 py-3 flex items-center gap-3 ${extra} shadow-sm">
                    <div class="w-9 h-9 rounded-full bg-slate-200 flex items-center justify-center text-xs font-black text-slate-600 shrink-0">
                        ${soc.nombre.substring(0,2).toUpperCase()}
                    </div>
                    <div>
                        <p class="text-[10px] font-black text-slate-800 uppercase tracking-widest">${soc.nombre} <span class="text-[8px] bg-slate-200 px-1 py-0.5 rounded font-black">${soc.porcentaje}%</span></p>
                        <p class="text-xs font-black ${esMio ? 'text-indigo-700' : 'text-slate-600'}">${puedeVer ? formatCOP(monto) : '***'}</p>
                    </div>
                </div>`;
        });
    }
};

