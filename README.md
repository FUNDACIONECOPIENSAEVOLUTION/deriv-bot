# Deriv IA Trader — laboratorio de datos y simulación

**Versión 1.3 · 27/10/2026**

Panel web independiente de Fundación Ecopiensa Evolution para visualizar cotizaciones públicas y probar operaciones VIRTUALES.

**No hay rentabilidad garantizada. No está afiliado, avalado ni certificado por Deriv.**

## Contenido publicado

- index.html — aplicación HTML adaptable para móvil y escritorio, gráficos, símbolos de Deriv, medias móviles, RSI, volatilidad, simulación automática (solo local), límites de pérdida e historial CSV.
- favicon.svg — icono exclusivo con vela bursátil, flecha y circuitos de IA.
- server.mjs — servidor Node.js opcional de análisis con OpenAI, Gemini, DeepSeek y Qwen, sin órdenes de trading.
- logo ecopiensa (1).png y favicon3dAR.png — archivos originales conservados.

## Activación de GitHub Pages

En GitHub: Settings → Pages → Build and deployment → Deploy from a branch → main → /(root) → Save. El flujo nativo de GitHub Pages ya quedó habilitado y publica automáticamente desde la rama main.

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

**El panel público no permite conectar este servidor ni solicita claves.** `server.mjs` es solo un prototipo local no desplegado. No basta con CORS ni con una cabecera `X-Analysis-Key` para exponerlo a Internet: antes de cualquier integración web se requiere HTTPS, autenticación de sesión en el backend, límites por usuario y un mecanismo de autorización que nunca envíe secretos al navegador. Nunca introducir tokens Deriv, claves de IA ni claves del servidor en GitHub Pages.

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
- [Pruebas](tests/) y [CI](.github/workflows/checks.yml): análisis de sintaxis, verificación de ausencia de compras reales en el HTML y pruebas unitarias desconectadas del broker. La publicación se realiza con el workflow **nativo** de GitHub Pages (el manual duplicado se eliminó por conflictos de despliegue).

Referencias adicionales de investigación (no son promesas de rendimiento):

- [Esquemas oficiales actualizados de Deriv](https://github.com/deriv-com/deriv-api-schemas): evitar contratos obsoletos entre versiones.
- [Freqtrade](https://github.com/freqtrade/freqtrade): metodología de backtesting, controles de lookahead y validación.
- [vectorbt](https://github.com/polakowo/vectorbt) y [Backtrader](https://github.com/mementum/backtrader): motores de simulación cuantitativa.
- [Microsoft Qlib](https://github.com/microsoft/qlib): análisis de modelos cuantitativos y separación entre entrenamiento y validación.

Ninguno de estos proyectos se integró ciegamente: la v1.1 implementa solo análisis reproducible y protege expresamente tu capital real.

## Centro de operaciones v1.2 (sin transacciones)

Se añadió [operaciones.html](operaciones.html) al panel. Prepara y exporta borradores de compra y venta DEMO y permite abrir el cajero oficial de Deriv para gestionar retiros personalmente. **No compra, no vende y no retira fondos automáticamente.**

Deriv utiliza WebSocket autenticado para comprar o vender contratos, y un servicio REST que genera OTP para distinguir cuentas demo y reales. El retiro mediante agente de pagos necesita permiso de tipo payment y verificación. Nunca guardar tokens u OTP en GitHub Pages ni conceder permiso de retiros a la IA.

El enlace público de Grok aportado (https://grok.com/share/c2hhcmQtMw_dfea0b6a-bc25-4234-b650-fb1485cd3f22) no pudo leerse desde este entorno. No se incorporó código ni se atribuyen características no verificadas a esa página. Como opción externa, se investigó https://github.com/apolito53/grok-transcript-extractor para exportar conversaciones públicas.

Fuentes de API: https://developers.deriv.com/docs/trading/ ; https://developers.deriv.com/docs/options/websocket/ ; https://developers.deriv.com/docs/payment-agents/ .


## v1.3 · Diagnóstico de conectividad Deriv

- [conexion.html](conexion.html): botón para probar directamente en el navegador el WebSocket público oficial y recibir ticks R_100. No solicita correos, tokens, contraseña, OTP, datos bancarios o credenciales.
- [scripts/probe_deriv_public.mjs](scripts/probe_deriv_public.mjs): prueba Node.js 22 del mismo endpoint sin autenticación y sin órdenes de trading.
- [Workflow de conectividad](.github/workflows/deriv-connection.yml): ejecuta la prueba en GitHub Actions al modificarla y en comprobaciones diarias. Un resultado exitoso **no** significa que se haya autenticado la cuenta del usuario.
- [Guía de vinculación privada](docs/DERIV_CONEXION_CUENTA.md): pasos OAuth2/PAT y restricciones de permisos, diagnóstico de Wallet vs Options y de la cuenta demo.

**Privacidad:** el correo vinculado a Deriv nunca debe guardarse en este repositorio público. Los saldos de la página son virtuales, no leídos de una cuenta autenticada. La vinculación de cuenta aún no está implementada.


## Auditoría 29/10/2026 · Validación de integridad de datos públicos

- El MCP de investigación ahora rechaza series de ticks públicos con longitudes de precios/tiempos desiguales, precios no finitos, marcas de tiempo fuera de orden, épocas futuras o datos de más de 15 minutos de antigüedad. Se permiten varios ticks en un mismo segundo porque la API expresa épocas con precisión de segundos.
- Se agregaron siete pruebas unitarias desconectadas de Deriv, sin permisos de cuenta ni órdenes. La validación falla cerrada si los datos no cumplen.
- Los límites de llamadas WebSocket/REST se documentan en https://developers.deriv.com/docs/limits/ . El canal público no permite leer saldos privados.
- El último anuncio fechado de Deriv visible en https://developers.deriv.com/product-updates/ es del **20/08/2026** (estadísticas de markup: demora de una hora y consultas de hasta seis meses). No se infiere una actualización de octubre por el simple hecho de que la documentación se haya consultado en octubre.
- La validación no corrige el hecho de que el P&L del laboratorio usa un pago **hipotético**, ni constituye evidencia de rentabilidad. No se conectaron cuentas demo o reales.

