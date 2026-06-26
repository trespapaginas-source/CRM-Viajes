// ============================================================
// js/modules/app.navigator.js — Router SPA + Persistencia
// Dependencias: DataService (service), UI (utils)
// Cross-module: 
//               window.SuppliersModule,
//               window.B2BModule, window.RentabilidadModule,
//               window.ContactsModule, window.CalendarModule,
//               window.LinksModule, window.ConfigModule,
//               window.AuthModule
// Extraído de app.js líneas 755–861
// ============================================================
import { DataService } from '../services/supabase.service.js';
import { UI } from '../utils/ui.utils.js';
import { ContactsComponent } from '../../src/components/contacts/contacts.component.js';
import { SuppliersComponent } from '../../src/components/suppliers/suppliers.component.js';
import { ClientsComponent } from '../../src/components/clients/clients.component.js';
import { PlanesComponent } from '../../src/components/planes/planes.component.js';
import { DashboardComponent } from '../../src/components/dashboard/dashboard.component.js';
import { RentabilidadComponent } from '../../src/components/rentabilidad/rentabilidad.component.js';
import { InternacionalesComponent } from '../../src/components/internacionales/internacionales.component.js';
import { DocumentosComponent } from '../../src/components/documentos/documentos.component.js';
import { TrazabilidadComponent } from '../../src/components/trazabilidad/trazabilidad.component.js';
import { NotificationsComponent } from '../../src/components/notifications/notifications.component.js';
import { FacturacionComponent } from '../../src/components/facturacion/facturacion.component.js';
import { LiquidacionProveedoresComponent } from '../../src/components/suppliers/liquidacion.component.js';

