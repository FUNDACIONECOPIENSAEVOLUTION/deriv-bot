# Auditoría diaria Deriv IA — 30 de octubre de 2026

**Alcance:** repositorio público, pruebas CI, despliegue Pages, conexión pública de solo lectura, documentación oficial Deriv y referencias de backtesting/IA. No se solicitaron tokens, no se accedió a cuentas y no se ejecutaron órdenes ni movimientos financieros.

## Evidencia de estado (hora Colombia: 30/10/2026)

- Rama `main` después de la validación: commit [9640b185a2](https://github.com/FUNDACIONECOPIENSAEVOLUTION/deriv-bot/commit/9640b185a2b16fb73f284cc0629ab632be958dc1).
- [CI 41137966708](https://github.com/FUNDACIONECOPIENSAEVOLUTION/deriv-bot/actions/runs/41137966708): **éxito**, 13 pruebas Python, 10 pruebas Node nuevas de integridad y 4 HTML revisados; sintaxis Python/Node correcta.
- [GitHub Pages 41137965798](https://github.com/FUNDACIONECOPIENSAEVOLUTION/deriv-bot/actions/runs/41137965798): **éxito** de build y despliegue para ese commit. URL: https://fundacionecopiensaevolution.github.io/deriv-bot/ . No se pudo verificar la carga HTTP de forma independiente desde el entorno de auditoría por error DNS; el estado se basa en Actions.
- [Conectividad pública 41137966841](https://github.com/FUNDACIONECOPIENSAEVOLUTION/deriv-bot/actions/runs/41137966841): **éxito**, 5 ticks `R_100` en 229 ms. La nueva prueba validó estructura de precios, marcas temporales ordenadas y última cotización reciente. No prueba cuentas, ganancias ni ejecución.

## Defecto reproducible y corrección segura

**Hallazgo:** la prueba original `scripts/probe_deriv_public.mjs` devolvía `OK` al recibir cinco precios finitos aunque faltaran `history.times`, hubiera épocas fuera de orden o las cotizaciones fueran antiguas. Era un **falso positivo posible de calidad de datos**, no una falla observada en el servidor Deriv.

**Corrección implementada:** módulo puro `scripts/public_history_validation.mjs` que exige 5 precios positivos y 5 épocas enteras, no decrecientes y con última época entre 15 minutos de antigüedad y 120 segundos en el futuro. `probe_deriv_public.mjs` falla cerrado con códigos explícitos. Se añadieron **10 tests de regresión** en `tests/test_public_history.mjs`; `checks.yml` y `deriv-connection.yml` los ejecutan. Todas las pruebas y la nueva conexión real pública pasaron.

**Sin cambios** en `index.html`, `laboratorio.html`, `operaciones.html`, servidor de IA, módulos de cuenta, operaciones, martingala ni movimientos de fondos.

## Deriv oficial (consultado 30/10/2026)

- [Actualizaciones de producto](https://developers.deriv.com/product-updates/): último anuncio fechado visible **20/08/2026**, estadísticas de markup con 1 hora de retraso y máximo de seis meses de consulta. No se encontró actualización fechada de octubre.
- [Límites API](https://developers.deriv.com/docs/limits/): llamadas WebSocket y REST sujetas a cuotas compartidas, por lo que las futuras pruebas deben usar backoff y evitar reintentos agresivos.
- [WebSocket público](https://developers.deriv.com/docs/options/ws-public/): solo datos de mercado, sin cuenta ni saldo.
- [OTP para Options](https://developers.deriv.com/docs/options/websocket/): OTP de uso único, validez 120 segundos; [canal DEMO](https://developers.deriv.com/docs/options/ws-demo/) separado y autenticado. **No se solicitó ni usó ningún OTP.**

## Referencias abiertas (sin integrar código tercero)

- [Freqtrade — lookahead-analysis](https://github.com/freqtrade/freqtrade/blob/develop/docs/lookahead-analysis.md): detectar uso inadvertido de información futura en backtests.
- [TradingAgents](https://github.com/TauricResearch/TradingAgents): notas de septiembre de 2026 sobre integridad point-in-time y backtesting de agentes; orientado a investigación, no evidencia de rendimiento Deriv.
- [FinRL](https://github.com/AI4Finance-Foundation/FinRL): separación entrenamiento/prueba y comparación contra baselines. No modela por sí solo contratos Options Deriv.

## Próximos ensayos seguros

1. Recolectar varias muestras públicas `R_100` con espaciado y presupuesto de API; verificar calidad de `history.times`, continuidad, tasas de errores y latencias. No persistir datos de cuenta.
2. Comparar reglas fijas contra `HOLD` y azar, congelando parámetros antes del tramo final; evaluar lookahead y intervalos de confianza con ventanas temporales distintas.
3. Simular payout hipotético 60/70/80 %, registrar drawdown, tamaño de muestra, frecuencia de señales y sensibilidad al vencimiento. **P&L hipotético ≠ ganancia real.**
4. No conectar DEMO autenticada hasta disponer de backend privado, consentimiento y permisos restringidos; no habilitar ejecución real, transferencias ni retiros.

**Conclusión:** sitio desplegado y validación pública fortalecida. No hay prueba de rentabilidad ni de ganancias reales.
