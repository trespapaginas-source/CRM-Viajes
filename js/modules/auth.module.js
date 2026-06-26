// ============================================================
// js/modules/auth.module.js — Autenticación + Escudo Móvil
// Dependencias: supabaseClient (service), UI (utils)
// Cross-module: window.App (runtime)
// Extraído de app.js líneas 88–278
// ============================================================
import { supabaseClient } from '../services/supabase.service.js';
import { UI } from '../utils/ui.utils.js';

export const AuthModule = {
    currentUser: null,
    userProfile: null,
    _activeSessionUserId: null,

    async init() {
        try {
            const { data: { session } } = await supabaseClient.auth.getSession();
            if (session) {
                this._activeSessionUserId = session.user.id;
                await this.showApp(session.user);
            } else {
                this.showLogin();
            }

            supabaseClient.auth.onAuthStateChange(async (event, session) => {
                if (event === 'SIGNED_OUT') {
                    this.currentUser = null;
                    this.userProfile = null;
                    this._activeSessionUserId = null;
                    this.showLogin();
                } else if (event === 'SIGNED_IN') {
                    if (!this.currentUser || this.currentUser.id !== session.user.id) {
                        this._activeSessionUserId = session.user.id;
                        await this.showApp(session.user);
                    }
                } else if (event === 'PASSWORD_RECOVERY') {
                    if (session) {
                        this._activeSessionUserId = session.user.id;
                        await this.showApp(session.user);
                        this.openChangePasswordModal();
                    }
                }
                // TOKEN_REFRESHED, INITIAL_SESSION, USER_UPDATED: ignorar silenciosamente
            });
        } catch (e) {
            this.showLogin();
        }
    },

    showLogin() {
        document.getElementById('global-loader').style.display = 'none';
        document.getElementById('crm-app').classList.add('hidden');
        document.getElementById('login-screen').classList.remove('hidden');
    },

    async showApp(user) {
        this.currentUser = user;
        document.getElementById('user-email-display').innerText = user.email;

        const allMods = ["dashboard", "calendario", "planes", "clientes", "proveedores", "rentabilidad", "contactos", "enlaces", "configuracion"];

        try {
            let { data: perfil } = await supabaseClient.from('perfiles_usuarios').select('*').eq('user_id', user.id).single();
            const { count } = await supabaseClient.from('perfiles_usuarios').select('*', { count: 'exact', head: true });

            if (perfil) {
                // Asegurar que trespa.paginas@gmail.com siempre tenga el rol super_administrador
                if (user.email === 'trespa.paginas@gmail.com' && perfil.rol !== 'super_administrador') {
                    await supabaseClient.from('perfiles_usuarios').update({
                        rol: 'super_administrador',
                        modulos_permitidos: allMods,
                        puede_eliminar: true,
                        puede_configurar: true
                    }).eq('user_id', user.id);
                    perfil.rol = 'super_administrador';
                    perfil.modulos_permitidos = allMods;
                    perfil.puede_eliminar = true;
                    perfil.puede_configurar = true;
                }
                this.userProfile = perfil;
            } else {
                const esElPrimero = (count === 0);
                const esSuperAdmin = (user.email === 'trespa.paginas@gmail.com');
                const nuevoPerfil = {
                    user_id: user.id,
                    email: user.email,
                    rol: esSuperAdmin ? 'super_administrador' : (esElPrimero ? 'administrador' : 'analista'),
                    modulos_permitidos: (esSuperAdmin || esElPrimero) ? allMods : ["dashboard", "clientes", "enlaces"],
                    puede_eliminar: esSuperAdmin || esElPrimero,
                    puede_configurar: esSuperAdmin || esElPrimero
                };
                await supabaseClient.from('perfiles_usuarios').insert([nuevoPerfil]);
                this.userProfile = nuevoPerfil;
            }

            if (this.userProfile.rol === 'administrador' || this.userProfile.rol === 'super_administrador') {
                this.userProfile.modulos_permitidos = allMods;
                this.userProfile.puede_eliminar = true;
                this.userProfile.puede_configurar = true;
            }
        } catch (error) {
            console.warn("Error de conexión con perfiles. Aplicando permisos mínimos de seguridad.");
            this.userProfile = { rol: 'analista', modulos_permitidos: ['dashboard', 'calendario'], puede_eliminar: false, puede_configurar: false };
        }

        this.applySecurityRules();

        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('crm-app').classList.remove('hidden');
        await window.App.initData(); // ← window: cross-module call
    },

    applySecurityRules() {
        let modulos = this.userProfile.modulos_permitidos || [];
        const puedeEliminar = this.userProfile.puede_eliminar;
        const rol = this.userProfile.rol;

        if (!modulos.includes('calendario')) modulos.push('calendario');

        document.querySelectorAll('.nav-btn').forEach(btn => {
            const target = btn.getAttribute('data-target');
            if (rol === 'administrador' || rol === 'super_administrador') {
                btn.style.display = '';
            } else if (target && !modulos.includes(target)) {
                btn.style.display = 'none';
            } else {
                btn.style.display = '';
            }
        });

        if (!puedeEliminar) {
            let styleEl = document.getElementById('security-styles');
            if (!styleEl) {
                styleEl = document.createElement('style');
                styleEl.id = 'security-styles';
                document.head.appendChild(styleEl);
            }
            styleEl.innerHTML = `.btn-delete-protected { display: none !important; }`;
        } else {
            const styleEl = document.getElementById('security-styles');
            if (styleEl) styleEl.remove();
        }


        const trazabilidadBtn = document.getElementById('nav-trazabilidad-btn');
        if (trazabilidadBtn) {
            if (this.userProfile?.rol === 'super_administrador') {
                trazabilidadBtn.classList.remove('hidden');
            } else {
                trazabilidadBtn.classList.add('hidden');
            }
        }
    },

    async handleLogin(event) {
        event.preventDefault();
        const btn = document.getElementById('btn-login-submit');
        btn.disabled = true;
        btn.innerHTML = '<i class="ph ph-spinner animate-spin mr-2"></i> Autenticando...';

        const { error } = await supabaseClient.auth.signInWithPassword({
            email: document.getElementById('login-email').value,
            password: document.getElementById('login-password').value,
        });

        if (error) {
            UI.showToast("Acceso denegado: Credenciales inválidas.", "error");
            btn.disabled = false;
            btn.innerHTML = 'Ingresar <i class="ph ph-arrow-right font-bold ml-2 text-lg"></i>';
        }
    },

    async logout() {
        await supabaseClient.auth.signOut();
        localStorage.removeItem('vivetravel_active_view');
    },

    openChangePasswordModal() {
        document.getElementById('pwd-form').reset();
        UI.openModal('pwd-modal', 'pwd-modal-bg', 'pwd-modal-content');
    },

    closeChangePasswordModal() {
        UI.closeModal('pwd-modal', 'pwd-modal-bg', 'pwd-modal-content');
    },

    async executePasswordChange(event) {
        event.preventDefault();
        const newPass = document.getElementById('pwd-new').value;
        const confirmPass = document.getElementById('pwd-confirm').value;
        const regex = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;

        if (newPass !== confirmPass) return UI.showToast("Las contraseñas no coinciden.", "error");
        if (!regex.test(newPass)) return UI.showToast("La contraseña debe poseer al menos 8 caracteres combinando letras y números (se permiten caracteres especiales).", "error");

        const btn = document.getElementById('btn-pwd-save');
        btn.disabled = true;
        btn.innerText = "Sincronizando...";

        const { error } = await supabaseClient.auth.updateUser({ password: newPass });

        if (error) {
            UI.showToast("Error: " + error.message, "error");
        } else {
            UI.showToast("Clave actualizada satisfactoriamente.", "success");
            this.closeChangePasswordModal();
        }

        btn.disabled = false;
        btn.innerText = "Guardar Nueva Clave";
    },

    forgotPassword() {
        document.getElementById('login-form').classList.add('hidden');
        document.getElementById('recovery-form').classList.remove('hidden');
        document.getElementById('forgot-password-container')?.classList.add('hidden');
    },

    showLoginForm() {
        document.getElementById('recovery-form').classList.add('hidden');
        document.getElementById('login-form').classList.remove('hidden');
        document.getElementById('forgot-password-container')?.classList.remove('hidden');
    },

    async handleRecovery(event) {
        event.preventDefault();
        const email = document.getElementById('recovery-email').value;
        const btn = document.getElementById('btn-recovery-submit');
        const prevText = btn.innerHTML;
        
        btn.disabled = true;
        btn.innerHTML = '<i class="ph ph-spinner animate-spin text-lg mr-2"></i> Enviando...';

        try {
            const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
                redirectTo: window.location.origin
            });
            if (error) {
                UI.showToast("Fallo emitiendo el enlace de recuperación: " + error.message, "error");
            } else {
                UI.showToast("Enlace de reseteo emitido. Revisa tu bandeja de correo.", "success");
                this.showLoginForm();
            }
        } catch (err) {
            console.error("Excepción en recuperación de clave:", err);
            UI.showToast("Ocurrió un error inesperado al procesar la solicitud.", "error");
        } finally {
            btn.disabled = false;
            btn.innerHTML = prevText;
        }
    }
};
