#!/usr/bin/env bash
# MEDIX — baza zaxira nusxasi (pgBackRest). Host cron'dan har kuni ishga tushiriladi (docs/DEPLOY.md):
#   15 2 * * *  /opt/medix/deploy/backup/backup.sh >> /var/log/medix-backup.log 2>&1
# Yakshanba — to'liq (full), boshqa kunlar — farq (diff). WAL arxivi doimiy (archive_command), shuning uchun
# istalgan daqiqaga tiklash mumkin. Birinchi ishga tushirishda stanza o'zi yaratiladi.
# Ixtiyoriy: MEDIX_BACKUP_TYPE=full|diff|incr — turini majburlash.
set -euo pipefail
cd "$(dirname "$0")/.."

pgbr() { docker compose exec -T -u postgres postgres pgbackrest --stanza=medix "$@"; }

echo "== $(date '+%d.%m.%Y %H:%M') MEDIX zaxira nusxasi"
if ! pgbr info --output=json | grep -q '"status":{"code":0'; then
  echo "Stanza yo'q yoki nosoz — yaratilmoqda"
  pgbr stanza-create
fi
pgbr check

type="${MEDIX_BACKUP_TYPE:-}"
if [[ -z "$type" ]]; then
  if [[ "$(date +%u)" == "7" ]]; then type=full; else type=diff; fi
fi
# repo1 (shu server) har doim; repo2 (boshqa joy) sozlangan bo'lsa — unga ham
pgbr backup --type="$type" --repo=1
if docker compose exec -T postgres sh -c 'ls /etc/pgbackrest/conf.d/*.conf >/dev/null 2>&1'; then
  pgbr backup --type="$type" --repo=2
fi
pgbr info
echo "== tayyor: $type"
