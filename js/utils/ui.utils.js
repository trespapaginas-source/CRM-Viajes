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
        const isUSD = window.DocumentosComponent?.activeDoc?.data?.moneda === 'USD';
        if (isUSD) {
            let val = input.value;
            // Remove everything except digits, dots, and commas
            val = val.replace(/[^0-9.,]/g, '');
            
            // Standardize decimal separator to comma
            if (!val.includes(',')) {
                const lastDotIdx = val.lastIndexOf('.');
                if (lastDotIdx !== -1) {
                    const charsAfterDot = val.substring(lastDotIdx + 1);
                    // If the dot is at the end or followed by 1 or 2 digits, it is a decimal separator
                    if (charsAfterDot.length === 0 || charsAfterDot.length === 1 || charsAfterDot.length === 2) {
                        val = val.substring(0, lastDotIdx) + ',' + charsAfterDot;
                    }
                }
            }
            
            // Handle decimal separation
            const hasComma = val.includes(',');
            if (hasComma) {
                // Strip all dots (thousand separators)
                val = val.replace(/\./g, '');
                const parts = val.split(',');
                let integerPart = parts[0].replace(/\D/g, '');
                let decimalPart = parts.slice(1).join('').replace(/\D/g, '').substring(0, 2);
                
                if (integerPart) {
                    if (integerPart.length > 1) {
                        integerPart = integerPart.replace(/^0+/, '');
                    }
                    integerPart = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
                } else {
                    integerPart = '0';
                }
                
                input.value = integerPart + ',' + decimalPart;
            } else {
                let cleanVal = val.replace(/\D/g, '');
                if (cleanVal) {
                    if (cleanVal.length > 1) {
                        cleanVal = cleanVal.replace(/^0+/, '');
                    }
                    input.value = cleanVal.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
                } else {
                    input.value = '';
                }
            }
        } else {
            let val = input.value.replace(/\D/g, '');
            if (val) {
                if (val.length > 1) {
                    val = val.replace(/^0+/, '');
                }
                input.value = val.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
            } else {
                input.value = '';
            }
        }
    },

    parseCurrency(val) {
        if (val === undefined || val === null || val === '') return 0;
        if (typeof val === 'number') return val;
        
        const isUSD = window.DocumentosComponent?.activeDoc?.data?.moneda === 'USD';
        if (isUSD) {
            let clean = String(val).replace(/[\$\s]/g, '').trim();
            const lastDot = clean.lastIndexOf('.');
            const lastComma = clean.lastIndexOf(',');
            if (lastComma > lastDot) {
                // Comma is decimal separator. Remove all dots, replace comma with dot.
                clean = clean.replace(/\./g, '').replace(/,/g, '.');
            } else if (lastDot > lastComma) {
                // Dot is decimal separator. Remove all commas.
                clean = clean.replace(/,/g, '');
            } else {
                // Single separator or no mixed separator, assume decimal if it contains dot or comma
                clean = clean.replace(/,/g, '.');
            }
            return parseFloat(clean) || 0;
        } else {
            const clean = String(val).replace(/[\$\s]/g, '').replace(/\./g, '').trim();
            return parseFloat(clean) || 0;
        }
    },

    setCurrencyValue(id, val) {
        const el = document.getElementById(id);
        if (el) {
            if (val === undefined || val === null || val === '') {
                el.value = '';
                return;
            }
            const isUSD = window.DocumentosComponent?.activeDoc?.data?.moneda === 'USD';
            if (isUSD) {
                const num = parseFloat(val) || 0;
                el.value = num.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            } else {
                let str = String(val).replace(/\D/g, '');
                if (str.length > 1) {
                    str = str.replace(/^0+/, '');
                }
                el.value = str.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
            }
        }
    }
};

// ─── ELIMINACIÓN GLOBAL ──────────────────────────────────────
// Expuesta como función suelta para compatibilidad con onclick="promptGlobalDelete(...)"

export function promptGlobalDelete(id, type, name, extra = '') {
    document.getElementById('udm-id').value = id;
    document.getElementById('udm-type').value = type;
    document.getElementById('udm-extra').value = extra;
    document.getElementById('udm-name').innerText = name;
    document.getElementById('udm-motivo').value = '';

    let message = "";
    if (type === 'plan') message = "Se eliminará este plan. Asegúrate de que no haya reservas activas vinculadas a él.";
    if (type === 'cliente') message = "Se eliminará la reserva de este cliente y todo su historial de abonos. Esta acción es irreversible.";
    if (type === 'proveedor') message = "Se eliminará este proveedor y todo su catálogo de servicios de la base de datos.";
    if (type === 'abono') message = "Se eliminará este abono registrado. El saldo del cliente se recalculará automáticamente.";
    if (type === 'gasto_salida') message = "Se eliminará este gasto operativo. Los reportes de rentabilidad y costos se verán afectados.";
    if (type === 'proveedor_pago_salida') message = "Se eliminará este abono a proveedor de Matriz Base. Los balances de caja y conciliación se verán afectados.";
    if (type === 'gasto_corporativo') message = "Se eliminará este gasto de la corporación / sociedad.";
    if (type === 'socio_movimiento') message = "Se eliminará este movimiento o retiro de socio.";

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
    const extra = document.getElementById('udm-extra').value;
    const motivo = document.getElementById('udm-motivo').value.trim();
    const btn = document.getElementById('udm-confirm-btn');

    if (!motivo) {
        UI.showToast("La justificación es obligatoria para completar la eliminación.", "error");
        return;
    }

    const prevHtml = btn.innerHTML;
    btn.innerHTML = '<i class="ph ph-spinner animate-spin text-xl"></i>';
    btn.disabled = true;

    try {
        if (type === 'plan') {
            await window.DataService.deletePlan(id, motivo);
            UI.showToast("Plan eliminado del catálogo.", "success");
        } else if (type === 'cliente') {
            await window.DataService.deleteCliente(id, motivo);
            // DashboardComponent se actualiza automáticamente vía Store
            const detailModal = document.getElementById('client-detail-modal');
            if (document.getElementById('cdm-bg') && !document.getElementById('cdm-bg').classList.contains('hidden')) {
                UI.closeModal('client-detail-modal', 'cdm-bg', 'cdm-content');
            }
            UI.showToast("Reserva y abonos del cliente eliminados.", "success");
        } else if (type === 'proveedor') {

            await window.DataService.deleteProveedor(id, motivo);
            UI.showToast("Proveedor eliminado correctamente.", "success");
        } else if (type === 'abono') {
            await window.DataService.deleteAbono(id, extra, motivo);
            UI.showToast("Abono eliminado correctamente.", "success");
        } else if (type === 'gasto_salida') {
            await window.DataService.deleteGastoSalida(id, motivo);
            UI.showToast("Gasto operativo eliminado correctamente.", "success");
        } else if (type === 'proveedor_pago_salida') {
            await window.DataService.deleteProveedorPagoSalida(id, motivo);
            UI.showToast("Pago de proveedor eliminado correctamente.", "success");
        } else if (type === 'gasto_corporativo') {
            await window.DataService.deleteGastoCorporativo(id, motivo);
            UI.showToast("Gasto corporativo de socio eliminado correctamente.", "success");
        } else if (type === 'socio_movimiento') {
            await window.DataService.deleteSocioMovimiento(id, motivo);
            UI.showToast("Movimiento de socio eliminado correctamente.", "success");
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
