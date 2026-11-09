# Ecopiensa DEMO — Contexto OHLC de 20 velas en cada BUY

## Para qué sirve
La versión de la estrategia `EMA20_EMA50_RSI14_ATR14_OHLC10_V1` utiliza EMAs de velas de diez ticks. Los contratos Rise/Fall vencen en **cinco ticks**; por tanto, el contexto de la tendencia grande no garantiza la dirección de los próximos cinco ticks. Las series antiguas guardaban una única vela y no permiten reconstruir con certeza 20 velas antes de cada compra.

## Qué se registra
`candle_context_json` en SQLite incluye: exactamente **20 velas OHLC COMPLETAS** anteriores al envío de BUY (diez ticks por vela), epoch de cierre, precio/tick visto, hora de captura, últimos 30 precios tick conocidos en el momento de captura, EMA20/EMA50/RSI14/ATR14, impulso de cinco ticks, RSI de ticks y clasificación de patrones. **No** se guarda ninguna vela futura, resultado de contrato ni etiqueta de victoria en esta huella ex-ante. La liquidación entra en los campos de resultado existentes solamente al confirmar el broker.

El campo `candle_context_captured_ms` se crea antes de la petición WebSocket BUY. Los registros pasados permanecen intactos, con contexto nulo si la versión no lo capturó. No se inventan series históricas con la última vela.

## Patrones iniciales
- Tendencia de las últimas cinco velas cerradas: alza, baja o lateral, normalizada con ATR.
- Dirección de las últimas tres velas, relación cuerpo/rango, mechas, posición del último cierre.
- Configuración: `CONTINUATION`, `PULLBACK`, `DOJI` o `MIXED`.
- Alineación del CALL/PUT elegido con la tendencia anterior.
- La clasificación no equivale a una probabilidad de acierto.

## Entrenamiento y evaluación
`evaluateCandlePatterns` agrupa por **dirección + alineación con tendencia + configuración** y actualiza conteos probabilísticos con suavizado Beta. Solo usa una etiqueta cuando el contrato se ha liquidado antes de la siguiente compra. Evita contabilizar dos contratos mismo símbolo/dirección/vela como dos decisiones independientes. Evalúa predicciones **prequential**, segmentadas en bloques cronológicos de veinte observaciones posteriores, y compara el error Brier con las referencias histórica y neutral 0,5.

El modo `CANDLE_PATTERN_SHADOW_TRAINING` **no altera CALL/PUT**, no incrementa apuestas ni activa REAL. Aunque las tres referencias parezcan favorables, se informa evidencia preliminar, no un permiso de operación. Antes de activar un veto de patrones se necesitan más muestras independientes por símbolo, una evaluación realista del payout/costos y pruebas fuera de muestra fijadas por adelantado.

## Consultas
- `GET http://127.0.0.1:8765/api/learning/candle-patterns` — cobertura de velas, patrones, aciertos, P&L y Brier.
- `GET http://127.0.0.1:8765/api/learning/candles.csv` — una fila por vela y contrato, con `candlePosition` 1–20 y resultado del contrato ya liquidado.
- MCP local read-only `get_candle_pattern_validation`.

El histórico previo sin secuencia completa **no puede** reconstruir retrospectivamente la señal exacta ni los ticks de la expiración solo a partir de la última vela. Para analizar errores de v13.6/v14.4, usar los datos oficiales disponibles sin atribuirles información no registrada.

## Huella individual de ticks (siguiente version)

Cada contexto nuevo conserva hasta **90** precios tick individuales
anteriores al BUY (`lastTickPrices`) en lugar de 30, junto a
`lastTickEpochs` cuando los proporciona el flujo publico y
`lastLiveTickSeq` para estudiar si se perdieron ticks al reconectar.
Conserva aparte las 20 velas OHLC cerradas. Los ticks nunca constituyen
una prediccion conocida del futuro: sirven para entrenar/validar
causalmente modelos de 5 y 10 ticks con las liquidaciones posteriores.
Los registros anteriores de 30 ticks se mantienen sin modificar;
los epoch ausentes no se fabrican.
