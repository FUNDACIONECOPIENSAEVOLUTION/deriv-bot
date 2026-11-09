param([string]$Ruta='D:\deriv-bot\programa')
$ErrorActionPreference='Stop'
# Parada del servidor EXCLUSIVAMENTE de Ecopiensa. Una version antigua puede
# responder /api/health aunque falte servidor.pid o el PID haya caducado.
$app=Join-Path $Ruta 'local-demo'
$data=Join-Path $app 'data'
$flag=Join-Path $data 'ejecucion-habilitada.flag'
$pidFile=Join-Path $data 'servidor.pid'
$scriptPath=[System.IO.Path]::GetFullPath((Join-Path $app 'server.mjs'))
# Impedir el reinicio por vigilancia antes de enviar Stop-Process.
Remove-Item -LiteralPath $flag -Force -ErrorAction SilentlyContinue
$pattern='(?:^|\s|")'+[regex]::Escape($scriptPath)+'(?=$|\s|")'
$running=@(Get-CimInstance -ClassName Win32_Process -Filter "Name='node.exe'" -ErrorAction Stop |
 Where-Object {
  $_.CommandLine -and $_.CommandLine -match $pattern
 })
if($running.Count -eq 0){
 # No se confunde PID ausente con servidor cerrado: el instalador volvera
 # a comprobar /api/health y bloqueara cualquier reemplazo si sigue activo.
 Write-Host 'No se encontro un proceso Node vinculado a la ruta exacta de Ecopiensa.'
 Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
 exit 0
}
foreach($proc in $running){
 Write-Host ('Deteniendo Node Ecopiensa verificado; PID '+$proc.ProcessId)
 Stop-Process -Id ([int]$proc.ProcessId) -Force -ErrorAction Stop
}
foreach($proc in $running){
 for($attempt=0;$attempt -lt 25;$attempt++){
  if(-not(Get-Process -Id ([int]$proc.ProcessId) -ErrorAction SilentlyContinue)){break}
  Start-Sleep -Milliseconds 200
 }
 if(Get-Process -Id ([int]$proc.ProcessId) -ErrorAction SilentlyContinue){
  throw 'PROCESO_ECOPIENSA_NO_SE_DETUVO'
 }
}
Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
Write-Host 'Proceso Ecopiensa cerrado de forma segura. No se detuvieron otros Node.'
