/**
 * Pipeline end-to-end: generación con Foxit, sellado de integridad,
 * versionado, transferencias de custodia y verificación.
 *
 *   node run_complete_pipeline.js
 *
 * Las credenciales se leen de .env. No hay secretos en el código.
 *
 * Sobre la firma: la cuenta tiene acceso a Document Generation y PDF Services,
 * pero NO a eSign. El pipeline no fabrica un envelopeId: registra la firma como
 * no disponible, con el motivo. El hueco queda a la vista en vez de escondido.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { TraceabilityEngine } from './traceability_engine.js';
import { loadEnv, esignStatus } from './config.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = loadEnv(__dirname);
const baseUrl = env.FOXIT_BASE_URL;
const clientId = env.FOXIT_CLIENT_ID;
const clientSecret = env.FOXIT_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.error('Faltan FOXIT_CLIENT_ID / FOXIT_CLIENT_SECRET. Definelos en .env (ver .env.example).');
  process.exit(1);
}

const esign = esignStatus(env);
const CASE_ID = 'CASE-2026-084';

const engine = new TraceabilityEngine({ demo: true });

function line(char = '=') {
  return char.repeat(72);
}

/** Genera el PDF con Foxit Document Generation. Host y auth verificados. */
async function generateWithFoxit(templatePath, documentValues, outputPdfPath) {
  const t0 = Date.now();
  const res = await fetch(`${baseUrl}/document-generation/api/GenerateDocumentBase64`, {
    method: 'POST',
    headers: {
      client_id: clientId,
      client_secret: clientSecret,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      base64FileString: fs.readFileSync(templatePath).toString('base64'),
      documentValues,
      outputFormat: 'pdf'
    })
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`Foxit Document Generation (${res.status}): ${text.slice(0, 300)}`);

  const data = JSON.parse(text);
  const pdf = Buffer.from(data.base64FileString, 'base64');
  if (pdf.subarray(0, 5).toString() !== '%PDF-') {
    throw new Error('Foxit devolvió algo que no es un PDF');
  }
  fs.writeFileSync(outputPdfPath, pdf);
  return { sizeBytes: pdf.length, elapsedMs: Date.now() - t0, sha256: engine.computeHash(outputPdfPath) };
}

/** Sella y, si eSign estuviera disponible, firmaría. Hoy deja constancia del hueco. */
function seal({ documentCode, docType, versionNumber, filePath, parentVersionId, userId, notes }) {
  const record = engine.registerDocumentVersion({
    caseId: CASE_ID,
    documentCode,
    docType,
    versionNumber,
    filePath,
    parentVersionId,
    userId,
    notes
  });

  let signatureLine;
  if (esign.available) {
    // Ruta real: llamar a eSign con las credenciales del portal de firma.
    // No implementada hasta que exista la cuenta. Ver 06_ENDPOINTS_VERIFICADOS.md
    signatureLine = 'firma: eSign disponible, pendiente de implementar';
  } else {
    engine.recordSignatureUnavailable({ versionId: record.id, reason: esign.note });
    signatureLine = 'firma: NO DISPONIBLE (eSign no habilitado en esta cuenta)';
  }

  console.log(`  sellado   ${record.id}`);
  console.log(`  sha256    ${record.sha256}`);
  console.log(`  vault     vault/${record.vault_filename}`);
  console.log(`  ${signatureLine}`);
  return record;
}

