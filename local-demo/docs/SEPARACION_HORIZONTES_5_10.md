# Separación de modelos 5 y 10 ticks y estado real de órdenes DEMO

## Hallazgo
- Ambos horizontes ya se calculaban separadamente en `tick-horizon-model.mjs`, pero el selector `AUTO` de `demo-burst.mjs` elegía 5 u 10 ticks por la evidencia retrospectiva y podía alternar en la misma tanda. No se han detectado compras de 10 ticks liquidadas como si fueran de 5: `duration_ticks` se guarda en cada contrato y la revalidación antes del BUY comprueba el horizonte.
- La mezcla en AUTO puede complicar evaluar estrategias, por lo que se introduce un modo **RESEARCH_TEN_ONLY** que filtra los candidatos a `durationTicks===10` antes de seleccionar. **RESEARCH_FIVE_ONLY** ya existía. `RESEARCH_DEMO` sigue siendo la modalidad mixta AUTO; nada cambia de forma automática en la política de compra anterior.
- Los modos exclusivos están disponibles en el menú de tandas y programas, solo bajo autorización local en cuenta DEMO. Usan el mismo sistema de protección global, reducción de apuesta, conciliación de órdenes y límites diarios. No abren dos ejecutores simultáneos independientes.

## Resultado del CSV histórico disponible (1725 filas, con 1146 SETTLED y 579 REJECTED)
- 5 ticks: 308 SETTLED, 160 ganadas, 148 perdidas, acierto 51.95%, PnL neto **-US$6.28**. Último 30% cronológico: 93 compras, 47.31%, **-US$9.98**.
- 10 ticks: 460 SETTLED, 235 ganadas, 225 perdidas, acierto 51.09%, PnL neto **-US$16.12**. Último 30%: 138 compras, 48.55%, **-US$11.64**.
- Sin etiqueta de horizonte: 378 SETTLED, 197 ganadas, 181 perdidas, neto **-US$15.76**. No asignar arbitrariamente a ninguno de los dos.
- Combinado: 1146 SETTLED, 592 victorias, 554 derrotas, neto **-US$38.16**. Estas filas son pasadas; no prueban la ejecución de compras actuales ni ventaja futura.
- Algunas políticas dentro de cada horizonte fueron positivas en muestra retrospectiva; no habilitarlas automáticamente sin evaluación cronológica prospectiva independiente.

## Verificación desde PC
Ruta local solo lectura:
`GET http://127.0.0.1:8765/api/lab/horizons`
Devuelve por `TICK_5`, `TICK_10`, `UNLABELED` y `OTHER`: SETTLED, aciertos, pérdidas, neto oficial en centavos, rechazos, OPEN, UNKNOWN, PENDING_APPROVAL, último BUY y último settlement en SQLite. También muestra si programa/tanda está corriendo en el proceso local y si la cuenta DEMO está conectada.

- **Nunca confundir estado RUNNING de un programa con operaciones ejecutadas**: si `OPEN=0` y no cambia la fecha de BUY, puede estar esperando una señal, no comprando.
- Los datos de SQLite son locales y el endpoint está ligado a `127.0.0.1`: no se puede inferir actividad del computador leyendo el repositorio GitHub.
- Compras `UNKNOWN` exigen conciliación oficial, no reintentar ni asumir pérdida.
- No exportar credenciales, PAT ni datos internos `local-demo/data/`.

## Oro, plata y otras modalidades
- El observatorio de precio **solo lectura** agrega plata `XAG/USD` a los precios externos (junto a oro `XAU/USD`), si `active_symbols` del flujo público los presenta. **No son instrumentos de entrada del motor sintético actual**.
- Deriv comercializa opciones y CFD sobre materias primas, pero su disponibilidad por cuenta y símbolos se comprueba en tiempo real con `active_symbols` + `contracts_for`; la cuenta MT5 DEMO para CFD es independiente y requiere control de spreads, margen, stop y riesgo. No habilitar BUY de oro/plata con la API de índices sintéticos por inferencia.
- No existe garantía de rentabilidad diaria. Para probar si es mejor 5, 10, oro/plata o dígitos hay que medir retorno neto y drawdown fuera de muestra, no solo win-rate.

## Seguridad
No se cambia el programa multibot actual A 5 ticks + B dígitos en sombra; estos nuevos modos permiten ensayos **manuales independientes**, y no ordenan compras al instalarse.
REAL permanece completamente deshabilitado.

Documentación oficial: https://developers.deriv.com/docs/data/contracts-for/ ; https://deriv.com/es/markets/commodities ; https://deriv.com/es/trading-platforms/mt5/mt5-demo-account
