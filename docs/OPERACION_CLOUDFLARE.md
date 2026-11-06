# Simulador PAPER en Cloudflare

El directorio cloudflare/ adapta el motor de USD 10 virtuales a Workers y un Durable Object con SQLite. Reutiliza runtime/core.mjs y runtime/feed.mjs. No requiere una clave de Deriv: únicamente conecta al canal público de cotizaciones.

El Worker tiene un nombre propio, ecopiensa-paper-10. La configuración no modifica otros Workers ni utiliza R2. No añadir un segundo experimento activo para probar: la cuota de duración gratuita se comparte por cuenta.

El panel incorpora velas de un minuto, marcas de entradas y salidas simuladas, curva de saldo y decisiones explicadas. Guarda hasta 180 velas con el punto de recuperación del objeto, sin escribir cada tick en una fila. Incluye vistas públicas de Binance y Coinbase; la simulación sigue siendo exclusiva de Deriv. Consulta [panel y plataformas](PANEL_Y_PLATAFORMAS.md) para las capacidades y sus límites.

## Acceso y arranque

El secreto ADMIN_TOKEN debe contener al menos 32 caracteres aleatorios y guardarse como secreto del Worker, nunca en GitHub. El panel usa el usuario owner y esa contraseña sobre HTTPS. Las consultas por programa admiten el mismo secreto como Bearer. Sin un secreto válido el panel y los datos quedan cerrados. /api/health solo informa de que el código responde, no demuestra que haya cotizaciones recientes.

El experimento se crea en pausa. El propietario puede iniciar o pausar desde el panel. Una pausa invalida una posición abierta sin sumar una ganancia ni una pérdida ficticia. No cambia el perfil de riesgo de USD 10, importe USD 0,10 y presupuesto diario de pérdidas USD 0,30, con el día definido en Bogotá.

Los controles requieren origen válido y una cabecera que evita enviarlos mediante un formulario externo. El historial y el CSV requieren la misma autenticación que el panel.

## Persistencia y recuperación

Cada apertura, cierre e invalidación guarda el estado y la operación de forma atómica en SQLite. Las cotizaciones intermedias y sus contadores se guardan como un punto de recuperación cada minuto, por lo que un reinicio puede perder parte de ese último minuto de datos intermedios. No se pierden por ese motivo los cambios de posición ya confirmados en almacenamiento.

Al reconstruirse el objeto, una posición pendiente pasa a VOID y la ventana de precios se descarta. La conexión vuelve a pedir un historial reciente. Una alarma por minuto y una comprobación programada cada cinco minutos permiten recuperar un experimento que estaba activo. Un experimento pausado no se inicia por esa comprobación.

La exportación CSV pagina y transmite el historial completo; la vista del panel solo muestra las 30 operaciones más recientes. Se conservan todas las operaciones y los últimos eventos de servicio.

## Pruebas y despliegue

Desde cloudflare/: npm ci, npm run typecheck, npm test y npm run build. La configuración utiliza la herramienta oficial cf, sin archivo Wrangler. Las pruebas de HTTP, SQLite, expulsión del objeto y alarmas corren en el entorno de Workers mediante el complemento oficial de Vitest. Utilizan un proveedor sintético que devuelve un error de red controlado, sin acceso a una cuenta financiera.

La comprobación real independiente de Deriv se ejecuta con node scripts/probe_deriv_public.mjs desde la raíz. Verifica historial y ticks en directo desde el lugar donde se ejecuta; no acredita por sí sola acceso desde un Worker desplegado.

El despliegue requiere comprobar el acceso a la cuenta Cloudflare, revisar que continúa en Free y configurar el secreto privado. Después de desplegar, verificar cotizaciones reales, pausa, recuperación, exportación y consumo durante un día con el navegador cerrado. La compilación correcta no sustituye esta comprobación. No se anuncia disponibilidad continua hasta completarla.

El plan Free tiene límites compartidos de solicitudes, duración y almacenamiento; al excederlos falla la operación afectada. Una conexión saliente no hiberna. Este diseño reduce escrituras y usa un solo objeto, pero no garantiza ejecución gratuita ilimitada ni mide rentabilidad.

Referencias oficiales: https://developers.cloudflare.com/durable-objects/platform/pricing/ , https://developers.cloudflare.com/cf/projects/cloudflare-config/ , https://developers.cloudflare.com/workers/testing/vitest-integration/ , https://developers.deriv.com/es/docs/options/ws-public/
