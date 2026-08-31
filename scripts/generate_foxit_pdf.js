/**
 * Script de Generación y Compilación Oficial de PDF con Foxit Document Generation Cloud API
 * Proyecto: FOXIT - FIRE FLOWER
 */

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { FoxitClient } from './foxit_client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

async function compileFoxitOfficialPDF() {
  console.log('================================================================');
  console.log('🦊 FOXIT DOCUMENT GENERATION API — COMPILADOR OFICIAL EN LA NUBE');
  console.log('================================================================');

  const client = new FoxitClient();

  const datahubReporte = path.join(rootDir, 'datahub_lineage', 'datahub_reporte_A1.json');
  const datahubNorm = path.join(rootDir, 'datahub_lineage', 'datahub_normativa_nsr10.json');
  const lineageReporte = path.join(rootDir, 'datahub_lineage', 'lineage_reporte_A1.json');
  const lineageNorm = path.join(rootDir, 'datahub_lineage', 'lineage_normativa_nsr10.json');
  
  const templateDocxPath = path.join(rootDir, 'plantillas_foxit', 'plantilla_ingenieria_nsr10.docx');
  const outputPdfPath = path.join(rootDir, 'plantillas_foxit', 'FOXIT_CERTIFICADO_ESTRUCTURAL_NSR10_OFICIAL.pdf');
  const frontendPdfCopy = path.join(rootDir, 'frontend', 'FOXIT_CERTIFICADO_ESTRUCTURAL_NSR10_OFICIAL.pdf');

  // Paso 1: Analizar la plantilla con la API de Foxit
  console.log('\n[Paso 1/3] Validando esquema y tags con Foxit AnalyzeDocumentBase64...');
  await client.analyzeTemplate(templateDocxPath);

  // Paso 2: Invocar generación en Foxit Cloud con DataHubs & Lineage
  console.log('\n[Paso 2/3] Generando PDF Oficial mediante Foxit GenerateDocumentBase64 API...');
  const res = await client.compileOfficialEngineeringReport({
    datahubReportePath: datahubReporte,
    datahubNormativaPath: datahubNorm,
    lineageReportePath: lineageReporte,
    lineageNormativaPath: lineageNorm,
    templateDocxPath: templateDocxPath,
    outputPdfPath: outputPdfPath
  });

  // Paso 3: Copiar al frontend para visualización directa
  console.log('\n[Paso 3/3] Sincronizando artefacto certificado al frontend...');
  fs.copyFileSync(outputPdfPath, frontendPdfCopy);

  console.log('================================================================');
  console.log('✓ PDF OFICIAL GENERADO EXITOSAMENTE POR LA API DE FOXIT!');
  console.log(`📁 Archivo Oficial: ${outputPdfPath}`);
  console.log(`📊 Tamaño: ${(res.sizeBytes / 1024).toFixed(2)} KB`);
  console.log(`⚡ Tiempo de respuesta Foxit Cloud: ${res.elapsedMs} ms`);
  console.log(`✍️ Envelope Foxit eSign: ${res.envelopeId} [PREPARADO & SELLADO]`);
  console.log('================================================================\n');

  return outputPdfPath;
}

compileFoxitOfficialPDF().catch(err => {
  console.error('[Error Crítico]', err.message);
  process.exit(1);
});
