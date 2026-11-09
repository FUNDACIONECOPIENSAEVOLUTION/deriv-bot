# Ecopiensa PC · IA y validación de estrategias DEMO (fase 1)

## Aclaración de arquitecturas
- `main/README.md` describe el laboratorio web PAPER original (incluye saldo virtual US$77.92, máximo 12 operaciones y límite US$3). **No** describe la aplicación Windows actual.
- `pc-local/local-demo/` contiene el cliente con Deriv API DEMO autenticada vía OAuth/PAT y WebSocket OTP, saldos oficiales, liquidaciones reales en moneda ficticia, SQLite, hasta cinco contratos simultáneos, programación 10×10 y protección por pérdida neta. REAL permanece inhabilitado.
- No hay conexión MCP remota autenticada de ChatGPT hacia el PC; `/mcp` es local, con Bearer privado y herramientas read-only/revisión.
  
## APIs y herramientas verificadas
1. **Deriv Options API** (ya integrada): ticks y símbolos públicos sin autenticación; OTP y WS demo autenticados. Fuente oficial: https://developers.deriv.com/docs/intro/api-overview/ . No usar WS real.
2. **OpenAI / GPT** (propuesta futura): el `server.mjs` del directorio raíz contiene una integración LLM experimental protegida por `ANALYSIS_ACCESS_TOKEN`, separada de `local-demo/server.mjs`. Aún no existe conexión de esa integración al servidor del PC ni se ha configurado `OPENAI_API_KEY` aquí. Mantener claves solo en el backend privado. Usar GPT para auditorías **posteriores** y generación de hipótesis, nunca para decidir órdenes a cinco ticks sin validación.
3. **Freqtrade / vectorbt**: aprovechar conceptos de backtest y pruebas anti-lookahead, no usar sus rendimientos o coste de transacciones sin adaptar la liquidación de contratos de opciones Deriv. Freqtrade: https://www.freqtrade.io/en/stable/lookahead-analysis/ .
4. **TradingAgents**: referencia de organización por roles (tendencia, riesgo, crítica, supervisor) para informes de investigación. Sus mercados y horizontes habituales no replican los índices sintéticos a cinco ticks. https://github.com/TauricResearch/TradingAgents .
5. **Servidores MCP de terceros**: no se verificó un servidor Deriv mantenido oficialmente por la empresa. No instalar código con permisos de compra ni suministrarle credenciales de cuenta sin auditoría exhaustiva.

## Fase 1 — validación local ya programada
Ruta read-only: `GET /api/learning/walk-forward`.
Herramienta MCP read-only: `get_walk_forward_validation`.
- Entrena un estimador logístico pequeño en **modo sombra** con RSI, RSI de ticks, fuerza de señal, impulso de cinco ticks y edad de la señal.
- Solo añade etiquetas de contratos liquidados **antes** de cada compra, sin filtrar resultados del futuro. Agrupa señales idénticas por índice/dirección/vela cuando hay ese dato; excluye liquidaciones sin tiempo verificable.
- Reproduce evaluación prequential con entrenamiento progresivo y bloques de validación de veinte decisiones posteriores. Compara Brier con referencia neutral y tasa histórica acumulada.
- La puntuación es sobre las compras **ya elegidas por el algoritmo vigente**. No demuestra si conviene invertir CALL/PUT o operar índices en los que nunca se compró; tampoco demuestra beneficio hipotético.
- El informe registra muestras insuficientes. Ni el modelo ni el MCP autorizan BUY, ni modifican parámetros, importes, estrategias o permisos REAL.

## Fases siguientes (no implementadas)
- Capturar instantáneas de mercado y **señales rechazadas/no ejecutadas**, payout cotizado, versión de estrategia y tiempo efectivo de entrada; sin esto existe sesgo por selección.
- Reproducir contratos cinco-ticks usando ticks y payouts históricamente verificables, asumiendo latencia y fallos. Comparar rendimiento neto, máxima caída y tasa de acierto con conjunto de prueba separado.
- Incorporar una API LLM bajo aprobación del operador y con salidas JSON validadas, exclusivamente para informes y propuestas de experimentos. Nunca exponer claves en GitHub, navegador o salida MCP.
- Plantear pruebas A/B en DEMO en dos conjuntos temporales predefinidos; **no** activar selección por IA ni REAL hasta obtener evidencia robusta fuera de muestra.

**El 90% de acierto es una aspiración, no una probabilidad ni garantía.** La ventaja neta depende también de payout, tamaño de pérdidas, volatilidad y ejecución.
