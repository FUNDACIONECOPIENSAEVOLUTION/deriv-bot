param([string]$Ruta='D:\deriv-bot\programa')
$ErrorActionPreference='Stop'
$desktop=[Environment]::GetFolderPath('Desktop')
if (-not $desktop) { throw 'Windows no encontro la carpeta Escritorio.' }
$exe=Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$wshell=New-Object -ComObject WScript.Shell
function Crear([string]$Nombre,[string]$Script,[string]$Descripcion) {
  $shortcut=$wshell.CreateShortcut((Join-Path $desktop ($Nombre+'.lnk')))
  $shortcut.TargetPath=$exe
  $shortcut.Arguments='-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "'+(Join-Path $Ruta ('local-demo\'+$Script))+'" -Ruta "'+$Ruta+'"'
  $shortcut.WorkingDirectory=Join-Path $Ruta 'local-demo'
  $shortcut.Description=$Descripcion
  $shortcut.IconLocation=(Join-Path $env:SystemRoot 'System32\shell32.dll')+',15' # Icono generico de Windows.
  $shortcut.WindowStyle=7
  $shortcut.Save()
}
Crear 'Ecopiensa Deriv DEMO' 'Abrir-Ecopiensa.ps1' 'Abrir panel DEMO local y actualizar desde GitHub'
Crear 'Cerrar Ecopiensa DEMO' 'Cerrar-Ecopiensa.ps1' 'Cerrar servidor local Ecopiensa'
Write-Host ('Accesos directos creados en '+$desktop) -ForegroundColor Green
