-- ============================================================
-- MedTravelApp — Schema SQL v1.2.3
-- 008_seeds.sql
-- CHANGELOG v1.2:
--   B9: operational_limits con todos los TTLs — sin valores hardcodeados
--   B4: seeds usan params.catalog_id() para referencias cruzadas
-- ============================================================

-- ── DOMINIOS DE CATÁLOGO ─────────────────────────────────────
INSERT INTO params.domain_catalogs (code, name_es, name_en, allows_tenant_override, is_ordered) VALUES
('GENDER',                   'Género',                             'Gender',                         FALSE, FALSE),
('DOCUMENT_TYPE',            'Tipo de documento',                  'Document type',                  FALSE, FALSE),
('COUNTRY',                  'País',                               'Country',                        FALSE, FALSE),
('RELATIONSHIP_TYPE',        'Tipo de relación',                   'Relationship type',               FALSE, FALSE),
('MFA_METHOD',               'Método MFA',                         'MFA method',                     FALSE, FALSE),
('DEVICE_TYPE',              'Tipo de dispositivo',                'Device type',                    FALSE, FALSE),
('SESSION_REVOKE_REASON',    'Razón de revocación',                'Session revoke reason',          FALSE, FALSE),
('APP_VARIANT_TYPE',         'Tipo de variante de app',            'App variant type',               FALSE, FALSE),
('MEMBER_STATUS',            'Estado del member',                  'Member status',                  FALSE, FALSE),
('IMPORT_STATUS',            'Estado de importación',              'Import status',                  FALSE, FALSE),
('MATCH_TYPE',               'Tipo de coincidencia',               'Match type',                     FALSE, FALSE),
('MATCH_STATUS',             'Estado de coincidencia',             'Match status',                   FALSE, FALSE),
('MATCH_DECISION',           'Decisión de coincidencia',           'Match decision',                 FALSE, FALSE),
('ASSISTANCE_PLAN_TYPE',     'Tipo de plan de asistencia',         'Assistance plan type',           TRUE,  FALSE),
('COVERAGE_CATEGORY',        'Categoría de cobertura',             'Coverage category',              TRUE,  FALSE),
('COVERAGE_SCOPE',           'Alcance de cobertura',               'Coverage scope',                 FALSE, FALSE),
('SPONSOR_TYPE',             'Tipo de patrocinador',               'Sponsor type',                   FALSE, FALSE),
('CARD_TIER',                'Nivel de tarjeta',                   'Card tier',                      FALSE, TRUE),
('ACQUISITION_CHANNEL',      'Canal de adquisición',               'Acquisition channel',            FALSE, FALSE),
('ENROLLMENT_STATUS',        'Estado de enrollment',               'Enrollment status',              FALSE, FALSE),
('VERIFICATION_SOURCE',      'Fuente de verificación',             'Verification source',            FALSE, FALSE),
('VERIFICATION_STATUS',      'Estado de verificación',             'Verification status',            FALSE, FALSE),
('ELIGIBILITY_RULE_TYPE',    'Tipo de regla de elegibilidad',      'Eligibility rule type',          FALSE, FALSE),
('CERTIFICATE_STATUS',       'Estado de certificado',              'Certificate status',             FALSE, FALSE),
('HEALTH_COVERAGE_TYPE',     'Tipo de cobertura de salud',         'Health coverage type',           FALSE, FALSE),
('COVERAGE_STATUS',          'Estado de cobertura',                'Coverage status',                FALSE, FALSE),
('SYNC_TYPE',                'Tipo de sincronización',             'Sync type',                      FALSE, FALSE),
('SYNC_STATUS',              'Estado de sincronización',           'Sync status',                    FALSE, FALSE),
('ALLERGEN_TYPE',            'Tipo de alérgeno',                   'Allergen type',                  FALSE, FALSE),
('REACTION_TYPE',            'Tipo de reacción',                   'Reaction type',                  FALSE, FALSE),
('REACTION_SEVERITY',        'Severidad de reacción',              'Reaction severity',              FALSE, TRUE),
('CONDITION_STATUS',         'Estado de condición',                'Condition status',               FALSE, FALSE),
('TRAVEL_RISK',              'Riesgo de viaje',                    'Travel risk',                    FALSE, TRUE),
('DOSE_UNIT',                'Unidad de dosis',                    'Dose unit',                      FALSE, FALSE),
('DOSE_FORM',                'Forma farmacéutica',                 'Dose form',                      FALSE, FALSE),
('FREQUENCY_CODE',           'Código de frecuencia',               'Frequency code',                 FALSE, FALSE),
('ADMINISTRATION_ROUTE',     'Vía de administración',              'Administration route',           FALSE, FALSE),
('SURGICAL_APPROACH',        'Abordaje quirúrgico',                'Surgical approach',              FALSE, FALSE),
('SURGERY_OUTCOME',          'Resultado de cirugía',               'Surgery outcome',                FALSE, FALSE),
('MEASURED_BY',              'Medido por',                         'Measured by',                    FALSE, FALSE),
('MEASUREMENT_CONTEXT',      'Contexto de medición',               'Measurement context',            FALSE, FALSE),
('BLOOD_TYPE',               'Grupo sanguíneo',                    'Blood type',                     FALSE, FALSE),
('AI_RISK_LEVEL',            'Nivel de riesgo IA',                 'AI risk level',                  FALSE, TRUE),
('ACCESS_LEVEL',             'Nivel de acceso al documento',       'Document access level',          FALSE, TRUE),
('CLINICAL_DOCUMENT_TYPE',   'Tipo de documento clínico',          'Clinical document type',         FALSE, FALSE),
('DOCUMENT_STATUS',          'Estado del documento',               'Document status',                FALSE, FALSE),
('SOURCE_TYPE',              'Tipo de fuente',                     'Source type',                    FALSE, FALSE),
('PROVENANCE_TYPE',          'Tipo de provenance',                 'Provenance type',                FALSE, FALSE),
('CANONICAL_STATUS',         'Estado canónico',                    'Canonical status',               FALSE, TRUE),
('CONFIRMATION_STATUS',      'Estado de confirmación',             'Confirmation status',            FALSE, FALSE),
('CERTIFICATION_STATUS',     'Estado de certificación',            'Certification status',           FALSE, FALSE),
('DELETION_REASON',          'Razón de eliminación regulada',      'Regulated deletion reason',      FALSE, FALSE),
('PROFESSIONAL_TRUST_LEVEL', 'Nivel de confianza profesional',     'Professional trust level',       FALSE, TRUE),
('VERIFICATION_METHOD',      'Método de verificación',             'Verification method',            FALSE, FALSE),
('ENCOUNTER_TYPE',           'Tipo de encuentro clínico',          'Encounter type',                 FALSE, FALSE),
('ENCOUNTER_STATUS',         'Estado de encuentro clínico',        'Encounter status',               FALSE, FALSE),
('SUBMISSION_TYPE',          'Tipo de submission clínica',         'Clinical submission type',       FALSE, FALSE),
('REVIEW_PRIORITY',          'Prioridad de revisión',              'Review priority',                FALSE, TRUE),
('REVIEW_DECISION',          'Decisión de revisión',               'Review decision',                FALSE, FALSE),
('LOCATION_TYPE',            'Tipo de lugar de atención',          'Location type',                  FALSE, FALSE),
('ORG_VERIFICATION_STATUS',  'Estado de verificación de org.',     'Organization verification',      FALSE, FALSE),
('ORG_PIPELINE_STATUS',      'Estado en pipeline de dedup.',       'Organization pipeline status',   FALSE, FALSE),
('AI_AGENT_TYPE',            'Tipo de agente IA',                  'AI agent type',                  FALSE, FALSE),
('AI_PROCESS_STATUS',        'Estado de proceso IA',               'AI process status',              FALSE, FALSE),
('TOKEN_TYPE',               'Tipo de token de emergencia',        'Emergency token type',           FALSE, FALSE),
('TOKEN_STATUS',             'Estado de token',                    'Token status',                   FALSE, FALSE),
('OFFLINE_STATUS',           'Estado de acceso offline',           'Offline access status',          FALSE, FALSE),
('RECIPIENT_TYPE',           'Tipo de destinatario del token',     'Token recipient type',           FALSE, FALSE),
('ACCESSOR_TYPE',            'Tipo de acceso a la ficha',          'Record accessor type',           FALSE, FALSE),
('ACCESS_METHOD',            'Método de acceso a la ficha',        'Record access method',           FALSE, FALSE),
('TRIP_STATUS',              'Estado de viaje',                    'Trip status',                    FALSE, FALSE),
('DESTINATION_STATUS',       'Estado de destino de viaje',         'Trip destination status',        FALSE, FALSE),
('CASE_ORIGIN',              'Origen del caso de emergencia',      'Emergency case origin',          FALSE, FALSE),
('EMERGENCY_TYPE',           'Tipo de emergencia',                 'Emergency type',                 TRUE,  FALSE),
('CASE_PRIORITY',            'Prioridad del caso',                 'Case priority',                  TRUE,  TRUE),
('CASE_STATUS',              'Estado del caso',                    'Case status',                    TRUE,  TRUE),
('RESOLUTION_TYPE',          'Tipo de resolución',                 'Resolution type',                TRUE,  FALSE),
('PARTICIPANT_TYPE',         'Tipo de participante en caso',       'Case participant type',          FALSE, FALSE),
('MEDICAL_EVENT_TYPE',       'Tipo de evento médico en caso',      'Case medical event type',        TRUE,  FALSE),
('SLA_TYPE',                 'Tipo de SLA',                        'SLA type',                       TRUE,  FALSE),
('CHANNEL_TYPE',             'Tipo de canal de chat',              'Chat channel type',              TRUE,  FALSE),
('CHANNEL_STATUS',           'Estado de canal de chat',            'Chat channel status',            FALSE, FALSE),
('SENDER_TYPE',              'Tipo de remitente',                  'Sender type',                    FALSE, FALSE),
('MESSAGE_TYPE',             'Tipo de mensaje',                    'Message type',                   FALSE, FALSE),
('MESSAGE_STATUS',           'Estado de mensaje',                  'Message status',                 FALSE, FALSE),
('OPERATOR_TYPE',            'Tipo de operador',                   'Operator type',                  TRUE,  FALSE),
('OPERATOR_STATUS',          'Estado de operador',                 'Operator status',                FALSE, FALSE),
('PRESENCE_STATUS',          'Estado de presencia',                'Presence status',                FALSE, FALSE),
('ACCESS_REQUEST_STATUS',    'Estado de solicitud de acceso B2B',  'B2B access request status',      FALSE, FALSE),
('ACCESS_SCOPE',             'Alcance de acceso B2B',              'B2B access scope',               FALSE, FALSE),
('NOTIFICATION_TYPE',        'Tipo de notificación',               'Notification type',              TRUE,  FALSE),
('CHANGED_BY_TYPE',          'Quién realizó el cambio',            'Changed by type',                FALSE, FALSE);

