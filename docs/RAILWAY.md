# MEDIX — Railway'ga joylashtirish (sinov muhiti)

Tarkib: 3 xizmat bitta Railway loyihasida — **Postgres** (Railway bazasi), **backend** (`backend/`), **frontend** (`frontend/`).
Foydalanuvchi faqat frontend domenini ochadi; `/api/*` so'rovlarini frontend backendga Railway ichki tarmog'i orqali uzatadi (cookie bitta domenda).

## 1. Loyiha va baza
1. railway.com → **New Project** → **Deploy PostgreSQL** (yoki bo'sh loyiha → **+ Create → Database → PostgreSQL**).

## 2. Backend xizmati
1. Loyihada **+ Create → GitHub Repo → xudoyberdiyev-dev/medix**.
2. Xizmat → **Settings**: nomi `backend`; **Source → Branch**: `develop`; **Root Directory**: `backend`.
3. **Variables** (Raw Editor'ga nusxalang):
```
MEDIX_DB_URL=jdbc:postgresql://${{Postgres.PGHOST}}:${{Postgres.PGPORT}}/${{Postgres.PGDATABASE}}
MEDIX_DB_USER=${{Postgres.PGUSER}}
MEDIX_DB_PASSWORD=${{Postgres.PGPASSWORD}}
MEDIX_BOOTSTRAP_LOGIN=ceo
MEDIX_BOOTSTRAP_PASSWORD=<o'zingiz o'ylab toping, kamida 12 belgi>
SERVER_ADDRESS=::
PORT=8080
```
4. Backend uchun **ommaviy domen yaratmang** (faqat ichki tarmoq).

## 3. Frontend xizmati
1. **+ Create → GitHub Repo → xudoyberdiyev-dev/medix** (yana bir marta).
2. **Settings**: nomi `frontend`; Branch `develop`; **Root Directory**: `frontend`.
3. **Variables**:
```
BACKEND_URL=http://${{backend.RAILWAY_PRIVATE_DOMAIN}}:8080
PORT=3000
```
4. **Settings → Networking → Generate Domain** (port 3000) → `https://<nom>.up.railway.app`.

## 4. Birinchi kirish
`https://<frontend-domen>` → `ceo` / `MEDIX_BOOTSTRAP_PASSWORD` → yangi parol → sozlash ustasi avtomatik ochiladi.
Ustani tugatgach, backend'dan `MEDIX_BOOTSTRAP_PASSWORD` ni o'chirib qo'yish mumkin.

## Yangilash
`develop` ga har push'da Railway o'zgargan xizmatni avtomatik qayta yig'adi (watch paths: `/backend/**`, `/frontend/**`).
Sinovdan keyin barqaror versiyada qolish uchun Branch'ni `main` ga o'zgartiring.

## Muammolar
- Backend «Healthcheck failed»: Deploy Logs'da `Started MedixApplication` bormi; baza o'zgaruvchilari to'g'rimi.
- Login'dan keyin `/api` 502: frontend'dagi `BACKEND_URL` ichki domen va 8080 portni ko'rsatishi, backend'da `SERVER_ADDRESS=::` bo'lishi kerak; o'zgaruvchi o'zgarsa frontend'ni **Redeploy** qiling (u build paytida o'qiladi).
