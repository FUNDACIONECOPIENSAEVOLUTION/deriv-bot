# Investigación ECOPIENSA-EXPLICA v1 · matemática del resultado DEMO

## Alcance, pruebas y límites de los archivos

Se analizan **DOS snapshots del MISMO historial** (no sumar las filas duplicadas):
* `ecopiensa-historial-demo(8).csv`: 1725 registros, 1146 SETTLED, 579 REJECTED, último intento 2026-11-09 23:58:26.200 UTC.
* `ecopiensa-historial-demo (1).csv`: 2056 registros, 1360 SETTLED, 695 REJECTED, 1 CANCELLED, hasta 2026-11-11 17:02:23.006 UTC; contiene los 1725 anteriores más **331** nuevos, 214 SETTLED, 116 REJECTED, 1 CANCELLED.
No se subieron los CSV ni secretos al repositorio. El análisis externo se realizó en un entorno local desconectado de Deriv. Estos archivos terminan en v18.4; los resultados posteriores v18.6/v18.8 se leen en el panel del PC y no deben confundirse con este corte.

### Ecuación A: resultado DIRECCIONAL posterior, no predictor

Sean `d = +1` si contrato CALL y `d = -1` si PUT; `x_entrada` y `x_salida` los spots **del contrato**:

`m = d × (x_salida - x_entrada)`.

`m>0`: movimiento favorable al contrato; `m<0`: movimiento contrario, a igualdad de demás condiciones contractuales. **1351/1351** contratos del CSV con ambos spots y PnL completo coincidieron entre `m>0` y `pnlCents>0`. Los 9 sin ambos spots NO se declararon acierto ni error del signo. Esta fórmula explica un resultado conocido ex post; no predice `x_salida` antes del BUY.

Para separar movimiento entre señal y compra: `d*(x_entrada - x_cotización_de_señal)`. Entre 1351 observaciones, 707 movimientos previos fueron en dirección de la compra, 637 en contra, 7 sin cambio. **No demuestra causalidad de latencia** ni permite declarar que el precio de entrada fue «malo»; el 52.3 % en dirección de compra no implica más pérdidas automáticamente.

### Ecuación B: expectativa económica

Con `A` precio ASK/importe pagado, `P` pago TOTAL en caso de ganar y `p` probabilidad estimada de acierto:

`EV = p*(P-A) - (1-p)*A = p*P - A`.

Una entrada solo tendría EV positivo si `p>A/P`. Este cálculo exige el payout ACTUAL del broker, no un ejemplo fijo.

Si las ganancias/losses cambian según stake, una explicación histórica agregada es:
`EV_bar = (W/n)*avgWin - (L/n)*avgLoss`
y `p_break_historico = avgLoss/(avgWin+avgLoss)`.

En 1360 liquidaciones: W=687, L=673, win rate 50.51 %, bruto positivo US$549.23, bruto negativo US$619.05, neto −US$69.82, ROI −5.63 % sobre US$1239.30 comprados. Ganancia media US$0.7995, pérdida media US$0.9198, acierto de equilibrio histórico 53.50 %, EV real promedio −US$0.0513/contrato. Esta igualdad es contabilidad, no predicción.

### Ecuación C: medir si un indicador tiene valor FUERA de entrenamiento

Se definió ANTES de la nueva muestra el umbral `signalStrength>55`. Primera muestra: 571 liquidaciones con fuerza alta, 317 aciertos (55.52 %) y +US$20.61; fuerza ≤55: 574, 275 (47.91 %), −US$58.27. En las **214 operaciones posteriores**: fuerza alta: 100 liquidaciones, 49 ganadas (49 %), −US$9.30; fuerza ≤55: 114 liquidaciones, 46 ganadas (40.35 %), −US$22.36.

La fuerza alta sigue siendo una posible variable correlativa, **PERO NO CONVALIDA LA RENTABILIDAD**: 49 % y ROI −12.83 % sobre US$72.50 cuando se probó después. Límite inferior Wilson 95 % sobre 49/100: ~39.42 %; sobre 317/571 ~51.42 %. Ninguno supera el 53.50 % de referencia histórica.

