# Ejecución persistente: GitHub + Oracle Always Free

Revisado el 5 de noviembre de 2026. Este servicio recopila precios públicos y realiza simulaciones PAPER. No autentica cuentas Deriv, no compra ni vende contratos y no retira fondos.

## Qué se prepara

- GitHub conserva el código y ejecuta sus pruebas.
- Una máquina Oracle Always Free puede ejecutar el proceso mientras esté disponible.
- Docker reinicia el proceso después de un fallo o reinicio de la máquina.
- Un volumen conserva SQLite: cotizaciones, posiciones virtuales, cierres y eventos.
- El panel privado muestra el estado y permite descargar el historial CSV.
- Las copias SQLite deben descargarse fuera de la máquina para protegerse ante pérdida de la instancia o del volumen.

**No se garantiza disponibilidad 24/7 ni gratuidad fuera de las cuotas.** Oracle puede recuperar instancias Always Free consideradas inactivas. No se debe generar carga artificial para evitar esa política. Si no hay capacidad gratuita, detener el alta de recursos y revisar alternativas; no elegir una máquina de pago automáticamente.

El texto inicial de la idea menciona Deriv, Binance, APIs y servicios de IA. No contiene una lista de proveedores de alojamiento gratuito.

## Alternativas después del fallo de registro de Oracle

La [revisión de alternativas sin Oracle](ALTERNATIVAS_SIN_ORACLE.md) propone evaluar Cloudflare Workers Free con Durable Objects. Exige una adaptación y una prueba de cuotas; no es un despliegue directo del contenedor. Railway Free incluye crédito mensual limitado y volumen, sujeto a sus condiciones. La nueva captura de Oracle muestra la tarjeta verificada y un error posterior al crear la cuenta.

## Plataformas contrastadas

| Plataforma | Resultado para este proyecto |
|---|---|
| GitHub Pages | Conserva el panel estático. No ejecuta este proceso Node ni mantiene su base de datos. |
| GitHub Actions | Sirve para pruebas y tareas finitas. Los trabajos alojados tienen un límite de 6 horas. No usar cadenas de trabajos como servidor permanente. |
| Render Free | Suspende servicios tras 15 minutos sin tráfico entrante; su sistema de archivos es efímero y no ofrece discos persistentes gratuitos. No es la opción para este registro continuo. |
| Koyeb Free | Reduce a cero después de una hora sin tráfico entrante. No se seleccionó para este proceso continuo. |
| PythonAnywhere Free | Las tareas Always-on son de pago. No se seleccionó. |
| Cloudflare Free | Durable Objects con SQLite permite evaluar un proceso persistente dentro de cuotas. Requiere adaptar el servicio y comprobar conexión, recuperación y consumo; aún no está implementado. |
| Oracle Always Free | Permite una máquina con disco para un proceso continuo dentro de las cuotas, sujeto a disponibilidad y recuperación por inactividad. Opción preparada, pendiente de crear cuenta y máquina. |
| Equipo propio | Puede ejecutar el mismo proceso sin alquilar servidor; depende de que el equipo permanezca encendido y conectado. |

Fuentes oficiales:
- https://docs.github.com/en/actions/reference/limits
- https://render.com/docs/free
- https://www.koyeb.com/docs/reference/instances
- https://help.pythonanywhere.com/pages/AlwaysOnTasks/
- https://developers.cloudflare.com/workers/platform/limits/
- https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm
- https://www.oracle.com/cloud/free/faq/

## Registro Oracle

1. Abrir https://www.oracle.com/cloud/free/ y elegir Start for free.
2. Indicar datos reales y el país de facturación correcto; verificar el correo recibido.
3. Crear la contraseña directamente en Oracle. No compartirla con asistentes ni guardarla en GitHub.
4. Elegir Individual si la cuenta corresponde a una persona. Registrar una empresa exige sus datos legales reales.
5. Revisar la región principal antes de confirmarla: el formulario indica que no se podrá cambiar después. Durante el registro se seleccionó US West (Phoenix); esa elección no confirma una cuenta creada ni garantiza capacidad Always Free. Si existe una cuenta anterior, comprobar su región real.
6. Completar personalmente las verificaciones de identidad y tarjeta y revisar los términos. La cuenta sigue pendiente hasta que Oracle confirme su creación.
7. Conservar Free Tier. No activar Pay As You Go ni recursos facturables como sustituto de una opción gratuita no disponible.

No confundir los créditos de prueba por tiempo limitado con Always Free. La documentación consultada ofrece dos máquinas AMD micro, o una cuota Ampere A1 equivalente a 2 OCPU y 12 GB de memoria. Las cuotas pueden cambiar: confirmar la etiqueta Always Free y el costo estimado antes de crear cualquier recurso.

## Máquina y acceso

Crear una VM con etiqueta Always Free, imagen Linux compatible y disco dentro de la cuota. El proceso no necesita GPU ni modelos de IA. Usar las claves SSH personales del propietario; no subir la clave privada al repositorio.

Mantener el panel en acceso local. El archivo compose publica el puerto 8789 solamente en 127.0.0.1. No abrir ese puerto a todo Internet. Para verlo desde otro equipo se puede usar un túnel SSH. Las reglas y las credenciales de acceso deben revisarse en la cuenta del propietario.