-- ── VALORES DE SISTEMA — estados MTA-511 ─────────────────────
-- canonical_status
WITH d AS (SELECT id FROM params.domain_catalogs WHERE code = 'CANONICAL_STATUS')
INSERT INTO params.catalog_values (domain_id, code, label_es, label_en, label_pt, display_order, is_system, lifecycle_status, metadata)
SELECT d.id, v.code, v.es, v.en, v.pt, v.ord, TRUE, 'ACTIVE', v.meta::JSONB
FROM d, (VALUES
  ('PROVISIONAL',  'Provisional',   'Provisional',  'Provisional',  1, '{"color":"#C9A24B","show_warning":true}'),
  ('IN_CANONICAL', 'En historial',  'In canonical', 'No histórico', 2, '{"color":"#1F7A6C","show_warning":false}'),
  ('REJECTED',     'Rechazado',     'Rejected',     'Rejeitado',    3, '{"color":"#C75A33","show_warning":true}')
) AS v(code, es, en, pt, ord, meta);

-- confirmation_status
WITH d AS (SELECT id FROM params.domain_catalogs WHERE code = 'CONFIRMATION_STATUS')
INSERT INTO params.catalog_values (domain_id, code, label_es, label_en, label_pt, display_order, is_system, lifecycle_status, metadata)
SELECT d.id, v.code, v.es, v.en, v.pt, v.ord, TRUE, 'ACTIVE', v.meta::JSONB
FROM d, (VALUES
  ('PENDING',           'Pendiente de confirmación',  'Pending confirmation',   'Pendente',        1, '{"requires_action":true}'),
  ('MEMBER_CONFIRMED',  'Confirmado por el titular',  'Confirmed by member',    'Confirmado',      2, '{"requires_action":false}'),
  ('MEMBER_CHALLENGED', 'Impugnado por el titular',   'Challenged by member',   'Impugnado',       3, '{"requires_action":true,"show_warning":true}')
) AS v(code, es, en, pt, ord, meta);

