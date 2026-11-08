param([string]$Ruta='D:\deriv-bot\programa')
# Ejecutar a mano tras instalar v12.6. Pide UAC solamente para crear tareas programadas.
$ErrorActionPreference='Stop'
$installer=Join-Path $Ruta 'local-demo\Instalar-TareasOcultas.ps1'
if(-not(Test-Path -LiteralPath $installer)){throw 'INSTALADOR_TAREAS_NO_EXISTE'}
$identity=[Security.Principal.WindowsIdentity]::GetCurrent()
$admin=([Security.Principal.WindowsPrincipal]$identity).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if(-not $admin){
 Write-Host 'Windows solicitará permiso de administrador para registrar tareas ocultas.'
 $args="-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" -Ruta `"$Ruta`""
 try{
  $p=Start-Process -FilePath 'powershell.exe' -ArgumentList $args -Verb RunAs -Wait -PassThru
  if($p.ExitCode -ne 0){throw "REPARACION_TAREAS_FALLO_$($p.ExitCode)"}
 }catch{
  throw 'PERMISOS_NO_CONCEDIDOS_REPARAR_TAREAS_DESDE_POWERSHELL_ADMIN'
 }
 return
}
& $installer -Ruta $Ruta
if($LASTEXITCODE -and $LASTEXITCODE -ne 0){throw 'TAREAS_NO_REGISTRADAS'}
Get-ScheduledTask -TaskName 'Ecopiensa_Deriv_PC_AutoActualizar','Ecopiensa_Deriv_PC_VigilarServidor' |
 Select-Object TaskName,State,TaskPath | Format-Table -AutoSize
Write-Host 'Tareas verificadas. Ninguna orden DEMO se envió.' -ForegroundColor Green
