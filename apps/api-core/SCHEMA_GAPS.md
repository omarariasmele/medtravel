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

## Consolidación formal

[`010_v1.2.4_fixes.sql`](src/database/sql/010_v1.2.4_fixes.sql) junta
los gaps #1, #2, #3, #4, #5, #6, #7 y #9 en un solo archivo, listo para
que el equipo de diseño lo revise como paquete — ya está aplicado y
probado contra el servidor real (22/22 tests e2e), esto solo lo
formaliza. El gap #3 queda marcado ahí mismo como pendiente de labels
reales (hoy son placeholders de test). El **gap #8 no está incluido**
todavía: sigue en diseño (ver decisión de superadmin/break-glass), no es
un fix mecánico como el resto.

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
