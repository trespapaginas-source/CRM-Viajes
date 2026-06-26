# Reglas de Desarrollo y Protección del Proyecto

## Objetivo

Este proyecto se encuentra actualmente en producción y cuenta con usuarios, procesos operativos y flujos financieros activos. Por esta razón, cualquier modificación, corrección, optimización o nueva funcionalidad debe implementarse siguiendo estrictos controles de análisis e impacto para evitar errores, pérdida de información o afectaciones económicas.

## Principio General

Ningún cambio debe realizarse únicamente con base en el requerimiento solicitado. Antes de implementar cualquier modificación, se debe analizar el impacto completo sobre el sistema, sus dependencias y los procesos relacionados.

## Protección de la Estabilidad del Sistema

Antes de realizar cualquier cambio:

* Analizar el flujo completo relacionado con la funcionalidad que será modificada.
* Identificar todos los módulos, servicios, tablas, procesos y componentes que dependan directa o indirectamente de dicha funcionalidad.
* Verificar que los cambios no afecten procesos existentes que actualmente funcionan correctamente.
* Evitar modificaciones innecesarias en código estable y probado.
* Priorizar siempre la estabilidad del sistema por encima de la velocidad de implementación.

## Protección Especial del Módulo Financiero

El área financiera es considerada crítica y de máxima prioridad dentro del proyecto.

Cada vez que se solicite:

* Una nueva funcionalidad financiera.
* Una modificación sobre procesos financieros existentes.
* Un ajuste en cálculos, balances, dividendos, reservas, retiros o reportes.
* Cambios en comisiones, pagos, facturación o distribución de ingresos.

Se deberá realizar obligatoriamente un análisis de impacto financiero completo.

### Validaciones obligatorias

Antes de implementar cualquier cambio financiero se debe:

1. Identificar todos los procesos que consumen o generan información financiera.
2. Analizar todas las dependencias relacionadas.
3. Revisar cálculos históricos afectados.
4. Verificar reportes, dashboards y métricas involucradas.
5. Confirmar que los datos históricos no serán alterados accidentalmente.
6. Evaluar posibles efectos secundarios en otros módulos.
7. Documentar claramente los riesgos detectados.

Ningún cambio financiero debe implementarse sin comprender completamente todas sus conexiones dentro del sistema.

## Regla de No Destrucción

Cuando una nueva necesidad pueda desarrollarse sin alterar una funcionalidad existente, se deberá preferir la creación de una nueva solución en lugar de modificar una que actualmente funciona correctamente.

Principio:

> Si una funcionalidad estable puede conservarse intacta y la nueva necesidad puede resolverse mediante una implementación independiente, se debe crear una nueva estructura en lugar de modificar la existente.

## Metodología de Implementación

Para cada solicitud:

### Fase 1: Análisis

* Comprender el requerimiento.
* Identificar dependencias.
* Detectar posibles riesgos.
* Evaluar impacto técnico y financiero.

### Fase 2: Planificación

* Definir la estrategia de implementación.
* Determinar qué componentes serán afectados.
* Diseñar el plan de pruebas.

### Fase 3: Implementación

* Realizar cambios mínimos y controlados.
* Mantener compatibilidad con funcionalidades existentes.
* Seguir las convenciones actuales del proyecto.

### Fase 4: Validación

* Ejecutar pruebas funcionales.
* Ejecutar pruebas de regresión.
* Verificar cálculos financieros.
* Confirmar integridad de los datos históricos.

## Prohibiciones

No está permitido:

* Modificar lógica financiera sin análisis previo.
* Alterar estructuras de datos históricas sin justificación documentada.
* Eliminar funcionalidades existentes sin evaluar dependencias.
* Realizar cambios masivos sin comprender el impacto completo.
* Asumir que una modificación aislada no afectará otros módulos.
* Implementar cambios directamente sobre producción sin validación previa.

## Regla para Inteligencias Artificiales y Agentes de Desarrollo

Antes de generar código, modificar archivos o proponer una implementación, el agente debe:

1. Analizar el contexto completo del proyecto.
2. Identificar dependencias directas e indirectas.
3. Evaluar riesgos funcionales y financieros.
4. Explicar el impacto esperado de los cambios.
5. Proponer la estrategia más segura.
6. Priorizar la conservación de funcionalidades existentes.
7. Evitar refactorizaciones innecesarias.
8. Mantener la compatibilidad con versiones anteriores cuando sea posible.

## Filosofía del Proyecto

La prioridad principal no es desarrollar más rápido.

La prioridad principal es:

* Mantener la estabilidad del sistema.
* Proteger la integridad financiera.
* Preservar los datos históricos.
* Evitar regresiones.
* Implementar mejoras de forma segura y controlada.

Cada cambio debe realizarse bajo el principio de que el sistema ya está generando valor en producción y cualquier modificación debe aportar mejoras sin comprometer la confiabilidad existente.
