-- ============================================================
-- Gap #59 (continuación): msg_select (007_operations.sql) tampoco
-- tenía el bypass de administrador de plataforma — encontrado
-- construyendo el chat de operador en admin-web: aunque el auto-join
-- (events.gateway.ts) ya suma al operador de OYSGROUP como
-- case_participant de un caso de AXA (gracias al fix de
-- core.has_tenant_access), msg_select exige ADEMÁS que
-- ec.tenant_id = current_tenant_id — sin el bypass acá, el operador
-- podía unirse a la sala pero nunca ver el historial de mensajes.
--
-- Auditoría rápida encontró 4 políticas más con el mismo patrón
-- (audit.data_audit_events, coverage.travel_assistance_certificates,
-- emergency.tokens, operations.tenant_analytics_cache) — quedan
-- pendientes de revisión aparte, no bloquean nada hoy.
-- ============================================================

ALTER POLICY msg_select ON operations.chat_messages
  USING (
    (
      case_id IN (
        SELECT ec.id FROM operations.emergency_cases ec
        WHERE ec.tenant_id = app.current_uuid('app.current_tenant_id')
           OR ec.member_id IN (
                SELECT id FROM core.members
                WHERE person_id = app.current_uuid('app.current_person_id')
              )
      )
      OR core.current_operator_can_manage_config()
    )
    AND channel_id IN (
      SELECT ch.id FROM operations.chat_channels ch
      JOIN operations.case_participants cp ON cp.case_id = ch.case_id
      WHERE cp.is_active = TRUE
        AND (
          cp.member_id IN (
            SELECT id FROM core.members
            WHERE person_id = app.current_uuid('app.current_person_id')
          )
          OR cp.operator_id = app.current_uuid('app.current_user_id')
        )
    )
  );
