param([string]$Ruta='D:\deriv-bot\programa')
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
function Mensaje([string]$Texto) {
  try { Add-Type -AssemblyName PresentationFramework -ErrorAction Stop; [System.Windows.MessageBox]::Show($Texto,'Ecopiensa Deriv DEMO') | Out-Null }
  catch { Write-Host $Texto }
}
try {
  $app=Join-Path $Ruta 'local-demo'
  $archivo=Join-Path $app 'server.mjs'
  if (-not (Test-Path $archivo)) { throw "No se encuentra el programa local en $archivo. Ejecuta el instalador." }
  # Apply GitHub changes when possible. Never overwrite private data.
  try { & (Join-Path $app 'Actualizar-Desde-GitHub.ps1') -Ruta $Ruta -Silencioso }
  catch { Write-Warning ('No se pudo verificar GitHub: '+$_.Exception.Message) }
  function ServidorActivo {
    try {
      $s=Invoke-RestMethod -Uri 'http://127.0.0.1:8765/api/health' -TimeoutSec 2
      return ($s.ok -eq $true -and $s.cloudflareDependent -eq $false)
    } catch { return $false }
  }
  if (-not (ServidorActivo)) {
    $node=Get-Command node -ErrorAction SilentlyContinue
    if (-not $node) { throw 'No esta instalado Node.js 24 LTS. Ejecuta el instalador.' }
    $major=[int](((& node --version) -replace '^v','').Split('.')[0])
    if ($major -lt 24) { throw 'Se requiere Node.js 24 o superior.' }
    New-Item -ItemType Directory -Path (Join-Path $app 'data') -Force | Out-Null
    Set-Content -Path (Join-Path $app 'data\ejecucion-habilitada.flag') -Value 'ACTIVO' -Encoding Ascii
    $salida=Join-Path $app 'data\servidor-stdout.log'
    $errores=Join-Path $app 'data\servidor-stderr.log'
    $proc=Start-Process -FilePath $node.Source -ArgumentList @('--max-old-space-size=192',('"'+$archivo+'"')) -WorkingDirectory $app -WindowStyle Hidden -PassThru -RedirectStandardOutput $salida -RedirectStandardError $errores
    Set-Content -Path (Join-Path $app 'data\servidor.pid') -Value $proc.Id -Encoding Ascii
    $listo=$false
    for ($i=0; $i -lt 32; $i++) {
      Start-Sleep -Milliseconds 250
      if (ServidorActivo) { $listo=$true; break }
      if ($proc.HasExited) { break }
    }
    if (-not $listo) { throw "No arranco el bot. Revisa el archivo $errores (no compartas datos privados)." }
  }
  # Keep a lightweight check every 2 minutes. Windows sleep/hibernation still
  # pauses processes; this check resumes when Windows allows scheduled tasks.
  New-Item -ItemType Directory -Path (Join-Path $app 'data') -Force | Out-Null
  Set-Content -Path (Join-Path $app 'data\ejecucion-habilitada.flag') -Value 'ACTIVO' -Encoding Ascii
  try {
    $watch=Join-Path $app 'Vigilar-Ecopiensa.ps1'
    if(Test-Path $watch){
      $args='-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "'+$watch+'" -Ruta "'+$Ruta+'"'
      $action=New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $args
      $trigger=New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(2) -RepetitionInterval (New-TimeSpan -Minutes 2)
      $settings=New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Minutes 1) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
      Register-ScheduledTask -TaskName 'Ecopiensa_Deriv_PC_VigilarServidor' -Action $action -Trigger $trigger -Settings $settings -Description 'Reinicia solo el servidor Ecopiensa si se cierra inesperadamente' -Force | Out-Null
    }
  }catch {Write-Warning 'Vigilancia automática no disponible. Puedes volver a abrir el icono si el servidor se detiene.'}
  $url='http://localhost:8765'
  $edgeCandidates=@()
  if (${env:ProgramFiles(x86)}) { $edgeCandidates += (Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe') }
  if ($env:ProgramFiles) { $edgeCandidates += (Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe') }
  $edge=$edgeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
  if ($edge) {
    Start-Process -FilePath $edge -ArgumentList @('--new-window','--app='+$url,'--window-size=1250,840')
  } else { Start-Process $url }
} catch {
  Mensaje ('Error al abrir Ecopiensa DEMO: '+$_.Exception.Message)
  throw
}
