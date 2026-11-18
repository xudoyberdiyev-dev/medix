# 100+ — Railway'ga joylashtirish (sinov muhiti)

Tarkib: 3 xizmat bitta Railway loyihasida — **Postgres** (Railway bazasi), **backend** (`backend/`), **frontend** (`frontend/`).
Foydalanuvchi faqat frontend domenini ochadi; `/api/*` so'rovlarini frontend backendga Railway ichki tarmog'i orqali uzatadi (cookie bitta domenda).

## 1. Loyiha va baza
1. railway.com → **New Project** → **Deploy PostgreSQL** (yoki bo'sh loyiha → **+ Create → Database → PostgreSQL**).

## 2. Backend xizmati
1. Loyihada **+ Create → GitHub Repo → xudoyberdiyev-dev/medix**.
2. Xizmat → **Settings**: nomi `backend`; **Source → Branch**: `main`; **Root Directory**: `backend`.
3. **Variables** (Raw Editor'ga nusxalang):
```
YUZPLUS_DB_URL=jdbc:postgresql://${{Postgres.PGHOST}}:${{Postgres.PGPORT}}/${{Postgres.PGDATABASE}}
YUZPLUS_DB_USER=${{Postgres.PGUSER}}
YUZPLUS_DB_PASSWORD=${{Postgres.PGPASSWORD}}
YUZPLUS_BOOTSTRAP_LOGIN=ceo
YUZPLUS_BOOTSTRAP_PASSWORD=<o'zingiz o'ylab toping, kamida 12 belgi>
SERVER_ADDRESS=::
PORT=8080
```
   _Eski `MEDIX_*` nomlari ham vaqtincha oʻqiladi (O21 mos kelish davri): `YUZPLUS_*` boʻlmasa backend `MEDIX_*` ga qaytadi. Railwayʼda qayta nomlagach, bu fallback olib tashlanadi._
4. Backend uchun **ommaviy domen yaratmang** (faqat ichki tarmoq).

## 3. Frontend xizmati
1. **+ Create → GitHub Repo → xudoyberdiyev-dev/medix** (yana bir marta).
2. **Settings**: nomi `frontend`; Branch `main`; **Root Directory**: `frontend`.
3. **Variables**:
```
BACKEND_URL=http://${{backend.RAILWAY_PRIVATE_DOMAIN}}:8080
PORT=3000
```
4. **Settings → Networking → Generate Domain** (port 3000) → `https://<nom>.up.railway.app`.

## 4. Birinchi kirish
`https://<frontend-domen>` → `ceo` / `YUZPLUS_BOOTSTRAP_PASSWORD` → yangi parol → sozlash ustasi avtomatik ochiladi.
Ustani tugatgach, backend'dan `YUZPLUS_BOOTSTRAP_PASSWORD` ni o'chirib qo'yish mumkin.

## Yangilash
`main` ga har merge'da (oyna oxirida, CI yashil bo'lsa) Railway o'zgargan xizmatni avtomatik qayta yig'adi (watch paths: `/backend/**`, `/frontend/**`).

## Ishga tushirishdan oldin (P2, P5, P6 — egasi bir marta qiladi)
1. **Bir versiya (P2).** Frontend (Vercel yoki Railway) va backend (Railway) **ikkalasi ham `main`** dan joylanishi shart —
   aks holda yangi API'li backend eski frontend bilan (yoki aksincha) ishlab, sahifalar xato beradi.
   Railway → backend xizmati → **Settings → Source → Branch** → `main` → **Save**. Frontend Railway'da bo'lsa — u ham `main`.
2. **Vercel (P6).** `frontend/vercel.json` faqat `main` ni joylaydi (develop va boshqa branch preview'lari o'chiq — limit tejaladi).
   Vercel → Project → **Settings → Git → Production Branch** = `main` ekanini tekshiring.
3. **Zaxira nusxa (P5).** Railway → Postgres xizmati → **Backups** → kunlik avtomatik nusxani yoqing (Railway Pro'da bor).
   Qo'shimcha shifrlangan kunlik nusxa (GitHub Actions, `.github/workflows/backup.yml`) **repo private bo'lgandan keyin** ishlaydi:
   GitHub → Settings → Secrets → Actions → `PROD_DATABASE_URL` (Railway Postgres → Connect → *Public* URL) va
   `BACKUP_PASSPHRASE` (uzun tasodifiy parol, xavfsiz joyda ham saqlang — usiz nusxani ochib bo'lmaydi).

## Muammolar
- Backend «Healthcheck failed»: Deploy Logs'da `Started YuzplusApplication` bormi; baza o'zgaruvchilari to'g'rimi.
- Login'dan keyin `/api` 502: frontend'dagi `BACKEND_URL` ichki domen va 8080 portni ko'rsatishi, backend'da `SERVER_ADDRESS=::` bo'lishi kerak; o'zgaruvchi o'zgarsa frontend'ni **Redeploy** qiling (u build paytida o'qiladi).
