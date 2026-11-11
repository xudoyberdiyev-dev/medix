# UI 100% — prototip bilan ekranma-ekran tekshiruv (11.11.2026, 14:00 oynasi)

Usul: prototip (`scripts/prototype-shot.cjs "Medix ERP"`, login → `hash:<sahifa>` qadami, rol — «Rol» menyusi) ↔ haqiqiy ilova
(«Demo skrinshotlar» workflow — toʻliq stek, e2e maʼlumotlari, 55 marshrut + rollar bosh sahifasi; log → base64 → jpg).
Har juftlik yonma-yon solishtirildi (matn, ustun, tugma, yorliq, KPI, tartib).

| # | Ekran | Holat | Izoh |
|---|---|---|---|
| 1 | Bosh sahifa (Direktor) | ✅ | KPI, toʻlov turlari, dinamika, diqqat |
| 2 | Buyurtmalar roʻyxati | tuzatildi | tugma «Yangi buyurtma» |
| 3 | Yangi buyurtma | ✅ | |
| 4 | Tasdiqlash | ✅ | |
| 5 | Joʻnatish | ✅ | |
| 6 | Kirim roʻyxati | ✅ | |
| 7 | Yangi kirim / kirim hujjati | tuzatildi | Filial (qulflangan), nakladnoy + **hisob-faktura raqami (backend V84)**, «Chegirma (bonus) bormi?», bosqichlar, karta |
| 8 | Qoldiqlar (mahsulot / partiya / daraxt) | ✅ | |
| 9 | Muddat nazorati | ✅ | |
| 10 | Koʻchirish | tuzatildi | tugma «Yangi koʻchirish» |
| 11 | Inventarizatsiya roʻyxati | tuzatildi | KPI «Jarayonda / Tasdiqlashda», yorliqlar, qidiruv, Ombor / Qatorlar / Farq (dona / summa) ustunlari, «Yangi inventarizatsiya» |
| 12 | Yangi inventarizatsiya | ✅ | |
| 13 | Mijozdan qaytarish (QM) | tuzatildi | yorliqlar (QM)/(HC)/(QY), «Qaytarishlar N», holat yorliqlari soni bilan, ustunlar |
| 14 | Hisobdan chiqarish (HC) | tuzatildi | sarlavha soni, holat yorliqlari, qidiruv, Ombor/Sabab/Qatorlar/Summa (tannarx), «Kim tasdiqladi» (backend postedBy), «Yangi hujjat» |
| 15 | YB ga qaytarish (QY) | tuzatildi | «Yetkazib beruvchiga qaytarish N», yorliqlar, qidiruv, Asos/Qatorlar, «Yangi qaytarish» |
| 16 | Boshlangʻich qoldiq | ✅ | |
| 17 | Toʻlovlar / yangi toʻlov | ✅ | |
| 18 | Kassa | ✅ | |
| 19 | Kassa operatsiyasi | ✅ | |
| 20 | Bank | ✅ | integratsiya banneri (egasi talabi) |
| 21 | Mijozlar qarzi | ✅ | |
| 22 | YB qarzi / Bonus balans | ✅ | |
| 23 | Akt sverka / yangi | ✅ | |
| 24 | Mahsulotlar / yangi mahsulot | ✅ | |
| 25 | Mijozlar / yangi mijoz | ✅* | «Excel'dan yuklash» — SmartUp importi (namuna kutilmoqda, 100% hisobiga kirmaydi) |
| 26 | Yetkazib beruvchilar | ✅* | xuddi shu |
| 27 | Narxlar | tuzatildi | «Narxlar N», «Narx turi yaratish» sarlavhada, filial tanlovi yorliqlar qatorida, «Partiya boʻyicha», «Sotuv narxi» |
| 28 | Boshqa maʼlumotnomalar | ✅ | |
| 29 | Filiallararo savdo | ✅ | prototipda bosqich namunasi; haqiqiysi toʻliq |
| 30 | Hisobotlar (+7 ichki) | ✅ | haqiqiyda qoʻshimcha kartalar bor |
| 31 | Kompaniya | ✅ | |
| 32 | Filiallar | tuzatildi | sarlavha «Boshqaruv / Filiallar», «Yangi filial» |
| 33 | Omborlar va zonalar | tuzatildi | sarlavha |
| 34 | Xodimlar | tuzatildi | sarlavha |
| 35 | Rollar va ruxsatlar | tuzatildi | sarlavha |
| 36 | Audit jurnali | tuzatildi | sarlavha; Tafsilot — maydon nomlari tarjimasi, kirish «Muvaffaqiyatli»; Qurilma ustunida qurilma |
| 37 | Sozlamalar | ✅ | |
| 38 | Profil | tuzatildi | Til — uchta radio karta |
| 39 | Ombor mudiri paneli (Monitor) | ✅ | prototipdagi «Demo soat» — demo vositasi, koʻchirilmaydi |
| 40 | Yigʻuvchi paneli | ✅ | |
| 41 | Markirovkachi paneli | ✅ | |
| 42 | Haydovchi paneli | ✅ | |
| 43 | Kassir paneli | tuzatildi | Davr (Bugun/Shu hafta/Shu oy/Ixtiyoriy), Hisob, Toʻlov turi (Hammasi/Naqd/Perechisleniye/Online), Filial; 5 karta — **kirim/chiqim tarkibi backendda qoʻshildi** (MT, boshqa, IO; YT, xarajatlar, IO; hujjatlar soni), barcha xarajat moddalari; hisoblar jadvali — Masʼul, Jami |
| 44 | Operator bosh sahifasi | ✅ | |
| 45 | Filial rahbari bosh sahifasi | ✅ | |
| 46 | Buxgalter bosh sahifasi | ✅ | |
| 47 | QM / HC / QY hujjat sahifalari | tuzatildi | qaytarish turlari yorliqlari, «Hujjat / Tarix» |
| 48 | Buyurtma kartochkasi, Inventarizatsiya hujjati, Mijoz va Mahsulot kartochkalari | ✅ | |

