import { DataService, supabaseClient } from '../../../js/services/supabase.service.js';
import { Store } from '../../core/store.js';
import { PartnersComponent } from '../partners/partners.component.js';
import { UI } from '../../../js/utils/ui.utils.js';
import { formatCOP, formatShortDate, parseSpanishDate, formatDoubleDate } from '../../../js/utils/format.utils.js';
import { ClientsComponent } from '../clients/clients.component.js';

export const RentabilidadComponent = {
    currentPlanId: null,
    currentFecha: null,
    currentTab: 'activos',
    eventsBound: false,

    getClientRealPax(c) {
        const companionsCount = DataService.clientes.filter(x => x.parent_id === c.id && !x.deleted_at).length;
        return companionsCount > 0 ? 1 : parseInt(c.pax || 1);
    },

    init() {
        this.populateFilters();
        this.bindEvents();
        this.renderGrid();

        // Reactividad
        Store.subscribe((state) => {
            if (state.lastUpdated === 'full' || state.lastUpdated === 'abonos' || state.lastUpdated === 'gastos' || state.lastUpdated === 'clientes' || state.lastUpdated === 'planes') {
                this.renderGrid();
                if (document.getElementById('rdm-bg') && !document.getElementById('rdm-bg').classList.contains('hidden') && this.currentPlanId) {
                    this.openFinancialModal(this.currentPlanId, this.currentFecha);
                }
            }
        });
    },

    bindEvents() {
        if (this.eventsBound) return;

        // Delegación de eventos global
        document.body.addEventListener('click', (e) => {
            const targetAction = e.target.closest('[data-action]');
            if (!targetAction) return;

            const action = targetAction.dataset.action;

            if (action === 'rentabilidad-edit-client') {
                UI.closeModal('rentabilidad-detail-modal', 'rdm-bg', 'rdm-content');
                setTimeout(() => ClientsComponent.openFormModal(targetAction.dataset.clienteId), 300);
            } else if (action === 'switch-rent-tab') {
                this.switchRentabilidadTab(targetAction.dataset.tabId);
            } else if (action === 'open-financial-modal') {
                this.openFinancialModal(targetAction.dataset.planId, targetAction.dataset.fechaViaje);
            } else if (action === 'delete-gasto') {
                this.deleteGasto(targetAction.dataset.gastoId);
            } else if (action === 'open-lightbox') {
                this.openLightbox(targetAction.dataset.url);
            } else if (action === 'close-lightbox' || e.target.id === 'comprobante-lightbox-bg') {
                this.closeLightbox();
            } else if (action === 'open-partners-vault') {
                this.openPartnersVault();
            } else if (action === 'clear-soporte') {
                this.clearSoporte();
            } else if (action === 'sync-rentabilidad-tarifas') {
                this.syncRatesWithCatalog();
            }
        });

        // Formulario de Gasto
        const formGasto = document.getElementById('form-nuevo-gasto');
        if (formGasto) {
            formGasto.addEventListener('submit', (e) => this.saveGasto(e));
        }

        // Filtros y changes
        const fPlan = document.getElementById('filter-rentabilidad-plan');
        if (fPlan) fPlan.addEventListener('change', () => this.filterGrid());

        const fDestino = document.getElementById('filter-rentabilidad-destino');
        if (fDestino) fDestino.addEventListener('change', () => this.filterGrid());

        const selectTipoValor = document.getElementById('ng-tipo-valor');
        if (selectTipoValor) selectTipoValor.addEventListener('change', () => this.toggleGastoInput());

        const fileInput = document.getElementById('ng-soporte-file');
        if (fileInput) fileInput.addEventListener('change', (e) => this.previewSoporte(e.target));

        this.eventsBound = true;
    },

    openLightbox(url) {
        let overlay = document.getElementById('comprobante-lightbox');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'comprobante-lightbox';
            overlay.className = 'fixed inset-0 z-[99999] flex items-center justify-center p-4 sm:p-8';
            overlay.innerHTML = `
                <div id="comprobante-lightbox-bg" class="absolute inset-0 bg-black/80 backdrop-blur-sm" data-action="close-lightbox"></div>
                <div class="relative max-w-4xl max-h-[90vh] animate-fade-in">
                    <button data-action="close-lightbox" class="absolute -top-3 -right-3 bg-white text-slate-800 rounded-full w-8 h-8 flex items-center justify-center shadow-xl hover:bg-red-500 hover:text-white transition-all z-10"><i class="ph ph-x text-lg pointer-events-none"></i></button>
                    <img id="comprobante-lightbox-img" src="" alt="Comprobante" class="max-w-full max-h-[85vh] object-contain rounded-2xl shadow-2xl border-2 border-white/20">
                </div>
            `;
            document.body.appendChild(overlay);
        }
        document.getElementById('comprobante-lightbox-img').src = url;
        overlay.style.display = 'flex';
    },

    closeLightbox() {
        const overlay = document.getElementById('comprobante-lightbox');
        if (overlay) overlay.style.display = 'none';
    },

    switchRentabilidadTab(tabId) {
        this.currentTab = tabId;
        document.querySelectorAll('.rent-sub-tab').forEach(btn => {
            btn.classList.remove('border-primary-600', 'text-slate-900', 'bg-white');
            btn.classList.add('border-transparent', 'text-slate-400');
        });
        const activeBtn = document.getElementById(`rent-tab-${tabId}`);
        if (activeBtn) {
            activeBtn.classList.remove('border-transparent', 'text-slate-400');
            activeBtn.classList.add('border-primary-600', 'text-slate-900', 'bg-white');
        }
        this.renderGrid();
    },

    populateFilters() {
        const fP = document.getElementById('filter-rentabilidad-plan');
        if (fP) {
            fP.innerHTML = '<option value="">Todos los Planes</option>';
            [...new Set(DataService.planes.map(p => p.nombre))].forEach(p => {
                fP.innerHTML += `<option value="${UI.sanitize(p)}">${UI.sanitize(p)}</option>`;
            });
        }
        const fD = document.getElementById('filter-rentabilidad-destino');
        if (fD) {
            fD.innerHTML = '<option value="">Todos los Destinos</option>';
            DataService.db.destinos.forEach(d => fD.innerHTML += `<option value="${d}">${d}</option>`);
        }
    },

    filterGrid() { this.renderGrid(); },

    renderGrid() {
        const grid = document.getElementById('rentabilidad-grid');
        if (!grid) return;
        grid.innerHTML = '';

        // Hide/Show partners vault button based on roles/partner status
        const controlVaultButton = async () => {
            try {
                if (PartnersComponent) {
                    await PartnersComponent.loadConfig();
                    const rol = window.AuthModule?.userProfile?.rol;
                    const isAdmin = rol === 'administrador' || rol === 'socio_mayoritario';
                    const currentUserEmail = (window.AuthModule?.currentUser?.email || '').toLowerCase();
                    const isPartner = PartnersComponent.sociosConfig.some(s => s.email.toLowerCase() === currentUserEmail);
                    
                    const vaultBtn = document.querySelector('[data-action="open-partners-vault"]');
                    if (vaultBtn) {
                        if (isAdmin || isPartner) {
                            vaultBtn.classList.remove('hidden');
                        } else {
                            vaultBtn.classList.add('hidden');
                        }
                    }
                }
            } catch (e) {
                console.warn("Error controlling Partners Vault button visibility:", e);
            }
        };
        controlVaultButton();

        const filterPlan = document.getElementById('filter-rentabilidad-plan')?.value || "";
        const salidasMap = new Map();

        DataService.clientes.forEach(cli => {
            const st = cli.estado ? cli.estado.toLowerCase() : '';
            if (st === 'desistió' || st === 'cancelado o devolución' || st === 'cancelados') return;
            if (!cli.fecha_viaje || cli.fecha_viaje.includes('Abierta')) return;

            const isInternacional = cli.tipo_reserva === 'Internacional';
            if (this.currentTab === 'internacionales' && !isInternacional) return;
            if (this.currentTab !== 'internacionales' && isInternacional) return;

            const plan = DataService.planes.find(p => p.id === cli.plan_id);
            if (!plan) return;
            if (filterPlan && plan.nombre !== filterPlan) return;
            const filterDestino = document.getElementById('filter-rentabilidad-destino')?.value.toLowerCase() || "";
            if (filterDestino && !(plan.destino || "").toLowerCase().includes(filterDestino)) return;

            const key = `${cli.plan_id}|${cli.fecha_viaje}`;
            if (!salidasMap.has(key)) {
                salidasMap.set(key, { plan_id: cli.plan_id, plan_nombre: plan.nombre, fecha_viaje: cli.fecha_viaje, pax_total: 0, pax_servicio: 0, ingreso_bruto: 0, ingreso_retenido: 0, clientes: [] });
            }
            const grupo = salidasMap.get(key);
            grupo.pax_total += this.getClientRealPax(cli);

            if (st === 'devolución') {
                const totalAbo = DataService.abonos.filter(a => a.cliente_id === cli.id && a.estado_pago !== 'pending' && a.estado_pago !== 'refunded').reduce((s, a) => s + (Number(a.monto) || 0), 0);
                const devuelto = parseFloat(cli.monto_devuelto || 0);
                grupo.ingreso_bruto += Math.max(0, totalAbo - devuelto);
                grupo.pax_servicio += this.getClientRealPax(cli);
            } else if (st === 'en caja') {
                const totalAbo = DataService.abonos.filter(a => a.cliente_id === cli.id && a.estado_pago !== 'pending' && a.estado_pago !== 'refunded').reduce((s, a) => s + (Number(a.monto) || 0), 0);
                grupo.ingreso_bruto += totalAbo;
                grupo.ingreso_retenido += totalAbo;
            } else {
                grupo.ingreso_bruto += parseFloat(cli.precio_total || 0);
                grupo.pax_servicio += this.getClientRealPax(cli);
            }

            grupo.clientes.push(cli);
        });

        if (salidasMap.size === 0) {
            grid.innerHTML = '<div class="col-span-full p-10 text-center text-slate-400 font-bold border-2 border-dashed border-slate-200 rounded-2xl">No hay salidas programadas con pasajeros activos.</div>';
            return;
        }

        let hasCards = false;

        salidasMap.forEach((data) => {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            let isPast = false;

            if (data.fecha_viaje) {
                const dateViaje = parseSpanishDate(data.fecha_viaje);
                if (dateViaje && !isNaN(dateViaje) && dateViaje < today) {
                    isPast = true;
                }
            }

            if (this.currentTab === 'activos' && isPast) return;
            if (this.currentTab === 'realizados' && !isPast) return;

            hasCards = true;

            const gastosSalida = DataService.gastos.filter(g => g.plan_id === data.plan_id && g.fecha_viaje === data.fecha_viaje);
            let costoTotal = 0;
            gastosSalida.forEach(g => {
                if (g.tipo_valor === 'fijo') costoTotal += parseFloat(g.valor);
                else costoTotal += data.ingreso_bruto * (parseFloat(g.valor) / 100);
            });
            const plan = DataService.planes.find(p => p.id === data.plan_id) || { costo_base: 0 };
            let costoOperativoBase = 0;
            data.clientes.forEach(c => {
                const st = c.estado ? c.estado.toLowerCase() : '';
                if (st !== 'en caja') {
                    let cCost = (c.costo_base !== undefined && c.costo_base !== null) ? parseFloat(c.costo_base) : parseFloat(plan.costo_base || 0);
                    if (cCost === 0) {
                        const provs = (c.proveedores_vinculados && c.proveedores_vinculados.length > 0)
                            ? c.proveedores_vinculados
                            : (plan.proveedores_vinculados || []);
                        cCost = provs.reduce((sum, p) => sum + parseFloat(p.costo || 0), 0);
                    }
                    costoOperativoBase += cCost * this.getClientRealPax(c);
                }
            });
            costoTotal += costoOperativoBase;
            const margen = data.ingreso_bruto - costoTotal;
            const isRentable = margen >= 0;

            grid.innerHTML += `
                <div data-action="open-financial-modal" data-plan-id="${data.plan_id}" data-fecha-viaje="${data.fecha_viaje}" class="bg-white rounded-2xl shadow-soft border border-slate-100 p-5 hover:shadow-md transition-shadow cursor-pointer relative overflow-hidden group">
                    <div class="absolute -right-4 -top-4 w-16 h-16 ${isRentable ? 'bg-green-50' : 'bg-red-50'} rounded-full opacity-50 group-hover:scale-150 transition-transform"></div>
                    <div class="flex justify-between items-start mb-3 relative z-10">
                        <span class="text-[10px] font-black uppercase tracking-widest bg-slate-800 text-white px-2.5 py-1 rounded-md">${formatDoubleDate(data.fecha_viaje)}</span>
                        <span class="text-[10px] font-black flex items-center ${isRentable ? 'text-green-600' : 'text-red-500'}"><i class="ph ${isRentable ? 'ph-trend-up' : 'ph-trend-down'} mr-1"></i> ${isRentable ? 'Rentable' : 'Pérdida'}</span>
                    </div>
                    <h4 class="font-black text-slate-800 text-lg leading-tight mb-4 relative z-10">${data.plan_nombre}</h4>
                    <div class="grid grid-cols-2 gap-4 border-t border-slate-100 pt-4 relative z-10">
                        <div><p class="text-[9px] text-slate-400 uppercase tracking-widest font-bold">Inscritos</p><p class="text-sm font-black text-slate-700 flex items-center"><i class="ph ph-users text-slate-400 mr-1.5"></i> ${data.pax_total} Pax</p></div>
                        <div class="text-right"><p class="text-[9px] text-slate-400 uppercase tracking-widest font-bold">Margen Proyectado</p><p class="text-sm font-black ${isRentable ? 'text-green-600' : 'text-red-500'}">${formatCOP(margen)}</p></div>
                    </div>
                </div>`;
        });

        if (!hasCards) {
            grid.innerHTML = '<div class="col-span-full p-10 text-center text-slate-400 font-bold border-2 border-dashed border-slate-200 rounded-2xl">No hay planes en esta categoría.</div>';
        }
    },

    openFinancialModal(planId, fecha) {
        this.currentPlanId = planId;
        this.currentFecha = fecha;

        const plan = DataService.planes.find(p => p.id === planId) || { nombre: 'Plan Eliminado del Sistema', costo_base: 0 };
        document.getElementById('rdm-title').innerHTML = `<i class="ph ph-briefcase text-primary-600 mr-2 text-2xl"></i> Finanzas: ${UI.sanitize(plan.nombre)}`;
        document.getElementById('rdm-subtitle').innerText = `Salida del ${UI.sanitize(formatDoubleDate(fecha))}`;

        const clientesSalida = DataService.clientes.filter(c => {
            const st = c.estado ? c.estado.toLowerCase() : '';
            const isInt = c.tipo_reserva === 'Internacional';
            if (this.currentTab === 'internacionales' && !isInt) return false;
            if (this.currentTab !== 'internacionales' && isInt) return false;
            return c.plan_id === planId && c.fecha_viaje === fecha && !['desistió', 'cancelado o devolución', 'cancelados'].includes(st);
        });

        // Resolve current catalog rates for this departure date
        let targetCostoBase = parseFloat(plan.costo_base || 0);
        let targetProvs = plan.proveedores_vinculados || [];

        const dateConfig = (plan.fechas || []).find(f => {
            const formattedDate = f.start === f.end
                ? formatShortDate(f.start)
                : `${formatShortDate(f.start)} al ${formatShortDate(f.end)}`;
            return formattedDate === fecha;
        });

        if (dateConfig && dateConfig.proveedores_vinculados && dateConfig.proveedores_vinculados.length > 0) {
            targetCostoBase = parseFloat(dateConfig.costo_base || 0);
            targetProvs = dateConfig.proveedores_vinculados;
        }

        if (targetCostoBase === 0 && targetProvs.length > 0) {
            targetCostoBase = targetProvs.reduce((sum, p) => sum + parseFloat(p.costo || 0), 0);
        }

        // Check for any client record out of sync with catalog costs
        let hasMismatch = false;
        clientesSalida.forEach(c => {
            const cCost = parseFloat(c.costo_base || 0);
            const cProvs = c.proveedores_vinculados || [];
            
            // Compare cost and providers
            const costsMatch = Math.abs(cCost - targetCostoBase) < 0.01;
            
            let provsMatch = true;
            if (cProvs.length !== targetProvs.length) {
                provsMatch = false;
            } else {
                const sortKey = p => p.id_proveedor || p.id_provider || p.nombre || '';
                const sortedA = [...cProvs].sort((x, y) => sortKey(x).localeCompare(sortKey(y)));
                const sortedB = [...targetProvs].sort((x, y) => sortKey(x).localeCompare(sortKey(y)));
                for (let i = 0; i < sortedA.length; i++) {
                    const pA = sortedA[i];
                    const pB = sortedB[i];
                    if (pA.nombre !== pB.nombre || pA.incluye !== pB.incluye || Math.abs(parseFloat(pA.costo || 0) - parseFloat(pB.costo || 0)) > 0.01) {
                        provsMatch = false;
                        break;
                    }
                }
            }
            if (!costsMatch || !provsMatch) {
                hasMismatch = true;
            }
        });

        if (hasMismatch) {
            console.log("Detectado desajuste de tarifas con el catálogo. Sincronizando automáticamente...");
            supabaseClient
                .from('clientes')
                .update({
                    costo_base: targetCostoBase,
                    proveedores_vinculados: targetProvs
                })
                .eq('plan_id', planId)
                .eq('fecha_viaje', fecha)
                .is('deleted_at', null)
                .then(({ error }) => {
                    if (!error) {
                        // Actualizar localmente la memoria caché de DataService
                        DataService.clientes.forEach(c => {
                            const st = c.estado ? c.estado.toLowerCase() : '';
                            const isInt = c.tipo_reserva === 'Internacional';
                            const matchTab = (this.currentTab === 'internacionales' && isInt) || (this.currentTab !== 'internacionales' && !isInt);
                            if (c.plan_id === planId && c.fecha_viaje === fecha && !['desistió', 'cancelado o devolución', 'cancelados'].includes(st) && matchTab) {
                                c.costo_base = targetCostoBase;
                                c.proveedores_vinculados = JSON.parse(JSON.stringify(targetProvs));
                            }
                        });
                        // Reabrir modal para refrescar visualmente
                        this.openFinancialModal(planId, fecha);
                    } else {
                        console.error("Error en auto-sincronización:", error);
                    }
                });
        }

        let paxTotal = 0; let paxServicio = 0; let ingresoBruto = 0; let ingresoRetenido = 0;
        const ul = document.getElementById('rdm-passengers-list');
        ul.innerHTML = '';

        const todayModal = new Date();
        todayModal.setHours(0,0,0,0);
        const dateViajeModal = parseSpanishDate(fecha);
        const isPastTrip = dateViajeModal && !isNaN(dateViajeModal) && dateViajeModal < todayModal;

        clientesSalida.forEach(c => {
            const p = this.getClientRealPax(c);
            paxTotal += p;

            const st = c.estado ? c.estado.toLowerCase() : '';
            const abonado = DataService.abonos.filter(a => a.cliente_id === c.id && a.estado_pago !== 'pending' && a.estado_pago !== 'refunded').reduce((s, a) => s + (Number(a.monto) || 0), 0);

            if (st === 'devolución') {
                const devuelto = parseFloat(c.monto_devuelto || 0);
                ingresoBruto += Math.max(0, abonado - devuelto);
                paxServicio += p;
            } else if (st === 'en caja') {
                ingresoBruto += abonado;
                ingresoRetenido += abonado;
            } else {
                ingresoBruto += parseFloat(c.precio_total || 0);
                paxServicio += p;
            }

            const isEnCajaPast = st === 'en caja' && isPastTrip;
            const saldo = Math.max(c.precio_total - abonado, 0);

            let statusHtml;
            if (isEnCajaPast) {
                statusHtml = `<span class="text-emerald-600 ml-1 flex items-center"><i class="ph ph-vault mr-0.5"></i> Retenido ${formatCOP(abonado)}</span>`;
            } else if (saldo <= 0) {
                statusHtml = `<span class="text-green-600 ml-1">Pagado</span>`;
            } else {
                statusHtml = `<span class="text-orange-500 ml-1">Debe ${formatCOP(saldo)}</span>`;
            }

            const enCajaBadge = isEnCajaPast ? `<span class="text-[8px] font-black uppercase bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded border border-emerald-200 ml-2">Saldo a Favor</span>` : '';

            ul.innerHTML += `
                <li class="p-3 hover:bg-slate-50 transition-colors ${isEnCajaPast ? 'bg-emerald-50/30 border-l-2 border-emerald-300' : ''}">
                    <div class="flex justify-between items-center">
                        <div>
                            <p class="text-xs font-bold text-slate-800">${UI.sanitize(c.nombre)} ${UI.sanitize(c.apellido)}${enCajaBadge}</p>
                            <p class="text-[10px] text-slate-500 flex items-center mt-0.5"><i class="ph ph-users mr-1"></i> ${p} Pax | ${statusHtml}</p>
                        </div>
                        <button data-action="rentabilidad-edit-client" data-cliente-id="${c.id}" class="text-primary-600 bg-primary-50 p-1.5 rounded hover:bg-primary-100 transition-colors"><i class="ph ph-pencil-simple text-sm pointer-events-none"></i></button>
                    </div>
                </li>`;
        });

        document.getElementById('rdm-pax-count').innerText = `${paxServicio} Pax (servicio)${paxTotal !== paxServicio ? ` / ${paxTotal} inscritos` : ''}`;
        document.getElementById('rdm-kpi-ingreso').innerText = formatCOP(ingresoBruto);

        const retenidoContainer = document.getElementById('rdm-kpi-retenido-container');
        if (retenidoContainer) {
            if (ingresoRetenido > 0) {
                retenidoContainer.classList.remove('hidden');
                document.getElementById('rdm-kpi-retenido').innerText = formatCOP(ingresoRetenido);
            } else {
                retenidoContainer.classList.add('hidden');
            }
        }

        const syncBtn = document.getElementById('btn-sync-rentabilidad-tarifas');
        if (syncBtn) {
            syncBtn.classList.remove('hidden');
        }

        this.renderGastos(plan, paxServicio, ingresoBruto);
        UI.openModal('rentabilidad-detail-modal', 'rdm-bg', 'rdm-content');
    },

    toggleGastoInput() {
        const tipo = document.getElementById('ng-tipo-valor').value;
        const label = document.getElementById('ng-label-valor');
        const sym = document.getElementById('ng-symbol');
        const inp = document.getElementById('ng-valor');
        if (tipo === 'porcentaje') { label.innerText = 'Porcentaje (%)'; sym.innerText = '%'; inp.placeholder = 'Ej: 10'; }
        else { label.innerText = 'Monto ($)'; sym.innerText = '$'; inp.placeholder = 'Ej: 300000'; }
    },

    previewSoporte(input) {
        const file = input.files[0];
        if (!file) return;
        const label = document.getElementById('ng-soporte-label');
        const preview = document.getElementById('ng-soporte-preview');
        const thumb = document.getElementById('ng-soporte-thumb');
        
        label.textContent = file.name.length > 20 ? file.name.substring(0, 17) + '...' : file.name;
        thumb.src = URL.createObjectURL(file);
        preview.classList.remove('hidden');
    },

    clearSoporte() {
        const input = document.getElementById('ng-soporte-file');
        if (input) input.value = '';
        const label = document.getElementById('ng-soporte-label');
        if (label) label.textContent = 'Seleccionar Foto...';
        const preview = document.getElementById('ng-soporte-preview');
        if (preview) preview.classList.add('hidden');
        const thumb = document.getElementById('ng-soporte-thumb');
        if (thumb) thumb.src = '';
    },

    async uploadSoporte(file) {
        const timestamp = Date.now();
        const ext = file.name.split('.').pop();
        const safeName = `gasto_${this.currentPlanId}_${timestamp}.${ext}`;
        const filePath = `comprobantes/${safeName}`;

        const { data, error } = await supabaseClient.storage
            .from('comprobantes')
            .upload(filePath, file, { cacheControl: '3600', upsert: false });

        if (error) throw error;

        const { data: urlData } = supabaseClient.storage
            .from('comprobantes')
            .getPublicUrl(filePath);

        return urlData.publicUrl;
    },

    async saveGasto(e) {
        e.preventDefault();
        const btn = document.getElementById('btn-save-gasto');
        const originalHtml = btn.innerHTML;
        btn.innerHTML = '<i class="ph ph-spinner animate-spin mr-2"></i> Subiendo...';
        btn.disabled = true;

        try {
            const fileInput = document.getElementById('ng-soporte-file');
            const file = fileInput.files[0];

            if (!file) {
                UI.showToast("Es obligatorio adjuntar una fotografía del comprobante de pago para poder registrar este gasto y mantener un control correcto de la rentabilidad.", "error");
                btn.innerHTML = originalHtml;
                btn.disabled = false;
                return;
            }

            btn.innerHTML = '<i class="ph ph-spinner animate-spin mr-2"></i> Subiendo foto...';
            let soporteUrl = '';
            try {
                soporteUrl = await this.uploadSoporte(file);
            } catch (uploadErr) {
                console.error("Error subiendo comprobante:", uploadErr);
                UI.showToast("Error al subir la foto. Verifica que el bucket 'comprobantes' exista en Supabase Storage y sea público.", "error");
                btn.innerHTML = originalHtml;
                btn.disabled = false;
                return;
            }

            btn.innerHTML = '<i class="ph ph-spinner animate-spin mr-2"></i> Guardando...';
            const payload = {
                plan_id: this.currentPlanId,
                fecha_viaje: this.currentFecha,
                categoria: document.getElementById('ng-categoria').value,
                concepto: document.getElementById('ng-concepto').value,
                tipo_valor: document.getElementById('ng-tipo-valor').value,
                valor: UI.parseCurrency(document.getElementById('ng-valor').value),
                soporte_url: soporteUrl,
                justificacion: document.getElementById('ng-justificacion').value.trim(),
                usuario_email: window.AuthModule?.currentUser?.email || 'Staff'
            };

            const { error } = await supabaseClient.from('gastos_salidas').insert([payload]);

            if (error) {
                if (error.code === '42703') {
                    UI.showToast("Crea las columnas 'soporte_url' y 'justificacion' (ambas 'text') en la tabla 'gastos_salidas' en Supabase", "error");
                    throw new Error("COLUMNAS_FALTANTES");
                }
                throw error;
            }
            document.getElementById('form-nuevo-gasto').reset();
            this.clearSoporte();
            this.toggleGastoInput();
            
            // Refrescar DB
            await DataService.loadAll();
            UI.showToast("Costo registrado correctamente.", "success");
        } catch (err) {
            UI.showToast("Error al guardar el gasto.", "error");
        } finally {
            btn.innerHTML = originalHtml;
            btn.disabled = false;
        }
    },

    async deleteGasto(id) {
        const IS_ADMIN = window.AuthModule?.userProfile?.rol === 'administrador';
        const gasto = DataService.gastos.find(g => g.id === id);
        if (gasto) {
            const hoursSinceCreated = (new Date() - new Date(gasto.created_at)) / (1000 * 60 * 60);
            if (!IS_ADMIN && hoursSinceCreated > 48) {
                return UI.showToast("Acción denegada: Gasto congelado por antigüedad contable.", "error");
            }
        }

        const name = gasto ? `Costo Operativo: ${gasto.concepto} (${formatCOP(gasto.costo)})` : 'Costo Operativo';
        window.promptGlobalDelete(id, 'gasto_salida', name);
    },

    async renderGastos(plan, paxServicio, ingresoBruto) {
        const list = document.getElementById('rdm-gastos-list');
        if (!list) return;
        list.innerHTML = '';
        let costoTotal = 0;

        let costoOperativoBase = 0;
        let desgloseCostosHtml = '';

        const clientesSalida = DataService.clientes.filter(c => {
            const st = c.estado ? c.estado.toLowerCase() : '';
            const isInt = c.tipo_reserva === 'Internacional';
            if (this.currentTab === 'internacionales' && !isInt) return false;
            if (this.currentTab !== 'internacionales' && isInt) return false;
            return c.plan_id === this.currentPlanId && c.fecha_viaje === this.currentFecha && !['desistió', 'cancelado o devolución', 'cancelados'].includes(st);
        });

        clientesSalida.forEach(c => {
            const st = c.estado ? c.estado.toLowerCase() : '';
            if (st !== 'en caja') {
                let cCost = (c.costo_base !== undefined && c.costo_base !== null) ? parseFloat(c.costo_base) : parseFloat(plan.costo_base || 0);
                if (cCost === 0) {
                    const provs = (c.proveedores_vinculados && c.proveedores_vinculados.length > 0)
                        ? c.proveedores_vinculados
                        : (plan.proveedores_vinculados || []);
                    cCost = provs.reduce((sum, p) => sum + parseFloat(p.costo || 0), 0);
                }
                costoOperativoBase += cCost * this.getClientRealPax(c);
            }
        });
        costoTotal += costoOperativoBase;

        // Construir el desglose detallado de proveedores vinculados
        const aggregatedProvs = {}; // Clave: Proveedor|Concepto, Valor: { nombre, incluye, costoUnitario, costoTotal, paxCount }

        clientesSalida.forEach(c => {
            const st = c.estado ? c.estado.toLowerCase() : '';
            if (st !== 'en caja') {
                const paxNum = this.getClientRealPax(c);
                let provs = (c.proveedores_vinculados && c.proveedores_vinculados.length > 0)
                    ? c.proveedores_vinculados
                    : (plan.proveedores_vinculados || []);

                const sumProvs = provs.reduce((sum, p) => sum + parseFloat(p.costo || 0), 0);
                
                // Calcular cCost usando la misma lógica original del sistema
                let cCost = (c.costo_base !== undefined && c.costo_base !== null) ? parseFloat(c.costo_base) : parseFloat(plan.costo_base || 0);
                if (cCost === 0) {
                    cCost = sumProvs;
                }
                
                // Si el costo final calculado difiere de la suma de los proveedores (o no hay proveedores asignados)
                if (provs.length === 0 || cCost !== sumProvs) {
                    const key = `Costo Base Programado|Tarifa base`;
                    if (!aggregatedProvs[key]) {
                        aggregatedProvs[key] = {
                            nombre: 'Costo Base Programado',
                            incluye: 'Tarifa de costo base por persona',
                            costoUnitario: cCost,
                            costoTotal: 0,
                            paxCount: 0
                        };
                    }
                    aggregatedProvs[key].costoTotal += cCost * paxNum;
                    aggregatedProvs[key].paxCount += paxNum;
                } else {
                    provs.forEach(p => {
                        const pName = p.nombre || 'Proveedor Desconocido';
                        const pConcept = p.incluye || 'Servicio general';
                        const pCosto = parseFloat(p.costo || 0);
                        const key = `${pName}|${pConcept}`;
                        if (!aggregatedProvs[key]) {
                            aggregatedProvs[key] = {
                                nombre: pName,
                                incluye: pConcept,
                                costoUnitario: pCosto,
                                costoTotal: 0,
                                paxCount: 0
                            };
                        }
                        aggregatedProvs[key].costoTotal += pCosto * paxNum;
                        aggregatedProvs[key].paxCount += paxNum;
                    });
                }
            }
        });

        // Renderizar cada proveedor desglosado en la tabla de costos auditados
        const provsList = Object.values(aggregatedProvs);
        if (provsList.length === 0) {
            list.innerHTML += `
                <tr class="bg-slate-50 border-b border-slate-100">
                    <td class="py-3 px-4"><span class="bg-slate-200 text-slate-700 text-[9px] font-black uppercase px-2 py-0.5 rounded">Matriz Base</span></td>
                    <td class="py-3 px-4">
                        <p class="text-xs font-bold text-slate-700">Costos Operativos (Proveedores)</p>
                        <span class="text-[9px] text-slate-500 block mt-0.5">$0 x ${paxServicio} Pax (servicio)</span>
                    </td>
                    <td class="py-3 px-4 text-right font-black text-slate-800">$0</td>
                    <td class="py-3 px-4 text-center"><i class="ph ph-lock-key text-slate-300"></i></td>
                </tr>`;
        } else {
            provsList.forEach(ap => {
                list.innerHTML += `
                    <tr class="bg-slate-50 border-b border-slate-100">
                        <td class="py-3 px-4"><span class="bg-slate-200 text-slate-700 text-[9px] font-black uppercase px-2 py-0.5 rounded">Matriz Base</span></td>
                        <td class="py-3 px-4">
                            <p class="text-xs font-bold text-slate-700">${UI.sanitize(ap.nombre)}</p>
                            <span class="text-[9px] text-slate-500 block mt-0.5">${UI.sanitize(ap.incluye)} — ${formatCOP(ap.costoUnitario)} x ${ap.paxCount} Pax</span>
                        </td>
                        <td class="py-3 px-4 text-right font-black text-slate-800">${formatCOP(ap.costoTotal)}</td>
                        <td class="py-3 px-4 text-center"><i class="ph ph-lock-key text-slate-300"></i></td>
                    </tr>`;
            });
        }

        const gastos = DataService.gastos.filter(g => g.plan_id === this.currentPlanId && g.fecha_viaje === this.currentFecha);
        gastos.forEach(g => {
            let valorCalculado = g.tipo_valor === 'fijo' ? parseFloat(g.valor) : ingresoBruto * (parseFloat(g.valor) / 100);
            let mathText = g.tipo_valor === 'fijo' ? 'Valor Fijo' : `${g.valor}% de Ingreso Bruto`;
            costoTotal += valorCalculado;

            let bgBadge = 'bg-slate-100 text-slate-600';
            if (g.categoria === 'Publicidad') bgBadge = 'bg-blue-100 text-blue-700';
            if (g.categoria === 'Comisión') bgBadge = 'bg-orange-100 text-orange-700';

            const IS_ADMIN = window.AuthModule?.userProfile?.rol === 'administrador';
            const hoursSinceCreated = (new Date() - new Date(g.created_at)) / (1000 * 60 * 60);
            const isFrozen = !IS_ADMIN && hoursSinceCreated > 48;

            let actionButton = '';
            if (isFrozen) {
                actionButton = '<i class="ph ph-lock-key text-slate-400 text-lg" title="Congelado (48h)"></i>';
            } else {
                actionButton = `<button data-action="delete-gasto" data-gasto-id="${g.id}" class="btn-delete-protected text-red-400 hover:text-red-600 p-1"><i class="ph ph-trash text-base pointer-events-none"></i></button>`;
            }

            const sopHtml = g.soporte_url 
                ? `<img src="${g.soporte_url}" alt="Comprobante" data-action="open-lightbox" data-url="${g.soporte_url}" class="w-16 h-12 object-cover rounded-lg border border-amber-200 shadow-sm hover:shadow-md hover:scale-105 transition-all cursor-pointer">` 
                : `<span class="text-slate-300 flex items-center text-[9px]" title="Sin soporte (Registro Antiguo)"><i class="ph ph-warning-circle mr-1"></i> Sin Foto</span>`;

            list.innerHTML += `
                <tr class="hover:bg-slate-50 transition-colors border-b border-slate-50">
                    <td class="py-3 px-4 align-top"><span class="${bgBadge} text-[9px] font-black uppercase px-2 py-0.5 rounded border border-white/50">${UI.sanitize(g.categoria)}</span></td>
                    <td class="py-3 px-4 align-top">
                        <p class="text-xs font-black text-slate-800">${UI.sanitize(g.concepto)}</p>
                        <p class="text-[9px] font-bold text-slate-500 mb-2">${mathText}</p>
                        ${g.justificacion ? `<p class="text-[9px] text-slate-600 bg-amber-50/50 p-1.5 rounded italic border border-amber-100/50 mb-2">"${UI.sanitize(g.justificacion)}"</p>` : ''}
                        <div class="text-[9px]">${sopHtml}</div>
                    </td>
                    <td class="py-3 px-4 text-right font-black text-slate-800 align-top">${formatCOP(valorCalculado)}</td>
                    <td class="py-3 px-4 text-center align-top">${actionButton}</td>
                </tr>`;
        });

        const margenNeto = ingresoBruto - costoTotal;
        document.getElementById('rdm-kpi-costo').innerText = formatCOP(costoTotal);

        const splitContainer = document.getElementById('rdm-partners-split');
        if (splitContainer && PartnersComponent) {
            await PartnersComponent.loadConfig();
            if (margenNeto <= 0) {
                splitContainer.innerHTML = `<div class="text-[9px] font-bold text-slate-400">Sin ganancia a distribuir</div>`;
            } else {
                let htmlSplit = '';
                PartnersComponent.sociosConfig.forEach(soc => {
                    const share = margenNeto * (soc.porcentaje / 100);
                    htmlSplit += `<div class="flex justify-between items-center text-[10px] font-bold mb-0.5"><span class="text-slate-500 truncate mr-2" title="${soc.nombre}">${soc.nombre} <span class="text-[8px] text-slate-300">(${soc.porcentaje}%)</span></span><span class="text-emerald-500 tabular-nums shrink-0">${formatCOP(share)}</span></div>`;
                });
                splitContainer.innerHTML = htmlSplit;
            }
        }

        const mEl = document.getElementById('rdm-kpi-margen');
        if (mEl) {
            mEl.innerText = formatCOP(margenNeto);
            if (margenNeto < 0) { mEl.classList.remove('text-green-400'); mEl.classList.add('text-red-400'); }
            else { mEl.classList.remove('text-red-400'); mEl.classList.add('text-green-400'); }
        }
    },

    async openPartnersVault() {
        if (PartnersComponent) {
            const hasAccess = await PartnersComponent.init();
            if (hasAccess) {
                UI.openModal('partners-vault-modal', 'pvm-bg', 'pvm-content');
            }
        }
    },

    async syncRatesWithCatalog() {
        const planId = this.currentPlanId;
        const fecha = this.currentFecha;
        if (!planId || !fecha) return;

        const plan = DataService.planes.find(p => p.id === planId);
        if (!plan) return UI.showToast("No se encontró el plan original en el catálogo.", "error");

        let targetCostoBase = parseFloat(plan.costo_base || 0);
        let targetProvs = plan.proveedores_vinculados || [];

        // Buscar si esta fecha tiene costos específicos en el catálogo
        const dateConfig = (plan.fechas || []).find(f => {
            const formattedDate = f.start === f.end
                ? formatShortDate(f.start)
                : `${formatShortDate(f.start)} al ${formatShortDate(f.end)}`;
            return formattedDate === fecha;
        });

        if (dateConfig && dateConfig.proveedores_vinculados && dateConfig.proveedores_vinculados.length > 0) {
            targetCostoBase = parseFloat(dateConfig.costo_base || 0);
            targetProvs = dateConfig.proveedores_vinculados;
        }

        // Robust fallback: if targetCostoBase is 0 but targetProvs has items, sum them
        if (targetCostoBase === 0 && targetProvs.length > 0) {
            targetCostoBase = targetProvs.reduce((sum, p) => sum + parseFloat(p.costo || 0), 0);
        }

        const confirmMsg = `¿Estás seguro de que deseas actualizar los costos de todos los pasajeros de esta salida ("${plan.nombre}") con las tarifas actuales del catálogo?\n\nEsto restablecerá el costo base a ${formatCOP(targetCostoBase)} por persona y actualizará los servicios vinculados. Las utilidades de esta salida se recalcularán de inmediato.`;
        if (!confirm(confirmMsg)) return;

        const syncBtn = document.getElementById('btn-sync-rentabilidad-tarifas');
        const originalHtml = syncBtn.innerHTML;
        syncBtn.disabled = true;
        syncBtn.innerHTML = '<i class="ph ph-spinner animate-spin text-base"></i> Sincronizando...';

        try {
            // Actualizar en base de datos todos los clientes activos de este plan y fecha
            const { error } = await supabaseClient
                .from('clientes')
                .update({
                    costo_base: targetCostoBase,
                    proveedores_vinculados: targetProvs
                })
                .eq('plan_id', planId)
                .eq('fecha_viaje', fecha)
                .is('deleted_at', null);

            if (error) throw error;

            // Registrar en el historial de reservas
            try {
                const userEmail = window.AuthModule?.currentUser?.email || 'Staff';
                const clientesSalida = DataService.clientes.filter(c => {
                    const st = c.estado ? c.estado.toLowerCase() : '';
                    return c.plan_id === planId && c.fecha_viaje === fecha && !['desistió', 'cancelado o devolución', 'cancelados'].includes(st);
                });
                
                const logEntries = clientesSalida.map(c => ({
                    cliente_id: c.id,
                    campo: 'costo_base',
                    valor_anterior: c.costo_base !== undefined ? String(c.costo_base) : '0',
                    valor_nuevo: String(targetCostoBase),
                    usuario_email: userEmail,
                    tipo_evento: 'MODIFICACION',
                    detalles: { motivo: 'Sincronización masiva de costos de salida con el catálogo' }
                }));

                if (logEntries.length > 0) {
                    await supabaseClient.from('historial_reservas').insert(logEntries);
                }
            } catch (histError) {
                console.warn('No se pudo asentar el log en el historial:', histError);
            }

            // Recargar datos en local
            await DataService.loadAll();
            UI.showToast("Costos de pasajeros sincronizados correctamente con el catálogo.", "success");

            // Volver a renderizar modal
            this.openFinancialModal(planId, fecha);
        } catch (err) {
            console.error('Error al sincronizar costos:', err);
            UI.showToast("Error al sincronizar costos con el catálogo.", "error");
        } finally {
            syncBtn.disabled = false;
            syncBtn.innerHTML = originalHtml;
        }
    }
};
