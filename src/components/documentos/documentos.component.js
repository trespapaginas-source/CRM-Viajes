import { Store } from '../../core/store.js';
import { DataService, supabaseClient } from '../../../js/services/supabase.service.js';
import { UI } from '../../../js/utils/ui.utils.js';
import { parseSpanishDate, formatShortDate } from '../../../js/utils/format.utils.js';

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
    loadedDocTimestamp: null,

    init: async function () {
        await this.loadSettings();

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
            this.loadSavedDocsList();
            this.renderPreview();
        });
    },

    loadSettings: async function () {
        try {
            const { data, error } = await DataService.getAgenciaConfig();
            if (!error && data) {
                this.settings = {
                    logo: data.logo || this.settings.logo,
                    color1: data.color_primario || this.settings.color1,
                    color2: data.color_secundario || this.settings.color2,
                    razon: data.razon_social || this.settings.razon,
                    subtitulo: data.subtitulo || this.settings.subtitulo,
                    nit: data.nit || this.settings.nit,
                    rnt: data.rnt || this.settings.rnt,
                    tel: data.telefono || this.settings.tel,
                    dir: data.direccion || this.settings.dir,
                    terms: data.condiciones || this.settings.terms
                };
                localStorage.setItem('crm_doc_settings', JSON.stringify(this.settings));
            } else {
                const saved = localStorage.getItem('crm_doc_settings');
                if (saved) {
                    this.settings = { ...this.settings, ...JSON.parse(saved) };
                }
            }
        } catch (e) {
            console.warn("Error cargando configuración de marca desde la base de datos:", e);
            const saved = localStorage.getItem('crm_doc_settings');
            if (saved) {
                this.settings = { ...this.settings, ...JSON.parse(saved) };
            }
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

    saveSettings: async function () {
        const getVal = (id) => {
            const el = document.getElementById(id);
            return el ? el.value : '';
        };
        const newSettings = {
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
        this.settings = { ...this.settings, ...newSettings };
        localStorage.setItem('crm_doc_settings', JSON.stringify(this.settings));

        const btn = document.querySelector('button[onclick="DocumentosComponent.saveSettings()"]');
        let originalHtml = "";
        if (btn) {
            originalHtml = btn.innerHTML;
            btn.innerHTML = '<i class="ph ph-spinner animate-spin mr-2"></i> Guardando...';
            btn.disabled = true;
        }

        try {
            const { error } = await DataService.saveAgenciaConfig(newSettings);
            if (error) throw error;
            UI.showToast('Configuración de marca guardada en base de datos.', 'success');
        } catch (e) {
            console.error("Error al guardar en base de datos:", e);
            UI.showToast('Guardado localmente. Recuerda ejecutar el script de base de datos en Supabase.', 'warning');
        } finally {
            if (btn) {
                btn.innerHTML = originalHtml;
                btn.disabled = false;
            }
            UI.closeModal('modal-settings-marca', 'msm-bg', 'msm-content');
            this.renderPreview();
        }
    },

    openSettings: function () {
        UI.openModal('modal-settings-marca', 'msm-bg', 'msm-content');
    },

    loadSavedDocsList: function () {
        const select = document.getElementById('saved_docs_select');
        if (!select) return;
        const docs = DataService.documentos_guardados || [];

        select.innerHTML = '<option value="">-- Cargar Borrador --</option>';
        docs.forEach(doc => {
            const option = document.createElement('option');
            option.value = doc.id;
            const creadorInfo = doc.creado_por ? ` (por ${doc.creado_por.split('@')[0]})` : '';
            option.textContent = `${doc.tipo === 'cotizacion' ? 'Cotización' : 'Soporte'} - ${doc.nombre}${creadorInfo}`;
            select.appendChild(option);
        });
        if (this.activeDoc && this.activeDoc.id) {
            select.value = this.activeDoc.id;
        }
    },

    resetActiveDoc: function () {
        this.activeDoc = {
            id: null,
            name: '',
            type: 'soporte',
            data: {
                moneda: 'COP',
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
                crm_cliente_id: '',
                pax: 1,

                destino: '',
                fechas: '',
                fecha_ida: '',
                fecha_regreso: '',
                duracion: '',
                dias: '',
                noches: '',
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
                        titulo: 'Registro de Pago',
                        descripcion: 'Este documento constituye el soporte formal de recibo de pago para la reserva de los servicios turísticos intermediados por Vive Travel (VIVES GROUP S.A.S.).'
                    },
                    {
                        titulo: 'Políticas de Cancelación / Penalidades',
                        descripcion: 'Cambios o cancelaciones están sujetos a penalidades según el operador (aerolíneas, hoteles, etc.). Cancelaciones con menos de 15 días de anticipación conllevan una penalidad del 100% del valor pagado. No hay reembolsos por servicios no utilizados de manera voluntaria por el pasajero.'
                    }
                ]
            }
        };
    },

    newBlankDocument: function () {
        this.resetActiveDoc();
        this.fillDOMFromActiveDoc();
        this.renderEditorLists();
        this.recalculate();
        this.renderPreview();
        const select = document.getElementById('saved_docs_select');
        if (select) select.value = '';
        UI.showToast("Nuevo borrador en blanco iniciado.", "info");
    },

    saveActiveDocument: async function (silent = false) {
        this.onInputChanged();
        const userEmail = (window.AuthModule?.currentUser?.email || 'anonimo@agencia.com').toLowerCase();

        const esNvo = !this.activeDoc.id;

        if (esNvo) {
            let docName;
            if (silent) {
                const titlePrefix = (this.activeDoc.data.titulo_documento || (this.activeDoc.type === 'cotizacion' ? 'Cotización' : 'Soporte')).trim();
                docName = `${titlePrefix} - ${this.activeDoc.data.cliente_nombre || 'Borrador'} - ${this.activeDoc.data.destino || 'Sin Destino'}`;
            } else {
                docName = prompt("Escribe un nombre para este borrador de cotización/soporte:", `${this.activeDoc.data.cliente_nombre || 'Borrador'} - ${this.activeDoc.data.destino || 'Sin Destino'}`);
                if (docName === null) return false;
            }
            this.activeDoc.name = docName.trim() || `Borrador`;

            const payload = {
                nombre: this.activeDoc.name,
                tipo: this.activeDoc.type,
                datos: this.activeDoc.data,
                creado_por: userEmail,
                editado_por: userEmail
            };

            const btn = document.querySelector('button[onclick*="saveActiveDocument"]');
            if (btn) btn.disabled = true;

            try {
                const { data, error } = await supabaseClient.from('documentos_guardados').insert([payload]).select();
                if (error) throw error;

                if (data && data[0]) {
                    this.activeDoc.id = data[0].id;
                    this.loadedDocTimestamp = data[0].updated_at;
                }

                UI.showToast("Borrador guardado en la biblioteca compartida.", "success");

                await DataService.loadAll();
                this.loadSavedDocsList();

                // Auditoría
                DataService.registrarHistorial(
                    this.activeDoc.data.crm_cliente_id || null,
                    'Documento Creado',
                    'N/A',
                    `Nombre: ${this.activeDoc.name} | Tipo: ${this.activeDoc.type}`,
                    'CREACION'
                );
                return true;
            } catch (err) {
                console.error("Error al guardar documento:", err);
                UI.showToast("Error al guardar el documento en la base de datos.", "error");
                return false;
            } finally {
                if (btn) btn.disabled = false;
            }
        } else {
            // Update
            const serverDoc = (DataService.documentos_guardados || []).find(d => d.id === this.activeDoc.id);
            if (serverDoc && this.loadedDocTimestamp && new Date(serverDoc.updated_at) > new Date(this.loadedDocTimestamp)) {
                if (!silent) {
                    const confirmOverwrite = confirm(`Conflicto de Concurrencia:\nEl documento "${serverDoc.nombre}" fue modificado por ${serverDoc.editado_por || serverDoc.creado_por} después de que lo abrieras.\n\n¿Deseas sobreescribir sus cambios de todos modos?`);
                    if (!confirmOverwrite) return false;
                }
            }

            const payload = {
                nombre: this.activeDoc.name,
                tipo: this.activeDoc.type,
                datos: this.activeDoc.data,
                editado_por: userEmail,
                updated_at: new Date().toISOString()
            };

            const btn = document.querySelector('button[onclick*="saveActiveDocument"]');
            if (btn) btn.disabled = true;

            try {
                const { data, error } = await supabaseClient.from('documentos_guardados').update(payload).eq('id', this.activeDoc.id).select();
                if (error) throw error;

                if (data && data[0]) {
                    this.loadedDocTimestamp = data[0].updated_at;
                } else {
                    this.loadedDocTimestamp = payload.updated_at;
                }

                UI.showToast("Borrador actualizado en la biblioteca compartida.", "success");

                await DataService.loadAll();
                this.loadSavedDocsList();

                // Auditoría
                DataService.registrarHistorial(
                    this.activeDoc.data.crm_cliente_id || null,
                    'Documento Modificado',
                    `Modificado por ${userEmail}`,
                    `Nombre: ${this.activeDoc.name} | Tipo: ${this.activeDoc.type}`,
                    'MODIFICACION'
                );
                return true;
            } catch (err) {
                console.error("Error al actualizar documento:", err);
                UI.showToast("Error al actualizar el documento en la base de datos.", "error");
                return false;
            } finally {
                if (btn) btn.disabled = false;
            }
        }
    },

    loadSavedDocument: function (id) {
        if (!id) return;
        const docs = DataService.documentos_guardados || [];
        const doc = docs.find(d => d.id === id);
        if (doc) {
            this.activeDoc = {
                id: doc.id,
                name: doc.nombre,
                type: doc.tipo,
                data: doc.datos
            };
            this.loadedDocTimestamp = doc.updated_at;
            this.fillDOMFromActiveDoc();
            this.renderEditorLists();
            this.recalculate();
            this.renderPreview();
            UI.showToast(`Documento "${doc.nombre}" cargado desde la biblioteca compartida.`, "success");
        }
    },

    deleteActiveDocument: async function () {
        const select = document.getElementById('saved_docs_select');
        const id = select.value;
        if (!id) {
            UI.showToast("Selecciona un borrador guardado para eliminar.", "error");
            return;
        }

        if (!confirm("¿Estás seguro de que deseas eliminar permanentemente este borrador de la biblioteca compartida?")) return;

        const userEmail = (window.AuthModule?.currentUser?.email || 'anonimo@agencia.com').toLowerCase();

        try {
            const { error } = await supabaseClient.from('documentos_guardados').update({
                deleted_at: new Date().toISOString(),
                deleted_by: userEmail
            }).eq('id', id);

            if (error) throw error;

            UI.showToast("Documento eliminado de la biblioteca compartida.", "success");

            // Registrar auditoria
            const doc = DataService.documentos_guardados.find(d => d.id === id);
            DataService.registrarHistorial(
                doc?.datos?.crm_cliente_id || null,
                'Documento Eliminado',
                `Nombre: ${doc?.nombre}`,
                'Borrado lógico',
                'ELIMINACION'
            );

            this.newBlankDocument();
            await DataService.loadAll();
            this.loadSavedDocsList();
        } catch (e) {
            console.error("Error al eliminar documento:", e);
            UI.showToast("Error al eliminar el documento en Supabase.", "error");
        }
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
                    option.textContent = `${c.documento || 'CC'} - ${c.nombre} ${c.apellido || ''} (${planNom})`;
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

    parseRange: function (dateStr) {
        if (!dateStr) return null;
        const cleanStr = dateStr.replace(/\(.*?\)/g, '').trim();
        const splitters = [/\s+al\s+/i, /\s+a\s+/i, /\s+-\s+/];
        for (const splitter of splitters) {
            if (splitter.test(cleanStr)) {
                const parts = cleanStr.split(splitter);
                if (parts.length === 2) {
                    let start = parseSpanishDate(parts[0].trim());
                    let end = parseSpanishDate(parts[1].trim());

                    // Smart parse for formats like "Del 15 al 20 de Junio de 2026"
                    if ((!start || isNaN(start.getTime())) && end && !isNaN(end.getTime())) {
                        const dayMatch = parts[0].trim().match(/^(?:del\s+)?(\d+)$/i);
                        if (dayMatch) {
                            const day = parseInt(dayMatch[1]);
                            start = new Date(end.getFullYear(), end.getMonth(), day);
                        }
                    }

                    if (start && end && !isNaN(start.getTime()) && !isNaN(end.getTime())) {
                        return { start, end };
                    }
                }
            }
        }
        const single = parseSpanishDate(cleanStr);
        if (single && !isNaN(single.getTime())) {
            return { start: single, end: single };
        }
        return null;
    },

    calculateDuration: function (start, end, planTipo) {
        const isPasadia = planTipo && (planTipo.toLowerCase().includes('pasadía') || planTipo.toLowerCase().includes('pasadia'));
        if (isPasadia) {
            return 'Pasadía';
        }
        if (start && end && !isNaN(start.getTime()) && !isNaN(end.getTime())) {
            const diffTime = Math.abs(end - start);
            const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
            if (diffDays < 2) {
                return 'Pasadía';
            } else {
                const days = diffDays;
                const nights = diffDays - 1;
                const daysStr = days === 1 ? '1 Día' : `${days} Días`;
                const nightsStr = nights === 1 ? '1 Noche' : `${nights} Noches`;
                return `${daysStr} / ${nightsStr}`;
            }
        }
        return null;
    },

    loadFromReserva: function (id) {
        if (!id) return;
        const c = DataService.clientes.find(item => item.id == id);
        if (!c) return;

        this.activeDoc.data.cliente_nombre = `${c.nombre} ${c.apellido || ''}`.trim();
        this.activeDoc.data.cliente_id = c.documento || '';
        this.activeDoc.data.cliente_tel = c.telefono || '';
        this.activeDoc.data.cliente_email = c.email || '';
        this.activeDoc.data.crm_cliente_id = c.id || '';
        this.activeDoc.data.pax = c.pax || 1;

        const plan = DataService.planes.find(p => p.id === c.plan_id);
        if (plan) {
            this.activeDoc.data.destino = plan.destino || plan.nombre;

            // Calcular duración dinámica
            let duracionCalculada = '';
            const isPasadia = plan.tipo && (plan.tipo.toLowerCase().includes('pasadía') || plan.tipo.toLowerCase().includes('pasadia'));
            if (isPasadia) {
                duracionCalculada = 'Pasadía';
            } else {
                if (c.fecha_viaje) {
                    const range = this.parseRange(c.fecha_viaje);
                    if (range) {
                        duracionCalculada = this.calculateDuration(range.start, range.end, plan.tipo);
                    }
                }

                if (!duracionCalculada) {
                    // Fallback a las fechas del plan
                    let start = null;
                    let end = null;
                    if (plan.fechas && plan.fechas.length > 0) {
                        const firstRange = plan.fechas[0];
                        start = parseSpanishDate(firstRange.start);
                        end = parseSpanishDate(firstRange.end);
                    } else if (plan.fecha_entrada && plan.fecha_salida) {
                        start = parseSpanishDate(plan.fecha_entrada);
                        end = parseSpanishDate(plan.fecha_salida);
                    }
                    if (start && end) {
                        duracionCalculada = this.calculateDuration(start, end, plan.tipo);
                    }
                }
            }
            const dText = duracionCalculada || plan.duracion || '4 Días / 3 Noches';
            this.activeDoc.data.duracion = dText;
            const dMatch = dText.match(/(\d+)\s*D[íi]as\s*\/\s*(\d+)\s*Noches/i);
            if (dMatch) {
                this.activeDoc.data.dias = parseInt(dMatch[1]);
                this.activeDoc.data.noches = parseInt(dMatch[2]);
            } else if (dText.toLowerCase().includes('pasadía') || dText.toLowerCase().includes('pasadia')) {
                this.activeDoc.data.dias = 1;
                this.activeDoc.data.noches = 0;
            }

            let startObj = null;
            let endObj = null;
            if (c.fecha_viaje) {
                const range = this.parseRange(c.fecha_viaje);
                if (range) {
                    startObj = range.start;
                    endObj = range.end;
                } else {
                    const d = parseSpanishDate(c.fecha_viaje);
                    if (d && !isNaN(d.getTime())) {
                        startObj = d;
                        endObj = d;
                    }
                }
            }
            if (startObj && endObj) {
                const formatToISO = (date) => {
                    const y = date.getFullYear();
                    const m = String(date.getMonth() + 1).padStart(2, '0');
                    const day = String(date.getDate()).padStart(2, '0');
                    return `${y}-${m}-${day}`;
                };
                this.activeDoc.data.fecha_ida = formatToISO(startObj);
                this.activeDoc.data.fecha_regreso = formatToISO(endObj);
                const formatToShort = (date) => {
                    const m = String(date.getMonth() + 1).padStart(2, '0');
                    const day = String(date.getDate()).padStart(2, '0');
                    return `${day}/${m}/${date.getFullYear()}`;
                };
                this.activeDoc.data.fechas = `${formatToShort(startObj)} al ${formatToShort(endObj)}`;
            } else {
                this.activeDoc.data.fechas = c.fecha_viaje ? this.formatDate(c.fecha_viaje) : '';
                this.activeDoc.data.fecha_ida = '';
                this.activeDoc.data.fecha_regreso = '';
            }

            this.activeDoc.data.pasajeros = `${c.pax || 1} Viajero(s)`;
            if (plan.servicios_incluidos) {
                this.activeDoc.data.servicios_principales = JSON.parse(JSON.stringify(plan.servicios_incluidos));
            }
        }

        const paxNum = Number(c.pax) || 1;
        this.activeDoc.data.paquete_valor = Math.round((Number(c.precio_total) || 0) / paxNum);
        this.activeDoc.data.pago_referencia = `Reserva CC ${c.documento || ''}`;

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

    loadFromPlan: function (id) {
        if (!id) return;
        const plan = DataService.planes.find(p => p.id == id);
        if (!plan) return;

        this.activeDoc.data.destino = plan.destino || plan.nombre;

        let duracionCalculada = '';
        const isPasadia = plan.tipo && (plan.tipo.toLowerCase().includes('pasadía') || plan.tipo.toLowerCase().includes('pasadia'));
        if (isPasadia) {
            duracionCalculada = 'Pasadía';
        } else {
            let start = null;
            let end = null;
            if (plan.fechas && plan.fechas.length > 0) {
                const firstRange = plan.fechas[0];
                start = parseSpanishDate(firstRange.start);
                end = parseSpanishDate(firstRange.end);
            } else if (plan.fecha_entrada && plan.fecha_salida) {
                start = parseSpanishDate(plan.fecha_entrada);
                end = parseSpanishDate(plan.fecha_salida);
            }
            if (start && end) {
                duracionCalculada = this.calculateDuration(start, end, plan.tipo);
                const formatToISO = (date) => {
                    const y = date.getFullYear();
                    const m = String(date.getMonth() + 1).padStart(2, '0');
                    const d = String(date.getDate()).padStart(2, '0');
                    return `${y}-${m}-${d}`;
                };
                this.activeDoc.data.fecha_ida = formatToISO(start);
                this.activeDoc.data.fecha_regreso = formatToISO(end);
                const formatToShort = (date) => {
                    const m = String(date.getMonth() + 1).padStart(2, '0');
                    const day = String(date.getDate()).padStart(2, '0');
                    return `${day}/${m}/${date.getFullYear()}`;
                };
                this.activeDoc.data.fechas = `${formatToShort(start)} al ${formatToShort(end)}`;
            } else {
                this.activeDoc.data.fecha_ida = '';
                this.activeDoc.data.fecha_regreso = '';
                this.activeDoc.data.fechas = '';
            }
        }
        const dText = duracionCalculada || plan.duracion || '4 Días / 3 Noches';
        this.activeDoc.data.duracion = dText;
        const dMatch = dText.match(/(\d+)\s*D[íi]as\s*\/\s*(\d+)\s*Noches/i);
        if (dMatch) {
            this.activeDoc.data.dias = parseInt(dMatch[1]);
            this.activeDoc.data.noches = parseInt(dMatch[2]);
        } else if (dText.toLowerCase().includes('pasadía') || dText.toLowerCase().includes('pasadia')) {
            this.activeDoc.data.dias = 1;
            this.activeDoc.data.noches = 0;
        }

        this.activeDoc.data.paquete_valor = Number(plan.precio_persona) || 0;

        if (plan.servicios_incluidos) {
            this.activeDoc.data.servicios_principales = JSON.parse(JSON.stringify(plan.servicios_incluidos));
        }

        this.fillDOMFromActiveDoc();
        this.renderEditorLists();
        this.recalculate();
        this.renderPreview();

        // Reset selector
        document.getElementById('crm_plan_select').value = '';
        UI.showToast("Tarifas y destino del plan cargados al documento.", "success");
    },

    fillDOMFromActiveDoc: function () {
        const getEl = (id) => document.getElementById(id);

        if (getEl('doc_type')) getEl('doc_type').value = this.activeDoc.type;
        if (getEl('doc_moneda')) getEl('doc_moneda').value = this.activeDoc.data.moneda || 'COP';
        if (getEl('doc_titulo_documento')) {
            getEl('doc_titulo_documento').value = this.activeDoc.data.titulo_documento || (this.activeDoc.type === 'cotizacion' ? 'COTIZACIÓN' : 'SOPORTE DE PAGO');
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

        // Fallback parsers for retrocompatibility
        if (!this.activeDoc.data.fecha_ida && this.activeDoc.data.fechas) {
            const range = this.parseRange(this.activeDoc.data.fechas);
            if (range) {
                const formatToISO = (date) => {
                    const y = date.getFullYear();
                    const m = String(date.getMonth() + 1).padStart(2, '0');
                    const d = String(date.getDate()).padStart(2, '0');
                    return `${y}-${m}-${d}`;
                };
                this.activeDoc.data.fecha_ida = formatToISO(range.start);
                this.activeDoc.data.fecha_regreso = formatToISO(range.end);
            }
        }
        if (!this.activeDoc.data.dias && this.activeDoc.data.duracion) {
            const dMatch = this.activeDoc.data.duracion.match(/(\d+)\s*D[íi]as\s*\/\s*(\d+)\s*Noches/i);
            if (dMatch) {
                this.activeDoc.data.dias = parseInt(dMatch[1]);
                this.activeDoc.data.noches = parseInt(dMatch[2]);
            } else if (this.activeDoc.data.duracion.toLowerCase().includes('pasadía') || this.activeDoc.data.duracion.toLowerCase().includes('pasadia')) {
                this.activeDoc.data.dias = 1;
                this.activeDoc.data.noches = 0;
            }
        }

        if (getEl('doc_destino')) getEl('doc_destino').value = this.activeDoc.data.destino || '';
        if (getEl('doc_fecha_ida')) getEl('doc_fecha_ida').value = this.activeDoc.data.fecha_ida || '';
        if (getEl('doc_fecha_regreso')) getEl('doc_fecha_regreso').value = this.activeDoc.data.fecha_regreso || '';
        if (getEl('doc_dias')) getEl('doc_dias').value = this.activeDoc.data.dias || '';
        if (getEl('doc_noches')) getEl('doc_noches').value = this.activeDoc.data.noches || '';
        if (getEl('doc_pasajeros')) getEl('doc_pasajeros').value = this.activeDoc.data.pasajeros || '';
        if (getEl('doc_pax_count')) getEl('doc_pax_count').value = this.activeDoc.data.pax || 1;

        if (getEl('doc_metodo_pago')) getEl('doc_metodo_pago').value = this.activeDoc.data.metodo_pago || '';
        if (getEl('doc_pago_titular')) getEl('doc_pago_titular').value = this.activeDoc.data.pago_titular || '';
        if (getEl('doc_pago_entidad')) getEl('doc_pago_entidad').value = this.activeDoc.data.pago_entidad || '';
        if (getEl('doc_pago_cuenta')) getEl('doc_pago_cuenta').value = this.activeDoc.data.pago_cuenta || '';
        if (getEl('doc_pago_referencia')) getEl('doc_pago_referencia').value = this.activeDoc.data.pago_referencia || '';

        if (getEl('doc_paquete_valor')) UI.setCurrencyValue('doc_paquete_valor', this.activeDoc.data.paquete_valor || 0);

        // Actualizar el estado visual del botón de registro rápido
        const btnReg = getEl('btn_quick_register_client');
        if (btnReg) {
            if (this.activeDoc.data.crm_cliente_id) {
                btnReg.innerHTML = '<i class="ph ph-check-circle text-base text-emerald-100"></i> Cliente Registrado';
                btnReg.className = 'bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase tracking-wider px-4 py-2 rounded-xl shadow-md transition-all flex items-center gap-1.5 cursor-default';
                btnReg.disabled = true;
            } else {
                btnReg.innerHTML = '<i class="ph ph-user-plus text-base text-indigo-100"></i> Registrar Cliente en CRM';
                btnReg.className = 'bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black uppercase tracking-wider px-4 py-2 rounded-xl shadow-md transition-all flex items-center gap-1.5';
                btnReg.disabled = false;
            }
        }

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
        const selectPoliticas = document.getElementById('politicas_template_select');
        if (selectPoliticas) {
            selectPoliticas.value = '';
        }
    },

    renderEditorLists: function () {
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
                    <input type="text" placeholder="Valor" value="${this.formatValueForInput(item.valor)}" oninput="DocumentosComponent.onListInputChanged('adicionales', ${idx}, 'valor', this.value)" class="currency-input w-1/4 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 outline-none">
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
                    <input type="text" placeholder="Monto" value="${this.formatValueForInput(item.monto)}" oninput="DocumentosComponent.onListInputChanged('abonos', ${idx}, 'monto', this.value)" class="currency-input flex-1 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 outline-none">
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

    onListInputChanged: function (listName, index, field, value) {
        let arrayToUpdate;
        if (listName === 'principales') arrayToUpdate = this.activeDoc.data.servicios_principales;
        if (listName === 'tours') arrayToUpdate = this.activeDoc.data.tours_actividades;
        if (listName === 'adicionales') arrayToUpdate = this.activeDoc.data.servicios_adicionales;
        if (listName === 'abonos') arrayToUpdate = this.activeDoc.data.abonos;
        if (listName === 'condiciones') arrayToUpdate = this.activeDoc.data.condiciones;

        if (arrayToUpdate && arrayToUpdate[index]) {
            if (field === 'valor' || field === 'monto') {
                arrayToUpdate[index][field] = UI.parseCurrency(value) || 0;
            } else {
                arrayToUpdate[index][field] = value;
            }
        }
        this.recalculate();
        this.renderPreview();
    },
    addPrincipalRow: function () {
        this.activeDoc.data.servicios_principales.push({ categoria: '', descripcion: '' });
        this.renderEditorLists();
        this.recalculate();
        this.renderPreview();
    },
    removePrincipalRow: function (idx) {
        this.activeDoc.data.servicios_principales.splice(idx, 1);
        this.renderEditorLists();
        this.recalculate();
        this.renderPreview();
    },
    addTourRow: function () {
        this.activeDoc.data.tours_actividades.push({ experiencia: '', descripcion: '' });
        this.renderEditorLists();
        this.recalculate();
        this.renderPreview();
    },
    removeTourRow: function (idx) {
        this.activeDoc.data.tours_actividades.splice(idx, 1);
        this.renderEditorLists();
        this.recalculate();
        this.renderPreview();
    },
    addAdicionalRow: function () {
        this.activeDoc.data.servicios_adicionales.push({ categoria: '', descripcion: '', valor: 0 });
        this.renderEditorLists();
        this.recalculate();
        this.renderPreview();
    },
    removeAdicionalRow: function (idx) {
        this.activeDoc.data.servicios_adicionales.splice(idx, 1);
        this.renderEditorLists();
        this.recalculate();
        this.renderPreview();
    },
    addAbonoRow: function () {
        const today = new Date().toLocaleDateString('es-ES');
        this.activeDoc.data.abonos.push({ fecha: today, monto: 0 });
        this.renderEditorLists();
        this.recalculate();
        this.renderPreview();
    },
    removeAbonoRow: function (idx) {
        this.activeDoc.data.abonos.splice(idx, 1);
        this.renderEditorLists();
        this.recalculate();
        this.renderPreview();
    },
    addCondicionRow: function () {
        if (!this.activeDoc.data.condiciones) this.activeDoc.data.condiciones = [];
        this.activeDoc.data.condiciones.push({ titulo: '', descripcion: '' });
        this.renderEditorLists();
        this.recalculate();
        this.renderPreview();
    },
    removeCondicionRow: function (idx) {
        if (this.activeDoc.data.condiciones) {
            this.activeDoc.data.condiciones.splice(idx, 1);
        }
        this.renderEditorLists();
        this.recalculate();
        this.renderPreview();
    },

    onInputChanged: function () {
        if (!this.activeDoc) return;

        const getVal = (id) => {
            const el = document.getElementById(id);
            return el ? el.value : '';
        };

        const oldName = this.activeDoc.data.cliente_nombre || '';
        const oldId = this.activeDoc.data.cliente_id || '';
        const oldTel = this.activeDoc.data.cliente_tel || '';
        const oldEmail = this.activeDoc.data.cliente_email || '';

        this.activeDoc.type = getVal('doc_type') || 'soporte';
        this.activeDoc.data.moneda = getVal('doc_moneda') || 'COP';
        this.activeDoc.data.titulo_documento = getVal('doc_titulo_documento');
        this.activeDoc.data.fecha_emision = getVal('doc_fecha_emision');
        this.activeDoc.data.sello_texto = getVal('doc_sello_texto');
        this.activeDoc.data.sello_subtexto = getVal('doc_sello_subtexto');

        this.activeDoc.data.cliente_nombre = getVal('doc_cliente_nombre');
        this.activeDoc.data.cliente_id = getVal('doc_cliente_id');
        this.activeDoc.data.cliente_tel = getVal('doc_cliente_tel');
        this.activeDoc.data.cliente_email = getVal('doc_cliente_email');

        const newName = this.activeDoc.data.cliente_nombre;
        const newId = this.activeDoc.data.cliente_id;
        const newTel = this.activeDoc.data.cliente_tel;
        const newEmail = this.activeDoc.data.cliente_email;

        // Si se altera el cliente manualmente, se rompe el vínculo con el cliente del CRM
        if (this.activeDoc.data.crm_cliente_id && (oldName !== newName || oldId !== newId || oldTel !== newTel || oldEmail !== newEmail)) {
            this.activeDoc.data.crm_cliente_id = '';
            const btnReg = document.getElementById('btn_quick_register_client');
            if (btnReg) {
                btnReg.innerHTML = '<i class="ph ph-user-plus text-base text-indigo-100"></i> Registrar Cliente en CRM';
                btnReg.className = 'bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black uppercase tracking-wider px-4 py-2 rounded-xl shadow-md transition-all flex items-center gap-1.5';
                btnReg.disabled = false;
            }
        }

        this.activeDoc.data.titulo_viajero = getVal('doc_titulo_viajero');
        this.activeDoc.data.titulo_plan = getVal('doc_titulo_plan');
        this.activeDoc.data.titulo_servicios = getVal('doc_titulo_servicios');
        this.activeDoc.data.titulo_tours = getVal('doc_titulo_tours');
        this.activeDoc.data.titulo_adicionales = getVal('doc_titulo_adicionales');
        this.activeDoc.data.titulo_pagos = getVal('doc_titulo_pagos');

        this.activeDoc.data.destino = getVal('doc_destino');
        const fIda = getVal('doc_fecha_ida');
        const fRegreso = getVal('doc_fecha_regreso');
        this.activeDoc.data.fecha_ida = fIda;
        this.activeDoc.data.fecha_regreso = fRegreso;
        if (fIda && fRegreso) {
            const formatToShort = (isoStr) => {
                const parts = isoStr.split('-');
                if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
                return isoStr;
            };
            this.activeDoc.data.fechas = `${formatToShort(fIda)} al ${formatToShort(fRegreso)}`;
        } else {
            this.activeDoc.data.fechas = '';
        }

        const diasVal = parseInt(getVal('doc_dias')) || 0;
        const nochesVal = parseInt(getVal('doc_noches')) || 0;
        this.activeDoc.data.dias = diasVal;
        this.activeDoc.data.noches = nochesVal;
        if (diasVal > 0 || nochesVal > 0) {
            this.activeDoc.data.duracion = `${diasVal} Días / ${nochesVal} Noches`;
        } else {
            this.activeDoc.data.duracion = '';
        }

        this.activeDoc.data.pasajeros = getVal('doc_pasajeros');
        this.activeDoc.data.pax = parseInt(getVal('doc_pax_count')) || 1;

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

    recalculate: function () {
        const pacoteVal = UI.parseCurrency(document.getElementById('doc_paquete_valor')?.value) || 0;
        this.activeDoc.data.paquete_valor = pacoteVal;

        const paxVal = parseInt(this.activeDoc.data.pax) || 1;
        const adicionalesSum = this.activeDoc.data.servicios_adicionales.reduce((sum, item) => sum + (Number(item.valor) || 0), 0);
        const totalViaje = (pacoteVal * paxVal) + adicionalesSum;
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
        if (!value && value !== 0) {
            return this.activeDoc?.data?.moneda === 'USD' ? '$ 0.00 USD' : '$ 0';
        }
        const isUSD = this.activeDoc?.data?.moneda === 'USD';
        if (isUSD) {
            return '$ ' + parseFloat(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' USD';
        }
        return '$ ' + parseFloat(value).toLocaleString('es-CO');
    },

    formatValueForInput: function (val) {
        if (val === undefined || val === null || val === '') return '';
        const isUSD = this.activeDoc?.data?.moneda === 'USD';
        if (isUSD) {
            const num = parseFloat(val) || 0;
            return num.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        } else {
            let str = String(val).replace(/\D/g, '');
            if (str.length > 1) {
                str = str.replace(/^0+/, '');
            }
            return str.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
        }
    },

    onCurrencyChanged: function () {
        const selectMoneda = document.getElementById('doc_moneda');
        if (selectMoneda) {
            this.activeDoc.data.moneda = selectMoneda.value;
        }
        if (this.activeDoc.data.paquete_valor !== undefined) {
            UI.setCurrencyValue('doc_paquete_valor', this.activeDoc.data.paquete_valor);
        }
        this.renderEditorLists();
        this.recalculate();
        this.renderPreview();
    },

    formatDate: function (dateStr) {
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
        const isUSD = data.moneda === 'USD';
        const c1 = this.settings.color1 || '#005C7A';
        const c2 = this.settings.color2 || '#2563eb';
        const typeLabel = ((data.titulo_documento || '').trim().toUpperCase()) || (this.activeDoc.type === 'cotizacion' ? 'COTIZACIÓN' : 'SOPORTE DE PAGO');

        const fmt = (val) => this.formatCurrency(val);
        const formatDate = (dStr) => this.formatDate(dStr);

        const paxVal = parseInt(data.pax) || 1;
        const adicionalesSum = data.servicios_adicionales.reduce((sum, item) => sum + (Number(item.valor) || 0), 0);
        const totalViaje = ((Number(data.paquete_valor) || 0) * paxVal) + adicionalesSum;
        const abonosSum = data.abonos.reduce((sum, item) => sum + (Number(item.monto) || 0), 0);
        const saldoPendiente = totalViaje - abonosSum;

        let desglosePlanesHtml = `
            <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 6px 0; text-align: left; color: #64748b;">Valor Plan Turístico (Valor Unitario):</td>
                <td style="padding: 6px 0; text-align: right; font-weight: 600;">${fmt(data.paquete_valor)}</td>
            </tr>
        `;
        if (paxVal > 1) {
            desglosePlanesHtml += `
                <tr style="border-bottom: 1px solid #f1f5f9;">
                    <td style="padding: 6px 0; text-align: left; color: #64748b;">Cantidad de Viajeros (PAX):</td>
                    <td style="padding: 6px 0; text-align: right; font-weight: 600;">${paxVal}</td>
                </tr>
                <tr style="border-bottom: 1px solid #f1f5f9;">
                    <td style="padding: 6px 0; text-align: left; color: #64748b;">Subtotal Plan Turístico:</td>
                    <td style="padding: 6px 0; text-align: right; font-weight: 700; color: #0f172a;">${fmt(data.paquete_valor * paxVal)}</td>
                </tr>
            `;
        }

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
                        <p style="margin: 8px 0 0 0; font-weight: 700; color: ${c1}; text-align: center; font-size: 8.5px;">
                            Para validar la información completa de las políticas de cancelación, tratamiento de datos y condiciones, visite nuestra página web <a href="https://vivetravelcol.com" target="_blank" style="color: ${c1}; text-decoration: underline;">vivetravelcol.com</a>
                        </p>
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
                        ${desglosePlanesHtml}
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
                    ${isUSD ? `
                    <div style="font-size: 8px; color: #64748b; margin-top: 8px; text-align: right; font-style: italic; font-weight: 600; line-height: 1.35;">
                        * Cotización expresada en Dólares Americanos (USD).<br>
                        * Sujeta a la tasa de cambio (TRM) vigente al día del pago.
                    </div>
                    ` : ''}
                </div>
            </div>

            <!-- POLÍTICAS IMPORTANTES -->
            ${condicionesHtml}
        </div>`;
    },

    exportToPDF: async function () {
        this.onInputChanged();
        const container = document.getElementById('pdf_preview_container');
        if (!container) return;

        // Auto-guardado antes de exportar
        UI.showToast("Auto-guardando borrador antes de exportar...", "info");
        const saved = await this.saveActiveDocument(true);
        if (!saved) {
            UI.showToast("La exportación a PDF continuará, pero los cambios no quedaron guardados en la base de datos.", "warning");
        }

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

    onDurationDaysChanged: function () {
        const diasInput = document.getElementById('doc_dias');
        const nochesInput = document.getElementById('doc_noches');
        if (diasInput && nochesInput) {
            const diasVal = parseInt(diasInput.value) || 0;
            if (diasVal > 0) {
                nochesInput.value = Math.max(0, diasVal - 1);
            }
        }
        this.onInputChanged();
    },

    onPaxCountChanged: function () {
        const paxInput = document.getElementById('doc_pax_count');
        const paxVal = parseInt(paxInput?.value) || 1;
        const pasajerosInput = document.getElementById('doc_pasajeros');
        if (pasajerosInput) {
            if (paxVal > 1) {
                pasajerosInput.value = `${paxVal} Viajeros (1 Titular + ${paxVal - 1} Acompañante(s))`;
            } else {
                pasajerosInput.value = `1 Viajero (Titular)`;
            }
        }
        this.onInputChanged();
    },

    openQuickRegisterModal: function () {
        const getVal = (id) => document.getElementById(id)?.value || '';

        const fullName = getVal('doc_cliente_nombre').trim();
        if (!fullName) {
            return UI.showToast("Por favor digite el nombre completo del viajero.", "error");
        }
        const docId = getVal('doc_cliente_id').trim();
        if (!docId) {
            return UI.showToast("Por favor digite la identificación del viajero.", "error");
        }

        // Dividir el nombre completo en Nombre y Apellido
        const parts = fullName.split(/\s+/);
        const nombre = parts[0] || '';
        const apellido = parts.slice(1).join(' ') || '';

        // Pre-rellenar los inputs del modal
        const setVal = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.value = val;
        };

        setVal('qcf_nombre', nombre);
        setVal('qcf_apellido', apellido);
        setVal('qcf_documento', docId);
        setVal('qcf_telefono', getVal('doc_cliente_tel'));
        setVal('qcf_email', getVal('doc_cliente_email'));
        setVal('qcf_ciudad', '');

        // Plan: seleccionar el plan actual del selector si coincide
        const planSelector = document.getElementById('crm_plan_select');
        const planId = planSelector ? planSelector.value : '';

        const qcfPlanSelect = document.getElementById('qcf_plan_id');
        if (qcfPlanSelect) {
            qcfPlanSelect.innerHTML = '<option value="">-- Conectar a Plan --</option>';
            (DataService.planes || []).forEach(p => {
                qcfPlanSelect.innerHTML += `<option value="${p.id}">${p.nombre} (${p.destino || 'Destino'})</option>`;
            });
            qcfPlanSelect.value = planId;
        }

        setVal('qcf_pax', parseInt(getVal('doc_pax_count')) || 1);

        const pacoteVal = UI.parseCurrency(document.getElementById('doc_paquete_valor')?.value) || 0;
        const paxVal = parseInt(getVal('doc_pax_count')) || 1;
        const totalPlanVal = pacoteVal * paxVal;
        if (document.getElementById('qcf_precio_total')) {
            UI.setCurrencyValue('qcf_precio_total', totalPlanVal);
        }

        // Abrir el modal
        UI.openModal('modal-quick-client', 'mqc-bg', 'mqc-content');
    },

    saveQuickClient: async function () {
        const form = document.getElementById('quick-client-form');
        if (form && !form.checkValidity()) {
            form.reportValidity();
            return;
        }

        const getVal = (id) => document.getElementById(id)?.value || '';

        const nombre = getVal('qcf_nombre').trim();
        const apellido = getVal('qcf_apellido').trim();
        const documento = getVal('qcf_documento').trim();
        const telefono = getVal('qcf_telefono').trim();
        const email = getVal('qcf_email').trim();
        const ciudad = getVal('qcf_ciudad').trim();
        const plan_id = getVal('qcf_plan_id');
        const pax = parseInt(getVal('qcf_pax')) || 1;
        const precio_total = UI.parseCurrency(document.getElementById('qcf_precio_total')?.value) || 0;
        const estado = getVal('qcf_estado') || 'pendiente de pago';

        // 1. Prevención de Duplicados: verificar si existe un cliente con este documento
        const existing = (DataService.clientes || []).find(c => c.documento === documento && !c.deleted_at);
        if (existing) {
            const confirmLink = confirm(`Alerta de Duplicidad: Ya existe un cliente con el documento "${documento}" (${existing.nombre} ${existing.apellido || ''}).\n\n¿Deseas vincular esta cotización a este cliente existente en lugar de registrar uno nuevo?`);
            if (confirmLink) {
                this.linkToExistingClient(existing);
                return;
            } else {
                return; // Aborta la operación para corregir el documento
            }
        }

        if (!plan_id) {
            return UI.showToast("Debe conectar al cliente a un plan válido.", "error");
        }

        const btn = document.getElementById('btn-save-quick-client');
        const origHTML = btn ? btn.innerHTML : '';
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="ph ph-spinner animate-spin mr-2"></i> Guardando...';
        }

        const payload = {
            nombre,
            apellido,
            documento,
            telefono,
            email,
            ciudad,
            plan_id,
            pax,
            precio_total,
            estado,
            fecha_viaje: 'Fecha Abierta',
            etiqueta: 'normal',
            abono_acumulado: 0,
            saldo_restante: precio_total
        };

        try {
            const res = await DataService.saveCliente(payload);
            if (res) {
                UI.showToast("Cliente registrado y sincronizado en el CRM.", "success");
                UI.closeModal('modal-quick-client', 'mqc-bg', 'mqc-content');

                // Actualizar cotización activa con este cliente
                this.activeDoc.data.crm_cliente_id = res.id;
                this.activeDoc.data.cliente_nombre = `${res.nombre} ${res.apellido || ''}`.trim();
                this.activeDoc.data.cliente_id = res.documento || '';
                this.activeDoc.data.cliente_tel = res.telefono || '';
                this.activeDoc.data.cliente_email = res.email || '';
                this.activeDoc.data.pax = res.pax || 1;

                this.fillDOMFromActiveDoc();
                this.recalculate();
                this.renderPreview();

                // Recargar el selector superior de reservas
                await this.loadCRMData();
            }
        } catch (err) {
            console.error("Error al registrar cliente rápido:", err);
            UI.showToast("Error guardando el cliente en la base de datos.", "error");
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = origHTML;
            }
        }
    },

    linkToExistingClient: function (existingClient) {
        UI.closeModal('modal-quick-client', 'mqc-bg', 'mqc-content');

        // Llenar cotización con datos del cliente existente
        this.activeDoc.data.crm_cliente_id = existingClient.id;
        this.activeDoc.data.cliente_nombre = `${existingClient.nombre} ${existingClient.apellido || ''}`.trim();
        this.activeDoc.data.cliente_id = existingClient.documento || '';
        this.activeDoc.data.cliente_tel = existingClient.telefono || '';
        this.activeDoc.data.cliente_email = existingClient.email || '';
        this.activeDoc.data.pax = existingClient.pax || 1;

        // Si el cliente tiene un plan, traerlo
        const plan = DataService.planes.find(p => p.id === existingClient.plan_id);
        if (plan) {
            this.activeDoc.data.destino = plan.destino || plan.nombre;
            this.activeDoc.data.duracion = plan.duracion || '';

            const paxNum = Number(existingClient.pax) || 1;
            if (existingClient.precio_total) {
                this.activeDoc.data.paquete_valor = Math.round(Number(existingClient.precio_total) / paxNum);
            } else {
                this.activeDoc.data.paquete_valor = Number(plan.precio_persona) || 0;
            }
            if (plan.servicios_incluidos) {
                this.activeDoc.data.servicios_principales = JSON.parse(JSON.stringify(plan.servicios_incluidos));
            }
        }

        this.fillDOMFromActiveDoc();
        this.recalculate();
        this.renderPreview();
        UI.showToast("Cotización vinculada al cliente existente con éxito.", "success");
    },

    toggleSection: function (headerEl) {
        const section = headerEl.closest('.accordion-section');
        if (!section) return;
        section.classList.toggle('collapsed');
    },

    loadPoliticasTemplate: function (templateName, force = false) {
        if (!templateName) return;

        const templates = {
            cotizacion: [
                {
                    titulo: 'Validez de la Oferta',
                    descripcion: 'Las tarifas y cupos presentados están sujetos a disponibilidad y cambios por parte de los proveedores finales sin previo aviso. La confirmación definitiva se realiza únicamente con el pago del depósito inicial.'
                },
                {
                    titulo: 'Proceso de Pagos',
                    descripcion: 'Vive Travel acepta transferencias bancarias (Bancolombia, Davivienda, BBVA), PSE, tarjetas de crédito y efectivo. Para planes mayores a $1.000.000 COP, aplica nuestro plan de pagos flex (40% de cuota inicial, 30% a los 15 días y 30% de saldo 7 días antes del viaje).'
                },
                {
                    titulo: 'Políticas de Cancelación',
                    descripcion: 'Para planes de más de 1 día (con vuelos o alojamiento), no aplica reembolso por concepto de tiquetes aéreos o reserva hotelera. Para pasadías, aplica reembolso parcial únicamente notificando con más de 15 días de anticipación al viaje; cancelaciones con 15 días o menos de antelación no tienen devolución.'
                }
            ],
            soporte: [
                {
                    titulo: 'Registro de Pago',
                    descripcion: 'Este documento constituye el soporte formal de recibo de pago para la reserva de los servicios turísticos intermediados por Vive Travel (VIVES GROUP S.A.S.).'
                },
                {
                    titulo: 'Políticas de Cancelación',
                    descripcion: 'Para planes de más de 1 día (con vuelos o alojamiento), no aplica reembolso por concepto de tiquetes aéreos o reserva hotelera. Para pasadías, aplica reembolso parcial únicamente notificando con más de 15 días de anticipación al viaje; cancelaciones con 15 días o menos de antelación no tienen devolución.'
                },
                {
                    titulo: 'Tratamiento de Datos Personales',
                    descripcion: 'De acuerdo con la Ley 1581 de 2012 de Protección de Datos en Colombia, el cliente autoriza expresamente a Vive Travel (VIVES GROUP S.A.S.) a tratar sus datos personales para la emisión de pólizas de asistencia médica y reservas.'
                }
            ],
            abono: [
                {
                    titulo: 'Reserva Provisional y Siguiente Pago',
                    descripcion: 'Este soporte formaliza el recibo de abono parcial para la reserva. La reserva provisional se mantendrá activa siempre que se cumpla con el plan de pagos pactado. El no pago oportuno de las cuotas liberará los cupos y generará penalidades.'
                },
                {
                    titulo: 'Políticas de Cancelación',
                    descripcion: 'Para planes de más de 1 día (con vuelos o alojamiento), no aplica reembolso por concepto de tiquetes aéreos o reserva hotelera. Para pasadías, aplica reembolso parcial únicamente notificando con más de 15 días de anticipación al viaje; cancelaciones con 15 días o menos de antelación no tienen devolución.'
                },
                {
                    titulo: 'Datos Personales y Pólizas',
                    descripcion: 'El cliente autoriza la recolección de datos personales de los viajeros para la emisión de pólizas de asistencia y seguros de cancelación requeridos para garantizar los servicios.'
                }
            ]
        };

        const currentConds = this.activeDoc.data.condiciones || [];
        let isModified = false;
        if (currentConds.length > 0) {
            if (currentConds.length !== 2) {
                isModified = true;
            } else {
                const c1 = currentConds[0];
                const c2 = currentConds[1];

                const isDefaultSoporte = c1.titulo === 'Registro de Pago' &&
                    c1.descripcion.startsWith('Este documento constituye el soporte formal') &&
                    c2.titulo === 'Políticas de Cancelación / Penalidades' &&
                    c2.descripcion.startsWith('Cambios o cancelaciones están sujetos');

                const isDefaultValidez = c1.titulo === 'Validez y Condiciones Comerciales' &&
                    c1.descripcion.startsWith('Este documento constituye el soporte formal') &&
                    c2.titulo === 'Políticas de Cancelación / Penalidades' &&
                    c2.descripcion.startsWith('Cambios o cancelaciones están sujetos');

                if (!isDefaultSoporte && !isDefaultValidez) {
                    isModified = true;
                }
            }
        }

        if (isModified && !force) {
            const confirmChange = confirm("¿Deseas reemplazar las condiciones y políticas actuales con la plantilla seleccionada?");
            if (!confirmChange) {
                const select = document.getElementById('politicas_template_select');
                if (select) select.value = '';
                return;
            }
        }

        this.activeDoc.data.condiciones = JSON.parse(JSON.stringify(templates[templateName]));
        this.renderEditorLists();
        this.recalculate();
        this.renderPreview();

        const select = document.getElementById('politicas_template_select');
        if (select) select.value = templateName;

        UI.showToast(`Plantilla de "${templateName}" cargada exitosamente.`, "success");
    },

    updateDefaultTitleFromType: function () {
        const docType = document.getElementById('doc_type')?.value;
        const titleEl = document.getElementById('doc_titulo_documento');
        const sealTextEl = document.getElementById('doc_sello_texto');
        const sealSubtextEl = document.getElementById('doc_sello_subtexto');

        if (titleEl) {
            titleEl.value = docType === 'cotizacion' ? 'COTIZACIÓN' : 'SOPORTE DE PAGO';
        }

        if (docType === 'cotizacion') {
            if (sealTextEl) sealTextEl.value = 'PROPUESTA';
            if (sealSubtextEl) sealSubtextEl.value = 'COTIZACIÓN';
        } else {
            if (sealTextEl) sealTextEl.value = 'PAGO PARCIAL';
            if (sealSubtextEl) sealSubtextEl.value = 'RESERVA ACTIVA';
        }

        const selectPoliticas = document.getElementById('politicas_template_select');
        if (selectPoliticas) {
            selectPoliticas.value = docType === 'cotizacion' ? 'cotizacion' : 'soporte';
            this.loadPoliticasTemplate(selectPoliticas.value, true);
        }

        this.onInputChanged();
    }
};

export { DocumentosComponent };
