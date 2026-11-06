#!/usr/bin/env bash
# Opera una VM existente. No crea recursos de nube ni cuentas.
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."
action="${1:-help}"
if [[ "$action" == help ]]; then
  printf '%s\n' 'Uso: bash ops/paper.sh doctor|start|status|logs|stop|backup [directorio]' \
    'backup exporta una copia consistente fuera del volumen; descárgala también fuera de la VM.'
  exit 0
fi
command -v docker >/dev/null || { printf '%s\n' 'Falta Docker Engine. Sigue la guía de instalación oficial.' >&2; exit 1; }
docker compose version >/dev/null
docker compose config --quiet
case "$action" in
  doctor)
    docker info --format 'Docker: {{.ServerVersion}} | Plataforma: {{.OSType}}/{{.Architecture}}'
    df -h .
    printf '%s\n' 'Configuración válida. Este chequeo no confirma cuotas ni disponibilidad de Oracle.'
    ;;
  start) docker compose up -d --build; docker compose ps ;;
  stop) docker compose stop paper ;;
  logs) docker compose logs --tail=80 paper ;;
  status)
    docker compose ps
    docker compose exec -T paper node --input-type=module -e "
      const r=await fetch('http://127.0.0.1:8789/api/status');
      if(!r.ok)throw Error('HTTP '+r.status);
      const s=await r.json();
      console.log(JSON.stringify({mode:s.mode,market:s.market,quoteAgeSeconds:s.quoteAgeSeconds,
        acceptedTicks:s.acceptedTicks,balanceCents:s.balanceCents,completed:s.completed,
        voided:s.voided,entryBlock:s.entryBlock},null,2));"
    ;;
  backup)
    umask 077
    destination="${2:-backups-export}"
    mkdir -p -- "$destination"
    output="$(docker compose exec -T paper node runtime/backup.mjs)"
    path="${output#Copia SQLite consistente: }"
    case "$path" in
      /data/backups/paper-*.sqlite) ;;
      *) printf '%s\n' 'No se reconoció la ruta del respaldo; se cancela la exportación.' >&2; exit 1 ;;
    esac
    filename="${path##*/}"
    [[ ! -e "$destination/$filename" ]] || { printf '%s\n' 'El destino ya existe; se conserva intacto.' >&2; exit 1; }
    docker compose cp "paper:$path" "$destination/$filename"
    printf 'Respaldo exportado: %s/%s\nDescárgalo fuera de la VM.\n' "$destination" "$filename"
    ;;
  *) printf '%s\n' 'Opción desconocida. Usa: bash ops/paper.sh help' >&2; exit 1 ;;
esac
