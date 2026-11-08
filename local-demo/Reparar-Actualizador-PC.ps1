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
$manifest=Invoke-RestMethod -Uri ($base+'/pc-release.json') -TimeoutSec 25
$remote=[string]$manifest.version
if($remote -notmatch '^[0-9]+\.[0-9]$' -or $manifest.channel -ne 'pc-local' -or [int]$manifest.parts -lt 1 -or [int]$manifest.parts -gt 24){throw 'MANIFIESTO_PUBLICACION_INVALIDO'}
function Valor([string]$version){$n=$version.Split('.');return [int]$n[0]*10+[int]$n[1]}
if((Valor $remote) -lt (Valor $local)){throw 'GITHUB_VERSION_MENOR_QUE_PC'}
$node=Get-Command node -ErrorAction Stop
if([int](((& node --version).TrimStart('v')).Split('.')[0]) -lt 24){throw 'NODE24_REQUERIDO'}
Write-Host "Ecopiensa PC: instalada v$local; disponible GitHub v$remote." -ForegroundColor Cyan
$work=Join-Path $env:TEMP ('EcopiensaPC-Reparar-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $work -Force | Out-Null
$stopped=$false;$installed=$false;$backup=''
try{
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
 foreach($name in @('server.mjs','demo-trading.mjs','demo-burst.mjs','mcp-local.mjs',
  'Tarea-Oculta.vbs','Instalar-TareasOcultas.ps1','Actualizar-Desde-GitHub.ps1','public\app.js')){
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
  $pidPath=Join-Path $data 'servidor.pid'
  if(Test-Path $pidPath){
   try{
    $pidValue=[int]((Get-Content $pidPath -Raw).Trim())
    $running=Get-CimInstance Win32_Process -Filter "ProcessId=$pidValue" -ErrorAction SilentlyContinue
    if($running -and $running.Name -match '^node(\.exe)?$' -and $running.CommandLine -match 'local-demo[/\\]server\.mjs'){throw 'NODE_SIGUE_ABIERTO_PERO_SIN_RESPUESTA_CERRAR_ANTES'}
   }catch{if($_.Exception.Message -match 'NODE_SIGUE_ABIERTO'){throw}}
  }
 }
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
 foreach($taskName in @('Ecopiensa_Deriv_PC_AutoActualizar','Ecopiensa_Deriv_PC_VigilarServidor')){
  try{Disable-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue | Out-Null}catch{}
 }
 if($health){
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $app 'Cerrar-Ecopiensa.ps1') -Ruta $Ruta
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
 foreach($file in Get-ChildItem -LiteralPath $source -Recurse -File -Force){
  $relative=$file.FullName.Substring($source.Length).TrimStart('\')
  if($relative -match '^(data|node_modules|\.git)(\\|$)'){throw 'DATA_EN_PAQUETE_PROHIBIDA'}
  $target=Join-Path $app $relative
  New-Item -ItemType Directory -Path (Split-Path $target) -Force | Out-Null
  Copy-Item -LiteralPath $file.FullName -Destination $target -Force
 }
 $installed=$true
 & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $app 'Instalar-TareasOcultas.ps1') -Ruta $Ruta
 if($LASTEXITCODE -ne 0){Write-Warning 'Las tareas ocultas no se registraron automáticamente.'}
 & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $app 'Abrir-Ecopiensa.ps1') -Ruta $Ruta
 if($LASTEXITCODE -ne 0){throw 'EL_PANEL_NO_SE_PUDO_ABRIR'}
 Start-Sleep -Seconds 2
 $verified=Invoke-RestMethod -Uri 'http://127.0.0.1:8765/api/health' -TimeoutSec 6
 if($verified.version -ne ('v'+$remote) -or $verified.ok -ne $true){throw 'VERIFICACION_FINAL_DE_VERSION_FALLIDA'}
 Write-Host "Ecopiensa actualizado a v$remote en D:\deriv-bot\programa; cuenta REAL bloqueada." -ForegroundColor Green
 Write-Host 'Desde ahora, las tareas de actualización y vigilancia deberían abrirse ocultas.' -ForegroundColor Green
 Write-Host ('Registro de tareas: '+(Join-Path $data 'tareas-ocultas.log'))
}catch{
 $message=$_.Exception.Message
 Write-Warning ('Actualización interrumpida: '+$message)
 if($stopped -and $installed -and $backup){
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
 Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue
}
