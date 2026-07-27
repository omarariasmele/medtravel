-- ============================================================
-- Gap #13 (SCHEMA_GAPS.md): el staff de un tenant necesita poder ver
-- el nombre de sus propios viajeros (pantalla "Usuarios / viajeros" de
-- admin-web) — decisión de producto confirmada: el operador SÍ puede
-- ver los datos básicos de identidad de los members de su tenant.
--
-- Esto es una política SELECT adicional, no un reemplazo de
-- persons_self_access (003_core_identity.sql, B3): esa sigue siendo la
-- única que aplica a INSERT/UPDATE/DELETE, así que un operador puede
-- LEER pero nunca editar el registro de un viajero directamente — la
-- edición del perfil sigue siendo exclusiva del propio titular vía
-- /me/profile. Postgres combina políticas permisivas con OR para el
-- mismo comando, así que esto solo AMPLÍA quién puede leer, nunca
-- restringe el acceso que el titular ya tenía sobre su propia fila.
-- ============================================================

CREATE POLICY persons_tenant_member_select ON core.persons
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM core.members m
      WHERE m.person_id = persons.id
        AND m.tenant_id = app.current_uuid('app.current_tenant_id')
    )
  );
