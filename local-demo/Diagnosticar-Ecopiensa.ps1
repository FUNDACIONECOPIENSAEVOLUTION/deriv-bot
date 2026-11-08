param([string]$Ruta='D:\deriv-bot\programa')
Write-Host 'DIAGNOSTICO DE ECOPIENSA LOCAL' -ForegroundColor Cyan
Write-Host ('Carpeta: '+$Ruta)
try{
 $h=Invoke-RestMethod 'http://127.0.0.1:8765/api/health' -TimeoutSec 3
 Write-Host ('Servidor activo: '+$h.ok+' | version: '+$h.version+' | segundos en marcha: '+$h.uptimeSeconds)
 $s=Invoke-RestMethod 'http://127.0.0.1:8765/api/status' -TimeoutSec 3
 Write-Host ('Deriv DEMO conectado: '+$s.connected+' | autentificacion: '+$s.authorizationMethod+' | precios: '+$s.marketConnected)
}catch{Write-Host 'Servidor local sin respuesta.' -ForegroundColor Yellow}
$d=Join-Path $Ruta 'local-demo\data'
if(Test-Path (Join-Path $d 'vigilancia.log')){
 Write-Host 'Ultimos eventos de vigilancia:'
 Get-Content (Join-Path $d 'vigilancia.log') -Tail 8
}
Write-Host 'Las credenciales y la base de datos no se muestran.'
