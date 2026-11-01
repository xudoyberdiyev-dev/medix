# MEDIX — V1 ish rejasi va progress

Manba: `docs/SPEC.md` 16-bo'lim. Har bosqich: kichik vazifalar → kod → testlar → CI yashil → hisobot. Bosqich tugasa — `develop → main` PR.

## Hozirgi holat
- **Sana:** 01.11.2026
- **Bosqich:** 0 — tugadi (PR #1 develop → main egasi ko'rib chiqishini kutmoqda; PR develop'dagi 1-bosqich ishlarini ham o'z ichiga oladi); 1 — Identifikatsiya ~65%
- **Oxirgi sessiya:** 01.11.2026 07:00–08:15 — 0.9, 0.10, 1.1, 1.2, 1.4/1.5 (asosi), 1.6, 1.7 (login, parol, usta, xodimlar, audit, menyu). CI yashil.
- **Keyingi vazifa:** 1.7 qolgani (Filiallar va Omborlar sahifalari, Profil), 1.5 PIN tasdig'i, 1.8 e2e (CI'da backend + frontend + Playwright). 1.3 — T12-topshirish.md kutilmoqda.

## Egasidan kutilayotganlar
- [ ] Vercel'ni `medix` reposiga ulash (Root Directory: `frontend`). Production branch — `main`.
- [ ] Telegram: `TELEGRAM_BOT_TOKEN` va `TELEGRAM_CHAT_ID` ni repo Secrets'ga qo'shish.
- [ ] Claude Design'dagi `notes/T12-topshirish.md` (131 ruxsat kaliti, ma'lumot tuzilmalari) va `notes/T12-audit.md` ni repoga (`docs/notes/`) yoki shu chatga qo'shish — 1-bosqich 1.3 uchun kerak.
- [ ] `MEDIX_ozgarishlar.md` (qarorlar tarixi) — `docs/` ga.
- [ ] SmartUp'dan 2–3 qatorli namuna eksport (mahsulotlar, qoldiqlar, qarzlar) — 4 va 11-bosqich uchun.
- [ ] (Ixtiyoriy) Bulut muhiti tarmoq sozlamasida Maven Central (`repo.maven.apache.org`), `services.gradle.org` va Docker Hub'ga ruxsat — shunda backend sessiya ichida ham tekshiriladi, CI kutish shart bo'lmaydi.

## Egasiga savollar
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
- [~] 1.5 Audit jurnali servisi (`shared.audit.AuditLog`, kirish/parol/usta amallari yoziladi) — PIN tasdig'i asosi qoldi
- [x] 1.6 Sozlash ustasi API (faqat CEO, birinchi ishga tushirish): kompaniya → filiallar → omborlar va zonalar → rollar → xodimlar → yakun
- [~] 1.7 Frontend: ✅ login (ulangan), parol almashtirish, sozlash ustasi (Stepper), proxy + AuthGate, Sozlamalar → Xodimlar (qo'shish, bloklash, vaqtinchalik parol), Audit jurnali, rolga qarab menyu (SPEC 3 bo'yicha, 1.3 dan keyin ruxsat kalitlariga). Qoldi: Rollar va ruxsatlar matritsasi (1.3 ga bog'liq), Filiallar va Omborlar sahifalari (usta tugagandan keyin tahrirlash), Profil
- [ ] 1.8 e2e (Playwright): login → usta → xodim yaratish

## 2. Katalog
- [ ] Mahsulotlar (8 raqamli noyob kod, tarix), pro jadval (qidiruv lotin/kirill, filtrlar, ustunlar, ko'rinishlar, .xlsx eksport, URL filtrlar)
- [ ] Kichik ma'lumotnomalar (ishlab chiqaruvchi, kategoriya, birlik, hudud, mashina, xarajat moddasi, davlat)
- [ ] Kontragentlar (bitta STIR — bitta karta, ikki rol) + filial shartlari (limit, muddat, narx turi, minimal muddat, operator)
- [ ] Mahsulot importi (SmartUp, Apache POI)

## 3. Narxlar
- [ ] 8 narx turi, narx = mahsulot × tur × filial × sana (QQS bilan), NO hujjati va tarix
- [ ] Narx o'rnatish: «Mahsulot bo'yicha» va «Kirim bo'yicha»; ommaviy ustama, yaxlitlash 100/500/1000
- [ ] Nazorat: tannarxdan past — Direktor tasdig'i; >20% — ogohlantirish
- [ ] Narx tanlash qoidasi (partiya → mijoz turi → bazaviy) + testlar

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
- 01.11.2026 07:00–08:15 — 0.9, 0.10 (0-bosqich tugadi, PR #1), 1.1 sxema, 1.2 xavfsizlik, 1.4 filial doirasi, 1.5 audit, 1.6 usta API, 1.7 login/parol/usta/xodimlar/audit UI. CI yashil.
- 01.11.2026 00:30–00:45 — 0-bosqich poydevori qurildi va push qilindi; CI (develop) yashil. Rejali sessiyalar: 07:00, 12:00, 18:00, 23:00 (har biri boshlanganda xabar, oxirida hisobot).
