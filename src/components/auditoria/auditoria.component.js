import { supabaseClient, DataService } from '../../../js/services/supabase.service.js';
import { formatCOP, parseSpanishDate } from '../../../js/utils/format.utils.js';

export const AuditoriaComponent = {
    init: function() {
        this.bindEvents();
    },

    bindEvents: function() {
        // Asumiendo que se creará un botón en el menú lateral o en algún lugar
        document.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-action="open-auditoria"]');
            if (btn) {
                this.openAuditoriaModal();
            }

            const restoreBtn = e.target.closest('[data-action="restore-record"]');
            if (restoreBtn) {
                this.restoreRecord(restoreBtn.dataset.table, restoreBtn.dataset.id);
            }

            const hardDeleteBtn = e.target.closest('[data-action="hard-delete-record"]');
            if (hardDeleteBtn) {
                this.hardDeleteRecord(hardDeleteBtn.dataset.table, hardDeleteBtn.dataset.id);
            }
        });
    },

    openAuditoriaModal: async function() {
        const modal = document.getElementById('auditoria-modal');
        if (!modal) return;

        window.UI.openModal('auditoria-modal', 'auditoria-bg', 'auditoria-content');
        this.renderLoader();
        await this.loadDeletedRecords();
    },

    closeAuditoriaModal: function() {
        window.UI.closeModal('auditoria-modal', 'auditoria-bg', 'auditoria-content');
    },

    renderLoader: function() {
        const list = document.getElementById('auditoria-list');
        if (list) {
            list.innerHTML = `<tr><td colspan="5" class="py-10 text-center"><i class="ph ph-spinner animate-spin text-3xl text-slate-300"></i><p class="text-xs text-slate-400 mt-2">Buscando en la papelera...</p></td></tr>`;
        }
    },

    loadDeletedRecords: async function() {
        try {
            // Buscamos en todas las tablas donde deleted_at is not null
            const [clientes, abonos, proveedores, planes, gastosCorp, movimientos, gastosSalidas] = await Promise.all([
                supabaseClient.from('clientes').select('id, nombre, apellido, deleted_at, deleted_by').not('deleted_at', 'is', null),
                supabaseClient.from('abonos').select('id, monto, metodo, cliente_id, deleted_at, deleted_by').not('deleted_at', 'is', null),
                supabaseClient.from('proveedores').select('id, razon_social, deleted_at, deleted_by').not('deleted_at', 'is', null),
                supabaseClient.from('planes').select('id, nombre, deleted_at, deleted_by').not('deleted_at', 'is', null),
                supabaseClient.from('gastos_corporativos').select('id, concepto, monto, deleted_at, deleted_by').not('deleted_at', 'is', null),
                supabaseClient.from('socios_movimientos').select('id, concepto, monto, tipo, socio_email, deleted_at, deleted_by').not('deleted_at', 'is', null),
                supabaseClient.from('gastos_salidas').select('id, concepto, costo, deleted_at, deleted_by').not('deleted_at', 'is', null)
            ]);

            const allDeleted = [];

            if (clientes.data) clientes.data.forEach(x => allDeleted.push({ table: 'clientes', id: x.id, desc: `Reserva: ${x.nombre} ${x.apellido}`, date: x.deleted_at, by: x.deleted_by }));
            if (abonos.data) abonos.data.forEach(x => allDeleted.push({ table: 'abonos', id: x.id, desc: `Abono de ${formatCOP(x.monto)} por ${x.metodo}`, date: x.deleted_at, by: x.deleted_by }));
            if (proveedores.data) proveedores.data.forEach(x => allDeleted.push({ table: 'proveedores', id: x.id, desc: `Proveedor: ${x.razon_social}`, date: x.deleted_at, by: x.deleted_by }));
            if (planes.data) planes.data.forEach(x => allDeleted.push({ table: 'planes', id: x.id, desc: `Plan: ${x.nombre}`, date: x.deleted_at, by: x.deleted_by }));
            if (gastosCorp.data) gastosCorp.data.forEach(x => allDeleted.push({ table: 'gastos_corporativos', id: x.id, desc: `Gasto Corporativo: ${x.concepto} (${formatCOP(x.monto)})`, date: x.deleted_at, by: x.deleted_by }));
            if (movimientos.data) movimientos.data.forEach(x => allDeleted.push({ table: 'socios_movimientos', id: x.id, desc: `${x.tipo === 'retiro' ? 'Retiro' : 'Corte'} de Socio: ${x.concepto} (${formatCOP(x.monto)}) [${x.socio_email}]`, date: x.deleted_at, by: x.deleted_by }));
            if (gastosSalidas.data) gastosSalidas.data.forEach(x => allDeleted.push({ table: 'gastos_salidas', id: x.id, desc: `Gasto Operativo: ${x.concepto} (${formatCOP(x.costo)})`, date: x.deleted_at, by: x.deleted_by }));

            allDeleted.sort((a, b) => new Date(b.date) - new Date(a.date));
            this.renderList(allDeleted);

        } catch (e) {
            console.error("Error cargando auditoría", e);
            const list = document.getElementById('auditoria-list');
            if (list) list.innerHTML = `<tr><td colspan="5" class="py-10 text-center text-red-500">Error cargando papelera</td></tr>`;
        }
    },

    renderList: function(records) {
        const list = document.getElementById('auditoria-list');
        if (!list) return;

        if (records.length === 0) {
            list.innerHTML = `<tr><td colspan="5" class="py-10 text-center"><i class="ph ph-check-circle text-3xl text-emerald-300"></i><p class="text-xs text-slate-500 mt-2 font-medium">La papelera está limpia</p></td></tr>`;
            return;
        }

        let html = '';
        records.forEach(r => {
            const dateObj = new Date(r.date);
            const dateStr = dateObj.toLocaleDateString('es-CO') + ' ' + dateObj.toLocaleTimeString('es-CO', {hour: '2-digit', minute:'2-digit'});
            
            html += `
                <tr class="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td class="py-3 px-4 whitespace-nowrap text-xs text-slate-500">${dateStr}</td>
                    <td class="py-3 px-4 whitespace-nowrap font-semibold text-xs text-slate-700">${r.by || 'Desconocido'}</td>
                    <td class="py-3 px-4 whitespace-nowrap text-[10px]"><span class="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded uppercase font-black">${r.table}</span></td>
                    <td class="py-3 px-4 text-xs text-slate-600 max-w-xs truncate" title="${window.UI.sanitize(r.desc)}">${window.UI.sanitize(r.desc)}</td>
                    <td class="py-3 px-4 whitespace-nowrap text-right">
                        <button data-action="restore-record" data-table="${r.table}" data-id="${r.id}" class="text-emerald-600 bg-emerald-50 hover:bg-emerald-100 px-2 py-1 rounded text-[10px] font-bold transition-colors mr-1"><i class="ph ph-arrow-counter-clockwise"></i> Restaurar</button>
                        <button data-action="hard-delete-record" data-table="${r.table}" data-id="${r.id}" class="text-red-600 bg-red-50 hover:bg-red-100 px-2 py-1 rounded text-[10px] font-bold transition-colors"><i class="ph ph-trash"></i> Destruir</button>
                    </td>
                </tr>
            `;
        });
        list.innerHTML = html;
    },

    restoreRecord: async function(table, id) {
        if (!confirm("¿Deseas restaurar este registro y devolverlo al sistema?")) return;
        try {
            const { error } = await supabaseClient.from(table).update({ deleted_at: null, deleted_by: null }).eq('id', id);
            if (error) throw error;
            window.UI.showToast("Registro restaurado con éxito.", "success");
            await this.loadDeletedRecords();
            // Refrescar BD global para que reaparezca
            await DataService.loadAll(); 
            // Si estamos en la vista de socios, forzar recarga
            if (window.PartnersComponent) {
                if (table === 'gastos_corporativos') await window.PartnersComponent.loadCorporateExpenses();
                if (table === 'socios_movimientos') await window.PartnersComponent.loadMovements();
            }
        } catch (e) {
            console.error(e);
            window.UI.showToast("Error al restaurar.", "error");
        }
    },

    hardDeleteRecord: async function(table, id) {
        if (!confirm("⚠️ ADVERTENCIA: Esta acción destruirá el registro de forma permanente en la base de datos y NO se puede deshacer. ¿Continuar?")) return;
        try {
            const { error } = await supabaseClient.from(table).delete().eq('id', id);
            if (error) throw error;
            window.UI.showToast("Registro destruido permanentemente.", "success");
            await this.loadDeletedRecords();
        } catch (e) {
            console.error(e);
            window.UI.showToast("Error al destruir.", "error");
        }
    }
};

window.AuditoriaComponent = AuditoriaComponent;
