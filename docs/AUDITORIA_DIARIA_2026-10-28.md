# Auditoría diaria — Deriv IA Trader
**Fecha:** 28 de octubre de 2026 (Colombia)  
**Alcance:** repositorio público, GitHub Actions, GitHub Pages, API oficial Deriv y referencias de backtesting/agentes IA. No se usaron credenciales ni se enviaron operaciones.

## Evidencia de funcionamiento previa a los cambios de seguridad

- Commit inspeccionado inicialmente: `be8720b56b25d91e945ff267a8072664bf54a5fb`.
- Validación de laboratorio y MCP: **success** en [run 40615298293](https://github.com/FUNDACIONECOPIENSAEVOLUTION/deriv-bot/actions/runs/40615298293), con **6 pruebas Python aprobadas** y verificación Node/HTML.
- GitHub Pages: **build/deploy success** en [run 40615298561](https://github.com/FUNDACIONECOPIENSAEVOLUTION/deriv-bot/actions/runs/40615298561). Esto verifica el despliegue, no una prueba HTTP independiente del sitio en todos los navegadores.
- WebSocket público: [run programado 40756010463](https://github.com/FUNDACIONECOPIENSAEVOLUTION/deriv-bot/actions/runs/40756010463) **success**, 5 ticks R_100 en 281 ms. No prueba autorización de cuenta, saldo ni calidad predictiva.
- Algunas compilaciones Pages intermedias aparecían canceladas al realizar varios commits seguidos, pero la última ejecución de ese conjunto sí concluyó correctamente; no se interpretan las cancelaciones como fallas de producción.

## Hallazgo de seguridad y mitigación

**Riesgo verificado:** `index.html` solicitaba una **clave privada del servidor de análisis** mediante un campo de contraseña en GitHub Pages y la enviaba en la cabecera `X-Analysis-Key` al URL arbitrario que introdujera el visitante. Aunque no era un token Deriv y no se persistía en localStorage, solicitar secretos en una web pública está fuera de las reglas del proyecto. CORS no protege al titular frente a pegar una clave en un servidor malicioso.

**Cambio aplicado:** retirar los campos de clave y URL de backend de la página pública y deshabilitar la consulta multi-IA desde esa interfaz hasta que exista un servidor HTTPS con sesiones autenticadas. El servidor de ejemplo `server.mjs` permanece como código local no desplegado; no se añadieron secretos ni accesos. Añadir aserciones de regresión en `tests/test_html.mjs` para impedir que vuelvan los campos o la cabecera de clave. No se modificó ningún mecanismo de ejecución financiera.

## Limitaciones y pendientes verificables

1. El simulador de `index.html` es un **paper trading local**, y su P&L porcentual no representa el precio de liquidación de contratos Options Deriv.
2. `laboratorio.html` y `mcp_research.py` evalúan señales sobre ticks y un **payout supuesto** (por defecto 80 %), no una cotización real de contrato. Los resultados son hipotéticos.
3. `mcp_research.py` verifica precios finitos, pero no valida exhaustivamente la **longitud, monotonía y actualidad** de las marcas de tiempo recibidas; reforzar integridad antes de inferir intervalos o duración de datos.
4. La separación temporal 60/40 evita mezclar datos por orden, pero repetir ajustes tras mirar el tramo de prueba puede introducir sobreajuste; reservar otra muestra futura completamente intacta.
5. Las pruebas unitarias verifican invariantes básicos, no latencia de broker, pago de contratos, reconexión de cuenta, pérdidas reales, ni rendimiento estadístico robusto.
6. La cuenta privada no está autenticada: no existe acceso a balance, órdenes ni posición, ni se ha ejecutado DEMO autenticado.

## API oficial Deriv: estado comprobado el 28/10/2026

- [WebSocket público](https://developers.deriv.com/es/docs/options/ws-public/): `/trading/v1/options/ws/public` es de solo lectura y no requiere autenticación.
- [OTP Options](https://developers.deriv.com/es/docs/options/websocket/): `POST /trading/v1/options/accounts/{accountId}/otp`, autenticado con alcance `trade`, devuelve URL WebSocket y OTP de uso único válido 120 s.
- [WebSocket demo](https://developers.deriv.com/es/docs/options/ws-demo/): `/trading/v1/options/ws/demo` requiere OTP y está separado de la ruta real. **No se conectó** a él.
- No se encontró evidencia suficiente de un cambio disruptivo publicado *en el día*; estas páginas son documentación vigente, no un changelog fechado.

## Referencias abiertas de investigación

- [FinRL](https://github.com/AI4Finance-Foundation/FinRL): framework clásico de investigación y entrenamiento/evaluación separados.
- [FinRL-X / FinRL-Trading](https://github.com/AI4Finance-Foundation/FinRL-Trading): evolución modular (2026), con arquitectura de datos, estrategias, backtesting, riesgos y agentes. **No es una implementación de Options Deriv**, por lo que sus supuestos de cartera y ejecución no se pueden copiar como equivalentes.
- Las referencias sirven para diseñar validación reproducible y comparación con una línea base, no para inferir rentabilidad.

## Ensayos seguros siguientes

1. Repetir 5–10 descargas públicas con `R_100` y otro símbolo permitido, registrando marca de tiempo, cantidad de ticks, errores y latencia. No persistir datos privados.
2. Agregar pruebas unitarias para tiempos inconsistentes, precios planos, NaN, secuencias fuera de orden y series demasiado cortas.
3. Ejecutar un experimento histórico predefinido (parámetros fijos, tramo de desarrollo separado y prueba fuera de muestra) con P&L **hipotético**; reportar tasa de acierto, drawdown, número de decisiones y sensibilidad a payout 60/70/80 %.
4. Contrastar con un modelo nulo (aleatorio o siempre HOLD) y repetir en ventanas de fechas distintas. No reutilizar el conjunto de prueba para escoger parámetros.
5. Solo cuando exista un backend privado y autorización independiente, considerar **consulta de cuenta DEMO** con protección contra acceso a cuentas reales; no ejecutar compras ni retiros por este proyecto de investigación.

**Conclusión:** infraestructura y canal público operativos en las pruebas observadas. Se corrigió la exposición innecesaria de credenciales en la UI pública. **No hay evidencia de ganancias reales ni de rentabilidad estable.**