**Natija:** 48 ekran (rollar va hujjat sahifalari bilan) tekshirildi, 17 tasida farq topilib tuzatildi; backendda yetishmagan 3 qism qoʻshildi (V84 hisob-faktura raqami, kassir paneli kirim/chiqim tarkibi, HC «Kim tasdiqladi»).

**Ochiq (100% hisobiga kirmaydi yoki kichik):** Mijozlar/YB «Excel'dan yuklash» — SmartUp namunasi kelgach; yangi (saqlanmagan) kirim/toʻlov hujjatida «Hujjat/Tarix» yorligʻi — tarix hujjat saqlangach paydo boʻladi; prototip demo vositalari (Demo soat, Rol menyusi) — koʻchirilmaydi (CLAUDE.md).

## Kechki oyna 11.11 (20:00–22:30) — qoʻshimcha 31 ekran

Demo workflow'ga 32 ta yangi marshrut qoʻshildi (yangi hujjat shakllari, hujjat va kartochka sahifalari, boʻsh holat); prototip — `Medix ERP` (login → hash → qatorni bosish).

| # | Ekran | Holat | Izoh |
|---|---|---|---|
| 49 | Yangi mijozdan qaytarish (QM) | tuzatildi | «Qoralama» holati, bosqichlar «Qoralama → Tasdiqlangan», «Hujjat / Tarix» |
| 50 | Yangi hisobdan chiqarish (HC) | tuzatildi | QM/HC/QY yorliqlari, «Qoralama», bosqichlar, sarlavha bloki (Ombor, Zona, Sabab, Dalolatnoma, Komissiya, Izoh), «Qatorlar N» bloki + «Muddati oʻtganlarni qoʻshish», jami (Qatorlar a/b, Jami dona) |
| 51 | Yangi YB ga qaytarish (QY) | tuzatildi | QM/HC/QY yorliqlari, «Qoralama», bosqichlar, «Hujjat / Tarix» |
| 52 | Yangi ombor koʻchirishi (OK) | ✅ | |
| 53 | OK hujjati | ✅ | |
| 54 | OK qabul | ✅ | (yoʻlda boʻlmasa — tushuntirish holati) |
| 55 | Yangi zona koʻchirishi (ZK) | ✅ | |
| 56 | ZK hujjati | ✅ | |
| 57 | Yangi filiallararo savdo (FS) | ✅ | |
| 58 | FS hujjati | ✅ | |
| 59 | Kassa operatsiyasi hujjati | ✅ | |
| 60 | Mijoz qarzi kartochkasi | tuzatildi | yon kartalar 1440 px da ustun boʻlib (oldin 4–5 ta tor ustun edi); qarzi yoʻq kontragent nomi sarlavhada |
| 61 | YB qarzi kartochkasi | tuzatildi | xuddi shu |
| 62 | Inventarizatsiya sanogʻi | ✅ | |
| 63 | Yangi boshlangʻich qoldiq (tovar) | ✅ | |
| 64 | Yangi YT / MT hujjati | ✅ | |
| 65 | Narx oʻrnatish | ✅ | |
| 66 | NO hujjati | ✅ | |
| 67 | Mahsulot importi | ✅ | |
| 68 | Akt sverka hujjati | tuzatildi | mavjud boʻlmagan hujjat — «Hujjat topilmadi» (oldin «Maʼlumot yuklanmadi»); barcha hujjat sahifalarida (39 joy) |
| 69 | Reys sahifasi | ✅ | |
| 70 | YB kartochkasi | tuzatildi | «Keyingi toʻlov kuni» (backend `nextDue` + IT), «Bonus balans», «Kutilayotgan» kartalari |
| 71 | Yangi YB / mijoz shakli | tuzatildi | matnlar: «Asosiy», «STIR», «Qisqa nomi», «Kontaktlar», «Ism», «Lavozim», boʻlim izohlari |
| 72 | Xodim kartochkasi | ✅ | |
| 73 | Hisobot: Qaytarishlar | tuzatildi | sabab kodlari (DAMAGED …) tarjima qilinadi |
| 74 | Hisobot: Taʼminotchi xodim tovari | ✅ | |
| 75 | Mahsulot / mijoz tahrirlash | ✅ | |
| 76 | Login | ✅ | |
| 77 | Boʻsh holat (filtr natijasiz) | ✅ | |
| 78 | Avansni hisobga olish | ✅ | (parametrsiz URL — 404, ataylab) |
| 79 | Yangi YB / mijoz (sahifa) | ✅ | |

**Kechki oyna natijasi:** yana 31 ekran tekshirildi (jami 79), 9 tasida farq topilib tuzatildi; backendda yetishmagan qism: `nextDue` (kontragent kartochkasi, finance ochiq API `DebtSummaries.nextDue`).

**Ochiq (kichik):** OK/ZK yangi hujjatda «Zona» maydoni prototipda yoʻq (haqiqiy tizimda zona tanlovi kerak — FEFO partiyalar zonadan; ataylab qoldirildi); Reys sahifasidagi prototip izohi «Yuklash … Haydovchi panelida» — holat banneri bor.
