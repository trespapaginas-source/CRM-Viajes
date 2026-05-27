// src/components/suppliers/suppliers.component.js — Componente de Proveedores
// Desacoplado de window. Reactivo usando Store.

import { Store } from '../../core/store.js';
import { DataService, supabaseClient } from '../../../js/services/supabase.service.js';
import { UI } from '../../../js/utils/ui.utils.js';
import { formatCOP } from '../../../js/utils/format.utils.js';

function isProductInUse(supplierId, productName) {
    if (!supplierId || !productName) return false;
    
    // Check in plans
    const inPlan = DataService.planes.some(p => 
        p.proveedores_vinculados && p.proveedores_vinculados.some(pv => {
            const pvId = pv.id_proveedor || pv.id_provider;
            return String(pvId) === String(supplierId) && pv.incluye === productName;
        })
    );
    if (inPlan) return true;

    // Check in client reservations
    const inClient = DataService.clientes.some(c => 
        c.proveedores_vinculados && c.proveedores_vinculados.some(pv => {
            const pvId = pv.id_proveedor || pv.id_provider;
            return String(pvId) === String(supplierId) && pv.incluye === productName;
        })
    );
    return inClient;
}

function getNextVersionName(name) {
    const match = name.match(/\s\(v(\d+)\)$/i);
    if (match) {
        const nextVer = parseInt(match[1]) + 1;
        return name.replace(/\s\(v(\d+)\)$/i, ` (v${nextVer})`);
    }
    return `${name} (v2)`;
}

