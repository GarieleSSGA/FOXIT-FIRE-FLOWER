# ÍNDICE DE NAVEGACIÓN

Proyecto: **FOXIT — Capa de Trazabilidad Documental para el Proceso Penal peruano**

Este directorio está organizado en dos carpetas, en el orden en que debe leerse el argumento.

---

## Carpeta `01_PROBLEMA/` — El diagnóstico

> **Objetivo:** demostrar que el problema existe, está documentado y no es de tecnología sino de trazabilidad.

| # | Documento | Qué responde |
|---|---|---|
| 01 | [`01_GESTION_DE_CASO_REAL_EN_PERU.md`](./01_GESTION_DE_CASO_REAL_EN_PERU.md) | ¿Cómo se gestiona realmente un caso penal en el Perú? Plazos, documentos, diagrama de proceso, dónde se rompe la cadena, qué confiabilidad existe hoy y qué falta. |

**Lo que hay que retener de esta carpeta:**
- El flujo real, con reloj y documento en cada hito.
- Los **9 puntos de quiebre**.
- El diagnóstico de por qué **nadie se hace responsable**.
- Las **10 verificaciones pendientes** que un abogado peruano debe cerrar.

---

## Carpeta `02_SOLUCION_FOXIT/` — La respuesta

> **Objetivo:** mostrar cómo una capa de trazabilidad construida sobre las APIs de Foxit cierra los 9 puntos de quiebre, deja todo grabado y convierte la responsabilidad difusa en responsabilidad verificable.

| # | Documento | Qué responde |
|---|---|---|
| 01 | [`01_ARQUITECTURA_TRAZABILIDAD.md`](./01_ARQUITECTURA_TRAZABILIDAD.md) | ¿Cómo se diseña la capa? Los 4 pilares, el diagrama de arquitectura, el flujo extremo a extremo. |
| 02 | [`02_MATRIZ_QUIEBRE_CONTROL.md`](./02_MATRIZ_QUIEBRE_CONTROL.md) | Punto de quiebre por punto de quiebre: qué lo cierra y qué parte es Foxit y qué parte es backend. |
| 03 | [`03_TODO_QUEDA_GRABADO.md`](./03_TODO_QUEDA_GRABADO.md) | El registro de solo agregado, el reloj de plazos con alerta, y cómo se renders cuentas contra quien libera a un detenido. |
| 04 | [`04_IMPLEMENTACION_OBLIGATORIA.md`](./04_IMPLEMENTACION_OBLIGATORIA.md) | ¿Qué pasa si Foxit se vuelve obligatorio para el proceso penal? Ruta normativa, fases, riesgos y objeciones previsibles. |
| 05 | [`05_ROADMAP_Y_ALCANCE.md`](./05_ROADMAP_Y_ALCANCE.md) | Qué se construye primero, qué no, y en qué orden. |
| 06 | [`06_ENDPOINTS_VERIFICADOS.md`](./06_ENDPOINTS_VERIFICADOS.md) | Los hosts, endpoints y mecanismos de autenticación de Foxit **probados contra la API real**. Incluye los tres hosts que el proyecto usaba y que no existen en DNS. |
| 07 | [`07_ACCESO_A_FOXIT.md`](./07_ACCESO_A_FOXIT.md) | Qué APIs tenemos y cuáles no, y por qué. Qué se demuestra igual sin la firma, y por qué el hueco se declara en vez de rellenarse. |

---

## Argumento en una frase

> El expediente penal peruano se cumple en papel. El papel no tiene dueño, no tiene reloj y no tiene memoria. Cuando un plazo vence, la persona sale libre y nadie responde. **Una capa de trazabilidad con sello de integridad por documento, versionado inmutable, registro de transferencias con hora confiable y reloj de plazos con alerta — construida sobre las APIs de Foxit — convierte esa omisión invisible en un hecho verificable.**

---

## Archivos sueltos del directorio

Los archivos `.pdf`, `.docx`, `.js`, `.py`, `.json` y `index.html` en la raíz son **material de trabajo previo**: plantillas de actas, un motor de trazabilidad en Node, y un pipeline de generación. Sirven de referencia para el MVP, pero no forman parte del argumento. Se documentan en [`02_SOLUCION_FOXIT/05_ROADMAP_Y_ALCANCE.md`](./02_SOLUCION_FOXIT/05_ROADMAP_Y_ALCANCE.md).

`PLAN BASE.txt` es el brief original. `PROPUESTA_TECNICA_FOXIT_MVP.md` es la propuesta técnica previa.

---

## Regla de este proyecto

Ningún documento afirma un plazo, artículo o endpoint que no esté verificado. Lo no verificado va marcado como **VERIFICAR**. Lo que es nuestra decisión de diseño va marcado como **SUPUESTO DE DISEÑO**. Esa separación no es burocracia: es lo que hace que el argumento se sostenga frente a un juez, un fiscal o un manager de Foxit.
