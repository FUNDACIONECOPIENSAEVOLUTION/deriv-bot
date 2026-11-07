# Plan de activación y entrenamiento — Deriv DEMO

**Actualizado:** 07/11/2026. **Estado:** código revisado en PR #11, sin despliegue autenticado ni contratos DEMO ejecutados.

## Objetivo

Investigar la frecuencia de acierto y el resultado neto en operaciones CALL/PUT de Deriv utilizando **exclusivamente saldo DEMO virtual**. No se promete una tasa del 90–100 % ni beneficios futuros. La estrategia de señales SMA/RSI es experimental, no un modelo de aprendizaje automático que se reentrene por sí mismo.

## Variables de ejecución propuestas

- Cuenta demo USD con saldo inicial **verificado** por el broker. Referencia esperada **US$10.000**, piso de parada adicional **US$9.900**. Ese límite de US$100 es distinto del tope inicial de US$10 de compras virtuales.
- Importes por operación: **US$0,35, US$0,50, US$0,75, US$1 virtuales**. Se rotan para comparar aceptación y valor esperado; no se aumenta ninguna apuesta por una pérdida o rechazo.
- **Primera fase obligatoria:** máximo **10 contratos comprados** y suma máxima **US$10 virtuales de importes comprometidos en esas compras**, contando contratos abiertos y liquidados. Al completarse cualquiera de los dos topes, nuevas compras se bloquean hasta revisión de los resultados; no se reinicia automáticamente tras cambiar de día. No se confunde este presupuesto de investigación con el saldo DEMO del broker.
- Instrumento R_100, duración 5 ticks, contratos CALL si hay señal UP y PUT si DOWN.
- **Número máximo de contratos abiertos configurable de 1 a 10** en el panel privado, con validación persistente en el Durable Object.
- Automatización voluntaria: por defecto desactivada; evaluaciones de compra como máximo una vez por cron cada minuto. Puede haber cero compras si no hay señal válida.
- Detener nuevas compras ante cuenta no verificada, compra de resultado desconocido, saldo oficial de US$9.900 o menor, o exposición que arriesgue cruzar ese piso. No operar nunca en `/real`.

## Registro y análisis

Registrar: hora, importe cotizado y comprado, dirección CALL/PUT, identificador de contrato, señales SMA/RSI/volatilidad, precio de entrada/salida si lo devuelve Deriv, ganancia/pérdida real **virtual** por contrato, rechazos de cotización, desconexiones y latencia. Distinguir siempre PAPER de DEMO, y no contar como aciertos contratos no liquidados.

Calcular éxito por importe, resultado neto, valor esperado por contrato, factor de beneficio, drawdown y muestras de validación cronológicas. Si una estrategia parece mejorar, probarla en otra tanda independiente para evitar sobreajuste; diez victorias de diez no significan un 100 % de probabilidad futura.

## Secuencia de puesta en marcha

1. Acceder al Cloudflare del titular y verificar el Worker privado actual; confirmar si ya existe algún despliegue y su URL real.
2. Validar configuración de la aplicación Deriv para OAuth2 PKCE y el redirect al Worker privado, **solo con cuenta DEMO**.
3. Desplegar versión aprobada, verificar saldo oficial en el panel junto a las velas, sin reproducir un saldo ficticio de US$10.000.
4. Solicitar una cotización de prueba para cada importe. Si la API no admite un mínimo, registrar el rechazo y continuar con otros importes **sin comprar una cantidad distinta de la solicitada**.
5. Activar con permiso explícito la compra de un contrato **DEMO virtual**, conciliar su ID y resultado oficial. Después probar hasta el límite configurado de simultaneidad.
6. Una vez confirmada la conciliación, activar evaluación DEMO programada; controlar el piso US$9.900 y el presupuesto de Worker/llamadas.
7. Evaluar operaciones cada cierto número de cierres, registrar hipótesis y modificar la estrategia con versiones y tests reproducibles, sin afirmar mejoras no verificadas.

## Seguridad

- Los interruptores `DEMO_BUY_ENABLED=false` y `DEMO_AUTO_ENABLED=false` permanecen desactivados en la configuración del repositorio hasta que se cumplan pasos 1–5.
- El saldo del navegador de Deriv no da permisos de operación al Worker; solo un OAuth oficial válido permite operar.
- No compartir usuario, contraseña, tokens ni OTP por chat, GitHub o enlaces públicos.
- Nunca activar cuenta real automáticamente ni extrapolar estadísticas DEMO a dinero real.

API oficial: https://developers.deriv.com/docs/options/ws-demo/ , https://developers.deriv.com/docs/trading/proposal/ , https://developers.deriv.com/docs/trading/buy/ , https://developers.deriv.com/docs/trading/proposal-open-contract/ .

### Campaña DEMO autorizada — 5 bloques de 10 (07/11/2026)

- El propietario solicita **hasta 50 contratos DEMO**, en **cinco bloques de diez compras confirmadas por Deriv**, sin usar jamás la cuenta real.
- **Límite de importes virtuales por bloque:** US$10 (1.000 centavos); **máximo acumulado de compras:** US$50 (5.000 centavos). Los importes individuales rotan US$0,35 / US$0,50 / US$0,75 / US$1. Un rechazo de precio no autoriza incrementarlo.
- **Hasta diez contratos abiertos a la vez**, configurable por el propietario. El siguiente bloque solo puede comenzar cuando los diez contratos anteriores estén liquidados oficialmente. Si hay orden UNKNOWN, se bloquea y requiere conciliación.
- Un **segundo tope independiente** detiene el entrenamiento cuando el saldo oficial DEMO llega a US$9.900 o la exposición podría atravesarlo desde la referencia US$10.000.
- Se muestra informe de **cada bloque** (compras, liquidados, ganadas, perdidas, P&L y tasa observada), más el histórico total. El porcentaje de acierto no garantiza resultado positivo.
- **Publicar código no inicia operaciones**: el Worker mantiene `DEMO_BUY_ENABLED=false` y `DEMO_AUTO_ENABLED=false` hasta una activación operativa específica tras validar autenticación, cotización y primera compra virtual del broker. La cuenta real permanece fuera del código de ejecución.


### Validación pública de restricciones Deriv (07/11/2026)

Se verificó sin credenciales ni compras que R_100 con CALL/PUT admite propuestas de 5 ticks, mientras que 20 ticks resulta rechazado: Deriv limita la duración en ticks a un máximo de 10 para esas propuestas. También rechazó 0,10 USD con un mínimo de 0,35 USD. Las propuestas CALL de 5 ticks para importes 0,35 / 0,50 / 0,75 / 1 USD y PUT de 1 USD fueron aceptadas en el canal público. **Una propuesta aceptada no confirma una compra o una liquidación.** La cuenta REAL sigue bloqueada.
