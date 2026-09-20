param(
  [switch]$Uninstall,
  [switch]$NoAutoStart,
  [switch]$NoStart
)

$ErrorActionPreference = "Stop"

$ProgramDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$LauncherScript = Join-Path $ProgramDir "start_management_console.ps1"
$ProtocolRoot = "HKCU:\Software\Classes\xhs-notion-console"
$RunRoot = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
$RunValueName = "XhsNotionConsole"

if ($Uninstall) {
  Remove-Item -LiteralPath $ProtocolRoot -Recurse -Force -ErrorAction SilentlyContinue
  Remove-ItemProperty -LiteralPath $RunRoot -Name $RunValueName -Force -ErrorAction SilentlyContinue
  Write-Host "[OK] Removed xhs-notion-console:// protocol."
  Write-Host "[OK] Removed management console auto-start."
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

if (-not $NoAutoStart) {
  New-Item -Path $RunRoot -Force | Out-Null
  $autoStartCommand = 'powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "{0}" -Mode local -NoOpen' -f $LauncherScript
  New-ItemProperty `
    -Path $RunRoot `
    -Name $RunValueName `
    -Value $autoStartCommand `
    -PropertyType String `
    -Force | Out-Null
  Write-Host "[OK] Registered management console auto-start for the current Windows user."
}

if (-not $NoStart) {
  & $LauncherScript -Mode local -NoOpen
}
