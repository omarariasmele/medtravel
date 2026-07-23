# MedTravelApp — nestjs-api

Scaffold de la API de MedTravelApp (OYS GROUP S.A.) sobre el schema SQL
**v1.2.3** aprobado (Baseline Candidate, 2026-07-20 — ver
`CHANGELOG_v1.2.3.md` en `MEDTRAVELAPP/Desarrollo/`). Stack: NestJS 10 +
TypeScript + TypeORM + PostgreSQL 16 + BullMQ + Socket.io.

## Por qué está armado así

El schema usa RLS (Row Level Security) en casi todas las tablas sensibles,
y tanto las políticas RLS como el trigger de auditoría (`audit.log_event`)
dependen de variables de sesión de Postgres (`app.current_user_id`,
`app.current_tenant_id`, `app.current_person_id`, etc. — ver
`000_extensions.sql`). Si la app no las setea antes de cada query, Postgres
deniega el acceso por diseño (fail-secure).

Por eso la pieza central de este scaffold es
[`TenantTransactionManager`](src/common/database/tenant-transaction.manager.ts):
abre una transacción, lee el contexto del request actual desde
[`RequestContextStore`](src/common/request-context/request-context.store.ts)
(poblado por [`PgSessionContextInterceptor`](src/common/request-context/pg-session-context.interceptor.ts)
a partir del JWT + headers) y ejecuta `SELECT set_config(...)` por cada GUC
antes de correr cualquier query. **Cualquier service que toque una tabla
con RLS debe pasar por acá**, no por un `Repository` inyectado directamente.

## Estructura

```
src/
  main.ts, app.module.ts, app.controller.ts (GET /health)
  config/            # validación de env, factories de TypeORM/BullMQ
  common/
    request-context/  # AsyncLocalStorage + interceptor de contexto
    database/         # TenantTransactionManager, UuidBaseEntity
  database/
    sql/               # 000_extensions.sql … 009_tests.sql (baseline aprobado, sin tocar)
    sql/local-dev-login-role.sql  # solo dev local, ver más abajo
    data-source.ts, migrations/InitialSchema_v1_2_3.ts
  modules/
    params/      # catálogos, workflows, feature flags, límites operativos
                 #   + vertical slice real: GET /params/catalogs/:domainCode
    audit/       # audit events (solo lectura), break-glass vía funciones SQL
    identity/    # core.* — tenants, persons, users, members, consents
    coverage/    # planes de asistencia, enrollments, certificados, tarjetas
    clinical/    # historial clínico (modelo de 3 estados MTA-511),
                 #   profesionales, organizaciones, encounters/submissions
    emergency/   # tokens de emergencia, acceso offline firmado, access log
    operations/  # viajes, casos de emergencia, chat, operadores, analytics
    auth/        # JWT (login/refresh quedan como stub, ver más abajo)
    jobs/        # 4 colas BullMQ, processors stub
    events/      # Socket.io gateway (salas por case_id), stub
```

Cada módulo de dominio mapea 1:1 a un schema Postgres. Las entidades
TypeORM están transcritas a mano del SQL aprobado. Las relaciones
`@ManyToOne` solo están modeladas en las cadenas de propiedad centrales
para RLS (tenant → person → member → user, member → case, case → chat);
el resto de FKs quedan como columna UUID simple con un comentario de a
qué tabla referencian.

## CRUD genérico

Además de `params/catalogs` (lectura de catálogos) y `auth` (login/refresh
reales), el resto de los módulos exponen un **CRUD genérico** montado en
`/<módulo>/:resource` (`GET`/`POST` en la colección,
`GET`/`PATCH`/`DELETE` en `/:resource/:id`). La pieza central es
[`RlsCrudService`](src/common/database/rls-crud.service.ts) +
[`createResourceController`](src/common/database/create-resource-controller.ts):
cada módulo solo declara un registro chico (`<modulo>.registry.ts`) de
`nombre-de-recurso -> EntityClass` y listo — todo pasa igual por
`TenantTransactionManager`, con las mismas GUCs/RLS que el resto de la app.

Sin DTO de `class-validator` por entidad a propósito: las políticas RLS y
los `CHECK`/`NOT NULL`/`UNIQUE`/FK de Postgres son la única fuente de
verdad; [`pg-error.mapper.ts`](src/common/database/pg-error.mapper.ts)
traduce sus violaciones a HTTP limpio (400/403/409) en vez de un 500
genérico. Quedaron **afuera a propósito** de estos registros: tablas de
solo-log/auditoría que se llenan solas por trigger (`data-audit-events`,
`case-status-history`, `access-log`, etc.), pipelines batch
(`identity-match-*`, `organization-candidates`, etc.) y tablas con campos
cifrados/blind-index que maneja `AuthService` (`users`,
`authentication-credentials`, `mfa-methods`). El detalle completo de qué
entra en cada módulo está en los comentarios de cada `*.registry.ts`.

