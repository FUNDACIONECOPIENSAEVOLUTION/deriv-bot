# Auditoría diaria Deriv IA — 2 de noviembre de 2026

**Ámbito:** investigación y validación no transaccional. No se conectó ninguna cuenta, no se usaron claves ni se enviaron órdenes.

## Verificaciones ejecutadas

- **CI:** GitHub Actions «Validar laboratorio y servidor MCP» pasó sobre commit `20feb69c4`: 15 pruebas Python, 10 de integridad de historial Node, 8 estadísticas/RSI y validación sintáctica/seguridad de 4 HTML. https://github.com/FUNDACIONECOPIENSAEVOLUTION/deriv-bot/actions/runs/41534631210
- **Deriv WebSocket público:** el workflow ejecutado el 2 de noviembre confirmó respuesta auténtica del canal público y 5 ticks del símbolo R_100 con tiempos válidos, en **325 ms**. No es una prueba de saldo, ejecución de operaciones ni rentabilidad. https://github.com/FUNDACIONECOPIENSAEVOLUTION/deriv-bot/actions/runs/41534631030
- **GitHub Pages:** el último despliegue confirmado antes de estos cambios fue el 1 de noviembre (commit f75c91644). La ejecución del 2 de noviembre estaba pendiente al redactar el informe; consultar https://github.com/FUNDACIONECOPIENSAEVOLUTION/deriv-bot/actions/runs/41534631466. No fue posible comprobar HTTP de forma independiente desde este entorno por error DNS; un despliegue exitoso no equivale a una comprobación externa de contenido.
- Sitio: https://fundacionecopiensaevolution.github.io/deriv-bot/

## Falla de integridad verificada y corrección

`mcp_research._market_data(symbol,count)` aceptaba respuestas con **menos ticks de los solicitados** siempre que superaran 100 y no excedieran el máximo. Esto podía dar por válido un análisis de menor tamaño que el configurado, afectando la reproducibilidad de muestras. Se añadió `expected_count=count` a `_validate_history`, con pruebas de rechazo de historial parcial y aceptación de tamaño exacto. El CI pasó con 15 pruebas Python.

También se endureció `scripts/probe_deriv_public.mjs` para rechazar respuestas públicas cuyo `req_id` o símbolo devuelto (si vienen incluidos) no correspondan a la solicitud. El flujo público pasó y recibió 5 ticks auténticos. No se modificaron herramientas transaccionales.

## API oficial Deriv y novedades

- La documentación vigente separa WebSocket público (sin autorización, solo datos) de canales DEMO/REAL autenticados con OTP de uso único de **120 segundos**. El canal público no puede consultar saldos ni operar: https://developers.deriv.com/docs/options/ws-public/ y https://developers.deriv.com/docs/options/websocket/
- La página oficial de novedades consultada el 2/11/2026 muestra como última actualización fechada **20/08/2026**: estadísticas de markup con una hora de retraso y ventana máxima de seis meses. El **14/08/2026** publicó límites de API, y el **10/08/2026** nuevos símbolos sintéticos. No se encontró un anuncio oficial más reciente: https://developers.deriv.com/product-updates/
- No conectar una cuenta real ni solicitar tokens, OTP, contraseñas o claves privadas a través de GitHub Pages.

## Investigación de backtesting y agentes

- **Freqtrade**: el comando `lookahead-analysis` detecta sesgo de datos futuros; también advierte sobre cachés y supuestos de ejecución. Aplicar principios metodológicos, no copiar modelos de liquidación cripto para Options: https://docs.freqtrade.io/en/2026.5/lookahead-analysis/
- **TradingAgents v0.7.1**, publicada el **27/10/2026**: corrige fechas de datos SEC que podían exponer información posterior a la fecha del análisis y evaluación de decisiones antes del cierre final de sesión. Referencia de integridad temporal, no prueba de rentabilidad Deriv: https://github.com/TauricResearch/TradingAgents/releases/tag/v0.7.1

## Próximos ensayos recomendados

1. Ensayo histórico con varias ventanas temporales disjuntas, sin optimizar sobre el conjunto final, registrando símbolo, rango UTC, integridad y cantidad exacta de ticks.
2. Prueba de señales invariantes a datos futuros (añadir precios posteriores no debe alterar señales previas); sensibilidad a 60 %, 70 % y 80 % de payout **hipotético**.
3. Reportar número de operaciones hipotéticas, tasa de acierto, máximo drawdown, intervalos de incertidumbre y tasa de equilibrio `1/(1+payout)`; incluir referencia de no operar.
4. Antes de cualquier conexión DEMO, desplegar autenticación en servidor privado y confirmar separación de cuentas. **Sin operaciones reales, transferencias, retiros ni martingala**.

**Distinción esencial:** una cotización real de mercado no convierte una operación simulada en ganancia real. No existe rentabilidad demostrada.
