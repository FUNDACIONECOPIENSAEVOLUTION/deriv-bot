# Plan de entrenamiento Deriv DEMO — primera tanda de 10 contratos virtuales

**Fecha de revisión:** 2026-11-07. **Proyecto:** FUNDACIONECOPIENSAEVOLUTION/deriv-bot.
**Estado:** desarrollado en PR #11 (borrador), **no fusionado, no desplegado y sin operaciones con la cuenta DEMO del titular verificadas**.

## Alcance y presupuesto

- Cuenta oficial de Deriv **DEMO** exclusivamente (saldo virtual, sin depósitos); el saldo oficial no es el presupuesto de prueba.
- Asignación interna del primer experimento: **US$10 virtuales**.
- **Diez compras como máximo en la primera tanda**, con **US$1 virtual por contrato**. Máximo diez abiertas a la vez; cada compra usa una propuesta verificada de Deriv. Las propuestas rechazadas quedan anotadas y no son operaciones ganadoras ni perdedoras.
- Duración inicial: 20 ticks, instrumento R_100, dirección **CALL** si la señal es alcista o **PUT** si es bajista. La señal procede de reglas públicas SMA/RSI, no de una IA que haya adquirido certeza predictiva.
- Las diez compras se contabilizan en SQLite con identificador de contrato, señal, indicadores al entrar y respuesta del broker. Al registrar la décima, **no abrir más compras**, aun con saldo positivo, hasta estudiar sus liquidaciones y crear una nueva fase aprobada.
- Exposición máxima simultánea US$10 virtuales; evaluación del riesgo considera todas las posiciones abiertas y el resultado neto confirmado. Además, pausa de día si diez o más operaciones liquidadas dejan resultado neto diario cero o negativo. Una compra con resultado desconocido detiene todo.
- La cuenta real jamás se conecta desde esta implementación: **no existe ruta /real** ni promoción automática basada en porcentaje de aciertos.

## Fases de seguridad

1. PAPER: señales hipotéticas y cuentas de prueba internas, **no confundir con órdenes al broker**.
2. DEMO_QUOTE: OAuth PKCE, OTP de una cuenta demo USD y propuesta oficial; ninguna compra.
3. DEMO_BUY: requiere secretos del titular en Cloudflare, `DEMO_BUY_ENABLED=true` **solo después de validar conexión**, y acción privada autorizada. El modo automático además requiere `DEMO_AUTO_ENABLED=true` y botón de activación privado.
4. DEMO_SETTLEMENT: conciliar cada contrato con `proposal_open_contract`, registrar ganancia/pérdida y spots si Deriv los suministra. Si se perdió el ACK, la operación queda UNKNOWN y hay que conciliar con el historial oficial antes de permitir más compras.
5. DEMO_ANALYSIS: dividir resultados cronológicamente, diagnosticar pérdidas, neto, expectativa y drawdown. Registrar hipótesis, versionar estrategias, comparar en un lote posterior fuera de muestra. **No se reentrena ChatGPT en tiempo real automáticamente.**
6. Cuenta real: fuera de alcance. Nunca autorizarla por alcanzar 90 %, 100 % ni cualquier otro porcentaje.

## Protocolo para iniciar el primer experimento

- Conectar el panel privado Cloudflare con la cuenta **DEMO activa** de Deriv por el OAuth autorizado. No compartir tokens, contraseñas ni OTP en GitHub, enlaces públicos o mensajes.
- Verificar una cotización oficial de **US$1**, R_100, CALL y PUT, 20 ticks. Si Deriv rechaza ese contrato, **no incrementar el precio ni sustituir el instrumento sin revisar la razón**.
- Verificar una compra de US$1 virtual, su identificación, su liquidación y su registro correcto antes de autorizar la automatización del lote restante.
- Conservar el apagado por defecto en ambos interruptores: `DEMO_BUY_ENABLED=false`, `DEMO_AUTO_ENABLED=false`. Activar **solo DEMO**, cuando lo anterior esté comprobado y el titular haya dado consentimiento operativo dentro del panel privado. Cron revisa cada minuto y como máximo evalúa una compra virtual por minuto cuando hay señal; no es un motor de alta frecuencia.
- El límite de **diez compras acumuladas en la primera tanda** no se restablece automáticamente al cambiar de día ni al reiniciar el Worker.
- Tras terminar, calcular victorias/derrotas, payout efectivo, resultado neto, pérdida máxima, errores de conexión, dirección, RSI y volatilidad. No atribuir la causa de un resultado solo por correlación.
- Aunque la meta de investigación sea 90–100 % de acierto, **10 contratos son una muestra demasiado pequeña para verificar una tasa de éxito reproducible**. Se necesitan más tandas y evaluación prospectiva independiente.
- Si falla la conexión, compra o liquidación: **no inventar resultados, no repetir órdenes inciertas y no activar fondos reales**.

## Fuentes oficiales

- https://developers.deriv.com/docs/options/ws-demo/
- https://developers.deriv.com/docs/options/websocket/
- https://developers.deriv.com/docs/trading/proposal/
- https://developers.deriv.com/docs/trading/buy/
- https://developers.deriv.com/docs/trading/proposal-open-contract/
- https://developers.deriv.com/docs/best-practices/
