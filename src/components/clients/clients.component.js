// js/modules/clients.module.js — Directorio de Reservas
// Cross-module: window.AuthModule, window.DashboardModule, window.BitacoraModule, window.DispatchModule
// Extraído quirúrgicamente de app.js líneas 1543-2457
import { DataService, supabaseClient } from '../../../js/services/supabase.service.js';
import { UI } from '../../../js/utils/ui.utils.js';
import { formatCOP, formatShortDate, calcularFinanzas, updateFinancialUI, distributeAmount } from '../../../js/utils/format.utils.js';
import { Store } from '../../core/store.js';

export const ClientsComponent = {
    currentClientId: null,

    filterTable() {
        const searchTerm = document.getElementById('buscador-clientes-rapido').value.toLowerCase();
        const rows = document.querySelectorAll('.client-row, .client-card');

        rows.forEach(row => {
            const textContent = row.textContent.toLowerCase();
            if (textContent.includes(searchTerm)) {
                row.style.display = '';
            } else {
                row.style.display = 'none';
            }
        });
    },

    init() {
        this.populateFilters();
        this.renderTable();
        this.bindEvents();

        window.emitirReciboAbono = (abonoId) => {
            this.closeFormModal();
            window.DocumentosComponent.loadSingleAbonoReceipt(abonoId);
            window.App.navigate('documentos');
        };

        // Reactividad: Suscribir al Store
        Store.subscribe(() => {
            this.populateFilters();
            this.renderTable();
        });
    },

    bindEvents() {
        // Buscador
        const searchInput = document.getElementById('buscador-clientes-rapido');
        if (searchInput) {
            searchInput.addEventListener('input', () => this.filterTable());
        }

        // Exportar CSV
        const btnExport = document.querySelector('button[onclick="ClientsModule.exportToCSV()"]') || document.getElementById('btn-export-clients');
        if (btnExport) {
            btnExport.removeAttribute('onclick');
            btnExport.id = 'btn-export-clients';
            btnExport.addEventListener('click', () => this.exportToCSV());
        }

        // Nuevo Cliente
        const btnNew = document.querySelector('button[onclick="ClientsModule.openFormModal()"]') || document.getElementById('btn-new-client');
        if (btnNew) {
            btnNew.removeAttribute('onclick');
            btnNew.id = 'btn-new-client';
            btnNew.addEventListener('click', () => this.openFormModal());
        }

        // Tabs de filtros
        const tabIds = ['activas', 'en-caja', 'devolucion', 'reprogramado', 'realizadas'];
        tabIds.forEach(tab => {
            const tabBtn = document.getElementById(`clients-tab-${tab}`);
            if (tabBtn) {
                tabBtn.removeAttribute('onclick');
                tabBtn.addEventListener('click', () => this.switchClientTab(tab));
            }
        });

        // Formulario de Cliente
        const clientForm = document.getElementById('client-form');
        if (clientForm) {
            clientForm.removeAttribute('onsubmit');
            clientForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveClient();
            });
        }

        const planSelect = document.getElementById('cf-plan-id');
        if (planSelect) {
            planSelect.addEventListener('change', () => this.onPlanSelect());
        }

        const selectFechas = document.getElementById('cf-fecha-viaje');
        if (selectFechas) {
            selectFechas.addEventListener('change', () => this.onDateSelectChange());
        }

        const paxInput = document.getElementById('cf-pax');
        if (paxInput) {
            paxInput.addEventListener('input', () => this.onPaxChange());
            paxInput.addEventListener('change', () => this.onPaxChange());
        }

        const tipoPagoSelect = document.getElementById('cf-tipo-pago');
        if (tipoPagoSelect) {
            tipoPagoSelect.addEventListener('change', () => this.onTipoPagoChange());
        }

        const abonoInicialInput = document.getElementById('cf-abono-inicial');
        if (abonoInicialInput) {
            abonoInicialInput.addEventListener('input', () => this.calculateTotals());
        }

        const precioTotalInput = document.getElementById('cf-precio-total');
        if (precioTotalInput) {
            precioTotalInput.addEventListener('input', () => this.calculateTotals());
        }
        
        const estadoSelect = document.getElementById('cf-estado');
        if (estadoSelect) {
            estadoSelect.addEventListener('change', (e) => this.toggleDevolucionInput(e.target.value));
        }

        const companionContainer = document.getElementById('cf-acompanantes-container');
        if (companionContainer) {
            companionContainer.addEventListener('input', (e) => {
                if (e.target.classList.contains('comp-nombre') || e.target.classList.contains('comp-apellido')) {
                    this.populateNewClientAbonoDestinatario();
                }
            });
        }

        const cfNombre = document.getElementById('cf-nombre');
        const cfApellido = document.getElementById('cf-apellido');
        if (cfNombre) cfNombre.addEventListener('input', () => this.populateNewClientAbonoDestinatario());
        if (cfApellido) cfApellido.addEventListener('input', () => this.populateNewClientAbonoDestinatario());

        const btnSaveClient = document.getElementById('btn-save-client');
        if (btnSaveClient) {
            btnSaveClient.removeAttribute('onclick');
            btnSaveClient.addEventListener('click', () => this.saveClient());
        }

        const btnLiveAbono = document.getElementById('btn-live-abono');
        if (btnLiveAbono) {
            btnLiveAbono.removeAttribute('onclick');
            btnLiveAbono.addEventListener('click', () => this.saveLiveAbono());
        }

        // Event Delegation para botones generados dinámicamente
        document.body.addEventListener('click', (e) => {
            const target = e.target.closest('button, select');
            if (!target) return;

            if (target.dataset.action === 'edit-abono') {
                this.promptEditAbono(target.dataset.abonoId, target.dataset.clienteId, target.dataset.monto, target.dataset.estado);
            } else if (target.dataset.action === 'delete-abono') {
                this.promptDeleteAbono(target.dataset.abonoId, target.dataset.clienteId);
            } else if (target.dataset.action === 'receipt-abono') {
                window.emitirReciboAbono(target.dataset.abonoId);
            } else if (target.dataset.action === 'quick-abono') {
                this.saveQuickAbono(target.dataset.clienteId);
            } else if (target.dataset.action === 'edit-client-master') {
                this.closeDetailModal();
                setTimeout(() => this.openFormModal(target.dataset.clienteId), 300);
            } else if (target.id === 'aam-confirm-btn') {
                this.executeAbonoAction();
            } else if (target.dataset.action === 'close-client-form' || target.id === 'client-form-bg') {
                this.closeFormModal();
            } else if (target.dataset.action === 'close-client-detail' || target.id === 'cdm-bg') {
                this.closeDetailModal();
            } else if (target.dataset.action === 'close-client-transfer' || target.id === 'ctm-bg') {
                this.closeTransferModal();
            } else if (target.id === 'ctm-confirm-btn') {
                this.executeTransfer();
            } else if (target.dataset.action === 'close-client-merge' || target.id === 'cmg-bg') {
                this.closeMergeModal();
            } else if (target.id === 'btn-bulk-merge-groups') {
                this.openMergeModal();
            } else if (target.id === 'btn-execute-merge') {
                this.executeMerge();
            }
        });

        document.body.addEventListener('change', (e) => {
            const target = e.target;
            if (target.dataset.action === 'quick-etiqueta') {
                this.quickEtiquetaChange(target.dataset.clienteId, target.value, target);
            }
        });
        const cfSoporteFile = document.getElementById('cf-soporte-pago-file');
        if (cfSoporteFile) {
            cfSoporteFile.addEventListener('change', (e) => this.previewSoportePago(e.target));
        }
        const btnClearCfSoporte = document.getElementById('btn-clear-soporte-pago');
        if (btnClearCfSoporte) {
            btnClearCfSoporte.addEventListener('click', () => this.clearSoportePago());
        }
    },

    populateFilters() {
        const sC = document.getElementById('uf-ciudad');
        const sP = document.getElementById('uf-plan');

        if (!sC || !sP) return;

        sC.innerHTML = '<option value="">Todas las Ciudades</option>';
        sP.innerHTML = '<option value="">Todos los Planes</option>';

        [...new Set(DataService.clientes.map(c => c.ciudad).filter(Boolean))].forEach(c => {
            sC.innerHTML += `<option value="${c}">${c}</option>`;
        });

        [...new Set(DataService.planes.map(p => p.nombre))].forEach(p => {
            sP.innerHTML += `<option value="${p}">${p}</option>`;
        });

        // Reset del filtro anidado de fechas
        const sF = document.getElementById('uf-fecha');
        if (sF) {
            sF.innerHTML = '<option value="">Selecciona un plan primero</option>';
            sF.disabled = true;
        }
    },

    renderTable() {
        this.updateTabBadges();

        const tb = document.getElementById('clients-table-body');
        if (!tb) return;
        tb.innerHTML = '';

        let clientesFiltrados = DataService.clientes.filter(cli => {
            const tabName = this.getClientTabMapping(cli);
            return tabName === (this.currentTab || 'activas');
        });

        const emptyState = document.getElementById('clients-table-empty');
        if (clientesFiltrados.length === 0) {
            if (emptyState) emptyState.classList.remove('hidden');
            return;
        } else {
            if (emptyState) emptyState.classList.add('hidden');
        }

        const fragment = document.createDocumentFragment();

        clientesFiltrados.forEach((cli, idx) => {

            const plan = DataService.planes.find(p => p.id === cli.plan_id);
            const pNom = plan ? plan.nombre : 'Sin Plan Vinculado';

            let cls = 'bg-slate-50 text-slate-600 border-slate-100';
            const stLower = cli.estado ? cli.estado.toLowerCase() : '';
            if (stLower === 'confirmado') cls = 'bg-emerald-50 text-emerald-700 border-emerald-100/50';
            if (stLower === 'en caja') cls = 'bg-emerald-50 text-emerald-800 border-emerald-100';
            if (stLower === 'pendiente de pago') cls = 'bg-amber-50 text-amber-700 border-amber-100/50';
            if (stLower === 'realizado') cls = 'bg-slate-50 text-slate-600 border-slate-100';
            if (stLower === 'devolución' || stLower === 'cancelado o devolución') cls = 'bg-rose-50 text-rose-700 border-rose-100/50';
            if (stLower === 'registro pendiente') cls = 'bg-indigo-50 text-indigo-700 border-indigo-100/50';
            if (stLower === 'reprogramado') cls = 'bg-orange-50 text-orange-700 border-orange-100/50';

            let totalAbo = 0;
            let targetPrice = cli.precio_total || 0;

            if (!cli.parent_id && (cli.pax || 1) > 1) {
                // Titular: consolidate prices and abonos
                const comps = DataService.clientes.filter(c => c.parent_id === cli.id && !c.deleted_at);
                const groupIds = [cli.id, ...comps.map(c => c.id)];
                totalAbo = DataService.abonos.filter(a => groupIds.includes(a.cliente_id) && a.estado_pago !== 'pending' && a.estado_pago !== 'refunded').reduce((s, a) => s + (Number(a.monto) || 0), 0);
                targetPrice = (cli.precio_total || 0) * (cli.pax || 1);
            } else {
                // Companion or individual
                totalAbo = DataService.abonos.filter(a => a.cliente_id === cli.id && a.estado_pago !== 'pending' && a.estado_pago !== 'refunded').reduce((s, a) => s + (Number(a.monto) || 0), 0);
                targetPrice = cli.precio_total || 0;
            }
            const fin = calcularFinanzas(totalAbo, targetPrice);

            const tr = document.createElement('tr');
            tr.className = `client-row hover:bg-slate-50/70 transition-all border-b border-slate-100 cursor-pointer`;

            tr.setAttribute('data-id', cli.id);
            tr.setAttribute('data-ciudad', UI.sanitize(cli.ciudad || ''));
            tr.setAttribute('data-plan', UI.sanitize(pNom));
            tr.setAttribute('data-estado', UI.sanitize(cli.estado));
            tr.setAttribute('data-fecha', UI.sanitize(cli.fecha_viaje || ''));

            tr.onclick = (e) => {
                if (!e.target.closest('button') && !e.target.closest('input')) {
                    this.openDetailModal(cli.id);
                }
            }

            // 1. LÓGICA DEL GLOWING DOT (PUNTO DE SEGUIMIENTO)
            const seguimientosActivos = (DataService.seguimientos || []).filter(s => s.cliente_id === cli.id && s.estado === 'pendiente');
            let glowingDot = '';
            if (seguimientosActivos.length > 0) {
                seguimientosActivos.sort((a, b) => new Date(a.fecha_programada) - new Date(b.fecha_programada));
                const seg = seguimientosActivos[0];
                const isPastOrToday = new Date(seg.fecha_programada + "T23:59:59") <= new Date();

                const colorOuter = isPastOrToday ? 'bg-red-400' : 'bg-amber-400';
                const colorInner = isPastOrToday ? 'bg-red-500' : 'bg-amber-500';

                glowingDot = `
                    <span class="relative flex h-2 w-2 ml-2 inline-block" title="Seguimiento: ${seg.nota}">
                        <span class="animate-ping absolute inline-flex h-full w-full rounded-full ${colorOuter} opacity-75"></span>
                        <span class="relative inline-flex rounded-full h-2 w-2 ${colorInner}"></span>
                    </span>
                `;
            }

            // 2. LÓGICA DE ETIQUETA SUTIL Y FECHA DE VIAJE
            const tagHtml = (cli.etiqueta && cli.etiqueta !== '' && cli.etiqueta !== '-- Sin Etiqueta --')
                ? `<span class="text-[9px] font-semibold bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded border border-purple-100/50 mb-1 inline-block">${UI.sanitize(cli.etiqueta)}</span>`
                : '';

            let groupBadge = '';
            if (cli.parent_id) {
                const titular = DataService.clientes.find(c => c.id === cli.parent_id);
                if (titular) {
                    groupBadge = `<span class="text-[9px] font-semibold bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200/60 mb-1 inline-block mr-1">Acompañante de ${UI.sanitize(titular.nombre)}</span>`;
                }
            }

            let fechaLimpia = cli.fecha_viaje ? UI.sanitize(cli.fecha_viaje) : 'S/F';
            fechaLimpia = fechaLimpia.replace(/20\d{2}/g, '').replace(/ al /g, ' - ').replace(' (Histórico)', '');
            fechaLimpia = fechaLimpia.replace(/ , /g, ' ').replace(/,\s*-/g, ' -').replace(/,\s*$/, '').trim();
            const fechaBadge = fechaLimpia;

            // 3. INYECCIÓN DEL HTML EN LA FILA
            tr.innerHTML = `
                <td class="py-3 px-4 text-center" onclick="event.stopPropagation()">
                    <input type="checkbox" value="${cli.id}" onchange="window.DispatchModule.toggleClientSelection('${cli.id}')" class="client-checkbox w-4 h-4 rounded border-slate-200 text-slate-900 focus:ring-slate-900 cursor-pointer">
                </td>
                <td class="py-3 px-4">
                    <div class="flex flex-wrap gap-1">
                        ${groupBadge}
                        ${tagHtml}
                    </div>
                    <p class="font-semibold text-slate-900 text-sm leading-none flex items-center mt-1">${UI.sanitize(cli.nombre)} ${UI.sanitize(cli.apellido)} ${glowingDot}</p>
                    <p class="text-[10px] text-slate-400 font-mono mt-1">${UI.sanitize(cli.documento)}</p>
                </td>
                <td class="py-3 px-4">
                    <p class="text-xs font-medium text-slate-700 flex items-center"><i class="ph ph-whatsapp-logo text-green-500 mr-1 text-lg"></i> ${UI.sanitize(cli.telefono)}</p>
                </td>
                <td class="py-3 px-4">
                    <p class="font-semibold text-slate-900 text-sm leading-tight">${UI.sanitize(pNom)}</p>
                    <p class="text-[10px] font-medium text-slate-500 flex items-center mt-1 bg-slate-50 px-1.5 py-0.5 rounded w-fit border border-slate-100"><i class="ph ph-calendar-blank mr-1"></i> ${fechaBadge}</p>
                </td>
                <td class="py-3 px-4 text-right">
                    <p class="text-sm font-semibold text-slate-900">${formatCOP(fin.abonado)}</p>
                    ${this.currentTab === 'devolucion' && cli.monto_devuelto !== undefined 
                        ? `<p class="text-[10px] font-semibold text-rose-600 mt-1 bg-rose-50 px-1.5 py-0.5 rounded inline-block border border-rose-100/50">Devolución: ${formatCOP(cli.monto_devuelto)}</p>`
                        : `<div class="flex items-center justify-end mt-1">
                                <div class="w-16 h-1 bg-slate-100 rounded-full overflow-hidden mr-2">
                                    <div class="h-full bg-slate-900" style="width: ${fin.porcentaje}%"></div>
                                </div>
                                <p class="text-[10px] font-semibold text-slate-700">${fin.porcentaje}%</p>
                           </div>
                           <p class="text-[10px] text-slate-400 mt-0.5">Pendiente: ${formatCOP(fin.saldo)}</p>`
                    }
                </td>
                <td class="py-3 px-4">
                    <span class="px-2.5 py-1 rounded-full text-[10px] font-medium border ${cls}">${UI.sanitize(cli.estado)}</span>
                </td>
            `;
            fragment.appendChild(tr); // Guardamos en memoria
        });

        // Estampamos en pantalla una ÚNICA vez
        tb.appendChild(fragment);
    },

    openFormModal(forceId = null) {
        document.getElementById('client-form').reset();
        document.getElementById('cf-id').value = "";

        this.clearSoportePago();
        const currentSop = document.getElementById('cf-soporte-pago-current');
        if (currentSop) currentSop.classList.add('hidden');

        UI.switchTab('cliente', 'datosp');

        const pList = document.getElementById('cf-plan-id');
        pList.innerHTML = '<option value="">-- Conectar a Plan --</option>';
        DataService.planes.forEach(p => {
            pList.innerHTML += `<option value="${p.id}">${p.nombre} (${formatCOP(p.precio_persona)} / Pax)</option>`;
        });

        document.getElementById('cf-proveedores-list').innerHTML = '<tr><td colspan="3" class="p-6 text-center text-slate-400 italic">Asigna plan primero para desplegar la logística.</td></tr>';
        document.getElementById('cf-abonos-history').innerHTML = '';
        document.getElementById('bitacora-timeline-list').innerHTML = '';

        this.onTipoPagoChange();

        if (forceId) {
            const c = DataService.clientes.find(cli => cli.id === forceId);
            if (c) {
                // Redirigir si es acompañante
                if (c.parent_id) {
                    UI.showToast("Redirigiendo al titular del grupo...", "info");
                    this.closeFormModal();
                    setTimeout(() => this.openFormModal(c.parent_id), 300);
                    return;
                }

                document.getElementById('client-form-title').innerText = "Editor Maestro de Reserva";
                document.getElementById('cf-id').value = c.id;
                document.getElementById('cf-nombre').value = c.nombre;
                document.getElementById('cf-apellido').value = c.apellido;
                document.getElementById('cf-documento').value = c.documento;
                document.getElementById('cf-telefono').value = c.telefono;
                document.getElementById('cf-email').value = c.email || '';
                document.getElementById('cf-ciudad').value = c.ciudad || '';
                document.getElementById('cf-edad').value = c.edad || '';
                document.getElementById('cf-eps').value = c.eps || '';
                document.getElementById('cf-plan-id').value = c.plan_id;
                document.getElementById('cf-pax').value = c.pax || 1;
                
                // Mostrar precio consolidado para el titular
                const consolidatedPrice = Math.floor((c.precio_total || 0) * (c.pax || 1));
                UI.setCurrencyValue('cf-precio-total', consolidatedPrice);
                
                document.getElementById('cf-estado').value = c.estado;
                // ERR-023 FIX: Inicializar dataset de cambio manual desde la BD
                const estadoSelectEl = document.getElementById('cf-estado');
                if (estadoSelectEl) {
                    estadoSelectEl.dataset.manualChange = c.estado_manual ? 'true' : 'false';
                    estadoSelectEl.removeEventListener('change', this._onEstadoManualChange);
                    this._onEstadoManualChange = () => { estadoSelectEl.dataset.manualChange = 'true'; };
                    estadoSelectEl.addEventListener('change', this._onEstadoManualChange);
                }
                document.getElementById('cf-alergias').value = c.alergias || '';
                document.getElementById('cf-requerimientos').value = c.requerimientos || '';
                document.getElementById('cf-contacto').value = c.contacto_emergencia || '';

                // Cargar acompañantes
                const companions = DataService.clientes.filter(comp => comp.parent_id === c.id && !comp.deleted_at);
                this.renderCompanionsInputs(companions);

                // Poblar destinatarios abono live
                this.populateAbonoDestinatarios(c.id);

                const linkSop = document.getElementById('cf-soporte-pago-link');
                if (c.soporte_pago_url) {
                    if (linkSop) linkSop.href = c.soporte_pago_url;
                    if (currentSop) currentSop.classList.remove('hidden');
                }

                let selEtiqueta = document.getElementById('cf-etiqueta');
                if (c.etiqueta && ![...selEtiqueta.options].some(o => o.value === c.etiqueta)) {
                    selEtiqueta.innerHTML += `<option value="${c.etiqueta}">${c.etiqueta}</option>`;
                }
                selEtiqueta.value = c.etiqueta || '';

                if (c.monto_devuelto !== undefined) {
                    UI.setCurrencyValue('cf-monto-devuelto', c.monto_devuelto);
                } else {
                    document.getElementById('cf-monto-devuelto').value = '';
                }
                this.toggleDevolucionInput(c.estado);

                this.onPlanSelect(true);

                document.getElementById('cf-tipo-pago').disabled = true;
                document.getElementById('div-abono-monto').classList.add('hidden');
                document.getElementById('div-abono-metodo').classList.add('hidden');
                document.getElementById('cf-pagos-new').classList.add('hidden');
                document.getElementById('cf-pagos-existing').classList.remove('hidden');

                this.renderAbonosHistory(c);
                window.BitacoraModule.renderTimeline(forceId);
            }
        } else {
            document.getElementById('client-form-title').innerText = "Punto de Venta / Nuevo Contrato";
            document.getElementById('cf-tipo-pago').value = 'abono';
            document.getElementById('cf-tipo-pago').disabled = false;
            document.getElementById('cf-pagos-new').classList.remove('hidden');
            document.getElementById('cf-pagos-existing').classList.add('hidden');
            
            document.getElementById('cf-monto-devuelto').value = '';
            this.toggleDevolucionInput('pendiente de pago');

            // Reset tab button and container for companions
            document.getElementById('tab-btn-acompanantes').classList.add('hidden');
            document.getElementById('cf-acompanantes-container').innerHTML = '';
            document.getElementById('div-abono-destinatario-new').classList.add('hidden');

            this.onTipoPagoChange();
            this.calculateTotals();

            // ERR-023 FIX: Reset dataset y listener para clientes nuevos
            const estadoSelectNew = document.getElementById('cf-estado');
            if (estadoSelectNew) {
                estadoSelectNew.dataset.manualChange = 'false';
                estadoSelectNew.removeEventListener('change', this._onEstadoManualChange);
                this._onEstadoManualChange = () => { estadoSelectNew.dataset.manualChange = 'true'; };
                estadoSelectNew.addEventListener('change', this._onEstadoManualChange);
            }
        }
        UI.openModal('client-form-modal', 'client-form-bg', 'client-form-content');
    },

    closeFormModal() {
        UI.closeModal('client-form-modal', 'client-form-bg', 'client-form-content');
    },

    previewSoportePago(input) {
        const file = input.files[0];
        if (!file) return;
        const label = document.getElementById('cf-soporte-pago-label');
        const preview = document.getElementById('cf-soporte-pago-preview');
        const thumb = document.getElementById('cf-soporte-pago-thumb');
        const current = document.getElementById('cf-soporte-pago-current');
        
        label.textContent = file.name.length > 20 ? file.name.substring(0, 17) + '...' : file.name;
        thumb.src = URL.createObjectURL(file);
        preview.classList.remove('hidden');
        if (current) current.classList.add('hidden');
    },

    clearSoportePago() {
        const input = document.getElementById('cf-soporte-pago-file');
        if (input) input.value = '';
        const label = document.getElementById('cf-soporte-pago-label');
        if (label) label.textContent = 'Seleccionar Imagen...';
        const preview = document.getElementById('cf-soporte-pago-preview');
        if (preview) preview.classList.add('hidden');
        const thumb = document.getElementById('cf-soporte-pago-thumb');
        if (thumb) thumb.src = '';
    },

    toggleDevolucionInput(estado) {
        const divMonto = document.getElementById('div-monto-devuelto');
        if (!divMonto) return;
        if (estado === 'devolución') {
            divMonto.classList.remove('hidden');
        } else {
            divMonto.classList.add('hidden');
        }
    },

    onPlanSelect(bloqueo = false) {
        const id = document.getElementById('cf-plan-id').value;
        const trs = document.getElementById('cf-proveedores-list');
        const selectFechas = document.getElementById('cf-fecha-viaje');
        const divFechas = document.getElementById('div-cf-fechas');

        if (!id) {
            trs.innerHTML = '<tr><td colspan="3" class="p-6 text-center text-slate-400 italic">Esperando selección del plan...</td></tr>';
            if (divFechas) divFechas.classList.add('hidden');
            return;
        }

        const plan = DataService.planes.find(p => p.id === id);
        if (plan) {
            if (!bloqueo) {
                UI.setCurrencyValue('cf-abono-inicial', plan.deposito_requerido || 0);
            }

            // LÓGICA DEL DESPLEGABLE DE FECHAS
            if (selectFechas && divFechas) {
                selectFechas.innerHTML = '<option value="">-- Elige la fecha de viaje --</option>';
                if (plan.fechas && plan.fechas.length > 0) {
                    const hoy = new Date();
                    hoy.setHours(0, 0, 0, 0);

                    plan.fechas.forEach(f => {
                        const isPast = new Date(f.start + "T00:00:00") < hoy;
                        const text = f.start === f.end
                            ? formatShortDate(f.start)
                            : `${formatShortDate(f.start)} al ${formatShortDate(f.end)}`;

                        if (isPast) {
                            selectFechas.innerHTML += `<option value="${text}">${text} (Finalizado)</option>`;
                        } else {
                            selectFechas.innerHTML += `<option value="${text}">${text}</option>`;
                        }
                    });

                    divFechas.classList.remove('hidden');

                    // Preseleccionar fecha si estamos editando un cliente
                    if (bloqueo && document.getElementById('cf-id').value) {
                        const c = DataService.clientes.find(cli => cli.id === document.getElementById('cf-id').value);
                        if (c && c.fecha_viaje) {
                            if (![...selectFechas.options].some(o => o.value === c.fecha_viaje)) {
                                selectFechas.innerHTML += `<option value="${c.fecha_viaje}" selected>${c.fecha_viaje} (Histórico)</option>`;
                            }
                            selectFechas.value = c.fecha_viaje;
                        }
                    }
                } else {
                    selectFechas.innerHTML = '<option value="Fecha Abierta">Fecha Abierta / No definida</option>';
                    divFechas.classList.remove('hidden');
                }
            }

            const fId = document.getElementById('cf-id').value;
            const c = fId ? DataService.clientes.find(cli => cli.id === fId) : null;
            this.renderProvidersForSelectedDate(id, bloqueo, c);
        }
    },

    onDateSelectChange() {
        const planId = document.getElementById('cf-plan-id').value;
        if (!planId) return;

        const fId = document.getElementById('cf-id').value;
        const c = fId ? DataService.clientes.find(cli => cli.id === fId) : null;
        
        const isEditing = !!c;
        this.renderProvidersForSelectedDate(planId, isEditing, c);
    },

    renderProvidersForSelectedDate(planId, isEditing = false, clientObj = null) {
        const trs = document.getElementById('cf-proveedores-list');
        if (!trs) return;

        const plan = DataService.planes.find(p => p.id === planId);
        if (!plan) {
            trs.innerHTML = '<tr><td colspan="3" class="p-6 text-center text-slate-400 italic">Esperando selección del plan...</td></tr>';
            return;
        }

        const fechaSelect = document.getElementById('cf-fecha-viaje')?.value;
        let provs = [];

        // Si se está editando y la fecha elegida es la misma que ya tenía guardada la reserva,
        // usamos los proveedores congelados/personalizados de la reserva.
        if (isEditing && clientObj && clientObj.fecha_viaje === fechaSelect && clientObj.proveedores_vinculados && clientObj.proveedores_vinculados.length > 0) {
            provs = clientObj.proveedores_vinculados;
        } else {
            // De lo contrario (o si es reserva nueva), buscamos los proveedores de la fecha en el catálogo
            let dateConfig = null;
            if (fechaSelect && plan.fechas) {
                dateConfig = plan.fechas.find(f => {
                    const formattedDate = f.start === f.end
                        ? formatShortDate(f.start)
                        : `${formatShortDate(f.start)} al ${formatShortDate(f.end)}`;
                    return formattedDate === fechaSelect;
                });
            }

            if (dateConfig && dateConfig.proveedores_vinculados && dateConfig.proveedores_vinculados.length > 0) {
                provs = dateConfig.proveedores_vinculados;
            } else {
                provs = plan.proveedores_vinculados || [];
            }
        }

        trs.innerHTML = '';
        if (provs && provs.length > 0) {
            provs.forEach(pr => {
                trs.innerHTML += `
                <tr>
                    <td class="p-3 font-bold text-xs uppercase border-b border-slate-100">${pr.nombre}</td>
                    <td class="p-3 font-medium text-sm border-b border-slate-100">${pr.incluye}</td>
                    <td class="p-3 text-right font-black border-b border-slate-100">${formatCOP(pr.costo)}</td>
                </tr>`;
            });
        } else {
            trs.innerHTML = '<tr><td colspan="3" class="p-6 text-center text-orange-400 font-semibold">Este plan no tiene proveedores cargados.</td></tr>';
        }
        this.calculateTotals();
    },

    calculateTotals() {
        try {
            const pId = document.getElementById('cf-plan-id').value;
            const pxStr = document.getElementById('cf-pax')?.value;
            const px = Math.max(1, Math.floor(Number(pxStr || 1)));
            const plan = DataService.planes.find(pl => pl.id === pId);
            const formEsNuevo = !document.getElementById('cf-id').value;

            // Solo autocalcula el precio total si es nuevo y el usuario NO está editando el campo manualmente
            if (formEsNuevo && plan && document.activeElement.id !== 'cf-precio-total') {
                UI.setCurrencyValue('cf-precio-total', Math.floor(parseFloat(plan.precio_persona) * px));
            }

            const tN = UI.parseCurrency(document.getElementById('cf-precio-total')?.value);
            let tA = 0;

            if (formEsNuevo) {
                tA = UI.parseCurrency(document.getElementById('cf-abono-inicial')?.value);
            } else {
                // ERR-022 FIX: Para titulares de grupo, sumar abonos del grupo completo
                const clienteId = document.getElementById('cf-id').value;
                const cliente = DataService.clientes.find(c => c.id === clienteId);
                if (cliente && !cliente.parent_id) {
                    // Es titular: buscar acompañantes y sumar todos los abonos del grupo
                    const companions = DataService.clientes.filter(c => c.parent_id === clienteId && !c.deleted_at);
                    const groupIds = [clienteId, ...companions.map(c => c.id)];
                    tA = DataService.abonos.filter(a => groupIds.includes(a.cliente_id) && a.estado_pago !== 'pending' && a.estado_pago !== 'refunded').reduce((s, a) => s + (Number(a.monto) || 0), 0);
                } else {
                    tA = DataService.abonos.filter(a => a.cliente_id === clienteId && a.estado_pago !== 'pending' && a.estado_pago !== 'refunded').reduce((s, a) => s + (Number(a.monto) || 0), 0);
                }
            }

            const fin = calcularFinanzas(tA, tN);
            updateFinancialUI({ tarifa_total_negociada: tN, total_abonado: fin.abonado });

            // ERR-023 FIX: No sobrescribir estados manuales del operador
            const est = document.getElementById('cf-estado');
            const isManualChange = est && est.dataset && est.dataset.manualChange === 'true';
            if (est && !isManualChange && !['en caja', 'devolución', 'reprogramado', 'realizadas', 'desistió'].includes(est.value)) {
                if (fin.porcentaje >= 100) est.value = 'confirmado';
                else est.value = 'pendiente de pago';
            }
        } catch (e) {
            console.error("Error calculando totales:", e);
        }
    },

    onTipoPagoChange() {
        const tipo = document.getElementById('cf-tipo-pago').value;
        if (tipo === 'abono') {
            document.getElementById('div-abono-monto').classList.remove('hidden');
            document.getElementById('div-abono-metodo').classList.remove('hidden');
        } else {
            document.getElementById('div-abono-monto').classList.add('hidden');
            document.getElementById('div-abono-metodo').classList.add('hidden');
            UI.setCurrencyValue('cf-abono-inicial', 0);
        }
        this.calculateTotals();
    },

    renderAbonosHistory(cBase) {
        const bloq = document.getElementById('cf-abonos-history');
        if (!bloq) return;

        const abs = DataService.abonos.filter(ab => ab.cliente_id === cBase.id);
        bloq.innerHTML = '';

        if (abs.length === 0) {
            bloq.innerHTML = '<div class="p-4 text-center text-slate-400 font-medium">Sin transacciones registradas</div>';
            return;
        }

        const IS_ADMIN = window.AuthModule.userProfile?.rol === 'administrador' || window.AuthModule.userProfile?.rol === 'super_administrador';

        abs.forEach(mov => {
            const fHuman = new Date(mov.created_at).toLocaleDateString('es-CO', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
            let statusBadge = '';

            if (mov.estado_pago === 'pending') {
                statusBadge = '<span class="text-[10px] bg-orange-100 text-orange-600 px-1 ml-1 rounded border border-orange-200">Pendiente</span>';
            } else if (mov.estado_pago === 'refunded') {
                statusBadge = '<span class="text-[10px] bg-red-100 text-red-600 px-1 ml-1 rounded border border-red-200">Reembolso</span>';
            } else {
                statusBadge = '<span class="text-[10px] bg-green-100 text-green-600 px-1 ml-1 rounded border border-green-200">Confirmado</span>';
            }

            // Lógica de congelamiento financiero (Audit Trail: 48 horas)
            const hoursSinceCreated = (new Date() - new Date(mov.created_at)) / (1000 * 60 * 60);
            const isFrozen = !IS_ADMIN && hoursSinceCreated > 48;
            const isChildAbono = mov.parent_abono_id !== undefined && mov.parent_abono_id !== null;
            
            let actionButtons = '';
            const receiptBtn = `<button type="button" data-action="receipt-abono" data-abono-id="${mov.id}" class="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-1 rounded font-bold hover:bg-emerald-200 transition-colors"><i class="ph ph-file-text"></i> Recibo</button>`;
            if (isChildAbono) {
                actionButtons = `
                    <div class="flex items-center space-x-1">
                        ${receiptBtn}
                        <span class="text-[9px] text-indigo-500 font-black bg-indigo-50 px-2 py-1 rounded border border-indigo-100/50 flex items-center shadow-sm"><i class="ph ph-users mr-1"></i> Grupo</span>
                    </div>
                `;
            } else if (isFrozen) {
                actionButtons = `
                    <div class="flex items-center space-x-1">
                        ${receiptBtn}
                        <span class="text-[9px] text-slate-500 font-black bg-slate-200/60 px-2 py-1 rounded border border-slate-300 shadow-inner flex items-center"><i class="ph ph-lock-key mr-1"></i> 48h</span>
                    </div>
                `;
            } else {
                actionButtons = `
                    ${receiptBtn}
                    <button type="button" data-action="edit-abono" data-abono-id="${mov.id}" data-cliente-id="${mov.cliente_id}" data-monto="${mov.monto}" data-estado="${mov.estado_pago}" class="text-[10px] bg-blue-100 text-blue-700 px-2 py-1 rounded font-bold hover:bg-blue-200 transition-colors"><i class="ph ph-pencil-simple"></i> Editar</button>
                    <button type="button" data-action="delete-abono" data-abono-id="${mov.id}" data-cliente-id="${mov.cliente_id}" class="btn-delete-protected text-[10px] bg-red-100 text-red-700 px-2 py-1 rounded font-bold hover:bg-red-200 transition-colors"><i class="ph ph-trash"></i> Borrar</button>
                `;
            }

            bloq.innerHTML += `
                <div class="flex justify-between items-center p-4 bg-slate-50 border border-slate-100 rounded-xl hover:shadow-sm transition-shadow">
                    <div>
                        <p class="text-slate-800 font-black text-lg">${UI.formatMoney(mov.monto)}</p>
                        <p class="text-[10px] text-slate-500 uppercase font-bold mt-1">${mov.metodo} ${statusBadge}</p>
                    </div>
                    <div class="text-right flex flex-col items-end">
                        <p class="text-[11px] text-slate-600 font-bold mb-2">${fHuman}</p>
                        <div class="flex space-x-2">
                            ${actionButtons}
                        </div>
                    </div>
                </div>`;
        });
    },

    promptDeleteAbono(aId, cId) {
        if (!aId) return;

        // Doble validación de seguridad por si vulneran el DOM
        const IS_ADMIN = window.AuthModule.userProfile?.rol === 'administrador' || window.AuthModule.userProfile?.rol === 'super_administrador';
        const abono = DataService.abonos.find(a => a.id === aId);
        if (abono) {
            const hoursSinceCreated = (new Date() - new Date(abono.created_at)) / (1000 * 60 * 60);
            if (!IS_ADMIN && hoursSinceCreated > 48) {
                return UI.showToast("Acción denegada: Este registro financiero ha sido congelado por antigüedad.", "error");
            }
        }

        const abonoDesc = `Abono de ${UI.formatMoney(abono.monto)} (${abono.metodo})`;
        window.promptGlobalDelete(aId, 'abono', abonoDesc, cId);
    },

    promptEditAbono(aId, cId, monto, status) {
        if (!aId) return;

        // Doble validación de seguridad por si vulneran el DOM
        const IS_ADMIN = window.AuthModule.userProfile?.rol === 'administrador' || window.AuthModule.userProfile?.rol === 'super_administrador';
        const abono = DataService.abonos.find(a => a.id === aId);
        if (abono) {
            const hoursSinceCreated = (new Date() - new Date(abono.created_at)) / (1000 * 60 * 60);
            if (!IS_ADMIN && hoursSinceCreated > 48) {
                return UI.showToast("Acción denegada: Este registro financiero ha sido congelado por antigüedad.", "error");
            }
        }

        document.getElementById('aam-abono-id').value = aId;
        document.getElementById('aam-cliente-id').value = cId;
        document.getElementById('aam-action-type').value = 'edit';

        document.getElementById('aam-title').innerHTML = '<i class="ph ph-pencil-simple text-blue-500 mr-2 text-2xl"></i> Editar Abono';
        document.getElementById('aam-delete-body').classList.add('hidden');

        UI.setCurrencyValue('aam-monto', monto);
        document.getElementById('aam-estado').value = status || 'confirmed';
        document.getElementById('aam-edit-body').classList.remove('hidden');

        const btn = document.getElementById('aam-confirm-btn');
        btn.className = 'flex-1 px-4 py-3 rounded-xl font-black text-white bg-blue-600 flex items-center justify-center hover:bg-blue-700 hover:-translate-y-1 transition-all shadow-md';
        btn.innerHTML = '<i class="ph ph-floppy-disk mr-2 text-lg"></i> Guardar Ajuste';

        UI.openModal('abono-action-modal', 'aam-bg', 'aam-content');
    },

    async executeAbonoAction() {
        const type = document.getElementById('aam-action-type').value;
        const aId = document.getElementById('aam-abono-id').value;
        const cId = document.getElementById('aam-cliente-id').value;
        const btn = document.getElementById('aam-confirm-btn');

        const pH = btn.innerHTML;
        btn.innerHTML = '<i class="ph ph-spinner animate-spin text-xl"></i> Procesando...';
        btn.disabled = true;

        try {
            if (type === 'edit') {
                const nM = UI.parseCurrency(document.getElementById('aam-monto').value);
                const st = document.getElementById('aam-estado').value;
                if (isNaN(nM) || nM <= 0) {
                    UI.showToast("Monto inválido para edición.", "error");
                    return;
                }
                await DataService.editAbono(aId, cId, nM, st);
                UI.showToast("Abono actualizado.", "success");
            } else if (type === 'delete') {
                await DataService.deleteAbono(aId, cId);
                UI.showToast("Abono eliminado y saldo recalculado.", "success");
            }

            UI.closeModal('abono-action-modal', 'aam-bg', 'aam-content');
            this.refreshUIAfterAbonoChange(cId);
        } catch (e) {
            console.error(e);
            UI.showToast("Error BD: " + (e.message || "Falla al ejecutar acción"), "error");
        } finally {
            btn.innerHTML = pH;
            btn.disabled = false;
        }
    },

    refreshUIAfterAbonoChange(cId) {
        const cli = DataService.clientes.find(x => x.id === cId);
        if (cli) {
            this.calculateTotals();
            this.renderAbonosHistory(cli);
            this.renderTable();
            // DashboardComponent se actualiza automáticamente vía Store
            // Si el modal de detalle rápido (sidepanel) está abierto, actualizarlo también
            const sidePanel = document.getElementById('client-detail-modal');
            if (sidePanel && !sidePanel.classList.contains('hidden')) {
                this.openDetailModal(cId);
            }
        }
    },

    async saveLiveAbono() {
        const cId = document.getElementById('cf-id').value;
        if (!cId) {
            return UI.showToast("Debe guardar al cliente primero antes de sumar abonos adicionales.", "error");
        }

        const cli = DataService.clientes.find(x => x.id === cId);
        const val = UI.parseCurrency(document.getElementById('cf-abono-live-monto').value);
        const met = document.getElementById('cf-abono-live-metodo').value;
        const sts = document.getElementById('cf-abono-live-status').value;

        if (isNaN(val) || val <= 0) {
            return UI.showToast("Ingresa un monto de abono válido.", "error");
        }

        // Lógica Visual de Sobrepago
        const tAbo = DataService.abonos.filter(a => a.cliente_id === cId && a.estado_pago !== 'pending' && a.estado_pago !== 'refunded').reduce((s, a) => s + (Number(a.monto) || 0), 0);
        const dr = Math.max((Number(cli.precio_total) || 0) - tAbo, 0);
        if (val > dr && dr > 0 && sts === 'confirmed') {
            UI.showToast(`El monto excede el saldo. Se registrará un crédito a favor de ${UI.formatMoney(val - dr)}`, "info");
        }

        const btn = document.getElementById('btn-live-abono');
        const pT = btn.innerHTML;
        btn.innerHTML = '<i class="ph ph-spinner animate-spin mr-2"></i> Sumando...';
        btn.disabled = true;

        try {
            const destSelect = document.getElementById('cf-abono-live-destinatario');
            const destId = destSelect && !destSelect.classList.contains('hidden') ? destSelect.value : cId;

            await DataService.saveAbono({
                cliente_id: cId,
                monto: val,
                metodo: met,
                estado_pago: sts,
                usuario_email: window.AuthModule.currentUser?.email || 'Staff',
                destinatario_id: destId
            });

            document.getElementById('cf-abono-live-monto').value = '';
            this.refreshUIAfterAbonoChange(cId);
            UI.showToast("Abono sumado al estado de cuenta con éxito.", "success");
        } catch (e) {
            console.error(e);
            UI.showToast(e.message === "DUPLICATE_PAYMENT" ? "Bloqueado por seguridad anti-duplicados" : "Fallo conectando a DB.", "error");
        } finally {
            btn.innerHTML = pT;
            btn.disabled = false;
        }
    },

    async saveQuickAbono(cId) {
        const cli = DataService.clientes.find(x => x.id === cId);
        const val = UI.parseCurrency(document.getElementById('qa-monto').value);
        const met = document.getElementById('qa-metodo').value;
        // ERR-017 FIX: Leer estado del pago del selector en vez de forzar 'confirmed'
        const statusSelect = document.getElementById('qa-status');
        const sts = statusSelect ? statusSelect.value : 'confirmed';

        if (isNaN(val) || val <= 0) {
            return UI.showToast("Ingresa un monto válido.", "error");
        }

        // Check de sobrepago
        const tAbo = DataService.abonos.filter(a => a.cliente_id === cId && a.estado_pago !== 'pending' && a.estado_pago !== 'refunded').reduce((s, a) => s + (Number(a.monto) || 0), 0);
        const dr = Math.max((Number(cli.precio_total) || 0) - tAbo, 0);
        if (val > dr && dr > 0 && sts === 'confirmed') {
            UI.showToast(`Atención: Estás ingresando un monto mayor a la deuda.`, "info");
        }

        const destSelect = document.getElementById('qa-abono-destinatario');
        const destId = destSelect ? destSelect.value : cId;

        const btn = document.getElementById('btn-quick-abono');
        const pT = btn.innerHTML;
        btn.innerHTML = '<i class="ph ph-spinner animate-spin"></i>';
        btn.disabled = true;

        try {
            await DataService.saveAbono({
                cliente_id: cId,
                monto: val,
                metodo: met,
                estado_pago: sts,
                usuario_email: window.AuthModule.currentUser?.email || 'Staff',
                destinatario_id: destId
            });

            UI.showToast("Abono rápido registrado correctamente en el sistema.", "success");
            document.getElementById('qa-monto').value = "";

            // Forzar el repintado del DOM para ver el cambio instantáneo
            this.refreshUIAfterAbonoChange(cId);
        } catch (e) {
            console.error(e);
            UI.showToast(e.message === "DUPLICATE_PAYMENT" ? "Pago duplicado abortado" : "Hubo un error comunicando con el servidor.", "error");
        } finally {
            btn.innerHTML = pT;
            btn.disabled = false;
        }
    },

    async saveClient() {
        const frm = document.getElementById('client-form');
        if (!frm.checkValidity()) {
            frm.reportValidity();
            return;
        }

        const btn = document.getElementById('btn-save-client');
        btn.disabled = true;
        btn.innerHTML = '<i class="ph ph-spinner animate-spin mr-2"></i> Formalizando Contrato...';

        try {
            const pId = document.getElementById('cf-plan-id').value;
            const pTot = UI.parseCurrency(document.getElementById('cf-precio-total').value);

            if (!pId || isNaN(pTot) || pTot <= 0) {
                btn.disabled = false;
                btn.innerHTML = '<i class="ph ph-floppy-disk mr-2 text-xl"></i> Guardar y Formalizar';
                return UI.showToast("Debes seleccionar un plan y definir un precio válido.", "error");
            }

            const fId = document.getElementById('cf-id').value;
            const esNvo = !fId;
            const mPgo = document.getElementById('cf-tipo-pago').value;
            let ini = UI.parseCurrency(document.getElementById('cf-abono-inicial').value) || 0;

            const estadoEl = document.getElementById('cf-estado').value;

            if (estadoEl === 'reprogramado' && !esNvo) {
                const cliOriginal = DataService.clientes.find(x => x.id === fId);
                const fechaActual = document.getElementById('cf-fecha-viaje')?.value || 'Fecha Abierta';
                if (cliOriginal && cliOriginal.plan_id === pId && cliOriginal.fecha_viaje === fechaActual) {
                    btn.disabled = false;
                    btn.innerHTML = '<i class="ph ph-floppy-disk mr-2 text-xl"></i> Guardar y Formalizar';
                    return UI.showToast("Para Reprogramar debes asignar un plan o fecha distintos a los originales.", "error");
                }
            }

            let montoDevuelto = 0;
            if (estadoEl === 'devolución') {
                const inputEl = document.getElementById('cf-monto-devuelto');
                montoDevuelto = UI.parseCurrency(inputEl ? inputEl.value : 0);
                if (isNaN(montoDevuelto) || montoDevuelto < 0) {
                    btn.disabled = false;
                    btn.innerHTML = '<i class="ph ph-floppy-disk mr-2 text-xl"></i> Guardar y Formalizar';
                    return UI.showToast("Monto de devolución inválido. Debes ingresar un número válido.", "error");
                }
            }

            // Lógica de contado: El abono inicial es el total de la deuda.
            if (mPgo === 'contado' && esNvo) {
                ini = pTot;
            }

            // Subir soporte de pago si se seleccionó uno nuevo
            const fileInput = document.getElementById('cf-soporte-pago-file');
            const file = fileInput ? fileInput.files[0] : null;
            let publicUrl = null;

            if (file) {
                btn.innerHTML = '<i class="ph ph-spinner animate-spin mr-2"></i> Subiendo soporte...';
                const fileExt = file.name.split('.').pop();
                const fileName = `${Date.now()}_${Math.random().toString(36).substring(2)}.${fileExt}`;
                const filePath = `soportes/${fileName}`;

                const { data, error } = await supabaseClient.storage
                    .from('soportes_pago')
                    .upload(filePath, file, { cacheControl: '3600', upsert: false });

                if (error) throw error;

                const { data: urlData } = supabaseClient.storage
                    .from('soportes_pago')
                    .getPublicUrl(filePath);

                publicUrl = urlData.publicUrl;
            }

            const cliExistente = esNvo ? null : DataService.clientes.find(x => x.id === fId);
            const plan = DataService.planes.find(pl => pl.id === pId);

            // Mantener datos históricos congelados si no cambió de plan en una edición
            let costoBaseCongelado = 0;
            let provsVinculadosCongelados = [];

            if (plan) {
                costoBaseCongelado = parseFloat(plan.costo_base) || 0;
                provsVinculadosCongelados = plan.proveedores_vinculados || [];

                if (costoBaseCongelado === 0 && provsVinculadosCongelados && provsVinculadosCongelados.length > 0) {
                    costoBaseCongelado = provsVinculadosCongelados.reduce((sum, p) => sum + parseFloat(p.costo || 0), 0);
                }

                const fechaSelect = document.getElementById('cf-fecha-viaje')?.value;
                if (fechaSelect && plan.fechas) {
                    const dateConfig = plan.fechas.find(f => {
                        const formattedDate = f.start === f.end
                            ? formatShortDate(f.start)
                            : `${formatShortDate(f.start)} al ${formatShortDate(f.end)}`;
                        return formattedDate === fechaSelect;
                    });

                    if (dateConfig && dateConfig.proveedores_vinculados && dateConfig.proveedores_vinculados.length > 0) {
                        costoBaseCongelado = parseFloat(dateConfig.costo_base) || 0;
                        provsVinculadosCongelados = dateConfig.proveedores_vinculados;
                    }

                    if (costoBaseCongelado === 0 && provsVinculadosCongelados && provsVinculadosCongelados.length > 0) {
                        costoBaseCongelado = provsVinculadosCongelados.reduce((sum, p) => sum + parseFloat(p.costo || 0), 0);
                    }
                }
            }

            // Removido el congelamiento histórico de tarifas para clientes existentes.
            // Al guardar, se obtendrán siempre los costos actualizados del catálogo (general o por fecha).

            const contactoEl = document.getElementById('cf-contacto');
            const etiquetaEl = document.getElementById('cf-etiqueta');
            const paxVal = parseInt(document.getElementById('cf-pax').value) || 1;

            // ERR-012 FIX: División equitativa del precio total del grupo sin pérdida de centavos
            const distributedPrices = distributeAmount(pTot, paxVal);
            const splitPrice = distributedPrices[0]; // Precio del titular (puede incluir residuo)

            const obj = {
                nombre: document.getElementById('cf-nombre').value,
                apellido: document.getElementById('cf-apellido').value,
                documento: document.getElementById('cf-documento').value,
                telefono: document.getElementById('cf-telefono').value,
                email: document.getElementById('cf-email').value,
                ciudad: document.getElementById('cf-ciudad').value,
                edad: document.getElementById('cf-edad').value,
                eps: document.getElementById('cf-eps').value,
                plan_id: pId,
                pax: paxVal,
                estado: estadoEl,
                precio_total: distributedPrices[0], // ERR-012 FIX: Precio distribuido exacto para titular
                fecha_viaje: document.getElementById('cf-fecha-viaje')?.value || 'Fecha Abierta',
                alergias: document.getElementById('cf-alergias').value,
                requerimientos: document.getElementById('cf-requerimientos').value,
                contacto_emergencia: contactoEl ? contactoEl.value : '',
                etiqueta: etiquetaEl ? etiquetaEl.value : 'normal',
                costo_base: costoBaseCongelado,
                proveedores_vinculados: provsVinculadosCongelados,
                // ERR-004/023 FIX: Persistir flag de estado manual
                estado_manual: document.getElementById('cf-estado')?.dataset?.manualChange === 'true'
            };

            if (publicUrl) {
                obj.soporte_pago_url = publicUrl;
            } else if (cliExistente) {
                obj.soporte_pago_url = cliExistente.soporte_pago_url;
            }

            if (estadoEl === 'devolución') {
                obj.monto_devuelto = montoDevuelto;
            }

            if (!esNvo) obj.id = fId;
            if (esNvo) {
                obj.abono_acumulado = 0;
                obj.saldo_restante = splitPrice;
            }

            // 1. Guardar cliente titular en BD (ERR-013 FIX: skipLoadAll para batch)
            const res = await DataService.saveCliente(obj, true);

            // 2. Guardar/actualizar acompañantes activos y gestionar removidos
            const companionsData = this.gatherCompanionsData();
            const savedCompanions = [];

            if (res) {
                // A. Identificar y borrar acompañantes removidos
                const activeCompIds = companionsData.map(comp => comp.id).filter(Boolean);
                const existingComps = DataService.clientes.filter(c => c.parent_id === res.id && !c.deleted_at);
                const removedComps = existingComps.filter(c => !activeCompIds.includes(c.id));

                if (removedComps.length > 0) {
                    const removedIds = removedComps.map(c => c.id);
                    const user = window.AuthModule?.currentUser?.email || 'Desconocido';
                    const { error: errorDelComps } = await supabaseClient.from('clientes')
                        .update({ 
                            deleted_at: new Date().toISOString(), 
                            deleted_by: user, 
                            motivo_eliminacion: "Retirado del grupo por reducción de Pax" 
                        })
                        .in('id', removedIds);
                    
                    if (errorDelComps) console.warn("Error eliminando acompañantes removidos:", errorDelComps);

                    for (const comp of removedComps) {
                        await DataService.registrarHistorial(
                            comp.id, 
                            'Retirado del Grupo', 
                            'N/A', 
                            'Retirado del grupo por reducción de Pax', 
                            'ELIMINACION', 
                            { motivo_eliminacion: 'Reducción de Pax' }
                        );
                    }
                }

                // B. Guardar/actualizar acompañantes activos
                for (const comp of companionsData) {
                    const compObj = {
                        nombre: comp.nombre,
                        apellido: comp.apellido,
                        documento: comp.documento,
                        telefono: obj.telefono,
                        email: obj.email,
                        ciudad: obj.ciudad,
                        edad: comp.edad,
                        eps: comp.eps,
                        plan_id: obj.plan_id,
                        pax: 1,
                        estado: obj.estado,
                        // ERR-012 FIX: Cada acompañante recibe su precio distribuido exacto
                        precio_total: distributedPrices[companionsData.indexOf(comp) + 1] !== undefined ? distributedPrices[companionsData.indexOf(comp) + 1] : distributedPrices[distributedPrices.length - 1],
                        fecha_viaje: obj.fecha_viaje,
                        alergias: comp.alergias,
                        requerimientos: comp.requerimientos,
                        contacto_emergencia: comp.contacto_emergencia || obj.contacto_emergencia,
                        etiqueta: obj.etiqueta,
                        costo_base: obj.costo_base,
                        proveedores_vinculados: obj.proveedores_vinculados,
                        parent_id: res.id
                    };
                    if (comp.id) {
                        compObj.id = comp.id;
                    } else {
                        compObj.abono_acumulado = 0;
                        compObj.saldo_restante = splitPrice;
                    }
                    // ERR-013 FIX: skipLoadAll para cada acompañante del batch
                    const savedComp = await DataService.saveCliente(compObj, true);
                    if (savedComp) {
                        savedCompanions.push(savedComp);
                    }
                }
            }

            // 3. Si es cliente nuevo y hay dinero de entrada, insertar abono obligatoriamente
            if (esNvo && ini > 0 && res) {
                let mF = document.getElementById('cf-abono-metodo').value || 'Ingreso Manual';
                if (mPgo === 'contado') {
                    mF = 'Pago de Contado (Vía ' + mF + ')';
                }

                // Resolver destinatario_id
                const destVal = document.getElementById('cf-abono-destinatario')?.value || 'grupo';
                let finalDestId = 'grupo';

                if (destVal === 'titular') {
                    finalDestId = res.id;
                } else if (destVal.startsWith('comp-')) {
                    const idx = parseInt(destVal.replace('comp-', ''));
                    if (savedCompanions[idx]) {
                        finalDestId = savedCompanions[idx].id;
                    }
                }
                // Cargar todo para asegurar que el cache local de clientes tenga los acompañantes recién creados y permita la división/distribución equitativa.
                await DataService.loadAll();

                await DataService.saveAbono({
                    cliente_id: res.id,
                    monto: ini,
                    metodo: mF,
                    estado_pago: 'confirmed',
                    usuario_email: window.AuthModule.currentUser?.email || 'Admin / Creador',
                    destinatario_id: finalDestId
                });
            }

            // 4. Recalcular contabilidad estricta
            if (res) {
                await DataService.recalculateClientBalances(res.id);
                for (const comp of savedCompanions) {
                    await DataService.recalculateClientBalances(comp.id);
                }
            }

            this.populateFilters();
            // ERR-013 FIX: Un único loadAll() de consolidación al terminar toda la operación
            if (res && res.id) {
                await DataService.loadAll();
                this.refreshUIAfterAbonoChange(res.id);
            } else {
                this.renderTable();
            }
            
            this.closeFormModal();
            UI.showToast("Reserva formalizada con éxito. Finanzas cuadradas.", "success");

        } catch (e) {
            console.error(e);
            UI.showToast("Falla técnica al grabar la reserva en Supabase.", "error");
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="ph ph-floppy-disk mr-2 text-xl"></i> Guardar y Formalizar';
        }
    },

    openDetailModal(id) {
        // Auto-reconcile operational advances to reflect latest payments
        if (window.PartnersComponent && typeof window.PartnersComponent.reconciliarEstadosAdelantos === 'function') {
            window.PartnersComponent.reconciliarEstadosAdelantos();
        }

        const c = DataService.clientes.find(x => x.id === id);
        if (!c) return;

        const p = DataService.planes.find(x => x.id === c.plan_id);
        const pNom = p ? p.nombre : 'Plan Retirado del Sistema';
        
        // Find companions
        const companions = DataService.clientes.filter(comp => comp.parent_id === c.id && !comp.deleted_at);
        const belongsToGroup = c.parent_id || companions.length > 0;

        // Group financial calculation if titular
        let totalAbo = 0;
        let targetPrice = c.precio_total || 0;
        let abs = [];

        if (!c.parent_id && companions.length > 0) {
            // Titular with group: show group abonos and prices consolidated
            const groupClientIds = [c.id, ...companions.map(comp => comp.id)];
            abs = DataService.abonos.filter(a => groupClientIds.includes(a.cliente_id));
            totalAbo = abs.filter(a => a.estado_pago !== 'pending' && a.estado_pago !== 'refunded').reduce((s, a) => s + (Number(a.monto) || 0), 0);
            targetPrice = (c.precio_total || 0) * (c.pax || 1);
        } else {
            // Companion or individual
            abs = DataService.abonos.filter(a => a.cliente_id === id);
            totalAbo = abs.filter(a => a.estado_pago !== 'pending' && a.estado_pago !== 'refunded').reduce((s, a) => s + (Number(a.monto) || 0), 0);
            targetPrice = c.precio_total || 0;
        }

        const fn = calcularFinanzas(totalAbo, targetPrice);

        let h = '';
        if (abs.length === 0) {
            h = '<div class="p-6 text-center text-slate-400 uppercase tracking-widest font-black text-[10px]">La caja está en ceros para este cliente</div>';
        } else {
            abs.forEach(a => {
                let st = '';
                if (a.estado_pago === 'pending') st = '<span class="text-orange-700 bg-orange-50 px-1.5 py-0.5 rounded-full border border-orange-100/50 text-[9px] font-medium">Pendiente</span>';
                else if (a.estado_pago === 'refunded') st = '<span class="text-red-700 bg-rose-50 px-1.5 py-0.5 rounded-full border border-rose-100/50 text-[9px] font-medium">Reembolso</span>';
                else st = '<span class="text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-full border border-emerald-100/50 text-[9px] font-medium">Ok</span>';

                // Display whom the payment belongs to if viewing group consolidated history
                let targetMemberName = '';
                if (!c.parent_id && companions.length > 0) {
                    const member = DataService.clientes.find(x => x.id === a.cliente_id);
                    if (member) {
                        targetMemberName = ` <span class="text-[8px] bg-slate-100 text-slate-500 px-1 py-0.2 rounded border border-slate-200/50 font-normal">Para: ${member.nombre}</span>`;
                    }
                }

                h += `
                <div class="flex justify-between items-center text-sm py-3 border-b border-slate-100 hover:bg-slate-50/50 px-3 rounded-lg transition-colors">
                    <div>
                        <span class="font-semibold text-slate-900 text-base">${formatCOP(a.monto)}</span>${targetMemberName}<br>
                        <span class="text-[10px] font-medium text-slate-500 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100 inline-block mt-1">${a.metodo} - ${st}</span>
                    </div>
                    <div class="text-xs text-slate-400 text-right font-medium">
                        ${new Date(a.created_at).toLocaleDateString('es-CO')}<br>
                        <span class="text-[9px] truncate w-24 block opacity-70 font-mono mt-0.5">${a.usuario_email || 'Staff'}</span>
                    </div>
                </div>`;
            });
        }

        const safeNombre = UI.sanitize(c.nombre || '');
        const safeApellido = UI.sanitize(c.apellido || '');
        const safeDoc = UI.sanitize(c.documento || '');
        const safeTel = UI.sanitize(c.telefono || '');
        const safePlan = UI.sanitize(pNom);
        const safeEtiqueta = UI.sanitize(c.etiqueta || '');

        // Render titular information banner if companion
        let titularAlertHtml = '';
        if (c.parent_id) {
            const titular = DataService.clientes.find(x => x.id === c.parent_id);
            if (titular) {
                titularAlertHtml = `
                    <div class="bg-indigo-50 border border-indigo-100 p-4 rounded-2xl flex items-start gap-3 shadow-[0_1px_2px_rgba(99,102,241,0.05)] mb-4">
                        <i class="ph ph-info text-indigo-600 text-lg shrink-0 mt-0.5"></i>
                        <div class="flex-1">
                            <p class="text-[10px] font-black text-indigo-800 uppercase tracking-wider">Acompañante de Grupo</p>
                            <p class="text-xs font-semibold text-slate-800 mt-0.5">
                                Este viajero pertenece al grupo de <strong>${UI.sanitize(titular.nombre)} ${UI.sanitize(titular.apellido)}</strong>.
                            </p>
                            <div class="flex gap-4 mt-2">
                                <button onclick="ClientsComponent.closeDetailModal(); setTimeout(() => ClientsComponent.openDetailModal('${titular.id}'), 300)" class="text-[10px] text-indigo-600 font-bold hover:underline flex items-center">
                                    <i class="ph ph-arrow-square-out mr-1"></i> Ir al Titular
                                </button>
                                <button onclick="ClientsComponent.desagruparCliente('${c.id}', this)" class="text-[10px] text-rose-600 font-bold hover:underline flex items-center">
                                    <i class="ph ph-user-minus mr-1"></i> Desagrupar / Separar
                                </button>
                            </div>
                        </div>
                    </div>
                `;
            } else {
                // ERR-029 FIX: El titular fue eliminado o no existe
                titularAlertHtml = `
                    <div class="bg-amber-50 border border-amber-200 p-4 rounded-2xl flex items-start gap-3 shadow-[0_1px_2px_rgba(245,158,11,0.05)] mb-4">
                        <i class="ph ph-warning-circle text-amber-600 text-lg shrink-0 mt-0.5 auto-pulse"></i>
                        <div class="flex-1">
                            <p class="text-[10px] font-black text-amber-800 uppercase tracking-wider">Titular de Grupo no Encontrado</p>
                            <p class="text-xs font-semibold text-slate-800 mt-0.5">
                                Este viajero está asociado a un titular que no existe o fue eliminado de la base de datos.
                            </p>
                            <div class="flex gap-4 mt-2">
                                <button onclick="ClientsComponent.desagruparCliente('${c.id}', this)" class="text-[10px] text-rose-600 font-bold hover:underline flex items-center">
                                    <i class="ph ph-user-minus mr-1"></i> Desagrupar / Hacer Individual
                                </button>
                            </div>
                        </div>
                    </div>
                `;
            }
        }

        // Render companions list if titular
        let companionsHtml = '';
        if (!c.parent_id && companions.length > 0) {
            companionsHtml = `
                <div class="border border-slate-100 rounded-2xl bg-white overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,0.02)]">
                    <div class="bg-slate-50/50 p-4 border-b border-slate-100">
                        <h4 class="font-medium text-xs text-slate-500 flex items-center"><i class="ph ph-users-three mr-2 text-base"></i> Acompañantes del Viaje</h4>
                    </div>
                    <div class="p-3 divide-y divide-slate-100/60 bg-white">
            `;
            companionsHtml += companions.map(comp => {
                const compAbo = DataService.abonos.filter(a => a.cliente_id === comp.id && a.estado_pago !== 'pending' && a.estado_pago !== 'refunded').reduce((s, a) => s + (Number(a.monto) || 0), 0);
                const compFin = calcularFinanzas(compAbo, comp.precio_total);
                return `
                    <div class="flex justify-between items-center py-2.5 px-2 hover:bg-slate-50 rounded-lg cursor-pointer transition-colors" onclick="ClientsComponent.closeDetailModal(); setTimeout(() => ClientsComponent.openDetailModal('${comp.id}'), 300)">
                        <div>
                            <p class="font-semibold text-slate-800 text-xs">${UI.sanitize(comp.nombre)} ${UI.sanitize(comp.apellido)}</p>
                            <p class="text-[9px] text-slate-400">${UI.sanitize(comp.documento)}</p>
                        </div>
                        <div class="flex items-center gap-3">
                            <div class="text-right">
                                <p class="text-xs font-semibold text-slate-700">${formatCOP(compAbo)} / ${formatCOP(comp.precio_total)}</p>
                                <p class="text-[9px] text-slate-400">Saldo: ${formatCOP(compFin.saldo)}</p>
                            </div>
                            <button onclick="event.stopPropagation(); ClientsComponent.desagruparCliente('${comp.id}', this)" class="text-rose-600 hover:text-rose-800 p-1.5 rounded-lg hover:bg-rose-50 transition-all cursor-pointer" title="Desagrupar de este grupo">
                                <i class="ph ph-user-minus text-base"></i>
                            </button>
                        </div>
                    </div>
                `;
            }).join('');
            companionsHtml += `
                    </div>
                </div>
            `;
        }

        // Calculate if there are active operability advances
        let totalAdelantado = 0;
        if (c) {
            // 1. Adelantos directos
            const directAdelantos = (DataService.adelantos_operativos || [])
                .filter(a => a.cliente_id === id && !a.deleted_at && ['aprobado', 'ejecutado'].includes(a.estado));
            
            directAdelantos.forEach(a => {
                const companions = DataService.clientes.filter(x => x.parent_id === id && !x.deleted_at);
                const groupSize = 1 + companions.length;
                if (a.distribuir_grupo && groupSize > 1) {
                    totalAdelantado += (Number(a.monto_adelantado) - Number(a.monto_recuperado)) / groupSize;
                } else {
                    totalAdelantado += (Number(a.monto_adelantado) - Number(a.monto_recuperado));
                }
            });

            // 2. Adelantos indirectos del titular si este cliente es acompañante
            if (c.parent_id) {
                const titularAdelantos = (DataService.adelantos_operativos || [])
                    .filter(a => a.cliente_id === c.parent_id && !a.deleted_at && ['aprobado', 'ejecutado'].includes(a.estado) && a.distribuir_grupo);
                
                titularAdelantos.forEach(a => {
                    const companions = DataService.clientes.filter(x => x.parent_id === c.parent_id && !x.deleted_at);
                    const groupSize = 1 + companions.length;
                    totalAdelantado += (Number(a.monto_adelantado) - Number(a.monto_recuperado)) / groupSize;
                });
            }
        }

        const bannerAdelantoHtml = totalAdelantado > 0 ? `
            <div class="bg-amber-50 border border-amber-200 p-4 rounded-2xl flex items-start gap-3 shadow-[0_1px_2px_rgba(245,158,11,0.05)]">
                <i class="ph ph-warning-circle text-amber-600 text-lg shrink-0 mt-0.5 auto-pulse"></i>
                <div>
                    <p class="text-[10px] font-black text-amber-800 uppercase tracking-wider flex items-center gap-1">Adelanto Operativo Activo</p>
                    <p class="text-xs font-semibold text-amber-900 mt-0.5">
                        La agencia ha financiado <strong>${formatCOP(totalAdelantado)}</strong> de fondos propios para asegurar servicios de esta reserva.
                    </p>
                    <p class="text-[8px] text-amber-700/80 font-bold mt-1 uppercase tracking-wider">Se recuperará automáticamente cuando el cliente realice abonos.</p>
                </div>
            </div>
        ` : '';

        const sopPagoUrl = c.soporte_pago_url;
        const sopPagoHtml = sopPagoUrl ? `
            <div class="bg-white border border-slate-100 p-4 rounded-2xl flex justify-between items-center shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                <div class="flex items-center gap-3">
                    <img src="${sopPagoUrl}" alt="Soporte Pago" data-action="open-lightbox" data-url="${sopPagoUrl}" class="w-16 h-12 object-cover rounded-lg border border-slate-200/60 shadow-sm hover:scale-105 transition-all cursor-pointer">
                    <div>
                        <p class="text-[10px] font-black text-slate-800 uppercase tracking-wider">Soporte de Pago</p>
                        <a href="${sopPagoUrl}" target="_blank" class="text-[10px] text-primary-600 font-bold hover:underline flex items-center mt-0.5"><i class="ph ph-arrow-square-out mr-1"></i> Abrir en pestaña</a>
                    </div>
                </div>
            </div>
        ` : '';

        // Dynamic recipient select for quick abono panel
        let qaDestinatarioHtml = '';
        if (belongsToGroup) {
            const titularId = c.parent_id || c.id;
            const titular = DataService.clientes.find(x => x.id === titularId);
            const comps = DataService.clientes.filter(x => x.parent_id === titularId && !x.deleted_at);
            
            qaDestinatarioHtml = `
                <div>
                    <label class="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1 pl-0.5">Destinatario</label>
                    <select id="qa-abono-destinatario" class="w-full border border-slate-200 bg-white rounded-lg px-3 py-2 text-xs font-semibold outline-none shadow-sm text-slate-700 cursor-pointer">
                        <option value="grupo">Todo el grupo (Dividir)</option>
                        <option value="${titularId}">${titular.nombre} ${titular.apellido} (Titular)</option>
            `;
            comps.forEach(comp => {
                qaDestinatarioHtml += `<option value="${comp.id}">${comp.nombre} ${comp.apellido}</option>`;
            });
            qaDestinatarioHtml += `</select></div>`;
        }

        document.getElementById('cdm-body').innerHTML = `
            <div class="p-6 space-y-6">
                <div class="flex items-center space-x-4">
                    <div class="w-14 h-14 rounded-2xl bg-slate-50 text-slate-700 flex items-center justify-center font-semibold text-xl border border-slate-100 shrink-0 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                        ${safeNombre.charAt(0)}${safeApellido.charAt(0)}
                    </div>
                    <div>
                        <h2 class="text-xl font-semibold text-slate-900 tracking-tight leading-none">${safeNombre} ${safeApellido}</h2>
                        <span class="inline-flex items-center gap-1.5 text-[10px] font-medium text-slate-400 font-mono mt-1.5"><i class="ph ph-identification-card text-xs"></i> CC ${safeDoc}</span>
                    </div>
                </div>
                
                ${titularAlertHtml}

                ${bannerAdelantoHtml}
                
                ${sopPagoHtml}

                ${companionsHtml}
                
                <div class="bg-slate-50 border border-slate-100 p-5 rounded-2xl relative overflow-hidden text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.02)]">
                    <p class="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-1">Plan Seleccionado</p>
                    <p class="text-lg font-semibold text-slate-900 flex items-center justify-between">
                        <span>${safePlan}</span>
                        <span class="bg-white px-2.5 py-0.5 rounded-lg border border-slate-200/60 text-[10px] font-medium text-slate-600">x ${c.pax} PAX</span>
                    </p>
                    
                    <div class="grid grid-cols-2 gap-4 border-t border-slate-200/40 pt-4 mt-4 text-xs font-mono">
                        <div>
                            <p class="text-[10px] font-sans font-medium text-slate-400 mb-0.5">Total Venta</p>
                            <p class="text-sm font-semibold text-slate-900">${formatCOP(targetPrice)}</p>
                        </div>
                        <div class="text-right border-l border-slate-200/40 pl-4">
                            <p class="text-[10px] font-sans font-medium text-slate-400 mb-0.5">Abonado</p>
                            <p class="text-sm font-semibold text-slate-900">${formatCOP(totalAbo)}</p>
                        </div>
                        <div>
                            <p class="text-[10px] font-sans font-medium text-slate-400 mb-0.5">Saldo Pendiente</p>
                            <p class="text-sm font-semibold text-slate-900">${formatCOP(fn.saldo)}</p>
                        </div>
                        <div class="text-right border-l border-slate-200/40 pl-4 flex flex-col justify-end">
                            <p class="text-[10px] font-sans font-medium text-slate-400 mb-0.5">% Pagado</p>
                            <p class="text-2xl font-semibold ${fn.saldo <= 0 ? 'text-emerald-600' : 'text-slate-900'} leading-none mt-0.5">${fn.porcentaje}%</p>
                        </div>
                        ${(c.estado || '').toLowerCase() === 'devolución' && c.monto_devuelto !== undefined ? `
                        <div class="col-span-2 mt-2 bg-rose-50 p-3 rounded-xl border border-rose-100/50 flex justify-between items-center text-rose-755">
                            <p class="text-[10px] font-sans font-medium uppercase tracking-wider flex items-center"><i class="ph ph-arrow-u-up-left mr-2 text-sm"></i> Monto Reembolsado</p>
                            <p class="text-lg font-semibold text-rose-700">${formatCOP(c.monto_devuelto)}</p>
                        </div>
                        ` : ''}
                    </div>
                </div>
                
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div class="bg-emerald-50/30 border border-emerald-100/50 p-4 rounded-2xl transition-all">
                        <p class="font-medium text-emerald-800 text-[10px] mb-1.5 flex items-center gap-1"><i class="ph ph-whatsapp-logo text-xs"></i> WhatsApp</p>
                        <a href="https://wa.me/57${safeTel.replace(/\D/g, '')}" target="_blank" class="font-semibold text-emerald-700 flex items-center hover:underline text-xs truncate">${safeTel}</a>
                    </div>
                    <div class="bg-slate-50 border border-slate-100 p-4 rounded-2xl">
                        <p class="font-medium text-slate-400 text-[10px] mb-1.5 flex items-center gap-1"><i class="ph ph-flag text-xs"></i> Estado</p>
                        <span class="block font-semibold text-slate-800 text-[10px] truncate">${c.estado ? c.estado : 'Sin Estado'}</span>
                    </div>
                    <div class="bg-purple-50/30 border border-purple-100/50 p-4 rounded-2xl flex flex-col justify-between">
                        <p class="font-medium text-purple-800 text-[10px] mb-1 flex items-center gap-1"><i class="ph ph-tag text-xs"></i> Etiqueta</p>
                        <select data-action="quick-etiqueta" data-cliente-id="${id}" class="w-full bg-transparent font-semibold text-purple-700 outline-none cursor-pointer text-xs">
                            <option value="" ${!c.etiqueta ? 'selected' : ''}>-- Sin Etiqueta --</option>
                            <option value="Orgánico" ${c.etiqueta === 'Orgánico' ? 'selected' : ''}>Orgánico</option>
                            <option value="Ads" ${c.etiqueta === 'Ads' ? 'selected' : ''}>Ads</option>
                            <option value="Referido" ${c.etiqueta === 'Referido' ? 'selected' : ''}>Referido</option>
                            ${c.etiqueta && !['Orgánico', 'Ads', 'Referido', ''].includes(c.etiqueta) ? `<option value="${safeEtiqueta}" selected>✨ ${safeEtiqueta}</option>` : ''}
                            <option value="custom">Crear nueva...</option>
                        </select>
                    </div>
                </div>
                
                <div class="border border-slate-100 rounded-2xl bg-white overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,0.02)]">
                    <div class="bg-slate-50/50 p-4 border-b border-slate-100 flex justify-between items-center">
                        <h4 class="font-medium text-xs text-slate-500 flex items-center"><i class="ph ph-receipt mr-2 text-base"></i> Flujo de Caja</h4>
                        <div class="flex gap-2">
                            ${belongsToGroup ? `
                            <button onclick="ClientsComponent.openTransferModal('${id}')" class="bg-white border border-slate-200 text-slate-700 px-3 py-1 rounded-lg text-[10px] font-semibold transition-all hover:bg-slate-50 flex items-center cursor-pointer">
                                <i class="ph ph-arrows-left-right mr-1"></i> Transferir Saldo
                            </button>
                            ` : ''}
                            <button onclick="document.getElementById('quick-abono-panel').classList.toggle('hidden')" class="bg-white border border-slate-200 text-slate-700 px-3 py-1 rounded-lg text-[10px] font-semibold transition-all hover:bg-slate-50 flex items-center cursor-pointer">
                                <i class="ph ph-plus mr-1"></i> Abono Rápido
                            </button>
                        </div>
                    </div>
                    
                    <div id="quick-abono-panel" class="hidden bg-slate-50/60 p-4 border-b border-slate-100 shadow-inner space-y-4">
                        <div class="grid grid-cols-2 gap-3">
                            <div class="col-span-2">
                                <label class="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1 pl-0.5">Monto del Abono *</label>
                                <div class="relative">
                                    <span class="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-base">$</span>
                                    <input type="text" id="qa-monto" placeholder="Ej: 100.000" min="1" inputmode="numeric" class="currency-input w-full pl-8 pr-4 py-2 border border-slate-200 bg-white rounded-lg text-sm font-semibold outline-none shadow-sm focus:ring-2 focus:ring-slate-900/10 focus:border-slate-800 transition-all text-slate-800">
                                </div>
                            </div>
                            
                            ${qaDestinatarioHtml ? `
                            <div class="col-span-1">
                                ${qaDestinatarioHtml}
                            </div>
                            ` : ''}
                            
                            <div class="${qaDestinatarioHtml ? 'col-span-1' : 'col-span-2'}">
                                <label class="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1 pl-0.5">Método de Pago</label>
                                <select id="qa-metodo" class="w-full border border-slate-200 bg-white rounded-lg px-3 py-2.5 text-xs font-semibold outline-none shadow-sm text-slate-700 cursor-pointer">
                                    <option value="Transferencia">Transferencia</option>
                                    <option value="Efectivo">Efectivo</option>
                                    <option value="Nequi/Daviplata">Nequi/Daviplata</option>
                                </select>
                            </div>
                            <div>
                                <label class="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1 pl-0.5">Estado del Pago</label>
                                <select id="qa-status" class="w-full border border-slate-200 bg-white rounded-lg px-3 py-2.5 text-xs font-semibold outline-none shadow-sm text-slate-700 cursor-pointer">
                                    <option value="confirmed">Confirmado (Ok)</option>
                                    <option value="pending">Pendiente por Verificar</option>
                                </select>
                            </div>
                        </div>
                        
                        <button type="button" data-action="quick-abono" data-cliente-id="${id}" id="btn-quick-abono" class="w-full bg-slate-900 text-white font-black py-2.5 rounded-lg shadow-sm text-[10px] uppercase tracking-widest hover:bg-slate-800 transition-colors flex items-center justify-center cursor-pointer">
                            Registrar Abono Rápido
                        </button>
                    </div>
                    
                    <div class="p-3 divide-y divide-slate-100/60">
                        ${h}
                    </div>
                </div>
                
                <div class="border border-slate-100 rounded-2xl bg-white overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,0.02)]">
                    <div class="bg-slate-50/50 p-4 border-b border-slate-100">
                        <h4 class="font-medium text-xs text-slate-500 flex items-center"><i class="ph ph-clock-counter-clockwise mr-2 text-base"></i> Historial de Cambios</h4>
                    </div>
                    <div id="client-history-timeline" class="p-3 max-h-[300px] overflow-y-auto custom-scrollbar divide-y divide-slate-100/60">
                        <div class="py-8 text-center text-slate-400 text-xs font-semibold flex items-center justify-center gap-2">
                            <i class="ph ph-circle-notch animate-spin text-lg text-indigo-500"></i>
                            Sincronizando historial...
                        </div>
                    </div>
                </div>
            </div>`;

        const btnEdit = document.getElementById('btn-edit-client-modal');
        if(btnEdit) {
            btnEdit.removeAttribute('onclick');
            btnEdit.setAttribute('data-action', 'edit-client-master');
            btnEdit.setAttribute('data-cliente-id', id);
        }
        const btnDelete = document.getElementById('btn-delete-client-modal');
        if (btnDelete) {
            btnDelete.removeAttribute('onclick');
            const newBtnDelete = btnDelete.cloneNode(true);
            btnDelete.parentNode.replaceChild(newBtnDelete, btnDelete);
            newBtnDelete.addEventListener('click', () => {
                window.promptGlobalDelete(id, 'cliente', `${c.nombre || ''} ${c.apellido || ''}`);
            });
        }
        UI.openModal('client-detail-modal', 'cdm-bg', 'cdm-content');
        this.loadAndRenderClientHistory(id);
    },

    async loadAndRenderClientHistory(id) {
        const container = document.getElementById('client-history-timeline');
        if (!container) return;

        try {
            const { data, error } = await supabaseClient
                .from('historial_reservas')
                .select('*')
                .eq('cliente_id', id)
                .order('created_at', { ascending: false });

            if (error) throw error;

            if (!data || data.length === 0) {
                container.innerHTML = '<div class="py-6 text-center text-slate-400 uppercase tracking-widest font-black text-[10px]">No hay historial de cambios registrado</div>';
                return;
            }

            let htmlH = '';
            data.forEach(item => {
                let badgeClass = 'bg-slate-50 text-slate-600 border border-slate-100 px-2 py-0.5 rounded-full text-[8px] font-medium inline-flex items-center gap-1';
                if (item.tipo_evento === 'CREACION') {
                    badgeClass = 'bg-emerald-50 text-emerald-700 border border-emerald-100/50 px-2 py-0.5 rounded-full text-[8px] font-medium inline-flex items-center gap-1';
                } else if (item.tipo_evento === 'SEGURIDAD') {
                    badgeClass = 'bg-rose-50 text-rose-700 border border-rose-100/50 px-2 py-0.5 rounded-full text-[8px] font-medium inline-flex items-center gap-1 animate-pulse';
                } else if (item.tipo_evento === 'ELIMINACION') {
                    badgeClass = 'bg-orange-50 text-orange-700 border border-orange-100/50 px-2 py-0.5 rounded-full text-[8px] font-medium inline-flex items-center gap-1';
                } else if (item.tipo_evento === 'SISTEMA') {
                    badgeClass = 'bg-purple-50 text-purple-700 border border-purple-100/50 px-2 py-0.5 rounded-full text-[8px] font-medium inline-flex items-center gap-1';
                } else {
                    badgeClass = 'bg-sky-50 text-sky-700 border border-sky-100/50 px-2 py-0.5 rounded-full text-[8px] font-medium inline-flex items-center gap-1';
                }

                const dotColor = item.tipo_evento === 'CREACION' ? 'bg-emerald-500' :
                                 item.tipo_evento === 'SEGURIDAD' ? 'bg-rose-600' :
                                 item.tipo_evento === 'ELIMINACION' ? 'bg-orange-500' :
                                 item.tipo_evento === 'SISTEMA' ? 'bg-purple-500' : 'bg-sky-500';

                const valAnt = item.valor_anterior || '';
                const valNue = item.valor_nuevo || '';
                let diffHtml = '';

                if (valAnt === 'N/A' || valAnt === '' || valAnt === 'null') {
                    diffHtml = `<span class="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded border border-emerald-100/50 font-mono text-[9px] font-medium max-w-xs truncate" title="${UI.sanitize(valNue)}"><i class="ph ph-plus-circle text-xs text-emerald-500"></i> ${UI.sanitize(valNue)}</span>`;
                } else {
                    diffHtml = `
                        <div class="flex items-center gap-1.5 flex-wrap font-mono text-[9px]">
                            <span class="inline-flex bg-rose-50 text-rose-600 px-1.5 py-0.5 rounded border border-rose-100/50 line-through truncate max-w-[120px]" title="${UI.sanitize(valAnt)}">${UI.sanitize(valAnt)}</span>
                            <i class="ph ph-caret-right text-slate-400 text-xs"></i>
                            <span class="inline-flex bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded border border-emerald-100/50 font-semibold truncate max-w-[120px]" title="${UI.sanitize(valNue)}">${UI.sanitize(valNue)}</span>
                        </div>
                    `;
                }

                htmlH += `
                <div class="py-3 border-b border-slate-100 hover:bg-slate-50/50 px-2 rounded-xl transition-all duration-200">
                    <div class="flex justify-between items-center mb-2">
                        <span class="text-xs font-semibold text-slate-800 flex items-center gap-2">
                            <span class="${badgeClass}">
                                <span class="w-1.5 h-1.5 rounded-full ${dotColor}"></span>
                                ${item.tipo_evento || 'MODIFICACION'}
                            </span>
                            ${UI.sanitize(item.campo)}
                        </span>
                        <span class="text-[9px] text-slate-400 font-medium">${new Date(item.created_at).toLocaleDateString('es-CO')} ${new Date(item.created_at).toLocaleTimeString('es-CO', {hour: '2-digit', minute:'2-digit'})}</span>
                    </div>
                    <div class="mb-2">
                        ${diffHtml}
                    </div>
                    <p class="text-[9px] text-slate-400 font-medium flex items-center gap-1.5"><i class="ph ph-user text-[10px]"></i> Por: ${UI.sanitize(item.usuario_email)}</p>
                </div>`;
            });
            container.innerHTML = htmlH;
        } catch (e) {
            console.error("Error cargando historial de cliente:", e);
            container.innerHTML = '<div class="py-6 text-center text-red-500 text-xs font-semibold">Error al cargar el historial</div>';
        }
    },

    async quickStatusChange(id, ns) {
        // DESHABILITADO: El cambio de estado solo se permite desde el Editor Maestro
        console.warn("Cambio rápido de estado deshabilitado.");
        UI.showToast("Edita el cliente desde el botón maestro para cambiar el estado.", "warning");
    },

    async quickEtiquetaChange(id, val, selectEl) {
        let nuevaEtiqueta = val;
        if (val === 'custom') {
            nuevaEtiqueta = prompt("Escribe la nueva etiqueta personalizada:");
            if (!nuevaEtiqueta || nuevaEtiqueta.trim() === '') {
                this.openDetailModal(id); // Recargar para revertir si cancela
                return;
            }
        }
        const clienteActual = DataService.clientes.find(c => c.id === id);
        if (clienteActual && clienteActual.etiqueta !== nuevaEtiqueta) {
            await DataService.registrarHistorial(id, 'etiqueta', clienteActual.etiqueta, nuevaEtiqueta);
        }
        await supabaseClient.from('clientes').update({ etiqueta: nuevaEtiqueta }).eq('id', id);
        await DataService.loadAll();
        this.openDetailModal(id);
        UI.showToast("Etiqueta actualizada exitosamente.", "success");
    },

    closeDetailModal() {
        UI.closeModal('client-detail-modal', 'cdm-bg', 'cdm-content');

        // PARCHE QA: Restaurar botones por si fueron ocultados por la Bóveda de Socios
        const btnEdit = document.getElementById('btn-edit-client-modal');
        const btnDel = document.getElementById('btn-delete-client-modal');
        if (btnEdit) btnEdit.style.display = '';
        if (btnDel) btnDel.style.display = '';
    },

    // =========================================
    // EXPORTACIÓN SELECTIVA A CSV (EXCEL)
    // =========================================
    exportToCSV() {
        const activeTab = this.currentTab || 'activas';
        const searchInput = document.getElementById('buscador-clientes-rapido')?.value.toLowerCase().trim() || '';

        // Valores de filtros universales
        const ufSearch = document.getElementById('uf-search')?.value.toLowerCase().trim() || '';
        const ufPlanName = document.getElementById('uf-plan')?.value || '';
        const ufFecha = document.getElementById('uf-fecha')?.value || '';
        const ufEstado = document.getElementById('uf-estado')?.value || '';
        const ufCiudad = document.getElementById('uf-ciudad')?.value.toLowerCase().trim() || '';

        // Filtrar en memoria utilizando exactamente las mismas reglas que la tabla visual
        const filtered = DataService.clientes.filter(cli => {
            if (cli.deleted_at) return false;

            // 1. Filtrar por Tab activa
            const tabName = this.getClientTabMapping(cli);
            if (tabName !== activeTab) return false;

            const plan = DataService.planes.find(p => p.id === cli.plan_id);
            const pNom = plan ? plan.nombre : '';

            // 2. Filtrar por buscador rápido
            if (searchInput) {
                const textContent = `${cli.nombre || ''} ${cli.apellido || ''} ${cli.documento || ''} ${cli.telefono || ''} ${pNom} ${cli.ciudad || ''} ${cli.estado || ''} ${cli.etiqueta || ''}`.toLowerCase();
                if (!textContent.includes(searchInput)) return false;
            }

            // 3. Filtrar por filtros universales
            if (ufSearch) {
                const textContent = `${cli.nombre || ''} ${cli.apellido || ''} ${cli.documento || ''} ${cli.telefono || ''} ${pNom} ${cli.ciudad || ''} ${cli.estado || ''} ${cli.etiqueta || ''}`.toLowerCase();
                if (!textContent.includes(ufSearch)) return false;
            }
            if (ufPlanName && pNom !== ufPlanName) return false;
            if (ufFecha && !(cli.fecha_viaje || '').includes(ufFecha)) return false;
            if (ufEstado && cli.estado !== ufEstado) return false;
            if (ufCiudad && !(cli.ciudad || '').toLowerCase().includes(ufCiudad)) return false;

            return true;
        });

        if (filtered.length === 0) {
            return UI.showToast("No hay registros que coincidan con la vista actual para exportar.", "error");
        }

        // Sanitizador CSV: Escapa comillas dobles, elimina saltos de línea, envuelve en comillas si contiene coma/punto y coma
        const csvSafe = (val) => {
            if (val === null || val === undefined) return '';
            let s = String(val).replace(/\r?\n/g, ' ').replace(/\t/g, ' ').trim();
            s = s.replace(/"/g, '""'); // Escape de comillas dobles
            if (s.includes(',') || s.includes('"') || s.includes(';')) {
                s = `"${s}"`;
            }
            return s;
        };

        // Cabeceras expandidas
        const headers = [
            'ID', 'Nombre', 'Apellido', 'Documento', 'Celular', 'Email', 'Plan Elegido',
            'Fecha de Salida', 'Pax', 'Tipo Relación', 'Valor Total', 'Abonos Recaudados', 'Saldo Pendiente', 'Estado'
        ];
        const csvRows = [headers.join(',')];

        filtered.forEach(cli => {
            const plan = DataService.planes.find(p => p.id === cli.plan_id);
            const pNom = plan ? plan.nombre : 'Sin Plan';

            let totalAbo = 0;
            let targetPrice = cli.precio_total || 0;
            let tipoRelacion = 'Individual';

            if (cli.parent_id) {
                tipoRelacion = 'Acompañante';
                totalAbo = DataService.abonos.filter(a => a.cliente_id === cli.id && a.estado_pago !== 'pending' && a.estado_pago !== 'refunded').reduce((s, a) => s + (Number(a.monto) || 0), 0);
                targetPrice = cli.precio_total || 0;
            } else if ((cli.pax || 1) > 1) {
                tipoRelacion = 'Titular de Grupo';
                const comps = DataService.clientes.filter(c => c.parent_id === cli.id && !c.deleted_at);
                const groupIds = [cli.id, ...comps.map(c => c.id)];
                totalAbo = DataService.abonos.filter(a => groupIds.includes(a.cliente_id) && a.estado_pago !== 'pending' && a.estado_pago !== 'refunded').reduce((s, a) => s + (Number(a.monto) || 0), 0);
                targetPrice = (cli.precio_total || 0) * (cli.pax || 1);
            } else {
                totalAbo = DataService.abonos.filter(a => a.cliente_id === cli.id && a.estado_pago !== 'pending' && a.estado_pago !== 'refunded').reduce((s, a) => s + (Number(a.monto) || 0), 0);
                targetPrice = cli.precio_total || 0;
            }

            const fin = calcularFinanzas(totalAbo, targetPrice);

            csvRows.push([
                csvSafe(cli.id),
                csvSafe(cli.nombre || ''),
                csvSafe(cli.apellido || ''),
                csvSafe(cli.documento || ''),
                csvSafe(cli.telefono || ''),
                csvSafe(cli.email || ''),
                csvSafe(pNom),
                csvSafe(cli.fecha_viaje || 'Sin Fecha'),
                csvSafe(cli.pax || 1),
                csvSafe(tipoRelacion),
                csvSafe(formatCOP(targetPrice)),
                csvSafe(formatCOP(fin.abonado)),
                csvSafe(formatCOP(fin.saldo)),
                csvSafe(cli.estado || '')
            ].join(','));
        });

        // Generar y descargar el archivo con BOM UTF-8 para compatibilidad con Excel
        const bom = '\uFEFF';
        const csvContent = bom + csvRows.join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);

        const hoy = new Date().toISOString().split('T')[0];
        const link = document.createElement('a');
        link.href = url;
        link.download = `Reservas_CRM_${hoy}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        UI.showToast(`${filtered.length} reservas exportadas exitosamente a CSV.`, "success");
    },

    // ── RESERVAS GRUPALES Y ACOMPAÑANTES ──────────────────────────────
    onPaxChange() {
        const currentData = this.gatherCompanionsData();
        this.renderCompanionsInputs(currentData);
        this.populateNewClientAbonoDestinatario();
        this.calculateTotals();
    },

    gatherCompanionsData() {
        const rows = document.querySelectorAll('.companion-row');
        const data = [];
        rows.forEach(row => {
            data.push({
                id: row.querySelector('.comp-id')?.value || '',
                nombre: row.querySelector('.comp-nombre')?.value || '',
                apellido: row.querySelector('.comp-apellido')?.value || '',
                documento: row.querySelector('.comp-documento')?.value || '',
                edad: row.querySelector('.comp-edad')?.value || '',
                eps: row.querySelector('.comp-eps')?.value || '',
                alergias: row.querySelector('.comp-alergias')?.value || 'Ninguna',
                requerimientos: row.querySelector('.comp-requerimientos')?.value || 'Ninguno',
                contacto_emergencia: row.querySelector('.comp-contacto')?.value || ''
            });
        });
        return data;
    },

    renderCompanionsInputs(companionsData = []) {
        const paxStr = document.getElementById('cf-pax').value;
        const pax = Math.max(1, parseInt(paxStr) || 1);
        const container = document.getElementById('cf-acompanantes-container');
        const tabBtn = document.getElementById('tab-btn-acompanantes');

        if (!container) return;

        if (pax > 1) {
            tabBtn.classList.remove('hidden');
        } else {
            tabBtn.classList.add('hidden');
            const activeTab = document.querySelector('.tab-btn.active');
            if (activeTab && activeTab.id === 'tab-btn-acompanantes') {
                UI.switchTab('cliente', 'datosp');
            }
        }

        container.innerHTML = '';
        const count = pax - 1;

        for (let i = 0; i < count; i++) {
            const comp = companionsData[i] || {};
            const html = `
                <div class="companion-row border border-slate-200 rounded-2xl p-4 bg-slate-50/50 space-y-3" data-index="${i}">
                    <h5 class="text-xs font-bold text-slate-700 flex justify-between items-center">
                        <span>Acompañante #${i + 1}</span>
                    </h5>
                    <input type="hidden" class="comp-id" value="${comp.id || ''}">
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                            <label class="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Nombres *</label>
                            <input type="text" required class="comp-nombre w-full border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-800 bg-white outline-none focus:ring-2 focus:ring-slate-900 transition-all shadow-sm" value="${comp.nombre || ''}">
                        </div>
                        <div>
                            <label class="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Apellidos *</label>
                            <input type="text" required class="comp-apellido w-full border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-800 bg-white outline-none focus:ring-2 focus:ring-slate-900 transition-all shadow-sm" value="${comp.apellido || ''}">
                        </div>
                        <div>
                            <label class="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Documento Identidad *</label>
                            <input type="text" required class="comp-documento w-full border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-800 bg-white outline-none focus:ring-2 focus:ring-slate-900 transition-all shadow-sm" value="${comp.documento || ''}">
                        </div>
                        <div>
                            <label class="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Edad e EPS</label>
                            <div class="flex gap-2">
                                <input type="number" min="0" placeholder="Edad" class="comp-edad w-1/3 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-800 bg-white outline-none focus:ring-2 focus:ring-slate-900 transition-all shadow-sm" value="${comp.edad || ''}">
                                <input type="text" placeholder="EPS" class="comp-eps w-2/3 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-800 bg-white outline-none focus:ring-2 focus:ring-slate-900 transition-all shadow-sm" value="${comp.eps || ''}">
                            </div>
                        </div>
                        <div>
                            <label class="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Alergias</label>
                            <input type="text" class="comp-alergias w-full border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-800 bg-white outline-none focus:ring-2 focus:ring-slate-900 transition-all shadow-sm" value="${comp.alergias || 'Ninguna'}">
                        </div>
                        <div>
                            <label class="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Requerimientos</label>
                            <input type="text" class="comp-requerimientos w-full border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-800 bg-white outline-none focus:ring-2 focus:ring-slate-900 transition-all shadow-sm" value="${comp.requerimientos || 'Ninguno'}">
                        </div>
                        <div class="md:col-span-2">
                            <label class="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Contacto Emergencia</label>
                            <input type="text" placeholder="Nombre y celular..." class="comp-contacto w-full border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-800 bg-white outline-none focus:ring-2 focus:ring-slate-900 transition-all shadow-sm" value="${comp.contacto_emergencia || ''}">
                        </div>
                    </div>
                </div>
            `;
            container.insertAdjacentHTML('beforeend', html);
        }
    },

    populateAbonoDestinatarios(clienteId) {
        const cli = DataService.clientes.find(c => c.id === clienteId);
        if (!cli) return;

        const companions = DataService.clientes.filter(c => c.parent_id === clienteId && !c.deleted_at);

        const selectors = [
            { id: 'cf-abono-live-destinatario', defaultOption: 'Todo el grupo (Dividir)' }
        ];

        selectors.forEach(selConfig => {
            const select = document.getElementById(selConfig.id);
            if (!select) return;

            select.innerHTML = '';
            
            if (companions.length > 0) {
                select.classList.remove('hidden');
                select.innerHTML = `
                    <option value="grupo">${selConfig.defaultOption}</option>
                    <option value="${cli.id}">${cli.nombre} ${cli.apellido} (Titular)</option>
                `;
                companions.forEach(comp => {
                    select.innerHTML += `<option value="${comp.id}">${comp.nombre} ${comp.apellido}</option>`;
                });
            } else {
                select.classList.add('hidden');
            }
        });
    },

    populateNewClientAbonoDestinatario() {
        const select = document.getElementById('cf-abono-destinatario');
        const containerDiv = document.getElementById('div-abono-destinatario-new');
        if (!select || !containerDiv) return;

        const titularNombre = document.getElementById('cf-nombre').value || 'Titular';
        const titularApellido = document.getElementById('cf-apellido').value || '';
        const companionsData = this.gatherCompanionsData();

        select.innerHTML = '';

        if (companionsData.length > 0) {
            containerDiv.classList.remove('hidden');
            select.innerHTML = `
                <option value="grupo">Todo el grupo (Dividir equitativamente)</option>
                <option value="titular">${titularNombre} ${titularApellido} (Titular)</option>
            `;
            companionsData.forEach((comp, idx) => {
                const name = `${comp.nombre || 'Acompañante'} ${comp.apellido || idx + 1}`;
                select.innerHTML += `<option value="comp-${idx}">${name}</option>`;
            });
        } else {
            containerDiv.classList.add('hidden');
        }
    },

    // ── MODAL DE TRANSFERENCIA DE SALDO ───────────────────────────────
    openTransferModal(id) {
        const c = DataService.clientes.find(x => x.id === id);
        if (!c) return;

        let groupId = c.parent_id || c.id;
        
        // Determinar miembros del grupo (excluyendo al origen)
        const groupMembers = [];
        const titular = DataService.clientes.find(x => x.id === groupId);
        if (titular) groupMembers.push(titular);

        const companions = DataService.clientes.filter(x => x.parent_id === groupId && !x.deleted_at);
        groupMembers.push(...companions);

        const destinations = groupMembers.filter(x => x.id !== id);

        if (destinations.length === 0) {
            return UI.showToast("No hay otros miembros en este grupo para transferir saldo.", "warning");
        }

        document.getElementById('ctm-origen-id').value = id;
        document.getElementById('ctm-origen-nombre').value = `${c.nombre} ${c.apellido}`;

        const totalAbo = DataService.abonos
            .filter(a => a.cliente_id === id && a.estado_pago !== 'pending' && a.estado_pago !== 'refunded')
            .reduce((s, a) => s + (Number(a.monto) || 0), 0);

        document.getElementById('ctm-origen-saldo').value = totalAbo;
        UI.setCurrencyValue('ctm-origen-saldo-display', totalAbo);
        UI.setCurrencyValue('ctm-monto', totalAbo);

        const destSelect = document.getElementById('ctm-destinatario');
        destSelect.innerHTML = '<option value="grupo">Dividir equitativamente entre los que sí viajan</option>';
        destinations.forEach(d => {
            destSelect.innerHTML += `<option value="${d.id}">${d.nombre} ${d.apellido} (${d.id === groupId ? 'Titular' : 'Acompañante'})</option>`;
        });

        UI.openModal('client-transfer-modal', 'ctm-bg', 'ctm-content');
    },

    async executeTransfer() {
        const origenId = document.getElementById('ctm-origen-id').value;
        const monto = UI.parseCurrency(document.getElementById('ctm-monto').value);
        const destOption = document.getElementById('ctm-destinatario').value;
        const origenSaldo = parseFloat(document.getElementById('ctm-origen-saldo').value) || 0;

        if (isNaN(monto) || monto <= 0) {
            return UI.showToast("Ingresa un monto de transferencia válido.", "error");
        }

        if (monto > origenSaldo) {
            return UI.showToast("El monto no puede superar el saldo abonado disponible.", "error");
        }

        const originCli = DataService.clientes.find(c => c.id === origenId);
        if (!originCli) return;

        let groupId = originCli.parent_id || originCli.id;
        const destinations = [];
        const titular = DataService.clientes.find(x => x.id === groupId);
        if (titular && titular.id !== origenId) destinations.push(titular);
        const companions = DataService.clientes.filter(x => x.parent_id === groupId && !x.deleted_at && x.id !== origenId);
        destinations.push(...companions);

        let destinosIds = [];
        if (destOption === 'grupo') {
            destinosIds = destinations.map(d => d.id);
        } else {
            destinosIds = [destOption];
        }

        if (destinosIds.length === 0) {
            return UI.showToast("No hay destinatarios activos en el grupo.", "error");
        }

        const btn = document.getElementById('ctm-confirm-btn');
        const prevText = btn.innerHTML;
        btn.innerHTML = '<i class="ph ph-spinner animate-spin text-lg"></i> Procesando...';
        btn.disabled = true;

        try {
            await DataService.transferirSaldoGrupo(origenId, destinosIds, monto);
            
            UI.showToast("Transferencia de saldo realizada correctamente.", "success");
            this.closeTransferModal();
            this.refreshUIAfterAbonoChange(origenId);
        } catch (e) {
            console.error(e);
            UI.showToast("Error al ejecutar la transferencia de saldo.", "error");
        } finally {
            btn.innerHTML = prevText;
            btn.disabled = false;
        }
    },

    closeTransferModal() {
        UI.closeModal('client-transfer-modal', 'ctm-bg', 'ctm-content');
    },

    openMergeModal() {
        const selectedIds = Array.from(window.DispatchModule.selectedClients || []);
        if (selectedIds.length < 2) {
            return UI.showToast("Selecciona al menos 2 reservas para unirlas en un grupo.", "warning");
        }

        const selectedClients = selectedIds.map(id => DataService.clientes.find(c => c.id === id)).filter(Boolean);
        if (selectedClients.length < 2) return;

        const titularListContainer = document.getElementById('cmg-titular-list');
        const companionsListContainer = document.getElementById('cmg-companions-list');
        if (!titularListContainer || !companionsListContainer) return;

        titularListContainer.innerHTML = '';
        companionsListContainer.innerHTML = '';

        selectedClients.forEach((client, idx) => {
            const isChecked = idx === 0 ? 'checked' : '';
            titularListContainer.innerHTML += `
                <label class="flex items-center p-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition-all cursor-pointer shadow-sm">
                    <input type="radio" name="cmg-titular-radio" value="${client.id}" ${isChecked} class="cmg-radio w-4 h-4 text-indigo-600 border-slate-300 focus:ring-indigo-500 cursor-pointer">
                    <div class="ml-3">
                        <p class="text-xs font-bold text-slate-800">${client.nombre} ${client.apellido}</p>
                        <p class="text-[9px] font-mono text-slate-400">CC ${client.documento} | Pax: ${client.pax || 1}</p>
                    </div>
                </label>
            `;
        });

        const updateCompanionsList = () => {
            const selectedTitularId = document.querySelector('input[name="cmg-titular-radio"]:checked')?.value;
            companionsListContainer.innerHTML = '';
            selectedClients.forEach(client => {
                if (client.id !== selectedTitularId) {
                    companionsListContainer.innerHTML += `
                        <div class="flex items-center gap-2 py-1 text-[11px] text-slate-600 font-semibold">
                            <i class="ph ph-user text-slate-400"></i>
                            <span>${client.nombre} ${client.apellido} (CC ${client.documento})</span>
                        </div>
                    `;
                }
            });
        };

        titularListContainer.onchange = updateCompanionsList;
        updateCompanionsList();

        UI.openModal('client-merge-modal', 'cmg-bg', 'cmg-content');
    },

    async executeMerge() {
        const titularRadio = document.querySelector('input[name="cmg-titular-radio"]:checked');
        if (!titularRadio) {
            return UI.showToast("Debes elegir a un titular para el grupo.", "error");
        }
        const titularId = titularRadio.value;
        const selectedIds = Array.from(window.DispatchModule.selectedClients || []);
        const companerosIds = selectedIds.filter(id => id !== titularId);

        if (companerosIds.length === 0) {
            return UI.showToast("No hay acompañantes para unir.", "error");
        }

        const titular = DataService.clientes.find(c => c.id === titularId);
        if (!titular) return;

        const confirmText = `¿Estás seguro de unir estas reservas?\n\nLos acompañantes se integrarán al grupo de ${titular.nombre} ${titular.apellido}.\nSus planes, fechas y estados se sincronizarán con los del Titular, y el saldo total consolidado se verá reflejado en su ficha.`;
        if (!confirm(confirmText)) return;

        const btn = document.getElementById('btn-execute-merge');
        const prevText = btn.innerHTML;
        btn.innerHTML = '<i class="ph ph-spinner animate-spin text-sm"></i> Uniendo...';
        btn.disabled = true;

        try {
            await DataService.unirClientesEnGrupo(titularId, companerosIds);
            UI.showToast("Reservas agrupadas exitosamente.", "success");
            this.closeMergeModal();
            window.DispatchModule.clearSelection();
            this.renderTable();
        } catch (e) {
            console.error(e);
            UI.showToast("Error al agrupar las reservas en Supabase.", "error");
        } finally {
            btn.innerHTML = prevText;
            btn.disabled = false;
        }
    },

    closeMergeModal() {
        UI.closeModal('client-merge-modal', 'cmg-bg', 'cmg-content');
    },

    async desagruparCliente(id, btn = null) {
        const c = DataService.clientes.find(x => x.id === id);
        if (!c || !c.parent_id) return;

        const titular = DataService.clientes.find(x => x.id === c.parent_id);
        const name = `${c.nombre} ${c.apellido}`;
        if (!confirm(`¿Estás seguro de desagrupar a ${name}? Pasará a ser una reserva individual e independiente.`)) return;

        let originalContent = '';
        if (btn) {
            originalContent = btn.innerHTML;
            if (btn.classList.contains('hover:underline')) {
                btn.innerHTML = '<i class="ph ph-spinner animate-spin mr-1"></i> Separando...';
            } else {
                btn.innerHTML = '<i class="ph ph-spinner animate-spin text-sm"></i>';
            }
            btn.disabled = true;
        }

        try {
            await DataService.desagruparClienteDeGrupo(id);
            UI.showToast(`${name} desagrupado con éxito.`, "success");
            this.closeDetailModal();
            this.renderTable();
        } catch (e) {
            console.error(e);
            UI.showToast("Error al desagrupar al cliente.", "error");
            if (btn) {
                btn.innerHTML = originalContent;
                btn.disabled = false;
            }
        }
    },

    // ── SUB-TABS DE RESERVAS ──────────────────────────────────────────
    /*
     * DICCIONARIO DE ESTADOS Y PESTAÑAS (REGLAS DE NEGOCIO):
     * 1) RESERVAS ACTIVAS: Planes cuya fecha NO ha ocurrido (sea que deban dinero o hayan pagado 100%).
     * 2) EN CAJA: Planes cuya fecha YA PASÓ, pero el pago es menor al 100%.
     * 3) DEVOLUCIÓN: Asignado manualmente. Proviene de 'En Caja' y se le devuelve el dinero.
     * 4) REPROGRAMADO: Asignado manualmente. Proviene de 'En Caja' por no asistir, y se reasigna plan/fecha.
     * 5) REALIZADAS: Planes cuya fecha YA PASÓ, y el pago es >= 100%.
     *
     * Nota: La automatización de estos estados ocurre en DataService.autoClassifyReservas() en supabase.service.js.
     * Esta función getClientTabMapping confía en que los datos ya están saneados por la automatización.
     */
    
    getClientTabMapping(c) {
        const st = c.estado ? c.estado.toLowerCase() : '';
        if (st === 'en caja') return 'en-caja';
        if (st === 'devolución' || st === 'cancelado o devolución' || st === 'cancelados') return 'devolucion';
        if (st === 'reprogramado') return 'reprogramado';
        if (st === 'realizado' || st === 'realizadas') return 'realizadas';
        if (st === 'desistió') return 'none'; 

        return 'activas';
    },

    updateTabBadges() {
        let countEnCaja = 0, countDev = 0, countRepro = 0, countRealizadas = 0;
        DataService.clientes.forEach(c => {
            const tab = this.getClientTabMapping(c);
            if (tab === 'en-caja') countEnCaja++;
            if (tab === 'devolucion') countDev++;
            if (tab === 'reprogramado') countRepro++;
            if (tab === 'realizadas') countRealizadas++;
        });

        const bCaja = document.getElementById('en-caja-badge');
        const bDev = document.getElementById('devolucion-badge');
        const bRepro = document.getElementById('reprogramado-badge');
        const bRealizadas = document.getElementById('realizadas-badge');

        if (bCaja) bCaja.innerText = countEnCaja;
        if (bDev) bDev.innerText = countDev;
        if (bRepro) bRepro.innerText = countRepro;
        if (bRealizadas) bRealizadas.innerText = countRealizadas;
    },

    switchClientTab(tab) {
        this.currentTab = tab;
        const panels = ['activas', 'en-caja', 'devolucion', 'reprogramado', 'realizadas'];
        panels.forEach(p => {
            const btnEl = document.getElementById(`clients-tab-${p}`);
            if (!btnEl) return;

            if (p === tab) {
                btnEl.classList.add('border-slate-900', 'text-slate-900');
                btnEl.classList.remove('border-transparent', 'text-slate-400');
            } else {
                btnEl.classList.add('border-transparent', 'text-slate-400');
                btnEl.classList.remove('border-slate-900', 'text-slate-900');
            }
        });

        const headerInfo = document.getElementById('clients-table-header-info');
        const headerText = document.getElementById('clients-table-header-text');

        const tabInfos = {
            'activas': null,
            'en-caja': { icon: 'ph-vault', text: 'Reservas confirmadas con pago completo registrado en caja.', color: 'emerald' },
            'devolucion': { icon: 'ph-arrow-u-up-left', text: 'Clientes con saldo a favor o proceso de reembolso activo.', color: 'rose' },
            'reprogramado': { icon: 'ph-calendar-dots', text: 'Reservas con fecha de salida reprogramada.', color: 'amber' },
            'realizadas': { icon: 'ph-check-circle', text: 'Viajes completados exitosamente.', color: 'slate' }
        };

        const info = tabInfos[tab];
        if (info && headerInfo && headerText) {
            headerInfo.className = `p-4 border-b bg-${info.color}-50/40 border-${info.color}-100`;
            headerText.className = `text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 text-${info.color}-600`;
            headerText.innerHTML = `<i class="ph ${info.icon} text-sm"></i> ${info.text}`;
            headerInfo.classList.remove('hidden');
            
            // Actualizar state vacío
            const emptyIcon = document.getElementById('clients-empty-icon');
            if (emptyIcon) emptyIcon.className = `ph ${info.icon} text-5xl mb-3 opacity-30`;
        } else if (headerInfo) {
            headerInfo.classList.add('hidden');
            const emptyIcon = document.getElementById('clients-empty-icon');
            if (emptyIcon) emptyIcon.className = `ph ph-folder-open text-5xl mb-3 opacity-30`;
        }

        this.renderTable();
    }
};


