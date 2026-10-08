/**
 * Exporta el estado del motor a un sitio estático para GitHub Pages.
 *
 *   node export_static.mjs
 *
 * GitHub Pages sirve archivos, no ejecuta Node. Este script convierte el estado
 * actual del motor en `site/data.json` y copia los archivos sellados a
 * `site/vault/`, de modo que la demo funcione sin servidor.
 *
 * CONSECUENCIA HONESTA QUE ESTO NO ESCONDE:
 * En la versión estática, la verificación de integridad la hace el NAVEGADOR,
 * no el servidor. Sigue siendo una verificación real de SHA-256 sobre los bytes
 * reales del archivo, contra el hash que da nombre al archivo. La diferencia es
 * que el «tercero que audita» es quien abre la página, no un proceso aparte.
 * Eso no es una limitación que haya que esconder: es exactamente el escenario
 * que el proyecto defiende, un tercero que audita sin permiso de escritura.
 *
 * Lo que NO se puede hacer en estático:
 *   - Registrar eventos nuevos (la cadena es de solo agregado y ya está escrita).
 *   - Detectar si alguien altera data.json Y los PDFs a la vez, porque quien
 *     controla ambos controla las dos fuentes. Para eso está el verificador con
 *     hash público firmado, que es trabajo posterior.
 *
 * Lo que sí se puede y se muestra:
 *   - Verificar cada PDF contra su hash, en el navegador, sin pedir permiso.
 *   - Recorrer la cadena de auditoría y comprobar que los hashes encadenan.
 *   - Ver los tramos de custodia abiertos.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { TraceabilityEngine, VAULT_DIR } from './traceability_engine.js';
import { loadEnv, esignStatus } from './config.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITE_DIR = path.join(__dirname, 'site');
const SITE_VAULT = path.join(SITE_DIR, 'vault');
const CASE_ID = 'CASE-2026-084';

const env = loadEnv(__dirname);
const esign = esignStatus(env);

// NO se borra SITE_DIR completo: index.html vive ahí y es fuente, no salida.
// Solo se regeneran data.json, MANIFEST.json y vault/.
fs.mkdirSync(SITE_VAULT, { recursive: true });
for (const f of fs.readdirSync(SITE_VAULT)) fs.rmSync(path.join(SITE_VAULT, f), { force: true });

const INDEX_PATH = path.join(SITE_DIR, 'index.html');
if (!fs.existsSync(INDEX_PATH)) {
  console.error(`Falta ${path.relative(__dirname, INDEX_PATH)}. La interfaz estática es fuente y no se regenera.`);
  process.exit(1);
}

const engine = new TraceabilityEngine();

let caseItem;
try {
  caseItem = engine.getCase(CASE_ID);
} catch {
  console.error('No hay caso. Ejecuta primero: node run_complete_pipeline.js');
  process.exit(1);
}

const versions = engine.getVersions(CASE_ID);
const audit = engine.getAuditTrail(CASE_ID);
const chain = engine.verifyChain(CASE_ID);

// Copiar los archivos sellados al sitio, con el hash como nombre.
let copied = 0;
let missing = 0;
for (const v of versions) {
  const src = path.join(VAULT_DIR, v.vault_filename);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(SITE_VAULT, v.vault_filename));
    copied++;
  } else {
    missing++;
    console.warn(`  FALTA en el vault: ${v.vault_filename} (${v.id})`);
  }
}

const start = new Date(caseItem.created_at).getTime();
const deadline = start + 48 * 3600 * 1000;

const payload = {
  generatedAt: new Date().toISOString(),
  generator: 'export_static.mjs',
  note:
    'Los hashes de este archivo son verificables con el bloque de verificación por hash de Git. ' +
    'La verificación de los PDFs la hace el navegador comparando SHA-256 contra el nombre del archivo.',

  case: {
    ...caseItem,
    deadline48h: new Date(deadline).toISOString(),
    hoursRemaining: Math.max(0, deadline - Date.now()) / 3600000
  },

  foxitAccess: {
    documentGeneration: true,
    pdfServices: true,
    eSign: esign.available,
    eSignNote: esign.note,
    hosts: {
      pdfServices: 'https://na1.fusion.foxit.com',
      eSign: env.FOXIT_ESIGN_BASE_URL || 'https://na1.foxitesign.foxit.com/api'
    }
  },

  institutions: engine.getInstitutions(),
  users: engine.getUsers(),
  versions,
  auditEvents: audit,
  chain,
  custodyChain: engine.getCustodyChain(CASE_ID),
  openTransfers: engine.getOpenCustodyTransfers(CASE_ID)
};

fs.writeFileSync(path.join(SITE_DIR, 'data.json'), JSON.stringify(payload, null, 2), 'utf8');

/**
 * Manifiesto de hashes, para publicar como bloque de verificación por hash de Git.
 * Si alguien altera un PDF o data.json, el manifiesto no coincide y se nota.
 */
const manifest = {
  generatedAt: payload.generatedAt,
  note: 'SHA-256 de cada archivo publicado. Verificable sin el sitio: sha256sum site/vault/*.pdf',
  files: {}
};
for (const f of fs.readdirSync(SITE_VAULT).sort()) {
  manifest.files[f] = crypto.createHash('sha256').update(fs.readFileSync(path.join(SITE_VAULT, f))).digest('hex');
}
manifest.files['data.json'] = crypto
  .createHash('sha256')
  .update(fs.readFileSync(path.join(SITE_DIR, 'data.json')))
  .digest('hex');

fs.writeFileSync(path.join(SITE_DIR, 'MANIFEST.json'), JSON.stringify(manifest, null, 2), 'utf8');

engine.close();

console.log('Sitio estático generado en site/');
console.log(`  data.json          ${versions.length} versiones, ${audit.length} eventos`);
console.log(`  vault/             ${copied} documentos copiados${missing ? `, ${missing} FALTANTES` : ''}`);
console.log(`  cadena             ${chain.status}`);
console.log(`  firma eSign        ${esign.available ? 'disponible' : 'no disponible — declarado en la interfaz'}`);
if (missing > 0) process.exit(1);
