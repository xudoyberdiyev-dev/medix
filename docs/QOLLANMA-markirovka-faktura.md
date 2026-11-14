# Qoʻllanma: markirovka, zaxira kodlar va fakturalar

Xodimlarni oʻqitish uchun qisqa qoʻllanma (egasi talablari O10, O11 — 14.11.2026). Tugma va maydon nomlari dasturdagidek yozilgan.

## 1. Markirovkachi — Saplayn tekshiruvi

1. Navbatdan buyurtmani oling, kodlarni skanerlang (yoki «Kodlarni fayldan yuklash» — tayyor .xlsx/CSV).
2. Hammasi skanerlangach «Saplayn tekshiruvi» bloki chiqadi:
   - **«Excelʼga chiqarish»** — buyurtma kodlari faylini yuklab oling (toʻliq kod, GTIN, seriya, partiya, yaroqlilik, Q/D, buyurtma, mijoz, STIR).
   - Faylni Saplaynʼda tekshiring: kodlar firmamiz nomida va takrorlanmagan boʻlishi kerak.
   - Notoʻgʻri kod boʻlsa — uni sabab **«Saplayn: boshqa firma nomida / yaroqsiz»** bilan olib tashlang va oʻrniga boshqa qutini skanerlang, keyin qaytadan «Excelʼga chiqarish».
   - Belgini qoʻying: «Kodlar firmamiz nomida va takrorlanmagan — Saplaynʼda tekshirdim» → **«Saplaynʼda tekshirildi — yakunlash»**.
3. Faylni chiqarmasdan yoki belgisiz yakunlab boʻlmaydi.

## 2. Kodlar egasi — Mijoz nomiga / Zaxira kodlarga

- Har buyurtmada «Kodlar» belgisi bor. Standart toʻlov turidan: **Perechisleniye → «Mijoz nomiga»**, **Naqd / Terminal / Online → «Zaxira kodlarga»**.
- Oʻzgartirish: buyurtma kartochkasida «Kodlar» → kerakli variant. Ruxsat: Ombor mudiri, Filial rahbari, Direktor; buyurtma «Yetkazildi» boʻlguncha.
- Yetkazilmagan tovar kodlari «Qaytarilgan» boʻladi.

## 3. Ombor → «Zaxira kodlar»

- «Zaxira kodlarga» egali buyurtma yetkazilganda uning kodlari shu sahifaga tushadi (holat **Zaxirada**).
- Filtrlar: holat (Zaxirada / Ishlatildi / Hisobdan chiqarildi), filial, sana (Dan / Gacha), qidiruv (mahsulot, GTIN, seriya, partiya, buyurtma). «Excelʼga yuklash» — joriy filtr boʻyicha.
- Har kod uchun: **«Ishlatildi deb belgilash»** yoki **«Hisobdan chiqarish»** — izoh yoziladi, audit jurnaliga tushadi.
- Koʻradi: Direktor, Filial rahbari, Ombor mudiri, Buxgalter (`zcodes.view`); oʻzgartiradi — `zcodes.edit`. Mijoz kartochkasida ham «Markirovka kodlari» bor.

## 4. Buxgalter — «Fakturalar» (Pul guruhi)

1. Buyurtma «Yuklanmoqda» ga oʻtganda, kodlar «Mijoz nomiga» yoki toʻlov Perechisleniye boʻlsa, navbatga **«Yuborilishi kerak»** holati bilan tushadi. Buyurtma zanjiri toʻxtamaydi.
2. Navbat Buxgalter bosh sahifasida va «Fakturalar» sahifasida. «Kutish» ustuni vaqtni koʻrsatadi; 1 kundan koʻp kutganlari — «1 kundan koʻp kutmoqda».
3. Har qatorda hujjatlar: **«HF PDF»**, **«HF — Excel»**, **«Kodlar .xlsx»** (1C uchun), **«TTN PDF»**. HF raqami sotuv oʻtkazilgandan keyin paydo boʻladi (oʻngacha «Sotuvdan keyin»).
4. E-fakturani Soliq tizimida yuborgach: **«Yuborildi deb belgilash»** → «E-faktura raqami», «E-faktura sanasi», «E-faktura fayli» va «Imzolangan TTN» (PDF, JPG yoki PNG, 10 MB gacha).
5. Yuklangan fayllar buyurtma kartochkasining «Hujjatlar» blokida koʻrinadi.

## 5. Hisob-faktura (HF) va TTN

- HF — rasmiy shakl, albom A4: sotuvchi va xaridor rekvizitlari (STIR, QQS reg. kodi, r/s, bank, MFO), shartnoma № va sanasi, MXIK, oʻlchov birligi va kodi, partiya, QQSsiz / QQS / QQS bilan, markirovka soni, jami soʻz bilan, imzolar.
- Toʻliq boʻlishi uchun toʻldiring: Kompaniya / filial rekvizitlari, mijoz kartochkasida rekvizitlar, Mahsulot kartochkasida MXIK (Mahsulotlar roʻyxatida «MXIK yoʻq» filtri), Maʼlumotnomalar → Birliklar → «Soliq kodi».
- Reys boʻyicha: «TTN chop etish (barcha buyurtmalar)» va ommaviy HF PDF.

## 6. Hisobotlar

- **«Buxgalter natijasi»** (Hisobotlar → Xodimlar): yuborilgan fakturalar soni, oʻrtacha vaqt «Yuklanmoqda → Yuborildi», kechikkanlar, hozirgi navbat; Excel.
- **«Markirovka kodlari»**: davr, mijoz, mahsulot, egasi (mijoz / zaxira), holat; Excel.
