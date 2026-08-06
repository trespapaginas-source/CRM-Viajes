# 📊 Reporte Maestro de Clientes y Ventas — CRM Vive Travel

> **Fecha de generación:** 22/7/2026, 2:05:16 p. m.
> **Origen de datos:** Base de Datos Supabase (Tabla `clientes` y `planes`)

---

## 📈 Resumen Ejecutivo y Estadísticas

| Métrica | Valor |
| :--- | :--- |
| **Total Registros en BD** | 2 |
| **Clientes Activos / Reservas** | 0 |
| **Registros en Papelera / Pruebas (`deleted_at`)** | 2 |
| **Monto Total Vendido (Activos)** | $0 |
| **Monto Total Recaudado / Abonos** | $0 |
| **Saldo Pendiente por Cobrar** | $0 |

### 🏙️ Distribución por Destino (Clientes Activos)

| Destino | N° de Viajeros |
| :--- | :--- |
| *Sin reservas activas registradas* | 0 |

### 📌 Distribución por Estado de Reserva

| Estado | N° de Clientes |
| :--- | :--- |
| *Sin estados registrados* | 0 |

---

## 📋 Tabla Maestra Consolidada de Clientes

*Esta tabla contiene la totalidad de los datos recaudados de cada viajero. Puedes seleccionarla y copiarla directamente a **Microsoft Excel** o **Google Sheets**.*

| ID Registro | Estado Reg. | Nombre | Apellido | Documento / DNI | Teléfono / Celular | Email | Ciudad Origen | Edad | EPS | Alergias | Requerimientos Especiales | Contacto Emergencia | Plan Comprado | Destino | Fecha de Viaje | Pasajeros (Pax) | Tipo Reserva | Canal / Etiqueta | Precio Total Plan | Abono Acumulado | Saldo Restante | Costo Base Operativo | Fecha Creación |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| c962e822-f90b-4968-bba4-8e166a0a04c4 | ⚠️ Eliminado (PRUEBA DE LINK) | Andres | Trespalacios | Pendiente | 3213123123 | N/A | Pendiente | N/A | Pendiente | Pendiente | N/A | Pendiente | La Guajira 🏜️ | La Guajira | Jueves 6 de Ago del 2026 al Domingo 9 de Ago del 2026 | 1 | Nacional | Venta WhatsApp | $1.550.000 | $0 | $1.550.000 | $1.150.000 | 11 de jul de 2026 |
| 670b15ac-a40e-4c07-8dd1-d34d1707132d | ⚠️ Eliminado (f) | Luis | Mendez | Pendiente | 570000000 | N/A | Pendiente | N/A | Pendiente | Pendiente | N/A | Pendiente | SAI  - Heillen Carvajal  | San Andrés  | Sábado 11 de Jul del 2026 al Lunes 13 de Jul del 2026 | 1 | Nacional | Venta WhatsApp | $1.300.000 | $0 | $1.300.000 | $1.090.000 | 26 de jun de 2026 |


---

## 🛠️ Instrucciones para Exportar a Excel

1. Selecciona todo el contenido de la **Tabla Maestra Consolidada** arriba.
2. Copia la selección (`Ctrl + C` o `Cmd + C`).
3. Abre una hoja en **Microsoft Excel** o **Google Sheets** y pega directamente (`Ctrl + V` o `Cmd + V`).
4. Las columnas y filas se alinearán automáticamente en las celdas correspondientes.

> **Nota de actualización:** Puedes volver a generar este reporte en cualquier momento ejecutando el comando:
> `node generar_reporte_clientes.js`
