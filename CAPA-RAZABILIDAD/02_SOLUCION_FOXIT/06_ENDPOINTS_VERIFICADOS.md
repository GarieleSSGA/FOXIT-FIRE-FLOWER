# ENDPOINTS DE FOXIT VERIFICADOS CONTRA LA API REAL

> Documento de trabajo técnico. Actualizado el 07/10/2026.
> Script que lo produce: [`../diag_credenciales.mjs`](../diag_credenciales.mjs) (`node diag_credenciales.mjs`).
>
> Este documento existe porque la regla del proyecto es: **ningún documento afirma un endpoint que no esté verificado**. Antes de escribir esto, el proyecto tenía tres hosts que **no existen en DNS**.

---

## 1. HOSTS

| Servicio | Base URL | Estado |
|---|---|---|
| PDF Services + Document Generation | `https://na1.fusion.foxit.com` | **VERIFICADO** — responde, credenciales válidas |
| eSign US | `https://na1.foxitesign.foxit.com/api` | **VERIFICADO** — host resuelve, credenciales pendientes |
| eSign EU | `https://eu1.foxitesign.foxit.com/api` | Host resuelve. No probado |
| eSign AU | `https://au1.foxitesign.foxit.com/api` | Documentado, no probado |
| eSign CA | `https://na2.foxitesign.foxit.com/api` | Documentado, no probado |

### Hosts que se estaban usando y NO existen

| Host usado antes | Por qué falla |
|---|---|
| `api.foxitesign.com` | **No resuelve en DNS.** eSign es regional, con prefijo de región |
| `esign.foxit.com` | **No resuelve en DNS** |
| `api.foxit.com` | Resuelve, pero **no es el host de PDF Services ni de DocGen**. Devolvió `ERR1203` en el diagnóstico inicial |

> **Consecuencia para la demo.** Un juez que abra DevTools y escriba el host del código anterior ve un error de DNS. Con estos hosts, la misma llamada devuelve 200.
---

## 2. AUTENTICACIÓN

| Servicio | Mecanismo |
|---|---|
| PDF Services | Headers `client_id` + `client_secret`. Sin token |
| Document Generation | Headers `client_id` + `client_secret`. Sin token |
| eSign | **OAuth2 `client_credentials`** en `POST {ESIGN_BASE}/oauth2/access_token`, luego header `Authorization: Bearer {access_token}` |

> **eSign NO comparte credenciales con PDF Services.** Son portales separados: `developer-api.foxit.com` para PDF/DocGen, y el portal eSign para firmar. Probar las claves de PDF contra eSign devuelve:
>
> ```json
> { "error": "invalid_client", "error_description": "invalid consumer credentials" }
> ```
>
> Eso es lo que devuelve el diagnóstico actual. **No es un bug de código: es una cuenta que falta.** Hay que pedir acceso a eSign por Contact Sales y definir `FOXIT_ESIGN_CLIENT_ID` / `FOXIT_ESIGN_CLIENT_SECRET`.

---

## 3. ENDPOINTS PROBADOS

### Document Generation API — `POST /document-generation/api/GenerateDocumentBase64`

| Campo | Valor |
|---|---|
| Auth | Headers `client_id`, `client_secret` |
| Content-Type | `application/json` |
| Body | `base64FileString`, `documentValues`, `outputFormat` |
| Respuesta OK | `{"message":"PDF Document Generated Successfully","fileExtension":"pdf","base64FileString":"..."}` |

**Probado:** OK. 31 822 bytes, cabecera `%PDF-1.4`.

### PDF Services API — flujo de 4 endpoints

Este es el flujo asíncrono real. **No existe `documents/getproperties`**: devuelve `405 METHOD_NOT_ALLOWED` tanto en GET como en POST, y con barra final devuelve `404 No static resource`.

| # | Método | Endpoint | Body | Devuelve |
|---|---|---|---|---|
| 1 | `POST` | `/pdf-services/api/documents/upload` | `multipart/form-data`, campo `file` | `documentId` |
| 2 | `POST` | `/pdf-services/api/documents/create/pdf-from-word` | `{"documentId": "..."}` | `taskId` |
| 3 | `GET` | `/pdf-services/api/tasks/{taskId}` | — | `status`, `progress`, `resultDocumentId` |
| 4 | `GET` | `/pdf-services/api/documents/{documentId}/download` | — | bytes del archivo |

**Estados de tarea:** `PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`. Con `progress` de 0 a 100.

**Probado:** OK en los 4. `status=COMPLETED, progress=100` al primer poll. 48 818 bytes, cabecera `%PDF-1.7`.

### Detalle que costó una hora: el multipart

El endpoint de upload fallaba con:

```json
{ "code": "UNEXPECTED_SERVER_ERROR", "message": "MultipartException: Failed to parse multipart servlet request" }
```

No es un problema de credenciales ni de red. Es que el código fijaba `Content-Type: multipart/form-data` a mano, **sin el parámetro `boundary`**, y Foxit no podía parsear el cuerpo. Los ejemplos de `curl` de Foxit sí llevan boundary porque curl la genera.

**La corrección:** dejar que `fetch` arme el `Content-Type` solo a partir del `FormData`.

```js
// MAL
headers: { 'Content-Type': 'multipart/form-data' }, body: fd

// BIEN
headers: { client_id, client_secret }, body: fd
```

---

## 4. CÓDIGO QUE DEPENDE DE ESTO

| Archivo | Dependencia |
|---|---|
| `.env` | `FOXIT_BASE_URL`, `FOXIT_ESIGN_BASE_URL` corregidos. Variables eSign agregadas |
| `diag_credenciales.mjs` | Reescrito con hosts y flujo reales |
| `generate_acta_v1.js`, `run_complete_pipeline.js`, `test_connection.js` | Ya usaban `na1.fusion.foxit.com`. Sin cambios |

---

## 5. PENDIENTE

| # | Tarea | Bloquea |
|---|---|---|
| 1 | Pedir credenciales del portal eSign (Contact Sales) | **El hito de firma de la demo.** Sin esto no hay eSign |
| 2 | Confirmar región de datos. El expediente penal peruano no debería salir del país | Bloqueante mentioned en `05_ROADMAP_Y_ALCANCE.md`. **VERIFICAR** |
| 3 | Probar `documents/upload` con límite de tamaño y con archivo protegido | Afecta el manejo de errores del backend |
| 4 | Medir el tiempo real de conversión con documentos largos | El plan de 7 minutos de la demo depende de esto |

---

*Volver al [índice](../00_INDICE.md).*
