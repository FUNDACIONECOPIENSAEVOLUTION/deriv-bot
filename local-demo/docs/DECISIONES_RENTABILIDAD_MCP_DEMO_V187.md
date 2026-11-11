# Ecopiensa Deriv v18.7 · Centro de decisiones y MCP seguro (DEMO exclusivamente)

## Evidencia leída en el panel local del PC (11-11-2026)
El usuario tiene la v18.6 abierta en Chrome; se pudo LEER el contenido de la pestaña. Esta lectura NO otorga acceso a POST sobre `localhost`, a los datos SQLite binarios, al Bearer MCP ni a la cuenta Deriv.

* v18.6: **82 compras liquidadas**, **46 ganadas**, **36 perdidas**, **56.10 % de acierto**, **+US$1.78** de ganancia DEMO. 12 tandas visibles: 66 liquidadas, 38 ganadas, 28 pérdidas y +US$2.50 (7 tandas en verde +US$9.99; 5 rojas −US$7.49).
* Sin contrato del nuevo botón microíndice: `state=NOT_STARTED`, 0 brokerOrders; el estudio pareado 20x10 registra `INTERRUPTED`, 25 evaluaciones observadas y 0 BUY. Ninguna estadística nueva se atribuye a la estrategia micro de diez centavos.
* 5 ticks (acumulado multiversión): 509 SETTLED, 260 ganados (51.08 %), **−US$20.66**. 10 ticks: 581 SETTLED, 285 ganados (49.05 %), **−US$38.67**. 378 sin etiqueta de horizonte: 197 ganadas (52.12 %), −US$15.76. Comparación confusa sin igualar fechas, precios, stake y selección.
* Shadow multipolítica: 6743 etiquetas direccionales guardadas (cuenta no equivale a contratos). De 180 filas visibles: modelo de tick actual 167/298 (56.04 %), RSI14 reversal 254/461 (55.10 %), Bollinger 105/204 (51.47 %), consenso v13.6+actual 18/35 (51.43 %), v13.6 clásica 104/211 (49.29 %), EMA8/21 822/1733 (47.43 %), MACD 820/1733 (47.32 %), Momentum10 800/1727 (46.32 %). **Mismas ventanas/horizontes entre políticas, correlacionadas; NO sumar porcentajes como si fueran muestras distintas.** Sin Ask/payout ni liquidación, ROI = N/D para todas las políticas shadow.
* Observador de oportunidades: **2206 señales elegidas** acertaron 1083 (49.1 %); **2835 no elegidas** acertaron 1420 (50.1 %). No demuestra que la política de selección sea mejor que omitirla.
* Walk-forward Brier modelo 0.2524 vs referencia 0.2500, peor; las señales aún no superan de manera consistente una base neutral.

## Cambios del código

* `learning-profitability.mjs` mantiene los resultados originales y añade segmentaciones **marketHorizon**, **policyHorizon**, **marketHorizonDirection**, **marketHorizonPolicyDirection**, incluyendo ventanas 70 % train/30 % holdout *cronológicas*; sólo contratos `SETTLED`. Rechazos y shadow no se convierten en pérdidas.
* `demo-decision-desk.mjs`: cruza `buildProfitabilityResearch`, `getSignalSelectionAudit`, `strategyShadow.status()` y riesgo de la cuenta. Calcula rankings de candidatas de los diez índices **autorizados**, por dirección/horizonte/política. Expone n, win rate, ROI/P&L, prueba temporal, elegibilidad de señal, frescura, veto y razones. Las cotizaciones oficiales no se han solicitado en esta tabla, de modo que `eligibleToBuyNow=0`. Incluso un grupo positivo en holdout se considera PRELIMINAR y necesita cuota y consentimiento.
* Nuevo `GET /api/learning/decision-desk`, sin órdenes. Panel «Centro de decisiones» visible en `localhost:8765`, actualiza cada 20 s, con dos tablas (contratos oficiales y predicciones sombra).
* MCP ya existía en `local-demo/mcp-local.mjs` con `get_demo_orders`, `get_demo_risk_status` y `request_demo_buy_review`, **no conectado de forma automática a ChatGPT**. Ahora añade `get_demo_profitability_by_strategy`, `get_demo_shadow_strategies`, `get_demo_decision_desk`.
* `request_demo_buy_review` acepta `durationTicks: 5|10` y `modelMode: LEGACY_60_CANDLES|PREDICTIVE_5_10|DEMO_136_CONSENSUS_5_10`. Sólo los modos predictivos en 5/10; legado sólo 5. Permite `1HZ25V` que faltaba en el esquema del MCP. La cuenta debe ser DEMO; strict usa señales `readyForProposal`, consenso exige v13.6 + predictor actual y límite de US$0.50. Máximo stake MCP US$1.00; `0.10` continúa exclusivo del botón micro DEMO sujeto al broker.
* MCP retorna `PENDING_APPROVAL` con caducidad de 45 s, **0 BUY realizados y confirmación humana obligatoria en el PC**. Bloquea nuevas revisiones si existe programa/tanda activa u otra solicitud/contrato pendiente. No ejecuta BUY directamente, no configura dinero REAL, no retira ni repite órdenes inciertas.
* Se mantienen los límites diarios, control de saldos, validación de propuesta streaming y frescura de señal.

## Cómo conectar realmente MCP con ChatGPT

El endpoint privado es `http://127.0.0.1:8765/mcp`, protegido con una clave Bearer **única del PC**, que nunca se incluye en GitHub ni en la conversación. **Esto NO es una conexión desde este chat**: poder leer la pestaña local en ChatGPT no habilita la ejecución MCP. La cuenta ChatGPT necesita un **conector MCP de confianza** o Work capaz de utilizarlo, con autorización explícita del usuario y un canal protegido compatible. Un servidor HTTP de loopback no es automáticamente accesible por servicios remotos. No publicar el puerto 8765 en Internet ni subir el token, ni crear túneles abiertos o saltarse la protección de host/origen para permitir BUY. Si en el futuro se configura un conector de confianza, conservar la aprobación en el PC **por contrato**.

Se verifican la API `proposal` y `buy` de Deriv con documentación oficial:
https://developers.deriv.com/docs/intro/api-overview/ ;
https://developers.deriv.com/docs/trading/ ;
https://developers.deriv.com/es/docs/workflows/ .

## Qué falta para decidir compras rentables

Ninguna mejora de ROI está probada sólo por añadir un ranking. Evaluar cohortes prospectivas fijas en mercados/horizontes; observar 200–300 etiquetas independientes por candidato como punto de partida; filtrar por tiempo y volatilidad sin elegir parámetros tras mirar el período de evaluación; exigir estimación calibrada y su intervalo inferior por encima del ratio de equilibrio según cotización y payout efectivos. Medir latencia de selección/propuesta/BUY, aperturas UNKNOWN y P&L oficial. No aplicar Martingale o «recuperar rojo» indefinidamente. Nunca promover una política del laboratorio a órdenes sin un ensayo DEMO prospectivo acordado.