-- certification_status
WITH d AS (SELECT id FROM params.domain_catalogs WHERE code = 'CERTIFICATION_STATUS')
INSERT INTO params.catalog_values (domain_id, code, label_es, label_en, label_pt, display_order, is_system, lifecycle_status, metadata)
SELECT d.id, v.code, v.es, v.en, v.pt, v.ord, TRUE, 'ACTIVE', v.meta::JSONB
FROM d, (VALUES
  ('UNCERTIFIED',              'Sin certificar',                  'Uncertified',                  'Não certificado',              1, '{"weight":1}'),
  ('PROFESSIONALLY_CERTIFIED', 'Certificado profesionalmente',    'Professionally certified',     'Certificado profissionalmente', 2, '{"weight":3,"badge":"certified"}')
) AS v(code, es, en, pt, ord, meta);

-- professional trust levels MTA-511
WITH d AS (SELECT id FROM params.domain_catalogs WHERE code = 'PROFESSIONAL_TRUST_LEVEL')
INSERT INTO params.catalog_values (domain_id, code, label_es, label_en, display_order, is_system, lifecycle_status, metadata)
SELECT d.id, v.code, v.es, v.en, v.ord, TRUE, 'ACTIVE', v.meta::JSONB
FROM d, (VALUES
  ('REGISTERED',             'Registrado — email verificado',     'Registered — email verified',          1, '{"mfa_required":false,"can_certify":false,"submits_provisional":true}'),
  ('IDENTITY_VERIFIED',      'Identidad verificada',              'Identity verified',                    2, '{"mfa_required":false,"can_certify":false,"submits_provisional":true}'),
  ('LICENSE_DECLARED',       'Matrícula declarada (no verificada)','License declared (unverified)',        3, '{"mfa_required":false,"can_certify":false,"submits_provisional":true}'),
  ('PROFESSIONAL_CERTIFIED', 'Profesional certificado',           'Professionally certified',             4, '{"mfa_required":true,"can_certify":true,"submits_canonical":true}'),
  ('INSTITUTION_VERIFIED',   'Institución verificada (Fase 3)',   'Institution verified (Phase 3)',        5, '{"mfa_required":true,"can_certify":true,"submits_canonical":true,"phase":3}')
) AS v(code, es, en, ord, meta);

