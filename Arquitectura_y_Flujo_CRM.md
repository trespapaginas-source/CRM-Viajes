# Documentación del Ecosistema CRM - Arquitectura y Flujo Operativo

Este documento describe la funcionalidad, estructura y conexión entre los módulos clave del CRM de la agencia de viajes, garantizando una comprensión completa de la arquitectura y el ciclo de vida de las operaciones, reservas y finanzas.

---

## 1. Análisis de Módulos

### 1.1 Catálogo de Planes (`planes.module.js`)
Es el núcleo central donde nacen los productos. Gestiona la base de datos y la oferta comercial de los paquetes de viaje (tanto de destinos Locales como Internacionales).
- **Datos Capturados**: Nombre del plan, categoría (Local/Internacional), destino, fechas de salida programadas, tarifa o precio de venta por persona (pax), tarifa de depósito requerido para separar cupo, condiciones de pago, notas internas y textos promocionales.
- **Logística y Costos Operativos**: Permite vincular una lista de servicios y "Proveedores" (transporte, hoteles, tours). Esto es vital, ya que al asignar proveedores, el sistema construye un **Costo Operativo Base** que será utilizado posteriormente por el módulo de Rentabilidad para calcular gastos automáticos.

### 1.2 Reservas Locales (`clients.module.js`)
Es el directorio general de clientes, punto de venta y control de caja para las operaciones locales.
- **Datos Capturados**: Información del titular (nombre, apellidos, documento, teléfono, email, EPS, edad, contacto de emergencia, alergias, requerimientos médicos), el plan de viaje asociado, la fecha de viaje, cantidad de pasajeros (Pax) y selección de estado de la reserva.
- **Finanzas y Abonos**: Registra el estado de cuenta y las finanzas del cliente. Desde la creación captura el tipo de pago (contado o abono). Todo pago se registra con un monto, método (transferencia, efectivo, etc.) y genera un historial contable auditable (con candados de seguridad temporal). 
- **Herramientas de Seguimiento**: Soporta la inyección de "Etiquetas" organizativas y notificaciones visuales (Glowing Dots) para alertar sobre seguimientos comerciales o pagos pendientes.

### 1.3 Reservas Internacionales (`internacionales.module.js`)
Un módulo especializado para viajes al exterior. Está desacoplado de las reservas locales en la UI para manejar la complejidad de este tipo de ventas, pero se enlaza contablemente al mismo núcleo financiero.
- **Datos Capturados**: Además de los datos del titular (DNI, email, celular, ciudad, vendedor) e información del plan, se caracteriza por manejar una matriz detallada de **Pasajeros Internacionales**. 
- **Gestión por Pasajero**: Cada pasajero tiene su propio registro de pago inicial, concepto y la capacidad de cargar de inmediato **comprobantes de pago** (imágenes subidas directamente a Supabase Storage).
- **Consolidación Financiera**: El módulo calcula automáticamente el ingreso bruto sumando los pagos de la matriz de pasajeros, determina la utilidad bruta, calcula el saldo pendiente global y crea transacciones consolidadas ("Consolidación Pago Internacional") en el historial general de abonos, asegurando el cuadre global de ingresos de la agencia.

### 1.4 Rentabilidad (`rentabilidad.module.js`)
Es el cerebro analítico y financiero (Unit Economics) del CRM. Evalúa matemáticamente el desempeño de cada viaje, transformando las ventas en proyecciones y realidades netas.
- **Agrupación y Consolidación**: El sistema agrupa automáticamente todas las reservas (Locales e Internacionales) que comparten exactamente el mismo "Plan" y "Fecha de Viaje". 
- **Cálculo de Ingresos**: Suma el total de dinero real recaudado por los abonos de los pasajeros inscritos en esa salida.
- **Descuento de Costos Automáticos**: Multiplica el "Costo Base" (configurado en el Catálogo) únicamente por el número de pasajeros que *realmente* recibieron el servicio (excluyendo cancelaciones sin costo o dineros retenidos por inasistencia).
- **Gastos Adicionales**: Permite al administrador cargar gastos específicos de esa salida (Publicidad, Comisiones de vendedores, Imprevistos), ya sea como valor fijo o un porcentaje de los ingresos brutos, permitiendo subir el comprobante (foto/factura).
- **KPIs (Indicadores Clave)**: Entrega en tiempo real el **Margen Neto Proyectado** de la salida. Define si un viaje generó ganancia o pérdida neta.

