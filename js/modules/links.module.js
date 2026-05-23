// js/modules/links.module.js — Generador WhatsApp de Reservas
// Cross-module: window.AuthModule, window.DashboardModule
// Extraído de app.js líneas 3725–3974
import { DataService } from '../services/supabase.service.js';
import { UI } from '../utils/ui.utils.js';
import { formatCOP, formatShortDate, formatDoubleDate } from '../utils/format.utils.js';

export const LinksModule = {
    init() {
        const selectPlan = document.getElementById('link-plan-id');
        if (!selectPlan) return;
        selectPlan.innerHTML = '<option value="">-- Elige un plan --</option>';
        DataService.planes.forEach(p => selectPlan.innerHTML += `<option value="${p.id}">${p.nombre}</option>`);
        document.getElementById('form-generar-link').reset();
        document.getElementById('link-resultado').classList.add('hidden');
        this.renderHistory();
    },

    onPlanSelect() {
        const pId = document.getElementById('link-plan-id').value;
        const selectFechas = document.getElementById('link-fecha');
        const inputTarifa = document.getElementById('link-tarifa');
        selectFechas.innerHTML = '<option value="">-- Elige la fecha --</option>';
        inputTarifa.value = '';
        if (!pId) return;
        const plan = DataService.planes.find(p => p.id === pId);
        if (plan) {
            inputTarifa.value = plan.precio_persona || 0;
            if (plan.fechas && plan.fechas.length > 0) {
                const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
                plan.fechas.forEach(f => {
                    const isPast = new Date(f.start + "T00:00:00") < hoy;
                    const text = f.start === f.end ? formatShortDate(f.start) : `${formatShortDate(f.start)} al ${formatShortDate(f.end)}`;
                    if (!isPast) selectFechas.innerHTML += `<option value="${text}">${text}</option>`;
                });
            } else {
                selectFechas.innerHTML = '<option value="Fecha Abierta">Fecha Abierta / No definida</option>';
            }
        }
    },

    async generarLink(event) {
        event.preventDefault();
        const nombre = document.getElementById('link-nombre').value;
        const apellido = document.getElementById('link-apellido').value;
        const telefono = document.getElementById('link-telefono').value;
        const planId = document.getElementById('link-plan-id').value;
        const fecha = document.getElementById('link-fecha').value;
        const tarifa = parseFloat(document.getElementById('link-tarifa').value);
        const abono = parseFloat(document.getElementById('link-abono').value);

        if (!planId || !fecha || isNaN(tarifa) || isNaN(abono)) return UI.showToast("Faltan datos financieros o del plan.", "error");

        const btn = document.getElementById('btn-generar-link-submit');
        const prevHtml = btn.innerHTML;
        btn.innerHTML = '<i class="ph ph-spinner animate-spin mr-2 text-xl"></i> Creando Pre-reserva...';
        btn.disabled = true;

        try {
            const token = 'TKN-' + Math.random().toString(36).substr(2, 9).toUpperCase();
            const expiracion = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

            const objCliente = {
                nombre, apellido, telefono, documento: 'Pendiente', ciudad: 'Pendiente', eps: 'Pendiente',
                alergias: 'Pendiente', contacto_emergencia: 'Pendiente', plan_id: planId, pax: 1,
                precio_total: tarifa, fecha_viaje: fecha, estado: 'registro pendiente',
                etiqueta: 'Venta WhatsApp', link_token: token, link_expiracion: expiracion,
                abono_acumulado: abono, saldo_restante: Math.max(tarifa - abono, 0)
            };

            const newClient = await DataService.saveCliente(objCliente);

            if (newClient) {
                await DataService.saveAbono({
                    cliente_id: newClient.id, monto: abono, metodo: 'Link WhatsApp',
                    estado_pago: 'confirmed', usuario_email: window.AuthModule.currentUser?.email || 'Asesor WhatsApp'
                });
            }

            const dominioActual = window.location.origin + window.location.pathname.replace('index.html', '');
            const finalUrl = `${dominioActual}registro.html?token=${token}`;
            document.getElementById('link-generado-url').value = finalUrl;

            const planName = DataService.planes.find(p => p.id === planId)?.nombre || 'su viaje';
            const msg = `¡Hola ${nombre}! Confirmo la recepción de tu abono por ${formatCOP(abono)} para tu reserva de ${planName} el ${fecha}. 🎉\n\nPor favor, completa tus datos personales y médicos (Alergias/EPS) en el siguiente enlace seguro en las próximas 24 horas para emitir tus pólizas:\n\n${finalUrl}\n\n¡Gracias por elegir Vive Travel!`;

            const telLimpio = telefono.replace(/\D/g, '');
            document.getElementById('link-whatsapp-btn').href = `https://wa.me/57${telLimpio}?text=${encodeURIComponent(msg)}`;
            document.getElementById('link-resultado').classList.remove('hidden');
            
            this.renderHistory();
            UI.showToast("¡Reserva pre-creada y dinero en caja!", "success");
        } catch (e) {
            console.error(e);
            UI.showToast("Error creando el link seguro.", "error");
        } finally {
            btn.innerHTML = prevHtml;
            btn.disabled = false;
        }
    },

    copiarLink() {
        const urlInput = document.getElementById('link-generado-url');
        urlInput.select();
        urlInput.setSelectionRange(0, 99999);
        navigator.clipboard.writeText(urlInput.value)
            .then(() => UI.showToast("¡Link copiado! Ya puedes pegarlo en el chat.", "success"))
            .catch(() => UI.showToast("Error al copiar. Selecciona el texto manualmente.", "error"));
    },

    renderHistory() {
        const tbody = document.getElementById('links-history-list');
        if (!tbody) return;
        tbody.innerHTML = '';

        const clientesLink = DataService.clientes
            .filter(c => c.etiqueta === 'Venta WhatsApp' || c.link_token)
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        if (clientesLink.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="p-6 text-center text-slate-400 italic font-medium">No hay links generados en el historial.</td></tr>';
            return;
        }

        const fragment = document.createDocumentFragment();
        const ahora = new Date();

        clientesLink.forEach(c => {
            const plan = DataService.planes.find(p => p.id === c.plan_id);
            const planNombre = plan ? plan.nombre : 'Plan Desconocido';
            const isPendiente = c.estado === 'registro pendiente';
            let estadoBadge = '';
            let isExpired = false;

            if (isPendiente && c.link_token) {
                const expDate = new Date(c.link_expiracion);
                if (ahora > expDate) {
                    isExpired = true;
                    estadoBadge = '<span class="bg-red-50 text-red-600 border border-red-200 px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-widest flex items-center justify-center w-fit mx-auto"><i class="ph ph-warning-circle mr-1 text-sm"></i> Vencido</span>';
                } else {
                    estadoBadge = '<span class="bg-green-50 text-green-600 border border-green-200 px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-widest flex items-center justify-center w-fit mx-auto"><div class="w-1.5 h-1.5 bg-green-500 rounded-full mr-1.5 animate-pulse"></div> Activo</span>';
                }
            } else {
                estadoBadge = '<span class="bg-blue-50 text-blue-600 border border-blue-200 px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-widest flex items-center justify-center w-fit mx-auto"><i class="ph ph-check-circle mr-1 text-sm"></i> Completado</span>';
            }

            const dominioActual = window.location.origin + window.location.pathname.replace('index.html', '');
            const url = c.link_token ? `${dominioActual}registro.html?token=${c.link_token}` : '#';

            let accionesHtml = '';
            if (isPendiente && c.link_token) {
                if (isExpired) {
                    accionesHtml = '<span class="text-[10px] text-red-400 font-bold uppercase tracking-widest bg-red-50 px-2 py-1 rounded border border-red-100">Expiró (Crear uno nuevo)</span>';
                } else {
                    accionesHtml = `
                        <div class="flex items-center justify-center space-x-2">
                            <button onclick="LinksModule.copiarLinkManual('${url}')" class="text-slate-500 hover:text-blue-600 bg-white border border-slate-200 shadow-sm hover:border-blue-200 hover:bg-blue-50 p-1.5 rounded-lg transition-all" title="Copiar Link"><i class="ph ph-copy text-lg"></i></button>
                            <button onclick="LinksModule.reenviarWhatsApp('${c.telefono}', '${UI.sanitize(c.nombre)}', '${UI.sanitize(planNombre)}', '${UI.sanitize(c.fecha_viaje)}', '${url}', ${c.abono_acumulado || 0})" class="text-slate-500 hover:text-green-600 bg-white border border-slate-200 shadow-sm hover:border-green-200 hover:bg-green-50 p-1.5 rounded-lg transition-all" title="Reenviar a WhatsApp"><i class="ph ph-whatsapp-logo text-lg"></i></button>
                        </div>`;
                }
            } else {
                accionesHtml = '<span class="text-[10px] text-slate-400 font-bold uppercase tracking-widest bg-slate-100 px-2 py-1 rounded">Consumido / Llenado</span>';
            }

            const tr = document.createElement('tr');
            tr.className = 'hover:bg-slate-50 transition-colors';
            tr.innerHTML = `
                <td class="py-3 px-4"><p class="font-bold text-slate-800 text-sm">${UI.sanitize(c.nombre)} ${UI.sanitize(c.apellido)}</p><p class="text-[10px] text-slate-500 mt-0.5 flex items-center"><i class="ph ph-phone mr-1"></i>${UI.sanitize(c.telefono)}</p></td>
                <td class="py-3 px-4"><p class="font-bold text-primary-700 text-xs">${UI.sanitize(planNombre)}</p><p class="text-[10px] text-slate-500 mt-0.5 flex items-center"><i class="ph ph-calendar-blank mr-1"></i> ${UI.sanitize(formatDoubleDate(c.fecha_viaje))}</p></td>
                <td class="py-3 px-4 text-center">${estadoBadge}</td>
                <td class="py-3 px-4 text-center">${accionesHtml}</td>`;
            fragment.appendChild(tr);
        });
        tbody.appendChild(fragment);
    },

    copiarLinkManual(url) {
        navigator.clipboard.writeText(url)
            .then(() => UI.showToast("¡Link de recuperación copiado!", "success"))
            .catch(() => UI.showToast("Error al copiar el link.", "error"));
    },

    reenviarWhatsApp(telefono, nombre, planNombre, fecha, url, abono) {
        const msg = `¡Hola ${nombre}! Te recordamos completar el registro médico y personal para tu reserva de ${planNombre} el ${fecha}.\n\nTu abono por ${formatCOP(abono)} está seguro en caja 🔒\n\nPor favor, llena tus datos aquí para emitir tus pólizas:\n${url}\n\n¡Te esperamos!`;
        const telLimpio = telefono.replace(/\D/g, '');
        window.open(`https://wa.me/57${telLimpio}?text=${encodeURIComponent(msg)}`, '_blank');
    }
};