-- token types
WITH d AS (SELECT id FROM params.domain_catalogs WHERE code = 'TOKEN_TYPE')
INSERT INTO params.catalog_values (domain_id, code, label_es, label_en, display_order, is_system, lifecycle_status, metadata)
SELECT d.id, v.code, v.es, v.en, v.ord, TRUE, 'ACTIVE', v.meta::JSONB
FROM d, (VALUES
  -- B9: TTLs no hardcodeados aquí — se leen de operational_limits en runtime
  ('DYNAMIC_QR',      'QR dinámico',           'Dynamic QR',           1, '{"anti_replay":true,"limit_key":"TOKEN_DYNAMIC_QR_TTL_SECONDS"}'),
  ('PRE_QR',          'Pre-QR offline',         'Pre-generated QR',     2, '{"offline_capable":true,"limit_key":"TOKEN_PRE_QR_TTL_HOURS"}'),
  ('EMERGENCY_LINK',  'Link de emergencia',     'Emergency link',       3, '{"configurable":true,"limit_key":"TOKEN_EMERGENCY_LINK_MAX_HOURS"}'),
  ('DOCTOR_INVITE',   'Invitación a médico',    'Doctor invitation',    4, '{"limit_key":"TOKEN_DOCTOR_INVITE_TTL_DAYS"}'),
  ('ASSISTANCE_ACCESS','Acceso de asistencia',  'Assistance access',    5, '{"tied_to_enrollment":true,"limit_key":"TOKEN_ASSISTANCE_ACCESS_TTL_HOURS"}')
) AS v(code, es, en, ord, meta);

