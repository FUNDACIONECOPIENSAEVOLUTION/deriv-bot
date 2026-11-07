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

## Deriv DEMO — preparación para entrenamiento controlado (07/11/2026)

**Estado real: PR #11 en borrador, sin fusionar ni desplegar, sin órdenes autenticadas con la cuenta del titular.** La página pública GitHub Pages ejecuta un simulador PAPER distinto, no el saldo oficial de Deriv.

La integración en preparación consulta únicamente la cuenta **DEMO USD** a través de OAuth2 PKCE y un canal OTP restringido a `/trading/v1/options/ws/demo`. El bot no contiene rutas de compra de dinero real. La cuenta muestra un saldo previsto de US$10.000, que debe ser confirmado por la API autenticada antes de habilitar operaciones.

### Opciones de entrenamiento

- Importes virtuales rotativos fijos: **US$0,35, US$0,50, US$0,75 y US$1** por contrato; los importes rechazados no se incrementan automáticamente.
- Instrumento inicial R_100, dirección CALL o PUT según señal confirmada, 5 ticks de duración. Se registra cada compra, entrada, resultado y señales SMA/RSI. No hay predicciones infalibles.
- El panel ofrece un **selector de 1 a 10 contratos DEMO abiertos simultáneamente**. La selección se valida otra vez en el Durable Object antes de transmitir cada compra, para impedir carreras entre solicitudes.
- La parada rígida se fija en **US$9.900** de saldo oficial o antes si el coste de los contratos abiertos puede superar una pérdida de US$100 con respecto a US$10.000. La pérdida realizada se consulta directamente del broker y se contrasta con el registro.
- Ante una compra sin confirmación, bloquea todas las compras hasta conciliarla con Deriv; jamás repite automáticamente la orden incierta. Consulta liquidaciones pendientes sin emitir nuevas compras.
- Muestra en el panel **separadamente** saldo oficial de Deriv, exposición de contratos abiertos, P&L verificado y saldo ficticio PAPER. Junto a las velas se muestra el estado oficial con marca de actualización; datos no verificados llevan ese aviso.
- Métricas por importe: intentos aceptados/rechazados, ganancias, pérdidas, acierto y resultado neto. Atribuir la causa a indicadores requiere pruebas prospectivas adicionales.

### Activación aún pendiente

1. Obtener acceso autorizado al proyecto Cloudflare que hospeda `ecopiensa-paper-10`, verificar que existen los recursos, los secretos y los límites disponibles. GitHub CI solo prepara la compilación, **no despliega**.
2. Validar `ADMIN_TOKEN` privado, HTTPS, la URL real del Worker, la app Deriv y su redirect OAuth. No registrar tokens ni contraseñas en este repositorio público ni compartirlos por chat.
3. Desplegar la rama revisada, verificar el acceso real a una cuenta **DEMO USD** y el saldo oficial de US$10.000, sin conectar cuenta real.
4. Validar **cotizaciones** con los cuatro importes. Activar `DEMO_BUY_ENABLED` solo para una **compra virtual de prueba** y comprobar el contrato y su liquidación. Ante respuestas desconocidas, detener y conciliar.
5. Tras esa prueba, autorizar opcionalmente `DEMO_AUTO_ENABLED` **solo para DEMO** y pulsar el botón del panel. El cron evalúa oportunidades cada minuto; no garantiza que haya señal, ejecución en ese momento ni ganancias.
6. Si hay una caída de US$100 respecto de US$10.000, detener y reportar con datos verificados. No cambiar a capital real por ningún porcentaje de acierto.

**No existe activación remota desde este chat sin un servicio conectado y autorizado.** La apertura de una pestaña de Deriv en el navegador no transfiere la sesión OAuth al Worker. La puesta en marcha requiere una sesión de Cloudflare y una autorización de Deriv DEMO efectuadas por el titular.

Documentación: https://developers.deriv.com/docs/options/ws-demo/ , https://developers.deriv.com/docs/trading/proposal/ , https://developers.deriv.com/docs/trading/buy/ , https://developers.deriv.com/docs/trading/proposal-open-contract/ .

### Despliegue guiado desde GitHub (sin operaciones al publicar)

Se ha añadido `.github/workflows/deploy-demo-manual.yml`. Este flujo **solo se ejecuta a petición expresa**, requiere escribir `PUBLICAR_SOLO_LECTURA`, compila y ejecuta las pruebas antes de cargar la nueva versión de `ecopiensa-paper-10`. La versión desplegada tendrá ambos interruptores desactivados, `DEMO_BUY_ENABLED=false` y `DEMO_AUTO_ENABLED=false`, de modo que **publicar el panel no inicia ninguna compra**.

Una vez que el archivo esté en la rama principal, se podrá ejecutar desde **GitHub → Actions → Publicar Deriv DEMO en Cloudflare → Run workflow**. La acción requiere los secretos de GitHub `CLOUDFLARE_API_TOKEN` y `CLOUDFLARE_ACCOUNT_ID`, con permiso mínimo de editar Workers; configurar además, si procede, revisión obligatoria en el entorno `deriv-demo`. **No enviar esos valores por chat ni subirlos al repositorio**.

