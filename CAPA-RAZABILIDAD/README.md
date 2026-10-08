# Capa de Trazabilidad Documental — Foxit

Capa de trazabilidad para el expediente penal peruano, construida sobre las APIs de Foxit.

**El problema.** El expediente penal se cumple en papel. El papel no tiene dueño, no tiene reloj y no tiene memoria. Cuando un plazo vence, la persona sale libre y nadie responde, porque no hay registro que muestre quién tenía el caso ni a quién se le avisó.

**La respuesta.** Cuatro pilares: sello de integridad por documento, versionado inmutable, registro de transferencias con acuse de recibo, y reloj de plazos. Tres de cuatro funcionan hoy y están verificados. El cuarto —firma con identidad— requiere una cuenta de Foxit que esta cuenta no tiene, y el hueco está declarado, no rellenado con datos inventados.

---

## Ver la demo

**Sitio publicado:** [github.io/GarieleSSGA/FOXIT-FIRE-FLOWER](https://github.io/GarieleSSGA/FOXIT-FIRE-FLOWER/)

La verificación de integridad corre en el navegador. No necesita servidor ni cuenta.

---

## Ejecutar en local

Requiere **Node 22 o superior**. Sin dependencias: SQLite viene integrado (`node:sqlite`) y no hay `npm install`.

```bash
cd CAPA-RAZABILIDAD

# 1. Credenciales
cp .env.example .env     # en Windows: copy .env.example .env
#    Editar .env con FOXIT_CLIENT_ID y FOXIT_CLIENT_SECRET

# 2. Comprobar qué APIs responden de verdad
node diag_credenciales.mjs

# 3. Ejecutar el flujo completo (llama a Foxit y genera los documentos)
node run_complete_pipeline.js --no-tamper

# 4. Levantar la interfaz
node server.js            # http://localhost:3000
```

### Verificación de integridad, por separado

```bash
node verify_integrity.js              # todo el vault
node verify_integrity.js <sha256>     # un documento por su hash
```

Este script **no importa el motor de trazabilidad ni abre la base de datos**. Solo lee los archivos de `vault/` y comprueba que el contenido de cada uno sea el que su nombre dice. Es reproducible con cualquier herramienta:

```bash
sha256sum vault/*.pdf
```

### Regenerar el sitio estático

```bash
node export_static.mjs                # escribe site/data.json, site/MANIFEST.json y site/vault/
```

`site/index.html` es **fuente**, no salida: el export no lo borra.

---

## Las dos formas de despliegue

### A. GitHub Pages — estático (lo que está publicado ahora)

El sitio no ejecuta Node. `export_static.mjs` convierte el estado del motor a `site/data.json` y copia los PDFs a `site/vault/`.

La verificación de integridad la hace **el navegador**, con Web Crypto SHA-256, sobre los bytes reales de cada archivo. Sigue siendo una verificación criptográfica real; lo que cambia es quién la ejecuta. En la versión con servidor era un proceso aparte; aquí es quien abre la página.

Es un argumento a favor, no una limitación: **es exactamente el escenario que el proyecto defiende**, un tercero que audita sin permiso de escritura.

Limitación honesta: en estático no se pueden registrar eventos nuevos. La cadena de auditoría ya está escrita y solo se lee. Y si alguien altera `data.json` *y* los PDFs a la vez, quien controla ambos controla las dos fuentes. Para cerrar eso hace falta un hash firmado fuera del sitio — ver *Trabajo pendiente*.

### B. Sistema local o en nube con backend

`server.js` sí es un servidor completo: registra documentos, verifica, simula ataques reales y expone la API. Requiere disco persistente, porque SQLite y `vault/` son estado en disco.

| Entorno | Notas |
|---|---|
| **Local** | `node server.js`. Funciona tal cual |
| **Render / Railway / Fly.io** | Soportan disco persistente o volumen montado. Desplegar con el repo y configurar las variables de entorno |
| **Vercel** | **No sirve tal cual.** El sistema de archivos es efímero y cada invocación partiría de cero. Habría que mover el vault a Vercel Blob y SQLite a Postgres |

---

## Qué está verificado y qué no

Este proyecto no afirma nada que no se haya probado. La tabla completa está en
[`02_SOLUCION_FOXIT/07_ACCESO_A_FOXIT.md`](CAPA-RAZABILIDAD/02_SOLUCION_FOXIT/07_ACCESO_A_FOXIT.md).

| Afirmación | Estado |
|---|---|
| Document Generation genera PDFs desde plantillas `.docx` | **PROBADO** con llamadas reales |
| PDF Services sube, convierte y descarga | **PROBADO**, los 4 endpoints |
| Hash SHA-256 detecta alteración de un byte | **PROBADO** |
| La cadena de auditoría detecta eventos alterados | **PROBADO** |
| Un tercero verifica sin la base de datos | **PROBADO** |
| eSign con estas credenciales | **FALLA** — `invalid_client` |
| eSign con credenciales válidas | **NO PROBADO** — sin acceso |
| Región de almacenamiento de datos de Foxit | **VERIFICAR** |
| Plazos y artículos citados en `01_PROBLEMA/` | **VERIFICAR** |

### Sobre eSign

Foxit separa el portal de firma del de PDF Services. Las credenciales de este proyecto pertenecen a **Document Generation y PDF Services**, y no sirven para firmar:

```json
{ "error": "invalid_client", "error_description": "invalid consumer credentials" }
```

Para habilitarlo hay que pedir acceso en
[developer-api.foxit.com/esign](https://developer-api.foxit.com/esign) (Contact Sales),
poner el par en `FOXIT_ESIGN_CLIENT_ID` / `FOXIT_ESIGN_CLIENT_SECRET`, y
`diag_credenciales.mjs` debe pasar de `5/6 OK` a `6/6 OK`.

**El motor no fabrica identificadores de firma.** `recordSignature()` lanza error si se
llama sin un `envelopeId` real de Foxit. Cuando no hay acceso, se registra
`status: 'UNAVAILABLE'` con el motivo, y la interfaz lo declara. Una versión anterior
generaba `ESIGN-ENV-...` con números aleatorios y la base de datos afirmaba firmas que
nadie había hecho.

### Hosts de Foxit

| Servicio | Base URL |
|---|---|
| PDF Services + Document Generation | `https://na1.fusion.foxit.com` |
| eSign US | `https://na1.foxitesign.foxit.com/api` |
| eSign EU | `https://eu1.foxitesign.foxit.com/api` |

Estos hosts **no existen en DNS** y se usaban en versiones anteriores del proyecto:
`api.foxitesign.com`, `esign.foxit.com`, y `api.foxit.com` (que resuelve pero no es el
host de PDF Services). Detalle completo en
[`06_ENDPOINTS_VERIFICADOS.md`](CAPA-RAZABILIDAD/02_SOLUCION_FOXIT/06_ENDPOINTS_VERIFICADOS.md).

---

## Cómo está construido

| Pieza | Qué hace |
|---|---|
| `traceability_engine.js` | Motor. SQLite vía `node:sqlite`. El **hash SHA-256 es el nombre del archivo** en `vault/`, así que el nombre no se puede cambiar sin cambiar el contenido. Los eventos de auditoría encadenan el hash del anterior. |
| `verify_integrity.js` | Verificador externo. No importa el motor ni abre la base de datos. |
| `export_static.mjs` | Motor → sitio estático para GitHub Pages. |
| `server.js` | Servidor web con API. |
| `run_complete_pipeline.js` | El flujo completo de punta a punta. |
| `diag_credenciales.mjs` | Prueba cada API por separado y dice cuál falla y por qué. |
| `config.mjs` | Carga `.env` y expone el estado real del acceso a Foxit. |

Los cuatro pilares, y qué parte es de Foxit y qué parte es nuestro:

| Pilar | Foxit | Nuestro |
|---|---|---|
| Generar documentos desde plantillas | **Sí** — Document Generation | El diseño de las plantillas y los datos del caso |
| Integridad y versionado | No | **Todo** — hash como nombre, lineage, cadena de auditoría |
| Transferencias con acuse | No | **Todo** — tramos, horas, quién tiene el caso |
| Firma con identidad | **Sí** — eSign | El handoff y la política de quién firma |

---

## Seguridad

- `.env` está en `.gitignore` y no se versiona. `.env.example` es la plantilla sin valores.
- Las credenciales no están en el código. `config.mjs` no tiene valores por defecto con secretos adentro.
- El path traversal está cerrado en `server.js`: las rutas se normalizan y se exige que sigan dentro de la raíz.

---

## Trabajo pendiente

1. **Pedir acceso a eSign** y conectar la firma real. El hueco en el motor ya está reservado.
2. **Firmar el manifiesto con una clave**, para que en la versión estática se pueda detectar que alguien alteró `data.json` y los PDFs a la vez. Es el límite conocido de publicar el estado en el mismo sitio que lo publica.
3. **Cerrar las verificaciones legales** de `01_PROBLEMA/`. Los plazos y artículos marcados **VERIFICAR** necesitan revisión de un abogado peruano.
4. **Confirmar la región de almacenamiento** de Foxit. Dato penal peruano no debería salir del país.