-- case statuses
WITH d AS (SELECT id FROM params.domain_catalogs WHERE code = 'CASE_STATUS')
INSERT INTO params.catalog_values (domain_id, code, label_es, label_en, display_order, is_system, lifecycle_status, metadata)
SELECT d.id, v.code, v.es, v.en, v.ord, TRUE, 'ACTIVE', v.meta::JSONB
FROM d, (VALUES
  ('OPEN',            'Abierto',              'Open',             1, '{"color":"#E8754A","terminal":false}'),
  ('ATTENDING',       'En atención',          'Attending',        2, '{"color":"#C9A24B","terminal":false}'),
  ('IN_PROGRESS',     'En proceso',           'In progress',      3, '{"color":"#1F7A6C","terminal":false}'),
  ('WAITING',         'En espera',            'Waiting',          4, '{"color":"#5B6B7D","terminal":false}'),
  ('RESOLVED',        'Resuelto',             'Resolved',         5, '{"color":"#1F7A6C","terminal":true}'),
  ('CLOSED',          'Cerrado',              'Closed',           6, '{"color":"#10243E","terminal":true}'),
  ('CANCELLED',       'Cancelado',            'Cancelled',        7, '{"color":"#5B6B7D","terminal":true}')
) AS v(code, es, en, ord, meta);

-- member status
WITH d AS (SELECT id FROM params.domain_catalogs WHERE code = 'MEMBER_STATUS')
INSERT INTO params.catalog_values (domain_id, code, label_es, label_en, display_order, is_system, lifecycle_status)
SELECT d.id, v.code, v.es, v.en, v.ord, TRUE, 'ACTIVE'
FROM d, (VALUES
  ('ACTIVE',    'Activo',     'Active',     1),
  ('INACTIVE',  'Inactivo',   'Inactive',   2),
  ('SUSPENDED', 'Suspendido', 'Suspended',  3),
  ('PENDING',   'Pendiente',  'Pending',    4)
) AS v(code, es, en, ord);

-- changed_by type (para triggers)
WITH d AS (SELECT id FROM params.domain_catalogs WHERE code = 'CHANGED_BY_TYPE')
INSERT INTO params.catalog_values (domain_id, code, label_es, label_en, display_order, is_system, lifecycle_status)
SELECT d.id, v.code, v.es, v.en, v.ord, TRUE, 'ACTIVE'
FROM d, (VALUES
  ('SYSTEM',    'Sistema',    'System',     1),
  ('USER',      'Usuario',    'User',       2),
  ('OPERATOR',  'Operador',   'Operator',   3),
  ('ADMIN',     'Admins.',    'Admin',      4)
) AS v(code, es, en, ord);

