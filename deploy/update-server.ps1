<#
.SYNOPSIS
  Publica una version nueva. SE CORRE EN EL SERVIDOR, como admin.

.DESCRIPTION
  Este es el paso de "ya lo aprobe, actualizo la web": para la API,
  reemplaza lo compilado, reinstala dependencias si cambiaron y la
  vuelve a levantar. La ventana de caida es de unos segundos.

  NUNCA toca: el .env de produccion, uploads/ (archivos reales de los
  usuarios), certs/ ni la base de datos. Publicar no corre migraciones:
  el schema se cambia a mano y aparte, a proposito.

.EXAMPLE
  .\update-server.ps1 -ReleaseDir C:\Deploy\MedTravelApp-release
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$ReleaseDir,
  [string]$Target = "C:\MedTravelApp",
  # No reinstalar dependencias (mas rapido, solo si el lockfile no cambio).
  [switch]$SkipInstall
)

$ErrorActionPreference = 'Stop'
$ApiService = 'MedTravelApp-API'

function Step($msg) { Write-Host "`n>> $msg" -ForegroundColor Cyan }

function Copy-Tree([string]$From, [string]$To) {
  robocopy $From $To /MIR /NFL /NDL /NJH /NJS /NP | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "robocopy fallo ($LASTEXITCODE): $From -> $To" }
  $global:LASTEXITCODE = 0
}

if (-not (Test-Path "$ReleaseDir\apps\api-core\dist\main.js")) {
  throw "$ReleaseDir no parece un release valido (falta apps\api-core\dist\main.js)."
}
if (Test-Path "$ReleaseDir\VERSION.txt") { Get-Content "$ReleaseDir\VERSION.txt" | Write-Host }

$serviceExists = $null -ne (Get-Service $ApiService -ErrorAction SilentlyContinue)

# El lockfile decide si hace falta reinstalar: comparar antes de pisarlo.
$lockChanged = $true
if (Test-Path "$Target\package-lock.json") {
  $lockChanged = (Get-FileHash "$ReleaseDir\package-lock.json").Hash -ne (Get-FileHash "$Target\package-lock.json").Hash
}

if ($serviceExists) {
  Step "Parando $ApiService"
  Stop-Service $ApiService -Force
  # Windows puede tardar en soltar los archivos del proceso; sin esta
  # espera el robocopy siguiente falla con "archivo en uso".
  $deadline = (Get-Date).AddSeconds(30)
  while ((Get-Service $ApiService).Status -ne 'Stopped' -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 500 }
}

Step "Copiando la version nueva a $Target"
New-Item -ItemType Directory -Path "$Target\apps\api-core", "$Target\apps\admin-web", "$Target\logs" -Force | Out-Null
Copy-Item "$ReleaseDir\package.json"                 "$Target\package.json" -Force
Copy-Item "$ReleaseDir\package-lock.json"            "$Target\package-lock.json" -Force
Copy-Item "$ReleaseDir\apps\api-core\package.json"   "$Target\apps\api-core\package.json" -Force
Copy-Item "$ReleaseDir\apps\admin-web\package.json"  "$Target\apps\admin-web\package.json" -Force
Copy-Tree "$ReleaseDir\apps\api-core\dist"           "$Target\apps\api-core\dist"
Copy-Tree "$ReleaseDir\apps\admin-web\dist"          "$Target\apps\admin-web\dist"

# uploads/ solo se copia si el release lo trae Y el servidor todavia no
# tiene nada: son datos reales, no build. Pisarlos seria perder archivos.
if ((Test-Path "$ReleaseDir\apps\api-core\uploads") -and -not (Test-Path "$Target\apps\api-core\uploads")) {
  Step "Migrando uploads/ (primera vez)"
  Copy-Tree "$ReleaseDir\apps\api-core\uploads" "$Target\apps\api-core\uploads"
}

if ($lockChanged -and -not $SkipInstall) {
  Step "Instalando dependencias de produccion (cambio el lockfile)"
  Push-Location $Target
  try {
    # Solo el workspace de la API: admin-web ya viaja compilado y sus
    # dependencias son todas de build. --include-workspace-root hace
    # falta porque el lockfile vive en la raiz del monorepo.
    npm ci --omit=dev --workspace=apps/api-core --include-workspace-root
    if ($LASTEXITCODE -ne 0) { throw "npm ci fallo." }
  } finally { Pop-Location }
} else {
  Write-Host "`n>> Dependencias sin cambios, no se reinstala." -ForegroundColor DarkGray
}

if (-not (Test-Path "$Target\apps\api-core\.env")) {
  throw "Falta $Target\apps\api-core\.env — armalo a partir de env.server.example ANTES de arrancar."
}

if ($serviceExists) {
  Step "Levantando $ApiService"
  Start-Service $ApiService

  Step "Verificando /health"
  $ok = $false
  $deadline = (Get-Date).AddSeconds(60)   # el arranque de Nest tarda
  while (-not $ok -and (Get-Date) -lt $deadline) {
    try {
      $r = Invoke-WebRequest "http://localhost:3000/health" -UseBasicParsing -TimeoutSec 3
      if ($r.StatusCode -eq 200) { $ok = $true }
    } catch { Start-Sleep -Seconds 2 }
  }
  if ($ok) {
    Write-Host "`nPublicado. La API responde OK." -ForegroundColor Green
  } else {
    Write-Host "`nLa API NO respondio en 60s. Ver el log:" -ForegroundColor Red
    Write-Host "  Get-Content $Target\logs\api-err.log -Tail 40"
    exit 1
  }
} else {
  Write-Host "`nArchivos actualizados. El servicio $ApiService todavia no existe:" -ForegroundColor Yellow
  Write-Host "  corre scripts\install-server.ps1 para crearlo."
}
