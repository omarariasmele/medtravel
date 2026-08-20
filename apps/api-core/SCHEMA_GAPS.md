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

## 7. `operations.trips` y `operations.trip_destinations` no tienen RLS

**Archivo:** [`proposed-trips-rls.sql`](src/database/sql/proposed-trips-rls.sql)

`007_operations.sql` habilita RLS en `emergency.tokens`,
`operations.emergency_cases`, `operations.chat_messages` y
`operations.tenant_analytics_cache`, pero **no en `operations.trips` ni
`operations.trip_destinations`** — a pesar de compartir el mismo modelo
de dueño (`member_id → core.members`) que `coverage.travel_assistance_enrollments`
(`enrollments_access`) y `coverage.health_coverages`
(`health_coverages_access`), que sí están protegidas. Sin esto,
`GET/POST/PATCH/DELETE /operations/trips` (CRUD genérico) exponía los
viajes de **cualquier** member a cualquier usuario autenticado — fechas,
destinos, todo. Se agregó `trips_access`/`trip_destinations_access` con
el mismo patrón que `enrollments_access`.

**Encontrado:** al escribir tests e2e de RLS para el módulo operations.

## 8. Varias tablas de `operations` expuestas por CRUD genérico nunca tuvieron RLS propia

**Tablas:** `case_participants`, `chat_channels`, `message_attachments`,
`message_reads`, `chat_translations`, `tenant_access_requests`,
`operator_roles`, `operators`, `operator_presence`.

Ninguna de estas tiene ni `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` ni
`CREATE POLICY` en `007_operations.sql` — solo el `GRANT` a
`app_runtime` (que en varias incluye `UPDATE`). El caso más serio es
`case_participants`: controla quién puede unirse/leer un caso de
emergencia, y el gateway de Socket.io (`events.gateway.ts`,
`findActiveParticipant()`) hace su propia verificación de membresía
precisamente **porque** esta tabla no tiene RLS — pero el CRUD genérico
de REST no pasaba por esa verificación, así que cualquier usuario
autenticado podía leer o alterar la lista de participantes de
**cualquier** caso, no solo el propio. `operators`/`operator-roles`/
`operator-presence` tienen el mismo problema con el directorio de
operadores entre tenants (`GRANT` incluye `UPDATE`).

**Estado: RESUELTO** (2026-07-23), tras la decisión de producto sobre
el modelo de acceso — ver
[`proposed-tenant-access-model.sql`](src/database/sql/proposed-tenant-access-model.sql):

- Un operador normal siempre queda acotado a su propio tenant
  (`tenant_id = app.current_tenant_id`) en `operators`, `operator_roles`,
  `operator_presence`, `case_participants`, `chat_channels`,
  `message_attachments`, `message_reads`, `chat_translations`,
  `tenant_access_requests`.
- El Superadmin de OYSGROUP accede cross-tenant únicamente vía un
  mecanismo nuevo, mellizo de `audit.break_glass_grants` pero
  tenant-scoped: `audit.tenant_break_glass_grants` (solicitud + segundo
  aprobador distinto del solicitante + vigencia acotada por
  `TENANT_BREAK_GLASS_MAX_HOURS` + auditoría inmutable en
  `audit.data_audit_events`). El gate `core.has_tenant_access(tenant_id)`
  es lo que usan todas las políticas nuevas.
- `case_participants`/`chat_channels`/etc. vuelven a estar en el CRUD:
  `case_participants` y `chat_channels` tienen ahora un `SELECT`
  adicional para el participante activo de su propio caso (vía
  `operations.is_active_case_participant()`, una función
  `SECURITY DEFINER` — necesaria porque la política de
  `case_participants` consulta la misma tabla que protege; sin
  `SECURITY DEFINER` esa auto-referencia causaba una reevaluación
  recursiva de la política en cada fila, ~4x más lento en los tests
  e2e). El resto (`message_attachments`/`message_reads`/
  `chat_translations`) reutiliza esa misma función.
- `case_participants` salió del CRUD genérico plano y pasó a un
  controller dedicado (`case-participants.controller.ts`, ruta anidada
  `operations/cases/:caseId/participants`), igual que
  `emergency-cases.controller.ts` — emite `case_update` por Socket.io
  después de cada alta/baja de participante. También se agregó
  `GRANT UPDATE` (faltaba, necesario para poder "quitar" un participante
  vía `is_active = FALSE` en vez de un DELETE que nunca existió).
- `TenantBreakGlassService` (`tenant-break-glass.service.ts`) expone
  `request`/`approve`/`revoke`, pero **todavía no tiene controller ni
  guard** — falta decidir qué usuarios pueden siquiera solicitar acceso
  a un tenant ajeno antes de exponerlo por HTTP.
- `operators`/`operator_roles`/`operator_presence` tienen `tenant_id`
  nullable en el schema aprobado — una fila con `tenant_id NULL`
  representa un operador de plataforma (Superadmin OYSGROUP), y quedaba
  invisible con las políticas de arriba (fail-secure). **Resuelto**
  (ver [`proposed-password-reset-and-smtp.sql`](src/database/sql/proposed-password-reset-and-smtp.sql)):
  `core.is_platform_operator()` (SECURITY DEFINER, mismo motivo que
  `is_active_case_participant`) agrega el carve-out — un operador con
  `tenant_id NULL` se ve a sí mismo y a sus pares de plataforma, un
  operador de tenant normal nunca los ve. El rol `PLATFORM_SUPERADMIN`
  (`can_manage_config = TRUE`) ya está sembrado; falta el paso manual de
  bootstrap (crear el primer `operations.operators` real con ese rol).
- **NOTA LEGAL:** `BG_LEGAL_BASIS.CONTRACTUAL_SUPPORT` es un placeholder
  — confirmar la redacción real con el equipo legal antes de v1.2.4.

**Encontrado:** al escribir tests e2e de RLS para el módulo operations.

## 9. `004_coverage.sql` solo tiene `GRANT` para una de sus 14 tablas

**Archivo:** [`fix-004-missing-coverage-grants.sql`](src/database/sql/fix-004-missing-coverage-grants.sql)

Mismo patrón que el gap #1 (`002_params.sql`): de las 14 tablas de
`coverage.*`, solo `coverage.travel_assistance_certificates` tiene
`GRANT` a `app_runtime` — las otras 11 expuestas por el CRUD genérico
(`assistance-plans`, `plan-coverages`, `coverage-sponsors`,
`card-networks`, `card-issuers`, `card-benefit-programs`,
`travel-assistance-enrollments`, `coverage-acquisition-channels`,
`member-card-benefit-links`, `coverage-eligibility-rules`,
`health-coverages`) fallaban con `permiso denegado a la tabla ...` en
**cualquier** operación, sin importar que la política RLS correspondiente
(ej. `hc_insert`) lo permitiera — el `GRANT` es un requisito previo e
independiente de RLS en Postgres.

**Encontrado:** al escribir el test e2e de RLS del módulo coverage — el
primer intento de crear una `health_coverage` para el propio member daba
403 en vez de 201; el diagnóstico mostró que no era un rechazo de RLS
(`new row violates row-level security policy`) sino de permisos
(`permiso denegado a la tabla health_coverages`).

## 10. `core.persons`/`core.users` no tienen ningún camino de alta propia (registro)

**Archivo:** [`proposed-registration.sql`](src/database/sql/proposed-registration.sql)

Mismo tipo de gap que el #2 (login): ambas tablas tienen RLS forzada sin
ninguna política que permita el INSERT pre-auth —
`persons_self_access` exige `id = current_person_id`, que todavía no
existe en el momento del alta; `core.users` directamente no tiene
ninguna política (ni de SELECT ni de INSERT). Sin un camino controlado,
**no hay forma de que un viajero se registre solo** — necesario para el
Paso 1 del brief operativo (`POST /auth/register`). Se agregó
`core.register_person_and_user()` (`SECURITY DEFINER`, mismo patrón que
`core.get_login_credentials`): crea `persons` + `users` +
`authentication_credentials` atómicamente, sin crear ningún
`core.members` — pertenecer a un tenant es una relación aparte
(enrollment/importación), no parte del alta de la persona.

**Encontrado:** al implementar la API `/me/*` (Paso 1 del brief).

## 11. La mayoría de los `domain_catalogs` no tienen ningún `catalog_value` sembrado

**Archivo:** [`proposed-mvp-catalog-values.sql`](src/database/sql/proposed-mvp-catalog-values.sql)

`008_seeds.sql` crea la taxonomía completa (~100 `domain_catalogs`) pero
solo siembra `catalog_values` reales para un subconjunto — el resto son
"slots" vacíos a propósito (parametrización real, no hardcodeada en el
seed). Esto **no es un bug**, pero bloquea funcionalidad real del MVP:
sin ningún valor en `TRIP_STATUS`, `TOKEN_STATUS`, `HEALTH_COVERAGE_TYPE`,
`COVERAGE_STATUS`, `ALLERGEN_TYPE`, `REACTION_SEVERITY`,
`PROVENANCE_TYPE`, `ASSISTANCE_PLAN_TYPE` o `ENROLLMENT_STATUS`, ni
siquiera se puede crear un viaje, un token de emergencia o una alergia
(columnas `NOT NULL` sin ningún valor válido al que apuntar). Se
sembraron valores razonables para esos 9 dominios — quedan como
propuesta de producto, no como decisión técnica cerrada (los códigos
exactos los debería confirmar el equipo de diseño/producto).

**Encontrado:** al implementar la API `/me/*` — el primer intento de
`POST /me/trips` fallaba por `NOT NULL` en `status_id` sin ningún
`TRIP_STATUS` sembrado.

**Actualización (admin-web):** al crear el primer operador real para
probar el panel, `OPERATOR_TYPE` y `OPERATOR_STATUS` también estaban
vacíos (`operations.operators` los tiene `NOT NULL`). Se agregaron al
mismo patch (4 valores para `OPERATOR_TYPE`: AGENT/SUPERVISOR/MEDICAL/
ADMIN; 3 para `OPERATOR_STATUS`: ACTIVE/INACTIVE/ON_LEAVE), ya aplicados
contra el servidor real y verificados creando un operador de punta a
punta.

---

## 12. `ORGANIZATION_TYPE` y `MEDICAL_SPECIALTY` no existen ni como `domain_catalogs`; `DOCUMENT_TYPE` existe pero sin valores

**Archivo:** [`proposed-healthcare-directory-catalogs.sql`](src/database/sql/proposed-healthcare-directory-catalogs.sql)

**Encontrado:** al planear la pantalla "Centros médicos"/"Profesionales"
de admin-web. `clinical.healthcare_organizations.organization_type_id`
y `clinical.healthcare_professionals.specialty_id` son `NOT NULL`/
`nullable` sin ningún dominio al que apuntar — a diferencia del gap #11
(dominios que existen pero sin `catalog_values`), acá **el dominio en sí
no existe**. `DOCUMENT_TYPE` sí existe (la entidad lo referencia con el
nombre de comentario `DOC_TYPE`, pero el código real en
`params.domain_catalogs` es `DOCUMENT_TYPE`) — solo le faltaban valores,
mismo caso que gap #11.

