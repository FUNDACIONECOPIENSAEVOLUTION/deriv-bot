# Evaluación apareada 10 x 10 + 10 x 10 de seis métodos por índice (DEMO)

## Solicitud y contraste con la realidad de Deriv

El objetivo del usuario: autorizar una vez dos programas de 10 tandas x 10 compras cada uno, uno a 5 ticks y otro a 10 ticks, con importe deseado USD 0.10 por contrato, comparando 6 métodos solos y sus combinaciones de 2/3, manteniendo protección verde. **Para ejecutar esos 200 contratos con USD 0.10 se necesita validar por instrumento la disponibilidad real del importe y el pago.** No se puede emitir una sola orden que corresponda a dos duraciones distintas.

La información general oficial de Deriv Trader indica importe inicial desde USD 1: https://deriv.com/trading-platforms/deriv-trader. No significa que se conozca con certeza el mínimo de cada combinación índice/contrato, pero desautoriza asumir USD 0.10. El motor actual de la fundación admite importes de **USD 0.35, 0.50, 0.75, 0.90, 1, 2, 5 y 10**; `demo-program` limita todas las tandas programadas a USD 1. El API local de `POST /api/lab/low-stake-quote` consulta dos propuestas read-only oficiales (CALL 5 y 10 ticks) para el índice autorizado, monto USD 0.10, **nunca hace BUY** y devuelve por separado éxito o rechazo. No modificar los stakes del motor hasta verificar que existe contrato compatible y riesgo transaccional apropiado.

Si se impusiera USD 1 por defecto, 200 apuestas sumarían exposición nominal de USD 200 frente a USD 20 del presupuesto solicitado. **Prohibido realizar esa sustitución automática.**

## Qué quedó implementado

Una nueva sección en `localhost:8765` llamada **Experimento único 20 × 10 · 5 y 10 ticks · seis métodos** permite iniciar/parar una sesión de investigación **sin compras adicionales**, usando `POST /api/lab/paired-methods/start` y `stop` con autorización local. Es un solo botón, pero exige explícitamente la frase de confirmación `INICIAR ESTUDIO 20X10 SIN COMPRAS`. No consume saldo DEMO ni modifica el programa de compras anterior.

Cada índice alimentado por el WebSocket público genera **100 momentos de entrada distintos** (10 tandas x 10); la misma entrada se evalúa a 5 ticks y a 10 ticks posteriores. En consecuencia existen **200 evaluaciones de horizonte por índice**, NO 200 contratos ejecutados. Las observaciones de un mismo índice se espacian 10 ticks para evitar superposición entre el final de la predicción de 10 ticks anterior y el inicio de la siguiente. Se incluyen los índices que Deriv anuncie para investigación, como `R_20` si existe, sin añadirlos a los activos autorizados de BUY. El experimento conserva su propia ID de ejecución y SQLite local; nuevas conexiones o gaps invalidan oportunidades pendientes y no inventan desenlaces.

## Diseño imparcial de métodos y consenso

Seis reglas congeladas, independientes del resultado posterior: `MOMENTUM_10`, `EMA_8_21`, `MACD_12_26_9`, `RSI14_REVERSAL`, `BOLLINGER20_REVERSAL`, `ER10_TREND`.

* 6 **solas**: cada regla es una condición de compra hipotética si señala CALL/PUT.
* 15 **parejas**: todas las combinaciones de dos reglas, ambas deben emitir la **misma** CALL/PUT.
* 20 **tríos**: todas las combinaciones de tres reglas, las tres deben emitir la **misma** CALL/PUT.
* En conflictos o reglas que no dan señal se registra **ABSTENCIÓN**, no se contabiliza como fallo ni como contrato comprado. El porcentaje de cobertura (señales / oportunidades) acompaña al acierto, porque un 90% con solo dos pronósticos no justifica operar.
* Cada combinación se mide por índice y duración. Se guardan 100 oportunidades × 2 horizontes × 41 combinaciones por índice. Las oportunidades se registran con precios y ticks observados, no Ask, Payout ni precio de entrada del contrato.

Se muestran aciertos, errores, empates, porcentaje de cobertura y muestra de los últimos 30 momentos. Una combinación sin ≥30 señales prospectivas de los últimos 30 momentos se marca insuficiente. **Ninguna combinación obtiene permiso BUY por este cálculo**. La selección repetida entre 41 grupos y múltiples índices exige corregir pruebas múltiples y evaluar en un período cronológico completamente nuevo antes de considerar cambios al motor.

## Protección verde y permisos

El programa existente `10x10` de Rise/Fall DEMO sigue con `TRAILING_GREEN`, veto de riesgo, reducción 1→0.50 tras dos pérdidas (si configurada) y parada en determinadas condiciones. Estos límites no se aplican al comparador de predicciones porque no compra ni recibe P&L, y **no garantizan beneficios**. No se agrega Martingale ni progresión de apuesta por pérdidas.

Si el broker aceptara USD 0.10 en ambos horizontes, un desarrollo posterior de compras tendría que asegurar: mismo consentimiento local para los dos tipos de contratos, ledger con presupuesto nominal total USD 20 y exposición reservada atómicamente, riesgo diario conjunto, cantidad máxima de 100 contratos por horizonte y 10 por tanda, control OPEN/UNKNOWN, conciliación previa, pago oficial que cubra punto de equilibrio, prohibición de reinicio automático tras desconexión, y stops por pérdida sin perseguir rojo. El número máximo de compras representa **tope, no obligación** cuando hay señales adversas.

## HTTP

* `GET /api/lab/paired-methods`: estado, índice, 5/10 ticks cerrados, 6 métodos, combinaciones 1/2/3, abstenciones y resultados en SQLite (solo lectura).
* `POST /api/lab/paired-methods/start` con confirmación local: inicia estudio SIN BUY.
* `POST /api/lab/paired-methods/stop`: detiene estudio; no altera programa financiero anterior.
* `POST /api/lab/low-stake-quote`, `{"symbol":"1HZ10V"}`: cotiza USD 0.10 por contrato CALL de 5 y 10 ticks con el WebSocket DEMO autenticado. No usa propuesta para comprar, nunca autoriza nuevas apuestas.

## Estado de evidencia

Al momento de la implementación NO están confirmadas operaciones de 10 centavos ni rentabilidad positiva futura para alguno de los 41 grupos. No inventar «la mejor estrategia» a partir de un CSV con neto negativo, ni convertir la predicción sombra en BUY. No activar REAL. No publicar secretos ni datos locales en GitHub.
