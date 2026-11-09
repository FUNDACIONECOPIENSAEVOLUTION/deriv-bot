param([string]$Ruta='D:\deriv-bot\programa')
# Reparación ÚNICA de un instalador 11.7 que no copiaba los nuevos motores.
# A partir de esta reparación GitHub pc-local actualiza el PC sin comandos manuales.
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$base='https://raw.githubusercontent.com/FUNDACIONECOPIENSAEVOLUTION/deriv-bot/pc-local'
$app=Join-Path $Ruta 'local-demo'
$data=Join-Path $app 'data'
if(-not(Test-Path (Join-Path $app 'server.mjs'))){throw 'NO_EXISTE_APLICACION_EN_D_DISCO'}
if(-not(Test-Path (Join-Path $app 'local-release.json'))){throw 'FALTA_VERSION_LOCAL'}
if(-not(Test-Path (Join-Path $app 'data'))){throw 'FALTA_CARPETA_PRIVADA'}
$local=[string]((Get-Content -LiteralPath (Join-Path $app 'local-release.json') -Raw | ConvertFrom-Json).version)
if($local -notmatch '^[0-9]+\.[0-9]$'){throw 'VERSION_LOCAL_INVALIDA'}
$manifest=Invoke-RestMethod -Uri ($base+'/pc-release.json?cb='+[guid]::NewGuid().ToString('N')) -TimeoutSec 25 -Headers @{'Cache-Control'='no-cache';'User-Agent'='Ecopiensa-PC-Reparador'}
$remote=[string]$manifest.version
if($remote -notmatch '^[0-9]+\.[0-9]$' -or $manifest.channel -ne 'pc-local' -or [int]$manifest.parts -lt 1 -or [int]$manifest.parts -gt 24){throw 'MANIFIESTO_PUBLICACION_INVALIDO'}
function Valor([string]$version){$n=$version.Split('.');return [int]$n[0]*10+[int]$n[1]}
if((Valor $remote) -lt (Valor $local)){throw 'GITHUB_VERSION_MENOR_QUE_PC'}
$node=Get-Command node -ErrorAction Stop
if([int](((& node --version).TrimStart('v')).Split('.')[0]) -lt 24){throw 'NODE24_REQUERIDO'}
Write-Host "Ecopiensa PC: instalada v$local; disponible GitHub v$remote." -ForegroundColor Cyan
# No utilizar C:\Users\...\AppData\Local\Temp: puede estar lleno aunque D: tenga espacio.
# Node y Expand-Archive utilizan TEMP/TMP, por eso se reubican durante la reparación.
$disk=[System.IO.DriveInfo]::new([System.IO.Path]::GetPathRoot($Ruta))
if($disk.AvailableFreeSpace -lt 200MB){throw 'ESPACIO_INSUFICIENTE_EN_D_LIBERA_200MB_ANTES_DE_ACTUALIZAR'}
$oldTemp=$env:TEMP;$oldTmp=$env:TMP
$tempRoot=Join-Path $Ruta '_temporales-actualizacion'
New-Item -ItemType Directory -Path $tempRoot -Force | Out-Null
$env:TEMP=$tempRoot;$env:TMP=$tempRoot
$work=Join-Path $tempRoot ('EcopiensaPC-Reparar-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $work -Force | Out-Null
$stopped=$false;$installed=$false;$copyStarted=$false;$shutdownAttempted=$false;$completed=$false;$wasServerHealthy=$false;$backup=''
$maintenance=Join-Path $data 'actualizacion-en-curso.flag'
$runningFlag=Join-Path $data 'ejecucion-habilitada.flag'
$wasRunningEnabled=Test-Path -LiteralPath $runningFlag
$maintenanceSet=$false
$taskState=@{}
$updateMutex=New-Object System.Threading.Mutex($false,'Local\EcopiensaActualizacionPC')
$mutexAcquired=$false
try{
 # No competir con el actualizador automatico ni con otro reparador.
 $mutexAcquired=$updateMutex.WaitOne(0)
 if(-not $mutexAcquired){throw 'OTRA_ACTUALIZACION_EN_CURSO'}
 $chunks=New-Object System.Text.StringBuilder
 for($i=0;$i -lt [int]$manifest.parts;$i++){
  $part='{0:00}' -f $i
  $url=$base+'/pc-bundles/ecopiensa-local-'+$remote+'.zip.b64.part'+$part
  $web=Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 25
  [void]$chunks.Append(($web.Content -replace '\s',''))
 }
 $zip=Join-Path $work 'paquete.zip'
 [System.IO.File]::WriteAllBytes($zip,[Convert]::FromBase64String($chunks.ToString()))
 if((Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant() -ne [string]$manifest.archiveSha256){throw 'SHA256_GITHUB_INCORRECTO'}
 Add-Type -AssemblyName System.IO.Compression.FileSystem
 $archive=[System.IO.Compression.ZipFile]::OpenRead($zip)
 try{
  foreach($entry in $archive.Entries){
   $p=$entry.FullName.Replace('\','/')
   if(-not $p.StartsWith('local-demo/') -or $p -match '(^|/)\.\.?(/|$)' -or
      $p -match '(^|/)(data|node_modules|\.git)(/|$)' -or $p -match '(\.db|\.sqlite|\.csv|\.env|\.key)$'){
    throw 'PAQUETE_CON_RUTA_NO_PERMITIDA'
   }
  }
 }finally{$archive.Dispose()}
 $stage=Join-Path $work 'codigo'
 Expand-Archive -LiteralPath $zip -DestinationPath $stage -Force
 $source=Join-Path $stage 'local-demo'
 $newVersion=[string]((Get-Content -LiteralPath (Join-Path $source 'local-release.json') -Raw | ConvertFrom-Json).version)
 if($newVersion -ne $remote){throw 'VERSION_EN_PAQUETE_NO_COINCIDE'}
 foreach($name in @('server.mjs','market-analysis.mjs','demo-trading.mjs','demo-burst.mjs','mcp-local.mjs',
  'Tarea-Oculta.vbs','Instalar-TareasOcultas.ps1','Actualizar-Desde-GitHub.ps1','Cerrar-Ecopiensa.ps1','Vigilar-Ecopiensa.ps1','public\app.js')){
  if(-not(Test-Path (Join-Path $source $name))){throw 'PAQUETE_INCOMPLETO'}
 }
 & node --check (Join-Path $source 'server.mjs')
 if($LASTEXITCODE -ne 0){throw 'ERROR_SINTAXIS_SERVIDOR'}
 & node --check (Join-Path $source 'public\app.js')
 if($LASTEXITCODE -ne 0){throw 'ERROR_SINTAXIS_PANEL'}
 $tests=@(Get-ChildItem -LiteralPath (Join-Path $source 'test') -Filter '*.test.mjs' -File | Select-Object -ExpandProperty FullName)
 if($tests.Count -lt 3){throw 'FALTAN_PRUEBAS'}
 & node --test @tests
 if($LASTEXITCODE -ne 0){throw 'PRUEBAS_NO_APROBADAS'}
 # No detener contratos abiertos. La 11.7 era exclusivamente lectura; las posteriores
 # entregan safeToUpdate=false si hay operación / tanda pendiente.
 $health=$null
 try{$health=Invoke-RestMethod -Uri 'http://127.0.0.1:8765/api/health' -TimeoutSec 3}catch{}
 if($health){
  if(($health.version -eq 'v11.7' -and $health.readOnly -eq $true) -or $health.safeToUpdate -eq $true){
   Write-Host 'Servidor sin órdenes abiertas; actualización permitida.' -ForegroundColor Green
  }else{throw 'EXISTEN_COMPRAS_PENDIENTES_O_NO_SE_PUDO_VERIFICAR_SEGURIDAD'}
 }else{
  # No depender de servidor.pid cuando /health no responde: buscar el proceso
  # exacto, sin interferir con los servidores Node de otros proyectos.
  # Si /health no responde, no reemplazar codigo ante NINGUN node.exe
  # ejecutando local-demo/server.mjs; es una verificacion conservadora.
  $scriptPattern='(?i)(?:^|\s|")[A-Z]:\\[^"\r\n]*\\local-demo\\server\.mjs(?=$|\s|")'
  $nodeInstances=@(Get-CimInstance -ClassName Win32_Process -Filter "Name='node.exe'" -ErrorAction Stop |
   Where-Object {$_.CommandLine -and $_.CommandLine -match $scriptPattern})
  if($nodeInstances.Count -gt 0){
   throw 'NODE_SIGUE_ABIERTO_PERO_SIN_RESPUESTA_CERRAR_ANTES'
  }
 }
 $wasServerHealthy=[bool]$health
 $backup=Join-Path $Ruta ('copias-privadas-codigo\antes_actualizar_'+$remote+'_'+(Get-Date -Format 'yyyyMMdd_HHmmss'))
 New-Item -ItemType Directory -Path $backup -Force | Out-Null
 foreach($file in Get-ChildItem -LiteralPath $app -Recurse -File -Force){
  $relative=$file.FullName.Substring($app.Length).TrimStart('\')
  if($relative -match '^(data|node_modules|\.git)(\\|$)'){continue}
  $target=Join-Path $backup $relative
  New-Item -ItemType Directory -Path (Split-Path $target) -Force | Out-Null
  Copy-Item -LiteralPath $file.FullName -Destination $target -Force
 }
 Write-Host 'Copia privada del código anterior creada. Se conservan OAuth y CSV.' -ForegroundColor Green
 # Crear el bloqueo de mantenimiento ANTES de desactivar las tareas o cerrar Node.
 # La vigilancia nueva respeta este flag y la anterior respeta ejecucion-habilitada.flag.
 Set-Content -LiteralPath $maintenance -Value $remote -Encoding Ascii
 $maintenanceSet=$true
 foreach($taskName in @('Ecopiensa_Deriv_PC_AutoActualizar','Ecopiensa_Deriv_PC_VigilarServidor')){
  try{
   $task=Get-ScheduledTask -TaskName $taskName -ErrorAction Stop
   $taskState[$taskName]=[string]$task.State
   if($task.State -ne 'Disabled'){
    Disable-ScheduledTask -TaskName $taskName -ErrorAction Stop | Out-Null
   }
  }catch{
   Write-Warning ('No se pudo pausar '+$taskName+'; proteccion por flag de mantenimiento activa.')
  }
 }
 if($health){
  # Las pruebas pueden durar varios segundos: una compra nueva invalida el cierre.
  $currentHealth=Invoke-RestMethod -Uri 'http://127.0.0.1:8765/api/health' -TimeoutSec 3
  if($currentHealth.safeToUpdate -ne $true){
   throw 'COMPRAS_ACTIVAS_AL_INTENTAR_CERRAR'
  }
  $shutdownAttempted=$true
  # El cierre de v13.2 depende de servidor.pid: utilizar siempre el NUEVO
  # cierre comprobado en el ZIP, aunque la instalación actual sea antigua.
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $source 'Cerrar-Ecopiensa.ps1') -Ruta $Ruta
  if($LASTEXITCODE -ne 0){throw 'NO_PUDO_CERRAR_ECOPIENSA'}
  for($i=0;$i -lt 30;$i++){
   Start-Sleep -Milliseconds 300
   try{Invoke-RestMethod 'http://127.0.0.1:8765/api/health' -TimeoutSec 1 | Out-Null}
   catch{break}
  }
  try{Invoke-RestMethod 'http://127.0.0.1:8765/api/health' -TimeoutSec 1 | Out-Null;throw 'SERVIDOR_SIGUE_ACTIVO'}
  catch{if($_.Exception.Message -eq 'SERVIDOR_SIGUE_ACTIVO'){throw}}
 }
 $stopped=$true
 $copyStarted=$true
 foreach($file in Get-ChildItem -LiteralPath $source -Recurse -File -Force){
  $relative=$file.FullName.Substring($source.Length).TrimStart('\')
  if($relative -match '^(data|node_modules|\.git)(\\|$)'){throw 'DATA_EN_PAQUETE_PROHIBIDA'}
  $target=Join-Path $app $relative
  New-Item -ItemType Directory -Path (Split-Path $target) -Force | Out-Null
  Copy-Item -LiteralPath $file.FullName -Destination $target -Force
 }
 $installed=$true
 $isAdmin=([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
 $tasksReady=$false
 if($isAdmin){
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $app 'Instalar-TareasOcultas.ps1') -Ruta $Ruta
  $tasksReady=($LASTEXITCODE -eq 0)
 }
 if(-not $tasksReady){
  Write-Warning 'El código sí se instaló, pero las tareas automáticas NO quedaron activadas (permiso 0x80070005 o política de Windows).'
  Write-Host 'Para repararlas: abrir PowerShell como administrador y ejecutar Reparar-Tareas-PC.ps1.' -ForegroundColor Yellow
 }
 & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $app 'Abrir-Ecopiensa.ps1') -Ruta $Ruta
 if($LASTEXITCODE -ne 0){throw 'EL_PANEL_NO_SE_PUDO_ABRIR'}
 Start-Sleep -Seconds 2
 $verified=Invoke-RestMethod -Uri 'http://127.0.0.1:8765/api/health' -TimeoutSec 6
 if($verified.version -ne ('v'+$remote) -or $verified.ok -ne $true){throw 'VERIFICACION_FINAL_DE_VERSION_FALLIDA'}
 Write-Host "Ecopiensa actualizado a v$remote en D:\deriv-bot\programa; cuenta REAL bloqueada." -ForegroundColor Green
 if($tasksReady){Write-Host 'Tareas automáticas registradas de forma oculta.' -ForegroundColor Green}
 else{Write-Warning 'Tareas automáticas NO registradas; puedes abrir Ecopiensa manualmente, pero no habrá vigilancia programada.'}
 Write-Host ('Registro de tareas: '+(Join-Path $data 'tareas-ocultas.log'))
 $completed=$true
}catch{
 $message=$_.Exception.Message
 Write-Warning ('Actualización interrumpida: '+$message)
 if($stopped -and $copyStarted -and $backup){
  Write-Warning 'Se detectó un problema tras reemplazar el código. Se restauran los archivos anteriores.'
  foreach($file in Get-ChildItem -LiteralPath $backup -Recurse -File){
   $relative=$file.FullName.Substring($backup.Length).TrimStart('\')
   $target=Join-Path $app $relative
   New-Item -ItemType Directory -Path (Split-Path $target) -Force | Out-Null
   Copy-Item -LiteralPath $file.FullName -Destination $target -Force
  }
 }
 throw
}finally{
 # El watchdog nunca debe reabrir Node mientras se sustituyen archivos.
 if($maintenanceSet){
  Remove-Item -LiteralPath $maintenance -Force -ErrorAction SilentlyContinue
 }
 # Recuperar únicamente tareas que ya estaban listas antes de este instalador.
 foreach($taskName in $taskState.Keys){
  if($taskState[$taskName] -ne 'Disabled'){
   try{Enable-ScheduledTask -TaskName $taskName -ErrorAction Stop | Out-Null}
   catch{Write-Warning ('No se pudo rehabilitar '+$taskName+'; ejecutar Reparar-Tareas-PC.ps1 como administrador.')}
  }
 }
 # Si se detuvo Node pero hubo un error, restaurar el servicio previo.
 # Comprobar /health para evitar iniciar un segundo servidor en el puerto 8765.
 if(-not $completed -and $shutdownAttempted -and $wasServerHealthy){
  $serverAlive=$false
  try{
   $check=Invoke-RestMethod -Uri 'http://127.0.0.1:8765/api/health' -TimeoutSec 2
   $serverAlive=($check.ok -eq $true)
  }catch{}
  if(-not $serverAlive){
   Set-Content -LiteralPath $runningFlag -Value 'ACTIVO' -Encoding Ascii
   try{& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $app 'Vigilar-Ecopiensa.ps1') -Ruta $Ruta | Out-Null}
   catch{Write-Warning 'No se pudo recuperar el servicio. Revisar servidor-stderr.log en la carpeta privada data.'}
  }
 }
 if($mutexAcquired){$updateMutex.ReleaseMutex()}
 $updateMutex.Dispose()
 Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue
 $env:TEMP=$oldTemp;$env:TMP=$oldTmp
}