Precaución: **conservar exactamente el valor vigente de `ADMIN_TOKEN` en Cloudflare**; sirve para descifrar la autorización OAuth DEMO guardada. Si se reemplaza, se necesitará autorizar la cuenta de nuevo. La clave no aparece ni se requiere en el workflow.

### Comprobación antes de comenzar

En el Worker privado actualizado, seleccionar CALL o PUT y un importe del laboratorio y utilizar «Consultar precio DEMO»; la nueva respuesta realiza un **preflight** de solo lectura: coteja saldo oficial, presupuesto virtual de US$10 en las diez primeras compras, posición abierta, autorización y propuesta del broker. No envía ningún `buy`.

Cuando preflight, OAuth y permisos funcionen, habilitar `DEMO_BUY_ENABLED` para efectuar **una sola compra virtual** desde el botón privado y verificar por contrato su liquidación. La automatización posterior requiere además `DEMO_AUTO_ENABLED` y activación privada explícita. El código no implementa operaciones reales en ningún estado. Mantener el registro de ejecuciones para comprobar P&L y aciertos.

### Campaña DEMO autorizada — 5 bloques de 10 (07/11/2026)

- El propietario solicita **hasta 50 contratos DEMO**, en **cinco bloques de diez compras confirmadas por Deriv**, sin usar jamás la cuenta real.
- **Límite de importes virtuales por bloque:** US$10 (1.000 centavos); **máximo acumulado de compras:** US$50 (5.000 centavos). Los importes individuales rotan US$0,35 / US$0,50 / US$0,75 / US$1. Un rechazo de precio no autoriza incrementarlo.
- **Hasta diez contratos abiertos a la vez**, configurable por el propietario. El siguiente bloque solo puede comenzar cuando los diez contratos anteriores estén liquidados oficialmente. Si hay orden UNKNOWN, se bloquea y requiere conciliación.
- Un **segundo tope independiente** detiene el entrenamiento cuando el saldo oficial DEMO llega a US$9.900 o la exposición podría atravesarlo desde la referencia US$10.000.
- Se muestra informe de **cada bloque** (compras, liquidados, ganadas, perdidas, P&L y tasa observada), más el histórico total. El porcentaje de acierto no garantiza resultado positivo.
- **Publicar código no inicia operaciones**: el Worker mantiene `DEMO_BUY_ENABLED=false` y `DEMO_AUTO_ENABLED=false` hasta una activación operativa específica tras validar autenticación, cotización y primera compra virtual del broker. La cuenta real permanece fuera del código de ejecución.


### Inicio controlado con la cuenta DEMO (actualización v2.x)

El Worker se despliega con `DEMO_BUY_ENABLED=true` y `DEMO_AUTO_ENABLED=true` **únicamente para la API DEMO**. Tener estos dos interruptores disponibles **no genera compras automáticamente**: el control persistente `demo-auto` comienza desactivado. El servicio utiliza una URL WebSocket oficial que incluye `/demo`, exige cuenta DEMO USD verificada y no dispone de ruta para órdenes `/real`.

1. Entrar al **panel Cloudflare privado**, autenticar con la contraseña propia del Worker y actualizar el saldo oficial.
2. Solicitar cotización oficial DEMO. Un rechazo al importe de US$0,35, US$0,50 o US$0,75 debe registrarse y no autoriza un incremento por pérdida ni una compra diferente.
3. Con una señal vigente, ejecutar **una sola compra manual DEMO** y verificar su identificador y liquidación (P&L oficial). Una orden incierta bloquea posteriores compras hasta conciliación.
4. **Solo después de que el primer contrato figure SETTLED**, el botón «Activar evaluación automática DEMO» queda disponible. Requiere confirmación explícita del propietario y un máximo de posiciones abiertas entre 1 y 10.
5. La automatización intenta hasta **50 compras DEMO** en cinco tandas de diez, máximo US$10 de importes acumulados por tanda (US$50 total). No pasa a la siguiente tanda hasta que las diez compras anteriores hayan quedado liquidadas; puede tardar y puede no encontrar señales.
6. Si el saldo oficial de la cuenta DEMO alcanza US$9.900 con referencia a US$10.000, o si la exposición abierta amenaza ese piso, las compras se detienen. El saldo PAPER no modifica este límite.
7. Usar «Pausar evaluación automática» para detener nuevas compras; las ya abiertas requieren su liquidación. No se habilita jamás dinero real con estos parámetros.

**Limitación de control:** modificar GitHub o publicar el Worker no equivale a llamar el endpoint privado de inicio. Un operador con sesión autenticada debe pulsar los botones de compra y, tras liquidación, de automatización. La sesión de navegador solo visible desde el chat no permite enviar estas solicitudes autenticadas.

### Validación pública de restricciones Deriv (07/11/2026)

Se verificó sin credenciales ni compras que R_100 con CALL/PUT admite propuestas de 5 ticks, mientras que 20 ticks resulta rechazado: Deriv limita la duración en ticks a un máximo de 10 para esas propuestas. También rechazó 0,10 USD con un mínimo de 0,35 USD. Las propuestas CALL de 5 ticks para importes 0,35 / 0,50 / 0,75 / 1 USD y PUT de 1 USD fueron aceptadas en el canal público. **Una propuesta aceptada no confirma una compra o una liquidación.** La cuenta REAL sigue bloqueada.
