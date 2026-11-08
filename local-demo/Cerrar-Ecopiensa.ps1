param([string]$Ruta='D:\deriv-bot\programa')
$ErrorActionPreference='Stop'
# An intentional shutdown must NOT be automatically restarted.
$flag=Join-Path $Ruta 'local-demo\data\ejecucion-habilitada.flag'
Remove-Item -LiteralPath $flag -Force -ErrorAction SilentlyContinue
$pidFile=Join-Path $Ruta 'local-demo\data\servidor.pid'
if (-not (Test-Path $pidFile)) { Write-Host 'No se detecto un servidor local abierto.'; exit 0 }
$id=[int]((Get-Content $pidFile -Raw).Trim())
# Only stop the process that belongs to this explicit application folder.
$p=Get-CimInstance Win32_Process -Filter "ProcessId=$id" -ErrorAction SilentlyContinue
if ($p -and $p.Name -match '^node(\.exe)?$' -and
    $p.CommandLine -match 'local-demo[/\\]server\.mjs') {
  Stop-Process -Id $id -ErrorAction Stop
  Write-Host 'Servidor local Ecopiensa cerrado. Se aplicaran las actualizaciones al proximo inicio.'
} else { Write-Host 'PID anterior ya cerrado, o proceso distinto. No se interrumpe otro programa.' }
Remove-Item -Path $pidFile -Force -ErrorAction SilentlyContinue
