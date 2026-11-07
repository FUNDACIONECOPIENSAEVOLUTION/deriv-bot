# Plan de integración: Deriv DEMO y evaluación verificable

Fecha: 2026-11-07. Proyecto: `FUNDACIONECOPIENSAEVOLUTION/deriv-bot`.

## Principio

**La cuenta DEMO es gratuita y usa saldo virtual.** Un contrato de USD 0,10 se pagaría con fondos virtuales si Deriv lo cotiza y permite comprarlo. No es una cuota por acceder al demo. Las APIs de terceros para IA pueden tener costos separados.

## Estados explícitos

1. `PAPER`: pronósticos/contabilidad hipotéticos, no son órdenes al broker.
2. `BROKER_DEMO_QUOTE`: cotización oficial en cuenta demo, **sin buy** (implementado en PR #11, pendiente de validación en producción).
3. `BROKER_DEMO_TRADING`: solo en etapa posterior, con orden real **en saldo virtual**, monitoreada y conciliada contra el broker; bloqueada por defecto.
4. `BROKER_REAL`: deshabilitado y sin ruta de compra. Un 70-80 % de acierto no lo habilita automáticamente.

## Cadena de ejecución demo pendiente

- OAuth oficial con PKCE, únicamente cuenta `account_type=demo`, `currency=USD`, `status=active`, y nunca permisos de pago o retiro.
- Obtener OTP por REST, conectar exclusivamente a `/ws/demo`; rechazar cualquier URL de cuenta real.
- Confirmar `contracts_for` y una `proposal` válida; si USD 0,10 o 20 ticks no son admitidos, mostrar el rechazo, sin aumentar el stake automáticamente.
- Después de autorización manual de inicio de experimento DEMO, motor de reglas reproducible genera señal. Validar límites antes de cada orden. Una sola orden demo a la vez.
- Emitir `buy` **solo en demo**, con propuesta cotizada y precio máximo fijo aceptado; jamás comprar en un socket `/real`.
- Persistir cada identificador de contrato y estado de compra antes de permitir otra orden; ante desconexión, reconciliar con el historial del broker. Estado desconocido = nuevas compras bloqueadas.
- Vigilar `proposal_open_contract` hasta vencimiento; registrar payout, ganancia/pérdida, comisiones y tiempos. Deduplicar eventos. Nunca inventar resultados.
- Límite inicial propuesto, **solo virtual**: máximo USD 0,10 por contrato, pérdida diaria máxima USD 0,30, máximo 12 contratos por día, un contrato simultáneo, parada inmediata ante errores consecutivos o datos antiguos. Si el mínimo permitido por Deriv excede USD 0,10, no modificarlo sin decisión posterior del usuario.
- Guardar en SQLite los resultados DEMO por `contract_id`, fecha, predicción, resultado oficial, valor gastado, payout, comisiones, proveedor de señal, versión de estrategia y clasificación real/virtual. Informes CSV, historial y métricas verificadas.

## Métricas antes de considerar dinero real

- Porcentaje de acierto validado, tasa de rechazo, ganancia neta, retorno sobre capital, payout efectivo, expectativa por operación, drawdown máximo, intervalos de confianza, desviaciones por mercado/horario, frecuencia de operaciones y errores de red.
- Separar entrenamiento/backtest y evaluación fuera de muestra; prohibido seleccionar únicamente operaciones ganadoras.
- Como objetivo de investigación usar 70–80 % de acierto, **no como condición suficiente ni garantía de ganancia**. No automatizar el paso a real. Requiere revisión de rentabilidad después de costos, pérdidas máximas, y autorización expresa del titular.
- La transición a dinero real exigirá otro proceso de seguridad, permisos mínimos, límites de riesgo y botón de habilitación manual separado, después de auditar resultados.

## IA multiagente

- La IA no se conecta por sí misma desde una ventana de ChatGPT a una cuenta persistente de Deriv. El Worker o un backend privado debe llamar APIs autorizadas de OpenAI/Gemini/DeepSeek/etc., si hay claves y cuota disponibles.
- Las claves se almacenan **solo en secretos del servidor**, nunca en repositorio público ni frontend.
- Cada modelo devuelve `UP` / `DOWN` / `HOLD` + confianza y justificación estructurada. El supervisor de riesgo aplica controles independientes y puede bloquear todas las órdenes.
- Usar primero señales deterministas sin costos API. Integrar modelos uno a uno, medir latencia, costos y aportación estadística neta. Acuerdo de varios modelos no implica certeza.

## Comprobaciones de aceptación

- Todas las pruebas y typecheck aprobadas, más verificación real de quote en Cloudflare con cuenta demo autorizada.
- DEMO `buy` nunca puede ejecutarse en el modo quote; pruebas que confirman que `/real` siempre se rechaza.
- Confirmación de historial real de contratos **DEMO** con al menos una compra virtual consentida, liquidación y conciliación, sin dinero real.
- Validación 24 horas de continuidad, reinicios y conservación de registros. Si el sistema no pudo verificar liquidación, informar la incertidumbre y bloquear nuevas órdenes.

Documentación oficial: https://developers.deriv.com/docs/workflows/ , https://developers.deriv.com/docs/trading/proposal/ , https://developers.deriv.com/docs/trading/buy/ , https://developers.deriv.com/docs/trading/proposal-open-contract/ .
