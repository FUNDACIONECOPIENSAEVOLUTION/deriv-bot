# Comandos al bot Ecopiensa: MCP + 10 simulaciones PAPER

**Implementado el 7 de noviembre de 2026.** Alcance actual: simulación de diez posiciones virtuales a partir de ticks **públicos** de Deriv (R_100). No adquiere contratos en cuenta DEMO ni REAL.

## Objetivo

La persona escribe: "Ejecuta diez PAPER y dime si gana más CALL o PUT". El bot analiza el historial público, aplica exactamente el mismo motor `runtime/core.mjs`, abre como máximo diez posiciones hipotéticas sin imponer igual cantidad por dirección y devuelve un informe con la apuesta virtual, indicador SMA8/SMA21, RSI, volatilidad, entrada, salida, resultado, balance y drawdown.

- **Herramienta de código MCP disponible:** `simulate_ten_bot_paper_trades(symbol="R_100")` en `mcp_research.py`. Necesita Python, Node.js y conexión de datos públicos en el servidor donde se ejecute.
- **Motor:** `scripts/paper_ten_replay.mjs`. Reutiliza `readConfig`, `initialState` y `onTick` del motor PAPER; no contiene ni ejecuta `buy`, `sell`, OAuth, OTP o métodos de cuenta.
- **Prueba automatizada reproducible:** workflow `.github/workflows/paper-ten-replay.yml`; guarda resumen JSON y muestra completa de ticks públicos como artefactos temporales de GitHub Actions.
- **Bot web para el usuario:** `ensayo-paper-10.html`, enlazado desde `index.html`, con botón de ejecutar y CSV. No requiere acceso al panel privado.

La estrategia no forza una cantidad predeterminada de CALL/PUT: si hay ocho señales CALL y dos PUT, registra ocho y dos. En ausencia de señales suficientes, devuelve menos de diez y un estado de muestra insuficiente. Una caída de precio no constituye por sí sola indicación de comprar PUT.

## Límites de la prueba

- `R_100`, datos históricos de ticks, horizonte de cinco ticks.
- SMA8/SMA21, RSI aproximado, volatilidad y condiciones de entrada del motor existente. No hay lookahead.
- Capital virtual US$10, apuesta US$0,35, hasta diez posiciones, una abierta a la vez.
- Se supone un pago del 80 % por acierto y costo cero; **no son precios ni payouts de Deriv**.
- Sin compras al broker, sin transferencias/retiros y sin dinero real.
- Los resultados del histórico no prueban rentabilidad, no son una señal en vivo y no se convierten automáticamente en permiso para operar cuenta DEMO.

## Cómo conectar al chat

El código MCP existe, pero subir un servidor Python a GitHub no lo instala en ChatGPT. Requiere desplegar un servicio MCP remoto con HTTPS, OAuth 2.1, límites de acceso y permisos de usuario. La disponibilidad de herramientas personalizadas para modificar/operar recursos depende del plan y las políticas del workspace; según la documentación actual de OpenAI, MCP completo es para Business y Enterprise/Edu, no para Plus.

En ChatGPT compatible: Plugins → Agregar MCP personalizado → URL del servidor seguro → autenticar → autorizar las herramientas. **No publicar el ejemplo local** `mcp_research.py` directamente en Internet: no trae el OAuth necesario.

Para órdenes **DEMO** desde el chat haría falta un servidor MCP diferente con `demo:read`, `demo:prepare` y `demo:execute` y confirmación explícita de cada operación, conectado mediante identidad separada y conciliación con Deriv. **No está implementado ni conectado aquí**. El frontend privado Cloudflare sí contiene un flujo de compra demo mediante navegador, distinto de las simulaciones de este módulo. No hay autorización de operaciones en cuenta real.

Fuentes: https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt · https://developers.deriv.com/docs/data/ticks-history/
