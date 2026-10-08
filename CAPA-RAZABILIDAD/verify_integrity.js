/**
 * Verificador de integridad ejecutable por un tercero.
 *
 *   node verify_integrity.js            verifica todo el vault
 *   node verify_integrity.js <sha256>   verifica un archivo por su hash
 *
 * POR QUÉ EXISTE
 *
 * El argumento del proyecto es que la integridad se puede auditar desde fuera.
 * Eso solo es cierto si el verificador no depende del sistema que audita. Este
 * script NO importa el motor de trazabilidad, NO abre la base de datos y NO
 * consulta ningún servicio. Solo lee los archivos del vault y comprueba que el
 * contenido de cada uno sea el que su nombre dice.
 *
 * Como el hash ES el nombre del archivo, la verificación es elemental:
 *   sha256(vault/<nombre>.pdf) === <nombre>
 *
 * Si alguien altera un archivo, el nombre deja de coincidir con el contenido.
 * No hay nada que ocultar detrás: el nombre es la verdad y el auditor puede
 * repetir el cálculo con cualquier herramienta.
 *
 * Para la cadena de auditoría completa hace falta el motor, porque los hashes
 * encadenados viven en la base de datos. Eso se hace aparte:
 *   node -e "import('./traceability_engine.js').then(m => { const e = new m.TraceabilityEngine(); console.log(e.verifyChain('CASE-2026-084')); e.close(); })"
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VAULT_DIR = path.join(__dirname, 'vault');

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

function verifyOne(filename) {
  const filePath = path.join(VAULT_DIR, filename);
  const expected = filename.replace(/\.pdf$/, '');

  if (!/^[0-9a-f]{64}$/.test(expected)) {
    return { filename, status: 'NOMBRE_INVALIDO', valid: false, message: 'El nombre no es un hash SHA-256.' };
  }
  if (!fs.existsSync(filePath)) {
    return { filename, status: 'FALTA_ARCHIVO', valid: false, message: 'No está en el vault.' };
  }

  const actual = sha256(fs.readFileSync(filePath));
  const valid = actual === expected;
  return {
    filename,
    status: valid ? 'VERIFICADO' : 'ALTERADO',
    valid,
    expectedSha256: expected,
    actualSha256: actual,
    sizeBytes: fs.statSync(filePath).size,
    message: valid
      ? 'El contenido coincide con el hash del nombre.'
      : 'ALTERACIÓN DETECTADA: el nombre y el contenido no coinciden.'
  };
}

function main() {
  const target = process.argv[2];

  if (!fs.existsSync(VAULT_DIR)) {
    console.error(`No existe el vault en ${VAULT_DIR}`);
    console.error('Ejecuta primero: node run_complete_pipeline.js');
    process.exit(2);
  }

  if (target) {
    const filename = target.includes('.pdf') ? target : `${target}.pdf`;
    const r = verifyOne(filename);
    console.log(`${r.status}  ${filename}`);
    if (r.expectedSha256) {
      console.log(`  esperado ${r.expectedSha256}`);
      console.log(`  actual   ${r.actualSha256}`);
    }
    console.log(`  ${r.message}`);
    process.exit(r.valid ? 0 : 1);
  }

  const files = fs.readdirSync(VAULT_DIR).filter((f) => f.endsWith('.pdf'));
  if (files.length === 0) {
    console.error('El vault está vacío.');
    process.exit(2);
  }

  console.log('VERIFICACIÓN INDEPENDIENTE DEL VAULT');
  console.log(`Carpeta: ${VAULT_DIR}`);
  console.log(`${'='.repeat(72)}`);

  let ok = 0;
  const failed = [];
  for (const f of files.sort()) {
    const r = verifyOne(f);
    console.log(`${r.valid ? 'OK      ' : 'FALLA   '} ${r.filename}`);
    if (!r.valid) {
      failed.push(r);
      console.log(`         esperado ${r.expectedSha256}`);
      console.log(`         actual   ${r.actualSha256}`);
    } else {
      ok++;
    }
  }

  console.log(`${'='.repeat(72)}`);
  console.log(`${ok}/${files.length} archivos íntegros.`);

  if (failed.length > 0) {
    console.log('');
    console.log('DOCUMENTOS ALTERADOS:');
    for (const f of failed) console.log(`  ${f.filename}`);
    process.exit(1);
  }

  console.log('Todos los documentos del vault coinciden con su hash registrado.');
  console.log('Verificación reproducible: sha256sum vault/*.pdf');
  process.exit(0);
}

main();
