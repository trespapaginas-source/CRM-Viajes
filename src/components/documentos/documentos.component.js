import { Store } from '../../core/store.js';
import { DataService } from '../../../js/services/supabase.service.js';
import { UI } from '../../../js/utils/ui.utils.js';

const DocumentosComponent = {
    settings: {
        logo: 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png',
        color1: '#005C7A', // Teal / Cyan oscuro elegante
        color2: '#2563eb', // Blue 600
        razon: 'Vive Travel S.A.S',
        subtitulo: 'Servicios Turísticos',
        nit: '900.000.000-1',
        rnt: '123456',
        tel: '+57 300 000 0000',
        dir: 'Calle 78 No 78 - 78, Barranquilla',
        terms: 'Las tarifas están sujetas a disponibilidad y cambios sin previo aviso. La reserva requiere un abono inicial según las políticas del plan.'
    },

    activeDoc: null,
    planesDisponibles: [],
    reservasDisponibles: [],

    init: async function () {
        this.loadSettings();
        
        // Inicializar documento en blanco
        this.resetActiveDoc();
        
        this.loadSavedDocsList();
        
        // Rellenar DOM e inicializar listas y previsualización
        this.fillDOMFromActiveDoc();
        this.renderEditorLists();
        this.recalculate();
        this.renderPreview();
        
        await this.loadCRMData();

        // Suscribirse reactivamente al Store de datos
        Store.subscribe(async (state) => {
            await this.loadCRMData();
            this.renderPreview();
        });
    },

    loadSettings: function () {
        const saved = localStorage.getItem('crm_doc_settings');
        if (saved) {
            this.settings = { ...this.settings, ...JSON.parse(saved) };
        }
        
        const setVal = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.value = val;
        };
        setVal('setting_logo', this.settings.logo || '');
        setVal('setting_color1', this.settings.color1 || '#005C7A');
        setVal('setting_color2', this.settings.color2 || '#2563eb');
        setVal('setting_razon', this.settings.razon || '');
        setVal('setting_subtitulo', this.settings.subtitulo || '');
        setVal('setting_nit', this.settings.nit || '');
        setVal('setting_rnt', this.settings.rnt || '');
        setVal('setting_tel', this.settings.tel || '');
        setVal('setting_dir', this.settings.dir || '');
        setVal('setting_terms', this.settings.terms || '');
    },

    saveSettings: function () {
        const getVal = (id) => {
            const el = document.getElementById(id);
            return el ? el.value : '';
        };
        this.settings = {
            logo: getVal('setting_logo'),
            color1: getVal('setting_color1'),
            color2: getVal('setting_color2'),
            razon: getVal('setting_razon'),
            subtitulo: getVal('setting_subtitulo'),
            nit: getVal('setting_nit'),
            rnt: getVal('setting_rnt'),
            tel: getVal('setting_tel'),
            dir: getVal('setting_dir'),
            terms: getVal('setting_terms')
        };
        localStorage.setItem('crm_doc_settings', JSON.stringify(this.settings));
        UI.closeModal('modal-settings-marca', 'msm-bg', 'msm-content');
        this.renderPreview();
        UI.showToast('Configuración de marca guardada correctamente.', 'success');
    },

    openSettings: function () {
        UI.openModal('modal-settings-marca', 'msm-bg', 'msm-content');
    },

    loadSavedDocsList: function() {
        const select = document.getElementById('saved_docs_select');
        if (!select) return;
        const saved = localStorage.getItem('crm_saved_documentos');
        const docs = saved ? JSON.parse(saved) : [];
        
        select.innerHTML = '<option value="">-- Cargar Borrador --</option>';
        docs.forEach(doc => {
            const option = document.createElement('option');
            option.value = doc.id;
            option.textContent = `${doc.type === 'cotizacion' ? 'Cotización' : 'Soporte'} - ${doc.name}`;
            select.appendChild(option);
        });
        if (this.activeDoc && this.activeDoc.id) {
            select.value = this.activeDoc.id;
        }
    },

    resetActiveDoc: function() {
        this.activeDoc = {
            id: null,
            name: '',
            type: 'soporte',
            data: {
                titulo_documento: 'SOPORTE DE PAGO',
                fecha_emision: new Date().toISOString().split('T')[0],
                sello_texto: 'PAGO PARCIAL',
                sello_subtexto: 'RESERVA ACTIVA',
                titulo_viajero: 'INFORMACIÓN DEL VIAJERO',
                titulo_plan: 'RESUMEN DEL PLAN COMERCIAL',
                titulo_servicios: 'SERVICIOS PRINCIPALES INCLUIDOS',
                titulo_tours: 'TOURS Y EXPERIENCIAS PROGRAMADAS',
                titulo_adicionales: 'Servicios Adicionales (Fuera de Plan)',
                titulo_pagos: 'Canales de Pago Autorizados',
                
                cliente_nombre: '',
                cliente_id: '',
                cliente_tel: '',
                cliente_email: '',
                
                destino: '',
                fechas: '',
                duracion: '',
                pasajeros: '',
                
                servicios_principales: [
                    { categoria: 'Transporte Aéreo', descripcion: 'Vuelos de ida y regreso con equipaje incluido.' },
                    { categoria: 'Alojamiento', descripcion: 'Estadía en hotel seleccionado con desayuno diario.' },
                    { categoria: 'Alimentación', descripcion: 'Desayunos diarios en el alojamiento.' }
                ],
                tours_actividades: [
                    { experiencia: 'Tours y Excursiones', descripcion: 'Entradas y traslados compartidos para las excursiones.' }
                ],
                servicios_adicionales: [],
                
                paquete_valor: 0,
                metodo_pago: 'Transferencia Bancaria',
                pago_titular: 'Vive Travel Col',
                pago_entidad: 'Bancolombia',
                pago_cuenta: 'Ahorros ****789',
                pago_referencia: '',
                
                abonos: [],
                condiciones: [
                    {
                        titulo: 'Validez y Condiciones Comerciales',
                        descripcion: 'Este documento constituye el soporte formal de pago. Los servicios listados están confirmados y sujetos a las políticas de los proveedores finales. Por favor, presentar este documento junto con su identificación original al momento de utilizar los servicios.'
                    },
                    {
                        titulo: 'Políticas de Cancelación / Penalidades',
                        descripcion: 'Cambios o cancelaciones están sujetos a penalidades según el operador (aerolíneas, hoteles, etc.). Cancelaciones con menos de 15 días de anticipación conllevan una penalidad del 100% del valor pagado. No hay reembolsos por servicios no utilizados de manera voluntaria por el pasajero.'
                    }
                ]
            }
        };
    },

    newBlankDocument: function() {
        this.resetActiveDoc();
        this.fillDOMFromActiveDoc();
        this.renderEditorLists();
        this.recalculate();
        this.renderPreview();
        const select = document.getElementById('saved_docs_select');
        if (select) select.value = '';
        UI.showToast("Nuevo borrador en blanco iniciado.", "info");
    },

    saveActiveDocument: function() {
        this.onInputChanged();

        if (!this.activeDoc.id) {
            const docName = prompt("Escribe un nombre para este borrador de cotización/soporte:", `${this.activeDoc.data.cliente_nombre || 'Borrador'} - ${this.activeDoc.data.destino || 'Sin Destino'}`);
            if (docName === null) return;
            this.activeDoc.id = Date.now().toString();
            this.activeDoc.name = docName.trim() || `Borrador #${this.activeDoc.id.substring(8)}`;
        }

        const saved = localStorage.getItem('crm_saved_documentos');
        let docs = saved ? JSON.parse(saved) : [];
        
        const existingIdx = docs.findIndex(doc => doc.id === this.activeDoc.id);
        if (existingIdx !== -1) {
            docs[existingIdx] = this.activeDoc;
        } else {
            docs.push(this.activeDoc);
        }

        localStorage.setItem('crm_saved_documentos', JSON.stringify(docs));
        this.loadSavedDocsList();
        UI.showToast("Borrador guardado en la biblioteca local.", "success");
    },

    loadSavedDocument: function(id) {
        if (!id) return;
        const saved = localStorage.getItem('crm_saved_documentos');
        const docs = saved ? JSON.parse(saved) : [];
        const doc = docs.find(d => d.id === id);
        if (doc) {
            this.activeDoc = doc;
            this.fillDOMFromActiveDoc();
            this.renderEditorLists();
            this.recalculate();
            this.renderPreview();
            UI.showToast(`Documento "${doc.name}" cargado al editor.`, "success");
        }
    },

    deleteActiveDocument: function() {
        const select = document.getElementById('saved_docs_select');
        const id = select.value;
        if (!id) {
            UI.showToast("Selecciona un borrador guardado para eliminar.", "error");
            return;
        }

        if (!confirm("¿Estás seguro de que deseas eliminar permanentemente este borrador?")) return;

        const saved = localStorage.getItem('crm_saved_documentos');
        let docs = saved ? JSON.parse(saved) : [];
        docs = docs.filter(d => d.id !== id);
        localStorage.setItem('crm_saved_documentos', JSON.stringify(docs));

        this.newBlankDocument();
        this.loadSavedDocsList();
        UI.showToast("Borrador eliminado de la biblioteca.", "success");
    },

    async loadCRMData() {
        try {
            // Cargar reservas desde DataService (Supabase cache)
            const selectRes = document.getElementById('crm_reserva_select');
            if (selectRes) {
                const currentVal = selectRes.value;
                selectRes.innerHTML = '<option value="">-- Seleccionar Reserva --</option>';
                const clientes = DataService.clientes || [];
                clientes.forEach(c => {
                    const option = document.createElement('option');
                    option.value = c.id;
                    const plan = DataService.planes.find(p => p.id === c.plan_id);
                    const planNom = plan ? plan.nombre : 'Plan Genérico';
                    option.textContent = `${c.dni || 'CC'} - ${c.nombre} ${c.apellido || ''} (${planNom})`;
                    selectRes.appendChild(option);
                });
                if (currentVal) selectRes.value = currentVal;
            }

            // Cargar planes
            const selectPlan = document.getElementById('crm_plan_select');
            if (selectPlan) {
                const currentVal = selectPlan.value;
                selectPlan.innerHTML = '<option value="">-- Seleccionar Plan --</option>';
                const planes = DataService.planes || [];
                planes.forEach(p => {
                    const option = document.createElement('option');
                    option.value = p.id;
                    option.textContent = `${p.nombre} (${p.destino || 'Destino'})`;
                    selectPlan.appendChild(option);
                });
                if (currentVal) selectPlan.value = currentVal;
            }
        } catch (e) {
            console.error("Error al cargar datos CRM:", e);
        }
    },

    loadFromReserva: function(id) {
        if (!id) return;
        const c = DataService.clientes.find(item => item.id == id);
        if (!c) return;

        this.activeDoc.data.cliente_nombre = `${c.nombre} ${c.apellido || ''}`.trim();
        this.activeDoc.data.cliente_id = c.dni || '';
        this.activeDoc.data.cliente_tel = c.telefono || '';
        this.activeDoc.data.cliente_email = c.email || '';

        const plan = DataService.planes.find(p => p.id === c.plan_id);
        if (plan) {
            this.activeDoc.data.destino = plan.destino || plan.nombre;
            this.activeDoc.data.duracion = plan.duracion || '4 Días / 3 Noches';
            this.activeDoc.data.fechas = c.fecha_viaje ? this.formatDate(c.fecha_viaje) : '';
            this.activeDoc.data.pasajeros = `${c.pax || 1} Viajero(s)`;
        }

        this.activeDoc.data.paquete_valor = Number(c.precio_total) || 0;
        this.activeDoc.data.pago_referencia = `Reserva CC ${c.dni || ''}`;

        // Cargar abonos desde la base de datos para este cliente
        const rawAbonos = DataService.abonos || [];
        const confirmedAbonos = rawAbonos.filter(a => a.cliente_id === c.id && a.estado_pago !== 'pending' && a.estado_pago !== 'refunded');
        
        this.activeDoc.data.abonos = confirmedAbonos.map(a => {
            let dateStr = '';
            if (a.created_at) {
                dateStr = new Date(a.created_at).toLocaleDateString('es-ES');
            } else {
                dateStr = new Date().toLocaleDateString('es-ES');
            }
            return {
                fecha: dateStr,
                monto: Number(a.monto) || 0
            };
        });

        this.fillDOMFromActiveDoc();
        this.renderEditorLists();
        this.recalculate();
        this.renderPreview();
        
        // Reset selector
        document.getElementById('crm_reserva_select').value = '';
        UI.showToast("Datos de la reserva y abonos cargados exitosamente.", "success");
    },

    loadFromPlan: function(id) {
        if (!id) return;
        const plan = DataService.planes.find(p => p.id == id);
        if (!plan) return;

        this.activeDoc.data.destino = plan.destino || plan.nombre;
        this.activeDoc.data.duracion = plan.duracion || '4 Días / 3 Noches';
        this.activeDoc.data.paquete_valor = Number(plan.precio_persona) || 0;

        this.fillDOMFromActiveDoc();
        this.renderEditorLists();
        this.recalculate();
        this.renderPreview();
        
        // Reset selector
        document.getElementById('crm_plan_select').value = '';
        UI.showToast("Tarifas y destino del plan cargados al documento.", "success");
    },

    fillDOMFromActiveDoc: function() {
        const getEl = (id) => document.getElementById(id);
        
        if (getEl('doc_type')) getEl('doc_type').value = this.activeDoc.type;
        if (getEl('doc_titulo_documento')) {
            getEl('doc_titulo_documento').value = this.activeDoc.data.titulo_documento || (this.activeDoc.type === 'cotizacion' ? 'COTIZACIÓN PREMIUM' : 'SOPORTE DE PAGO');
        }
        if (getEl('doc_fecha_emision')) getEl('doc_fecha_emision').value = this.activeDoc.data.fecha_emision || '';
        if (getEl('doc_sello_texto')) getEl('doc_sello_texto').value = this.activeDoc.data.sello_texto || '';
        if (getEl('doc_sello_subtexto')) getEl('doc_sello_subtexto').value = this.activeDoc.data.sello_subtexto || '';
        
        if (getEl('doc_titulo_viajero')) getEl('doc_titulo_viajero').value = this.activeDoc.data.titulo_viajero !== undefined ? this.activeDoc.data.titulo_viajero : 'INFORMACIÓN DEL VIAJERO';
        if (getEl('doc_titulo_plan')) getEl('doc_titulo_plan').value = this.activeDoc.data.titulo_plan !== undefined ? this.activeDoc.data.titulo_plan : 'RESUMEN DEL PLAN COMERCIAL';
        if (getEl('doc_titulo_servicios')) getEl('doc_titulo_servicios').value = this.activeDoc.data.titulo_servicios !== undefined ? this.activeDoc.data.titulo_servicios : 'SERVICIOS PRINCIPALES INCLUIDOS';
        if (getEl('doc_titulo_tours')) getEl('doc_titulo_tours').value = this.activeDoc.data.titulo_tours !== undefined ? this.activeDoc.data.titulo_tours : 'TOURS Y EXPERIENCIAS PROGRAMADAS';
        if (getEl('doc_titulo_adicionales')) getEl('doc_titulo_adicionales').value = this.activeDoc.data.titulo_adicionales !== undefined ? this.activeDoc.data.titulo_adicionales : 'Servicios Adicionales (Fuera de Plan)';
        if (getEl('doc_titulo_pagos')) getEl('doc_titulo_pagos').value = this.activeDoc.data.titulo_pagos !== undefined ? this.activeDoc.data.titulo_pagos : 'Canales de Pago Autorizados';

        if (getEl('doc_cliente_nombre')) getEl('doc_cliente_nombre').value = this.activeDoc.data.cliente_nombre || '';
        if (getEl('doc_cliente_id')) getEl('doc_cliente_id').value = this.activeDoc.data.cliente_id || '';
        if (getEl('doc_cliente_tel')) getEl('doc_cliente_tel').value = this.activeDoc.data.cliente_tel || '';
        if (getEl('doc_cliente_email')) getEl('doc_cliente_email').value = this.activeDoc.data.cliente_email || '';
        
        if (getEl('doc_destino')) getEl('doc_destino').value = this.activeDoc.data.destino || '';
        if (getEl('doc_fechas')) getEl('doc_fechas').value = this.activeDoc.data.fechas || '';
        if (getEl('doc_duracion')) getEl('doc_duracion').value = this.activeDoc.data.duracion || '';
        if (getEl('doc_pasajeros')) getEl('doc_pasajeros').value = this.activeDoc.data.pasajeros || '';

        if (getEl('doc_metodo_pago')) getEl('doc_metodo_pago').value = this.activeDoc.data.metodo_pago || '';
        if (getEl('doc_pago_titular')) getEl('doc_pago_titular').value = this.activeDoc.data.pago_titular || '';
        if (getEl('doc_pago_entidad')) getEl('doc_pago_entidad').value = this.activeDoc.data.pago_entidad || '';
        if (getEl('doc_pago_cuenta')) getEl('doc_pago_cuenta').value = this.activeDoc.data.pago_cuenta || '';
        if (getEl('doc_pago_referencia')) getEl('doc_pago_referencia').value = this.activeDoc.data.pago_referencia || '';

        if (getEl('doc_paquete_valor')) getEl('doc_paquete_valor').value = this.activeDoc.data.paquete_valor || 0;

        // Backward compatibility: map legacy conditions to the new array structure
        if (!this.activeDoc.data.condiciones) {
            this.activeDoc.data.condiciones = [];
            if (this.activeDoc.data.validez_condiciones) {
                this.activeDoc.data.condiciones.push({
                    titulo: 'Validez y Condiciones Comerciales',
                    descripcion: this.activeDoc.data.validez_condiciones
                });
            }
            if (this.activeDoc.data.politicas_cancelacion) {
                this.activeDoc.data.condiciones.push({
                    titulo: 'Políticas de Cancelación / Penalidades',
                    descripcion: this.activeDoc.data.politicas_cancelacion
                });
            }
            if (this.activeDoc.data.condiciones.length === 0) {
                this.activeDoc.data.condiciones = [
                    {
                        titulo: 'Validez y Condiciones Comerciales',
                        descripcion: 'Este documento constituye el soporte formal de pago. Los servicios listados están confirmados y sujetos a las políticas de los proveedores finales. Por favor, presentar este documento junto con su identificación original al momento de utilizar los servicios.'
                    },
                    {
                        titulo: 'Políticas de Cancelación / Penalidades',
                        descripcion: 'Cambios o cancelaciones están sujetos a penalidades según el operador (aerolíneas, hoteles, etc.). Cancelaciones con menos de 15 días de anticipación conllevan una penalidad del 100% del valor pagado. No hay reembolsos por servicios no utilizados de manera voluntaria por el pasajero.'
                    }
                ];
            }
        }
    },

    renderEditorLists: function() {
        // 1. Servicios Principales
        const princContainer = document.getElementById('principales_container');
        if (princContainer) {
            princContainer.innerHTML = '';
            this.activeDoc.data.servicios_principales.forEach((item, idx) => {
                const div = document.createElement('div');
                div.className = 'flex gap-2 items-center';
                div.innerHTML = `
                    <input type="text" placeholder="Categoría" value="${item.categoria}" oninput="DocumentosComponent.onListInputChanged('principales', ${idx}, 'categoria', this.value)" class="w-1/3 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 outline-none">
                    <input type="text" placeholder="Descripción" value="${item.descripcion}" oninput="DocumentosComponent.onListInputChanged('principales', ${idx}, 'descripcion', this.value)" class="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 outline-none">
                    <button type="button" onclick="DocumentosComponent.removePrincipalRow(${idx})" class="text-rose-500 hover:text-rose-700 p-2"><i class="ph ph-trash text-base"></i></button>
                `;
                princContainer.appendChild(div);
            });
        }

        // 2. Tours
        const toursContainer = document.getElementById('tours_container');
        if (toursContainer) {
            toursContainer.innerHTML = '';
            this.activeDoc.data.tours_actividades.forEach((item, idx) => {
                const div = document.createElement('div');
                div.className = 'flex gap-2 items-center';
                div.innerHTML = `
                    <input type="text" placeholder="Experiencia/Servicio" value="${item.experiencia}" oninput="DocumentosComponent.onListInputChanged('tours', ${idx}, 'experiencia', this.value)" class="w-1/3 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 outline-none">
                    <input type="text" placeholder="Descripción" value="${item.descripcion}" oninput="DocumentosComponent.onListInputChanged('tours', ${idx}, 'descripcion', this.value)" class="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 outline-none">
                    <button type="button" onclick="DocumentosComponent.removeTourRow(${idx})" class="text-rose-500 hover:text-rose-700 p-2"><i class="ph ph-trash text-base"></i></button>
                `;
                toursContainer.appendChild(div);
            });
        }

        // 3. Adicionales
        const adicContainer = document.getElementById('adicionales_container');
        if (adicContainer) {
            adicContainer.innerHTML = '';
            this.activeDoc.data.servicios_adicionales.forEach((item, idx) => {
                const div = document.createElement('div');
                div.className = 'flex gap-2 items-center';
                div.innerHTML = `
                    <input type="text" placeholder="Categoría" value="${item.categoria}" oninput="DocumentosComponent.onListInputChanged('adicionales', ${idx}, 'categoria', this.value)" class="w-1/4 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 outline-none">
                    <input type="text" placeholder="Descripción" value="${item.descripcion}" oninput="DocumentosComponent.onListInputChanged('adicionales', ${idx}, 'descripcion', this.value)" class="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 outline-none">
                    <input type="number" placeholder="Valor" value="${item.valor || 0}" oninput="DocumentosComponent.onListInputChanged('adicionales', ${idx}, 'valor', this.value)" class="w-1/4 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 outline-none">
                    <button type="button" onclick="DocumentosComponent.removeAdicionalRow(${idx})" class="text-rose-500 hover:text-rose-700 p-2"><i class="ph ph-trash text-base"></i></button>
                `;
                adicContainer.appendChild(div);
            });
        }

        // 4. Abonos
        const abonosContainer = document.getElementById('abonos_container');
        if (abonosContainer) {
            abonosContainer.innerHTML = '';
            this.activeDoc.data.abonos.forEach((item, idx) => {
                const div = document.createElement('div');
                div.className = 'flex gap-2 items-center';
                div.innerHTML = `
                    <input type="text" placeholder="Fecha (Ej: 19/05/2026)" value="${item.fecha}" oninput="DocumentosComponent.onListInputChanged('abonos', ${idx}, 'fecha', this.value)" class="w-1/3 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 outline-none">
                    <input type="number" placeholder="Monto" value="${item.monto || 0}" oninput="DocumentosComponent.onListInputChanged('abonos', ${idx}, 'monto', this.value)" class="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 outline-none">
                    <button type="button" onclick="DocumentosComponent.removeAbonoRow(${idx})" class="text-rose-500 hover:text-rose-700 p-2"><i class="ph ph-trash text-base"></i></button>
                `;
                abonosContainer.appendChild(div);
            });
        }

        // 5. Condiciones y Políticas
        const condContainer = document.getElementById('condiciones_container');
        if (condContainer) {
            condContainer.innerHTML = '';
            if (!this.activeDoc.data.condiciones) this.activeDoc.data.condiciones = [];
            this.activeDoc.data.condiciones.forEach((item, idx) => {
                const div = document.createElement('div');
                div.className = 'flex gap-2 items-start border-b border-slate-100 pb-3 last:border-b-0';
                div.innerHTML = `
                    <div class="flex-1 space-y-2">
                        <input type="text" placeholder="Título de la Condición/Política" value="${item.titulo || ''}" oninput="DocumentosComponent.onListInputChanged('condiciones', ${idx}, 'titulo', this.value)" class="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none">
                        <textarea placeholder="Detalles de la política..." rows="2" oninput="DocumentosComponent.onListInputChanged('condiciones', ${idx}, 'descripcion', this.value)" class="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 outline-none">${item.descripcion || ''}</textarea>
                    </div>
                    <button type="button" onclick="DocumentosComponent.removeCondicionRow(${idx})" class="text-rose-500 hover:text-rose-700 p-2 mt-1"><i class="ph ph-trash text-base"></i></button>
                `;
                condContainer.appendChild(div);
            });
        }
    },

    onListInputChanged: function(listName, index, field, value) {
        let arrayToUpdate;
        if (listName === 'principales') arrayToUpdate = this.activeDoc.data.servicios_principales;
        if (listName === 'tours') arrayToUpdate = this.activeDoc.data.tours_actividades;
        if (listName === 'adicionales') arrayToUpdate = this.activeDoc.data.servicios_adicionales;
        if (listName === 'abonos') arrayToUpdate = this.activeDoc.data.abonos;
        if (listName === 'condiciones') arrayToUpdate = this.activeDoc.data.condiciones;

        if (arrayToUpdate && arrayToUpdate[index]) {
            if (field === 'valor' || field === 'monto') {
                arrayToUpdate[index][field] = parseFloat(value) || 0;
            } else {
                arrayToUpdate[index][field] = value;
            }
        }
        this.recalculate();
        this.renderPreview();
    },
    addPrincipalRow: function() {
        this.activeDoc.data.servicios_principales.push({ categoria: '', descripcion: '' });
        this.renderEditorLists();
        this.recalculate();
        this.renderPreview();
    },
    removePrincipalRow: function(idx) {
        this.activeDoc.data.servicios_principales.splice(idx, 1);
        this.renderEditorLists();
        this.recalculate();
        this.renderPreview();
    },
    addTourRow: function() {
        this.activeDoc.data.tours_actividades.push({ experiencia: '', descripcion: '' });
        this.renderEditorLists();
        this.recalculate();
        this.renderPreview();
    },
    removeTourRow: function(idx) {
        this.activeDoc.data.tours_actividades.splice(idx, 1);
        this.renderEditorLists();
        this.recalculate();
        this.renderPreview();
    },
    addAdicionalRow: function() {
        this.activeDoc.data.servicios_adicionales.push({ categoria: '', descripcion: '', valor: 0 });
        this.renderEditorLists();
        this.recalculate();
        this.renderPreview();
    },
    removeAdicionalRow: function(idx) {
        this.activeDoc.data.servicios_adicionales.splice(idx, 1);
        this.renderEditorLists();
        this.recalculate();
        this.renderPreview();
    },
    addAbonoRow: function() {
        const today = new Date().toLocaleDateString('es-ES');
        this.activeDoc.data.abonos.push({ fecha: today, monto: 0 });
        this.renderEditorLists();
        this.recalculate();
        this.renderPreview();
    },
    removeAbonoRow: function(idx) {
        this.activeDoc.data.abonos.splice(idx, 1);
        this.renderEditorLists();
        this.recalculate();
        this.renderPreview();
    },
    addCondicionRow: function() {
        if (!this.activeDoc.data.condiciones) this.activeDoc.data.condiciones = [];
        this.activeDoc.data.condiciones.push({ titulo: '', descripcion: '' });
        this.renderEditorLists();
        this.recalculate();
        this.renderPreview();
    },
    removeCondicionRow: function(idx) {
        if (this.activeDoc.data.condiciones) {
            this.activeDoc.data.condiciones.splice(idx, 1);
        }
        this.renderEditorLists();
        this.recalculate();
        this.renderPreview();
    },

    onInputChanged: function() {
        if (!this.activeDoc) return;
        
        const getVal = (id) => {
            const el = document.getElementById(id);
            return el ? el.value : '';
        };

        this.activeDoc.type = getVal('doc_type') || 'soporte';
        this.activeDoc.data.titulo_documento = getVal('doc_titulo_documento');
        this.activeDoc.data.fecha_emision = getVal('doc_fecha_emision');
        this.activeDoc.data.sello_texto = getVal('doc_sello_texto');
        this.activeDoc.data.sello_subtexto = getVal('doc_sello_subtexto');
        
        this.activeDoc.data.cliente_nombre = getVal('doc_cliente_nombre');
        this.activeDoc.data.cliente_id = getVal('doc_cliente_id');
        this.activeDoc.data.cliente_tel = getVal('doc_cliente_tel');
        this.activeDoc.data.cliente_email = getVal('doc_cliente_email');
        
        this.activeDoc.data.titulo_viajero = getVal('doc_titulo_viajero');
        this.activeDoc.data.titulo_plan = getVal('doc_titulo_plan');
        this.activeDoc.data.titulo_servicios = getVal('doc_titulo_servicios');
        this.activeDoc.data.titulo_tours = getVal('doc_titulo_tours');
        this.activeDoc.data.titulo_adicionales = getVal('doc_titulo_adicionales');
        this.activeDoc.data.titulo_pagos = getVal('doc_titulo_pagos');

        this.activeDoc.data.destino = getVal('doc_destino');
        this.activeDoc.data.fechas = getVal('doc_fechas');
        this.activeDoc.data.duracion = getVal('doc_duracion');
        this.activeDoc.data.pasajeros = getVal('doc_pasajeros');

        this.activeDoc.data.metodo_pago = getVal('doc_metodo_pago');
        this.activeDoc.data.pago_titular = getVal('doc_pago_titular');
        this.activeDoc.data.pago_entidad = getVal('doc_pago_entidad');
        this.activeDoc.data.pago_cuenta = getVal('doc_pago_cuenta');
        this.activeDoc.data.pago_referencia = getVal('doc_pago_referencia');

        this.activeDoc.data.validez_condiciones = getVal('doc_validez_condiciones');
        this.activeDoc.data.politicas_cancelacion = getVal('doc_politicas_cancelacion');

        this.recalculate();
        this.renderPreview();
    },

    recalculate: function() {
        const pacoteVal = parseFloat(document.getElementById('doc_paquete_valor')?.value) || 0;
        this.activeDoc.data.paquete_valor = pacoteVal;

        const adicionalesSum = this.activeDoc.data.servicios_adicionales.reduce((sum, item) => sum + (Number(item.valor) || 0), 0);
        const totalViaje = pacoteVal + adicionalesSum;
        const abonosSum = this.activeDoc.data.abonos.reduce((sum, item) => sum + (Number(item.monto) || 0), 0);
        const saldoPendiente = totalViaje - abonosSum;

        const setTxt = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
        };
        setTxt('calc_adicionales_sum', this.formatCurrency(adicionalesSum));
        setTxt('calc_total_viaje', this.formatCurrency(totalViaje));
        setTxt('calc_abonos_sum', this.formatCurrency(abonosSum));
        setTxt('calc_saldo_pendiente', this.formatCurrency(Math.max(0, saldoPendiente)));
    },

    formatCurrency: function (value) {
        if (!value && value !== 0) return '$ 0';
        return '$ ' + parseFloat(value).toLocaleString('es-CO');
    },

    formatDate: function(dateStr) {
        if (!dateStr) return '';
        if (dateStr.includes('/')) return dateStr;
        const parts = dateStr.split('-');
        if (parts.length === 3) {
            const date = new Date(parts[0], parts[1] - 1, parts[2]);
            const options = { year: 'numeric', month: 'long', day: 'numeric' };
            return date.toLocaleDateString('es-ES', options);
        }
        return dateStr;
    },

    renderPreview: function () {
        const container = document.getElementById('pdf_preview_container');
        if (!container) return;
        
        const html = this.buildPreviewHTML();
        container.innerHTML = html;
        
        const hiddenContainer = document.getElementById('pdf-template-container');
        if (hiddenContainer) {
            hiddenContainer.innerHTML = html;
        }
    },

    buildPreviewHTML: function () {
        const data = this.activeDoc.data;
        const c1 = this.settings.color1 || '#005C7A';
        const c2 = this.settings.color2 || '#2563eb';
        const typeLabel = ((data.titulo_documento || '').trim().toUpperCase()) || (this.activeDoc.type === 'cotizacion' ? 'COTIZACIÓN PREMIUM' : 'SOPORTE DE PAGO');
        
        const fmt = (val) => this.formatCurrency(val);
        const formatDate = (dStr) => this.formatDate(dStr);

        const adicionalesSum = data.servicios_adicionales.reduce((sum, item) => sum + (Number(item.valor) || 0), 0);
        const totalViaje = (Number(data.paquete_valor) || 0) + adicionalesSum;
        const abonosSum = data.abonos.reduce((sum, item) => sum + (Number(item.monto) || 0), 0);
        const saldoPendiente = totalViaje - abonosSum;

        let serviciosPrincipalesHtml = '';
        if (data.servicios_principales && data.servicios_principales.length > 0) {
            const hTitle = data.titulo_servicios !== undefined ? data.titulo_servicios.trim() : 'SERVICIOS PRINCIPALES INCLUIDOS';
            serviciosPrincipalesHtml = `
                <div style="margin-bottom: 20px;">
                    ${hTitle ? `<h4 style="font-size: 11px; font-weight: 800; color: ${c1}; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 10px 0; border-bottom: 1.5px solid ${c1}33; padding-bottom: 4px;">${hTitle}</h4>` : ''}
                    <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
                        <thead>
                            <tr style="background-color: #f8fafc; text-align: left; border-bottom: 1px solid #e2e8f0;">
                                <th style="padding: 8px 12px; font-weight: 700; width: 30%; color: #475569;">Categoría</th>
                                <th style="padding: 8px 12px; font-weight: 700; color: #475569;">Descripción del Servicio</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${data.servicios_principales.map(item => `
                                <tr style="border-bottom: 1px solid #f1f5f9;">
                                    <td style="padding: 8px 12px; font-weight: 700; color: #0f172a;">${item.categoria || '-'}</td>
                                    <td style="padding: 8px 12px; color: #475569;">${item.descripcion || '-'}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        }

        let toursHtml = '';
        if (data.tours_actividades && data.tours_actividades.length > 0) {
            const hTitle = data.titulo_tours !== undefined ? data.titulo_tours.trim() : 'TOURS Y EXPERIENCIAS PROGRAMADAS';
            toursHtml = `
                <div style="margin-bottom: 20px;">
                    ${hTitle ? `<h4 style="font-size: 11px; font-weight: 800; color: ${c1}; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 10px 0; border-bottom: 1.5px solid ${c1}33; padding-bottom: 4px;">${hTitle}</h4>` : ''}
                    <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
                        <thead>
                            <tr style="background-color: #f8fafc; text-align: left; border-bottom: 1px solid #e2e8f0;">
                                <th style="padding: 8px 12px; font-weight: 700; width: 30%; color: #475569;">Experiencia / Actividad</th>
                                <th style="padding: 8px 12px; font-weight: 700; color: #475569;">Detalles y Logística</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${data.tours_actividades.map(item => `
                                <tr style="border-bottom: 1px solid #f1f5f9;">
                                    <td style="padding: 8px 12px; font-weight: 700; color: #0f172a;">${item.experiencia || '-'}</td>
                                    <td style="padding: 8px 12px; color: #475569;">${item.descripcion || '-'}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        }

        let adicionalesHtml = '';
        if (data.servicios_adicionales && data.servicios_adicionales.length > 0) {
            const hTitle = data.titulo_adicionales !== undefined ? data.titulo_adicionales.trim() : 'Servicios Adicionales (Fuera de Plan)';
            adicionalesHtml = `
                <div style="margin-bottom: 20px;">
                    ${hTitle ? `<h4 style="font-size: 11px; font-weight: 800; color: ${c1}; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 10px 0; border-bottom: 1.5px solid ${c1}33; padding-bottom: 4px;">${hTitle}</h4>` : ''}
                    <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
                        <thead>
                            <tr style="background-color: #f8fafc; text-align: left; border-bottom: 1px solid #e2e8f0;">
                                <th style="padding: 8px 12px; font-weight: 700; width: 30%; color: #475569;">Servicio</th>
                                <th style="padding: 8px 12px; font-weight: 700; color: #475569;">Descripción</th>
                                <th style="padding: 8px 12px; font-weight: 700; text-align: right; width: 20%; color: #475569;">Valor</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${data.servicios_adicionales.map(item => `
                                <tr style="border-bottom: 1px solid #f1f5f9;">
                                    <td style="padding: 8px 12px; font-weight: 700; color: #0f172a;">${item.categoria || '-'}</td>
                                    <td style="padding: 8px 12px; color: #475569;">${item.descripcion || '-'}</td>
                                    <td style="padding: 8px 12px; text-align: right; font-weight: 700; color: #0f172a;">${fmt(item.valor)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        }

        let abonosRowsHtml = '';
        if (data.abonos && data.abonos.length > 0) {
            abonosRowsHtml = data.abonos.map(item => `
                <tr style="color: #10b981; font-weight: 600;">
                    <td style="padding: 4px 0; text-align: left; font-size: 11px;">Abono (${item.fecha}):</td>
                    <td style="padding: 4px 0; text-align: right;">- ${fmt(item.monto)}</td>
                </tr>
            `).join('');
        } else {
            abonosRowsHtml = `
                <tr style="color: #94a3b8; font-style: italic;">
                    <td colspan="2" style="padding: 4px 0; text-align: center; font-size: 11px;">Sin abonos registrados</td>
                </tr>
            `;
        }

        let stampHtml = '';
        if (data.sello_texto) {
            stampHtml = `
                <div class="status-stamp" style="border: 3px solid ${c1}; border-radius: 8px; color: ${c1}; font-size: 15px; font-weight: 900; text-transform: uppercase; letter-spacing: 3px; padding: 8px 16px; transform: rotate(-6deg); opacity: 0.95; text-align: center; line-height: 1.1; display: inline-block;">
                    <div>${data.sello_texto}</div>
                    ${data.sello_subtexto ? `<div style="font-size: 9px; font-weight: 700; opacity: 0.8; margin-top: 3px; letter-spacing: 1.5px;">${data.sello_subtexto}</div>` : ''}
                </div>
            `;
        }

        const logoUrl = this.settings.logo || 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png';

        // Render dynamic conditions list
        let condicionesHtml = '';
        if (data.condiciones && data.condiciones.length > 0) {
            const activeConds = data.condiciones.filter(c => (c.titulo || '').trim() || (c.descripcion || '').trim());
            if (activeConds.length > 0) {
                condicionesHtml = `
                    <div style="border-top: 1px solid #e2e8f0; padding-top: 14px; font-size: 8.5px; color: #64748b; line-height: 1.4; margin-top: 20px;">
                        ${activeConds.map(c => `
                            <p style="margin: 0 0 5px 0;">
                                ${c.titulo ? `<strong>${c.titulo.trim()}:</strong>` : ''} 
                                ${c.descripcion ? c.descripcion.trim() : ''}
                            </p>
                        `).join('')}
                    </div>
                `;
            }
        }

        return `
        <div style="width: 816px; min-height: 1344px; background-color: #ffffff; color: #1e293b; font-family: 'Inter', sans-serif; padding: 45px; box-sizing: border-box; position: relative; display: flex; flex-direction: column; justify-content: flex-start; border: 1px solid #e2e8f0; border-radius: 4px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);">
            
            <!-- ENCABEZADO DE AGENCIA -->
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 25px; border-bottom: 2px solid ${c1}; padding-bottom: 20px;">
                <div>
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <img src="${logoUrl}" style="height: 68px; max-width: 260px; object-fit: contain;" crossorigin="anonymous"/>
                        <div style="line-height: 1.2;">
                            <h2 style="margin: 0; font-size: 19px; font-weight: 900; color: ${c1}; letter-spacing: -0.5px;">${this.settings.razon || 'VIVE TRAVEL'}</h2>
                            ${this.settings.subtitulo ? `<span style="font-size: 9px; font-weight: 700; color: #94a3b8; tracking: 0.1em; text-transform: uppercase;">${this.settings.subtitulo}</span>` : ''}
                        </div>
                    </div>
                    <div style="margin-top: 12px; font-size: 11px; color: #64748b; line-height: 1.45;">
                        <p style="margin: 0;"><strong>NIT:</strong> ${this.settings.nit || '900.000.000-1'} | <strong>RNT:</strong> ${this.settings.rnt || '123456'}</p>
                        <p style="margin: 0;"><strong>Teléfono:</strong> ${this.settings.tel || '+57 300 000 0000'}</p>
                        <p style="margin: 0;"><strong>Dirección:</strong> ${this.settings.dir || 'Colombia'}</p>
                    </div>
                </div>
                
                <div style="text-align: right; display: flex; flex-direction: column; align-items: flex-end; gap: 15px;">
                    <div style="text-align: right;">
                        <h1 style="font-size: 20px; font-weight: 900; margin: 0; color: ${c1}; letter-spacing: 0.5px;">${typeLabel}</h1>
                        <p style="font-size: 11px; margin: 2px 0 0 0; color: #64748b; font-weight: 500;">REF: ${data.pago_referencia || 'N/A'}</p>
                        <p style="font-size: 11px; margin: 2px 0 0 0; color: ${c2}; font-weight: 800;">EMITIDO: ${formatDate(data.fecha_emision)}</p>
                    </div>
                    <div>
                        ${stampHtml}
                    </div>
                </div>
            </div>

            <!-- GRILLA CLIENTE Y DETALLES DEL DESTINO -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 25px;">
                <!-- CLIENTE -->
                <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px;">
                    ${(data.titulo_viajero !== undefined ? data.titulo_viajero.trim() : 'INFORMACIÓN DEL VIAJERO') ? `<h3 style="font-size: 10px; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 10px 0; border-bottom: 1.5px solid #e2e8f0; padding-bottom: 4px;">${data.titulo_viajero !== undefined ? data.titulo_viajero.trim() : 'INFORMACIÓN DEL VIAJERO'}</h3>` : ''}
                    <div style="font-size: 11.5px; line-height: 1.6; color: #334155;">
                        <p style="margin: 0;"><strong>Titular:</strong> ${data.cliente_nombre || '-'}</p>
                        <p style="margin: 0;"><strong>C.C. / Pasaporte:</strong> ${data.cliente_id || '-'}</p>
                        <p style="margin: 0;"><strong>Celular:</strong> ${data.cliente_tel || '-'}</p>
                        <p style="margin: 0;"><strong>Correo:</strong> ${data.cliente_email || '-'}</p>
                    </div>
                </div>

                <!-- VIAJE -->
                <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px;">
                    ${(data.titulo_plan !== undefined ? data.titulo_plan.trim() : 'RESUMEN DEL PLAN COMERCIAL') ? `<h3 style="font-size: 10px; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 10px 0; border-bottom: 1.5px solid #e2e8f0; padding-bottom: 4px;">${data.titulo_plan !== undefined ? data.titulo_plan.trim() : 'RESUMEN DEL PLAN COMERCIAL'}</h3>` : ''}
                    <div style="font-size: 11.5px; line-height: 1.6; color: #334155;">
                        <p style="margin: 0;"><strong>Destino:</strong> ${data.destino || '-'}</p>
                        <p style="margin: 0;"><strong>Fechas:</strong> ${data.fechas || '-'}</p>
                        <p style="margin: 0;"><strong>Duración:</strong> ${data.duracion || '-'}</p>
                        <p style="margin: 0;"><strong>Acompañantes:</strong> ${data.pasajeros || '-'}</p>
                    </div>
                </div>
            </div>

            <!-- TABLAS DE SERVICIOS -->
            ${serviciosPrincipalesHtml}
            ${toursHtml}
            ${adicionalesHtml}

            <!-- TOTALES Y DATOS DE CONSIGNACIÓN -->
            <div style="display: grid; grid-template-columns: 1.1fr 1fr; gap: 30px; margin-top: 15px; border-top: 2px solid #f1f5f9; padding-top: 20px; margin-bottom: 25px;">
                <!-- INSTRUCCIONES DE CONSIGNACION -->
                <div style="font-size: 11px; color: #475569; line-height: 1.5; align-self: flex-end;">
                    ${(data.titulo_pagos !== undefined ? data.titulo_pagos.trim() : 'Canales de Pago Autorizados') ? `<h4 style="font-size: 11px; font-weight: 800; color: ${c1}; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px;">${data.titulo_pagos !== undefined ? data.titulo_pagos.trim() : 'Canales de Pago Autorizados'}</h4>` : ''}
                    <div style="background-color: #f8fafc; border-radius: 8px; padding: 12px; border: 1px solid #e2e8f0;">
                        <p style="margin: 0 0 4px 0;"><strong>Medio:</strong> ${data.metodo_pago || 'Transferencia Bancaria'}</p>
                        <p style="margin: 0 0 4px 0;"><strong>Titular:</strong> ${data.pago_titular || 'Vive Travel Col'}</p>
                        <p style="margin: 0 0 4px 0;"><strong>Banco:</strong> ${data.pago_entidad || 'Bancolombia'}</p>
                        <p style="margin: 0 0 4px 0;"><strong>Cuenta:</strong> ${data.pago_cuenta || 'Ahorros'}</p>
                        <p style="margin: 0;"><strong>Ref/Concepto:</strong> ${data.pago_referencia || '-'}</p>
                    </div>
                </div>

                <!-- DESGLOSE MATEMATICO -->
                <div>
                    <table style="width: 100%; border-collapse: collapse; font-size: 11px; color: #334155;">
                        <tr style="border-bottom: 1px solid #f1f5f9;">
                            <td style="padding: 6px 0; text-align: left; color: #64748b;">Valor Plan Turístico:</td>
                            <td style="padding: 6px 0; text-align: right; font-weight: 600;">${fmt(data.paquete_valor)}</td>
                        </tr>
                        ${adicionalesSum > 0 ? `
                        <tr style="border-bottom: 1px solid #f1f5f9;">
                            <td style="padding: 6px 0; text-align: left; color: #64748b;">Servicios Adicionales:</td>
                            <td style="padding: 6px 0; text-align: right; font-weight: 600;">+ ${fmt(adicionalesSum)}</td>
                        </tr>
                        ` : ''}
                        <tr style="border-bottom: 1.5px solid #e2e8f0; font-weight: 700; color: ${c1};">
                            <td style="padding: 8px 0; text-align: left;">Inversión Total del Viaje:</td>
                            <td style="padding: 8px 0; text-align: right; font-size: 12.5px;">${fmt(totalViaje)}</td>
                        </tr>
                        
                        <!-- ABONOS LIST -->
                        ${abonosRowsHtml}
                        
                        <!-- SALDO FINAL -->
                        <tr style="border-top: 2.5px solid ${c1}; font-weight: 900; font-size: 13.5px;">
                            <td style="padding: 10px 0; text-align: left; color: ${c1};">SALDO PENDIENTE:</td>
                            <td style="padding: 10px 0; text-align: right; color: ${saldoPendiente <= 0 ? '#10b981' : '#ef4444'}; font-size: 15px;">
                                ${fmt(Math.max(0, saldoPendiente))}
                            </td>
                        </tr>
                    </table>
                </div>
            </div>

            <!-- POLÍTICAS IMPORTANTES -->
            ${condicionesHtml}
        </div>`;
    },

    exportToPDF: function() {
        this.onInputChanged();
        const container = document.getElementById('pdf_preview_container');
        if (!container) return;

        const titlePrefix = ((this.activeDoc.data.titulo_documento || (this.activeDoc.type === 'cotizacion' ? 'Cotizacion' : 'Soporte_Pago'))).trim().replace(/\s+/g, '_');
        const filename = `${titlePrefix}_${this.activeDoc.data.cliente_nombre || 'Viaje'}_${this.activeDoc.data.destino || 'Destino'}.pdf`;

        // Clonar la plantilla para exportarla de forma invisible en pantalla pero activa para html2pdf/html2canvas
        const printEl = document.createElement('div');
        printEl.style.position = 'fixed';
        printEl.style.left = '0';
        printEl.style.top = '0';
        printEl.style.zIndex = '-9999';
        printEl.style.width = '816px';
        printEl.style.height = '1344px';
        printEl.style.overflow = 'visible';
        printEl.style.backgroundColor = '#ffffff';
        printEl.innerHTML = this.buildPreviewHTML();
        document.body.appendChild(printEl);

        // Seleccionamos el primer hijo (la hoja Legal exacta)
        const targetEl = printEl.firstElementChild;

        const opt = {
            margin: 0,
            filename: filename.replace(/[^a-zA-Z0-9_.]/g, '_'),
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true, letterRendering: true },
            jsPDF: { unit: 'mm', format: 'legal', orientation: 'portrait' }
        };

        const btn = document.querySelector('button[onclick*="exportToPDF"]');
        const oldHTML = btn ? btn.innerHTML : '';
        if (btn) {
            btn.innerHTML = `<i class="ph ph-spinner animate-spin mr-2"></i> Generando PDF...`;
            btn.disabled = true;
        }

        html2pdf().set(opt).from(targetEl).save().then(() => {
            if (btn) {
                btn.innerHTML = oldHTML;
                btn.disabled = false;
            }
            document.body.removeChild(printEl);
            UI.showToast("PDF exportado correctamente y descargado.", "success");
        }).catch(err => {
            console.error(err);
            if (btn) {
                btn.innerHTML = oldHTML;
                btn.disabled = false;
            }
            if (printEl.parentNode) document.body.removeChild(printEl);
            UI.showToast("Error al compilar y generar el PDF.", "error");
        });
    },

    toggleSection: function(headerEl) {
        const section = headerEl.closest('.accordion-section');
        if (!section) return;
        section.classList.toggle('collapsed');
    },

    updateDefaultTitleFromType: function() {
        const docType = document.getElementById('doc_type')?.value;
        const titleEl = document.getElementById('doc_titulo_documento');
        if (titleEl) {
            titleEl.value = docType === 'cotizacion' ? 'COTIZACIÓN PREMIUM' : 'SOPORTE DE PAGO';
        }
        this.onInputChanged();
    }
};

export { DocumentosComponent };
