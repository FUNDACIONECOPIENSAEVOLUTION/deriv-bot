# Ensayo exclusivo de Windows. No inicia el bot ni conecta a Deriv.
# Reproduce v13.2: Node sigue vivo, falta servidor.pid, y un Node ajeno debe sobrevivir.
$ErrorActionPreference='Stop'
$root=Join-Path $env:TEMP ('ecopiensa-safe-close-'+[guid]::NewGuid().ToString('N'))
$app=Join-Path $root 'local-demo'
$data=Join-Path $app 'data'
New-Item -ItemType Directory -Force -Path $data | Out-Null
$target=Join-Path $app 'server.mjs'
$other=Join-Path $root 'other-server.mjs'
Set-Content -LiteralPath $target -Encoding UTF8 -Value 'setInterval(() => {}, 1000);'
Set-Content -LiteralPath $other -Encoding UTF8 -Value 'setInterval(() => {}, 1000);'
Set-Content -LiteralPath (Join-Path $data 'ejecucion-habilitada.flag') -Value 'ACTIVO' -Encoding Ascii
$node=(Get-Command node -ErrorAction Stop).Source
$ecopiensaProcess=$null
$otherProcess=$null
try {
 $ecopiensaProcess=Start-Process -FilePath $node -ArgumentList ('"'+$target+'"') -PassThru -WindowStyle Hidden
 $otherProcess=Start-Process -FilePath $node -ArgumentList ('"'+$other+'"') -PassThru -WindowStyle Hidden
 Start-Sleep -Seconds 2
 if(-not (Get-Process -Id $ecopiensaProcess.Id -ErrorAction SilentlyContinue)){throw 'TEST_ECOPIENSA_NO_INICIO'}
 if(-not (Get-Process -Id $otherProcess.Id -ErrorAction SilentlyContinue)){throw 'TEST_AJENO_NO_INICIO'}
 if(Test-Path (Join-Path $data 'servidor.pid')){throw 'TEST_PID_DEBE_ESTAR_AUSENTE'}
 & (Join-Path $PSScriptRoot '..\Cerrar-Ecopiensa.ps1') -Ruta $root
 if($LASTEXITCODE -and $LASTEXITCODE -ne 0){throw 'CIERRE_REGRESO_ERROR'}
 Start-Sleep -Milliseconds 500
 if(Get-Process -Id $ecopiensaProcess.Id -ErrorAction SilentlyContinue){throw 'CIERRE_SIN_PID_NO_FUNCIONO'}
 if(-not (Get-Process -Id $otherProcess.Id -ErrorAction SilentlyContinue)){throw 'CIERRE_DETUVO_NODE_AJENO'}
 if(Test-Path (Join-Path $data 'ejecucion-habilitada.flag')){throw 'WATCHDOG_NO_DESHABILITADO'}
 Set-Content -LiteralPath (Join-Path $data 'ejecucion-habilitada.flag') -Value 'ACTIVO' -Encoding Ascii
 Set-Content -LiteralPath (Join-Path $data 'actualizacion-en-curso.flag') -Value 'TEST' -Encoding Ascii
 & (Join-Path $PSScriptRoot '..\Vigilar-Ecopiensa.ps1') -Ruta $root
 if(Get-Process -Id $ecopiensaProcess.Id -ErrorAction SilentlyContinue){throw 'WATCHDOG_REINICIO_DURANTE_MANTENIMIENTO'}
 Write-Host 'SAFE_SHUTDOWN_TEST_PASSED: PID ausente, se detuvo Node correcto, Node ajeno vivo, watchdog bloqueado.'
}finally{
 foreach($proc in @($ecopiensaProcess,$otherProcess)){
  if($null -ne $proc){Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue}
 }
 Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue
}
