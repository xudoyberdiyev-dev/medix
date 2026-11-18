#!/usr/bin/env bash
# P5: shifrlangan pg_dump nusxasini tiklashni sinash (Railway/bulut bazasi uchun; ishchi bazaga TEGMAYDI).
#   BACKUP_PASSPHRASE=... scripts/backup/restore-test.sh yuzplus-YYYYMMDD-HHMM.dump.gpg
# Vaqtinchalik postgres:18 konteyneriga tiklaydi, asosiy jadvallarni tekshiradi va o'chiradi.
set -euo pipefail
file="${1:?nusxa fayli (.dump.gpg) kerak}"
: "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE kerak}"
name="yuzplus-restore-test-$$"
work="$(mktemp -d)"
cleanup() { docker rm -f "$name" >/dev/null 2>&1 || true; rm -rf "$work"; }
trap cleanup EXIT

gpg --batch --quiet --pinentry-mode loopback --passphrase-fd 3 --decrypt --output "$work/db.dump" "$file" 3<<<"$BACKUP_PASSPHRASE"
echo "== shifr ochildi: $(du -h "$work/db.dump" | cut -f1)"

docker run -d --name "$name" -e POSTGRES_PASSWORD=restore -e POSTGRES_USER=yuzplus -e POSTGRES_DB=yuzplus \
  -v "$work:/backup:ro" postgres:18 >/dev/null
for _ in $(seq 1 60); do docker exec "$name" pg_isready -U yuzplus -q && break; sleep 1; done
docker exec "$name" pg_restore -U yuzplus -d yuzplus --no-owner --no-acl --exit-on-error /backup/db.dump

check() { docker exec "$name" psql -U yuzplus -d yuzplus -tAc "$1"; }
migr="$(check 'SELECT max(installed_rank) FROM flyway_schema_history WHERE success')"
emps="$(check 'SELECT count(*) FROM employee')"
last="$(check "SELECT to_char(max(occurred_at) AT TIME ZONE 'Asia/Tashkent', 'DD.MM.YYYY HH24:MI') FROM audit_log")"
echo "Migratsiyalar: $migr · Xodimlar: $emps · Oxirgi audit yozuvi: ${last:-—}"
if [[ -z "$migr" || "$migr" -lt 1 ]]; then
  echo "XATO: tiklangan bazada migratsiyalar yo'q"; exit 1
fi
echo "== tiklash sinovi muvaffaqiyatli"