`break-glass-grants` (audit) queda deliberadamente fuera del CRUD
genérico — tiene su propio
[`BreakGlassService`](src/modules/audit/break-glass.service.ts) que solo
permite crear/aprobar/revocar vía las funciones SQL controladas
(`request_break_glass`, etc.); un CRUD genérico ahí reabriría el agujero
de seguridad que el schema (C3) cerró a propósito.

## Chat en tiempo real (Socket.io)

`src/modules/events/events.gateway.ts` — namespace `/cases`, una sala por
`case_id`. El handshake se autentica con el mismo JWT que el resto de la
API (`client.handshake.auth.token`); `join_case` y `send_message`
verifican membresía real y activa en `operations.case_participants`
(esa tabla no tiene RLS propia, el chequeo lo hace la app). Los mensajes
se insertan de verdad en `operations.chat_messages` y se hace broadcast
a la sala. Además, `PATCH /operations/emergency-cases/:id` (controller
dedicado, separado del CRUD genérico de `operations` para poder
enganchar esto) emite `case_update` a la sala del caso después de cada
actualización.

## Jobs de BullMQ

- **`anonymization-jobs`**: implementado de verdad —
  `AnonymizationService.processJob()` (`src/modules/jobs/anonymization.service.ts`)
  toma un `audit.data_anonymization_jobs` PENDING, aplica el método
  (`PSEUDONYMIZATION`, `HASH_IRREVERSIBLE`, o degrada a `NULL` para
  `REDACT`/`GENERALIZATION`/`SUPPRESSION` — generalización real por tipo
  de columna queda como límite conocido) a cada campo listado, y marca
  `COMPLETED`/`FAILED`. Usa `audit.anonymize_field()` (`SECURITY DEFINER`,
  ver más abajo) porque un job de background no tiene el
  `app.current_person_id` de nadie y necesita tocar tablas con RLS
  forzada (ej. `core.persons`) para un `row_id` arbitrario.
- **`document-ai-processing`**, **`access-notifications`**,
  **`coverage-sync`**: siguen sin lógica real — necesitan integraciones
  externas (API de IA, proveedor de push/email/SMS, API del partner)
  que no están definidas todavía.
- Nada de esto se pudo probar pasando realmente por BullMQ/Redis en este
  entorno (Redis no está instalado, ver sección de Jobs más arriba en la
  conversación de desarrollo) — `AnonymizationService` está separado del
  `@Processor` de BullMQ justamente para poder testearlo llamándolo
  directo (ver `test/anonymization.e2e-spec.ts`), sin depender de la cola.

## Qué NO está implementado todavía

- Lógica real de `document-ai-processing`, `access-notifications` y
  `coverage-sync` (ver arriba — necesitan integraciones externas).
- `case-medical-events`, `operator-sessions`/`operator-audit-log`,
  `tenant-analytics-cache` y varias tablas de pipeline (dedup de
  organizaciones, matching de identidad, verificación de profesionales)
  no tienen endpoint todavía — quedaron fuera del CRUD genérico a
  propósito (ver arriba), pendientes de un flujo de negocio dedicado.
