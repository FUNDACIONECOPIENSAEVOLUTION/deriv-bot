param([string]$Ruta='D:\deriv-bot\programa')
$ErrorActionPreference='Stop'
$local=Join-Path $Ruta 'local-demo\local-release.json'
$data=Join-Path $Ruta 'local-demo\data\github-release-status.json'
$manifest=Get-Content -LiteralPath $local -Raw | ConvertFrom-Json
Write-Host ('Versión instalada en PC: v'+$manifest.version) -ForegroundColor Green
if(Test-Path $data){
 $state=Get-Content -LiteralPath $data -Raw | ConvertFrom-Json
 Write-Host ('Versión GitHub pc-local: v'+$state.version+' ('+$state.status+')')
}else{Write-Host 'GitHub: todavía no consultado'}
$flag=Join-Path $Ruta 'local-demo\data\actualizacion-pendiente.txt'
if(Test-Path $flag){Write-Host ('Actualización pendiente: v'+(Get-Content $flag -Raw).Trim()) -ForegroundColor Yellow}
Write-Host 'Origen: https://github.com/FUNDACIONECOPIENSAEVOLUTION/deriv-bot/tree/pc-local'
