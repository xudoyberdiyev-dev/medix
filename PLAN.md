# MEDIX — V1 ish rejasi va progress

Manba: `docs/SPEC.md` 16-bo'lim. Har bosqich: kichik vazifalar → kod → testlar → CI yashil → hisobot. Bosqich tugasa — `develop → main` PR.

## Hozirgi holat
- **Sana:** 01.11.2026
- **Bosqich:** 0 — tugadi; 1 — Identifikatsiya ~90% (faqat 1.3 ruxsatlar katalogi kutilmoqda); 2 — Katalog ~90%; 3 — Narxlar ~60%
- **PR:** #1 (develop → main) ochiq — 0–3-bosqich ishlarini o'z ichiga oladi, egasi ko'rib chiqishini kutmoqda
- **Oxirgi sessiya:** 01.11.2026 12:08–~14:30 — Filiallar/Omborlar/Profil/PIN, e2e, filial tanlagichi; Katalog (ma'lumotnomalar, mahsulotlar, kontragentlar, .xlsx import/eksport); Narxlar (NO hujjati, narx tarixi, ustama). CI yashil.
- **Keyingi vazifa:** 3-bosqich: Narxlar UI tekshiruvi va «Kirim bo'yicha» rejim (5-bosqichdan keyin), tannarx nazorati (partiyalar bilan). Keyin 4-bosqich — Ombor (partiyalar, StockMove jurnali, StockBalance, Qoldiqlar sahifasi, Muddat nazorati).

## Egasidan kutilayotganlar
- [ ] Vercel'ni `medix` reposiga ulash (Root Directory: `frontend`). Production branch — `main`.
- [ ] Telegram: `TELEGRAM_BOT_TOKEN` va `TELEGRAM_CHAT_ID` ni repo Secrets'ga qo'shish.
- [x] `notes/T12-topshirish.md`, `T12-audit.md` va boshqa notes — `docs/notes/` ga qo'shildi (01.11.2026, egasi yubordi).
- [ ] `MEDIX_ozgarishlar.md` (qarorlar tarixi) — `docs/` ga.
- [ ] SmartUp'dan 2–3 qatorli namuna eksport (mahsulotlar, qoldiqlar, qarzlar) — 4 va 11-bosqich uchun.
- [ ] (Ixtiyoriy) Bulut muhiti tarmoq sozlamasida Maven Central (`repo.maven.apache.org`), `services.gradle.org` va Docker Hub'ga ruxsat — shunda backend sessiya ichida ham tekshiriladi, CI kutish shart bo'lmaydi.

## Egasiga savollar
- **Rollar bo'yicha vaqtinchalik ruxsatlar** (Qarorlar jurnali, 01.11.2026) — 1.3 katalogi kelguncha shunday ishlaydi. Xususan: kontragent limitini kim o'zgartiradi (hozir Direktor/Admin/Filial rahbari), narxni kim o'rnatadi (hozir + Xarid)? Farq bo'lsa yozing.
- **Yaxlitlash yo'nalishi:** narx 100/500/1000 ga eng yaqin qiymatga yaxlitlanadi (12 340 → 12 300). Doim yuqoriga kerak bo'lsa ayting.
- **Narx turlari:** «Ulgurji partiya narxi» partiyaga bog'langan tur deb belgilandi. To'g'rimi?
- **1.3 Ruxsatlar:** 131 ta kalit katalogi `notes/T12-topshirish.md` da — u repoda yo'q va Claude Design artifactlaridan ham topilmadi. Faylni `docs/notes/` ga qo'shing; shungacha ruxsat tekshiruvi rol bo'yicha (`hasRole('DIRECTOR')` va h.k.).
- **Boshlang'ich CEO hisobi:** production uchun `MEDIX_BOOTSTRAP_LOGIN` va `MEDIX_BOOTSTRAP_PASSWORD` ni server env'iga bering (birinchi kirishda parol almashtiriladi). Repoga yozilmaydi.

---

## 0. Loyiha poydevori
- [x] 0.1 Repo tuzilmasi, `CLAUDE.md`, `PLAN.md`, `docs/SPEC.md`, `design/` (dizayn tizimi tokenlari, qoidalar, komponentlar API)
- [x] 0.2 Backend: Spring Boot 4.1.1, Java 25, Gradle 9.1 wrapper, 13 modul paketi (Spring Modulith), Actuator, springdoc (`/api/docs`)
- [x] 0.3 Flyway V1: `document_sequence`; `Money` (pul, HALF_UP, `1.250.000,00`), `DocumentNumber`, `DocumentSequenceService` + testlar (parallel 200 chaqiriqda takror yo'q)
- [x] 0.4 Frontend: Next.js 16.4, TS strict, Tailwind 4 + Medix tokenlari, Inter/JetBrains Mono, sidebar + topbar qobig'i, login sahifasi (UI), `formatMoney/formatDate` + testlar
- [x] 0.5 Docker Compose (Postgres 18, MinIO, backend, frontend), Dockerfile'lar
- [x] 0.6 GitHub Actions CI (backend build+test, frontend format/lint/typecheck/test/build), CI yiqilsa Telegram ogohlantirish
- [x] 0.7 Telegram hisobot workflow (`reports/*.md` → Telegram)
- [x] 0.8 CI birinchi marta yashil (backend: build + testlar Testcontainers bilan; frontend: format/lint/typecheck/test/build)
- [x] 0.9 OpenAPI → TypeScript mijoz generatsiyasi (`openapi-typescript` + `openapi-fetch`), TanStack Query provayderi. Backend test `build/openapi/openapi.json` yozadi, CI uni `frontend/lib/api/openapi.json` bilan solishtiradi (farq bo'lsa logda to'liq tavsif chiqadi → ko'chirib `pnpm api:gen`)
- [x] 0.10 Medix UI komponentlari asosi: Badge, TextField, Select, Table (TanStack), Modal, Drawer, Toast, Alert, Tabs, Pagination, SystemStates — `design/system/components.d.ts` shartnomasiga mos

## 1. Identifikatsiya
- [x] 1.1 Flyway: company, branch (kod TSH/SMQ/BXR/FRG, STIR), warehouse, zone (tur, sotuvga ochiqmi), employee, role, permission, role_permission, audit_log (faqat qo'shiladigan, trigger), spring_session
- [x] 1.2 Spring Security 7 + Spring Session JDBC: login/logout, httpOnly+Secure cookie, CSRF, parol (Argon2/BCrypt), birinchi kirishda parol almashtirish, bloklangan xodim
- [ ] 1.3 Ruxsatlar: 131 kalit katalogi (T12-topshirish.md dan), 11 rol standart matritsasi, `@PreAuthorize`, rol nusxasi
- [~] 1.4 Filial doirasi: `Actor.canAccessBranch` (Direktor/Admin/Buxgalter — barcha filiallar, hozircha rol bo'yicha; 1.3 dan keyin ruxsat kalitiga). Har modul o'z so'rovlarida qo'llaydi
- [x] 1.5 Audit jurnali servisi (`shared.audit.AuditLog`) + PIN: `shared.security.PinVerifier` (4–6 raqam, oson PIN rad etiladi, 5 xato → 15 daqiqa qulf, xato hisobi chaqiruvchi tranzaksiyasidan mustaqil), Profil'da o'rnatish (joriy parol bilan)
- [x] 1.6 Sozlash ustasi API (faqat CEO, birinchi ishga tushirish): kompaniya → filiallar → omborlar va zonalar → rollar → xodimlar → yakun
- [~] 1.7 Frontend: ✅ login (ulangan), parol almashtirish, sozlash ustasi (Stepper), proxy + AuthGate, Sozlamalar → Xodimlar (qo'shish, bloklash, vaqtinchalik parol), Audit jurnali, rolga qarab menyu (SPEC 3 bo'yicha, 1.3 dan keyin ruxsat kalitlariga). ✅ Filiallar (qo'shish, tahrirlash — kod o'zgarmaydi, nofaol qilish), Omborlar va zonalar (Filial rahbari — o'z filiali; Sovuq/Seyf qo'shish, zona nomi, nofaol qilish), Profil (telefon, parol, PIN). Qoldi: Rollar va ruxsatlar matritsasi (1.3 ga bog'liq)
- [x] 1.8 e2e (Playwright, CI `e2e` ishi: Postgres + backend jar + `next start`): CEO birinchi kirish → parol → usta → xodim → Sozlamalar → PIN; operator vaqtinchalik parol bilan kiradi, Sozlamalar yopiq

## 2. Katalog
- [x] Mahsulotlar: 8 raqamli tasodifiy kod (o'zgartirish tarixi, eski kod qayta berilmaydi), shtrix-kodlar, IKPU, QQS, min/max, belgilar; pro jadval — qidiruv lotin/kirill (pg_trgm, `SearchText`), filtrlar URL'da, chiplar, saralash, ustunlar menyusi, sahifalash, .xlsx eksport. Qoldi: saqlangan ko'rinishlar, «topilgan joy qator ostida»
- [x] Kichik ma'lumotnomalar: ishlab chiqaruvchi, kategoriya, birlik, davlat, hudud (boshlang'ich qiymatlar bilan), mashinalar (filial doirasida), xarajat/kirim moddalari (SPEC ro'yxati — standart, o'zgarmaydi)
- [x] Kontragentlar: bitta STIR/JShShIR — bitta karta, mijoz/YB rollari, bloklash, litsenziyalar (muddati holati), shartnomalar (filial bilan), filial shartlari (limit, to'lov muddati, narx turi, minimal yaroqlilik, operator; YB: muddat, to'lov turi, ta'minot mas'uli)
- [~] Mahsulot importi (.xlsx, Apache POI): MEDIX shabloni, tekshiruv → yozish, hammasi yoki hech narsa. Qoldi: SmartUp ustunlari (namuna kutilmoqda)

## 3. Narxlar
- [x] 8 narx turi, narx = mahsulot × tur × filial × sana (QQS bilan), NO hujjati (raqam NO-TSH-000001) va tarix (narx jadvali faqat qo'shiladi; yakunlangan NO trigger bilan himoyalangan)
- [~] Narx o'rnatish «Mahsulot bo'yicha» ✅ (jadvaldan tanlab yoki qator qo'shib), ommaviy ustama (bazaviy/amaldagi narxga, yaxlitlash 100/500/1000) ✅. Qoldi: «Kirim bo'yicha» rejimi va o'rtacha/oxirgi kirim narxiga ustama (5-bosqichdan keyin)
- [~] Nazorat: >20% — ogohlantirish ✅; Direktor tasdig'i (PIN) oqimi ✅; tannarxdan past narxni aniqlash — partiyalar (4–5-bosqich) bilan
- [~] Narx tanlash qoidasi `PriceMath.select` (partiya → mijoz turi → bazaviy) + birlik testlari ✅; buyurtmada ishlatish — 6-bosqich

## 4. Ombor
- [ ] Partiyalar, harakatlar jurnali (StockMove), StockBalance (zona × partiya), CHECK ≥ 0
- [ ] Qoldiqlar sahifasi (pro jadval), Muddat nazorati
- [ ] Boshlang'ich qoldiq (BQ) — SmartUp importi

## 5. Kirim
- [ ] Ikki bosqichli kirim (Qoralama → Qabul qilindi → O'tkazildi), «Mahsulot qo'shish» katalog sahifasi
- [ ] Farq sabablari, Karantin, «haqiqiy/hujjat bo'yicha» qarori; bekor qilish (Direktor/Admin)
- [ ] Bonus balans (BNS), aksiya (10+1, «-B» partiya), 100% oldindan to'langan kirim, to'lov kuni eslatmalari

## 6. Buyurtma
- [ ] Buyurtma kiritish + katalog sahifasi, «Oldingi buyurtmani takrorlash», miqdor qoidalari, «N ta muammo» paneli
- [ ] Kredit nazorati va tasdiq (≤20% — Filial rahbari, >20% yoki 30+ kun — Direktor)
- [ ] Buyurtmalar sahifasi (holat yorliqlari, «Hozir kimda»), buyurtma kartochkasi

## 7. Ombor zanjiri
- [ ] FEFO taklifi va zahira, vaqt berish
- [ ] Yig'uvchi paneli, Markirovkachi paneli (GS1 tekshiruv tartibi), Ombor mudiri paneli (monitor, SSE)
- [ ] Hisobdan o'tkazish, reys, nakladnoy, terish varag'i

## 8. Yetkazish
- [ ] Haydovchi paneli, sotuv/HF «Yo'lda» da, qisman yetkazish, yetkazilmadi, qaytgan tovar, haydovchidagi pul

## 9. Pul
- [ ] MT (eng eski qarzdan taqsimlash, avans), YT, KO/BO, IO, kassa/Terminal/bank, kunni yopish, qarz jurnali, Kassir paneli

## 10. Bosh sahifa va hisobotlar
- [ ] Rollar bosh sahifalari, «Diqqat talab qiladi», hisobotlar katalogi (jOOQ), chop etish shakllari (OpenHTMLtoPDF)

## 11. Ishga tushirish
- [ ] SmartUp'dan to'liq import, sinov, o'qitish, parallel ishlash

---

## Qarorlar jurnali
- 01.11.2026 — Filial kodi yaratilgandan keyin o'zgarmaydi (hujjat raqamlarida ishlatiladi). Oxirgi faol filial nofaol qilinmaydi.
- 01.11.2026 — Omborlarni Filial rahbari ham boshqaradi (o'z filiali) — SPEC 3 «filial sozlamalari». Ombor nofaol qilish: 4-bosqichda qoldiq bo'lsa taqiqlanadi.
- 01.11.2026 — PIN: 4–6 raqam, 1111/1234 kabi oson PIN rad etiladi, 5 ketma-ket xato → 15 daqiqa qulf (taxmin qilishdan himoya). O'rnatish/almashtirish joriy parol bilan.
- 01.11.2026 — Profil'da xodim faqat telefonini o'zgartiradi; ism, rol, filial — administrator.
- 01.11.2026 — Qidiruv: lotin/kirill normalizatsiyasi (Java `SearchText` = TS `lib/search.ts`): kirill→lotin, tutuq belgilarisiz, «ts»→«c», «ks/kh»→«x» (dori nomlari: Парацетамол ≈ Paracetamol). Bazada `search_text` + pg_trgm indeksi.
- 01.11.2026 — Ruxsatlar (1.3 kelguncha rol bo'yicha): ma'lumotnomalar va mahsulotlar — Direktor/Admin/Xarid; mashinalar — + Filial rahbari, Ombor mudiri; xarajat moddalari — + Buxgalter; kontragent kartasi — Direktor/Admin/Filial rahbari/Buxgalter/Xarid; filial shartlari (limit, narx turi) — Direktor/Admin/Filial rahbari; narx o'rnatish — Direktor/Admin/Xarid/Filial rahbari.
- 01.11.2026 — Mahsulot importi: hammasi yoki hech narsa; yangi ishlab chiqaruvchi/kategoriya avtomatik qo'shiladi, birlik va davlat esa mavjud bo'lishi shart.
- 01.11.2026 — NO: tannarxdan past qator bo'lmasa (yoki Direktor o'tkazsa) darhol tasdiqlanadi; o'tib ketgan sana bilan tasdiqlansa narx bugundan kuchga kiradi. Yaxlitlash — eng yaqin 100/500/1000 ga (HALF_UP).
- 01.11.2026 — Kontragent STIR: 9 raqam (yuridik shaxs) yoki 14 raqam JShShIR (yakka tadbirkor).
- 01.11.2026 — Ish tartibi: avtonom sessiyalar, `develop` branch, bosqich oxirida PR (egasi qarori).
- 01.11.2026 — Bulut sessiyasida Maven bloklangani uchun backend CI orqali tekshiriladi.
- 01.11.2026 — Jadval: kuniga 4 sessiya (07:00, 12:00, 18:00, 23:00); har sessiya boshida xabar, oxirida hisobot. Egasi usage credits ($100 bonus) ishlatishga ruxsat berdi.
- 01.11.2026 — Shriftlar `@fontsource` orqali (build vaqtida tashqi tarmoq kerak emas).
- 01.11.2026 — Komponentlarda `icon` prop — Lucide komponenti (nom satri emas): tree-shaking uchun. Shartnomadan yagona chetlanish.
- 01.11.2026 — Parol xeshi: `DelegatingPasswordEncoder` (`{bcrypt}`), keyin Argon2 ga o'tish mumkin. Login xatolari hisoblanadi, lekin avtomatik bloklash yo'q (SPEC da qoida yo'q).
- 01.11.2026 — Sessiya: Spring Session JDBC, cookie `MEDIX_SESSION` (httpOnly, Secure, SameSite=Lax), 10 soat. CSRF: `XSRF-TOKEN` cookie + `X-XSRF-TOKEN` sarlavha.
- 01.11.2026 — Zonaning «sotuvga ochiq»ligi bazada turidan hisoblanadi (generated column), qo'lda o'zgartirilmaydi. V1 da bitta kompaniya (unique index).
- 01.11.2026 — Omborlar/zonalar `inventory` moduliga tegishli (`uz.medix.inventory.Warehouses` ochiq API); usta identity'dan chaqiradi.
- 01.11.2026 — OpenAPI: record maydonlari standart bo'yicha majburiy, ixtiyoriylari `@Schema(nullable = true)`.
- 01.11.2026 — Xodimni bloklash yoki vaqtinchalik parol berish uning ochiq sessiyalarini darhol tugatadi. Boshqa filial xodimiga murojaat — 404 (mavjudligi oshkor qilinmaydi).
- 01.11.2026 — Spring Session REQUIRES_NEW tranzaksiyada ishlaydi: sessiyani o'zgartiradigan integratsion testlar `@Transactional` bo'lmaydi.

## Sessiya jurnali
- 01.11.2026 12:08–~14:30 — 1.5 PIN, 1.7 Filiallar/Omborlar/Profil, 1.8 e2e (CI), filial tanlagichi; 2-bosqich: ma'lumotnomalar, mahsulotlar, kontragentlar, .xlsx import/eksport; 3-bosqich: NO hujjati, narxlar. E2E parol almashtirishdan keyingi qayta yo'naltirish xatosini topdi va tuzatildi.
- 01.11.2026 07:00–08:15 — 0.9, 0.10 (0-bosqich tugadi, PR #1), 1.1 sxema, 1.2 xavfsizlik, 1.4 filial doirasi, 1.5 audit, 1.6 usta API, 1.7 login/parol/usta/xodimlar/audit UI. CI yashil.
- 01.11.2026 00:30–00:45 — 0-bosqich poydevori qurildi va push qilindi; CI (develop) yashil. Rejali sessiyalar: 07:00, 12:00, 18:00, 23:00 (har biri boshlanganda xabar, oxirida hisobot).
