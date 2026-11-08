# Ecopiensa Deriv DEMO — PC ligero (rama pc-local)

Este documento acompaña el instalador `ecopiensa-deriv-local-ligero-11.4.zip` entregado al usuario en ChatGPT. **La ejecución ocurre únicamente en `D:\\deriv-bot`**, no en GitHub, Railway ni Cloudflare.

## Instalación
1. Extraer el ZIP completo en Descargas.
2. Ejecutar `powershell -ExecutionPolicy Bypass -File .\\Instalar-Deriv-Ligero.ps1` desde la carpeta extraída.
3. Si se instalaron Git o Node.js 24 LTS, reiniciar PowerShell y ejecutar de nuevo el instalador.
4. Ejecutar `powershell -ExecutionPolicy Bypass -File D:\\deriv-bot\\local-demo\\Arrancar-Bot.ps1`.
5. Abrir `http://localhost:8765`. Registro de callback OAuth: `http://localhost:8765/api/oauth/callback`.

## Datos y memoria
- Nodo único Node.js 24, SQLite integrada, WebSocket nativo; sin paquetes npm adicionales para el modo ligero.
- Límite sugerido al heap JavaScript: 192 MB, que **no equivale** a límite de RAM total del sistema.
- Hasta 150 ticks en memoria por cada uno de 4 índices.
- El CSV de 48 contratos observados (no corroborados de manera independiente) se instala en `local-demo/data/historico-demo.csv`. **Nunca publicar CSV, bases SQLite ni claves**.
- Esta primera etapa es **solo lectura**: recupera autorización DEMO, saldo, cotizaciones, contratos y análisis histórico; no compra, no vende y no accede a la cuenta REAL.
- La antigua autorización cifrada de Cloudflare no se puede copiar directamente; debe autorizarse el App ID existente desde localhost.

## GitHub: respaldo automático, nunca operación
- La rama `pc-local` se utiliza únicamente para respaldar código.
- El instalador ofrece una tarea Windows cada cinco minutos que ejecuta `local-demo/Respaldo-GitHub.ps1`; esto crea un commit solo cuando cambia código, incrementa la versión +0,1 y hace `git push origin pc-local`.
- El flujo de publicación automatizada del repositorio solo aplica a `main`. No fusionar `pc-local` en `main` sin decisión expresa.
- Las credenciales y los registros financieros privados nunca deben añadirse a GitHub. Para copia privada, detener el bot y ejecutar `Respaldo-Privado.ps1`.
- La instalación deberá registrar su primer commit de código antes de considerarse respaldada. Un commit local cuya subida falló **todavía no constituye un respaldo remoto**.

## Futuras mejoras
No reactivar BUY/SELL ni transferencias a REAL sin validación de saldos oficiales, conciliación de contratos, controles de riesgo y pruebas de latencia. Analizar el historial no equivale a entrenamiento estadísticamente validado.
