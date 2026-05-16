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
        destinos: ["Barranquilla", "Cartagena", "Quindío", "Santa Marta", "La Guajira", "San Andrés"]
    },
    listeners: [],

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

    setState(newState) {
        this.state = { ...this.state, ...newState };
        this.notify();
    },

    getState() {
        return this.state;
    }
};
