// ============================================================
// js/main.js — ORQUESTADOR MAESTRO | Vive Travel CRM
// Versión: Arquitectura Modular ES2024 (sin bundler)
// ============================================================

// ── 1. SERVICIOS ─────────────────────────────────────────────
import { supabaseClient, DataService }        from './services/supabase.service.js';

// ── 2. UTILIDADES ────────────────────────────────────────────
import { formatCOP, formatShortDate,
         calcularFinanzas, updateFinancialUI } from './utils/format.utils.js';
import { UI, promptGlobalDelete,
         executeGlobalDelete }                 from './utils/ui.utils.js';

// ── 3. MÓDULOS DE NEGOCIO ────────────────────────────────────
import { AuthModule }         from './modules/auth.module.js';
import { App }                from './modules/app.navigator.js';
import { DispatchModule }     from './modules/dispatch.module.js';
import { BitacoraModule }     from './modules/bitacora.module.js';


import { CalendarModule }     from './modules/calendar.module.js';
import { LinksModule }        from './modules/links.module.js';
import { ConfigModule }       from './modules/config.module.js';
import { B2BModule }          from './modules/b2b.module.js';

import { SearchModule }          from './modules/search.module.js';
import { DocumentosComponent } from '../src/components/documentos/documentos.component.js';
import { TrazabilidadComponent } from '../src/components/trazabilidad/trazabilidad.component.js';
import { PlanesComponent }       from '../src/components/planes/planes.component.js';
import { ClientsComponent }      from '../src/components/clients/clients.component.js';

// ════════════════════════════════════════════════════════════
// PUENTE GLOBAL — Necesario para onclick="" del HTML
// ════════════════════════════════════════════════════════════

window.supabaseClient     = supabaseClient;
window.DataService        = DataService;

window.formatCOP          = formatCOP;
window.formatShortDate    = formatShortDate;
window.calcularFinanzas   = calcularFinanzas;
window.updateFinancialUI  = updateFinancialUI;

window.UI                 = UI;
window.promptGlobalDelete = promptGlobalDelete;
window.executeGlobalDelete = executeGlobalDelete;

window.AuthModule         = AuthModule;
window.App                = App;
window.DispatchModule     = DispatchModule;


window.BitacoraModule     = BitacoraModule;


window.CalendarModule     = CalendarModule;
window.LinksModule        = LinksModule;
window.ConfigModule       = ConfigModule;
window.B2BModule          = B2BModule;

window.SearchModule       = SearchModule;
window.DocumentosComponent = DocumentosComponent;
window.TrazabilidadComponent = TrazabilidadComponent;
window.PlanesComponent     = PlanesComponent;
window.ClientsComponent    = ClientsComponent;

// ════════════════════════════════════════════════════════════
// ARRANQUE DEL SISTEMA
// ════════════════════════════════════════════════════════════
AuthModule.init();
SearchModule.init();
TrazabilidadComponent.init();

// Listener global ESC para cerrar modales laterales
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (!document.getElementById('client-detail-modal').classList.contains('hidden')) {
            UI.closeModal('client-detail-modal', 'cdm-bg', 'cdm-content');
        } else if (!document.getElementById('quick-service-modal').classList.contains('hidden')) {
            UI.closeModal('quick-service-modal', 'qsm-bg', 'qsm-content');
        } else if (!document.getElementById('abono-action-modal').classList.contains('hidden')) {
            UI.closeModal('abono-action-modal', 'aam-bg', 'aam-content');
        }
    }
});

// Listener global para dar formato de moneda en tiempo real a los inputs con clase .currency-input
document.addEventListener('input', (e) => {
    if (e.target && e.target.classList.contains('currency-input')) {
        window.UI.formatCurrencyElement(e.target);
    }
});

// ── 4. SUSCRIPCIÓN PARA ADVERTENCIAS DEL SISTEMA ─────────────────
import { Store } from '../src/core/store.js';

Store.subscribe((state) => {
    const bannerContainer = document.getElementById('system-warning-banners');
    if (!bannerContainer) return;

    const rol = window.AuthModule?.userProfile?.rol;
    const isAdmin = rol === 'administrador' || rol === 'super_administrador';
    
    let html = '';
    let hasWarnings = false;

    // 1. Advertencia de Tabla de Historial Faltante (Solo visible para Admin/SuperAdmin)
    if (state.historyTableMissing && isAdmin) {
        hasWarnings = true;
        html += `
            <div class="bg-rose-50 border border-rose-100/80 text-rose-800 p-4 rounded-2xl flex items-start gap-3 shadow-[0_1px_2px_rgba(244,63,94,0.05)]">
                <i class="ph ph-shield-warning text-rose-600 text-lg shrink-0 mt-0.5 animate-pulse"></i>
                <div class="flex-1">
                    <p class="text-[10px] font-black text-rose-800 uppercase tracking-wider">Advertencia de Seguridad e Historial</p>
                    <p class="text-xs font-semibold text-slate-800 mt-0.5">
                        La tabla <code class="bg-rose-100/60 px-1.5 py-0.5 rounded font-mono text-[10px]">historial_reservas</code> no existe en la base de datos Supabase. Se han deshabilitado los registros de auditoría de actividad. Contacte al administrador principal.
                    </p>
                </div>
            </div>
        `;
    }

    // 2. Advertencia de Capacidad de Carga
    if (state.limitWarnings) {
        const warnings = [];
        if (state.limitWarnings.clientes) warnings.push('Clientes (límite: 10.000)');
        if (state.limitWarnings.abonos) warnings.push('Abonos (límite: 20.000)');
        if (state.limitWarnings.gastos) warnings.push('Gastos (límite: 10.000)');

        if (warnings.length > 0) {
            hasWarnings = true;
            html += `
                <div class="bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-2xl flex items-start gap-3 shadow-[0_1px_2px_rgba(245,158,11,0.05)]">
                    <i class="ph ph-warning-circle text-amber-600 text-lg shrink-0 mt-0.5"></i>
                    <div class="flex-1">
                        <p class="text-[10px] font-black text-amber-800 uppercase tracking-wider">Advertencia de Capacidad de Datos</p>
                        <p class="text-xs font-semibold text-slate-800 mt-0.5">
                            Se ha completado el límite máximo de carga para: <strong class="text-slate-900">${warnings.join(', ')}</strong>. Algunos registros antiguos podrían no ser visibles. Contacte al administrador para archivar datos históricos de años anteriores.
                        </p>
                    </div>
                </div>
            `;
        }
    }

    if (hasWarnings) {
        bannerContainer.innerHTML = html;
        bannerContainer.classList.remove('hidden');
    } else {
        bannerContainer.innerHTML = '';
        bannerContainer.classList.add('hidden');
    }
});
