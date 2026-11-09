param([string]$Ruta='D:\deriv-bot\programa')
$ErrorActionPreference='Stop'
# Parada del servidor EXCLUSIVAMENTE de Ecopiensa. Una version antigua puede
# responder /api/health aunque falte servidor.pid o el PID haya caducado.
$app=Join-Path $Ruta 'local-demo'
$data=Join-Path $app 'data'
$flag=Join-Path $data 'ejecucion-habilitada.flag'
$pidFile=Join-Path $data 'servidor.pid'
# Comparar IDENTIDAD canonica del archivo, no texto: Windows puede lanzar
# Node con ruta DOS 8.3, p.ej. C:\Users\RUNNER~1 en lugar de C:\Users\runneradmin.
Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class EcopiensaCanonicalPath {
 [DllImport("kernel32.dll", EntryPoint="GetLongPathNameW", CharSet=CharSet.Unicode, SetLastError=true)]
 private static extern uint GetLongPathName(string name, StringBuilder result, uint size);
 public static string Resolve(string path) {
  var text=new StringBuilder(32768);
  uint length=GetLongPathName(path,text,(uint)text.Capacity);
  if(length==0 || length>=text.Capacity)
   throw new InvalidOperationException("CANONICAL_PATH_FAILED");
  return System.IO.Path.GetFullPath(text.ToString());
 }
}
'@
$scriptPath=[EcopiensaCanonicalPath]::Resolve((Join-Path $app 'server.mjs'))
# Extraer exclusivamente el argumento script de una llamada a node.exe.
# No usar coincidencias laxas con scripts de otros repositorios.
$scriptPattern='(?i)(?:^|\s|")(?<script>[A-Z]:\\[^"\r\n]*\\local-demo\\server\.mjs)(?=$|\s|")'
Remove-Item -LiteralPath $flag -Force -ErrorAction SilentlyContinue
$running=@(Get-CimInstance -ClassName Win32_Process -Filter "Name='node.exe'" -ErrorAction Stop |
 Where-Object {
  if(-not $_.CommandLine){return $false}
  $match=[regex]::Match($_.CommandLine,$scriptPattern)
  if(-not $match.Success){return $false}
  try{
   $resolved=[EcopiensaCanonicalPath]::Resolve($match.Groups['script'].Value)
   return [string]::Equals($resolved,$scriptPath,[System.StringComparison]::OrdinalIgnoreCase)
  }catch{return $false}
 })
if($running.Count -eq 0){
 # No se confunde PID ausente con servidor cerrado: el instalador volvera
 # a comprobar /api/health y bloqueara cualquier reemplazo si sigue activo.
 Write-Host 'No se encontro un proceso Node vinculado a la ruta exacta de Ecopiensa.'
 Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
 exit 0
}
foreach($proc in $running){
 Write-Host ('Deteniendo Node Ecopiensa verificado; PID '+$proc.ProcessId)
 Stop-Process -Id ([int]$proc.ProcessId) -Force -ErrorAction Stop
}
foreach($proc in $running){
 for($attempt=0;$attempt -lt 25;$attempt++){
  if(-not(Get-Process -Id ([int]$proc.ProcessId) -ErrorAction SilentlyContinue)){break}
  Start-Sleep -Milliseconds 200
 }
 if(Get-Process -Id ([int]$proc.ProcessId) -ErrorAction SilentlyContinue){
  throw 'PROCESO_ECOPIENSA_NO_SE_DETUVO'
 }
}
Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
Write-Host 'Proceso Ecopiensa cerrado de forma segura. No se detuvieron otros Node.'
