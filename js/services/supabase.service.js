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
        const [resPlanes, resClientes, resProv, resAbo, resGastos, resSeguimientos, resB2BAli, resB2BServ, resB2BNeg, resHistorial] = await Promise.all([
            supabaseClient.from('planes').select('*').order('created_at', { ascending: false }).limit(500),
            supabaseClient.from('clientes').select('*').order('created_at', { ascending: false }).limit(2000),
            supabaseClient.from('proveedores').select('*').order('created_at', { ascending: false }).limit(1000),
            // Nota: Abonos se trae ordenado descendente para obtener los más recientes,
            // y luego se invierte el array para mantener la compatibilidad (ascending: true) del UI.
            supabaseClient.from('abonos').select('*').order('created_at', { ascending: false }).limit(5000),
            supabaseClient.from('gastos_salidas').select('*').order('created_at', { ascending: false }).limit(3000),
            supabaseClient.from('seguimientos').select('*').order('created_at', { ascending: false }).limit(2000),
            supabaseClient.from('b2b_aliados').select('*').order('created_at', { ascending: false }).limit(1000),
            supabaseClient.from('b2b_servicios_catalogo').select('*').order('created_at', { ascending: false }).limit(1000),
            supabaseClient.from('b2b_negocios').select('*').order('created_at', { ascending: false }).limit(2000),
            supabaseClient.from('historial_reservas').select('*').order('created_at', { ascending: false }).limit(3000)
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
        if (resHistorial && resHistorial.data) this.historial_reservas = resHistorial.data; else this.historial_reservas = [];
        
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
            historial_reservas: this.historial_reservas
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
                    const response = await fetch('https://www.datos.gov.co/resource/xdk5-pm3f.json?$limit=1200');
                    const jsonData = await response.json();
                    const mapeoCiudades = jsonData.map(c => ({
                        id: c.c_digo_dane_del_municipio,
                        departamento: c.departamento,
                        municipio: c.municipio
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

    async registrarHistorial(clienteId, campo, valorAnterior, valorNuevo) {
        try {
            const payload = {
                cliente_id: clienteId,
                campo: campo,
                valor_anterior: String(valorAnterior || ''),
                valor_nuevo: String(valorNuevo || ''),
                usuario_email: window.AuthModule?.currentUser?.email || 'Staff'
            };
            const { error } = await supabaseClient.from('historial_reservas').insert([payload]);
            if (error) {
                if (error.code === '42P01') {
                    console.warn("Aviso DB: Crea la tabla 'historial_reservas' en Supabase con cliente_id (uuid), campo, valor_anterior, valor_nuevo, usuario_email.");
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
                    await this.registrarHistorial(resultadoDB.data[0].id, 'Creación de Reserva', 'N/A', 'Reserva Creada Inicialmente');
                }
            } else {
                const { id, ...datosMapeados } = datosParaGuardar;
                
                // Buscar cliente actual para comparar
                const clienteActual = this.clientes.find(c => c.id === id);
                if (clienteActual) {
                    const camposAComparar = ['nombre', 'apellido', 'documento', 'telefono', 'email', 'pax', 'plan_id', 'fecha_viaje', 'precio_total', 'estado', 'etiqueta'];
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
                            await this.registrarHistorial(id, campo, valAnt, valNue);
                        }
                    }
                }

                resultadoDB = await supabaseClient.from('clientes').update(datosMapeados).eq('id', id);
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

            const posiblesDuplicados = this.abonos.filter(a =>
                a.cliente_id === datosParaGuardar.cliente_id &&
                Number(a.monto) === Number(datosParaGuardar.monto) &&
                a.metodo === datosParaGuardar.metodo
            );

            if (posiblesDuplicados.length > 0) {
                const diffMin = (new Date() - new Date(posiblesDuplicados[posiblesDuplicados.length - 1].created_at || new Date())) / 1000 / 60;
                if (diffMin < 2) {
                    window.UI.showToast('Abono idéntico detectado hace menos de 2 minutos. Bloqueado por seguridad anti-duplicados.', 'error');
                    throw new Error("DUPLICATE_PAYMENT");
                }
            }

            let resAbono = await supabaseClient.from('abonos').insert([datosParaGuardar]);

            if (resAbono.error && (resAbono.error.code === '42703' || String(resAbono.error.message).includes('column'))) {
                console.warn("Ejecutando Fallback Seguro: columnas de auditoría no existen. Guardando en modo compatible.");
                const fallbackData = {
                    cliente_id: datosParaGuardar.cliente_id,
                    monto: datosParaGuardar.monto,
                    metodo: datosParaGuardar.metodo
                };
                resAbono = await supabaseClient.from('abonos').insert([fallbackData]);
                if (!resAbono.error) {
                    window.UI.showToast("Pago guardado (Modo Compatibilidad). Se recomienda actualizar la BD.", "info");
                }
            }

            if (resAbono.error) throw resAbono.error;
            await this.loadAll();
            await this.recalculateClientBalances(datosParaGuardar.cliente_id);
        } catch (e) { throw e; }
    },

    async deleteAbono(abonoId, clienteId) {
        try {
            const { error } = await supabaseClient.from('abonos').delete().eq('id', abonoId);
            if (error) throw error;
            await this.loadAll();
            await this.recalculateClientBalances(clienteId);
        } catch (e) { throw e; }
    },

    async editAbono(abonoId, clienteId, nuevoMonto, status) {
        try {
            let res = await supabaseClient.from('abonos').update({ monto: nuevoMonto, estado_pago: status }).eq('id', abonoId);
            if (res.error && res.error.code === '42703') {
                console.warn("Fallback Seguro: Ignorando columna estado_pago.");
                res = await supabaseClient.from('abonos').update({ monto: nuevoMonto }).eq('id', abonoId);
            }
            if (res.error) throw res.error;
            await this.loadAll();
            await this.recalculateClientBalances(clienteId);
        } catch (e) { throw e; }
    },

    async saveProveedor(datosParaGuardar) {
        try {
            if (!datosParaGuardar.id) {
                delete datosParaGuardar.id;
                const result = await supabaseClient.from('proveedores').insert([datosParaGuardar]);
                if (result.error) throw result.error;
            } else {
                const { id, ...datosMapeados } = datosParaGuardar;
                const result = await supabaseClient.from('proveedores').update(datosMapeados).eq('id', id);
                if (result.error) throw result.error;
            }
            await this.loadAll();
        } catch (e) { throw e; }
    },

    async deletePlan(id) {
        const { error } = await supabaseClient.from('planes').delete().eq('id', id);
        if (error) throw error;
        await this.loadAll();
    },
    async deleteCliente(id) {
        const { error } = await supabaseClient.from('clientes').delete().eq('id', id);
        if (error) throw error;
        await this.loadAll();
    },
    async deleteProveedor(id) {
        const { error } = await supabaseClient.from('proveedores').delete().eq('id', id);
        if (error) throw error;
        await this.loadAll();
    }
};
