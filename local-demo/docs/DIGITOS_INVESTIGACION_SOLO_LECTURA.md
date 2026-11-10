# Motor de investigación de dígitos (solo observación pública)

## Propósito y límites

Estudiar los contratos de dígitos de Deriv sin ejecutar operaciones ni tocar las rutas de autorización DEMO/REAL. El motor `local-demo/digit-shadow.mjs` no consulta cuentas, no solicita `proposal`, no envía `buy` y no escribe órdenes en SQLite.

Ruta de lectura en Windows: `GET http://127.0.0.1:8765/api/learning/digits`.

## Entrada y exactitud del último dígito

La API oficial `ticks` incluye `pip_size`: hay que formatear cada cotización con **esa precisión recibida del broker**, no inferir el último dígito de una representación numérica con ceros finales omitidos. El adaptador `decodePublicTick` conserva `pipSize` si existe y es válido; de lo contrario no se actualiza el estudio de dígitos.

Este módulo **solo usa los ticks nuevos del flujo público**, no intenta reconstruir dígitos de las 660 cotizaciones históricas sin precisión garantizada. El histórico de compras DEMO existente no permite calcular resultados correctos de todas las estrategias de dígitos.

## Observación prequential causal

Tras **30 o más ticks públicos válidos** de un índice:
1. Antes de llegar el próximo tick, registra una predicción usando hasta 50 dígitos anteriores.
2. Para `DIGITDIFF`, elige el dígito menos frecuente de la ventana pasada (hipótesis exploratoria, NO ventaja probada).
3. Para `DIGITPARITY`, elige EVEN u ODD según la mayoría previa (hipótesis exploratoria).
4. `DIGITOVER2` y `DIGITUNDER7` usan barrera fija 2 o 7 y una probabilidad de referencia del 70 % **si los diez dígitos son uniformes**.
5. Cuando llega el siguiente tick, evalúa el resultado de la predicción anterior **antes** de añadir el dígito observado al historial.
6. Ante pérdida de la conexión, salto en secuencia o cambio de precisión, invalida predicciones pendientes. Las observaciones no se sincronizan con el contrato comprado; este estudio no incluye latencia real de entrada.

La API de solo lectura devuelve por símbolo:
- Número de ticks nuevos recibidos, frecuencia reciente de cada dígito, muestras evaluadas.
- Aciertos de `DIGITDIFF`, `DIGITPARITY`, `DIGITOVER2`, `DIGITUNDER7`.
- Intervalos Wilson 95 % de proporción de aciertos y probabilidades nominales bajo el supuesto de uniformidad.
- Contadores de interrupciones, datos inválidos y muestras disponibles.

## Rentabilidad y cotizaciones

Un porcentaje alto NO significa retorno alto:
- `DIGITDIFF` bajo uniformidad puede acertar `9/10`, pero su pago neto suele ser pequeño; hay que obtener `ask_price` y `payout` oficiales para cada símbolo, barrera y duración.
- Punto de equilibrio: `p_min=ask_price/payout`. Con `ask=1`, `payout=1.12`, se necesita `p>0.892857`. El resultado esperado por dólar sería `p * payout / ask - 1`.
- `DIGITPARITY` se compara con 50 % y `DIGITOVER2` / `DIGITUNDER7` con 70 % en ausencia de sesgo.
- La tasa de acierto es medida descriptiva de un horizonte de **un tick**. No sustituye el backtest con entrada real, cuotas auténticas, rechazo, latencia ni condiciones de disponibilidad.

La cantidad de estrellas de proyectos comunitarios como ORSTAC o Free-Dbots no valida el resultado económico de sus estrategias. No utilizar algoritmos terceros con credenciales de la Fundación sin auditoría.

## Seguridad y próximas fases

No activar operaciones por dígitos. Después de suficientes observaciones nuevas, dividir investigación por símbolo y grupos cronológicos (train/validation/holdout) y capturar propuestas oficiales de precio en modo lectura **sin** BUY. Determinar si los pagos observados permiten un EV positivo **fuera de muestra**, incluyendo prueba de cambios de régimen, múltiples hipótesis y atrasos.

Referencias:
- https://developers.deriv.com/docs/data/ticks/
- https://developers.deriv.com/comparison/ticks/
- https://developers.deriv.com/docs/trading/proposal/
- https://legacy-docs.deriv.com/docs/digit-matchesdiffers
- https://deriv.com/markets/derived-indices/synthetic-indices

**Estado:** fase de instrumentación de ticks de solo lectura; no se hace ninguna promesa de 60 %, 70 % o 90 % sostenido, ni de beneficio.
