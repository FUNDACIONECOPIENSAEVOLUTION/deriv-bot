# Laboratorio Deriv de cuatro estrategias con un solo panel Windows

## Fase entregada: supervisor de lectura (sin nuevos BUY)
`GET http://127.0.0.1:8765/api/lab/bots`: cuatro perfiles. El dashboard los muestra en el mismo lugar, refrescando datos sin conectarse a cuentas extra. Esto NO crea cuatro procesos independientes ni activa cuatro motores de órdenes.

| Bot | Mercado/contrato | Infraestructura actual | Estado |
|---|---|---|---|
| A | Digital Rise/Fall 5 y 10 ticks | Deriv Options DEMO actual; compras solo bajo autorización local | Histórico de liquidaciones y señales de ticks |
| B | Digits Differs/Parity/Over/Under | Un observador de ticks públicos (`digit-shadow.mjs`) | Investiga precisión, frecuencias y tasa direccional; no tiene P&L real |
| C | Multipliers Up/Down | Contratos y payouts de la API Options deben verificarse | Todavía sin motor, cotizaciones o BUY |
| D | CFD Buy/Sell (Forex, derivados, otros) | MT5 DEMO separado, terminal Windows + EA (MQL5) | Sin cuenta enlazada, sin margen, sin BUY |

**Importante:** la cuenta actual Opciones DEMO no es una cuenta MT5. MT5 requiere activarse por separado en Deriv Trader's Hub. La API de Opciones documentada no equivale a una API de ejecución MT5. Para el bot D podría emplearse un Expert Advisor en el terminal MT5 de escritorio y un adaptador local de solo lectura para resultados inicialmente. No insertar claves de MT5 en repositorios ni en la UI web.

## Presupuesto US$100 por bot
- US$100 es **asignación prevista de riesgo para un experimento futuro**, NO una subcuenta ni dinero automáticamente reservado.
- En esta fase `budgetFunded=false`, `budgetEnforced=false`, `parallelBuyEnabled=false`.
- Las liquidaciones históricas A se rotulan como `ALL_HISTORICAL_OPTIONS_DEMO_TRADES_NOT_A_NEW_100USD_BUDGET`: **no atribuir** ese neto a 100 USD ni interpretarlo como crecimiento por bot.
- El motor B no registra compra ni cotización contractual: su `paperPnlUsd` debe ser `null`, no US$0 o ganancias simuladas.
- En el desarrollo futuro, cada bot tendrá un ledger inmutable con `studyId, botId, accountId, brokerContractId, reservedStake, realizedPnL, openExposure, currency, period`; el gestor verificará **atómicamente** riesgo por bot y por cuenta en cada intención y antes del envío. El registro del broker es la fuente para liquidaciones.

## Propuesta de pruebas justas
1. Deriv `active_symbols`, `contracts_for` y `proposal` determinan contratos y payout para cada instrumento. No inventar disponibilidad ni tarifas por histórico.
2. Mismo período de observación, mismo criterio de riesgo inicial de US$100, mismo máximo de pérdida por bot previamente establecido y control por cuenta. Registrar propuesta, fill, resultado del broker, costos y latencia.
3. Reportar ROI neto real, drawdown, profit factor, muestra, costo por trade, win rate y porcentaje de tiempo con órdenes; separar P&L DEMO de estimaciones shadow.
4. En opciones con pago fijo `p_min=ask_price/payout`, no simplemente tasa de acierto. Multipliers y CFD se puntúan por P&L realizado tras comisiones, spreads y costes, además del riesgo de ruina.
5. Validación cronológica train/validation/holdout más semanas de ejecución DEMO prospectiva. No liberar estrategias o aumentar apuestas porque un periodo aislado consiguió 60-90 %.
6. Interfaz: panel único puede mostrar cuatro bots, pero solo si están conectados. Observación simultánea no implica BUY simultáneos.

## Seguridad indispensable para 4 ejecutores en fase posterior
- Real trading OFF. Controles por cuenta y por bot, no duplicar compra si se perdió ACK. Circuit breaker global por pérdida y órdenes OPEN/UNKNOWN.
- No autorizar ejecución de 4 bots mediante el mismo botón de tanda existente: la autorización debe detallar perfiles, número máximo de compras, exposición y caducidad.
- Balance real del broker no equivale a 4 presupuestos: reserva transaccional de exposición para evitar carreras.
- CFD: no asumir que stop loss limita pérdidas máximas bajo huecos de mercado, spread, deslizamiento o apalancamiento. Incluir margen libre y riesgo de margin call.
- Mantener los datos locales `local-demo/data/` fuera de GitHub, credenciales cifradas y actualización segura al cerrar todas las posiciones.

## Fuentes oficiales
- https://deriv.com/options
- https://deriv.com/trading-platforms/mt5/mt5-demo-account
- https://deriv.com/terms-and-conditions/trading-terms
- https://developers.deriv.com/docs/intro/api-overview/
- https://developers.deriv.com/docs/data/contracts-for/

La fase actual solamente habilita la visualización conjunta y la planificación; no promete que un tipo de contrato sea el más rentable sin pruebas.
