param(
  [string]$ProtocolUrl = "",
  [ValidateSet("local", "cloudflared-quick")]
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
$TunnelLog = Join-Path $ProjectRoot "cloudflared_${Port}.log"
$TunnelErr = Join-Path $ProjectRoot "cloudflared_${Port}.err.log"

if ($ProtocolUrl -match "mode=cloudflared-quick|cloudflared|tunnel") {
  $Mode = "cloudflared-quick"
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

function Start-CloudflaredQuickTunnel {
  $cloudflared = Get-Command cloudflared -ErrorAction SilentlyContinue
  if (-not $cloudflared) {
    Write-Host "[WARN] cloudflared was not found. Local console only."
    Write-Host "Install it and try again: winget install --id Cloudflare.cloudflared"
    return $null
  }

  $existing = Get-CimInstance Win32_Process |
    Where-Object { $_.CommandLine -match "cloudflared(.exe)? tunnel --url $([regex]::Escape($LocalUrl))" }
  if (-not $existing) {
    Remove-Item -LiteralPath $TunnelLog, $TunnelErr -Force -ErrorAction SilentlyContinue
    Start-Process `
      -FilePath $cloudflared.Source `
      -ArgumentList @("tunnel", "--url", $LocalUrl) `
      -WindowStyle Hidden `
      -RedirectStandardOutput $TunnelLog `
      -RedirectStandardError $TunnelErr | Out-Null
  }

  for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Milliseconds 500
    $logText = ""
    if (Test-Path -LiteralPath $TunnelLog) {
      $logText += Get-Content -Raw -LiteralPath $TunnelLog -ErrorAction SilentlyContinue
    }
    if (Test-Path -LiteralPath $TunnelErr) {
      $logText += "`n" + (Get-Content -Raw -LiteralPath $TunnelErr -ErrorAction SilentlyContinue)
    }
    $match = [regex]::Match($logText, "https://[a-zA-Z0-9.-]+\.trycloudflare\.com")
    if ($match.Success) {
      $publicUrl = $match.Value
      try {
        Set-Clipboard -Value $publicUrl
        Write-Host "[OK] HTTPS quick tunnel URL copied to clipboard: $publicUrl"
      } catch {
        Write-Host "[OK] HTTPS quick tunnel URL: $publicUrl"
      }
      return $publicUrl
    }
  }

  Write-Host "[WARN] Tunnel started, but no HTTPS URL was detected yet. Log: $TunnelErr"
  return $null
}

Start-ConsoleServer

$openUrl = $LocalUrl
if ($Mode -eq "cloudflared-quick") {
  $publicUrl = Start-CloudflaredQuickTunnel
  if ($publicUrl) {
    $openUrl = $publicUrl
  }
}

if (-not $NoOpen) {
  Start-Process $openUrl
}

Write-Host "[INFO] Open URL: $openUrl"