export const SuppliersComponent = {
    tempProducts: [],
    initialProducts: [],
    deletedProductsReasons: {},
    editingIndex: null,

    init() {
        this.bindEvents();
        
        // Primera renderización con datos existentes
        this.populateFiltersAndCategories(Store.getState());
        this.renderGrid(Store.getState());

        // Suscripción reactiva al Store
        Store.subscribe((state) => {
            this.populateFiltersAndCategories(state);
            this.renderGrid(state);
        });
    },

    bindEvents() {
        // Eventos estáticos del DOM (Filtros y botones de crear)
        const btnOpenForm = document.getElementById('btn-add-supplier');
        if (btnOpenForm) btnOpenForm.addEventListener('click', () => this.openFormModal());

        const selectCiudad = document.getElementById('filter-supplier-ciudad');
        if (selectCiudad) selectCiudad.addEventListener('change', () => this.filterGrid());

        const selectCat = document.getElementById('filter-supplier-categoria');
        if (selectCat) selectCat.addEventListener('change', () => this.filterGrid());

        const btnSave = document.getElementById('btn-save-supplier');
        if (btnSave) btnSave.addEventListener('click', (e) => { e.preventDefault(); this.saveSupplier(); });

        const selectTipo = document.getElementById('sf-tipo');
        if (selectTipo) selectTipo.addEventListener('change', () => this.toggleCustomCategory());

        const btnAddTemp = document.getElementById('btn-add-temp-product');
        if (btnAddTemp) btnAddTemp.addEventListener('click', () => this.addProductToTempList());

        const btnConfirmQsm = document.getElementById('qsm-confirm-btn');
        if (btnConfirmQsm) btnConfirmQsm.addEventListener('click', () => this.executeQuickAddProduct());

        const closeFormBtns = document.querySelectorAll('.btn-close-supplier-form');
        closeFormBtns.forEach(btn => btn.addEventListener('click', () => this.closeFormModal()));

        // Event Delegation para elementos generados dinámicamente en el Grid
        const grid = document.getElementById('suppliers-grid');
        if (grid) {
            grid.addEventListener('click', (e) => {
                // Quick Add
                const btnQA = e.target.closest('.btn-quick-add-supplier');
                if (btnQA) this.promptQuickAddProduct(btnQA.dataset.id);

                // Edit
                const btnEdit = e.target.closest('.btn-edit-supplier');
                if (btnEdit) this.openFormModal(btnEdit.dataset.id);

                // Delete
                const btnDelete = e.target.closest('.btn-delete-supplier-item');
                if (btnDelete) {
                    // Usamos la función global promptGlobalDelete que ya está en window
                    if (window.promptGlobalDelete) {
                        window.promptGlobalDelete(btnDelete.dataset.id, 'proveedor', btnDelete.dataset.name);
                    }
                }
            });
        }
        
        // Event Delegation para la lista de productos temporales
        const prodList = document.getElementById('sf-products-list');
        if (prodList) {
            prodList.addEventListener('click', (e) => {
                const btnDel = e.target.closest('.btn-remove-temp-product');
                if (btnDel) {
                    this.removeTempProduct(parseInt(btnDel.dataset.index));
                    return;
                }

                const btnEdit = e.target.closest('.btn-edit-temp-product');
                if (btnEdit) {
                    this.editingIndex = parseInt(btnEdit.dataset.index);
                    this.renderTempProducts();
                    return;
                }

                const btnSave = e.target.closest('.btn-save-edit-product');
                if (btnSave) {
                    this.saveEditedProduct(parseInt(btnSave.dataset.index));
                    return;
                }

                const btnCancel = e.target.closest('.btn-cancel-edit-product');
                if (btnCancel) {
                    this.editingIndex = null;
                    this.renderTempProducts();
                    return;
                }
            });
        }
    },

    populateFiltersAndCategories(state) {
        if (!state) state = Store.getState();
        const pr = state.proveedores;
        const ciu = [...new Set(pr.map(n => n.ciudad).filter(Boolean))];
        const cat = state.categories;

        const fCiu = document.getElementById('filter-supplier-ciudad');
        if (fCiu) {
            const currentCiu = fCiu.value;
            fCiu.innerHTML = '<option value="">Todas las Ciudades</option>';
            ciu.forEach(c => fCiu.innerHTML += `<option value="${c}">${c}</option>`);
            if (currentCiu) fCiu.value = currentCiu;
        }

        const fCat = document.getElementById('filter-supplier-categoria');
        if (fCat) {
            const currentCat = fCat.value;
            fCat.innerHTML = '<option value="">Todas las Categorías</option>';
            cat.forEach(c => fCat.innerHTML += `<option value="${c}">${c}</option>`);
            if (currentCat) fCat.value = currentCat;
        }

        const sf = document.getElementById('sf-tipo');
        if (sf) {
            const currentSf = sf.value;
            sf.innerHTML = '';
            cat.forEach(c => sf.innerHTML += `<option value="${c}">${c}</option>`);
            sf.innerHTML += `<option value="otra">++ Añadir Nueva Categoría...</option>`;
            if (currentSf) sf.value = currentSf;
        }
    },

    renderGrid(state) {
        if (!state) state = Store.getState();
        const c = document.getElementById('suppliers-grid');
        if (!c) return;
        c.innerHTML = '';

        state.proveedores.forEach(p => {
            const dic = {
                'Alojamiento': { i: 'ph-buildings', b: 'bg-blue-50/50 text-blue-600 border-blue-200/50', t: 'text-blue-700 bg-blue-100/50' },
                'Operador Tour': { i: 'ph-map-trifold', b: 'bg-purple-50/50 text-purple-600 border-purple-200/50', t: 'text-purple-700 bg-purple-100/50' },
                'Transporte': { i: 'ph-bus', b: 'bg-amber-50/50 text-amber-600 border-amber-200/50', t: 'text-amber-700 bg-amber-100/50' },
                'Restaurante': { i: 'ph-fork-knife', b: 'bg-rose-50/50 text-rose-600 border-rose-200/50', t: 'text-rose-700 bg-rose-100/50' }
            };
            const fall = dic[p.tipo] || { i: 'ph-briefcase', b: 'bg-slate-50/50 text-slate-600 border-slate-200/50', t: 'text-slate-700 bg-slate-200/50' };

            let hs = '';
            if (p.productos && p.productos.length > 0) {
                hs = '<div class="mt-2 pt-2 border-t border-slate-100 space-y-1 w-full">';
                p.productos.forEach(un => {
                    hs += `<div class="flex justify-between items-center text-[9px] bg-slate-50/50 px-2 py-1 rounded-md border border-slate-100/50"><span class="text-slate-600 truncate mr-2 font-bold flex items-center"><i class="ph ph-tag mr-1 text-slate-400"></i>${UI.sanitize(un.name)}</span><span class="font-black text-slate-800 bg-white px-1.5 py-0.5 rounded shadow-sm">${formatCOP(un.costo)}</span></div>`;
                });
                hs += '</div>';
            }

            const safeName = (p.nombre || '').replace(/'/g, "\\'");
            c.innerHTML += `
                <div class="supplier-card bg-white/90 backdrop-blur-md rounded-2xl shadow-sm p-3.5 relative group flex flex-col border border-slate-100 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 overflow-hidden" data-ciudad="${UI.sanitize(p.ciudad || '')}" data-categoria="${UI.sanitize(p.tipo || '')}">
                    <div class="flex items-start gap-3 relative z-10">
                        <div class="w-10 h-10 rounded-xl flex items-center justify-center text-xl border shadow-sm shrink-0 ${fall.b}"><i class="ph ${fall.i}"></i></div>
                        <div class="flex-1 min-w-0">
                            <div class="flex items-start justify-between gap-1">
                                <h4 class="text-sm font-black text-slate-900 truncate leading-tight pt-0.5">${UI.sanitize(p.nombre)}</h4>
                                <div class="flex space-x-1 shrink-0 opacity-100 lg:opacity-0 group-hover:opacity-100 transition-all">
                                    <button class="btn-quick-add-supplier bg-white shadow-sm border border-slate-200 p-1.5 rounded-lg text-green-500 hover:text-white hover:bg-green-500 transition-colors" data-id="${p.id}" title="Servicio Rápido"><i class="ph ph-plus-circle text-xs"></i></button>
                                    <button class="btn-edit-supplier bg-white shadow-sm border border-slate-200 p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-primary-500 transition-colors" data-id="${p.id}" title="Editar"><i class="ph ph-pencil-simple text-xs"></i></button>
                                    <button class="btn-delete-supplier-item btn-delete-protected bg-white shadow-sm border border-slate-200 p-1.5 rounded-lg text-red-400 hover:text-white hover:bg-red-500 transition-colors" data-id="${p.id}" data-name="${UI.sanitize(safeName)}" title="Eliminar"><i class="ph ph-trash text-xs"></i></button>
                                </div>
                            </div>
                            <span class="inline-block mt-0.5 text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded border border-white/60 shadow-sm ${fall.t}">${UI.sanitize(p.tipo)}</span>
                        </div>
                    </div>
                    <div class="flex items-center justify-between mt-3 pt-2.5 border-t border-slate-100 relative z-10">
                        <p class="text-[9px] font-bold text-slate-500 flex items-center truncate max-w-[50%]"><i class="ph ph-map-pin mr-1 text-primary-500 text-xs shrink-0"></i> <span class="truncate">${UI.sanitize(p.ciudad || 'Sede Virtual')}</span></p>
                        <p class="text-[9px] font-bold text-slate-500 flex items-center shrink-0"><i class="ph ph-phone mr-1 text-green-500 text-xs"></i> ${UI.sanitize(p.telefono || '')}</p>
                    </div>
                    <div class="relative z-10 w-full">${hs}</div>
                </div>`;
        });
    },

    filterGrid() {
        const c = document.getElementById("filter-supplier-ciudad")?.value.toUpperCase() || "";
        const t = document.getElementById("filter-supplier-categoria")?.value.toUpperCase() || "";
        const cd = document.getElementsByClassName("supplier-card");
        for (let x = 0; x < cd.length; x++) {
            cd[x].style.display = ((c === "" || cd[x].getAttribute('data-ciudad').toUpperCase() === c) && (t === "" || cd[x].getAttribute('data-categoria').toUpperCase() === t)) ? "" : "none";
        }
    },

    openFormModal(id = null) {
        document.getElementById('supplier-form').reset();
        this.tempProducts = [];
        this.initialProducts = [];
        this.deletedProductsReasons = {};
        this.editingIndex = null;
        this.toggleCustomCategory();

        if (id) {
            const state = Store.getState();
            const p = state.proveedores.find(x => x.id === id);
            if (p) {
                document.getElementById('supplier-form-title').innerHTML = '<i class="ph ph-buildings text-primary-600 mr-2 text-2xl"></i> Mantenimiento Proveedor';
                document.getElementById('sf-id').value = p.id;
                document.getElementById('sf-nombre').value = p.nombre;
                document.getElementById('sf-telefono').value = p.telefono;
                document.getElementById('sf-ciudad').value = p.ciudad || '';
                document.getElementById('sf-email').value = p.email || '';

                const cb = document.getElementById('sf-tipo');
                if (![...cb.options].map(o => o.value).includes(p.tipo)) {
                    DataService.addCategory(p.tipo);
                    // Actualizamos manualmente el select si se agregó categoría
                    cb.innerHTML += `<option value="${p.tipo}">${p.tipo}</option>`;
                }
                cb.value = p.tipo;
                this.tempProducts = JSON.parse(JSON.stringify(p.productos || []));
                this.initialProducts = JSON.parse(JSON.stringify(p.productos || []));
            }
        } else {
            document.getElementById('supplier-form-title').innerHTML = '<i class="ph ph-buildings text-primary-600 mr-2 text-2xl"></i> Nuevo Proveedor';
        }

        this.renderTempProducts();
        UI.openModal('supplier-form-modal', 'supplier-form-bg', 'supplier-form-content');
    },

    closeFormModal() { 
        UI.closeModal('supplier-form-modal', 'supplier-form-bg', 'supplier-form-content'); 
    },

    toggleCustomCategory() {
        const m = document.getElementById('sf-tipo');
        const n = document.getElementById('sf-tipo-nuevo');
        if (!m || !n) return;
        if (m.value === 'otra') { n.classList.remove('hidden'); n.required = true; }
        else { n.classList.add('hidden'); n.required = false; n.value = ''; }
    },

    addProductToTempList() {
        const n = document.getElementById('sf-new-product-name').value.trim();
        const c = parseInt(document.getElementById('sf-new-product-cost').value) || 0;
        if (n && c > 0) {
            this.tempProducts.push({ name: n, costo: c });
            document.getElementById('sf-new-product-name').value = '';
            document.getElementById('sf-new-product-cost').value = '';
            this.renderTempProducts();
        } else {
            UI.showToast("El servicio debe tener nombre y un costo mayor a cero.", "error");
        }
    },

    removeTempProduct(i) {
        const prod = this.tempProducts[i];
        if (!prod) return;

        // Verificar si estaba en los productos iniciales guardados en la BD
        const existia = this.initialProducts.some(p => p.name === prod.name);
        if (existia) {
            const motivo = window.prompt(`El servicio "${prod.name}" ya está guardado en la base de datos. Ingresa la justificación/motivo para eliminar este servicio:`);
            if (motivo === null) {
                // Canceló el prompt, no hacemos nada
                return;
            }
            const motivoTrimmed = motivo.trim();
            if (!motivoTrimmed) {
                UI.showToast("La justificación es obligatoria para eliminar un servicio existente.", "error");
                return;
            }
            this.deletedProductsReasons[prod.name] = motivoTrimmed;
        }

        this.tempProducts.splice(i, 1);
        this.renderTempProducts();
    },

    renderTempProducts() {
        const u = document.getElementById('sf-products-list');
        if (!u) return;
        u.innerHTML = '';
        this.tempProducts.forEach((p, i) => {
            const isEditing = this.editingIndex === i;
            const isArchived = p.activo === false;
            
            if (isEditing) {
                u.innerHTML += `
                <li class="flex flex-col sm:flex-row sm:items-center gap-3 bg-slate-50 px-4 py-3 rounded-xl border border-indigo-200 shadow-sm transition">
                    <div class="flex-1 min-w-0">
                        <input type="text" id="edit-prod-name-${i}" class="w-full bg-white border border-slate-200/60 rounded-lg px-2.5 py-1.5 text-sm font-semibold text-slate-800 outline-none focus:ring-1 focus:ring-slate-900 transition-all shadow-sm" value="${UI.sanitize(p.name)}" placeholder="Nombre del servicio">
                    </div>
                    <div class="flex items-center gap-2 shrink-0">
                        <div class="relative w-32">
                            <span class="absolute left-2.5 top-1/2 transform -translate-y-1/2 text-emerald-500 font-bold text-xs">$</span>
                            <input type="number" id="edit-prod-cost-${i}" class="w-full pl-6 pr-2 py-1.5 border border-slate-200/60 rounded-lg text-xs font-black text-emerald-700 bg-white outline-none focus:ring-1 focus:ring-emerald-500 transition-all shadow-sm" value="${p.costo}" placeholder="Costo">
                        </div>
                        <button type="button" class="btn-save-edit-product text-emerald-600 hover:text-white bg-emerald-50 hover:bg-emerald-600 p-2 rounded-lg transition-colors border border-emerald-100 cursor-pointer" data-index="${i}" title="Guardar cambios"><i class="ph ph-check text-lg"></i></button>
                        <button type="button" class="btn-cancel-edit-product text-slate-400 hover:text-slate-600 bg-slate-50 hover:bg-slate-100 p-2 rounded-lg transition-colors border border-slate-100 cursor-pointer" data-index="${i}" title="Cancelar"><i class="ph ph-x text-lg"></i></button>
                    </div>
                </li>`;
            } else {
                let actionButtonsHtml = '';
                let badgeHtml = '';
                
                if (isArchived) {
                    badgeHtml = `<span class="text-[9px] font-bold text-slate-400 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded shadow-sm ml-2"><i class="ph ph-archive mr-0.5"></i> Histórico / Inactivo</span>`;
                    actionButtonsHtml = `<span class="text-slate-400 text-xs font-semibold p-2 flex items-center gap-1"><i class="ph ph-lock mr-0.5"></i> Bloqueado</span>`;
                } else {
                    actionButtonsHtml = `
                        <button type="button" class="btn-edit-temp-product text-slate-400 hover:text-primary-600 bg-slate-50 hover:bg-primary-50 p-2 rounded-lg transition-colors border border-slate-100 cursor-pointer" data-index="${i}" title="Editar servicio"><i class="ph ph-pencil-simple text-lg"></i></button>
                        <button type="button" class="btn-remove-temp-product text-slate-400 hover:text-red-500 bg-slate-50 hover:bg-red-50 p-2 rounded-lg transition-colors border border-slate-100 cursor-pointer" data-index="${i}" title="Eliminar servicio"><i class="ph ph-trash text-lg"></i></button>
                    `;
                }

                u.innerHTML += `
                <li class="flex justify-between items-center ${isArchived ? 'bg-slate-50/50 opacity-75' : 'bg-white'} px-4 py-3 rounded-xl border border-slate-200 shadow-sm transition hover:shadow-md">
                    <div>
                        <span class="text-sm font-black text-slate-800">${UI.sanitize(p.name)}${badgeHtml}</span><br>
                        <span class="text-xs font-bold text-green-700 bg-green-50 px-2 py-0.5 rounded-md border border-green-100 shadow-sm">${formatCOP(p.costo)}</span>
                    </div>
                    <div class="flex items-center gap-1.5">
                        ${actionButtonsHtml}
                    </div>
                </li>`;
            }
        });
    },

    saveEditedProduct(idx) {
        const nameInput = document.getElementById(`edit-prod-name-${idx}`);
        const costInput = document.getElementById(`edit-prod-cost-${idx}`);
        if (!nameInput || !costInput) return;

        const name = nameInput.value.trim();
        const cost = parseFloat(costInput.value) || 0;

        if (!name || cost <= 0) {
            UI.showToast("El servicio debe tener un nombre válido y un costo mayor a cero.", "error");
            return;
        }

        this.tempProducts[idx].name = name;
        this.tempProducts[idx].costo = cost;
        this.editingIndex = null;
        this.renderTempProducts();
    },

    async saveSupplier() {
        const f = document.getElementById('supplier-form');
        if (!f.checkValidity()) { f.reportValidity(); return; }

        const b = document.getElementById('btn-save-supplier');
        b.disabled = true;
        b.innerHTML = '<i class="ph ph-spinner animate-spin mr-2"></i> Guardando...';

        try {
            let cat = document.getElementById('sf-tipo').value;
            if (cat === 'otra') { cat = document.getElementById('sf-tipo-nuevo').value.trim(); DataService.addCategory(cat); }

            // Procesamiento de Versionado de Productos
            const finalProducts = [];
            const supplierId = document.getElementById('sf-id').value;

            if (supplierId) {
                // Proveedor existente, procesamos versionado e impedimos eliminaciones físicas de productos en uso
                const editedProducts = [...this.tempProducts];
                
                for (let i = 0; i < editedProducts.length; i++) {
                    const edited = editedProducts[i];
                    
                    // Si es un producto nuevo añadido en esta edición (no estaba en la carga inicial)
                    if (i >= this.initialProducts.length) {
                        edited.activo = edited.activo !== undefined ? edited.activo : true;
                        edited.version = edited.version || 1;
                        finalProducts.push(edited);
                        continue;
                    }

                    const orig = this.initialProducts[i];
                    const nameChanged = edited.name !== orig.name;
                    const priceChanged = parseFloat(edited.costo) !== parseFloat(orig.costo);

                    if (nameChanged || priceChanged) {
                        const inUse = isProductInUse(supplierId, orig.name);
                        if (inUse) {
                            // Conservar el original como inactivo/histórico
                            finalProducts.push({
                                name: orig.name,
                                costo: parseFloat(orig.costo),
                                activo: false,
                                version: orig.version || 1
                            });

                            // Crear la nueva versión
                            const nextVer = (orig.version || 1) + 1;
                            let newName = edited.name;
                            if (!nameChanged) {
                                newName = getNextVersionName(orig.name);
                            }
                            finalProducts.push({
                                name: newName,
                                costo: parseFloat(edited.costo),
                                activo: true,
                                version: nextVer
                            });
                        } else {
                            // No está en uso, se modifica directamente
                            edited.activo = edited.activo !== undefined ? edited.activo : true;
                            edited.version = orig.version || 1;
                            finalProducts.push(edited);
                        }
                    } else {
                        // Sin cambios
                        edited.activo = edited.activo !== undefined ? edited.activo : true;
                        edited.version = orig.version || 1;
                        finalProducts.push(edited);
                    }
                }

                // Detectar si se eliminaron productos que estaban en uso
                this.initialProducts.forEach(orig => {
                    const stillExists = editedProducts.some(p => p.name === orig.name);
                    if (!stillExists) {
                        const inUse = isProductInUse(supplierId, orig.name);
                        if (inUse) {
                            // Si está en uso, lo reincorporamos como inactivo/histórico
                            finalProducts.push({
                                name: orig.name,
                                costo: parseFloat(orig.costo),
                                activo: false,
                                version: orig.version || 1
                            });
                        }
                    }
                });
            } else {
                // Nuevo proveedor: todos los productos inician en activo: true, version: 1
                this.tempProducts.forEach(p => {
                    finalProducts.push({
                        name: p.name,
                        costo: parseFloat(p.costo),
                        activo: true,
                        version: 1
                    });
                });
            }

            const obj = {
                id: supplierId,
                nombre: document.getElementById('sf-nombre').value,
                telefono: document.getElementById('sf-telefono').value,
                ciudad: document.getElementById('sf-ciudad').value,
                email: document.getElementById('sf-email').value,
                tipo: cat,
                productos: finalProducts
            };

            // Validar que todos los servicios tengan nombre y un costo válido
            const invalidProduct = obj.productos.find(p => !p.name.trim() || p.costo <= 0);
            if (invalidProduct) {
                UI.showToast("Todos los servicios deben tener un nombre válido y un costo mayor a cero.", "error");
                b.disabled = false;
                b.innerHTML = '<i class="ph ph-check mr-2 text-xl"></i> Finalizar Proveedor';
                return;
            }

            if (obj.id) {
                const enUso = await DataService.checkProveedorEnUso(obj.id);
                const isAdminPrincipal = window.AuthModule?.currentUser?.email === 'trespa.paginas@gmail.com';
                
                if (enUso && !isAdminPrincipal) {
                    const prev = Store.getState().proveedores.find(x => x.id === obj.id);
                    
                    // Determinar si hay servicios eliminados
                    const deletedServiceNames = Object.keys(this.deletedProductsReasons);
                    let motivo = '';
                    
                    if (deletedServiceNames.length > 0) {
                        // Si se eliminaron servicios, armamos el motivo con las razones dadas
                        const parts = deletedServiceNames.map(name => `Eliminado servicio: "${name}". Motivo: ${this.deletedProductsReasons[name]}`);
                        motivo = parts.join(" | ");
                    } else {
                        // Si no hay eliminaciones (solo ediciones de precio/nombre o adiciones), no requiere prompt
                        motivo = "Actualización de catálogo de servicios y tarifas";
                    }
                    
                    const requestObj = {
                        proveedor_id: obj.id,
                        solicitante_email: window.AuthModule?.currentUser?.email || 'Desconocido',
                        tipo_operacion: 'MODIFICACION',
                        estado: 'PENDIENTE',
                        motivo: motivo,
                        datos_anteriores: prev,
                        datos_nuevos: obj
                    };
                    
                    await DataService.crearSolicitudCambio(requestObj);
                    UI.showToast("Solicitud de modificación registrada para aprobación del administrador.", "info");
                    this.closeFormModal();
                    return;
                }
            }

            await DataService.saveProveedor(obj);
            
            this.closeFormModal();
            UI.showToast("Proveedor guardado correctamente.", "success");
        } catch (e) {
            UI.showToast("Error de base de datos impidió el guardado.", "error");
            console.error(e);
        } finally {
            b.innerHTML = '<i class="ph ph-check mr-2 text-xl"></i> Finalizar Proveedor';
            b.disabled = false;
        }
    },

    promptQuickAddProduct(id) {
        const p = Store.getState().proveedores.find(x => x.id === id);
        if (!p) return;
        document.getElementById('qsm-supplier-id').value = id;
        document.getElementById('qsm-supplier-name').innerText = p.nombre;
        document.getElementById('qsm-name').value = '';
        document.getElementById('qsm-cost').value = '';
        UI.openModal('quick-service-modal', 'qsm-bg', 'qsm-content');
    },

    async executeQuickAddProduct() {
        const id = document.getElementById('qsm-supplier-id').value;
        const p = Store.getState().proveedores.find(x => x.id === id);
        if (!p) return;

        const name = document.getElementById('qsm-name').value.trim();
        const cost = parseFloat(document.getElementById('qsm-cost').value);

        if (!name || isNaN(cost) || cost <= 0) return UI.showToast("Debes proveer un nombre y costo válido.", "error");

        const btn = document.getElementById('qsm-confirm-btn');
        const pHtml = btn.innerHTML;
        btn.innerHTML = '<i class="ph ph-spinner animate-spin"></i>';
        btn.disabled = true;

        try {
            const newProducts = [...(p.productos || []), { name, costo: cost, activo: true, version: 1 }];
            
            const enUso = await DataService.checkProveedorEnUso(id);
            const isAdminPrincipal = window.AuthModule?.currentUser?.email === 'trespa.paginas@gmail.com';
            
            if (enUso && !isAdminPrincipal) {
                // Al agregar servicio por Quick Add, es una adición (no eliminación), por lo que no pide justificación.
                const motivo = `Adición de servicio rápido: "${name}" con costo ${formatCOP(cost)}`;
                
                const obj = {
                    ...p,
                    productos: newProducts
                };
                
                const requestObj = {
                    proveedor_id: id,
                    solicitante_email: window.AuthModule?.currentUser?.email || 'Desconocido',
                    tipo_operacion: 'MODIFICACION',
                    estado: 'PENDIENTE',
                    motivo: motivo,
                    datos_anteriores: p,
                    datos_nuevos: obj
                };
                
                await DataService.crearSolicitudCambio(requestObj);
                UI.showToast("Solicitud para añadir servicio registrada para aprobación administrativa.", "info");
                UI.closeModal('quick-service-modal', 'qsm-bg', 'qsm-content');
                return;
            }

            const res = await supabaseClient.from('proveedores').update({ productos: newProducts }).eq('id', id);
            if (res.error) throw res.error;

            await DataService.loadAll(); 
            
            UI.closeModal('quick-service-modal', 'qsm-bg', 'qsm-content');
            UI.showToast("Nuevo servicio agregado a la red del proveedor.", "success");
        } catch (e) {
            UI.showToast("No se pudo añadir el servicio a la base de datos.", "error");
            console.error(e);
        } finally {
            btn.innerHTML = pHtml;
            btn.disabled = false;
        }
    }
};
