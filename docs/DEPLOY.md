# MEDIX — joylashtirish va ekspluatatsiya (SPEC 14, 15)

Production: bitta server, Docker Compose — `deploy/` papkasi.

| Xizmat | Image | Vazifa |
|---|---|---|
| caddy | `caddy:2` | HTTPS (Let's Encrypt yoki ichki CA), `/api/*` → backend, qolgani → frontend |
| frontend | `ghcr.io/xudoyberdiyev-dev/medix-frontend` | Next.js |
| backend | `ghcr.io/xudoyberdiyev-dev/medix-backend` | Spring Boot; Flyway migratsiyalari ishga tushganda o'zi bajariladi |
| postgres | `ghcr.io/xudoyberdiyev-dev/medix-postgres` | PostgreSQL 18 + pgBackRest (WAL arxivi) |

Fayllar (rasm, imzo, PDF) bazada saqlanadi — alohida fayl xotirasi (MinIO) hozircha shart emas.
`/actuator` (health, prometheus) tashqariga ochilmaydi.

## Server
- 4 vCPU, 8–16 GB RAM, 200 GB SSD + zaxira uchun alohida disk yoki boshqa joydagi S3-mos xotira.
- Ubuntu 24.04 LTS, Docker Engine + Compose plugin. 80 va 443 portlar ochiq; SSH — faqat kalit bilan.
- Vaqt zonasi: `timedatectl set-timezone Asia/Tashkent`.

## Birinchi o'rnatish
```bash
sudo mkdir -p /opt/medix && cd /opt/medix
git clone --depth 1 https://github.com/xudoyberdiyev-dev/medix.git src && cp -r src/deploy . && cd deploy
cp .env.example .env && chmod 600 .env && nano .env      # domen, MEDIX_DB_PASSWORD, CEO login/parol, MEDIX_VERSION
docker compose pull
docker compose up -d
docker compose logs -f backend                           # «Started MedixApplication» kutiladi
./backup/backup.sh                                       # stanza yaratiladi va birinchi to'liq nusxa olinadi
```
Brauzerda `https://<MEDIX_DOMAIN>` → CEO login → parolni almashtirish → sozlash ustasi.
Shundan keyin `.env` dagi `MEDIX_BOOTSTRAP_PASSWORD` ni o'chirib qo'yish mumkin.

Domen yo'q (ofis ichki serveri): `MEDIX_DOMAIN=medix.local`, `MEDIX_TLS=internal` va xodimlar kompyuterida
`medix.local` → server IP (DNS yoki hosts). Caddy'ning ichki CA sertifikatini (`docker compose exec caddy cat /data/caddy/pki/authorities/local/root.crt`) kompyuterlarga ishonchli deb o'rnating.

## Yangilash
Reliz: egasi `main` dan `vX.Y.Z` teg qo'yadi → GitHub Actions «Docker» image'larni GHCR'ga joylaydi.
```bash
cd /opt/medix/deploy
./backup/backup.sh                                       # yangilashdan oldin nusxa (MEDIX_BACKUP_TYPE=incr tezroq)
sed -i 's/^MEDIX_VERSION=.*/MEDIX_VERSION=v1.0.1/' .env
docker compose pull && docker compose up -d
```
Orqaga qaytish: oldingi versiyani yozib `up -d`. Migratsiya bajarilgan bo'lsa — eski versiya yangi sxema bilan ishlamasligi mumkin; unda nusxadan tiklang (pastda).

## Zaxira nusxa (SPEC 14)
- **WAL arxivi** doimiy: har o'zgarish ≤ 5 daqiqada pgBackRest repo'siga tushadi → istalgan daqiqaga tiklash (PITR).
- **Nusxa:** yakshanba — to'liq, boshqa kunlar — farq. 4 haftalik to'liq nusxa saqlanadi (`deploy/postgres/pgbackrest.conf`).
- **Boshqa joyda nusxa:** `deploy/pgbackrest/conf.d/repo2-s3.conf.example` → `repo2-s3.conf` (kalitlar bilan, `chmod 600`, repoga tushmaydi). Sozlangach `backup.sh` ikkala repo'ga yozadi. WAL ham ikkala repo'ga arxivlanadi.
- **Tiklash sinovi** har oy avtomatik — ishchi bazaga tegmaydi.

Host cron (`sudo crontab -e`):
```cron
15 2 * * *  /opt/medix/deploy/backup/backup.sh       >> /var/log/medix-backup.log 2>&1
0  4 1 * *  /opt/medix/deploy/backup/restore-test.sh >> /var/log/medix-backup.log 2>&1
```
Holat: `docker compose exec -u postgres postgres pgbackrest --stanza=medix info`.

## Tiklash (avariya)
```bash
cd /opt/medix/deploy
docker compose stop backend frontend
docker compose stop postgres
# Oxirgi holatga: (yoki ma'lum vaqtga: --type=time "--target=2026-11-07 10:30:00+05")
docker compose run --rm -u postgres --entrypoint bash postgres -c \
  'pgbackrest --stanza=medix --delta restore'
docker compose up -d
```
`--delta` mavjud fayllarni tekshirib, faqat farqlarini tiklaydi. Server butunlay yo'qolsa: yangi serverda «Birinchi o'rnatish» (`backup.sh` siz), `repo2-s3.conf` ni qo'ying, `--repo=2` bilan restore qiling.

## Monitoring
- `docker compose ps` — hamma xizmat `running`/`healthy`.
- Loglar: `docker compose logs --since 1h backend`; Caddy kirish logi `caddy-data` hajmida (`/data/logs/access.log`).
- Diskni kuzating: `pgbackrest` va `pgdata` hajmlari (`docker system df -v`).
