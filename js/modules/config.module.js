// js/modules/config.module.js — Configuración del Sistema
// Cross-module: window.AuthModule
// Extraído de app.js líneas 3979–4147
import { supabaseClient } from '../services/supabase.service.js';
import { UI } from '../utils/ui.utils.js';

export const ConfigModule = {
    switchTab(tabName) {
        document.querySelectorAll('.cfg-btn').forEach(btn => {
            btn.classList.remove('bg-primary-50', 'text-primary-600', 'active');
            btn.classList.add('text-slate-600');
        });
        document.querySelectorAll('.cfg-tab').forEach(tab => {
            tab.classList.remove('block'); tab.classList.add('hidden');
        });
        const btnActivo = document.getElementById(`cfg-btn-${tabName}`);
        if (btnActivo) { btnActivo.classList.remove('text-slate-600'); btnActivo.classList.add('bg-primary-50', 'text-primary-600', 'active'); }
        const tabActivo = document.getElementById(`cfg-tab-${tabName}`);
        if (tabActivo) { tabActivo.classList.remove('hidden'); tabActivo.classList.add('block'); }
    },

    async loadSecurityProfiles() {
        const container = document.getElementById('admin-roles-list');
        if (!container) return;

        try {
            const { data: perfiles, error } = await supabaseClient.from('perfiles_usuarios').select('*').order('created_at', { ascending: true });
            if (error) throw error;
            container.innerHTML = '';

            if (perfiles.length === 0) {
                container.innerHTML = '<div class="text-center p-4 text-slate-400 text-xs font-medium">No hay usuarios registrados.</div>';
                return;
            }

            perfiles.forEach(p => {
                const isMe = p.user_id === window.AuthModule.currentUser?.id;
                const miEtiqueta = isMe ? '<span class="bg-green-100 text-green-700 px-2 py-0.5 rounded text-[9px] font-bold border border-green-200 ml-2">Tú</span>' : '';

                const selectorRol = isMe
                    ? `<span class="text-xs font-black text-slate-800 uppercase bg-slate-100 px-3 py-1 rounded-lg border border-slate-200">${p.rol}</span>`
                    : `<select onchange="ConfigModule.updateUserRole('${p.user_id}', this.value)" class="border border-slate-300 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-primary-500 cursor-pointer bg-white">
                        <option value="administrador" ${p.rol === 'administrador' ? 'selected' : ''}>👑 Administrador (Master)</option>
                        <option value="socio_mayoritario" ${p.rol === 'socio_mayoritario' ? 'selected' : ''}>📈 Socio Mayoritario</option>
                        <option value="socio" ${p.rol === 'socio' ? 'selected' : ''}>🤝 Socio</option>
                        <option value="analista" ${p.rol === 'analista' ? 'selected' : ''}>💻 Analista / Vendedor</option>
                       </select>`;

                container.innerHTML += `
                    <div class="flex flex-col sm:flex-row sm:justify-between sm:items-center bg-slate-50 border border-slate-200 p-3 rounded-xl shadow-sm gap-3">
                        <div>
                            <p class="text-sm font-black text-slate-800 flex items-center">${p.email} ${miEtiqueta}</p>
                            <p class="text-[9px] text-slate-500 uppercase tracking-widest mt-0.5">ID: ${p.user_id.substring(0, 8)}...</p>
                        </div>
                        <div class="shrink-0">${selectorRol}</div>
                    </div>`;
            });
        } catch (err) {
            console.error(err);
            container.innerHTML = '<div class="text-center p-4 text-red-400 text-xs font-medium">Error cargando usuarios.</div>';
        }
    },

    async updateUserRole(userId, nuevoRol) {
        if (!confirm(`¿Estás seguro de cambiar el rol de este usuario a ${nuevoRol.toUpperCase()}?`)) {
            this.loadSecurityProfiles();
            return;
        }

        const permisos = {
            administrador: { modulos: ["dashboard","calendario","planes","clientes","proveedores","rentabilidad","contactos","enlaces","configuracion"], pEliminar: true, pConfig: true },
            socio_mayoritario: { modulos: ["dashboard","calendario","planes","clientes","proveedores","rentabilidad","contactos","enlaces"], pEliminar: false, pConfig: false },
            socio: { modulos: ["dashboard","calendario","planes","clientes","rentabilidad","contactos","enlaces"], pEliminar: false, pConfig: false },
            analista: { modulos: ["dashboard","calendario","clientes","enlaces"], pEliminar: false, pConfig: false }
        };

        const cfg = permisos[nuevoRol] || permisos['analista'];

        try {
            const { error } = await supabaseClient.from('perfiles_usuarios').update({
                rol: nuevoRol, modulos_permitidos: cfg.modulos, puede_eliminar: cfg.pEliminar, puede_configurar: cfg.pConfig
            }).eq('user_id', userId);

            if (error) throw error;
            UI.showToast("Rol y permisos actualizados correctamente.", "success");

            if (userId === window.AuthModule.currentUser?.id) {
                window.AuthModule.userProfile.rol = nuevoRol;
                window.AuthModule.userProfile.modulos_permitidos = cfg.modulos;
                window.AuthModule.applySecurityRules();
            }
        } catch (err) {
            console.error(err);
            UI.showToast("Error al actualizar el rol.", "error");
        }
    },

    async crearNuevoVendedor(event) {
        event.preventDefault();
        const email = document.getElementById('new-vendor-email').value;
        const password = document.getElementById('new-vendor-password').value;
        const btn = document.getElementById('btn-create-vendor');

        if (password.length < 8) return UI.showToast("La contraseña debe tener al menos 8 caracteres.", "error");

        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="ph ph-spinner animate-spin mr-2"></i> Creando Vendedor...';
        btn.disabled = true;

        try {
            const response = await fetch('https://qefuqkplornelbzwqgri.supabase.co/functions/v1/crear_vendedor', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${window.supabaseClient._supabaseKey}` },
                body: JSON.stringify({ email, password })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Error desconocido al crear usuario');
            UI.showToast(`¡Éxito! Vendedor ${email} creado correctamente.`, "success");
            document.getElementById('form-crear-vendedor').reset();
        } catch (error) {
            UI.showToast("Error de seguridad: " + error.message, "error");
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    }
};