-- ── B9: OPERATIONAL LIMITS — todos los TTLs parametrizados ───
-- Ningún valor de tiempo está hardcodeado en la lógica de la app
-- La aplicación llama a getOperationalLimit('KEY') en runtime
INSERT INTO params.operational_limits (tenant_id, limit_key, limit_value, unit, description_es, requires_approval, lifecycle_status)
VALUES
  -- Tokens QR — reemplaza los 60s, 72h, 7d hardcodeados
  (NULL, 'TOKEN_DYNAMIC_QR_TTL_SECONDS',      60,    'SECONDS',  'Vigencia del QR dinámico en segundos',                              TRUE,  'ACTIVE'),
  (NULL, 'TOKEN_PRE_QR_TTL_HOURS',            72,    'HOURS',    'Vigencia del pre-QR offline en horas',                             FALSE, 'ACTIVE'),
  (NULL, 'TOKEN_EMERGENCY_LINK_MAX_HOURS',    72,    'HOURS',    'Vigencia máxima de link de emergencia en horas',                    FALSE, 'ACTIVE'),
  (NULL, 'TOKEN_DOCTOR_INVITE_TTL_DAYS',      7,     'DAYS',     'Vigencia de invitación a médico en días',                          FALSE, 'ACTIVE'),
  (NULL, 'TOKEN_ASSISTANCE_ACCESS_TTL_HOURS', 24,    'HOURS',    'Vigencia de acceso de asistencia en horas',                        FALSE, 'ACTIVE'),
  (NULL, 'TOKEN_OFFLINE_ACCESS_MAX_HOURS',    48,    'HOURS',    'Vigencia máxima de acceso offline firmado',                        TRUE,  'ACTIVE'),

  -- Sessions
  (NULL, 'SESSION_ACCESS_TOKEN_MINUTES',      15,    'MINUTES',  'Vigencia del access token JWT (minutos)',                           TRUE,  'ACTIVE'),
  (NULL, 'SESSION_REFRESH_TOKEN_DAYS',        7,     'DAYS',     'Vigencia del refresh token (días)',                                TRUE,  'ACTIVE'),
  (NULL, 'OPERATOR_SESSION_HOURS',            8,     'HOURS',    'Vigencia de sesión de operador (horas)',                           FALSE, 'ACTIVE'),

  -- Password reset
  (NULL, 'PASSWORD_RESET_TOKEN_MINUTES',      30,    'MINUTES',  'Vigencia de token de recuperación de contraseña',                  FALSE, 'ACTIVE'),

  -- MFA
  (NULL, 'MFA_OTP_MINUTES',                  5,     'MINUTES',  'Vigencia del OTP de MFA (minutos)',                                FALSE, 'ACTIVE'),
  (NULL, 'PROFESSIONAL_CERT_OTP_MINUTES',    15,    'MINUTES',  'Vigencia del OTP para certificación profesional',                  FALSE, 'ACTIVE'),

  -- SLA — reemplaza los 180s hardcodeados
  (NULL, 'CASE_SLA_FIRST_RESPONSE_SECONDS',  180,   'SECONDS',  'SLA de primera respuesta en casos de emergencia (segundos)',        TRUE,  'ACTIVE'),
  (NULL, 'CASE_SLA_ESCALATION_SECONDS',      600,   'SECONDS',  'SLA de escalamiento de caso (segundos)',                           TRUE,  'ACTIVE'),
  (NULL, 'CASE_SLA_RESOLUTION_HOURS',        24,    'HOURS',    'SLA de resolución de caso (horas)',                                TRUE,  'ACTIVE'),

  -- Offline sync
  (NULL, 'OFFLINE_SYNC_WARNING_HOURS',       24,    'HOURS',    'Umbral de advertencia de desactualización de ficha offline',        FALSE, 'ACTIVE'),
  (NULL, 'OFFLINE_SCREEN_TIMEOUT_MINUTES',   5,     'MINUTES',  'Timeout de pantalla de emergencia sin conectividad',               FALSE, 'ACTIVE'),

  -- Operaciones
  (NULL, 'PANIC_BUTTON_HOLD_SECONDS',        3,     'SECONDS',  'Segundos de pulsación para activar el botón de pánico',            FALSE, 'ACTIVE'),
  (NULL, 'MAX_ACTIVE_TOKENS_PER_MEMBER',     5,     'COUNT',    'Máximo de tokens activos simultáneos por member',                  FALSE, 'ACTIVE'),
  (NULL, 'ANALYTICS_CACHE_REFRESH_MINUTES',  15,    'MINUTES',  'Frecuencia de actualización del cache de analytics del portal B2B', FALSE, 'ACTIVE'),
  (NULL, 'ANALYTICS_MIN_K_ANONYMITY',        10,    'COUNT',    'Mínimo de registros por celda estadística (k-anonimato)',           TRUE,  'ACTIVE'),
  (NULL, 'MAX_TRIP_DESTINATIONS',            10,    'COUNT',    'Máximo de destinos por viaje',                                     FALSE, 'ACTIVE'),
  (NULL, 'CHAT_MAX_FILE_SIZE_MB',            20,    'MB',       'Tamaño máximo de archivo adjunto en chat',                         FALSE, 'ACTIVE'),
  (NULL, 'COVERAGE_VERIFICATION_DAYS',       30,    'DAYS',     'Frecuencia de verificación automática de elegibilidad de cobertura', FALSE, 'ACTIVE');

