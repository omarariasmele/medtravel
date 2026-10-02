<#
.SYNOPSIS
  Instalacion inicial en el servidor. SE CORRE UNA SOLA VEZ, en el
  servidor, en una PowerShell ABIERTA COMO ADMINISTRADOR.

.DESCRIPTION
  Deja la app corriendo como dos servicios de Windows (API y Caddy), que
  es lo que hace que sobreviva a un reinicio del servidor sin que nadie
  tenga que abrir ventanas a mano — el problema que hoy tiene el
  esquema de .claude\iniciar-medtravelapp.bat en la PC.

  Antes de correrlo hay que tener instalado en el servidor:
    - Node.js LTS  (https://nodejs.org — instalador .msi)
    - NSSM         (https://nssm.cc/download — copiar nssm.exe a C:\MedTravelApp\bin)
    - Caddy        (https://caddyserver.com/download — caddy.exe a C:\MedTravelApp\bin)

.EXAMPLE
  .\install-server.ps1 -ReleaseDir C:\Deploy\MedTravelApp-release
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$ReleaseDir,
  [string]$Target    = "C:\MedTravelApp",
  [string]$NssmPath  = "C:\MedTravelApp\bin\nssm.exe",
  [string]$CaddyPath = "C:\MedTravelApp\bin\caddy.exe",
  # Si se pasa, copia los .pem del certificado al servidor.
  [string]$CertDir
)

$ErrorActionPreference = 'Stop'
$ApiService   = 'MedTravelApp-API'
$CaddyService = 'MedTravelApp-Caddy'

function Step($msg) { Write-Host "`n>> $msg" -ForegroundColor Cyan }

if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
      ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw "Abri PowerShell como Administrador: crear servicios y reglas de firewall lo necesita."
}

Step "Chequeando requisitos"
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node)                  { throw "Node.js no esta instalado (o no esta en el PATH)." }
if (-not (Test-Path $NssmPath))  { throw "No encuentro nssm.exe en $NssmPath." }
if (-not (Test-Path $CaddyPath)) { throw "No encuentro caddy.exe en $CaddyPath." }
Write-Host "  node  : $node ($(node -v))"
Write-Host "  nssm  : $NssmPath"
Write-Host "  caddy : $CaddyPath"

New-Item -ItemType Directory -Path "$Target\bin", "$Target\certs", "$Target\logs" -Force | Out-Null

Step "Copiando archivos (delega en update-server.ps1)"
# -SkipInstall: las dependencias se instalan mas abajo, una sola vez.
& "$PSScriptRoot\update-server.ps1" -ReleaseDir $ReleaseDir -Target $Target -SkipInstall

Copy-Item "$ReleaseDir\Caddyfile"           "$Target\Caddyfile" -Force
Copy-Item "$ReleaseDir\env.server.example"  "$Target\env.server.example" -Force

if ($CertDir) {
  Step "Copiando certificados"
  Copy-Item "$CertDir\medtravelapp-fullchain.pem" "$Target\certs\" -Force
  Copy-Item "$CertDir\medtravelapp-key.pem"       "$Target\certs\" -Force
}
foreach ($pem in @("$Target\certs\medtravelapp-fullchain.pem", "$Target\certs\medtravelapp-key.pem")) {
  if (-not (Test-Path $pem)) {
    Write-Host "  FALTA $pem — Caddy no va a poder arrancar hasta que este." -ForegroundColor Yellow
  }
}

if (-not (Test-Path "$Target\apps\api-core\.env")) {
  Write-Host "`nFALTA el .env de produccion." -ForegroundColor Yellow
  Write-Host "Armalo ahora en $Target\apps\api-core\.env a partir de $Target\env.server.example"
  Write-Host "y volve a correr este script. (Los secretos tienen que ser los MISMOS que en desarrollo.)"
  exit 1
}

Step "Instalando dependencias de produccion"
Push-Location $Target
try {
  npm ci --omit=dev --workspace=apps/api-core --include-workspace-root
  if ($LASTEXITCODE -ne 0) { throw "npm ci fallo." }
} finally { Pop-Location }

function Install-NssmService([string]$Name, [string]$Exe, [string]$Args, [string]$Dir, [string]$LogPrefix) {
  if (Get-Service $Name -ErrorAction SilentlyContinue) {
    Write-Host "  $Name ya existe, se reconfigura."
    & $NssmPath stop $Name confirm | Out-Null
  } else {
    & $NssmPath install $Name $Exe $Args | Out-Null
  }
  & $NssmPath set $Name Application       $Exe          | Out-Null
  & $NssmPath set $Name AppParameters     $Args         | Out-Null
  # AppDirectory NO es cosmetico: main.ts arma la ruta de uploads con
  # process.cwd() (app.useStaticAssets(join(process.cwd(), 'uploads',
  # 'tenant-brands'))). Si el servicio arranca en otro directorio, los
  # logos de los tenants dan 404.
  & $NssmPath set $Name AppDirectory      $Dir          | Out-Null
  & $NssmPath set $Name AppStdout         "$Target\logs\$LogPrefix-out.log" | Out-Null
  & $NssmPath set $Name AppStderr         "$Target\logs\$LogPrefix-err.log" | Out-Null
  & $NssmPath set $Name AppRotateFiles    1             | Out-Null
  & $NssmPath set $Name AppRotateBytes    10485760      | Out-Null
  & $NssmPath set $Name Start             SERVICE_AUTO_START | Out-Null
  & $NssmPath set $Name AppExit Default   Restart       | Out-Null
  & $NssmPath set $Name AppRestartDelay   5000          | Out-Null
}

Step "Registrando el servicio $ApiService"
Install-NssmService -Name $ApiService -Exe $node `
  -Args "$Target\apps\api-core\dist\main.js" `
  -Dir  "$Target\apps\api-core" -LogPrefix "api"

Step "Registrando el servicio $CaddyService"
Install-NssmService -Name $CaddyService -Exe $CaddyPath `
  -Args "run --config `"$Target\Caddyfile`"" `
  -Dir  $Target -LogPrefix "caddy"

Step "Abriendo puertos en el firewall"
# 8443/8444: publicos (a estos apunta el port forwarding del router).
# 8100/8101: solo para probar desde la LAN antes de mover el router.
foreach ($port in 8443, 8444, 8100, 8101) {
  $rule = "MedTravelApp $port"
  if (-not (Get-NetFirewallRule -DisplayName $rule -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -DisplayName $rule -Direction Inbound -Action Allow `
      -Protocol TCP -LocalPort $port -Profile Any | Out-Null
  }
  Write-Host "  TCP $port OK"
}

Step "Arrancando servicios"
Start-Service $ApiService
Start-Service $CaddyService -ErrorAction Continue

Step "Verificando /health"
$ok = $false
$deadline = (Get-Date).AddSeconds(60)
while (-not $ok -and (Get-Date) -lt $deadline) {
  try {
    $r = Invoke-WebRequest "http://localhost:3000/health" -UseBasicParsing -TimeoutSec 3
    if ($r.StatusCode -eq 200) { $ok = $true }
  } catch { Start-Sleep -Seconds 2 }
}

Write-Host ""
if ($ok) {
  Write-Host "Instalado. La API responde en localhost:3000." -ForegroundColor Green
  Write-Host "Probar desde OTRA PC de la oficina, antes de tocar el router:"
  Write-Host "  API   -> http://192.168.0.150:8100/health"
  Write-Host "  Panel -> http://192.168.0.150:8101"
} else {
  Write-Host "La API no respondio. Ver: Get-Content $Target\logs\api-err.log -Tail 40" -ForegroundColor Red
  exit 1
}
