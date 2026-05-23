// ============================================================
// js/utils/ui.utils.js — Motor de UI, Modales y Eliminación
// Dependencias: window.formatCOP (disponible en runtime)
// Extraído de app.js líneas 3392–3570
// ============================================================

export const UI = {
    toggleDropdown(id) {
        const cajon = document.getElementById(id);
        if (cajon) {
            cajon.classList.toggle('hidden');
            const icono = document.getElementById(id.replace('dropdown-filters-', 'icon-dropdown-'));
            if (icono) icono.classList.toggle('rotate-180');
        }
    },

    sanitize(str) {
        if (!str) return '';
        const temp = document.createElement('div');
        temp.textContent = str;
        return temp.innerHTML;
    },

    formatMoney(m) {
        return window.formatCOP(m);
    },

    showToast(m, type = 'success') {
        const c = document.getElementById('toast-container');
        const el = document.createElement('div');
        let cls = "bg-slate-900 text-white shadow-xl shadow-slate-900/20";
        let ico = "ph-check-circle text-green-400";

        if (type === 'error') {
            cls = "bg-red-50 text-red-900 border-2 border-red-200 shadow-lg shadow-red-900/10";
            ico = "ph-warning-circle text-red-600";
        } else if (type === 'info') {
            cls = "bg-blue-50 text-blue-900 border-2 border-blue-200 shadow-lg shadow-blue-900/10";
            ico = "ph-info text-blue-600";
        }

        el.className = `toast flex items-center p-5 rounded-2xl font-semibold text-sm ${cls}`;
        el.innerHTML = `<i class="ph ${ico} text-2xl mr-3"></i> ${m}`;
        c.appendChild(el);

        setTimeout(() => el.classList.add('show'), 10);
        setTimeout(() => {
            el.classList.remove('show');
            setTimeout(() => el.remove(), 300);
        }, 5000);
    },

    animateMoney(id, v) {
        const el = document.getElementById(id);
        if (el) el.innerText = window.formatCOP(v);
    },

    toggleSidebar() {
        document.getElementById('sidebar').classList.toggle('open');
        document.getElementById('sidebar-overlay').classList.toggle('active');
    },

    closeSidebar() {
        document.getElementById('sidebar').classList.remove('open');
        document.getElementById('sidebar-overlay').classList.remove('active');
    },

    switchTab(px, t) {
        const containerId = px === 'cliente' ? 'client-form-content' : `${px}-form-content`;
        const b = document.getElementById(containerId);
        if (!b) return;

        b.querySelectorAll('.tab-btn').forEach(x => x.classList.remove('active'));
        b.querySelectorAll('.tab-content').forEach(x => x.classList.remove('active'));

        const ba = b.querySelector(`button[onclick*="'${t}'"]`);
        if (ba) ba.classList.add('active');

        const targetTab = document.getElementById(`${px}-tab-${t}`);
        if (targetTab) targetTab.classList.add('active');
    },

    openModal(modalStringId, idBackgroundOscuro, idDivCajaContenido) {
        const cajaPadre = document.getElementById(modalStringId);
        const sombraFondo = document.getElementById(idBackgroundOscuro);
        const cajaInteriorCuerpo = document.getElementById(idDivCajaContenido);

        cajaPadre.classList.remove('hidden');

        setTimeout(() => {
            sombraFondo.classList.remove('opacity-0');
            sombraFondo.classList.add('opacity-100');

            if (cajaInteriorCuerpo.classList.contains('translate-x-full')) {
                cajaInteriorCuerpo.classList.remove('translate-x-full');
                cajaInteriorCuerpo.classList.add('translate-x-0');
            } else {
                cajaInteriorCuerpo.classList.remove('opacity-0', 'scale-95');
                cajaInteriorCuerpo.classList.add('opacity-100', 'scale-100');
            }
        }, 10);
    },

    closeModal(modalStringId, idBackgroundOscuro, idDivCajaContenido) {
        const cajaPadre = document.getElementById(modalStringId);
        const sombraFondo = document.getElementById(idBackgroundOscuro);
        const cajaInteriorCuerpo = document.getElementById(idDivCajaContenido);

        sombraFondo.classList.remove('opacity-100');
        sombraFondo.classList.add('opacity-0');

        if (cajaInteriorCuerpo.classList.contains('translate-x-0')) {
            cajaInteriorCuerpo.classList.remove('translate-x-0');
            cajaInteriorCuerpo.classList.add('translate-x-full');
        } else {
            cajaInteriorCuerpo.classList.remove('opacity-100', 'scale-100');
            cajaInteriorCuerpo.classList.add('opacity-0', 'scale-95');
        }

        setTimeout(() => {
            cajaPadre.classList.add('hidden');
        }, 300);
    },

    formatCurrencyElement(input) {
        let val = input.value.replace(/\D/g, '');
        if (val) {
            if (val.length > 1) {
                val = val.replace(/^0+/, '');
            }
            input.value = val.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
        } else {
            input.value = '';
        }
    },

    parseCurrency(val) {
        if (val === undefined || val === null || val === '') return 0;
        if (typeof val === 'number') return val;
        const clean = String(val).replace(/\./g, '').trim();
        return parseFloat(clean) || 0;
    },

    setCurrencyValue(id, val) {
        const el = document.getElementById(id);
        if (el) {
            if (val === undefined || val === null || val === '') {
                el.value = '';
                return;
            }
            let str = String(val).replace(/\D/g, '');
            if (str.length > 1) {
                str = str.replace(/^0+/, '');
            }
            el.value = str.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
        }
    }
};