- `case-participants`, `chat-channels`, `message-attachments`,
  `message-reads`, `chat-translations`, `tenant-access-requests`,
  `operator-roles`, `operators` y `operator-presence` **ya no** están en
  el CRUD genérico de `/operations` — se sacaron por un problema de
  seguridad real (gap #8, ver `SCHEMA_GAPS.md`): ninguna tenía RLS
  propia, así que quedaban expuestas a cualquier usuario autenticado sin
  el control de membresía que sí aplica el gateway de Socket.io.
- Propuestas aplicadas a mano contra el servidor de desarrollo, pendientes
  de revisión para sumarse a la próxima versión del schema aprobado
  (v1.2.4) — no están en el baseline v1.2.3 original. Ver
  [`SCHEMA_GAPS.md`](SCHEMA_GAPS.md) para el detalle completo de los 9
  gaps encontrados (por qué, cómo se parchó, y qué falta decidir).

## Levantar el entorno

### Contra un Postgres 16 propio (Docker)

```bash
cp .env.example .env      # completar JWT_SECRET, DB_ENCRYPTION_KEY, DB_BLIND_INDEX_KEY, etc.
docker compose up -d      # Postgres 16 + Redis 7
npm install
npm run migration:run     # corre 000_extensions.sql … 007_operations.sql tal cual
```

Después de la migración, para poder conectarte con la app (no con
`migration_owner`), corré una vez el script de rol de login local:

```bash
docker compose exec postgres psql -U migration_owner -d medtravel \
  -f /dev/stdin < src/database/sql/local-dev-login-role.sql
```

### Contra un servidor remoto ya existente

Mismo flujo, pero `.env` apunta a `DB_HOST`/`DB_PORT` reales y
`DB_MIGRATION_USERNAME` es el superuser real de ese servidor (no
necesariamente `migration_owner`, ver comentarios en `.env.example`).
Después de migrar, aplicá también los dos scripts "propuesta" mencionados
arriba (`fix-002-missing-params-grants.sql` y
`proposed-core-login-credentials-function.sql`) — no forman parte de la
migración automática porque no son parte del baseline aprobado.

```bash
npm run start:dev
# GET  http://localhost:3000/health
# POST http://localhost:3000/auth/login | /refresh | /logout
# POST http://localhost:3000/auth/mfa/enroll | /verify | /disable
# GET  http://localhost:3000/params/catalogs/:domainCode
# GET/POST/PATCH/DELETE http://localhost:3000/<modulo>/:resource[/:id]
# Swagger: http://localhost:3000/docs
```

Ver [`requests.http`](requests.http) para ejemplos listos para correr
desde VS Code (extensión "REST Client").

## Seguridad

- **Helmet** (headers de seguridad HTTP) y **CORS** restringido a
  `CORS_ORIGIN` (HTTP y Socket.io, ver `main.ts` / `events.gateway.ts`).
- **Rate limiting** (`@nestjs/throttler`): 100 req/min global, 10/min
  específico en `POST /auth/login` — frena fuerza bruta por IP,
  independiente del bloqueo de cuenta.
- **Bloqueo de cuenta** tras intentos fallidos: umbrales
  (`AUTH_MAX_FAILED_ATTEMPTS`, `AUTH_LOCKOUT_MINUTES`) leídos de
  `params.operational_limits` (mismo patrón B9 que el resto del schema),
  no hardcodeados — ver
  [`operational-limits.helper.ts`](src/common/database/operational-limits.helper.ts).
  Esas dos claves tampoco están en `008_seeds.sql`; se agregaron a mano
  contra el servidor de desarrollo, igual que los otros gaps documentados.
- **MFA (TOTP)**: `POST /auth/mfa/enroll` genera un secreto (con
  `otplib`) y lo guarda cifrado (`core.encrypt_pii`) en
  `core.mfa_methods`, sin verificar todavía. `POST /auth/mfa/verify`
  confirma la inscripción con el primer código válido generado por la
  app autenticadora. Una vez verificado, `login()` exige `mfaCode` en el
  body — si falta, responde `{ mfaRequired: true }` (200, no es un
  error) en vez de tokens; si el código es inválido, cuenta como intento
  fallido para el mismo bloqueo de cuenta de arriba. `POST
  /auth/mfa/disable` lo desactiva. Requirió agregar RLS y sembrar el
  catalog_value `TOTP` que faltaban en el schema aprobado — ver gap #6
  en [`SCHEMA_GAPS.md`](SCHEMA_GAPS.md).

## Tests

`npm run test:e2e` corre contra **la base configurada en `.env`** (hoy,
el servidor real de desarrollo) — no hay una base de test aislada
todavía. Corre con `--runInBand` (serial, no en paralelo) a propósito:
sin una base aislada, varias suites abriendo conexiones simultáneas
contra el mismo servidor compartido generaban fallas intermitentes por
contención, no errores reales — un mismo test podía fallar corriendo en
paralelo con el resto y pasar perfecto en aislamiento. Cada test crea su propio `core.persons`/`core.users` con datos
únicos y los borra en el teardown (ver
[`test/support/test-user.ts`](test/support/test-user.ts)), así que no
depende de datos fijos ni ensucia la base entre corridas. Cubre login
(éxito/fallo/refresh/logout), MFA (enroll/verify/mfaRequired), y que la
RLS de cada módulo realmente se aplica de punta a punta:
- **clinical**: titular crea su propio registro, no el de otra persona.
- **identity**: `core.persons` — propio visible, ajeno oculto (404).
- **coverage**: `health_coverages` — propio member sí, ajeno no (403),
  nunca se puede borrar.
- **operations**: `trips` — propio member sí, ajeno no (403); recursos
  sacados del registro por falta de RLS (gap #8) dan 404.
- **anonymization**: job real de anonimización (pseudonimizar + marcar
  completado).

## Scripts

- `npm run build` / `npm run start:dev` / `npm run lint`
- `npm run migration:run` / `migration:revert` / `migration:show`
- `npm run test:e2e`

## CI

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) corre `npm ci`,
`npm run lint` y `npm run build` en cada push/PR a `main`. **No** corre
`test:e2e` — esa suite apunta al servidor de desarrollo real
(`192.168.0.150:5433`, red privada), inalcanzable desde un runner de
GitHub Actions; seguir corriéndola a mano desde una máquina con acceso a
esa red (ver sección Tests arriba).
