# T11a — yakuniy tekshiruv (1-qism): ma'lumot va mantiq

Boshlashdan oldin: medix-data.js (sintaksis to'g'ri, eksport bloki to'liq) va Medix ERP.dc.html (hujjat oxirigacha yopilgan) butun.

## O'zgargan fayllar
medix-data.js, Medix ERP.dc.html, Home.dc.html, Reports.dc.html, Prices.dc.html, OrderCard.dc.html, PickerPanel.dc.html, MarkerPanel.dc.html, SupervisorPanel.dc.html, DriverPanel.dc.html, ImportWizard.dc.html, CashClose.dc.html.

## 1. Operatorlar — QQS bilan
- Avval: opSales QQSsiz edi (rptFacts.net). Bosh sahifa bloki davrni hafta/oy boshidan olardi, kesish sanasigacha bo'lgan sotuvlar ham kirardi.
- Qilindi: rptFacts qatorlariga `sum` (QQS bilan) qo'shildi, opSales shundan hisoblaydi. Bosh sahifa bloki davri Savdo kartasi kabi kesish sanasidan keyin boshlanadi. Matnlar: «Savdo (QQS bilan)», izoh «qaytarishlar (QM o'z sanasida) ayirilgan».
- Operatorlar jami, oy (ALL): 94 942 437,52 (QQSsiz) → 106 335 530.
- Solishtirish, oy: Operatorlar 106 335 530, Savdo kartasi 108 490 760, farq 2 155 230:
  - 1 694 590 — BY-TSH-000350 (SV-TSH-000213) yetkazilmagan. Operatorlar ayiradi, Savdo kartasi ayirmaydi: bhSalesPT `sale.ret` maydonini ayiradi, lekin bu maydon hech qayerda yozilmaydi.
  - 460 640 — QM-TSH-000007, 9, 12 qaytarishlari (02–04.10). Savdo kartasi QM ni ayirmaydi.
- Bugun: 82 824 610 va 84 519 200, farq 1 694 590 (BY-TSH-000350).
- QQSsiz qolgan ko'rsatkichlar (o'zgartirilmadi): Filial rahbari bosh sahifasidagi «Savdo» va «Yalpi foyda» kartalari (grossProfit), Direktor bosh sahifasidagi kunlik savdo grafigi (bhDaily), Savdo hisoboti (standart QQSsiz, QQS bilan almashtirgich bor), Yalpi foyda hisoboti, bhTopProducts (bosh sahifada ishlatilmaydi).

## 2. Seed: partiyadan kirimdan ko'p sotish
Sabab: (a) seed qoldiqlari buyurtmalarga yetmasdi, harakatlar `Math.min` bilan jimgina kesilardi; (b) terish yozuvisiz 8 ta seed sotuv (SV-TSH-000204…209 va boshqalar) qoldiqdan umuman chiqmasdi; (c) BY-TSH-000311 da Seftazidim 40 dona qoldiqsiz «sotilgan».

Seed tuzatishlari (oldin → keyin):
- KR-TSH-000124: 2408A Paracetamol 600 → 1400, AN-2508 Analgin 300 → 500
- KR-TSH-000122: OM2507 Omeprazol 250 → 600
- KR-TSH-000118: KT-2507 Ketorolak 300 → 500
- Boshlang'ich partiyalar: 240915 Ceftriaxon 160 → 400, NO-250702 NovoRapid 50 → 80, IB-250124 Ibuprofen 650 → 1100
- BY-TSH-000311: Seftazidim 1g — 40 dona «qoldiq yetmadi» (TSH da Seftazidim qoldig'i yo'q)

Mantiq: batchesRaw terish yozuvisiz sotuvlarni ham qoldiqdan chiqaradi (kesish sanasidan keyingi sotuvlar). supGoods: ombor hali qabul qilmagan yetkazilmagan tovar (BY-TSH-000350) «Sotildi» dan ayirilib, «Qoldi» ga qo'shiladi (Yalpi foyda kabi). Nol qatorlar ro'yxatdan olib tashlandi.

Tekshiruv: 169 partiya — kesilgan harakat 0, manfiy qoldiq 0, har partiyada kirim + harakatlar = joriy qoldiq.

