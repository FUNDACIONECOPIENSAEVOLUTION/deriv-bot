# Auditoría diaria Deriv IA — 29 de octubre de 2026

**Alcance:** revisión del repositorio `FUNDACIONECOPIENSAEVOLUTION/deriv-bot`, Actions/Pages, API Deriv y referencias abiertas de investigación. Sin autenticación de cuenta, sin tokens, sin órdenes ni movimientos de dinero.

## Estado verificado antes de las correcciones

- Rama `main`, commit `094bb9a95c` (28/10/2026). Repositorio público y no archivado.
- [Pruebas CI 40783253665](https://github.com/FUNDACIONECOPIENSAEVOLUTION/deriv-bot/actions/runs/40783253665): éxito; 6 pruebas Python, revisión Node y 4 HTML sin formularios de secretos ni órdenes reales.
- [GitHub Pages 40783254547](https://github.com/FUNDACIONECOPIENSAEVOLUTION/deriv-bot/actions/runs/40783254547): build y despliegue exitosos el 28/10/2026. No se pudo hacer una comprobación HTTP independiente desde el entorno de auditoría (resolución DNS no disponible). El éxito de Pages prueba la publicación desde GitHub, no que todos los navegadores carguen correctamente.
- [WebSocket público 40942358130](https://github.com/FUNDACIONECOPIENSAEVOLUTION/deriv-bot/actions/runs/40942358130): éxito el 29/10/2026, **5 ticks R_100 en 365 ms**. Es una prueba de conectividad y respuesta de datos públicos, no de cuenta, ejecución, calidad de señales o ganancias.
- Algunas ejecuciones intermedias de Pages se cancelaron por commits sucesivos; las últimas versiones de cada lote finalizaron con éxito.

## Hallazgos

1. **Defecto de validación de datos** en `mcp_research.py`: los precios se verificaban, pero la longitud, el orden y la actualidad de `history.times` no se validaban antes de construir instantáneas y resultados hipotéticos. Se podían aceptar tiempos desordenados u obsoletos.
2. **Documentación contradictoria** en README: indicaba que se introducía una clave de servidor en la página pública, aunque el formulario se retiró el 28/10/2026. Se corrigió.
3. El P&L de `laboratorio.html` y `mcp_research.py` usa un payout fijo supuesto; **no** corresponde a cotizaciones, liquidaciones o ganancias verificadas de contratos Deriv.
4. El MCP solo ofrece lectura de mercado público, y el servidor multi-IA de ejemplo es local y no se ha desplegado como un servicio con autenticación de usuarios. No existe conexión autorizada a cuenta privada, saldo, posición ni DEMO.
5. El test de conectividad pública comprueba solo cinco cotizaciones de un símbolo, no integridad estadística del histórico, continuidad de suscripciones ni reconexión.

## Cambios seguros aplicados

- `mcp_research.py`: función pura `_validate_history` para bloquear series de longitudes desiguales, precios no finitos, tiempos no enteros o desordenados, marcas futuras e historial con último tick de más de 15 minutos. Permite marcas de tiempo repetidas por la resolución en segundos de Deriv.
- `tests/test_mcp_research.py`: **7 pruebas de regresión nuevas** sin llamadas a broker; ahora 13 pruebas Python en total.
- `README.md`: corrección de instrucción obsoleta de claves y documentación de límites y validación.
- **Sin cambios** en compras, ventas, retiros, transferencias, cuentas o martingala.

Evidencia de CI: [run 40964550682](https://github.com/FUNDACIONECOPIENSAEVOLUTION/deriv-bot/actions/runs/40964550682) **13/13 pruebas Python aprobadas**, y 4 HTML validados. [Run final 40964580537](https://github.com/FUNDACIONECOPIENSAEVOLUTION/deriv-bot/actions/runs/40964580537) también **success**.

## API Deriv: anuncios fechados y guías vigentes

- [Actualizaciones de producto](https://developers.deriv.com/product-updates/): la publicación más reciente visible es del **20 de agosto de 2026**, no se verificó una novedad fechada el 29 de octubre.
- **20/08/2026:** estadísticas de markup con retraso de 1 hora y ventana de consulta de 6 meses; no usarlas como fuente inmediata de ejecución.
- **14/08/2026:** [límites API](https://developers.deriv.com/docs/limits/): REST 300 solicitudes/IP/min, 1.000/IP/10 min, 80/usuario/min autenticado. WebSocket con presupuestos compartidos por grupos de llamadas, incluidos 220/min y 14.400/h para las demás llamadas. Diseñar backoff y suscripciones en lugar de sondeos.
- **10/08/2026:** nuevos índices sintéticos; verificar símbolos y tipos de contrato con `active_symbols`, sin suponer compatibilidad por nombre.
- **25/06/2026:** API de estrategias automatizadas; su comando stop **no liquida necesariamente los contratos abiertos**. No integrar ejecución financiera en esta investigación.
- [Options WebSocket](https://developers.deriv.com/docs/options/websocket/): público sin autenticación; demo/real con OTP de uso único, válido 120 segundos, separado por cuenta. No se solicitó OTP.

## Referencias abiertas y próximos ensayos

- [FinRL/FinRL-X](https://github.com/AI4Finance-Foundation/FinRL): división desarrollo/prueba, arquitectura modular y evaluación contra líneas base. No proporciona por sí solo un simulador de contratos Deriv.
- [vectorbt](https://github.com/polakowo/vectorbt): pruebas vectorizadas, drawdown, comparación de parámetros, visualización.
- [Backtrader](https://github.com/mementum/backtrader): simulación histórica y costes, con adaptación necesaria para el payout de Options.

Ensayos siguientes: 1) 5–10 consultas públicas espaciadas y con límite de tasa para medir latencia, épocas y fallos; 2) prueba histórica fuera de muestra con parámetros congelados, referencias HOLD/aleatoria y payout hipotético 60/70/80 %; 3) registrar número de decisiones, pérdida máxima, intervalos de confianza y sensibilidad a vencimientos; 4) no llamar `trade` ni conectarse a cuenta DEMO autenticada sin infraestructura privada y autorización independiente. Ningún resultado histórico constituye rentabilidad real.

**Resultado:** conectividad pública y pruebas verificadas. Se corrigieron validación y documentación, sin operaciones. No hay evidencia de rentabilidad consistente o de ganancias reales.
