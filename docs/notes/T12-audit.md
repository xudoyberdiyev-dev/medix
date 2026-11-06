# T12 — UI audit (faqat o'qish)

Sana: 31.10.2026. Hech qanday ilova fayli yoki ma'lumot o'zgartirilmadi. Faqat shu hujjat va notes/T12-topshirish.md yozildi.

## 0. Usul va cheklovlar

- **Statik tahlil (kod bo'yicha).** Butun loyiha bo'yicha bitta naqsh qidirildi, chuqur skan esa 102 ta DC dan 76 tasida o'tdi (vaqt chegarasi; quyida). Tekshirilgani: ranglar, shriftlar, masofalar, radius, soya, ikonkalar, aria-label, panel tugmalari balandligi, pul formatlovchilari, ruxsat matritsasi (`store.rl.perms`), menyu ko'rinishi (`navCan`), Ctrl+K (`cmdData`), bildirishnomalar (`allNotifs`), xlsx (`xlsxBlob`), demo funksiyalar (`demoUi`), brauzer xotirasi.
- **Ishlab turgan ilovada (T11b dagi o'lchovlar).** 1280 / 1440 / 1024 / 924 / 375 px kengliklar haqiqiy oynada o'lchangan (chetdan chiqish, kesilish, gorizontal siljish, NaN).
- **Bu bosqichda bajarilmadi:** jarayonlarni ekranda boshidan oxirigacha bosib o'tish. Sabab: sinov oynasi uzoq ketma-ketlikda qotib qoldi (T11b ga qarang), ichki oyna ekran rasmiga tushmaydi. 4-banddagi jarayon baholari kod va holatlar mashinasi bo'yicha berildi, bosishlar soni taxminiy («~»).
- **Chuqur skan qilinmagan fayllar:** ro'yxat bo'yicha Payables dan keyingi 26 ta DC (Payables, PaymentDoc, Payments, PickConfirm, PickerPanel, PickerReport, PinSetup, PriceHistoryPanel, Prices, PrintPreview, ProductPicker, Products, Profile, Receipts, Receivables, Reconciliation, RecordHeader, Reports, SavedViews, ScanPanel, Select, Settings, SetupWizard, Shipping, SideSummary, StatusBanner va boshqalar). Ranglar soni shu sababli to'liq emas. Panel tugmalari alohida tekshirildi.
- **Dizayn tizimi.** «Medix design system» loyihaga biriktirilmagan, token fayli ham yo'q. Moslik amaldagi palitra (prototipda eng ko'p ishlatilgan qiymatlar) bo'yicha baholandi.

## 1. Umumiy topilmalar (statik)

### a) Dizayn tizimi
- **Ranglar.** 68 ta noyob hex (76 faylda). Asosiy palitra izchil: matn #172B2A / #5B6B6A / #8A9B9A, chegara #E2E8F0, fon #F5F7F8 / #F8FAFA, asosiy #0F766E / #0D9488, xato #B91C1C, ogohlantirish #B45309, muvaffaqiyat #15803D, ma'lumot #1D4ED8. Kam ishlatiladigan, palitradan tashqari ~25 qiymat bor (#7C3AED, #6D28D9, #E3893A, #F2C46D, #DC5A4E, #EF4444, #22C55E, #F59E0B, #8FB5B1, #99D5C9 …). Token yo'q — har fayl literal ishlatadi.
- **Shriftlar.** Inter va JetBrains Mono, boshqa shrift yo'q. Mono hujjat raqami, kod, partiya va Ctrl+K natijalarida.
- **Masofalar.** 2 618 ta padding/margin/gap qiymatidan 921 tasi 4 ga karrali emas (6 px ×464, 10 px ×288, 14 px ×130, 3/5/7/9 px).
- **Shrift o'lchamlari.** 17 xil, shu jumladan kasr qiymatlar (12.5 ×86, 11.5 ×28, 13.5 ×9).
- **Radius.** Asosan 8 / 10 / 6. Undan tashqari 4, 5, 7, 2, 3, 12, 16, 999 ham bor.
- **Soya.** 55 ta noyob qiymat. Asosiy to'rttasi izchil: karta, popover, fokus halqasi, modal.
- **Ikonkalar.** Faqat Lucide (`<lucide-i>`, lucide@0.460.0); ichki `<svg>` va emoji topilmadi.
- **Holat belgilari.** `ORDER_STATUS` va hujjat ST xaritalarida doim ikonka + so'z + rang.
- **Bitta asosiy tugma.** PageHeader `primary` — bitta. Hujjat ichidagi qo'shimcha asosiy tugmalar ekranda tekshirilmadi.

### b) Izchillik
- **Pul formati.** Deyarli hamma joyda `1.250.000,00`. Ikki xil uslub bor: qo'lda yozilgan `fN/fM` (~30 faylda takrorlangan) va `toLocaleString('de-DE')` (Home, CashierPanel, Reports, PrintPreview). Haydovchi paneli `1.250.000 so'm` ko'rsatadi (tiyinsiz). ExpiryControl, AuditLog va ProductPicker dagi `fM` manfiy belgini ko'rsatmaydi.
- **Sana formati.** Hamma joyda `KK.OO.YYYY`.
- **Jadvallar.** DataTable + FilterBar + SavedViews + ColumnsMenu + Pagination umumiy. Lekin ayrim sahifalar o'z gridini chizadi (Home bloklari, CashierPanel jadvallari, Reports). Ularda Ustunlar menyusi va sahifalash yo'q.
- **Eksport.**
  - Kirim sahifasining «…» menyusidagi Eksport faqat toast chiqaradi (`p_exportToast`), fayl berilmaydi.
  - Hisobotlarda `exportCsv` nomli funksiya ishlatiladi.
  - `xlsxBlob` (to'g'ri SpreadsheetML/ZIP) bor, lekin uning sahifalardagi qo'llanilishi to'liq tekshirilmadi.

### c) Kirish imkoniyati
- **Kontrast (oq fonda).**
  - #8A9B9A — 2.90:1, 228 joyda: izoh matni, placeholder, guruh sarlavhalari.
  - #94A3A1 — 2.62:1.
  - #0D9488 — 3.74:1: havolalar va ayrim matnlar.
  - #7FA39E — 2.75; #A9C7C3 — 1.80.
  - Hammasi 4.5:1 talabidan past.
  - Mos: #5B6B6A 5.59, #0F766E 5.47, #B45309 5.02, #15803D 5.02, #B91C1C 6.47, #1D4ED8 6.70.
- **Fokus.** `:focus{outline:none}` + `:focus-visible` 2 px halqa — klaviatura uchun ko'rinadi.
- **aria-label.** 76 faylda 383 ta `<button>`, 90 ta aria-label. Faqat ikonkali tugmalarning qanchasida yorliq yo'qligini statik aniqlab bo'lmadi.
- **Panel tugmalari.** Yig'uvchi, Markirovkachi, TabletShell va PickConfirm: hammasi ≥48 px. Haydovchi panelida 3 ta past tugma: imzoni tozalash va qaytarish sababi chiplari (28 / 40 / 44 px).

### d) Matnlar
- Ilova I18N: 6 255 kalit, shundan **5 385 tasi faqat lotinda** (kirill va rus — V2 qarori; Jiddiy emas).
- Ichki komponentlarning o'z matn jadvallari (masalan CashierPanel `T`) — faqat lotinda.
- Dinamik bildirishnomalar matni 3 tilda bir xil (`[n.text, n.text, n.text]`).
- `apprReasonsOf` sabablari qattiq yozilgan o'zbekcha matn.
- Kirill imlosi: T11b da «Филтр» → «Фильтр» tuzatilgan. Boshqa avtomatik o'girish izlari topilmadi.

### e) Kengliklar (T11b o'lchovlari)
- **1280 / 1440 px, mos:** Direktor bosh sahifasi, Buyurtmalar («Holat» va «Hozir kimda» siljitishsiz), buyurtma kiritish va katalog, Kassir paneli, Savdo va Operatorlar hisobotlari.
- **1024 px, mos:** Direktor bosh sahifasi, Buyurtmalar, Kirim, Qoldiqlar, Kassir paneli, Ombor mudiri va Operator bosh sahifalari, Savdo hisoboti. Ichki aylantirish bor (normal): Kassir paneli jadvallari, Kirim, Qoldiqlar, Ombor monitori. Direktor bosh sahifasidagi qarzlar jadvali 5 px aylanadi.
- **924 px, mos:** hisobot kartalaridagi summalar.
- **375 px, mos:** Yig'uvchi, Markirovkachi va Haydovchi panellari (asosiy ekran).
- **Tekshirilmadi:** Markirovkachi qizil xato ekrani, terish varag'i sarlavhasi, qidiruvdagi muddat matni va «Orqaga», Ko'chirish 0,7 s, NO dagi kirim havolasi, hisobot jami qatorlari, «Demo rejimi», «Qoldiq yetmaydi», Narx o'rnatish 1024 px da, birinchi ustunlarning yopishqoqligi.

### f) Tezlik
- O'lchanmadi. Kuzatuv: `batches()` memo bilan, ammo `cmdData` har tugma bosilishida barcha kolleksiyalarni filtrlaydi. Bosh sahifa bloklari bitta render ichida ko'p hisob qiladi (`bhAttention`, `opSales`, `supGoods`). Seed hajmida sezilmaydi, real hajmda tekshirish kerak.

## 2. Rol bo'yicha (11 rol)

Menyu `navCan` bo'yicha (to'liq jadval — topshirish hujjati, 11-bo'lim).

- **director:** barcha sahifalar. «Markirovka» jurnali (`marking`) yo'q — faqat «Markirovkachilar natijasi».
- **admin:**
  - biznes sahifalarini to'liq ko'radi: Tasdiqlash, Kassa, Bank, To'lovlar, Akt sverka, barcha hisobotlar;
  - bosh sahifasi Direktornikiga teng;
  - IT administrator uchun ortiqcha, ruxsat ajratilmagan.
- **branch:** Boshqaruvdan Xodimlar va Audit bor; Kompaniya, Filiallar, Omborlar, Rollar va Sozlamalar yo'q. Mos.
- **operator:**
  - Buyurtmalar, Jo'natish, Qoldiqlar, Qaytarish, Mahsulotlar, Mijozlar, Yetkazib beruvchilar, Narxlar, Boshqa ma'lumotnomalar;
  - Hisobotlar yo'q — o'z savdosini ko'ra olmaydi;
  - Narxlar ochiq — tannarx yoki partiya narxi ko'rinishi tekshirilmadi.
- **purchase:** Kirim, Qoldiqlar, Muddat, Ko'chirish, YB ga qaytarish. «Yetkazib beruvchilar qarzi» va Hisobotlar yo'q — xarid xodimi YB qarzini ko'ra olmaydi.
- **keeper:** ombor sahifalari, Buyurtmalar, Jo'natish, Hisobotlar. Mos.
- **cashier:**
  - To'lovlar, Kassa, Bank, Mijozlar qarzi, Mijozlar, YB, Narxlar, Boshqa ma'lumotnomalar;
  - Narxlar sahifasi kassir uchun ortiqcha;
  - «Boshqa kassada amal qilmaydi» — T11a da tekshirilgan.
- **accountant:** moliya va ombor ko'rish sahifalari. Mos. Buyurtmalar yo'q — sotuvni faqat hisobotdan ko'radi.
- **marker:**
  - Bosh sahifa, Buyurtmalar, Filiallararo savdo, Markirovka;
  - Buyurtmalar ro'yxati va «Filiallararo savdo» panel roli uchun ortiqcha;
  - mijoz va summa ko'rinishi tekshirilmadi.
- **picker:** Bosh sahifa, Buyurtmalar, Filiallararo savdo — xuddi Markirovkachidek ortiqcha.
- **driver:** faqat Bosh sahifa (panel). Mos.
- **Ruxsatsiz sahifa.**
  - `allowed()` → `navCan`;
  - rol almashganda ruxsatsiz sahifadan bosh sahifaga qaytaradi (toast `tClosed`);
  - URL hash orqali to'g'ridan-to'g'ri ochishda ham shu tekshiruv ishlashi kodda bor, ekranda 11 × barcha sahifa sinovi o'tkazilmadi.

## 3. Jarayonlar (kod bo'yicha baho)

- **Buyurtma.**
  - Holatlar: draft → pending (tasdiq kerak bo'lsa) → queued → picking → marking (markirovkali tovar bo'lsa) → checking → docs → loading → shipped → delivered / undelivered (qisman — `short`, `ret`). Yakuniy: rejected, cancelled. Holatlar ro'yxatida `ready` ham bor, seed da ishlatilmaydi.
  - Tasdiq sabablari: limit, muddati o'tgan qarz, maksimal miqdor, bloklangan mijoz.
  - Xavf: `return` amali buyurtmani har qanday holatdan qoralamaga qaytaradi (`released` belgisi bilan) — UI da faqat ruxsatli holatlarda chiqishini ekranda tekshirish kerak.
  - Bosishlar: kiritish ~6–10, tasdiq 2, yig'ish — qatorlar soni × 1–2.
- **Haydovchidan pul:** `cashAccept` / `drvCash` → MT (Online — Terminal). T11a da raqamlar tekshirilgan.
- **Kirim:** draft → accepted (fakt qabul qilindi) → posted (o'tkazildi) → cancelled. Bonus — BNS, oldindan to'lov — avtomatik AS (`rcPrepay`). «Kirim bo'yicha narx» — NO `rc` maydoni orqali.
- **To'lovlar:** MT / YT: draft → pending → posted / cancelled. KO / BO / IO: posted (seed da faqat posted). 2 000 000 dan katta chiqim KO tasdiq talab qiladi. Kunni yopish — `closeDay`, farq bo'lsa tuzatuvchi KO.
- **Narx o'rnatish (NO):** pending → posted (rad / bekor). Ikki rejim: umumiy narx va partiya narxi (`ptypes.batch`).
- **Qotib qolish xavfi:** reys `retwait` holati (qaytgan tovar qabul qilinmaguncha reys yopilmaydi); ko'chirish `transit` (qabul qilinmasa qoldiq yo'lda qoladi); inventarizatsiya qulfi (`ivLock`) — ombor harakatlarini to'xtatadi.

## 4. Qo'shimcha tekshiruvlar (T11b qoldig'i)

- **Ctrl+K topadi:**
  - BY, KR (+ YB faktura raqami), SV (+ HF), QM / HC / QY, MT / YT, KO / BO / IO, AV (avans), AS, IN, NO, BQ, OK / ZK / FS (ko'chirish + HF);
  - markirovka kodi (16+ belgi), mahsulot (IKPU, Farm ID, shtrix-kod, shartnoma nomi), kontragent (nom, kirill → lotin, STIR), qarz kartochkasi, hisobotlar.
- **Ctrl+K topmaydi:** RS (reys), BNS, xodimlar.
- **Bildirishnomalar:**
  - manbalar: `store.notifs` (shaxsiy), `bhAttention` (rol va filial bo'yicha), `supReminders`;
  - bosilganda `href`, `orderId` yoki muddat sahifasiga o'tadi;
  - har rolda ekranda tekshirilmadi;
  - shaxsiy bildirishnomalar matni tarjima qilinmaydi.
- **Filtrli havolalar:** `#page?param` (masalan `#orders?open=BY-…`, `#reports?r=sv`). Barcha sahifalarda ekranda tekshirilmadi.
- **.xlsx:** `xlsxBlob` to'g'ri tuzilgan (sarlavha uslubi s=1, son katak — `<v>`, matn — inline string, boshqaruv belgilari tozalanadi). Fayllar ochib tekshirilmadi.
- **«To'lov turi» 1400 px dan tor ekranda yashirinadi.** Operator kunlik ishda to'lov turini ro'yxatdan ko'radi (naqd yoki online buyurtmalarni ajratish). Taklif: 1280 da «Yetkazish» o'rniga «To'lov turi»ni qoldirish yoki uni «Summa» ostiga ikkinchi qator qilib berish. Daraja: O'rta.

## 5. Audit jadvali

| № | Sahifa / rol / jarayon | Muammo | Daraja | Taklif |
|---|---|---|---|---|
| 1 | Rollar — admin | Admin barcha moliya sahifalari, Tasdiqlash, Kassa va Bankni ko'radi, Direktor bosh sahifasini oladi | Jiddiy | Admin — tizim boshqaruvi; biznes ruxsatlari alohida |
| 2 | Butun tizim | Ma'lumot faqat xotirada (`store`); qayta yuklashda hujjatlar yo'qoladi (faqat Mahsulotlar, til, ustunlar, hisobot shablonlari saqlanadi) | Jiddiy (prototip cheklovi) | Haqiqiy dasturda server va ma'lumotlar bazasi |
| 3 | Kontrast | #8A9B9A (2.9:1), #94A3A1 (2.6:1), #0D9488 havolalar (3.7:1) matnda | Jiddiy (kirish) | Izoh matni ≥ #5B6B6A, havola #0F766E |
| 4 | Kirim — «…» Eksport | Eksport fayl bermaydi, faqat toast | O'rta | xlsx eksport (`xlsxBlob`) |
| 5 | Ctrl+K | RS (reys), BNS, xodimlar qidirilmaydi | O'rta | Qidiruv indeksiga qo'shish |
| 6 | Rollar — marker, picker | Buyurtmalar ro'yxati va «Filiallararo savdo» menyuda | O'rta | Panel rollari uchun faqat panel |
| 7 | Rollar — purchase | YB qarzi va Hisobotlar yo'q | O'rta | `sdebt.view` va YB hisobotlari |
| 8 | Rollar — operator | Hisobotlar yo'q (o'z savdosi) | O'rta | «Operatorlar savdosi» — o'z qatori bilan |
| 9 | Rollar — cashier | Narxlar sahifasi ochiq | Kichik | Olib tashlash yoki faqat ko'rish |
| 10 | Rollar — director | «Markirovka» jurnali menyuda yo'q | Kichik | `marking` ni ko'rish ruxsati bilan ochish |
| 11 | Buyurtmalar 1280–1399 px | «To'lov turi» yashirinadi (operatorga kerak) | O'rta | 4-banddagi taklif |
| 12 | Pul formati | 2 xil formatlovchi, ~30 nusxa; Haydovchida tiyinsiz «so'm»; 3 faylda manfiy belgi yo'q | O'rta | Bitta umumiy `formatMoney` |
| 13 | Dizayn tizimi | Token yo'q, 68+ hex, ~25 tasi palitradan tashqari | O'rta | Tokenlar (CSS o'zgaruvchilar), kam ishlatiladiganlarni birlashtirish |
| 14 | Masofalar | 35% qiymat 4 ga karrali emas (6, 10, 14 px) | Kichik | 4 / 8 / 12 / 16 shkala |
| 15 | Shrift o'lchamlari | 17 xil, kasr qiymatlar (12.5, 11.5, 13.5) | Kichik | 6–7 pog'onali shkala |
| 16 | Radius va soya | 12 xil radius, 55 xil soya | Kichik | 3 radius, 4 soya tokeni |
| 17 | Jadvallar | Home, Kassir paneli va Hisobotlar o'z gridini chizadi: Ustunlar, sahifalash va saralash yo'q | O'rta | DataTable ga o'tkazish |
| 18 | Haydovchi paneli | 3 tugma 48 px dan past (28 / 40 / 44) | Kichik | ≥48 px |
| 19 | aria-label | 383 tugmaga 90 yorliq; faqat ikonkali tugmalar to'liq tekshirilmadi | O'rta | Lint qoidasi: ikonkali tugma → aria-label |
| 20 | Bildirishnomalar | Shaxsiy bildirishnomalar va tasdiq sabablari (`apprReasonsOf`) qattiq o'zbekcha matn | Kichik | Kalit + o'rinbosar |
| 21 | I18N | 5 385 kalit faqat lotinda; komponent jadvallari tarjimasiz | Kichik (V2 qarori) | V2 da tarjima |
| 22 | Buyurtma — `return` | Har holatdan qoralamaga qaytarish mumkin (ma'lumot qatlamida cheklov yo'q) | O'rta | Ruxsat etilgan holatlarni qatlamda cheklash |
| 23 | Reys `retwait`, Ko'chirish `transit`, Inventarizatsiya qulfi | Qotib qolish nuqtalari, eslatma faqat bosh sahifada | O'rta | Muddatli eslatma va mas'ul |
| 24 | Bosh sahifa 1024 px | Qarzlar jadvali 5 px aylanadi | Kichik | Ustun kengligini 5 px qisqartirish |
| 25 | Holatlar | `ORDER_STATUS.ready` e'lon qilingan, ishlatilmaydi | Kichik | Olib tashlash yoki tavsiflash |
| 26 | Tezlik | `cmdData` va bosh sahifa hisoblari har renderda; real hajmda o'lchanmagan | O'rta (xavf) | Server indeksi, kesh |

## 6. Darajalar bo'yicha soni

- Jiddiy: 3 (1, 2, 3).
- O'rta: 13.
- Kichik: 10.
- Tarjimasiz kalitlar: 5 385 (Jiddiy emas, V2).

## 7. Eng muhim 10 ta muammo

1. Admin roli biznes sahifalarini to'liq ko'radi (№1).
2. Ma'lumotlar xotirada — haqiqiy dasturda server (№2).
3. Kontrast: izoh matni va havolalar 4.5:1 dan past (№3).
4. Buyurtmani istalgan holatdan qoralamaga qaytarish cheklanmagan (№22).
5. Panel rollari (yig'uvchi, markirovkachi) ortiqcha sahifalarni ko'radi (№6).
6. Xarid xodimi YB qarzini, operator o'z savdosini ko'ra olmaydi (№7, №8).
7. Kirim eksporti ishlamaydi (№4).
8. Pul formatlovchilari takrorlangan va farqli (№12).
9. Bir xil bo'lmagan jadvallar (№17).
10. Qotib qolish nuqtalari: reys, ko'chirish, inventarizatsiya (№23).

## 8. Tekshirib bo'lmagan joylar

- Jarayonlarni ekranda bosib o'tish va bosishlar soni (taxminiy).
- 3 tilda ekran ko'rinishi va kesilish.
- 11 rol × barcha sahifa: konsol va NaN — faqat T11b dagi tanlangan sahifalarda.
- Bildirishnomalarni har rolda bosish.
- Filtrli URL lar.
- xlsx faylni Excel da ochish.
- Tab tartibi.
- Tezlik.
- T11b ro'yxatidagi mayda ko'rinishlar (4-bo'lim).
- 26 ta faylning statik skani.

## T12a holati (loyiha egasi qarorlari va tuzatishlar)

- №1 Admin — kamchilik emas (qaror), o'zgartirilmadi.
- №2 Xotira — prototip tabiati, o'zgartirilmadi.
- №3 Kontrast — tuzatildi: izoh matni #647574, havola va matn #0F766E.
- №22 Qoralamaga qaytarish — tuzatildi: faqat «Tasdiqlashda» holatidan, tasdiqlovchi, sabab majburiy (UI va ma'lumot qatlami).
- №6, №7, №8 — tuzatildi (panel rollari menyusi, Xarid — YB qarzi, Operator — o'z savdosi).
- **Yangi topilma (Jiddiy, tuzatildi):** URL hash orqali ruxsatsiz sahifa ochilardi (`onHash` `allowed` ni tekshirmasdi, masalan Kassir `#stock`). Endi ochilmaydi, xabar chiqadi.
- Qolgan O'rta va Kichik kamchiliklar → V1 (notes/T12-topshirish.md, 13-bo'lim).