O'zgargan raqamlar (oldin → keyin):
- Kirim summalari: KR-TSH-000124 10 886 400 → 16 867 200; KR-TSH-000122 20 339 200 → 30 139 200; KR-TSH-000118 13 994 400 → 16 861 600
- Sotuv SV-TSH-000209: 7 210 980 → 6 175 020
- Savdo kartasi: bugun 85 555 160 → 84 519 200; oy 109 526 720 → 108 490 760 (TSH 104 342 060 → 103 306 100)
- Savdo QQSsiz (Yalpi foyda): o'zgarmadi — 94 942 437,52 (oy)
- Tannarx, oy: 76 444 600 → 76 442 500; Yalpi foyda 18 497 837,52 → 18 499 937,52. Bugun: 14 432 944,65 → 14 434 144,65. Sabab: BY-TSH-000337 Ceftriaxon partiyasi almashdi (241102 → 240915)
- Ombor qiymati: ALL 1 659 996 200 → 1 670 706 820; TSH 680 597 700 → 691 308 320
- Mijozlar qarzi jami 465 077 280, muddati o'tgan 19 806 000 — o'zgarmadi. Hayat Medical Center qarzi 31 500 000 o'zgarmadi (seed qarz maqsadi saqlanadi): ochilish hujjatlari SV-TSH-000169 13 565 000 → 14 135 000, SV-TSH-000180 9 135 380 → 9 601 340
- YB qarzi jami 258 650 000 — o'zgarmadi (ochilish qoldig'i maqsadi saqlanadi). Muddati o'tgan YB qarzi 13 592 000 → 10 626 000. Ochilish hujjatlari: KR-TSH-000101 (KRKA) 22 949 000 → 20 499 000; KR-TSH-000102 (Nobel) 15 643 000 → 15 127 000; KR-TSH-000103 (KRKA, bugun) 13 116 000 → 9 074 000; KR-TSH-000104 (Nobel) 14 138 000 → 12 845 000; KR-TSH-000109 (Nobel) 11 567 960 → 10 509 760; Jurabek: KR-107 3 364 000 + KR-111 2 752 400 → KR-108 135 600. Raqamlar siljidi: KR-107 endi KRKA 7 424 120, KR-111 — Pharm Luxe 1 916 000 (avval KR-112)
- Ta'minotchi xodim (Olib keldi / Sotildi / Qoldi / Boshqa):
  - Laziza Rahmonova: 30 655 000 / 5 868 000 / 24 651 000 / 136 000 → 41 965 000 / 14 246 000 / 27 455 000 / 264 000
  - Jahongir Usmonov: 9 720 000 / 1 890 000 / 7 830 000 / 0 → 15 060 000 / 6 954 000 / 8 082 000 / 24 000
  - Malika Yusupova: o'zgarmadi (13 180 000 / 0 / 13 180 000 / 0)
- Ta'minotchi korxona: KRKA 27 460 000 / 4 248 000 / 23 076 000 / 136 000 → 36 210 000 / 11 858 000 / 24 216 000 / 136 000; Nobel 12 495 000 / 1 620 000 / 10 875 000 / 0 → 15 055 000 / 2 388 000 / 12 539 000 / 128 000; Jurabek 11 280 000 / 1 890 000 / 9 390 000 / 0 → 16 620 000 / 6 954 000 / 9 642 000 / 24 000
- «Sotildi» = Yalpi foyda tannarxi: KRKA 11 858 000, Nobel 2 388 000, Jurabek 6 954 000, Pharm Luxe 1 596 000 — teng (avval KRKA −5 860 000, Nobel −768 000, Jurabek −5 064 000 farq bor edi)
- Terish: qoldiq yetmagani uchun yuzaga kelgan kamomadlar yo'qoldi — BY-TSH-000317 Paracetamol 100/200 → 200/200, BY-TSH-000316 Ibuprofen 80 → 100, BY-TSH-000315 Ketorolak 40 → 100, Analgin 100 → 150. Ataylab qo'yilgan kamomad (317 Demidrol 80) qoldi. 312, 344, 348, 351, 355 da partiya almashdi, sotuv summalari o'zgarmadi.

## 3. 06.10 to'lov kuni
- Avval: seed generatori har mijozning birinchi ochilish bo'lagini T0+2 ga qo'yardi. 06.10 da TSH bo'yicha 11 hujjat, 154 811 000 (barcha filiallar — 17 hujjat).
- Qilindi: mijozlarning ochilish hujjatlarida faqat muddat (`due`) 06.10–01.11 oralig'iga (2–28 kun) taqsimlandi. Hujjat sanasi, raqami va summasi o'zgarmadi.
- 06.10 endi: 1 hujjat, 16 103 000 (SV-TSH-000172). TSH: 07.10 — 10 395 000, 08.10 — 8 791 000, 10.10 — 11 735 000, 13.10 — 10 672 000, 17.10 — 23 187 000, 18.10 — 30 262 220, 22.10 — 10 060 000, 25.10 — 18 631 000, 27.10 — 32 957 000, 01.11 — 5 280 000.
- Qarz jami 465 077 280, muddati o'tgan 19 806 000 — o'zgarmadi.
- Qoldi: 24.10 da ikkinchi bo'laklar (10 hujjat, 91 430 030) hali bir kunda — topshiriqda yo'q edi, o'zgartirilmadi.

