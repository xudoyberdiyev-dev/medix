# MEDIX — loyihaning to'liq tavsifi va texnologiyalar

**Versiya:** 1.0 · **Sana:** 01.11.2026 · **Til:** o'zbek (lotin)
**Holat:** prototip (Claude Design) loyiha egasining barcha o'zgarishlari bilan qurib bo'lindi (T1–T12, Y0–Y4). Keyingi bosqich — haqiqiy dastur: V1, Claude Code bilan.

Bu hujjat loyihaning yagona umumiy tavsifi. Batafsil qarorlar tarixi `claude/MEDIX_ozgarishlar.md` da (25-bo'lim — amaldagi holat). Prototipdagi aniq ma'lumot tuzilmalari, 131 ruxsat kaliti va komponentlar Claude Design'dagi `notes/T12-topshirish.md` da. Bu hujjat bilan ziddiyat bo'lsa, eng keyingi sanali qaror ustun turadi.

---

## Mundarija

1. [Loyiha haqida](#1-loyiha-haqida)
2. [Tashkiliy tuzilma va asosiy tushunchalar](#2-tashkiliy-tuzilma-va-asosiy-tushunchalar)
3. [Rollar va ish joylari](#3-rollar-va-ish-joylari)
4. [Modullar va sahifalar](#4-modullar-va-sahifalar)
5. [Asosiy jarayonlar](#5-asosiy-jarayonlar)
6. [Biznes qoidalari](#6-biznes-qoidalari)
7. [Hujjatlar, raqamlash va holatlar](#7-hujjatlar-raqamlash-va-holatlar)
8. [Bosh sahifalar, panellar va hisobotlar](#8-bosh-sahifalar-panellar-va-hisobotlar)
9. [Dizayn tizimi va UX qoidalari](#9-dizayn-tizimi-va-ux-qoidalari)
10. [Texnologiyalar](#10-texnologiyalar)
11. [Arxitektura](#11-arxitektura)
12. [Ma'lumotlar modeli (asosiy obyektlar)](#12-malumotlar-modeli-asosiy-obyektlar)
13. [Xavfsizlik va ruxsatlar](#13-xavfsizlik-va-ruxsatlar)
14. [Sifat: testlar, kod qoidalari](#14-sifat-testlar-kod-qoidalari)
15. [Joylashtirish va ekspluatatsiya](#15-joylashtirish-va-ekspluatatsiya)
16. [Versiyalar va V1 ish rejasi](#16-versiyalar-va-v1-ish-rejasi)
17. [Claude Code bilan ishlash tartibi](#17-claude-code-bilan-ishlash-tartibi)
18. [Ochiq savollar va keyinga qoldirilganlar](#18-ochiq-savollar-va-keyinga-qoldirilganlar)

---

## 1. Loyiha haqida

**MEDIX** — farmatsevtika ulgurji distribyutsiya kompaniyasi uchun ERP tizimi. U bitta tizimda quyidagilarni boshqaradi:
- tovar kirimi (yetkazib beruvchidan) va chiqimi (mijozga sotuv);
- partiya va yaroqlilik muddati bo'yicha qoldiqlar, zonalar, ko'chirishlar, inventarizatsiya;
- buyurtmani kiritishdan yetkazib berishgacha bo'lgan zanjir: yig'ish, markirovka, tekshiruv, hujjatlashtirish, yetkazish;
- narxlar: 8 narx turi, partiya narxi, narx tarixi;
- mijozlar va yetkazib beruvchilar, ularning qarzi, bonus balansi;
- pul: to'lovlar, kassa, Terminal, bank, xarajatlar;
- markirovka (2D kod, GS1 DataMatrix);
- bosh sahifalar, rol panellari, hisobotlar.

**Nimaning o'rnini bosadi:** hozir ish 1C, SmartUp va Excel'da yuritiladi. MEDIX ularning o'rnini bosadi; boshlang'ich ma'lumot SmartUp'dan ko'chiriladi.

**Kim quradi:** bitta dasturchi (loyiha egasi). Dizayn Claude Design'da, kod Claude Code'da yaratiladi.

**Asosiy talablar:**
- pul va qoldiqda xato bo'lmasligi;
- texnik bilimi yo'q xodim ham birinchi kundan tushunishi;
- har rolga faqat o'z ishi ko'rinishi;
- uzoq yillar xizmat qilishi va yangi funksiya qo'shish oson bo'lishi.

---

## 2. Tashkiliy tuzilma va asosiy tushunchalar

| Tushuncha | Qaror |
|---|---|
| Kompaniya | «Medix Group» — kompaniyalar guruhi |
| Filiallar | 4 ta: Toshkent (TSH), Samarqand (SMQ), Buxoro (BXR), Farg'ona (FRG). Har biri alohida yuridik shaxs (o'z STIR) |
| Omborlar | ~10 ta, har biri bitta filialga tegishli |
| Zonalar | Har omborda: Qabul, Asosiy saqlash, Karantin, Jo'natish; kerak bo'lsa Sovuq, Seyf (nazoratdagi). Javon va yacheyka hisobi yo'q |
| Qoldiq tuzilishi | Filial → Ombor → Zona → Mahsulot → Partiya (yaroqlilik muddati, tannarx) → Miqdor |
| Sotuvga ochiq zonalar | Asosiy saqlash, Sovuq, Seyf. **Yopiq:** Qabul, Karantin, Jo'natish |
| Valyuta | Faqat so'm, tiyinlari bilan |
| QQS | Kompaniya QQS to'lovchi. Narx **QQS bilan** saqlanadi. Stavka 12%, sozlanadi (buxgalter tasdiqlaydi) |
| Tannarx | Har bir partiyaning o'z kirim narxi. Bonus tovar tannarxi 0 |
| Mijoz va yetkazib beruvchi | Kontragent kartasi markazda bitta (bitta STIR — bitta karta). Shartlar, limit, narx turi va qarz har filial bo'yicha alohida. Bitta karta ikki rolli bo'lishi mumkin |
| Filiallararo savdo | Guruh ichida tannarxda (QQSsiz baza), hisob-faktura bilan; QQS 12% tannarx ustiga qo'shiladi (egasi qarori 07.11.2026, buxgalter bilan tasdiqlash tavsiya qilinadi). Guruh ichidagi qarz umumiy jamiga kirmaydi |
| Foydalanuvchilar | 20–40 tagacha. O'zi ro'yxatdan o'tish yo'q — loginlarni administrator yaratadi |
| Birinchi ishga tushirish | Tizim faqat CEO hisobi bilan ochiladi. Sozlash ustasi orqali kompaniya, filiallar, omborlar va zonalar, rollar, xodimlar yaratiladi |
| Tillar | O'zbek (lotin) — asosiy; o'zbek (kirill), rus. Qidiruv lotin va kirillda bir xil ishlaydi. V1 da faqat lotin, kirill va rus — V2 da |
| Sana va vaqt | Ko'rinishi KK.OO.YYYY, 16:40. Vaqt zonasi Asia/Tashkent |
| Pul ko'rinishi | `1.250.000,00` — minglar nuqta bilan, tiyin vergul bilan |

---

## 3. Rollar va ish joylari

Tizimda **11 ta rol**. Ruxsatlar rollar matritsasidan olinadi: prototipda 131 ta kalit. Matritsadagi standart qiymatlarni administrator o'zgartira oladi, rol nusxasini ham yarata oladi.

| № | Rol | Ish joyi | Asosiy vazifalari |
|---|---|---|---|
| 1 | **Direktor** | Bosh sahifa (to'liq) | Hammasi; Direktor darajasidagi tasdiqlar (tannarxdan past narx, katta limit) |
| 2 | **Bosh administrator** | Direktor kabi | Direktor bilan bir xil + tizim sozlamalari, xodimlar, rollar |
| 3 | **Filial rahbari** | Bosh sahifa | Buyurtma va limit tasdig'i, kirimni o'tkazish, bekor qilish, filial sozlamalari |
| 4 | **Operator** | Bosh sahifa | Buyurtma kiritish (asosiy ishi kompyuterda); o'zi kiritgan buyurtmalar bo'yicha savdo hisobotini ko'radi |
| 5 | **Xarid** | Xarid bosh sahifasi | Kirim kiritish, YB qarzini ko'rish, bonus, «Kim nomiga» tovarlari. Tannarxni faqat Narxlar sahifasida ko'radi |
| 6 | **Buxgalter** | Bosh sahifa | Kirimni o'tkazish, bonus tasdig'i, to'lovlar, o'z filiali hisobotlari (barcha filiallar — faqat Direktor ruxsat bergan buxgalterga; egasi qarori 07.11.2026). Qoldiqlar sahifasi yopiq |
| 7 | **Kassir** | **Kassir paneli** | Kassa: mijozdan to'lov (MT), chiqim (KO), haydovchidan pul, kunni yopish. Filial hisoblarini ko'radi, amallarni faqat o'z kassasida bajaradi |
| 8 | **Ombor mudiri** | **Ombor mudiri paneli** | Kirimni qabul qilish (o'tkazmaydi), buyurtmaga vaqt berish, hisobdan o'tkazish, hujjatlashtirish (reys), ko'chirish, inventarizatsiya, qaytgan tovar. Tannarxni ko'rmaydi |
| 9 | **Yig'uvchi** | **Yig'uvchi paneli** (menyuda faqat Panel) | Buyurtmani yig'ish, partiyani tasdiqlash |
| 10 | **Markirovkachi** | **Markirovkachi paneli** (menyuda faqat Panel) | 2D kodlarni skanerlash, kodlar jurnali |
| 11 | **Haydovchi** | **Haydovchi paneli** (menyuda faqat Panel) | Yuklash, yetkazish (rasm, imzo), naqd pulni olish |

Eslatma: oldingi «Omborchi» va «Ombor nazoratchisi» («Ombor menejeri») rollari bitta **Ombor mudiri** roliga birlashtirilgan. Barcha funksiyalar saqlangan.

**Qurilmalar:** asosiy rollar kompyuterda ishlaydi (1280–1920 px). Ombor mudiri planshetda ham (1024 px) ishlaydi. Yig'uvchi, Markirovkachi va Haydovchi panellari telefon (360–390 px), planshet va kompyuterda ishlaydi. Alohida mobil ilova yo'q — moslashuvchan veb-ilova.

---

## 4. Modullar va sahifalar

| Modul | Sahifalar |
|---|---|
| **Kirish** | Login, birinchi kirishda parol almashtirish, sozlash ustasi (kompaniya → filiallar → omborlar va zonalar → rollar → xodimlar → yakun) |
| **Bosh sahifa** | Rolga qarab: Direktor/Admin, Filial rahbari, Operator, Buxgalter, Xarid; panellar: Kassir, Ombor mudiri, Yig'uvchi, Markirovkachi, Haydovchi |
| **Savdo** | Buyurtmalar (holat yorliqlari), Buyurtma kiritish + Mahsulot qo'shish (katalog), Buyurtma kartochkasi, Tasdiqlash, Jo'natish (reyslar), Mijozdan qaytarish (QM) |
| **Ombor** | Kirim (ikki bosqichli) + Mahsulot qo'shish, Qoldiqlar (pro jadval), Muddat nazorati, Ko'chirishlar (ZK, OK, FS), Inventarizatsiya, Hisobdan chiqarish (HC), YB ga qaytarish (QY), Boshlang'ich qoldiq (BQ) |
| **Pul** | To'lovlar (MT, YT), Kassa, Bank, Avans (AH), Mijozlar qarzi, Yetkazib beruvchilar qarzi va bonus balans, Akt sverka |
| **Ma'lumotnomalar** | Mahsulotlar, Mijozlar, Yetkazib beruvchilar, Narxlar (narx turlari, Narx o'rnatish, narx o'zgarishlari), kichik ma'lumotnomalar (ishlab chiqaruvchilar, kategoriyalar, birliklar, hududlar, mashinalar, xarajat moddalari, davlatlar) |
| **Hisobotlar** | Katalog: Savdo, Yalpi foyda, qoldiq, qarzlar, Operatorlar savdosi, Ta'minotchi xodim tovari, Ta'minotchi korxona tovari, Yig'uvchilar natijasi, Markirovkachilar natijasi va boshqalar |
| **Boshqaruv** | Kompaniya, Filiallar, Omborlar va zonalar, Xodimlar, Rollar va ruxsatlar, Sozlamalar (masalan, kechikish chegarasi), Audit jurnali, Profil |
| **Umumiy** | Ctrl+K (hujjat, mahsulot, kontragent, hisobot qidiruvi), bildirishnomalar (qo'ng'iroqcha), filial tanlagichi, chop etish shakllari |

**Olib tashlangan sahifalar:** Nazoratdagi jurnal; Terish sahifalari (PickQueue, PickScreen, PickFinish) — ularning o'rniga Yig'uvchi paneli; alohida «Markirovka navbati» — Markirovkachi paneliga ko'chirilgan.

**Jadvallar standarti** (Mahsulotlar, Qoldiqlar, Kontragentlar, Buyurtmalar, Narx o'rnatish):
- universal qidiruv — lotin/kirill farqsiz, topilgan joy qator ostida ko'rsatiladi;
- asosiy filtrlar va «Ko'proq filtrlar», faol filtrlar chip ko'rinishida;
- sana filtri, saralash, sahifalash;
- «Ustunlar» menyusi (yashirish, tartib, saqlash), saqlangan ko'rinishlar;
- .xlsx eksport, jami qatori;
- filtrlar URL'da saqlanadi (havola orqali ochish mumkin).

---

## 5. Asosiy jarayonlar

### 5.1 Kirim (yetkazib beruvchidan)

**Holatlar:** Qoralama → Qabul qilindi → O'tkazildi; yonidan Bekor qilingan.

1. **Qoralama.** Xarid, Operator yoki Ombor mudiri kiritadi. Sarlavha maydonlari:
   - yetkazib beruvchi, yuk xati;
   - **to'lov turi** (Naqd / Perechisleniye / Online);
   - **to'lov kuni** (standart: **hisob-faktura sanasi** + yetkazib beruvchi sharti — egasi qarori 13.11.2026; hisob-faktura sanasi yo'q bo'lsa — kirim sanasi; to'lov kuni hisob-faktura sanasidan oldin, hisob-faktura sanasi kirim sanasidan keyin bo'lmaydi; qo'lda o'zgartirilsa belgi qo'yiladi);
   - **Kim nomiga** (xodim, ixtiyoriy);
   - **100% oldindan to'langan** belgisi;
   - **Chegirma (bonus)** — summa yoki foiz va olish sanasi.

   Mahsulotlar **«Mahsulot qo'shish» katalog sahifasi** orqali qo'shiladi. Qatorda partiya, ishlab chiqarilgan sana, yaroqlilik, zona, soni, **aksiya bonusi** (soni), faktura narxi kiritiladi. Qoralama qoldiq va qarzga ta'sir qilmaydi.
2. **Qabul qilindi.** Ombor mudiri tovarni sanab, har qatorga haqiqiy sonini kiritadi. Narx unga ko'rinmaydi. Farq bo'lsa sababi majburiy: kam keldi, ortiqcha keldi yoki shikastlangan. Tovar Qabul zonasiga tushadi va sotuvga yopiq bo'ladi.
3. **O'tkazildi.** Filial rahbari, Buxgalter yoki Direktor o'tkazadi. Bunda:
   - tovar saqlash zonalariga o'tadi, shikastlangani Karantinga;
   - qarz va to'lov kuni yoziladi;
   - farq bo'lsa, qaror qilinadi: «haqiqiy soni bo'yicha» yoki «hujjat bo'yicha».
4. O'tkazilgan kirimni faqat Direktor yoki Admin bekor qila oladi, sababi bilan va tovar sotilmagan bo'lsa.

**Chegirma = bonus balans.** Chegirma qarzdan ayrilmaydi. Masalan, kirim 100 mln, chegirma 3 mln: qarz 100 mln bo'lib qoladi. Olish sanasida «Bonus tasdiqlandi» bosiladi (BNS hujjati) va yetkazib beruvchining **bonus balansi** +3 mln bo'ladi. Bonus balans hisobidan keyingi kirimni olish mumkin: bunday kirim qarz hosil qilmaydi, tannarxi 0, partiyasi «Bonus» belgili. Balansni bir necha kirimga bo'lib ishlatish mumkin. Bonus balans bilan qarzni yopib bo'lmaydi. Bonusning muddati yo'q; 30 kun ishlatilmasa, eslatma keladi.

**Aksiya (bonus tovar).** Misol: 10 + 1 — omborga 11 dona kiradi, qarz faqat 10 dona uchun yoziladi. Bonus tovar alohida partiya bo'ladi (tannarx 0, raqami «-B»), sotuvda oddiy narxda sotiladi.

**100% oldindan to'langan kirim.** Bunday kirimda qarz ham, to'lov kuni ham, eslatma ham yo'q, summa avansdan yopiladi. Avans yetmasa, ogohlantirish chiqadi va farq qarz bo'lib qoladi.

**Eslatmalar.** Ular Direktor, Buxgalter va «Kim nomiga» xodimiga yuboriladi:
- to'lov kunidan 3 kun oldin, to'lov kuni va kechikkan bo'lsa har kuni;
- bonusni tasdiqlash vaqti kelganda.

### 5.2 Buyurtma zanjiri (mijozga sotuv)

**10 ta asosiy holat + 3 ta yakuniy:**

| № | Holat | Kim | Mazmuni |
|---|---|---|---|
| 1 | Qoralama | Operator | Kiritilmoqda; qoldiq va qarzga ta'siri yo'q |
| 2 | Tasdiqlashda | Filial rahbari / Direktor | Limit, muddati o'tgan qarz yoki maksimal miqdor sababli. Sabablar aniq yoziladi |
| 3 | **Navbatda** | Ombor mudiri | FEFO partiya taklifi va zahira; Ombor mudiri **yig'ish va markirovka uchun vaqt** beradi (daqiqada, har buyurtmaga alohida) |
| 4 | Yig'ilmoqda | Yig'uvchi | «Yig'ishni boshlash» → teskari taymer → «Yakunlash» + partiya tasdig'i → tovar Jo'natish zonasiga |
| 5 | Markirovkada | Markirovkachi | HAR bir buyurtma shu bosqichdan o'tadi: markirovkali qatorlar to'liq skanerlanadi, markirovkasiz qatorlar «Tasdiqlash» bilan; hammasi markirovkasiz — «Markirovkasiz — tasdiqlash» (egasi qarori 07.11.2026) |
| 6 | Hisobdan o'tkazilmoqda | Ombor mudiri | Har qator «Tekshirildi», joylar soni (quti); xato bo'lsa — «Yig'ishga qaytarish» |
| 7 | Hujjatlashtirilmoqda | Ombor mudiri | Reys tuzish (faqat Ombor mudiri; Direktor/Admin — to'liq huquqli): mashina, haydovchi — sig'im tekshiruvi yo'q, mashinada faqat «Muzlatkichi bor» belgisi (egasi qarori 07.11.2026); nakladnoy raqamlanadi; yo'l varaqasi; kodlar .xlsx |
| 8 | Yuklanmoqda | Haydovchi | Har buyurtmani joylar soni bo'yicha «Qabul qildim» |
| 9 | Yo'lda | Haydovchi | «Yuklab bo'lindi — reysni boshlash» → **sotuv va hisob-faktura shu yerda yoziladi** (qoldiq kamayadi, mijoz qarzi oshadi) |
| 10 | Yetkazildi | Haydovchi | Kamida 1 rasm majburiy, imzo ixtiyoriy; qisman yetkazish mumkin |
| — | Yetkazilmadi | Haydovchi | Sabab majburiy; sotuv va qarz bekor bo'ladi; tovar «Qaytmoqda» |
| — | Rad etilgan | Tasdiqlovchi | «Tasdiqlashda» bosqichida, sabab bilan |
| — | Bekor qilingan | Ruxsat bo'yicha | Sabab majburiy; zahira va kodlar bo'shaydi, yig'ilgan tovar saqlash zonasiga qaytadi. «Yo'lda» va undan keyin bekor qilinmaydi |

**Qoidalar:**
- **Qoralamaga qaytarish** faqat «Tasdiqlashda» holatidan mumkin.
- **Bekor qilish huquqi:** Operator — faqat o'z buyurtmasini, Qoralama yoki Tasdiqlashda bosqichida. Navbatda … Yuklanmoqda bosqichlarida — Filial rahbari, Direktor, Ombor mudiri.
- **Kechikish:** yig'ish va markirovkada berilgan vaqtdan o'tsa, taymer qizilga o'tadi va natija «Kechikdi: N daqiqa» bo'ladi. Umumiy kechikish — buyurtma shu holatga o'tgan paytdan boshlab «N kundan oshgan»; chegara sozlamada belgilanadi, standart 2 kun.
- **Bitta faol ish:** bir yig'uvchi yoki markirovkachida bir vaqtda faqat bitta faol buyurtma bo'ladi. Boshqasi uni ko'radi, lekin «Band: …» deb turadi.
- **«Muammo bor»:** yig'uvchi, markirovkachi yoki haydovchi sabab tanlab yuboradi, xabar Ombor mudiriga keladi; taymer to'xtamaydi.
- **Yig'ishga qaytarish:** belgilangan qatorlar va sabab bilan buyurtma «Navbatda»ga qaytadi. Qayta yig'ish va qayta markirovkada faqat shu qatorlar ochiq bo'ladi; ularning kodlari bekor qilinadi (tarixda qoladi).
- **«O'zi olib ketadi»:** buyurtma barcha bosqichlardan o'tadi, lekin mashina va haydovchisiz. «Yo'lda» — mijoz olib chiqib ketdi.
- **Reys holatlari:** Qoralama → Rejalashtirilgan (Yuklanmoqda) → Yo'lda → Qaytish kutilmoqda → Yakunlangan.

### 5.3 Buyurtma kiritish (Operator)

- **Sarlavha:** mijoz (qidiruv: nom, STIR, telefon); ombor; yetkazish turi; sana; manzil; **to'lov turi — ochiladigan ro'yxat** (standarti mijozning oxirgi buyurtmasidan, bo'lmasa Perechisleniye); izoh.
- **Mijoz qatori:** narx turi, qarz, muddati o'tgan qarz (kunlar bilan), limit va qolgan limit, holat. Muammo bo'lsa aniq matn chiqadi, masalan: «Limitdan 4,2 mln oshadi — Filial rahbari tasdig'i kerak». Bloklangan va nofaol mijoz tanlanmaydi.
- **«Mahsulot qo'shish» — alohida katalog sahifasi:**
  - tepada hujjatning qisqa ma'lumoti;
  - jadvalda kod, mahsulot, ishlab chiqaruvchi, mavjud qoldiq, narx (QQS bilan), eng yaqin muddat, min/max va miqdor;
  - «Faqat bor mahsulotlar» (standart yoqilgan), klaviatura bilan ishlash;
  - «Qo'shish va qaytish» — sarlavha ma'lumotlari saqlanadi.
- **«Oldingi buyurtmani takrorlash»:** oxirgi 5 buyurtmadan biri tanlanadi, Alt+1…5. Qoldiq va narx yangidan hisoblanadi; qoldig'i yetmaydiganlar belgi bilan qo'shiladi.
- **Miqdor qoidalari:**
  - qoldiqdan ko'p — qizil, yuborilmaydi;
  - minimaldan kam — yuborilmaydi;
  - maksimaldan ko'p — yuboriladi, lekin tasdiqqa ketadi.
  - Min/max — mahsulotning ixtiyoriy maydonlari.
- **«N ta muammo» paneli:** barcha xato va ogohlantirishlar bitta joyda, bosilsa tegishli joyga olib boradi.
- **Ochiq hujjat:** katalogga yoki boshqa sahifaga o'tib qaytganda hujjat shu holatda ochiladi; saqlanmagan o'zgarish bo'lsa ogohlantiradi.

### 5.4 Panellar (qisqa)

- **Yig'uvchi paneli.** Yorliqlar: Navbat, Mening yig'ishim, Bugun yakunlanganlar, «Bugungi natijam».
  - Navbat kartasida: mijoz, faktura, shartnoma, dorilar soni, berilgan vaqt, markirovka belgisi.
  - Katta taymer, qatorlarda «Olindi» belgisi, terish varag'ini chop etish.
  - Partiya tasdig'i: «Ha, shundan oldim» / «Boshqa partiyadan oldim».
- **Markirovkachi paneli.** Yorliqlar: Navbat, Mening markirovkam, Bugun yakunlanganlar, Kodlar jurnali.
  - Doimiy fokusli skanerlash maydoni: USB yoki Bluetooth skaner klaviatura rejimida.
  - Hisoblagichlar «10 / 10 quti · 25 dona».
  - Xato bo'lsa katta qizil ekran va ovoz chiqadi; to'g'ri kodda yashil ekran va qisqa ovoz.
- **Ombor mudiri paneli.** Yorliqlar: Monitor (bosqichlar ustunlari, jonli taymerlar, kechikkanlar), Vaqt berish, Hisobdan o'tkazish, Hujjatlashtirish, Muammolar, Kirim qabuli, Ko'chirish qabuli, Qaytgan tovar; «Ombor holati» bloki.
- **Haydovchi paneli.** Yorliqlar: Reysim, Yakunlangan reyslar.
  - Har buyurtmada manzil, telefon, joylar soni, summa va naqd bo'lsa olinadigan summa.
  - Yuklash → reysni boshlash → har manzilda: Yetkazildi (rasm) / Qisman / Yetkazilmadi → naqd pul → «Reysni yakunlash».
- **Qaytgan tovar** ikki bosqichda o'tadi: «Qaytmoqda» → Ombor mudiri sanab qabul qiladi → Karantin. Farq bo'lsa muammo sifatida yoziladi. Qisman qaytgan tovar asl sotuv narxida qaytarish (QM) sifatida yoziladi.
- **Haydovchidagi pul:** naqd pul → «Haydovchidagi pul» → Kassir qabul qiladi → MT yoziladi, mijoz qarzi kamayadi.

### 5.5 Pul

- **MT (mijozdan to'lov):** eng eski qarzdan avtomatik taqsimlanadi (qo'lda o'zgartirish mumkin); ortiqcha summa avans bo'ladi. Holatlar: qoralama → o'tkazilgan.
- **YT (yetkazib beruvchiga to'lov):** qoralama → tasdiqlashda → o'tkazilgan.
- **KO / BO** — kassa va bank kirim/chiqim operatsiyalari (moddalar bilan). Kassa chiqimi 2 000 000 so'mdan katta bo'lsa — Filial rahbari tasdig'i kerak. **IO** — hisoblar orasidagi o'tkazma, shu jumladan «Terminal → bank».
- **Hisoblar:** har filialda kassa(lar), **Terminal** (Online — karta to'lovlari shunga tushadi) va bank hisoblari.
- **Kunni yopish:** faqat kassalarda — kupyuralar sanog'i; farq bo'lsa izoh va PIN. Yopilgan kunga yangi hujjat kiritilmaydi. Bankda kunni yopish o'rniga ko'chirma bilan solishtirish qilinadi.
- **Xarajat moddalari:** Transport va yoqilg'i, Xo'jalik, Bank komissiyasi, Soliqlar, Ish haqi, Ijara, Kommunal, Boshqa. Kirim moddalari: Boshqa kirim, Bank foizi, Qaytarilgan mablag'.
- **Qarz** faqat hujjatlardan hisoblanadi (jurnal). Muddati o'tgan qarz to'lov kunidan sanaladi. Qarz muddatlari guruhlari: muddati kelmagan / 1–30 / 31–60 / 61–90 / 90+ kun.
- **Akt sverka:** prototipdagi holatida qoladi. To'liq SmartUp shaklidagi akt V1 ishga tushgandan keyin quriladi (18-bo'lim).

---

## 6. Biznes qoidalari

**O'zgarmas tizim qoidalari:**
1. Mahsulot katalogda bir marta yaratiladi. Har mahsulotning **8 raqamli noyob kodi** bor: tasodifiy, boshida 0 bo'lmaydi; o'zgartirsa bo'ladi, o'zgarish tarixga yoziladi.
2. Qoralama hujjat qoldiq va qarzga ta'sir qilmaydi.
3. Qoldiq faqat tasdiqlangan (o'tkazilgan) hujjat orqali o'zgaradi; qo'lda tuzatib bo'lmaydi.
4. Tasdiqlangan hujjat tahrirlanmaydi va o'chirilmaydi — faqat sababi bilan bekor qilinadi, tarix saqlanadi.
5. Qoldiq hech qachon minusga tushmaydi; hech qaysi partiyadan kirimdan ko'p sotilmaydi.
6. Muddati o'tgan tovar sotilmaydi. Sotuvga yopiq zonadagi tovar buyurtmaga tushmaydi.
7. **FEFO:** buyurtma «Navbatda»ga o'tganda tizim muddati eng yaqin partiyani taklif qiladi va zahiraga qo'yadi. Bunda sotuvga ochiq zona va mijozning minimal muddat talabi hisobga olinadi. Yig'uvchi boshqa partiyani tanlasa, ogohlantirish chiqadi, lekin bu bloklamaydi.
8. Tizim qaysi dori sovuq ekanini bilmaydi: zonani kirimda Ombor mudiri tanlaydi. Nazoratdagi mahsulot faqat ruxsati bor omborga va litsenziyali mijozga beriladi.
9. Mijozdan qaytgan va yetkazilmagan tovar Karantinga tushadi.
10. Qarz, avans, bonus balans va kassa qoldig'i faqat hujjatlardan hisoblanadi, qo'lda kiritilmaydi.
11. Ruxsatlar serverda tekshiriladi; xodim faqat o'z filiali va roli doirasida ishlaydi.
12. Barcha muhim harakatlar o'zgarmas audit jurnaliga yoziladi.
13. Filial, ombor, mahsulot, mijoz va xodim o'chirilmaydi — faqat nofaol qilinadi yoki bloklanadi.

**Narx:**
- **8 ta narx turi:** Narx (bazaviy), Promo, Aksiya, Vozvrat, Health Line narxi, Ulgurji partiya narxi, Tovar chegirmasi, Distribyutor narxi. Mijozga narx turi filial shartida biriktiriladi. Vozvrat turi QM da avtomatik ishlatiladi.
- **Narx tuzilishi:** narx = mahsulot × narx turi × filial × kuchga kirish sanasi, QQS bilan. Har saqlash NO hujjati bo'ladi va tarixi yoziladi.
- **Nazorat:** tannarxdan past narx — Direktor tasdig'i bilan; 20% dan ko'p o'zgarish — ogohlantirish. Narx yaxlitlanmaydi — so'm va tiyinigacha aniq (egasi qarori 07.11.2026). Ommaviy ustama o'rtacha kirim narxiga, oxirgi kirim narxiga, bazaviy narxga yoki partiya narxiga nisbatan qo'llanadi.
- **Narx o'rnatish ikki rejimda:** «Mahsulot bo'yicha» va **«Kirim bo'yicha»**. Ikkinchisida narx faqat tanlangan kirim partiyalariga qo'yiladi; faqat o'tkazilgan kirimga qo'yish mumkin.
- **Narx tanlash tartibi:** 1) shu partiyaning narxi (mijoz turida, bo'lmasa bazaviy turda); 2) mijoz narx turining narxi; 3) bazaviy narx. Partiya narxi ustun turadi.
- Bir qator bir necha partiyaga tushsa, har partiya o'z narxida hisoblanadi; qator narxi o'rtacha tortilgan narx bo'ladi.
- **Narxni muzlatish:** tasdiqlangan buyurtmada narx o'zgarmaydi. Qoralamada narx o'zgarsa, «Narx o'zgardi» ogohlantirishi chiqadi.

**Kredit nazorati:** limit oshsa yoki muddati o'tgan qarz bo'lsa — bloklanmaydi, buyurtma tasdiqqa ketadi. Limit ≤ 20% oshsa — Filial rahbari tasdiqlaydi; > 20% oshsa yoki muddati o'tgan qarz 30 kundan ortiq bo'lsa — Direktor. Bloklangan yoki litsenziyasi o'tgan mijozga buyurtma kiritilmaydi.

**Markirovka (har skanerlashda tekshiruv tartibi):** format → takror (barcha buyurtmalar bo'yicha global) → mahsulot (GTIN) → partiya (yig'uvchi tasdiqlagan) → tur (quti yoki dona, qator birligiga mos) → qator to'lganmi.
- Kod reestrda bor va sotilmagan bo'lsa qabul qilinadi.
- Bekor qilingan kodni qayta urish mumkin.
- Qabul qilingan kodni yakunlashdan oldin, sababi bilan olib tashlash mumkin.
- Kod formati GS1: (01) GTIN · (21) seriya · (17) yaroqlilik · (10) partiya · (91) Q/D.

**Savdo ko'rsatkichi:** «Savdo» = **sof savdo** — sotuv − qaytarishlar (QM) − yetkazilmaganlar, QQS bilan. Bosh sahifa kartasi, Operatorlar bloki va Savdo hisoboti bir xil manbadan hisoblanadi.

**Ta'minotchi hisobi:** Olib keldi = Sotildi + Qoldi + boshqa harakat (QY, hisobdan chiqarish). Hisob tannarxda, bonus tovar ham kiradi; ko'rsatkichlar xodim («Kim nomiga») va korxona bo'yicha alohida.

---

## 7. Hujjatlar, raqamlash va holatlar

**Raqam formati:** `PREFIKS-FILIAL-000001` (masalan, `BY-TSH-000355`). Raqam qoralama yaratilganda bir marta beriladi va qayta ishlatilmaydi.

| Prefiks | Hujjat | Prefiks | Hujjat |
|---|---|---|---|
| BY | Buyurtma | MT | Mijozdan to'lov |
| SV | Sotuv | YT | Yetkazib beruvchiga to'lov |
| HF | Hisob-faktura | KO / BO | Kassa / bank operatsiyasi |
| NK | Nakladnoy | IO | Hisoblar orasida o'tkazma |
| RS | Reys | AH | Avansni hisobga olish |
| KR | Kirim | AS | Akt sverka |
| BNS | Bonus (yetkazib beruvchidan) | ZK / OK | Zona / ombor ko'chirishi |
| QM | Mijozdan qaytarish | FS | Filiallararo savdo |
| QY | YB ga qaytarish | IN | Inventarizatsiya |
| HC | Hisobdan chiqarish | BQ | Boshlang'ich qoldiq |
| NO | Narx o'zgarishi | | |

**Holatlar mashinalari** (9 ta, batafsili `notes/T12-topshirish.md` da): buyurtma (5.2), kirim (5.1), MT, YT, NO (Qoralama → Direktor tasdig'ida → Tasdiqlangan / Rad etilgan / Bekor qilingan), reys, inventarizatsiya (Qoralama → Sanoq → Tekshirish → Tasdiqlangan), ko'chirish (Jo'natildi → Yo'lda → Qabul qilindi), akt sverka.

**Chop etish shakllari:** nakladnoy, hisob-faktura, terish varag'i (bir necha buyurtma bitta varaqda), yo'l varaqasi, kassa orderi, NO, akt sverka.
**Hisob-faktura — rasmiy shakl (egasi 13.11.2026, O11):** albom A4; sotuvchi va xaridor: nomi, manzili, STIR, QQS to'lovchi reg. kodi, hisob raqami, bank, MFO, telefon; shartnoma raqami va sanasi; qatorlar: MXIK (IKPU), o'lchov birligi va uning kodi, partiya/yaroqlilik, miqdor, narx, QQSsiz qiymat, QQS stavkasi va summasi, QQS bilan qiymat, markirovka kodlari soni (to'liq ro'yxat — .xlsx ilova); jami so'z bilan; imzolar: Rahbar, Bosh buxgalter, Topshirdi, Qabul qildi (ishonchnoma). PDF va Excel; reys bo'yicha ommaviy chop etish; MXIK bo'sh qatorlar — buyurtma kartasida ogohlantirish, Mahsulotlarda «MXIK yo'q» filtri.

---

## 8. Bosh sahifalar, panellar va hisobotlar

**Direktor va Admin bosh sahifasi:**
- **4 ta karta** — Savdo (sof), Mijozlar qarzi, Ta'minotchilarga qarz, Xarajatlar. Har birida jami va Naqd / Perechisleniye / Online bo'yicha. Davr: Bugun / Hafta / Oy / Ixtiyoriy. Ostida filiallar bo'yicha 4 yorliqli jadval.
- **«Diqqat talab qiladi»:**
  - muddati o'tgan qarz (1–30 / 31–60 / 61–90 / 90+);
  - Direktor tasdiqlari;
  - muddati tugaydigan partiyalar (0–30 / 31–60 / 61–90);
  - yo'ldagi ko'chirishlar;
  - ta'minotchiga to'lov kuni (kechikkan / bugun / 3 kun ichida);
  - bonus tasdig'i, o'tkazish kutayotgan kirimlar, haydovchidagi pul.
  - Har qator bosilsa, sahifa tegishli filtr bilan ochiladi.
- **Filiallar kesimi**, **Eng katta qarzdorlar**.
- **Buyurtma holatlari bloki:** 11 katak (soni + summa + «N kundan oshgan»), filtr: Hammasi / Bugungi / Kechikkanlar.
- **Operatorlar** (top 5, savdo QQS bilan), **Ta'minotchi xodim** va **Ta'minotchi korxona** (Olib keldi / Sotildi / Qoldi, top 5, Aktiv / Passiv).

**Buyurtmalar sahifasi:** jadval ustida holat yorliqlari — «Hammasi» + 13 holat, har birida soni va summasi; raqamlar filtrga bog'liq. «Hozir kimda» ustuni bor.

**Kassir paneli:**
- filtrlar: davr, hisob, to'lov turi;
- 5 karta: Qoldiq pullar (Naqd / Terminal / Bank), Kirim pullar, Chiqim pullar, Xarajatlar (moddalar bo'yicha), Kutilayotgan pullar (haydovchidagi pul, mijozlarning to'lov kuni, tasdiqlanmagan MT);
- hisoblar jadvali (davr boshi + kirim − chiqim = joriy), kunlik dinamika, oxirgi operatsiyalar, amallar.

**Boshqa bosh sahifalar:** Filial rahbari, Operator, Buxgalter, Xarid (qabul / o'tkazish kutayotgan kirimlar, YB qarzi va to'lov kunlari, bonus, «O'z nomimdagi tovar»).

**Hisobotlar:** katalog bo'yicha. Har hisobotda filtr, jami qatori va .xlsx eksport bor; qator bosilsa, hujjatlari ochiladi. Ruxsat reports.* kalitlari bilan beriladi; tannarx ustunlari faqat tannarx ko'rish ruxsati borlarga ko'rinadi.

**Bitta manba qoidasi:** bir xil ko'rsatkich hamma joyda bir xil chiqadi — qarz, qoldiq, holatlar, kassa. Prototipda bu tekshirilgan.

---

## 9. Dizayn tizimi va UX qoidalari

Manba — Claude Design'dagi **«Medix» dizayn tizimi** (tokens.json, README). Uslub: Linear, Stripe Dashboard kabi toza va jiddiy. Qimmat ko'rinish bezakdan emas, intizomdan keladi.

**Ranglar (tokenlar):**

| Token | Qiymat | Qayerda |
|---|---|---|
| brand-900 | #123C3A | Sidebar foni |
| primary | #0D9488 | Faol ikonka, fokus halqasi, progress (matnda emas) |
| primary-button | #0F766E | Asosiy tugma, havola matni |
| primary-button-hover | #115E59 | Asosiy tugma hover holati |
| primary-soft | #DDF5EE | Tanlangan qator yoki element |
| background / surface | #F5F7F8 / #FFFFFF | Sahifa foni / kartalar |
| table-header | #F8FAFA | Jadval sarlavhasi va hover |
| text-primary / secondary / disabled | #172B2A / #5B6B6A / #94A3A1 | Matn |
| border | #E2E8F0 | Chegaralar |
| success / warning / danger / info | #15803D / #B45309 / #B91C1C / #1D4ED8 | Holat matni (fonlari: #F0FDF4 / #FFFBEB / #FEF2F2 / #EFF6FF) |

**Tipografiya:** Inter (400, 500, 600); JetBrains Mono — hujjat raqami, kod, partiya, STIR uchun.
- O'lchamlar: sahifa sarlavhasi 24/32; bo'lim sarlavhasi 18/26; asosiy matn 14/20; jadval 13/18; izoh 12/16; KPI 28/36.
- Raqamlar tabular, o'ngga tekislangan.

**O'lchamlar:**
- masofalar 4 px ga karrali;
- tugma va maydon balandligi: 32 / 36 / 44 px; panellarda kamida 48 px;
- jadval qatori 40 / 36 px;
- radius: 6 px (tugma), 8 px (karta), 12 px (oyna);
- soya faqat oynalar va menyularda;
- ikonkalar faqat Lucide, chiziq qalinligi 1,5.

**UX qoidalari:**
1. Har ekranda bitta asosiy tugma. Tugma matni fe'l bilan yoziladi: «Kirimni o'tkazish», «OK» emas.
2. Holat doim ikonka + so'z + rang bilan ko'rsatiladi.
3. Xavfli harakatda tasdiq oynasi chiqadi va oqibatni raqamlar bilan aytadi; bekor tugmasi — «Ortga».
4. Xato matni ikki qismdan iborat: nima bo'ldi + nima qilish kerak. Texnik kodlar ko'rsatilmaydi.
5. Ruxsati yo'q harakatda kim bajara olishi yoziladi.
6. Klaviatura bilan ishlash mumkin, fokus ko'rinib turadi.
7. Matn kontrasti ≥ 4,5:1. Auditda izoh matni 2,9:1 va havolalar 3,7:1 chiqdi — V1 da tuzatiladi.
8. Har jadval va sahifada bo'sh, yuklanish, xato va «ruxsat yo'q» holatlari bo'ladi.
9. Imlo: o'zbek lotinida ʻ (U+02BB) va ʼ (U+02BC) belgilari; sarlavhalarda faqat birinchi harf katta.

---

## 10. Texnologiyalar

Tanlov mezonlari: uzoq muddatli qo'llab-quvvatlash (LTS), pul va qoldiqda xatosizlik, bitta dasturchi + Claude Code uchun qulaylik, katta ekotizim.

> Loyiha egasi qarori: backend — **Java + Spring Boot**, ma'lumotlar bazasi — **PostgreSQL**, frontend — **Next.js + TypeScript**. Bu oldingi taklifni (`MEDIX_texnologiyalar.md`: TypeScript/NestJS) almashtiradi.

### 10.1 Asosiy stek

| Qatlam | Tanlov | Versiya | Nega |
|---|---|---|---|
| Backend tili | **Java** | **25 (LTS)** | Uzoq muddatli versiya; virtual oqimlar (virtual threads), record'lar, pattern matching |
| Backend freymvork | **Spring Boot** | **4.1.x** (joriy barqaror) | Spring Framework 7, Jakarta EE 11; 4.0 qo'llab-quvvatlashi 2026-yil dekabrida tugaydi, shuning uchun 4.1 olinadi |
| Qurish | **Gradle** (Kotlin DSL) | 9.x | Tez, Spring Boot bilan standart |
| Ma'lumotlar bazasi | **PostgreSQL** | **18.x** | Qo'llab-quvvatlash 2030-yilgacha; tranzaksiyalar, CHECK, triggerlar, JSONB, to'liq matnli qidiruv |
| Migratsiyalar | **Flyway** | Spring Boot 4.1 bilan mos | Har o'zgarish versiyalangan SQL fayl |
| Ma'lumotga kirish | **Spring Data JPA (Hibernate 7)** + **jOOQ** (hisobotlar va murakkab so'rovlar uchun) | Boot 4.1 bilan mos | Oddiy CRUD — JPA; jurnal, qarz, hisobot — SQL'ga yaqin va tiplari xavfsiz jOOQ |
| Modullar | **Spring Modulith** | 2.x | Modulli monolit: Ombor, Savdo, Pul va boshqalar alohida modul; chegaralar test bilan tekshiriladi |
| Xavfsizlik | **Spring Security 7** + **Spring Session JDBC** | Boot bilan | Login/parol, server sessiyasi httpOnly cookie'da; ruxsatlar metod darajasida |
| API | **REST (JSON)** + **springdoc-openapi** | 3.x | OpenAPI sxemasidan TypeScript tiplari avtomatik yaratiladi |
| Validatsiya | Jakarta Bean Validation (Hibernate Validator) | Boot bilan | Server tomonda yakuniy tekshiruv |
| Fon vazifalari | Spring Scheduling + **ShedLock** (PostgreSQL) | — | Eslatmalar, muddatlar, kunlik hisoblar; Redis kerak emas |
| Real vaqt | **Server-Sent Events** (Spring MVC) | — | Ombor mudiri monitori, taymerlar, bildirishnomalar |
| Kesh | **Caffeine** | — | Ma'lumotnomalar, ruxsatlar; V1 da Redis kerak emas |
| Excel | **Apache POI** (SXSSF) | 5.x | Import (SmartUp) va katta eksportlar |
| PDF / chop etish | **Thymeleaf** shablon → **OpenHTMLtoPDF** | — | Nakladnoy, hisob-faktura va boshqa shakllar bir xil dizaynda |
| Fayllar (rasm, imzo) | **S3-mos saqlash (MinIO)** | — | Haydovchi rasmlari, imzolar, import fayllari |
| Loglar va monitoring | Spring Boot **Actuator** + **Micrometer** → **Prometheus** + **Grafana**; **Sentry** | — | Xatoni foydalanuvchidan oldin bilish |
| **Frontend freymvork** | **Next.js** (App Router) | **16.2.x** | Joriy barqaror versiya |
| UI kutubxona | **React** | **19.x** | Next.js 16 bilan |
| Til | **TypeScript** | 5.x (joriy barqaror), `strict` | Tiplar xavfsizligi |
| Server ma'lumoti (holat) | **TanStack Query (React Query)** | **v5** | Kesh, qayta yuklash, optimistik yangilash. **Redux kerak emas** (pastga qarang) |
| Mahalliy holat | **Zustand** | 5.x | Faqat kichik global holat: filial tanlovi, ochiq hujjat, UI sozlamalari |
| Jadvallar | **TanStack Table** | v8 | Ustunlar, saralash, guruhlash, ochiladigan qatorlar, virtualizatsiya |
| Formalar | **React Hook Form** + **Zod** | — | Tez formalar, sxema bilan tekshiruv |
| Stil | **Tailwind CSS** | **4.x** | Medix tokenlari CSS o'zgaruvchilari sifatida |
| Komponentlar | **shadcn/ui** (Radix asosida) — Medix dizayniga moslab | — | Kirish imkoniyati (a11y) tayyor; kod loyiha ichida |
| Ikonkalar | **lucide-react** | — | Dizayn tizimi talabi |
| Tillar | **next-intl** | — | uz-Latn, uz-Cyrl, ru; kalitli lug'atlar |
| Grafiklar | **Recharts** | — | Kassir paneli dinamikasi, bosh sahifa |
| API mijozi | **openapi-typescript** + **openapi-fetch** (yoki Orval) | — | OpenAPI'dan tiplangan so'rovlar va React Query hook'lari |
| Paket menejeri | **pnpm** | — | Tez va tejamkor |
| Node.js | **24 LTS** | — | Next.js uchun |

**Nega Redux emas, React Query?** MEDIX ma'lumotining deyarli hammasi serverda yashaydi: hujjatlar, qoldiqlar, qarzlar. React Query aynan shu uchun yaratilgan: keshlash, eskirganini yangilash, xatolarni boshqarish. Redux bu ishlar uchun ko'p qo'shimcha kod talab qiladi. Haqiqiy global holat kam (filial, ochiq hujjat, UI), uning uchun yengil Zustand yetarli.

**Nega Next.js?** Next.js katta ekotizimga ega va marshrutlash tayyor. U `/api` so'rovlarini Spring'ga proksi qiladi, shuning uchun sahifa va API bir domenda ishlaydi (cookie va xavfsizlik oddiy). ERP login ortida ishlaydi, shuning uchun sahifalar asosan mijoz tomonda chiziladi (client components). Server tomonda chizish (SSR) faqat login va qobiq uchun kerak.

### 10.2 Ishlab chiqish vositalari

| Vosita | Vazifa |
|---|---|
| **Claude Code** | Kodni bosqichma-bosqich yozish (17-bo'lim) |
| Git + GitHub | Kod, PR, tarix |
| GitHub Actions | Har PR'da build, test, lint |
| Docker + Docker Compose | Lokal muhit va serverda bir xil ishga tushirish |
| Testcontainers | Haqiqiy PostgreSQL bilan integratsion testlar |
| Spotless / Checkstyle, ESLint + Prettier | Kod uslubi |
| IntelliJ IDEA yoki VS Code | Muharrir |

### 10.3 Qurilmalar

- **Skaner:** USB yoki Bluetooth 2D skaner, klaviatura rejimida (drayver kerak emas). GS1 kodlari frontendda o'qiladi, serverda yana bir bor tekshiriladi.
- **Printer:** oddiy A4 printer. Chop etish PDF orqali.
- **Telefonlar** (Yig'uvchi, Markirovkachi, Haydovchi): brauzer va kamera (haydovchi rasmi uchun).

---

## 11. Arxitektura

**Modulli monolit** — bitta Spring Boot ilovasi, ichida aniq modullar bor. Mikroservislar ishlatilmaydi: bitta dasturchi uchun ular ortiqcha murakkablik.

```
medix/
├── backend/                 # Spring Boot 4.1, Java 25, Gradle
│   └── src/main/java/uz/medix/
│       ├── shared/          # pul, sana, raqamlash, audit, xatolar
│       ├── identity/        # login, xodimlar, rollar, ruxsatlar, filiallar
│       ├── catalog/         # mahsulotlar, ma'lumotnomalar, kontragentlar
│       ├── pricing/         # narx turlari, narxlar, NO
│       ├── inventory/       # omborlar, zonalar, partiyalar, harakatlar jurnali, ko'chirish, inventarizatsiya
│       ├── purchasing/      # kirim, bonus balans, QY
│       ├── sales/           # buyurtma, tasdiq, zanjir, sotuv, HF, QM
│       ├── warehouse/       # yig'ish, markirovka, tekshiruv, hujjatlashtirish (panellar)
│       ├── delivery/        # reys, haydovchi, qaytgan tovar
│       ├── finance/         # MT, YT, kassa, Terminal, bank, IO, kunni yopish, qarz jurnali
│       ├── reporting/       # bosh sahifalar, hisobotlar (jOOQ)
│       ├── notification/    # bildirishnomalar, eslatmalar, SSE
│       └── integration/     # import (SmartUp), keyin: e-faktura, «Asl belgisi», bank
├── frontend/                # Next.js 16, TypeScript
│   ├── app/                 # sahifalar (marshrutlar)
│   ├── components/ui/       # Medix komponentlari (shadcn asosida)
│   ├── features/            # modullar bo'yicha (orders, receipts, stock …)
│   ├── lib/api/             # OpenAPI'dan yaratilgan mijoz
│   └── messages/            # uz-Latn, uz-Cyrl, ru
├── docs/                    # TZ, ma'lumotlar modeli, qarorlar (ADR)
├── docker-compose.yml
└── CLAUDE.md
```

**Arxitektura qoidalari:**
1. **Jurnal (ledger):** ombor va pul harakatlari faqat qo'shiladigan jurnalga yoziladi. Qoldiq, qarz, avans, bonus balans va kassa qoldig'i shu jurnaldan hisoblanadi. Tezlik uchun qoldiqlar jadvali bor, lekin u faqat jurnal bilan bir tranzaksiyada yangilanadi.
2. **Pul:** `NUMERIC(18,2)` (bazada) va `BigDecimal` (Java'da), yaxlitlash HALF_UP. Kasr son (float/double) hech qachon ishlatilmaydi. Miqdor butun son.
3. **Tranzaksiyalar:** hujjatni o'tkazish bitta tranzaksiya: qoldiq + jurnal + qarz + audit birga yoziladi. Bir vaqtda o'zgartirishdan himoya: optimistik qulf (`@Version`) va zahirada `SELECT … FOR UPDATE`.
4. **Bazadagi himoya:** qoldiq ≥ 0 (CHECK); tasdiqlangan hujjatni o'zgartirish triggerlar bilan taqiqlanadi; noyob raqamlar (UNIQUE).
5. **Filial:** har yozuvda filial bor. Filial filtri serverda majburiy qo'llanadi.
6. **Vaqt:** `timestamptz`, ko'rsatishda Asia/Tashkent.
7. **Holatlar:** har hujjatning holat mashinasi bor. O'tishlar faqat ruxsat etilgan yo'llar bo'yicha, ruxsat kaliti bilan va audit bilan bo'ladi.
8. **Integratsiyalar** alohida modul va adapter orqali ulanadi, asosiy kodga tegmaydi.
9. **Hodisalar:** modullar orasida Spring Modulith hodisalari ishlatiladi. Masalan, «SotuvYozildi» hodisasidan keyin qarz va bildirishnoma yangilanadi.

---

## 12. Ma'lumotlar modeli (asosiy obyektlar)

To'liq maydonlar va bog'lanishlar dasturlashdan oldin alohida «Ma'lumotlar modeli» hujjatida yoziladi. Manba — `notes/T12-topshirish.md`.

| Guruh | Obyektlar |
|---|---|
| Tashkilot | Company, Branch, Warehouse, Zone (turi, sotuvga ochiqmi), Employee, Role, Permission (kalit), RolePermission, Session, AuditLog |
| Katalog | Product (8 raqamli kod, nomi, shartnomadagi nomi, klassifikator nomi, ishlab chiqaruvchi, kategoriya, davlat, ta'minot mas'uli, IKPU, Farm ID, shtrix-kodlar, birlik, nazoratdagi, markirovkali, retsept, QQS, min/max, holat), Manufacturer, Category, Unit, Country, Region, Vehicle, ExpenseItem |
| Kontragent | Counterparty (STIR, nomlar, kontaktlar, bank, litsenziyalar, shartnomalar), CounterpartyBranchTerms (mijoz: limit, muddat, narx turi, minimal muddat, operator; YB: muddat, asosiy to'lov turi, ta'minot mas'uli) |
| Narx | PriceType (8 ta, bazaviymi, partiyalimi), Price (mahsulot, tur, filial, partiya?, narx, kuchga kirish sanasi, NO), PriceChange (NO: manba, kirim?, holat, tasdiq) |
| Ombor | Batch (partiya: mahsulot, raqam, yaroqlilik, tannarx, bonusmi, kirim qatori), StockBalance (zona × partiya), StockMove (jurnal), Transfer, InventoryCount, WriteOff (HC), OpeningBalance (BQ) |
| Xarid | Receipt + ReceiptLine (soni, haqiqiy soni, farq sababi, bonus soni), SupplierBonus (BNS), SupplierReturn (QY) |
| Savdo | Order + OrderLine (narx muhri, partiya bo'linishi, zahira), OrderStatusHistory, ApprovalRequest (sabablar), Issue (muammo), PickTask (vaqt, natija), MarkingTask + MarkingCode, CheckTask, Sale (SV) + Invoice (HF), CustomerReturn (QM) |
| Yetkazish | Trip (RS) + TripStop, DeliveryProof (rasm, imzo), ReturnIntake (qaytgan tovar qabuli), DriverCash |
| Pul | Account (kassa, Terminal, bank), Payment (MT/YT) + Allocation, CashOperation (KO/BO), InternalTransfer (IO), DayClose, Advance (AH), DebtLedger (qarz jurnali), Reconciliation (AS) |
| Tizim | DocumentSequence (raqamlash), Notification, Setting (masalan, kechikish chegarasi), ImportJob |

---

## 13. Xavfsizlik va ruxsatlar

- **Kirish:** login va parol (BCrypt/Argon2). Birinchi kirishda parolni almashtirish majburiy. Bloklangan xodim kira olmaydi. Sessiya httpOnly va Secure cookie'da, CSRF himoyasi bilan.
- **Ruxsatlar:** rol → ruxsat kalitlari (prototipda 131 ta, masalan `orders.queue`, `receipt.post`, `marking.scan`, `special.cost`). Har API metodida tekshiriladi (`@PreAuthorize`). Frontend faqat ko'rinishni boshqaradi, yakuniy qaror serverda.
- **Ma'lumot doirasi:** xodim faqat o'z filialini ko'radi. Barcha filiallar — faqat ruxsati borlarga (Direktor, Admin; Buxgalter — faqat Direktor xodim kartasida bergan belgi bilan, audit — egasi qarori 07.11.2026). Kassir amallarni faqat o'z kassasida bajaradi.
- **Tannarx:** faqat tannarx ruxsati borlarga ko'rinadi (Direktor, Admin, Filial rahbari, Buxgalter; Xarid — faqat Narxlarda). API ham tannarx maydonini yubormaydi.
- **PIN:** rahbar tasdiqlari va kassa farqi uchun ikkinchi tasdiq.
- **Audit:** kim, qachon, nima, eski → yangi qiymat. Jadval faqat qo'shiladigan.
- **Zaxira:** kunlik to'liq nusxa va WAL arxivi (pgBackRest), boshqa joyda nusxa; tiklash har oy sinab ko'riladi.
- **Shaxsiy ma'lumotlar:** O'zbekiston qonunchiligi bo'yicha fuqarolarning shaxsiy ma'lumotlarini O'zbekiston hududidagi serverda saqlash talabi bor — yurist bilan tasdiqlash kerak (18-bo'lim).

---

## 14. Sifat: testlar, kod qoidalari

**Testlar:**
- **Birlik testlari** (JUnit 5, AssertJ): narx tanlash, FEFO, QQS, qarz taqsimoti, markirovka tekshiruvi, holat o'tishlari.
- **Integratsion testlar** (Testcontainers + PostgreSQL 18): hujjatni o'tkazish → qoldiq, jurnal, qarz va audit birga to'g'ri yoziladi; bir vaqtda ikki zahira — qoldiq minusga tushmaydi.
- **Modul chegaralari:** Spring Modulith testi.
- **Frontend:** Vitest + Testing Library (komponentlar), **Playwright** (e2e: buyurtma zanjiri boshidan oxirigacha, kirim, kassa).
- **Prototip raqamlari etalon sifatida:** prototipdagi seed va natijalar (masalan, sof savdo, qarz jami) testlarda tekshiruv raqami bo'lib xizmat qiladi.

**Kod qoidalari:**
- Java: record'lar (DTO), bo'sh qiymatdan qochish (Optional), istisnolar ma'nolari bilan, xato matnlari foydalanuvchi tilida (i18n kalit).
- TypeScript: `strict`, `any` taqiqlangan, API tiplari faqat OpenAPI'dan olinadi.
- Har PR: build + test + lint yashil bo'lishi kerak; ma'lumotlar bazasi o'zgarishi faqat Flyway migratsiyasi orqali.

---

## 15. Joylashtirish va ekspluatatsiya

- **Muhitlar:** lokal (Docker Compose), sinov (staging), ishchi (production).
- **Server tarkibi (V1 uchun yetarli):**
  - `medix-backend` (Spring Boot, Java 25);
  - `medix-frontend` (Next.js, Node 24);
  - PostgreSQL 18;
  - MinIO (fayllar);
  - **Caddy** (HTTPS, teskari proksi);
  - Prometheus + Grafana (ixtiyoriy).
- **Server joyi:** O'zbekistondagi ma'lumotlar markazi yoki ofis serveri (mahalliylashtirish talabi tufayli). Docker tufayli istalgan joyga ko'chirish mumkin.
- **Taxminiy quvvat (20–40 foydalanuvchi):** 4 vCPU, 8–16 GB RAM, 200 GB SSD + zaxira saqlash joyi.
- **Yangilash:** GitHub Actions → Docker image → serverda `docker compose pull && up`. Migratsiyalar avtomatik bajariladi.

---

## 16. Versiyalar va V1 ish rejasi

| Versiya | Maqsad | Tarkib |
|---|---|---|
| **V1** | Toshkent filialida kundalik ish to'liq MEDIX'da (SmartUp bilan parallel) | Poydevor (login, usta, 11 rol, xodimlar, audit) · Ma'lumotnomalar (mahsulotlar, kontragentlar, narxlar) · Kirim, Qoldiqlar, Muddat · Buyurtma zanjiri va 4 panel · Pul (MT, YT, kassa, Terminal, bank, qarzlar, bonus) · Bosh sahifalar · Asosiy hisobotlar · Chop etish · SmartUp'dan import |
| **V2** | Barcha filiallar va ombor nazorati | Qolgan 3 filial · Ko'chirishlar (ZK, OK, FS) · Inventarizatsiya · Hisobdan chiqarish · QY · **Akt sverka (to'liq, SmartUp shakli)** · To'liq hisobotlar · **Kirill va rus tillari** |
| **V3** | Tashqi tizimlar | E-faktura · «Asl belgisi» API · Bank integratsiyasi · 1C |
| **V4** | Kengaytmalar | To'liq buxgalteriya · Harorat datchiklari · Xarid buyurtmasi · Xarajatlar batafsil · SmartUp'dan boshqa qismlar |

**V1 bosqichlari (Claude Code bilan):**

| № | Bosqich | Natija |
|---|---|---|
| 0 | Loyiha poydevori | Repozitoriy, Docker Compose, CI, CLAUDE.md, Flyway, OpenAPI → TS, Medix UI komponentlari asosi |
| 1 | Identifikatsiya | Login, sessiya, xodimlar, rollar, ruxsatlar matritsasi, filiallar, sozlash ustasi, audit |
| 2 | Katalog | Mahsulotlar (kod, pro jadval, import), ma'lumotnomalar, kontragentlar va filial shartlari |
| 3 | Narxlar | Narx turlari, Narx o'rnatish (2 rejim), NO, tarix, narx tanlash qoidasi |
| 4 | Ombor | Omborlar va zonalar, partiyalar, jurnal, Qoldiqlar, Muddat nazorati, BQ (SmartUp) |
| 5 | Kirim | Ikki bosqichli kirim, katalog sahifasi, bonus balans, aksiya, to'lov kuni, eslatmalar |
| 6 | Buyurtma | Buyurtma kiritish + katalog, kredit nazorati, tasdiq, Buyurtmalar (yorliqlar) |
| 7 | Ombor zanjiri | Navbatda, Yig'uvchi, Markirovkachi, Ombor mudiri panellari, reys, nakladnoy, terish varag'i |
| 8 | Yetkazish | Haydovchi paneli, sotuv/HF, qisman yetkazish, qaytgan tovar, haydovchidagi pul |
| 9 | Pul | MT, YT, kassa, Terminal, bank, IO, kunni yopish, qarz va avans, Kassir paneli |
| 10 | Bosh sahifa va hisobotlar | Rollar bosh sahifalari, «Diqqat talab qiladi», hisobotlar katalogi |
| 11 | Ishga tushirish | SmartUp'dan to'liq import, sinov, o'qitish, parallel ishlash, xatolarni tuzatish |

Har bosqich: kichik vazifalar → kod → testlar → loyiha egasi ko'rib chiqadi → keyingi bosqich.

---

## 17. Claude Code bilan ishlash tartibi

1. **Kodlashdan oldin tayyorlanadigan hujjatlar:**
   - TZ'ni yangilash: Claude Docs + Word;
   - **Ma'lumotlar modeli** (12-bo'lim asosida, `notes/T12-topshirish.md` bilan);
   - **CLAUDE.md**: stek, papkalar tuzilmasi, kod qoidalari, test qoidalari, «qilinmaydigan» narsalar, ishlash tartibi.
2. **Manbalar:** `MEDIX_loyiha_toliq.md` (shu hujjat), `MEDIX_ozgarishlar.md` (qarorlar tarixi), Claude Design prototipi (har ekranning namunasi), `notes/T12-topshirish.md` va `notes/T12-audit.md` (V1 da tuzatiladigan 23 ta kamchilik).
3. **Har vazifa uchun tartib:** reja → loyiha egasi tasdiqlaydi → kod va testlar → build/test yashil → qisqa hisobot → keyingi vazifa.
4. **Qoidalar:**
   - bir vaqtda bitta modul;
   - pul va qoldiq kodi faqat testlar bilan yoziladi;
   - prototipdagi demo vositalari (demo soat, demo skaner, demo rejimi) haqiqiy dasturga o'tkazilmaydi.

---

## 18. Ochiq savollar va keyinga qoldirilganlar

**V1 dan oldin hal qilinishi kerak:**
- SmartUp'dan 2–3 qatorli namuna eksport fayli (mahsulotlar, qoldiqlar, qarzlar);
- e-faktura qaysi xizmat orqali chiqariladi (V3 uchun, lekin HF raqami formatiga ta'sir qiladi);
- buxgalter bilan: QQS 12%, bonus tovarning tannarxi (0) va hisobi, guruh ichida tannarxda sotishning soliq oqibatlari;
- yurist bilan: shaxsiy ma'lumotlarni mahalliylashtirish (server joyi), nazoratdagi mahsulotlar hisobi talablari;
- yetkazib beruvchilarning chegirma jadvali (agar bo'lsa);
- server: o'z serverimi yoki O'zbekistondagi ma'lumotlar markazi.

**Keyinga qoldirilgan:**
- Akt sverka (to'liq) — V1 ishga tushgandan keyin (SmartUp namunasi saqlangan);
- kirill va rus tarjimasi — V2;
- auditdagi O'rta va Kichik kamchiliklar (23 ta) — V1 dasturlashda hisobga olinadi;
- yetkazishda mijoz imzosi (majburiy emas), Telegram bot, xarid buyurtmasi — keyingi versiyalarda.

**Prototipning oxirgi qadamlari:** T12a (qoralamaga qaytarishni cheklash, ruxsatlar, topshirish to'plamini to'ldirish) va `notes/` fayllarini loyihaga olish.

---

*Manbalar (texnologiya versiyalari, 01.11.2026 holatiga):*
- Spring Boot versiyalari va qo'llab-quvvatlash muddatlari: [HeroDevs — Spring Boot versions, April 2026](https://www.herodevs.com/blog-posts/spring-boot-versions-eol-dates-and-latest-releases-april-2026)
- Spring Boot 4.0 chiqishi: [spring.io blog — Spring Boot 4.0.0 available now](https://hn.jakechampion.name/reader/https://spring.io/blog/2025/11/20/spring-boot-4-0-0-available-now)
- PostgreSQL versiyalari: [postgresql.org — Versioning policy](https://www.postgresql.org/support/versioning)
- Next.js joriy versiyasi: [Next.js 16.2 — current stable](https://abhs.in/blog/nextjs-current-version-march-2026-stable-release-whats-new)
