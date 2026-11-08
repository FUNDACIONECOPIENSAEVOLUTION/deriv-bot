# Tanda de hasta 10 contratos DEMO independientes — Ecopiensa

**Alcance:** cuenta Deriv Options `demo`, mercado R_100, CALL/PUT a cinco ticks. No hay soporte para dinero real. El experimento `PAPER` de US$10 es distinto y no forma parte de este registro.

## Diferencia fundamental

El valor del parámetro `count=10` significa **hasta diez compras distintas** de US$1 virtual cada una, nunca una sola compra ni diez posiciones de PAPER. Cada compra tiene su propio `proposal` (cotización), reserva durable `UNKNOWN` anterior al único `buy`, respuesta `contract_id`, exposición y liquidación `SETTLED`. Solo aumentamos `confirmed` tras un acuse válido del broker. Hasta diez órdenes pueden quedar abiertas durante la ejecución, pero no garantizamos que todas coincidan en el tiempo, pues los contratos de cinco ticks pueden vencer antes de concluir la tanda.

| Orden confirmada | Apuesta acumulada | Nota |
|---|---:|---|
| 1 | US$1 | Una compra oficial, no diez |
| 5 | US$5 | Cinco contratos distintos |
| 10 | US$10 | Diez contratos, presupuesto máximo por tanda |

La apuesta individual de esta función se conserva en **US$1** para mantenerse dentro del importe máximo previamente validado. La selección manual de US$0,35/0,50/0,75/0,90/1 pertenece al flujo **una compra**, no modifica esta tanda. Si se pide un tamaño distinto de diez, la función no redistribuye sin validar importes mayores a US$1.

El presupuesto es **un techo de gasto bruto, no un objetivo de ganancia**: las opciones perdedoras pueden perder toda la apuesta virtual.

## Cupos reales de la tanda existente

El libro actual incluye los contratos anteriores; el contador de diez nunca se reinicia silenciosamente. Si ya existen dos compras en la tanda (p. ej. US$0,35 + US$0,50), el máximo de **compras nuevas** antes de cerrar esa tanda es ocho. Solo tras liquidar los diez contratos y comprobar el cierre del bloque se habilita la siguiente tanda de diez. Se mantienen límites del piloto: 50 compras DEMO y US$50 de apuestas brutas acumuladas.

## Arquitectura

- `cloudflare/src/demo-burst-policy.ts`: límite de 1–10 solicitudes, US$1 por contrato, US$10/tanda, exposición y saldo mínimo US$9.900.
- `cloudflare/src/deriv-demo.ts`: Durable Object con `beginDemoBurst`, `reserveDemoBurst`, `acknowledgeDemoBurst`, `settleDemoBurst`, estado por contrato y bloqueo de compras si hay `UNKNOWN`.
- `cloudflare/src/index.ts`: rutas privadas `/api/deriv/demo/burst/{begin,reserve,ack,halt,reconcile,settle}` y `GET .../status`. Requieren autorización del titular, protección de origen y cabecera de control; no incluyen rutas `ws/real`.
- `runtime/dashboard.html`: botón **Bot decide y compra hasta 10 contratos DEMO**, cantidad 1–10, aprobación explícita con dirección CALL/PUT decidida por señal SMA/RSI actual del bot. El navegador recibe OTP corto para conectar exclusivamente a `/ws/demo`, emite N pares proposal/buy de uno en uno **sin esperar el cierre de cada contrato**, registra los diez acuses y consulta liquidaciones.
- Tras cada **ACK**, actualiza el total comprometido y solicita el saldo oficial REST, incluso con operaciones abiertas. Tras liquidar, incorpora el P&L realizado a la lista, sin confundirlo con la curva PAPER.

Si Deriv rechaza una propuesta, desaparece la conexión, la pestaña queda oculta, el dueño detiene el envío o una orden no tiene acuse, **se detienen las compras adicionales sin reintentar la orden incierta**. Los contratos ya comprados permanecen vivos y hay que reconciliarlos desde el botón de solo lectura. El broker puede liquidar algunos contratos antes de que finalice la tanda: no prometemos diez posiciones abiertas simultáneamente en el mismo instante.

## ChatGPT y MCP

Un gateway MCP de investigación está desplegado, pero este chat **no tiene una conexión autenticada** para escribir operaciones al Worker. Las órdenes DEMO se envían desde el panel autenticado después de la confirmación visible del dueño. Tener código MCP publicado **no significa que ChatGPT pueda enviar compras desde esta conversación**. No compartas OTP, tokens o credenciales por chat ni los coloques en GitHub.

## Datos y evaluación

Por cada contrato: `contract_id`, dirección, apuesta, resultado neto (si está liquidado), estado OPEN/SETTLED/UNKNOWN, SMA, RSI, volatilidad y fuente de evidencia. Un saldo oficial antes/después de la compra permite observar la deducción de apuestas sin esperar liquidaciones; una variación de precio del índice no altera por sí misma el saldo. Las liquidaciones observadas por el navegador se etiquetan como no verificadas independientemente por el servidor.
