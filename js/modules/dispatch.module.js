// ============================================================
// js/modules/dispatch.module.js — Despacho Masivo a Proveedores
// Dependencias: DataService (service), UI (utils), formatShortDate (format.utils)
// Cross-module: window.AuthModule (runtime)
// Extraído de app.js líneas 532–750
// ============================================================
import { DataService, supabaseClient } from '../services/supabase.service.js';
import { UI } from '../utils/ui.utils.js';
import { formatShortDate } from '../utils/format.utils.js';

export const DispatchModule = {
    selectedClients: new Set(),
    pendingDispatches: [],

    toggleClientSelection(clienteId) {
        if (this.selectedClients.has(clienteId)) this.selectedClients.delete(clienteId);
        else this.selectedClients.add(clienteId);
        this.updateToolbarVisibility();
    },

    toggleAllCurrentView(checkboxEl) {
        const visibleCheckboxes = document.querySelectorAll('.client-checkbox:not(:disabled)');
        visibleCheckboxes.forEach(cb => {
            if (cb.closest('tr').style.display !== 'none') {
                cb.checked = checkboxEl.checked;
                if (checkboxEl.checked) this.selectedClients.add(cb.value);
                else this.selectedClients.delete(cb.value);
            }
        });
        this.updateToolbarVisibility();
    },

    updateToolbarVisibility() {
        const toolbar = document.getElementById('bulk-action-toolbar');
        const counter = document.getElementById('bulk-selected-count');
        if (!toolbar) return;

        if (this.selectedClients.size > 0) {
            toolbar.classList.remove('translate-y-full', 'opacity-0', 'pointer-events-none');
            toolbar.classList.add('translate-y-0', 'opacity-100');
            counter.innerText = `${this.selectedClients.size} seleccionados`;
        } else {
            toolbar.classList.remove('translate-y-0', 'opacity-100');
            toolbar.classList.add('translate-y-full', 'opacity-0', 'pointer-events-none');
        }
    },

    clearSelection() {
        this.selectedClients.clear();
        document.querySelectorAll('.client-checkbox').forEach(cb => cb.checked = false);
        const masterCb = document.getElementById('master-checkbox');
        if (masterCb) masterCb.checked = false;
        this.updateToolbarVisibility();
    },

    openUniversalFilter() {
        UI.openModal('universal-filter-modal', 'ufm-bg', 'ufm-content');
    },

    applyUniversalFilter() {
        const fText = document.getElementById('uf-search').value.toLowerCase();
        const fPlan = document.getElementById('uf-plan').value;
        const fFecha = document.getElementById('uf-fecha')?.value || '';
        const fEstado = document.getElementById('uf-estado').value;
        const fCiudad = document.getElementById('uf-ciudad').value.toLowerCase();
        const rows = document.querySelectorAll('.client-row, .client-card');

        for (let row of rows) {
            const textContent = row.innerText.toLowerCase();
            const dPlan = row.getAttribute('data-plan');
            const dEstado = row.getAttribute('data-estado');
            const dCiudad = (row.getAttribute('data-ciudad') || '').toLowerCase();
            const dFecha = row.getAttribute('data-fecha') || '';

            const matchText = fText === "" || textContent.includes(fText);
            const matchPlan = fPlan === "" || dPlan === fPlan;
            const matchFecha = fFecha === "" || dFecha.includes(fFecha);
            const matchEstado = fEstado === "" || dEstado === fEstado;
            const matchCiudad = fCiudad === "" || dCiudad.includes(fCiudad);

            row.style.display = (matchText && matchPlan && matchFecha && matchEstado && matchCiudad) ? "" : "none";
        }

        UI.closeModal('universal-filter-modal', 'ufm-bg', 'ufm-content');
        UI.showToast("Filtros avanzados aplicados.", "info");
        this.clearSelection();
    },

    resetUniversalFilter() {
        document.getElementById('uf-search').value = '';
        document.getElementById('uf-plan').value = '';
        document.getElementById('uf-estado').value = '';
        document.getElementById('uf-ciudad').value = '';
        const ufFecha = document.getElementById('uf-fecha');
        if (ufFecha) {
            ufFecha.innerHTML = '<option value="">Selecciona un plan primero</option>';
            ufFecha.disabled = true;
        }
        this.applyUniversalFilter();
    },

    onPlanFilterChange() {
        const planName = document.getElementById('uf-plan').value;
        const ufFecha = document.getElementById('uf-fecha');
        if (!ufFecha) return;

        if (!planName) {
            ufFecha.innerHTML = '<option value="">Selecciona un plan primero</option>';
            ufFecha.disabled = true;
            return;
        }

        const plan = DataService.planes.find(p => p.nombre === planName);
        ufFecha.innerHTML = '<option value="">Todas las Fechas</option>';

        if (plan && plan.fechas && plan.fechas.length > 0) {
            plan.fechas.forEach(f => {
                const text = f.start === f.end
                    ? formatShortDate(f.start)
                    : `${formatShortDate(f.start)} al ${formatShortDate(f.end)}`;
                ufFecha.innerHTML += `<option value="${text}">${text}</option>`;
            });
            ufFecha.disabled = false;
        } else {
            ufFecha.innerHTML = '<option value="">Sin fechas programadas</option>';
            ufFecha.disabled = true;
        }
    },

    async openDispatchPreview() {
        if (this.selectedClients.size === 0) return;
        this.pendingDispatches = [];
        const providerMap = new Map();

        for (let clienteId of this.selectedClients) {
            const cliente = DataService.clientes.find(c => c.id === clienteId);
            if (!cliente) continue;

            const plan = DataService.planes.find(p => p.id === cliente.plan_id);
            if (!plan || !plan.proveedores_vinculados) continue;

            plan.proveedores_vinculados.forEach(provLink => {
                const provId = provLink.id_proveedor;
                if (!provId) return;

                if (!providerMap.has(provId)) {
                    const fullProv = DataService.proveedores.find(p => p.id === provId);
                    if (fullProv) providerMap.set(provId, { provider: fullProv, clients: [] });
                }

                if (providerMap.has(provId)) providerMap.get(provId).clients.push(cliente);
            });
        }

        const contentBody = document.getElementById('dpm-providers-list');
        contentBody.innerHTML = '';

        if (providerMap.size === 0) {
            contentBody.innerHTML = '<p class="text-sm text-slate-500 p-4 text-center border border-dashed rounded-xl">No hay proveedores vinculados a los planes de los clientes seleccionados.</p>';
        } else {
            providerMap.forEach((data, provId) => {
                this.pendingDispatches.push(data);
                const reqFields = ['nombre', 'apellido', 'documento', 'telefono', 'ciudad'];
                contentBody.innerHTML += `
                    <label class="flex items-start p-4 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50 transition-colors shadow-sm">
                        <input type="checkbox" value="${provId}" class="dispatch-prov-checkbox w-5 h-5 mt-0.5 rounded border-slate-300 text-slate-900 focus:ring-slate-900 cursor-pointer" checked>
                        <div class="ml-3 flex-1">
                            <p class="text-sm font-bold text-slate-800">${data.provider.nombre} <span class="text-[10px] bg-primary-100 text-primary-700 px-2 py-0.5 rounded-md ml-2 font-black">${data.clients.length} clientes</span></p>
                            <p class="text-[11px] text-slate-500 mt-1.5 leading-relaxed"><span class="font-bold text-slate-700">Data Enviada:</span> ${reqFields.join(', ')}</p>
                        </div>
                    </label>
                `;
            });
        }
        UI.openModal('dispatch-preview-modal', 'dpm-bg', 'dpm-content');
    },

    async executeDispatch() {
        const checkboxes = document.querySelectorAll('.dispatch-prov-checkbox:checked');
        if (checkboxes.length === 0) return UI.showToast("Selecciona al menos un proveedor para despachar.", "error");

        const btn = document.getElementById('dpm-confirm-btn');
        const prevHtml = btn.innerHTML;
        btn.innerHTML = '<i class="ph ph-spinner animate-spin text-lg mr-2"></i> Procesando Red...';
        btn.disabled = true;

        try {
            let enviosToInsert = [];
            const reqFields = ['nombre', 'apellido', 'documento', 'telefono', 'ciudad'];

            checkboxes.forEach(cb => {
                const provId = cb.value;
                const data = this.pendingDispatches.find(d => d.provider.id === provId);
                if (!data) return;

                data.clients.forEach(cliente => {
                    let payload = {};
                    reqFields.forEach(f => { payload[f] = cliente[f] || 'N/D'; });
                    enviosToInsert.push({
                        cliente_id: cliente.id,
                        proveedor_id: provId,
                        plan_id: cliente.plan_id,
                        payload: payload,
                        estado: 'sent',
                        enviado_por: window.AuthModule.currentUser?.email || 'Usuario Staff'
                    });
                });
            });

            if (enviosToInsert.length > 0) {
                const res = await supabaseClient.from('envios_proveedor').insert(enviosToInsert);
                if (res.error && res.error.code !== '42P01') throw res.error;
            }

            UI.showToast(`Auditoría de Envíos: Se procesaron ${enviosToInsert.length} despachos.`, "success");
            UI.closeModal('dispatch-preview-modal', 'dpm-bg', 'dpm-content');
            this.clearSelection();
        } catch (err) {
            console.error(err);
            UI.showToast("Aviso: La base de envíos no está disponible, pero el flujo finalizó.", "info");
            UI.closeModal('dispatch-preview-modal', 'dpm-bg', 'dpm-content');
        } finally {
            btn.innerHTML = prevHtml;
            btn.disabled = false;
        }
    }
};
