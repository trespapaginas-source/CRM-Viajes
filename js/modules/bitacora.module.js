// ============================================================
// js/modules/bitacora.module.js — Timeline de Seguimientos
// Cross-module: window.AuthModule, window.ClientsModule
// Extraído de app.js líneas 3087–3188
// ============================================================
import { DataService, supabaseClient } from '../services/supabase.service.js';
import { UI } from '../utils/ui.utils.js';
import { formatShortDate } from '../utils/format.utils.js';

export const BitacoraModule = {
    renderTimeline(clienteId) {
        const list = document.getElementById('bitacora-timeline-list');
        if (!list) return;
        const seguimientos = DataService.seguimientos.filter(s => s.cliente_id === clienteId);

        if (seguimientos.length === 0) {
            list.innerHTML = '<li class="text-center text-slate-400 text-[10px] font-black uppercase tracking-widest py-6 bg-slate-50 rounded-xl border border-slate-100">Sin historial de seguimiento</li>';
            return;
        }

        list.innerHTML = '';
        seguimientos.forEach(seg => {
            const isCompleted = seg.estado === 'completado';
            const iconBg = isCompleted ? 'bg-green-100 border-green-200 text-green-600' : 'bg-indigo-100 border-indigo-200 text-indigo-600';
            const icon = isCompleted ? 'ph-check-circle' : 'ph-clock';
            const badge = isCompleted
                ? '<span class="text-[9px] bg-green-50 text-green-600 px-1.5 py-0.5 rounded uppercase font-black tracking-widest border border-green-200 ml-2">Completado</span>'
                : `<button onclick="BitacoraModule.marcarCompletado('${seg.id}', '${clienteId}')" class="text-[9px] bg-indigo-600 hover:bg-indigo-700 text-white px-2 py-1 rounded uppercase font-black tracking-widest shadow-sm ml-2 transition-colors">Marcar Hecho</button>`;

            list.innerHTML += `
                <li class="flex items-start group">
                    <div class="w-10 h-10 rounded-full border-2 ${iconBg} flex items-center justify-center shrink-0 relative z-10 shadow-sm bg-white"><i class="ph ${icon} text-xl"></i></div>
                    <div class="ml-4 bg-white p-4 border border-slate-100 rounded-2xl shadow-sm flex-1 group-hover:shadow-md transition-shadow">
                        <div class="flex justify-between items-start mb-1">
                            <p class="text-xs font-black text-slate-800 uppercase tracking-widest">${formatShortDate(seg.fecha_programada)}</p>
                            ${badge}
                        </div>
                        <p class="text-sm text-slate-600 font-medium leading-relaxed my-2">${UI.sanitize(seg.nota)}</p>
                        <p class="text-[9px] text-slate-400 uppercase font-bold tracking-widest border-t border-slate-100 pt-2 mt-2">Creado por: ${UI.sanitize(seg.creado_por || 'Staff')}</p>
                    </div>
                </li>`;
        });
    },

    async saveNota() {
        const cId = document.getElementById('cf-id').value;
        if (!cId) return UI.showToast("Guarda la reserva primero.", "error");

        const fecha = document.getElementById('bit-fecha').value;
        const nota = document.getElementById('bit-nota').value.trim();
        const btn = document.getElementById('btn-save-bitacora');
        if (!fecha || !nota) return UI.showToast("Debes ingresar fecha y nota.", "error");

        const pH = btn.innerHTML;
        btn.innerHTML = '<i class="ph ph-spinner animate-spin"></i>';
        btn.disabled = true;

        try {
            const { error } = await supabaseClient.from('seguimientos').insert([{
                cliente_id: cId, fecha_programada: fecha, nota,
                estado: 'pendiente',
                creado_por: window.AuthModule.currentUser?.email || 'Staff'
            }]);

            if (error) {
                if (error.code === '42P01') throw new Error("TABLA_NO_EXISTE");
                throw error;
            }

            document.getElementById('bit-fecha').value = '';
            document.getElementById('bit-nota').value = '';
            await DataService.loadAll();
            this.renderTimeline(cId);
            
            UI.showToast("Seguimiento agendado correctamente.", "success");
        } catch (e) {
            if (e.message === "TABLA_NO_EXISTE") UI.showToast("Aviso DB: Crea la tabla 'seguimientos' en Supabase.", "error");
            else UI.showToast("Falla técnica al agendar.", "error");
        } finally {
            btn.innerHTML = pH;
            btn.disabled = false;
        }
    },

    async marcarCompletado(id, cId) {
        try {
            await supabaseClient.from('seguimientos').update({ estado: 'completado' }).eq('id', id);
            await DataService.loadAll();
            this.renderTimeline(cId);
            
            UI.showToast("Seguimiento finalizado.", "success");
        } catch (e) {
            UI.showToast("Error al actualizar estado.", "error");
        }
    }
};
