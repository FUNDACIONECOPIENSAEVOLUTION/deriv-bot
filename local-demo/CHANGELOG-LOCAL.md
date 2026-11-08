## v12.4 · 2026-11-08

- Bot DEMO permite tandas autorizadas de 1 a 10 contratos, uno a uno; REAL bloqueada.
- Selección automática de señales frescas SMA/RSI, pausa en caso de incertidumbre.
- Velas OHLC por ticks, gráfico P&L, tabla de resultados y CSV de tandas.
- Métricas de latencia y confirmación de contratos en SQLite local.
- MCP local de lectura y solicitud de compra con aprobación humana local.
- Actualización automática cuando el bot no tiene contratos pendientes, sin borrar tokens.

## v12.3 · 2026-11-08

- Bot DEMO permite tandas autorizadas de 1 a 10 contratos, uno a uno; REAL bloqueada.
- Selección automática de señales frescas SMA/RSI, pausa en caso de incertidumbre.
- Velas OHLC por ticks, gráfico P&L, tabla de resultados y CSV de tandas.
- Métricas de latencia y confirmación de contratos en SQLite local.
- MCP local de lectura y solicitud de compra con aprobación humana local.
- Actualización automática cuando el bot no tiene contratos pendientes, sin borrar tokens.

## v12.2 · 2026-11-08

- Bot DEMO permite tandas autorizadas de 1 a 10 contratos, uno a uno; REAL bloqueada.
- Selección automática de señales frescas SMA/RSI, pausa en caso de incertidumbre.
- Velas OHLC por ticks, gráfico P&L, tabla de resultados y CSV de tandas.
- Métricas de latencia y confirmación de contratos en SQLite local.
- MCP local de lectura y solicitud de compra con aprobación humana local.
- Actualización automática cuando el bot no tiene contratos pendientes, sin borrar tokens.

## v12.1 · 2026-11-08

- Bot DEMO permite tandas autorizadas de 1 a 10 contratos, uno a uno; REAL bloqueada.
- Selección automática de señales frescas SMA/RSI, pausa en caso de incertidumbre.
- Velas OHLC por ticks, gráfico P&L, tabla de resultados y CSV de tandas.
- Métricas de latencia y confirmación de contratos en SQLite local.
- MCP local de lectura y solicitud de compra con aprobación humana local.
- Actualización automática cuando el bot no tiene contratos pendientes, sin borrar tokens.

## v12.0 · 2026-11-08

- Bot DEMO permite tandas autorizadas de 1 a 10 contratos, uno a uno; REAL bloqueada.
- Selección automática de señales frescas SMA/RSI, pausa en caso de incertidumbre.
- Velas OHLC por ticks, gráfico P&L, tabla de resultados y CSV de tandas.
- Métricas de latencia y confirmación de contratos en SQLite local.
- MCP local de lectura y solicitud de compra con aprobación humana local.
- Actualización automática cuando el bot no tiene contratos pendientes, sin borrar tokens.

## v11.9 · 2026-11-08

- Bot DEMO permite tandas autorizadas de 1 a 10 contratos, uno a uno; REAL bloqueada.
- Selección automática de señales frescas SMA/RSI, pausa en caso de incertidumbre.
- Velas OHLC por ticks, gráfico P&L, tabla de resultados y CSV de tandas.
- Métricas de latencia y confirmación de contratos en SQLite local.
- MCP local de lectura y solicitud de compra con aprobación humana local.
- Actualización automática cuando el bot no tiene contratos pendientes, sin borrar tokens.

## v11.8 · 2026-11-08

- Bot DEMO permite tandas autorizadas de 1 a 10 contratos, uno a uno; REAL bloqueada.
- Selección automática de señales frescas SMA/RSI, pausa en caso de incertidumbre.
- Velas OHLC por ticks, gráfico P&L, tabla de resultados y CSV de tandas.
- Métricas de latencia y confirmación de contratos en SQLite local.
- MCP local de lectura y solicitud de compra con aprobación humana local.
- Actualización automática cuando el bot no tiene contratos pendientes, sin borrar tokens.

## v11.7 · 8 noviembre 2026

- Versión del código local y GitHub `pc-local` alineadas.
- Actualización de solo lectura desde GitHub con verificación SHA-256 y sin sobrescribir data.
- El programa muestra su versión y la versión conocida de GitHub.
- Ventana OAuth separada (heredada y validada de v11.6).
- Supervisión ligera del proceso Node (heredada de v11.6).
- Cuenta REAL y compras deshabilitadas.

## v11.6 — Corrección de autorización y continuidad de escritorio

- El flujo OAuth se abre en ventana separada; el panel no navega fuera de localhost.
- Alternativa PAT oficial, solo con App ID PAT válido y token cifrado únicamente en el PC.
- Corrección de lectura del estado de credenciales OAuth cifradas.
- Vigilante local sin nuevos servicios cloud, que puede reiniciar Node si falla (si el usuario dejó habilitado el programa).
- Heartbeat SSE local cada 20 segundos para estabilidad del panel; sin peticiones a Deriv.
- Diagnóstico local y preservación de historial, App ID y SQLite sin cambiar BUY/REAL.

# Ecopiensa Deriv Bot — historial PC

## v11.5 — Instalador Windows y actualización automática

- Instalación completa en `D:\deriv-bot` desde ZIP + repositorio privado/público de GitHub.
- Atajo de escritorio que inicia el servidor local solo si es necesario y abre una ventana tipo aplicación en Edge (navegador predeterminado si Edge no existe).
- Segundo atajo para cerrar el servidor de forma segura.
- Actualizaciones GitHub `pc-local` cada cinco minutos por Tareas programadas, siempre sin sobrescribir los datos ni reemplazar código mientras el bot está abierto.
- Aplicación de actualizaciones al abrir cuando el servidor está cerrado; se rechazan historiales o cambios de código incompatibles en vez de forzar merges.
- 48 contratos históricos importados localmente, sin publicar CSV privado.
- Control operativo DEMO (saldo, ticks, cotizaciones e historial); compras desactivadas hasta fase de integración validada.

## v11.4 — Vista de estudio local (paquete anterior)

- Servidor Node.js y OAuth DEMO local en modo lectura con SQLite integrado, sin paquetes npm pesados.
- Datos históricos recuperados y señales orientativas SMA/RSI.