## 4. Kassir paneli (Kassir, TSH, Nigora Xasanova — K-TSH)
Hamma tekshiruvlar mos keldi, tuzatish kerak bo'lmadi.

Bugun (04.10):
- Qoldiq 244 814 000: naqd 9 464 000, terminal 1 000 000, bank 234 350 000
- Kirim 25 424 000: MT 23 924 000 (5 hujjat), IO 1 500 000
- Chiqim 1 735 000: xarajat 235 000, IO 1 500 000
- Xarajat 235 000: Transport va yoqilg'i 150 000, Xo'jalik 85 000
- Kutilayotgan 30 814 160: haydovchi Dilshod Rahimov (RS-TSH-000048 / BY-TSH-000351) 1 266 160 = drvCash; bugun to'lov kuni 0; 3 kun ichida 2 hujjat 26 498 000 (3-band natijasi); MT qoralama 2 ta 3 050 000

| Hisob | Davr boshi | Kirim | Chiqim | Joriy |
|---|---|---|---|---|
| K-TSH | 3 420 000 | 3 424 000 | 150 000 | 6 694 000 |
| K-TSH-2 | 1 755 000 | 1 100 000 | 85 000 | 2 770 000 |
| B-TSH-1 | 161 250 000 | 18 400 000 | 0 | 179 650 000 |
| B-TSH-2 | 53 200 000 | 1 500 000 | 0 | 54 700 000 |
| T-TSH | 1 500 000 | 1 000 000 | 1 500 000 | 1 000 000 |
| Jami | 221 125 000 | 25 424 000 | 1 735 000 | 244 814 000 |

Shu oy (01–04.10):
- Qoldiq 244 814 000
- Kirim 37 604 000: MT 31 424 000 (8), boshqa 180 000 (Qaytarilgan mablag' 60 000, Bank foizi 120 000), IO 6 000 000
- Chiqim 16 795 000: YT 10 000 000, xarajat 795 000, IO 6 000 000
- Xarajat 795 000: Transport 390 000, Xo'jalik 360 000, Bank komissiyasi 45 000
- Kutilayotgan — bugungi bilan bir xil

| Hisob | Davr boshi | Kirim | Chiqim | Joriy |
|---|---|---|---|---|
| K-TSH | 6 780 000 | 3 484 000 | 3 570 000 | 6 694 000 |
| K-TSH-2 | 350 000 | 2 600 000 | 180 000 | 2 770 000 |
| B-TSH-1 | 152 175 000 | 27 520 000 | 45 000 | 179 650 000 |
| B-TSH-2 | 64 700 000 | 1 500 000 | 11 500 000 | 54 700 000 |
| T-TSH | 0 | 2 500 000 | 1 500 000 | 1 000 000 |
| Jami | 224 005 000 | 37 604 000 | 16 795 000 | 244 814 000 |

- Qoldiq kartasi = jadval jami = Kassa/Bank (bir funksiya — accBalance). Har hisobda davr boshi + kirim − chiqim = joriy.
- Kirim, chiqim va xarajat To'lovlar (MT/YT tasdiqlangan) va Kassa/Bank (KO/BO/IO) yig'indilariga teng. Moddalar yig'indisi xarajat kartasiga teng.
- Filtrlar (oy): K-TSH — kirim 3 484 000 / chiqim 3 570 000; T-TSH — 2 500 000 / 1 500 000; naqd + online + bank = 6 084 000 + 2 500 000 + 29 020 000 = 37 604 000; chiqim 3 750 000 + 1 500 000 + 11 545 000 = 16 795 000.
- Online MT (MT-9, MT-13) T-TSH ga tushadi. IO-TSH-000004 «Terminal → bank» 1 500 000: T-TSH da chiqim, B-TSH-2 da kirim.
- Huquqlar: kassir faqat K-TSH da KO/MT/kunni yopish (tillAccts). IO faqat «kassa → bank». BO va solishtirish uchun ruxsat yo'q (bank.view).

## 5. Mayda tuzatishlar
- «Qoldiq yetmaydi: N» — seed'da shunday holatdagi buyurtmalar bor (navbatda): BY-TSH-000319 Paracetamol 60, 338 Ketorolak 40, 334 Analgin 50, 320 Analgin 60, 318 Lorotadin 30. Ekranni verifier tekshiradi.
- Narx hujjati: «Manba: Kirim bo'yicha · KR-…» — kirim raqami havola (#receipt?open=). Chop etishda oddiy matn qoldi.
- Ta'minotchi hisobotlari, hujjatlar ro'yxati: Jami qatorida «Kirim N · Sotildi N» (soni va summa), xlsx da ham.
- Demo rejimi: Medix ERP da yangi «demoMode» sozlamasi (Tweaks, standart — yoqilgan). O'chirilganda quyidagilar yashirinadi:
  1. «Demo soat» va +5 / +15 tugmalari — Buyurtma kartochkasi, Yig'uvchi paneli, Markirovkachi paneli, Ombor mudiri paneli
  2. «Demo skaner» tugmalari — Markirovkachi paneli
  3. «Namuna rasm» — Haydovchi paneli
  4. «Namunaviy fayl · Demo uchun tayyor SMARTUP eksporti» — Import ustasi
  5. «Demo PIN: 1234» maslahati — Kunni yopish
  6. «Demo holatlar» suzuvchi menyusi
  «Skanni sinash» qoldirildi — u haqiqiy skanerni tekshiradi.
- «Hozir kimda» ustuni: Buyurtmalar ro'yxatida bunday ustun topilmadi (ustunlar: №, sana, mijoz, yetkazish, to'lov turi, yetkazish sanasi, qatorlar, summa, holat, operator). Tekshirilmadi, qo'shilmadi — qaror kerak.

