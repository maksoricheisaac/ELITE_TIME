#!/bin/sh
# Sauvegarde PostgreSQL quotidienne (format custom, restaurable avec pg_restore).
# Variables : PGHOST PGUSER PGPASSWORD PGDATABASE, BACKUP_RETENTION_DAYS, BACKUP_HOUR_UTC
# Sortie : /backups/elitetime-YYYYmmdd-HHMMSS.dump (+ .sha256)
# ATTENTION : la clé ENCRYPTION_KEY n'est PAS dans cette sauvegarde. Sans elle les
# champs chiffrés sont illisibles : la sauvegarder séparément (coffre de secrets).
set -eu

RETENTION="${BACKUP_RETENTION_DAYS:-14}"
HOUR="${BACKUP_HOUR_UTC:-2}"

do_backup() {
  ts="$(date -u +%Y%m%d-%H%M%S)"
  file="/backups/elitetime-${ts}.dump"
  tmp="${file}.part"
  if pg_dump --format=custom --no-owner --file="$tmp"; then
    mv "$tmp" "$file"
    (cd /backups && sha256sum "$(basename "$file")" > "$(basename "$file").sha256")
    echo "[backup] OK $file ($(du -h "$file" | cut -f1))"
    find /backups -name 'elitetime-*.dump' -mtime "+${RETENTION}" -print -delete
    find /backups -name 'elitetime-*.sha256' -mtime "+${RETENTION}" -delete
  else
    rm -f "$tmp"
    echo "[backup] ECHEC pg_dump" >&2
    return 1
  fi
}

# Sauvegarde immédiate au démarrage si aucune n'existe encore, puis 1×/jour.
ls /backups/elitetime-*.dump >/dev/null 2>&1 || do_backup || true

while true; do
  now_h="$(date -u +%H | sed 's/^0//')"
  now_m="$(date -u +%M | sed 's/^0//')"
  [ -z "$now_h" ] && now_h=0
  [ -z "$now_m" ] && now_m=0
  # secondes jusqu'à la prochaine échéance HOUR:00 UTC
  target=$(( HOUR * 3600 ))
  current=$(( now_h * 3600 + now_m * 60 ))
  wait=$(( target - current ))
  [ "$wait" -le 0 ] && wait=$(( wait + 86400 ))
  echo "[backup] prochaine sauvegarde dans ${wait}s"
  sleep "$wait"
  do_backup || true
done
