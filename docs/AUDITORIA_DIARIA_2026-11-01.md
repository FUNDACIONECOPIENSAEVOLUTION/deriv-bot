# Auditoría diaria Deriv IA — 1 de noviembre de 2026

**Alcance:** revisión de rama main, CI, Pages, conectividad pública, código de laboratorio y diagnóstico, documentación oficial y bibliotecas de investigación. Sin tokens ni acceso a cuentas, sin órdenes, transferencias o retiros.

## Evidencia de estado

- Antes de cambios: commit `1a7274db4b8b` del 31/10; [CI 41247258752](https://github.com/FUNDACIONECOPIENSAEVOLUTION/deriv-bot/actions/runs/41247258752) y [Pages 41247259103](https://github.com/FUNDACIONECOPIENSAEVOLUTION/deriv-bot/actions/runs/41247259103) terminaron **success**.
- [Prueba pública 41339314199 del 01/11](https://github.com/FUNDACIONECOPIENSAEVOLUTION/deriv-bot/actions/runs/41339314199): **success**; recibió **5 ticks** de R_100 en **427 ms**, código `PUBLIC_HISTORY_VALIDATED`, tras 10 pruebas de integridad aprobadas. No es acceso a cuenta ni rendimiento financiero.
- La prueba HTTP independiente de `https://fundacionecopiensaevolution.github.io/deriv-bot/` desde el contenedor falló por resolución DNS. **No implica caída de Pages**; la publicación se verifica con GitHub Actions.
- Tras las correcciones: [CI 41355385420](https://github.com/FUNDACIONECOPIENSAEVOLUTION/deriv-bot/actions/runs/41355385420): trabajo `verify` **success**, 13 pruebas Python, 10 de historial, 8 de RSI y cuatro páginas HTML. [Pages 41355385364](https://github.com/FUNDACIONECOPIENSAEVOLUTION/deriv-bot/actions/runs/41355385364): comprobar conclusión de despliegue al finalizar; no inferir éxito de la compilación si aún está en progreso.

## Falla verificada y cambios seguros

**Problema:** aunque el probe Node del 30/10 ya verificaba precios, marcas temporales, cronología y frescura, las páginas **`laboratorio.html` y `conexion.html` no usaban esa validación**. El laboratorio admitía el historial devuelto por Deriv mediante `setQuotes` comprobando solo que los precios fueran positivos y finitos, sin comprobar `history.times`; el diagnóstico de conexión aceptaba cualquier arreglo de dos o más valores numéricos, incluso sin marcas temporales. En consecuencia podían mostrarse como datos válidos históricos de Deriv series desordenadas, obsoletas o incompletas.

**Corrección:** ambos manejadores de historial importan `./scripts/public_history_validation.mjs` y ejecutan `validatePublicHistory` **antes de mostrar o analizar los datos**. El laboratorio exige la cantidad solicitada; el diagnóstico exige 5 ticks, precios válidos, épocas enteras, orden cronológico y última época dentro de 15 minutos. Si el módulo no carga o la respuesta no supera la validación, se bloquea la prueba. Los CSV manuales continúan etiquetados como archivos sin fechas verificadas. Se reforzó `tests/test_html.mjs` con comprobaciones de regresión para ambas páginas; la lógica del validador tiene 10 pruebas unitarias.

Archivos modificados: `laboratorio.html`, `conexion.html`, `tests/test_html.mjs`. No se modificaron señales de trading, ejecución, cuentas, tokens ni contratos.

**Limitación:** las pruebas de HTML verifican sintaxis y presencia de la compuerta de validación, no sustituyen una prueba de navegador end-to-end; el endpoint público fue probado separadamente desde GitHub Actions.

## API Deriv — fuentes consultadas el 01/11/2026

- [Registro oficial de novedades](https://developers.deriv.com/product-updates/): último anuncio fechado visible **20/08/2026**, estadísticas de markup con una hora de retraso y máximo seis meses de consulta. No hay nueva entrada fechada en septiembre-octubre en el registro consultado.
- [WebSocket público](https://developers.deriv.com/docs/options/ws-public/): cotizaciones sin autorización, sin saldos ni ejecución.
- [WebSocket Options y OTP](https://developers.deriv.com/docs/options/websocket/): conexión demo autenticada con OTP de un solo uso válido **120 segundos**. No se intentó acceder a cuenta demo.
- [Límites API](https://developers.deriv.com/docs/limits/): presupuestos compartidos de llamadas WS, límites REST por IP/usuario, reutilización de conexión y backoff.
- [Automatización Deriv](https://developers.deriv.com/product-updates/): una parada de estrategia automática no implica cierre de contratos abiertos; no habilitar.

## Investigación abierta

- [Freqtrade lookahead-analysis](https://www.freqtrade.io/en/stable/lookahead-analysis/): evitar fuga de datos futuros y comprobar señales calculadas solo con información disponible al momento de la decisión.
- [FinRL / FinRL-X](https://github.com/AI4Finance-Foundation/FinRL): separación entre entrenamiento, prueba y evaluación; comparar con referencia y controlar drawdown.
- [TradingAgents](https://github.com/TauricResearch/TradingAgents): **v0.7.1 anunciada en octubre de 2026** corrige fechas de información y evaluación de cierres definitivos; recuerda la no reproducibilidad perfecta de agentes LLM. Sus datos de acciones y sus decisiones no equivalen a contratos de Deriv.

## Próximos ensayos no transaccionales

1. Ensayo de navegador con historial público genuino y casos de respuesta corrupta: épocas ausentes, invertidas, futuras, obsoletas y longitud incompleta.
2. Guardar muestras con símbolo, fecha UTC, conteo, procedencia y hash para reproducir resultados; validar CSV sin tiempos por separado, nunca como fuente verificada.
3. Evaluar cinco reglas fijas contra HOLD y una referencia aleatoria, con partición temporal y prueba walk-forward sin optimización posterior.
4. Registrar tamaño de muestra, win rate, drawdown, intervalos de incertidumbre y sensibilidad a payout **hipotético** 60/70/80%; distinguir el modelo de ticks de los precios de liquidación de contratos.
5. Mantener DEMO autenticada pendiente de un backend privado seguro; no pedir ni almacenar claves o tokens en la web.

**Conclusión:** conectividad pública comprobada; pruebas y publicación evaluadas por Actions. Ninguna operación real ni demo autenticada ejecutada. Los beneficios simulados no representan dinero ganado y no demuestran rentabilidad.