-- ── RETENTION POLICIES (C4) ───────────────────────────────────
INSERT INTO params.retention_policies (entity_type, jurisdiction, regulation, retention_days, archive_after_days, anonymize_after_days, action_on_expiry, legal_basis, lifecycle_status)
VALUES
  ('clinical.*',   'AR', 'LOCAL', 3650, 3285, NULL,  'ARCHIVE',        'Ley 26.529 — Derechos del Paciente', 'ACTIVE'),
  ('clinical.*',   'BR', 'LGPD',  2555, 2190, NULL,  'ANONYMIZE',      'LGPD Art. 16 — Dados sensíveis de saúde', 'ACTIVE'),
  ('clinical.*',   'EU', 'GDPR',  2555, 2190, NULL,  'ANONYMIZE',      'GDPR Art. 9 — Special category data', 'ACTIVE'),
  ('clinical.*',   'US', 'HIPAA', 2555, NULL, NULL,  'ARCHIVE',        'HIPAA §164.530(j) — Record retention', 'ACTIVE'),
  ('audit.*',      'AR', 'LOCAL', 1825, NULL, NULL,  'ARCHIVE',        'Retención de registros de auditoría', 'ACTIVE'),
  ('audit.*',      'EU', 'GDPR',  1825, NULL, NULL,  'ARCHIVE',        'GDPR — Audit trail retention', 'ACTIVE'),
  ('core.users',   'EU', 'GDPR',   730, NULL,  365,  'ANONYMIZE',      'GDPR Art. 17 — Right to erasure', 'ACTIVE'),
  ('core.users',   'BR', 'LGPD',   730, NULL,  365,  'ANONYMIZE',      'LGPD Art. 18 — Direito à eliminação', 'ACTIVE'),
  ('emergency.*',  'EU', 'GDPR',  1095, NULL,  730,  'ANONYMIZE',      'GDPR — Minimización de datos de emergencia', 'ACTIVE');

-- ══════════════════════════════════════════════════════════════
-- B3/B9/B11: Seeds adicionales v1.2
-- ══════════════════════════════════════════════════════════════

-- B3: Límite de break-glass desde operational_limits
INSERT INTO params.operational_limits
  (tenant_id, limit_key, limit_value, unit, description_es, requires_approval, lifecycle_status)
