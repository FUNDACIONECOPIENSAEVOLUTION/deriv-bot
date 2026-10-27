# Deriv IA Trader — laboratorio de datos y simulación

**Versión 1.0 · 27/10/2026**

Panel web independiente de Fundación Ecopiensa Evolution para visualizar cotizaciones públicas y probar operaciones VIRTUALES.

**No hay rentabilidad garantizada. No está afiliado, avalado ni certificado por Deriv.**

## Contenido publicado

- index.html — aplicación HTML adaptable para móvil y escritorio, gráficos, símbolos de Deriv, medias móviles, RSI, volatilidad, simulación automática (solo local), límites de pérdida e historial CSV.
- favicon.svg — icono exclusivo con vela bursátil, flecha y circuitos de IA.
- server.mjs — servidor Node.js opcional de análisis con OpenAI, Gemini, DeepSeek y Qwen, sin órdenes de trading.
- logo ecopiensa (1).png y favicon3dAR.png — archivos originales conservados.

## Activación de GitHub Pages

En GitHub: Settings → Pages → Build and deployment → Source: GitHub Actions → Save. Después entra a Actions → Publicar Deriv IA Trader en GitHub Pages → Run workflow si la publicación no se lanza automáticamente.

URL prevista después de activarse:
https://fundacionecopiensaevolution.github.io/deriv-bot/

Si no carga, comprobar Actions y Settings → Pages. Subir el HTML al repositorio no activa por sí mismo GitHub Pages.

Para usar la web en local:

    python -m http.server 8080

Abrir http://localhost:8080 y pulsar Conectar.

### Datos públicos de Deriv

El navegador intenta conectarse a:

    wss://api.derivws.com/trading/v1/options/ws/public

La documentación de Deriv señala que este canal público permite active_symbols, ticks y ticks_history sin autenticación. No permite consultar saldos reales ni colocar órdenes. Si la API no responde, la interfaz informa del error; nunca crea precios ficticios.

Documentación:
https://developers.deriv.com/docs/intro/api-overview/
https://developers.deriv.com/docs/options/ws-public/
https://developers.deriv.com/docs/data/ticks/

## Simulación segura

- Saldo inicial virtual: 77,92 USD, tomado como referencia de una captura, NO del broker.
- Máximo inicial por operación: 2 USD virtuales; límite de pérdida diaria: 3 USD; máximo: 12 operaciones diarias.
- Motor técnico local de 4 roles: tendencia, impulso, volatilidad y supervisor de riesgo. No son LLM.
- La simulación usa una fórmula pedagógica con variación porcentual y sin comisiones ni apalancamiento. No replica la liquidación de CFD ni opciones Deriv.
- La simulación funciona solo mientras el navegador esté conectado y abierto. No trabaja en segundo plano.
- El resultado, siempre identificado como virtual, se guarda localmente en el navegador. Puede exportarse a CSV.

### Qué falta para un sistema de trading validado

Backtesting fuera de muestra, medición de comisiones, spread y slippage, análisis de reducción máxima de capital, fallos de conexión, límites por cuenta y una prueba completa con cuenta DEMO autenticada. No se ha implementado trading real.

## Analistas externos mediante servidor privado

server.mjs requiere **Node.js 20 o superior** y no depende de bibliotecas npm. Solo analiza series de precios suministradas por la interfaz; no verifica el origen de los precios independientemente ni interactúa con cuentas Deriv. Para mayor seguridad, requiere una clave de acceso exclusiva del servidor. Configurar estas variables de entorno **en el servidor**, nunca en GitHub:

| Variable | Función |
|---|---|
| ANALYSIS_ACCESS_TOKEN | Obligatoria; clave aleatoria de 24 o más caracteres |
| OPENAI_API_KEY | Opcional: OpenAI |
| GEMINI_API_KEY | Opcional: Gemini |
| DEEPSEEK_API_KEY | Opcional: DeepSeek |
| QWEN_API_KEY | Opcional: Qwen |
| OPENAI_MODEL | Modelo; predeterminado gpt-4.1-mini |
| GEMINI_MODEL | Modelo; predeterminado gemini-2.5-flash |
| DEEPSEEK_MODEL | Modelo; predeterminado deepseek-chat |
| QWEN_MODEL | Modelo; predeterminado qwen-plus |
| HOST | Por defecto 127.0.0.1, acceso local |
| PORT | Por defecto 8787 |
| ALLOWED_ORIGINS | Orígenes permitidos separados por coma |

