# Alternativas gratuitas a Oracle para el servicio PAPER

Revisado el 5 de noviembre de 2026. Objetivo: recopilar precios públicos, simular USD 10 y conservar el historial con el equipo personal apagado.

La nueva captura del registro de Oracle muestra la tarjeta verificada y un error posterior al crear la cuenta. No permite identificar cuál de las causas generales enumeradas por Oracle se aplicó. La investigación continúa con alternativas de alojamiento.

## Opción que priorizar: Cloudflare Workers Free + Durable Objects

Cloudflare anuncia acceso gratuito sin tarjeta: [sitio oficial](https://www.cloudflare.com/). Durable Objects ofrece ejecución con estado y SQLite en el plan Free. Es una candidata para adaptar el proyecto; el contenedor Node/Docker actual no se despliega allí directamente.

Las cuotas publicadas incluyen 100.000 solicitudes y 13.000 GB-s de duración diarios; SQLite permite 100.000 filas escritas y 5 millones leídas al día, con 5 GB almacenados en total por cuenta. Al agotar una cuota Free, las operaciones correspondientes fallan; los límites diarios se restablecen a las 00:00 UTC. [Precios y cuotas oficiales](https://developers.cloudflare.com/durable-objects/platform/pricing/).

Un WebSocket saliente no hiberna. Necesita recuperación y seguimiento de duración, aunque el navegador del usuario esté cerrado. No debemos trasladar al cliente la tarea de mantenerlo vivo. [WebSockets](https://developers.cloudflare.com/durable-objects/best-practices/websockets/), [ciclo de vida](https://developers.cloudflare.com/durable-objects/concepts/durable-object-lifecycle/).

### Cambios necesarios

1. Reutilizar el motor puro `runtime/core.mjs` y la validación del historial, manteniendo simulación, importes enteros, límites y registros VOID.
2. Sustituir `node:sqlite`, archivos y volumen por el almacenamiento SQL de un único Durable Object.
3. Adaptar el cliente de WebSocket al entorno Cloudflare y probar la conexión saliente real a la API pública de Deriv.
4. Recuperar la conexión ante cortes o reinicios mediante el ciclo de vida y las alarmas de la plataforma. Las posiciones incompletas se invalidan; no se inventan cotizaciones.
5. Añadir autenticación al panel y las exportaciones antes de publicarlos. El panel actual confía en el acceso local de una VM.
6. Incluir exportación y recuperación del historial, supervisión de cuota y detención explícita antes de agotar el presupuesto de uso.
7. Medir al menos un ciclo diario completo, con el navegador cerrado, incluyendo reinicio y recuperación, antes de anunciar operación continua.

### Cálculo preliminar, todavía sin medición

Estimación propia: un tick cada dos segundos produce 43.200 ticks/día. Dos filas por tick sumarían 86.400 escrituras antes de índices, eventos y alarmas; a un tick por segundo no cabrían. Un objeto de 128 MB activo todo el día rondaría 11.100 GB-s. Hace falta medir el uso completo de la cuenta y dejar margen; estos cálculos no prueban disponibilidad ni continuidad.

**Estado:** arquitectura propuesta. No se ha implementado, creado una cuenta de Cloudflare, desplegado ni probado Deriv desde Cloudflare. El código Node/Docker existente conserva sus pruebas anteriores.

Siguiente página para registrar o acceder a la cuenta: https://dash.cloudflare.com/ . Conservar Workers Free; no activar productos de pago para resolver una cuota agotada.

## Comparación de otras opciones

| Plataforma | Condición verificada | Consecuencia para este proyecto |
|---|---|---|
| Railway Free | USD 1 de crédito mensual, 0,5 GB RAM y 0,5 GB de volumen; registro sin tarjeta. | Puede reutilizar el contenedor, pero la continuidad del mes depende del consumo. Primero requiere medir y aclarar conservación del volumen al terminar Trial. |
| Google Cloud Compute Engine | Una e2-micro en regiones elegibles y disco estándar dentro de la cuota. La IPv4 pública habitual tiene precio separado. | La VM gratuita no garantiza una instalación completa a USD 0. |
| Render Free | Se suspende tras 15 minutos sin tráfico entrante; SQLite local se pierde en reinicios o suspensión. | No satisface el diseño persistente actual. |
| Koyeb Free | Suspensión automática tras una hora sin tráfico entrante y sin volúmenes para Free. | No satisface el diseño persistente actual. |
| KataBump Free | Renovación manual cada cuatro días; omitirla puede terminar en eliminación de archivos. | No se selecciona para ejecución autónoma y conservación de este historial. |
| Discloud Free | Publica 100 MB RAM y un bot; el plan gratuito no incluye sitios web. | Quedan por validar versión Node, persistencia y acceso privado al panel; no se considera compatible sin esa comprobación. |
| Equipo propio | Ejecuta el servicio existente mientras permanezca encendido y conectado. | Permite avanzar sin alquilar una nube; tiene consumo eléctrico y depende del equipo. |

Fuentes primarias:
- [Railway: plan y precios](https://railway.com/pricing).
- [Railway: límites y precio por recurso](https://docs.railway.com/pricing/plans).
- [Railway: prueba y conservación de volúmenes](https://docs.railway.com/pricing/free-trial). La página de Trial advierte eliminación de volúmenes tras expirar el crédito si no se actualiza la cuenta; no asumimos retención indefinida en Free.
- [Google Cloud: recursos gratuitos](https://docs.cloud.google.com/free/docs/free-cloud-features).
- [Google Cloud: precio de direcciones IP](https://cloud.google.com/vpc/network-pricing). IPv4 de una VM estándar: USD 0,005/h, con una hora gratuita mensual según la tabla consultada.
- [Render: limitaciones gratuitas](https://render.com/docs/free).
- [Koyeb: instancias gratuitas](https://www.koyeb.com/docs/reference/instances).
- [KataBump: renovación](https://docs.katabump.com/hosting/renew-your-server/).
- [Discloud: planes](https://discloud.com/plans), [servicios tipo bot](https://docs.discloud.com/en/how-to-host/bots.md).

## Decisión práctica

Para priorizar costo cero y evitar otra verificación de tarjeta, la siguiente investigación técnica es una adaptación pequeña en Cloudflare Free y una prueba de consumo y recuperación. Para ejecutar el contenedor existente sin esa adaptación, Railway es una opción de prueba con crédito limitado; no se promete un mes completo gratuito.

No se ha demostrado una alternativa gratuita que garantice ejecución continua ilimitada del contenedor actual. El objetivo sigue siendo datos públicos y simulación; el alojamiento no valida una estrategia ni genera rentabilidad por sí mismo.
