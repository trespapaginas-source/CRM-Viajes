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
            if (state.lastUpdated === 'full' || state.lastUpdated === 'clientes' || state.lastUpdated === 'planes') {
                this.updateNotificationBadge();
                if (document.getElementById('view-notificaciones')?.classList.contains('active')) {
                    this.render();
                }
            }
        });

        // Event listener for manual email button
        document.body.addEventListener('click', (e) => {
            if (e.target.closest('#btn-send-email-alerts')) {
                this.sendEmailAlerts(true);
            }
        });
    },

    async sendEmailAlerts(force = false) {
        // Only run for administrators
        const userProfile = window.AuthModule?.userProfile;
        if (!userProfile || userProfile.rol !== 'administrador') {
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

            if (diffDaysStart === 1) {
                alerts['1d_checkin'].push(dep);
            } else if (diffDaysStart === 2) {
                alerts['2d'].push(dep);
            } else if (diffDaysStart === 3) {
                alerts['3d'].push(dep);
            } else if (diffDaysStart === 4) {
                alerts['4d'].push(dep);
            }

            // Check-out alert: exactly 1 day before return
            // Only if return is after start (nights > 0 or it's a range with diff dates) and it is international or > 1 night
            if (endDate && !isNaN(endDate) && endDate > startDate) {
                const diffTimeEnd = endDate - today;
                const diffDaysEnd = Math.ceil(diffTimeEnd / (1000 * 60 * 60 * 24));

                const dText = plan.duracion || '';
                const dMatch = dText.match(/(\d+)\s*noches/i);
                const nights = dMatch ? parseInt(dMatch[1]) : 0;

                const isInternational = plan.categoria && plan.categoria.toLowerCase() === 'internacional';
                const hasMultipleNights = nights > 1;

                if (diffDaysEnd === 1 && (isInternational || hasMultipleNights)) {
                    alerts['1d_checkout'].push(dep);
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
                container.innerHTML += `
                    <div class="bg-slate-50/50 border border-slate-200/40 p-4 rounded-2xl shadow-[0_1px_2px_rgba(15,23,42,0.01)] hover:shadow-md transition-all duration-300 relative overflow-hidden group bg-white">
                        <h5 class="font-bold text-slate-900 text-sm leading-snug mb-1 pr-4">${UI.sanitize(dep.plan_nombre)}</h5>
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
                    </div>
                `;
            });
        };

        renderList('alert-list-1d-checkin', alerts['1d_checkin'], 'Ver Check-in / Finanzas');
        renderList('alert-list-1d-checkout', alerts['1d_checkout'], 'Ver Check-out / Finanzas');
        renderList('alert-list-2d', alerts['2d']);
        renderList('alert-list-3d', alerts['3d']);
        renderList('alert-list-4d', alerts['4d']);
    }
};
