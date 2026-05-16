export const DocumentosComponent = {
    settings: {
        logo: '',
        color1: '#008B8B',
        color2: '#F97316',
        razon: 'Agencia de Viajes',
        nit: '',
        rnt: '',
        tel: '',
        dir: '',
        terms: 'Condiciones sujetas a disponibilidad y cambios sin previo aviso.'
    },

    init() {
        this.loadSettings();
        this.updateFormUI();
        
        // Auto-set today's date
        const hoy = new Date().toISOString().split('T')[0];
        if(document.getElementById('doc_fecha')) {
            document.getElementById('doc_fecha').value = hoy;
        }

        // Add auto-preview listener
        const form = document.getElementById('doc-form');
        if (form) {
            form.addEventListener('input', () => this.renderPreview());
        }
        
        // Initial render
        setTimeout(() => this.renderPreview(), 500);
    },

    loadSettings() {
        const saved = localStorage.getItem('travelers_brand_settings');
        if (saved) {
            this.settings = { ...this.settings, ...JSON.parse(saved) };
        }
    },

    openSettings() {
        // Populate inputs
        document.getElementById('setting_logo').value = this.settings.logo || '';
        document.getElementById('setting_color1').value = this.settings.color1 || '#008B8B';
        document.getElementById('setting_color2').value = this.settings.color2 || '#F97316';
        document.getElementById('setting_razon').value = this.settings.razon || '';
        document.getElementById('setting_nit').value = this.settings.nit || '';
        document.getElementById('setting_rnt').value = this.settings.rnt || '';
        document.getElementById('setting_tel').value = this.settings.tel || '';
        document.getElementById('setting_dir').value = this.settings.dir || '';
        document.getElementById('setting_terms').value = this.settings.terms || '';

        UI.openModal('modal-settings-marca', 'msm-bg', 'msm-content');
    },

    saveSettings() {
        this.settings = {
            logo: document.getElementById('setting_logo').value,
            color1: document.getElementById('setting_color1').value,
            color2: document.getElementById('setting_color2').value,
            razon: document.getElementById('setting_razon').value,
            nit: document.getElementById('setting_nit').value,
            rnt: document.getElementById('setting_rnt').value,
            tel: document.getElementById('setting_tel').value,
            dir: document.getElementById('setting_dir').value,
            terms: document.getElementById('setting_terms').value,
        };
        localStorage.setItem('travelers_brand_settings', JSON.stringify(this.settings));
        UI.closeModal('modal-settings-marca', 'msm-bg', 'msm-content');
        UI.showToast("Configuración guardada", "success");
        this.renderPreview();
    },

    updateFormUI() {
        const type = document.querySelector('input[name="doc_type"]:checked').value;
        const abonoWrapper = document.getElementById('wrapper_abono');
        if (type === 'recibo') {
            abonoWrapper.classList.remove('hidden');
        } else {
            abonoWrapper.classList.add('hidden');
            document.getElementById('doc_abono').value = '';
        }
        this.calcSaldo();
        this.renderPreview();
    },

    calcSaldo() {
        const total = parseFloat(document.getElementById('doc_valor_total').value) || 0;
        const abono = parseFloat(document.getElementById('doc_abono').value) || 0;
        const type = document.querySelector('input[name="doc_type"]:checked').value;
        
        let saldo = 0;
        if (type === 'recibo') {
            saldo = total - abono;
        } else {
            saldo = total;
        }

        document.getElementById('doc_saldo_display').innerText = formatCOP(Math.max(0, saldo));
    },

    buildHTML() {
        const type = document.querySelector('input[name="doc_type"]:checked').value;
        const isCotizacion = type === 'cotizacion';
        
        const title = isCotizacion ? 'COTIZACIÓN DE SERVICIOS' : 'RECIBO DE CAJA / SOPORTE';
        const docId = (isCotizacion ? 'COT' : 'REC') + '-' + Math.floor(1000 + Math.random() * 9000);
        
        const cliente = document.getElementById('doc_cliente').value || 'Nombre del Cliente';
        const dni = document.getElementById('doc_dni').value || '---';
        const plan = document.getElementById('doc_plan').value || 'Plan Turístico';
        const pax = document.getElementById('doc_pax').value || '1';
        const fecha = document.getElementById('doc_fecha').value || new Date().toISOString().split('T')[0];
        
        const total = parseFloat(document.getElementById('doc_valor_total').value) || 0;
        const abono = parseFloat(document.getElementById('doc_abono').value) || 0;
        const saldo = Math.max(0, total - (isCotizacion ? 0 : abono));

        const logoImg = this.settings.logo 
            ? `<img src="${this.settings.logo}" alt="Logo" style="max-height: 80px; max-width: 200px; object-fit: contain;">`
            : `<div style="font-size: 24px; font-weight: 900; color: ${this.settings.color1};">${this.settings.razon}</div>`;

        return `
        <div id="pdf-content-box" style="padding: 40px; font-family: 'Inter', sans-serif; color: #1e293b; background: white; width: 100%; height: 100%; box-sizing: border-box;">
            
            <!-- HEADER -->
            <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid ${this.settings.color1}; padding-bottom: 20px; margin-bottom: 30px;">
                <div>
                    ${logoImg}
                </div>
                <div style="text-align: right; font-size: 10px;">
                    <h2 style="margin: 0; font-size: 20px; color: ${this.settings.color1}; font-weight: 900; letter-spacing: 1px;">${title}</h2>
                    <p style="margin: 5px 0 0 0; font-weight: bold; color: #64748b;">Nº: <span style="color: ${this.settings.color2};">${docId}</span></p>
                    <div style="margin-top: 15px; color: #475569;">
                        <p style="margin: 2px 0;"><strong>${this.settings.razon}</strong></p>
                        ${this.settings.nit ? `<p style="margin: 2px 0;">NIT: ${this.settings.nit}</p>` : ''}
                        ${this.settings.rnt ? `<p style="margin: 2px 0;">RNT: ${this.settings.rnt}</p>` : ''}
                        ${this.settings.tel ? `<p style="margin: 2px 0;">Tel: ${this.settings.tel}</p>` : ''}
                    </div>
                </div>
            </div>

            <!-- INFO CLIENTE -->
            <div style="background: #f8fafc; padding: 15px; border-radius: 8px; margin-bottom: 30px; display: flex; justify-content: space-between; font-size: 12px;">
                <div>
                    <p style="margin: 0 0 5px 0; color: #64748b; font-size: 10px; text-transform: uppercase; font-weight: bold;">Preparado Para</p>
                    <p style="margin: 0; font-weight: 900; font-size: 16px;">${cliente}</p>
                    <p style="margin: 5px 0 0 0; color: #475569;">Identificación: ${dni}</p>
                </div>
                <div style="text-align: right;">
                    <p style="margin: 0 0 5px 0; color: #64748b; font-size: 10px; text-transform: uppercase; font-weight: bold;">Fecha Emisión</p>
                    <p style="margin: 0; font-weight: bold;">${formatShortDate(new Date().toISOString())}</p>
                </div>
            </div>

            <!-- DETALLE SERVICIO -->
            <h3 style="font-size: 14px; text-transform: uppercase; letter-spacing: 1px; color: ${this.settings.color1}; margin-bottom: 15px; border-bottom: 1px solid #e2e8f0; padding-bottom: 5px;">Detalle de la Reserva</h3>
            <table style="width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 30px;">
                <thead>
                    <tr style="background: ${this.settings.color1}15; color: ${this.settings.color1};">
                        <th style="padding: 10px; text-align: left; font-weight: bold;">Concepto / Plan</th>
                        <th style="padding: 10px; text-align: center; font-weight: bold;">Viaje</th>
                        <th style="padding: 10px; text-align: center; font-weight: bold;">Pasajeros</th>
                    </tr>
                </thead>
                <tbody>
                    <tr style="border-bottom: 1px solid #e2e8f0;">
                        <td style="padding: 15px 10px; font-weight: 600;">${plan}</td>
                        <td style="padding: 15px 10px; text-align: center;">${fecha}</td>
                        <td style="padding: 15px 10px; text-align: center;">${pax}</td>
                    </tr>
                </tbody>
            </table>

            <!-- FINANZAS -->
            <div style="display: flex; justify-content: flex-end; margin-bottom: 40px;">
                <div style="width: 250px; font-size: 12px;">
                    <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e2e8f0;">
                        <span style="font-weight: bold; color: #64748b;">Valor Total:</span>
                        <span style="font-weight: 900;">${formatCOP(total)}</span>
                    </div>
                    ${!isCotizacion ? `
                    <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e2e8f0;">
                        <span style="font-weight: bold; color: ${this.settings.color1};">Abono Recibido:</span>
                        <span style="font-weight: 900; color: ${this.settings.color1};">${formatCOP(abono)}</span>
                    </div>` : ''}
                    <div style="display: flex; justify-content: space-between; padding: 12px 0; background: ${this.settings.color2}15; margin-top: 5px; border-radius: 6px; padding: 10px;">
                        <span style="font-weight: 900; color: ${this.settings.color2}; font-size: 14px;">SALDO PENDIENTE:</span>
                        <span style="font-weight: 900; color: ${this.settings.color2}; font-size: 14px;">${formatCOP(saldo)}</span>
                    </div>
                </div>
            </div>

            <!-- FOOTER / TERMINOS -->
            <div style="margin-top: auto; padding-top: 20px; border-top: 1px solid #e2e8f0; font-size: 9px; color: #64748b; line-height: 1.5;">
                <p style="margin: 0 0 5px 0; font-weight: bold; color: ${this.settings.color1}; text-transform: uppercase;">Términos y Condiciones</p>
                <p style="margin: 0; white-space: pre-wrap;">${this.settings.terms}</p>
                <p style="margin: 15px 0 0 0; text-align: center; font-weight: bold; opacity: 0.5;">Generado por Sistema de Reservas</p>
            </div>
        </div>
        `;
    },

    renderPreview() {
        const container = document.getElementById('pdf_preview_container');
        if (container) {
            // Apply scale based on container size vs A4 size roughly
            // A4 is roughly 794x1123 px at 96 DPI. Our container is 400x565.
            container.innerHTML = `<div style="width: 794px; height: 1123px; transform: scale(0.503); transform-origin: top left; background: white;">
                ${this.buildHTML()}
            </div>`;
        }
    },

    generatePDF() {
        const cliente = document.getElementById('doc_cliente').value || 'Documento';
        const isCotizacion = document.querySelector('input[name="doc_type"]:checked').value === 'cotizacion';
        const prefix = isCotizacion ? 'Cotizacion' : 'Recibo';
        const fileName = `${prefix}_${cliente.replace(/[^a-z0-9]/gi, '_')}.pdf`;

        const hiddenContainer = document.getElementById('pdf-template-container');
        hiddenContainer.innerHTML = this.buildHTML();
        hiddenContainer.style.display = 'block';

        const element = hiddenContainer.firstElementChild;
        
        UI.showToast("Generando PDF, por favor espera...", "info");

        // html2pdf options
        const opt = {
            margin:       0,
            filename:     fileName,
            image:        { type: 'jpeg', quality: 0.98 },
            html2canvas:  { scale: 2, useCORS: true },
            jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' }
        };

        html2pdf().set(opt).from(element).save().then(() => {
            hiddenContainer.style.display = 'none';
            hiddenContainer.innerHTML = '';
            UI.showToast("Documento generado con éxito", "success");
        }).catch(err => {
            console.error("Error generando PDF", err);
            UI.showToast("Hubo un error al generar el PDF", "error");
            hiddenContainer.style.display = 'none';
        });
    }
};
