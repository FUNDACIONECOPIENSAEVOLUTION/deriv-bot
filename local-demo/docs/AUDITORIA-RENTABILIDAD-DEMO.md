# Auditoria de rentabilidad DEMO por politica y mercado

La ruta local `GET http://127.0.0.1:8765/api/learning/profitability` devuelve un informe **solo lectura** basado en contratos realmente liquidados por Deriv, no en rechazos ni en operaciones PAPER.

- Resume total de compras, ganadas, perdidas, dinero apostado, beneficio neto, ROI, ganancia/perdida normalizadas por stake y tasa de acierto minima para cubrir costos.
- Desglosa por version, politica exploratoria, mercado, direccion, horizonte de ticks, mercado+direccion y motivo de senal.
- Para cada grupo realiza un corte **cronologico 70% de entrenamiento / 30% posterior**, calculando P&L separado, punto de equilibrio real y limite inferior Wilson 95% cuando es aplicable.
- Expone grupos de latencia del tick en el momento de comprar: 0-300 ms, 301-750 ms y 751 ms en adelante.
- Exige al menos 60 compras en entrenamiento y 30 posteriores antes de informar siquiera una observacion favorable preliminar. Cada grupo se analiza **sin** corregir multiples comparaciones y **sin** diagnosticar causalidad; no se usa como motor de ordenes.
- Ninguna observacion concede permiso de compra. El modo REAL sigue bloqueado.

## Por que es necesario

Un 55% de aciertos puede perder dinero si el pago por victoria es menor que la perdida por derrota. A su vez, seleccionar la estrategia que mas acierta entre multiples indices y ventanas, y luego usar esa misma ventana como prueba, puede confundir azar con una ventaja.

Esta ruta no justifica reactivar operaciones reales ni convertir el 60% de una muestra antigua en una expectativa de rendimiento futuro.

## Pruebas

`node --test test/learning-profitability.test.mjs` dentro de `local-demo`.

Esta contribucion esta preparada para revisar e incorporar a `pc-local`, NO modifica `local-demo/data/`, no cambia las reglas de BUY y no debe marcarse como publicacion nueva sin pasar CI y el flujo de empaquetado Windows (+0.1).
