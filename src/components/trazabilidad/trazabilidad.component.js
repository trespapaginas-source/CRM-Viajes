import { supabaseClient, DataService } from '../../../js/services/supabase.service.js';
import { UI } from '../../../js/utils/ui.utils.js';
import { formatCOP } from '../../../js/utils/format.utils.js';
import { ClientsComponent } from '../clients/clients.component.js';

export const TrazabilidadComponent = {
    eventsBound: false,
    currentTab: 'logs',
    limit: 50,
    offset: 0,
    logsCache: [],
    operadores: new Set(),

    init() {
        this.bindEvents();
    },

    bindEvents() {
        if (this.eventsBound) return;

        // Delegación de eventos en el panel de Trazabilidad
        document.body.addEventListener('click', async (e) => {
            const target = e.target.closest('[data-action]');
            if (!target) return;

            const action = target.dataset.action;

            if (action === 'switch-trazabilidad-tab') {
                this.switchTab(target.dataset.tabId);
            } else if (action === 'trazabilidad-open-client') {
                const cId = target.dataset.clienteId;
                if (cId) {
                    const client = DataService.clientes.find(x => x.id === cId);
                    if (!client) {
                        try {
                            const { data, error } = await supabaseClient.from('clientes').select('*').eq('id', cId).single();
                            if (error) throw error;
                            if (data) {
                                // Add to local array so clients component can find it
                                if (!DataService.clientes.some(x => x.id === cId)) {
                                    DataService.clientes.push(data);
                                }
                                ClientsComponent.openDetailModal(cId);
                            } else {
                                UI.showToast("No se encontró el registro del cliente.", "error");
                            }
                        } catch (err) {
                            console.error("Error al buscar cliente en Supabase:", err);
                            UI.showToast("Error de conexión al cargar datos del cliente.", "error");
                        }
                    } else {
                        ClientsComponent.openDetailModal(cId);
                    }
                }
            } else if (action === 'restore-record' && this.isInTrazabilidadView()) {
                // Capturar restaurar de la tabla de la papelera en trazabilidad
                e.stopPropagation();
                await this.restoreRecord(target.dataset.table, target.dataset.id);
            } else if (action === 'hard-delete-record' && this.isInTrazabilidadView()) {
                // Capturar destrucción de la tabla de la papelera en trazabilidad
                e.stopPropagation();
                await this.hardDeleteRecord(target.dataset.table, target.dataset.id);
            } else if (action === 'aprobacion-approve' && this.isInTrazabilidadView()) {
                e.stopPropagation();
                await this.resolverAprobacion(target.dataset.id, 'APROBADO');
            } else if (action === 'aprobacion-reject' && this.isInTrazabilidadView()) {
                e.stopPropagation();
                await this.resolverAprobacion(target.dataset.id, 'RECHAZADO');
            }
        });

        // Filtrado en tiempo real
        const searchInput = document.getElementById('log-filter-search');
        if (searchInput) {
            searchInput.addEventListener('input', () => this.filterLogs());
        }

        const tipoSelect = document.getElementById('log-filter-tipo');
        if (tipoSelect) {
            tipoSelect.addEventListener('change', () => this.filterLogs());
        }

        const userSelect = document.getElementById('log-filter-usuario');
        if (userSelect) {
            userSelect.addEventListener('change', () => this.filterLogs());
        }

        const btnClear = document.getElementById('btn-trazabilidad-clear');
        if (btnClear) {
            btnClear.addEventListener('click', () => this.clearFilters());
        }

        const btnLoadMore = document.getElementById('btn-trazabilidad-load-more');
        if (btnLoadMore) {
            btnLoadMore.addEventListener('click', () => this.loadMoreLogs());
        }

        this.eventsBound = true;
    },

    isInTrazabilidadView() {
        return localStorage.getItem('vivetravel_active_view') === 'trazabilidad';
    },

    switchTab(tabId) {
        this.currentTab = tabId;
        
        document.querySelectorAll('.trazabilidad-sub-tab').forEach(btn => {
            btn.classList.remove('text-slate-800', 'bg-white', 'shadow-sm', 'font-black');
            btn.classList.add('text-slate-500', 'hover:text-slate-800', 'hover:bg-slate-50/50', 'font-bold');
        });

        const activeBtn = document.getElementById(`trazabilidad-tab-${tabId}`);
        if (activeBtn) {
            activeBtn.classList.remove('text-slate-500', 'hover:text-slate-800', 'hover:bg-slate-50/50', 'font-bold');
            activeBtn.classList.add('text-slate-800', 'bg-white', 'shadow-sm', 'font-black');
        }

        if (tabId === 'logs') {
            document.getElementById('trazabilidad-panel-logs').classList.remove('hidden');
            document.getElementById('trazabilidad-panel-papelera').classList.add('hidden');
            document.getElementById('trazabilidad-panel-aprobaciones')?.classList.add('hidden');
            this.loadLogs();
        } else if (tabId === 'papelera') {
            document.getElementById('trazabilidad-panel-logs').classList.add('hidden');
            document.getElementById('trazabilidad-panel-papelera').classList.remove('hidden');
            document.getElementById('trazabilidad-panel-aprobaciones')?.classList.add('hidden');
            this.loadDeletedRecords();
        } else if (tabId === 'aprobaciones') {
            document.getElementById('trazabilidad-panel-logs').classList.add('hidden');
            document.getElementById('trazabilidad-panel-papelera').classList.add('hidden');
            document.getElementById('trazabilidad-panel-aprobaciones')?.classList.remove('hidden');
            this.loadAprobaciones();
        }
    },

    async loadLogs(append = false) {
        if (!append) {
            this.offset = 0;
            this.logsCache = [];
            this.renderLoader();
        }

        try {
            // Cargar totalizadores para KPIs (solo la primera vez o en recarga completa)
            if (!append) {
                await this.loadKPIs();
            }

            // Consulta principal a Supabase con paginación
            const { data: logs, error } = await supabaseClient
                .from('historial_reservas')
                .select('*')
                .order('created_at', { ascending: false })
                .range(this.offset, this.offset + this.limit - 1);

            if (error) throw error;

            if (append) {
                this.logsCache = [...this.logsCache, ...logs];
            } else {
                this.logsCache = logs;
            }

            this.offset += logs.length;

            // Extraer y popular operadores únicos
            logs.forEach(item => {
                if (item.usuario_email) this.operadores.add(item.usuario_email);
            });
            this.populateOperatorsFilter();

            this.renderLogs();

            // Mostrar/ocultar paginador
            const btnMore = document.getElementById('trazabilidad-pagination');
            if (btnMore) {
                if (logs.length === this.limit) {
                    btnMore.classList.remove('hidden');
                } else {
                    btnMore.classList.add('hidden');
                }
            }

        } catch (e) {
            console.error("Error cargando logs globales:", e);
            const tbody = document.getElementById('trazabilidad-logs-tbody');
            if (tbody) {
                tbody.innerHTML = `<tr><td colspan="6" class="py-8 text-center text-red-500 font-bold">Error al comunicar con Supabase. Verifica tu conexión.</td></tr>`;
            }
        }
    },

    async loadMoreLogs() {
        await this.loadLogs(true);
    },

    async loadKPIs() {
        try {
            const today = new Date();
            today.setHours(0,0,0,0);
            const todayISO = today.toISOString();

            // 1. Logs de Hoy
            const { count: countHoy } = await supabaseClient
                .from('historial_reservas')
                .select('*', { count: 'exact', head: true })
                .gte('created_at', todayISO);

            // 2. Alertas de Seguridad
            const { count: countAlertas } = await supabaseClient
                .from('historial_reservas')
                .select('*', { count: 'exact', head: true })
                .eq('tipo_evento', 'SEGURIDAD');

            // Actualizar KPIs en el DOM
            document.getElementById('kpi-logs-hoy').innerText = countHoy || 0;
            document.getElementById('kpi-logs-alertas').innerText = countAlertas || 0;

            const secIcon = document.getElementById('kpi-logs-alertas-icon');
            if (secIcon) {
                if (countAlertas > 0) {
                    secIcon.className = 'w-8 h-8 rounded-lg bg-rose-100 text-rose-600 flex items-center justify-center border border-rose-200 shrink-0';
                } else {
                    secIcon.className = 'w-8 h-8 rounded-lg bg-slate-50 text-slate-400 flex items-center justify-center border border-slate-100 shrink-0';
                }
            }

            // 3. Conteo de Papelera (Registros Soft-Deleted)
            // Hacemos una carga paralela rápida de los counts
            const counts = await Promise.all([
                supabaseClient.from('clientes').select('id', { count: 'exact', head: true }).not('deleted_at', 'is', null),
                supabaseClient.from('abonos').select('id', { count: 'exact', head: true }).not('deleted_at', 'is', null),
                supabaseClient.from('proveedores').select('id', { count: 'exact', head: true }).not('deleted_at', 'is', null),
                supabaseClient.from('planes').select('id', { count: 'exact', head: true }).not('deleted_at', 'is', null),
                supabaseClient.from('gastos_corporativos').select('id', { count: 'exact', head: true }).not('deleted_at', 'is', null),
                supabaseClient.from('socios_movimientos').select('id', { count: 'exact', head: true }).not('deleted_at', 'is', null),
                supabaseClient.from('gastos_salidas').select('id', { count: 'exact', head: true }).not('deleted_at', 'is', null)
            ]);

            const totalDeleted = counts.reduce((sum, res) => sum + (res.count || 0), 0);
            document.getElementById('kpi-logs-papelera').innerText = totalDeleted;

        } catch (e) {
            console.error("Error consultando totalizadores:", e);
        }
    },

    renderLoader() {
        const tbody = document.getElementById('trazabilidad-logs-tbody');
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="6" class="py-16 text-center"><i class="ph ph-circle-notch animate-spin text-4xl text-indigo-500"></i><p class="text-[10px] text-slate-400 mt-3 font-black uppercase tracking-widest">Sincronizando logs de auditoría...</p></td></tr>`;
        }
    },

    populateOperatorsFilter() {
        const select = document.getElementById('log-filter-usuario');
        if (!select) return;

        const currentValue = select.value;
        select.innerHTML = '<option value="">Todos los Operadores</option>';
        this.operadores.forEach(op => {
            select.innerHTML += `<option value="${UI.sanitize(op)}">${UI.sanitize(op)}</option>`;
        });
        select.value = currentValue;
    },

    clearFilters() {
        document.getElementById('log-filter-search').value = '';
        document.getElementById('log-filter-tipo').value = '';
        document.getElementById('log-filter-usuario').value = '';
        this.loadLogs();
    },

    filterLogs() {
        this.renderLogs();
    },

    renderLogs() {
        const tbody = document.getElementById('trazabilidad-logs-tbody');
        const emptyState = document.getElementById('trazabilidad-logs-empty');
        if (!tbody) return;

        const searchTerm = (document.getElementById('log-filter-search')?.value || '').toLowerCase();
        const filterTipo = document.getElementById('log-filter-tipo')?.value || '';
        const filterUser = document.getElementById('log-filter-usuario')?.value || '';

        // Filtrar localmente en el cache paginado
        let filtered = this.logsCache;

        if (filterTipo) {
            filtered = filtered.filter(item => item.tipo_evento === filterTipo);
        }

        if (filterUser) {
            filtered = filtered.filter(item => item.usuario_email === filterUser);
        }

        if (searchTerm) {
            filtered = filtered.filter(item =>
                (item.campo?.toLowerCase() || '').includes(searchTerm) ||
                (item.valor_anterior?.toLowerCase() || '').includes(searchTerm) ||
                (item.valor_new?.toLowerCase() || '').includes(searchTerm) ||
                (item.valor_nuevo?.toLowerCase() || '').includes(searchTerm) ||
                (item.usuario_email?.toLowerCase() || '').includes(searchTerm)
            );
        }

        if (filtered.length === 0) {
            tbody.innerHTML = '';
            if (emptyState) emptyState.classList.remove('hidden');
            return;
        }

        if (emptyState) emptyState.classList.add('hidden');

        let html = '';
        filtered.forEach(log => {
            const dateObj = new Date(log.created_at);
            const dateStr = dateObj.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' }) + ' ' + dateObj.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });

            let badgeClass = 'bg-slate-50 text-slate-600 border border-slate-100 px-2.5 py-0.5 rounded-full text-[9px] font-medium inline-flex items-center gap-1.5';
            if (log.tipo_evento === 'CREACION') {
                badgeClass = 'bg-emerald-50 text-emerald-700 border border-emerald-100/50 px-2.5 py-0.5 rounded-full text-[9px] font-medium inline-flex items-center gap-1.5';
            } else if (log.tipo_evento === 'SEGURIDAD') {
                badgeClass = 'bg-rose-50 text-rose-700 border border-rose-100/50 px-2.5 py-0.5 rounded-full text-[9px] font-medium inline-flex items-center gap-1.5 animate-pulse';
            } else if (log.tipo_evento === 'ELIMINACION') {
                badgeClass = 'bg-orange-50 text-orange-700 border border-orange-100/50 px-2.5 py-0.5 rounded-full text-[9px] font-medium inline-flex items-center gap-1.5';
            } else if (log.tipo_evento === 'SISTEMA') {
                badgeClass = 'bg-purple-50 text-purple-700 border border-purple-100/50 px-2.5 py-0.5 rounded-full text-[9px] font-medium inline-flex items-center gap-1.5';
            } else {
                badgeClass = 'bg-sky-50 text-sky-700 border border-sky-100/50 px-2.5 py-0.5 rounded-full text-[9px] font-medium inline-flex items-center gap-1.5';
            }

            const dotColor = log.tipo_evento === 'CREACION' ? 'bg-emerald-500' :
                             log.tipo_evento === 'SEGURIDAD' ? 'bg-rose-600' :
                             log.tipo_evento === 'ELIMINACION' ? 'bg-orange-500' :
                             log.tipo_evento === 'SISTEMA' ? 'bg-purple-500' : 'bg-sky-500';

            const userEmail = log.usuario_email || 'Staff';

            // Armar Diff visual
            let diffHtml = '';
            const valAnt = log.valor_anterior || '';
            const valNue = log.valor_nuevo || '';

            if (valAnt === 'N/A' || valAnt === '' || valAnt === 'null') {
                diffHtml = `<span class="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded border border-emerald-100/50 font-mono text-[10px] font-medium max-w-xs truncate" title="${UI.sanitize(valNue)}"><i class="ph ph-plus-circle text-xs text-emerald-500"></i> ${UI.sanitize(valNue)}</span>`;
            } else {
                diffHtml = `
                    <div class="flex items-center gap-1.5 flex-wrap font-mono text-[10px]">
                        <span class="inline-flex bg-rose-50 text-rose-600 px-2 py-0.5 rounded border border-rose-100/50 line-through truncate max-w-[150px]" title="${UI.sanitize(valAnt)}">${UI.sanitize(valAnt)}</span>
                        <i class="ph ph-caret-right text-slate-400 text-xs"></i>
                        <span class="inline-flex bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded border border-emerald-100/50 font-semibold truncate max-w-[150px]" title="${UI.sanitize(valNue)}">${UI.sanitize(valNue)}</span>
                    </div>
                `;
            }

            // Si es alerta de seguridad y tiene abonos o detalles duplicados, pintarlo llamativo
            const isSecurity = log.tipo_evento === 'SEGURIDAD';
            const trClass = isSecurity ? 'bg-rose-50/20 border-l-2 border-rose-500 hover:bg-rose-50/40' : 'hover:bg-slate-50/70 border-b border-slate-100';

            // Acción rápida: si tiene cliente_id, permitir ir a verlo
            const actionButton = log.cliente_id
                ? `<button data-action="trazabilidad-open-client" data-cliente-id="${log.cliente_id}" class="inline-flex items-center gap-1.5 text-[10px] bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 border border-slate-200 rounded-lg px-2.5 py-1 font-medium transition-all cursor-pointer"><i class="ph ph-user-circle text-sm opacity-80"></i> Ver Cliente</button>`
                : `<span class="text-[9px] text-slate-400 font-medium italic">N/A (General)</span>`;

            html += `
                <tr class="${trClass} transition-colors">
                    <td class="py-3 px-4 whitespace-nowrap text-xs text-slate-500 font-medium">${dateStr}</td>
                    <td class="py-3 px-4 whitespace-nowrap">
                        <span class="inline-flex items-center gap-1.5 bg-slate-50 text-slate-600 px-2 py-0.5 rounded-full text-[10px] font-medium border border-slate-100">
                            <i class="ph ph-user text-[11px] opacity-70"></i>
                            ${UI.sanitize(userEmail)}
                        </span>
                    </td>
                    <td class="py-3 px-4 whitespace-nowrap">
                        <span class="${badgeClass}">
                            <span class="w-1.5 h-1.5 rounded-full ${dotColor}"></span>
                            ${log.tipo_evento || 'MODIFICACION'}
                        </span>
                    </td>
                    <td class="py-3 px-4 whitespace-nowrap text-xs text-slate-700 font-semibold">${UI.sanitize(log.campo)}</td>
                    <td class="py-3 px-4">${diffHtml}</td>
                    <td class="py-3 px-4 text-center whitespace-nowrap">${actionButton}</td>
                </tr>
            `;
        });
        tbody.innerHTML = html;
    },

    // ── GESTIÓN DE LA PAPELERA INTEGRADA ───────────────────────────────────
    async loadDeletedRecords() {
        const tbody = document.getElementById('trazabilidad-papelera-tbody');
        const emptyState = document.getElementById('trazabilidad-papelera-empty');
        if (!tbody) return;

        tbody.innerHTML = `<tr><td colspan="6" class="py-16 text-center"><i class="ph ph-circle-notch animate-spin text-4xl text-indigo-500"></i><p class="text-[10px] text-slate-400 mt-3 font-black uppercase tracking-widest">Buscando registros en la papelera...</p></td></tr>`;

        try {
            const [clientes, abonos, proveedores, planes, gastosCorp, movimientos, gastosSalidas] = await Promise.all([
                supabaseClient.from('clientes').select('id, nombre, apellido, deleted_at, deleted_by, motivo_eliminacion').not('deleted_at', 'is', null),
                supabaseClient.from('abonos').select('id, monto, metodo, cliente_id, deleted_at, deleted_by, motivo_eliminacion').not('deleted_at', 'is', null),
                supabaseClient.from('proveedores').select('id, nombre, deleted_at, deleted_by, motivo_eliminacion').not('deleted_at', 'is', null),
                supabaseClient.from('planes').select('id, nombre, deleted_at, deleted_by, motivo_eliminacion').not('deleted_at', 'is', null),
                supabaseClient.from('gastos_corporativos').select('id, concepto, monto, deleted_at, deleted_by, motivo_eliminacion').not('deleted_at', 'is', null),
                supabaseClient.from('socios_movimientos').select('id, concepto, monto, tipo, socio_email, deleted_at, deleted_by, motivo_eliminacion').not('deleted_at', 'is', null),
                supabaseClient.from('gastos_salidas').select('id, concepto, valor, deleted_at, deleted_by, motivo_eliminacion').not('deleted_at', 'is', null)
            ]);

            const allDeleted = [];

            if (clientes.data) clientes.data.forEach(x => allDeleted.push({ table: 'clientes', id: x.id, desc: `Reserva: ${x.nombre} ${x.apellido}`, date: x.deleted_at, by: x.deleted_by, motivo: x.motivo_eliminacion }));
            if (abonos.data) abonos.data.forEach(x => allDeleted.push({ table: 'abonos', id: x.id, desc: `Abono de ${formatCOP(x.monto)} por ${x.metodo}`, date: x.deleted_at, by: x.deleted_by, motivo: x.motivo_eliminacion }));
            if (proveedores.data) proveedores.data.forEach(x => allDeleted.push({ table: 'proveedores', id: x.id, desc: `Proveedor: ${x.nombre}`, date: x.deleted_at, by: x.deleted_by, motivo: x.motivo_eliminacion }));
            if (planes.data) planes.data.forEach(x => allDeleted.push({ table: 'planes', id: x.id, desc: `Plan: ${x.nombre}`, date: x.deleted_at, by: x.deleted_by, motivo: x.motivo_eliminacion }));
            if (gastosCorp.data) gastosCorp.data.forEach(x => allDeleted.push({ table: 'gastos_corporativos', id: x.id, desc: `Gasto Corporativo: ${x.concepto} (${formatCOP(x.monto)})`, date: x.deleted_at, by: x.deleted_by, motivo: x.motivo_eliminacion }));
            if (movimientos.data) movimientos.data.forEach(x => allDeleted.push({ table: 'socios_movimientos', id: x.id, desc: `${x.tipo === 'retiro' ? 'Retiro' : 'Corte'} de Socio: ${x.concepto} (${formatCOP(x.monto)}) [${x.socio_email}]`, date: x.deleted_at, by: x.deleted_by, motivo: x.motivo_eliminacion }));
            if (gastosSalidas.data) gastosSalidas.data.forEach(x => allDeleted.push({ table: 'gastos_salidas', id: x.id, desc: `Gasto Operativo: ${x.concepto} (${formatCOP(x.valor)})`, date: x.deleted_at, by: x.deleted_by, motivo: x.motivo_eliminacion }));

            allDeleted.sort((a, b) => new Date(b.date) - new Date(a.date));

            if (allDeleted.length === 0) {
                tbody.innerHTML = '';
                if (emptyState) emptyState.classList.remove('hidden');
                return;
            }

            if (emptyState) emptyState.classList.add('hidden');

            let html = '';
            allDeleted.forEach(r => {
                const dateObj = new Date(r.date);
                const dateStr = dateObj.toLocaleDateString('es-CO') + ' ' + dateObj.toLocaleTimeString('es-CO', {hour: '2-digit', minute:'2-digit'});
                
                html += `
                    <tr class="hover:bg-slate-50/70 border-b border-slate-100 transition-all">
                        <td class="py-3 px-4 whitespace-nowrap text-xs text-slate-500 font-medium">${dateStr}</td>
                        <td class="py-3 px-4 whitespace-nowrap">
                            <span class="inline-flex items-center gap-1.5 bg-slate-50 text-slate-600 px-2 py-0.5 rounded-full text-[10px] font-medium border border-slate-100">
                                <i class="ph ph-user text-[11px] opacity-70"></i>
                                ${UI.sanitize(r.by || 'Desconocido')}
                            </span>
                        </td>
                        <td class="py-3 px-4 whitespace-nowrap">
                            <span class="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full text-[9px] font-medium border border-indigo-100/50">${r.table}</span>
                        </td>
                        <td class="py-3 px-4 text-xs text-slate-600 max-w-xs truncate" title="${UI.sanitize(r.desc)}">${UI.sanitize(r.desc)}</td>
                        <td class="py-3 px-4 text-xs text-slate-500 max-w-xs truncate italic" title="${UI.sanitize(r.motivo || 'Sin motivo especificado')}">${UI.sanitize(r.motivo || 'Sin motivo')}</td>
                        <td class="py-3 px-4 whitespace-nowrap text-right">
                            <button data-action="restore-record" data-table="${r.table}" data-id="${r.id}" class="inline-flex items-center gap-1.5 text-emerald-700 bg-emerald-50 hover:bg-emerald-100/60 px-2.5 py-1 rounded-lg border border-emerald-100/50 text-[10px] font-medium transition-all cursor-pointer mr-1"><i class="ph ph-arrow-counter-clockwise"></i> Restaurar</button>
                            <button data-action="hard-delete-record" data-table="${r.table}" data-id="${r.id}" class="inline-flex items-center gap-1.5 text-rose-700 bg-rose-50 hover:bg-rose-100/60 px-2.5 py-1 rounded-lg border border-rose-100/50 text-[10px] font-medium transition-all cursor-pointer"><i class="ph ph-trash"></i> Destruir</button>
                        </td>
                    </tr>
                `;
            });
            tbody.innerHTML = html;

        } catch (e) {
            console.error("Error cargando papelera integrada:", e);
            tbody.innerHTML = `<tr><td colspan="6" class="py-10 text-center text-red-500 font-bold">Error cargando papelera</td></tr>`;
        }
    },

    async restoreRecord(table, id) {
        if (window.AuthModule?.userProfile?.rol !== 'super_administrador') {
            window.UI.showToast("Acción denegada: Tu cuenta no tiene permisos para restaurar registros.", "error");
            return;
        }
        if (!confirm("¿Deseas restaurar este registro y devolverlo al sistema?")) return;
        try {
            const { error } = await supabaseClient.from(table).update({ deleted_at: null, deleted_by: null }).eq('id', id);
            if (error) throw error;
            
            const logId = table === 'clientes' ? id : null;
            await DataService.registrarHistorial(
                logId,
                'Registro Restaurado de Papelera',
                `Tabla: ${table} | ID: ${id}`,
                'Restaurado con éxito',
                'SISTEMA'
            );

            window.UI.showToast("Registro restaurado con éxito.", "success");
            await this.loadDeletedRecords();
            await this.loadKPIs(); // Recargar counts de logs y papelera
            await DataService.loadAll();
            
            // Recargar partners si corresponde
            if (window.PartnersComponent) {
                if (table === 'gastos_corporativos') await window.PartnersComponent.loadCorporateExpenses();
                if (table === 'socios_movimientos') await window.PartnersComponent.loadMovements();
            }
        } catch (e) {
            console.error(e);
            window.UI.showToast("Error al restaurar.", "error");
        }
    },

    async hardDeleteRecord(table, id) {
        if (window.AuthModule?.userProfile?.rol !== 'super_administrador') {
            window.UI.showToast("Acción denegada: Tu cuenta no tiene permisos para destruir registros.", "error");
            return;
        }
        if (!confirm("⚠️ ADVERTENCIA: Esta acción destruirá el registro de forma permanente en la base de datos y NO se puede deshacer. ¿Continuar?")) return;
        try {
            const logId = table === 'clientes' ? id : null;
            await DataService.registrarHistorial(
                logId,
                'Registro Destruido Permanentemente (Hard Delete)',
                `Tabla: ${table} | ID: ${id}`,
                'Destruido físicamente de la base de datos',
                'ELIMINACION'
            );
            const { error } = await supabaseClient.from(table).delete().eq('id', id);
            if (error) throw error;
            window.UI.showToast("Registro destruido permanentemente.", "success");
            await this.loadDeletedRecords();
            await this.loadKPIs(); // Recargar counts de logs y papelera
        } catch (e) {
            console.error(e);
            window.UI.showToast("Error al destruir.", "error");
        }
    },

    async loadAprobaciones() {
        const tbody = document.getElementById('trazabilidad-aprobaciones-tbody');
        const emptyState = document.getElementById('trazabilidad-aprobaciones-empty');
        if (!tbody) return;

        tbody.innerHTML = `<tr><td colspan="8" class="py-16 text-center"><i class="ph ph-circle-notch animate-spin text-4xl text-indigo-500"></i><p class="text-[10px] text-slate-400 mt-3 font-black uppercase tracking-widest">Cargando solicitudes de aprobación...</p></td></tr>`;

        try {
            const data = await DataService.loadSolicitudesPendientes();

            if (data.length === 0) {
                tbody.innerHTML = '';
                if (emptyState) emptyState.classList.remove('hidden');
                return;
            }

            if (emptyState) emptyState.classList.add('hidden');

            let html = '';
            data.forEach(r => {
                const dateObj = new Date(r.created_at);
                const dateStr = dateObj.toLocaleDateString('es-CO') + ' ' + dateObj.toLocaleTimeString('es-CO', {hour: '2-digit', minute:'2-digit'});
                const provName = r.proveedores?.nombre || r.proveedores?.razon_social || 'Proveedor Desconocido';
                
                const badgeClass = r.tipo_operacion === 'ELIMINACION' 
                    ? 'bg-rose-50 text-rose-700 border border-rose-100/50 px-2 py-0.5 rounded-full text-[9px] font-bold'
                    : 'bg-amber-50 text-amber-700 border border-amber-100/50 px-2 py-0.5 rounded-full text-[9px] font-bold';

                const diffsView = this.renderDiff(r.datos_anteriores, r.datos_nuevos, r.tipo_operacion);
                const impactoView = this.getImpactoProveedor(r.proveedor_id);

                html += `
                    <tr class="hover:bg-slate-50/70 border-b border-slate-100 transition-all">
                        <td class="py-3.5 px-6 whitespace-nowrap text-xs text-slate-500 font-medium">${dateStr}</td>
                        <td class="py-3.5 px-6 whitespace-nowrap">
                            <span class="inline-flex items-center gap-1.5 bg-slate-50 text-slate-600 px-2 py-0.5 rounded-full text-[10px] font-medium border border-slate-100">
                                <i class="ph ph-user text-[11px] opacity-70"></i>
                                ${UI.sanitize(r.solicitante_email)}
                            </span>
                        </td>
                        <td class="py-3.5 px-6 whitespace-nowrap text-xs text-slate-800 font-bold">${UI.sanitize(provName)}</td>
                        <td class="py-3.5 px-6 whitespace-nowrap">
                            <span class="${badgeClass}">${r.tipo_operacion}</span>
                        </td>
                        <td class="py-3.5 px-6 text-xs text-slate-600 max-w-xs break-words font-medium" title="${UI.sanitize(r.motivo)}">${UI.sanitize(r.motivo)}</td>
                        <td class="py-3.5 px-6 text-xs text-slate-700 font-medium">${diffsView}</td>
                        <td class="py-3.5 px-6 text-xs text-slate-700 font-medium">${impactoView}</td>
                        <td class="py-3.5 px-6 whitespace-nowrap text-right">
                            <button data-action="aprobacion-approve" data-id="${r.id}" class="inline-flex items-center gap-1.5 text-emerald-700 bg-emerald-50 hover:bg-emerald-100/60 px-3 py-1.5 rounded-xl border border-emerald-100/50 text-xs font-bold transition-all cursor-pointer mr-1.5 shadow-sm"><i class="ph ph-check-bold text-sm"></i> Aprobar</button>
                            <button data-action="aprobacion-reject" data-id="${r.id}" class="inline-flex items-center gap-1.5 text-rose-700 bg-rose-50 hover:bg-rose-100/60 px-3 py-1.5 rounded-xl border border-rose-100/50 text-xs font-bold transition-all cursor-pointer shadow-sm"><i class="ph ph-x-bold text-sm"></i> Rechazar</button>
                        </td>
                    </tr>
                `;
            });
            tbody.innerHTML = html;

        } catch (e) {
            console.error("Error cargando aprobaciones:", e);
            tbody.innerHTML = `<tr><td colspan="8" class="py-10 text-center text-red-500 font-bold">Error al cargar solicitudes de aprobación.</td></tr>`;
        }
    },

    getImpactoProveedor(proveedorId) {
        const planes = DataService.planes || [];
        const clientes = DataService.clientes || [];
        
        // Buscar planes vinculados
        const planesVinculados = planes.filter(p => {
            if (!p.proveedores_vinculados || !Array.isArray(p.proveedores_vinculados)) return false;
            return p.proveedores_vinculados.some(pv => pv.id_proveedor === proveedorId || pv.id_provider === proveedorId);
        });
        
        if (planesVinculados.length === 0) {
            return `<span class="text-slate-400 font-medium text-xs">Ninguno (Proveedor sin uso activo)</span>`;
        }
        
        let totalReservas = 0;
        const nombresPlanes = [];
        
        planesVinculados.forEach(p => {
            const reservasPlan = clientes.filter(c => c.plan_id === p.id && !c.deleted_at).length;
            totalReservas += reservasPlan;
            nombresPlanes.push(`${p.nombre} (${reservasPlan} res.)`);
        });
        
        let colorClass = totalReservas > 0 ? 'text-rose-600 bg-rose-50 border-rose-100/50' : 'text-amber-600 bg-amber-50 border-amber-100/50';
        
        return `
            <div class="px-2.5 py-1.5 rounded-xl border ${colorClass} text-[11px] leading-tight font-medium">
                <span class="font-bold uppercase tracking-wider block mb-0.5">${totalReservas} reservas afectadas</span>
                <span class="opacity-80 block max-w-[180px] truncate" title="${UI.sanitize(nombresPlanes.join(', '))}">${UI.sanitize(nombresPlanes.join(', '))}</span>
            </div>
        `;
    },

    async resolverAprobacion(solId, estado) {
        const adminEmail = window.AuthModule?.currentUser?.email;
        if (window.AuthModule?.userProfile?.rol !== 'super_administrador') {
            window.UI.showToast("Acción denegada: Solo el super administrador puede resolver solicitudes de cambio.", "error");
            return;
        }

        const confirmMsg = estado === 'APROBADO' 
            ? "¿Estás seguro de que deseas APROBAR esta solicitud? Los cambios se aplicarán inmediatamente en la base de datos."
            : "¿Estás seguro de que deseas RECHAZAR esta solicitud? Los cambios propuestos serán descartados.";

        if (!confirm(confirmMsg)) return;

        try {
            await DataService.resolverSolicitudCambio(solId, estado, adminEmail);
            window.UI.showToast(`Solicitud de cambio ${estado === 'APROBADO' ? 'aprobada y aplicada' : 'rechazada y descartada'} correctamente.`, "success");
            await this.loadAprobaciones();
        } catch (e) {
            console.error("Error resolviendo aprobación:", e);
            window.UI.showToast("Error al resolver la solicitud de cambio.", "error");
        }
    },

    renderDiff(prev, newD, tipoOperacion) {
        if (tipoOperacion === 'ELIMINACION') {
            return `<span class="bg-rose-50 text-rose-700 px-2 py-0.5 rounded border border-rose-100/50 text-[10px] font-bold">ELIMINACIÓN DE REGISTRO COMPLETO</span>`;
        }
        if (!prev || !newD) return '';
        
        let diffs = [];
        const fieldsToCompare = [
            { key: 'nombre', label: 'Razón Social / Nombre' },
            { key: 'telefono', label: 'Teléfono' },
            { key: 'ciudad', label: 'Ciudad' },
            { key: 'email', label: 'Correo Electrónico' },
            { key: 'tipo', label: 'Categoría' }
        ];
        
        fieldsToCompare.forEach(f => {
            const v1 = prev[f.key] || '';
            const v2 = newD[f.key] || '';
            if (v1 !== v2) {
                diffs.push(`
                    <div class="mb-1 text-xs">
                        <span class="font-bold text-slate-500">${f.label}:</span>
                        <span class="line-through text-rose-600 bg-rose-50 px-1 rounded">${UI.sanitize(v1)}</span>
                        <i class="ph ph-caret-right text-[10px] text-slate-400"></i>
                        <span class="text-emerald-700 bg-emerald-50 px-1 rounded font-semibold">${UI.sanitize(v2)}</span>
                    </div>
                `);
            }
        });
        
        // Comparar productos
        const prod1 = prev.productos || [];
        const prod2 = newD.productos || [];
        
        // Buscar productos agregados o con costo cambiado
        prod2.forEach(p2 => {
            const p1 = prod1.find(x => x.name === p2.name);
            if (!p1) {
                // Nuevo producto
                diffs.push(`
                    <div class="mb-1 text-xs">
                        <span class="font-bold text-slate-500">Nuevo servicio:</span>
                        <span class="text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded font-semibold">${UI.sanitize(p2.name)} (${formatCOP(p2.costo)})</span>
                    </div>
                `);
            } else if (Number(p1.costo) !== Number(p2.costo)) {
                // Costo cambiado
                diffs.push(`
                    <div class="mb-1 text-xs">
                        <span class="font-bold text-slate-500">Costo modificado (${UI.sanitize(p2.name)}):</span>
                        <span class="line-through text-rose-600 bg-rose-50 px-1 rounded">${formatCOP(p1.costo)}</span>
                        <i class="ph ph-caret-right text-[10px] text-slate-400"></i>
                        <span class="text-emerald-700 bg-emerald-50 px-1 rounded font-semibold">${formatCOP(p2.costo)}</span>
                    </div>
                `);
            }
        });
        
        // Buscar productos eliminados
        prod1.forEach(p1 => {
            const p2 = prod2.find(x => x.name === p1.name);
            if (!p2) {
                diffs.push(`
                    <div class="mb-1 text-xs">
                        <span class="font-bold text-slate-500">Servicio eliminado:</span>
                        <span class="line-through text-rose-600 bg-rose-50 px-1 rounded">${UI.sanitize(p1.name)} (${formatCOP(p1.costo)})</span>
                    </div>
                `);
            }
        });
        
        if (diffs.length === 0) {
            return `<span class="text-slate-400 italic text-xs">Sin cambios detectados en campos principales</span>`;
        }
        return diffs.join('');
    }
};

window.TrazabilidadComponent = TrazabilidadComponent;
