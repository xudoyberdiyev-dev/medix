# MEDIX — Claude uchun ish qoidalari

Farmatsevtika ulgurji distribyutsiyasi uchun ERP. Bitta egasi (loyiha egasi) + Claude. Kod avtonom **zanjir** sessiyalarida yoziladi (pastdagi «Zanjir rejimi»: har kuni 01:00–05:00, 06:00–11:00 va 14:00–18:00, ba'zan egasi so'rasa 20:00–22:30, Toshkent) va egasi ochgan sessiyalarda.

## Haqiqat manbalari (shu tartibda)
1. `docs/SPEC.md` — loyihaning to'liq tavsifi (rollar, jarayonlar, biznes qoidalari, texnologiyalar, arxitektura). **Har sessiyada kerakli bo'limini o'qing.**
2. `PLAN.md` — **avval «Egasi javoblari (07.11)» va «Egasi qarori — USTUVORLIK» bo'limlari**, keyin bosqichlar, vazifalar, **hozirgi holat** va egasidan kutilayotganlar.
3. `design/` — dizayn tizimi (`design/system/`) va ekran manbalari (`design/README.md`).
4. Ziddiyat bo'lsa — eng keyingi sanali qaror ustun; hal qilib bo'lmasa, PLAN.md → «Egasiga savollar» ga yozing va boshqa vazifaga o'ting.

## Zanjir rejimi (egasi qarori, 05.11.2026)
**Ish oynalari (Asia/Tashkent):**
| Oyna | Vaqt | Izoh |
|---|---|---|
| Tungi | 01:00–05:00 | har kuni (egasi qarori 05.11) |
| Ertalab | 06:00–11:00 | har kuni |
| Kunduz | 14:00–18:00 | har kuni |
| Kechki | 20:00–22:30 | **faqat egasi o'sha kuni so'rasa** (alohida bir martalik ishga tushirish) |

**11:00–14:00 — tanaffus, QAT'IY ishlamaslik** (egasi limitni o'zi ishlatadi). Oynadan tashqarida yangi ish boshlanmaydi.

**Qoidalar:**
1. **Bitta sessiya qoidasi.** Boshlanishda `git fetch` qiling. Agar `origin/develop` dagi oxirgi commit 20 daqiqadan yangi bo'lsa va u `hisobot:` yoki `zanjir: tugadi` emas — boshqa sessiya ishlayapti: hech narsa o'zgartirmay darhol tugating («Faol sessiya bor — chiqdim»). Ishlayotgan sessiya **kamida har 20 daqiqada** commit qiladi (vazifa yarim bo'lsa — `status/heartbeat.txt` ga vaqtni yozib commit+push).
2. **Oyna tugash vaqti** — ishga tushirish xabaridagi «Oyna tugashi: HH:MM». Shu vaqtdan 10 daqiqa oldin yangi vazifa boshlamang; tugash vaqtida ishni albatta commit+push qilib to'xtang.
3. **Boshlanish xabari** (`status/last-start.txt` → Telegram) faqat oynaning BIRINCHI sessiyasida.
4. **Kontekst tugay boshlasa** (ko'p ish qilingan, xotira og'irlashgan) yoki vazifa tugab kontekstning katta qismi ishlatilgan bo'lsa: ishni commit+push qiling, `PLAN.md` → «Sessiya jurnali» ga 1–3 qator yozing, `zanjir: davom` commit qiling, so'ng **keyingi sessiyani ishga tushiring**: `mcp__claude-code-remote__fire_trigger` (ToolSearch bilan yuklang), `trigger_id: trig_019P1iLSzuMPtmKdMR7if1hA`, `text: "Oyna tugashi: HH:MM"` (shu oynaning tugash vaqti). Faqat oyna tugashiga ≥ 20 daqiqa qolgan bo'lsa.
5. **Oyna tugaganda** (yoki oxirgi sessiya): zanjirni davom ettirmang; `reports/YYYY-MM-DD-HHMM.md` hisobot yozing — butun oyna bo'yicha (shu oynadagi barcha sessiyalar, «Sessiya jurnali» qaydlaridan) — `PLAN.md` ni yangilang, commit `hisobot: …` + push (Telegram'ga ketadi).
6. Limit tugasa sessiya o'zi yopiladi — zaxira ishga tushirishlar (har oyna ichida soatlik :30 da) zanjirni qayta ulaydi.

## Kontekstni tejash (sessiyani uzoqroq ishlatish uchun)
- Buyruq chiqishini doim qisqartiring: `| tail -40`, `| grep -E "error|FAIL|Exception" | head -30`. CI logini to'liq o'qimang: `gh run view <id> --log-failed | grep -E -A5 "FAILED|error:|Exception" | head -60`.
- Katta fayllarni to'liq o'qimang: avval `grep -n`, keyin `Read` da `offset/limit`. `docs/SPEC.md` dan faqat kerakli bo'limni.
- `pnpm install`, `build`, `gradle` chiqishini `> /tmp/x.log 2>&1; tail -20 /tmp/x.log` ko'rinishida.
- Skrinshotni faqat UI vazifasida va bitta-ikkita.
- O'zgartirgan faylingizni qayta o'qimang.