Luego ejecutar:

    node server.mjs

Rutas:
- GET /api/health: estado sin autenticación de los proveedores instalados.
- POST /api/analyze: análisis protegido por X-Analysis-Key y validación del origen, con límite de solicitudes.

Para usar el servidor desde GitHub Pages hay que desplegarlo en HTTPS separado del repositorio estático y protegerlo adicionalmente contra abuso. Nunca colocar claves de IA o tokens de Deriv en el JavaScript del navegador. La clave de acceso al servidor se introduce temporalmente en el panel y no se guarda en almacenamiento local.

**ChatGPT Plus no proporciona necesariamente créditos para la API de OpenAI.** Todos los proveedores externos requieren sus claves y disponibilidad. Si no están configurados, el panel marca que faltan y no fabrica respuestas.

El consenso entre modelos es exclusivamente exploratorio: dos IA pueden coincidir y estar equivocadas. El resultado se presenta como UP/DOWN/HOLD, pero no se transforma en orden.

## Investigación de referencia

- Deriv API oficial: https://github.com/deriv-com/deriv-api
- TradingAgents: https://github.com/TauricResearch/TradingAgents
- Vibe-Trading (proyecto asiático): https://github.com/HKUDS/Vibe-Trading
- FinRobot: https://github.com/AI4Finance-Foundation/FinRobot

Los proyectos se investigaron como patrones de diseño; no se clonaron ni se pudo verificar que generen retornos rentables y sostenidos en Deriv. Antes de integrar código tercero debe revisarse compatibilidad de licencia, seguridad, testeo y vigencia de cada endpoint.

## Meta financiera

Convertir 77,92 USD en 1.077,92 USD dentro de 30 días supone una rentabilidad cercana a **1.283,4 % mensual**. Esa cifra es extremadamente improbable como objetivo consistente de bajo riesgo. El software no debe publicitar ni prometer beneficios seguros.


## Novedades v1.1 · Laboratorio histórico y MCP de investigación (2026-10-27)

- [Laboratorio histórico](laboratorio.html): descarga ticks reales **públicos** de Deriv (sin cuenta), compara cinco reglas fijas y reserva un tramo temporal final para evaluación. Incluye tasa de acierto, P&L **hipotético**, drawdown virtual e informe JSON reproducible. El porcentaje de pago se introduce como hipótesis, **no es un payout real de Deriv**. No se puede afirmar ventaja estadística a partir de una sola muestra.
- [Servidor MCP local de investigación](mcp_research.py): expone get_project_status, get_market_snapshot y compare_research_strategies. Solo datos públicos e investigación, sin métodos de compra, venta, retiro ni acceso a saldo. Requiere despliegue y conexión separada; subir un archivo Python a GitHub **no conecta este ChatGPT**.
- [Guía de MCP](docs/MCP_SETUP.md): requisitos, limitaciones y pasos seguros de instalación.
- [Pruebas](tests/) y [CI](.github/workflows/checks.yml): análisis de sintaxis, verificación de ausencia de compras reales en el HTML y pruebas unitarias desconectadas del broker.

Referencias adicionales de investigación (no son promesas de rendimiento):

- [Esquemas oficiales actualizados de Deriv](https://github.com/deriv-com/deriv-api-schemas): evitar contratos obsoletos entre versiones.
- [Freqtrade](https://github.com/freqtrade/freqtrade): metodología de backtesting, controles de lookahead y validación.
- [vectorbt](https://github.com/polakowo/vectorbt) y [Backtrader](https://github.com/mementum/backtrader): motores de simulación cuantitativa.
- [Microsoft Qlib](https://github.com/microsoft/qlib): análisis de modelos cuantitativos y separación entre entrenamiento y validación.

Ninguno de estos proyectos se integró ciegamente: la v1.1 implementa solo análisis reproducible y protege expresamente tu capital real.