**Resuelto** (confirmado con el usuario: "Sí, proponé valores
razonables"): se agregaron los dos dominios nuevos y se sembraron los
tres con valores típicos del rubro — quedan marcados como propuesta de
producto a revisar, no como decisión técnica cerrada.

**Actualización**: `CONDITION_STATUS` (dominio para
`clinical.conditions.status_id`) tenía el mismo problema — existía sin
valores. Se agregaron 4 (ACTIVE/RESOLVED/CHRONIC/IN_REMISSION) al
armar la sección de historia clínica del call center (gap #16).

## 13. `core.persons` no es accesible a operadores ni siquiera para mostrar el nombre de un viajero — es una decisión de diseño explícita, no un bug

**Encontrado:** al querer mostrar nombres reales en "Usuarios /
viajeros" de admin-web. `persons_self_access` (003_core_identity.sql,
B3) es explícita: *"El tenant NO accede a `core.persons` directamente
— el acceso del tenant es solo a través de `core.members`"*. Un
operador puede listar `core.members` de su tenant (política
`members_tenant_or_self`), pero no puede resolver el nombre del
titular: eso requeriría una política nueva tipo `persons_tenant_member`
(mismo patrón que gap #8) que hoy no existe.

**No lo toqué** porque es exactamente el tipo de cambio que el brief
pide no hacer en silencio ("nunca modificar la arquitectura de
seguridad ya aprobada sin documentarlo como nueva versión de schema") y
porque además es una decisión de privacidad real, no solo técnica: si
el modelo del producto es que el staff del tenant puede ver el nombre
de sus propios viajeros (razonable, es su cliente) o si eso requiere
algún nivel de consentimiento explícito (`core.member_data_consents`
ya existe para otra cosa, podría ser el lugar). Pendiente de decisión
antes de construir "Usuarios / viajeros" como pantalla real.

**Resuelto** (decisión de producto confirmada): ver
[`proposed-persons-tenant-read.sql`](src/database/sql/proposed-persons-tenant-read.sql)
— política `persons_tenant_member_select` adicional (no reemplaza
`persons_self_access`: sigue siendo la única que aplica a INSERT/UPDATE/DELETE,
el operador solo gana lectura). Ampliada en la ronda de RBAC (gap #17) con el
mismo bypass `core.current_operator_can_manage_config()` que el resto de las
tablas raíz, para que un superadmin de plataforma también pueda leer
`core.persons` cross-tenant.

## 14. `COUNTRY` existe como dominio pero nunca tuvo ningún `catalog_value` sembrado

**Archivo:** [`proposed-country-catalog.sql`](src/database/sql/proposed-country-catalog.sql)

**Encontrado:** al agregar campos de dirección real (país, provincia,
domicilio, teléfono) a "Centros médicos" en admin-web — el usuario
notó que un sistema global no puede quedarse con solo "ciudad" como
dato de ubicación. `core.persons.nationality_id`/`country_residence_id`,
`clinical.healthcare_organizations.country_id` y
`clinical.healthcare_professionals.country_id`/`license_country_id`
referencian todos el dominio `COUNTRY`, que existe desde `008_seeds.sql`
pero con 0 valores — mismo patrón que gap #11/#12.

**Resuelto:** se sembraron 165 países (código ISO 3166-1 alpha-2 +
nombre es/en) — cubre Latinoamérica, los mercados de turismo médico más
comunes y la mayoría de los países del mundo. Marcado como lista de
referencia a validar por el equipo de producto si necesitan la lista
oficial completa (195+ países/territorios) para uso legal/compliance.

## 15. `core.member_data_consents` tenía RLS habilitada sin ninguna política — bloqueaba el sistema de consentimiento entero, no solo un caso puntual

**Archivo:** [`proposed-member-data-consents-rls.sql`](src/database/sql/proposed-member-data-consents-rls.sql)

**Distinto a los gaps anteriores — esto es un bug real, no un catálogo
vacío.** `003_core_identity.sql` hace `ALTER TABLE core.member_data_consents
ENABLE ROW LEVEL SECURITY` pero nunca define ningún `CREATE POLICY` para
esa tabla. En Postgres, RLS habilitada sin ninguna política = denegar
TODO acceso a cualquier rol sin bypass — ni siquiera el propio titular
podía leer o dar de alta su propio consentimiento vía la API genérica
(`/identity/member-data-consents`, ya expuesta en `IDENTITY_REGISTRY`).

**Impacto concreto verificado:** `hc_select` (004_coverage.sql) hace un
`JOIN` contra `member_data_consents` para decidir si el tenant puede ver
la cobertura de un member con consentimiento otorgado — como ese JOIN
corre con los privilegios normales de `app_runtime` (no es
`SECURITY DEFINER`), la falta de política hacía que el JOIN devolviera
siempre vacío, **aunque el consentimiento existiera y estuviera
correctamente otorgado**. Lo encontré armando datos de prueba
para la pantalla "Coberturas" de admin-web: sembré member + coverage +
consentimiento a mano, y `GET /coverage/health-coverages` devolvía `[]`
de todos modos.

`clinical.has_clinical_access()` (000_extensions.sql) NO se ve afectada
porque es `SECURITY DEFINER` — corre como el owner de la función,
bypasseando RLS para su propio chequeo interno de consentimiento
clínico. El bug es específico de cualquier acceso que consulte la tabla
directamente bajo RLS normal, que hoy es solo `hc_select`.

**Resuelto:** se agregaron 3 políticas (`member_data_consents_select/
_insert/_update`), mismo patrón que `hc_select/hc_insert/hc_update`: el
tenant puede LEER el estado del consentimiento de sus members (para
decidir acceso), pero solo el propio titular puede otorgar/actualizar su
consentimiento — el tenant nunca puede consentir en nombre del viajero.
Verificado: `GET /coverage/health-coverages` ahora devuelve la cobertura
sembrada, y el e2e suite completo (22/22) sigue pasando sin
regresiones.

## 16. Encriptación a nivel de columna para texto libre sensible + acceso clínico para call center

**Archivos:** [`proposed-clinical-encryption.sql`](src/database/sql/proposed-clinical-encryption.sql),
[`proposed-anonymization-support.sql`](src/database/sql/proposed-anonymization-support.sql)
(actualizado)

**Pedido explícito del usuario**: *"si alguien roba la base de datos no
debería poder visualizar el nombre ni los datos de un usuario
viajero"*, más la necesidad real de que un call center pueda cargar/ver
antecedentes médicos de un viajero durante una llamada de asistencia.

No es un gap del schema — es una decisión de seguridad nueva, así que
se documenta acá con el mismo criterio que los demás cambios de RLS/
encriptación:

- **Encriptación**: se reutilizó el mecanismo ya existente para
  `core.users.email` (`core.encrypt_pii`/`decrypt_pii`, pgcrypto,
  clave por conexión vía `app.encryption_key`) — no una clave ni un
  esquema nuevo. Alcance: solo texto libre que identifica a una
  persona — `core.persons.first_name/last_name` y el texto libre de
  las 8 tablas clínicas (nombre de alergia/condición/medicamento/
  cirugía/vacuna, notas, etc.). Los UUID de catálogo y los valores
  numéricos de laboratorio/signos vitales quedan sin encriptar a
  propósito (no identifican a nadie por sí solos, y encriptarlos
  rompería el filtrado por valor que el propio schema pide para esos
  campos).
- `RlsCrudService` (`rls-crud.service.ts`) ganó un 3er parámetro
  opcional `encryptedFields` — cuando se usa, arma los reads con
  `QueryBuilder` (`core.decrypt_pii()`) y los writes con SQL
  parametrizado (`core.encrypt_pii()`) en vez de `manager.find/create/
  save`. El resto de los ~60 recursos genéricos no lo usa y sigue
  exactamente igual.
- `audit.anonymize_field()` (usada por los jobs de anonimización) pasó
  a chequear el `data_type` real de la columna — si es `bytea`, envuelve
  el valor nuevo en `core.encrypt_pii()` (y para HASH_IRREVERSIBLE,
  desencripta el original antes de hashearlo). Sin este cambio, un job
  de anonimización sobre `core.persons.first_name` habría escrito bytes
  crudos no-PGP, y la próxima lectura vía `decrypt_pii()` habría
  fallado.
- **Acceso clínico para call center**: no fue necesario ningún cambio
  de permisos — `clinical.has_clinical_access()` (000_extensions.sql)
  ya tiene un camino (#5, "caso de emergencia activo con este
  paciente") que se activa solo con el header HTTP `x-active-case-id`
  (ya soportado por `pg-session-context.interceptor.ts`, populando
  `app.active_case_id`). admin-web solo necesitaba mandar ese header
  desde la nueva sección "Historia clínica" en el detalle de un caso.

**Verificado end-to-end** contra el servidor real: contenido en bytea
ilegible directamente en la base (`SELECT first_name FROM core.persons`
devuelve bytes), decrypt correcto vía `/me/profile`,
`/identity/persons/:id` y `/clinical/allergies` (creado y leído
sembrado con el header de caso activo), y el e2e suite completo
(22/22) sin regresiones.

## 17. `core.tenants` nunca tuvo RLS habilitada — cualquier operador podía listar/editar TODAS las empresas del sistema

**Archivos:** [`proposed-tenants-rls.sql`](src/database/sql/proposed-tenants-rls.sql),
[`proposed-tenants-traveler-read.sql`](src/database/sql/proposed-tenants-traveler-read.sql),
[`proposed-platform-tenant-and-config-bypass.sql`](src/database/sql/proposed-platform-tenant-and-config-bypass.sql)

A diferencia del resto del sistema (members, cases, coverages, etc.), que sí está
scopeado por `tenant_id`, `core.tenants` era la única tabla raíz sin ninguna
restricción: `GET/PATCH/POST /identity/tenants` exponía y dejaba editar/crear
cualquier empresa a cualquier operador autenticado, de cualquier tenant.

Se agregó `tenants_self_or_config_admin` (un operador ve/edita solo su propio
tenant; `can_manage_config = TRUE` ve/administra todas) y
`core.current_operator_can_manage_config()` (`SECURITY DEFINER`, resuelve el
permiso del rol porque RLS solo puede leer GUCs de sesión, no el rol del
operador). Un viajero (sin `tenantId` de operador en su sesión) tampoco podía
ver el nombre de su propia empresa de asistencia aunque sí veía su enrollment —
`proposed-tenants-traveler-read.sql` amplía la política para incluir
`id IN (SELECT tenant_id FROM core.members WHERE person_id = ...)`.

Además, `core.tenants.is_platform_tenant` distingue OYSGROUP (administradora de
la plataforma) de las empresas de asistencia reales — sin esta columna no había
forma de separar "la plataforma" de "un cliente más" en el dashboard, ni de
confirmar que solo el tenant de plataforma tiene superusuarios. Con ese flag se
agregó también bypass de `can_manage_config` a `members_tenant_or_self`,
`cases_access`, `trips_access` y `enrollments_access` (para que OYSGROUP pueda
ver y filtrar por empresa en Viajes/Usuarios/Casos) — **a propósito sin tocar**
`coverage.health_coverages`: ese dato médico/obra social sigue exigiendo
consentimiento del titular incluso para OYSGROUP.

**Encontrado:** armando la pantalla "Empresas" del panel.

**Relacionado:** `operations.get_operator_login_context()` (ya existía) se
amplió en la misma ronda para devolver también los flags del rol
(`can_manage_config`/`can_manage_operators`/`can_close_cases`/
`can_access_medical`), llevados en el JWT — así el resto del sistema (guards de
ruta, menú de admin-web, las políticas de arriba) puede gatear sin una consulta
extra por request.

## 18. El schema `ai` tenía `GRANT` por tabla pero nunca `GRANT USAGE ON SCHEMA` — bloqueaba cualquier request al asistente

**Archivos:** [`proposed-ai-module.sql`](src/database/sql/proposed-ai-module.sql),
[`proposed-ai-schema-grant.sql`](src/database/sql/proposed-ai-schema-grant.sql)

Mismo patrón que los gaps #1/#9 (GRANT es un requisito previo e independiente de
RLS en Postgres), pero a nivel de esquema en vez de tabla: `ai.conversations`/
`ai.messages`/`ai.proposals` tenían `GRANT SELECT/INSERT/UPDATE` correctos, pero
sin `USAGE ON SCHEMA ai` Postgres rechaza cualquier acceso con "permiso denegado
al esquema ai" sin importar los grants de tabla. Detectado probando en vivo
`POST /me/health-assistant/chat` con `AI_ENABLED=true`.

De paso quedan documentadas acá las funciones `SECURITY DEFINER` que acompañan
al módulo (no son un gap, son necesarias porque `ai.messages` solo deja ver "lo
propio" a un viajero, y el dashboard de consumo — pedido explícito del usuario,
"ir monitoreando el consumo de agentes de IA en costos o tokens... un promedio
de consumo, quien consumió más que otro" — necesita agregados de TODOS los
usuarios): `ai.get_platform_summary()`, `ai.get_top_users()`,
`ai.get_daily_trend()` ([`proposed-ai-consumption-dashboard-fns.sql`](src/database/sql/proposed-ai-consumption-dashboard-fns.sql))
y `ai.get_consumption_totals()` ([`proposed-ai-consumption-totals-fn.sql`](src/database/sql/proposed-ai-consumption-totals-fn.sql),
para el chequeo de `AI_DAILY_BUDGET_USD`/`AI_MONTHLY_BUDGET_USD`). El controller
ya valida `canManageConfig` (`ConfigAccessGuard`) antes de llamarlas.

## 19. `operations.case_medical_events` tenía `GRANT` pero nunca se le habilitó RLS; `CASE_RESOLUTION_TYPE` y `NOTIFICATION_TYPE.BREAK_GLASS_ACCESS` sin sembrar

**Archivos:** [`proposed-case-medical-events-rls.sql`](src/database/sql/proposed-case-medical-events-rls.sql),
[`proposed-case-resolution-types.sql`](src/database/sql/proposed-case-resolution-types.sql),
[`proposed-break-glass-notification-type.sql`](src/database/sql/proposed-break-glass-notification-type.sql)

**Gap de seguridad real, mismo patrón que #8/#15/#20:** `007_operations.sql`
otorga `GRANT SELECT/INSERT` sobre `case_medical_events` (la bitácora de un
caso — notas de cada operador interviniente) pero nunca la habilita con RLS.
Sin este patch, cualquier operador autenticado de cualquier tenant podía leer o
insertar notas en la bitácora de cualquier caso de cualquier empresa. Se agregó
`case_medical_events_access` con el mismo criterio que `cases_access`: tenant
del caso, o el propio viajero titular.

Dos gaps de catálogo vacío acompañan esto (mismo patrón que #3/#11): el schema
ya tenía las columnas para cerrar un caso (`resolution_type_id`,
`resolution_notes`, `resolved_at`, `closed_at`, `closed_by` en
`operations.emergency_cases`) pero el dominio `CASE_RESOLUTION_TYPE` nunca se
creó — pedido explícito del usuario ("no veo que el cierre de un caso esté
contemplado en el modelo actual"), resuelto sembrando 8 valores. Y conectar
Break Glass clínico a HTTP por primera vez hubiera fallado por una violación de
constraint `NOT NULL`: el trigger `audit.log_break_glass_access()` inserta con
`params.catalog_id('NOTIFICATION_TYPE', 'BREAK_GLASS_ACCESS')`, pero el dominio
`NOTIFICATION_TYPE` nunca se sembró — nunca detectado porque el flujo nunca se
había ejercitado de punta a punta.

**Encontrado:** al construir el historial/bitácora de caso y el diálogo de
cierre de caso en admin-web.

## 20. Las tablas de matching de pólizas de partners nunca tuvieron RLS; nombre/documento del partner nunca se cifraron

**Archivos:** [`proposed-partner-matching-rls.sql`](src/database/sql/proposed-partner-matching-rls.sql),
[`proposed-partner-records-encryption.sql`](src/database/sql/proposed-partner-records-encryption.sql),
[`proposed-partner-records-gender.sql`](src/database/sql/proposed-partner-records-gender.sql),
[`proposed-partner-matching-catalogs.sql`](src/database/sql/proposed-partner-matching-catalogs.sql),
[`proposed-partner-matching-function.sql`](src/database/sql/proposed-partner-matching-function.sql)

**Gap de seguridad real:** `core.partner_member_records` /
`identity_match_candidates` / `identity_match_decisions` tenían `GRANT`
INSERT/SELECT/UPDATE para `app_runtime` desde `003_core_identity.sql`, pero
**ninguna política de RLS ni siquiera `ENABLE ROW LEVEL SECURITY`** — exponerlas
tal cual (como requiere que una empresa cargue sus pólizas) hubiera dejado que
cualquier operador viera las pólizas de cualquier empresa. Se agregó el mismo
patrón tenant-scoped ya usado para members/cases/trips/enrollments.

`core.partner_member_records.raw_name`/`raw_doc_number` habían quedado sin
cifrar en el diseño original (comentario "dato del partner, sin cifrar" en
`003_core_identity.sql`) — pero es nombre + documento de identidad de una
persona real, la misma clase de dato que ya se cifra en
`core.persons`/`external_identifiers`/`healthcare_professionals`. La tabla
nunca tuvo filas reales, así que la migración a `BYTEA` fue directa. También se
agregó `raw_gender` (dato crudo del partner, mismo patrón que `raw_doc_type`,
sin FK) — sin esto no se podía distinguir a dos personas que comparten número
de documento.

`proposed-partner-matching-function.sql` agrega `core.try_match_partner_record()`/
`core.try_match_pending_records_for_person()` (`SECURITY DEFINER`, matching v1
deliberadamente simple: solo exacto por `doc_number`) y
`proposed-partner-matching-catalogs.sql` siembra el dominio
`MATCH_CANDIDATE_STATUS` (no existía) y los valores de `MATCH_TYPE`/
`VERIFICATION_SOURCE`/`IMPORT_STATUS` (existían vacíos) que esas funciones
necesitan para poder insertar.

**Encontrado:** al conectar por primera vez la carga de pólizas de una empresa
a un controller real.

## 21. No existía un camino para que un viajero declare su propia póliza cuando la empresa todavía no la cargó

**Archivo:** [`proposed-member-declared-policies.sql`](src/database/sql/proposed-member-declared-policies.sql)

No es un bug del schema — es una tabla y un flujo nuevos, pedidos por el
usuario. `core.member_declared_policies` (con su propia RLS: el tenant, el
propio titular, o `can_manage_config`) modela "declaración propia → aprobación
por la empresa → enrollment real", mismo patrón que las notas de médico sin
registrar (draft → aprobación → promoción a la tabla real) — un viajero no
puede crear directamente un `coverage.travel_assistance_enrollments` porque
`plan_id` es `NOT NULL` ahí y el viajero no elige el plan exacto de la empresa.
`core.declare_member_policy()`/`core.approve_member_declared_policy()`
(`SECURITY DEFINER`) implementan las dos puntas.

## 22. Un viajero no podía crear su propio caso de asistencia de punta a punta — bloqueado por diseño, no por bug

**Archivo:** [`proposed-member-emergency-cases.sql`](src/database/sql/proposed-member-emergency-cases.sql)

`operations.emergency_cases` sí deja insertar el caso desde `/me` (`cases_access`
permite `member_id` propio), pero `case_participants_insert` es deliberadamente
solo para operador/superadmin ("gestión de participantes es tarea de operador,
no del viajero" — `proposed-tenant-access-model.sql`, gap #8) — así que un
INSERT directo del viajero dejaría el caso creado pero **sin el viajero como
participante**, y sin ser participante no puede entrar a la sala de chat de su
propio caso (`events.gateway.ts` valida `is_active_case_participant` en cada
join). `operations.create_member_emergency_case()` (`SECURITY DEFINER`) resuelve
exactamente ese único caso: crea el caso, agrega al viajero como participante y
crea el canal de chat (gap adicional encontrado en el camino: ningún otro
código creaba esa fila — un caso podía existir sin canal de chat), todo
atómicamente, sin abrir la política general de `case_participants_insert` a los
viajeros para el resto de los casos.

**Encontrado:** implementando el Paso 2 del brief (creación de caso desde la
app Flutter).

## 23. El flujo de compartir historia clínica con un médico (QR/link) reutiliza un camino de RLS que existía diseñado pero nunca conectado

**Archivos:** [`proposed-share-links.sql`](src/database/sql/proposed-share-links.sql),
[`proposed-shared-membership.sql`](src/database/sql/proposed-shared-membership.sql),
[`proposed-patient-summary.sql`](src/database/sql/proposed-patient-summary.sql),
[`proposed-professional-registration-v2.sql`](src/database/sql/proposed-professional-registration-v2.sql)

Hallazgo clave (no es un bug): `clinical.has_clinical_access()`
(`000_extensions.sql`) ya tenía un camino #2 pensado para esto — GUCs
`app.emergency_token_active`/`app.emergency_token_person_id`, ya mapeados por
`RequestContextData` — pero nunca se usaron porque nunca existió un endpoint de
redención de token. Este set de patches no reimplementa el filtrado de
historia clínica (alergias/condiciones/medicamentos siguen pasando por las
mismas tablas con la RLS de siempre); solo agrega lo que faltaba:
`emergency.redeem_share_token()` (valida vigencia/usos/estado, loguea en
`access_log`/`token_usage_log`, que existían sin ningún writer),
`emergency.submit_anonymous_share_note()` (nota de un médico sin sesión, Hito 1)
y `emergency.claim_share_note()` (el médico se registra/loguea después y
reclama esa nota como un `encounter_submission` real de su autoría, certificado
solo si su `trust_level` ya es `IDENTITY_VERIFIED` o superior — más bajo que el
umbral de MFA obligatorio `PROFESSIONAL_CERTIFIED`, a propósito).

`emergency_contacts` (`core.member_contacts`, RLS tenant/self) y la membresía de
asistencia (`coverage.travel_assistance_enrollments`, RLS tenant/self) tampoco
contemplaban el camino de token de emergencia — mismo puente puntual
`SECURITY DEFINER` que reutiliza exactamente `has_clinical_access()`:
`emergency.get_shared_contacts()` y `emergency.get_shared_membership()`.
`clinical.get_patient_summary()` hace lo mismo para datos demográficos básicos
(sexo, fecha de nacimiento, país) que hoy no se veían en ningún lado de la
historia clínica de un caso — `core.persons` es self-access-only por diseño
(gap #13), así que no hay `findById()` genérico posible sin este puente.

`proposed-professional-registration-v2.sql` amplía el alta del profesional
(sexo, provincia/localidad, CUIT si es institución) y siembra los dominios que
faltaban para poder crear `encounters`/`encounter_submissions` reales
(`ENCOUNTER_TYPE`, `ENCOUNTER_STATUS`, `SUBMISSION_TYPE`, `REVIEW_PRIORITY`,
`REVIEW_DECISION`, `GENDER`) — existían vacíos desde `008_seeds.sql`.

**Encontrado:** implementando compartir historia clínica con el médico tratante
(QR/link), Hitos 1 y 2.

## 24. `core.has_platform_config_access()` exigía `tenant_id IS NULL`, que ningún superadmin real tiene — bloqueaba SMTP para el propio superadmin; el username de SMTP nunca se cifró

**Archivos:** [`proposed-smtp-access-fix.sql`](src/database/sql/proposed-smtp-access-fix.sql),
[`proposed-smtp-username-encryption.sql`](src/database/sql/proposed-smtp-username-encryption.sql)

**Bug real**, encontrado probando "Correo (SMTP)" con el superadmin real:
`core.has_platform_config_access()` (`proposed-password-reset-and-smtp.sql`)
exigía `op.tenant_id IS NULL` — pensado para un "operador de plataforma" puro
que el propio archivo original ya marcaba como pendiente de bootstrap manual, y
ese paso nunca se hizo. El superadmin real que sí existe tiene
`tenant_id = OYSGROUP Demo`, no `NULL`, así que el `INSERT` en
`params.smtp_settings` fallaba con "viola la política de seguridad de
registros" pese a tener el permiso correcto. Se alineó el criterio con
`core.current_operator_can_manage_config()` (gap #17) y el resto del panel: con
o sin tenant, lo único que importa es `can_manage_config = TRUE`.

`params.smtp_settings.username` quedó en texto plano cuando se cifró
`password_encrypted` — pedido explícito del usuario de que TODA credencial
esté cifrada, no solo la contraseña (`from_address`/`from_name`/`host` quedan
sin cifrar a propósito: no son secretos). Migración seudo-online (columna
nueva + `UPDATE` con `encrypt_pii` + drop/rename de la vieja) porque ya había
~26 filas reales de pruebas anteriores.

## 25. Cambiar el email de login de un operador no tenía ningún camino — `core.users` no tiene política propia

**Archivo:** [`proposed-operator-account-email.sql`](src/database/sql/proposed-operator-account-email.sql)

Mismo patrón que los gaps #2/#10: el diálogo de edición de "Operadores" permite
cambiar rol/tipo/estado/nombre (columnas de `operations.operators`), pero el
email de login vive en `core.users` (cifrado, con blind index para el
`UNIQUE`), que tiene RLS forzada sin ninguna política propia — solo se toca vía
función `SECURITY DEFINER` puntual, nunca por CRUD genérico. Se agregaron
`core.get_user_email()`/`core.update_user_email()`; el controller ya valida con
la conexión RLS normal (`operators_tenant_access`) que el `operator_id` es
visible/editable por quien llama antes de invocarlas, así que estas funciones
no repiten ese chequeo de tenant.

## 26. Varios catálogos referenciados por pantallas nuevas existían vacíos o no existían — mismo patrón que #11/#12/#14

**Archivos:** [`proposed-clinical-form-catalogs.sql`](src/database/sql/proposed-clinical-form-catalogs.sql),
[`proposed-clinical-standard-catalogs.sql`](src/database/sql/proposed-clinical-standard-catalogs.sql),
[`proposed-coverage-demo-data.sql`](src/database/sql/proposed-coverage-demo-data.sql)

Construyendo la historia clínica completa (dosis/frecuencia/vía de
medicamentos, antecedentes quirúrgicos, riesgo de viaje) y el alta de un plan
de asistencia real: `DOSE_UNIT`/`SURGICAL_APPROACH`/`SURGERY_OUTCOME`/
`TRAVEL_RISK` existían vacíos, `MEDICATION_FREQUENCY`/`MEDICATION_ROUTE`/
`PLAN_TYPE`/`HEALTH_COVERAGE_STATUS` ni siquiera existían como dominio.
`proposed-clinical-standard-catalogs.sql` además siembra catálogos de
referencia de estándares reales — `ICD10_CONDITION`/`RXNORM_MEDICATION`/
`RXNORM_ALLERGEN` — para que un operador pueda buscar/seleccionar un código
verificado en vez de texto libre; los códigos se verificaron contra las APIs
públicas de la NLM/NIH al momento de escribir el archivo, pero es un set
inicial (~15-20 códigos por categoría, no el estándar completo — CVX/SNOMED
quedan pendientes por falta de una fuente pública verificable en esa sesión).
`proposed-coverage-demo-data.sql` agrega un sponsor y un plan de ejemplo
("AXA Assistance", pedido del usuario para poder probar) atados al tenant demo.

## 27. `coverage.health_coverages` obligaba a tener un `member_id` (empresa de asistencia al viajero) para poder cargar la obra social/prepaga — dos conceptos sin relación

**Archivos:** [`proposed-healthcare-plans.sql`](src/database/sql/proposed-healthcare-plans.sql),
[`proposed-healthcare-providers-seed.sql`](src/database/sql/proposed-healthcare-providers-seed.sql)

No es un bug del baseline aprobado — es una decisión de diseño de esta sesión,
a pedido explícito del usuario: *"la obra social o prestador médico o empresa
prestadora de salud no tiene nada que ver con asistencia al viajero"*. Antes de
este cambio, un viajero recién registrado (sin ningún `core.members`, ver gap
#10) no podía cargar su obra social/prepaga en absoluto, porque
`health_coverages.member_id` era `NOT NULL`.

- `health_coverages` gana `person_id` (nullable, alternativo a `member_id` —
  `CHECK (member_id IS NOT NULL OR person_id IS NOT NULL)`) y `provider_id`/
  `plan_id`/`contractor_name`. `hc_select`/`hc_insert`/`hc_update`
  (`004_coverage.sql`) ganan una rama `OR person_id = current_person_id` —
  `hc_no_delete` no se toca, dar de baja sigue siendo `valid_until`, nunca un
  DELETE.
- Dos tablas nuevas, `coverage.healthcare_providers` (prestador — con
  `provider_type_id` FK a `HEALTH_COVERAGE_TYPE` para distinguir **obra
  social** de **prepaga**, que el usuario aclaró explícitamente que no son lo
  mismo — una obra social agrupa trabajadores de un rubro/sindicato en
  Argentina, una prepaga es una empresa privada de medicina — más `country_id`
  y `code` opcional para el número de registro oficial) y
  `coverage.healthcare_plans` (el plan anidado bajo un prestador, ej. "OSDE
  210"). No encajan en `params.domain_catalogs`/`catalog_values` por la
  jerarquía prestador→plan con FK real.
- Ambas reutilizan el mecanismo `lifecycle_status`
  (`DRAFT`/`APPROVED`/`ACTIVE`/`RETIRED`) que `catalog_values` ya tenía desde
  el baseline aprobado sin que ningún endpoint lo usara: un viajero puede
  cargar un prestador o plan que no está en la lista (`POST
  /coverage/healthcare-providers` / `.../healthcare-plans`, solo
  `AuthGuard('jwt')`), queda `DRAFT` — utilizable de inmediato por quien lo
  cargó, invisible en el combo público de otros viajeros — hasta que un
  operador lo revisa desde "Prestadores y planes de salud" en admin-web:
  aprobar tal cual, corregir el nombre y aprobar, o **fusionar con uno
  existente** si es un duplicado con otro nombre (reasigna
  `health_coverages`/`healthcare_plans` que apuntaban al duplicado, lo marca
  `RETIRED`). Pedido explícito del usuario para el caso real de que un
  viajero escriba "Swiss Medical" cuando ya existe "SWISS MEDICAL SA".
- Seed inicial con datos reales pasados por el usuario, no inventados: el
  padrón oficial RNOS (Registro Nacional de Obras Sociales de Argentina, con
  código) para obras sociales, más un set de prepagas/hospitales conocidos por
  marca comercial (sin código oficial).
- Nuevo `GET /identity/travelers-without-tenant` (identity module,
  `ConfigAccessGuard`) — pedido del usuario para ver, desde el panel, a los
  usuarios que se registraron pero nunca quedaron afiliados a ninguna empresa
  de asistencia al viajero (antes invisibles en "Usuarios / viajeros", que
  lista `core.members`).

**Encontrado:** al registrar un viajero de prueba en la app Flutter y no
encontrarlo en ningún lado del panel admin.

## 28. `clinical.allergies` no tenía `ai_assisted`/`ai_completed_fields` — `clinical.medications` sí, inconsistencia entre ambas tablas en el baseline aprobado

**Archivo:** [`proposed-allergies-ai-columns.sql`](src/database/sql/proposed-allergies-ai-columns.sql)

`005_clinical.sql` define `ai_assisted BOOLEAN`/`ai_completed_fields JSONB` en
`clinical.medications` (líneas 118-119) pero nunca las agregó a
`clinical.allergies`, aunque el resto de las columnas de ambas tablas son
paralelas (mismo patrón MTA-511 de 3 estados, mismas columnas de
confirmación/procedencia). No es una decisión de esta sesión — es una
omisión del baseline que quedó invisible hasta que se activó el asistente de
IA con una key real: `AIService.confirmProposal()`
(`src/modules/ai/ai.service.ts`) siempre insertó ambas columnas en las dos
tablas (alergias y medicamentos) desde que se escribió, pero solo el INSERT
a `medications` podía funcionar contra el schema real.

- `ALTER TABLE clinical.allergies ADD COLUMN ai_assisted BOOLEAN NOT NULL
  DEFAULT FALSE, ADD COLUMN ai_completed_fields JSONB NOT NULL DEFAULT '{}'`
  — mismos tipos/defaults que ya tiene `medications`.
- No requiere cambios en `ai.service.ts`: el INSERT ya estaba escrito para
  el schema correcto, solo la tabla no lo tenía.

**Encontrado:** al confirmar una alergia propuesta por el asistente de IA
desde el chat en la app móvil ("penicilina, severidad moderada") — el botón
"Confirmar" fallaba con "proba de nuevo"; el log del backend mostró
`QueryFailedError: no existe la columna «ai_assisted» en la relación
«allergies»`.

## 29. `clinical.medications` no tenía columna para laboratorio/fabricante; dosis y unidad ya existían en el schema pero ninguna vía de carga las usaba

**Archivo:** [`proposed-medications-manufacturer.sql`](src/database/sql/proposed-medications-manufacturer.sql)

Pedido del usuario: al cargar un medicamento poder guardar droga, dosis
(cantidad + unidad), marca comercial y laboratorio. `dose_amount`/
`dose_unit_id` ya estaban en `005_clinical.sql` desde el baseline (con el
catálogo `DOSE_UNIT` ya sembrado — mg/ml/mcg/UI/gotas/comprimidos/parche),
pero ni el formulario manual de la app (`health_records_screen.dart`) ni el
asistente de IA (`openai.provider.ts`/`ai.service.ts`) los exponían.
Laboratorio no existía como columna en ningún lado.

- `ALTER TABLE clinical.medications ADD COLUMN manufacturer TEXT` — mismo
  patrón que `brand_name`, encriptado vía `encryptedFields` en
  `clinical.registry.ts` (no vía `RlsCrudService`, no requiere lógica nueva).
- Formulario manual (`_MedicationsTab._openForm`): agrega dosis
  (cantidad + combo de `DOSE_UNIT`), laboratorio, junto a droga/marca que ya
  existían.
- Asistente de IA: el JSON schema de extracción
  (`RESPONSE_JSON_SCHEMA.proposals[].data` en `openai.provider.ts`) gana
  `manufacturer`, `doseAmount`, `doseUnit` (enum con los mismos códigos del
  catálogo `DOSE_UNIT`) — opcionales, nunca bloquean la propuesta si falta
  la droga. `confirmProposal()` (`ai.service.ts`) resuelve `doseUnit` al
  UUID real vía `params.catalog_id('DOSE_UNIT', $6)` antes de insertar,
  mismo patrón que ya usaba para `allergenType`/`severity` en alergias.

**Encontrado:** pedido directo del usuario mientras probaba el asistente de
IA para medicamentos.

## 30. `/identity/travelers-without-tenant` devolvía siempre 0 filas para cualquier operador real — `core.users` tiene RLS habilitada sin ninguna policy

**Archivo:** [`proposed-travelers-without-tenant-function.sql`](src/database/sql/proposed-travelers-without-tenant-function.sql)

Reportado por el usuario al registrar un viajero de prueba (Omar Arias
Mele, DNI 13430714) y no encontrarlo en "Usuarios sin cobertura de
asistencia al viajero" pese a que la fila existía y `has_member = FALSE`.
El controller original (`travelers-without-tenant.controller.ts`, gap #27)
hacía `JOIN core.users u ON u.person_id = p.id` directo con
`queryRunner.query()` normal. `core.users` tiene
`ENABLE ROW LEVEL SECURITY` desde el baseline
(`003_core_identity.sql:295`) pero **nunca tuvo ninguna `CREATE POLICY`** —
el patrón ya establecido en el resto del schema (`core.get_user_email`,
`core.get_login_credentials`, `proposed-operator-account-email.sql`) es que
esa tabla solo se lee vía funciones `SECURITY DEFINER`, nunca con
SELECT/JOIN directo. El JOIN directo devolvía 0 filas siempre, para
cualquier operador, sin importar sus permisos — confirmado simulando la
sesión exacta del operador real (`app.current_user_id` + rol
`medtravel_app`, no superusuario): `core.current_operator_can_manage_config()`
daba `TRUE`, pero el JOIN a `core.users` igual quedaba vacío.

- Nueva función `core.get_travelers_without_tenant()` (`SECURITY DEFINER`),
  mismo patrón que `clinical.get_patient_summary()`/
  `emergency.get_shared_contacts()`: hace el JOIN adentro (bypassea RLS)
  pero se autoriza sola llamando a `core.current_operator_can_manage_config()`
  (ya existente, `proposed-tenants-rls.sql`) — si no es `TRUE`, devuelve
  vacío en vez de tirar error.
- El controller pasó de armar la query a mano a `SELECT * FROM
  core.get_travelers_without_tenant()`.

**Encontrado:** el usuario registró un viajero de prueba y reportó
"no lo veo" en la pantalla que se había armado específicamente para verlo.

## 31. Prestadores y Obras Sociales aparecían siempre vacíos en admin-web — el SQL crudo devolvía columnas en snake_case, el frontend esperaba camelCase

**Archivos:** [`healthcare-providers-admin.controller.ts`](src/modules/coverage/healthcare-providers-admin.controller.ts), [`healthcare-plans-admin.controller.ts`](src/modules/coverage/healthcare-plans-admin.controller.ts)

No es un problema de datos ni de RLS — la base tenía las 258 obras
sociales y 34 prepagas correctas, todas con país Argentina, confirmado
consultando directo. El bug estaba en el `GET /coverage/admin/
healthcare-providers` (y su equivalente de planes): al ser SQL crudo vía
`queryRunner.query()` (no un Repository/QueryBuilder de TypeORM, que sí
mapea a camelCase automáticamente), Postgres devolvía las columnas tal
cual (`provider_type_id`, `country_label`, `lifecycle_status`, etc.),
pero la interfaz TypeScript del frontend
(`healthcare-provider-type.page.tsx`) esperaba `providerTypeId`,
`countryLabel`, `lifecycleStatus`. El filtro por tipo
(`providerTypeCodeById(p.providerTypeId)`) comparaba siempre contra
`undefined`, así que las listas de Prestadores y de Obras Sociales
quedaban vacías las dos, sin ningún error visible — ni en consola ni en
los logs del backend, porque la query en sí ejecutaba bien.

- Alias explícitos en camelCase (`AS "providerTypeId"`, `AS
  "countryLabel"`, etc.) en ambos SELECT — mismo patrón que ya usan la
  mayoría de las otras queries crudas del proyecto (ej.
  `patient-summary.controller.ts`), que este archivo en particular no
  había seguido.
- Deliberadamente **no** se tocaron `healthcare-providers.controller.ts`/
  `healthcare-plans.controller.ts` (lado viajero) ni
  `me-coverages.controller.ts`: la app Flutter ya lee esos mismos campos
  en snake_case (`p['provider_id']`, etc., ver `coverages_screen.dart`)
  porque fue escrita contra la respuesta real — "corregirlos" ahí habría
  roto el flujo de edición de cobertura que hoy funciona.

**Encontrado:** el usuario reportó no ver ninguna obra social ni prepaga
de Argentina en ninguna de las dos pantallas recién separadas (gap #29).

## 32. El registro no pedía documento — no había forma de evitar altas duplicadas de la misma persona

**Archivos:** [`auth.service.ts`](src/modules/auth/auth.service.ts), [`register.dto.ts`](src/modules/auth/dto/register.dto.ts), [`proposed-travelers-without-tenant-function.sql`](src/database/sql/proposed-travelers-without-tenant-function.sql)

Pedido explícito del usuario: la pantalla "Usuarios sin cobertura" debe
mostrar tipo y número de documento, y el sistema no debe permitir un
alta duplicada de la misma persona — mismo email, o mismo tipo+número de
documento **para el mismo país** (sistema internacional: dos personas de
países distintos pueden compartir número de documento sin ser la misma
persona). El registro (`POST /auth/register`) solo pedía nombre, apellido,
email y contraseña — la carga de documento existía únicamente como paso
posterior opcional (`POST /me/document`), así que no había ninguna
verificación de identidad real al momento del alta.

- `RegisterDto` gana `docTypeId`/`docNumber`/`docCountryId`, obligatorios.
- `AuthService.register()` inserta en `core.external_identifiers` en la
  misma transacción que `core.register_person_and_user()` — reutiliza el
  índice ciego y el UNIQUE `(doc_type_id, issuing_country_id,
  doc_number_idx)` que esa tabla ya tenía desde el baseline (nunca se
  había aprovechado para esto). Se distingue el conflicto de documento
  del de email por el nombre de la constraint (`error.constraint`), con
  un mensaje específico para cada caso.
- Deliberadamente **no** se tocó `core.register_person_and_user()` en sí
  (usado también por alta de profesionales y de operadores) — el
  documento se inserta como paso aparte dentro de la misma transacción,
  scopeado solo al registro de viajeros.
- `core.get_travelers_without_tenant()` (gap #30) ahora hace `LEFT JOIN`
  a `core.external_identifiers` (por `is_primary = TRUE`) para traer
  tipo/número/país de documento a la pantalla admin.
- Verificado end-to-end contra el servidor real: mismo documento con
  email distinto → 409 específico; mismo email con documento distinto →
  409 específico; alta normal → 201.

**Encontrado:** pedido directo del usuario mientras revisaba "Usuarios
sin cobertura de asistencia al viajero".

## 33. `clinical.medications.manufacturer` se creó como TEXT plano, pero la tabla real usa BYTEA cifrado — colgaba toda la pantalla de medicamentos (web y mobile)

**Archivo:** [`proposed-medications-manufacturer.sql`](src/database/sql/proposed-medications-manufacturer.sql)

Gap #29 (esta misma sesión) agregó `manufacturer` mirando
`005_clinical.sql` como referencia, que declara `generic_name`/
`brand_name`/`notes` como `TEXT`. Pero un patch posterior
(`proposed-clinical-encryption.sql`, "Encrypt sensitive free text at
rest") ya había convertido esas columnas a `BYTEA` cifrado en la base
real — el archivo baseline quedó desactualizado como referencia visual,
aunque nunca se edita. `manufacturer` se creó como `TEXT` real,
distinto al resto de la tabla, y como `clinical.registry.ts` lo declara
en `encryptedFields`, el `GET /clinical/medications` (y
`/me/clinical/medications`, mismo registry) hace
`core.decrypt_pii("manufacturer")` sobre una columna que no es bytea →
`error: no existe la función core.decrypt_pii(text)`. La consulta
entera fallaba (no solo faltaba ese campo), así que la pantalla de
medicamentos quedaba colgada esperando una respuesta que nunca
llegaba — mismo bug en admin-web y en la app, porque ambos pegan al
mismo endpoint.

- `DROP COLUMN manufacturer` + `ADD COLUMN manufacturer BYTEA` (sin
  pérdida de datos: 0 filas tenían el campo cargado, la función nunca
  había llegado a funcionar).
- Regla para la próxima vez: al agregar una columna a una tabla de
  `clinical.*` que ya tiene campos cifrados, chequear el tipo real en
  la base (`information_schema.columns`), no confiar en el `.sql` base
  como fuente de verdad para columnas que pudieron migrarse después.

**Encontrado:** el usuario reportó que la pantalla de medicamentos se
quedaba colgada tanto en la app como en el panel — se confirmó en los
logs del backend el error exacto apenas se abrió esa pestaña.

## 34. El asistente de IA solo sabía proponer alergias y medicamentos — se amplía a condiciones, cirugías y signos vitales, con entrevista guiada corta

**Archivos:** [`proposed-ai-proposal-types-extended.sql`](src/database/sql/proposed-ai-proposal-types-extended.sql), `ai-provider.interface.ts`, `openai.provider.ts`, `ai.service.ts`

Pedido del usuario: el asistente debe poder capturar antecedentes médicos
completos (no solo alergias/medicamentos) — pasó un cuestionario real de
~28 antecedentes puntuales usado en admisión médica de viajeros. Se
descartó hacerlo como cuestionario rígido de sí/no uno por uno (decisión
explícita del usuario tras comparar dos enfoques): la carga tiene que ser
corta (∼5 min, pocos intercambios), con la IA usando criterio para
repreguntar solo lo relevante según lo que la persona ya contó — la
cobertura completa de los 28 ítems queda garantizada por la ficha médica
de la app (pestañas editables, no por el chat en sí).

- `ai.proposals.proposal_type` tenía `CHECK IN ('MEDICATION','ALLERGY')` —
  se amplía a `CONDITION`/`SURGERY`/`VITALS`.
- `confirmProposal()` gana tres ramas nuevas, mismo patrón MTA-511 que ya
  usaban alergias/medicamentos (`PROVISIONAL`/`MEMBER_CONFIRMED`/
  `UNCERTIFIED`/`AI_ASSISTED`). `clinical.conditions` tiene una columna
  `status_id` (dominio `CONDITION_STATUS`) separada del trío MTA-511 que
  no estaba contemplada al escribir el INSERT — se detectó con una prueba
  en transacción con rollback antes de tocar la app real, se agregó
  (`ACTIVE` como default razonable).
- Manejo de fechas aproximadas: si el viajero no recuerda el día exacto,
  se guarda igual en la columna `DATE` (con el 1° del mes/año si hace
  falta) pero el texto real que dijo queda en `notes` — nunca se pierde
  la precisión real disfrazada de una fecha inventada.
- Nuevo: el prompt recibe edad+sexo del viajero (`getPersonContext()`,
  `core.persons.birth_date`/`gender_id`) para priorizar qué preguntar
  primero, sin mostrárselo nunca como pregunta.
- Mobile: `health_records_screen.dart` gana pestañas "Cirugías" y "Signos
  vitales" (antes solo Alergias/Comorbilidades/Medicamentos) — necesarias
  para que el viajero pueda revisar/completar/corregir lo que el chat no
  cubrió, ya que esa es la garantía de completitud elegida en vez de un
  chat exhaustivo.

**Fuera de alcance, documentado para después:** subida de estudios de
laboratorio/radiología (sin mecanismo de subida de archivos en todo el
backend) y traducción de la ficha al idioma del país visitado (cero
infraestructura de traducción en el repo) — ambas evaluadas, ninguna
existe ni parcialmente.

## 35. `emergency.tokens`/`access_log` exigían `member_id` — un viajero sin cobertura no podía generar ningún QR/link para el médico

**Archivos:** [`proposed-emergency-tokens-person-id.sql`](src/database/sql/proposed-emergency-tokens-person-id.sql), `me-member.helper.ts`, `me-emergency.controller.ts`, `me-shares.controller.ts`, `emergency-share-token.guard.ts`

Reportado por el usuario: "la generación del QR o link para que el médico
ingrese a la ficha médica no anda, da error". `MeEmergencyController.
generateQr` y `MeSharesController.createDoctorInvite` llamaban
`resolveMemberId()`, que tira `NotFoundException` si el viajero no tiene
ningún `core.members` — exactamente el caso de "usuarios sin cobertura"
(gap #30/#32) que ya podían registrarse pero no podían compartir su ficha
de emergencia con nadie. Mismo patrón que #27 (`health_coverages`) y el
plan pendiente de `member_contacts`: se agrega `person_id` como alternativa
a `member_id` en `emergency.tokens` y `emergency.access_log` (CHECK de que
exista uno de los dos), y `emergency.redeem_share_token`/
`submit_anonymous_share_note` derivan `person_id` de `member_id` cuando
existe, o usan el `person_id` propio del token si no. Nuevo helper
`resolveShareOwner()` (reemplaza `resolveMemberId()` solo en estos dos
controllers) nunca tira error por falta de member — devuelve
`memberId: null` y el controller inserta con `person_id`. Probado de punta
a punta con una transacción de prueba (rollback) contra un `person_id` real
sin ningún member: INSERT + `redeem_share_token` devuelven `ok: true`.

## 36. `/auth/login` no distinguía operador de viajero — una cuenta de staff podía loguearse en la app móvil con permisos de operador

**Archivos:** `auth.controller.ts`, `auth.service.ts`, `apps/mobile/lib/core/api_client.dart`

Reportado por el usuario: entró a la app del viajero con la cuenta de
super admin y quedó adentro — "esto no debería pasar, los usuarios
operadores no tienen nada que ver con los usuarios viajeros". `/auth/login`
es un único endpoint compartido por admin-web y mobile, sin ninguna señal
de qué cliente llama; `AuthService.login()` siempre resuelve
`operations.get_operator_login_context()` y adjunta esos claims al JWT si
la cuenta es de operador, sin importar qué app la use. Se agrega un header
`X-Client-App: mobile` que la app Flutter manda en todas sus requests
(`ApiClient`, `BaseOptions.headers`); si `AuthService.login()` recibe ese
header Y la cuenta tiene contexto de operador, rechaza con 401 ("esta
cuenta es de staff/operador"). **No se replicó la restricción inversa**
(admin-web + cuenta sin rol de operador): `professional-registration.
page.tsx` usa el mismo `/auth/login` inmediatamente después de que un
profesional/institución se autoregistra desde admin-web, y esa cuenta
tampoco tiene contexto de operador todavía — bloquearla ahí habría roto ese
flujo. El header es opt-in (nada se rechaza si no está presente), así que
los tests e2e existentes que llaman `/auth/login` directo sin header no
se ven afectados.

## 37. Foto de perfil, teléfono del viajero y contactos de emergencia — primera subida de archivos real de la app

**Archivos:** [`proposed-profile-photo-and-contacts.sql`](src/database/sql/proposed-profile-photo-and-contacts.sql), `me-profile.controller.ts`, `patient-photo.controller.ts`, `public-shares.controller.ts`, `me-emergency-contacts.controller.ts`, `person-phone.controller.ts`, `traveler-detail.page.tsx`, `profile_screen.dart`

Pedido del usuario: una "credencial del viajero" con foto + datos del
prestador de asistencia, y hasta 10 teléfonos/mails útiles (este gap
cubre la base — foto, teléfono, y hasta 3 contactos de emergencia; la
credencial visual y los 10 teléfonos/mails libres quedan para un patch
aparte).

- `core.persons.photo_path` (nuevo, nullable) — nombre de archivo en
  `apps/api-core/uploads/avatars/` (gitignored), nunca la ruta absoluta.
  Es la primera subida de archivos real del backend (`multer`ya estaba
  en `node_modules` vía `@nestjs/platform-express`, pero nunca se había
  usado — se agregó `@types/multer` como dev dependency). Se sirve
  SIEMPRE por un endpoint autenticado (`GET /clinical/patient-photo/
  :personId`, gateado por `clinical.has_clinical_access` — mismo modelo
  que alergias/condiciones — y `GET /public/shares/:token/photo` para el
  QR público), nunca por un directorio estático.
- `core.member_contacts` desacoplada de `member_id` (mismo patrón que
  #27/#35): `person_id` nullable alternativo + CHECK. Nuevo
  `MeEmergencyContactsController` (`/me/emergency-contacts`, máximo 3
  activos, cifrado + blind index de teléfono explícitos, mismo criterio
  que `me-document.controller.ts`) inserta siempre por `person_id` — el
  viajero no necesita ningún `core.members` para cargar sus contactos.
- Teléfono del viajero: `core.users.phone` ya existía desde el baseline
  (BYTEA + blind_index + verified) pero nunca se expuso — mismo puente
  `SECURITY DEFINER` que ya usa el cambio de email de operador
  (`core.get_user_phone`/`core.update_user_phone`). Cambiar el teléfono
  resetea `phone_verified` a `FALSE` — la verificación real (WhatsApp/
  SMS) queda pendiente, pedido explícito del usuario de dejarla para
  después.
- Admin-web (`traveler-detail.page.tsx`): mostrar foto/teléfono/contactos
  de UN viajero puntual necesitó dos piezas nuevas de acceso, ambas con
  el MISMO criterio que ya autoriza ver nombre/apellido (gap #13,
  `persons_tenant_member_select` — "operador de este tenant, o
  superadmin", nunca `has_clinical_access`, porque es dato de contacto,
  no historia clínica):
  - `core.get_person_phone_for_operator()` (función nueva).
  - `contacts_member_access` (RLS de `member_contacts`) ampliada con el
    camino "el `person_id` del contacto pertenece a un member de mi
    tenant" + el bypass de superadmin — sin esto, un operador no podía
    ver los contactos que el viajero cargó por `person_id` (todos, ya
    que `MeEmergencyContactsController` nunca usa `member_id`).
  - `member-contacts` pasa a `RlsCrudService` con `encryptedFields:
    ['phone']` en `IDENTITY_REGISTRY` (antes devolvía el BYTEA crudo sin
    desencriptar — nadie lo había notado porque nada leía ese campo
    todavía).
- Probado de punta a punta con un operador de prueba real (login vía
  `/auth/login`, token inyectado en el browser): foto (placeholder sin
  subir), teléfono "+54911...", y un contacto "Juan Perez Hijo · Hijo ·
  +54911..." — los tres renderizaron correctamente en
  `traveler-detail.page.tsx`. Datos de prueba borrados después.

**Fuera de alcance, documentado para después:** verificación real de
teléfono (WhatsApp/SMS); la "credencial" visual (tarjeta con foto +
prestador de asistencia); los hasta 10 teléfonos/mails útiles de libre
carga con descripción (el pedido original mencionaba esto además de los
3 contactos de emergencia — se prioriza lo compartido con el médico por
QR primero).

## 38. La ficha del viajero no mostraba tipo/número/país de documento — obligatorio desde el registro pero invisible para el operador

**Archivos:** [`proposed-person-document-for-operator.sql`](src/database/sql/proposed-person-document-for-operator.sql), `person-phone.controller.ts`, `traveler-detail.page.tsx`

Reportado por el usuario: en "Usuarios / viajeros", al ver un viajero no
aparece su documento — dato que es obligatorio desde el registro (gap
#32, no puede quedar en blanco) pero que nunca se mostró en esta
pantalla. Causa: `core.external_identifiers` está explícitamente
excluida del CRUD genérico (`identity.registry.ts`: "campos cifrados +
blind-index, un CRUD genérico rompería el índice ciego") y nunca tuvo
ningún endpoint de lectura puntual — la única pantalla que sí lo
mostraba era "Usuarios sin cobertura" (gap #30/#32, vía
`core.get_travelers_without_tenant()`), no la ficha de un viajero con
member. Mismo patrón que el teléfono (gap #37): nueva función
`core.get_person_document_for_operator()` con el mismo criterio de
acceso EXACTO que ya autoriza nombre/apellido/teléfono (operador de
este tenant, o superadmin) — `external_identifiers` no tiene RLS
habilitada (`relrowsecurity=false`), así que el control de acceso real
vive enteramente en esta función, no en ninguna policy. Nuevo endpoint
`GET /identity/persons/:id/document`. Probado en vivo con un viajero real
con documento cargado: "Documento nacional (DNI) 30111222" renderizó
correctamente en `traveler-detail.page.tsx`.

El usuario también reportó no ver contactos de emergencia en la misma
ficha — verificado que **no es un bug**: `core.member_contacts` está
vacía (0 filas) en toda la base, la funcionalidad de contactos (gap
#37) recién se agregó en esta misma sesión y todavía nadie cargó
ninguno desde la app. El estado vacío que muestra la pantalla
("El viajero no cargó ningún contacto de emergencia") es correcto.

## 39. La app móvil nunca volvía a mostrar el documento ya cargado, y faltaban "Esposo"/"Esposa" en los parentescos

**Archivos:** `me-document.controller.ts`, `profile_screen.dart`, `proposed-profile-photo-and-contacts.sql`

Dos reportes del usuario sobre lo agregado en el gap #37:

- "Cargué los datos de documento en el celular y cuando los consulto no
  aparecen": `POST /me/document` siempre funcionó, pero nunca existió un
  `GET /me/document` — `profile_screen.dart` solo mostraba
  "Documento cargado: X" como efecto local inmediato después de guardar
  (`_existingDocTypeCode` en el `setState` del `onSuccess`), nunca lo
  volvía a pedir al backend al reabrir la pantalla. El dato SÍ estaba
  guardado (confirmado por `traveler-detail.page.tsx` en admin-web,
  gap #38) — era puramente que la pantalla no lo recuperaba. Agregado
  `GET /me/document` (self, `WHERE person_id = context.personId`, sin
  necesitar ningún bypass ya que `external_identifiers` no tiene RLS) y
  `_load()` ahora lo pide junto con el resto y precarga tipo/número/país.
- Faltaban "Esposo"/"Esposa" en `RELATIONSHIP_TYPE` (gap #37 solo había
  sembrado amigo/nieto/hijo/padre/madre/otro) — agregados.

## 41. La foto de perfil no se veía en "Usuarios"/"Usuarios sin cobertura" aunque el viajero SÍ la había subido

**Archivos:** [`proposed-person-photo-for-operator.sql`](src/database/sql/proposed-person-photo-for-operator.sql), `person-phone.controller.ts`, `traveler-detail.page.tsx`, `traveler-without-coverage-detail.page.tsx`, `home_screen.dart`

Reportado por el usuario con capturas: la foto de perfil que subió desde
"Mi perfil" en la app (confirmado en disco y en `core.persons.photo_path`)
no aparecía ni en la ficha del viajero en admin-web ni en el inicio de la
app. Dos causas distintas:

- **Admin-web**: `traveler-detail.page.tsx` pedía la foto vía
  `GET /clinical/patient-photo/:personId`, gateado por
  `clinical.has_clinical_access` — el criterio correcto para la vista QR/
  médico (gap #23), pero NO para "Usuarios": ese mismo viajero no tenía
  ningún caso abierto ni consentimiento clínico con el tenant del
  operador (se ve en la propia pantalla: "Sin acceso a la historia
  clínica..."), así que la función devolvía 0 filas y el fetch fallaba en
  silencio. Mismo patrón que teléfono/email/documento (gap #37/#38/#40):
  nueva función `core.get_person_photo_path_for_operator()` con el
  criterio de "operador de ese tenant, o superadmin" (sin exigir
  consentimiento clínico, porque la foto acá es dato de identidad básico,
  no historia clínica) + nuevo endpoint `GET /identity/persons/:id/photo`.
  El endpoint clínico (`/clinical/patient-photo/:id`) queda intacto para
  share-preview/public-share, que sí necesitan ese criterio.
- **Mobile**: `home_screen.dart` nunca pedía la foto — el `CircleAvatar`
  del header ("Ver / editar mi perfil") era un ícono fijo, sin ningún
  fetch. Se agregó el mismo patrón ya usado en `profile_screen.dart`
  (`GET /clinical/patient-photo/:personId` — acá SÍ corresponde ese
  endpoint sin cambios, porque es autoacceso: regla #1 de
  `has_clinical_access` siempre es TRUE para el propio titular).

Probado en vivo: con un operador de prueba y un viajero real con foto ya
subida, el `<Avatar>` de `traveler-detail.page.tsx` pasó de mostrar el
placeholder con la inicial a renderizar la imagen real (confirmado
verificando que el DOM generó un `<img class="MuiAvatar-img">` con un
blob URL válido).

## 42. "Seguro médico / obra social" cargado desde la app nunca se veía en admin-web para ningún operador

**Archivo:** [`proposed-health-coverages-operator-read.sql`](src/database/sql/proposed-health-coverages-operator-read.sql)

Reportado por el usuario: "cargué el seguro médico en la app y no me
figura cuando consulto al usuario en la web" — confirmado que la fila
SÍ existía en `coverage.health_coverages` (person_id, sin member_id).
`hc_select` (la policy RLS, ya extendida en gap #21/`proposed-
healthcare-plans.sql` con un camino self-access por `person_id`) tiene
tres ramas: titular vía member_id, titular vía person_id, operador con
consentimiento explícito vía member_id — **ninguna cubre "operador de
este tenant viendo una fila person_id-only de uno de sus propios
members"**, que es exactamente el caso de una fila cargada desde la app
sin ningún flujo de consentimiento. Mismo patrón ya usado para
`member_contacts` (gap #37): se agrega el camino `person_id IN (SELECT
person_id FROM core.members WHERE tenant_id = ...)` + el bypass de
superadmin. Probado en vivo con un operador de prueba real: `GET
/coverage/health-coverages?personId=...` pasó de devolver `[]` a
devolver la cobertura real ("SMG 30" / Swiss Medical).

## 43. `core.tenants` no distinguía al administrador de la plataforma (OYSGROUP) de una empresa de asistencia al viajero real

**Archivo:** [`proposed-tenant-platform-admin-flag.sql`](src/database/sql/proposed-tenant-platform-admin-flag.sql)

Reportado por el usuario viendo "Pólizas": OYSGROUP aparecía como
opción de "Empresa" igual que AXA/Universal Assistance/Assit Card,
pero OYSGROUP es el administrador general de la plataforma, no una
empresa de asistencia — pasa porque `coverage/partner-records.
controller.ts` siempre carga la póliza bajo el tenant propio del
operador (nunca recibe uno por body, a propósito: evita que una
empresa cargue pólizas a nombre de otra — **eso no se tocó**), y el
operador de prueba pertenece al tenant OYSGROUP. Se agrega
`core.tenants.is_platform_admin` (marcado `TRUE` solo para OYSGROUP) y
se excluye de la lista "Filtrar por empresa" en Pólizas — sigue
resolviendo su nombre para filas ya cargadas bajo ese tenant, solo no
se ofrece como opción nueva.

De paso, el campo "Código de plan" del formulario "Cargar Póliza" (un
`TextField` libre, "debe existir en Catálogos/Parámetros") pasó a ser
un selector real con los planes de la propia empresa del operador —
era la causa concreta de que una póliza quedara "Emparejada" pero sin
plan de asistencia asociado (gap anterior, mismo reporte del usuario):
si el código tipeado no coincidía exactamente con ninguno, el plan
simplemente no se creaba, sin ningún error visible.

## 44. "Cargar póliza" no dejaba elegir la empresa de asistencia al viajero — un superadmin no tiene una empresa propia

**Archivos:** `partner-records.controller.ts`, `partner-records.page.tsx`

Reportado por el usuario tras el gap #43: en "Cargar póliza" faltaba
indicar de qué empresa de asistencia es la póliza, para poder elegir
sus coberturas/planes. `coverage/partner-records.controller.ts` siempre
usaba `request.user.tenantId` (el tenant propio del operador) — correcto
para un operador normal de una empresa real (AXA, etc., que solo debe
poder cargar a nombre de la suya, eso no se tocó), pero un **superadmin
de plataforma no tiene una empresa de asistencia propia** para empezar,
así que no tenía forma de elegir a nombre de cuál cargar. Se agregó un
query param opcional `?tenantId=`, honrado SOLO si
`request.user.canManageConfig` es `true` — un operador normal que lo
mande se ignora en silencio, preservando la regla original. En el
formulario aparece un selector "Empresa de asistencia al viajero" (con
las empresas reales, sin OYSGROUP — gap #43) visible solo para
superadmin; elegirla habilita el selector de "Plan" con los planes de
esa empresa. Orden final de campos (pedido explícito): Empresa → Plan →
N° de póliza. Probado en vivo con un operador de prueba: el diálogo
renderiza los tres campos en ese orden y el texto completo confirma que
aparecen (`dialog.textContent` incluye "Empresa de asistencia al
viajero" y "Plan").

## 45. Una póliza podía quedar "Emparejada" con la persona correcta pero sin plan, sin forma de corregirlo después

**Archivos:** [`proposed-partner-record-assign-plan.sql`](src/database/sql/proposed-partner-record-assign-plan.sql), `partner-records.controller.ts`, `partner-records.page.tsx`

Reportado por el usuario, continuación del gap #42/#44: pidió poder
editar una póliza ya cargada para asignarle el plan y que el
emparejamiento quede "definitivo", con un estado propio mientras tanto
(para no confundirlo con un emparejamiento realmente completo). Se
agregó:
- Nuevo valor de catálogo `MATCHED_NO_PLAN` en `IMPORT_STATUS` — `core.
  _apply_partner_match()` lo usa en vez de `MATCHED` cuando no hay
  `plan_code`. Se corrigieron retroactivamente los registros existentes
  en esa situación.
- `core.assign_plan_to_partner_record(partner_record_id, plan_code)` —
  ubica al member ya emparejado (vía `identity_match_decisions`), crea
  el enrollment real, y pasa el estado a `MATCHED` definitivo.
- `PATCH /coverage/partner-member-records/:id/plan`, gateado igual que
  `create()` (propio tenant, o superadmin cualquiera).
- En "Pólizas": chip amarillo "Emparejado, falta plan" + botón
  "Asignar plan" que abre un selector con los planes reales de la
  empresa DUEÑA de esa póliza específica (no la del operador logueado).

**Bug encontrado al probar en vivo** (primer intento tiró 500): la
función usaba `d.created_at` para ordenar `identity_match_decisions`,
pero esa tabla no tiene esa columna — es `decided_at`. Corregido y
reprobado de punta a punta contra "POLIZA 100" (Omar Arias Mele): el
estado pasó de `MATCHED_NO_PLAN` a `MATCHED`, y `coverage.
travel_assistance_enrollments` quedó con la fila real (member/tenant/
plan/policy_number correctos).

**De paso**, se encontró y corrigió una inconsistencia de datos
separada: el único `coverage.coverage_sponsors` que existía
("AXA Assistance", usado en "Agregar plan" de la ficha del viajero)
estaba con `tenant_id` apuntando a OYSGROUP en vez de al tenant real de
AXA — y Universal Assistance/Assit Card nunca tuvieron ninguno. Se
corrigió el vínculo de AXA y se crearon los dos que faltaban, cada uno
apuntando a su propio tenant real.

## 46. El sistema permitía cargar la misma alergia/comorbilidad/medicamento varias veces para la misma persona

**Archivos:** [`proposed-prevent-duplicate-clinical-entries.sql`](src/database/sql/proposed-prevent-duplicate-clinical-entries.sql), `me-clinical.controller.ts`, `ai.service.ts`

Reportado por el usuario con captura real: "Penicilina (SEVERE)" aparecía
4 veces (variando mayúscula/minúscula) y "rosuvastatina" 2 veces en la
ficha que ve el médico por QR. Se agregó un trigger `BEFORE INSERT OR
UPDATE` por tabla (`clinical.allergies`/`conditions`/`medications`) que
rechaza con `23505` un nombre igual (insensible a mayúsculas/espacios)
para la misma persona entre filas activas — a nivel de base porque hay
al menos 3 caminos de inserción distintos (CRUD genérico que usa la app
móvil, `me-clinical.controller.ts`, `ai.service.ts::confirmProposal`) y
uno solo cubre a los tres. `mapPgError()` se conectó a mano en los dos
caminos que no pasan por el CRUD genérico para que el 23505 llegue como
409, no como 500. Se hizo limpieza puntual de los duplicados reales del
usuario (Omar Arias Mele): 3 de 4 filas de Penicilina y 1 de 2 de
rosuvastatina, soft-deleteadas.

**Bug relacionado, encontrado al revisar el código**: la rama SURGERY de
`ai.service.ts::confirmProposal()` insertaba `procedure_name` (columna
`bytea`) sin pasar por `core.encrypt_pii()` — cualquier cirugía
confirmada por el asistente de IA hubiera fallado con un error de tipo.
Corregido junto con lo anterior.

**Bug real, más grave, encontrado DESPUÉS**: pese a que las 3 filas
duplicadas de Omar sí quedaron `active=FALSE, deleted_at=NOW()` en la
base, seguían viéndose en "Historia clínica" (admin-web) y en la ficha
del médico. Causa raíz: `RlsCrudService.findAll()` (el CRUD genérico que
usan `/clinical/allergies`, `/clinical/conditions`, etc. desde
`clinical-history.section.tsx`) nunca filtraba `deleted_at` — devolvía
TODAS las filas, borradas o no, para cualquier recurso con esa columna,
en toda la app, no solo clínico. Corregido en `rls-crud.service.ts`:
`findAll()` ahora excluye automáticamente `deleted_at IS NOT NULL`
cuando la entidad tiene esa columna (ambos caminos, con y sin campos
cifrados). Verificado en vivo: la query generada ahora incluye
`AND "e"."deleted_at" IS NULL`.

## 47. `coverage.travel_assistance_enrollments.sponsor_id` nunca se seteaba al crear el enrollment

**Archivos:** [`proposed-enrollment-sponsor-id.sql`](src/database/sql/proposed-enrollment-sponsor-id.sql)

Reportado por el usuario con captura real: la tabla "Plan de asistencia
al viajero" en la ficha del viajero mostraba "—" en "Empresa de
asistencia (sponsor)" pese a tener plan y N° de póliza cargados. Ni
`core._apply_partner_match()` ni `core.assign_plan_to_partner_record()`
(gap #45) seteaban `sponsor_id` en el INSERT. Corregido en ambas
funciones (derivan el sponsor por `tenant_id` del plan — cada
`coverage_sponsors.tenant_id` corresponde a un solo tenant real, ver gap
#44) + backfill de los enrollments ya existentes.

**De paso, encontrado al backfillear**: 7 de 8 enrollments backfillearon
bien, pero los que usaban el plan "Asistencia al Viajero Premium"
(código `PREMIUM_TRAVEL`) quedaron sin sponsor porque ese plan estaba
cargado bajo el tenant de OYSGROUP (administrador de plataforma,
`is_platform_admin=TRUE`, gap #43) — no una empresa de asistencia real,
así que no había ningún sponsor que asignarle. El usuario confirmó
consolidar todo bajo AXA: se reasignaron a mano (sin tocar el plan
PREMIUM_TRAVEL en sí, que queda huérfano/sin uso) los 5
`core.members`, 5 `coverage.travel_assistance_enrollments` y 5
`core.partner_member_records` afectados de `PREMIUM_TRAVEL`/OYSGROUP a
`AXA_BASIC`/AXA (sin conflictos de unicidad, verificado antes de
aplicar). Efecto colateral a tener en cuenta: como esos viajeros ahora
son `member` de AXA en vez de OYSGROUP, el operador de OYSGROUP
logueado durante la verificación dejó de tener acceso automático a la
historia clínica de Omar Arias Mele ("Sin acceso... no hay consentimiento
activo para esta empresa") — esperable dado el modelo de acceso por
tenant, pero es un cambio de comportamiento visible que vale la pena que
el usuario tenga presente.

## 48. `core.persons.country_residence_id` nunca se seteaba en el alta — "País" vacío para el 100% de los viajeros

**Archivos:** [`proposed-country-default-argentina.sql`](src/database/sql/proposed-country-default-argentina.sql), `auth.service.ts`, `register.dto.ts` (sin cambios, ya traía `docCountryId`)

Reportado por el usuario viendo la columna "País" en blanco para todos
los usuarios y usuarios sin cobertura. Backfill puntual de las 20
personas existentes a Argentina (dato real hoy). Para altas nuevas, el
usuario pidió explícitamente NO hardcodear Argentina — `core.
register_person_and_user()` ahora recibe `p_country_id` y usa el mismo
valor que el propio formulario de registro ya le pide al usuario
("País emisor" del documento, `docCountryId`), en vez de arrancar en
blanco o con un valor fijo.

## 49. `clinical.has_clinical_access()` no tenía en cuenta al administrador de la plataforma

**Archivos:** [`proposed-clinical-access-platform-admin.sql`](src/database/sql/proposed-clinical-access-platform-admin.sql)

Efecto colateral encontrado al reasignar viajeros de OYSGROUP a AXA
(gap #47): el operador de OYSGROUP dejó de ver la historia clínica de
esos viajeros — correcto según el modelo (el camino #4, consentimiento
"para este tenant", exige que `core.members.tenant_id` del viajero
coincida con el tenant del operador logueado), pero no lo que el
usuario quiere: como administrador de la plataforma, OYSGROUP necesita
poder ver la historia clínica de cualquier viajero para soporte, sin
importar de qué empresa de asistencia real sea miembro. Se agregó un
camino más en `has_clinical_access()`: si el tenant logueado tiene
`is_platform_admin = TRUE` (gap #43), acceso total. Verificado en vivo
contra Omar Arias Mele (ahora member de AXA).

**De paso**, se encontró y corrigió que los 3 `core.
member_data_consents` de cada uno de los 5 viajeros reasignados seguían
con `tenant_id = OYSGROUP` (quedaron huérfanos tras la migración) — se
actualizaron a AXA para que los datos queden consistentes, aunque el
chequeo de acceso en sí no dependía de ese campo.

## 50. `BLOOD_TYPE` existía como dominio pero sin ningún `catalog_value` sembrado

**Archivos:** [`proposed-seed-blood-type.sql`](src/database/sql/proposed-seed-blood-type.sql)

Mismo patrón que gaps #11/#12/#14/#26. Encontrado al agregar el campo
"Grupo sanguíneo" a la app móvil (ver gap #51): el selector se hubiera
mostrado vacío, sin ninguna opción. Sembrados los 8 grupos estándar
(O/A/B/AB × positivo/negativo).

## 51. La app móvil no permitía cargar sexo ni grupo sanguíneo — solo peso/altura

**Archivos:** `me-profile.controller.ts`, `update-profile.dto.ts`, `profile_screen.dart`, `health_records_screen.dart`

Pedido explícito del usuario: "sexo" (`core.persons.gender_id`) y
"grupo sanguíneo" (`clinical.vitals_history.blood_type_id`) — que ya se
mostraban en la ficha del viajero (Edad/Fecha de nacimiento/Sexo/País/
Peso/Altura/IMC/Grupo sanguíneo, `PatientSummaryCard` en
`clinical-history.section.tsx`, ya compartida entre Usuarios y Casos de
asistencia) — no tenían ningún camino de carga desde la app. Peso y
altura ya se cargaban (`health_records_screen.dart` → `POST /clinical/
vitals-history`); se le agregó un selector "Grupo sanguíneo" al mismo
diálogo. Sexo no tenía ningún camino en absoluto: se agregó `genderId`
a `UpdateProfileDto`/`PUT /me/profile` (backend ya devolvía `gender_id`
en el `GET`, pero el `PUT` nunca lo aceptaba) y un selector "Sexo" en
`profile_screen.dart`, mismo patrón que los selectores de catálogo ya
existentes ahí (tipo de documento, país emisor).

## 52. Quedaban usuarios/casos con empresa OYSGROUP; el totalizador de plataforma en el Dashboard mostraba su propio conteo (siempre 0)

**Archivos:** `dashboard.page.tsx` (sin cambios de SQL — solo datos + frontend)

Continuación de gaps #47/#49: el usuario pidió explícitamente que no
quede NINGÚN caso ni usuario con empresa OYSGROUP en todo el sistema —
todo bajo AXA. Se encontraron y reasignaron los últimos restos: 1
`core.members` ("Flutter Tester"), 3 `core.member_data_consents`, 2
`core.partner_member_records` (uno sin persona emparejada todavía) y 0
enrollments. **Bloqueo real encontrado**: `operations.
emergency_cases.tenant_id` es inmutable por trigger
(`deny_case_ownership_change()`, protección de auditoría/integridad —
no se bypasea) — los 2 casos de prueba que quedaban bajo OYSGROUP
("Flutter Tester" OPEN, "Viajero Demo" CLOSED) no se pudieron
reasignar. El usuario confirmó borrarlos (son de prueba): se
eliminaron junto con sus dependientes (`case_status_history`,
`case_medical_events`, `case_participants`). Verificado: 0 members/
cases/consents/partner_records/enrollments quedan con `tenant_id`
OYSGROUP.

**Dashboard**: la tarjeta de "Plataforma" (OYSGROUP) mostraba su propio
conteo de viajeros/viajes/casos abiertos — con OYSGROUP ya sin datos
propios (correcto, no es una empresa de asistencia real), esa tarjeta
iba a quedar siempre en 0. Pedido explícito del usuario: que muestre el
total de todas las empresas de asistencia reales. Se cambió en el
frontend (`dashboard.page.tsx`): la tarjeta de plataforma ahora suma
`travelerCount`/`tripCount`/`openCaseCount` de `companyStats` en vez de
usar su propio valor de `/operations/dashboard-stats`.

## 53. No había forma de cargar el destino de un viaje ni de ubicar automáticamente un caso de asistencia

**Archivos:** [`proposed-trip-destinations-and-case-location.sql`](src/database/sql/proposed-trip-destinations-and-case-location.sql), `me-trips.controller.ts`, `me-emergency-cases.controller.ts`, `emergency-cases.controller.ts`, `trips_screen.dart`, `emergency_screen.dart`, `case-detail.page.tsx`

Pedido explícito del usuario (con plan aprobado por él antes de
implementar): la app permitía cargar un viaje (nombre + fechas) pero no
su destino, y al reportar una emergencia no había forma de que el
sistema sugiriera país/ciudad para que el operador supiera dónde
ubicar la asistencia.

`operations.trips`/`trip_destinations` ya existían en el schema con
país/ciudad por destino, y `emergency_cases` ya tenía columnas
`trip_id`/`destination_id`/`destination_detected_by_id` — pero nada las
usaba. `destination_detected_by_id` no tenía ningún dominio de catálogo
en absoluto (se creó `DESTINATION_DETECTED_BY`: `TRIP`/`GPS`/`MANUAL`);
`DESTINATION_STATUS` existía declarado pero sin valores (se sembró
`ACTIVE`/`COMPLETED`, mismo patrón que `BLOOD_TYPE` gap #50).

**Flujo implementado** (acordado con el usuario): al reportar una
emergencia, la app intenta GPS primero y geocodifica en el dispositivo
(paquete `geocoding`, sin servicio externo pago) para prellenar
país/ciudad editables; si el GPS no está disponible, usa el destino
del viaje activo cargado como respaldo; si tampoco hay eso, pide
país/ciudad a mano antes de poder enviar. `operations.
create_member_emergency_case()` se amplió con `p_country_id`/`p_city`
(opcionales, no rompe callers viejos): si hay un destino de un viaje
activo con ese país, lo reusa (`detected_by = TRIP`); si no, crea un
`trips`+`trip_destinations` "ad hoc" del día (`detected_by = GPS` o
`MANUAL` según si vino latitud). Probado en vivo con un dry-run
(3 escenarios: GPS crea destino nuevo, mismo país sin GPS reusa el
destino existente, sin país en absoluto no rompe nada) — los 3
funcionaron como se esperaba.

**Bug propio encontrado al aplicar**: `CREATE OR REPLACE FUNCTION` con
2 parámetros nuevos crea un OVERLOAD en vez de reemplazar la función —
quedó una firma vieja de 8 parámetros huérfana conviviendo con la
nueva de 10. Se agregó un `DROP FUNCTION` explícito de la firma vieja
antes del `CREATE OR REPLACE`.

**Prerequisito real encontrado**: `AndroidManifest.xml` nunca declaró
`ACCESS_FINE_LOCATION`/`ACCESS_COARSE_LOCATION` pese a que `emergency_
screen.dart` ya usaba `Geolocator` desde antes — el pedido de permiso
en tiempo de ejecución no podía funcionar de verdad en Android sin
esa declaración (probablemente el catch silencioso ya lo estaba
tapando). Corregido.

**De paso**: no existía ningún proyecto iOS en el repo — se generó con
`flutter create --platforms=ios .` (pedido explícito del usuario, "es
importante que la app funcione en ambos ambientes") y se agregaron los
`NSLocationWhenInUseUsageDescription`/`NSCameraUsageDescription`/
`NSPhotoLibraryUsageDescription` al `Info.plist` generado (sin esto el
build de iOS crashea al pedir GPS/cámara/galería, funciones que ya
existían para Android). Compilar/correr en iOS real requiere Xcode en
macOS — queda listo, no se puede probar desde este entorno Windows.

## 54. Un operador de plataforma podía VER el historial de un caso ajeno pero no AGREGAR una nota ahí

**Archivos:** [`proposed-case-medical-events-platform-admin-check.sql`](src/database/sql/proposed-case-medical-events-platform-admin-check.sql)

Reportado por el usuario en vivo: al intentar agregar una nota en
"Historial del caso" de un caso de AXA logueado como operador de
OYSGROUP, la app mostraba "No se pudo guardar la nota." Reproducido
directo contra la API: `POST /operations/case-medical-events` devolvía
403 "No autorizado para esta operación".

Causa raíz: `case_medical_events_access` (gap sobre
`proposed-case-medical-events-rls.sql`) tenía un `WITH CHECK` más
angosto que su propio `USING` — el `USING` ya dejaba VER el historial
de cualquier caso a un operador de plataforma
(`core.current_operator_can_manage_config()`, gap #43/#49, heredado de
`cases_access`), pero el `WITH CHECK` (que gatea el INSERT) solo
permitía `ec.tenant_id = current_tenant_id`, sin el mismo bypass.

**Diagnóstico más profundo de lo esperado**: agregar el bypass solo al
`WITH CHECK` no alcanzó — seguía fallando con el mismo error genérico
de RLS. Se aisló el problema probando `WITH CHECK (true)` a mano
(literal, siempre verdadero) y el INSERT **seguía fallando** — lo cual
probó que el `WITH CHECK` nunca fue el bloqueo real. Causa: `RlsCrudService.
create()` siempre hace `INSERT ... RETURNING`, y Postgres evalúa el
`USING` (no solo el `WITH CHECK`) sobre la fila recién insertada para
poder devolverla — si el `USING` no tiene el mismo bypass, el INSERT
"pasa" pero el `RETURNING` falla con el mismo mensaje genérico de RLS
(`ExecWithCheckOptions`), indistinguible del error de INSERT en el
mensaje de error. Se corrigieron ambas cláusulas (`USING` y
`WITH CHECK`). Verificado de punta a punta: `POST /operations/
case-medical-events` devuelve 201 y la nota aparece en "Historial del
caso" en admin-web.

**Lección para el resto de las políticas de este estilo** (patrón
`cases_access`-like con bypass de plataforma): si en el futuro se
agrega el bypass a una política con `USING`/`WITH CHECK` separados,
agregarlo a AMBAS cláusulas — no alcanza con una sola, incluso si
lógicamente parece que solo la operación en cuestión (INSERT/UPDATE)
"debería" necesitar el `WITH CHECK`.

## 55. `geocoding` (paquete nuevo, gap #53) no compilaba en Android — `compileSdk` insuficiente

**Archivos:** `apps/mobile/android/app/build.gradle.kts`, `apps/mobile/android/build.gradle.kts`

Al recompilar la app con el paquete `geocoding` recién agregado, Gradle
falló: `geocoding_android` y varias dependencias transitivas de
`androidx` (fragment/window/lifecycle) exigen `compileSdk >= 34`, pero
el proyecto usaba `flutter.compileSdkVersion` (33 en esta versión de
Flutter). Se fijó `compileSdk = 36` explícito en `android/app/
build.gradle.kts`. Eso no alcanzó: cada plugin de Flutter (incluido
`geocoding_android`) trae su PROPIO `build.gradle` con su propio
`compileSdk` heredado del mismo default bajo — hubo que forzarlo
también para todos los subproyectos vía un bloque `subprojects {
afterEvaluate { ... compileSdkVersion(36) } }` en el `android/
build.gradle.kts` raíz (excluyendo `:app`, que ya lo tiene seteado
directo — `afterEvaluate` sobre un proyecto ya evaluado tira error por
el `evaluationDependsOn(":app")` que ya existía). Verificado: build
exitoso e instalado en el dispositivo físico de prueba.

## 56. `case_medical_events` nunca guardaba quién agregó cada nota del historial

**Archivos:** `case-medical-events.controller.ts` (nuevo), `operations.module.ts`, `operations.registry.ts`, `case-history.section.tsx`

Reportado por el usuario: "en los historiales de caso no indica quien
agrego la nota, es importante para seguimiento". `registered_by_id`
existía en la tabla desde el baseline pero ningún caller lo completaba
— el CRUD genérico no inyecta identidad del caller, y nada se lo
mandaba tampoco desde el cliente. Se sacó `case-medical-events` del
registro genérico (mismo motivo que `emergency-cases`: necesita lógica
propia) y se creó `CaseMedicalEventsController` — resuelve el
`operations.operators.id` del operador logueado a partir de su
`userId` del JWT (nunca confía en lo que mande el cliente) y lo inyecta
como `registeredById` en cada INSERT. Admin-web (`case-history.section.tsx`)
ahora resuelve y muestra el nombre del operador junto a cada nota,
mismo patrón que "Operador asignado" en `case-detail.page.tsx`.

## 57. El asistente de IA no cubría el cuestionario completo de antecedentes ni preguntaba sexo/grupo sanguíneo

**Archivos:** `openai.provider.ts`, `ai-provider.interface.ts`, `ai.service.ts`

Pedido explícito del usuario, con el cuestionario completo pasado
textualmente (28 antecedentes: cardiovascular, ACV, infarto,
angioplastia, diabetes, gota, hemofilia, AIT, Parkinson, hipertensión,
alergias, úlcera gastroduodenal, diverticulitis, cólico renal/biliar,
oncológica, anticoagulantes, fibrilación auricular, enfermedad
metabólica, sinusitis crónica, insuficiencia renal crónica, diálisis,
hepatitis, medicamentos, cirugías) — el prompt anterior priorizaba
velocidad ("no más de 5 minutos", "nunca uno por uno") por sobre
cobertura completa. Se reescribió el `SYSTEM_PROMPT`: mantiene la
apertura conversacional/no rígida, pero ahora exige cubrir los 28
ítems (agrupados, no recitados) antes de cerrar la charla, y agrega
sexo/grupo sanguíneo a lo que se pregunta junto con peso/altura.

`genderCode` (dominio GENDER) y `bloodTypeCode` (dominio BLOOD_TYPE) se
agregaron al proposal VITALS existente en vez de crear un tipo nuevo —
sexo no es un "signo vital" pero se captura en el mismo turno que
peso/altura, así que viven en el mismo proposal. `confirmProposal()`
(rama VITALS) ahora también hace `UPDATE core.persons SET gender_id`
cuando viene `genderCode`, y agrega `blood_type_id` al INSERT en
`clinical.vitals_history` cuando viene `bloodTypeCode` — ambos
resueltos vía `params.catalog_id(...)`, mismo patrón que el resto de
los campos de catálogo del asistente.

## 58. `trip_destinations` no tenía el bypass de administrador de plataforma — la ubicación del caso se veía vacía

**Archivos:** [`proposed-trip-destinations-platform-admin.sql`](src/database/sql/proposed-trip-destinations-platform-admin.sql)

Efecto colateral del gap #53 (ubicación automática de casos),
encontrado probando un caso real del usuario (MT-2026-08-000011, "me
siento mareado"): el nuevo endpoint `GET /operations/emergency-cases/
:id/location` hace `LEFT JOIN` a `trip_destinations` para traer país/
ciudad — un operador de OYSGROUP viendo un caso de AXA (autorizado vía
el bypass de `cases_access`) obtenía el JOIN vacío EN SILENCIO (no un
error) porque `trip_destinations_access` nunca recibió el mismo bypass
de administrador de plataforma que sí tiene su tabla hermana `trips`
(`proposed-platform-tenant-and-config-bypass.sql` lo agregó a `trips`
pero no a `trip_destinations` — quedó afuera del rollout). La sección
"Ubicación" mostraba "—" pese a que el viajero sí había cargado país/
ciudad ("buenos aires, Argentina, ingresado a mano" en la base).
Corregido agregando `OR core.current_operator_can_manage_config()` al
`USING` de `trip_destinations_access` (sin `WITH CHECK` separado, a
diferencia del gap #54 — una sola cláusula alcanza acá). Verificado en
vivo: el endpoint y la UI ya muestran la ubicación correcta.

## 59. `core.has_tenant_access()` (helper compartido por 14 políticas) no tenía el bypass de administrador de plataforma

**Archivos:** [`proposed-has-tenant-access-platform-admin.sql`](src/database/sql/proposed-has-tenant-access-platform-admin.sql), [`proposed-chat-messages-platform-admin.sql`](src/database/sql/proposed-chat-messages-platform-admin.sql)

Continuación directa de los gaps #49/#54/#58 (mismo patrón, encontrado
una cuarta vez): construyendo el chat de operador en admin-web
(pedido explícito del usuario, "dentro del caso se debería poder
manejar el chat"), un operador de OYSGROUP con acceso a un caso de AXA
no podía sumarse como `case_participant` de ese caso
(`case_participants_insert`, que usa `core.has_tenant_access()` sin
el bypass). En vez de parchear la política puntual, se corrigió el
helper `core.has_tenant_access()` — usado por 14 políticas distintas
(`case_participants`, `chat_channels`, `message_attachments`,
`message_reads`, `chat_translations`, `tenant_access_requests`,
`operators`, `operator_roles`, `operator_presence`) — de una sola vez,
para no seguir descubriendo el mismo bug tabla por tabla.

**De paso**: `chat_messages/msg_select` tiene el chequeo de tenant
INLINE (no vía `has_tenant_access()`), así que necesitó su propio
parche aparte con el mismo bypass — sin él, el operador se unía a la
sala (gracias al fix anterior) pero nunca veía los mensajes.

**Auditoría pendiente, no urgente**: la misma búsqueda encontró 4
políticas más con el patrón (`audit.data_audit_events`,
`coverage.travel_assistance_certificates` insert/select,
`emergency.tokens`, `operations.tenant_analytics_cache`) — no bloquean
nada hoy, quedan para revisar en otra pasada.

## 60. `CASE_PARTICIPANT_TYPE` solo tenía sembrado `MEMBER`

**Archivos:** [`proposed-seed-case-participant-type.sql`](src/database/sql/proposed-seed-case-participant-type.sql)

Mismo patrón que `BLOOD_TYPE` (gap #50) y `DESTINATION_STATUS` (gap
#53). El auto-join del operador al chat (gap #61, ver abajo) buscaba
el código `OPERATOR` en este dominio y no encontraba nada — fallaba en
silencio (no es una excepción, simplemente no había fila que
insertar), así que costó más de lo esperado diagnosticarlo. Se
sembraron `OPERATOR` y `EXTERNAL` (este último ya tiene columnas
dedicadas en `case_participants` — `external_name`/`external_email`,
para un tercero sin cuenta como un médico invitado — pero tampoco
tenía código de catálogo utilizable).

## 61. No existía ningún chat de operador en admin-web

**Archivos:** `case-chat.section.tsx` (nuevo), `case-detail.page.tsx`, `events.gateway.ts`, `emergency-cases.controller.ts`

Pedido explícito del usuario: "dentro del caso se debería poder
manejar el chat con el usuario que tiene el caso, eso no está en el
desarrollo web". Confirmado: cero referencias a chat/socket en todo
`admin-web` — la app móvil ya tenía chat completo
(`case_chat_screen.dart`, Socket.io) pero el panel de operadores
nunca lo tuvo.

Se construyó `CaseChatSection` reusando el mismo protocolo que ya usa
la app móvil (`events.gateway.ts`, namespace `cases`, eventos
`join_case`/`send_message`/`chat_message`) — ningún cambio de
protocolo, solo un cliente nuevo. Dos piezas de infraestructura
nuevas:
- `events.gateway.ts::tryAutoJoinAsOperator()` — un operador con
  acceso al tenant del caso (o administrador de plataforma) que
  todavía no es `case_participant` se agrega automáticamente al hacer
  `join_case` (mismo criterio de autorización que
  `case_participants_insert`). Un viajero nunca se auto-agrega por
  acá — su alta sigue siendo exclusiva de
  `operations.create_member_emergency_case()`.
- `GET /operations/emergency-cases/:id/chat` — resuelve el
  `channelId` del caso (JOIN desde `emergency_cases`, hereda su RLS
  real) para que el cliente sepa a qué sala unirse; `chat_channels`
  no está en el CRUD genérico (gap #8, nunca tuvo RLS propia).

**Bug propio encontrado en vivo**: el historial (REST, TypeORM) llega
camelCase, pero el evento `chat_message` del socket emite el row
crudo de `INSERT ... RETURNING *` (snake_case) — mismo problema que
`case_chat_screen.dart` ya tenía resuelto con un parser dual; se
replicó el mismo criterio en `case-chat.section.tsx`
(`normalizeMessage()`), si no la fecha del mensaje mostraba
"Invalid Date".

## 62. El caso cerrado seguía permitiendo chatear; la web permitía seguir modificando un caso cerrado/cancelado

**Archivos:** `events.gateway.ts`, `case-detail.page.tsx`, `case-history.section.tsx`, `case-chat.section.tsx`

Reportado por el usuario probando en la app: "cuando se entra al chat
permite seguir chateando si está cerrado no debería chatear más".
Cerrar un caso (`EmergencyCasesController.update()`) nunca tocaba
`can_send_messages` en ningún lado, y el chat no chequeaba el estado
del caso — quedaba abierto para siempre. Se agregó `events.
gateway.ts::isCaseClosed()`: antes de aceptar un `send_message`,
chequea el `status_id` actual del caso (RESOLVED/CLOSED) y rechaza el
envío con un mensaje claro si ya está cerrado.

**De paso**, pedido explícito del usuario: en admin-web, un caso
CLOSED o CANCELLED ahora es de solo consulta — se deshabilitan los
selectores de Estado/Prioridad, se oculta el formulario de "Agregar
nota" del historial, y el chat muestra un aviso en vez de la caja de
enviar (con un `Alert` arriba explicando que está cerrado/cancelado).
Doble capa a propósito: la UI lo oculta, pero el backend (`
isCaseClosed`) es quien realmente lo impide — la UI sola no alcanza si
alguien llama a la API directo.

**De paso también**, pedido explícito del usuario: se reordenó
`case-detail.page.tsx` para que el chat quede inmediatamente después
de "Historial del caso" (antes que "Historia clínica"), ya que es lo
que más se usa durante la atención de un caso activo.

## 63. El asistente de IA no sabía qué antecedentes ya estaban cargados — volvía a proponerlos y chocaba con el anti-duplicados

**Archivos:** `ai.service.ts` (`getPersonContext`), `openai.provider.ts`

Reportado por el usuario: "en la app cuando se cargan con el asistente
de salud no permite confirmar" / "sale no se pudo procesar intenta de
nuevo". Diagnosticado en el log del servidor: el INSERT fallaba con
`error: Ya tenés cargada esa comorbilidad` (el trigger anti-duplicados
del gap #46, funcionando correctamente) — "Asma" ya estaba cargada
para el viajero, pero el asistente la volvió a proponer porque
`getPersonContext()` solo mandaba edad/sexo, nunca lo que ya estaba
confirmado en la ficha. Se extendió para incluir condiciones/alergias/
medicamentos/cirugías activos, y el `SYSTEM_PROMPT` ahora indica
explícitamente que lo marcado "ya cargado/ya cargada" no se debe
re-proponer ni re-preguntar.

**De paso**, bug real independiente encontrado en el camino: el
mensaje de error de la app (`health_assistant_screen.dart`) era
SIEMPRE genérico ("No se pudo procesar — probá de nuevo"),
sin importar la causa — el usuario no tenía forma de saber que el
motivo real era "ya está cargado", así que reintentaba sin sentido.
Se corrigió para mostrar el `message` real que devuelve el backend
(vía `mapPgError`) cuando está disponible.

## 64. "Ficha médica" en la app quedaba girando para siempre sin mostrar ningún error

**Archivos:** `health_records_screen.dart`

Reportado por el usuario: "en la app cuando entro en salud... no está
funcionando se queda dando vueltas y no carga nada". Las 5 pestañas
(Alergias/Comorbilidades/Medicamentos/Cirugías/Signos vitales) llamaban
su `_load()` en `initState()` sin ningún `try/catch` — si el GET
fallaba por cualquier motivo (servidor caído, `adb reverse` perdido,
token vencido), la excepción quedaba sin manejar, `_loading` nunca
volvía a `false`, y la pantalla giraba indefinidamente sin mensaje
alguno. Se agregó manejo de error real (mismo patrón `_errorMessage`
ya usado en `health_assistant_screen.dart`) con botón "Reintentar" en
las 5 pestañas.

De paso, "Signos vitales" solo capturaba peso/altura/grupo sanguíneo —
`clinical.vitals_history` ya tenía columnas para presión arterial
(`blood_pressure_sys`/`dia`) sin usar en ningún lado de la UI. Pedido
explícito del usuario ("presión arterial... pueden ser medidos en
distintas oportunidades... tenemos que ponerle fecha del momento que lo
informa"): se agregó el par sistólica/diastólica al formulario y al
listado, más un selector de fecha de la medición (antes siempre era
`DateTime.now()`, ahora editable) — el listado ya ordenaba por
`measuredAt`, coherente con que cada fila es una medición histórica
independiente, no un valor que se pisa.

## 65. La ficha del viajero en admin-web no mostraba sus casos de asistencia ni sus viajes

**Archivos:** `traveler-detail.page.tsx`

Pedido explícito del usuario: "desde un usuario se tiene acceso a toda
la información del mismo como ser casos de asistencia, viajes
realizados, etc." La ficha (`/travelers/:id`) mostraba plan de
asistencia/cobertura médica/contactos de emergencia, pero nada de
`operations.emergency_cases` ni `operations.trips` — para ver los casos
de un viajero había que ir a la lista general de Casos y buscarlo ahí.
Se agregaron dos secciones nuevas (`GET /operations/emergency-cases?
memberId=X` y `GET /operations/trips?memberId=X`, ambos ya soportaban
ese filtro sin cambios de backend) con conteo en el título y, en Casos,
filas clickeables que navegan a `/cases/:id`.

## 66. Búsqueda por texto ausente en Usuarios/Pólizas/Viajes/Casos; ubicación de emergencia mostraba un nombre interno en vez de país/ciudad

**Archivos:** `travelers-list.page.tsx`, `partner-records.page.tsx`,
`trips-list.page.tsx`, `cases-list.page.tsx`, `trips_screen.dart`,
`me-trips.controller.ts`, `shared-profile.helper.ts`,
`shared-profile-view.tsx`

Pedido explícito del usuario: en Usuarios, buscar por nombre/email/N°
de póliza; en Pólizas, por N° de póliza; en Viajes, por viajero; en
Casos, por viajero/N° de póliza/N° de caso — las 4 listas solo tenían
filtros de selector (empresa/país/estado), sin texto libre. Se agregó
un `TextField` de búsqueda client-side a cada una, mismo patrón que los
filtros existentes.

Aparte, el usuario notó que un viaje creado automáticamente al
reportar una emergencia (gap #53, `create_member_emergency_case()`)
aparecía en "Mis viajes" con el título interno "Viaje detectado por
evento" en vez de mostrar dónde estaba el viajero — el campo
`trip_name` es solo una referencia interna, pero era lo único que se
mostraba; el país (`destination_country_id`) ni siquiera se traía en
`GET /me/trips` (solo la ciudad). Se agregó el JOIN a
`params.catalog_values` para el label del país, y la lista ahora
prioriza mostrar "Ciudad, País" como título cuando hay destino
cargado, dejando el nombre del viaje (o "Ubicación detectada al
reportar una emergencia" para los auto-generados) como subtítulo.

También se agregaron fechas a Comorbilidades/Medicamentos en la ficha
que ve el médico por QR (`diagnosed_at`/`started_at`, ya existían en el
schema pero no se seleccionaban ni mostraban) — pedido explícito del
usuario ("tener contemplado el caso de fechas e información
adicional").

## 67. Peso/altura "desaparecían" en la ficha apenas se cargaba el grupo sanguíneo por separado

**Archivos:** `clinical-history.section.tsx` (`PatientSummaryCard`), `ai.service.ts` (`getPersonContext`)

Reportado por el usuario: "cargué por la app el grupo sanguíneo, la
altura y peso y no se actualizó en el sistema". Verificado directamente
en la base: las DOS cargas SÍ se guardaron — `clinical.vitals_history`
es append-only (`vitals_no_update`/`vitals_no_delete` USING FALSE, ver
gap de diseño original), así que cada carga desde
`health_records_screen.dart` crea una fila nueva solo con los campos
completados esa vez (peso+altura en una fila, grupo sanguíneo solo en
otra posterior). El bug estaba del lado de la LECTURA: tanto el resumen
del viajero en admin-web como `getPersonContext()` del asistente de IA
tomaban la fila más reciente "tal cual" como si fuera un snapshot
completo — apenas se guardaba el grupo sanguíneo (fila más nueva, sin
peso/altura), esos dos campos "desaparecían" de la vista aunque seguían
guardados en la fila anterior. `getPersonContext()` en particular tenía
este bug desde que se escribió (mismo día, extensión de gap #63) — el
asistente iba a volver a preguntar peso/altura ya cargados.

Se corrigió en ambos lugares para resolver el valor no-nulo más
reciente POR CAMPO (peso, altura, grupo sanguíneo, IMC) en vez de por
fila — en admin-web con un `.find()` por campo sobre la lista ya
traída; en `getPersonContext()` con tres subconsultas independientes
(una por campo). Cualquier otro lugar que lea "el vitals_history más
reciente" como snapshot completo tiene el mismo riesgo — no había
ninguno más al momento de este fix.

## Consolidación formal

[`010_v1.2.4_fixes.sql`](src/database/sql/010_v1.2.4_fixes.sql) junta
los gaps #1, #2, #3, #4, #5, #6, #7 y #9 en un solo archivo, listo para
que el equipo de diseño lo revise como paquete — ya está aplicado y
probado contra el servidor real (22/22 tests e2e), esto solo lo
formaliza. El gap #3 queda marcado ahí mismo como pendiente de labels
reales (hoy son placeholders de test). El **gap #8 no está incluido**
todavía: sigue en diseño (ver decisión de superadmin/break-glass), no es
un fix mecánico como el resto.

## 68. No existía forma de ajustar parámetros de comportamiento de la app sin recompilarla

**Archivos:** [`proposed-app-settings.sql`](src/database/sql/proposed-app-settings.sql), `app-settings.service.ts`, `app-settings.controller.ts`, `params.module.ts`, `app-settings.page.tsx` (admin-web), `health_assistant_screen.dart`

Pedido explícito del usuario: la velocidad/tono de voz y tiempos de
pausa del asistente de salud por voz (gap de accesibilidad reciente)
estaban hardcodeados en Dart — cualquier ajuste fino necesitaba
recompilar y redistribuir la app. Se agregó `params.app_settings`, una
tabla genérica clave/valor (no una tabla dedicada solo a voz, para que
sirva de una vez para cualquier parámetro similar a futuro) — mismo
criterio que `params.domain_catalogs`/`catalog_values`: sin RLS propia,
lectura abierta a cualquier usuario autenticado (la app la necesita),
escritura restringida por `ConfigAccessGuard` (`canManageConfig`), no
por RLS. Nueva pantalla "Parámetros de la app" en admin-web (mismo
lugar que "Correo (SMTP)"), y la app móvil ahora hace fetch de estos
valores al entrar al asistente, con los mismos defaults como fallback
si el fetch falla (sin conexión, backend caído).

**Error real al aplicar**: la tabla se creó bien pero el primer
`GET /params/app-settings` tiró 500 — `permiso denegado a la tabla
app_settings`. A diferencia de `params.domain_catalogs` (creada en el
baseline con su GRANT ya incluido), una tabla nueva en Postgres no
hereda permisos del rol de la app (`app_runtime`) — hace falta
`GRANT SELECT, INSERT, UPDATE ON <tabla> TO app_runtime, test_runner`
explícito, mismo patrón que `params.smtp_settings`
(`proposed-password-reset-and-smtp.sql:184`). Cualquier tabla nueva
fuera del baseline necesita este GRANT aparte — no alcanza con crearla.

## 69. La app pedía volver a loguearse cada vez que se cerraba y se reabría

**Archivos:** `api_client.dart`

Reportado por el usuario: "cuando cierro la app y vuelvo a entrar
tengo que volver a logonearme, no puede quedar habilitada como pasa
con Facebook o Instagram". La sesión SÍ estaba pensada para persistir
(`flutter_secure_storage`, refresh token de 7 días vía
`JWT_REFRESH_TTL`) — el bug era una condición de carrera clásica de
refresh token de un solo uso: `auth.service.ts` (`issueTokenPair` con
`existingSessionId`) rota el `refresh_token_hash` de la MISMA fila de
sesión en cada `/auth/refresh`, invalidando el token anterior. El
access token dura 15 minutos (`JWT_ACCESS_TTL`), así que reabrir la app
después de ese tiempo (el caso normal) hace que varias pantallas pidan
datos en paralelo y TODAS reciban 401 casi al mismo tiempo. El
interceptor de Dio llamaba a `_tryRefresh()` de forma independiente por
cada 401 — la primera llamada a `/auth/refresh` rotaba el token con
éxito, pero las siguientes usaban el MISMO refresh token ya viejo
(inválido tras la rotación) y el backend las rechazaba
(`Sesión inválida, revocada o expirada`), lo que hacía `clearTokens()`
y deslogueaba a la persona pese a que la sesión se había renovado bien
un instante antes.

Se corrigió agregando un candado del lado del cliente: un solo
`Future<bool>?` compartido (`_refreshFuture`) — la primera llamada a
`_tryRefresh()` dispara el refresh real, y cualquier llamada
concurrente mientras está en vuelo espera ese MISMO Future en vez de
disparar su propio `/auth/refresh`. admin-web (`api-client.ts`,
`refreshPromise ??= refreshAccessToken()`) ya tenía este mismo candado
desde antes — la app móvil era la única sin este patrón "single-flight",
por eso solo ahí se veía el síntoma.

## 70. El alta de un viajero no validaba el email ni pedía el celular

**Archivos:** [`proposed-email-verification-and-registration-phone.sql`](src/database/sql/proposed-email-verification-and-registration-phone.sql), `auth.service.ts`, `auth.controller.ts`, `me-profile.controller.ts`, `register.dto.ts`, `register_screen.dart`, `home_screen.dart`, `auth_state.dart`

Pedido explícito del usuario: "cuando un usuario se da de alta no esta
validando el mail, eso es importante porque el mail es la forma de
comunicacion directa con los usuarios" + "en el registro del usuario
no veo donde se ingresa el numero de celular".

`core.users.phone`/`phone_verified` ya existían en el schema
(`003_core_identity.sql`) pero NADA los escribía en ningún lado de la
app — se agregó el campo (opcional) al formulario de registro y a
`core.register_person_and_user()` (mismo problema de "CREATE OR REPLACE
con más parámetros crea un overload nuevo" ya documentado — DROP de la
firma vieja de 7 parámetros antes de crear la de 9).

Verificación de email por **código de 6 dígitos**, no un link — la app
del viajero es mobile-only, sin página pública donde aterrizar un link
(a diferencia del reset de password, que sí tiene `/reset-password` en
admin-web). Mismo patrón que `core.password_reset_tokens`
(`core.email_verification_codes` + `consume_email_verification_code()`
SECURITY DEFINER). **No bloquea el uso de la app** — un banner
persistente en el home con el código, más "Reenviar". Las 18 cuentas ya
activas al momento de este fix quedaron marcadas `email_verified = TRUE`
de una vez (grandfather): no hay forma retroactiva de verificar el
email de alguien que ya viene usando la cuenta con normalidad, y
exigirlo con efecto retroactivo las habría dejado bloqueadas de la nada.

**Bug real encontrado probando el flujo end-to-end**: el primer intento
de `GET /me/profile` y `POST /auth/resend-verification-email` devolvía
`email_verified: false` siempre (aunque coincidía por casualidad con el
estado real del usuario de prueba) y `resend` fallaba con "No se
encontró el usuario". Causa: **`core.users` tiene RLS `FORCE`ado sin
NINGUNA policy propia** (fail-secure a propósito — todo acceso pasa por
funciones `SECURITY DEFINER` puntuales como `get_user_phone`,
`get_login_credentials`, nunca un `SELECT` directo). El código nuevo
hacía `SELECT ... FROM core.users WHERE id = $1` directo desde el
controller/servicio — RLS lo bloqueaba EN SILENCIO (0 filas, no error),
mismo patrón de bug ya visto varias veces esta sesión con otras tablas,
acá aplicado a `core.users` específicamente. Se corrigió ampliando
`core.get_user_phone()` para devolver también `email_verified` (mismo
caller, un solo viaje) y agregando `core.get_user_email(p_user_id)` para
el caso de reenvío — ambas `SECURITY DEFINER`, ningún `SELECT` directo a
`core.users` desde el código de la app.

## 71. Voz del asistente de salud vía OpenAI (gpt-4o-mini-tts) en vez del motor del teléfono

**Archivos:** `ai-provider.interface.ts`, `openai.provider.ts`, `ai.service.ts`, `me-health-assistant.controller.ts`, `synthesize-speech.dto.ts`, [`proposed-openai-tts-voice-setting.sql`](src/database/sql/proposed-openai-tts-voice-setting.sql), `health_assistant_screen.dart`

Pedido explícito del usuario: "quiero que la voz sea totalmente
natural... no que parezca un chat". `gpt-4o-mini-tts` (a diferencia de
`tts-1`/`tts-1-hd`) acepta `instructions` en lenguaje natural para
moldear la entonación — se le pide explícitamente que hable "como un
médico haciendo una entrevista clínica en persona, no como leyendo un
mensaje de chat". Nuevo endpoint `POST /me/health-assistant/speech`
devuelve el audio crudo (mp3); la app lo reproduce con `audioplayers`
(`BytesSource`) y cae al motor del teléfono (`flutter_tts`, ya
existente) si el pedido falla — nunca deja el modo manos libres en
silencio. La voz (`assistant.tts_voice`, default `nova`) se agregó a
`params.app_settings` (gap #68), editable desde "Parámetros de la app"
sin recompilar.

De paso, pedido explícito del usuario: "confirmar por medio de la voz
con un ok o un si o un correcto" — mientras el modo manos libres tiene
propuestas sin confirmar del turno, la próxima escucha ya no se manda
como antecedente nuevo: se interpreta como sí/no
(`_handleVoiceConfirmation`, regex de palabras afirmativas/negativas) y
dispara `_resolveProposal` como si se hubiera tocado el botón. El
`SYSTEM_PROMPT` ahora exige que "reply" siempre termine preguntando
confirmación en una forma respondible con una sola palabra cuando hay
`proposals` en el turno.

**Pendiente del lado del usuario, no del código**: la API key de
OpenAI configurada hoy es una key restringida sin el scope
`api.model.audio.request` — el endpoint de audio devuelve
`401 Missing scopes` y la app cae correctamente al motor del teléfono
(no rompe nada, pero no se escucha la voz nueva todavía). Para
habilitarla: en platform.openai.com → API keys → la key en uso →
agregar el permiso de Audio (o generar una key sin restricciones) →
confirmar que el rol en la organización/proyecto tenga acceso a Audio.

## 72. IA en el chat de emergencia — primer contacto automático + derivación a operador

**Archivos:** [`proposed-emergency-chat-ai-assistant.sql`](src/database/sql/proposed-emergency-chat-ai-assistant.sql), `ai-provider.interface.ts`, `openai.provider.ts`, `ai.service.ts` (`respondInEmergencyChat`), `me-emergency-cases.controller.ts`, `events.gateway.ts`, `knowledge-base.controller.ts`, `knowledge-base.page.tsx` (admin-web), `case-chat.section.tsx`, `case_chat_screen.dart`

Pedido explícito del usuario: "el primer contacto deberia manejarlo la
IA... informando que se ha contactado con el asistente de IA de la
App... y en caso de que necesite contactarse con un operador, este lo
derivara — la idea es que la app sea lo mas autosuficiente posible".

La IA escribe en el MISMO `operations.chat_messages` que ya usa el chat
humano (no un log paralelo) — un operador que toma el caso ve toda la
charla previa con la IA, no arranca de cero. Se abstiene por completo
apenas hay un operador humano activo en el caso (`case_participants`
con `participant_type = OPERATOR` e `is_active`) — nunca "compite"
hablando a la vez que una persona real. Se dispara en dos puntos:
saludo inicial (`MeEmergencyCasesController.create()`, fire-and-forget
después de confirmado el alta del caso — un fallo acá nunca puede
tumbar la creación del caso, que es lo crítico) y respuesta continua
(`events.gateway.ts` → `handleSendMessage`, después de cada mensaje del
viajero, sin await en el ack para no sumarle la latencia de OpenAI).

**Derivación**: la IA devuelve `escalateToOperator: boolean` (JSON
schema estricto, `EMERGENCY_RESPONSE_JSON_SCHEMA`) — si es `true`, sube
`emergency_cases.priority_id` a `HIGH` vía
`operations.escalate_case_priority()`. Barrera de seguridad más
estricta que el asistente de ficha médica: nunca da diagnóstico ni
indicación de tratamiento, solo contiene y deriva.

**Base de conocimiento** (`ai.knowledge_base_entries`, pantalla nueva
en admin-web): pedido explícito del usuario de poder "ir alimentando
de información" al asistente desde la web sin tocar código — MVP manda
TODO lo activo al prompt en cada charla (sin búsqueda/relevancia
todavía, pensado para una base chica).

**Gaps de catálogo encontrados de paso** (investigando esto): `CASE_PRIORITY`
solo tenía sembrado `MEDIUM` en todo el schema commiteado — ninguna
otra prioridad existía pese a que el código ya la usa; se sembraron
`LOW`/`HIGH`/`CRITICAL`. `CHAT_SENDER_TYPE` solo tenía `MEMBER`/`OPERATOR` —
se agregó `AI_ASSISTANT`.

**Inserción sin RLS de usuario real**: igual que `create_member_emergency_case()`,
la IA responde en un proceso de background sin un JWT/GUC de sesión
real en vuelo, así que `msg_insert` (que exige ser un `case_participant`
activo) la bloquearía — se agregó `operations.insert_system_chat_message()`
`SECURITY DEFINER` para este caso puntual, replicando a mano lo que
`handleSendMessage()` hace a mano (mantener `chat_channels.message_count`/
`last_message_at`/`last_message_preview` al día).

Probado end-to-end contra el servidor real: alta de caso con
descripción/síntomas → saludo de la IA contextual (mencionó los
síntomas reportados, se presentó como IA, ofreció derivar) en <6s;
caso con síntomas graves → la IA derivó y la prioridad subió a `HIGH`
correctamente. Cuentas de prueba y casos creados para la prueba, limpiados.

## 73. Base de conocimiento con alcance por asistente (3 asistentes de IA)

**Archivos:** [`proposed-knowledge-base-scope.sql`](src/database/sql/proposed-knowledge-base-scope.sql), `knowledge-base.controller.ts`, `knowledge-base-entry.dto.ts`, `ai.service.ts` (`getScriptGuidance`, `appHelpChat`), `ai-provider.interface.ts`, `openai.provider.ts`, `me-assistant.controller.ts`, `knowledge-base.page.tsx` (admin-web)

Pedido explícito del usuario: "Como hicimos con Base de conocimiento IA
podemos armar algo similar para... la carga de antecedentes de la
ficha de salud... así no hay algo prefijado en el sistema que no se
pueda cambiar" — y apenas se probó en vivo, extendido a un tercer
asistente: "esta faltando en Asistente de Uso de la App, ya que hay
conocimiento que solo deberia aplicar ahi".

`ai.knowledge_base_entries` (gap #72) ahora tiene una tabla puente
`ai.knowledge_base_entry_scopes` (dominio `KB_ENTRY_SCOPE`:
`EMERGENCY_CHAT`/`HEALTH_ASSISTANT`/`APP_HELP_ASSISTANT`) — cada
entrada puede aplicar a uno, dos o los tres asistentes a la vez. Se
descartó una columna `scope_id` única con un valor `"BOTH"` (primera
iteración de este mismo cambio) apenas apareció el tercer asistente:
"ambos" dejó de ser suficiente. El `SYSTEM_PROMPT`/`EMERGENCY_SYSTEM_PROMPT`
hardcodeados en `openai.provider.ts` NO se reemplazan — las reglas de
seguridad y el contrato JSON de `proposals` siguen fijos en código; lo
que se inyecta desde la base de conocimiento es una sección aparte
("GUÍA OPERATIVA CONFIGURABLE") que ajusta tono/énfasis sin poder pisar
la seguridad.

De paso, `MeAssistantController` (`/me/assistant/ask`, el asistente de
ayuda de uso de la app) importaba el SDK de OpenAI directo — violación
de MTA-103 §10 ("AI Gateway como único módulo que toca el proveedor")
que quedó al descubierto al conectarlo a la base de conocimiento. Se
movió la lógica a `AIService.appHelpChat()`/`OpenAIProvider.appHelpChat()`,
mismo patrón que los otros dos asistentes.

**Bug propio encontrado y corregido en la misma sesión**: `catalog_values`
no tiene `UNIQUE(domain_id, code)` — un `INSERT ... ON CONFLICT DO
NOTHING` sin ese constraint no deduplica nada (Postgres lo permite como
sintaxis válida, simplemente nunca encuentra conflicto). Reaplicar la
primera versión de esta migración duplicó las filas de catálogo
`EMERGENCY_CHAT`/`HEALTH_ASSISTANT` (confirmado en la base real). Se
limpiaron las filas duplicadas sin referencias y se reescribió el
`INSERT` con `WHERE NOT EXISTS` para que sea seguro reaplicarlo.

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
