import { DataService, supabaseClient } from '../../../js/services/supabase.service.js';
import { Store } from '../../core/store.js';
import { UI } from '../../../js/utils/ui.utils.js';
import { formatCOP } from '../../../js/utils/format.utils.js';

export const InternacionalesComponent = {
    eventsBound: false,

    init() {
        this.bindEvents();
        this.renderTable();

        Store.subscribe((state) => {
            if (state.lastUpdated === 'full' || state.lastUpdated === 'clientes' || state.lastUpdated === 'planes' || state.lastUpdated === 'abonos') {
                this.renderTable();
            }
        });
    },

    bindEvents() {
        if (this.eventsBound) return;

        // Delegación de clicks
        document.body.addEventListener('click', (e) => {
            const target = e.target.closest('[data-action]');
            if (!target) return;

            const action = target.dataset.action;

            if (action === 'open-int-form') {
                this.openFormModal();
            } else if (action === 'close-int-form' || e.target.id === 'internacional-form-bg') {
                this.closeFormModal();
            } else if (action === 'add-int-passenger') {
                this.addPassengerRow();
            } else if (action === 'edit-int') {
                this.editInternacional(target.dataset.id);
            } else if (action === 'delete-int') {
                // Prevenir que el click en el botón de eliminar dispare el click de la fila (edit)
                e.stopPropagation();
                this.deleteInternacional(target.dataset.id);
            } else if (action === 'trigger-file-int') {
                this.triggerFileInput(target.dataset.paxId);
            } else if (action === 'remove-pax-row') {
                const row = target.closest('.pax-row');
                if (row) row.remove();
            }
        });

        // Form submission
        const form = document.getElementById('internacional-form');
        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveInternacional();
            });
        }

        // Search filter
        const searchInput = document.getElementById('buscador-internacional-rapido');
        if (searchInput) {
            searchInput.addEventListener('input', () => this.filterTable());
        }

        // Utility calculation inputs
        const precioTotal = document.getElementById('int-precio-total');
        if (precioTotal) precioTotal.addEventListener('input', () => this.calculateUtility());
        
        const costoTotal = document.getElementById('int-costo-total');
        if (costoTotal) costoTotal.addEventListener('input', () => this.calculateUtility());

        // File uploads (change event delegation)
        document.body.addEventListener('change', (e) => {
            if (e.target.classList.contains('int-file-upload')) {
                this.handleFileUpload(e, e.target.dataset.paxId);
            }
        });

        this.eventsBound = true;
    },

    filterTable() {
        this.renderTable();
    },

    renderTable() {
        const tbody = document.getElementById('internacionales-table-body');
        const emptyState = document.getElementById('internacionales-table-empty');
        const searchTerm = (document.getElementById('buscador-internacional-rapido')?.value || '').toLowerCase();

        if (!tbody) return;

        let data = DataService.clientes.filter(c => c.tipo_reserva === 'Internacional');
        
        if (searchTerm) {
            data = data.filter(c => 
                (c.nombre?.toLowerCase() || '').includes(searchTerm) ||
                (c.dni?.toLowerCase() || '').includes(searchTerm) ||
                (c.telefono?.toString() || '').includes(searchTerm)
            );
        }

        if (data.length === 0) {
            tbody.innerHTML = '';
            if (emptyState) emptyState.classList.remove('hidden');
        } else {
            if (emptyState) emptyState.classList.add('hidden');
            let html = '';
            data.forEach(c => {
                const planName = DataService.planes.find(p => p.id === c.plan_id)?.nombre || 'Plan Desconocido';
                const pasajeros = c.pasajeros_internacionales || [];
                const totalMonto = pasajeros.reduce((sum, p) => sum + (Number(p.monto_pago) || 0), 0);
                
                html += `
                    <tr class="hover:bg-slate-50/50 transition-colors cursor-pointer group">
                        <td class="py-4 px-4 align-top" data-action="edit-int" data-id="${c.id}">
                            <div class="flex items-center gap-3">
                                <div class="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-bold text-xs shrink-0">${(c.nombre || 'I').charAt(0).toUpperCase()}</div>
                                <div>
                                    <p class="text-sm font-bold text-slate-800">${UI.sanitize(c.nombre)}</p>
                                    <p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">DNI: ${UI.sanitize(c.dni)}</p>
                                </div>
                            </div>
                        </td>
                        <td class="py-4 px-4 align-top" data-action="edit-int" data-id="${c.id}">
                            <p class="text-xs font-semibold text-slate-600">${UI.sanitize(c.telefono || 'N/A')}</p>
                        </td>
                        <td class="py-4 px-4 align-top" data-action="edit-int" data-id="${c.id}">
                            <p class="text-xs font-bold text-slate-700">${UI.sanitize(planName)}</p>
                            <p class="text-[10px] text-slate-500 mt-1">${pasajeros.length} Pasajero(s)</p>
                        </td>
                        <td class="py-4 px-4 text-right align-top" data-action="edit-int" data-id="${c.id}">
                            <p class="text-sm font-black text-emerald-600">${formatCOP(totalMonto)}</p>
                        </td>
                        <td class="py-4 px-4 text-center align-top">
                            <button data-action="delete-int" data-id="${c.id}" class="btn-delete-protected text-slate-300 hover:text-red-500 transition-colors p-1" title="Eliminar Reserva">
                                <i class="ph ph-trash text-lg pointer-events-none"></i>
                            </button>
                        </td>
                    </tr>
                `;
            });
            tbody.innerHTML = html;
        }
    },

    openFormModal() {
        const form = document.getElementById('internacional-form');
        if (form) form.reset();
        
        const cId = document.getElementById('int-cliente-id');
        if (cId) cId.value = '';
        
        const mTitle = document.getElementById('int-modal-title');
        if (mTitle) mTitle.textContent = 'Nueva Reserva Int.';
        
        const paxCont = document.getElementById('int-pasajeros-container');
        if (paxCont) paxCont.innerHTML = '';
        
        if (document.getElementById('int-email')) document.getElementById('int-email').value = '';
        if (document.getElementById('int-ciudad')) document.getElementById('int-ciudad').value = '';
        if (document.getElementById('int-vendedor')) document.getElementById('int-vendedor').value = '';
        if (document.getElementById('int-estado')) document.getElementById('int-estado').value = 'En Caja';
        if (document.getElementById('int-precio-total')) document.getElementById('int-precio-total').value = '';
        if (document.getElementById('int-costo-total')) document.getElementById('int-costo-total').value = '';
        if (document.getElementById('int-notas-financieras')) document.getElementById('int-notas-financieras').value = '';
        if (document.getElementById('int-utilidad-display')) document.getElementById('int-utilidad-display').textContent = '$0';
        
        const planSelect = document.getElementById('int-plan-id');
        if (planSelect) {
            planSelect.innerHTML = '<option value="">Seleccione Plan...</option>';
            DataService.planes.forEach(p => {
                planSelect.innerHTML += `<option value="${p.id}">${UI.sanitize(p.nombre)}</option>`;
            });
        }

        this.addPassengerRow();

        UI.switchTab('internacional', 'titular');
        UI.openModal('internacional-form-modal', 'internacional-form-bg', 'internacional-form-content');
    },

    editInternacional(id) {
        const cliente = DataService.clientes.find(c => c.id === id);
        if (!cliente) return;

        this.openFormModal();
        document.getElementById('int-modal-title').textContent = 'Editar Reserva Int.';
        document.getElementById('int-cliente-id').value = cliente.id;
        document.getElementById('int-plan-id').value = cliente.plan_id || '';
        document.getElementById('int-fecha-viaje').value = cliente.fecha_viaje ? cliente.fecha_viaje.split('T')[0] : '';
        document.getElementById('int-dni').value = cliente.dni || '';
        document.getElementById('int-nombre').value = cliente.nombre || '';
        document.getElementById('int-celular').value = cliente.telefono || '';
        document.getElementById('int-email').value = cliente.email || '';
        document.getElementById('int-ciudad').value = cliente.ciudad || '';
        document.getElementById('int-vendedor').value = cliente.vendedor || '';
        document.getElementById('int-estado').value = cliente.estado_reserva || 'En Caja';
        document.getElementById('int-precio-total').value = cliente.precio_total || '';
        document.getElementById('int-costo-total').value = cliente.costo_total || '';
        document.getElementById('int-notas-financieras').value = cliente.notas_financieras || '';
        
        this.calculateUtility();

        const container = document.getElementById('int-pasajeros-container');
        container.innerHTML = '';
        const pasajeros = cliente.pasajeros_internacionales || [];
        
        if (pasajeros.length === 0) {
            this.addPassengerRow();
        } else {
            pasajeros.forEach(p => {
                this.addPassengerRow(p);
            });
        }
    },

    closeFormModal() {
        UI.closeModal('internacional-form-modal', 'internacional-form-bg', 'internacional-form-content');
    },

    addPassengerRow(pax = null) {
        const container = document.getElementById('int-pasajeros-container');
        if (!container) return;
        
        const paxId = pax?.id || Math.random().toString(36).substring(2, 9);
        const name = pax?.nombre || '';
        const monto = pax?.monto_pago || '';
        const desc = pax?.descripcion_pago || '';
        const url = pax?.comprobante_url || '';

        const fileButtonHTML = url 
            ? `<a href="${url}" target="_blank" class="text-[10px] text-primary-600 font-bold hover:underline flex items-center mt-1"><i class="ph ph-image mr-1"></i> Ver Comprobante</a>
               <button type="button" data-action="trigger-file-int" data-pax-id="${paxId}" class="text-[9px] text-slate-500 mt-1 ml-3 hover:text-slate-800">Cambiar</button>`
            : `<button type="button" data-action="trigger-file-int" data-pax-id="${paxId}" class="text-[9px] bg-slate-100 text-slate-600 px-2 py-1 rounded border border-slate-200 mt-1 hover:bg-slate-200 flex items-center"><i class="ph ph-upload-simple mr-1 pointer-events-none"></i> Subir Foto</button>`;

        const html = `
            <div class="bg-white border border-slate-200 rounded-xl p-3 sm:p-4 pax-row" data-id="${paxId}">
                <input type="hidden" class="pax-url" value="${url}">
                <input type="file" id="file-${paxId}" accept="image/*" class="hidden int-file-upload" data-pax-id="${paxId}">
                
                <div class="flex justify-between items-start mb-2">
                    <h5 class="text-[10px] font-black text-slate-600 uppercase tracking-widest"><i class="ph ph-user"></i> Pasajero</h5>
                    <button type="button" data-action="remove-pax-row" class="text-slate-400 hover:text-red-500"><i class="ph ph-x pointer-events-none"></i></button>
                </div>
                
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                        <label class="block text-[8px] font-bold text-slate-400 uppercase">Nombre</label>
                        <input type="text" class="pax-nombre w-full text-xs border-b border-slate-200 py-1 outline-none focus:border-slate-800" placeholder="Nombre completo" value="${UI.sanitize(name)}" required>
                    </div>
                    <div>
                        <label class="block text-[8px] font-bold text-slate-400 uppercase">Abono Inicial / Pago (COP)</label>
                        <input type="number" class="pax-monto w-full text-xs border-b border-slate-200 py-1 outline-none focus:border-slate-800" placeholder="0" value="${monto}">
                    </div>
                    <div class="sm:col-span-2">
                        <label class="block text-[8px] font-bold text-slate-400 uppercase">Concepto / Descripción</label>
                        <input type="text" class="pax-desc w-full text-xs border-b border-slate-200 py-1 outline-none focus:border-slate-800" placeholder="Ej. Reserva Tiquetes" value="${UI.sanitize(desc)}">
                    </div>
                    <div class="sm:col-span-2" id="upload-container-${paxId}">
                        ${fileButtonHTML}
                    </div>
                </div>
            </div>
        `;
        container.insertAdjacentHTML('beforeend', html);
    },

    triggerFileInput(paxId) {
        document.getElementById(`file-${paxId}`)?.click();
    },

    async handleFileUpload(event, paxId) {
        const file = event.target.files[0];
        if (!file) return;

        const container = document.getElementById(`upload-container-${paxId}`);
        if (!container) return;
        
        container.innerHTML = `<span class="text-[10px] text-slate-500 flex items-center mt-1"><i class="ph ph-spinner animate-spin mr-1"></i> Subiendo...</span>`;

        try {
            const fileExt = file.name.split('.').pop();
            const fileName = `${Date.now()}_${Math.random().toString(36).substring(2)}.${fileExt}`;
            const filePath = `comprobantes/${fileName}`;

            const { data, error } = await supabaseClient.storage
                .from('comprobantes_internacionales')
                .upload(filePath, file);

            if (error) throw error;

            const { data: { publicUrl } } = supabaseClient.storage
                .from('comprobantes_internacionales')
                .getPublicUrl(filePath);

            const row = document.querySelector(`.pax-row[data-id="${paxId}"]`);
            if(row) row.querySelector('.pax-url').value = publicUrl;

            container.innerHTML = `
               <a href="${publicUrl}" target="_blank" class="text-[10px] text-emerald-600 font-bold hover:underline flex items-center mt-1"><i class="ph ph-check-circle mr-1"></i> Foto Subida</a>
               <button type="button" data-action="trigger-file-int" data-pax-id="${paxId}" class="text-[9px] text-slate-500 mt-1 ml-3 hover:text-slate-800">Cambiar</button>
            `;
            UI.showToast("Comprobante subido correctamente", "success");

        } catch (error) {
            console.error('Error subiendo imagen:', error);
            container.innerHTML = `<button type="button" data-action="trigger-file-int" data-pax-id="${paxId}" class="text-[9px] bg-red-50 text-red-600 px-2 py-1 rounded border border-red-200 mt-1 flex items-center"><i class="ph ph-warning mr-1"></i> Reintentar Foto</button>`;
            UI.showToast("Error al subir imagen", "error");
        }
    },

    async saveInternacional() {
        const id = document.getElementById('int-cliente-id').value;
        const plan_id = document.getElementById('int-plan-id').value;
        const fecha_viaje = document.getElementById('int-fecha-viaje').value;
        const dni = document.getElementById('int-dni').value;
        const nombre = document.getElementById('int-nombre').value;
        const telefono = document.getElementById('int-celular').value;
        const email = document.getElementById('int-email').value;
        const ciudad = document.getElementById('int-ciudad').value;
        const vendedor = document.getElementById('int-vendedor').value;
        const estado_reserva = document.getElementById('int-estado').value;
        const precio_total = parseFloat(document.getElementById('int-precio-total').value) || 0;
        const costo_total = parseFloat(document.getElementById('int-costo-total').value) || 0;
        const notas_financieras = document.getElementById('int-notas-financieras').value;

        const pasajeros = [];
        document.querySelectorAll('.pax-row').forEach(row => {
            pasajeros.push({
                id: row.dataset.id,
                nombre: row.querySelector('.pax-nombre').value,
                monto_pago: parseFloat(row.querySelector('.pax-monto').value) || 0,
                descripcion_pago: row.querySelector('.pax-desc').value,
                comprobante_url: row.querySelector('.pax-url').value
            });
        });

        const totalPagado = pasajeros.reduce((sum, p) => sum + p.monto_pago, 0);

        const dataToSave = {
            plan_id,
            fecha_viaje,
            dni,
            nombre,
            telefono,
            email,
            ciudad,
            vendedor,
            tipo_reserva: 'Internacional',
            pasajeros_internacionales: pasajeros,
            precio_total,
            costo_total,
            notas_financieras,
            abonos_total: totalPagado,
            saldo_pendiente: Math.max(0, precio_total - totalPagado),
            estado_reserva: estado_reserva
        };

        if (id) dataToSave.id = id;

        const btn = document.getElementById('btn-save-int');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="ph ph-spinner animate-spin mr-2"></i> Guardando...';
        btn.disabled = true;

        try {
            const res = await DataService.saveCliente(dataToSave);
            const clienteId = id || (res ? res.id : null);
            
            if (clienteId) {
                const currentAbonos = DataService.abonos.filter(a => a.cliente_id === clienteId && a.estado_pago !== 'refunded' && a.estado_pago !== 'pending');
                const sumAbonos = currentAbonos.reduce((s, a) => s + (Number(a.monto) || 0), 0);
                
                const diferencia = totalPagado - sumAbonos;
                
                if (diferencia !== 0) {
                    await DataService.saveAbono({
                        cliente_id: clienteId,
                        monto: diferencia,
                        metodo: diferencia > 0 ? 'Consolidación Pago Internacional' : 'Ajuste/Reversión Internacional',
                        estado_pago: 'confirmed',
                        usuario_email: window.AuthModule?.currentUser?.email || 'Sistema Int.'
                    });
                }
            }

            await DataService.loadAll();

            UI.showToast("Reserva internacional guardada exitosamente.", "success");
            this.closeFormModal();
            // Store reaccionará a `lastUpdated === 'clientes'` o `abonos` y llamará a `renderTable`
            
            // Si el dashboard aún existe globalmente

        } catch (e) {
            console.error("Error guardando:", e);
            UI.showToast("Error al guardar reserva.", "error");
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    },

    async deleteInternacional(id) {
        if (!confirm("¿Está seguro de eliminar esta reserva internacional?")) return;
        
        const IS_ADMIN = window.AuthModule?.userProfile?.rol === 'administrador';
        if (!IS_ADMIN) {
            return UI.showToast("Acción denegada: Solo administradores pueden eliminar reservas.", "error");
        }

        try {
            await DataService.deleteCliente(id);
            UI.showToast("Reserva eliminada.", "success");
            await DataService.loadAll();
            

        } catch (e) {
            console.error("Error eliminando:", e);
            UI.showToast("No se pudo eliminar la reserva.", "error");
        }
    },

    calculateUtility() {
        const precioTotal = parseFloat(document.getElementById('int-precio-total')?.value) || 0;
        const costoTotal = parseFloat(document.getElementById('int-costo-total')?.value) || 0;
        const utilidad = precioTotal - costoTotal;
        const display = document.getElementById('int-utilidad-display');
        if (display) display.textContent = formatCOP(utilidad);
    }
};
