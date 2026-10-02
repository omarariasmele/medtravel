# Publicar MedTravelApp en el servidor (192.168.0.150)

El servidor corre **solo lo compilado**. No lleva codigo fuente, ni VS
Code, ni Flutter, ni git. Se sigue programando en la PC de siempre; el
servidor solo se actualiza cuando vos decidis publicar.

```
  PC de desarrollo                        Servidor 192.168.0.150
  ────────────────                        ──────────────────────
  codigo + VS Code                        PostgreSQL :5433
  npm run start:dev  ──┐                  MedTravelApp-API  (servicio)
                       │ build-release    MedTravelApp-Caddy (servicio)
                       └──────────────▶   :8443 API  /  :8444 panel
```

## Archivos de esta carpeta

| Archivo | Donde corre | Para que |
|---|---|---|
| `build-release.ps1` | PC | Compila y arma la carpeta que se copia al servidor |
| `install-server.ps1` | Servidor (admin) | Instalacion inicial: servicios, firewall, dependencias |
| `update-server.ps1` | Servidor (admin) | Publicar una version nueva |
| `Caddyfile` | Servidor | Proxy HTTPS de produccion |
| `env.server.example` | Servidor | Plantilla del `.env` de produccion |

## Instalacion inicial (una sola vez)

**1. Preparar el servidor.** Instalar Node.js LTS (.msi), y copiar
`nssm.exe` y `caddy.exe` a `C:\MedTravelApp\bin`.

**2. En la PC**, armar el release con los archivos ya subidos:

```powershell
cd D:\Dev\Desarrollo_MedtravelApp\nestjs-api\deploy
.\build-release.ps1 -IncludeUploads -Zip
```

**3. Copiar** `D:\Dev\MedTravelApp-release.zip` al servidor (por RDP
alcanza con copiar y pegar) y descomprimirlo en `C:\Deploy`.

**4. En el servidor**, armar el `.env` de produccion en
`C:\MedTravelApp\apps\api-core\.env` a partir de `env.server.example`.
Los secretos tienen que ser **los mismos que en desarrollo**: si cambia
`DB_ENCRYPTION_KEY` o `DB_BLIND_INDEX_KEY`, los datos ya guardados
quedan ilegibles y nadie puede loguearse.

**5. Copiar el certificado**: los dos `.pem` van a
`C:\MedTravelApp\certs\`.

**6. Instalar**, en PowerShell **como Administrador**:

```powershell
cd C:\Deploy\MedTravelApp-release\scripts
.\install-server.ps1 -ReleaseDir C:\Deploy\MedTravelApp-release
```

**7. Probar desde otra PC de la oficina**, todavia sin tocar el router:
`http://192.168.0.150:8100/health` y `http://192.168.0.150:8101`.

**8. Recien ahi, mover el port forwarding** del router: 8443 y 8444
dejan de apuntar a la PC (192.168.0.70) y pasan a 192.168.0.150. Apagar
las ventanas de `iniciar-medtravelapp.bat` en la PC.

## Publicar una version nueva (el dia a dia)

En la PC, con los cambios ya probados y consolidados:

```powershell
cd D:\Dev\Desarrollo_MedtravelApp\nestjs-api\deploy
.\build-release.ps1
```

> **Ojo**: `build-release.ps1` corre `nest build`, que tiene
> `deleteOutDir: true` — borra y regenera `apps\api-core\dist`. Si en ese
> momento tenes el `start:dev` corriendo, el watcher reinicia la API y el
> local queda caido unos 30 segundos. No rompe nada, pero conviene saberlo
> (o compilar con el entorno de desarrollo cerrado).

Copiar la carpeta al servidor y ahi, como Administrador:

```powershell
C:\Deploy\MedTravelApp-release\scripts\update-server.ps1 -ReleaseDir C:\Deploy\MedTravelApp-release
```

Corta la API unos segundos, la vuelve a levantar y verifica `/health`.
Si no responde, sale con error y dice que log mirar.

## Lo que publicar NUNCA toca

- **El `.env` de produccion** — vive solo en el servidor.
- **`uploads/`** — archivos reales de los usuarios. Solo se copia la
  primera vez, si el servidor todavia no tiene la carpeta.
- **La base de datos** — `typeorm.config.ts` tiene `synchronize: false`
  y `migrationsRun: false`, asi que el arranque no corre migraciones.
  Un cambio de schema es un paso aparte, hecho a mano y a conciencia.
- **Los certificados**.

## Operacion

```powershell
Get-Service MedTravelApp-*                            # estado
Restart-Service MedTravelApp-API                      # reiniciar la API
Restart-Service MedTravelApp-Caddy                    # recargar Caddy (ej. cert nuevo)
Get-Content C:\MedTravelApp\logs\api-err.log -Tail 40 # errores
Get-Content C:\MedTravelApp\VERSION.txt               # que commit esta publicado
```

Los dos servicios arrancan solos con Windows y se reinician solos si el
proceso se muere (`AppExit Restart` de NSSM).

## Pendientes conocidos

- **Certificado**: vence el **2026-12-09**. La validacion es dns-01
  manual (el puerto 80 esta ocupado por otro forward), asi que conviene
  seguir emitiendolo con win-acme desde la PC y copiar los `.pem`
  nuevos a `C:\MedTravelApp\certs` + `Restart-Service MedTravelApp-Caddy`.
- **Base compartida entre desarrollo y produccion**: hoy tu `.env` local
  y el del servidor apuntan a la misma base (`medtravelapp`). Mientras
  siga asi, una prueba tuya toca los datos que ve el publico. Lo sano es
  crear `medtravelapp_dev` en el mismo Postgres y apuntar el `.env` de
  la PC ahi.
