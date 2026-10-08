/**
 * Carga de configuración. Sin dependencias externas.
 *
 * Orden de precedencia:
 *   1. process.env (lo que pase el entorno o el CI)
 *   2. .env del directorio del proyecto
 *
 * No hay valores por defecto con credenciales adentro. Si falta una clave
 * requerida, el llamador decide qué hacer. Este módulo solo lee.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Hosts verificados. Ver 02_SOLUCION_FOXIT/06_ENDPOINTS_VERIFICADOS.md */
export const FOXIT_HOSTS = {
  pdfServices: 'https://na1.fusion.foxit.com',
  eSignUS: 'https://na1.foxitesign.foxit.com/api',
  eSignEU: 'https://eu1.foxitesign.foxit.com/api'
};

/** Hosts que el proyecto usaba y que NO existen en DNS. No volver a usarlos. */
export const DEAD_HOSTS = [
  'api.foxitesign.com',
  'esign.foxit.com',
  'api.foxit.com'
];

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key) out[key] = value;
  }
  return out;
}

export function loadEnv(projectDir = __dirname) {
  const fromFile = parseEnvFile(path.join(projectDir, '.env'));
  const merged = { ...fromFile };
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && v !== '') merged[k] = v;
  }
  return merged;
}

/**
 * Estado real del acceso a Foxit en esta cuenta.
 * Lo consulta el diagnóstico, no este módulo. Aquí solo se expone la forma.
 */
export function esignStatus(env) {
  if (env.FOXIT_ESIGN_CLIENT_ID && env.FOXIT_ESIGN_CLIENT_SECRET) {
    return {
      available: true,
      baseUrl: env.FOXIT_ESIGN_BASE_URL || FOXIT_HOSTS.eSignUS,
      note: 'Credenciales de eSign presentes. Verificar con diag_credenciales.mjs.'
    };
  }
  return {
    available: false,
    baseUrl: env.FOXIT_ESIGN_BASE_URL || FOXIT_HOSTS.eSignUS,
    note:
      'eSign NO está habilitado en esta cuenta. Foxit separa el portal de firma del de PDF Services: ' +
      'las credenciales actuales responden invalid_client. Se requiere solicitud en ' +
      'developer-api.foxit.com/esign (Contact Sales).'
  };
}
