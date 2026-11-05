# Auditoría de investigación — 5 de noviembre de 2026

## Estado verificado

- Rama pública `main` en commit `ef9c659c0` (último commit 4/11/2026); GitHub Pages en ese commit finalizó con **success**: https://github.com/FUNDACIONECOPIENSAEVOLUTION/deriv-bot/actions/runs/41924748352
- Las pruebas de la rama principal finalizaron con **success** en el mismo commit: https://github.com/FUNDACIONECOPIENSAEVOLUTION/deriv-bot/actions/runs/41924748752
- Prueba pública de Deriv 5/11: **5 ticks R_100 validados, 655 ms**, sin credenciales ni órdenes, y 10/10 pruebas de integridad: https://github.com/FUNDACIONECOPIENSAEVOLUTION/deriv-bot/actions/runs/42109679916
- La comprobación HTTP independiente de https://fundacionecopiensaevolution.github.io/deriv-bot/ no fue posible desde el entorno de auditoría (resolución DNS fallida / herramienta web sin acceso). Por tanto, el éxito del workflow no es una verificación directa del contenido servido.
- Hay un **PR abierto #1** desde `codex/paper-runtime-24h` a `main`: https://github.com/FUNDACIONECOPIENSAEVOLUTION/deriv-bot/pull/1 . El PR contiene simulación PAPER persistente con capital **virtual USD 10**, SQLite, contenedores y backups. **No está fusionado ni desplegado en GitHub Pages**.
- En el commit `834e5d2e7` de esa rama, las pruebas de laboratorio/MCP aprobaron (incluidos 19 tests Python) y las compilaciones/validaciones de contenedores AMD64 y ARM64 aprobaron: https://github.com/FUNDACIONECOPIENSAEVOLUTION/deriv-bot/actions/runs/42123749543 y https://github.com/FUNDACIONECOPIENSAEVOLUTION/deriv-bot/actions/runs/42123749505 . Las pruebas de contenedor utilizan datos sintéticos y sin conexión externa: no prueban uptime, disponibilidad de alojamiento gratuito ni resultados financieros.
- No se verificó cuenta DEMO autenticada, cuenta real, órdenes, transferencias, retiros o ganancias reales.

## Fallas y limitaciones verificadas

1. No hay prueba HTTP independiente de la página desplegada desde este entorno. El último despliegue `main` sí pasó en GitHub Actions.
2. La nueva rama PAPER no está fusionada; los tests verdes de la rama no significan que esté publicada o ejecutándose 24/7.
3. La prueba de conectividad solo confirma cotizaciones públicas. No autoriza ni consulta fondos, posiciones o contratos de cuenta.
4. GitHub Actions registró advertencias de deprecación de Node 20 para actions/checkout@v4 y setup-node@v4. Se recomienda revisar actualizaciones de acciones por SHA/versiones y mantener runners compatibles; es advertencia, no falla de CI.
5. Los pagos del laboratorio y el balance PAPER son simulaciones, no operaciones ni P&L verificable de broker.

## Novedades API Deriv

- El anuncio oficial más reciente consultado es del **4/11/2026**: consolidación USDT/USDC de **agentes de pago** efectiva **10/11/2026**; no afecta el endpoint público de ticks ni justifica habilitar permisos de pago. https://developers.deriv.com/product-updates/
- La API de Options distingue configuración REST, obtención de OTP y WebSocket autenticado; no usar la página estática para guardar tokens. https://developers.deriv.com/docs/options/
- Los esquemas oficiales versionados se publican en https://github.com/deriv-com/deriv-api-schemas/releases . Validar los mensajes contra esquemas y límites antes de cambios.

## Referencias abiertas y próximos ensayos

- FinRL-X / FinRL: separación de datos, modelos, evaluación y controles de riesgo; https://github.com/AI4Finance-Foundation/FinRL
- Freqtrade: metodología de `lookahead-analysis` para detectar uso indebido de información futura; https://www.freqtrade.io/en/stable/lookahead-analysis/
- TradingAgents: investigación de múltiples agentes; https://github.com/TauricResearch/TradingAgents . Las opiniones de modelos no son probabilidades calibradas.
- Próximos ensayos: (1) revisión manual del PR #1 antes de fusionar, especialmente protección del panel privado, privacidad de SQLite y límites de pérdida; (2) ejecutar pruebas de persistencia y restauración sobre datos sintéticos; (3) backtest cronológico fuera de muestra con una regla neutral, controles de datos futuros, sensibilidad a payout 60/70/80 % y drawdown; (4) solo después evaluar DEMO autenticada mediante servidor privado con permisos mínimos.

**No se implementaron ni ejecutaron órdenes reales, transferencias, retiros o martingala. No se solicitaron ni almacenaron credenciales. La rentabilidad no está demostrada.**
