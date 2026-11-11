# Deriv: investigación crítica de prácticas de YouTube y resultados por índice

**Fase implementada:** comparador en sombra PREQUENTIAL, solo lectura, sin BUY, sin uso de cuentas, sin ganancias ficticias. Archivo `strategy-comparison-shadow.mjs` y `GET http://localhost:8765/api/learning/strategy-comparison`.

## Fuentes evaluadas (11 noviembre 2026)

| Fuente | Idea propuesta | Qué se puede implementar | Límites |
|---|---|---|---|
| YouTube, Abioye Israel Pelumi, "Proven Trading Strategy for Synthetic Indices Volatility 10 & 25 Index" (22 ago 2024): https://www.youtube.com/watch?v=pT-11M4pseQ | Indicadores, reglas y backtesting V10/V25 | Reglas explícitas y validación temporal independiente por índice | La descripción no proporciona muestra auditada, contratos 5/10 ticks, payout ni acceso a resultados verificables. |
| YouTube, "Volatility 100 index Rise Fall ... MACD indicator 95%" (1 nov 2022): https://www.youtube.com/watch?v=oV4cCRNibyE | Señal MACD, claims de alta tasa y progresión de apuestas | MACD como comparador estadístico | Título 95% NO probado de forma independiente; descripción promociona Martingale. No copiar apuestas crecientes. |
| YouTube, Bharat Jhunjhunwala, "Bollinger Bands + RSI" (31 jul 2025): https://www.youtube.com/watch?v=7vFYOcObk9M | Cruce de volatilidad/momentum, compresión y cambios RSI | Bollinger20 y RSI14 como hipótesis separadas | Los ejemplos son de acciones/cripto/divisas; NO se demuestra que funcionen en RNG de Deriv a 5/10 ticks. |
| Deriv Blog, bloques DBot: https://blog.deriv.com/blog/how-to-use-technical-analysis-tools-on-derivs-trading-bot | SMA, EMA, Bollinger, RSI, MACD | Indicadores calculados de forma reproducible para puntuar | Indicador técnico no equivale a probabilidad calibrada. |
| Expertos Deriv, Aleksandrs Popovs, 24 sept 2026: https://experts.deriv.com/es/insights/the-indicators-that-dont-work-on-derived-indices | Series de volatilidad RNG no tienen tendencia intrínseca; MACD/RSI pueden ser ruido | Base de comparación con referencia azar y métricas separadas | No probar trading rentable solo por señales visuales. |
| Deriv Academy, diferencias de índices: https://traders-academy.deriv.com/es/trading-guides/guide-to-understanding-volatility-indices | V10/V25 menos fluctuación, V100 mayor movimiento, 1s vs 2s | Separar índice y frecuencia, normalizar retorno y eficiencia | Un índice más volátil NO tiene mayor probabilidad de acertar CALL o PUT. |

## Resultados históricos locales analizados (archivo proporcionado, 1725 filas)

Filtrando solo 1146 compras **SETTLED** y convirtiendo correctamente importes `_-100`, el total es **-US$38.16**. No confundir 579 REJECTED con compras perdidas. Algunos índices antes admitidos dinámicamente ahora están excluidos del selector de BUY, pero pueden seguir en el estudio público.

| Índice | Compras SETTLED | Acierto | Neto DEMO | Último 30% cronológico |
|---|---:|---:|---:|---:|
| 1HZ10V | 128 | 56.25% | +US$7.43 | +US$0.90 |
| 1HZ100V | 136 | 54.41% | +US$5.90 | +US$1.90 |
| 1HZ50V | 149 | 55.03% | +US$3.20 | +US$0.12 |
| 1HZ25V | 126 | 51.59% | -US$5.32 | -US$8.30 |
| 1HZ75V | 166 | 52.41% | -US$3.31 | -US$3.00 |
| 1HZ30V | 153 | 50.98% | -US$7.82 | -US$7.40 |
| 1HZ15V | 109 | 46.79% | -US$12.32 | -US$2.86 |
| 1HZ90V | 95 | 47.37% | -US$14.62 | -US$15.84 |
| R_20 | 0 | No hay muestra | N/D | N/D |

**Advertencia**: los últimos porcentajes no son holdout virgen tras inspeccionar/prefijar índices; hay selección múltiple, sesgo de compras elegidas y cambios de versión. Un resultado positivo no da licencia para operar o añadir apuestas.

## Experimento causal integrado

**No copiar videos directamente al selector de compras**. En su lugar, cada símbolo público observado mantiene un buffer de hasta 240 ticks recientes. Cada 600 ticks (con al menos 60 previos), se registran **sin utilizar datos futuros** hasta seis señales:
- `MOMENTUM_10`: dirección del último cambio acumulado de 10 ticks.
- `EMA_8_21`: signo de la diferencia de medias exponenciales de 8 y 21 ticks.
- `MACD_12_26_9`: diferencia de MACD y su línea de señal de 9, calculada con precios pasados.
- `RSI14_REVERSAL`: contraria al impulso con RSI <=30 o >=70.
- `BOLLINGER20_REVERSAL`: contraria cuando el último precio supera una banda de dos desviaciones.
- `ER10_TREND`: momentum10 si eficiencia de Kaufman 10 >=0.55.

Cada predicción se evalúa exactamente **cinco** y **diez** ticks después, solo cuando la secuencia pública no tiene saltos; se guardan símbolo, régimen de eficiencia direccional, horizonte, señal anterior, resultados favorables, empates y precios de entrada/salida observados, en **SQLite del PC**, no GitHub. Las muestras de un mismo horizonte no se superponen por diseño; distintas políticas siguen correlacionadas al compartir tick.

No se autoriza BUY; no hay `ask_price`, payout ni contrato real en las predicciones sombra. Por tanto no se calcula ROI ni ganancia para ellas. Los empates se registran aparte (una cotización igual no equivale necesariamente a un contrato ganador). El histórico previo de compras DEMO no se importa falsamente como resultado del experimento.

### Investigación de R_20 y otros símbolos
`active_symbols` verifica qué símbolos están anunciados. Los diez índices previamente autorizados para CALL/PUT se mantienen **sin cambios** para compras. Si Deriv anuncia `R_20`, `1HZ20V`, `1HZ30V`, `1HZ15V` o `1HZ90V`, el servidor puede subscribir hasta cuatro índices adicionales **solo** en el comparador en sombra, sin introducirlos en `SYMBOLS` del motor de trading. Si R_20 no aparece, no se inventan precios ni resultados.

## Próximo umbral de evidencia antes de habilitar reglas nuevas

1. Congelar parámetros y medir por separado cada símbolo, horizonte, política, régimen y cuota de acierto; exigir al menos 200-300 resultados prospectivos por candidato, idealmente más.
2. Prueba cronológica de validación, posteriormente un holdout nuevo sin reoptimizar el período de prueba. Descontar pruebas múltiples y dependencia entre reglas/símbolos.
3. Obtener contratos disponibles con `contracts_for` y `proposal` oficiales. Calcular `EV=p * payout - stake` en unidades monetarias equivalentes, tras latencia y ejecución real; no usar solo win rate.
4. Medir riesgo por contrato, máximo drawdown y P&L DEMO oficial; límites por cuenta y stop global prevalecen.
5. No utilizar martingala, apuestas crecientes, compra REAL o acceso no autorizado. No entrenar una política con resultados producidos después de su fecha de decisión.

**Estado:** observador de referencia, no sistema predictivo certificado ni una promesa de beneficio diario.
