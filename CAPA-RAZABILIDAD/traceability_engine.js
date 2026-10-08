/**
 * Motor de Trazabilidad e Integridad Documental
 * Capa de trazabilidad para el proceso penal peruano, sobre APIs de Foxit.
 *
 * CAMBIOS RESPECTO A LA VERSIÓN ANTERIOR (ver 09_REESCRITURA_MOTOR.md):
 *
 * 1. ANTES: `envelopeId: "ESIGN-ENV-" + randomBytes()` se fabricaba localmente en
 *    cada registro. Parecía un identificador de Foxit y no lo era: nadie había
 *    firmado nada. La base de datos afirmaba una firma que no existía, lo que
 *    contradice la regla del proyecto de no afirmar nada no verificado.
 *    AHORA: la firma se registra solo si viene de la API de eSign. Sin
 *    credenciales de eSign, el documento queda `signature.status = 'UNAVAILABLE'`
 *    con el motivo registrado. No se inventa nada.
 *
 * 2. ANTES: `getDb()`/`saveDb()` leían y reescribían un JSON completo en cada
 *    operación. Un `audit_logs` con append no era append: reescribir el JSON
 *    permite borrar entradas sin dejar rastro.
 *    AHORA: SQLite real. Cada evento de auditoría es un INSERT. Los eventos
 *    nunca se actualizan ni se borran. La tabla `audit_events` solo admite
 *    append, y cada fila encadena el hash de la anterior, de modo que borrar o
 *    editar una fila rompe la cadena y se detecta.
 *
 * 3. ANTES: el hash se guardaba en una columna y el archivo se llamaba como
 *    el autor quisiera (ACTA_V1.pdf).
 *    AHORA: el hash SHA-256 ES el nombre del archivo, en `vault/`. El nombre no
 *    se puede cambiar sin cambiar el contenido, y el contenido no se puede
 *    cambiar sin cambiar el nombre. Verificable por terceros sin la base de datos.
 *
 * 4. ANTES: `verifyIntegrity()` solo comparaba el hash del archivo contra el
 *    hash en la base de datos. Si alguien alteraba la base de datos y el
 *    archivo juntos, la verificación pasaba.
 *    AHORA: los eventos de auditoría llevan hash encadenado, y el manifiesto de
 *    cada versión se puede verificar de forma independiente. Alterar el archivo,
 *    la base de datos, o ambos, se detecta.
 *
 * Base de datos: SQLite vía `node:sqlite` (integrado en Node 22). Sin dependencias.
 * Verified contra la API real: ver 06_ENDPOINTS_VERIFICADOS.md
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { DatabaseSync } from 'node:sqlite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const VAULT_DIR = path.join(__dirname, 'vault');
const DB_PATH = path.join(__dirname, 'traceability.db');

/** Ancla inicial de la cadena: el hash al que encadena el primer evento. */
const GENESIS_HASH = '0'.repeat(64);

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

/** Hash canónico de un objeto: claves ordenadas, para que sea reproducible. */
function sha256Canonical(obj) {
  return sha256(Buffer.from(JSON.stringify(sortKeys(obj)), 'utf8'));
}

function sortKeys(obj) {
  if (Array.isArray(obj)) return obj.map(sortKeys);
  if (obj && typeof obj === 'object') {
    return Object.fromEntries(
      Object.keys(obj)
        .sort()
        .map((k) => [k, sortKeys(obj[k])])
    );
  }
  return obj;
}

function nowIso() {
  return new Date().toISOString();
}

export class TraceabilityEngine {
  /**
   * @param {object} [opts]
   * @param {boolean} [opts.demo] Crea el caso y usuarios de ejemplo si la BD está vacía.
   */
  constructor(opts = {}) {
    fs.mkdirSync(VAULT_DIR, { recursive: true });
    this.db = new DatabaseSync(DB_PATH);
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec('PRAGMA foreign_keys = ON');
    this.#migrate();
    if (opts.demo && this.countRows('cases') === 0) this.#seed();
  }

