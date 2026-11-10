# Investigacion de microestructura de ticks (modo sombra)

## Proposito
El registro de 1.725 intentos DEMO muestra demora de aproximadamente 1.5 s desde intencion hasta BUY, mas ~0.6 s de seleccion a intencion en las 768 compras con esa telemetria. Esto no prueba que la latencia *cause* el resultado negativo: la perdida media y la calidad de la senal tambien importan.

La media real de analisis es ~0.29 ms: cambiar JS por Rust o Python no eliminaria el cuello de red observado. La conexion OTP + WebSocket se crea de nuevo por compra. La proxima optimizacion debe evaluar una conexion DEMO persistente con reconexion segura, autenticacion por cuenta y conciliacion de contratos.

## Medicion ER de Kaufman y alineacion

`computeTickMicrostructure(prices)` calcula usando **solamente 11 precios ya recibidos**:
- `efficiencyRatio`: cambio neto absoluto de los ultimos 10 ticks, dividido por la suma de sus cambios absolutos; pertenece a [0,1].
- `direction`: signo del cambio entre primer y ultimo tick en esa ventana.
- `alignmentCount`: numero (0-4) de los ultimos 4 movimientos en la misma direccion del cambio neto de 10 ticks.
- `reversals`: reversiones entre cambios de signo no nulo.
- `meanAbsoluteMove`: cambio absoluto medio por tick.
- `researchOnly: true`, `usedFutureTicks: false` siempre.

`GET /api/markets` y los eventos de mercado ya incluyen el resultado bajo `microstructure`, porque surge del analizador existente.

Si se ejecutan compras **autorizadas** en cuenta DEMO, su huella `candle_context_json` guarda una copia de estas metricas **antes del BUY**, junto con las 20 velas cerradas. Los contratos antiguos permanecen sin esta informacion, no se reconstruye historico ficticio.

## Reglas que NO se implementan como BUY

No se incorpora el supuesto filtro `ER >= 0.42`, `RSI 52-68`, `signalStrength >= 62` o `signalAge <= 200 ms` directamente a la compra. Son umbrales posseleccionados a partir del mismo historial y su resultado puede deteriorarse fuera de muestra.

El CSV demuestra por ejemplo:
- Filtro `signalStrength > 55` en el primer 70%: 57.5% de acierto, neto +US$28.41.
- Ultimo 30%: 50.88% de acierto, neto -US$7.80.
- En compras exploratorias, `SIN_CONSENSO` (analizador de velas) no es igual a ausencia de direccion de tick: 637 operaciones, 52.43% acierto, -US$5.94; las 128 operaciones con consenso fueron 46.09%, -US$17.24.

Para validar umbrales propuestos hay que capturar prospectivamente **todas** las oportunidades observadas, ejecutadas y no ejecutadas, la cuota de cada oportunidad y el resultado del mercado, sin pedirle al modelo que complete 10 compras a toda costa. No inferir P&L de una orden que nunca se envió a Deriv.

## Seguridad

- No cambia politica `CALL/PUT`, stake, consentimiento local ni compras DEMO/REAL.
- No abre nuevos sockets ni envia ordenes.
- REAL sigue bloqueada; tokens siguen en almacenamiento local privado.
- No cambiar datos privados `local-demo/data/`.
- Pruebas: `node --test local-demo/test/tick-microstructure.test.mjs` desde la raiz del repositorio.

## Referencias tecnicas
- Deriv `ticks_history`: https://developers.deriv.com/docs/data/ticks-history/
- Deriv `buy`: https://developers.deriv.com/docs/trading/buy/
- Advertencias de indicadores en sinteticos: https://deriv.com/markets/derived-indices/synthetic-indices

**No usar Direct Buy aun:** aunque Deriv permite `buy:'1'`, la New API exige `parameters.underlying_symbol` y el flujo actual necesita la cuota `proposal` para comprobar el edge estimado. Un salto menos no garantiza que se mantenga la proteccion de precio/payout.