Para evaluar una probabilidad de ganar `p_hat_i`, Brier `BS = sum((p_hat_i - y_i)^2)/n`. `y_i=1` solo cuando liquidación positiva. Regresiones logísticas penalizadas (C=0.1) entrenadas en las primeras 1146 liquidaciones y evaluadas en las 214 posteriores:

| Diagnóstico fijo | Brier posterior | AUC posterior |
|---|---:|---:|
| Base tasa histórica (51.66 %) | 0.25213 | N/D |
| Fuerza, RSI, separación EMA/ATR, momentum | 0.25575 | 0.4871 |
| Anteriores + índice, dirección, horizonte y política | 0.25631 | 0.4902 |
| Anteriores + frescura señal, cinco ticks y quote edge | 0.25836 | 0.4782 |

**Ninguno mejora la referencia**. Mayor número de parámetros no garantiza ventaja. Los índices synthetic son RNG de Deriv y, excepto ciertos contratos como Range Break, no deberían considerarse predecibles con indicadores tradicionales sin prueba prospectiva.

### Ecuación D: el estado de BUY NO es una señal

`UNKNOWN` significa ACK perdido o incompleto y **no identifica la dirección correcta**. En los dos CSV de 80 columnas hay 0 filas UNKNOWN, por lo que NO es posible ajustar (P(UNKNOWN|latencia)) ni etiquetar las compras pasadas que ya fueron conciliadas.

Estados:
* `REJECTED`: no hubo compra confirmada (695 en CSV completo). Desglosado: `DEMO_SIGNAL_STALE_OR_CONTRARY` 385, `DEMO_QUOTE_STALE` 305, `DEMO_EXPLORATORY_NO_OBSERVED_EDGE` 4, `DERIV_HTTP_503` 1.
* `UNKNOWN` o `SENDING` sin respuesta: cotejar **statement / portfolio / contract_id** con cuenta DEMO autenticada, sin reenviar BUY. Conserva pausa hasta aclarar.
* `OPEN`: contrato confirmado pero liquidación pendiente; no asumir perdida.
* `SETTLED`: leer PnL oficial, spot de entrada/salida, liquidación y verificar ecuación A.

Referencia oficial sobre reconciliar BUY sin ACK: https://developers.deriv.com/docs/best-practices/ y https://developers.deriv.com/docs/account/statement/ . No inferir pérdida desde la falta de red.

## Implementación PC

Módulo puro `local-demo/math-explainability.mjs`, ruta **solo lectura** `GET /api/learning/math-explanation` y tabla en localhost. El informe se recalcula usando TODOS los registros locales, y muestra las 12 últimas liquidaciones con movimiento REAL observado y diagnóstico ex post.

El panel informa rentabilidad agregada, equilibrio económico, coincidencia del signo, errores de cotización/compra, UNKNOWN actuales y validación temporal fija del umbral 55 con cutoff del CSV viejo. Si no hay muestra suficiente muestra N/D: no inventa probabilidades ni recomienda BUY. Sin cambios al selector, stake, frecuencia, cuenta REAL, autorización MCP o botones de compra.

## Investigaciones siguientes sin sobreajuste
* Capturar historial de transiciones de estado, no solo estado final; marcar hora e identificador idempotente de cada BUY.
* Registrar predicciones prospectivas de todos los índices, incluidas las ocasiones en las que el bot ABSTIENE, con timestamps previos a la entrada y cotizaciones ASK/PAYOUT oficiales.
* Evaluar 5 vs 10 ticks con ventanas cronológicas bloqueadas y separadas, Brier y EV, y comparación con baseline fijo.
* Antes de cambiar política: suficientes muestras independientes en mercado/horizonte, intervalos de confianza después de múltiples comparaciones, y P&L broker medido. No cambiar pesos de retroprueba para proclamar mejora.

### Fuentes públicas consultadas
* https://deriv.com/markets/derived-indices/synthetic-indices
* https://www.itl.nist.gov/div898/handbook/prc/section2/prc241.htm
* https://scikit-learn.org/stable/modules/calibration.html
* https://scikit-learn.org/stable/modules/generated/sklearn.model_selection.TimeSeriesSplit
* https://developers.deriv.com/docs/account/statement/
* https://developers.deriv.com/docs/trading/proposal-open-contract/