## 6. Umumiy ma'lumot tekshiruvi
| Ko'rsatkich | Natija |
|---|---|
| Mijozlar qarzi: bosh sahifa = Mijozlar qarzi = kartochka = akt sverka | Mos: 465 077 280 (bhDebt = Σ debtOf = Σ ledger). Akt sverka yakuniy qoldig'i har mijoz/filialda ledger (qarz − avans) bilan teng. Filiallararo qarz (427 392) alohida guruh |
| YB qarzi: bosh sahifa = YB qarzi = kartochka | Mos: 258 650 000 |
| Qoldiq: Qoldiqlar = Mahsulot kartochkasi = Muddat nazorati | Qoldiq mos (uchalasi batches() dan). Farq bor edi: kartochka harakatlar tarixida qabuldagi kirimlar (KR-128, KR-129) yo'q edi, kesish sanasigacha bo'lgan SV-202/203 esa bor edi — 8 mahsulot. Tuzatildi, farq 0 |
| Buyurtma holatlari: bosh sahifa bloki = Buyurtmalar yorliqlari | Mos (ordStats). Bosh sahifada Rad etilgan va Bekor qilingan yo'q — shunday rejalangan |
| Kassa: Kassir paneli = Kassa = Bank | Mos (4-band) |

## Qolgan va tekshirilmagan ishlar
- Savdo kartasi (Direktor) qaytarishlarni ayirmaydi: `sale.ret` hech qayerda yozilmaydi, QM hisobga olinmaydi. Tuzatish tavsiya etiladi, ruxsatingiz bilan.
- 24.10 da 10 ta ochilish hujjati (91 430 030) bir kunga to'g'ri keladi.
- Payments.dc.html dagi «manual» demo 2-mijoz uchun SV-TSH-000167 ni ko'rsatadi, bu esa 5-mijoz hujjati (avvaldan bor muammo).
- Seed vaqt tartibi: KR-TSH-000124 (03.10 13:40) dan oldin SV-TSH-000207 (03.10 10:05) 2408A dan sotadi; HC-TSH-000003 (25.09) partiya kelmasidan oldin yozilgan.
- «Hozir kimda» ustuni topilmadi.
- Ekranda tekshirilmagan (verifier): demo rejimini almashtirish, narx hujjatidagi havola, Jami qatori, «Qoldiq yetmaydi».
- Mijozlar qarzi sahifasining yuqori jami (filiallararo qarz bilan yoki usiz) ekranda solishtirilmadi.

## Sinov izlari
Hisob-kitoblar alohida nusxada bajarildi: localStorage va foydalanuvchi holatiga yozilmadi. Oraliq nusxa (notes/_t11a_before_medix-data.js) o'chirildi. Seed'ga faqat yuqoridagi tuzatishlar kiritildi.
