# Integración de Deriv: cotizaciones para el simulador

El motor usa el WebSocket público oficial de Deriv:
wss://api.derivws.com/trading/v1/options/ws/public

Este canal entrega datos de mercado sin iniciar sesión, sin token y sin OTP. La documentación de Deriv indica que el canal público no permite acciones vinculadas a una cuenta. Fuente: https://developers.deriv.com/es/docs/options/ws-public/

## Qué se comprueba

La prueba usa el mismo módulo runtime/feed.mjs que el servicio persistente. Primero solicita y valida 150 cotizaciones históricas del símbolo R_100. Después se suscribe al flujo y exige tres ticks recientes, válidos y del símbolo correcto antes de dar el resultado OK. Al terminar cierra la conexión. Un historial recibido sin ticks en directo ya no cuenta como integración comprobada.

El tiempo máximo es de 20 segundos. Un error de red, un historial obsoleto, una identidad de respuesta incorrecta o un tick fuera de orden devuelve FAIL. Las pruebas unitarias usan datos sintéticos y no se conectan al proveedor.

Comprobación manual de solo lectura:

    node scripts/probe_deriv_public.mjs

El workflow “Comprobar conexión pública Deriv” ejecuta también esta prueba al cambiar los archivos de integración en una solicitud de revisión. Su resultado confirma exclusivamente la conectividad observada durante ese ensayo. No acredita funcionamiento continuo ni rentabilidad.

## Estado de Cloudflare

El módulo público y el simulador Node/Docker ya existen. La adaptación a Workers y Durable Objects sigue en desarrollo; esta revisión no despliega un Worker ni confirma que Deriv sea accesible desde Cloudflare. La prueba final deberá ejecutarse en el Worker desplegado y medir recuperación y cuotas con el navegador cerrado.

El propietario confirmó haber autenticado el servidor cloudflare en la aplicación. En la sesión de trabajo actual todavía no aparecen sus herramientas, de modo que el acceso efectivo a la cuenta sigue pendiente de comprobar.

Esta integración no necesita una clave privada de Deriv. El saldo de USD 10 corresponde al experimento virtual.
