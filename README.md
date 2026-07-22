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
TypeORM están transcritas a mano del SQL aprobado (no generadas por
introspección — no había Docker/Postgres disponible al armar este
scaffold). Las relaciones `@ManyToOne` solo están modeladas en las cadenas
de propiedad centrales para RLS (tenant → person → member → user, member →
case, case → chat); el resto de FKs quedan como columna UUID simple con un
comentario de a qué tabla referencian.

## Qué NO está implementado todavía

- **Login/refresh** (`src/modules/auth/auth.controller.ts`): `core.users`
  tiene RLS forzada pero sin política `SELECT` — buscar un usuario por
  `email_blind_index` requiere una función `SECURITY DEFINER` (mismo patrón
  que `clinical.has_clinical_access`) que todavía no existe en el schema
  v1.2.3. Hay que agregarla al SQL aprobado antes de poder cerrar esto.
- Lógica de negocio de los 4 processors de BullMQ (`src/modules/jobs/`).
- Lógica del gateway Socket.io más allá de unirse/salir de una sala
  (`src/modules/events/events.gateway.ts`) — falta autenticar el handshake
  y verificar membresía real en `case_participants`.
- Endpoints CRUD para el resto de los ~104 tablas — solo el catálogo de
  `params` tiene un endpoint real de punta a punta, como prueba del patrón
  de contexto RLS.

## Levantar el entorno local

Requiere Docker Desktop (no estaba disponible en el entorno donde se armó
este scaffold, así que **no se pudo probar contra una base real**).

```bash
cp .env.example .env      # completar JWT_SECRET, DB_ENCRYPTION_KEY, etc.
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

(En SRV-2/staging/prod ese rol y su contraseña los gestiona
infraestructura — este script es solo para desarrollo local.)

```bash
npm run start:dev
# GET  http://localhost:3000/health
# GET  http://localhost:3000/params/catalogs/:domainCode
# Swagger: http://localhost:3000/docs
```

## Scripts

- `npm run build` / `npm run start:dev` / `npm run lint`
- `npm run migration:run` / `migration:revert` / `migration:show`
