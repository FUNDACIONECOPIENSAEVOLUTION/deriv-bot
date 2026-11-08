# Auditoría de latencia y conexión DEMO — actualización v11.1

La operación principal es Deriv DEMO. PAPER es opcional para investigación y NO controla la conexión ni los contratos DEMO.

## Antes de cada BUY
- Elegir mercado y dirección automáticamente con 150 ticks públicos recientes, SMA 8/21 y RSI. Estos indicadores no garantizan beneficios.
- Validar propuesta oficial en canal DEMO; mantener simultáneamente un stream de ticks por mercado.
- Rechazar si el último precio o el timestamp del tick cambió con respecto al análisis.
- Descartar una señal que haya alcanzado 1 segundo desde su recepción, o una reserva que tarde 1000 ms o más. Cancelar solo una reserva cuando la orden aún NO se haya enviado. Si existe duda sobre BUY, detener y reconciliar, nunca reintentar.
- El servidor conserva su comprobación independiente de edad de señal DEMO hasta 2 segundos al reservar; la comprobación más estricta ocurre en navegador antes de enviar.
- Tras el BUY registrar latencia del acuse; no confundir acuse con ejecución ni liquidación.

## CSV y mediciones
Para próximas tandas: latencia_propuesta_ms, latencia_reserva_ms, edad_senal_antes_buy_ms, latencia_acuse_deriv_ms, último tick, sesión y navegación de la página.
Las marcas temporales del mercado tienen precisión de segundos; una latencia real extremo a extremo menor de un segundo no está garantizada por el broker o la red.
No inventar evidencia de F5 o desconexión en CSV históricos.

## Conectividad
- La página siempre consulta la sesión DEMO por separado de PAPER.
- La salud del Worker no confirma OAuth. El propietario puede necesitar renovar la autorización en Deriv con su App ID público.
- El diagnóstico público de Durable Objects no expone cuenta, saldo, ni secretos.
- La tarea periódica revisa riesgos y conciliación DEMO antes de intentar mantenimiento PAPER; no envía compras usando señales PAPER.

## Aprendizaje experimental
Comparar por tanda y mercado las compras ganadas/perdidas, dirección, RSI/SMA, edad del tick, latencias y desviación de entrada. Las simulaciones pueden aportar una hipótesis, pero no constituyen un modelo entrenado ni validan probabilidades de acierto. Medir resultados fuera de muestra antes de ajustar reglas.

## Publicación
Cada cambio publicado aumenta exactamente +0,1 en release.json por el flujo GitHub Actions. Verificar versión de GitHub Pages, Cloudflare y salud de DEMO. No habilitar REAL.