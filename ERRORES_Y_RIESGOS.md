# ERRORES Y RIESGOS — Registro Clínico del CRM Vive Travel

> **Fecha de auditoría:** Junio 2026
> **Auditor:** Análisis automatizado sobre el código fuente completo
> **Nota:** Este documento NO suaviza ni disculpa el código. Registra cada hallazgo tal cual es.

---

## RESUMEN EJECUTIVO

| Severidad | Cantidad |
|-----------|----------|
| 🔴 Crítico | 8 |
| 🟠 Alto | 10 |
| 🟡 Medio | 9 |
| 🔵 Bajo | 5 |
| **TOTAL** | **32** |

---

## HALLAZGOS CRÍTICOS (Severidad: Crítico)

---

**ID:** ERR-001
**Módulo:** Seguridad / Servidor
**Archivo:** `server.js`, línea 22
**Severidad:** 🔴 Crítico
**Tipo:** Problema de seguridad
**Escenario:** Cualquier persona con acceso al repositorio de GitHub (público o compartido) puede ver el API Key de Resend.
**Qué pasa:** La clave de API de Resend (`re_ami8ZT68_3Ug7UbRWfz1eL6ouMkXDc8mD`) está escrita directamente en el código fuente, en texto plano, sin ningún tipo de ofuscación ni variable de entorno.
**Por qué pasa:** No se usó un archivo `.env` ni ningún sistema de gestión de secretos. El desarrollador colocó la clave directamente como constante.
**Impacto:** Un atacante puede usar esa clave para enviar correos electrónicos en nombre de la agencia, hacer phishing a los clientes, agotar la cuota de la cuenta de Resend, o suplantar la identidad del CRM. Si el repositorio se hace público, la clave queda expuesta al mundo entero.

---

**ID:** ERR-002
**Módulo:** Seguridad / Supabase
**Archivo:** `js/services/supabase.service.js`, línea 11–12 y `registro.html`, línea 242
**Severidad:** 🔴 Crítico
**Tipo:** Problema de seguridad
**Escenario:** Abrir las DevTools del navegador en la página de login y buscar la URL y la clave anon de Supabase.
**Qué pasa:** La URL del proyecto Supabase (`https://qefuqkplornelbzwqgri.supabase.co`) y la clave anon están embebidas directamente en el JavaScript del frontend. Además, se duplican en `registro.html` (otra copia independiente).
**Por qué pasa:** Es la forma estándar de usar Supabase en frontend, PERO no hay Row Level Security (RLS) verificada para todas las tablas. Sin RLS estricta, la clave anon otorga acceso completo de lectura/escritura.
**Impacto:** Cualquier usuario con la clave anon puede hacer consultas directas a la API de Supabase desde Postman o cualquier cliente HTTP, saltándose toda la lógica de negocio del frontend: leer datos de otros usuarios, modificar abonos, eliminar registros, o crear reservas falsas. La seguridad depende enteramente de que RLS esté correctamente configurada en Supabase, lo cual no se puede verificar desde el código fuente.

---

**ID:** ERR-003
**Módulo:** Data Service / Carga de Datos
**Archivo:** `js/services/supabase.service.js`, líneas 63–68
**Severidad:** 🔴 Crítico
**Tipo:** Contradicción de lógica / Inconsistencia de datos
**Escenario:** Un cliente con estado "cancelado o devolución" se carga desde la base de datos.
**Qué pasa:** El código fuerza un cambio de estado silencioso:
```javascript
if (c.estado && (c.estado.toLowerCase() === 'cancelado o devolución' || c.estado.toLowerCase() === 'cancelados')) {
    c.estado = 'en caja';
}
```
Cada vez que `loadAll()` se ejecuta (que es después de CADA operación CRUD), todos los clientes con estado "cancelado" son convertidos forzosamente a "en caja" en memoria.
**Por qué pasa:** Parece un parche temporal que se olvidó remover. La intención era migrar estados antiguos, pero el código se ejecuta en cada carga de datos.
**Impacto:** 
- Es imposible tener un cliente cancelado en el sistema. Toda cancelación se convierte en "en caja".
- El estado en la base de datos dice "cancelado" pero el frontend muestra "en caja". Contradicción directa entre BD y UI.
- Si el `autoClassifyReservas()` luego reclasifica ese cliente (porque la fecha pasó y tiene 100% de pago), se genera un UPDATE a Supabase con un estado que jamás fue real.
- Cascada: `autoClassifyReservas` puede escribir "Realizadas" en la BD sobre un cliente que originalmente estaba cancelado.

