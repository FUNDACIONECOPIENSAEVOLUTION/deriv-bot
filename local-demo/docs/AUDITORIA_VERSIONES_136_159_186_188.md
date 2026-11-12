# Auditoría v13.6 / v15.9 / v18.6 / v18.8 y defensa ante BUY incierto

**Fuente:** historial de compras/liquidaciones del panel local en v18.8, visto el 11-11-2026, y código original del repositorio GitHub. No se suben bases de datos, historial privado, tokens ni secretos. La tabla incluye solo versiones con datos guardados.

## Historial por versión: contratos oficiales SETTLED

| Versión | Liquidadas | Ganadas | % aciertos | Neto DEMO US$ |
|---|---:|---:|---:|---:|
| Sin versión | 50 | 30 | 60.00 | +3.11 |
| 13.6 | 60 | 38 | 63.33 | +5.75 |
| 13.7 | 100 | 55 | 55.00 | +3.72 |
| 13.8 | 68 | 32 | 47.06 | -7.62 |
| 14.4 | 100 | 42 | 42.00 | -20.72 |
| 15.5 | 20 | 10 | 50.00 | -1.20 |
| 15.8 | 20 | 10 | 50.00 | -1.20 |
| 15.9 | 165 | 91 | 55.15 | +6.50 |
| 16.0 | 10 | 5 | 50.00 | -0.56 |
| 16.1 | 293 | 153 | 52.22 | -3.66 |
| 16.4 | 100 | 45 | 45.00 | -15.24 |
| 16.9 | 11 | 6 | 54.55 | +0.28 |
| 17.0 | 5 | 3 | 60.00 | +0.64 |
| 17.4 | 112 | 58 | 51.79 | -2.86 |
| 17.5 | 32 | 14 | 43.75 | -5.10 |
| 17.7 | 28 | 12 | 42.86 | -5.36 |
| 17.8 | 71 | 27 | 38.03 | -16.96 |
| 18.0 | 50 | 24 | 48.00 | -5.42 |
| 18.4 | 65 | 32 | 49.23 | -3.92 |
| 18.5 | 26 | 9 | 34.62 | -7.05 |
| 18.6 | 82 | 46 | 56.10 | +1.78 |
| 18.8 | 55 | 20 | 36.36 | -13.99 |

**v15.9**: mayor beneficio neto observado entre las versiones con datos identificados: +US$6.50 en 165 contratos; no prueba ventaja estadística estable.

**v13.6**: mejor % de aciertos entre versiones con al menos 50 contratos: 63.33% en 60 liquidaciones y +US$5.75. La misma lógica EMA/RSI produjo resultados menos favorables en las versiones siguientes.

**v18.6**: 82 contratos, 46 ganadas (56.10%), +US$1.78. No tiene ventaja histórica contundente frente a v13.6, pero su sesión fue positiva.

**v18.8**: 55 contratos, 20 ganadas (36.36%) y -US$13.99. Sus últimas ocho tandas mostraban cinco del piloto solo 5 ticks (32 liquidadas, 11 ganadas, -US$8.39) y tres mixtas 5/10 ticks (23 liquidadas, 9 ganadas, -US$5.60). Cuatro compras recientes en 1HZ10V a 10 ticks perdieron -US$3.00 en conjunto.

## Qué calculaba cada modelo

**v13.6:** código verificable en commit `a200e87fe6f13043c0c00f708c7c3aa67e09f8e3`:
* 660 ticks históricos → 60 velas OHLC cerradas de 10 ticks;
* EMA20 > EMA50, RSI14 entre 52–68, pendiente de 10 velas positiva, momentum de 5 velas positivo, ATR14 mayor que cero para CALL;
* EMA20 < EMA50, RSI14 32–48, pendiente y momentum negativos para PUT;
* señal no obsoleta, cotización del broker y BUY DEMO confirmado. No existía el selector `tick-horizon-model.mjs` actual; no inventar política seleccionada retrospectivamente.

