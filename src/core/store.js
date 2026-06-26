// src/core/store.js — Estado centralizado de la aplicación (Single Source of Truth)
// Esta capa reemplaza gradualmente el estado mantenido dentro de DataService.

export const Store = {
    state: {
        planes: [],
        clientes: [],
        proveedores: [],
        abonos: [],
        gastos: [],
        ciudades: [],
        seguimientos: [],
        historial_reservas: [],
        b2b_aliados: [],
        b2b_servicios: [],
        b2b_negocios: [],
        categories: ["Operador Turístico", "Alojamiento / Hotelería", "Transporte Especial", "Aseguradora Integral", "Restaurante y Eventos", "Guianza Local"],
        destinos: ["Barranquilla", "Cartagena", "Quindío", "Santa Marta", "La Guajira", "San Andrés"],
        limitWarnings: { clientes: false, abonos: false, gastos: false },
        historyTableMissing: false
    },
    listeners: [],
    _pendingNotify: null,

    subscribe(listener) {
        this.listeners.push(listener);
        // Retornamos una función para desuscribirse
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    },

    notify() {
        this.listeners.forEach(listener => listener(this.state));
    },

    notifyDebounced() {
        if (this._pendingNotify) return;
        this._pendingNotify = Promise.resolve().then(() => {
            this._pendingNotify = null;
            this.notify();
        });
    },

    setState(newState) {
        this.state = { ...this.state, ...newState };
        this.notifyDebounced();
    },

    getState() {
        return this.state;
    }
};

