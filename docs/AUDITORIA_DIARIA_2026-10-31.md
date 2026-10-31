# Auditoría diaria Deriv IA — 31 de octubre de 2026

**Alcance:** revisión de repositorio, GitHub Actions, GitHub Pages, WebSocket público de Deriv, documentación oficial y referencias abiertas. Sin cuentas privadas, sin tokens, sin claves, sin compras/ventas/transferencias/retiros.

## Estado comprobado antes de la corrección

- Rama `main` inicial: `fe045b6bf4` (última actualización 30/10).
- [CI 41138091615](https://github.com/FUNDACIONECOPIENSAEVOLUTION/deriv-bot/actions/runs/41138091615): **success**, 13 pruebas Python, 10 de integridad Node y 4 páginas HTML validadas.
- [GitHub Pages 41138091226](https://github.com/FUNDACIONECOPIENSAEVOLUTION/deriv-bot/actions/runs/41138091226): **success**, build y deploy.
- [Prueba pública 41230287190 del 31/10](https://github.com/FUNDACIONECOPIENSAEVOLUTION/deriv-bot/actions/runs/41230287190): **success**, recibió 5 ticks de R_100 en 324 ms; cronología y frescura validadas.
- No fue posible efectuar una comprobación HTTP independiente de GitHub Pages desde el entorno de auditoría: fallo de resolución DNS (`Could not resolve host`). Por tanto, la evidencia de publicación se basa en Actions y no en una descarga HTTP externa.

## Defecto verificado y corrección segura

En `server.mjs`, `getStats()` devolvía **RSI aproximado = 100** cuando los últimos 15 precios eran completamente constantes. El cálculo anterior hacía `down===0 ? 100 : ...` y no distinguía `up===0 && down===0`. Es un falso extremo de sobrecompra en un mercado plano; no se detectó una orden ni una operación financiera.

**Cambio no transaccional:** se extrajo `scripts/analysis_stats.mjs` y se importó desde `server.mjs`. Una serie plana ahora devuelve RSI neutral 50; una tendencia ascendente sin pérdidas, 100; descendente sin ganancias, 0. Se validan precios positivos y finitos. Se añadieron 8 pruebas de regresión en `tests/test_analysis_stats.mjs` y se incorporaron a `.github/workflows/checks.yml`.

- [CI de la corrección 41247211251](https://github.com/FUNDACIONECOPIENSAEVOLUTION/deriv-bot/actions/runs/41247211251): **success**, 13 pruebas Python, 10 pruebas de integridad pública, 8 pruebas de estadísticas y 4 HTML validados.
- [Pages del cambio 41247211589](https://github.com/FUNDACIONECOPIENSAEVOLUTION/deriv-bot/actions/runs/41247211589): comprobar conclusión final del flujo de despliegue.
- Sin cambios en formularios de credenciales, autenticación Deriv, órdenes, transacciones, dinero real ni reglas de estrategia.

## Documentación oficial Deriv revisada el 31/10/2026

- [Actualizaciones de producto](https://developers.deriv.com/product-updates/): último anuncio fechado visible **20/08/2026**. Estadísticas de markup excluyen la hora más reciente y limitan consulta a seis meses. No se encontró anuncio oficial fechado en octubre en ese registro.
- [Límites API](https://developers.deriv.com/docs/limits/): presupuestos WebSocket compartidos y límites REST por IP y usuario. Preferir suscripciones, limitar frecuencia y backoff.
- [Canal público](https://developers.deriv.com/docs/options/ws-public/): cotizaciones sin autorización; no contiene saldo ni prueba de rendimiento.
- [OTP de Options](https://developers.deriv.com/docs/options/websocket/): OTP único de 120 segundos; [canal DEMO](https://developers.deriv.com/docs/options/ws-demo/) separado, requiere autorización; no utilizado.
- [Automatización Deriv (25/06/2026)](https://developers.deriv.com/product-updates/): detener una ejecución automática impide nuevas compras, pero **no cierra automáticamente contratos abiertos**. No se habilitaron funciones transaccionales.

## Referencias de investigación

- [Freqtrade — lookahead-analysis](https://www.freqtrade.io/en/stable/lookahead-analysis/): detectar contaminación por datos futuros en backtests; no integrar un ejecutor.
- [FinRL](https://github.com/AI4Finance-Foundation/FinRL): separar entrenamiento, evaluación y negociación, pero usar solo la metodología de validación.
- [TradingAgents](https://github.com/TauricResearch/TradingAgents): reproducibilidad imperfecta de agentes LLM; registrar modelo, fecha, inputs y decisiones para auditoría.
- Ninguna de estas referencias prueba rentabilidad para contratos Options de Deriv.

## Próximos ensayos no transaccionales

1. Construir un fixture histórico de cotizaciones públicas con procedencia, tiempos y hash; evitar solapamiento de ventanas de evaluación.
2. Añadir casos de regresión con precios constantes al laboratorio y al MCP, donde el cálculo RSI debe permanecer neutral.
3. Evaluar cinco reglas fijas frente a HOLD y una referencia aleatoria con prueba temporal fuera de muestra, no seleccionando la mejor estrategia a posteriori.
4. Registrar tasa de aciertos, tamaño muestral, drawdown hipotético, sensibilidad a payout 60/70/80 % y al horizonte de expiración. Evitar sesgo lookahead.
5. Si en el futuro se usa cuenta DEMO, exigir backend privado y consentimiento. No habilitar transacciones reales ni guardar tokens en la web.

**Interpretación:** 5 ticks reales son datos de mercado, no operaciones. Resultados históricos y balances virtuales son simulaciones; **no hay ganancias reales verificadas ni rentabilidad demostrada**.
