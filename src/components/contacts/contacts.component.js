// src/components/contacts/contacts.component.js — Componente de Vista para Contactos
// Totalmente desacoplado de window. Data reactiva desde Store.

import { Store } from '../../core/store.js';
import { UI } from '../../../js/utils/ui.utils.js';

export const ContactsComponent = {
    init() {
        this.bindEvents();
        
        // Primera renderización manual y poblado de filtros si ya hay datos
        this.populateFilters(Store.getState());
        this.renderTable(Store.getState());

        // Reactividad: Nos suscribimos a los cambios del Store
        Store.subscribe((state) => {
            this.populateFilters(state);
            this.renderTable(state);
        });
    },

    bindEvents() {
        const btnExport = document.getElementById('btn-export-contacts');
        if (btnExport) btnExport.addEventListener('click', () => this.exportCSV());

        const btnReset = document.getElementById('btn-reset-contacts-filters');
        if (btnReset) btnReset.addEventListener('click', () => this.resetFilters());

        ['filter-contact-plan', 'filter-contact-ciudad', 'filter-contact-desde', 'filter-contact-hasta'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('change', () => this.renderTable(Store.getState()));
        });
    },

    populateFilters(state) {
        const sP = document.getElementById('filter-contact-plan');
        const sC = document.getElementById('filter-contact-ciudad');
        if (!sP || !sC) return;
        
        // Guardamos los valores actuales para no perder la selección al re-renderizar
        const currentPlan = sP.value;
        const currentCiudad = sC.value;

        sP.innerHTML = '<option value="">Todos los Planes</option>';
        sC.innerHTML = '<option value="">Todas las Ciudades</option>';
        
        [...new Set(state.planes.map(p => p.nombre))].forEach(p => {
            sP.innerHTML += `<option value="${UI.sanitize(p)}">${UI.sanitize(p)}</option>`
        });
        
        [...new Set(state.clientes.map(c => c.ciudad).filter(Boolean))].forEach(c => {
            sC.innerHTML += `<option value="${UI.sanitize(c)}">${UI.sanitize(c)}</option>`
        });

        // Restaurar valores si existen
        if (currentPlan) sP.value = currentPlan;
        if (currentCiudad) sC.value = currentCiudad;
    },

    getFilteredData(state) {
        if (!state) state = Store.getState();
        const fPlan = document.getElementById('filter-contact-plan')?.value || "";
        const fCiudad = document.getElementById('filter-contact-ciudad')?.value || "";
        const fDesde = document.getElementById('filter-contact-desde')?.value;
        const fHasta = document.getElementById('filter-contact-hasta')?.value;

        return state.clientes.filter(c => {
            const plan = state.planes.find(p => p.id === c.plan_id);
            const planNom = plan ? plan.nombre : 'Plan No Especificado';
            const matchPlan = fPlan === "" || planNom === fPlan;
            const matchCiudad = fCiudad === "" || (c.ciudad && c.ciudad === fCiudad);
            let matchFecha = true;
            const cDate = new Date(c.created_at); cDate.setHours(0, 0, 0, 0);
            if (fDesde && cDate < new Date(fDesde + "T00:00:00")) matchFecha = false;
            if (fHasta && cDate > new Date(fHasta + "T00:00:00")) matchFecha = false;
            return matchPlan && matchCiudad && matchFecha;
        });
    },

    resetFilters() {
        document.getElementById('filter-contact-plan').value = "";
        document.getElementById('filter-contact-ciudad').value = "";
        document.getElementById('filter-contact-desde').value = "";
        document.getElementById('filter-contact-hasta').value = "";
        this.renderTable(Store.getState());
    },

    renderTable(state) {
        if (!state) state = Store.getState();
        const tb = document.getElementById('contacts-table-body');
        if (!tb) return;
        tb.innerHTML = '';
        const data = this.getFilteredData(state);

        if (data.length === 0) {
            tb.innerHTML = '<tr><td colspan="5" class="py-6 text-center text-sm text-slate-400 italic font-medium">No hay contactos que coincidan con los filtros.</td></tr>';
            return;
        }

        const fragment = document.createDocumentFragment();
        data.forEach(c => {
            const plan = state.planes.find(p => p.id === c.plan_id);
            const planNom = plan ? plan.nombre : 'Plan No Especificado';
            const fechaStr = new Date(c.created_at).toLocaleDateString('es-CO', { year: 'numeric', month: 'short', day: 'numeric' });
            const tr = document.createElement('tr');
            tr.className = 'hover:bg-slate-50 transition border-b border-slate-50';
            tr.innerHTML = `
                <td class="py-3 px-4"><p class="font-bold text-slate-800 text-sm">${UI.sanitize(c.nombre)} ${UI.sanitize(c.apellido)}</p><p class="text-[10px] text-slate-400 font-mono tracking-wide mt-0.5"><i class="ph ph-identification-card"></i> ${UI.sanitize(c.documento)}</p></td>
                <td class="py-3 px-4"><p class="text-xs font-bold text-slate-700">${UI.sanitize(c.telefono)}</p><p class="text-[10px] text-slate-400 truncate w-32" title="${UI.sanitize(c.email || 'Sin correo')}">${UI.sanitize(c.email || 'N/A')}</p></td>
                <td class="py-3 px-4 text-xs font-medium text-slate-600">${UI.sanitize(c.ciudad || 'No registrada')}</td>
                <td class="py-3 px-4"><p class="font-bold text-primary-700 text-xs">${UI.sanitize(planNom)}</p></td>
                <td class="py-3 px-4 text-xs font-medium text-slate-500">${fechaStr}</td>`;
            fragment.appendChild(tr);
        });
        tb.appendChild(fragment);
    },

    exportCSV() {
        const state = Store.getState();
        const dataToExport = this.getFilteredData(state);
        if (dataToExport.length === 0) return UI.showToast("No hay contactos para exportar con estos filtros.", "error");

        let csvContent = "data:text/csv;charset=utf-8,";
        csvContent += "Nombre,Apellido,Documento,Telefono,Email,Ciudad,Plan Interes,Fecha Registro\n";

        dataToExport.forEach(c => {
            const plan = state.planes.find(p => p.id === c.plan_id);
            const planNom = plan ? plan.nombre.replace(/,/g, "") : 'N/A';
            const nom = (c.nombre || "").replace(/,/g, "");
            const ape = (c.apellido || "").replace(/,/g, "");
            const ciu = (c.ciudad || "N/A").replace(/,/g, "");
            const ema = (c.email || "N/A").replace(/,/g, "");
            const fec = new Date(c.created_at).toLocaleDateString('es-CO');
            csvContent += `${nom},${ape},${c.documento},${c.telefono},${ema},${ciu},${planNom},${fec}\n`;
        });

        const link = document.createElement("a");
        link.setAttribute("href", encodeURI(csvContent));
        link.setAttribute("download", `Contactos_Vive_Travel_${new Date().getTime()}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        UI.showToast(`Archivo Excel generado exitosamente con ${dataToExport.length} contactos.`, "success");
    }
};
