/**
 * Generador Oficial de Acta Policial V1 con Foxit Document Generation Cloud API
 * Proyecto: FOXIT CRIMINAL JUSTICE TRACEABILITY (MVP)
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { loadEnv } from './config.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const env = loadEnv(__dirname);
const clientId = env.FOXIT_CLIENT_ID;
const clientSecret = env.FOXIT_CLIENT_SECRET;
const baseUrl = env.FOXIT_BASE_URL;

if (!clientId || !clientSecret) {
  console.error('Faltan FOXIT_CLIENT_ID / FOXIT_CLIENT_SECRET. Definelos en .env (ver .env.example).');
  process.exit(1);
}

const templatePath = path.join(__dirname, 'plantilla_acta_policial.docx');
const outputPdfPath = path.join(__dirname, 'ACTA_INTERVENCION_POLICIAL_V1.pdf');

// Payload de datos ficticios del caso policial en Lima (flagrancia)
const casoFicticio = {
  documentValues: {
    acta_numero: 'ACTA-PNP-2026-084-AU',
    fecha_hora: '07 de Octubre de 2026, 01:15 horas',
    lugar_intervencion: 'Av. Alfonso Ugarte N° 1240, Cercado de Lima',
    unidad_policial: 'Comisaría PNP Alfonso Ugarte - DEPINCRI Centro',
    oficial_interviniente: 'SO3 PNP Carlos Mendoza Quispe',
    cip_oficial: 'CIP: 31892044',
    delito_presunto: 'Presunto Delito Contra el Patrimonio - Hurto Agravado (Art. 186 Código Penal)',
    vehiculo_placa: 'ABC-123 (Motolineal Pulsar Negra)',
    intervenido_nombre: 'Juan Carlos Pérez Quispe',
    intervenido_nacionalidad: 'Peruana',
    intervenido_documento: 'DNI N° 45892110 (Ficticio)',
    intervenido_direccion: 'Jr. Quilca 452, Cercado de Lima',
    descripcion_hechos: 'En circunstancias que personal policial realizaba patrullaje motorizado integrado en el cuadrante de seguridad, se visualizó al intervenido forcejeando la cerradura de un establecimiento comercial. Al notar la presencia policial, intentó darse a la fuga a bordo del vehículo menor antes detallado, siendo reducido inmediatamente a escasos 50 metros aplicando el uso proporcional de la fuerza.',
    especies_incautadas: '01 Mochila de lona conteniendo herramientas de corte (cizalla artesanal, ganzúas), 01 Teléfono celular marca Samsung, y el vehículo menor moto lineal marca Bajaj placa ABC-123.',
    audit_id: 'TRC-AUDIT-2026-001-ALPHA'
  }
};

async function main() {
  console.log('================================================================');
  console.log('🦊 FOXIT CLOUD DOCGEN: COMPILACIÓN DE ACTA POLICIAL V1');
  console.log('================================================================');

  if (!fs.existsSync(templatePath)) {
    console.error(`Error: No existe la plantilla en ${templatePath}`);
    process.exit(1);
  }

  const b64Template = fs.readFileSync(templatePath).toString('base64');

  // Paso 1: Analizar etiquetas con Foxit API
  console.log('\n[Paso 1/2] Analizando etiquetas DOCX con Foxit AnalyzeDocumentBase64...');
  const analyzeRes = await fetch(`${baseUrl}/document-generation/api/AnalyzeDocumentBase64`, {
    method: 'POST',
    headers: {
      'client_id': clientId,
      'client_secret': clientSecret,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ base64FileString: b64Template })
  });

  if (!analyzeRes.ok) {
    const errText = await analyzeRes.text();
    throw new Error(`Error en AnalyzeDocumentBase64 (${analyzeRes.status}): ${errText}`);
  }

  const tagsData = await analyzeRes.json();
  console.log('✓ Tags identificados por Foxit Cloud:');
  console.log('  Tags detectados:', tagsData.singleTagsString);

  // Paso 2: Invocar GenerateDocumentBase64
  console.log('\n[Paso 2/2] Invocando GenerateDocumentBase64 en Foxit Cloud...');
  const t0 = Date.now();

  const generateRes = await fetch(`${baseUrl}/document-generation/api/GenerateDocumentBase64`, {
    method: 'POST',
    headers: {
      'client_id': clientId,
      'client_secret': clientSecret,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      base64FileString: b64Template,
      documentValues: casoFicticio.documentValues,
      outputFormat: 'pdf'
    })
  });

  const elapsed = Date.now() - t0;

  if (!generateRes.ok) {
    const errText = await generateRes.text();
    throw new Error(`Error en GenerateDocumentBase64 (${generateRes.status}): ${errText}`);
  }

  const resultData = await generateRes.json();
  if (!resultData.base64FileString) {
    throw new Error('Foxit Cloud no devolvió base64FileString.');
  }

  const pdfBuffer = Buffer.from(resultData.base64FileString, 'base64');
  fs.writeFileSync(outputPdfPath, pdfBuffer);

  // Cálculo de Hash SHA-256 inmutable
  const hashSha256 = crypto.createHash('sha256').update(pdfBuffer).digest('hex');

  console.log('\n================================================================');
  console.log('✅ ACTA POLICIAL V1 GENERADA EXITOSAMENTE POR FOXIT CLOUD');
  console.log('================================================================');
  console.log(`📁 Archivo Generado: ${outputPdfPath}`);
  console.log(`📊 Tamaño del PDF: ${(pdfBuffer.length / 1024).toFixed(2)} KB`);
  console.log(`⚡ Tiempo de respuesta Foxit: ${elapsed} ms`);
  console.log(`🔒 Hash Criptográfico SHA-256 (Versión 1):`);
  console.log(`   ${hashSha256}`);
  console.log('================================================================\n');
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