---

**ID:** ERR-004
**Módulo:** Data Service / Clasificación Automática
**Archivo:** `js/services/supabase.service.js`, líneas 153–213
**Severidad:** 🔴 Crítico
**Tipo:** Comportamiento inesperado / Flujo roto entre módulos
**Escenario:** La agencia marca a un cliente como "en caja" manualmente (porque debe dinero tras el viaje). Al recargar la página, el sistema puede reclasificarlo automáticamente como "Realizadas" si la fecha de viaje ya pasó y los abonos suman 100%.
**Qué pasa:** `autoClassifyReservas()` sobrescribe estados que fueron asignados manualmente por el equipo operativo. Los únicos estados "protegidos" son: `devolución`, `cancelado o devolución`, `cancelados`, `reprogramado`, `desistió`. El estado "en caja" NO está protegido.
**Por qué pasa:** La función no distingue entre un estado asignado manualmente y uno asignado automáticamente. No hay campo `estado_manual: true` ni nada similar.
**Impacto:**
- Un cliente que debe dinero pero cuyo viaje ya pasó y tiene 100% del precio abonado será marcado como "Realizadas" automáticamente, aunque el equipo lo haya puesto en "en caja" por razones operativas.
- El UPDATE a la BD se hace con `.then()` sin `await`, por lo que si falla, el error se pierde silenciosamente (fire-and-forget).
- Línea 205: `supabaseClient.from('clientes').update({ estado: targetState }).eq('id', c.id).then();` — No hay manejo de errores.

---

**ID:** ERR-005
**Módulo:** Data Service / Carga Masiva
**Archivo:** `js/services/supabase.service.js`, líneas 47–59
**Severidad:** 🔴 Crítico
**Tipo:** Flujo roto entre módulos / Inconsistencia de datos
**Escenario:** La agencia crece y supera los 2000 clientes activos (sin soft-delete).
**Qué pasa:** Cada tabla tiene un `.limit()` hardcodeado: clientes (2000), abonos (5000), gastos (3000), etc. Cuando los datos superan ese límite, los registros más antiguos simplemente desaparecen del frontend sin advertencia alguna.
**Por qué pasa:** Se implementó paginación con limits fijos como medida de performance, pero no se implementó ningún mecanismo de paginación incremental ni advertencia al usuario.
**Impacto:**
- El dashboard financiero mostrará cifras incorrectas porque no incluye TODOS los abonos.
- La distribución de socios calculará ganancias incorrectas.
- Los clientes más antiguos desaparecerán de las tablas de búsqueda.
- El CSV exportado contendrá datos incompletos sin que el usuario lo sepa.
- **No hay ningún indicador visual** de que faltan datos.

---

**ID:** ERR-006
**Módulo:** Servidor / Path Traversal
**Archivo:** `server.js`, líneas 192–221
**Severidad:** 🔴 Crítico
**Tipo:** Problema de seguridad
**Escenario:** Enviar una petición HTTP con un path como `GET /../../etc/passwd` o `GET /../../.env`.
**Qué pasa:** El servidor estático construye la ruta del archivo así:
```javascript
let filePath = path.join(__dirname, decodeURIComponent(req.url));
```
`decodeURIComponent` puede decodificar `%2e%2e%2f` a `../`, y `path.join` con `..` permite salir del directorio del proyecto.
**Por qué pasa:** No hay validación de que la ruta resultante esté dentro del directorio del proyecto. No se usa `path.resolve()` con verificación de prefijo.
**Impacto:** Un atacante puede leer cualquier archivo del sistema operativo al que el proceso de Node tenga acceso: archivos de configuración, claves SSH, variables de entorno de otros proyectos, etc.

---

**ID:** ERR-007
**Módulo:** Autenticación / Control de Acceso
**Archivo:** `js/modules/auth.module.js`, línea 128
**Severidad:** 🔴 Crítico
**Tipo:** Problema de seguridad
**Escenario:** Un usuario no-administrador abre DevTools, encuentra el `<style id="security-styles">` y lo elimina del DOM.
**Qué pasa:** La protección de botones de eliminación se basa en inyectar CSS con `display: none`:
```javascript
styleEl.innerHTML = `/* .btn-delete-protected { display: none !important; } (Desactivado para permitir Soft Delete) */`;
```
Pero además, el código está **comentado dentro del string CSS**. Literalmente la regla CSS está envuelta en un comentario `/* ... */`, así que **no hace absolutamente nada**.
**Por qué pasa:** Alguien comentó la regla CSS dentro del string de JavaScript pensando que desactivaría la ocultación, pero dejó toda la estructura del condicional intacta, dando la ilusión de seguridad.
**Impacto:** TODOS los botones de eliminación son visibles para TODOS los usuarios, independientemente del rol. La propiedad `puede_eliminar: false` es decorativa. El único freno real es la validación server-side de Supabase (RLS), que no está garantizada.

