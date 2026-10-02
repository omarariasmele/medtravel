<#
.SYNOPSIS
  Compila la API y el panel y arma la carpeta de release que se copia
  al servidor. SE CORRE EN LA PC DE DESARROLLO, nunca en el servidor.

.DESCRIPTION
  El servidor no tiene ni codigo fuente ni VS Code ni Flutter: solo
  recibe lo ya compilado (dist/), los package.json + lockfile para
  poder instalar dependencias de produccion, y la config de Caddy.

  Lo que NO viaja nunca en el release (para no pisar lo que vive en el
  servidor): el .env de produccion, la carpeta uploads/ (datos reales
  subidos por los usuarios) y los certificados. uploads/ solo se manda
  la PRIMERA vez, con -IncludeUploads.

.EXAMPLE
  .\build-release.ps1
  .\build-release.ps1 -IncludeUploads -Zip     # primera vez
#>
[CmdletBinding()]
param(
  # Donde se arma el release. Por defecto, al lado del repo.
  [string]$OutDir = "D:\Dev\MedTravelApp-release",
  # Solo la primera vez: incluye los archivos ya subidos (logos de
  # tenants, adjuntos) para migrarlos al servidor.
  [switch]$IncludeUploads,
  # Comprime el resultado en un .zip (comodo para pasarlo por RDP).
  [switch]$Zip,
  # Saltea la compilacion y solo re-arma la carpeta con lo ya compilado.
  [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot      # ...\nestjs-api

function Step($msg) { Write-Host "`n>> $msg" -ForegroundColor Cyan }

function Copy-Tree([string]$From, [string]$To) {
  # /MIR deja el destino identico al origen (borra lo que ya no existe),
  # que es justo lo que se quiere para una carpeta dist/ recompilada.
  # robocopy devuelve 0-7 como exito y 8+ como error real.
  robocopy $From $To /MIR /NFL /NDL /NJH /NJS /NP | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "robocopy fallo ($LASTEXITCODE): $From -> $To" }
  $global:LASTEXITCODE = 0
}

if (-not $SkipBuild) {
  Step "Compilando api-core (nest build)"
  Push-Location $repo
  try {
    npm run build --workspace=apps/api-core
    if ($LASTEXITCODE -ne 0) { throw "El build de api-core fallo." }

    Step "Compilando admin-web (tsc + vite build)"
    npm run build --workspace=apps/admin-web
    if ($LASTEXITCODE -ne 0) { throw "El build de admin-web fallo." }
  } finally { Pop-Location }
}

foreach ($p in @("$repo\apps\api-core\dist\main.js", "$repo\apps\admin-web\dist\index.html")) {
  if (-not (Test-Path $p)) { throw "Falta $p — corre sin -SkipBuild." }
}

Step "Armando el release en $OutDir"
if (Test-Path $OutDir) { Remove-Item $OutDir -Recurse -Force }
New-Item -ItemType Directory -Path "$OutDir\apps\api-core", "$OutDir\apps\admin-web", "$OutDir\scripts" -Force | Out-Null

# La estructura de workspaces se respeta tal cual porque `npm ci
# --workspace=apps/api-core` valida el lockfile contra TODOS los
# package.json declarados en "workspaces": si falta el de admin-web,
# el install del servidor falla.
Copy-Item "$repo\package.json"                 "$OutDir\package.json"
Copy-Item "$repo\package-lock.json"            "$OutDir\package-lock.json"
Copy-Item "$repo\apps\api-core\package.json"   "$OutDir\apps\api-core\package.json"
Copy-Item "$repo\apps\admin-web\package.json"  "$OutDir\apps\admin-web\package.json"

# dist de api-core ya trae los 141 .sql del schema y los assets de mail:
# nest-cli.json los declara en "assets", asi que nest build los copia.
Copy-Tree "$repo\apps\api-core\dist"   "$OutDir\apps\api-core\dist"
Copy-Tree "$repo\apps\admin-web\dist"  "$OutDir\apps\admin-web\dist"

Copy-Item "$PSScriptRoot\Caddyfile"           "$OutDir\Caddyfile"
Copy-Item "$PSScriptRoot\env.server.example"  "$OutDir\env.server.example"
Copy-Item "$PSScriptRoot\install-server.ps1"  "$OutDir\scripts\install-server.ps1"
Copy-Item "$PSScriptRoot\update-server.ps1"   "$OutDir\scripts\update-server.ps1"
Copy-Item "$PSScriptRoot\README.md"           "$OutDir\LEEME.md"

if ($IncludeUploads) {
  Step "Incluyendo uploads/ (migracion inicial de archivos ya subidos)"
  Copy-Tree "$repo\apps\api-core\uploads" "$OutDir\apps\api-core\uploads"
}

# Sello de version: sirve para saber, parado en el servidor, exactamente
# que commit esta publicado.
Push-Location $repo
$commit = (git rev-parse --short HEAD 2>$null)
$dirty  = (git status --porcelain 2>$null)
Pop-Location
@(
  "MedTravelApp — release"
  "Fecha:  $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
  "Commit: $commit$(if ($dirty) { '  (con cambios sin commitear en la PC)' })"
  "Uploads incluidos: $($IncludeUploads.IsPresent)"
) | Set-Content "$OutDir\VERSION.txt" -Encoding UTF8

if ($Zip) {
  Step "Comprimiendo"
  $zip = "$OutDir.zip"
  if (Test-Path $zip) { Remove-Item $zip -Force }
  Compress-Archive -Path "$OutDir\*" -DestinationPath $zip
  Write-Host "ZIP listo: $zip" -ForegroundColor Green
}

$size = "{0:N0} MB" -f ((Get-ChildItem $OutDir -Recurse | Measure-Object Length -Sum).Sum / 1MB)
Write-Host "`nRelease listo en $OutDir ($size)" -ForegroundColor Green
Write-Host "Copialo al servidor y corre ahi scripts\update-server.ps1 (o install-server.ps1 la primera vez)."
