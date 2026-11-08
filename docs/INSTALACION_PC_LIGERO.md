# Ecopiensa Deriv DEMO — Windows local v11.5

## Objetivo
La app se ejecuta **solo en el computador** del propietario, en `D:\deriv-bot`. GitHub sirve exclusivamente para código fuente y respaldos; no ejecuta órdenes ni almacena credenciales. La rama de distribución del PC es **`pc-local`**. No fusionar automáticamente a `main`, pues esa rama dispara la publicación de Cloudflare.

## Instalación
1. Descargar el ZIP `ecopiensa-deriv-PC-escritorio-11.5.zip` desde la conversación de ChatGPT y extraerlo completo.
2. Doble clic en `Instalar-Ecopiensa-PC.cmd`, o ejecutar `powershell -NoProfile -ExecutionPolicy Bypass -File .\Instalar-Ecopiensa-PC.ps1` desde la carpeta extraída.
3. Si falta Git o Node.js (v24+), el instalador utiliza winget; después de instalar esos requisitos hay que abrir PowerShell de nuevo y repetir el instalador.
4. Abrir el icono del Escritorio **Ecopiensa Deriv DEMO**. El servidor Node.js ligero se inicia una única vez y se presenta el panel en ventana de Edge o en el navegador predeterminado.
5. Para cerrar el servidor usar el segundo acceso directo: **Cerrar Ecopiensa DEMO**.

## Actualizaciones automáticas desde GitHub
- La tarea programada `Ecopiensa_Deriv_PC_AutoActualizar` busca cambios en `origin/pc-local` cada 5 minutos, y el icono del escritorio comprueba de nuevo al abrir.
- Se utiliza `git pull --ff-only` exclusivamente cuando el servidor está cerrado y el directorio del código no tiene modificaciones sin guardar. Cuando el servidor está abierto se deja constancia de la nueva versión y se aplica al próximo arranque. Nunca se interrumpe una operación.
- No se aceptan publicaciones sin incremento de versión (+0,1). La versión de PC se gestiona en `local-demo/local-release.json`, separadamente del manifiesto de Cloudflare.
- El ZIP inicia el proyecto desde GitHub `pc-local` y copia el motor ligero cuando aún no está en esa rama; intenta subir los archivos de instalación al repositorio la primera vez. Si GitHub solicita iniciar sesión, completar la autenticación y ejecutar `local-demo/Respaldo-GitHub.ps1 -SinIncrementarVersion`. Hasta que esta subida inicial se complete, el código no está respaldado remotamente.
- Los cambios posteriores deben publicarse en la rama `pc-local`; las modificaciones de `main` NO se integran solas, porque pueden requerir código Cloudflare incompatible con Windows.

## Consumo y datos privados
- Node.js 24+, SQLite y WebSocket integrados; no instala Electron ni paquetes npm pesados.
- Heap JS del servidor limitado inicialmente a 192 MB; Chrome/Edge y otras memorias del proceso no están incluidas en dicho límite.
- 150 ticks por cada uno de 4 índices. La base de datos, CSV, clave AES y tokens están en `local-demo/data`, ignorado por Git.
- El CSV inicial recuperado contiene 48 operaciones observadas desde navegador, no contrastadas independientemente con Deriv.
- Respaldo privado manual: cerrar el programa y ejecutar `local-demo/Respaldo-Privado.ps1`. **Nunca compartir esa carpeta ni subirla a GitHub.**

## Alcance DEMO
El panel Node.js permite autorización OAuth al App ID que el propietario tenía en Deriv, consulta de saldo DEMO, precios de mercado, RSI/SMA, propuestas no ejecutables e historial de contratos. URL callback local a registrar: `http://localhost:8765/api/oauth/callback`. El OAuth cifrado de Cloudflare no se importa: el propietario debe reautorizar la aplicación existente desde localhost.

**BUY, SELL y REAL todavía están deshabilitados en este servidor local ligero.** No existe un modelo predictivo entrenado y validado; primero se comprueba la conexión antes de trasladar el motor completo de compras DEMO. No hay garantías de latencia inferior a 1 s ni de rentabilidad.
