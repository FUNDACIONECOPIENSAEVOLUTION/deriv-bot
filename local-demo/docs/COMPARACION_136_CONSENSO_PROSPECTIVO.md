# Investigación v13.6 vs v18.4: modo consenso opcional y A/B prospectivo

## Evidencia local auditada
Archivo privado del usuario `ecopiensa-historial-demo (1).csv`, 2056 intentos, 1360 contratos SETTLED. El CSV **NO** se sube al repositorio.

* **v13.6**: 60 SETTLED, 38 ganadas (63.33 %), 22 perdidas, US$0.50 por compra, beneficio +US$5.75 (19.17 % sobre US$30). 25 intentos rechazados, seis tandas de diez en 17 min (8 noviembre, 21:08–21:26 Colombia). Wilson 95 % del win rate: **50.7–74.4 %**; la precisión verdadera no está demostrada con esa sesión.
* En esas 60 operaciones la dirección BUY registrada coincidía 60/60 con **EMA20 > EMA50, RSI14 52–68, momentum cinco velas >0** para CALL (y lo contrario, RSI 32–48, para PUT); `strategyVersion = EMA20_EMA50_RSI14_ATR14_OHLC10_V1`. Faltan `predictionMode`, `predictionPolicy`, `durationTicks` y `signalReason` en el CSV viejo. Por código de la rama histórica, la política de velas también exigía pendiente diez velas en la misma dirección y 60 velas OHLC de diez ticks. **No atribuirles retrospectivamente la política MOMENTUM_10 del selector actual**.
* **v13.7**: 100 SETTLED, 55 ganadas, +US$3.72; **v13.8**: 68 SETTLED, 32 ganadas, −US$7.62; **v14.4**: 100 SETTLED, 42 ganadas, −US$20.72. Las condiciones EMA/RSI/momentum seguían alineadas en los registros de esas cuatro versiones (328 compras, 167 ganadas = 50.91 %, −US$18.87). Así, el éxito v13.6 NO puede atribuirse a ventaja replicable.
* **v18.4**: 65 SETTLED, 32 ganadas (49.23 %), −US$3.92 (−7.54 % sobre US$52). Las órdenes existentes usan `DEMO_EXPLORATORY_5_10` con modelos Momentum5/10/20, VOTE_5_10_20 o Reversion5, por símbolo/horizonte, y revisión de cotización.
* Aplicar un filtro **solo indicativo** EMA20/EMA50, RSI en banda y momentum5 en la dirección de cada compra posterior a v13.6 da **431 operaciones coincidentes** de las que tienen esos campos, con 48.26 % de aciertos y −US$42.35. Esto es una comparación de compras *ya seleccionadas* por otros modelos; **no** mide el efecto causal sobre oportunidades descartadas y no demuestra que añadir el filtro mejore el ROI.

Código archivado y etiqueta exacta v13.6: commit `2bed159f483fae8c23f8322c612fb54750e1e7f9` del manifiesto de PC; `market-analysis.mjs` contenía el mismo modelo de velas fundamental que la rama actual. El cambio principal posterior fue cambiar el **motor de selección** de la tanda a puntuación de horizontes, explorar políticas del predictor, limitar catálogo oficial, separar vetos, ajustar reglas de ejecución. No afirmar que la v13.6 calculaba otros indicadores que no aparezcan en su código.

