# Auditoría Multi-IA Deriv — 27 de octubre de 2026

**Proyecto:** Ecopiensa Quant Lab / Deriv IA Trader.
**Alcance:** análisis técnico de proyectos públicos y de archivo HTML aportado. No habilita ni ordena operaciones con dinero real.

## Resultado

TREDA es la referencia principal por su consejo de agentes, defensa independiente del riesgo y estrategias en incubación. QuorumTrading aporta votaciones auditables, abstenciones y métricas de gasto de IA. FTBA aporta un bus de mensajes; quant-Trader aporta un Arena comparativo. Locozyoungg solo sirve como referencia conceptual hasta reparar problemas importantes de código.

Ninguno demuestra beneficios garantizados o tiene un rendimiento verificable que se pueda transferir automáticamente a nuestro caso Deriv.

| Proyecto | Grado de interés | Hallazgos al inspeccionar código |
| --- | --- | --- |
| [TREDA](https://github.com/sagintel/treda) | Prioridad 1 | src/treda/risk/guardrails.py implementa candados de demo/real, importe, exposición, drawdown y límites diarios. src/treda/strategy/improvement_loop.py exige backtest y período de incubación antes de promover estrategias. src/treda/agents/council/council.py define debate alcistas/bajistas y revisión de riesgo. Su pyproject declara MIT; verificar licencia y compatibilidad antes de copiar archivos. |
| [QuorumTrading](https://github.com/COLARDYNIT/quorumtrading) | Prioridad 2 | MAJORITY y ORCHESTRATOR_OVERRIDE, registro de votos, costes y razones por abstención, replay. No tiene integración de ticks/contratos de Deriv; su licencia es AGPL-3.0-or-later, según LICENSING.md, con obligaciones para servicios modificados. |
| [FTBA](https://github.com/semillacaramelo/FTBA) | Prioridad 3 | Arquitectura distribuida y demo en su documentación. src/agents/risk_management_agent.py comienza por defecto con saldo 10000.0, no válido para nuestro capital. system/deriv_api_client.py utiliza API WebSocket legacy con authorize. Revisar licencia y actualizar autenticación antes de reutilizar. |
| [quant-Trader](https://github.com/guge199205-byte/quant-Trader) | Prioridad 4 | Arena de comparación y presupuesto por agente. Su operativa real principal es para acciones A chinas mediante puente Tongdaxin, no para Deriv. LICENSE indica MIT. |
| [ai_deriv_trading](https://github.com/Locozyoungg/ai_deriv_trading) | Solo investigación | src/main.py pasa batch_size a TradingModelUpdater aunque su constructor no acepta ese argumento; pasa max_daily_loss a DerivRiskManager aunque tampoco lo acepta, y llama validate_trade aunque el objeto implementa validate_order. En el aprendizaje se usa predict_proba sobre SGDClassifier sin que aparezca un ajuste inicial y se usa como si fueran Q-values. La raíz incluye un archivo .env versionado: no extraer ni copiar secretos. |

## Auditoría del HTML aportado por el usuario

Archivo: gemini-code-1793137079509.html, título Ecopiensa Quant Lab.

**Ideas aprovechables:** diseño de panel, EMA9/EMA21, RSI14, bandas de Bollinger, filtro Quant que convoca al consejo, registro de votos, límites y parada manual.

**Riesgos que impiden publicar o utilizar esa versión:**
1. Líneas 256-272 guardan tokens de Deriv y llaves de Gemini, OpenAI, DeepSeek en localStorage del navegador. Esto no es almacenamiento de secretos seguro.
2. Líneas 542-578 llaman directamente a proveedores externos desde el frontend: expone claves y puede fallar por CORS.
3. Líneas 609-628 incluyen modo LIVE con envío de orden al broker sin comprobar obligatoriamente cuenta demo ni una compuerta de promoción.
4. Líneas 419-435 declaran arbitrariamente niveles de confianza 78 y 82 %, sin calibración ni probabilidades comprobadas.
5. Líneas 516-535 aplican consenso de porcentaje de votos basados en confianza arbitraria. Con Quant solo, un voto de 78 podría superar la barrera del 70 %.
6. Líneas 629-640 suponen un payout fijo de 92 % y cierran la simulación tras duración*1200 ms, no al vencimiento real de un contrato.
7. Líneas 680-685 cierran WebSocket pero no cierran necesariamente contratos ya comprados; no es un kill-switch suficiente.
8. Líneas 283-290 interpolan textos no saneados en innerHTML de un registro, superficie de inyección HTML.
9. WebSocket legacy con authorize no debe convertirse en integración nueva sin probar API actual de REST + OTP.
10. Meta diaria del 11,46 % del capital asignado es un objetivo matemático, no una rentabilidad esperable ni una justificación para aumentar operaciones.

**Decisión:** no incorporar el HTML original ni sus claves o mecanismos de LIVE al proyecto actual.

## Arquitectura para la versión siguiente

1. Colector Deriv de datos reales en canal público: guardar símbolos, tiempos de tick, velas y latencia; reconectar y detectar huecos.
2. Detector cuantitativo local: EMA, RSI, bandas, filtros estadísticos, regímenes, nivel de señal y abstención.
3. Consejo multi-IA (OpenAI, Gemini, DeepSeek, Qwen) en servidor privado, con respuestas JSON validadas y presupuesto por sesión/día. Consultarlo solo ante eventos relevantes.
4. Votos de agentes con razón, datos, versión de modelo y timestamp. NO usar porcentaje de confianza autoafirmado como probabilidad calibrada.
5. Motor de riesgo **independiente**; la IA nunca puede saltar candados: pérdidas diarias, drawdown, exposición, importe, datos obsoletos, respuestas inválidas, pérdida de conexión y límite de consultas.
6. Bitácora auditable de decisiones y abstenciones, y Arena para comparar Quant solo vs cada IA vs consejo completo con igual ventana temporal.
7. Backtesting sin filtraciones temporales (walk-forward, conjunto no visto) y simulación que respete el payout/costos reales del producto contratado.
8. Incubación de estrategias candidatas y evaluación en cuenta DEMO autenticada. Cualquier promoción futura a cuenta real requeriría autorización explícita; nunca automática.

## Particularidad esencial de Deriv

Según Deriv, los índices sintéticos de volatilidad son generados por algoritmos y no están influidos por noticias reales. Por eso no priorizar agentes fundamentalistas ni de sentimiento para los índices sintéticos; sí podrían ser pertinentes para forex y otras clases de activos. La coincidencia de distintos modelos de IA NO demuestra predicción de una secuencia generada de forma aleatoria.

Fuente oficial: https://deriv.com/es/derived-indices/volatility-indices

La API oficial de Opciones diferencia WebSocket público, demo con OTP y real con OTP:
https://developers.deriv.com/docs/options/
https://developers.deriv.com/docs/options/websocket/

## Pruebas de aceptación

- No claves Deriv ni de modelos dentro de HTML, GitHub Pages, repositorio o localStorage.
- No métodos de orden LIVE o REAL en frontend.
- Sin datos reales o sin proveedor configurado: mostrar desconectado o HOLD, no simular cotizaciones falsas.
- Si falla cualquier control de riesgo: sin operación.
- Cero órdenes reales sin aprobación específica y una fase posterior validada.
- Medir retorno neto, máximas pérdidas, esperanza matemática, costes de llamadas IA, drawdown y riesgo de ruina.
- Verificar de forma reproducible si múltiples IA mejoran un mismo backtest frente a Quant sin IA.
- No adoptar variantes 'autoevolucionadas' basándose en el mismo periodo utilizado para afinarlas.
- Validar en demo con condiciones reales de contratos antes de siquiera considerar trading con dinero real.

**Situación:** solo informe de evaluación; no se instaló ni modificó automáticamente ningún bot de terceros. Capital de referencia 77,92 USD obtenido de captura, no de autenticación. No existe garantía de alcanzar 1.000 USD de ganancia mensual.
