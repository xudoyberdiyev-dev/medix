#!/usr/bin/env bash
# MEDIX — tiklashni sinash (SPEC 14: «tiklash har oy sinab ko'riladi»). Ishchi bazaga TEGMAYDI:
# oxirgi nusxa vaqtinchalik konteynerga tiklanadi, ishga tushiriladi va tekshiriladi, so'ng o'chiriladi.
#   0 4 1 * *  /opt/medix/deploy/backup/restore-test.sh >> /var/log/medix-backup.log 2>&1
# Ixtiyoriy: MEDIX_RESTORE_REPO=2 — boshqa joydagi nusxadan sinash.
set -euo pipefail
cd "$(dirname "$0")/.."

project="$(docker compose config --format json | python3 -c 'import json,sys; print(json.load(sys.stdin)["name"])')"
image="$(docker compose config --images | grep medix-postgres | head -1)"
name="medix-restore-test-$$"
repo="${MEDIX_RESTORE_REPO:-1}"
cleanup() { docker rm -f "$name" >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "== $(date '+%d.%m.%Y %H:%M') tiklash sinovi (repo$repo) — $image"
docker run -d --name "$name" \
  -v "${project}_pgbackrest:/var/lib/pgbackrest:ro" \
  -v "$PWD/pgbackrest/conf.d:/etc/pgbackrest/conf.d:ro" \
  --entrypoint sleep "$image" infinity >/dev/null

docker exec -u postgres "$name" bash -ec "
  mkdir -p /tmp/restore && chmod 700 /tmp/restore
  pgbackrest --stanza=medix --repo=$repo --pg1-path=/tmp/restore --archive-mode=off --type=immediate --target-action=promote restore
  pg_ctl -D /tmp/restore -o '-c archive_mode=off -c port=55432 -c listen_addresses=' -w -t 600 start
"
check() { docker exec -u postgres "$name" psql -p 55432 -h /var/run/postgresql -U medix -d medix -tAc "$1"; }
migr="$(check 'SELECT max(installed_rank) FROM flyway_schema_history WHERE success')"
emps="$(check 'SELECT count(*) FROM employee')"
last="$(check "SELECT to_char(max(occurred_at) AT TIME ZONE 'Asia/Tashkent', 'DD.MM.YYYY HH24:MI') FROM audit_log")"
echo "Migratsiyalar: $migr · Xodimlar: $emps · Oxirgi audit yozuvi: ${last:-—}"
if [[ -z "$migr" || "$migr" -lt 1 ]]; then
  echo "XATO: tiklangan bazada migratsiyalar yo'q"; exit 1
fi
echo "== tiklash sinovi muvaffaqiyatli"
