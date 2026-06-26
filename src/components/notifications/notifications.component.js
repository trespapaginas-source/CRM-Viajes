import { DataService } from '../../../js/services/supabase.service.js';
import { Store } from '../../core/store.js';
import { UI } from '../../../js/utils/ui.utils.js';
import { parseSpanishDate } from '../../../js/utils/format.utils.js';

export const NotificationsComponent = {
    init() {
        this.updateNotificationBadge();

        // Check and send email alerts on load (once per day)
        setTimeout(() => {
            this.sendEmailAlerts(false);
        }, 3000);

        Store.subscribe((state) => {
            if (state.lastUpdated === 'full' || state.lastUpdated === 'clientes' || state.lastUpdated === 'planes' || state.lastUpdated === 'alertas_gestionadas') {
                this.updateNotificationBadge();
                if (document.getElementById('view-notificaciones')?.classList.contains('active')) {
                    this.render();
                }
            }
        });

        // Event listeners
        document.body.addEventListener('click', (e) => {
            if (e.target.closest('#btn-send-email-alerts')) {
                this.sendEmailAlerts(true);
            }

            const btnMarkManaged = e.target.closest('[data-action="mark-managed"]');
            if (btnMarkManaged) {
                const tipo = btnMarkManaged.getAttribute('data-type');
                const planId = btnMarkManaged.getAttribute('data-plan-id');
                const fechaViaje = btnMarkManaged.getAttribute('data-fecha-viaje');
                
                DataService.markAlertaGestionada(tipo, planId, fechaViaje);
                UI.showToast("Alerta marcada como gestionada.", "success");
            }

            const btnUnmarkManaged = e.target.closest('[data-action="unmark-managed"]');
            if (btnUnmarkManaged) {
                const tipo = btnUnmarkManaged.getAttribute('data-type');
                const planId = btnUnmarkManaged.getAttribute('data-plan-id');
                const fechaViaje = btnUnmarkManaged.getAttribute('data-fecha-viaje');
                
                DataService.removeAlertaGestionada(tipo, planId, fechaViaje);
                UI.showToast("Alerta restaurada.", "info");
            }

            const btnToggle = e.target.closest('[data-action="toggle-passengers"]');
            if (btnToggle) {
                const listDiv = btnToggle.nextElementSibling;
                const icon = btnToggle.querySelector('.ph');
                if (listDiv) {
                    listDiv.classList.toggle('hidden');
                    if (icon) {
                        icon.classList.toggle('rotate-180');
                    }
                }
            }
        });
    },

    async sendEmailAlerts(force = false) {
        // Only run for administrators
        const userProfile = window.AuthModule?.userProfile;
        if (!userProfile || (userProfile.rol !== 'administrador' && userProfile.rol !== 'super_administrador')) {
            if (force) UI.showToast("Acceso denegado: Solo administradores pueden enviar correos.", "error");
            return;
        }

        const todayStr = new Date().toISOString().split('T')[0];
        const lastSent = localStorage.getItem('crm_last_alert_email_sent_date');
        
        if (!force && lastSent === todayStr) {
            console.log("Email alerts already sent today. Skipping auto-send.");
            return;
        }

        const alerts = this.getNotificationsData();
        const hasAlerts = alerts['1d_checkin'].length > 0 || alerts['1d_checkout'].length > 0 || alerts['2d'].length > 0 || alerts['3d'].length > 0 || alerts['4d'].length > 0;
        
        if (!hasAlerts) {
            if (force) UI.showToast("No hay salidas o retornos programados para el período configurado.", "info");
            return;
        }

        // Prepare the detailed passenger list inside the alert group
        // To display passenger names, ID/cedula, cell phone, plan, date, total value, and remaining balance
        const alertsPayload = {
            '1d_checkin': [],
            '1d_checkout': [],
            '2d': [],
            '3d': [],
            '4d': []
        };

        const processAlerts = (key) => {
            alerts[key].forEach(dep => {
                const clientesDetalle = dep.clientes.map(cli => {
                    const abonos = DataService.abonos.filter(a => a.cliente_id === cli.id && a.estado_pago !== 'pending' && a.estado_pago !== 'refunded');
                    const totalAbonado = abonos.reduce((s, a) => s + (Number(a.monto) || 0), 0);
                    let precio = parseFloat(cli.precio_total || 0);
                    const st = cli.estado ? cli.estado.toLowerCase() : '';
                    if (st === 'devolución') {
                        const devuelto = parseFloat(cli.monto_devuelto || 0);
                        precio = Math.max(0, totalAbonado - devuelto);
                    } else if (st === 'en caja') {
                        precio = totalAbonado;
                    }
                    const saldo = Math.max(precio - totalAbonado, 0);

                    return {
                        nombre: `${cli.nombre || ''} ${cli.apellido || ''}`.trim(),
                        cedula: cli.documento || cli.dni || 'Sin Documento',
                        celular: cli.telefono || 'Sin Teléfono',
                        valor_total: precio,
                        saldo_pendiente: saldo
                    };
                });

                alertsPayload[key].push({
                    plan_nombre: dep.plan_nombre,
                    destino: dep.destino,
                    fecha_viaje: dep.fecha_viaje,
                    pax: dep.pax,
                    clientes_detalle: clientesDetalle
                });
            });
        };

        processAlerts('1d_checkin');
        processAlerts('1d_checkout');
        processAlerts('2d');
        processAlerts('3d');
        processAlerts('4d');

        let btn = document.getElementById('btn-send-email-alerts');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="ph ph-spinner animate-spin mr-2"></i> Enviando...';
        }

        try {
            const response = await fetch('/send-alerts-email', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ alerts: alertsPayload })
            });

            if (response.status === 404 || response.status === 405) {
                throw new Error("El servidor local de correos no está disponible en este entorno estático (Cloudflare Pages).");
            }

            let data;
            try {
                data = await response.json();
            } catch (jsonErr) {
                throw new Error("Respuesta inválida del servidor de correos.");
            }

            if (response.ok && data.status === 'success') {
                localStorage.setItem('crm_last_alert_email_sent_date', todayStr);
                UI.showToast("Alerta de correo enviada exitosamente via Resend.", "success");
            } else {
                throw new Error(data.message || 'Error al enviar');
            }
        } catch (err) {
            console.error("Error sending email alerts:", err);
            // Si el envío no fue manual (force=false), silenciamos el toast de error para no importunar en producción estática
            if (force) {
                UI.showToast("No se pudo enviar: " + err.message, "error");
            }
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="ph ph-envelope-simple mr-2 text-sm"></i> Enviar Alertas por Correo';
            }
        }
    },

    getNotificationsData() {
        const departuresMap = {};
        
        // 1. Group active passengers by plan and travel date
        DataService.clientes.forEach(cli => {
            const st = cli.estado ? cli.estado.toLowerCase() : '';
            if (['desistió', 'cancelado o devolución', 'cancelados'].includes(st)) return;
            if (!cli.fecha_viaje || cli.fecha_viaje.toLowerCase().includes('abierta')) return;

            const plan = DataService.planes.find(p => p.id === cli.plan_id);
            if (!plan) return;

            const key = `${cli.plan_id}_${cli.fecha_viaje}`;
            if (!departuresMap[key]) {
                departuresMap[key] = {
                    plan_id: cli.plan_id,
                    plan_nombre: plan.nombre,
                    destino: plan.destino,
                    fecha_viaje: cli.fecha_viaje,
                    pax: 0,
                    clientes: []
                };
            }

            // Real PAX counting to match exactly the other modules
            const companionsCount = DataService.clientes.filter(x => x.parent_id === cli.id && !x.deleted_at).length;
            const realPax = companionsCount > 0 ? 1 : parseInt(cli.pax || 1);

            departuresMap[key].pax += realPax;
            departuresMap[key].clientes.push(cli);
        });

        // 2. Filter departures occurring in exactly 1, 2, 3, or 4 days, or return in 1 day
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const alerts = {
            '1d_checkin': [],
            '1d_checkout': [],
            '2d': [],
            '3d': [],
            '4d': []
        };

        Object.values(departuresMap).forEach(dep => {
            const plan = DataService.planes.find(p => p.id === dep.plan_id);
            if (!plan) return;

            let startDate = null;
            let endDate = null;

            // Check if travel date is a range
            const parts = dep.fecha_viaje.split(/\s+al\s+/i);
            if (parts.length === 2) {
                startDate = parseSpanishDate(parts[0].trim());
                endDate = parseSpanishDate(parts[1].trim());
            } else {
                startDate = parseSpanishDate(dep.fecha_viaje);
                if (startDate && !isNaN(startDate)) {
                    const dText = plan.duracion || '';
                    const dMatch = dText.match(/(\d+)\s*noches/i);
                    const nights = dMatch ? parseInt(dMatch[1]) : 0;
                    if (nights > 0) {
                        endDate = new Date(startDate);
                        endDate.setDate(endDate.getDate() + nights);
                    } else {
                        endDate = startDate;
                    }
                }
            }

            if (!startDate || isNaN(startDate)) return;

            const diffTimeStart = startDate - today;
            const diffDaysStart = Math.ceil(diffTimeStart / (1000 * 60 * 60 * 24));

            const isManaged = (type) => {
                return (DataService.alertas_gestionadas || []).some(
                    a => a.tipo === type && a.plan_id === dep.plan_id && a.fecha_viaje === dep.fecha_viaje
                );
            };

            if ((diffDaysStart === 1 || diffDaysStart === 0) && !isManaged('1d_checkin')) {
                alerts['1d_checkin'].push({
                    ...dep,
                    relativeStatus: diffDaysStart === 0 ? 'Sale Hoy' : 'Sale Mañana'
                });
            } else if (diffDaysStart === 2 && !isManaged('2d')) {
                alerts['2d'].push({
                    ...dep,
                    relativeStatus: 'Sale en 2 días'
                });
            } else if (diffDaysStart === 3 && !isManaged('3d')) {
                alerts['3d'].push({
                    ...dep,
                    relativeStatus: 'Sale en 3 días'
                });
            } else if (diffDaysStart === 4 && !isManaged('4d')) {
                alerts['4d'].push({
                    ...dep,
                    relativeStatus: 'Sale en 4 días'
                });
            }

            // Check-out alert: exactly 1 day before return or on return day
            if (endDate && !isNaN(endDate) && endDate > startDate) {
                const diffTimeEnd = endDate - today;
                const diffDaysEnd = Math.ceil(diffTimeEnd / (1000 * 60 * 60 * 24));

                if ((diffDaysEnd === 1 || diffDaysEnd === 0) && !isManaged('1d_checkout')) {
                    alerts['1d_checkout'].push({
                        ...dep,
                        relativeStatus: diffDaysEnd === 0 ? 'Regresa Hoy' : 'Regresa Mañana'
                    });
                }
            }
        });

        return alerts;
    },

    updateNotificationBadge() {
        const alerts = this.getNotificationsData();
        const totalAlerts = alerts['1d_checkin'].length + alerts['1d_checkout'].length + alerts['2d'].length + alerts['3d'].length + alerts['4d'].length;

        const badge = document.getElementById('nav-notification-badge');
        if (badge) {
            if (totalAlerts > 0) {
                badge.innerText = totalAlerts;
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }
        }
    },

    render() {
        const alerts = this.getNotificationsData();

        // 1. Render counts in cards headers
        const el1dCheckinCount = document.getElementById('alert-count-1d-checkin');
        const el1dCheckoutCount = document.getElementById('alert-count-1d-checkout');
        const el2dCount = document.getElementById('alert-count-2d');
        const el3dCount = document.getElementById('alert-count-3d');
        const el4dCount = document.getElementById('alert-count-4d');
        
        if (el1dCheckinCount) el1dCheckinCount.innerText = alerts['1d_checkin'].length;
        if (el1dCheckoutCount) el1dCheckoutCount.innerText = alerts['1d_checkout'].length;
        if (el2dCount) el2dCount.innerText = alerts['2d'].length;
        if (el3dCount) el3dCount.innerText = alerts['3d'].length;
        if (el4dCount) el4dCount.innerText = alerts['4d'].length;

        // 2. Render lists contents
        const renderList = (listId, listData, actionText = 'Ver Finanzas') => {
            const container = document.getElementById(listId);
            if (!container) return;
            container.innerHTML = '';

            if (listData.length === 0) {
                container.innerHTML = `
                    <div class="flex flex-col items-center justify-center py-12 text-slate-400 text-center border-2 border-dashed border-slate-100 rounded-2xl bg-slate-50/30">
                        <div class="w-10 h-10 rounded-full bg-emerald-50 text-emerald-500 flex items-center justify-center mb-2">
                            <i class="ph ph-check-circle text-xl"></i>
                        </div>
                        <p class="text-[10px] font-black uppercase tracking-wider text-slate-500">Sin Alertas</p>
                    </div>
                `;
                return;
            }

            listData.forEach(dep => {
                const alertType = listId.replace('alert-list-', '').replace(/-/g, '_');
                
                const relativeStatusLabel = dep.relativeStatus ? `
                    <span class="inline-block px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider ${alertType.includes('checkout') ? 'bg-pink-50 border border-pink-100 text-pink-700' : alertType.includes('checkin') ? 'bg-violet-50 border border-violet-100 text-violet-700' : 'bg-slate-100 border border-slate-200 text-slate-655'} ml-1.5 align-middle">
                        ${dep.relativeStatus}
                    </span>
                ` : '';

                const passengersList = dep.clientes && dep.clientes.length > 0 ? `
                    <div class="mt-3 border-t border-slate-100 pt-2.5">
                        <button data-action="toggle-passengers" class="w-full flex items-center justify-between text-[9px] font-black text-slate-450 uppercase tracking-widest hover:text-slate-700 transition-colors focus:outline-none">
                            <span>Pasajeros (${dep.pax} Pax)</span>
                            <i class="ph ph-caret-down text-xs transition-transform duration-300"></i>
                        </button>
                        <div class="hidden mt-2 space-y-1.5 pl-1.5 transition-all">
                            ${dep.clientes.map(c => `
                                <div class="text-[10px] font-bold text-slate-600 flex items-center gap-1.5">
                                    <div class="w-1 h-1 rounded-full bg-slate-300 shrink-0"></div>
                                    <span>${UI.sanitize(c.nombre)} ${UI.sanitize(c.apellido || '')}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : '';

                container.innerHTML += `
                    <div class="bg-slate-50/50 border border-slate-200/40 p-4 rounded-2xl shadow-[0_1px_2px_rgba(15,23,42,0.01)] hover:shadow-md transition-all duration-300 relative overflow-hidden group bg-white text-left">
                        <!-- Mark as Managed Button -->
                        <button data-action="mark-managed" data-type="${alertType}" data-plan-id="${dep.plan_id}" data-fecha-viaje="${UI.sanitize(dep.fecha_viaje)}"
                            title="Marcar como Gestionado"
                            class="absolute top-3 right-3 text-slate-300 hover:text-emerald-500 hover:bg-emerald-50 w-7 h-7 rounded-full flex items-center justify-center transition-all focus:outline-none">
                            <i class="ph ph-check-circle text-lg"></i>
                        </button>

                        <h5 class="font-bold text-slate-900 text-sm leading-snug mb-1 pr-8 flex flex-wrap items-center gap-1">
                            ${UI.sanitize(dep.plan_nombre)}
                            ${relativeStatusLabel}
                        </h5>
                        <p class="text-[9px] text-slate-400 font-bold uppercase tracking-wider mb-3.5 flex items-center">
                            <i class="ph ph-map-pin mr-1 text-slate-350"></i> ${UI.sanitize(dep.destino || 'Destino Abierto')}
                        </p>
                        
                        <div class="grid grid-cols-2 gap-2 text-[10px] font-bold text-slate-600 mb-4 bg-slate-50 p-2.5 rounded-xl border border-slate-100/50">
                            <div class="flex items-center"><i class="ph ph-calendar-blank mr-1.5 text-slate-400"></i> ${UI.sanitize(dep.fecha_viaje)}</div>
                            <div class="flex items-center justify-end"><i class="ph ph-users mr-1.5 text-slate-400"></i> ${dep.pax} Pax</div>
                        </div>
                        
                        <button data-action="open-financial-modal" data-plan-id="${dep.plan_id}" data-fecha-viaje="${dep.fecha_viaje}"
                            class="w-full bg-slate-900 hover:bg-slate-800 text-white font-black py-2.5 rounded-xl text-[9px] uppercase tracking-widest transition-all shadow-sm hover:-translate-y-0.5">
                            <i class="ph ph-eye mr-1 text-xs"></i> ${actionText}
                        </button>

                        ${passengersList}
                    </div>
                `;
            });
        };

        renderList('alert-list-1d-checkin', alerts['1d_checkin'], 'Ver Check-in / Finanzas');
        renderList('alert-list-1d-checkout', alerts['1d_checkout'], 'Ver Check-out / Finanzas');
        renderList('alert-list-2d', alerts['2d']);
        renderList('alert-list-3d', alerts['3d']);
        renderList('alert-list-4d', alerts['4d']);

        // 3. Render managed alerts list
        const managedContainer = document.getElementById('alert-list-managed');
        if (managedContainer) {
            managedContainer.innerHTML = '';
            const managedData = DataService.alertas_gestionadas || [];
            
            if (managedData.length === 0) {
                managedContainer.innerHTML = `
                    <div class="col-span-full flex flex-col items-center justify-center py-12 text-slate-400 text-center border-2 border-dashed border-slate-100 rounded-2xl bg-slate-50/30">
                        <p class="text-[10px] font-black uppercase tracking-wider text-slate-550">Ninguna alerta gestionada aún</p>
                    </div>
                `;
            } else {
                managedData.forEach(item => {
                    const plan = DataService.planes.find(p => p.id === item.plan_id);
                    const planNombre = plan ? plan.nombre : 'Plan Desconocido';
                    
                    const typeTranslations = {
                        '1d_checkin': 'Check-in (Salida)',
                        '1d_checkout': 'Check-out (Regreso)',
                        '2d': 'Pre-Viaje (2 Días)',
                        '3d': 'Pre-Viaje (3 Días)',
                        '4d': 'Pre-Viaje (4 Días)'
                    };
                    const typeText = typeTranslations[item.tipo] || item.tipo;
                    
                    managedContainer.innerHTML += `
                        <div class="bg-slate-50/30 border border-slate-200/40 p-4 rounded-2xl relative overflow-hidden group bg-white text-left opacity-75 hover:opacity-100 transition-opacity">
                            <!-- Restore button -->
                            <button data-action="unmark-managed" data-type="${item.tipo}" data-plan-id="${item.plan_id}" data-fecha-viaje="${UI.sanitize(item.fecha_viaje)}"
                                title="Restaurar Alerta"
                                class="absolute top-3 right-3 text-slate-400 hover:text-indigo-650 hover:bg-indigo-50 w-7 h-7 rounded-full flex items-center justify-center transition-all focus:outline-none">
                                <i class="ph ph-arrow-counter-clockwise text-lg"></i>
                            </button>

                            <span class="inline-block px-2 py-0.5 mb-2.5 bg-emerald-50 border border-emerald-100 text-emerald-700 text-[8px] font-black uppercase tracking-widest rounded-lg">
                                <i class="ph ph-check mr-0.5"></i> ${typeText}
                            </span>
                            
                            <h5 class="font-bold text-slate-800 text-sm leading-snug mb-1 pr-8">${UI.sanitize(planNombre)}</h5>
                            <p class="text-[9px] text-slate-400 font-bold uppercase tracking-wider mb-3 flex items-center">
                                <i class="ph ph-calendar-blank mr-1 text-slate-350"></i> ${UI.sanitize(item.fecha_viaje)}
                            </p>
                            
                            <div class="text-[9px] font-semibold text-slate-500 pt-2 border-t border-slate-100/50 flex justify-between items-center">
                                <span>Por: ${UI.sanitize(item.creado_por)}</span>
                                <span>${new Date(item.created_at).toLocaleDateString('es-CO')}</span>
                            </div>
                        </div>
                    `;
                });
            }
        }
    }
};
