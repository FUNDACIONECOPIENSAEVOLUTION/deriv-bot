# Ecopiensa PC: guía DEMO, 60 velas y observatorio externo

## Seguridad y alcance
- Esta distribución corre en Windows con Node.js 24, `http://localhost:8765`.
- Se permiten **hasta 5 contratos DEMO simultáneos**, dentro de tandas de **1–10 contratos** y máximo **US$10 en apuestas autorizadas por tanda**.
- El botón del panel local autoriza la tanda o compra manual sin transcribir frases. El servidor valida el origen local.
- Compras y retiros REALES permanecen deshabilitados. No hay MCP remoto conectado.
- Un BUY sin confirmación queda `UNKNOWN`: **no reintentar**; conciliar con Deriv.
- El límite de pérdida del saldo DEMO, pérdidas diarias y exposición agregada se comprueba antes de cada compra.
- Las tareas de actualización nunca reemplazan el código durante contratos abiertos, pendientes o inciertos.

## 60 velas
- Consultar `active_symbols` en el WebSocket público de Deriv antes de usar un candidato.
- Para cada índice disponible, solicitar hasta 660 ticks históricos y agregar velas OHLC de 10 ticks. El panel muestra las últimas **60 velas completas** y un gráfico separado de los ticks más recientes.
- Indicadores: EMA20, EMA50, RSI14, ATR14, pendiente y momento. Si faltan 60 velas o el dato es viejo, el bot muestra **ESPERAR**.
- La proyección del próximo tick es **experimental**, con MAE observado y comparador ingenuo de persistencia. No se usa para enviar contratos.
- Las nuevas compras registran indicadores, cotización previa, payout estimado y, si el broker los proporciona, tick de entrada y salida y sus épocas. Los registros anteriores no se reconstruyen artificialmente.

## Selección de índices
- Candidatos: R_10, R_25, R_50, R_75, R_100, 1HZ10V, 1HZ50V, 1HZ75V, 1HZ100V, 1HZ500V y R_500.
- No se da por existente un símbolo por su nombre. Solo se usa cuando aparece en la respuesta oficial `active_symbols`, llega su historial y hay señal fresca.
- La selección AUTO prefiere señales que cumplen condiciones, máximo dos contratos del mismo índice por ola. Si no hay señal confiable, no llena artificialmente la tanda.
- En la interfaz, el total **solicitado**, **ejecutado** y **liquidado** no debe confundirse.

## Observatorio externo
- USD/COP, EUR/USD, USD/JPY, XAU/USD (oro) y BTC/USD (Bitcoin), **solo si existen en la lista de mercados del proveedor**.
- Se muestran como datos de lectura informativa; si falta la cotización, aparece NO DISPONIBLE. Nunca se sustituyen por valores inventados.
- Estos activos no se usan como predictores de los índices sintéticos de Deriv, que no siguen directamente noticias o mercados financieros externos.
- Futuras cuentas/brokers requerirán integración autenticada independiente, permisos de negociación explícitos, normalización de símbolos, datos y horarios. No están conectados aún.

## Prueba de operación en Windows
1. Asegúrate de no tener contratos DEMO abiertos o UNKNOWN y actualiza desde el paquete publicado con SHA-256.
2. Comprueba las 60 velas, la fecha del último tick y los instrumentos realmente disponibles.
3. Ejecuta primero 1 contrato DEMO mínimo y confirma su ID y liquidación en Deriv.
4. Prueba una tanda de 2 contratos con máximo 2 simultáneos. Compara sus IDs y el CSV.
5. Si todo coincide, prueba una tanda de 5 contratos con máximo 5 simultáneos, si aparecen señales y los límites lo permiten.
6. Nunca interpretes un rechazo anterior al BUY como una compra perdida.
7. Descarga `/api/demo/orders.csv`; analiza por índice, dirección, volatilidad, RSI, latencia, entrada/salida y P&L. Usa series de prueba fuera de muestra para evaluar tasas observadas, no tasas prometidas.

## Reparación de tareas Windows
Tras actualizar la aplicación, ejecuta en PowerShell:
```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "D:\deriv-bot\programa\local-demo\Reparar-Tareas-PC.ps1" -Ruta "D:\deriv-bot\programa"
```
Windows solicitará autorización UAC si corresponde. Si hay políticas que bloquean el Programador de tareas, no modificar permisos de seguridad a la fuerza. El programa puede abrirse manualmente.

## Objetivo de acierto 90 %
Es una meta de investigación, no una capacidad demostrada. Más velas no implican ventaja predictiva. Medir compras realmente liquidadas, payoff y ganancia neta, hacer validación fuera de muestra, calibración y márgenes de confianza. No aumentar apuestas por rachas de pérdidas.