### 1.5 Aliados / Bóveda de Socios (`partners.module.js`)
Es el módulo ejecutivo y de reporte final, encargado de la distribución automática de utilidades, de uso exclusivo para Administradores y Socios.
- **Lectura de Márgenes**: Se alimenta automáticamente de los cálculos de ganancias netas (Margen Neto) generados en el módulo de Rentabilidad de los tours que ya han sido realizados.
- **Distribución de Dividendos (Split)**: Basado en una matriz de porcentajes de participación (ej. Socio A: 50%, Socio B: 32%, Admin: 18%), el sistema reparte automáticamente el dinero sobre un rango de fechas determinado (ej. Mes actual, últimos 3 meses).
- **Transparencia vs. Confidencialidad**: Los administradores ven la estructura completa de ingresos, costos y ganancias de la agencia. Un socio comercial ve de forma aislada cuántos tours se operaron y cuál es exactamente su porción de ganancia en dinero, sin exponer la matriz completa de la empresa.

---

## 3. Flujo de Creación y Entrelazamiento (Ciclo de Vida)

El ecosistema CRM está profundamente conectado. Una simple venta detona cálculos en todo el sistema. 

### Fase 1: Creación y Parametrización (El Origen)
Todo nace en el **Catálogo**. El administrador crea el "Plan Caribe", define su valor de venta y vincula los proveedores que le dan soporte, obteniendo un costo operativo por persona. Abre las fechas de salidas disponibles.

### Fase 2: Registro de la Venta (Captura de Data)
Dependiendo de la categoría del viaje, el asesor utiliza un módulo distinto:

**A. Venta Local:**
1. En **Reservas Locales**, selecciona el "Plan Caribe" y una fecha específica.
2. Ingresa los datos del cliente titular y el total de pasajeros.
3. El sistema calcula el total de la deuda.
4. El cliente realiza un abono. El sistema asienta el abono con su método de pago y calcula la nueva deuda. 
5. Se asigna un estado inicial, por lo general **Pendiente de Pago**.

**B. Venta Internacional:**
1. En **Reservas Internacionales**, selecciona el plan y la fecha.
2. Carga la información de los diversos pasajeros individualmente, el monto pagado por cada uno y sube las fotos de los recibos de consignación.
3. El sistema unifica la matemática: inyecta estos pagos dispersos como un "Abono Consolidado" al libro mayor y calcula la utilidad de la reserva.

### Fase 3: Transición de Estados
A lo largo de los días, la reserva muta automáticamente o por acción del equipo según estos estados:
- **Pendiente de Pago**: La reserva está activa, en el futuro, pero el porcentaje de pago es inferior al 100%.
- **Confirmado**: Los abonos del cliente han completado la totalidad de la deuda pactada.
- **Realizado**: La fecha de viaje ya sucedió y el cliente disfrutó del servicio.
- **En Caja**: Una lógica financiera crucial. La fecha del viaje pasó, el cliente nunca completó el pago ni asistió, y no se le prestó servicio. El sistema toma lo que el cliente abonó y lo transforma automáticamente en **Ingreso Retenido** (ganancia para la agencia sin costo operativo).
- **Devolución / Cancelado**: El cliente se retiró de la reserva. Si hay penalidad, la agencia retiene un monto. Si hay devolución total, el sistema recalcula la rentabilidad eliminando los pasajeros del cálculo de costos operativos del bus/tour.
- **Reprogramado**: El cliente trasladó sus abonos a otra fecha u otro plan.

### Fase 4: Ejecución y Cierre Financiero
1. Llega el día del viaje. El administrador abre **Rentabilidad**.
2. El sistema cruza y consolida todos los clientes "Confirmados" y "Pendientes" que viajan ese día, suma el dinero de sus abonos y resta la matriz de costos de proveedores, calculando el cupo del vehículo.
3. El administrador registra pagos a coordinadores, publicidad gastada o viáticos, y sube los recibos (soportes).
4. El sistema cierra matemáticamente el tour dictaminando su Margen Neto.

### Fase 5: Distribución Final (Payday)
1. Al final del periodo contable, los líderes ingresan al módulo **Aliados**.
2. Seleccionan un filtro de fechas.
3. El sistema lee todos los viajes que llegaron a la Fase 4, extrae el Margen Neto final de cada uno, y deposita visualmente la comisión o utilidad correspondiente al porcentaje accionario o comisional de cada miembro del equipo. Ni un solo número fue calculado a mano.
