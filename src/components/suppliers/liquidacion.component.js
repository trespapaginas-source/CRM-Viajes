import { DataService } from '../../../js/services/supabase.service.js';
import { Store } from '../../core/store.js';
import { UI } from '../../../js/utils/ui.utils.js';
import { formatCOP } from '../../../js/utils/format.utils.js';

export const LiquidacionProveedoresComponent = {
    eventsBound: false,
    selectedSupplierId: null,
    selectedFileBase64: null,

    init() {
        this.bindEvents();
        this.render();

        // Reactivity subscription
        Store.subscribe((state) => {
            if (state.lastUpdated === 'full' || state.lastUpdated === 'proveedores' || state.lastUpdated === 'clientes' || state.lastUpdated === 'proveedores_liquidaciones') {
                this.render();
                // If modals are open, refresh their active views
                if (this.selectedSupplierId) {
                    this.refreshModals();
                }
            }
        });
    },

    bindEvents() {
        if (this.eventsBound) return;

        // Search inputs / Filters
        const searchInput = document.getElementById('liquidacion-search');
        if (searchInput) searchInput.addEventListener('input', () => this.renderTableOnly());

        const selectCiudad = document.getElementById('liquidacion-filter-ciudad');
        if (selectCiudad) selectCiudad.addEventListener('change', () => this.renderTableOnly());

        // Event delegation for actions
        document.body.addEventListener('click', (e) => {
            const target = e.target.closest('button, a');
            if (!target) return;

            const action = target.dataset.action;
            const id = target.dataset.id;

            if (action === 'liq-open-modal') {
                this.openLiquidationModal(id);
            } else if (action === 'liq-open-audit') {
                this.openAuditModal(id);
            } else if (action === 'liq-delete-payment') {
                this.deletePayment(id, target.dataset.supplierId);
            } else if (action === 'liq-view-comprobante') {
                this.viewComprobante(target.dataset.url);
            } else if (action === 'liq-close-lightbox' || e.target.id === 'liq-lightbox-bg') {
                this.closeLightbox();
            }
        });

        // Form events
        const fileInput = document.getElementById('liq-file');
        if (fileInput) {
            fileInput.addEventListener('change', (e) => this.handleFileSelect(e.target));
        }

        const btnSave = document.getElementById('btn-save-liq');
        if (btnSave) {
            btnSave.addEventListener('click', (e) => {
                e.preventDefault();
                this.saveLiquidation();
            });
        }

        const btnCloseForm = document.getElementById('btn-close-liq-modal');
        if (btnCloseForm) {
            btnCloseForm.addEventListener('click', () => this.closeLiquidationModal());
        }

        const btnCloseAudit = document.getElementById('btn-close-audit-modal');
        if (btnCloseAudit) {
            btnCloseAudit.addEventListener('click', () => this.closeAuditModal());
        }

        // Tab events in audit modal
        const tabViajeros = document.getElementById('audit-tab-btn-viajeros');
        const tabPagos = document.getElementById('audit-tab-btn-pagos');

        if (tabViajeros && tabPagos) {
            tabViajeros.addEventListener('click', () => this.switchAuditTab('viajeros'));
            tabPagos.addEventListener('click', () => this.switchAuditTab('pagos'));
        }

        this.eventsBound = true;
    },

    getClientRealPax(c) {
        const companionsCount = DataService.clientes.filter(x => x.parent_id === c.id && !x.deleted_at).length;
        return companionsCount > 0 ? 1 : parseInt(c.pax || 1);
    },

    populateCities() {
        const select = document.getElementById('liquidacion-filter-ciudad');
        if (!select) return;

        const currentVal = select.value;
        select.innerHTML = '<option value="">Todas las ciudades</option>';
        const ciudades = [...new Set(DataService.proveedores.map(p => p.ciudad).filter(Boolean))];
        ciudades.forEach(c => {
            select.innerHTML += `<option value="${UI.sanitize(c)}">${UI.sanitize(c)}</option>`;
        });
        if (currentVal) select.value = currentVal;
    },

    // Main calculation of debts, payments, balances, and passengers
    getSupplierBalances() {
        const activeClients = DataService.clientes.filter(c => {
            if (c.deleted_at) return false;
            const st = c.estado ? c.estado.toLowerCase() : '';
            return st !== 'cancelado o devolución' && st !== 'cancelados' && st !== 'desistió' && st !== 'devolución';
        });

        return DataService.proveedores.map(supplier => {
            let costOwed = 0;
            const passengers = [];

            activeClients.forEach(c => {
                const plan = DataService.planes.find(p => p.id === c.plan_id);
                const provs = (c.proveedores_vinculados && c.proveedores_vinculados.length > 0)
                    ? c.proveedores_vinculados
                    : (plan ? plan.proveedores_vinculados || [] : []);

                // Find linked records matching this supplier
                const matches = provs.filter(pv => {
                    const pvId = pv.id_proveedor || pv.id_provider;
                    return String(pvId) === String(supplier.id) || 
                           (pv.nombre && pv.nombre.toLowerCase().trim() === (supplier.nombre || '').toLowerCase().trim());
                });

                if (matches.length > 0) {
                    const paxNum = this.getClientRealPax(c);
                    let clientCost = 0;
                    matches.forEach(pv => {
                        clientCost += parseFloat(pv.costo || 0) * paxNum;
                    });

                    if (clientCost > 0) {
                        costOwed += clientCost;
                        passengers.push({
                            cliente_id: c.id,
                            nombre: `${c.nombre} ${c.apellido || ''}`.trim(),
                            documento: c.documento || '',
                            plan_nombre: plan ? plan.nombre : 'Plan Individual',
                            fecha_viaje: c.fecha_viaje || 'S/F',
                            pax: paxNum,
                            costo: clientCost
                        });
                    }
                }
            });

            // Calculate paid payments
            const payments = (DataService.proveedores_liquidaciones || []).filter(l => 
                l.proveedor_id === supplier.id && !l.deleted_at
            );
            const totalPaid = payments.reduce((sum, p) => sum + (Number(p.monto) || 0), 0);
            const balance = costOwed - totalPaid;

            return {
                supplier,
                costOwed,
                totalPaid,
                balance,
                passengers,
                payments
            };
        });
    },

    render() {
        this.populateCities();
        this.renderTableOnly();
    },

    renderTableOnly() {
        const tbody = document.getElementById('liquidacion-table-body');
        if (!tbody) return;

        tbody.innerHTML = '';
        const balances = this.getSupplierBalances();
        const search = (document.getElementById('liquidacion-search')?.value || '').toLowerCase();
        const ciudad = document.getElementById('liquidacion-filter-ciudad')?.value || '';

        const filtered = balances.filter(b => {
            const name = (b.supplier.nombre || '').toLowerCase();
            const type = (b.supplier.tipo || '').toLowerCase();
            const provCiudad = (b.supplier.ciudad || '').toLowerCase();

            if (search && !name.includes(search) && !type.includes(search)) return false;
            if (ciudad && provCiudad !== ciudad.toLowerCase()) return false;

            return true;
        });

        if (filtered.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="p-8 text-center text-slate-400 italic">
                        No se encontraron proveedores para los filtros aplicados
                    </td>
                </tr>
            `;
            return;
        }

        filtered.forEach(b => {
            const s = b.supplier;
            let statusBadge = '';
            
            // Allow small rounding issues (e.g. up to $10 COP)
            if (b.balance <= 10) {
                statusBadge = '<span class="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100">Al Día</span>';
            } else {
                statusBadge = '<span class="px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-100">Pendiente</span>';
            }

            const tr = document.createElement('tr');
            tr.className = 'hover:bg-slate-50 border-b border-slate-100 transition-colors';
            tr.innerHTML = `
                <td class="py-3.5 px-4">
                    <p class="font-bold text-slate-850 text-sm leading-tight">${UI.sanitize(s.nombre)}</p>
                    <p class="text-[10px] text-slate-400 font-bold uppercase mt-0.5">${UI.sanitize(s.tipo || 'General')}</p>
                </td>
                <td class="py-3.5 px-4">
                    <p class="text-xs font-semibold text-slate-700">${UI.sanitize(s.ciudad || 'No definida')}</p>
                </td>
                <td class="py-3.5 px-4 font-bold text-slate-700 text-sm">${formatCOP(b.costOwed)}</td>
                <td class="py-3.5 px-4 font-bold text-emerald-700 text-sm">${formatCOP(b.totalPaid)}</td>
                <td class="py-3.5 px-4 font-black text-slate-900 text-sm">${formatCOP(b.balance)}</td>
                <td class="py-3.5 px-4">${statusBadge}</td>
                <td class="py-3.5 px-4 text-right">
                    <div class="flex items-center justify-end space-x-1.5">
                        <button type="button" data-action="liq-open-modal" data-id="${s.id}" class="px-2.5 py-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 text-xs font-bold transition-colors flex items-center gap-1 shadow-sm border border-blue-100">
                            <i class="ph ph-hand-coins"></i> Liquidar
                        </button>
                        <button type="button" data-action="liq-open-audit" data-id="${s.id}" class="px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 text-xs font-bold transition-colors flex items-center gap-1 shadow-sm border border-slate-200">
                            <i class="ph ph-eye"></i> Auditar
                        </button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
    },

    // Liquidation registration modal
    openLiquidationModal(supplierId) {
        this.selectedSupplierId = supplierId;
        this.selectedFileBase64 = null;

        const supplier = DataService.proveedores.find(p => p.id === supplierId);
        if (!supplier) return;

        const balances = this.getSupplierBalances().find(b => b.supplier.id === supplierId);
        const pendingAmount = balances ? Math.max(balances.balance, 0) : 0;

        const elTitle = document.getElementById('liq-modal-title');
        if (elTitle) elTitle.innerText = `Liquidar Pago: ${supplier.nombre}`;

        const elMonto = document.getElementById('liq-monto');
        if (elMonto) UI.setCurrencyValue('liq-monto', Math.floor(pendingAmount));

        const elFecha = document.getElementById('liq-fecha');
        if (elFecha) elFecha.value = new Date().toISOString().split('T')[0];

        const elDetalles = document.getElementById('liq-detalles');
        if (elDetalles) elDetalles.value = '';

        this.clearFileInput();

        UI.openModal('liq-form-modal', 'liq-form-bg', 'liq-form-content');
    },

    closeLiquidationModal() {
        this.selectedSupplierId = null;
        this.selectedFileBase64 = null;
        UI.closeModal('liq-form-modal', 'liq-form-bg', 'liq-form-content');
    },

    clearFileInput() {
        const input = document.getElementById('liq-file');
        if (input) input.value = '';
        
        const label = document.getElementById('liq-file-label');
        if (label) label.textContent = 'Seleccionar captura...';

        const preview = document.getElementById('liq-file-preview');
        if (preview) preview.classList.add('hidden');
    },

    async handleFileSelect(input) {
        const file = input.files[0];
        if (!file) return;

        const label = document.getElementById('liq-file-label');
        if (label) label.textContent = file.name.length > 25 ? file.name.substring(0, 22) + '...' : file.name;

        try {
            this.selectedFileBase64 = await this.compressFileToBase64(file);
            
            // Show preview thumbnail
            const preview = document.getElementById('liq-file-preview');
            const thumb = document.getElementById('liq-file-thumb');
            if (preview && thumb) {
                thumb.src = this.selectedFileBase64;
                preview.classList.remove('hidden');
            }
        } catch (e) {
            console.error("Error comprimiendo archivo:", e);
            UI.showToast("No se pudo cargar la imagen del soporte de pago.", "error");
            this.clearFileInput();
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

    async saveLiquidation() {
        if (!this.selectedSupplierId) return;

        const monto = UI.parseCurrency(document.getElementById('liq-monto')?.value);
        const fecha = document.getElementById('liq-fecha')?.value;
        const detalles = document.getElementById('liq-detalles')?.value;

        if (isNaN(monto) || monto <= 0) {
            UI.showToast("Por favor digita un monto de liquidación válido.", "error");
            return;
        }

        if (!fecha) {
            UI.showToast("Por favor selecciona la fecha del pago.", "error");
            return;
        }

        const btn = document.getElementById('btn-save-liq');
        const origText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="ph ph-spinner animate-spin text-sm"></i> Guardando...';

        try {
            const payload = {
                proveedor_id: this.selectedSupplierId,
                monto: monto,
                fecha: fecha,
                comprobante: this.selectedFileBase64 || null,
                detalles: detalles || ''
            };

            await DataService.saveProveedorLiquidation(payload);
            UI.showToast("Pago de liquidación registrado correctamente.", "success");
            this.closeLiquidationModal();
        } catch (e) {
            console.error("Error al registrar liquidación:", e);
            UI.showToast("No se pudo registrar la liquidación en la base de datos.", "error");
        } finally {
            btn.disabled = false;
            btn.innerHTML = origText;
        }
    },

    // Audit and Details modal
    openAuditModal(supplierId) {
        this.selectedSupplierId = supplierId;
        
        const supplier = DataService.proveedores.find(p => p.id === supplierId);
        if (!supplier) return;

        const elTitle = document.getElementById('audit-modal-title');
        if (elTitle) elTitle.innerText = `Auditoría Financiera: ${supplier.nombre}`;

        this.switchAuditTab('viajeros');
        UI.openModal('liq-audit-modal', 'audit-bg', 'audit-content');
    },

    closeAuditModal() {
        this.selectedSupplierId = null;
        UI.closeModal('liq-audit-modal', 'audit-bg', 'audit-content');
    },

    switchAuditTab(tab) {
        const tabViajeros = document.getElementById('audit-tab-btn-viajeros');
        const tabPagos = document.getElementById('audit-tab-btn-pagos');

        const secViajeros = document.getElementById('audit-sec-viajeros');
        const secPagos = document.getElementById('audit-sec-pagos');

        if (tab === 'viajeros') {
            tabViajeros?.classList.add('border-slate-800', 'text-slate-900', 'bg-white');
            tabViajeros?.classList.remove('border-transparent', 'text-slate-400');
            tabPagos?.classList.remove('border-slate-800', 'text-slate-900', 'bg-white');
            tabPagos?.classList.add('border-transparent', 'text-slate-400');

            secViajeros?.classList.remove('hidden');
            secPagos?.classList.add('hidden');
        } else {
            tabPagos?.classList.add('border-slate-800', 'text-slate-900', 'bg-white');
            tabPagos?.classList.remove('border-transparent', 'text-slate-400');
            tabViajeros?.classList.remove('border-slate-800', 'text-slate-900', 'bg-white');
            tabViajeros?.classList.add('border-transparent', 'text-slate-400');

            secPagos?.classList.remove('hidden');
            secViajeros?.classList.add('hidden');
        }

        this.renderAuditData();
    },

    refreshModals() {
        if (!this.selectedSupplierId) return;

        // Check if liquidation modal is open (display status)
        const formModal = document.getElementById('liq-form-modal');
        if (formModal && !formModal.classList.contains('hidden')) {
            const supplier = DataService.proveedores.find(p => p.id === this.selectedSupplierId);
            if (supplier) {
                const elTitle = document.getElementById('liq-modal-title');
                if (elTitle) elTitle.innerText = `Liquidar Pago: ${supplier.nombre}`;
            }
        }

        // Check if audit modal is open
        const auditModal = document.getElementById('liq-audit-modal');
        if (auditModal && !auditModal.classList.contains('hidden')) {
            const supplier = DataService.proveedores.find(p => p.id === this.selectedSupplierId);
            if (supplier) {
                const elTitle = document.getElementById('audit-modal-title');
                if (elTitle) elTitle.innerText = `Auditoría Financiera: ${supplier.nombre}`;
            }
            this.renderAuditData();
        }
    },

    renderAuditData() {
        if (!this.selectedSupplierId) return;

        const data = this.getSupplierBalances().find(b => b.supplier.id === this.selectedSupplierId);
        if (!data) return;

        // Render Passengers List
        const listViajeros = document.getElementById('audit-viajeros-list');
        if (listViajeros) {
            listViajeros.innerHTML = '';
            if (data.passengers.length === 0) {
                listViajeros.innerHTML = '<div class="p-6 text-center text-slate-400 italic">No hay reservas activas asociadas a este proveedor</div>';
            } else {
                data.passengers.forEach(p => {
                    listViajeros.innerHTML += `
                        <div class="p-4 bg-slate-50 border border-slate-100 rounded-xl flex justify-between items-center hover:shadow-sm transition-shadow">
                            <div>
                                <p class="font-bold text-slate-900 text-sm">${UI.sanitize(p.nombre)}</p>
                                <p class="text-[10px] text-slate-500 font-semibold uppercase mt-0.5">${UI.sanitize(p.plan_nombre)}</p>
                                <p class="text-[10px] text-slate-400 mt-0.5"><i class="ph ph-calendar-blank"></i> ${UI.sanitize(p.fecha_viaje)} | 👥 ${p.pax} Pax</p>
                            </div>
                            <div class="text-right">
                                <p class="text-slate-900 font-black text-sm">${formatCOP(p.costo)}</p>
                                <p class="text-[9px] text-slate-400 mt-0.5">Costo Owed</p>
                            </div>
                        </div>
                    `;
                });
            }
        }

        // Render Payments List
        const listPagos = document.getElementById('audit-pagos-list');
        if (listPagos) {
            listPagos.innerHTML = '';
            if (data.payments.length === 0) {
                listPagos.innerHTML = '<div class="p-6 text-center text-slate-400 italic">No hay registros de liquidaciones para este proveedor</div>';
            } else {
                const isAdmin = window.AuthModule?.userProfile?.rol === 'administrador' || window.AuthModule?.userProfile?.rol === 'super_administrador';
                
                data.payments.forEach(p => {
                    const payDate = new Date(p.fecha + 'T00:00:00').toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' });
                    
                    let supportButton = '';
                    if (p.comprobante) {
                        supportButton = `
                            <button type="button" data-action="liq-view-comprobante" data-url="${p.comprobante}" class="text-[10px] bg-emerald-50 border border-emerald-100 text-emerald-700 px-2 py-1 rounded font-bold hover:bg-emerald-100 transition-colors">
                                <i class="ph ph-image"></i> Comprobante
                            </button>
                        `;
                    } else {
                        supportButton = '<span class="text-[10px] text-slate-400 italic">Sin soporte</span>';
                    }

                    const deleteBtn = isAdmin ? `
                        <button type="button" data-action="liq-delete-payment" data-id="${p.id}" data-supplier-id="${data.supplier.id}" class="text-[10px] bg-rose-50 border border-rose-100 text-rose-700 px-2 py-1 rounded font-bold hover:bg-rose-100 transition-colors">
                            <i class="ph ph-trash"></i>
                        </button>
                    ` : '';

                    listPagos.innerHTML += `
                        <div class="p-4 bg-slate-50 border border-slate-100 rounded-xl flex justify-between items-center hover:shadow-sm transition-shadow">
                            <div>
                                <p class="font-black text-slate-900 text-base">${formatCOP(p.monto)}</p>
                                <p class="text-[10px] text-slate-500 font-semibold mt-0.5">${payDate}</p>
                                ${p.detalles ? `<p class="text-[10px] text-slate-600 bg-white px-2 py-1 border border-slate-100 rounded-lg mt-1.5 italic">${UI.sanitize(p.detalles)}</p>` : ''}
                                <p class="text-[8px] text-slate-400 mt-1 font-semibold uppercase">Registró: ${UI.sanitize(p.usuario_email || 'Staff')}</p>
                            </div>
                            <div class="flex items-center gap-1.5">
                                ${supportButton}
                                ${deleteBtn}
                            </div>
                        </div>
                    `;
                });
            }
        }
    },

    async deletePayment(liqId, supplierId) {
        const motivo = prompt("Por favor describe el motivo de la eliminación de esta liquidación:");
        if (motivo === null) return;
        if (!motivo.trim()) {
            UI.showToast("La eliminación requiere un motivo explicativo.", "error");
            return;
        }

        try {
            await DataService.deleteProveedorLiquidation(liqId, motivo);
            UI.showToast("Liquidación eliminada de la base de datos.", "success");
        } catch (e) {
            console.error("Error al eliminar liquidación:", e);
            UI.showToast("No se pudo eliminar el registro de liquidación.", "error");
        }
    },

    viewComprobante(url) {
        let overlay = document.getElementById('liq-lightbox');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'liq-lightbox';
            overlay.className = 'fixed inset-0 z-[99999] flex items-center justify-center p-4 sm:p-8';
            overlay.innerHTML = `
                <div id="liq-lightbox-bg" class="absolute inset-0 bg-black/85 backdrop-blur-sm" data-action="liq-close-lightbox"></div>
                <div class="relative max-w-4xl max-h-[90vh] animate-fade-in z-10">
                    <button data-action="liq-close-lightbox" class="absolute -top-3 -right-3 bg-white text-slate-800 rounded-full w-8 h-8 flex items-center justify-center shadow-xl hover:bg-red-500 hover:text-white transition-all"><i class="ph ph-x text-lg pointer-events-none"></i></button>
                    <img id="liq-lightbox-img" src="" alt="Soporte Liquidación" class="max-w-full max-h-[85vh] object-contain rounded-2xl shadow-2xl border-2 border-white/20">
                </div>
            `;
            document.body.appendChild(overlay);
        }
        document.getElementById('liq-lightbox-img').src = url;
        overlay.style.display = 'flex';
    },

    closeLightbox() {
        const overlay = document.getElementById('liq-lightbox');
        if (overlay) overlay.style.display = 'none';
    }
};
