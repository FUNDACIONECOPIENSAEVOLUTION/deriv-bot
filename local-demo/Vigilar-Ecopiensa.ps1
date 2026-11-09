param([string]$Ruta='D:\deriv-bot\programa')
$ErrorActionPreference='Stop'
$app=Join-Path $Ruta 'local-demo'
$data=Join-Path $app 'data'
$flag=Join-Path $data 'ejecucion-habilitada.flag'
$maintenance=Join-Path $data 'actualizacion-en-curso.flag'
# Durante la instalacion JAMAS relanzar Node, aun si el PID anterior desaparece.
if(Test-Path -LiteralPath $maintenance){exit 0}
if(-not (Test-Path $flag)){exit 0}
if(-not (Test-Path (Join-Path $app 'server.mjs'))){exit 1}
function Salud {
 try{
  $r=Invoke-RestMethod -Uri 'http://127.0.0.1:8765/api/health' -TimeoutSec 3
  return $r.ok -eq $true -and $r.cloudflareDependent -eq $false
 }catch {return $false}
}
if(Salud){exit 0}
if(Test-Path -LiteralPath $maintenance){exit 0}
# Avoid duplicate Node processes when a slow but still running process is seen.
$pidfile=Join-Path $data 'servidor.pid'
if(Test-Path $pidfile){
 try{
  $id=[int](Get-Content $pidfile -Raw)
  $proc=Get-CimInstance Win32_Process -Filter "ProcessId=$id" -ErrorAction Stop
  if($proc -and $proc.Name -match '^node(\.exe)?$' -and
     $proc.CommandLine -match 'local-demo[/\\]server\.mjs'){
    Add-Content (Join-Path $data 'vigilancia.log') "$(Get-Date -Format s) Proceso vivo pero panel no responde. No abrir duplicado."
    exit 2
  }
 }catch{}
}
$node=Get-Command node -ErrorAction SilentlyContinue
if(-not $node){exit 3}
$stdout=Join-Path $data 'servidor-stdout.log'
$stderr=Join-Path $data 'servidor-stderr.log'
if(Test-Path -LiteralPath $maintenance){exit 0}
$proc=Start-Process -FilePath $node.Source -ArgumentList @('--max-old-space-size=192',('"'+(Join-Path $app 'server.mjs')+'"')) -WorkingDirectory $app -WindowStyle Hidden -PassThru -RedirectStandardOutput $stdout -RedirectStandardError $stderr
Set-Content $pidfile $proc.Id -Encoding Ascii
Start-Sleep -Seconds 2
if(Salud){
 Add-Content (Join-Path $data 'vigilancia.log') "$(Get-Date -Format s) Servidor local recuperado, PID $($proc.Id)."
 exit 0
}
Add-Content (Join-Path $data 'vigilancia.log') "$(Get-Date -Format s) Reinicio fallido; consultar servidor-stderr.log."
exit 4
