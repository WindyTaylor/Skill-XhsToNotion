param(
  [switch]$Uninstall
)

$ErrorActionPreference = "Stop"

$ProgramDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$LauncherScript = Join-Path $ProgramDir "start_management_console.ps1"
$ProtocolRoot = "HKCU:\Software\Classes\xhs-notion-console"

if ($Uninstall) {
  Remove-Item -LiteralPath $ProtocolRoot -Recurse -Force -ErrorAction SilentlyContinue
  Write-Host "[OK] Removed xhs-notion-console:// protocol."
  exit 0
}

if (-not (Test-Path -LiteralPath $LauncherScript)) {
  throw "Launcher script not found: $LauncherScript"
}

New-Item -Path $ProtocolRoot -Force | Out-Null
Set-Item -Path $ProtocolRoot -Value "URL:XHS Notion Console"
New-ItemProperty -Path $ProtocolRoot -Name "URL Protocol" -Value "" -PropertyType String -Force | Out-Null

$commandKey = Join-Path $ProtocolRoot "shell\open\command"
New-Item -Path $commandKey -Force | Out-Null
$command = 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "{0}" -ProtocolUrl "%1"' -f $LauncherScript
Set-Item -Path $commandKey -Value $command

Write-Host "[OK] Registered xhs-notion-console:// protocol."
Write-Host "[INFO] Local: xhs-notion-console://start?mode=local"
Write-Host "[INFO] HTTPS quick tunnel: xhs-notion-console://start?mode=cloudflared-quick"