Instalar Git y Docker Engine con Compose siguiendo la documentación oficial de la distribución:
https://docs.docker.com/engine/install/ubuntu/

## Ejecución después de integrar los cambios en GitHub

En la máquina seleccionada:

    git clone https://github.com/FUNDACIONECOPIENSAEVOLUTION/deriv-bot.git
    cd deriv-bot
    docker compose up -d --build

Si los cambios aún están en una rama de revisión, obtener y seleccionar esa rama antes de construir; main no los incluye hasta integrar la propuesta. El código usa Node.js 24 y no requiere instalar paquetes npm.

Comprobar estado y registros:

    docker compose ps
    docker compose logs --tail=80 paper

Desde el propio servidor:

    curl http://127.0.0.1:8789/api/health
    curl http://127.0.0.1:8789/api/status

Para ver el panel desde el equipo personal, crear un túnel con el usuario, clave e IP reales de la VM:

    ssh -L 8789:127.0.0.1:8789 USUARIO@IP_DE_LA_VM

Abrir http://127.0.0.1:8789 en ese equipo. No publicar datos de acceso ni contraseñas.

## Configuración PAPER

compose.yaml configura explícitamente:
- Capital inicial virtual: USD 10.
- Importe por simulación: USD 0,10.
- Presupuesto de pérdidas del día en Colombia: USD 0,30.
- Pago neto hipotético al acertar: 80%.
- Costo supuesto por liquidación: USD 0.
- Duración: 20 ticks; intervalo mínimo entre aperturas: 35 ticks.
- Máximo de 12 aperturas diarias.

Estas son condiciones pedagógicas. No representan mínimos, pagos ni costos reales de Deriv. El servicio no calcula probabilidades calibradas. No garantiza rentabilidad y no debe usarse para decidir que una estrategia ya es apta para dinero real.

El modo solo admite PAPER. Sin PAPER_ENABLED=true, el proceso solo recopila datos. Cambiar los parámetros de un experimento existente hace que el servicio rechace la base de datos: conservarla y escoger otro volumen o DATA_DIR para un experimento nuevo. Así no se reescribe silenciosamente el capital o el historial.

El presupuesto diario suma pérdidas realizadas, sin reponerlo por ganancias del mismo día. Antes de abrir reserva la pérdida hipotética del importe más el costo. Los cálculos monetarios usan centavos enteros.

Las posiciones se guardan en cada tick aceptado. Ante corte, parada o reinicio se conserva un registro VOID: no evaluable, resultado nulo y sin contar como acierto. No es una liquidación real ni una ganancia. Los experimentos con cortes tienen sesgo de exclusión y deben mostrar cuántas posiciones quedaron no evaluables.

El objetivo de USD 70 de ganancia solo se muestra como referencia: USD 10 iniciales + USD 70 = USD 80. No obliga a operar ni hace retiros.

## Guardar y recuperar la ejecución

El volumen paper-data mantiene paper.sqlite y su registro WAL. docker compose down conserva los volúmenes por defecto. **No usar docker compose down -v** si se quiere conservar el experimento.

Copia SQLite consistente, sin copiar a mano un archivo abierto:

    docker compose exec paper node runtime/backup.mjs

La copia queda en /data/backups dentro del volumen. Descargarla fuera de la VM mediante el método de acceso del propietario. Un respaldo guardado solo en la misma máquina no protege ante pérdida de esa máquina o de su volumen.

Para restaurar, detener el proceso y recuperar la copia en un volumen o directorio nuevo, con la misma configuración. Conservar intacto el directorio original. No sustituir la base mientras haya un proceso escribiendo. El panel permite exportar todos los registros de simulaciones a CSV; el CSV no sustituye una copia SQLite del experimento.

El tamaño de la base crece con las cotizaciones. Supervisar disco y cuotas; no se implementa borrado automático del historial.

## Pruebas y límites de esta entrega

    node --test tests/test_runtime.mjs tests/test_analysis_stats.mjs tests/test_public_history.mjs tests/test_html.mjs

Se prueban límites, cronología, identidad de mensajes, persistencia, reinicios, respaldo, HTTP de solo lectura y ausencia de solicitudes privadas en el transporte público. Estas pruebas no validan rentabilidad ni disponibilidad de Oracle.

Los archivos anteriores index.html y laboratorio.html conservan sus motores originales. El nuevo panel persistente es runtime/dashboard.html, servido por runtime/service.mjs. No se sincronizan sus balances ni se afirma que los resultados de un motor validen al otro. Los fallos identificados en la auditoría del panel anterior requieren su propia corrección.

ChatGPT Work puede interactuar con interfaces y formularios. Este asistente no ejecuta operaciones con dinero real ni retiros; esta integración permite desarrollo, consulta de datos públicos y simulación. Fuente de capacidades de interfaz: https://learn.chatgpt.com/docs/computer-use .


## Preparación y comprobaciones de despliegue

La [guía de operación de Oracle](OPERACION_ORACLE.md) añade comprobación del equipo, arranque, consulta y exportación de respaldos. El workflow `paper-container.yml` construye y comprueba recuperación en AMD64 y ARM64, sin usar red ni datos financieros reales. Consultar el resultado de cada revisión en GitHub Actions; añadir un workflow no implica que ya haya pasado.