## Sessiya tartibi (avtonom ish)
0. **Boshlanish xabari (faqat oynaning birinchi sessiyasida):** `status/last-start.txt` ga «▶️ MEDIX: HH:MM sessiya boshlandi — reja: <keyingi vazifa>» yozing, develop'ga commit+push qiling (Telegram'ga ketadi) va `PushNotification` vositasi bo'lsa, shu matnni u orqali ham yuboring.
1. `git fetch origin && git checkout develop && git pull` (develop bo'lmasa — main'dan yarating).
2. `PLAN.md` → «Hozirgi holat» va «Keyingi vazifalar» ni o'qing. Oldingi sessiyaning oxirgi hisobotini (`reports/` dagi eng yangi fayl) o'qing.
3. Oldingi CI natijasini tekshiring: `gh run list --branch develop -L 3`. Yiqilgan bo'lsa — **birinchi navbatda shuni tuzating** (`gh run view <id> --log-failed`).
4. Keyingi vazifani bajaring: kod → testlar → tekshiruv (pastga qarang) → commit → push. **Har tugagan kichik vazifadan keyin darhol commit va push** — limit tugasa ham ish yo'qolmasin.
5. Sessiya oxirida: «Zanjir rejimi» 4–5-qoidalari (davom ettirish yoki oyna hisoboti).
6. Bosqich to'liq tugasa — `develop → main` PR oching (`gh pr create`), sarlavha «N-bosqich: …», tavsifda nima qilindi va qanday tekshirildi. Merge'ni **egasi** qiladi.

**Egasining qarori (01.11.2026):** SPEC 17-bo'limidagi «har vazifa uchun egasi tasdiqlaydi» o'rniga — vazifalar avtonom bajariladi, egasi bosqich oxirida PR orqali ko'rib chiqadi. Kichik qarorlarni o'zingiz qabul qiling va hisobotda yozing.

