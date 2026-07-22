# Gaps encontrados en el schema SQL v1.2.3 aprobado

Este documento consolida los gaps reales encontrados en el schema
**v1.2.3** (Baseline Candidate, 2026-07-20, 31/31 tests) al construir
`nestjs-api` contra el servidor real de desarrollo. Ninguno de estos
archivos toca el baseline aprobado (`src/database/sql/000_extensions.sql`
… `009_tests.sql`) — todos son parches aplicados a mano contra la base
de desarrollo, guardados como `src/database/sql/proposed-*.sql` o
`fix-*.sql`, pendientes de revisión para sumarse a **v1.2.4**.

Por qué el test suite del schema (009_tests.sql, 31/31 passed) no
detectó ninguno de estos: todo indica que corrió como superuser o como
un rol con privilegios más amplios que `app_runtime`, así que nunca
ejercitó las políticas RLS ni los `GRANT` reales tal como los usa la
app en producción.

## 1. `002_params.sql` no tiene ningún `GRANT` a `app_runtime`

**Archivo:** [`fix-002-missing-params-grants.sql`](src/database/sql/fix-002-missing-params-grants.sql)

A diferencia de 001 (audit), 003 (core), 004 (coverage), 005/006
(clinical), y 007 (operations/emergency) — que sí otorgan
`SELECT/INSERT/UPDATE` a `app_runtime` sobre sus propias tablas —
`002_params.sql` solo tiene `GRANT USAGE ON SCHEMA` (en
`000_extensions.sql`), nada a nivel de tabla. Sin este fix, **cualquier
query de la app sobre las 23 tablas de `params.*` falla** con
`permiso denegado a la tabla ...`.

**Encontrado:** al probar `GET /params/catalogs/:domainCode` contra el
servidor real por primera vez.

## 2. `core.users` no tiene ninguna política `SELECT` — login imposible sin una función de bypass

**Archivo:** [`proposed-core-login-credentials-function.sql`](src/database/sql/proposed-core-login-credentials-function.sql)

`core.users` tiene RLS habilitada y forzada (por diseño, fail-secure)
pero **sin ninguna `CREATE POLICY ... FOR SELECT`** — a diferencia de
`core.persons`/`core.members`/`core.member_contacts`/`core.security_sessions`,
que sí tienen su política de acceso. Esto bloquea el único caso de uso
que necesita leer `core.users` sin tener aún un `app.current_user_id` de
sesión: **el propio login**.

Se agregó `core.get_login_credentials(email_blind_index)` —
`SECURITY DEFINER`, mismo patrón que `clinical.has_clinical_access` —
que resuelve `core.users` + `core.authentication_credentials` por
`email_blind_index`, con `EXECUTE` revocado de `PUBLIC` y otorgado solo
a `app_runtime`.

**Encontrado:** al implementar el login real.

## 3. `008_seeds.sql` no define los dominios de catálogo para chat ni para participantes de caso

Ni siquiera el *dominio* (`params.domain_catalogs`), no solo los
valores, para: `CHAT_SENDER_TYPE`, `CHAT_MESSAGE_TYPE`,
`CHAT_MESSAGE_STATUS`, `CHAT_CHANNEL_TYPE`, `CHAT_CHANNEL_STATUS`,
`CASE_PARTICIPANT_TYPE`. Sin esto, `operations.chat_messages`,
`operations.chat_channels` y `operations.case_participants` no se
pueden insertar nunca — sus FKs `NOT NULL` a `params.catalog_values`
no tienen ningún valor real que referenciar.

**Estado:** agregados como fixture de test (ver
`test/support/test-user.ts` / conversación de desarrollo), **no** en un
archivo `proposed-*.sql` — falta decidir los códigos definitivos junto
con el equipo de diseño antes de proponer un `008_seeds_v1.2.4.sql`.

**Encontrado:** al implementar y probar el chat en tiempo real.

## 4. No hay claves de `operational_limits` para el bloqueo de cuenta por intentos fallidos

