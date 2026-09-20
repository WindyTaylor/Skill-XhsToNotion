param(
  [string]$ProtocolUrl = "",
  [string]$Mode = "local",
  [string]$HostName = "127.0.0.1",
  [int]$Port = 8765,
  [switch]$NoOpen
)

$ErrorActionPreference = "Stop"

$ProgramDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ProgramDir
$LocalUrl = "http://${HostName}:${Port}"
$HealthUrl = "${LocalUrl}/api/health"
$ServerLog = Join-Path $ProjectRoot "manage_server_${Port}.log"
$ServerErr = Join-Path $ProjectRoot "manage_server_${Port}.err.log"

if ($ProtocolUrl -match "mode=([^&]+)") {
  $Mode = $Matches[1]
}

if ($Mode -ne "local") {
  Write-Host "[WARN] Unsupported mode '$Mode'. Falling back to local mode."
  $Mode = "local"
}

function Test-ConsoleHealth {
  try {
    $response = Invoke-RestMethod -Uri $HealthUrl -Method Get -TimeoutSec 2
    return [bool]$response.ok
  } catch {
    return $false
  }
}

function Start-ConsoleServer {
  if (Test-ConsoleHealth) {
    Write-Host "[OK] Local console is already running: $LocalUrl"
    return
  }

  $python = (Get-Command python -ErrorAction SilentlyContinue)
  if (-not $python) {
    throw "python was not found. Install Python or add it to PATH."
  }

  Start-Process `
    -FilePath $python.Source `
    -ArgumentList @("manage_server.py", "--host", $HostName, "--port", "$Port") `
    -WorkingDirectory $ProgramDir `
    -WindowStyle Hidden `
    -RedirectStandardOutput $ServerLog `
    -RedirectStandardError $ServerErr | Out-Null

  for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Milliseconds 500
    if (Test-ConsoleHealth) {
      Write-Host "[OK] Local console started: $LocalUrl"
      return
    }
  }

  throw "Failed to start local console. See log: $ServerErr"
}

Start-ConsoleServer

$openUrl = $LocalUrl

if (-not $NoOpen) {
  Start-Process $openUrl
}

Write-Host "[INFO] Open URL: $openUrl"