async function run() {
  // Con --no-tamper se omite la prueba de manipulación, para no dejar eventos
  // de alteración en el registro que se publica. La prueba vive en el servidor
  // (/api/simulate-tamper) y en el navegador, donde no contamina la demo.
  const skipTamper = process.argv.includes('--no-tamper');

  console.log(line());
  console.log('PIPELINE DE TRAZABILIDAD DOCUMENTAL PENAL — CAPA FOXIT');
  console.log(line());
  console.log(`Document Generation + PDF Services: ${baseUrl}`);
  console.log(`eSign: ${esign.available ? 'disponible' : 'NO habilitado — se registra el hueco'}`);
  console.log('');

  // ---------------------------------------------------------------- FASE 1
  console.log(`FASE 1 — Policía Nacional del Perú levanta el acta`);
  const v1Path = path.join(__dirname, 'ACTA_INTERVENCION_POLICIAL_V1.pdf');
  const v1 = seal({
    documentCode: 'ACTA-PNP-2026-084-AU',
    docType: 'ACTA_INTERVENCION',
    versionNumber: 1,
    filePath: v1Path,
    parentVersionId: null,
    userId: 'USR-PNP-01',
    notes: 'Acta original levantada en flagrancia.'
  });
  console.log('');

  // ---------------------------------------------------------------- FASE 2
  console.log('FASE 2 — Remisión a la Fiscalía. Tramo abierto hasta el acuse.');
  const t1 = engine.transferCustody({
    caseId: CASE_ID,
    fromInstitutionId: 'INST-PNP',
    toInstitutionId: 'INST-MP',
    userId: 'USR-PNP-01',
    documentIds: [v1.id],
    notes: 'Oficio N.° 104-2026 a la 3ra Fiscalía Provincial Penal Corporativa de Lima.'
  });
  console.log(`  tramo ${t1.id} abierto. Nadie lo tiene confirmado todavía.`);
  console.log('');

  // ---------------------------------------------------------------- FASE 3
  console.log('FASE 3 — El fiscal revisa y detecta una inconsistencia material.');
  const fiscalPath = path.join(__dirname, 'DISPOSICION_OBSERVACION_FISCAL.pdf');
  const fiscalGen = await generateWithFoxit(
    path.join(__dirname, 'plantilla_disposicion_fiscal.docx'),
    {
      carpeta_fiscal: 'CF-2026-3829-LIMA',
      fecha_recepcion: '07 de Octubre de 2026, 02:40 horas',
      fiscal_responsable: 'Dra. Mariana Ramos Vega',
      remitente_policial: 'Comisaría PNP Alfonso Ugarte — DEPINCRI',
      investigado_nombre: 'Juan Carlos Pérez Quispe',
      delito_imputado: 'Hurto agravado (Art. 186 Código Penal)',
      fundamento_revision:
        'Recibidos los actuados policiales, se realizó el control de legalidad del acta de intervención V1.',
      observacion_fiscal:
        'OBSERVACIÓN MATERIAL: en el cuadro de especies incautadas se consigna la placa ABC-123, ' +
        'pero según tarjeta de identificación vehicular corresponde a ABC-124. Se dispone emitir ' +
        'acta subsanada V2 preservando el histórico.',
      audit_id: 'FOXIT-MP-OBS-2026-092',
      parent_hash_short: v1.sha256.slice(0, 16)
    },
    fiscalPath
  );
  console.log(`  Foxit generó la disposición: ${fiscalGen.sizeBytes} bytes en ${fiscalGen.elapsedMs} ms`);
  const fiscal = seal({
    documentCode: 'DISP-MP-2026-092',
    docType: 'DISPOSICION_FISCAL',
    versionNumber: 1,
    filePath: fiscalPath,
    parentVersionId: v1.id,
    userId: 'USR-MP-01',
    notes: 'Disposición fiscal que ordena la subsanación y manda preservar la V1.'
  });
  console.log('');

  // ---------------------------------------------------------------- FASE 4
  console.log('FASE 4 — Subsanación. V2 sin tocar V1.');
  const v2Path = path.join(__dirname, 'ACTA_INTERVENCION_POLICIAL_V2.pdf');
  const v2Gen = await generateWithFoxit(
    path.join(__dirname, 'plantilla_acta_policial.docx'),
    {
      acta_numero: 'ACTA-PNP-2026-084-AU-V2',
      fecha_hora: '07 de Octubre de 2026, 03:10 horas (subsanación)',
      lugar_intervencion: 'Av. Alfonso Ugarte N.° 1240, Cercado de Lima',
      unidad_policial: 'Comisaría PNP Alfonso Ugarte — DEPINCRI Centro',
      oficial_interviniente: 'SO3 PNP Carlos Mendoza Quispe',
      cip_oficial: 'CIP: 31892044',
      delito_presunto: 'Presunto delito contra el patrimonio — Hurto agravado (Art. 186 CP)',
      vehiculo_placa: 'ABC-124 [CORREGIDO — la V1 decía ABC-123]',
      intervenido_nombre: 'Juan Carlos Pérez Quispe',
      intervenido_nacionalidad: 'Peruana',
      intervenido_documento: 'DNI N.° 45892110 (ficticio)',
      intervenido_direccion: 'Jr. Quilca 452, Cercado de Lima',
      descripcion_hechos:
        'SUBSANACIÓN FORMAL: conforme a la observación fiscal, se rectifica la placa del ' +
        'vehículo intervenido. Se deja constancia expresa de que la V1 original permanece íntegra.',
      especies_incautadas: '01 mochila con herramientas de corte, 01 celular, 01 moto placa ABC-124.',
      audit_id: 'TRC-2026-002-SUBSANADA-V2'
    },
    v2Path
  );
  console.log(`  Foxit generó el acta V2: ${v2Gen.sizeBytes} bytes en ${v2Gen.elapsedMs} ms`);
  const v2 = seal({
    documentCode: 'ACTA-PNP-2026-084-AU',
    docType: 'ACTA_INTERVENCION_SUBSANADA',
    versionNumber: 2,
    filePath: v2Path,
    parentVersionId: v1.id,
    userId: 'USR-PNP-01',
    notes: 'Subsanación de la placa vehicular. La V1 se preserva íntegra y verificable.'
  });
  console.log('');

  // ---------------------------------------------------------------- FASE 5
  console.log('FASE 5 — Acuse de la Fiscalía. El tramo se cierra.');
  engine.acknowledgeCustody({ transferId: t1.id, userId: 'USR-MP-01', notes: 'Recibido conforme.' });
  console.log(`  tramo ${t1.id} cerrado con acuse.`);
  console.log('');

  const t2 = engine.transferCustody({
    caseId: CASE_ID,
    fromInstitutionId: 'INST-MP',
    toInstitutionId: 'INST-PJ',
    userId: 'USR-MP-01',
    documentIds: [v1.id, fiscal.id, v2.id],
    notes: 'Requerimiento de prisión preventiva elevado al juzgado con V1 y V2 integradas.'
  });
  console.log('FASE 6 — Remisión al Poder Judicial. Tramo abierto, sin acuse todavía.');
  console.log(`  tramo ${t2.id} abierto. El expediente está en el judge's manos sin confirmar.`);
  console.log('');

  // ---------------------------------------------------------------- FASE 7
  console.log(line());
  console.log('PRUEBA DE INTEGRIDAD');
  console.log(line());

  for (const v of [v1, fiscal, v2]) {
    const r = engine.verifyIntegrity(v.id);
    console.log(`  ${r.valid ? 'OK      ' : 'ALTERADO'} ${v.id}`);
  }

  console.log('');
  if (skipTamper) {
    console.log('  (prueba de manipulación omitida con --no-tamper)');
    console.log('');
  } else {
    console.log('Ataque simulado: se altera un byte del archivo sellado en el vault.');
    const { VAULT_DIR } = await import('./traceability_engine.js');
    const victim = path.join(VAULT_DIR, v1.vault_filename);
    const backup = fs.readFileSync(victim);
    const tampered = Buffer.from(backup);
    tampered[tampered.length - 1] ^= 0xff;
    fs.writeFileSync(victim, tampered);

    const attack = engine.verifyIntegrity(v1.id);
    console.log(`  resultado: ${attack.status}`);
    console.log(`  ${attack.message}`);
    if (attack.valid) {
      console.log('  FALLO DEL MOTOR: la alteración no fue detectada.');
    } else {
      console.log('  Detectado. El registro del evento quedó en la cadena de auditoría.');
    }
    fs.writeFileSync(victim, backup);

    const restored = engine.verifyIntegrity(v1.id);
    console.log(`  restaurado: ${restored.status}`);
    console.log('');
  }

  // ---------------------------------------------------------------- FASE 8
  const chain = engine.verifyChain(CASE_ID);
  console.log(line());
  console.log('CADENA DE AUDITORÍA');
  console.log(line());
  console.log(`  ${chain.status} — ${chain.message}`);
  console.log('');

  const open = engine.getOpenCustodyTransfers(CASE_ID);
  console.log(line());
  console.log('TRAMOS DE CUSTODIA ABIERTOS');
  console.log(line());
  for (const t of open) {
    console.log(`  ${t.id}  ${t.from_institution_id} -> ${t.to_institution_id}  abierto hace ${t.openHours} h`);
  }
  console.log('');
  console.log(line());
  console.log('PIPELINE COMPLETO');
  console.log(line());
}

run()
  .then(() => engine.close())
  .catch((err) => {
    console.error('Error:', err.message);
    engine.close();
    process.exit(1);
  });
