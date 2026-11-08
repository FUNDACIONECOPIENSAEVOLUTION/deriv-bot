# Alias compatible: ejecutar el mismo panel que el acceso directo del Escritorio.
param([string]$Ruta='D:\deriv-bot\programa')
& (Join-Path $PSScriptRoot 'Abrir-Ecopiensa.ps1') -Ruta $Ruta
