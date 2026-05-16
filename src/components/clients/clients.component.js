// js/modules/clients.module.js — Directorio de Reservas
// Cross-module: window.AuthModule, window.DashboardModule, window.BitacoraModule, window.DispatchModule
// Extraído quirúrgicamente de app.js líneas 1543-2457
import { DataService, supabaseClient } from '../../../js/services/supabase.service.js';
import { UI } from '../../../js/utils/ui.utils.js';
import { formatCOP, formatShortDate, calcularFinanzas, updateFinancialUI } from '../../../js/utils/format.utils.js';
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

        const paxInput = document.getElementById('cf-pax');
        if (paxInput) {
            paxInput.addEventListener('input', () => this.calculateTotals());
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
            }
        });

        document.body.addEventListener('change', (e) => {
            const target = e.target;
            if (target.dataset.action === 'quick-etiqueta') {
                this.quickEtiquetaChange(target.dataset.clienteId, target.value, target);
            }
        });
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

            let cls = 'bg-slate-100 text-slate-500 border-slate-200';
            const stLower = cli.estado ? cli.estado.toLowerCase() : '';
            if (stLower === 'confirmado') cls = 'bg-emerald-50 text-emerald-700 border-emerald-200';
            if (stLower === 'en caja') cls = 'bg-emerald-100 text-emerald-800 border-emerald-300';
            if (stLower === 'pendiente de pago') cls = 'bg-amber-50 text-amber-700 border-amber-200';
            if (stLower === 'realizado') cls = 'bg-slate-100 text-slate-600 border-slate-200';
            if (stLower === 'devolución' || stLower === 'cancelado o devolución') cls = 'bg-rose-50 text-rose-700 border-rose-200';
            if (stLower === 'registro pendiente') cls = 'bg-indigo-50 text-indigo-600 border-indigo-200';
            if (stLower === 'reprogramado') cls = 'bg-orange-50 text-orange-700 border-orange-200';

            const totalAbo = DataService.abonos.filter(a => a.cliente_id === cli.id && a.estado_pago !== 'pending' && a.estado_pago !== 'refunded').reduce((s, a) => s + (Number(a.monto) || 0), 0);
            const fin = calcularFinanzas(totalAbo, cli.precio_total);

            const tr = document.createElement('tr');
            // ELIMINAMOS 'slide-in-right' y la animación para quitar el parpadeo
            tr.className = `client-row hover:bg-slate-50 transition border-b border-slate-50 cursor-pointer`;

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
                // Ordenar para obtener el más próximo
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
                ? `<span class="text-[9px] font-black uppercase tracking-widest bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-md shadow-sm border border-purple-200 mb-1 inline-block">${UI.sanitize(cli.etiqueta)}</span>`
                : '';

            let fechaLimpia = cli.fecha_viaje ? UI.sanitize(cli.fecha_viaje) : 'S/F';
            fechaLimpia = fechaLimpia.replace(/20\d{2}/g, '').replace(/ al /g, ' - ').replace(' (Histórico)', '');
            fechaLimpia = fechaLimpia.replace(/ , /g, ' ').replace(/,\s*-/g, ' -').replace(/,\s*$/, '').trim();
            const fechaBadge = fechaLimpia;

            // 3. INYECCIÓN DEL HTML EN LA FILA (Incluye el Glowing Dot en el nombre)
            tr.innerHTML = `
                <td class="py-3 px-4 text-center" onclick="event.stopPropagation()">
                    <input type="checkbox" value="${cli.id}" onchange="window.DispatchModule.toggleClientSelection('${cli.id}')" class="client-checkbox w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900 cursor-pointer">
                </td>
                <td class="py-3 px-4">
                    ${tagHtml}
                    <p class="font-bold text-slate-800 text-sm leading-none flex items-center">${UI.sanitize(cli.nombre)} ${UI.sanitize(cli.apellido)} ${glowingDot}</p>
                    <p class="text-[11px] text-slate-400 font-mono mt-1">${UI.sanitize(cli.documento)}</p>
                </td>
                <td class="py-3 px-4">
                    <p class="text-xs font-bold text-slate-700 flex items-center"><i class="ph ph-whatsapp-logo text-green-500 mr-1 text-lg"></i> ${UI.sanitize(cli.telefono)}</p>
                </td>
                <td class="py-3 px-4">
                    <p class="font-bold text-primary-700 text-sm leading-tight">${UI.sanitize(pNom)}</p>
                    <p class="text-[10px] font-bold text-slate-500 flex items-center mt-1 bg-slate-100 px-1.5 py-0.5 rounded w-fit border border-slate-200"><i class="ph ph-calendar-blank mr-1"></i> ${fechaBadge}</p>
                </td>
                <td class="py-3 px-4 text-right">
                    <p class="text-sm font-black text-slate-800">${formatCOP(fin.abonado)}</p>
                    ${this.currentTab === 'devolucion' && cli.monto_devuelto !== undefined 
                        ? `<p class="text-[10px] font-black text-rose-600 uppercase tracking-widest mt-1 bg-rose-50 px-1 rounded inline-block border border-rose-100">Devolución: ${formatCOP(cli.monto_devuelto)}</p>`
                        : `<div class="flex items-center justify-end mt-1 group">
                                <div class="w-16 h-1.5 bg-slate-200 rounded-full overflow-hidden mr-2">
                                    <div class="h-full bg-green-500" style="width: ${fin.porcentaje}%"></div>
                                </div>
                                <p class="text-[10px] font-bold ${fin.porcentaje < 100 ? 'text-orange-500' : 'text-green-600'}">${fin.porcentaje}%</p>
                           </div>
                           <p class="text-[9px] text-slate-400 mt-0.5 font-bold uppercase tracking-widest">Pendiente: ${formatCOP(fin.saldo)}</p>`
                    }
                </td>
                <td class="py-3 px-4">
                    <span class="px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider border ${cls}">${UI.sanitize(cli.estado)}</span>
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
                document.getElementById('cf-precio-total').value = c.precio_total;
                document.getElementById('cf-estado').value = c.estado;
                document.getElementById('cf-alergias').value = c.alergias || '';
                document.getElementById('cf-requerimientos').value = c.requerimientos || '';
                document.getElementById('cf-contacto').value = c.contacto_emergencia || '';

                let selEtiqueta = document.getElementById('cf-etiqueta');
                if (c.etiqueta && ![...selEtiqueta.options].some(o => o.value === c.etiqueta)) {
                    selEtiqueta.innerHTML += `<option value="${c.etiqueta}">${c.etiqueta}</option>`;
                }
                selEtiqueta.value = c.etiqueta || '';

                if (c.monto_devuelto !== undefined) {
                    document.getElementById('cf-monto-devuelto').value = c.monto_devuelto;
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

            this.onTipoPagoChange();
            this.calculateTotals();
        }
        UI.openModal('client-form-modal', 'client-form-bg', 'client-form-content');
    },

    closeFormModal() {
        UI.closeModal('client-form-modal', 'client-form-bg', 'client-form-content');
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
                document.getElementById('cf-abono-inicial').value = plan.deposito_requerido || 0;
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
                            selectFechas.innerHTML += `<option value="${text}" disabled class="text-slate-400">${text} (Finalizado)</option>`;
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

            trs.innerHTML = '';
            if (plan.proveedores_vinculados && plan.proveedores_vinculados.length > 0) {
                plan.proveedores_vinculados.forEach(pr => {
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
        }
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
                document.getElementById('cf-precio-total').value = (parseFloat(plan.precio_persona) * px).toFixed(0);
            }

            const tNStr = document.getElementById('cf-precio-total')?.value;
            const tN = Math.floor(Number(tNStr || 0));
            let tA = 0;

            if (formEsNuevo) {
                tA = Math.floor(Number(document.getElementById('cf-abono-inicial')?.value || 0));
            } else {
                tA = DataService.abonos.filter(a => a.cliente_id === document.getElementById('cf-id').value && a.estado_pago !== 'pending' && a.estado_pago !== 'refunded').reduce((s, a) => s + (Number(a.monto) || 0), 0);
            }

            const fin = calcularFinanzas(tA, tN);
            updateFinancialUI({ tarifa_total_negociada: tN, total_abonado: fin.abonado });

            const est = document.getElementById('cf-estado');
            if (est && !['en caja', 'devolución', 'reprogramado', 'realizadas', 'desistió'].includes(est.value)) {
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
            document.getElementById('cf-abono-inicial').value = 0;
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

        const IS_ADMIN = window.AuthModule.userProfile?.rol === 'administrador';

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
            
            let actionButtons = '';
            if (isFrozen) {
                actionButtons = '<span class="text-[9px] text-slate-500 font-black bg-slate-200/60 px-2.5 py-1.5 rounded-lg border border-slate-300 shadow-inner flex items-center"><i class="ph ph-lock-key mr-1.5 text-sm"></i> Congelado (48h)</span>';
            } else {
                actionButtons = `
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
        const IS_ADMIN = window.AuthModule.userProfile?.rol === 'administrador';
        const abono = DataService.abonos.find(a => a.id === aId);
        if (abono) {
            const hoursSinceCreated = (new Date() - new Date(abono.created_at)) / (1000 * 60 * 60);
            if (!IS_ADMIN && hoursSinceCreated > 48) {
                return UI.showToast("Acción denegada: Este registro financiero ha sido congelado por antigüedad.", "error");
            }
        }

        document.getElementById('aam-abono-id').value = aId;
        document.getElementById('aam-cliente-id').value = cId;
        document.getElementById('aam-action-type').value = 'delete';

        document.getElementById('aam-title').innerHTML = '<i class="ph ph-trash text-red-500 mr-2 text-2xl"></i> Eliminar Registro';
        document.getElementById('aam-edit-body').classList.add('hidden');
        document.getElementById('aam-delete-body').classList.remove('hidden');

        const btn = document.getElementById('aam-confirm-btn');
        btn.className = 'flex-1 px-4 py-3 rounded-xl font-black text-white bg-red-600 flex items-center justify-center hover:bg-red-700 hover:-translate-y-1 transition-all shadow-md';
        btn.innerHTML = '<i class="ph ph-trash mr-2 text-lg"></i> Sí, Eliminar';

        UI.openModal('abono-action-modal', 'aam-bg', 'aam-content');
    },

    promptEditAbono(aId, cId, monto, status) {
        if (!aId) return;

        // Doble validación de seguridad por si vulneran el DOM
        const IS_ADMIN = window.AuthModule.userProfile?.rol === 'administrador';
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

        document.getElementById('aam-monto').value = monto;
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
                const nM = parseFloat(document.getElementById('aam-monto').value);
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
        const val = parseFloat(document.getElementById('cf-abono-live-monto').value);
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
            await DataService.saveAbono({
                cliente_id: cId,
                monto: val,
                metodo: met,
                estado_pago: sts,
                usuario_email: window.AuthModule.currentUser?.email || 'Staff'
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
        const val = parseFloat(document.getElementById('qa-monto').value);
        const met = document.getElementById('qa-metodo').value;

        if (isNaN(val) || val <= 0) {
            return UI.showToast("Ingresa un monto válido.", "error");
        }

        // Check de sobrepago
        const tAbo = DataService.abonos.filter(a => a.cliente_id === cId && a.estado_pago !== 'pending' && a.estado_pago !== 'refunded').reduce((s, a) => s + (Number(a.monto) || 0), 0);
        const dr = Math.max((Number(cli.precio_total) || 0) - tAbo, 0);
        if (val > dr && dr > 0) {
            UI.showToast(`Atención: Estás ingresando un monto mayor a la deuda.`, "info");
        }

        const btn = document.getElementById('btn-quick-abono');
        const pT = btn.innerHTML;
        btn.innerHTML = '<i class="ph ph-spinner animate-spin"></i>';
        btn.disabled = true;

        try {
            // Para el abono rápido del panel, forzamos confirmed por UX
            await DataService.saveAbono({
                cliente_id: cId,
                monto: val,
                metodo: met,
                estado_pago: 'confirmed',
                usuario_email: window.AuthModule.currentUser?.email || 'Staff'
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
            const pTot = parseFloat(document.getElementById('cf-precio-total').value);

            if (!pId || isNaN(pTot) || pTot <= 0) {
                btn.disabled = false;
                btn.innerHTML = '<i class="ph ph-floppy-disk mr-2 text-xl"></i> Guardar y Formalizar';
                return UI.showToast("Debes seleccionar un plan y definir un precio válido.", "error");
            }

            const fId = document.getElementById('cf-id').value;
            const esNvo = !fId;
            const mPgo = document.getElementById('cf-tipo-pago').value;
            let ini = parseFloat(document.getElementById('cf-abono-inicial').value) || 0;

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
                montoDevuelto = parseFloat(inputEl ? inputEl.value : 0);
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

            const contactoEl = document.getElementById('cf-contacto');
            const etiquetaEl = document.getElementById('cf-etiqueta');

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
                pax: parseInt(document.getElementById('cf-pax').value) || 1,
                estado: estadoEl,
                precio_total: pTot,
                fecha_viaje: document.getElementById('cf-fecha-viaje')?.value || 'Fecha Abierta',
                alergias: document.getElementById('cf-alergias').value,
                requerimientos: document.getElementById('cf-requerimientos').value,
                contacto_emergencia: contactoEl ? contactoEl.value : '',
                etiqueta: etiquetaEl ? etiquetaEl.value : 'normal'
            };

            if (estadoEl === 'devolución') {
                obj.monto_devuelto = montoDevuelto;
            }

            if (!esNvo) obj.id = fId;
            if (esNvo) {
                obj.abono_acumulado = 0;
                obj.saldo_restante = pTot;
            }

            // 1. Guardar cliente en BD
            const res = await DataService.saveCliente(obj);

            // 2. Si es cliente nuevo y hay dinero de entrada, insertar abono obligatoriamente
            if (esNvo && ini > 0 && res) {
                let mF = document.getElementById('cf-abono-metodo').value || 'Ingreso Manual';
                if (mPgo === 'contado') {
                    mF = 'Pago de Contado (Vía ' + mF + ')';
                }

                await DataService.saveAbono({
                    cliente_id: res.id,
                    monto: ini,
                    metodo: mF,
                    estado_pago: 'confirmed',
                    usuario_email: window.AuthModule.currentUser?.email || 'Admin / Creador'
                });
            }

            // 3. Recalcular contabilidad estricta
            if (res) {
                await DataService.recalculateClientBalances(res.id);
            }

            this.populateFilters();
            // Ejecutar la cascada para refrescar la UI correctamente
            if (res && res.id) {
                // Ensure DataService is updated before refresh
                await DataService.loadAll(); 
                this.refreshUIAfterAbonoChange(res.id);
            } else {
                this.renderTable();
                // DashboardComponent se actualiza automáticamente vía Store
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
        const c = DataService.clientes.find(x => x.id === id);
        if (!c) return;

        const p = DataService.planes.find(x => x.id === c.plan_id);
        const pNom = p ? p.nombre : 'Plan Retirado del Sistema';
        const abs = DataService.abonos.filter(a => a.cliente_id === id);

        let h = '';
        if (abs.length === 0) {
            h = '<div class="p-6 text-center text-slate-400 uppercase tracking-widest font-black text-[10px]">La caja está en ceros para este cliente</div>';
        } else {
            abs.forEach(a => {
                let st = '';
                if (a.estado_pago === 'pending') st = '<span class="text-orange-500 bg-orange-50 px-1 rounded border border-orange-100">Pendiente</span>';
                else if (a.estado_pago === 'refunded') st = '<span class="text-red-500 bg-red-50 px-1 rounded border border-red-100">Reembolso</span>';
                else st = '<span class="text-green-600 bg-green-50 px-1 rounded border border-green-100">Ok</span>';

                h += `
                <div class="flex justify-between items-center text-sm py-3 border-b border-slate-100 hover:bg-slate-50 px-3 rounded-lg transition-colors">
                    <div>
                        <span class="font-black text-slate-800 text-base">${formatCOP(a.monto)}</span><br>
                        <span class="text-[10px] uppercase font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded shadow-sm">${a.metodo} - ${st}</span>
                    </div>
                    <div class="text-xs text-slate-400 text-right font-medium">
                        ${new Date(a.created_at).toLocaleDateString('es-CO')}<br>
                        <span class="text-[9px] truncate w-24 block opacity-70">${a.usuario_email || 'Staff'}</span>
                    </div>
                </div>`;
            });
        }

        const tAb = abs.filter(a => a.estado_pago !== 'pending' && a.estado_pago !== 'refunded').reduce((s, a) => s + (Number(a.monto) || 0), 0);
        const fn = calcularFinanzas(tAb, c.precio_total);

        // PARCHE DE SEGURIDAD (VACUNA XSS): Sanitizamos todas las variables del cliente antes de imprimirlas
        const safeNombre = UI.sanitize(c.nombre || '');
        const safeApellido = UI.sanitize(c.apellido || '');
        const safeDoc = UI.sanitize(c.documento || '');
        const safeTel = UI.sanitize(c.telefono || '');
        const safePlan = UI.sanitize(pNom);
        const safeEtiqueta = UI.sanitize(c.etiqueta || '');

        document.getElementById('cdm-body').innerHTML = `
            <div class="p-6 space-y-6">
                <div class="flex items-center space-x-4">
                    <div class="w-14 h-14 rounded-full bg-gradient-to-tr from-primary-600 to-primary-400 text-white flex items-center justify-center font-black text-2xl shadow-lg shadow-primary-500/30 uppercase">
                        ${safeNombre.charAt(0)}${safeApellido.charAt(0)}
                    </div>
                    <div>
                        <h2 class="text-xl font-black text-slate-800 tracking-tight">${safeNombre} ${safeApellido}</h2>
                        <p class="text-xs font-bold text-slate-400 uppercase tracking-wider">${safeDoc}</p>
                    </div>
                </div>
                
                <div class="bg-primary-50 border border-primary-100 p-5 rounded-2xl shadow-inner relative overflow-hidden">
                    <div class="absolute -right-4 -top-4 w-16 h-16 bg-white opacity-40 rounded-full"></div>
                    <p class="text-[10px] font-black text-primary-600 uppercase tracking-widest relative z-10">Plan Elegido</p>
                    <p class="text-xl font-black text-slate-800 mb-4 relative z-10">${safePlan} <span class="bg-white px-2 py-0.5 rounded-md shadow-sm ml-2 text-sm text-primary-600 border border-primary-100">x ${c.pax}</span></p>
                    
                    <div class="grid grid-cols-2 gap-4 border-t border-dashed border-primary-200 pt-4 relative z-10">
                        <div>
                            <p class="text-[10px] font-black text-slate-500 uppercase tracking-wider">Total Plan</p>
                            <p class="text-lg font-black text-slate-800">${formatCOP(c.precio_total)}</p>
                        </div>
                        <div class="text-right border-l border-primary-200 pl-4">
                            <p class="text-[10px] font-black text-slate-500 uppercase tracking-wider">Abonado</p>
                            <p class="text-lg font-black text-blue-600">${formatCOP(fn.abonado)}</p>
                        </div>
                        <div>
                            <p class="text-[10px] font-black text-slate-500 uppercase tracking-wider">Pendiente</p>
                            <p class="text-lg font-black ${fn.saldo <= 0 ? 'text-green-600' : 'text-orange-500'}">${formatCOP(fn.saldo)}</p>
                        </div>
                        <div class="text-right border-l border-primary-200 pl-4 flex flex-col justify-end">
                            <p class="text-[10px] font-black uppercase ${fn.saldo <= 0 ? 'text-green-500' : 'text-blue-500'} tracking-wider">% Pagado</p>
                            <p class="text-2xl font-black ${fn.saldo <= 0 ? 'text-green-600' : 'text-blue-600'} leading-none">${fn.porcentaje}%</p>
                        </div>
                        ${(c.estado || '').toLowerCase() === 'devolución' && c.monto_devuelto !== undefined ? `
                        <div class="col-span-2 mt-2 bg-rose-50 p-3 rounded-xl border border-rose-100 flex justify-between items-center">
                            <p class="text-xs font-black text-rose-700 uppercase tracking-widest flex items-center"><i class="ph ph-arrow-u-up-left mr-2"></i> Monto Reembolsado</p>
                            <p class="text-xl font-black text-rose-600">${formatCOP(c.monto_devuelto)}</p>
                        </div>
                        ` : ''}
                    </div>
                </div>
                
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div class="bg-slate-50 p-3 rounded-xl border border-slate-100 hover:shadow-sm transition-shadow">
                        <p class="font-bold text-slate-400 uppercase tracking-widest text-[9px] mb-1">WhatsApp de Contacto</p>
                        <a href="https://wa.me/57${safeTel.replace(/\D/g, '')}" target="_blank" class="font-bold text-green-600 flex items-center hover:underline text-sm truncate"><i class="ph ph-whatsapp-logo mr-1.5 text-lg"></i> ${safeTel}</a>
                    </div>
                    <div class="bg-slate-50 p-3 rounded-xl border border-slate-100 hover:shadow-sm transition-shadow">
                        <p class="font-bold text-slate-400 uppercase tracking-widest text-[9px] mb-1">Status Operativo</p>
                        <span class="block w-full font-bold text-slate-700 uppercase text-[10px] tracking-wider py-1">
                            ${c.estado ? c.estado : 'Sin Estado'}
                        </span>
                    </div>
                    <div class="bg-slate-50 p-3 rounded-xl border border-slate-100 hover:shadow-sm transition-shadow">
                        <p class="font-bold text-slate-400 uppercase tracking-widest text-[9px] mb-1">Etiqueta</p>
                        <select data-action="quick-etiqueta" data-cliente-id="${id}" class="w-full bg-transparent font-bold text-purple-700 outline-none cursor-pointer">
                            <option value="" ${!c.etiqueta ? 'selected' : ''}>-- Sin Etiqueta --</option>
                            <option value="Orgánico" ${c.etiqueta === 'Orgánico' ? 'selected' : ''}>Orgánico</option>
                            <option value="Ads" ${c.etiqueta === 'Ads' ? 'selected' : ''}>Ads</option>
                            <option value="Referido" ${c.etiqueta === 'Referido' ? 'selected' : ''}>Referido</option>
                            ${c.etiqueta && !['Orgánico', 'Ads', 'Referido', ''].includes(c.etiqueta) ? `<option value="${safeEtiqueta}" selected>✨ ${safeEtiqueta}</option>` : ''}
                            <option value="custom">Crear nueva...</option>
                        </select>
                    </div>
                </div>
                
                <div class="border border-slate-200 rounded-2xl bg-white shadow-sm overflow-hidden">
                    <div class="bg-slate-100 p-4 border-b border-slate-200 flex justify-between items-center">
                        <h4 class="font-black text-xs uppercase text-slate-700 tracking-widest flex items-center"><i class="ph ph-receipt mr-2 text-lg"></i> Flujo de Caja</h4>
                        <button onclick="document.getElementById('quick-abono-panel').classList.toggle('hidden')" class="bg-white border border-slate-200 text-slate-700 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider shadow-sm hover:bg-slate-50 hover:text-green-600 transition-colors flex items-center">
                            <i class="ph ph-plus mr-1"></i> Abono Rápido
                        </button>
                    </div>
                    
                    <div id="quick-abono-panel" class="hidden bg-slate-50/80 p-4 border-b border-slate-200 shadow-inner slide-up">
                        <div class="flex flex-col sm:flex-row gap-2">
                            <div class="relative flex-1">
                                <span class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-lg">$</span>
                                <input type="number" id="qa-monto" placeholder="Ej: 100000" min="1" class="w-full pl-8 py-2.5 border border-slate-300 rounded-xl text-sm font-black outline-none shadow-sm focus:ring-2 focus:ring-primary-500 transition-all text-slate-800">
                            </div>
                            <select id="qa-metodo" class="border border-slate-300 rounded-xl px-3 py-2.5 text-sm font-semibold outline-none shadow-sm text-slate-700">
                                <option value="Transferencia">Transferencia</option>
                                <option value="Efectivo">Efectivo</option>
                                <option value="Nequi/Daviplata">Nequi/Daviplata</option>
                            </select>
                            <button type="button" data-action="quick-abono" data-cliente-id="${id}" id="btn-quick-abono" class="bg-slate-900 text-white font-bold px-4 py-2.5 rounded-xl shadow-md shadow-slate-900/20 text-sm hover:bg-slate-800 transition-colors flex items-center justify-center min-w-[100px]">
                                Guardar
                            </button>
                        </div>
                    </div>
                    
                    <div class="p-3">
                        ${h}
                    </div>
                </div>

                <div class="border border-slate-200 rounded-2xl bg-white shadow-sm overflow-hidden">
                    <div class="bg-slate-100 p-4 border-b border-slate-200">
                        <h4 class="font-black text-xs uppercase text-slate-700 tracking-widest flex items-center"><i class="ph ph-clock-counter-clockwise mr-2 text-lg"></i> Historial de Cambios</h4>
                    </div>
                    <div class="p-3 max-h-[300px] overflow-y-auto custom-scrollbar">
                        ${(() => {
                            const historial = (DataService.historial_reservas || []).filter(item => item.cliente_id === id);
                            if (historial.length === 0) {
                                return '<div class="p-6 text-center text-slate-400 uppercase tracking-widest font-black text-[10px]">No hay historial de cambios registrado</div>';
                            }
                            let htmlH = '';
                            historial.forEach(item => {
                                htmlH += `
                                <div class="py-3 border-b border-slate-100 hover:bg-slate-50 px-3 rounded-lg transition-colors">
                                    <div class="flex justify-between items-center mb-1">
                                        <span class="text-xs font-black text-slate-800 uppercase tracking-wider">${UI.sanitize(item.campo)}</span>
                                        <span class="text-[9px] text-slate-400 font-bold">${new Date(item.created_at).toLocaleString('es-CO')}</span>
                                    </div>
                                    <div class="text-[11px] text-slate-600 flex items-center flex-wrap gap-1 mt-2">
                                        <span class="bg-red-50 text-red-600 px-1.5 py-0.5 rounded border border-red-100 line-through truncate max-w-[150px]" title="${UI.sanitize(item.valor_anterior)}">${UI.sanitize(item.valor_anterior)}</span>
                                        <i class="ph ph-arrow-right text-slate-400"></i>
                                        <span class="bg-green-50 text-green-700 px-1.5 py-0.5 rounded border border-green-100 font-bold truncate max-w-[150px]" title="${UI.sanitize(item.valor_nuevo)}">${UI.sanitize(item.valor_nuevo)}</span>
                                    </div>
                                    <p class="text-[9px] text-slate-400 mt-2 italic">Por: ${UI.sanitize(item.usuario_email)}</p>
                                </div>`;
                            });
                            return htmlH;
                        })()}
                    </div>
                </div>
            </div>`;

        const btnEdit = document.getElementById('btn-edit-client-modal');
        if(btnEdit) {
            btnEdit.removeAttribute('onclick');
            btnEdit.setAttribute('data-action', 'edit-client-master');
            btnEdit.setAttribute('data-cliente-id', id);
        }
        document.getElementById('btn-delete-client-modal').setAttribute('onclick', `promptGlobalDelete('${id}', 'cliente', '${c.nombre.replace(/'/g, "\\'")} ${c.apellido.replace(/'/g, "\\'")}')`);
        UI.openModal('client-detail-modal', 'cdm-bg', 'cdm-content');
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
        const rows = document.querySelectorAll('.client-row, .client-card');
        const visibleRows = [...rows].filter(r => {
            if (r.style.display === 'none') return false;
            const panel = r.closest('div[id^="clients-panel-"]');
            if (panel && panel.classList.contains('hidden')) return false;
            return true;
        });

        if (visibleRows.length === 0) {
            return UI.showToast("No hay registros visibles para exportar. Aplica filtros o verifica los datos.", "error");
        }

        // Sanitizador CSV: Escapa comillas dobles, elimina saltos de línea, envuelve en comillas si contiene coma
        const csvSafe = (val) => {
            if (val === null || val === undefined) return '';
            let s = String(val).replace(/\r?\n/g, ' ').replace(/\t/g, ' ').trim();
            s = s.replace(/"/g, '""'); // Escape de comillas dobles
            if (s.includes(',') || s.includes('"') || s.includes(';')) {
                s = `"${s}"`;
            }
            return s;
        };

        // Cabeceras estrictas
        const headers = ['Nombre', 'Celular', 'Plan Elegido', 'Fecha de Salida', 'Valor Total', 'Saldo Pendiente'];
        const csvRows = [headers.join(',')];

        visibleRows.forEach(row => {
            const clienteId = row.getAttribute('data-id');
            const cli = DataService.clientes.find(c => c.id === clienteId);
            if (!cli) return;

            const plan = DataService.planes.find(p => p.id === cli.plan_id);
            const pNom = plan ? plan.nombre : 'Sin Plan';

            // Cálculo financiero directo desde memoria (sin reconsultar BD)
            const totalAbo = DataService.abonos
                .filter(a => a.cliente_id === cli.id && a.estado_pago !== 'pending' && a.estado_pago !== 'refunded')
                .reduce((s, a) => s + (Number(a.monto) || 0), 0);
            const fin = calcularFinanzas(totalAbo, cli.precio_total);

            csvRows.push([
                csvSafe(`${cli.nombre || ''} ${cli.apellido || ''}`),
                csvSafe(cli.telefono || ''),
                csvSafe(pNom),
                csvSafe(cli.fecha_viaje || 'Sin Fecha'),
                csvSafe(formatCOP(cli.precio_total || 0)),
                csvSafe(formatCOP(fin.saldo))
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

        UI.showToast(`${visibleRows.length} reservas exportadas exitosamente.`, "success");
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