**v15.9:** código `d02f4cb95bfb0d331739455d2ccfc27da0f8f670`:
* incorporaba selección por 5 y 10 ticks sobre ticks públicos, políticas Momentum 5/10/20, voto 5/10/20 y reversión de 5 ticks;
* evaluación temporal 60/40 de muestras de entrenamiento/validación con ventanas disjuntas por horizonte, ranking por Wilson inferior, evaluación de propuesta del broker;
* modos de investigación con criterio exploratorio `observedValidationHitRate >=0.55`. El rendimiento real de esta versión no demuestra que una política particular fuera la ganadora: el resumen por versión no ofrece ese desglose.

**v18.6 y v18.8:** `demo-burst.mjs`, `demo-program.mjs`, `tick-horizon-model.mjs` y `market-analysis.mjs` conservan exactamente los mismos blobs SHA entre ambas versiones. Los cambios 18.6→18.8 añaden consultas MCP, centro de decisiones y métricas *walk-forward* y solo modifican la whitelist de revisión MCP en `demo-trading.mjs`. **No se encontró un cambio de algoritmo de señal o de criterios de compra en ese intervalo.** La pérdida 18.8 puede depender de muestra, modalidad elegida, mercado, dirección, precio, latencias u otros factores; no puede atribuirse causalmente a cambiar la etiqueta de versión.

## Órdenes UNKNOWN y diagnóstico
El panel v18.8 muestra 0 OPEN y 0 UNKNOWN pendientes en la fotografía consultada. **Eso no prueba que nunca hubo órdenes inciertas:** la tabla SQLite antigua guarda el estado ACTUAL, pero no todas sus transiciones. REJECTED no representa pérdida contractual.

Se detectó un defecto concreto en `demo-burst.mjs` pre-18.9: el `catch` de `purchase()` convertía cualquier excepción con intención creada en `REJECTED,brokerOrders:0` sin comprobar si SQLite ya tenía el estado `UNKNOWN`, `SENDING` u `OPEN`. Esto podía esconder el carácter incierto de una operación frente al programa (sin demostrar órdenes duplicadas). No debe repetirse BUY ante un ACK perdido. API Deriv: https://developers.deriv.com/docs/trading/proposal-open-contract/ ; sólo contratos identificables pueden conciliarse automáticamente. Para UNKNOWN sin contractId se requiere inspección independiente del broker.

## Corrección implementada (DEMO)
1. `demo-trading.mjs` expone un método **interno** de consulta SQLite `getOrderState`.
2. `demo-burst.mjs` consulta el estado después de una excepción. `SENDING/PREPARING/UNKNOWN` o estado indeterminado → reporte `UNKNOWN` y pausa inmediata, nunca `REJECTED` seguro ni reintento. `OPEN` y `SETTLED` preservan sus estados; `PENDING_APPROVAL` puede cancelarse si aún no hubo BUY.
3. **Cortacircuitos de tres pérdidas SETTLED consecutivas** en tandas de modo investigación, basado en liquidaciones oficiales por tanda. No modifica stakes ni suma pérdidas/rechazos inventados. Si se compraron varios contratos simultáneos, la protección actúa solo después de que esa ola finalice; para máximo control usar concurrencia 1.
4. Nueva API `GET /api/learning/version-execution-audit` y tabla del PC. Muestra n, aciertos, beneficio, ROI, errores de rechazo, UNKNOWN/OPEN actuales, y primera/segunda mitad por versión. Sin generar órdenes, sin REAL.
5. Pruebas simuladas: error posterior a BUY incierto conserva UNKNOWN; tres pérdidas cortan antes de 10; una victoria reinicia racha; informes excluyen rechazadas de ROI.

## Lectura prudente
El cortacircuitos solo pretende **reducir la pérdida máxima en secuencias adversas**, NO crear señales predictivas ni garantizar que aumente tasa de aciertos o ROI. Para promover un algoritmo como mejor se requieren resultados por índice/horizonte/política en muestras cronológicas futuras y precios ASK/payout oficiales. No subir más stake, perseguir pérdidas o activar REAL.
