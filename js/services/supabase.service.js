// ============================================================
// js/services/supabase.service.js — Cliente Supabase + DataService
// Dependencias: CDN global `supabase` (cargado antes en index.html)
// Extraído de app.js líneas 1–5 y 283–527
// REGLA: Las llamadas a ClientsModule/DashboardModule usan window.*
// ============================================================
import { parseSpanishDate } from '../utils/format.utils.js';
import { Store } from '../../src/core/store.js';

const { createClient } = supabase; // CDN global
const supabaseUrl = 'https://qefuqkplornelbzwqgri.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFlZnVxa3Bsb3JuZWxiendxZ3JpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4MDkzMTUsImV4cCI6MjA4ODM4NTMxNX0.nqTpWWq0wJXrY-JynUz_oPUEGaMhVbTK1dOBBq3p9rs';

export const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);

// ─── DATA SERVICE ─────────────────────────────────────────────
export const DataService = {
    planes: [],
    clientes: [],
    proveedores: [],
    abonos: [],
    gastos: [],
    ciudades: [],
    seguimientos: [],
    b2b_aliados: [],
    b2b_servicios: [],
    b2b_negocios: [],
    adelantos_operativos: [],
    documentos_guardados: [],
    db: {
        categories: ["Operador Turístico", "Alojamiento / Hotelería", "Transporte Especial", "Aseguradora Integral", "Restaurante y Eventos", "Guianza Local"],
        destinos: ["Barranquilla", "Cartagena", "Quindío", "Santa Marta", "La Guajira", "San Andrés"]
    },

    async loadAll() {
        const loaderText = document.getElementById('loader-text');
        if (loaderText) loaderText.innerText = "Consultando catálogo...";

        await this.loadCiudades();

        if (loaderText) loaderText.innerText = "Descargando matrices del sistema...";

        // IMPLEMENTACIÓN DE PAGINACIÓN SEGURA:
        // Se añaden límites (limit) para prevenir cuellos de botella de memoria
        // sin romper las relaciones de datos actuales.
        const [resPlanes, resClientes, resProv, resAbo, resGastos, resSeguimientos, resB2BAli, resB2BServ, resB2BNeg] = await Promise.all([
            supabaseClient.from('planes').select('*').is('deleted_at', null).order('created_at', { ascending: false }).limit(500),
            supabaseClient.from('clientes').select('*').is('deleted_at', null).order('created_at', { ascending: false }).limit(2000),
            supabaseClient.from('proveedores').select('*').is('deleted_at', null).order('created_at', { ascending: false }).limit(1000),
            // Nota: Abonos se trae ordenado descendente para obtener los más recientes,
            // y luego se invierte el array para mantener la compatibilidad (ascending: true) del UI.
            supabaseClient.from('abonos').select('*').is('deleted_at', null).order('created_at', { ascending: false }).limit(5000),
            supabaseClient.from('gastos_salidas').select('*').is('deleted_at', null).order('created_at', { ascending: false }).limit(3000),
            supabaseClient.from('seguimientos').select('*').order('created_at', { ascending: false }).limit(2000),
            supabaseClient.from('b2b_aliados').select('*').order('created_at', { ascending: false }).limit(1000),
            supabaseClient.from('b2b_servicios_catalogo').select('*').order('created_at', { ascending: false }).limit(1000),
            supabaseClient.from('b2b_negocios').select('*').order('created_at', { ascending: false }).limit(2000)
        ]);

        if (resPlanes.data) this.planes = resPlanes.data;
        if (resClientes.data) {
            this.clientes = resClientes.data.map(c => {
                if (c.estado && (c.estado.toLowerCase() === 'cancelado o devolución' || c.estado.toLowerCase() === 'cancelados')) {
                    c.estado = 'en caja';
                }
                return c;
            });
        }
        if (resProv.data) this.proveedores = resProv.data;
        // Restauramos el orden ascendente original para los abonos
        if (resAbo.data) this.abonos = resAbo.data.reverse();
        if (resGastos.data) this.gastos = resGastos.data; else this.gastos = [];
        if (resSeguimientos && resSeguimientos.data) this.seguimientos = resSeguimientos.data; else this.seguimientos = [];
        if (resB2BAli && resB2BAli.data) this.b2b_aliados = resB2BAli.data; else this.b2b_aliados = [];
        if (resB2BServ && resB2BServ.data) this.b2b_servicios = resB2BServ.data; else this.b2b_servicios = [];
        if (resB2BNeg && resB2BNeg.data) this.b2b_negocios = resB2BNeg.data; else this.b2b_negocios = [];
        
        this.adelantos_operativos = [];
        try {
            const { data, error } = await supabaseClient
                .from('adelantos_operativos')
                .select('*')
                .is('deleted_at', null)
                .order('created_at', { ascending: false });
            if (!error && data) {
                this.adelantos_operativos = data;
            }
        } catch (err) {
            console.warn("Table 'adelantos_operativos' is missing or inaccessible. Fallback applied.", err);
        }

        this.documentos_guardados = [];
        try {
            const { data, error } = await supabaseClient
                .from('documentos_guardados')
                .select('*')
                .is('deleted_at', null)
                .order('updated_at', { ascending: false });
            if (!error && data) {
                this.documentos_guardados = data;
            }
        } catch (err) {
            console.warn("Table 'documentos_guardados' is missing or inaccessible. Fallback applied.", err);
        }

        Store.setState({
            planes: this.planes,
            clientes: this.clientes,
            proveedores: this.proveedores,
            abonos: this.abonos,
            gastos: this.gastos,
            seguimientos: this.seguimientos,
            b2b_aliados: this.b2b_aliados,
            b2b_servicios: this.b2b_servicios,
            b2b_negocios: this.b2b_negocios,
            ciudades: this.ciudades,
            adelantos_operativos: this.adelantos_operativos,
            documentos_guardados: this.documentos_guardados
        });

        this.autoClassifyReservas();
    },

    /*
     * REGLAS MAESTRAS DE CLASIFICACIÓN (Ejecución Automática)
     * 1) RESERVAS ACTIVAS -> Fecha NO ha ocurrido (sea que deban o hayan pagado 100%).
     * 2) EN CAJA -> Fecha YA PASÓ, pero el pago es < 100%.
     * 3) DEVOLUCIÓN -> Asignado manualmente.
     * 4) REPROGRAMADO -> Asignado manualmente.
     * 5) REALIZADAS -> Fecha YA PASÓ, y pago >= 100%.
     * 
     * Esta función garantiza que los estados sean mutuamente excluyentes y actualiza
     * la base de datos automáticamente si hay cambios lógicos.
     */
    autoClassifyReservas() {
        const today = new Date();
        today.setHours(0,0,0,0);
        let hasChanges = false;
        
        this.clientes.forEach(c => {
            const st = c.estado ? c.estado.toLowerCase() : '';
            
            // Estados manuales definitivos se respetan
            if (st === 'devolución' || st === 'cancelado o devolución' || st === 'cancelados' || st === 'reprogramado' || st === 'desistió') {
                return;
            }

            if (c.fecha_viaje) {
                const dateViaje = parseSpanishDate(c.fecha_viaje);
                if (dateViaje && !isNaN(dateViaje)) {
                    const isPast = dateViaje < today;
                    
                    const precioTotal = parseFloat(c.precio_total || 0);
                    const totalAbonado = this.abonos.filter(a => a.cliente_id === c.id && a.estado_pago !== 'pending' && a.estado_pago !== 'refunded').reduce((s, a) => s + (parseFloat(a.monto) || 0), 0);
                    const porcentaje = precioTotal > 0 ? (totalAbonado / precioTotal) * 100 : (totalAbonado > 0 ? 100 : 0);
                    
                    let targetState = c.estado; // por defecto mantiene el actual

                    if (isPast) {
                        if (porcentaje >= 100) {
                            targetState = 'Realizadas';
                        } else {
                            targetState = 'En Caja';
                        }
                    } else {
                        // Fecha no ha pasado
                        if (st === 'en caja' || st === 'realizadas' || st === 'realizado') {
                            // Si antes estaba en el pasado y se movió la fecha al futuro (por edición del plan), regresa a activa
                            targetState = 'Confirmada / Activa';
                        }
                    }

                    const currentNormalized = st === 'realizado' ? 'realizadas' : st;
                    const targetNormalized = targetState.toLowerCase();

                    if (currentNormalized !== targetNormalized) {
                        const estadoAnterior = c.estado;
                        c.estado = targetState;
                        hasChanges = true;
                        this.registrarHistorial(c.id, 'estado (automatizado)', estadoAnterior, targetState);
                        supabaseClient.from('clientes').update({ estado: targetState }).eq('id', c.id).then();
                    }
                }
            }
        });
        
        if (hasChanges) {
             console.log("Reservas reclasificadas automáticamente según reglas maestras.");
        }
    },

    async loadCiudades() {
        try {
            const { data } = await supabaseClient.from('ciudades').select('*').limit(2);
            if (data && data.length > 0) {
                const fullData = await supabaseClient.from('ciudades').select('*');
                this.ciudades = fullData.data || [];
            } else {
                try {
                    const response = await fetch('https://www.datos.gov.co/resource/gdxc-w37w.json?$limit=1200');
                    const jsonData = await response.json();
                    const mapeoCiudades = jsonData.map(c => ({
                        id: c.cod_mpio,
                        departamento: c.dpto,
                        municipio: c.nom_mpio
                    }));
                    for (let i = 0; i < mapeoCiudades.length; i += 300) {
                        await supabaseClient.from('ciudades').insert(mapeoCiudades.slice(i, i + 300));
                    }
                    this.ciudades = mapeoCiudades;
                } catch (err) {
                    console.error("Falla API DIVIPOLA:", err);
                    this.ciudades = [];
                }
            }
        } catch (err) {
            console.error("Error consultando ciudades en Supabase:", err);
            this.ciudades = [];
        }
        
        const dl = document.getElementById('ciudades-list');
        if (dl) {
            dl.innerHTML = '';
            (this.ciudades || []).forEach(c => dl.innerHTML += `<option value="${c.departamento} - ${c.municipio}">`);
        }
    },

    getCategories: () => DataService.db.categories,
    addCategory: (cat) => {
        if (!DataService.db.categories.includes(cat)) DataService.db.categories.push(cat);
    },
    getSupplierById: (id) => DataService.proveedores.find(s => s.id === id),

    async recomputeAllClientBalances() {
        const btn = document.querySelector('button[onclick="DataService.recomputeAllClientBalances()"]');
        if (btn) {
            btn.innerHTML = '<i class="ph ph-spinner animate-spin text-xl mr-3 text-slate-400"></i><span class="font-medium text-sm">Descargando Servidor...</span>';
            btn.disabled = true;
        }
        try {
            await this.loadAll();

            // DashboardComponent se actualiza automáticamente vía Store al hacer loadAll()
            window.UI.showToast("Sincronización con el servidor exitosa.", "success");
        } catch (e) {
            window.UI.showToast("Error conectando con la Base de Datos.", "error");
        } finally {
            if (btn) {
                btn.innerHTML = '<i class="ph ph-arrows-clockwise text-xl mr-3 text-slate-400"></i><span class="font-medium text-sm">Sincronizar Saldos</span>';
                btn.disabled = false;
            }
        }
    },

    async savePlan(datosParaGuardar) {
        try {
            if (!datosParaGuardar.id) {
                delete datosParaGuardar.id;
                const result = await supabaseClient.from('planes').insert([datosParaGuardar]);
                if (result.error) throw result.error;
            } else {
                const { id, ...datosMapeados } = datosParaGuardar;
                const result = await supabaseClient.from('planes').update(datosMapeados).eq('id', id);
                if (result.error) throw result.error;
            }
            await this.loadAll();
        } catch (e) { throw e; }
    },

    async registrarHistorial(clienteId, campo, valorAnterior, valorNuevo, tipoEvento = 'MODIFICACION', detalles = {}) {
        try {
            const payload = {
                cliente_id: clienteId,
                campo: campo,
                valor_anterior: String(valorAnterior || ''),
                valor_nuevo: String(valorNuevo || ''),
                usuario_email: window.AuthModule?.currentUser?.email || 'Staff',
                tipo_evento: tipoEvento,
                detalles: detalles
            };
            const { error } = await supabaseClient.from('historial_reservas').insert([payload]);
            if (error) {
                if (error.code === '42P01') {
                    console.warn("Aviso DB: Crea la tabla 'historial_reservas' en Supabase con cliente_id (uuid), campo, valor_anterior, valor_nuevo, usuario_email, tipo_evento, detalles.");
                } else {
                    console.error("Error guardando historial:", error);
                }
            }
        } catch (e) {
            console.error("Error en registrarHistorial:", e);
        }
    },

    async saveCliente(datosParaGuardar) {
        try {
            let resultadoDB;
            if (!datosParaGuardar.id) {
                delete datosParaGuardar.id;
                resultadoDB = await supabaseClient.from('clientes').insert([datosParaGuardar]).select();
                
                if (!resultadoDB.error && resultadoDB.data && resultadoDB.data[0]) {
                    // Historial de creación
                    await this.registrarHistorial(resultadoDB.data[0].id, 'Creación de Reserva', 'N/A', 'Reserva Creada Inicialmente', 'CREACION');
                }
            } else {
                const { id, ...datosMapeados } = datosParaGuardar;
                
                // Buscar cliente actual para comparar
                const clienteActual = this.clientes.find(c => c.id === id);
                if (clienteActual) {
                    const camposAComparar = ['nombre', 'apellido', 'documento', 'telefono', 'email', 'pax', 'plan_id', 'fecha_viaje', 'precio_total', 'estado', 'etiqueta', 'dni', 'vendedor', 'costo_total', 'notas_financieras', 'costo_base'];
                    for (const campo of camposAComparar) {
                        if (datosMapeados[campo] !== undefined && String(datosMapeados[campo]) !== String(clienteActual[campo])) {
                            let valAnt = clienteActual[campo];
                            let valNue = datosMapeados[campo];
                            if (campo === 'plan_id') {
                                const planAnt = this.planes.find(p => p.id === valAnt);
                                const planNue = this.planes.find(p => p.id === valNue);
                                valAnt = planAnt ? planAnt.nombre : valAnt;
                                valNue = planNue ? planNue.nombre : valNue;
                            }
                            await this.registrarHistorial(id, campo, valAnt, valNue, 'MODIFICACION');
                        }
                    }

                    // Comparación de pasajeros internacionales (JSON)
                    if (datosMapeados.pasajeros_internacionales !== undefined) {
                        const jsonAnt = JSON.stringify(clienteActual.pasajeros_internacionales || []);
                        const jsonNue = JSON.stringify(datosMapeados.pasajeros_internacionales || []);
                        if (jsonAnt !== jsonNue) {
                            const cantAnt = (clienteActual.pasajeros_internacionales || []).length;
                            const cantNue = (datosMapeados.pasajeros_internacionales || []).length;
                            await this.registrarHistorial(
                                id, 
                                'Pasajeros Internacionales Modificados', 
                                `${cantAnt} pasajeros`, 
                                `${cantNue} pasajeros`, 
                                'MODIFICACION',
                                { detalles_previos: clienteActual.pasajeros_internacionales, detalles_nuevos: datosMapeados.pasajeros_internacionales }
                            );
                        }
                    }
                }

                resultadoDB = await supabaseClient.from('clientes').update(datosMapeados).eq('id', id).select();

                // PROPAGACIÓN GRUPAL: Si es titular y actualiza campos compartidos, propagarlos a acompañantes
                const companions = this.clientes.filter(c => c.parent_id === id && !c.deleted_at);
                if (companions.length > 0) {
                    const camposCompartidos = {};
                    if (datosMapeados.plan_id !== undefined) camposCompartidos.plan_id = datosMapeados.plan_id;
                    if (datosMapeados.fecha_viaje !== undefined) camposCompartidos.fecha_viaje = datosMapeados.fecha_viaje;
                    if (datosMapeados.estado !== undefined) camposCompartidos.estado = datosMapeados.estado;
                    if (datosMapeados.etiqueta !== undefined) camposCompartidos.etiqueta = datosMapeados.etiqueta;
                    if (datosMapeados.costo_base !== undefined) camposCompartidos.costo_base = datosMapeados.costo_base;
                    if (datosMapeados.proveedores_vinculados !== undefined) camposCompartidos.proveedores_vinculados = datosMapeados.proveedores_vinculados;

                    if (Object.keys(camposCompartidos).length > 0) {
                        const resUpdateComps = await supabaseClient.from('clientes').update(camposCompartidos).eq('parent_id', id);
                        if (resUpdateComps.error) console.warn("Error propagando campos del grupo a acompañantes:", resUpdateComps.error);
                    }
                }
            }
            if (resultadoDB.error) throw resultadoDB.error;
            await this.loadAll();
            return resultadoDB.data ? resultadoDB.data[0] : null;
        } catch (e) { throw e; }
    },

    async recalculateClientBalances(clienteId) {
        // Delegado a Triggers de Supabase (retrocompatibilidad)
        return true;
    },

    async saveAbono(datosParaGuardar) {
        try {
            delete datosParaGuardar.id;
            if (!datosParaGuardar.estado_pago) datosParaGuardar.estado_pago = 'confirmed';

            // 1. Verificar si se especificó un destinatario individual del grupo
            const destId = datosParaGuardar.destinatario_id;
            delete datosParaGuardar.destinatario_id; // eliminar del payload de Supabase

            const isIndividual = destId && destId !== 'grupo' && destId !== datosParaGuardar.cliente_id;
            const targetClientId = isIndividual ? destId : datosParaGuardar.cliente_id;

            // Si es individual, reasignar el cliente_id al destinatario específico
            if (isIndividual) {
                datosParaGuardar.cliente_id = targetClientId;
            }

            // 2. Si no es el abono directo individual, verificar si es un abono grupal para distribuir
            const companions = (!isIndividual && destId !== datosParaGuardar.cliente_id)
                ? this.clientes.filter(c => c.parent_id === datosParaGuardar.cliente_id && !c.deleted_at)
                : [];

            if (companions.length > 0) {
                // DISTRIBUCIÓN GRUPAL EQUITATIVA
                const totalIntegrantes = companions.length + 1;
                const splitAmount = Math.floor(datosParaGuardar.monto / totalIntegrantes);

                // Validar duplicados para el titular con el monto dividido
                const posiblesDuplicados = this.abonos.filter(a =>
                    a.cliente_id === datosParaGuardar.cliente_id &&
                    Number(a.monto) === splitAmount &&
                    a.metodo === datosParaGuardar.metodo
                );

                if (posiblesDuplicados.length > 0 && splitAmount > 0) {
                    const diffMin = (new Date() - new Date(posiblesDuplicados[posiblesDuplicados.length - 1].created_at || new Date())) / 1000 / 60;
                    if (diffMin < 2) {
                        await this.registrarHistorial(
                            datosParaGuardar.cliente_id, 
                            'Alerta Antifraude: Intento de Abono Duplicado (Grupal)', 
                            'N/A', 
                            `Monto: $${splitAmount} | Método: ${datosParaGuardar.metodo}`, 
                            'SEGURIDAD', 
                            { intento_por: datosParaGuardar.usuario_email || 'Staff' }
                        );
                        window.UI.showToast('Abono idéntico detectado hace menos de 2 minutos. Bloqueado por seguridad anti-duplicados.', 'error');
                        throw new Error("DUPLICATE_PAYMENT");
                      }
                }

                // Insertar abono padre (Titular)
                const parentPayload = {
                    cliente_id: datosParaGuardar.cliente_id,
                    monto: splitAmount,
                    metodo: datosParaGuardar.metodo,
                    estado_pago: datosParaGuardar.estado_pago,
                    usuario_email: datosParaGuardar.usuario_email || 'Staff'
                };
                const resParent = await supabaseClient.from('abonos').insert([parentPayload]).select();
                if (resParent.error) throw resParent.error;

                const parentId = resParent.data[0].id;
                await this.registrarHistorial(
                    datosParaGuardar.cliente_id,
                    'Registro de Abono Principal (Grupal)',
                    'N/A',
                    `Abono de $${splitAmount} (Total: $${datosParaGuardar.monto}) vía ${datosParaGuardar.metodo}`,
                    'CREACION'
                );

                // Insertar abonos hijos (Acompañantes) en lote (batch)
                const childrenPayloads = companions.map(comp => ({
                    cliente_id: comp.id,
                    monto: splitAmount,
                    metodo: datosParaGuardar.metodo,
                    estado_pago: datosParaGuardar.estado_pago,
                    usuario_email: datosParaGuardar.usuario_email || 'Staff',
                    parent_abono_id: parentId
                }));

                const resChildren = await supabaseClient.from('abonos').insert(childrenPayloads);
                if (resChildren.error) throw resChildren.error;

                for (const comp of companions) {
                    await this.registrarHistorial(
                        comp.id,
                        'Registro de Abono Hijo (Distribución Grupal)',
                        'N/A',
                        `Abono recibido de $${splitAmount} (Origen: Titular)`,
                        'CREACION'
                    );
                }

                await this.loadAll();
                await this.recalculateClientBalances(datosParaGuardar.cliente_id);
                for (const comp of companions) {
                    await this.recalculateClientBalances(comp.id);
                }
            } else {
                // ABONO INDIVIDUAL NORMAL (O Directo a un integrante)
                // Permitir montos negativos (para transferencias de saldos)
                const posiblesDuplicados = this.abonos.filter(a =>
                    a.cliente_id === targetClientId &&
                    Number(a.monto) === Number(datosParaGuardar.monto) &&
                    a.metodo === datosParaGuardar.metodo
                );

                if (posiblesDuplicados.length > 0 && datosParaGuardar.monto > 0) {
                    const diffMin = (new Date() - new Date(posiblesDuplicados[posiblesDuplicados.length - 1].created_at || new Date())) / 1000 / 60;
                    if (diffMin < 2) {
                        await this.registrarHistorial(
                            targetClientId, 
                            'Alerta Antifraude: Intento de Abono Duplicado', 
                            'N/A', 
                            `Monto: $${datosParaGuardar.monto} | Método: ${datosParaGuardar.metodo}`, 
                            'SEGURIDAD', 
                            { intento_por: datosParaGuardar.usuario_email || 'Staff' }
                        );
                        window.UI.showToast('Abono idéntico detectado hace menos de 2 minutos. Bloqueado por seguridad anti-duplicados.', 'error');
                        throw new Error("DUPLICATE_PAYMENT");
                    }
                }

                let resAbono = await supabaseClient.from('abonos').insert([datosParaGuardar]);

                if (resAbono.error && (resAbono.error.code === '42703' || String(resAbono.error.message).includes('column'))) {
                    console.warn("Ejecutando Fallback Seguro: columnas de auditoría no existen. Guardando en modo compatible.");
                    const fallbackData = {
                        cliente_id: targetClientId,
                        monto: datosParaGuardar.monto,
                        metodo: datosParaGuardar.metodo
                    };
                    resAbono = await supabaseClient.from('abonos').insert([fallbackData]);
                    if (!resAbono.error) {
                        window.UI.showToast("Pago guardado (Modo Compatibilidad). Se recomienda actualizar la BD.", "info");
                        await this.registrarHistorial(
                            targetClientId,
                            'Registro de Abono (Modo Compatibilidad)',
                            'N/A',
                            `Abono de $${datosParaGuardar.monto} vía ${datosParaGuardar.metodo}`,
                            'CREACION'
                        );
                    }
                } else if (!resAbono.error) {
                    await this.registrarHistorial(
                        targetClientId,
                        'Registro de Abono',
                        'N/A',
                        `Abono de $${datosParaGuardar.monto} vía ${datosParaGuardar.metodo}`,
                        'CREACION'
                    );
                }

                if (resAbono.error) throw resAbono.error;
                await this.loadAll();
                await this.recalculateClientBalances(targetClientId);
            }
        } catch (e) { throw e; }
    },

    async deleteAbono(abonoId, clienteId, motivo) {
        try {
            const user = window.AuthModule?.currentUser?.email || 'Desconocido';
            const abono = this.abonos.find(a => a.id === abonoId);
            if (abono) {
                await this.registrarHistorial(clienteId, 'Abono Eliminado', `Abono de $${abono.monto} (${abono.metodo})`, `Movido a la Papelera. Motivo: ${motivo}`, 'ELIMINACION', { abono_id: abonoId, motivo_eliminacion: motivo });
            }
            const { error } = await supabaseClient.from('abonos').update({ deleted_at: new Date().toISOString(), deleted_by: user, motivo_eliminacion: motivo }).eq('id', abonoId);
            if (error) throw error;
            await this.loadAll();
            await this.recalculateClientBalances(clienteId);
        } catch (e) { throw e; }
    },

    async editAbono(abonoId, clienteId, nuevoMonto, status) {
        try {
            const abonoPrev = this.abonos.find(a => a.id === abonoId);
            if (abonoPrev) {
                if (Number(abonoPrev.monto) !== Number(nuevoMonto)) {
                    await this.registrarHistorial(clienteId, 'Monto de Abono Modificado', `$${abonoPrev.monto}`, `$${nuevoMonto}`, 'MODIFICACION', { abono_id: abonoId });
                }
                if (abonoPrev.estado_pago !== status) {
                    await this.registrarHistorial(clienteId, 'Estado de Abono Modificado', abonoPrev.estado_pago || 'confirmed', status, 'MODIFICACION', { abono_id: abonoId });
                }
            }
            let res = await supabaseClient.from('abonos').update({ monto: nuevoMonto, estado_pago: status }).eq('id', abonoId);
            if (res.error && res.error.code === '42703') {
                console.warn("Fallback Seguro: Ignorando columna estado_pago.");
                res = await supabaseClient.from('abonos').update({ monto: nuevoMonto }).eq('id', abonoId);
            }
            if (res.error) throw res.error;

            // PROPAGACIÓN: Si es un abono principal con abonos hijos vinculados
            const { error: childError } = await supabaseClient
                .from('abonos')
                .update({ monto: nuevoMonto, estado_pago: status })
                .eq('parent_abono_id', abonoId);
            
            if (childError) console.warn("Error propagando cambios a abonos hijos:", childError);

            await this.loadAll();
            await this.recalculateClientBalances(clienteId);

            // Recalcular acompañantes si aplica
            const children = this.abonos.filter(a => a.parent_abono_id === abonoId);
            for (const child of children) {
                await this.recalculateClientBalances(child.cliente_id);
            }
        } catch (e) { throw e; }
    },

    async saveProveedor(datosParaGuardar) {
        try {
            let resultadoDB;
            if (!datosParaGuardar.id) {
                delete datosParaGuardar.id;
                resultadoDB = await supabaseClient.from('proveedores').insert([datosParaGuardar]).select();
                if (resultadoDB.error) throw resultadoDB.error;
                
                if (resultadoDB.data && resultadoDB.data[0]) {
                    await this.registrarHistorial(null, 'Creación de Proveedor', 'N/A', `Proveedor ${resultadoDB.data[0].nombre} creado`, 'CREACION', { proveedor_id: resultadoDB.data[0].id });
                }
            } else {
                const { id, ...datosMapeados } = datosParaGuardar;
                const provActual = this.proveedores.find(p => p.id === id);
                if (provActual) {
                    const camposAComparar = ['nombre', 'telefono', 'ciudad', 'email', 'tipo'];
                    for (const campo of camposAComparar) {
                        if (datosMapeados[campo] !== undefined && String(datosMapeados[campo]) !== String(provActual[campo])) {
                            await this.registrarHistorial(null, `Proveedor (${provActual.nombre}): ${campo}`, provActual[campo], datosMapeados[campo], 'MODIFICACION', { proveedor_id: id });
                        }
                    }
                    
                    // Comparar productos
                    if (datosMapeados.productos !== undefined) {
                        const jsonAnt = JSON.stringify(provActual.productos || []);
                        const jsonNue = JSON.stringify(datosMapeados.productos || []);
                        if (jsonAnt !== jsonNue) {
                            await this.registrarHistorial(
                                null,
                                `Proveedor (${provActual.nombre}): Catálogo de Productos Modificado`,
                                `${(provActual.productos || []).length} servicios`,
                                `${(datosMapeados.productos || []).length} servicios`,
                                'MODIFICACION',
                                { proveedor_id: id, productos_previos: provActual.productos, productos_nuevos: datosMapeados.productos }
                            );
                        }
                    }
                }
                resultadoDB = await supabaseClient.from('proveedores').update(datosMapeados).eq('id', id).select();
                if (resultadoDB.error) throw resultadoDB.error;
            }
            await this.loadAll();
            return resultadoDB.data ? resultadoDB.data[0] : null;
        } catch (e) { throw e; }
    },

    async deletePlan(id, motivo) {
        const user = window.AuthModule?.currentUser?.email || 'Desconocido';
        const plan = this.planes.find(p => p.id === id);
        const nombrePlan = plan ? plan.nombre : id;
        await this.registrarHistorial(null, 'Plan Eliminado (Soft Delete)', `Plan: ${nombrePlan}`, `Movido a la Papelera. Motivo: ${motivo}`, 'ELIMINACION', { plan_id: id, motivo_eliminacion: motivo });
        const { error } = await supabaseClient.from('planes').update({ deleted_at: new Date().toISOString(), deleted_by: user, motivo_eliminacion: motivo }).eq('id', id);
        if (error) throw error;
        await this.loadAll();
    },
    async deleteCliente(id, motivo) {
        const user = window.AuthModule?.currentUser?.email || 'Desconocido';
        const clienteActual = this.clientes.find(c => c.id === id);
        const desc = clienteActual ? `${clienteActual.nombre} ${clienteActual.apellido}` : id;
        await this.registrarHistorial(id, 'Eliminación (Soft Delete)', `Reserva de ${desc}`, `Movida a la Papelera. Motivo: ${motivo}`, 'ELIMINACION', { motivo_eliminacion: motivo });
        const { error } = await supabaseClient.from('clientes').update({ deleted_at: new Date().toISOString(), deleted_by: user, motivo_eliminacion: motivo }).eq('id', id);
        if (error) throw error;

        // Soft-delete todos los abonos del cliente
        const { error: abonoError } = await supabaseClient.from('abonos')
            .update({ 
                deleted_at: new Date().toISOString(), 
                deleted_by: user, 
                motivo_eliminacion: `Eliminado junto con el cliente. Motivo: ${motivo}` 
            })
            .eq('cliente_id', id);
        if (abonoError) console.warn("Error borrando abonos del cliente:", abonoError);

        // Soft-delete todos los adelantos operativos del cliente
        const { error: adelantoError } = await supabaseClient.from('adelantos_operativos')
            .update({ 
                deleted_at: new Date().toISOString(), 
                deleted_by: user
            })
            .eq('cliente_id', id);
        if (adelantoError) console.warn("Error borrando adelantos operativos del cliente:", adelantoError);

        // Si es titular, borrar acompañantes en cascada
        const companions = this.clientes.filter(c => c.parent_id === id && !c.deleted_at);
        if (companions.length > 0) {
            const compIds = companions.map(c => c.id);
            const { error: compError } = await supabaseClient.from('clientes')
                .update({ 
                    deleted_at: new Date().toISOString(), 
                    deleted_by: user, 
                    motivo_eliminacion: `Eliminación en cascada por Titular. Motivo original: ${motivo}` 
                })
                .in('id', compIds);
            if (compError) console.warn("Error borrando acompañantes en cascada:", compError);

            // Soft-delete todos los abonos de los acompañantes en cascada
            const { error: compAbonoError } = await supabaseClient.from('abonos')
                .update({
                    deleted_at: new Date().toISOString(),
                    deleted_by: user,
                    motivo_eliminacion: `Eliminado por cascada al borrar Titular. Motivo original: ${motivo}`
                })
                .in('cliente_id', compIds);
            if (compAbonoError) console.warn("Error borrando abonos de acompañantes en cascada:", compAbonoError);

            // Soft-delete todos los adelantos operativos de los acompañantes en cascada
            const { error: compAdelantoError } = await supabaseClient.from('adelantos_operativos')
                .update({
                    deleted_at: new Date().toISOString(),
                    deleted_by: user
                })
                .in('cliente_id', compIds);
            if (compAdelantoError) console.warn("Error borrando adelantos operativos de acompañantes en cascada:", compAdelantoError);
            
            for (const comp of companions) {
                await this.registrarHistorial(
                    comp.id, 
                    'Eliminación en cascada', 
                    `Acompañante de ${desc}`, 
                    `Eliminado por cascada al borrar Titular. Motivo: ${motivo}`, 
                    'ELIMINACION', 
                    { motivo_eliminacion: motivo }
                );
            }
        }

        // Si es acompañante, restar 1 al Pax del Titular
        if (clienteActual && clienteActual.parent_id) {
            const titular = this.clientes.find(c => c.id === clienteActual.parent_id);
            if (titular) {
                const newPax = Math.max(1, (titular.pax || 1) - 1);
                const { error: titularError } = await supabaseClient.from('clientes')
                    .update({ pax: newPax })
                    .eq('id', titular.id);
                if (titularError) console.warn("Error decrementando Pax del titular:", titularError);
                
                await this.registrarHistorial(
                    titular.id, 
                    'Pax Decrementado', 
                    `${titular.pax}`, 
                    `${newPax}`, 
                    'MODIFICACION', 
                    { detalle: `Acompañante ${desc} eliminado` }
                );
            }
        }

        await this.loadAll();
    },
    async transferirSaldoGrupo(origenId, destinosIds, monto) {
        try {
            const user = window.AuthModule?.currentUser?.email || 'Staff';
            const origenCli = this.clientes.find(c => c.id === origenId);
            const origenNombre = origenCli ? `${origenCli.nombre} ${origenCli.apellido}` : 'Pasajero';

            // 1. Obtener nombres de destinatarios para registrar descripción en el origen
            const destinosClis = destinosIds.map(id => this.clientes.find(c => c.id === id)).filter(Boolean);
            const destinosNombres = destinosClis.map(c => `${c.nombre} ${c.apellido}`).join(', ');

            // 2. Insertar abono negativo en el origen
            const origenPayload = {
                cliente_id: origenId,
                monto: -monto,
                metodo: `Transferencia de Saldo (Salida) hacia ${destinosNombres}`,
                estado_pago: 'confirmed',
                usuario_email: user
            };
            const { error: errorOrigen } = await supabaseClient.from('abonos').insert([origenPayload]);
            if (errorOrigen) throw errorOrigen;

            await this.registrarHistorial(
                origenId,
                'Transferencia de Saldo (Salida)',
                'N/A',
                `Salida de $${monto} hacia ${destinosNombres}`,
                'MODIFICACION'
            );

            // 3. Insertar abono positivo (o abonos divididos) en el o los destinos
            const splitAmount = Math.floor(monto / destinosIds.length);
            const childrenPayloads = destinosIds.map(destId => ({
                cliente_id: destId,
                monto: splitAmount,
                metodo: `Transferencia de Saldo (Ingreso) recibido de ${origenNombre}`,
                estado_pago: 'confirmed',
                usuario_email: user
            }));

            const { error: errorDestinos } = await supabaseClient.from('abonos').insert(childrenPayloads);
            if (errorDestinos) throw errorDestinos;

            for (const destId of destinosIds) {
                await this.registrarHistorial(
                    destId,
                    'Transferencia de Saldo (Ingreso)',
                    'N/A',
                    `Ingreso de $${splitAmount} recibido de ${origenNombre}`,
                    'MODIFICACION'
                );
            }

            await this.loadAll();
        } catch (e) {
            console.error("Error en transferirSaldoGrupo:", e);
            throw e;
        }
    },
    async unirClientesEnGrupo(titularId, companerosIds) {
        try {
            const user = window.AuthModule?.currentUser?.email || 'Staff';
            const titular = this.clientes.find(c => c.id === titularId);
            if (!titular) throw new Error("Titular no encontrado");

            // 1. Obtener y aplanar acompañantes de subgrupos si los seleccionados eran titular
            const allCompsToUpdate = new Set(companerosIds);
            for (const compId of companerosIds) {
                const subCompanions = this.clientes.filter(c => c.parent_id === compId && !c.deleted_at);
                subCompanions.forEach(sc => allCompsToUpdate.add(sc.id));
            }
            const finalCompanerosIds = Array.from(allCompsToUpdate);

            // Identificar los antiguos titulares de los clientes que se mueven
            const oldTitularesIds = new Set();
            for (const compId of finalCompanerosIds) {
                const comp = this.clientes.find(c => c.id === compId);
                if (comp && comp.parent_id && comp.parent_id !== titularId) {
                    oldTitularesIds.add(comp.parent_id);
                }
            }

            // 2. Calcular nuevo pax para el titular
            const existingCompanionsCount = this.clientes.filter(c => c.parent_id === titularId && !c.deleted_at && !finalCompanerosIds.includes(c.id)).length;
            const nuevoPax = 1 + existingCompanionsCount + finalCompanerosIds.length;

            // 3. Actualizar el titular en la base de datos (pax)
            const { error: errorTitular } = await supabaseClient.from('clientes')
                .update({ pax: nuevoPax })
                .eq('id', titularId);
            
            if (errorTitular) throw errorTitular;

            await this.registrarHistorial(
                titularId,
                'Unión de Grupo (Titular)',
                `${titular.pax || 1}`,
                `${nuevoPax}`,
                'MODIFICACION',
                { detalle: `Se agregaron acompañantes. Nuevo Pax total: ${nuevoPax}` }
            );

            // 4. Actualizar a cada acompañante
            for (const compId of finalCompanerosIds) {
                const comp = this.clientes.find(c => c.id === compId);
                const precioAnterior = comp ? comp.precio_total : 0;
                
                const { error: errorComp } = await supabaseClient.from('clientes')
                    .update({
                        parent_id: titularId,
                        plan_id: titular.plan_id,
                        fecha_viaje: titular.fecha_viaje,
                        estado: titular.estado,
                        etiqueta: titular.etiqueta,
                        costo_base: titular.costo_base,
                        precio_total: titular.precio_total,
                        proveedores_vinculados: titular.proveedores_vinculados,
                        pax: 1
                    })
                    .eq('id', compId);

                if (errorComp) throw errorComp;

                await this.registrarHistorial(
                    compId,
                    'Unión de Grupo (Acompañante)',
                    `Individual (Precio: ${precioAnterior})`,
                    `Acompañante de ${titular.nombre} ${titular.apellido} (Precio: ${titular.precio_total})`,
                    'MODIFICACION',
                    { parent_id: titularId }
                );
            }

            // Recalcular pax de los antiguos titulares
            for (const oldTitId of oldTitularesIds) {
                const remainingComps = this.clientes.filter(c => c.parent_id === oldTitId && !c.deleted_at && !finalCompanerosIds.includes(c.id));
                const oldTit = this.clientes.find(c => c.id === oldTitId);
                const oldNewPax = 1 + remainingComps.length;
                if (oldTit && oldTit.pax !== oldNewPax) {
                    await supabaseClient.from('clientes').update({ pax: oldNewPax }).eq('id', oldTitId);
                    await this.registrarHistorial(
                        oldTitId,
                        'Pax Reducido (Unión de Grupo)',
                        `${oldTit.pax}`,
                        `${oldNewPax}`,
                        'MODIFICACION',
                        { detalle: `Un acompañante se unió a otro grupo.` }
                    );
                }
            }

            await this.loadAll();

            // 5. Recalcular saldos de forma contable para todos
            await this.recalculateClientBalances(titularId);
            for (const compId of finalCompanerosIds) {
                await this.recalculateClientBalances(compId);
            }
            for (const oldTitId of oldTitularesIds) {
                await this.recalculateClientBalances(oldTitId);
            }
        } catch (e) {
            console.error("Error en unirClientesEnGrupo:", e);
            throw e;
        }
    },
    async desagruparClienteDeGrupo(companionId) {
        try {
            const user = window.AuthModule?.currentUser?.email || 'Staff';
            const companion = this.clientes.find(c => c.id === companionId);
            if (!companion || !companion.parent_id) throw new Error("Acompañante no válido");

            const titularId = companion.parent_id;
            const titular = this.clientes.find(c => c.id === titularId);

            // 1. Quitar parent_id y fijar pax en 1
            const { error: errorComp } = await supabaseClient.from('clientes')
                .update({ parent_id: null, pax: 1 })
                .eq('id', companionId);
            
            if (errorComp) throw errorComp;

            await this.registrarHistorial(
                companionId,
                'Separación de Grupo (Independiente)',
                `Acompañante de ${titular ? titular.nombre : titularId}`,
                'Reserva Individual Independiente',
                'MODIFICACION',
                { parent_id_previo: titularId }
            );

            // 2. Desvincular abonos de tipo "Pago Grupal" del acompañante para hacerlos independientes
            const { error: errorAbonos } = await supabaseClient.from('abonos')
                .update({ parent_abono_id: null })
                .eq('cliente_id', companionId)
                .is('deleted_at', null);

            if (errorAbonos) console.warn("Error desvinculando abonos del acompañante:", errorAbonos);

            // 3. Decrementar pax del titular
            if (titular) {
                const remainingComps = this.clientes.filter(c => c.parent_id === titularId && !c.deleted_at && c.id !== companionId);
                const nuevoPax = 1 + remainingComps.length;
                const { error: errorTitular } = await supabaseClient.from('clientes')
                    .update({ pax: nuevoPax })
                    .eq('id', titularId);
                
                if (errorTitular) throw errorTitular;

                await this.registrarHistorial(
                    titularId,
                    'Acompañante Separado (Reducción Pax)',
                    `${titular.pax}`,
                    `${nuevoPax}`,
                    'MODIFICACION',
                    { detalle: `Acompañante ${companion.nombre} ${companion.apellido} separado.` }
                );
            }

            await this.loadAll();

            // 4. Recalcular balances
            await this.recalculateClientBalances(companionId);
            await this.recalculateClientBalances(titularId);
        } catch (e) {
            console.error("Error en desagruparClienteDeGrupo:", e);
            throw e;
        }
    },
    async deleteProveedor(id, motivo) {
        const user = window.AuthModule?.currentUser?.email || 'Desconocido';
        const prov = this.proveedores.find(p => p.id === id);
        const razonSocial = prov ? prov.nombre || prov.razon_social : id;
        await this.registrarHistorial(null, 'Proveedor Eliminado (Soft Delete)', `Proveedor: ${razonSocial}`, `Movido a la Papelera. Motivo: ${motivo}`, 'ELIMINACION', { proveedor_id: id, motivo_eliminacion: motivo });
        const { error } = await supabaseClient.from('proveedores').update({ deleted_at: new Date().toISOString(), deleted_by: user, motivo_eliminacion: motivo }).eq('id', id);
        if (error) throw error;
        await this.loadAll();
    },
    async deleteGastoSalida(id, motivo) {
        try {
            const user = window.AuthModule?.currentUser?.email || 'Desconocido';
            const gasto = this.gastos.find(g => g.id === id);
            const concepto = gasto ? gasto.concepto : id;
            const monto = gasto ? gasto.costo : 0;
            await this.registrarHistorial(null, 'Gasto Operativo Eliminado (Soft Delete)', `Concepto: ${concepto} | Monto: ${monto}`, `Movido a la Papelera. Motivo: ${motivo}`, 'ELIMINACION', { gasto_salida_id: id, motivo_eliminacion: motivo });
            const { error } = await supabaseClient.from('gastos_salidas').update({ deleted_at: new Date().toISOString(), deleted_by: user, motivo_eliminacion: motivo }).eq('id', id);
            if (error) throw error;
            await this.loadAll();
        } catch (e) { throw e; }
    },
    async deleteGastoCorporativo(id, motivo) {
        try {
            const user = window.AuthModule?.currentUser?.email || 'Desconocido';
            await this.registrarHistorial(null, 'Gasto Corporativo Eliminado (Soft Delete)', `Gasto ID: ${id}`, `Movido a la Papelera. Motivo: ${motivo}`, 'ELIMINACION', { gasto_corporativo_id: id, motivo_eliminacion: motivo });
            const { error } = await supabaseClient.from('gastos_corporativos').update({ deleted_at: new Date().toISOString(), deleted_by: user, motivo_eliminacion: motivo }).eq('id', id);
            if (error) throw error;
            await this.loadAll();
        } catch (e) { throw e; }
    },
    async deleteSocioMovimiento(id, motivo) {
        try {
            const user = window.AuthModule?.currentUser?.email || 'Desconocido';
            await this.registrarHistorial(null, 'Movimiento de Socio Eliminado (Soft Delete)', `Movimiento ID: ${id}`, `Movido a la Papelera. Motivo: ${motivo}`, 'ELIMINACION', { socios_movimiento_id: id, motivo_eliminacion: motivo });
            const { error } = await supabaseClient.from('socios_movimientos').update({ deleted_at: new Date().toISOString(), deleted_by: user, motivo_eliminacion: motivo }).eq('id', id);
            if (error) throw error;
            await this.loadAll();
        } catch (e) { throw e; }
    },

    async getAgenciaConfig() {
        try {
            const { data, error } = await supabaseClient.from('configuracion_agencia').select('*').eq('id', 1);
            if (error) throw error;
            return { data: (data && data.length > 0) ? data[0] : null, error: null };
        } catch (e) {
            return { data: null, error: e };
        }
    },

    async saveAgenciaConfig(settings) {
        try {
            const user = window.AuthModule?.currentUser;
            const payload = {
                id: 1,
                logo: settings.logo,
                color_primario: settings.color_primario || settings.logo ? settings.logo : undefined, // Manejar mapeo si es necesario
                color_secundario: settings.color_secundario,
                razon_social: settings.razon_social,
                subtitulo: settings.subtitulo,
                nit: settings.nit,
                rnt: settings.rnt,
                telefono: settings.telefono,
                direccion: settings.direccion,
                condiciones: settings.condiciones,
                updated_by: user ? user.id : null,
                updated_at: new Date().toISOString()
            };
            
            // Mapear campos desde el formato frontend (color1, color2, razon, terms, etc.)
            const dbPayload = {
                id: 1,
                logo: settings.logo,
                color_primario: settings.color1,
                color_secundario: settings.color2,
                razon_social: settings.razon,
                subtitulo: settings.subtitulo,
                nit: settings.nit,
                rnt: settings.rnt,
                telefono: settings.tel,
                direccion: settings.dir,
                condiciones: settings.terms,
                porcentaje_retencion: settings.porcentaje_retencion !== undefined ? Number(settings.porcentaje_retencion) : undefined,
                updated_by: user ? user.id : null,
                updated_at: new Date().toISOString()
            };

            await this.registrarHistorial(
                null,
                'Configuración de Agencia Actualizada',
                'Valores Anteriores',
                `Razón Social: ${settings.razon || 'N/A'} | NIT: ${settings.nit || 'N/A'}`,
                'SISTEMA'
            );

            const { error } = await supabaseClient.from('configuracion_agencia').upsert(dbPayload, { onConflict: 'id' });
            if (error) throw error;
            return { error: null };
        } catch (e) {
            return { error: e };
        }
    },

    async checkProveedorEnUso(id) {
        try {
            const { data, error } = await supabaseClient.rpc('proveedor_en_uso', { p_id: id });
            if (error) throw error;
            return !!data;
        } catch (e) {
            console.error("Error checking if supplier is in use:", e);
            return false;
        }
    },

    async crearSolicitudCambio(solicitud) {
        try {
            const { error } = await supabaseClient.from('solicitudes_cambio_proveedores').insert([solicitud]);
            if (error) throw error;
            
            // Log creation in audit logs
            await this.registrarHistorial(
                null,
                `Solicitud de ${solicitud.tipo_operacion === 'ELIMINACION' ? 'Eliminación' : 'Modificación'} de Proveedor`,
                'PENDIENTE',
                `Solicitud creada por ${solicitud.solicitante_email} para el proveedor ${solicitud.proveedor_id}.`,
                'SEGURIDAD',
                { motivo: solicitud.motivo, proveedor_id: solicitud.proveedor_id }
            );
        } catch (e) { throw e; }
    },

    async loadSolicitudesPendientes() {
        try {
            const { data, error } = await supabaseClient
                .from('solicitudes_cambio_proveedores')
                .select('*, proveedores(*)')
                .eq('estado', 'PENDIENTE')
                .order('created_at', { ascending: false });
            if (error) throw error;
            return data || [];
        } catch (e) { throw e; }
    },

    async resolverSolicitudCambio(solId, estado_aprobacion, adminEmail) {
        try {
            const { data: reqs, error: fetchErr } = await supabaseClient.from('solicitudes_cambio_proveedores').select('*, proveedores(*)').eq('id', solId);
            if (fetchErr || !reqs || reqs.length === 0) throw fetchErr || new Error("Request not found");
            const req = reqs[0];
            const provName = req.proveedores?.nombre || req.proveedores?.razon_social || req.proveedor_id;

            if (estado_aprobacion === 'APROBADO') {
                if (req.tipo_operacion === 'MODIFICACION') {
                    const { id, ...datosMapeados } = req.datos_nuevos;
                    const { error: updateErr } = await supabaseClient.from('proveedores').update(datosMapeados).eq('id', req.proveedor_id);
                    if (updateErr) throw updateErr;

                    // Log execution in audit logs
                    await this.registrarHistorial(
                        null,
                        'Solicitud de Modificación de Proveedor Aprobada',
                        'PENDIENTE',
                        `Cambio aplicado en proveedor ${provName}. Aprobado por ${adminEmail}.`,
                        'SISTEMA',
                        { resolved_by: adminEmail, tipo_operacion: 'MODIFICACION', datos_nuevos: datosMapeados }
                    );
                } else if (req.tipo_operacion === 'ELIMINACION') {
                    const { error: deleteErr } = await supabaseClient.from('proveedores').update({
                        deleted_at: new Date().toISOString(),
                        deleted_by: adminEmail
                    }).eq('id', req.proveedor_id);
                    if (deleteErr) throw deleteErr;

                    // Log execution in audit logs
                    await this.registrarHistorial(
                        null,
                        'Solicitud de Eliminación de Proveedor Aprobada',
                        'PENDIENTE',
                        `Proveedor ${provName} movido a la Papelera. Aprobado por ${adminEmail}.`,
                        'ELIMINACION',
                        { resolved_by: adminEmail, tipo_operacion: 'ELIMINACION' }
                    );
                }
            } else {
                // Log rejection in audit logs
                await this.registrarHistorial(
                    null,
                    `Solicitud de ${req.tipo_operacion === 'ELIMINACION' ? 'Eliminación' : 'Modificación'} de Proveedor Rechazada`,
                    'PENDIENTE',
                    `Solicitud rechazada por ${adminEmail}. Ningún cambio fue aplicado a ${provName}.`,
                    'SEGURIDAD',
                    { resolved_by: adminEmail, tipo_operacion: req.tipo_operacion, motivo_solicitud: req.motivo }
                );
            }

            const { error: statusErr } = await supabaseClient.from('solicitudes_cambio_proveedores').update({
                estado: estado_aprobacion,
                resolved_at: new Date().toISOString(),
                resolved_by: adminEmail
            }).eq('id', solId);
            if (statusErr) throw statusErr;

            await this.loadAll();
        } catch (e) { throw e; }
    }
};

