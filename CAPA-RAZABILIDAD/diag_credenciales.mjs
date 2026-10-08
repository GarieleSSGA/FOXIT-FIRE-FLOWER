/**
 * Diagnóstico de credenciales y endpoints Foxit — NEW CASE (caso penal peruano).
 *
 * Hosts verificados contra docs.developer-api.foxit.com y developer-api.foxit.com:
 *   PDF Services / Document Generation : https://na1.fusion.foxit.com
 *   eSign US                           : https://na1.foxitesign.foxit.com/api
 *   eSign EU                           : https://eu1.foxitesign.foxit.com/api
 *
 * CORRECCIONES RESPECTO AL DIAGNÓSTICO ANTERIOR:
 *   1. api.foxitesign.com NO EXISTE en DNS. eSign es regional.
 *   2. api.foxit.com NO es el host de PDF Services ni de DocGen.
 *   3. /pdf-services/api/documents/getproperties NO EXISTE (405 en GET y POST).
 *      El flujo real de PDF Services es de 4 endpoints:
 *        POST /pdf-services/api/documents/upload            (multipart) -> documentId
 *        POST /pdf-services/api/documents/create/pdf-from-word (json)     -> taskId
 *        GET  /pdf-services/api/tasks/{taskId}                            -> resultDocumentId
 *        GET  /pdf-services/api/documents/{documentId}/download           -> bytes
 *   4. El multipart fallaba porque se fijaba Content-Type sin boundary.
 *      Correcto: dejar que fetch arme el header con su boundary.
 *   5. eSign usa OAuth2 client_credentials + Bearer, y credenciales de un portal
 *      SEPARADO (developer-api.foxit.com/esign). No comparte con PDF Services.
 *
 * Uso:  node diag_credenciales.mjs
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function envValue(key) {
  if (process.env[key]) return process.env[key].trim();
  const raw = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
  const m = raw.match(new RegExp(`^${key}=(.*)$`, 'm'));
  return m ? m[1].trim() : null;
}

const CLIENT_ID = envValue('FOXIT_CLIENT_ID');
const CLIENT_SECRET = envValue('FOXIT_CLIENT_SECRET');
const ESIGN_CLIENT_ID = envValue('FOXIT_ESIGN_CLIENT_ID');
const ESIGN_CLIENT_SECRET = envValue('FOXIT_ESIGN_CLIENT_SECRET');

const PDF_BASE = 'https://na1.fusion.foxit.com';
const ESIGN_BASE = 'https://na1.foxitesign.foxit.com/api';

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? 'OK  ' : 'FALLA'}  ${name} — ${detail}`);
}

async function call(label, url, init, attempts = 3) {
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetch(url, init);
      const text = await res.text();
      if (res.ok && !/ERR1203/.test(text)) return { ok: true, status: res.status, text };
      const err = text.slice(0, 200);
      if (i < attempts) {
        await sleep(1500 * i);
        continue;
      }
      return { ok: false, status: res.status, text, err };
    } catch (e) {
      if (i < attempts) {
        await sleep(1500 * i);
        continue;
      }
      return { ok: false, err: `RED: ${e.message} ${e.cause?.message ?? ''}` };
    }
  }
}

const pdfHeaders = () => ({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET });

console.log(`PDF  client_id: ${CLIENT_ID ? CLIENT_ID.slice(0, 14) + '...' : 'AUSENTE'}`);
console.log(`eSign client_id: ${ESIGN_CLIENT_ID ? ESIGN_CLIENT_ID.slice(0, 14) + '...' : 'AUSENTE (usar portal eSign)'}`);
console.log('');

// ---------------------------------------------------------------- DocGen
console.log('=== 1. Document Generation API (GenerateDocumentBase64) ===');
{
  const docx = fs.readFileSync(path.join(__dirname, 'plantilla_disposicion_fiscal.docx'));
  const r = await call('docgen', `${PDF_BASE}/document-generation/api/GenerateDocumentBase64`, {
    method: 'POST',
    headers: { ...pdfHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      base64FileString: docx.toString('base64'),
      documentValues: { carpeta_fiscal: 'TEST-DIAGNOSTICO' },
      outputFormat: 'pdf'
    })
  });
  if (r.ok) {
    const j = JSON.parse(r.text);
    const pdf = Buffer.from(j.base64FileString, 'base64');
    const out = path.join(__dirname, 'DIAG_docgen.pdf');
    fs.writeFileSync(out, pdf);
    record(
      'DocGen GenerateDocumentBase64',
      pdf.subarray(0, 5).toString() === '%PDF-',
      `${pdf.length} bytes, sha256 ${sha256(pdf).slice(0, 16)}..., cabecera ${pdf.subarray(0, 8).toString().trim()} -> ${path.basename(out)}`
    );
  } else {
    record('DocGen GenerateDocumentBase64', false, `HTTP ${r.status} ${r.err ?? ''}`);
  }
}

// -------------------------------------------------------- PDF Services
console.log('\n=== 2. PDF Services API (flujo real de 4 endpoints) ===');
{
  const src = path.join(__dirname, 'plantilla_expediente_judicial.docx');
  const buf = fs.readFileSync(src);

  // 2.1 upload
  const fd = new FormData();
  fd.append('file', new Blob([buf]), path.basename(src));
  const up = await call('upload', `${PDF_BASE}/pdf-services/api/documents/upload`, {
    method: 'POST',
    headers: pdfHeaders(),
    body: fd
  });
  let documentId = null;
  if (up.ok) {
    documentId = JSON.parse(up.text).documentId;
    record('POST documents/upload', true, `documentId ${documentId}`);
  } else {
    record('POST documents/upload', false, `HTTP ${up.status} ${up.err ?? ''}`);
  }

  // 2.2 convert docx -> pdf
  let taskId = null;
  if (documentId) {
    const cv = await call('convert', `${PDF_BASE}/pdf-services/api/documents/create/pdf-from-word`, {
      method: 'POST',
      headers: { ...pdfHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ documentId })
    });
    if (cv.ok) {
      taskId = JSON.parse(cv.text).taskId;
      record('POST documents/create/pdf-from-word', true, `taskId ${taskId}`);
    } else {
      record('POST documents/create/pdf-from-word', false, `HTTP ${cv.status} ${cv.err ?? ''}`);
    }
  }

  // 2.3 poll task
  let resultDocumentId = null;
  if (taskId) {
    for (let i = 1; i <= 15; i++) {
      const t = await call('task', `${PDF_BASE}/pdf-services/api/tasks/${taskId}`, {
        method: 'GET',
        headers: pdfHeaders()
      });
      if (!t.ok) {
        record('GET tasks/{taskId}', false, `HTTP ${t.status} ${t.err ?? ''}`);
        break;
      }
      const j = JSON.parse(t.text);
      console.log(`        poll ${i}: status=${j.status} progress=${j.progress ?? '-'}`);
      if (j.status === 'COMPLETED' || j.resultDocumentId) {
        resultDocumentId = j.resultDocumentId;
        record('GET tasks/{taskId}', true, `COMPLETED, resultDocumentId ${resultDocumentId}`);
        break;
      }
      if (j.status === 'FAILED') {
        record('GET tasks/{taskId}', false, 'tarea FAILED');
        break;
      }
      await sleep(2000);
    }
  }

  // 2.4 download
  if (resultDocumentId) {
    const dl = await call('download', `${PDF_BASE}/pdf-services/api/documents/${resultDocumentId}/download`, {
      method: 'GET',
      headers: pdfHeaders()
    });
    if (dl.ok) {
      const out = path.join(__dirname, 'DIAG_pdfservices.pdf');
      fs.writeFileSync(out, dl.text);
      record(
        'GET documents/{id}/download',
        dl.text.startsWith('%PDF-'),
        `${dl.text.length} bytes, sha256 ${sha256(dl.text).slice(0, 16)}..., cabecera ${dl.text.slice(0, 8).trim()} -> ${path.basename(out)}`
      );
    } else {
      record('GET documents/{id}/download', false, `HTTP ${dl.status} ${dl.err ?? ''}`);
    }
  }
}

// ---------------------------------------------------------------- eSign
console.log('\n=== 3. eSign API (OAuth2 client_credentials) ===');
{
  if (!ESIGN_CLIENT_ID || !ESIGN_CLIENT_SECRET) {
    record('eSign oauth2/access_token', false, 'SIN credenciales eSign. Requiere cuenta propia en developer-api.foxit.com/esign (Contact Sales). Definir FOXIT_ESIGN_CLIENT_ID / FOXIT_ESIGN_CLIENT_SECRET');
  } else {
    const r = await call('esign-token', `${ESIGN_BASE}/oauth2/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: ESIGN_CLIENT_ID,
        client_secret: ESIGN_CLIENT_SECRET,
        grant_type: 'client_credentials'
      })
    });
    let token = null;
    try {
      token = JSON.parse(r.text).access_token;
    } catch {}
    if (token) {
      record('eSign oauth2/access_token', true, 'access_token obtenido');
      const fo = await call('esign-folders', `${ESIGN_BASE}/folders/getfolders`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 1, offset: 0, search_name: '', order_by: 'create_time', order_direction: 'DESC' })
      });
      record('eSign folders/getfolders', fo.ok, fo.ok ? 'listado OK' : `HTTP ${fo.status} ${fo.err ?? ''}`);
    } else {
      record('eSign oauth2/access_token', false, `${r.status}: ${r.text.slice(0, 200)}`);
    }
  }
}

// ---------------------------------------------------------------- resumen
console.log('\n=== RESUMEN ===');
for (const r of results) console.log(`${r.ok ? 'OK   ' : 'FALLA'}  ${r.name}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} OK, ${failed} falla(s).`);
