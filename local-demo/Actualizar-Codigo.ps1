# Alias compatible con instalaciones anteriores; ahora solo recibe GitHub/pc-local.
param([string]$Ruta='D:\deriv-bot\programa')
& (Join-Path $PSScriptRoot 'Actualizar-Desde-GitHub.ps1') -Ruta $Ruta