---

**ID:** ERR-008
**Módulo:** Autenticación / Escalación de Privilegios
**Archivo:** `js/modules/auth.module.js`, líneas 66–71
**Severidad:** 🔴 Crítico
**Tipo:** Problema de seguridad
**Escenario:** En un sistema con exactamente un usuario registrado, ese usuario tiene un rol diferente a "administrador" (por una modificación directa en BD).
**Qué pasa:**
```javascript
if (count === 1 && perfil.rol !== 'administrador') {
    await supabaseClient.from('perfiles_usuarios').update({ rol: 'administrador', ... }).eq('user_id', user.id);
}
```
Si hay exactamente 1 perfil en la tabla `perfiles_usuarios`, automáticamente se le da rol de administrador. Pero el `count` se obtiene con la clave anon del frontend.
**Por qué pasa:** Es un mecanismo de auto-promoción para el primer usuario. Pero si un atacante logra eliminar todos los perfiles menos uno (posible si RLS no está bien configurada), se auto-promueve a administrador.
**Impacto:** Posible escalación de privilegios si un atacante manipula la tabla `perfiles_usuarios` directamente vía API de Supabase.

---

## HALLAZGOS DE SEVERIDAD ALTA

---

**ID:** ERR-009
**Módulo:** Bóveda de Socios
**Archivo:** `src/components/partners/partners.component.js`, líneas 46–65
**Severidad:** 🟠 Alto
**Tipo:** Problema de seguridad / Hardcoding
**Escenario:** Cambiar el administrador principal de la empresa.
**Qué pasa:** Los datos de los tres socios están hardcodeados como fallback:
```javascript
const defaultSocios = [
    { email: 'trespa.paginas@gmail.com', nombre: 'Leo (Admin)', porcentaje: 18 },
    { email: 'luismendezramirez@hotmail.es', nombre: 'Luis Méndez', porcentaje: 50 },
    { email: 'vivemarketingdigital@outlook.com', nombre: 'Jean Fontalvo', porcentaje: 32 }
];
```
Además, `patchSocios()` fuerza los correos electrónicos de vuelta a valores hardcodeados basándose en el nombre o el porcentaje, lo que hace imposible actualizar los correos de los socios de forma permanente.
**Por qué pasa:** Parche sobre parche para corregir datos incorrectos en producción, sin refactorizar la fuente de verdad.
**Impacto:** 
- Las distribuciones financieras van atadas a correos electrónicos literales.
- Si un socio cambia de email, hay que modificar el código fuente y redesplegar.
- Los porcentajes de distribución de ganancias están escritos en el frontend donde cualquier usuario puede verlos.

---

**ID:** ERR-010
**Módulo:** Bóveda de Socios / Acceso
**Archivo:** `src/components/partners/partners.component.js`, línea 115 y `js/modules/auth.module.js`, línea 137
**Severidad:** 🟠 Alto
**Tipo:** Problema de seguridad
**Escenario:** Se necesita que un nuevo administrador acceda a las funciones avanzadas del sistema.
**Qué pasa:** Múltiples verificaciones de acceso usan comparación directa de email:
```javascript
if (currentUserEmail === 'trespa.paginas@gmail.com') { ... }
```
Esto aparece en al menos **11 archivos diferentes** del sistema: `auth.module.js`, `app.navigator.js`, `partners.component.js`, `trazabilidad.component.js`, `auditoria.component.js`, y archivos SQL.
**Por qué pasa:** Se usó el correo como identidad hard-coded en lugar de usar el rol del sistema de perfiles.
**Impacto:** Si el correo del administrador principal cambia, hay que editar manualmente 11+ archivos. No existe un mecanismo centralizado de "super-admin". Un atacante que comprometa esa cuenta de Gmail tiene acceso total e irrevocable.

---

