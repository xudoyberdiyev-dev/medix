# MEDIX — PostgreSQL 18 + pgBackRest (SPEC 14: kunlik to'liq nusxa va WAL arxivi).
# Rasmiy image'da PGDG apt manbasi bor — pgbackrest shundan o'rnatiladi.
FROM postgres:18
RUN apt-get update \
    && apt-get install -y --no-install-recommends pgbackrest \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /var/lib/pgbackrest /var/log/pgbackrest /var/spool/pgbackrest /etc/pgbackrest/conf.d \
    && chown -R postgres:postgres /var/lib/pgbackrest /var/log/pgbackrest /var/spool/pgbackrest
COPY pgbackrest.conf /etc/pgbackrest/pgbackrest.conf
ENV TZ=Asia/Tashkent
