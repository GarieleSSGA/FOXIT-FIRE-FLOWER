-- =====================================================================
-- PROYECTO: FOXIT - FIRE FLOWER
-- ARQUITECTURA DE CONFIANZA: DATAHUB & CRYPTOGRAPHIC LINEAGE SCHEMA
-- Compatible con: SQLite 3, PostgreSQL 14+, MySQL 8+
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. TABLA PRINCIPAL DE DATAHUB (Contexto y Metadata de Documentos)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS datahub_documents (
    document_id         VARCHAR(64) PRIMARY KEY,
    project_id          VARCHAR(64) NOT NULL,
    document_type       VARCHAR(64) NOT NULL,   -- 'STRUCTURAL_REPORT', 'REGULATORY_STANDARD'
    version             VARCHAR(16) NOT NULL,   -- 'v1.0', 'v2026.1'
    source_file_path    VARCHAR(255) NOT NULL,
    source_sha256       VARCHAR(64) NOT NULL,
    author_inspector    VARCHAR(64) NOT NULL,
    audit_date          DATE NOT NULL,
    total_columns       INT NOT NULL,
    human_audit_status  VARCHAR(32) DEFAULT 'APPROVED',
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------------------
-- 2. TABLA DE LINEAGE / DOCUMENT DNA (Árbol de Procedencia y Trazabilidad)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lineage_nodes (
    node_id             VARCHAR(64) PRIMARY KEY,
    document_id         VARCHAR(64) NOT NULL,
    step_sequence       INT NOT NULL,           -- 1: Raw Ingest, 2: SHA-256 Seal, 3: AI Extract, 4: Human Review
    step_name           VARCHAR(128) NOT NULL,
    step_type           VARCHAR(64) NOT NULL,   -- 'SOURCE', 'CRYPTO_SEAL', 'AI_MAPPING', 'HUMAN_OVERSIGHT'
    sha256_hash         VARCHAR(64) NOT NULL,
    parent_node_id      VARCHAR(64),
    status              VARCHAR(32) NOT NULL,   -- 'VERIFIED', 'GROUND_TRUTH_VALID'
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (document_id) REFERENCES datahub_documents(document_id)
);

-- ---------------------------------------------------------------------
-- 3. TABLA DE ELEMENTOS ESTRUCTURALES AUDITADOS (11 Columnas de Obra)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS structural_elements (
    element_id          VARCHAR(32) PRIMARY KEY,
    document_id         VARCHAR(64) NOT NULL,
    element_type        VARCHAR(64) NOT NULL,   -- 'Viga Concreto', 'Columna Ppal.', 'Losa'
    location_grid       VARCHAR(64) NOT NULL,   -- Ejes y niveles
    design_capacity_kn  DECIMAL(10, 2) NOT NULL,
    applied_load_kn     DECIMAL(10, 2) NOT NULL,
    safety_factor       DECIMAL(5, 2) NOT NULL, -- Capacidad / Carga
    material_spec       VARCHAR(128) NOT NULL,  -- Calidad de hormigón y acero
    inspection_date     DATE NOT NULL,
    inspector_id        VARCHAR(64) NOT NULL,
    compliance_status   VARCHAR(16) NOT NULL,   -- 'PASS', 'FAIL'
    notes               TEXT,
    FOREIGN KEY (document_id) REFERENCES datahub_documents(document_id)
);

-- ---------------------------------------------------------------------
-- 4. TABLA DE NORMATIVA SISMORRESISTENTE NSR-10 (9 Columnas Técnicas)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS regulatory_standards (
    norm_id             VARCHAR(32) PRIMARY KEY,
    element_type        VARCHAR(64) NOT NULL,
    min_safety_factor   DECIMAL(5, 2) NOT NULL,
    max_deflection      VARCHAR(32) NOT NULL,
    required_concrete   VARCHAR(32) NOT NULL,
    max_load_allowance  DECIMAL(10, 2) NOT NULL,
    seismic_zone        VARCHAR(64) NOT NULL,
    regulatory_body     VARCHAR(128) NOT NULL,
    effective_date      DATE NOT NULL
);

-- =====================================================================
-- INSERCIÓN DE DATOS SEMILLA (GROUND TRUTH AUDITADO A1 + NORMA NSR-10)
-- =====================================================================

-- Registros de DataHub
INSERT OR REPLACE INTO datahub_documents 
(document_id, project_id, document_type, version, source_file_path, source_sha256, author_inspector, audit_date, total_columns, human_audit_status)
VALUES 
('DOC-A1-202601', 'PRJ-FIRE-FLOWER-2026', 'STRUCTURAL_REPORT', 'v1.0', 'base_de_datos/A1_REPORTE_ESTRUCTURAL_CLEAN_ENERO_2026.csv', 'e81b29a03c84f18d729b4721f8a11394c8b209d736a19f2d1e028f8d91c2b53a', 'ENG-8821', '2026-01-15', 11, 'APPROVED'),
('NORM-NSR-10-2026', 'PRJ-FIRE-FLOWER-2026', 'REGULATORY_STANDARD', 'v2026.1', 'base_de_datos/NORMATIVA_ESTRUCTURAL_NSR10_2026.csv', '7f3a88c1b994e55a019d82264b18ec0319ca7208d519bfe25471904a58913b82', 'Comision Sismica', '2026-01-01', 9, 'APPROVED');

-- Registros de Lineage (Document DNA DAG)
INSERT OR REPLACE INTO lineage_nodes 
(node_id, document_id, step_sequence, step_name, step_type, sha256_hash, parent_node_id, status)
VALUES 
('LIN-A1-01', 'DOC-A1-202601', 1, 'Fuente Primaria CSV (Ground Truth)', 'SOURCE', 'e81b29a03c84f18d729b4721f8a11394c8b209d736a19f2d1e028f8d91c2b53a', NULL, 'GROUND_TRUTH_VALID'),
('LIN-A1-02', 'DOC-A1-202601', 2, 'Firma Criptográfica SHA-256 Inmutable', 'CRYPTO_SEAL', 'e81b29a03c84f18d729b4721f8a11394c8b209d736a19f2d1e028f8d91c2b53a', 'LIN-A1-01', 'VERIFIED'),
('LIN-A1-03', 'DOC-A1-202601', 3, 'Extracción y Mapeo de 11 Columnas por IA', 'AI_MAPPING', 'sha256:mapping_a1_nsr10_ruleset', 'LIN-A1-02', 'VERIFIED'),
('LIN-A1-04', 'DOC-A1-202601', 4, 'Supervisión y Aprobación Humana', 'HUMAN_OVERSIGHT', 'sha256:human_audit_eng8821_sig', 'LIN-A1-03', 'APPROVED');

-- Registros de Elementos Estructurales
INSERT OR REPLACE INTO structural_elements 
(element_id, document_id, element_type, location_grid, design_capacity_kn, applied_load_kn, safety_factor, material_spec, inspection_date, inspector_id, compliance_status, notes)
VALUES 
('BEAM-V101', 'DOC-A1-202601', 'Viga Concreto Armado', 'Piso 1 - Eje A-B', 800.0, 450.0, 1.78, 'Hormigon H-30 / B500S', '2026-01-15', 'ENG-8821', 'PASS', 'Conforme NSR-10'),
('BEAM-V102', 'DOC-A1-202601', 'Viga Concreto Armado', 'Piso 1 - Eje B-C', 800.0, 465.0, 1.72, 'Hormigon H-30 / B500S', '2026-01-15', 'ENG-8821', 'PASS', 'Carga dentro de rango'),
('BEAM-V104', 'DOC-A1-202601', 'Viga Concreto Armado', 'Piso 1 - Eje D-E', 600.0, 410.0, 1.46, 'Hormigon H-30 / B500S', '2026-01-15', 'ENG-8821', 'PASS', 'Margen aceptable'),
('COL-C201', 'DOC-A1-202601', 'Columna Principal', 'Sotano - Eje 1-A', 1200.0, 620.0, 1.94, 'Hormigon H-45 / B500S', '2026-01-15', 'ENG-8821', 'PASS', 'Compresion conforme'),
('COL-C202', 'DOC-A1-202601', 'Columna Principal', 'Sotano - Eje 2-A', 1200.0, 635.0, 1.89, 'Hormigon H-45 / B500S', '2026-01-15', 'ENG-8821', 'PASS', 'Flector verificado'),
('SLAB-L301', 'DOC-A1-202601', 'Losa Aligerada', 'Piso 1 - Central', 500.0, 280.0, 1.79, 'Viguetas Pretensadas', '2026-01-15', 'ENG-8821', 'PASS', 'Distribucion uniforme');

-- Registros de Normativa NSR-10
INSERT OR REPLACE INTO regulatory_standards 
(norm_id, element_type, min_safety_factor, max_deflection, required_concrete, max_load_allowance, seismic_zone, regulatory_body, effective_date)
VALUES 
('NORM-NSR10-VIG', 'Viga Concreto Armado', 1.50, 'L/360', 'H-30', 800.0, 'Zona 4 (Alta Sismicidad)', 'Comision Sismica', '2026-01-01'),
('NORM-NSR10-COL', 'Columna Principal', 1.75, 'L/500', 'H-45', 1200.0, 'Zona 4 (Alta Sismicidad)', 'Comision Sismica', '2026-01-01'),
('NORM-NSR10-LOS', 'Losa Aligerada', 1.50, 'L/360', 'H-25', 500.0, 'Zona 4 (Alta Sismicidad)', 'Comision Sismica', '2026-01-01');
