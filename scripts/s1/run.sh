#!/usr/bin/env bash
# S1: sinov bazasini noldan yaratish (Flyway migratsiyalari psql bilan) + sintetik hajm.
# Ishlatish: scripts/s1/run.sh <kun> <kunlik_buyurtma> <qator> <markdiv>
# Muhit: PGHOST/PGPORT (standart /var/tmp, 55432), PGADMIN (standart postgres), yuzplus — superuser.
set -euo pipefail
cd "$(dirname "$0")/../.."
export PGHOST=${PGHOST:-/var/tmp} PGPORT=${PGPORT:-55432}
DAYS=${1:-1460} OPD=${2:-1500} LPO=${3:-15} MARKDIV=${4:-10}
psql -U "${PGADMIN:-postgres}" -d postgres -qc "DROP DATABASE IF EXISTS yuzplus" -qc "CREATE DATABASE yuzplus OWNER yuzplus"
for f in $(ls backend/src/main/resources/db/migration/V*.sql | sort -t_ -k1 -V); do
  psql -U yuzplus -d yuzplus -q -v ON_ERROR_STOP=1 -f "$f" >/dev/null
done
psql -U yuzplus -d yuzplus -q -v days="$DAYS" -v opd="$OPD" -v lpo="$LPO" -v markdiv="$MARKDIV" -f scripts/s1/gen.sql
psql -U yuzplus -d yuzplus -Atc "SELECT pg_size_pretty(pg_database_size('yuzplus'))"
