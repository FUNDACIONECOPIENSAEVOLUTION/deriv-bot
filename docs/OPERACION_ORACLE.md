# Preparar y operar la VM de Oracle

Esta guía se puede preparar sin crear la cuenta. El despliegue espera a que exista una VM Linux del propietario. El servicio recopila precios públicos y simula USD 10; no se conecta a una cuenta financiera.

## Lo que debe existir antes de instalar

- Acceso confirmado a la cuenta Oracle y a su región principal real.
- Una VM Linux compatible (Ubuntu 24.04), identificada como Always Free en la consola, con almacenamiento dentro de la cuota.
- Docker Engine y Docker Compose instalados mediante [la documentación oficial para Ubuntu](https://docs.docker.com/engine/install/ubuntu/).
- La clave SSH privada conservada por el propietario y la IP/usuario de la VM.
- Acceso SSH limitado a los orígenes necesarios. El panel no necesita un puerto abierto al público.

Si se encuentra una cuenta antigua, usar esa cuenta y comprobar su región y sus cuotas antes de crear recursos. La región principal de una cuenta existente no se cambia con esta guía. La cuota y la capacidad disponible deben comprobarse en Oracle; ejecutar una prueba en GitHub no las confirma.

## Descargar esta propuesta

Hasta integrar la propuesta en main:

```bash
git clone --branch codex/paper-runtime-24h --single-branch https://github.com/FUNDACIONECOPIENSAEVOLUTION/deriv-bot.git
cd deriv-bot
git rev-parse HEAD
bash ops/paper.sh doctor
bash ops/paper.sh start
bash ops/paper.sh status
```

Anotar la revisión mostrada por git. No se requieren paquetes npm ni claves de Deriv o de proveedores de IA para este servicio.

El estado distingue entre el proceso disponible y el mercado conectado. `market.state=live` y una cotización reciente indican recepción de datos; una respuesta HTTP correcta por sí sola solo confirma que el proceso responde. Tras un corte, esperar a que se valide de nuevo el historial.

Para consultar registros o detener sin eliminar datos:

```bash
bash ops/paper.sh logs
bash ops/paper.sh stop
```

El reinicio automático depende de Docker y de la VM encendida. El contenedor conserva sus datos en un volumen. La rotación de registros limita los archivos de Docker a aproximadamente 30 MB; la base de cotizaciones sigue creciendo y necesita supervisión de disco.

## Ver el panel desde el equipo personal

En el equipo del propietario, con los valores reales:

```text
ssh -N -L 8789:127.0.0.1:8789 USUARIO@IP_DE_LA_VM
```

Mantener esa conexión abierta y visitar http://127.0.0.1:8789 . El puerto 8789 del servidor permanece vinculado a 127.0.0.1.

## Exportar un respaldo consistente

En la VM:

```bash
bash ops/paper.sh backup
```

El programa usa la función de respaldo de SQLite mientras el servicio está activo y copia el resultado a `backups-export/`, fuera del volumen. El comando imprime el nombre exacto. Después, descargar ese archivo al equipo personal mediante SCP u otra herramienta de transferencia SSH. Conservar al menos una copia fuera de la VM; la carpeta de exportación dentro de la misma VM no protege frente a pérdida de esa VM.

`backups-export/` está excluida de Git. Si se elige otro directorio, usar uno fuera del repositorio. No subir bases, respaldos, claves o archivos de configuración personales al repositorio público.

## Recuperar sin sustituir el experimento original

1. Conservar el respaldo y el volumen original. Detener el proceso original con `bash ops/paper.sh stop`.
2. Elegir un nombre de proyecto Compose nuevo y comprobar que no existe un volumen con ese nombre. El proyecto debe estar vacío; no reutilizar un experimento anterior.
3. Construir y crear el contenedor de ese proyecto, todavía sin iniciarlo. Copiar el respaldo al archivo `/data/paper.sqlite` del nuevo volumen y asignar su propiedad al usuario `node`.
4. Comprobar `PRAGMA integrity_check` sobre la copia con SQLite y conservar la misma configuración del experimento. El servicio rechaza una configuración distinta.
5. Iniciar ese proyecto y verificar capital, operaciones completadas, registros VOID y estado del mercado. Conservar el original hasta revisar la recuperación.

Para trabajar con el proyecto recuperado, pasar su nombre explícitamente: `COMPOSE_PROJECT_NAME=NOMBRE_NUEVO bash ops/paper.sh status`. No ejecutar dos proyectos que publiquen el mismo puerto a la vez. No usar `docker compose down -v` sobre un experimento que se desea conservar.

La recuperación se ensaya automáticamente en un volumen temporal distinto, con datos sintéticos. Ese ensayo no sustituye la comprobación del respaldo concreto del propietario.

## Comprobación automática antes de instalar

El workflow `paper-container.yml` construye la imagen en Ubuntu AMD64 y ARM64. Verifica el usuario sin privilegios, el sistema de archivos de solo lectura, la API de consulta, un reinicio, exportación CSV, un respaldo en línea y su recuperación en un volumen nuevo. El ensayo desactiva completamente la red del contenedor y utiliza una operación sintética identificada como prueba. Sus resultados no son cotizaciones de mercado ni rendimientos observados.

Se puede reproducir en un equipo con Docker:

```bash
docker compose config --quiet
docker build --tag ecopiensa-paper:test .
node scripts/check_container.mjs ecopiensa-paper:test
```

El script elimina únicamente sus propios contenedores y volúmenes con nombres aleatorios. No toca los experimentos del propietario. Las pruebas usan ejecutores estándar de GitHub; en un repositorio público esos ejecutores están disponibles sin costo según [la documentación de GitHub](https://docs.github.com/en/actions/how-tos/write-workflows/choose-where-workflows-run/choose-the-runner-for-a-job). Son trabajos finitos de comprobación y no un alojamiento permanente.

La cuenta Oracle, la capacidad gratuita, el acceso SSH y el despliegue siguen pendientes hasta comprobarlos directamente en la cuenta del propietario.
