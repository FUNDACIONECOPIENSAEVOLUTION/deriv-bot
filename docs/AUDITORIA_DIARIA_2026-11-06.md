# Auditoría diaria Deriv IA — 6 de noviembre de 2026

## Alcance y evidencias verificadas

- Rama main: SHA `5d536b26` (2026-11-06 19:22:58 UTC), cambios de validación de publicación Cloudflare.
- GitHub Pages: workflow **pages build and deployment** #42279129944, conclusión **success**, SHA `5d536b26`. La ejecución confirma publicación de GitHub Pages, no una prueba independiente de contenido HTTP.
- Tests de main: workflow **Validar laboratorio y servidor MCP** #42279130495, conclusión **success**.
- API Deriv pública: workflow **Comprobar conexión pública Deriv** #42288569206, conclusión **success**. Este resultado no prueba autenticación de cuentas ni beneficios.
- Pull request #7 **Corregir velas cripto en Cloudflare y aclarar resultados virtuales** permanece **abierto y sin fusionar** al momento de la auditoría, SHA `522e2f58`. Sus workflows de contenedor PAPER, Cloudflare Worker, validación de laboratorio y conectividad pública finalizaron **success** (IDs #42285247822, #42285247757, #42285247495 y #42285247549). La aprobación de pruebas del PR no demuestra que su código esté en main o desplegado.
- Falla verificable en ejecución anterior de la rama de trabajo: workflow Cloudflare #42283172663, SHA `fef53055`, **failure**; prueba `reports only a bounded public market error code when a crypto source rejects a request`: esperaba `PUBLIC_MARKET_HTTP_503` y recibió `PUBLIC_MARKET_NETWORK_ERROR`. El workflow posterior #42285247757 del PR terminó exitosamente; no se debe afirmar que la versión anterior era correcta.
- No hay evidencia de despliegue exitoso de Cloudflare en producción ni de disponibilidad 24/7 a partir de esos tests; tampoco de cuenta DEMO autenticada.

Enlaces:
- https://github.com/FUNDACIONECOPIENSAEVOLUTION/deriv-bot/actions/runs/42279129944
- https://github.com/FUNDACIONECOPIENSAEVOLUTION/deriv-bot/actions/runs/42279130495
- https://github.com/FUNDACIONECOPIENSAEVOLUTION/deriv-bot/actions/runs/42288569206
- https://github.com/FUNDACIONECOPIENSAEVOLUTION/deriv-bot/pull/7
- https://github.com/FUNDACIONECOPIENSAEVOLUTION/deriv-bot/actions/runs/42283172663
- https://github.com/FUNDACIONECOPIENSAEVOLUTION/deriv-bot/actions/runs/42285247757

## API oficial Deriv: revisión

- La actualización más reciente identificada en el registro de productos, **4 nov 2026**, consolida USDT/USDC para agentes de pago desde el **10 nov 2026**. No cambia los endpoints de cotización pública ni exige modificar este laboratorio.
- WebSocket público: `wss://api.derivws.com/trading/v1/options/ws/public` sin autenticación, solo lectura. Opciones DEMO autenticadas requieren OTP de un solo uso y 120 segundos de vigencia. No usar `ws/real`.
- Límites REST documentados: 300 solicitudes/minuto por IP, 1.000/10 minutos por IP y 80/minuto por usuario autenticado. Implementar backoff y no reintentos agresivos.

Fuentes oficiales:
- https://developers.deriv.com/product-updates/
- https://developers.deriv.com/docs/options/websocket/
- https://developers.deriv.com/docs/limits/

## Referencias abiertas para ensayos

- Freqtrade: detección de lookahead bias en backtesting, https://github.com/freqtrade/freqtrade/blob/develop/docs/lookahead-analysis.md .
- FinRL: separación de datos de entrenamiento, evaluación y control de riesgo, https://github.com/AI4Finance-Foundation/FinRL .
- TradingAgents: arquitectura de agentes y reproducibilidad, https://github.com/TauricResearch/TradingAgents .
Estas referencias no son pruebas de rentabilidad de contratos Deriv.

## Recomendaciones y próximos ensayos

1. Mantener PR #7 sin fusionar hasta revisar el diff, los límites de fetch a orígenes públicos, el tratamiento de redirecciones y el texto que distingue PAPER de fondos reales.
2. Verificar disponibilidad real del sitio y del Worker por HTTP en entorno independiente; los workflows de CI no sustituyen un health check externo.
3. Backtesting con ticks auténticos, cronología monotónica, cortes de entrenamiento/prueba sin fugas, ventanas walk-forward y un baseline neutral. Reportar número de operaciones, payout realista, pérdidas máximas y bandas de incertidumbre.
4. Ensayos de reinicio, restauración de SQLite, pérdida de red, reintentos idempotentes y ausencia de órdenes en modo PAPER. Mantener todas las credenciales fuera de GitHub Pages y fuera del chat.
5. No ejecutar operaciones reales, transferencias, retiros ni martingala. Resultados PAPER = dinero virtual; ganancias reales verificadas = ninguna.

**Cambios de esta auditoría:** exclusivamente este informe de documentación. No se alteraron motores, estrategias, permisos ni endpoints transaccionales.
