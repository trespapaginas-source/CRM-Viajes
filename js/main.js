// ============================================================
// js/main.js — ORQUESTADOR MAESTRO | Travelers CRM
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

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// PUENTE GLOBAL — Necesario para onclick="" del HTML
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

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

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// ARRANQUE DEL SISTEMA
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
AuthModule.init();
SearchModule.init();

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
