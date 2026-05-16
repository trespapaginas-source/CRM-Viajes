// ============================================================
// js/modules/search.module.js — Buscador Omnicanal (Spotlight)
// Dependencias: DataService (service), UI (utils)
// ============================================================
import { DataService } from '../services/supabase.service.js';
import { UI } from '../utils/ui.utils.js';
import { ClientsComponent } from '../../src/components/clients/clients.component.js';
import { PlanesComponent } from '../../src/components/planes/planes.component.js';
import { InternacionalesComponent } from '../../src/components/internacionales/internacionales.component.js';

export const SearchModule = {
    isOpen: false,
    
    init() {
        this.injectHTML();
        this.setupListeners();
    },

    injectHTML() {
        const modalHtml = `
            <div id="omnisearch-modal" class="fixed inset-0 z-[9999] hidden items-start justify-center pt-[10vh] sm:pt-[15vh] px-4">
                <div id="omnisearch-bg" class="absolute inset-0 bg-slate-900/60 backdrop-blur-sm opacity-0 transition-opacity duration-200" onclick="window.SearchModule.closeModal()"></div>
                <div id="omnisearch-content" class="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden transform scale-95 opacity-0 transition-all duration-200 flex flex-col max-h-[75vh] border border-slate-200/50">
                    <div class="flex items-center px-5 py-4 border-b border-slate-100 bg-slate-50/50">
                        <i class="ph ph-magnifying-glass text-2xl text-primary-500 mr-3"></i>
                        <input type="text" id="omnisearch-input" autocomplete="off" class="w-full bg-transparent text-lg font-black text-slate-800 placeholder-slate-400 outline-none" placeholder="Buscar clientes, aliados, planes, ciudades...">
                        <span class="hidden sm:flex items-center text-[9px] font-black uppercase tracking-widest text-slate-400 bg-white px-2 py-1 rounded-lg border border-slate-200 ml-3 shrink-0 shadow-sm">ESC</span>
                    </div>
                    <div id="omnisearch-results" class="overflow-y-auto flex-1 custom-scrollbar bg-white">
                        <div class="py-12 text-center flex flex-col items-center justify-center">
                            <div class="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-3 border border-slate-100">
                                <i class="ph ph-magic-wand text-2xl text-slate-300"></i>
                            </div>
                            <p class="text-sm font-bold text-slate-400">Escribe para buscar en todo el CRM...</p>
                        </div>
                    </div>
                    <div class="px-5 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[9px] text-slate-400 font-black uppercase tracking-widest">
                        <span class="flex items-center gap-1.5"><i class="ph ph-keyboard text-sm"></i> Navegación Rápida</span>
                        <span class="flex items-center gap-1.5">Omnisearch v1.0 <i class="ph ph-lightning text-yellow-500 text-sm"></i></span>
                    </div>
                </div>
            </div>
        `;

        const floatBtnHtml = `
            <button onclick="window.SearchModule.toggleModal()" class="fixed bottom-6 right-6 z-[60] bg-slate-900 text-white p-3.5 rounded-2xl shadow-xl shadow-slate-900/20 hover:-translate-y-1 hover:shadow-2xl hover:shadow-slate-900/30 transition-all group flex items-center gap-2 border border-slate-700 overflow-hidden">
                <i class="ph ph-magnifying-glass text-xl"></i>
                <span class="hidden md:inline text-[10px] font-black uppercase tracking-widest text-slate-300 border-l border-slate-700 pl-2">Ctrl+K</span>
            </button>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
        document.body.insertAdjacentHTML('beforeend', floatBtnHtml);
    },

    setupListeners() {
        document.addEventListener('keydown', (e) => {
            // Interceptar Ctrl+K o Cmd+K
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                this.toggleModal();
            }
            // Cerrar con ESC
            if (e.key === 'Escape' && this.isOpen) {
                this.closeModal();
            }
        });

        const input = document.getElementById('omnisearch-input');
        input.addEventListener('input', (e) => this.handleSearch(e.target.value));
    },

    toggleModal() {
        if (this.isOpen) this.closeModal();
        else this.openModal();
    },

    openModal() {
        this.isOpen = true;
        const modal = document.getElementById('omnisearch-modal');
        const bg = document.getElementById('omnisearch-bg');
        const content = document.getElementById('omnisearch-content');
        const input = document.getElementById('omnisearch-input');

        modal.classList.remove('hidden');
        modal.classList.add('flex');
        
        // Reflow for transition
        void modal.offsetWidth;

        bg.classList.remove('opacity-0');
        content.classList.remove('scale-95', 'opacity-0');
        content.classList.add('scale-100', 'opacity-100');

        input.value = '';
        document.getElementById('omnisearch-results').innerHTML = `
            <div class="py-12 text-center flex flex-col items-center justify-center fade-in">
                <div class="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-3 border border-slate-100">
                    <i class="ph ph-magic-wand text-2xl text-slate-300"></i>
                </div>
                <p class="text-sm font-bold text-slate-400">Escribe para buscar en todo el CRM...</p>
            </div>
        `;
        
        setTimeout(() => input.focus(), 100);
    },

    closeModal() {
        this.isOpen = false;
        const modal = document.getElementById('omnisearch-modal');
        const bg = document.getElementById('omnisearch-bg');
        const content = document.getElementById('omnisearch-content');

        bg.classList.add('opacity-0');
        content.classList.remove('scale-100', 'opacity-100');
        content.classList.add('scale-95', 'opacity-0');

        setTimeout(() => {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        }, 200);
    },

    handleSearch(query) {
        const resultsContainer = document.getElementById('omnisearch-results');
        const q = query.toLowerCase().trim();

        if (q.length < 2) {
            resultsContainer.innerHTML = `
                <div class="py-12 text-center flex flex-col items-center justify-center">
                    <div class="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-3 border border-slate-100">
                        <i class="ph ph-keyboard text-2xl text-slate-300"></i>
                    </div>
                    <p class="text-sm font-bold text-slate-400">Ingresa al menos 2 letras para buscar...</p>
                </div>
            `;
            return;
        }

        const results = [];

        // 1. CLIENTES (Prioridad Alta)
        const clientesStr = DataService.clientes.filter(c => 
            (c.nombre && c.nombre.toLowerCase().includes(q)) || 
            (c.apellido && c.apellido.toLowerCase().includes(q)) ||
            (c.documento && c.documento.includes(q)) ||
            (c.telefono && c.telefono.includes(q)) ||
            (c.email && c.email.toLowerCase().includes(q))
        ).slice(0, 5); // Max 5

        clientesStr.forEach(c => {
            results.push({
                type: 'cliente',
                id: c.id,
                title: `${c.nombre} ${c.apellido || ''}`.trim(),
                subtitle: `Documento: ${c.documento || 'N/D'} • Cel: ${c.telefono || 'N/D'} • ${c.ciudad || 'Sin ciudad'}`,
                icon: 'ph-user-focus',
                color: 'text-blue-600 bg-blue-50 border-blue-200',
                action: () => {
                    this.closeModal();
                    if(c.tipo_reserva === 'Internacional') {
                        window.App.navigate('internacionales');
                        if (InternacionalesComponent && InternacionalesComponent.editInternacional) {
                            InternacionalesComponent.editInternacional(c.id);
                        }
                    } else {
                        window.App.navigate('clientes');
                        ClientsComponent.openDetailModal(c.id);
                    }
                }
            });
        });

        // 2. B2B ALIADOS
        const aliados = DataService.b2b_aliados.filter(a => 
            (a.nombre_empresa && a.nombre_empresa.toLowerCase().includes(q)) ||
            (a.contacto_nombre && a.contacto_nombre.toLowerCase().includes(q)) ||
            (a.telefono && a.telefono.includes(q))
        ).slice(0, 3); // Max 3

        aliados.forEach(a => {
            results.push({
                type: 'aliado',
                id: a.id,
                title: a.nombre_empresa,
                subtitle: `Contacto: ${a.contacto_nombre || 'N/A'} • ${a.telefono || 'N/A'}`,
                icon: 'ph-buildings',
                color: 'text-indigo-600 bg-indigo-50 border-indigo-200',
                action: () => {
                    this.closeModal();
                    window.App.navigate('alianzas');
                    if (window.B2BModule && window.B2BModule.openAliadoMaster) {
                        window.B2BModule.openAliadoMaster(a.id);
                    }
                }
            });
        });

        // 3. PLANES / DESTINOS
        const planes = DataService.planes.filter(p => 
            (p.nombre && p.nombre.toLowerCase().includes(q)) ||
            (p.destino && p.destino.toLowerCase().includes(q))
        ).slice(0, 3); // Max 3

        planes.forEach(p => {
            results.push({
                type: 'plan',
                id: p.id,
                title: p.nombre,
                subtitle: `Destino: ${p.destino || 'Abierto'} • ${p.dias || 0} Días`,
                icon: 'ph-map-trifold',
                color: 'text-emerald-600 bg-emerald-50 border-emerald-200',
                action: () => {
                    this.closeModal();
                    window.App.navigate('planes');
                    PlanesComponent.openFormModal(p.id);
                }
            });
        });

        this.renderResults(resultsContainer, results);
    },

    renderResults(container, results) {
        if (results.length === 0) {
            container.innerHTML = `
                <div class="py-12 text-center flex flex-col items-center justify-center fade-in">
                    <div class="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mb-3 border border-red-100">
                        <i class="ph ph-magnifying-glass text-2xl text-red-400"></i>
                    </div>
                    <p class="text-sm font-black text-slate-800">No hay coincidencias</p>
                    <p class="text-xs font-bold text-slate-400 mt-1">Intenta buscar con otras palabras o un documento distinto.</p>
                </div>
            `;
            return;
        }

        let html = '<ul class="p-3 space-y-1.5 fade-in">';
        results.forEach((r, idx) => {
            // Bind global
            window[`__omnisearch_action_${idx}`] = r.action;
            
            html += `
                <li onclick="window.__omnisearch_action_${idx}()" class="flex items-center p-3 sm:p-4 hover:bg-slate-50 hover:shadow-sm rounded-2xl cursor-pointer transition-all border border-transparent hover:border-slate-200 group">
                    <div class="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 border shadow-inner ${r.color}">
                        <i class="ph ${r.icon} text-2xl"></i>
                    </div>
                    <div class="ml-4 flex-1 overflow-hidden">
                        <p class="text-[15px] font-black text-slate-800 truncate group-hover:text-primary-600 transition-colors leading-tight">${UI.sanitize(r.title)}</p>
                        <p class="text-[11px] font-bold text-slate-400 truncate mt-1 tracking-wide">${UI.sanitize(r.subtitle)}</p>
                    </div>
                    <div class="opacity-0 group-hover:opacity-100 transition-opacity pl-3 shrink-0">
                        <span class="bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm text-[10px] font-black text-slate-600 uppercase tracking-widest flex items-center gap-1.5">
                            Abrir <i class="ph ph-arrow-right text-primary-500 text-sm"></i>
                        </span>
                    </div>
                </li>
            `;
        });
        html += '</ul>';
        container.innerHTML = html;
    }
};
