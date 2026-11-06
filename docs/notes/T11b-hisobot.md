# T11b — yakuniy tekshiruv (2-qism)

Boshlashdan oldin: medix-data.js (sintaksis to'g'ri, eksport to'liq) va Medix ERP.dc.html (bitta x-dc, hujjat yopilgan) butun.

## A qismi — T11a dan qolgan qarorlar

O'zgargan fayllar: medix-data.js, Reports.dc.html, Orders.dc.html, Medix ERP.dc.html.

### A1. Savdo kartasi — sof savdo
- Avval: bhSalesPT `sale.sum − sale.ret` hisoblardi. `sale.ret` hech qayerda yozilmasdi, natijada QM va yetkazilmagan buyurtmalar ayirilmasdi.
- Qilindi: bhSalesPT endi rptFacts.sum dan (QQS bilan) hisoblanadi: sotuv − yetkazilmagan (o.ret, SV sanasida) − QM (o'z sanasida). Bu Operatorlar bilan bir manba. O'lik `sale.ret` o'qilmaydi. Buyurtmasiz (demo menyusi) sotuvlar summasi bo'yicha qo'shiladi. Savdo hisobotining «QQS bilan» jami ham rptFacts.sum dan olinadi (net + QQS yaxlitlashidagi tiyin farqi yo'qoldi).
- Filiallar jadvali, Savdo / to'lov turlari jadvali — bhSalesPT dan, avtomatik mos.

| Ko'rsatkich | Oldin | Keyin |
|---|---|---|
| Savdo kartasi, bugun (ALL / TSH) | 84 519 200 | 82 824 610 |
| — Online, bugun | 14 242 970 | 12 548 380 |
| Savdo kartasi, oy (ALL) | 108 490 760 | 106 335 530 |
| — Perechisleniye, oy | 82 321 770 | 81 861 130 |
| — Online, oy | 23 778 830 | 22 084 240 |
| — Naqd, oy | 2 390 160 | 2 390 160 |
| Savdo kartasi, oy (TSH) | 103 306 100 | 101 150 870 |
| SMQ / FRG, oy | 2 925 530 / 2 259 130 | o'zgarmadi |

- Farq: −1 694 590 — BY-TSH-000350 (SV-TSH-000213, online) yetkazilmagan; −460 640 — QM-TSH-000007, 9, 12.
- Tekshiruv: Savdo kartasi = Operatorlar jami = Savdo hisoboti (QQS bilan) — bugun va oy, ALL, TSH, SMQ, FRG: hammasi teng.

### A2. Mijozlar qarzi: 466 201 280 → 465 077 280 (−1 124 000)
- Sabab: MT-TSH-000016 — haydovchidan naqd 1 124 000 (Dilshod Rahimov, RS-TSH-000047 / BY-TSH-000349). U Y4 da qo'shilgan, mijoz 9, SV-TSH-000212 ga taqsimlangan. MT-16 siz mijoz 9 qarzi 64 200 000, MT-16 bilan 63 076 000.
- Seed qarz maqsadi (AR_OPEN0) ochilish hujjatlari orqali to'lovlar yaratilishidan oldin moslanadi. MT-16 undan keyin yaratiladi, shuning uchun jami 1 124 000 ga kamaygan.
- BY-TSH-000311 (Seftazidim) sabab emas: SV-TSH-000209 dagi −1 035 960 o'sha mijozning ochilish hujjatlariga qo'shildi (Hayat Medical Center 31 500 000 o'zgarmadi).
- T11a dagi «o'zgarmadi» degani to'g'ri: T11a tuzatishlaridan oldin ham, keyin ham jami 465 077 280. 466 201 280 Y4 dan oldingi raqam.

### A3. «Hozir kimda» ustuni (Buyurtmalar ro'yxati, «Holat» dan keyin)
- Yangi holderOf(o) — band bo'lsa xodim (qisqa: «Ism F.»), bo'lmasa rol nomi (kulrang), yakuniy holatlarda «—».
  - Qoralama — operator
  - Tasdiqlashda — tasdiqlovchi (filial rahbari yoki direktor, yuborish darajasi bo'yicha)
  - Navbatda — «Ombor mudiri» (rol)
  - Hisobdan o'tkazilmoqda / Hujjatlashtirilmoqda — tekshiruvchi yoki filial ombor mudiri
  - Yig'ilmoqda — yig'uvchi; Markirovkada — markirovkachi (boshlanmagan bo'lsa — rol)
  - Yuklanmoqda / Yo'lda — reys haydovchisi (reys yo'q bo'lsa — rol)
  - Yetkazildi, Yetkazilmadi, Rad etilgan, Bekor qilingan — «—»
- Seed natijasi: Tasdiqlashda 5 (Bekzod Tursunov / Akmal Karimov), Qoralama 3 (operatorlar), Navbatda 7 (rol), Yig'ilmoqda — Sherzod Tojiyev, Hisobdan o'tkazilmoqda / Hujjatlashtirilmoqda 5 — Sardor Aliyev, Markirovkada 3 (rol — boshlanmagan), Yuklanmoqda 2 — Dilshod Rahimov, Yo'lda 7 (5 ta haydovchi nomi bilan, SMQ/FRG dagi 2 tasi reyssiz — rol), yakuniy holatlarda 19 ta «—».
- Sarlavha 3 tilda: Hozir kimda / Ҳозир кимда / У кого сейчас.

### A4. 24.10 dagi ochilish hujjatlari
- Avval: 24.10 da 10 hujjat, 91 430 030 (30 kunlik muddatdagi ikkinchi bo'laklar).
- Qilindi: faqat shu 10 ta bo'lakning muddati 15.10–06.11 ga taqsimlandi. Sana, raqam va summa o'zgarmadi.
- Keyin: 24.10 — 0. 15.10 SV-TSH-000177 15 244 100; 16.10 SV-SMQ-000082 4 860 350; 18.10 SV-SMQ-000083 3 768 120; 19.10 SV-FRG-000052 5 328 870; 21.10 SV-TSH-000179 7 191 990; 23.10 SV-TSH-000180 9 601 340; 27.10 SV-TSH-000178 8 230 160, SV-TSH-000181 9 729 000; 04.11 SV-TSH-000182 8 505 000; 06.11 SV-TSH-000176 18 971 100.
- Qarz jami 465 077 280, muddati o'tgan 19 806 000 — o'zgarmadi.
- Qoldi: 18.10 da 15 kunlik muddatdagi bo'laklar (7 hujjat, 42 582 740) — avvaldan bor, o'zgartirilmadi.

## A qo'shimcha — 18.10 dagi hujjatlar
- 18.10 (T0+14) to'plamidagi 5 bo'lak 15.10–31.10 ga taqsimlandi: SV-TSH-000183 → 31.10, SV-TSH-000184 → 15.10, SV-BXR-000032 → 26.10, SV-BXR-000033 → 22.10, SV-FRG-000053 → 20.10. 18.10 da faqat 2 ta hujjat qoldi (SV-TSH-000170, SV-SMQ-000083; boshqa qoidadan). Qarz jami 465 077 280, muddati o'tgan 19 806 000 — o'zgarmadi.

## B qismi — oraliq holat (to'xtatildi: foydalanish limiti)
Tekshiruv usuli: ilova oynasi kengligi 1280 / 1440 px ga cheklandi, DOM o'lchandi (chetdan chiqish, kesilish, ellipsis, tugma matni o'ralishi, gorizontal aylantirish, NaN).
Tuzatildi:
- Buyurtmalar: 1280 da «Holat» va «Hozir kimda» siljitishsiz. Yetkazish + yetkazish sanasi bitta ustunda; «To'lov turi» ≥1400 px, «Qatorlar» va «Operator» ≥1600 px (tor rejimda hammasi, aylantirish bilan).
- Direktor bosh sahifasi: Operatorlar va Ta'minotchi bloklaridagi jadvallar 1280 da aylanardi (496/568 > 479) — ustunlar siqildi, bloklar yonma-yon, aylantirishsiz.
- Kassir paneli: hisoblar va operatsiyalar jadvallari 1280 da siljitishsiz.
- Savdo hisoboti: ustunlar siqildi, 1280 da siljitishsiz (QQS bilan rejimida — 1440 dan).
Mos (1280 va 1440): Direktor bosh sahifasi, Buyurtmalar, Kassir paneli, Savdo va Operatorlar hisobotlari — chetdan chiqish 0, kesilish 0, NaN 0. Sof Savdo kartasi ekranda 106 335 530.
Qoldi (ko'p ustunli jadvallar ichida aylantirish, birinchi ustun qotirilgan): Kirim ro'yxati (1725 px), Qoldiqlar (2336), Narx o'rnatish (1258), Ta'minotchi hisobotlari (1604). Kirim sarlavhasida «Boshqa kirim» tugmasi alohida ko'rinmaydi («…» menyusida bo'lishi mumkin) — tekshirilmadi.
Tekshirilmagan: buyurtma kiritish va katalog (ochilishi tasdiqlanmadi), 1024 / 924 / 375 px, mayda ko'rinishlar, T11a yangi elementlari ekranda; C va D qismlari.
Sinov izlari: ilovadagi vaqtinchalik sinov ilgagi olib tashlandi; _t11b-probe.js — o'chirildi.

## B qismi — davomi (3-urinish)
- «Boshqa kirim»: Kirim sahifasida bunday tugma yo'q — sarlavhada faqat «Yangi kirim» va «…» (Eksport, Chop etish). «Boshqa kirim» — Kassa operatsiyasidagi kirim moddasi (MOP_ITEMS.in) va Kassir panelidagi «Boshqa kirimlar» qatori. Kirim sahifasida qo'shish kerak bo'lsa — alohida qaror.
- O'lchov alohida kenglikdagi haqiqiy oynada (iframe) qilindi.
- Mos (chetdan chiqish 0, kesilish 0, NaN 0): buyurtma kiritish va katalog — 1280, 1440; 1024 — Direktor bosh sahifasi, Buyurtmalar, Kirim, Qoldiqlar, Kassir paneli, Ombor mudiri va Operator bosh sahifalari, Savdo hisoboti; 924 — Savdo, Operatorlar, Ta'minotchi xodim hisobotlari (kartalardagi summalar sig'adi); 375 — Yig'uvchi, Markirovkachi, Haydovchi panellari.
- 1024 da ichki aylantirish (ko'p ustunli jadvallar, normal): Kassir paneli hisoblar (719/976) va operatsiyalar (719/936), Kirim, Qoldiqlar, Ombor monitori, Ta'minotchi hisobotlari; Direktor bosh sahifasidagi qarzlar jadvali 5 px (471/476).
- Tekshirilmadi: Markirovkachi qizil xato ekrani, terish varag'i sarlavhasi, mahsulot qidiruvidagi muddat matni va «Orqaga», Ko'chirish 0,7 s, T11a yangi elementlari ekranda, Narx o'rnatish 1024, 1-ustun yopishqoqligi.

## C qismi — matnlar (boshlandi)
- Tuzatildi: «Филтр» → «Фильтр» (o'zbek kirilli, 4 kalit: filter, noMatchSub, clearFilters, ys_more). Rus tilida xato topilmadi (ў/қ/ғ/ҳ yo'q). Kirill ustunida lotin qolgan 5 kalit — faqat o'rinbosar ({who} · {br} kabi), to'g'ri.
- Topildi: ilova I18N da 6 255 kalit, shundan 5 385 tasi faqat lotinda (≈119 000 belgi; eng ko'p: bs 440, kt 365, rl 358, bq 336, nr 259, tl 259, p 253, qz 244, bh 239, nq 236). Bundan tashqari ichki komponentlarning o'z matn jadvallari (masalan Kassir paneli) — faqat lotinda.
- Qoldi: 5 385 kalit tarjimasi — hajmi katta, prefikslar bo'yicha bir necha bosqichda bajarish kerak.

## D qismi — boshlanmadi.
Sinov izlari: sinov ilgagi olib tashlandi, _h.html va _p.js o'chirildi.
