# Programa unificado 10 x 10 de las cuatro modalidades (fase DEMO segura)

## Solicitado
Un único consentimiento local para evaluar un máximo de 10 tandas por modalidad de 10 contratos, con verde progresivo, reducción a US$0.50 tras dos pérdidas, comparación por bot y protección global. El diseño final exige cuatro ejecutores probados, contratos y cotizaciones reales y un gestor de exposición por cuenta. **La implementación de esta fase NO ejecuta 400 compras.**

## Alcance implementado
- **A: Rise/Fall** se integra con el programa oficial de Opciones DEMO de 10 x 10, una sola autorización manual y 10 tandas con máximo 10 compras cada una. Reutiliza las reglas existentes de riesgo, sin duplicar lógica.
- **B: Dígitos** sigue en modo sombra: agrupa hasta 100 predicciones prospectivas en tandas de 10, usando un solo índice con precisión oficial de sus ticks. No envía BUY, no dispone de cuotas ni genera beneficios contables. Su cifra de 100 es número de muestras, no 100 transacciones.
- **C: Multipliers** queda bloqueado hasta verificar `contracts_for`, payout, límites, cierre y conciliación de opciones.
- **D: CFD** queda bloqueado hasta conectar cuenta MT5 DEMO separada y gestor de margen; el WebSocket Options DEMO no ejecuta CFD.
- **Presupuesto $100 por bot** sigue siendo planificado, no saldo segregado. El riesgo de la cuenta Options es compartido.

## Regla A
`mode=RESEARCH_FIVE_ONLY`, `stakeCents=100`, `concurrency=1`, `profitTargetCents=50`, `exitPolicy=TRAILING_GREEN`, `globalProtection=true`, `downshiftAfterTwoLosses=true`, `continueAfterNegativeRound=false`.

- Reglas heredadas: iniciar con US$1, tras dos pérdidas consecutivas reducir a US$0.50 durante esa tanda; detener una tanda al alcanzar condición de ganancia protectora o completar 10 compras; validar liquidación antes de la siguiente.
- Global: hasta armar la protección con +US$3, piso -US$3; luego proteger al menos +US$1 o el pico menos US$2. Puede parar antes de terminar. No hay martingala.
- Si la tanda queda negativa y sus pérdidas superan o igualan las ganadas, se pausa (no sigue automáticamente en rojo). No existe garantía de que cada tanda termine en verde.
- Siguen activos riesgo diario, contratos OPEN/UNKNOWN, confirmación del saldo y autenticación DEMO.
- Un programa interrumpido por reinicio no vuelve a comprar por sí solo.

## API y autorización
El panel local incluye un checkbox explícito que permite únicamente las compras de A y las observaciones B. No habilita C/D. Solicitud exacta:
`POST /api/lab/multibot-program/start` con autorización local, JSON y `confirmation: "AUTORIZAR MULTIBOT DEMO 10X10 A Y SOMBRA B"`.
Se puede seguir `GET /api/lab/multibot-program` y detener `POST /api/lab/multibot-program/stop`.
Nunca conectar un botón de este laboratorio con cuatro ejecutores financieros hasta gestionar contablemente el capital reservado por bot en la misma cuenta.

## Qué agregar de Deriv Bot
El DBot oficial tiene bloques de análisis de ticks y velas, SMA, EMA, RSI, Bandas de Bollinger y MACD, y secuencias de condiciones de compra/reinicio/venta.
- Integrar indicadores adicionales solo en modo sombra y comparar con los filtros propios mediante validación cronológica y pagos.
- **No importar progresiones de Martingale/D'Alembert/Oscar's Grind como prueba de precisión**: solo modifican el importe de la apuesta o la secuencia de salida; no predicen el mercado.
- Fuente: https://deriv.com/es/trading-platforms/deriv-bot y https://blog.deriv.com/es/blog/how-to-use-technical-analysis-tools-on-derivs-trading-bot

## Estado operativo
A puede iniciar solo en el PC tras autorización expresa del dueño. B/C/D no compran. No existen cuatro cuentas operativas con $100 de capital asignado en Deriv. Primero probar CI Windows/Linux, incluir el zip de Windows con versión +0.1, y verificar que esté instalado; no correr el programa desde GitHub Actions.
