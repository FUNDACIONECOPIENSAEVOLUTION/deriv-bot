param(
  [string]$Ruta='D:\deriv-bot\programa',
  [switch]$Silencioso
)
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$baseGithub='https://raw.githubusercontent.com/FUNDACIONECOPIENSAEVOLUTION/deriv-bot/pc-local'
$app=Join-Path $Ruta 'local-demo'
$data=Join-Path $app 'data'
if(-not(Test-Path (Join-Path $app 'server.mjs'))){throw 'El bot no se encuentra en la ruta indicada.'}
New-Item -ItemType Directory -Path $data -Force | Out-Null
$log=Join-Path $data 'actualizaciones.log'
function Registrar([string]$Mensaje){
 $linea=(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')+' '+$Mensaje
 Add-Content -LiteralPath $log -Value $linea -Encoding UTF8
 if(-not $Silencioso){Write-Host $linea}
}
# Prevent overlapping updates from Task Scheduler and a desktop double-click.
$mutex=New-Object System.Threading.Mutex($false,'Local\EcopiensaActualizacionPC')
$acquired=$false
try {
 $acquired=$mutex.WaitOne(0)
 if(-not $acquired){return}
 $current=Get-Content -LiteralPath (Join-Path $app 'local-release.json') -Raw | ConvertFrom-Json
 $versionLocal=[string]$current.version
 if($versionLocal -notmatch '^\d+\.\d$'){throw 'VERSION_LOCAL_INVALIDA'}
 # A GitHub 403 on PUSH is irrelevant: updates use public READ-only HTTPS.
 try {
  $manifest=Invoke-RestMethod -Uri ($baseGithub+'/pc-release.json?cb='+[guid]::NewGuid().ToString('N')) -TimeoutSec 18 -Headers @{'Cache-Control'='no-cache';'User-Agent'='Ecopiensa-PC-Updater'}
 } catch {
  [pscustomobject]@{version=$versionLocal;status='offline';checkedAt=(Get-Date).ToString('o')} |
    ConvertTo-Json | Set-Content -LiteralPath (Join-Path $data 'github-release-status.json') -Encoding UTF8
  Registrar 'GitHub no disponible para consulta. Se mantiene el bot local sin cambios.'
  return
 }
 $remote=[string]$manifest.version
 if($remote -notmatch '^\d+\.\d$' -or [string]$manifest.channel -ne 'pc-local'){
  Registrar 'Manifiesto remoto no válido; no se cambia código.';return
 }
 [pscustomobject]@{version=$remote;status='checked';checkedAt=(Get-Date).ToString('o')} |
    ConvertTo-Json | Set-Content -LiteralPath (Join-Path $data 'github-release-status.json') -Encoding UTF8
 $localParts=$versionLocal.Split('.') | ForEach-Object {[int]$_}
 $remoteParts=$remote.Split('.') | ForEach-Object {[int]$_}
 $localTenths=$localParts[0]*10+$localParts[1]
 $remoteTenths=$remoteParts[0]*10+$remoteParts[1]
 if($remoteTenths -le $localTenths){
  if($remoteTenths -lt $localTenths){Registrar 'GitHub contiene versión anterior; no se baja de versión.'}
  else{Remove-Item -LiteralPath (Join-Path $data 'actualizacion-pendiente.txt') -Force -ErrorAction SilentlyContinue}
  return
 }
 if($remoteTenths - $localTenths -gt 50){Registrar 'Salto de versión inusual: actualización detenida.';return}
 $sha=[string]$manifest.archiveSha256
 if($sha -notmatch '^[a-fA-F0-9]{64}$'){Registrar 'Falta firma SHA-256 válida del archivo; no se aplica.';return}
 # No replace code while broker session might be open.
 $running=$false
 try {
  $health=Invoke-RestMethod 'http://127.0.0.1:8765/api/health' -TimeoutSec 2
  if($health.ok -eq $true -and $health.cloudflareDependent -eq $false){$running=$true}
 }catch{}
 # Desde v11.8: el programa se actualiza sin intervención si no hay órdenes,
 # solicitudes, tandas ni liquidaciones pendientes. Nunca se interrumpe una compra.
 $restartAfter=$running -and $health.safeToUpdate -eq $true
 if($running -and -not $restartAfter){
  Set-Content -LiteralPath (Join-Path $data 'actualizacion-pendiente.txt') -Value $remote -Encoding Ascii
  Registrar ('GitHub v'+$remote+' pendiente: contrato o tanda aún en ejecución.');return
 }
 # Only code archive from the fixed Ecopiensa repo, with SHA256 verified.
 # Split code archive into small plain-text parts for reliable GitHub storage.
 $partCount=[int]$manifest.parts
 if($partCount -lt 1 -or $partCount -gt 24){throw 'NUMERO_DE_FRAGMENTOS_INVALIDO'}
 $chunks=New-Object System.Text.StringBuilder
 for($idx=0;$idx -lt $partCount;$idx++){
  $suffix=$idx.ToString('00')
  $url=$baseGithub+'/pc-bundles/ecopiensa-local-'+$remote+'.zip.b64.part'+$suffix
  $download=Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 20
  [void]$chunks.Append(($download.Content -replace '\s',''))
 }
 # Usar el mismo disco de la aplicación para ZIP, extracciones y pruebas Node.
 # Si C: está lleno, TEMP de Windows no debe bloquear la actualización.
 $drive=[System.IO.DriveInfo]::new([System.IO.Path]::GetPathRoot($Ruta))
 if($drive.AvailableFreeSpace -lt 200MB){Registrar 'Espacio insuficiente en el disco del programa: mínimo 200 MB libres.';return}
 $previousTemp=$env:TEMP;$previousTmp=$env:TMP
 $temporaryRoot=Join-Path $Ruta '_temporales-actualizacion'
 New-Item -ItemType Directory -Path $temporaryRoot -Force | Out-Null
 $env:TEMP=$temporaryRoot;$env:TMP=$temporaryRoot
 $tmp=Join-Path $temporaryRoot ('Ecopiensa-Patch-'+[guid]::NewGuid().ToString('N'))
 New-Item -ItemType Directory -Path $tmp -Force | Out-Null
 try {
  $zip=Join-Path $tmp 'bundle.zip'
  [System.IO.File]::WriteAllBytes($zip,[Convert]::FromBase64String($chunks.ToString()))
  $got=(Get-FileHash -Path $zip -Algorithm SHA256).Hash.ToLowerInvariant()
  if($got -ne $sha.ToLowerInvariant()){throw 'ARCHIVO_SHA256_INCORRECTO'}
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $z=[System.IO.Compression.ZipFile]::OpenRead($zip)
  try {
   foreach($item in $z.Entries){
    $n=$item.FullName.Replace('\','/')
    if(-not $n.StartsWith('local-demo/') -or $n.Contains('../') -or
       $n -match '(^|/)(data|node_modules|\.git)(/|$)' -or
       $n -match '(\.key|\.db|\.sqlite|\.csv|\.env)$'){
      throw ('ZIP_RUTA_NO_PERMITIDA: '+$n)
    }
   }
  }finally{$z.Dispose()}
  $stage=Join-Path $tmp 'stage'
  Expand-Archive -LiteralPath $zip -DestinationPath $stage -Force
  $source=Join-Path $stage 'local-demo'
  $newVersion=[string]((Get-Content -LiteralPath (Join-Path $source 'local-release.json') -Raw | ConvertFrom-Json).version)
  if($newVersion -ne $remote){throw 'VERSION_PAQUETE_NO_COINCIDE'}
  if(-not(Test-Path (Join-Path $source 'server.mjs'))){throw 'PAQUETE_INCOMPLETO'}
  & node --check (Join-Path $source 'server.mjs')
  if($LASTEXITCODE -ne 0){throw 'FALLO_SINTAXIS_SERVIDOR'}
  & node --check (Join-Path $source 'public\app.js')
  if($LASTEXITCODE -ne 0){throw 'FALLO_SINTAXIS_PANEL'}
  $tests=@(Get-ChildItem -LiteralPath (Join-Path $source 'test') -Filter '*.test.mjs' -File | Select-Object -ExpandProperty FullName)
  if($tests.Count -lt 2){throw 'PAQUETE_SIN_PRUEBAS'}
  & node --test @tests
  if($LASTEXITCODE -ne 0){throw 'PRUEBAS_NO_APROBADAS'}
  # Los archivos ya fueron descargados, revisados por SHA-256, sintaxis y tests.
  # Solo entonces se pausa el programa, de forma segura y con guardia de mantenimiento.
  $maintenance=Join-Path $data 'actualizacion-en-curso.flag'
  if($restartAfter){
   Set-Content -LiteralPath $maintenance -Value $remote -Encoding Ascii
   try{
    $recheck=Invoke-RestMethod -Uri 'http://127.0.0.1:8765/api/health' -TimeoutSec 3
    if($recheck.safeToUpdate -ne $true){Registrar 'Compra pendiente: no se interrumpe.';return}
    & (Join-Path $app 'Cerrar-Ecopiensa.ps1') -Ruta $Ruta
    for($attempt=0;$attempt -lt 20;$attempt++){
     Start-Sleep -Milliseconds 300
     try{Invoke-RestMethod -Uri 'http://127.0.0.1:8765/api/health' -TimeoutSec 1 | Out-Null}
     catch{break}
    }
    try{
     Invoke-RestMethod -Uri 'http://127.0.0.1:8765/api/health' -TimeoutSec 1 | Out-Null
     throw 'No se pudo cerrar el servidor sin riesgo. Se cancela la actualización.'
    }catch{
     if($_.Exception.Message -match 'No se pudo cerrar'){throw}
    }
   }finally{
    # El flag permanece durante el cambio de archivos, pero se limpiará al final.
   }
  }
  $backup=Join-Path $Ruta ('copias-privadas-codigo\antes_'+$remote+'_'+(Get-Date -Format 'yyyyMMdd_HHmmss'))
  New-Item -ItemType Directory -Path $backup -Force | Out-Null
  Get-ChildItem -LiteralPath $app -Force | Where-Object {$_.Name -notin @('data','node_modules')} |
    ForEach-Object {Copy-Item -LiteralPath $_.FullName -Destination $backup -Recurse -Force}
  # Copiar TODAS las fuentes verificadas dentro de local-demo, no solo una lista
  # fija. En v12.6 la lista fija omitía market-analysis.mjs y provocaba
  # ERR_MODULE_NOT_FOUND aunque las 17 pruebas de GitHub habían aprobado.
  # Ya se comprobó el SHA-256 del ZIP y sus rutas antes de llegar aquí.
  $required=@('server.mjs','market-analysis.mjs','demo-trading.mjs','demo-burst.mjs',
    'mcp-local.mjs','public\app.js','public\index.html','local-release.json')
  foreach($name in $required){
   if(-not(Test-Path -LiteralPath (Join-Path $source $name) -PathType Leaf)){
    throw ('PAQUETE_MODULO_OBLIGATORIO_AUSENTE: '+$name)
   }
  }
  $sourceRoot=[System.IO.Path]::GetFullPath($source).TrimEnd('\')+'\'
  $filesToCopy=@(Get-ChildItem -LiteralPath $source -Recurse -File -Force)
  foreach($file in $filesToCopy){
   $full=[System.IO.Path]::GetFullPath($file.FullName)
   if(-not $full.StartsWith($sourceRoot,[System.StringComparison]::OrdinalIgnoreCase)){
    throw 'ARCHIVO_FUERA_DE_ORIGEN'
   }
   $relative=$full.Substring($sourceRoot.Length)
   if($relative -match '(^|\\)(data|node_modules|\.git)(\\|$)' -or
      $relative -match '(\.key|\.db|\.sqlite|\.csv|\.env)$'){
    throw 'ARCHIVO_PRIVADO_EN_PAQUETE_PROHIBIDO'
   }
   $target=Join-Path $app $relative
   New-Item -ItemType Directory -Path (Split-Path -Parent $target) -Force | Out-Null
   Copy-Item -LiteralPath $file.FullName -Destination $target -Force
  }
  foreach($name in $required){
   if(-not(Test-Path -LiteralPath (Join-Path $app $name) -PathType Leaf)){
    throw ('MODULO_NO_COPIADO: '+$name)
   }
  }
  Registrar ('Módulos verificados y copiados: '+$filesToCopy.Count+'. Datos privados intactos.')
  # Tras copiar los módulos nuevos, impedir que las tareas muestren consola.
  $isAdmin=([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  if($isAdmin){try{ & (Join-Path $app 'Instalar-TareasOcultas.ps1') -Ruta $Ruta | Out-Null }
   catch{Registrar 'No fue posible registrar tareas automáticas; código actualizado.'}}
  else{Registrar 'Código actualizado; tareas programadas sin instalar por falta de elevación.'}
  catch {
   Add-Content -LiteralPath (Join-Path $data 'tareas-ocultas.log') -Value ((Get-Date -Format s)+' Error de tareas: '+$_.Exception.GetType().Name)
  }
  Remove-Item -LiteralPath (Join-Path $data 'actualizacion-pendiente.txt') -Force -ErrorAction SilentlyContinue
  Registrar ('Código actualizado desde GitHub pc-local a v'+$remote+'. Datos privados preservados.')
  if($restartAfter){
   Remove-Item -LiteralPath $maintenance -Force -ErrorAction SilentlyContinue
   # Reabrir únicamente el servicio Node, sin duplicar ventanas del navegador.
   Set-Content -LiteralPath (Join-Path $data 'ejecucion-habilitada.flag') -Value 'ACTIVO' -Encoding Ascii
   & (Join-Path $app 'Vigilar-Ecopiensa.ps1') -Ruta $Ruta
   Registrar 'Reinicio automático del servicio solicitado. El panel web se recargará a la nueva versión.'
  }
 }finally {
  if($restartAfter){
   Remove-Item -LiteralPath (Join-Path $data 'actualizacion-en-curso.flag') -Force -ErrorAction SilentlyContinue
   # En caso de fallo a mitad de actualización, el watchdog podrá recuperar el servicio.
   if(-not(Test-Path (Join-Path $data 'ejecucion-habilitada.flag'))){
    Set-Content -LiteralPath (Join-Path $data 'ejecucion-habilitada.flag') -Value 'ACTIVO' -Encoding Ascii
   }
  }
  Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
  $env:TEMP=$previousTemp;$env:TMP=$previousTmp
 }
}finally{
 if($acquired){$mutex.ReleaseMutex()}
 $mutex.Dispose()
}
