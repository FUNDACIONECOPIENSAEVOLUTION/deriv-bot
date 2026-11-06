# Panel visual y plataformas

El monitor privado muestra velas de un minuto, marcas de entradas y salidas virtuales, una curva de saldo y el motivo de las decisiones. El botón «Abrir en otra ventana» abre el mismo panel en una ventana de seguimiento. No incluye contraseñas en la dirección ni habilita acceso público al historial.

## Qué está conectado

| Plataforma | Datos | Operaciones de esta versión |
| --- | --- | --- |
| Deriv | Historial OHLC y ticks del WebSocket público | Simulación propia con USD 10 virtuales |
| Binance | Velas públicas BTCUSDT mediante su API de datos | Consulta; sin motor de ejecución |
| Coinbase | Velas públicas BTC-USD mediante Exchange API | Consulta; sin motor de ejecución |

El selector cambia la vista de precios. No cambia la plataforma de la simulación ni mezcla sus operaciones con un gráfico cripto. En las vistas cripto se desactiva «Iniciar simulación»; «Pausar Deriv» continúa identificando el motor que controla. No se conecta una cuenta, no se solicita una clave de exchange y no se coloca una orden.

## Cómo interpretar los gráficos

Deriv actualiza el panel cada cinco segundos mientras está visible. El servidor recibe cada tick validado y agrega sus extremos a velas de un minuto. Al conectar solicita hasta 180 velas históricas. Una vela construida parcialmente o aún abierta se identifica en su lectura OHLC; los minutos sin datos permanecen como huecos. El estado de conexión y la antigüedad del precio son independientes de que exista un dibujo histórico.

Las marcas E↑ / E↓ indican entradas virtuales, X una liquidación hipotética y V una invalidación sin resultado. El historial conserva hora de Colombia, precios, indicadores de entrada y causa de salida. Una V utiliza el precio de entrada solo como referencia visual: no existe un precio de liquidación para esa interrupción. Las marcas fuera de la ventana permanecen en el registro y en el CSV.

La curva utiliza resultados liquidados en centavos enteros del registro visible de 30 operaciones. Parte del saldo inmediatamente anterior a esas liquidaciones; no proyecta resultados ni cuenta OPEN o VOID como beneficios.

El motor aplica SMA de 8 y 21 ticks, RSI de 14 cambios y un filtro de volatilidad. Los indicadores se registran en la entrada. No se ha conectado un modelo de IA, ni se presenta la señal como una probabilidad estimada de acierto. La salida ocurre al completar el horizonte de ticks; si se interrumpe el servicio, la posición se invalida. Las reglas y el pago hipotético no reproducen un contrato Deriv ni el beneficio de una compraventa spot de BTC.

Binance y Coinbase se consultan cada 30 segundos solo mientras su vista está seleccionada. El servidor admite exclusivamente dos proveedores y productos fijados, limita el tamaño de las respuestas y valida OHLC, fechas, orden y duplicados. Si un proveedor o una región rechaza la consulta, se muestra que no hay datos; no se cambia de región ni se intenta eludir restricciones.

## Próxima etapa para otras plataformas

Los conectores públicos comparten un formato de velas y un catálogo de capacidades. Antes de añadir simulación spot hay que implementar contabilidad de cantidad, comisiones, spread, mínimos y redondeo propios del producto. No se reutiliza el supuesto de pago del 80 % de Deriv como si fuera una rentabilidad cripto. La operación real y la autenticación de cuentas no están implementadas.

## Fuentes oficiales

- [Deriv: datos de mercado y WebSocket público](https://developers.deriv.com/docs/workflows/)
- [Deriv: historial de ticks y velas](https://developers.deriv.com/comparison/ticks-history/)
- [Binance: direcciones exclusivas de datos públicos](https://developers.binance.com/docs/binance-spot-api-docs/faqs/market_data_only)
- [Coinbase: velas por producto](https://docs.cdp.coinbase.com/api-reference/exchange-api/rest-api/products/get-product-candles)
