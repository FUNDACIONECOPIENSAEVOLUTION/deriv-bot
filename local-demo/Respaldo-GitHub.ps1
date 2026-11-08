param(
  [string]$Ruta='D:\deriv-bot\programa',
  [switch]$SinIncrementarVersion
)
$ErrorActionPreference='Stop'
if(-not(Test-Path (Join-Path $Ruta '.git'))) {throw 'Primero instala el repositorio en D:\deriv-bot.'}
Push-Location $Ruta
try {
  $rama=(& git branch --show-current).Trim()
  if($rama -ne 'pc-local'){throw 'No se puede respaldar una rama distinta de pc-local. MAIN no se modifica desde Windows.'}
  $lock=Join-Path $Ruta 'local-demo\data\backup-git.lock'
  if(Test-Path $lock){Write-Host 'Otro respaldo esta ejecutandose.';return}
  New-Item -ItemType Directory -Path (Split-Path $lock) -Force | Out-Null
  New-Item -ItemType File -Path $lock -Force | Out-Null
  try {
    & git add -A -- local-demo .gitignore
    if($LASTEXITCODE -ne 0){throw 'No se pudieron preparar archivos de codigo.'}
    $files=@(& git diff --cached --name-only)
    if($files.Count -eq 0){Write-Host 'No hay cambios que subir.';return}
    foreach($name in $files){
      if($name -match '(^|/)(data|copias-privadas|node_modules|\.git)/|(^|/)(\.env|\.dev\.vars)|\.(sqlite|db|csv|pem|p12|pfx|key|log|zip)$'){
        & git reset -q -- $name | Out-Null
        throw "Archivo privado bloqueado antes del commit: $name"
      }
    }
    if(-not $SinIncrementarVersion){
      & node 'local-demo/bump-local.mjs'
      if($LASTEXITCODE -ne 0){throw 'No se pudo incrementar +0.1'}
      & git add -- local-demo/local-release.json local-demo/CHANGELOG-LOCAL.md
    }
    $version=(Get-Content 'local-demo/local-release.json' -Raw | ConvertFrom-Json).version
    & git commit -m "backup(pc-local): version $version, codigo solamente"
    if($LASTEXITCODE -ne 0){throw 'No se pudo crear commit en Git.'}
    & git push origin HEAD:pc-local
    if($LASTEXITCODE -ne 0){
      Write-Warning 'Codigo guardado en un commit local, pero no en GitHub. Autentica GitHub y ejecuta Respaldo-GitHub.ps1.'
      return
    }
    Write-Host "Respaldo remoto completo v$version (rama pc-local)" -ForegroundColor Green
  } finally {Remove-Item $lock -Force -ErrorAction SilentlyContinue}
} finally {Pop-Location}
