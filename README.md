# MedTravelApp — monorepo

Plataforma de administración de información de salud, coberturas y
asistencia al viajero (multi-tenant). Ver
[`MedTravelApp_01_Alcance_Arquitectura_Datos.docx`](../MEDTRAVELAPP/MedTravelApp_01_Alcance_Arquitectura_Datos.docx)
y [`MedTravelApp_02_Brief_Claude_Code.docx`](../MEDTRAVELAPP/MedTravelApp_02_Brief_Claude_Code.docx)
para el alcance completo y las reglas de trabajo — léanse antes de tocar código.

## Estructura

```
apps/
  api-core/     NestJS + TypeScript + TypeORM sobre el schema SQL v1.2.3
                (PostgreSQL, RLS). Ver apps/api-core/README.md.
  admin-web/    Panel administrativo — React + TypeScript + Vite + MUI +
                React Query + React Hook Form + Zod. (pendiente)
  share-web/    Portal de acceso compartido (QR/enlaces de emergencia,
                sin exponer la API interna). (pendiente)
  mobile/       App del viajero — Flutter + Dart, Clean Architecture,
                Riverpod, GoRouter. (pendiente)
packages/       Paquetes compartidos entre apps (api-contracts,
                shared-types, validation). (pendiente)
```

Cada `apps/*` tiene su propio `package.json` y se instala/corre de forma
independiente — `npm install` en el root solo agrupa los workspaces, no
reemplaza instalar dependencias dentro de cada app.

## Reglas no negociables (ver el brief para el detalle completo)

- El modelo de datos (schema SQL v1.2.3) no se rediseña — ya existe,
  está testeado (31/31), y cualquier cambio se documenta como una nueva
  versión (`v1.2.4`, etc.), nunca se pisa en silencio.
- `clinical.has_clinical_access(person_id)` centraliza todo acceso
  clínico — no reimplementar esa lógica en ninguna app.
- Zero Hardcode: ninguna regla de negocio fija en código — todo pasa
  por los catálogos de `params.*`.
- API First: `admin-web`, `share-web` y `mobile` nunca acceden directo
  a PostgreSQL — todo pasa por `api-core`.
- El Superadmin de plataforma nunca tiene acceso automático a datos
  clínicos ni puede otorgar consentimientos por el usuario.