**ID:** ERR-011
**Módulo:** Servidor de Correos
**Archivo:** `server.js`, línea 118
**Severidad:** 🟠 Alto
**Tipo:** Hardcoding / Flujo roto
**Escenario:** Se quiere agregar un nuevo destinatario a las alertas de email.
**Qué pasa:** Los destinatarios de los correos de alerta están hardcodeados:
```javascript
to: ['vivemarketingdigital@gmail.com', 'trespa.paginas@gmail.com', 'luismendezramirez@hotmail.es'],
```
**Por qué pasa:** No se implementó una tabla de configuración de destinatarios ni una pantalla administrativa para gestionarlos.
**Impacto:** Cualquier cambio en la lista de destinatarios requiere editar el código fuente y reiniciar el servidor. Si la cuenta de sandbox de Resend sigue en modo testing, los correos solo llegan a `trespa.paginas@gmail.com` de todas formas (líneas 126–146).

---

**ID:** ERR-012
**Módulo:** Clientes / Guardado de Reservas
**Archivo:** `src/components/clients/clients.component.js`, líneas 900–1192
**Severidad:** 🟠 Alto
**Tipo:** Error de ejecución / Comportamiento inesperado
**Escenario:** Crear un grupo de 4 personas con precio total de $1.000.003 COP.
**Qué pasa:** El precio se divide con `Math.floor`:
```javascript
const splitPrice = Math.floor(pTot / paxVal); // = 250000
```
$250.000 × 4 = $1.000.000. Se perdieron $3 COP. Sobre miles de reservas, los centavos perdidos se acumulan.
**Por qué pasa:** No se implementó distribución con resto (ej: 3 personas pagan 250.000 y 1 paga 250.003).
**Impacto:** Descuadre financiero acumulativo. Los totales de venta no cuadran con la suma de los precios individuales. En la contabilidad de la Bóveda de Socios, estas diferencias se multiplican por el número de grupos.

---

**ID:** ERR-013
**Módulo:** Clientes / Acompañantes
**Archivo:** `src/components/clients/clients.component.js`, líneas 1100–1133
**Severidad:** 🟠 Alto
**Tipo:** Flujo roto entre módulos
**Escenario:** Crear un grupo de 5 personas (titular + 4 acompañantes) y observar la secuencia de operaciones.
**Qué pasa:** Cada acompañante se guarda con `await DataService.saveCliente(compObj)`, que internamente llama a `await this.loadAll()`. Si son 4 acompañantes, se ejecutan **5 llamadas completas a loadAll()** (1 del titular + 4 de acompañantes).
**Por qué pasa:** `saveCliente` siempre ejecuta `loadAll` al final, y no hay opción de guardado en lote (batch).
**Impacto:**
- Carga innecesaria de TODAS las tablas 5 veces durante un solo guardado.
- Con los limits actuales (2000 clientes, 5000 abonos, etc.), cada `loadAll` descarga ~10,000 registros. Multiplicado por 5: **~50,000 registros descargados** para guardar una sola reserva grupal.
- En conexiones lentas, el guardado puede tardar 20+ segundos.
- Riesgo de race condition: mientras se descarga `loadAll` del acompañante #2, los datos del acompañante #1 ya están en la BD pero quizás aún no en la caché local.

---

**ID:** ERR-014
**Módulo:** Data Service / Abonos
**Archivo:** `js/services/supabase.service.js`, líneas 71–72
**Severidad:** 🟠 Alto
**Tipo:** Inconsistencia de datos
**Escenario:** La tabla `abonos` tiene más de 5000 registros.
**Qué pasa:** Los abonos se descargan con `ORDER BY created_at DESC LIMIT 5000`, y luego se invierten con `.reverse()` para restaurar el orden ascendente.
**Por qué pasa:** Se quería obtener los 5000 más recientes, pero mantener el orden cronológico en la UI.
**Impacto:**
- Los abonos más antiguos desaparecen silenciosamente.
- El cálculo de saldos de clientes antiguos será incorrecto (faltarán abonos).
- El `reverse()` crea un nuevo array de 5000 elementos en cada carga, consumiendo memoria innecesaria.
- Si un cliente tiene abonos antiguos (antes del corte de los 5000), su saldo aparecerá como si nunca hubiera pagado.

---

**ID:** ERR-015
**Módulo:** Clientes / Transferencia de Saldos
**Archivo:** `js/services/supabase.service.js`, líneas 759–816
**Severidad:** 🟠 Alto
**Tipo:** Inconsistencia de datos / Riesgo financiero
**Escenario:** Transferir $100.000 de un cliente a 3 destinatarios.
**Qué pasa:** El monto se divide con `Math.floor`:
```javascript
const splitAmount = Math.floor(monto / destinosIds.length); // 33333 cada uno
```
Salida: -$100.000. Entrada: $33.333 × 3 = $99.999. Se esfumó $1 COP.
Además, el abono negativo se inserta directamente sin validar que el cliente origen tenga saldo suficiente.
**Por qué pasa:** Misma razón que ERR-012: no hay distribución con resto. Y no hay validación de saldo negativo.
**Impacto:**
- Un usuario puede transferir más dinero del que tiene, creando saldos negativos artificiales.
- Descuadre financiero: el dinero que "sale" no es igual al que "entra".

