-- ============================================================
-- Gap encontrado: core.partner_member_records / identity_match_candidates /
-- identity_match_decisions no tenían NINGUNA política de RLS — ni
-- siquiera ENABLE ROW LEVEL SECURITY — a pesar de tener GRANT INSERT/
-- SELECT/UPDATE para app_runtime desde 003_core_identity.sql. Exponerlas
-- tal cual (como requiere la carga de pólizas por parte de la empresa de
-- seguros/asistencia) hubiera dejado que cualquier operador viera pólizas
-- de cualquier empresa. Mismo patrón tenant-scoped que ya se usó para
-- members/cases/trips/enrollments (proposed-platform-tenant-and-config-
-- bypass.sql): la empresa ve lo suyo, OYSGROUP ve todo.
-- ============================================================

ALTER TABLE core.partner_member_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.partner_member_records FORCE ROW LEVEL SECURITY;

CREATE POLICY partner_member_records_access ON core.partner_member_records
  USING (
    tenant_id = app.current_uuid('app.current_tenant_id')
    OR core.current_operator_can_manage_config()
  )
  WITH CHECK (
    tenant_id = app.current_uuid('app.current_tenant_id')
    OR core.current_operator_can_manage_config()
  );

GRANT SELECT, INSERT, UPDATE ON core.partner_member_records TO app_runtime;

ALTER TABLE core.identity_match_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.identity_match_candidates FORCE ROW LEVEL SECURITY;

CREATE POLICY identity_match_candidates_access ON core.identity_match_candidates
  USING (
    EXISTS (
      SELECT 1 FROM core.partner_member_records pmr
      WHERE pmr.id = identity_match_candidates.partner_record_id
        AND pmr.tenant_id = app.current_uuid('app.current_tenant_id')
    )
    OR core.current_operator_can_manage_config()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM core.partner_member_records pmr
      WHERE pmr.id = identity_match_candidates.partner_record_id
        AND pmr.tenant_id = app.current_uuid('app.current_tenant_id')
    )
    OR core.current_operator_can_manage_config()
  );

GRANT SELECT, INSERT, UPDATE ON core.identity_match_candidates TO app_runtime;

ALTER TABLE core.identity_match_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.identity_match_decisions FORCE ROW LEVEL SECURITY;

CREATE POLICY identity_match_decisions_access ON core.identity_match_decisions
  USING (
    EXISTS (
      SELECT 1 FROM core.identity_match_candidates c
      JOIN core.partner_member_records pmr ON pmr.id = c.partner_record_id
      WHERE c.id = identity_match_decisions.candidate_id
        AND pmr.tenant_id = app.current_uuid('app.current_tenant_id')
    )
    OR core.current_operator_can_manage_config()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM core.identity_match_candidates c
      JOIN core.partner_member_records pmr ON pmr.id = c.partner_record_id
      WHERE c.id = identity_match_decisions.candidate_id
        AND pmr.tenant_id = app.current_uuid('app.current_tenant_id')
    )
    OR core.current_operator_can_manage_config()
  );

GRANT SELECT, INSERT ON core.identity_match_decisions TO app_runtime;
