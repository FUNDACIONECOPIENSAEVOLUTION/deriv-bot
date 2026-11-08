param([string]$Ruta='D:\deriv-bot\programa')
$ErrorActionPreference='Stop'
# Única instalación por PC. Tareas ejecutadas con wscript.exe, sin ventana.
$app=Join-Path $Ruta 'local-demo'
$vbs=Join-Path $app 'Tarea-Oculta.vbs'
if(-not(Test-Path $vbs)){throw 'TAREA_OCULTA_NO_INSTALADA'}
if(-not(Test-Path (Join-Path $app 'server.mjs'))){throw 'ECOPIENSA_SERVER_NO_INSTALADO'}
$wscript=Join-Path $env:WINDIR 'System32\wscript.exe'
if(-not(Test-Path $wscript)){throw 'WSCRIPT_WINDOWS_NO_DISPONIBLE'}
$isAdmin=([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if(-not $isAdmin){
 Write-Warning 'TAREAS_NO_INSTALADAS: Ejecutar Reparar-Tareas-PC.ps1 como administrador.'
 exit 2
}
function CrearTarea([string]$Nombre,[string]$Accion,[int]$Minutos,[string]$Descripcion){
  $argumentos='/B "'+$vbs+'" '+$Accion+' "'+$Ruta+'"'
  $action=New-ScheduledTaskAction -Execute $wscript -Argument $argumentos -WorkingDirectory $app
  $trigger=New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes($Minutos) -RepetitionInterval (New-TimeSpan -Minutes $Minutos)
  $settings=New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Minutes 2) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
  Register-ScheduledTask -TaskName $Nombre -Action $action -Trigger $trigger -Settings $settings -Description $Descripcion -Force | Out-Null
  $task=Get-ScheduledTask -TaskName $Nombre -ErrorAction Stop
  if($task.Actions.Execute -ne $wscript){throw 'TAREA_NO_SE_CREO_EN_MODO_OCULTO'}
}
CrearTarea 'Ecopiensa_Deriv_PC_AutoActualizar' 'actualizar' 5 'Comprueba GitHub pc-local; evita actualizar con compras DEMO activas.'
CrearTarea 'Ecopiensa_Deriv_PC_VigilarServidor' 'vigilar' 2 'Supervisa el servidor Node PC sin abrir ventana de PowerShell.'
Write-Host 'Actualización y vigilancia programadas sin ventanas emergentes.' -ForegroundColor Green
Write-Host ('Ubicación del programa: '+$Ruta)
Write-Host ('Para consultar errores: '+(Join-Path $app 'data\tareas-ocultas.log'))