### Faqat egasidan so'rab qilinadigan ishlar (to'xtang, «Egasiga savollar» ga yozing)
- Pul sarflash, pullik xizmat/obuna, domen. (Istisno: egasi 01.11.2026 da Claude usage credits — $100 bonus — ishlatishga ruxsat bergan; buni egasi sozlamada yoqadi, sessiya o'zi hech narsa sotib olmaydi.)
- Production ma'lumotini o'chirish yoki o'zgartirish; `main` ga to'g'ridan-to'g'ri push yoki force-push.
- SPEC dagi biznes qoidasini o'zgartirish (QQS, qarz, narx, ruxsatlar).
- Kalit/parol/token — hech qachon kodga yoki chatga yozilmaydi; faqat GitHub Secrets / env.

## Muhit cheklovlari (bulutdagi sessiya)
- **Maven Central, Gradle, Docker Hub bloklangan** → backend bu yerda kompilyatsiya qilinmaydi va testlanmaydi. Backend **faqat GitHub Actions CI** da tekshiriladi: push → `gh run watch <id> --exit-status` (yoki `gh run list` bilan kuting) → yiqilsa `gh run view <id> --log-failed`.
  - Kichik sof Java klasslarni (Spring'siz) mahalliy `javac` (JDK 21) bilan tekshirish mumkin.
  - SQL migratsiyalarni mahalliy PostgreSQL 16 bilan tekshirish mumkin (`/usr/lib/postgresql/16/bin`, `postgres` foydalanuvchisi bilan `initdb -D /var/tmp/pgdata` → `pg_ctl ... -o '-p 55432 -k /var/tmp' start` → `psql -h /var/tmp -p 55432 -U medix`).
- **OpenAPI → frontend tiplari:** backend API o'zgarsa CI «OpenAPI frontend bilan mosmi» qadamida yiqiladi va logda to'liq tavsifni chiqaradi (artifact yuklab olish bloklangan). `gh run view <id> --log-failed > ci.log && python3 scripts/extract-openapi-from-ci-log.py ci.log frontend/lib/api/openapi.json && (cd frontend && pnpm api:gen)` → commit.
- **npm registry ochiq** → frontend to'liq mahalliy tekshiriladi: `cd frontend && pnpm install && pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build`.
- UI'ni ko'rish: `pnpm build && pnpm start -p 3100`, keyin Playwright (global o'rnatilgan, `NODE_PATH=$(npm root -g)`) bilan skrinshot olib, dizayn bilan solishtiring.
- Next.js 16 — o'quv ma'lumotlaringizdan farq qiladi: kod yozishdan oldin `frontend/node_modules/next/dist/docs/` dagi tegishli qo'llanmani o'qing (masalan, Middleware endi `proxy.ts`).

## Stek (SPEC 10)
Backend: Java 25, Spring Boot 4.1, Gradle (Kotlin DSL), PostgreSQL 18, Flyway, Spring Data JPA + jOOQ (hisobotlar), Spring Modulith, Spring Security 7 + Spring Session JDBC, springdoc-openapi.
Frontend: Next.js 16 (App Router), React 19, TypeScript strict, Tailwind 4 (Medix tokenlari `app/globals.css`), TanStack Query/Table, React Hook Form + Zod, Zustand (faqat kichik global holat), lucide-react, next-intl, pnpm.

## Papkalar
```
backend/src/main/java/uz/medix/<modul>/   # shared, identity, catalog, pricing, inventory, purchasing,
                                          # sales, warehouse, delivery, finance, reporting, notification, integration
backend/src/main/resources/db/migration/  # Flyway: V<N>__<nom>.sql — mavjud migratsiya HECH QACHON o'zgartirilmaydi
frontend/app/          # marshrutlar; (app)/ — sidebar ichidagi sahifalar
frontend/components/   # ui/ — Medix komponentlari, shell/ — sidebar, topbar
frontend/features/     # modul bo'yicha (orders, receipts, stock …)
frontend/lib/          # format.ts (pul/sana), api/ (OpenAPI mijozi)
docs/  design/  reports/  PLAN.md
```

## Qat'iy kod qoidalari
**Pul va qoldiq (eng muhim):**
- Pul: bazada `NUMERIC(18,2)`, Java'da `BigDecimal` (`uz.medix.shared.money.Money`), HALF_UP. **float/double taqiqlangan.** Frontendga pul satr bo'lib boradi; ko'rsatish `formatMoney` bilan.
- Miqdor — butun son.
- Ombor va pul harakatlari faqat qo'shiladigan jurnalga yoziladi; qoldiq/qarz/avans/bonus/kassa shu jurnaldan. Qoldiq jadvali jurnal bilan **bitta tranzaksiyada** yangilanadi.
- Hujjatni o'tkazish = bitta tranzaksiya (qoldiq + jurnal + qarz + audit). `@Version` + zahirada `SELECT … FOR UPDATE`.
- Bazada himoya: qoldiq ≥ 0 (CHECK), tasdiqlangan hujjatni o'zgartirish trigger bilan taqiqlanadi, raqamlar UNIQUE.
- **Pul va qoldiq kodi faqat testlar bilan** (birlik + Testcontainers integratsion, jumladan parallel holat).
- Hujjat raqami: `DocumentSequenceService.next(prefix, branch)` → `BY-TSH-000355`.

**Umumiy:**
- Har yozuvda filial; filial filtri serverda majburiy. Ruxsat har API metodida (`@PreAuthorize`), frontend faqat ko'rinishni boshqaradi. Tannarx ruxsatsizlarga API'da ham yuborilmaydi.
- Vaqt `timestamptz`, ko'rsatish Asia/Tashkent.
- Modullar orasida faqat ochiq API yoki Spring Modulith hodisalari; `ModularityTest` yashil bo'lishi shart.
- Java: DTO — record; xato matnlari foydalanuvchi tilida (i18n kalit); Optional; `-Werror` yoqilgan.
- TypeScript: `strict`, `any` taqiqlangan; API tiplari faqat OpenAPI'dan.
- **Tillar (uz-Latn, uz-Cyrl, ru):** til `MEDIX_LOCALE` cookie'da (URL'da emas). Frontend matni — `frontend/messages/uz-Latn.json` + `ru.json` (qo'lda), `useTranslations`; server matni — `messages.properties` + `messages_ru.properties` (qo'lda). Kirill ikkalasida ham avtomatik: `cd frontend && pnpm i18n:cyrl` (tuzatish — `messages/uz-Cyrl.overrides.json`). Yangi kalit = uch tilda; testlar kalit va o'rinbosar mosligini tekshiradi.
- Prototipdagi demo vositalari (demo soat, demo skaner, demo rejimi) haqiqiy dasturga o'tkazilmaydi.
- Bir vaqtda bitta modul.

**UI (design/system/README.md):** faqat tokenlar (HEX yozmang), bitta asosiy tugma, tugma matni fe'l, holat = ikonka + so'z + rang, xato = nima bo'ldi + nima qilish kerak, `ʻ`/`ʼ` belgilari, pul `1.250.000,00`, sana `04.10.2026`, faqat Lucide (stroke 1.5), har jadvalda bo'sh/yuklanish/xato/ruxsat yo'q holatlari.

## Commit va branch
- Ish branch'i: `develop`. Commit xabari o'zbekcha, qisqa: `backend: hujjat raqamlash servisi`, `frontend: login sahifasi`.
- `main` — faqat egasi merge qilgan PR'lar orqali. Vercel `main` ni production, `develop` ni preview sifatida joylaydi.

## Hisobot formati (`reports/YYYY-MM-DD-HHMM.md`, Telegram'ga avtomatik ketadi, ≤ 3500 belgi)
```
MEDIX · DD.MM.YYYY HH:MM sessiya
✅ Bajarildi: …
🧪 Tekshiruv: CI yashil/qizil, testlar soni, skrinshot
⚠️ Muammo / egasidan kerak: …
⏭ Keyingi: …
📊 Progress: N-bosqich X% · V1 umumiy Y%
```