`AUTH_MAX_FAILED_ATTEMPTS` y `AUTH_LOCKOUT_MINUTES` no existen en
`008_seeds.sql` — a diferencia de `TOKEN_*`, `CASE_SLA_*`, etc., que sí
siguen el patrón B9 (nada de TTLs/umbrales hardcodeados). Se sembraron
a mano contra el servidor de desarrollo con valores por defecto
razonables (5 intentos / 15 minutos).

**Estado:** sembradas directamente, no hay un archivo `proposed-*.sql`
separado (son solo dos `INSERT` en una tabla que ya existe con su
estructura correcta).

**Encontrado:** al mover el lockout de `AuthService` de constantes
hardcodeadas a `params.operational_limits`.

## 5. `app_runtime` no tiene ningún `GRANT` sobre `audit.data_anonymization_jobs`, y la anonimización real necesita otra función `SECURITY DEFINER`

**Archivo:** [`proposed-anonymization-support.sql`](src/database/sql/proposed-anonymization-support.sql)

Mismo patrón que el gap #1: solo el owner (`postgres`) tiene privilegios
sobre esa tabla. Además, anonimizar un campo en una tabla con RLS
forzada (ej. `core.persons`) para un `row_id` arbitrario no es posible
por el camino normal de RLS — un job de background no tiene el
`app.current_person_id` de nadie. Se agregó `audit.anonymize_field()`
(`SECURITY DEFINER`, usa `format('%I', ...)` para armar SQL dinámico de
forma segura, validando contra `information_schema.columns` antes de
ejecutar).

**Encontrado:** al implementar la lógica real del job de anonimización.

## 6. `core.mfa_methods` quedó sin RLS habilitada, y el domain `MFA_METHOD` no tiene ningún `catalog_value`

**Archivo:** [`proposed-mfa-methods-hardening.sql`](src/database/sql/proposed-mfa-methods-hardening.sql)

`003_core_identity.sql` habilita RLS en `core.persons`, `core.users`,
`core.members`, `core.member_contacts`, `core.member_data_consents` y
`core.security_sessions` (con su política `sessions_self`), pero
**`core.mfa_methods` no está en esa lista** — a diferencia de
`security_sessions`, que es su análogo directo y sí tiene
`user_id = app.current_uuid('app.current_user_id')`. Sin esto, cualquier rol con el `GRANT` de
`app_runtime` podía leer o pisar el `mfa_methods` de **cualquier**
usuario, no solo el propio. Se agregó `mfa_methods_self` con el mismo
patrón que `sessions_self`.

Además, `008_seeds.sql` línea 15 define el *domain* `MFA_METHOD` pero
nunca sus `catalog_values` (a diferencia de `MEMBER_STATUS`,
`DOCUMENT_TYPE`, etc., que sí tienen valores sembrados) — sin un valor
`TOTP`, `params.catalog_id('MFA_METHOD','TOTP')` devuelve `NULL` y el
`INSERT` en `mfa_methods` falla por `NOT NULL` en `method_type_id`. Se
sembró el valor `TOTP` (único método implementado hoy; `SMS`/`EMAIL`
quedan para cuando se implementen esos flujos).

**Encontrado:** al implementar MFA (TOTP) real (`POST /auth/mfa/enroll`
+ `verify` + `disable`, integrado a `login()`).

---

## Qué hacer con esto

1. Revisar cada patch con el equipo de diseño (el mismo proceso que
   aprobó v1.2.3 — ver `MedTravelApp_MTA511_ModeloLogico.docx` y
   `CHANGELOG_v1.2.3.md`).
2. Decidir si van tal cual a v1.2.4, o si alguno amerita un diseño
   distinto (en particular, los dominios de catálogo de chat — sus
   códigos exactos son una decisión de producto, no solo técnica).
3. Una vez aprobados, promoverlos a archivos numerados del baseline
   (ej. `010_v1.2.4_fixes.sql`) en vez de quedar como `proposed-*`/`fix-*`
   sueltos.
