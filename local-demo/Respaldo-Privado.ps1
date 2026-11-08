param([string]$Ruta='D:\deriv-bot')
$ErrorActionPreference='Stop'
$data=Join-Path $Ruta 'local-demo\data'
if(-not (Test-Path $data)){throw 'No existe almacenamiento local todavía'}
# Close local server first for a consistent SQLite+WAL backup.
if(Get-NetTCPConnection -LocalPort 8765 -State Listen -ErrorAction SilentlyContinue){
 throw 'Cierra el bot con el acceso directo Cerrar Ecopiensa DEMO antes de respaldar SQLite.'
}
$dest=Join-Path $Ruta 'local-demo\copias-privadas'
New-Item -ItemType Directory -Path $dest -Force | Out-Null
$name='DEMO_PRIVADO_'+(Get-Date -Format 'yyyyMMdd_HHmmss')+'.zip'
$files=@('demo-local.sqlite','.key-local.bin','historico-demo.csv') | ForEach-Object {Join-Path $data $_} | Where-Object {Test-Path $_}
if(@($files).Count -eq 0){throw 'No se encontraron archivos para respaldar'}
Compress-Archive -LiteralPath $files -DestinationPath (Join-Path $dest $name) -CompressionLevel Optimal
Write-Host "Copia PRIVADA creada en $dest\$name (NO se sube a GitHub)." -ForegroundColor Green