VALUES
  (NULL, 'BREAK_GLASS_MAX_HOURS', 4, 'HOURS',
   'Máxima vigencia de una autorización break-glass para acceso clínico de emergencia',
   TRUE, 'ACTIVE')
ON CONFLICT (tenant_id, limit_key) DO NOTHING;

-- B9: Consent purpose para cobertura médica habitual
INSERT INTO params.consent_purposes
  (code, name_es, name_en, description_es, legal_basis, data_categories)
VALUES (
  'HEALTH_COVERAGE_ACCESS',
  'Acceso a cobertura médica habitual',
  'Access to regular health coverage data',
  'Autorización explícita para que una empresa de asistencia al viajero acceda '
  'a los datos de cobertura médica habitual del titular (obra social, prepaga, seguro). '
  'Este consentimiento es independiente del acceso clínico.',
  'CONSENT',
  ARRAY['health_coverage', 'insurance']
)
ON CONFLICT (tenant_id, code) DO NOTHING;

-- ══════════════════════════════════════════════════════════════
-- C6: Seeds de parametrización break-glass
-- ══════════════════════════════════════════════════════════════
INSERT INTO params.domain_catalogs (code, name_es, name_en, allows_tenant_override)
VALUES
  ('BG_PURPOSE',    'Finalidad de acceso break-glass', 'Break-glass access purpose', FALSE),
  ('BG_LEGAL_BASIS','Base legal de acceso break-glass','Break-glass legal basis',    FALSE)
ON CONFLICT (code) DO NOTHING;

WITH d AS (SELECT id FROM params.domain_catalogs WHERE code = 'BG_PURPOSE')
INSERT INTO params.catalog_values (domain_id, code, label_es, label_en, display_order, is_system, lifecycle_status)
SELECT d.id, v.code, v.es, v.en, v.ord, TRUE, 'ACTIVE'
FROM d, (VALUES
  ('CLINICAL_EMERGENCY',  'Emergencia clínica activa',    'Active clinical emergency',   1),
  ('LEGAL_INVESTIGATION', 'Investigación legal',          'Legal investigation',         2),
  ('AUDIT_COMPLIANCE',    'Auditoría de cumplimiento',    'Compliance audit',            3),
  ('PATIENT_REQUEST',     'Solicitud del titular',        'Patient request',             4)
) AS v(code, es, en, ord)
ON CONFLICT (domain_id, tenant_id, code) DO NOTHING;

WITH d AS (SELECT id FROM params.domain_catalogs WHERE code = 'BG_LEGAL_BASIS')
INSERT INTO params.catalog_values (domain_id, code, label_es, label_en, display_order, is_system, lifecycle_status)
SELECT d.id, v.code, v.es, v.en, v.ord, TRUE, 'ACTIVE'
FROM d, (VALUES
  ('GDPR_ART9',     'GDPR Art. 9 — Datos de salud',    'GDPR Art. 9 — Health data',   1),
  ('LAW_26529',     'Ley 26.529 — Derechos Paciente',  'Law 26529 — Patient rights',  2),
  ('LGPD_ART11',    'LGPD Art. 11 — Datos sensíveis',  'LGPD Art. 11 — Sensitive',    3),
  ('LEGAL_ORDER',   'Orden judicial',                   'Court order',                 4)
) AS v(code, es, en, ord)
ON CONFLICT (domain_id, tenant_id, code) DO NOTHING;

-- Límite operativo para duración de break-glass simple (sin segundo aprobador)
INSERT INTO params.operational_limits
  (tenant_id, limit_key, limit_value, unit, description_es, requires_approval, lifecycle_status)
VALUES
  (NULL, 'BREAK_GLASS_SIMPLE_MAX_HOURS', 2, 'HOURS',
   'Duración máxima de break-glass sin segundo aprobador', TRUE, 'ACTIVE')
ON CONFLICT (tenant_id, limit_key) DO NOTHING;