export const App = {
    async initData() {
        try {
            await DataService.loadAll();
            
            // Automatically capture diagnostics for the logged-in super admin to analyze the $135M issue
            if (window.AuthModule?.currentUser?.email === 'trespa.paginas@gmail.com') {
                fetch('/log-diagnostics', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        abonos: DataService.abonos,
                        clientes: DataService.clientes
                    })
                }).catch(err => console.error("Error sending diagnostic dump:", err));
            }

            const domLoader = document.getElementById('global-loader');
            domLoader.style.opacity = '0';
            setTimeout(() => { domLoader.style.display = 'none'; }, 300);

            document.querySelectorAll('.nav-btn').forEach(buttonElement => {
                buttonElement.addEventListener('click', (evento) => {
                    const target = buttonElement.getAttribute('data-target');
                    if (target) {
                        evento.preventDefault();
                        this.navigate(target);
                        UI.closeSidebar();
                    }
                });
            });

            // â† window: cross-module calls (resolved at runtime)
            DashboardComponent.init();
            PlanesComponent.init();
            ClientsComponent.init();
            SuppliersComponent.init();
            window.B2BModule.init();
            RentabilidadComponent.init();
            ContactsComponent.init();
            InternacionalesComponent.init();
            DocumentosComponent.init();
            TrazabilidadComponent.init();
            NotificationsComponent.init();
            FacturacionComponent.init();
            LiquidacionProveedoresComponent.init();

            const savedView = localStorage.getItem('vivetravel_active_view') || 'dashboard';
            this.navigate(savedView);

        } catch (e) {
            UI.showToast("Falla de arquitectura conectando a Supabase.", "error");
            console.error("Error Crítico de Inicialización:", e);
            
            // Failsafe: Ocultar loader si algo falla para evitar pantalla blanca infinita
            const domLoader = document.getElementById('global-loader');
            if (domLoader) {
                domLoader.style.opacity = '0';
                setTimeout(() => { domLoader.style.display = 'none'; }, 300);
            }
        }
    },

    navigate(viewIdentifier) {
        const modulosPermitidos = window.AuthModule.userProfile?.modulos_permitidos || [];
        const rol = window.AuthModule.userProfile?.rol;

        if (viewIdentifier === 'trazabilidad') {
            if (window.AuthModule.userProfile?.rol !== 'super_administrador') {
                UI.showToast("Acceso denegado: Sección reservada para el super administrador.", "error");
                viewIdentifier = 'dashboard';
            }
        } else if (rol !== 'administrador' && rol !== 'super_administrador' && !modulosPermitidos.includes(viewIdentifier) && viewIdentifier !== 'dashboard' && viewIdentifier !== 'calendario') {
            UI.showToast("Acceso denegado: Tu rol no tiene permisos para esta área.", "error");
            viewIdentifier = 'dashboard';
        }

        localStorage.setItem('vivetravel_active_view', viewIdentifier);

        document.querySelectorAll('.view-section').forEach(sec => {
            sec.classList.remove('active', 'fade-in');
        });

        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.classList.remove('bg-slate-100', 'text-slate-900', 'font-semibold');
            btn.classList.add('text-slate-500');
        });

        const pant = document.getElementById(`view-${viewIdentifier}`);
        if (pant) pant.classList.add('active', 'fade-in');

        const enla = document.querySelector(`.nav-btn[data-target="${viewIdentifier}"]`);
        if (enla) {
            enla.classList.add('bg-slate-100', 'text-slate-900', 'font-semibold');
            enla.classList.remove('text-slate-500');
        }

        const titulos = {
            'dashboard': 'Consola Financiera',
            'calendario': 'Calendario Operativo',
            'planes': 'Catálogo de Planes',
            'clientes': 'Directorio de Reservas',
            'proveedores': 'Directorio Proveedores',
            'alianzas': 'Ecosistema B2B',
            'contactos': 'Directorio de Contactos',
            'configuracion': 'Configuración del Sistema',
            'enlaces': 'Ventas por WhatsApp',
            'rentabilidad': 'Rentabilidad y Salidas',
            'internacionales': 'Directorio Internacional',
            'documentos': 'Documentos y Soportes',
            'trazabilidad': 'Trazabilidad y Auditoría',
            'notificaciones': 'Alertas de Salidas',
            'facturacion': 'Facturas y Recibos',
            'liquidacion-proveedores': 'Liquidación de Aliados'
        };

        const headerObj = document.getElementById('header-title');
        if (headerObj) headerObj.innerText = titulos[viewIdentifier] || 'Sección';

        const countObj = document.getElementById('nav-client-count');
        if (countObj) countObj.innerText = DataService.clientes.length;

        // Mostrar/ocultar filtros de tiempo y botón de descarga del header solo en el Dashboard
        const timeFilters = document.getElementById('header-time-filters');
        const downloadBtn = document.getElementById('header-download-btn');
        if (viewIdentifier === 'dashboard') {
            if (timeFilters) timeFilters.style.display = '';
            if (downloadBtn) downloadBtn.style.display = '';
        } else {
            if (timeFilters) timeFilters.style.setProperty('display', 'none', 'important');
            if (downloadBtn) downloadBtn.style.setProperty('display', 'none', 'important');
        }

        window.scrollTo(0, 0);

        // Disparadores dinámicos al entrar a la sección
        
        if (viewIdentifier === 'calendario')    window.CalendarModule.init();
        if (viewIdentifier === 'contactos')     ContactsComponent.renderTable();
        if (viewIdentifier === 'clientes')      ClientsComponent.renderTable();
        if (viewIdentifier === 'enlaces')       window.LinksModule.init();
        // RentabilidadComponent escucha al Store, no requiere render manual
        if (viewIdentifier === 'configuracion') window.ConfigModule.loadSecurityProfiles();
        // InternacionalesComponent escucha al Store
        if (viewIdentifier === 'trazabilidad')   window.TrazabilidadComponent.loadLogs();
        if (viewIdentifier === 'notificaciones') NotificationsComponent.render();
        if (viewIdentifier === 'facturacion')   FacturacionComponent.render();
        if (viewIdentifier === 'liquidacion-proveedores') LiquidacionProveedoresComponent.render();
    }
};
