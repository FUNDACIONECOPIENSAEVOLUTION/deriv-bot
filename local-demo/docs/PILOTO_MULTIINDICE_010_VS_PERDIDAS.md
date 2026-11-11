# Piloto multíndice a diez centavos y auditoría de pérdida (DEMO, v18.6)

## Evidencia local (no subir el CSV)
Datos provistos en `ecopiensa-historial-demo (1).csv`, 2056 registros, 1360 SETTLED, 695 REJECTED, 1 CANCELLED. No incluir REJECTED como pérdida ni inferir que los indicadores "causan" el resultado. Ganancias brutas +US$549.23, pérdidas −US$619.05, **neto −US$69.82**, 687 ganadores (50.51 %), 673 perdedores (49.49 %), ROI −5.63 % sobre US$1239.30 comprado. Victoria media +US$0.79946; derrota media −US$0.91984: tasa de equilibrio aproximada 53.5 %. 695 REJECTED: 385 `DEMO_SIGNAL_STALE_OR_CONTRARY`, 305 `DEMO_QUOTE_STALE`, 4 `DEMO_EXPLORATORY_NO_OBSERVED_EDGE`, 1 `DERIV_HTTP_503`. NO eliminar controles por velocidad.

Apuestas de US$1: 1121 SETTLED, 49.51 % de aciertos, −US$74.58. Apuestas de US$0.50: 231, 54.98 %, +US$4.26. Esta comparación observacional no controla versión, mercado ni fecha, por lo que no demuestra que reducir stake mejore el porcentaje de aciertos.

Mercado histórico con beneficio pequeño: 1HZ50V 206 (54.85 %; +US$2.18), 1HZ100V 161 (53.42 %; +US$3.65), 1HZ10V 151 (54.30 %; +US$1.78); varios mercados con pérdida: 1HZ75V (−US$9.73), 1HZ30V (−US$12.68), 1HZ15V (−US$11.92), 1HZ90V (−US$14.62), R_25 (−US$8.12), R_50 (−US$7.40). Ningún mercado tiene rentabilidad futura confirmada. P&L total corresponde a varias versiones y no representa el desempeño aislado de v18.5.

## API Deriv actual

* `proposal` devuelve una cotización; el mínimo por mercado/tipo/horizonte solo se comprueba en el broker con la cuenta Opciones DEMO, no se deduce de un video o página genérica.
* `buy` autenticado usa un ID de propuesta válido. En la API v2 la propuesta que se va a comprar debe tener **`subscribe: 1`**, en la misma conexión. Fuentes: https://developers.deriv.com/es/comparison/proposal/ y https://developers.deriv.com/es/docs/best-practices/ . Se corrigió el comprador: antes generaba `proposal` sin `subscribe:1`. Se conserva precio máximo y NO se reintenta una compra incierta.
* Datos de mercado `active_symbols` no prueban la elegibilidad de opciones/importe. Referencia: https://developers.deriv.com/es/docs/workflows/ .
* Volatility Indices usan recorrido aleatorio algorítmico; tendencias de RSI, MACD o EMA no demuestran ventaja para el siguiente tick. Referencia: https://experts.deriv.com/es/insights/the-indicators-that-dont-work-on-derived-indices .

## Piloto opcional: botón multíndice

Nuevo componente `multi-index-micro-pilot.mjs`. El botón local **Iniciar compras DEMO de índices disponibles · US$0,10** requiere casilla y texto interno `AUTORIZAR DEMO MULTIINDICE 0.10 MAXIMO 2 USD`. Solo una sesión activa, sin reinicio automático tras cerrar PC.

El programa toma el universo autorizado existente: `R_10,R_25,R_50,R_75,R_100,1HZ10V,1HZ25V,1HZ50V,1HZ75V,1HZ100V` SI están anunciados por Deriv. **Los índices descubiertos únicamente para investigación**, como R_20 o 1HZ90V, no reciben órdenes por esta ruta. Cada índice autorizado puede originar **como máximo una operación a 5 ticks y otra a 10 ticks** si:
1. Historial íntegro, 60 velas, precio fresco y EMA20/50 + RSI14 + momentum de v13.6 coinciden con el modelo estadístico del mismo horizonte y pasa veto de riesgo.
2. El broker acepta una **propuesta de exactamente US$0.10** para el índice/dirección/horizonte. Propuesta de preflight de solo lectura; no reutiliza ID.
3. Se verifica balance DEMO oficial, se crea intención rastreable con source `LOCAL_OWNER_MULTIINDEX_010`, se revalida antes de BUY y se compra con nueva propuesta streaming. No hay fallback a US$0.35 ni US$1; quote inválida = no compra.
4. Se confirma y liquida la operación antes de abrir otra. UNKNOWN/OPEN -> pausa inmediata hasta conciliación. El motor financiero solo permite micro-stake cuando el origen interno exclusivo y el modo `DEMO_136_CONSENSUS_5_10` coinciden. La ruta manual y MCP NO pueden bajar a US$0.10 por accidente.

Exposición **máxima nominal**: 20 contratos x US$0.10 = **US$2** en el piloto, no 200 contratos. Un contrato por par índice/horizonte durante esta prueba; si no aparece señal o el broker no acepta el importe, habrá menos operaciones o cero. Corta antes si el neto llega a −US$0.50, a +US$0.25 (proteger resultado alcanzado), o tras tres pérdidas consecutivas. Pérdidas anteriores y límites de la cuenta DEMO siguen activos. No garantía de ganancia.

Comienzo y control locales:
- `GET /api/lab/multiindex-micro` informa la sesión, límites, señales y resultados liquidados por par. UNKNOWN es **no confirmado**, no se cuenta como BUY confirmado.
- `POST /api/lab/multiindex-micro/start` requiere mismo control de origen de las demás rutas y consentimiento literal local.
- `POST /api/lab/multiindex-micro/stop`: parada al terminar la compra actual sin reintentar.
- Histórico exportado desde `/api/demo/orders.csv` incluye columna `source` para distinguir piloto multíndice de tandas normales.

NO equivale a un ensayo económico de los 41 métodos del laboratorio, que siguen siendo evaluaciones de ticks sin dinero ni contratos. El piloto compra solo si coinciden v13.6 y el predictor 5/10, por seguridad experimental. Más volumen no mejora el acierto por sí mismo; si no hay cotización de diez centavos se recomienda continuar en sombra y no cambiar a una apuesta diez veces mayor.
