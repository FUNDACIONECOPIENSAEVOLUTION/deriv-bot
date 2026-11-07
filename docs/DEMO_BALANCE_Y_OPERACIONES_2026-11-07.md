# Saldo oficial DEMO junto a las velas — alcance y activación

Fecha de revisión: 2026-11-07.
Estado: cambios en PR #11 (borrador); **no publicados ni conectados a la cuenta del titular desde el servidor**.

## Dónde ver el bot

- Panel estático de GitHub Pages (simulador anterior): https://fundacionecopiensaevolution.github.io/deriv-bot/
- Repositorio de código: https://github.com/FUNDACIONECOPIENSAEVOLUTION/deriv-bot
- Panel privado Cloudflare con saldo DEMO, velas y órdenes: incluido en código `runtime/dashboard.html` del PR #11. **No hay URL de despliegue verificada**; no presentar la URL de GitHub Pages como el panel autenticado.

## Saldo y visualización

El panel privado separa estrictamente:
1. Saldo de la cuenta oficial DERIV DEMO (viene de API REST de cuentas autenticadas).
2. Saldo de simulación PAPER (no es dinero de Deriv).
3. Importe comprometido en los contratos virtuales que el broker confirmó como abiertos.
4. Resultado neto DEMO de contratos liquidados por Deriv.
5. Últimos contratos CALL/PUT verificados, importe, estado y ganancia/pérdida.

La información aparece junto a la gráfica de velas y en el bloque de cuenta DEMO. La API REST refresca el saldo periódicamente cuando existe autorización. Si el dato no es reciente o la conexión falla, el panel lo indica y no inventa un saldo.

**Ejemplo de contabilidad:** si hay 10 contratos DEMO comprados por US$1 y ninguna liquidación ha ocurrido, el broker podría presentar US$9.990 de dinero virtual. El panel refleja el saldo devuelto por Deriv y no descuenta ese valor por su cuenta; las liquidaciones modificarán el saldo con el retorno de cada contrato.

## Límites

- 10 posiciones DEMO abiertas simultáneamente como máximo.
- Importes virtuales alternados: US$0,10, US$0,25, US$0,50, US$1 (sin martingala).
- Límite de pérdida virtual total respecto de referencia US$10.000: US$100; al alcanzar US$9.900 o un peor caso previsto con operaciones pendientes, no comprar más. Existen bloqueos ante pérdida de confirmación de compra, cotización obsoleta y cuenta no DEMO.
- Solo se utiliza `/trading/v1/options/ws/demo`; ningún permiso para operar en la cuenta real.
- `DEMO_BUY_ENABLED=false` y `DEMO_AUTO_ENABLED=false` por defecto; la activación requiere validación con la cuenta DEMO auténtica, autorización de ejecución desde el panel y acceso privado de Cloudflare.

## Requisitos pendientes para pasar de código a ejecución

1. Desplegar este PR en el Worker privado existente de Cloudflare y configurar el secreto ADMIN_TOKEN. Requiere acceso autorizado a Cloudflare, que GitHub por sí solo no concede.
2. Verificar OAuth de Deriv para cuenta DEMO, el App ID, el callback y el endpoint OTP. Nunca publicar tokens ni contraseñas.
3. Validar cotizaciones de cada importe sin inventar mínimos. US$0,10 puede no ser aceptado en el contrato elegido.
4. Ejecutar una única compra virtual, confirmar ID de contrato y liquidación y reconciliar el saldo oficial.
5. Habilitar la evaluación automática solo DEMO después de esa validación, revisar límites y cuota Cloudflare.
6. Medir ganancia/pérdida oficial y aciertos en muestras independientes; no puede prometerse 90–100% de aciertos.

**Resultado actual:** no existen órdenes de esta nueva versión ejecutadas o demostradas en la cuenta conectada del usuario. Superar CI no equivale a operar en Deriv ni a haber publicado el Worker.

Fuentes: https://developers.deriv.com/docs/options/ws-demo/ ; https://developers.deriv.com/docs/trading/proposal/ ; https://developers.deriv.com/docs/trading/buy/ ; https://developers.deriv.com/docs/trading/proposal-open-contract/ .