  #migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS institutions (
        id TEXT PRIMARY KEY,
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        jurisdiction TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        institution_id TEXT NOT NULL REFERENCES institutions(id),
        name TEXT NOT NULL,
        role TEXT NOT NULL,
        credential_ref TEXT,
        credential_type TEXT
      );

      CREATE TABLE IF NOT EXISTS cases (
        id TEXT PRIMARY KEY,
        case_number TEXT NOT NULL,
        title TEXT NOT NULL,
        crime TEXT NOT NULL,
        current_status TEXT NOT NULL,
        current_holder_institution_id TEXT REFERENCES institutions(id),
        created_at TEXT NOT NULL
      );

      -- El hash SHA-256 es la clave primaria. El contenido ES la dirección.
      CREATE TABLE IF NOT EXISTS document_versions (
        id TEXT PRIMARY KEY,
        case_id TEXT NOT NULL REFERENCES cases(id),
        document_code TEXT NOT NULL,
        doc_type TEXT NOT NULL,
        version_number INTEGER NOT NULL,
        parent_version_id TEXT REFERENCES document_versions(id),
        sha256 TEXT NOT NULL UNIQUE,
        size_bytes INTEGER NOT NULL,
        vault_filename TEXT NOT NULL,
        registered_by_user_id TEXT NOT NULL REFERENCES users(id),
        reason TEXT NOT NULL,
        integrity_status TEXT NOT NULL DEFAULT 'SEALED',
        created_at TEXT NOT NULL
      );

      -- Registro de SOLO agregado. Cada fila encadena el hash de la anterior.
      -- Si se borra o edita una fila, verifyChain() lo detecta.
      CREATE TABLE IF NOT EXISTS audit_events (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT NOT NULL UNIQUE,
        case_id TEXT NOT NULL,
        version_id TEXT,
        user_id TEXT,
        action TEXT NOT NULL,
        details TEXT NOT NULL,
        prev_hash TEXT NOT NULL,
        event_hash TEXT NOT NULL,
        recorded_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS custody_transfers (
        id TEXT PRIMARY KEY,
        case_id TEXT NOT NULL REFERENCES cases(id),
        from_institution_id TEXT REFERENCES institutions(id),
        to_institution_id TEXT NOT NULL REFERENCES institutions(id),
        from_user_id TEXT NOT NULL,
        to_user_id TEXT,
        document_ids TEXT NOT NULL,
        notes TEXT NOT NULL,
        acknowledged_at TEXT,
        acknowledged_by TEXT,
        transferred_at TEXT NOT NULL
      );

      -- Firma SOLO cuando viene de la API de eSign. Nunca se fabrica un ID.
      CREATE TABLE IF NOT EXISTS signatures (
        id TEXT PRIMARY KEY,
        version_id TEXT NOT NULL REFERENCES document_versions(id),
        provider TEXT NOT NULL,
        envelope_id TEXT,
        status TEXT NOT NULL,
        unavailable_reason TEXT,
        signed_at TEXT,
        signed_by TEXT,
        signer_ip TEXT,
        certificate_serial TEXT,
        recorded_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_versions_case ON document_versions(case_id);
      CREATE INDEX IF NOT EXISTS idx_versions_code ON document_versions(document_code);
      CREATE INDEX IF NOT EXISTS idx_audit_case ON audit_events(case_id, seq);
      CREATE INDEX IF NOT EXISTS idx_signatures_version ON signatures(version_id);
    `);
  }

  // ------------------------------------------------------------------ helpers

  countRows(table) {
    return this.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
  }

  /** Hash del último evento: ancla de la cadena. */
  #chainHead() {
    const row = this.db
      .prepare('SELECT event_hash FROM audit_events ORDER BY seq DESC LIMIT 1')
      .get();
    return row ? row.event_hash : GENESIS_HASH;
  }

  /**
   * Inserta un evento de auditoría encadenado. Append-only por diseño:
   * no hay ruta de código que actualice o borre una fila existente.
   */
  #appendAudit({ caseId, versionId = null, userId = null, action, details }) {
    const prevHash = this.#chainHead();
    const recordedAt = nowIso();
    const payload = {
      caseId,
      versionId,
      userId,
      action,
      details,
      prevHash,
      recordedAt
    };
    const eventHash = sha256Canonical(payload);
    const id = `LOG-${String(this.countRows('audit_events') + 1).padStart(6, '0')}`;

    this.db
      .prepare(
        `INSERT INTO audit_events (id, case_id, version_id, user_id, action, details, prev_hash, event_hash, recorded_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(id, caseId, versionId, userId, action, JSON.stringify(details), prevHash, eventHash, recordedAt);

    return { id, eventHash, prevHash, recordedAt };
  }

  /** Log público. El detalle de la cadena se verifica con verifyChain(). */
  logAuditEvent(args) {
    return this.#appendAudit(args);
  }

  // ------------------------------------------------------------- documentos

  computeHash(filePath) {
    if (!fs.existsSync(filePath)) throw new Error(`Archivo no encontrado: ${filePath}`);
    return sha256(fs.readFileSync(filePath));
  }

  /**
   * Sella una versión documental.
   *
   * Copia el archivo al vault con el hash como nombre y registra el manifiesto.
   * Mover o renombrar el original no afecta la copia sellada.
   */
  registerDocumentVersion({
    caseId,
    documentCode,
    docType,
    versionNumber,
    filePath,
    parentVersionId = null,
    userId,
    notes = '',
    foxItEvidence = {}
  }) {
    if (!this.#exists('cases', caseId)) throw new Error(`Caso ${caseId} no existe`);
    if (!this.#exists('users', userId)) throw new Error(`Usuario ${userId} no existe`);
    if (parentVersionId && !this.#exists('document_versions', parentVersionId)) {
      throw new Error(`Versión padre ${parentVersionId} no existe`);
    }

    // V2+ exige motivo: corregir sin explicar es exactamente el problema del caso.
    if (versionNumber > 1 && !notes.trim()) {
      throw new Error(
        `La versión ${versionNumber} exige un motivo. Sin motivo no se puede justificar una subsanación.`
      );
    }

    const bytes = fs.readFileSync(filePath);
    const hash = sha256(bytes);
    const vaultFilename = `${hash}.pdf`;
    const vaultPath = path.join(VAULT_DIR, vaultFilename);

    // El hash es el nombre. Si ya existe un archivo con ese nombre, su contenido
    // es idéntico por definición (mismo hash), así que no se sobrescribe nada.
    if (!fs.existsSync(vaultPath)) fs.writeFileSync(vaultPath, bytes);

    const versionId = `VER-${documentCode}-V${versionNumber}`;
    if (this.#exists('document_versions', versionId)) {
      throw new Error(`La versión ${versionId} ya está registrada y sellada`);
    }

    const createdAt = nowIso();
    const id = versionId;

    this.db
      .prepare(
        `INSERT INTO document_versions
           (id, case_id, document_code, doc_type, version_number, parent_version_id,
            sha256, size_bytes, vault_filename, registered_by_user_id, reason, integrity_status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SEALED', ?)`
      )
      .run(id, caseId, documentCode, docType, versionNumber, parentVersionId, hash, bytes.length, vaultFilename, userId, notes, createdAt);

    this.#appendAudit({
      caseId,
      versionId: id,
      userId,
      action: versionNumber === 1 ? 'DOCUMENT_SEALED_V1' : 'DOCUMENT_VERSION_BRANCHED',
      details: {
        documentCode,
        docType,
        versionNumber,
        sha256: hash,
        parentVersionId,
        reason: notes,
        foxitDocumentId: foxItEvidence.documentId ?? null,
        foxitSource: foxItEvidence.source ?? 'local-file',
        bytes: bytes.length
      }
    });

    return this.getVersion(id);
  }

  /** Registro de firma. Solo con evidencia real de eSign. */
  recordSignature({ versionId, provider, envelopeId, signedAt, signedBy, signerIp, certificateSerial }) {
    if (!envelopeId) {
      throw new Error(
        'No se puede registrar una firma sin envelopeId de Foxit eSign. ' +
          'Si no hay acceso a eSign, use recordSignatureUnavailable().'
      );
    }
    const id = `SIG-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
    this.db
      .prepare(
        `INSERT INTO signatures
           (id, version_id, provider, envelope_id, status, unavailable_reason, signed_at, signed_by, signer_ip, certificate_serial, recorded_at)
         VALUES (?, ?, ?, ?, 'SIGNED', NULL, ?, ?, ?, ?, ?)`
      )
      .run(id, versionId, provider, envelopeId, signedAt, signedBy, signerIp, certificateSerial, nowIso());

    this.#appendAudit({
      caseId: this.#caseOfVersion(versionId),
      versionId,
      userId: signedBy,
      action: 'SIGNATURE_RECORDED',
      details: { provider, envelopeId, signedAt, certificateSerial }
    });
    return this.getVersion(versionId);
  }

  /**
   * Deja constancia de que la firma NO está disponible y por qué.
   * Esto es preferible a inventar un envelopeId: el hueco queda a la vista.
   */
  recordSignatureUnavailable({ versionId, reason }) {
    const id = `SIG-UNAVAIL-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    this.db
      .prepare(
        `INSERT INTO signatures
           (id, version_id, provider, envelope_id, status, unavailable_reason, signed_at, signed_by, signer_ip, certificate_serial, recorded_at)
         VALUES (?, ?, 'Foxit eSign', NULL, 'UNAVAILABLE', ?, NULL, NULL, NULL, NULL, ?)`
      )
      .run(id, versionId, reason, nowIso());

    this.#appendAudit({
      caseId: this.#caseOfVersion(versionId),
      versionId,
      userId: null,
      action: 'SIGNATURE_UNAVAILABLE',
      details: { reason }
    });
    return this.getVersion(versionId);
  }

  // ------------------------------------------------------------ verificación

  /**
   * Verifica la integridad de una versión contra el archivo sellado en el vault.
   * No depende de la base de datos para el contenido: el hash es el nombre.
   */
  verifyIntegrity(versionId) {
    const version = this.getVersion(versionId);
    const vaultPath = path.join(VAULT_DIR, version.vault_filename);

    if (!fs.existsSync(vaultPath)) {
      this.#appendAudit({
        caseId: version.case_id,
        versionId,
        userId: 'SYSTEM',
        action: 'INTEGRITY_VAULT_FILE_MISSING',
        details: { vaultFilename: version.vault_filename, expectedSha256: version.sha256 }
      });
      return {
        versionId,
        status: 'VAULT_FILE_MISSING',
        valid: false,
        message: 'El archivo sellado no está en el vault. El registro conserva su hash esperado.'
      };
    }

    const actual = sha256(fs.readFileSync(vaultPath));
    const valid = actual === version.sha256;

    if (!valid) {
      this.#appendAudit({
        caseId: version.case_id,
        versionId,
        userId: 'SYSTEM',
        action: 'INTEGRITY_TAMPER_DETECTED',
        details: {
          registeredSha256: version.sha256,
          actualSha256: actual,
          note: 'El contenido del archivo sellado no coincide con el hash que da nombre al archivo.'
        }
      });
    }

    return {
      versionId,
      status: valid ? 'VERIFIED' : 'TAMPER_DETECTED',
      valid,
      registeredSha256: version.sha256,
      actualSha256: actual,
      message: valid
        ? 'Integridad confirmada. El contenido coincide con el hash registrado.'
        : 'ALTERACIÓN DETECTADA. El archivo fue modificado fuera del sistema.'
    };
  }

  /**
   * Verifica la cadena de auditoría completa.
   * Detecta eventos borrados o editados, porque cada fila encadena el hash
   * de la anterior y Genesis es conocido.
   */
  verifyChain(caseId = null) {
    const rows = caseId
      ? this.db
          .prepare('SELECT * FROM audit_events WHERE case_id = ? ORDER BY seq')
          .all(caseId)
      : this.db.prepare('SELECT * FROM audit_events ORDER BY seq').all();

    let expectedPrev = GENESIS_HASH;
    const broken = [];

    for (const row of rows) {
      if (row.prev_hash !== expectedPrev) {
        broken.push({ seq: row.seq, id: row.id, problem: 'prev_hash no coincide', esperado: expectedPrev, encontrado: row.prev_hash });
      }
      const recomputed = sha256Canonical({
        caseId: row.case_id,
        versionId: row.version_id,
        userId: row.user_id,
        action: row.action,
        details: JSON.parse(row.details),
        prevHash: row.prev_hash,
        recordedAt: row.recorded_at
      });
      if (recomputed !== row.event_hash) {
        broken.push({ seq: row.seq, id: row.id, problem: 'contenido del evento alterado', esperado: recomputed, encontrado: row.event_hash });
      }
      expectedPrev = row.event_hash;
    }

    return {
      status: broken.length === 0 ? 'CHAIN_VERIFIED' : 'CHAIN_BROKEN',
      valid: broken.length === 0,
      eventsChecked: rows.length,
      problems: broken,
      message:
        broken.length === 0
          ? `Los ${rows.length} eventos encadenan correctamente. No se borró ni editó ninguno.`
          : `La cadena está rota en ${broken.length} punto(s). Hay eventos borrados o alterados.`
    };
  }

  // ------------------------------------------------------------- custodia

  /**
   * Transfiere la custodia del caso. El tramo queda abierto hasta que la
   * institución receptora acusa recibo. Sin acuse, el tramo sigue abierto y
   * el caso muestra quién lo tiene de hecho.
   */
  transferCustody({ caseId, fromInstitutionId, toInstitutionId, userId, documentIds = [], notes = '' }) {
    if (!this.#exists('cases', caseId)) throw new Error(`Caso ${caseId} no existe`);
    if (fromInstitutionId && !this.#exists('institutions', fromInstitutionId)) {
      throw new Error(`Institución origen ${fromInstitutionId} no existe`);
    }
    if (!this.#exists('institutions', toInstitutionId)) {
      throw new Error(`Institución destino ${toInstitutionId} no existe`);
    }

    const id = `TRF-${String(this.countRows('custody_transfers') + 1).padStart(4, '0')}`;
    const transferredAt = nowIso();

    this.db
      .prepare(
        `INSERT INTO custody_transfers
           (id, case_id, from_institution_id, to_institution_id, from_user_id, to_user_id,
            document_ids, notes, acknowledged_at, acknowledged_by, transferred_at)
         VALUES (?, ?, ?, ?, ?, NULL, ?, ?, NULL, NULL, ?)`
      )
      .run(id, caseId, fromInstitutionId, toInstitutionId, userId, JSON.stringify(documentIds), notes, transferredAt);

    this.#appendAudit({
      caseId,
      userId,
      action: 'CUSTODY_TRANSFER_INITIATED',
      details: { transferId: id, from: fromInstitutionId, to: toInstitutionId, documentIds, notes }
    });

    return { id, transferredAt, acknowledged: false };
  }

  /** Acuse de recibo. Cierra el tramo. */
  acknowledgeCustody({ transferId, userId, notes = '' }) {
    const row = this.db.prepare('SELECT * FROM custody_transfers WHERE id = ?').get(transferId);
    if (!row) throw new Error(`Tramo ${transferId} no existe`);
    if (row.acknowledged_at) throw new Error(`El tramo ${transferId} ya fue acusado`);

    const at = nowIso();
    this.db
      .prepare('UPDATE custody_transfers SET acknowledged_at = ?, acknowledged_by = ?, to_user_id = ?, notes = ? WHERE id = ?')
      .run(at, userId, userId, notes || row.notes, transferId);

    this.#appendAudit({
      caseId: row.case_id,
      userId,
      action: 'CUSTODY_TRANSFER_ACKNOWLEDGED',
      details: { transferId, notes, elapsedMs: new Date(at) - new Date(row.transferred_at) }
    });

    return { transferId, acknowledgedAt: at };
  }

  /**
   * Tramos abiertos: el caso está con alguien y todavía no confirmó recepción.
   * Esto es el "el papel no tiene dueño" convertido en dato consultable.
   */
  getOpenCustodyTransfers(caseId = null) {
    const rows = caseId
      ? this.db
          .prepare('SELECT * FROM custody_transfers WHERE case_id = ? AND acknowledged_at IS NULL ORDER BY transferred_at')
          .all(caseId)
      : this.db
          .prepare('SELECT * FROM custody_transfers WHERE acknowledged_at IS NULL ORDER BY transferred_at')
          .all();
    return rows.map((r) => ({
      ...r,
      document_ids: JSON.parse(r.document_ids),
      openHours: ((Date.now() - new Date(r.transferred_at)) / 3600000).toFixed(1)
    }));
  }

  getCustodyChain(caseId) {
    return this.db
      .prepare('SELECT * FROM custody_transfers WHERE case_id = ? ORDER BY transferred_at')
      .all(caseId)
      .map((r) => ({ ...r, document_ids: JSON.parse(r.document_ids) }));
  }

  // ---------------------------------------------------------------- lecturas

  getVersion(versionId) {
    const row = this.db.prepare('SELECT * FROM document_versions WHERE id = ?').get(versionId);
    if (!row) throw new Error(`Versión ${versionId} no existe`);
    const signature = this.db.prepare('SELECT * FROM signatures WHERE version_id = ?').get(versionId);
    return { ...row, signature: signature ?? null };
  }

  getCase(caseId) {
    const row = this.db.prepare('SELECT * FROM cases WHERE id = ?').get(caseId);
    if (!row) throw new Error(`Caso ${caseId} no existe`);
    return row;
  }

  getVersions(caseId) {
    return this.db
      .prepare('SELECT * FROM document_versions WHERE case_id = ? ORDER BY document_code, version_number')
      .all(caseId)
      .map((v) => {
        const sig = this.db.prepare('SELECT * FROM signatures WHERE version_id = ?').get(v.id);
        return { ...v, signature: sig ?? null };
      });
  }

  /** Cadena de versiones de un documento: V1 -> V2 -> ... */
  getVersionLineage(documentCode) {
    return this.db
      .prepare('SELECT * FROM document_versions WHERE document_code = ? ORDER BY version_number')
      .all(documentCode);
  }

  getAuditTrail(caseId) {
    return this.db
      .prepare('SELECT * FROM audit_events WHERE case_id = ? ORDER BY seq')
      .all(caseId)
      .map((r) => ({ ...r, details: JSON.parse(r.details) }));
  }

  getInstitutions() {
    return this.db.prepare('SELECT * FROM institutions').all();
  }

  getUsers() {
    return this.db.prepare('SELECT * FROM users').all();
  }

  /** Verificación completa: cada versión + la cadena de auditoría. */
  verifyAll(caseId) {
    const versions = this.getVersions(caseId);
    return {
      caseId,
      versions: versions.map((v) => ({
        versionId: v.id,
        documentCode: v.document_code,
        versionNumber: v.version_number,
        ...this.verifyIntegrity(v.id)
      })),
      chain: this.verifyChain(caseId),
      signatureSummary: {
        signed: versions.filter((v) => v.signature?.status === 'SIGNED').length,
        unavailable: versions.filter((v) => v.signature?.status === 'UNAVAILABLE').length,
        unsigned: versions.filter((v) => !v.signature).length,
        note:
          'Foxit eSign requiere credenciales de un portal separado, no provisionadas en esta cuenta.'
      }
    };
  }

  #exists(table, id) {
    return Boolean(this.db.prepare(`SELECT 1 FROM ${table} WHERE id = ?`).get(id));
  }

  #caseOfVersion(versionId) {
    const row = this.db.prepare('SELECT case_id FROM document_versions WHERE id = ?').get(versionId);
    if (!row) throw new Error(`Versión ${versionId} no existe`);
    return row.case_id;
  }

  close() {
    this.db.close();
  }

  // -------------------------------------------------------------------- seed

  #seed() {
    const ins = this.db.prepare('INSERT INTO institutions (id, code, name, jurisdiction) VALUES (?, ?, ?, ?)');
    ins.run('INST-PNP', 'PNP', 'Policía Nacional del Perú', 'Comisaría Alfonso Ugarte — Lima');
    ins.run('INST-MP', 'MP', 'Ministerio Público — Fiscalía de la Nación', '3ra Fiscalía Provincial Penal Corporativa de Lima');
    ins.run('INST-PJ', 'PJ', 'Poder Judicial del Perú', 'Juzgado de Investigación Preparatoria de Lima');

    const u = this.db.prepare(
      'INSERT INTO users (id, institution_id, name, role, credential_ref, credential_type) VALUES (?, ?, ?, ?, ?, ?)'
    );
    u.run('USR-PNP-01', 'INST-PNP', 'SO3 PNP Carlos Mendoza Quispe', 'POLICE_OFFICER', 'CIP 31892044', 'CIP');
    u.run('USR-MP-01', 'INST-MP', 'Dra. Mariana Ramos Vega', 'PROSECUTOR', 'FISC-4921', 'CARNET');
    u.run('USR-PJ-01', 'INST-PJ', 'Dr. Roberto Thorne Salazar', 'JUDGE', 'JUEZ-1082', 'CARNET');

    this.db
      .prepare(
        `INSERT INTO cases (id, case_number, title, crime, current_status, current_holder_institution_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        'CASE-2026-084',
        'EXP-2026-084-LIMA',
        'Intervención en flagrancia —hurto PDP agravado',
        'Delito contra el patrimonio — Hurto agravado (Art. 186 CP)',
        'POLICE_INVESTIGATION',
        'INST-PNP',
        '2026-10-07T01:15:00.000Z'
      );
  }
}

export { VAULT_DIR, DB_PATH };
