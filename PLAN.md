# MEDIX — V1 ish rejasi va progress

Manba: `docs/SPEC.md` 16-bo'lim. Har bosqich: kichik vazifalar → kod → testlar → CI yashil → hisobot. Bosqich tugasa — `develop → main` PR.

## Hozirgi holat
- **Sana:** 01.11.2026
- **Bosqich:** 0 — tugadi; 1 — Identifikatsiya **tugadi**; 2 — Katalog ~90%; 3 — Narxlar ~75% (tannarxdan past nazorati yoqildi); 4 — Ombor ~85% (BQ, eksport; qoldi: SmartUp ustunlari); 5 — Kirim ~70% (KR to'liq oqim, BNS, bonus kirim; qoldi: eslatmalar, «Mahsulot qo'shish» katalog sahifasi)
- **PR:** #1 (develop → main) ochiq — 0–4-bosqich ishlarini o'z ichiga oladi, egasi ko'rib chiqishini kutmoqda
- **Oxirgi sessiya:** 01.11.2026 18:05 — 4-bosqich: BQ hujjati (qoralama → o'tkazish → Direktor bekor qilishi, .xlsx import), Qoldiqlar/Muddat .xlsx eksport, omborni nofaol qilishda qoldiq tekshiruvi; 5-bosqich: Kirim (qoralama → qabul → o'tkazish, farq sababi, Karantin, qarz jurnali, to'lov kuni), BNS va bonus balans hisobidan kirim; 3-bosqich: tannarxdan past narx → Direktor tasdig'i. E2E: BQ va Kirim ssenariylari.
- **Keyingi vazifa:** 5-bosqich qoldig'i — to'lov kuni va bonus eslatmalari (notification moduli: Direktor, Buxgalter, «Kim nomiga»), «Mahsulot qo'shish» katalog sahifasi (kirim qatorlari uchun), kirim ro'yxatida filtrlar (YB, sana). Keyin 3-bosqich «Kirim bo'yicha» narx rejimi va o'rtacha/oxirgi kirim narxiga ustama; so'ng 6-bosqich — Buyurtma.

## Egasidan kutilayotganlar
- [ ] Vercel'ni `medix` reposiga ulash (Root Directory: `frontend`). Production branch — `main`.
- [ ] Telegram: `TELEGRAM_BOT_TOKEN` va `TELEGRAM_CHAT_ID` ni repo Secrets'ga qo'shish.
- [x] `notes/T12-topshirish.md`, `T12-audit.md` va boshqa notes — `docs/notes/` ga qo'shildi (01.11.2026, egasi yubordi).
- [ ] `MEDIX_ozgarishlar.md` (qarorlar tarixi) — `docs/` ga.
- [ ] SmartUp'dan 2–3 qatorli namuna eksport (mahsulotlar, qoldiqlar, qarzlar) — 4 va 11-bosqich uchun.
- [ ] (Ixtiyoriy) Bulut muhiti tarmoq sozlamasida Maven Central (`repo.maven.apache.org`), `services.gradle.org` va Docker Hub'ga ruxsat — shunda backend sessiya ichida ham tekshiriladi, CI kutish shart bo'lmaydi.

## Egasiga savollar
- **Buxgalter doirasi:** SPEC 13 — Buxgalter barcha filiallarni ko'radi; T12 matritsasida esa «own». Hozir SPEC bo'yicha (barcha filiallar). To'g'rimi?
- **Yaxlitlash yo'nalishi:** narx 100/500/1000 ga eng yaqin qiymatga yaxlitlanadi (12 340 → 12 300). Doim yuqoriga kerak bo'lsa ayting.
- **Narx turlari:** «Ulgurji partiya narxi» partiyaga bog'langan tur deb belgilandi. To'g'rimi?
- ~~**1.3 Ruxsatlar**~~ — HAL QILINDI (01.11.2026 12:00 sessiyasi): 132 kalit va matritsa joriy qilindi.
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
- [x] 1.3 Ruxsatlar: 132 kalit katalogi va 11 rol matritsasi (V9, `docs/notes/T12-topshirish.md` §7), API'lar `hasAuthority(kalit)` bilan, kontragentlar — kartadagi rol bo'yicha (clients.* / suppliers.*), rol nusxasi, Direktor roli himoyalangan
- [x] 1.4 Filial doirasi: `Actor.canAccessBranch` (Direktor/Admin/Buxgalter — barcha filiallar, SPEC 13). Har modul o'z so'rovlarida qo'llaydi; filial tanlagichi (Zustand)
- [x] 1.5 Audit jurnali servisi (`shared.audit.AuditLog`) + PIN: `shared.security.PinVerifier` (4–6 raqam, oson PIN rad etiladi, 5 xato → 15 daqiqa qulf, xato hisobi chaqiruvchi tranzaksiyasidan mustaqil), Profil'da o'rnatish (joriy parol bilan)
- [x] 1.6 Sozlash ustasi API (faqat CEO, birinchi ishga tushirish): kompaniya → filiallar → omborlar va zonalar → rollar → xodimlar → yakun
- [x] 1.7 Frontend: ✅ login (ulangan), parol almashtirish, sozlash ustasi (Stepper), proxy + AuthGate, Sozlamalar → Xodimlar (qo'shish, bloklash, vaqtinchalik parol), Audit jurnali, rolga qarab menyu (SPEC 3 bo'yicha, 1.3 dan keyin ruxsat kalitlariga). ✅ Filiallar (qo'shish, tahrirlash — kod o'zgarmaydi, nofaol qilish), Omborlar va zonalar (Sovuq/Seyf qo'shish, zona nomi, nofaol qilish), Profil (telefon, parol, PIN). ✅ Rollar va ruxsatlar sahifasi (modullar bo'yicha, saqlash, nusxa). Menyu va tugmalar ruxsat kalitlari bo'yicha (`can`/`useCan`)
- [x] 1.8 e2e (Playwright, CI `e2e` ishi: Postgres + backend jar + `next start`): CEO birinchi kirish → parol → usta → xodim → Sozlamalar → PIN; operator vaqtinchalik parol bilan kiradi, Sozlamalar yopiq

## 2. Katalog
- [x] Mahsulotlar: 8 raqamli tasodifiy kod (o'zgartirish tarixi, eski kod qayta berilmaydi), shtrix-kodlar, IKPU, QQS, min/max, belgilar; pro jadval — qidiruv lotin/kirill (pg_trgm, `SearchText`), filtrlar URL'da, chiplar, saralash, ustunlar menyusi, sahifalash, .xlsx eksport. Qoldi: saqlangan ko'rinishlar, «topilgan joy qator ostida»
- [x] Kichik ma'lumotnomalar: ishlab chiqaruvchi, kategoriya, birlik, davlat, hudud (boshlang'ich qiymatlar bilan), mashinalar (filial doirasida), xarajat/kirim moddalari (SPEC ro'yxati — standart, o'zgarmaydi)
- [x] Kontragentlar: bitta STIR/JShShIR — bitta karta, mijoz/YB rollari, bloklash, litsenziyalar (muddati holati), shartnomalar (filial bilan), filial shartlari (limit, to'lov muddati, narx turi, minimal yaroqlilik, operator; YB: muddat, to'lov turi, ta'minot mas'uli)
- [~] Mahsulot importi (.xlsx, Apache POI): MEDIX shabloni, tekshiruv → yozish, hammasi yoki hech narsa. Qoldi: SmartUp ustunlari (namuna kutilmoqda)

## 3. Narxlar
- [x] 8 narx turi, narx = mahsulot × tur × filial × sana (QQS bilan), NO hujjati (raqam NO-TSH-000001) va tarix (narx jadvali faqat qo'shiladi; yakunlangan NO trigger bilan himoyalangan)
- [~] Narx o'rnatish «Mahsulot bo'yicha» ✅ (jadvaldan tanlab yoki qator qo'shib), ommaviy ustama (bazaviy/amaldagi narxga, yaxlitlash 100/500/1000) ✅. Qoldi: «Kirim bo'yicha» rejimi va o'rtacha/oxirgi kirim narxiga ustama (5-bosqichdan keyin)
- [x] Nazorat: >20% — ogohlantirish ✅; Direktor tasdig'i (PIN) oqimi ✅; tannarxdan past narx — filialdagi qoldig'i bor (bonus emas) partiyalarning eng yuqori tannarxi bilan solishtiriladi (`inventory.BatchCosts`) ✅
- [~] Narx tanlash qoidasi `PriceMath.select` (partiya → mijoz turi → bazaviy) + birlik testlari ✅; buyurtmada ishlatish — 6-bosqich

## 4. Ombor
- [x] Partiyalar (bonus — tannarx 0, «-B»), harakatlar jurnali (stock_move, faqat qo'shiladi), stock_balance (zona × partiya, CHECK ≥ 0) jurnal bilan bitta tranzaksiyada; `StockLedger.post` — tartibli FOR UPDATE, hujjat hammasi yoki hech narsa; parallel test (24 oqim, 10 dona → aniq 10 ta muvaffaqiyat)
- [x] Qoldiqlar sahifasi va Muddat nazorati ✅ (filial doirasi, tannarx faqat special.cost bilan), .xlsx eksport (filtrlar bilan, 50 000 qatorgacha; pul matn ko'rinishida). Qoldi (ixtiyoriy): ustunlar/saqlangan ko'rinishlar
- [x] Boshlang'ich qoldiq (BQ): qoralama → o'tkazish (partiyalar `source_type=BQ` + jurnal + qoldiq bitta tranzaksiyada), Direktor bekor qilishi (partiyadan sotilmagan bo'lsa), MEDIX .xlsx shabloni bilan import (hammasi yoki hech narsa), nazoratdagi → faqat Seyf, muddati o'tgan — ogohlantirish. Sahifa: Ombor → Boshlang'ich qoldiq. Qoldi: SmartUp ustunlari (namuna kutilmoqda)
- [x] Omborni nofaol qilish: qoldig'i yoki o'tkazilmagan BQ qoralamasi bo'lsa taqiqlanadi

## 5. Kirim
- [x] Ikki bosqichli kirim (Qoralama → Qabul qilindi → O'tkazildi): qabulda tovar Qabul zonasida (sotuvga yopiq), o'tkazishda saqlash zonalariga; qarz jurnali (`finance.PartyLedger`, faqat qo'shiladi) va to'lov kuni (kirim sanasi + YB sharti, qo'lda o'zgarsa belgi). Narx Ombor mudiriga ko'rinmaydi (API ham yubormaydi). Sahifa: Ombor → Kirim. Qoldi: «Mahsulot qo'shish» katalog sahifasi (hozir qator formasi)
- [x] Farq sabablari (kam/ortiqcha/shikastlangan), shikastlangani Karantinga, «haqiqiy/hujjat bo'yicha» qarori; bekor qilish: qoralama/qabul — receipt.cancel, o'tkazilgan — receipt.cancelPosted (partiya ishlatilmagan bo'lsa, qarz teskari yoziladi)
- [~] Bonus balans: BNS («Bonus tasdiqlandi», summa yoki foiz), bonus hisobidan kirim (qarz yo'q, tannarx 0, «-B»), aksiya (10+1 → alohida «-B» partiya), 100% oldindan to'langan kirim ✅. Qoldi: to'lov kuni va bonus eslatmalari (notification), avans yetmasa ogohlantirish (YT/avans — 9-bosqich)

## 6. Buyurtma
- [~] Buyurtma kiritish ✅ (mijoz, ombor, yetkazish turi/sanasi, manzil — standarti kartadan, to'lov turi — oxirgi buyurtmadan), «Oldingi buyurtmani takrorlash» ✅ (oxirgi 5 ta), miqdor qoidalari ✅ (qoldiqdan ko'p / min dan kam — yuborilmaydi, max dan ko'p — tasdiqqa), «N ta muammo» paneli ✅, narx muzlatish va «Narx o'zgardi» ✅. Qoldi: alohida «Mahsulot qo'shish» katalog sahifasi (klaviatura, «Faqat bor mahsulotlar»), Alt+1…5
- [x] Kredit nazorati va tasdiq: limit ≤20% — Filial rahbari (approvals.branch), >20% yoki muddati o'tgan qarz 30+ kun — Direktor (approvals.director); muddati o'tgan qarz FIFO bilan (`PartyLedger.creditState`); rad etish, qoralamaga qaytarish, bekor qilish qoidalari (SPEC 5.2)
- [~] Buyurtmalar sahifasi ✅ (holat filtri, qidiruv, «Mening buyurtmalarim»), buyurtma kartochkasi (mijoz qatori, muammolar, tasdiq sabablari) ✅. Qoldi: «Hozir kimda», holat yorliqlari (tab), e2e

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
- 01.11.2026 — BQ: bir hujjatda (mahsulot, partiya, zona, bonus) takrorlanmaydi; bir partiya (mahsulot + raqam) — bitta yaroqlilik va tannarx; bir necha zonada bo'lsa — bitta partiya yozuvi. Qoldiq sanasi kelajakda bo'lmaydi. O'tkazilgan BQ ni faqat Direktor (opening.cancel) bekor qiladi — partiyalarda boshqa harakat bo'lmasa. Yaratish — opening.create **va** opening.goods (Buxgalter — keyin qarz/pul BQ si uchun).
- 01.11.2026 — BQ/kirim importida yaroqlilik «05.2028» ko'rinishida bo'lsa — oyning oxirgi kuni.
- 01.11.2026 — Excel eksportda pul matn sifatida (`1.250.000,00`): float/double ishlatilmaydi (CLAUDE.md). Excel'da yig'ish kerak bo'lsa — keyin BigDecimal → raqamli katak usulini ko'rib chiqamiz.
- 01.11.2026 — Kirim: narxni ko'rish — `special.cost` yoki `receipt.accept` yo'q xodim (Xarid). Ombor mudiri qoralama yaratishi mumkin (narxsiz), narxli qoralamani tahrirlay olmaydi; qabul uchun barcha narxlar kiritilgan bo'lishi shart (partiya tannarxi qabulda yoziladi va o'zgarmaydi).
- 01.11.2026 — Kirim farqi: «haqiqiy soni» = yaroqli + shikastlangan (kelgan tovar); shikastlangani Karantinga, YB ga qaytarish — QY hujjati bilan (keyin). Aksiya bonusi qabulda alohida sanalmaydi (hujjatdagi soni kiradi).
- 01.11.2026 — Kirim zonasi: Asosiy, Sovuq, Seyf yoki Karantin; nazoratdagi mahsulot — Seyf yoki Karantin. Qabul va Jo'natish — manzil emas.
- 01.11.2026 — Bonus: BNS foizi o'tkazilgan qarz summasidan (HALF_UP). Bir kirim — bitta BNS. Bonus hisobidan kirim chegirmali yoki 100% oldindan bo'lmaydi; balans yetmasa o'tkazilmaydi. Bonusi ishlatilgan kirim bekor qilinmaydi.
- 01.11.2026 — Tannarxdan past narx: filialdagi qoldig'i bor, bonus bo'lmagan partiyalarning eng yuqori tannarxidan past bo'lsa (qoldiq yo'q bo'lsa — tekshirilmaydi).
- 01.11.2026 — Jackson 3: so'rovdagi yo'q primitiv maydon xato beradi — yangi ixtiyoriy maydonlar `Boolean`/`Integer` (null = standart).
- 01.11.2026 — 1.3: ruxsatlar T12 matritsasi bo'yicha (oldingi vaqtinchalik rol qarorlari bekor). Farqlar: omborlarni faqat Direktor/Admin boshqaradi (warehouses.view); Filial rahbari xodimlarni ko'radi, lekin o'zgartirmaydi (staff.edit yo'q). Barcha filiallar doirasi — SPEC 13 bo'yicha Direktor/Admin/**Buxgalter** (T12 da Buxgalter «own» — SPEC ustun).
- 01.11.2026 — Davlatlar ma'lumotnomasi uchun alohida kalit yo'q — `lookups.makers` bilan (Xarid ham o'zgartiradi).
- 01.11.2026 — Rol ruxsatlari o'zgarsa, xodimning keyingi kirishida kuchga kiradi (ochiq sessiya darhol uzilmaydi). Direktor roli o'zgartirilmaydi; Admin «roles.view» ni yo'qotmaydi.
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
- 01.11.2026 18:05 — 4-bosqich: BQ (hujjat, import, bekor qilish), Qoldiqlar eksporti, ombor nofaol qilish tekshiruvi; 5-bosqich: Kirim (to'liq oqim + qarz jurnali), BNS va bonus kirim; 3-bosqich: tannarxdan past narx nazorati. E2E: BQ, Kirim.
- 01.11.2026 12:08–14:20 — 1.3 ruxsatlar (T12 egasi yubordi) va Rollar sahifasi; 4-bosqich asosi (jurnal, qoldiq, Qoldiqlar/Muddat). 1.5 PIN, 1.7 Filiallar/Omborlar/Profil, 1.8 e2e (CI), filial tanlagichi; 2-bosqich: ma'lumotnomalar, mahsulotlar, kontragentlar, .xlsx import/eksport; 3-bosqich: NO hujjati, narxlar. E2E parol almashtirishdan keyingi qayta yo'naltirish xatosini topdi va tuzatildi.
- 01.11.2026 07:00–08:15 — 0.9, 0.10 (0-bosqich tugadi, PR #1), 1.1 sxema, 1.2 xavfsizlik, 1.4 filial doirasi, 1.5 audit, 1.6 usta API, 1.7 login/parol/usta/xodimlar/audit UI. CI yashil.
- 01.11.2026 00:30–00:45 — 0-bosqich poydevori qurildi va push qilindi; CI (develop) yashil. Rejali sessiyalar: 07:00, 12:00, 18:00, 23:00 (har biri boshlanganda xabar, oxirida hisobot).