// ─── ELIMINACIÓN GLOBAL ──────────────────────────────────────
// Expuesta como función suelta para compatibilidad con onclick="promptGlobalDelete(...)"

export function promptGlobalDelete(id, type, name) {
    document.getElementById('udm-id').value = id;
    document.getElementById('udm-type').value = type;
    document.getElementById('udm-name').innerText = name;

    let message = "";
    if (type === 'plan') message = "Se eliminará este plan. Asegúrate de que no haya reservas activas vinculadas a él.";
    if (type === 'cliente') message = "Se eliminará la reserva de este cliente y todo su historial de abonos. Esta acción es irreversible.";
    if (type === 'proveedor') message = "Se eliminará este proveedor y todo su catálogo de servicios de la base de datos.";

    document.getElementById('udm-message').innerText = message;
    UI.openModal('universal-delete-modal', 'udm-bg', 'udm-content');
}

export async function executeGlobalDelete() {
    // ── BLINDAJE DE SEGURIDAD: Validar permisos antes de eliminar ──
    if (!window.AuthModule?.userProfile?.puede_eliminar) {
        UI.showToast("Acción denegada: Tu rol no tiene permisos para eliminar registros.", "error");
        UI.closeModal('universal-delete-modal', 'udm-bg', 'udm-content');
        return;
    }

    const id = document.getElementById('udm-id').value;
    const type = document.getElementById('udm-type').value;
    const btn = document.getElementById('udm-confirm-btn');

    const prevHtml = btn.innerHTML;
    btn.innerHTML = '<i class="ph ph-spinner animate-spin text-xl"></i>';
    btn.disabled = true;

    try {
        if (type === 'plan') {
            await window.DataService.deletePlan(id);
            UI.showToast("Plan eliminado del catálogo.", "success");
        } else if (type === 'cliente') {
            await window.DataService.deleteCliente(id);
            // DashboardComponent se actualiza automáticamente vía Store
            const detailModal = document.getElementById('client-detail-modal');
            if (document.getElementById('cdm-bg') && !document.getElementById('cdm-bg').classList.contains('hidden')) {
                UI.closeModal('client-detail-modal', 'cdm-bg', 'cdm-content');
            }
            UI.showToast("Reserva y abonos del cliente eliminados.", "success");
        } else if (type === 'proveedor') {
            await window.DataService.deleteProveedor(id);
            UI.showToast("Proveedor eliminado correctamente.", "success");
        }
        UI.closeModal('universal-delete-modal', 'udm-bg', 'udm-content');
    } catch (e) {
        console.error(e);
        UI.showToast("Error al intentar eliminar en la Base de Datos.", "error");
    } finally {
        btn.innerHTML = prevHtml;
        btn.disabled = false;
    }
}
