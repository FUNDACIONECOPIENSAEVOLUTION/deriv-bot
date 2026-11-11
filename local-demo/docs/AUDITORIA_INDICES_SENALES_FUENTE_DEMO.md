# Auditoria de símbolos, datos y señales PRE-BUY (PC DEMO)

## Síntesis del hallazgo
La selección automática de `pc-local` usaba antes `discoverVolatilitySymbols(active_symbols)` sin una autorización explícita del universo permitido. Esto podía incluir índices 1HZ15V, 1HZ90V, R_20, R_500 o los que Deriv anuncie, aunque la investigación principal de la fundación estuviera concentrada en índices 10, 25, 50, 75 y 100. Que el proveedor anuncie el mercado no significa que sea deseable ni rentable; **no se detectó que un tick de R_20 se etiquetara como R_10**. El riesgo concreto era seleccionar otro índice legítimo fuera de la lista objetivo.

## Cambios
1. **Catálogo autorizado**: `authorizeVolatilitySymbols` intersecta lo anunciado por Deriv con el universo fijo `R_10/R_25/R_50/R_75/R_100` y `1HZ10V/1HZ25V/1HZ50V/1HZ75V/1HZ100V`. Se suscriben para operar únicamente los anunciados que estén en esa lista; el endpoint de auditoría muestra los excluidos. Si no hay símbolos del universo disponibles, no hay compras.
2. **Identidad de la fuente**: un histórico que declara un símbolo diferente del solicitado es rechazado (`HISTORY_SYMBOL_MISMATCH`). Ticks con `echo_req.ticks` discordante también se descartan. Se rechazan timestamps desordenados y filas históricas inválidas, en vez de omitir un tick y desplazar el horizonte de predicción.
3. **Reconexión**: al obtener nuevos símbolos oficiales después de una desconexión, se limpian ticks, época, precio, secuencia y marcas de tiempo antiguas. No se mezclan velas de dos sesiones. Ante duplicado idéntico de último tick (puede ocurrir al solaparse history y subscription) se ignora el replay y se cuenta en diagnóstico.
4. **Riesgo por duración**: el veto adaptativo temporal y el veto de pérdidas recientes se consultan separadamente por símbolo, dirección y `duration_ticks`. Un historial negativo de 10 ticks no debe bloquear por error la misma dirección a 5 ticks. La API de informe histórico general se mantiene descriptiva; **no** se utiliza para vetos de BUY sin separar horizonte.
5. **Auditoría visible**: `GET /api/market/selection-audit` presenta símbolos activos autorizados, símbolos anunciados excluidos, política de momentum/reversión elegida, dirección, decisiones de entrenamiento/validación, estatus exploratorio, veto, disponibilidad/frescura de datos y ticks duplicados.
6. **Seguridad**: sin credenciales ni datos personales en GitHub, sin cambios a `/ws/demo`, al permiso de compra, monto, stop diario o habilitación REAL. La corrección de universo puede ocasionar MENOS compras; no se prometen beneficios.

## Qué está calculando en realidad
`evaluateTickHorizons` evalúa de forma independiente horizontes de contratos de **5 y 10 ticks** con cinco políticas: `MOMENTUM_5`, `MOMENTUM_10`, `MOMENTUM_20`, `VOTE_5_10_20` y `REVERSION_5`. Las ventanas 5/10/20 son los ticks históricos usados por los predictores; no deben confundirse con la duración del contrato. Una política se selecciona con datos anteriores y se describe su acierto en una validación posterior, pero la reoptimización frecuente de ventanas solapadas **no demuestra ventaja futura**.

La señal `EMA20/EMA50/RSI14/ATR14` se calcula en velas de 10 ticks y aparece como contexto en el dashboard y telemetría. **El selector automático del motor 5/10** se basa en el modelo estadístico de ticks y no exige que EMA/RSI coincidan con él; eso no es un error de lectura, es el diseño actual. No fusionar ambas señales por intuición: se debe comprobar cada filtro prospectivamente contra los resultados netos.

Cada intención de compra DEMO conserva símbolo, duración y dirección. Antes del BUY se revalida cuenta DEMO, señal fresca, duración, cotización, payout y protección de riesgo. Contratos con estado UNKNOWN requieren conciliación oficial; no se reenvía BUY.

## Limitaciones de verificación
El repositorio y sus CI prueban la lógica con WebSocket simulado. La conexión pública muestra **símbolos anunciados**, no garantiza que `CALL/PUT` y la duración 5/10 estén disponibles para cada cuenta: hay que confirmar `contracts_for` y la propuesta del broker. La auditoría local valida lo observado por el PC, pero GitHub no permite confirmar su cotización o ejecución en vivo. No declarar que se eligió "el índice más rentable" solo por volatilidad nominal; Deriv destaca que los indicadores técnicos de Synthetic Volatility Indices pueden no predecir resultados.

Fuentes:
- https://developers.deriv.com/docs/data/active-symbols/
- https://developers.deriv.com/docs/data/contracts-for/
- https://developers.deriv.com/docs/data/ticks/
- https://developers.deriv.com/docs/data/ticks-history/
- https://deriv.com/markets/derived-indices/synthetic-indices