---

**ID:** ERR-016
**Módulo:** Clientes / Detalle
**Archivo:** `src/components/clients/clients.component.js`, línea 1550
**Severidad:** 🟠 Alto
**Tipo:** Problema de seguridad (XSS)
**Escenario:** Crear un cliente con nombre que contenga comillas simples: `O'Brien`.
**Qué pasa:**
```javascript
document.getElementById('btn-delete-client-modal').setAttribute('onclick', 
    `promptGlobalDelete('${id}', 'cliente', '${c.nombre.replace(/'/g, "\\'")} ${c.apellido.replace(/'/g, "\\'")}')`);
```
Solo escapa comillas simples. Si el nombre contiene `');alert(1);//`, se ejecuta JavaScript arbitrario.
**Por qué pasa:** Se usa concatenación de strings para generar atributos `onclick` en lugar de `addEventListener` con closures.
**Impacto:** Posibilidad de XSS almacenado. Un atacante puede inyectar código JavaScript que se ejecute cuando cualquier usuario haga clic en "eliminar" ese cliente.

---

**ID:** ERR-017
**Módulo:** Clientes / Abono Rápido (Quick Abono)
**Archivo:** `src/components/clients/clients.component.js`, líneas 851–897
**Severidad:** 🟠 Alto
**Tipo:** Flujo roto / Riesgo financiero
**Escenario:** Registrar un abono rápido desde el panel de detalle del cliente.
**Qué pasa:** El abono rápido fuerza `estado_pago: 'confirmed'` sin dar opción al usuario:
```javascript
await DataService.saveAbono({
    ...
    estado_pago: 'confirmed',
    ...
});
```
**Por qué pasa:** Decisión de UX: simplificar el flujo. Pero sacrifica la integridad financiera.
**Impacto:** Si un pago transferencia aún no ha sido verificado por el banco, queda registrado como "confirmado" en el sistema. No hay flujo de verificación posterior. El dashboard mostrará ingresos que quizás nunca se materializaron.

---

**ID:** ERR-018
**Módulo:** Clientes / Fusión de Grupos (Merge)
**Archivo:** `js/services/supabase.service.js`, líneas 817–922
**Severidad:** 🟠 Alto
**Tipo:** Inconsistencia de datos
**Escenario:** Fusionar dos titulares que tienen acompañantes, donde un acompañante tiene un precio_total diferente.
**Qué pasa:** Al fusionar, el `precio_total` del acompañante se sobreescribe con el del titular nuevo:
```javascript
precio_total: titular.precio_total
```
Si el acompañante ya tenía abonos basados en su precio original, la cuenta no cuadra.
**Por qué pasa:** La función asume que todos los integrantes del grupo tienen el mismo precio, pero no recalcula los saldos financieros tras el cambio de precio.
**Impacto:** Después de una fusión, los porcentajes de pago pueden aparecer como >100% o como negativos, dependiendo de la diferencia de precios. La contabilidad del grupo queda irreconciliable sin intervención manual.

---

## HALLAZGOS DE SEVERIDAD MEDIA

---

**ID:** ERR-019
**Módulo:** Data Service / Ciudades
**Archivo:** `js/services/supabase.service.js`, líneas 216–250
**Severidad:** 🟡 Medio
**Tipo:** Flujo roto / Dependencia externa frágil
**Escenario:** Primera carga del sistema cuando la tabla `ciudades` está vacía.
**Qué pasa:** El sistema consulta una API externa del gobierno colombiano (`datos.gov.co`) para descargar 1200 municipios, y luego los inserta masivamente en Supabase en lotes de 300.
**Por qué pasa:** Se implementó como una "semilla automática" para la base de datos.
**Impacto:**
- Si la API de datos.gov.co cambia su schema, se rompe sin aviso.
- Si la API no responde (timeout, mantenimiento), el campo de ciudades queda vacío permanentemente hasta recargar.
- Los inserts masivos (4 lotes de 300) pueden fallar parcialmente, dejando datos incompletos.
- No hay deduplicación: si falla a mitad de camino y se reintenta, se insertan duplicados.

---

**ID:** ERR-020
**Módulo:** Clientes / Congelamiento de Abonos (48h)
**Archivo:** `src/components/clients/clients.component.js`, líneas 667–681
**Severidad:** 🟡 Medio
**Tipo:** Problema de seguridad / Comportamiento inesperado
**Escenario:** Un usuario con rol "vendedor" intenta editar un abono de hace 3 días.
**Qué pasa:** La validación de 48 horas se ejecuta en el frontend:
```javascript
const hoursSinceCreated = (new Date() - new Date(mov.created_at)) / (1000 * 60 * 60);
const isFrozen = !IS_ADMIN && hoursSinceCreated > 48;
```
Pero no hay validación equivalente en el backend (Supabase RLS o trigger).
**Por qué pasa:** Toda la lógica de seguridad financiera está en el frontend.
**Impacto:** Un usuario técnico puede abrir DevTools, ejecutar `supabaseClient.from('abonos').update({monto: 999999}).eq('id', 'xxx')` y modificar cualquier abono sin restricción temporal. El "congelamiento de 48h" es pura ilusión visual.

---

**ID:** ERR-021
**Módulo:** Data Service / Historial
**Archivo:** `js/services/supabase.service.js`, líneas 294–316
**Severidad:** 🟡 Medio
**Tipo:** Error de ejecución silencioso
**Escenario:** La tabla `historial_reservas` no existe todavía en Supabase.
**Qué pasa:** Si la tabla no existe (error 42P01), el código solo imprime un `console.warn` y continúa. No lanza excepción, no notifica al usuario.
**Por qué pasa:** Se implementó como una feature opcional que depende de que el administrador cree manualmente la tabla SQL.
**Impacto:** Toda la auditoría de cambios se pierde silenciosamente si la tabla no fue creada. No hay aviso al administrador de que el historial no se está registrando. Peor aún: el sistema "funciona normalmente" dando la falsa impresión de que todo queda registrado.

---

**ID:** ERR-022
**Módulo:** Clientes / Cálculo Financiero
**Archivo:** `src/components/clients/clients.component.js`, líneas 593–626
**Severidad:** 🟡 Medio
**Tipo:** Comportamiento inesperado
**Escenario:** Editar un cliente existente con acompañantes y verificar el cálculo de totales.
**Qué pasa:** En `calculateTotals()`, para clientes existentes:
```javascript
tA = DataService.abonos.filter(a => a.cliente_id === document.getElementById('cf-id').value && ...).reduce(...);
```
Solo cuenta abonos del titular, NO del grupo completo. Pero el precio mostrado (`cf-precio-total`) sí es el consolidado del grupo.
**Por qué pasa:** La función no distingue si el cliente es titular de grupo o individual al calcular los abonos.
**Impacto:** En el formulario de edición, el porcentaje de pago mostrado es incorrecto para titulares de grupo. Puede mostrar 30% cuando en realidad el grupo ha pagado 90%. Esto puede llevar al equipo a cobrar de más o a cambiar estados incorrectamente.

---

**ID:** ERR-023
**Módulo:** Clientes / Estado Automático
**Archivo:** `src/components/clients/clients.component.js`, líneas 618–622
**Severidad:** 🟡 Medio
**Tipo:** Comportamiento inesperado
**Escenario:** Mientras el usuario está editando manualmente el estado de un cliente, la función `calculateTotals()` se dispara por un cambio en el precio o el abono.
**Qué pasa:** La función cambia el estado automáticamente si el porcentaje de pago supera 100%:
```javascript
if (fin.porcentaje >= 100) est.value = 'confirmado';
else est.value = 'pendiente de pago';
```
Esto ocurre a menos que el estado sea uno de los "protegidos": `en caja`, `devolución`, `reprogramado`, `realizadas`, `desistió`.
**Por qué pasa:** Se quiso automatizar la clasificación, pero interfiere con ediciones manuales del usuario.
**Impacto:** Si un usuario cambia el estado a un valor custom y luego edita el precio, su selección de estado se pierde sin aviso.

---

**ID:** ERR-024
**Módulo:** Store / Reactividad
**Archivo:** `src/core/store.js` (referencia indirecta)
**Severidad:** 🟡 Medio
**Tipo:** Flujo roto entre módulos
**Escenario:** Varios módulos se suscriben al Store y todos disparan re-renders cuando `loadAll()` cambia el estado.
**Qué pasa:** Cada suscriptor del Store se ejecuta cuando `setState` es llamado. Si hay 10 suscriptores y `loadAll()` hace un `setState`, se ejecutan 10 callbacks, cada uno potencialmente recalculando toda su tabla/vista.
**Por qué pasa:** No hay mecanismo de batching ni debounce en las suscripciones del Store. Es una implementación naive de pub/sub.
**Impacto:** Después de cada operación CRUD, TODA la UI del CRM se recalcula y re-renderiza. En un sistema con 2000 clientes y 5000 abonos, esto puede causar freezes de varios segundos.

---

**ID:** ERR-025
**Módulo:** Bóveda de Socios / Configuración
**Archivo:** `src/components/partners/partners.component.js`, línea 67
**Severidad:** 🟡 Medio
**Tipo:** Inconsistencia de datos
**Escenario:** Un usuario edita la configuración de socios y la guarda. Otro usuario abre el CRM en otra pestaña.
**Qué pasa:** La configuración de socios se guarda en `localStorage`:
```javascript
const saved = localStorage.getItem('trv_socios');
```
**Por qué pasa:** Se usa localStorage como caché local además de la tabla `socios_config` de Supabase.
**Impacto:** 
- localStorage es por navegador y por dominio. Cada navegador/dispositivo puede tener una versión diferente de la configuración de socios.
- Si el localStorage tiene datos, se ignora la BD (línea 70): `if (parsed.length > 0 && ...)`, lo que significa que los cambios hechos por otro usuario en otro navegador nunca se reflejan.
- Las distribuciones financieras pueden diferir entre navegadores.

---

**ID:** ERR-026
**Módulo:** Clientes / Export CSV
**Archivo:** `src/components/clients/clients.component.js`, líneas 1672–1740
**Severidad:** 🟡 Medio
**Tipo:** Inconsistencia de datos
**Escenario:** Exportar reservas a CSV desde la pestaña de "activas" y luego desde "en caja".
**Qué pasa:** La exportación toma los datos de las filas VISIBLES del DOM, no directamente de la fuente de datos. Si un usuario filtró por búsqueda de texto, solo se exportan las filas visibles después del filtro.
**Por qué pasa:** Se lee del DOM (`querySelectorAll('.client-row')`) en lugar de leer de `DataService.clientes`.
**Impacto:**
- Si la barra de búsqueda tiene texto, la exportación es parcial sin advertencia.
- Para clientes con grupo, los cálculos financieros del CSV son individuales (no consolidados), lo que contradice lo que muestra la tabla.
- Los campos exportados son limitados (6 columnas) y no incluyen email, documento, ni estado.

---

**ID:** ERR-027
**Módulo:** Data Service / Abonos Duplicados
**Archivo:** `js/services/supabase.service.js`, líneas 500–520
**Severidad:** 🟡 Medio
**Tipo:** Validación faltante
**Escenario:** Un usuario registra un abono de $100.000 por "Transferencia". Espera 2 minutos y 1 segundo. Registra exactamente el mismo abono.
**Qué pasa:** La protección anti-duplicados compara: mismo `cliente_id`, mismo `monto`, mismo `metodo`, y diferencia temporal < 2 minutos. Si pasan 2 minutos y 1 segundo, el duplicado pasa sin problemas.
**Por qué pasa:** La ventana temporal es muy corta. 2 minutos es insuficiente para detectar errores humanos reales.
**Impacto:** Duplicados frecuentes si el usuario hace doble envío con delay de red, o si cierra y reabre el formulario rápidamente. El sistema solo detecta duplicados consecutivos inmediatos.

---

## HALLAZGOS DE SEVERIDAD BAJA

---

**ID:** ERR-028
**Módulo:** Clientes / Formulario
**Archivo:** `src/components/clients/clients.component.js`, línea 320
**Severidad:** 🔵 Bajo
**Tipo:** Problema de seguridad (menor)
**Escenario:** Renderizar la tabla de clientes.
**Qué pasa:** Los checkboxes generan atributos `onclick` con `window.DispatchModule`:
```html
<input type="checkbox" ... onchange="window.DispatchModule.toggleClientSelection('${cli.id}')">
```
Esto usa el patrón de inline handlers que el resto del código intenta evitar.
**Por qué pasa:** Migración incompleta de inline handlers a `addEventListener`.
**Impacto:** Inconsistencia de patrones. Bajo riesgo de mantenimiento.

---

**ID:** ERR-029
**Módulo:** Clientes / Detalle Modal
**Archivo:** `src/components/clients/clients.component.js`, líneas 1279–1284
**Severidad:** 🔵 Bajo
**Tipo:** Error de ejecución potencial
**Escenario:** Un cliente es acompañante de un titular que fue eliminado (soft-delete).
**Qué pasa:** El botón "Ir al Titular" usa:
```javascript
onclick="ClientsComponent.closeDetailModal(); setTimeout(() => ClientsComponent.openDetailModal('${titular.id}'), 300)"
```
Si el titular fue eliminado, `openDetailModal` buscará `DataService.clientes.find(x => x.id === id)` y no lo encontrará (porque loadAll filtra `deleted_at`), resultando en un `return` silencioso.
**Por qué pasa:** No se valida si el titular aún existe antes de renderizar el botón.
**Impacto:** El usuario hace clic en "Ir al Titular" y no pasa nada. Sin error visible, sin explicación.

---

**ID:** ERR-030
**Módulo:** Servidor / Comando de apertura de navegador
**Archivo:** `server.js`, línea 234
**Severidad:** 🔵 Bajo
**Tipo:** Comportamiento inesperado
**Escenario:** Iniciar el servidor en Linux o macOS.
**Qué pasa:** El comando para abrir el navegador es:
```javascript
exec(`start ${url}`);
```
`start` es un comando exclusivo de Windows.
**Por qué pasa:** El servidor fue desarrollado exclusivamente para Windows.
**Impacto:** En macOS (`open`) o Linux (`xdg-open`), el servidor arranca pero no abre el navegador. Error leve, no afecta la funcionalidad.

---

**ID:** ERR-031
**Módulo:** Autenticación / Password Recovery
**Archivo:** `js/modules/auth.module.js`, línea 204
**Severidad:** 🔵 Bajo
**Tipo:** UX deficiente
**Escenario:** El usuario hace clic en "Olvidé mi contraseña".
**Qué pasa:** Se usa `prompt()` nativo del navegador:
```javascript
const email = prompt("Suministra tu correo electrónico de acceso:");
```
**Por qué pasa:** Implementación rápida sin diseño de UI dedicado.
**Impacto:** Experiencia de usuario pobre. El `prompt()` nativo no tiene validación de email, no tiene estilizado, y puede ser bloqueado por algunos navegadores.

---

**ID:** ERR-032
**Módulo:** Data Service / recalculateClientBalances
**Archivo:** `js/services/supabase.service.js`, líneas 394–397
**Severidad:** 🔵 Bajo
**Tipo:** Código muerto / Engañoso
**Escenario:** Cualquier operación que llame a `recalculateClientBalances`.
**Qué pasa:** La función es un placeholder que siempre retorna `true`:
```javascript
async recalculateClientBalances(clienteId) {
    // Delegado a Triggers de Supabase (retrocompatibilidad)
    return true;
}
```
**Por qué pasa:** Supuestamente la lógica se movió a triggers de Supabase, pero la función sigue siendo llamada en ~15 lugares del código.
**Impacto:** Da la ilusión de que se están recalculando saldos cuando en realidad no se ejecuta ningún cálculo. Si los triggers de Supabase no están configurados correctamente, los saldos nunca se actualizan.

---

## PATRONES TRANSVERSALES (Deuda Técnica Sistémica)

### P-001: loadAll() como martillo universal
Cada operación CRUD termina con `await this.loadAll()`, que descarga TODAS las tablas del sistema. Un solo cambio de etiqueta descarga 15,000+ registros. No hay invalidación selectiva de caché.

### P-002: Seguridad exclusivamente en frontend
Todas las validaciones de rol, congelamiento de 48h, protección de botones, y control de acceso a módulos se ejecutan en JavaScript del navegador. Un usuario con DevTools abiertas puede saltarse todas las restricciones.

### P-003: Fire-and-forget en escrituras críticas
`autoClassifyReservas` ejecuta `supabaseClient.from('clientes').update(...).then()` sin `await` ni `.catch()`. Si falla la escritura a la BD, el error se pierde silenciosamente.

### P-004: innerHTML como templating engine
Todo el sistema construye HTML con concatenación de strings e `innerHTML`. No hay componentes reactivos, no hay virtual DOM, no hay sanitización sistemática. Cada `innerHTML +=` en un loop causa reflow del DOM.

### P-005: Ausencia de transacciones
Operaciones multi-tabla (ej: crear titular + acompañantes + abono inicial) se ejecutan como llamadas individuales sin transacción. Si falla a mitad de camino, los datos quedan en estado inconsistente sin rollback.

---

> **NOTA FINAL:** Este documento registra problemas encontrados en el código fuente estático. No se ejecutó ningún test de penetración ni se verificaron las políticas RLS de Supabase, que podrían mitigar varios de los riesgos de seguridad documentados aquí. Si RLS está correctamente configurada, los riesgos ERR-002, ERR-008 y ERR-020 se reducen significativamente.
