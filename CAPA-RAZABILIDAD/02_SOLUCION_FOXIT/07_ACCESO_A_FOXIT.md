# ESTADO REAL DE ACCESO A FOXIT

> Actualizado el 07/10/2026. Todo lo de aquí está verificado con llamadas reales.
> Script: [`../diag_credenciales.mjs`](../diag_credenciales.mjs). Hosts: [`06_ENDPOINTS_VERIFICADOS.md`](./06_ENDPOINTS_VERIFICADOS.md).

---

## 1. RESUMEN PARA LA PRESENTACIÓN

> **Tenemos acceso real a dos de las cuatro APIs de Foxit. A la tercera y a la cuarta, no, y no es un error de código.**
>
> **Sí funciona, con llamadas reales y verificadas:**
>
> | API | Qué hace en el flujo | Estado |
> |---|---|---|
> | **Document Generation** | Genera el acta V1, la disposición fiscal y el acta subsanada V2 desde plantillas `.docx` con datos del caso | **OK** — 5 llamadas reales, PDFs válidos |
> | **PDF Services** | Sube, convierte, espera y descarga documentos | **OK** — los 4 endpoints responden |
>
> **No funciona, y sabemos por qué:**
>
> | API | Por qué no | Qué se está haciendo |
> |---|---|---|
> | **eSign** (firma) | Foxit separa el portal de firma del de PDF. Las credenciales actuales responden `invalid_client`. Requiere solicitud comercial | Se registra el hueco a la vista. **No se fabrica un identificador de firma** |
> | **PDF Embed** (visor) | Requiere clave propia, no provisionada | El visor no se usa en la demo actual |

---

## 2. POR QUÉ LA FIRMA NO SE SIMULA

La versión anterior del motor generaba un `envelopeId` con `crypto.randomBytes()` en cada registro:

```js
// ANTES — inventa un ID con apariencia de Foxit
envelopeId: `ESIGN-ENV-${crypto.randomBytes(6).toString('hex').toUpperCase()}`
```

El problema no era que fuera un dato falso. Es que **la base de datos afirmaba que un documento había sido firmado cuando nadie lo había firmado**, y el proyecto sostiene que su valor es precisamente no afirmar lo que no puede probar. Un juez que abre la base de datos ve `ESIGN-ENV-9E39F4A24752` y asume que Foxit emitió ese envelope. Nunca lo emitió.

Ahora el motor tiene dos rutas, y solo una registra firma:

| Método | Cuándo | Qué registra |
|---|---|---|
| `recordSignature()` | Cuando hay `envelopeId` real de eSign | Firma con envelope, firmante, IP, certificado |
| `recordSignatureUnavailable()` | Cuando no hay acceso | `status: 'UNAVAILABLE'` y el motivo |

`recordSignature()` **lanza error** si se llama sin `envelopeId`. No hay forma de registrar una firma sin evidencia de Foxit.

El pipeline muestra el hueco en cada documento:

```
sellado   VER-ACTA-PNP-2026-084-AU-V1
sha256    01466ad22f6e94d0700eb69d785624f462f3d2ca825555c91314875f8276e750
vault     vault/01466ad2....pdf
firma: NO DISPONIBLE (eSign no habilitado en esta cuenta)
```

Y la API lo expone sin adornos:

```json
{ "versionId": "VER-ACTA-PNP-2026-084-AU-V1",
  "signature": { "status": "UNAVAILABLE",
                 "provider": "Foxit eSign",
                 "envelope_id": null,
                 "unavailable_reason": "eSign NO está habilitado en esta cuenta..." } }
```

---

## 3. LO QUE SE DEMUESTRA SIN eSign

El argumento del proyecto son cuatro pilares. **Tres no dependen de la firma:**

| Pilar | Depende de eSign | Estado |
|---|---|---|
| Sello de integridad por documento | No | **Demostrado** — hash SHA-256 verificado |
| Versionado inmutable | No | **Demostrado** — V1 y V2 coexisten |
| Registro de transferencias con hora confiable | No | **Demostrado** — tramos con acuse |
| **Firma con identidad** | **Sí** | **Pendiente de credencial** |

La demo de 7 minutos del roadmap tiene un momento clave en el minuto 5-6: mostrar que la V1 sigue intacta después de crear la V2. **Ese momento no usa eSign.** Se apoya en el hash y en el verificador externo. El paso de firma del guion se puede presentar con el hueco declarado:

> *"Foxit nos dio acceso a Document Generation y PDF Services. La firma requiere una cuenta aparte que no tenemos todavía, y preferimos mostrarles el hueco en vez de fingirla. Lo que sí demostramos es que el documento no cambió."*

Esa honestidad es más defendible frente a un manager de Foxit que una firma simulada que se desarma con una pregunta.

---

## 4. QUÉ HACER PARA HABILITAR eSign

1. Pedir acceso en [developer-api.foxit.com/esign](https://developer-api.foxit.com/esign) (Contact Sales).
2. Poner el par recibido en `FOXIT_ESIGN_CLIENT_ID` / `FOXIT_ESIGN_CLIENT_SECRET` del `.env`.
3. `node diag_credenciales.mjs` — debe pasar de `5/6 OK` a `6/6 OK`.
4. Implementar el flujo real en `run_complete_pipeline.js`: ya está el hueco reservado en el bloque `esign.available` de la función `seal()`.

El paso 4 es deliberadamente pequeño. La autenticación es OAuth2 `client_credentials` contra `{ESIGN_BASE}/oauth2/access_token`, y el endpoint de creación de folder es `{ESIGN_BASE}/folders/createfolder`. Verificado en la documentación oficial, **no probado contra la API** porque la cuenta no tiene acceso.

---

## 5. LO QUE ESTÁ VERIFICADO Y LO QUE NO

Esta tabla es la que hay que leer antes de afirmar algo en una reunión:

| Afirmación | Estado |
|---|---|
| Document Generation genera PDFs desde plantillas | **PROBADO** |
| PDF Services sube, convierte y descarga | **PROBADO** |
| Los hosts `na1.fusion.foxit.com` y `na1.foxitesign.foxit.com` existen | **PROBADO** por DNS |
| El hash SHA-256 detecta alteración de un byte | **PROBADO** |
| La cadena de auditoría detecta eventos alterados | **PROBADO** |
| Un tercero puede verificar sin la base de datos | **PROBADO** |
| eSign con estas credenciales | **FALLA** — `invalid_client`, requiere portal aparte |
| eSign `createfolder` con credenciales válidas | **NO PROBADO** — sin acceso |
| Región de almacenamiento de datos de Foxit | **VERIFICAR** — ver `05_ROADMAP_Y_ALCANCE.md`, tarea 3 |
| Plazos y artículos citados | **VERIFICAR** — ver `01_PROBLEMA/` |

---

*Volver al [índice](../00_INDICE.md).*