## Fuentes externas contrastadas
* Deriv, técnica para Bot: https://experts.deriv.com/es/insights/how-to-use-technical-analysis-tools-on-derivs-trading-bot (SMA, EMA, RSI, MACD, Bollinger). Son herramientas de análisis, no garantías de acierto.
* Deriv, experto de producto, 24 septiembre 2026: https://experts.deriv.com/es/insights/the-indicators-that-dont-work-on-derived-indices (indicadores de tendencia pueden calcularse sin tener poder predictivo en Volatility indices RNG).
* Tutorial de YouTube `How to Build an EMA Foundation for RSI and Stochastic Trade Entries` (Trader DNA): https://www.youtube.com/watch?v=wf6s7HHUP_8 : ideas para hipótesis sobre tendencias. No valida contratos Deriv 5/10 ticks ni sus ganancias.
* Tutorial en YouTube `RSI + ADX + EMA`: https://www.youtube.com/watch?v=vBM0imYSzxI, configuración reproducible de indicadores pero no evidencia para los índices sintéticos a 5/10 ticks.
* Comparativas abiertas de estrategias 5 tick (fuente externa, no auditoría propia): https://www.stayhometradingbot.com/guides/bot-builder-rise-fall-tested/ ; la mayoría se aproxima a 50 % con pagos insuficientes. La muestra no se reproduce en este repositorio.
* Material de Deriv sobre swing, SMA20/50 RSI14 se refiere a gráficos H1/H4, no a contratos de cinco ticks: https://docs.deriv.com/marketing/2025/ebook-synthetics-es-hq.pdf .

## Cambios de esta entrega
1. `legacy-136-consensus.mjs`: condiciones explícitas de la lógica anterior. No modifica `market-analysis.mjs`. Valida 60 velas, dirección, frescura, pendiente de 10 velas, RSI y momentum. Un mercado sin coincidencia no pasa.
2. Dos modos nuevos **opt-in** en programa/tanda DEMO: `RESEARCH_136_CONSENSUS_FIVE` y `RESEARCH_136_CONSENSUS_TEN`. El selector exige que el modelo de ticks del **mismo horizonte**, con evidencia exploratoria y veto por riesgo, señale CALL/PUT idéntico al modelo clásico.
3. Se registra en la orden `prediction_mode=DEMO_136_CONSENSUS_5_10` con estrategia `TICK_136_CLASSIC_AGREEMENT_DEMO_V1`, y se **vuelve a comprobar la coincidencia** inmediatamente antes de cada compra: después de consultar cuenta, a la llegada de la propuesta y antes de BUY. La cuota oficial y su ratio esperado siguen sujetos a la revisión exploratoria; si cambia la señal, rechazar sin BUY. Todos los límites DEMO, pérdidas, saldo, UTC, UNKNOWN, 10x10, actualización y REAL deshabilitado se conservan.
4. Corrección adicional: la UI ya ofrecía `RESEARCH_TEN_ONLY` pero dos validaciones de inicio del motor rechazaban ese modo. Ahora se acepta en las mismas condiciones que 5-only.
5. **A/B prospectivo sin órdenes**: el observador `strategy-comparison-shadow.mjs` registra `LEGACY_136_EMA_RSI`, `CURRENT_TICK_MODEL` y `LEGACY_136_AND_CURRENT_CONSENSUS`, por símbolo y horizonte, en la misma entrada de tick. Solo se etiqueta al recibir los ticks 5 o 10 FUTUROS, se interrumpe ante gaps o desconexión y nunca inventa payout/ROI ni órdenes. Los resultados del viejo CSV no se mezclan con estas etiquetas.

## Criterio de validación
No afirmar «win rate subió» por filtrar o por una prueba unitaria. Esperar suficientes observaciones realmente prospectivas de cada brazo, comparadas sobre las mismas ventanas y con cobertura/abstención. Para atribuir beneficio exigir cotizaciones oficiales, precios ejecutados, costo, latencia y resultado SETTLED en condiciones equivalentes; ajustar pruebas múltiples. Una cifra de 63.33 % en 60 contratos no permite concluir ventaja. **No habilitar REAL ni compras automáticas extra por esta investigación.**

## Publicación
Fuente del PC: rama `pc-local`. Un PR + CI Windows/Linux verde se publica con incrementador +0.1 automático; nunca sobreescribir `local-demo/data/`. El manifiesto y Actions deben reflejar la versión nueva; no confirmar instalación en PC sin `localhost:8765/api/health` oficial.
