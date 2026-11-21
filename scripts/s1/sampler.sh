#!/usr/bin/env bash
# S1 yuklama: har 5 s Hikari/JVM (actuator/prometheus) va PostgreSQL (faol ulanishlar, qulf kutayotganlar) holati.
# /actuator/prometheus — faqat kirgan foydalanuvchiga: s1user1 bilan sessiya (cookie fayl).
J=/tmp/s1-sampler.cookies
curl -s -c $J -b $J http://localhost:8080/api/auth/csrf > /dev/null
X=$(awk '$6 == "XSRF-TOKEN" {print $7}' $J)
curl -s -c $J -b $J -H "Content-Type: application/json" -H "X-XSRF-TOKEN: $X" \
  -d '{"login":"s1user1","password":"S1-yuklama-2026"}' http://localhost:8080/api/auth/login > /dev/null
while true; do
  prom=$(curl -s -b $J http://localhost:8080/actuator/prometheus)
  m=$(echo "$prom" | grep -E '^(hikaricp_connections_(active|pending|max)|jvm_threads_live_threads|process_cpu_usage|system_cpu_usage)' \
      | awk '{sub(/\{.*\}/, "", $1); printf "%s=%s ", $1, $2}')
  h=$(echo "$prom" | grep -E '^jvm_memory_used_bytes\{.*area="heap"' | awk '{s+=$2} END {printf "heapMB=%d", s/1048576}')
  d=$(psql -U yuzplus -d yuzplus -Atc "SELECT 'pgActive=' || count(*) FILTER (WHERE state = 'active') || ' lockWait=' || count(*) FILTER (WHERE wait_event_type = 'Lock') || ' pgConn=' || count(*) FROM pg_stat_activity WHERE datname = 'yuzplus'")
  echo "$(date +%T) $m$h $d"
  sleep 5
done
